"""
Feature Request Models for cvPRD application

These models define the structure for feature requests submitted via cv-hub
that evolve into full PRDs through the "Progressive PRD" workflow.
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime
import uuid


class RequestStatus(str, Enum):
    """Feature request lifecycle statuses"""
    RAW = "raw"
    UNDER_REVIEW = "under_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    MERGED = "merged"
    ELABORATING = "elaborating"
    READY = "ready"
    IN_PROGRESS = "in_progress"
    SHIPPED = "shipped"


class RequestType(str, Enum):
    """Types of feature requests"""
    FEATURE = "feature"
    ENHANCEMENT = "enhancement"
    BUG = "bug"
    CHANGE = "change"
    INTEGRATION = "integration"
    USABILITY = "usability"


# ==================== Input Models ====================

class FeatureRequestCreate(BaseModel):
    """Input model for creating a new feature request (from cv-hub)"""
    external_id: str = Field(..., description="External reference ID from cv-hub")
    requester_id: str = Field(..., description="User ID from cv-hub")
    requester_name: Optional[str] = Field(None, description="User's display name")
    requester_email: Optional[str] = Field(None, description="User's email")
    source: str = Field(default="cv-hub", description="Source system")

    title: str = Field(..., min_length=5, max_length=255, description="Brief title for the request")
    problem_statement: str = Field(..., min_length=20, description="What problem are you solving?")
    proposed_solution: Optional[str] = Field(None, description="Optional: your proposed solution")
    success_criteria: Optional[str] = Field(None, description="What would success look like?")
    additional_context: Optional[str] = Field(None, description="Any other relevant details")

    class Config:
        json_schema_extra = {
            "example": {
                "external_id": "cvhub-user123-1703779200000",
                "requester_id": "user-uuid-123",
                "requester_name": "John Doe",
                "requester_email": "john@example.com",
                "title": "Add dark mode support",
                "problem_statement": "Users complain about eye strain when using the app at night. The bright white background is uncomfortable in low-light conditions.",
                "proposed_solution": "Add a toggle in settings that switches to dark colors for all UI components.",
                "success_criteria": "Users can switch between light and dark mode, preference persists across sessions."
            }
        }


class TriageAccept(BaseModel):
    """Input for accepting a feature request"""
    reviewer_notes: Optional[str] = Field(None, description="Notes from the reviewer")
    priority: Optional[str] = Field(None, description="Assigned priority (critical, high, medium, low)")


class TriageReject(BaseModel):
    """Input for rejecting a feature request"""
    rejection_reason: str = Field(..., min_length=10, description="Reason for rejection")


class TriageMerge(BaseModel):
    """Input for merging a feature request into another"""
    merge_into_request_id: str = Field(..., description="ID of the request to merge into")
    reviewer_notes: Optional[str] = Field(None, description="Notes about the merge")


class TriageRequestInfo(BaseModel):
    """Input for requesting more information"""
    questions: List[str] = Field(..., min_items=1, description="Questions to ask the requester")


class ElaborateRequest(BaseModel):
    """Input for elaborating a request into a PRD"""
    use_skeleton: bool = Field(default=True, description="Use AI-generated PRD skeleton")
    additional_sections: Optional[List[str]] = Field(None, description="Extra sections to include")
    prd_name: Optional[str] = Field(None, description="Override PRD name (defaults to request title)")


# ==================== AI Analysis Models ====================

class SimilarRequest(BaseModel):
    """A similar feature request found via vector search"""
    id: str
    title: str
    status: str
    similarity_score: float


class RelatedPRD(BaseModel):
    """A related PRD found via search"""
    id: str
    name: str
    relevance_score: float


class RelatedChunk(BaseModel):
    """A related requirement chunk"""
    id: str
    text: str
    chunk_type: str
    prd_id: str
    relevance_score: float


class PRDSkeletonSection(BaseModel):
    """A section in the AI-generated PRD skeleton"""
    title: str
    suggested_content: str
    priority: str = "medium"


class PRDSkeleton(BaseModel):
    """AI-generated PRD skeleton structure"""
    name: str
    description: str
    sections: List[PRDSkeletonSection]


class AIAnalysis(BaseModel):
    """AI-enriched analysis of a feature request"""
    summary: str = Field(..., description="AI-generated summary")
    request_type: RequestType = Field(..., description="Classified request type")
    category: str = Field(..., description="Auto-categorized category")
    priority_suggestion: str = Field(..., description="AI-suggested priority")
    tags: List[str] = Field(default_factory=list, description="Auto-generated tags")
    similar_requests: List[SimilarRequest] = Field(default_factory=list)
    related_prds: List[RelatedPRD] = Field(default_factory=list)
    related_chunks: List[RelatedChunk] = Field(default_factory=list)
    prd_skeleton: Optional[PRDSkeleton] = Field(None, description="AI-generated PRD skeleton")


# ==================== Response Models ====================

class FeatureRequestResponse(BaseModel):
    """Full feature request response"""
    id: str
    external_id: str
    requester_id: str
    requester_name: Optional[str]
    source: str
    title: str
    problem_statement: str
    proposed_solution: Optional[str]
    success_criteria: Optional[str]
    additional_context: Optional[str]
    request_type: Optional[str]
    category: Optional[str]
    tags: List[str]
    status: str
    priority: Optional[str]
    reviewer_id: Optional[str]
    reviewer_notes: Optional[str]
    rejection_reason: Optional[str]
    prd_id: Optional[str]
    merged_into_id: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    triaged_at: Optional[datetime]
    accepted_at: Optional[datetime]
    shipped_at: Optional[datetime]

    # AI analysis (optional)
    ai_summary: Optional[str] = None
    priority_suggestion: Optional[str] = None
    similar_requests: List[Dict[str, Any]] = Field(default_factory=list)
    related_prds: List[Dict[str, Any]] = Field(default_factory=list)
    related_chunks: List[Dict[str, Any]] = Field(default_factory=list)
    prd_skeleton: Optional[Dict[str, Any]] = None


class FeatureRequestCreateResponse(BaseModel):
    """Response after creating a feature request"""
    id: str
    external_id: str
    status: str
    ai_analysis: Optional[AIAnalysis] = None


class FeatureRequestListResponse(BaseModel):
    """Paginated list of feature requests"""
    requests: List[FeatureRequestResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


class TriageActionResponse(BaseModel):
    """Response after a triage action"""
    id: str
    status: str
    message: str


class ElaborateResponse(BaseModel):
    """Response after elaborating a request into a PRD"""
    request_id: str
    prd_id: str
    request_status: str
    prd_name: str
