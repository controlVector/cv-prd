"""
Bug Reporting Service for cv-PRD.

Captures errors and sends them to cv-Hub for centralized analysis.
Implements buffering, retry logic, and offline support.
"""

import hashlib
import hmac
import json
import logging
import os
import queue
import re
import threading
import time
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from app.models.bug_report_models import (
    BugReportCreate,
    BugReportResponse,
    ErrorContext,
    ErrorSource,
    StackFrame,
    SystemInfo,
)

logger = logging.getLogger(__name__)


class BugReportingService:
    """
    Service for capturing and reporting bugs to cv-Hub.

    Features:
    - Automatic capture of Python exceptions
    - Buffering for offline operation
    - Retry with exponential backoff
    - Fingerprinting for client-side deduplication
    - HMAC signing for security
    """

    def __init__(
        self,
        cv_hub_url: Optional[str] = None,
        project_id: Optional[str] = None,
        project_name: Optional[str] = None,
        api_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        buffer_path: Optional[Path] = None,
        enabled: Optional[bool] = None,
    ):
        self.cv_hub_url = cv_hub_url or os.getenv("CV_HUB_URL", "https://hub.controlvector.io")
        self.bug_endpoint = f"{self.cv_hub_url}/api/v1/bugs"

        # Project identity
        self.project_id = project_id or os.getenv("CV_PROJECT_ID", self._generate_project_id())
        self.project_name = project_name or os.getenv("CV_PROJECT_NAME", "cv-prd")
        self.installation_id = self._get_installation_id()

        # Security
        self.api_key = api_key or os.getenv("CV_HUB_API_KEY", "")
        self.secret_key = secret_key or os.getenv("CV_HUB_SECRET_KEY", "")

        # Configuration
        if enabled is not None:
            self.enabled = enabled
        else:
            self.enabled = os.getenv("BUG_REPORTING_ENABLED", "true").lower() == "true"

        self.buffer_path = buffer_path or Path.home() / ".controlvector" / "bug_buffer"
        self.buffer_path.mkdir(parents=True, exist_ok=True)

        # Buffering
        self._report_queue: queue.Queue = queue.Queue(maxsize=1000)
        self._recent_fingerprints: Dict[str, datetime] = {}
        self._max_fingerprint_age = 3600  # 1 hour

        # Background worker
        self._worker_thread: Optional[threading.Thread] = None
        self._shutdown = threading.Event()

        if self.enabled:
            self._start_worker()
            self._load_buffered_reports()

        logger.info(
            f"BugReportingService initialized: enabled={self.enabled}, "
            f"project_id={self.project_id}, cv_hub_url={self.cv_hub_url}"
        )

    def _generate_project_id(self) -> str:
        """Generate a unique project ID based on machine characteristics."""
        import uuid
        machine_id = str(uuid.getnode())
        return f"cvprd-{hashlib.sha256(machine_id.encode()).hexdigest()[:16]}"

    def _get_installation_id(self) -> str:
        """Get or create a unique installation ID."""
        id_file = Path.home() / ".controlvector" / "installation_id"
        if id_file.exists():
            return id_file.read_text().strip()

        import uuid
        inst_id = str(uuid.uuid4())
        id_file.parent.mkdir(parents=True, exist_ok=True)
        id_file.write_text(inst_id)
        return inst_id

    def _compute_fingerprint(
        self, error_type: str, message: str, stack_trace: Optional[str]
    ) -> str:
        """
        Compute a fingerprint for deduplication.

        Groups errors by:
        - Error type
        - First line of message (ignoring dynamic values)
        - Top 3 stack frames (file + function)
        """
        components = [error_type]

        # Normalize message (remove numbers, UUIDs)
        normalized_msg = re.sub(
            r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
            "<uuid>",
            message,
        )
        normalized_msg = re.sub(r"\b\d+\b", "<num>", normalized_msg)
        components.append(normalized_msg[:100])

        # Extract top frames from stack trace
        if stack_trace:
            lines = stack_trace.split("\n")
            frame_lines = [l for l in lines if l.strip().startswith("File ")][:3]
            for line in frame_lines:
                match = re.search(r'File "([^"]+)", line \d+, in (\w+)', line)
                if match:
                    components.append(f"{match.group(1)}:{match.group(2)}")

        fingerprint = hashlib.sha256("|".join(components).encode()).hexdigest()[:32]
        return fingerprint

    def _is_duplicate(self, fingerprint: str) -> bool:
        """Check if we've recently reported this error."""
        now = datetime.utcnow()

        # Clean old fingerprints
        expired = [
            fp
            for fp, ts in self._recent_fingerprints.items()
            if (now - ts).total_seconds() > self._max_fingerprint_age
        ]
        for fp in expired:
            del self._recent_fingerprints[fp]

        if fingerprint in self._recent_fingerprints:
            return True

        self._recent_fingerprints[fingerprint] = now
        return False

    def _sign_payload(self, payload: str) -> str:
        """Sign payload with HMAC-SHA256."""
        if not self.secret_key:
            return ""
        return hmac.new(
            self.secret_key.encode(), payload.encode(), hashlib.sha256
        ).hexdigest()

    def report_exception(
        self,
        exc: Exception,
        source: ErrorSource = ErrorSource.BACKEND_EXCEPTION,
        context: Optional[ErrorContext] = None,
        extra_data: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        """
        Report a Python exception.

        Returns the report ID if submitted, None if disabled or duplicate.
        """
        if not self.enabled:
            return None

        # Build stack trace
        stack_trace = "".join(
            traceback.format_exception(type(exc), exc, exc.__traceback__)
        )

        # Parse stack frames
        stack_frames = []
        if exc.__traceback__:
            for frame_info in traceback.extract_tb(exc.__traceback__):
                stack_frames.append(
                    StackFrame(
                        file=frame_info.filename,
                        line=frame_info.lineno,
                        function=frame_info.name,
                        code=frame_info.line,
                    )
                )

        # Compute fingerprint
        fingerprint = self._compute_fingerprint(type(exc).__name__, str(exc), stack_trace)

        # Check for duplicate
        if self._is_duplicate(fingerprint):
            logger.debug(f"Duplicate error suppressed: {fingerprint}")
            return None

        report = BugReportCreate(
            project_id=self.project_id,
            project_name=self.project_name,
            installation_id=self.installation_id,
            source=source,
            error_type=type(exc).__name__,
            message=str(exc),
            stack_trace=stack_trace,
            stack_frames=stack_frames,
            context=context or ErrorContext(),
            system_info=SystemInfo(),
            extra_data=extra_data or {},
            fingerprint=fingerprint,
        )

        return self._queue_report(report)

    def report_api_error(
        self,
        status_code: int,
        url: str,
        method: str,
        error_message: str,
        request_body: Optional[str] = None,
        response_body: Optional[str] = None,
    ) -> Optional[str]:
        """Report an API error (5xx response)."""
        if not self.enabled or status_code < 500:
            return None

        context = ErrorContext(
            url=url,
            user_action=f"{method} {url}",
        )

        extra_data = {
            "status_code": status_code,
            "method": method,
            "request_body": request_body[:1000] if request_body else None,
            "response_body": response_body[:1000] if response_body else None,
        }

        fingerprint = self._compute_fingerprint(f"APIError_{status_code}", error_message, None)

        if self._is_duplicate(fingerprint):
            return None

        report = BugReportCreate(
            project_id=self.project_id,
            project_name=self.project_name,
            installation_id=self.installation_id,
            source=ErrorSource.BACKEND_API,
            error_type=f"HTTP_{status_code}",
            message=error_message,
            context=context,
            system_info=SystemInfo(),
            extra_data=extra_data,
            fingerprint=fingerprint,
        )

        return self._queue_report(report)

    def report_frontend_error(
        self,
        error_type: str,
        message: str,
        stack_trace: Optional[str] = None,
        component: Optional[str] = None,
        url: Optional[str] = None,
        user_action: Optional[str] = None,
        is_react_crash: bool = False,
        breadcrumbs: Optional[List[str]] = None,
    ) -> Optional[str]:
        """Report a frontend JavaScript/React error."""
        if not self.enabled:
            return None

        source = ErrorSource.FRONTEND_REACT if is_react_crash else ErrorSource.FRONTEND_JS

        context = ErrorContext(
            url=url,
            component=component,
            user_action=user_action,
            breadcrumbs=breadcrumbs or [],
        )

        fingerprint = self._compute_fingerprint(error_type, message, stack_trace)

        if self._is_duplicate(fingerprint):
            return None

        report = BugReportCreate(
            project_id=self.project_id,
            project_name=self.project_name,
            installation_id=self.installation_id,
            source=source,
            error_type=error_type,
            message=message,
            stack_trace=stack_trace,
            context=context,
            system_info=SystemInfo(),
            fingerprint=fingerprint,
        )

        return self._queue_report(report)

    def report_customer_complaint(
        self,
        title: str,
        description: str,
        steps_to_reproduce: Optional[str] = None,
        expected_behavior: Optional[str] = None,
        user_id: Optional[str] = None,
        user_email: Optional[str] = None,
    ) -> Optional[str]:
        """Submit a manual customer complaint."""
        if not self.enabled:
            return None

        report = BugReportCreate(
            project_id=self.project_id,
            project_name=self.project_name,
            installation_id=self.installation_id,
            user_id=user_id,
            user_email=user_email,
            source=ErrorSource.CUSTOMER_COMPLAINT,
            error_type="CustomerComplaint",
            message=title,
            user_description=description,
            steps_to_reproduce=steps_to_reproduce,
            expected_behavior=expected_behavior,
            system_info=SystemInfo(),
        )

        return self._queue_report(report)

    def _queue_report(self, report: BugReportCreate) -> str:
        """Queue a report for sending."""
        try:
            self._report_queue.put_nowait(report)
            logger.info(f"Bug report queued: {report.report_id}")
            return report.report_id
        except queue.Full:
            self._buffer_to_disk(report)
            return report.report_id

    def _buffer_to_disk(self, report: BugReportCreate):
        """Buffer report to disk for later sending."""
        file_path = self.buffer_path / f"{report.report_id}.json"
        with open(file_path, "w") as f:
            f.write(report.model_dump_json())
        logger.warning(f"Report buffered to disk: {file_path}")

    def _load_buffered_reports(self):
        """Load any buffered reports from disk."""
        for file_path in self.buffer_path.glob("*.json"):
            try:
                with open(file_path) as f:
                    data = json.load(f)
                report = BugReportCreate(**data)
                if self._report_queue.qsize() < 900:
                    self._report_queue.put_nowait(report)
                    file_path.unlink()
            except Exception as e:
                logger.error(f"Failed to load buffered report {file_path}: {e}")

    def _start_worker(self):
        """Start background worker thread."""
        self._worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self._worker_thread.start()

    def _worker_loop(self):
        """Background worker that sends reports."""
        while not self._shutdown.is_set():
            try:
                report = self._report_queue.get(timeout=1.0)
                self._send_report(report)
            except queue.Empty:
                continue
            except Exception as e:
                logger.error(f"Worker error: {e}")

    def _send_report(self, report: BugReportCreate, retry_count: int = 0):
        """Send a single report to cv-Hub."""
        max_retries = 3

        try:
            payload = report.model_dump_json()
            signature = self._sign_payload(payload)

            headers = {
                "Content-Type": "application/json",
                "X-CV-Project-ID": self.project_id,
                "X-CV-Signature": signature,
            }
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            with httpx.Client(timeout=10.0) as client:
                response = client.post(
                    self.bug_endpoint,
                    content=payload,
                    headers=headers,
                )

                if response.status_code == 200:
                    result = BugReportResponse(**response.json())
                    logger.info(f"Bug report sent: {report.report_id} -> {result.status}")
                elif response.status_code == 429:  # Rate limited
                    if retry_count < max_retries:
                        time.sleep(2**retry_count)
                        self._send_report(report, retry_count + 1)
                else:
                    logger.warning(
                        f"Bug report failed ({response.status_code}): {response.text}"
                    )
                    if retry_count < max_retries:
                        self._send_report(report, retry_count + 1)
                    else:
                        self._buffer_to_disk(report)

        except httpx.RequestError as e:
            logger.warning(f"Network error sending report: {e}")
            if retry_count < max_retries:
                time.sleep(2**retry_count)
                self._send_report(report, retry_count + 1)
            else:
                self._buffer_to_disk(report)

    def get_status(self) -> Dict[str, Any]:
        """Get service status information."""
        return {
            "enabled": self.enabled,
            "project_id": self.project_id,
            "project_name": self.project_name,
            "installation_id": self.installation_id,
            "cv_hub_url": self.cv_hub_url,
            "queue_size": self._report_queue.qsize(),
            "buffered_reports": len(list(self.buffer_path.glob("*.json"))),
        }

    def shutdown(self):
        """Gracefully shutdown the service."""
        self._shutdown.set()

        # Flush remaining reports to disk
        while not self._report_queue.empty():
            try:
                report = self._report_queue.get_nowait()
                self._buffer_to_disk(report)
            except queue.Empty:
                break

        if self._worker_thread:
            self._worker_thread.join(timeout=5.0)


# Singleton instance
_bug_service: Optional[BugReportingService] = None


def get_bug_service() -> BugReportingService:
    """Get the singleton bug reporting service."""
    global _bug_service
    if _bug_service is None:
        _bug_service = BugReportingService()
    return _bug_service


def reset_bug_service():
    """Reset the singleton (useful for testing)."""
    global _bug_service
    if _bug_service:
        _bug_service.shutdown()
    _bug_service = None
