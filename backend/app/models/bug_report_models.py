"""
Bug Report Models for cv-PRD automated error reporting.

These models define the structure for capturing errors from frontend and backend,
and sending them to cv-Hub for centralized analysis.
"""

import platform
import re
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ErrorSource(str, Enum):
    """Where the error originated"""
    FRONTEND_JS = "frontend_js"
    FRONTEND_REACT = "frontend_react"
    FRONTEND_UI = "frontend_ui"
    BACKEND_EXCEPTION = "backend_exception"
    BACKEND_API = "backend_api"
    ELECTRON = "electron"
    CUSTOMER_COMPLAINT = "customer_complaint"
    CRITICAL_CRASH = "critical_crash"


class BugSeverity(str, Enum):
    """Severity levels for bugs"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class BugType(str, Enum):
    """Classification of bug types"""
    CRASH = "crash"
    EXCEPTION = "exception"
    UI_ERROR = "ui_error"
    API_ERROR = "api_error"
    PERFORMANCE = "performance"
    DATA_CORRUPTION = "data_corruption"
    CONNECTIVITY = "connectivity"
    AUTHENTICATION = "authentication"
    UNKNOWN = "unknown"


class SystemInfo(BaseModel):
    """System context where the error occurred"""
    os_name: str = Field(default_factory=lambda: platform.system())
    os_version: str = Field(default_factory=lambda: platform.version())
    python_version: Optional[str] = Field(default_factory=lambda: platform.python_version())
    node_version: Optional[str] = None
    electron_version: Optional[str] = None
    app_version: str = "0.1.0"
    cpu_arch: str = Field(default_factory=lambda: platform.machine())


class StackFrame(BaseModel):
    """A single frame in a stack trace"""
    file: str
    line: int
    function: Optional[str] = None
    code: Optional[str] = None


class ErrorContext(BaseModel):
    """Context around when/where the error occurred"""
    url: Optional[str] = None
    user_action: Optional[str] = None
    component: Optional[str] = None
    request_id: Optional[str] = None
    session_id: Optional[str] = None
    breadcrumbs: List[str] = Field(default_factory=list)


class BugReportCreate(BaseModel):
    """Input model for creating a bug report"""
    report_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    # Project/Installation identity
    project_id: str = Field(..., description="Unique ID for this cv-PRD installation")
    project_name: Optional[str] = Field(None, description="Human-readable project name")
    installation_id: str = Field(..., description="Unique ID for this installation instance")

    # User context (optional - privacy-respecting)
    user_id: Optional[str] = None
    user_email: Optional[str] = None

    # Error details
    source: ErrorSource
    error_type: str = Field(..., description="Exception class or error type")
    message: str = Field(..., description="Error message")
    stack_trace: Optional[str] = None
    stack_frames: List[StackFrame] = Field(default_factory=list)

    # Context
    context: ErrorContext = Field(default_factory=ErrorContext)
    system_info: SystemInfo = Field(default_factory=SystemInfo)

    # Additional data
    extra_data: Dict[str, Any] = Field(default_factory=dict)
    logs: Optional[str] = None

    # Timestamps
    occurred_at: datetime = Field(default_factory=datetime.utcnow)

    # For customer complaints
    user_description: Optional[str] = None
    steps_to_reproduce: Optional[str] = None
    expected_behavior: Optional[str] = None

    # Fingerprint for deduplication (computed on submission)
    fingerprint: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "project_id": "cvprd-acme-corp",
                "installation_id": "inst-abc123",
                "source": "backend_exception",
                "error_type": "ValueError",
                "message": "Invalid PRD format",
                "stack_trace": "Traceback (most recent call last):\n...",
                "context": {
                    "url": "/api/v1/prds",
                    "user_action": "Creating PRD"
                }
            }
        }


class BugReportResponse(BaseModel):
    """Response after submitting a bug report"""
    report_id: str
    status: str = "received"
    duplicate_of: Optional[str] = None
    severity: Optional[BugSeverity] = None
    bug_type: Optional[BugType] = None
    message: str = "Bug report received"


class FrontendErrorReport(BaseModel):
    """Frontend error report from React/JavaScript"""
    error_type: str
    message: str
    stack_trace: Optional[str] = None
    component: Optional[str] = None
    url: Optional[str] = None
    user_action: Optional[str] = None
    is_react_crash: bool = False
    breadcrumbs: List[str] = Field(default_factory=list)


class CustomerComplaint(BaseModel):
    """Manual customer bug report"""
    title: str = Field(..., min_length=5)
    description: str = Field(..., min_length=20)
    steps_to_reproduce: Optional[str] = None
    expected_behavior: Optional[str] = None
