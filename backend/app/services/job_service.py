"""
Async Job Service for cv-prd.

Manages long-running background jobs with progress tracking, including:
- PRD document upload and processing
- PRD optimization
- Test case generation
- Documentation generation
- Export operations

Uses a simple in-process background task model with database persistence
for job status tracking.
"""

import asyncio
import logging
import uuid
import tempfile
import os
from datetime import datetime
from typing import Optional, Dict, Any, Callable, Awaitable
from concurrent.futures import ThreadPoolExecutor

from app.models.db_models import JobModel, JobStatusEnum, JobTypeEnum

logger = logging.getLogger(__name__)

# Thread pool for running sync tasks in background
_executor = ThreadPoolExecutor(max_workers=4)

# In-memory job registry for active jobs (supplements database)
_active_jobs: Dict[str, asyncio.Task] = {}


class JobService:
    """
    Service for managing async background jobs.

    Jobs are:
    1. Created with input parameters and stored in database
    2. Executed in background (async or thread pool)
    3. Updated with progress as they run
    4. Marked complete with result data or error
    """

    def __init__(self, db_session_factory):
        """
        Initialize with a database session factory.

        Args:
            db_session_factory: Callable that returns a new database session
        """
        self.db_session_factory = db_session_factory

    def create_job(
        self,
        job_type: str,
        input_data: Dict[str, Any],
        created_by: Optional[str] = None,
    ) -> JobModel:
        """
        Create a new pending job in the database.

        Args:
            job_type: Type of job (prd_upload, prd_optimize, etc.)
            input_data: Job parameters
            created_by: User ID who triggered the job

        Returns:
            The created JobModel
        """
        job_id = str(uuid.uuid4())

        with self.db_session_factory() as session:
            job = JobModel(
                id=job_id,
                job_type=job_type,
                status=JobStatusEnum.PENDING.value,
                progress=0,
                current_step="Queued",
                input_data=input_data,
                created_by=created_by,
            )
            session.add(job)
            session.commit()
            session.refresh(job)

            # Return a detached copy
            return self._detach_job(job)

    def get_job(self, job_id: str) -> Optional[JobModel]:
        """Get a job by ID."""
        with self.db_session_factory() as session:
            job = session.query(JobModel).filter(JobModel.id == job_id).first()
            if job:
                return self._detach_job(job)
            return None

    def get_job_status(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job status for polling (minimal response)."""
        with self.db_session_factory() as session:
            job = session.query(JobModel).filter(JobModel.id == job_id).first()
            if job:
                return job.to_status_response()
            return None

    def update_job_progress(
        self,
        job_id: str,
        progress: int,
        current_step: str,
        completed_steps: Optional[int] = None,
    ) -> None:
        """Update job progress."""
        with self.db_session_factory() as session:
            job = session.query(JobModel).filter(JobModel.id == job_id).first()
            if job:
                job.progress = min(progress, 100)
                job.current_step = current_step
                if completed_steps is not None:
                    job.completed_steps = completed_steps
                session.commit()

    def start_job(self, job_id: str, total_steps: int = 0) -> None:
        """Mark job as started."""
        with self.db_session_factory() as session:
            job = session.query(JobModel).filter(JobModel.id == job_id).first()
            if job:
                job.status = JobStatusEnum.PROCESSING.value
                job.started_at = datetime.utcnow()
                job.total_steps = total_steps
                job.current_step = "Starting..."
                session.commit()

    def complete_job(
        self,
        job_id: str,
        result_data: Dict[str, Any],
        prd_id: Optional[str] = None,
    ) -> None:
        """Mark job as completed with results."""
        with self.db_session_factory() as session:
            job = session.query(JobModel).filter(JobModel.id == job_id).first()
            if job:
                job.status = JobStatusEnum.COMPLETED.value
                job.progress = 100
                job.current_step = "Completed"
                job.result_data = result_data
                job.completed_at = datetime.utcnow()
                if prd_id:
                    job.prd_id = prd_id
                session.commit()

    def fail_job(self, job_id: str, error_message: str) -> None:
        """Mark job as failed with error."""
        with self.db_session_factory() as session:
            job = session.query(JobModel).filter(JobModel.id == job_id).first()
            if job:
                job.status = JobStatusEnum.FAILED.value
                job.error_message = error_message
                job.current_step = "Failed"
                job.completed_at = datetime.utcnow()
                session.commit()

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending or running job."""
        # Cancel the async task if running
        if job_id in _active_jobs:
            task = _active_jobs[job_id]
            task.cancel()
            del _active_jobs[job_id]

        with self.db_session_factory() as session:
            job = session.query(JobModel).filter(JobModel.id == job_id).first()
            if job and job.status in [JobStatusEnum.PENDING.value, JobStatusEnum.PROCESSING.value]:
                job.status = JobStatusEnum.CANCELLED.value
                job.current_step = "Cancelled"
                job.completed_at = datetime.utcnow()
                session.commit()
                return True
            return False

    def list_jobs(
        self,
        job_type: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
    ) -> list:
        """List jobs with optional filters."""
        with self.db_session_factory() as session:
            query = session.query(JobModel)

            if job_type:
                query = query.filter(JobModel.job_type == job_type)
            if status:
                query = query.filter(JobModel.status == status)

            jobs = query.order_by(JobModel.created_at.desc()).limit(limit).all()
            return [self._detach_job(j) for j in jobs]

    def _detach_job(self, job: JobModel) -> JobModel:
        """Create a detached copy of a job for use outside session."""
        # Create a new instance with same data
        detached = JobModel(
            id=job.id,
            job_type=job.job_type,
            status=job.status,
            progress=job.progress,
            current_step=job.current_step,
            total_steps=job.total_steps,
            completed_steps=job.completed_steps,
            input_data=job.input_data,
            result_data=job.result_data,
            error_message=job.error_message,
            prd_id=job.prd_id,
            created_at=job.created_at,
            started_at=job.started_at,
            completed_at=job.completed_at,
            created_by=job.created_by,
        )
        return detached

    async def run_async_job(
        self,
        job_id: str,
        coro: Callable[..., Awaitable[Dict[str, Any]]],
        *args,
        **kwargs
    ) -> None:
        """
        Run an async job in the background.

        Args:
            job_id: The job ID to track
            coro: Async function to run
            *args, **kwargs: Arguments to pass to the function
        """
        async def _run():
            try:
                result = await coro(*args, **kwargs)
                self.complete_job(job_id, result, prd_id=result.get("prd_id"))
            except asyncio.CancelledError:
                logger.info(f"Job {job_id} was cancelled")
            except Exception as e:
                logger.error(f"Job {job_id} failed: {e}", exc_info=True)
                self.fail_job(job_id, str(e))
            finally:
                if job_id in _active_jobs:
                    del _active_jobs[job_id]

        task = asyncio.create_task(_run())
        _active_jobs[job_id] = task


# Singleton instance
_job_service: Optional[JobService] = None


def get_job_service() -> JobService:
    """Get the global job service instance."""
    global _job_service
    if _job_service is None:
        from app.services.database_service import get_db_session
        _job_service = JobService(get_db_session)
    return _job_service


def init_job_service(db_session_factory) -> JobService:
    """Initialize the job service with a session factory."""
    global _job_service
    _job_service = JobService(db_session_factory)
    return _job_service


class JobProgressTracker:
    """
    Context manager for tracking job progress.

    Usage:
        async with JobProgressTracker(job_service, job_id, total_steps=5) as tracker:
            tracker.update(1, "Parsing document")
            # ... do work ...
            tracker.update(2, "Generating embeddings")
            # ... do work ...
    """

    def __init__(
        self,
        job_service: JobService,
        job_id: str,
        total_steps: int = 0,
    ):
        self.job_service = job_service
        self.job_id = job_id
        self.total_steps = total_steps
        self.current = 0

    async def __aenter__(self):
        self.job_service.start_job(self.job_id, self.total_steps)
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        # Don't mark complete here - let the caller do it
        pass

    def update(self, step: int, message: str) -> None:
        """Update progress."""
        self.current = step
        if self.total_steps > 0:
            progress = int((step / self.total_steps) * 100)
        else:
            progress = 0
        self.job_service.update_job_progress(
            self.job_id,
            progress=progress,
            current_step=message,
            completed_steps=step,
        )

    def set_progress(self, percent: int, message: str) -> None:
        """Set progress directly as percentage."""
        self.job_service.update_job_progress(
            self.job_id,
            progress=percent,
            current_step=message,
        )
