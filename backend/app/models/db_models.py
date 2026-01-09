"""
SQLAlchemy database models for persistent PRD storage.

These models store PRD metadata and content in PostgreSQL for durability,
while FalkorDB handles the knowledge graph and Qdrant handles vectors.
"""

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Enum as SQLEnum, JSON, Integer, Float
from sqlalchemy.orm import relationship, declarative_base
from sqlalchemy.sql import func
import enum

Base = declarative_base()


class PriorityEnum(str, enum.Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class RequestStatusEnum(str, enum.Enum):
    """Feature request lifecycle statuses"""
    RAW = "raw"  # Just submitted, pending AI analysis
    UNDER_REVIEW = "under_review"  # Being triaged by reviewer
    ACCEPTED = "accepted"  # Approved for elaboration
    REJECTED = "rejected"  # Not approved
    MERGED = "merged"  # Combined with another request
    ELABORATING = "elaborating"  # Being converted to full PRD
    READY = "ready"  # PRD complete, ready for implementation
    IN_PROGRESS = "in_progress"  # Being implemented
    SHIPPED = "shipped"  # Feature delivered


class JobStatusEnum(str, enum.Enum):
    """Async job processing statuses"""
    PENDING = "pending"  # Queued, waiting to start
    PROCESSING = "processing"  # Currently running
    COMPLETED = "completed"  # Finished successfully
    FAILED = "failed"  # Finished with error
    CANCELLED = "cancelled"  # Cancelled by user


class JobTypeEnum(str, enum.Enum):
    """Types of async jobs"""
    PRD_UPLOAD = "prd_upload"  # Document upload and processing
    PRD_OPTIMIZE = "prd_optimize"  # PRD optimization
    TEST_GENERATION = "test_generation"  # Generate test cases
    DOC_GENERATION = "doc_generation"  # Generate documentation
    EXPORT = "export"  # Export PRD data


class RequestTypeEnum(str, enum.Enum):
    """Types of feature requests"""
    FEATURE = "feature"  # New functionality
    ENHANCEMENT = "enhancement"  # Improve existing feature
    BUG = "bug"  # Bug report
    CHANGE = "change"  # Change request
    INTEGRATION = "integration"  # Third-party integration
    USABILITY = "usability"  # UX improvement


class ChunkTypeEnum(str, enum.Enum):
    # Core PRD types
    REQUIREMENT = "requirement"
    FEATURE = "feature"
    CONSTRAINT = "constraint"
    STAKEHOLDER = "stakeholder"
    METRIC = "metric"
    DEPENDENCY = "dependency"
    RISK = "risk"
    OBJECTIVE = "objective"
    OVERVIEW = "overview"

    # Test artifacts
    TEST_CASE = "test_case"
    UNIT_TEST_SPEC = "unit_test_spec"
    INTEGRATION_TEST_SPEC = "integration_test_spec"
    ACCEPTANCE_CRITERIA = "acceptance_criteria"

    # Documentation artifacts
    DOCUMENTATION = "documentation"
    USER_MANUAL = "user_manual"
    API_DOC = "api_doc"
    TECHNICAL_SPEC = "technical_spec"
    RELEASE_NOTE = "release_note"

    # Design artifacts
    DESIGN_SPEC = "design_spec"
    SCREEN_FLOW = "screen_flow"
    WIREFRAME = "wireframe"


class PRDModel(Base):
    """Persistent PRD storage"""
    __tablename__ = "prds"

    id = Column(String(36), primary_key=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    raw_content = Column(Text, nullable=True)  # Original document content
    source_file = Column(String(255), nullable=True)  # Original filename
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    sections = relationship("PRDSectionModel", back_populates="prd", cascade="all, delete-orphan")
    chunks = relationship("ChunkModel", back_populates="prd", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "source_file": self.source_file,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PRDSectionModel(Base):
    """PRD sections as extracted from documents"""
    __tablename__ = "prd_sections"

    id = Column(String(36), primary_key=True)
    prd_id = Column(String(36), ForeignKey("prds.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    priority = Column(String(20), default="medium")
    tags = Column(JSON, default=list)
    order_index = Column(String(10), default="0")  # For maintaining section order

    # Relationships
    prd = relationship("PRDModel", back_populates="sections")

    def to_dict(self):
        return {
            "id": self.id,
            "prd_id": self.prd_id,
            "title": self.title,
            "content": self.content,
            "priority": self.priority,
            "tags": self.tags or [],
        }


class ChunkModel(Base):
    """Semantic chunks derived from PRD sections"""
    __tablename__ = "chunks"

    id = Column(String(36), primary_key=True)
    prd_id = Column(String(36), ForeignKey("prds.id", ondelete="CASCADE"), nullable=False)
    chunk_type = Column(String(50), nullable=False)
    text = Column(Text, nullable=False)
    context_prefix = Column(Text, nullable=True)
    priority = Column(String(20), default="medium")
    tags = Column(JSON, default=list)
    chunk_metadata = Column(JSON, default=dict)  # renamed from 'metadata' (reserved)
    vector_id = Column(String(36), nullable=True)  # Reference to Qdrant
    graph_node_id = Column(String(36), nullable=True)  # Reference to FalkorDB node
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    prd = relationship("PRDModel", back_populates="chunks")

    def to_dict(self):
        return {
            "id": self.id,
            "prd_id": self.prd_id,
            "chunk_type": self.chunk_type,
            "text": self.text,
            "context_prefix": self.context_prefix,
            "priority": self.priority,
            "tags": self.tags or [],
            "metadata": self.chunk_metadata or {},
        }


class ArtifactMetadataModel(Base):
    """
    Extended metadata for generated artifacts (test cases, docs, designs).

    Tracks how artifacts were generated and what requirements they cover.
    """
    __tablename__ = "artifact_metadata"

    id = Column(String(36), primary_key=True)
    chunk_id = Column(String(36), ForeignKey("chunks.id", ondelete="CASCADE"), nullable=False)
    artifact_type = Column(String(50), nullable=False)  # test_case, documentation, design
    generation_model = Column(String(100), nullable=True)  # AI model used for generation
    generation_timestamp = Column(DateTime(timezone=True), server_default=func.now())
    source_chunk_ids = Column(JSON, default=list)  # Requirements this was generated from
    coverage_info = Column(JSON, default=dict)  # Test coverage, doc coverage metrics
    validation_status = Column(String(20), default="pending")  # pending, approved, rejected
    code_stub = Column(Text, nullable=True)  # Generated code stub (for test cases)

    # Relationships
    chunk = relationship("ChunkModel")

    def to_dict(self):
        return {
            "id": self.id,
            "chunk_id": self.chunk_id,
            "artifact_type": self.artifact_type,
            "generation_model": self.generation_model,
            "generation_timestamp": self.generation_timestamp.isoformat() if self.generation_timestamp else None,
            "source_chunk_ids": self.source_chunk_ids or [],
            "coverage_info": self.coverage_info or {},
            "validation_status": self.validation_status,
            "code_stub": self.code_stub,
        }


class FeatureRequestModel(Base):
    """
    Feature requests submitted via cv-hub that evolve into PRDs.

    Implements the "Progressive PRD" workflow where requests go through:
    raw → under_review → accepted → elaborating → ready → shipped
    """
    __tablename__ = "feature_requests"

    # Identity
    id = Column(String(36), primary_key=True)
    external_id = Column(String(64), unique=True, index=True)  # cv-hub reference ID

    # Requester info (from cv-hub)
    requester_id = Column(String(36), nullable=False, index=True)
    requester_name = Column(String(255), nullable=True)
    requester_email = Column(String(255), nullable=True)
    source = Column(String(50), default="cv-hub")  # cv-hub, api, internal

    # Request content
    title = Column(String(255), nullable=False)
    problem_statement = Column(Text, nullable=False)
    proposed_solution = Column(Text, nullable=True)
    success_criteria = Column(Text, nullable=True)
    additional_context = Column(Text, nullable=True)

    # Classification (AI-enriched)
    request_type = Column(String(50), nullable=True)
    category = Column(String(100), nullable=True)
    tags = Column(JSON, default=list)
    priority_suggestion = Column(String(20), nullable=True)

    # Lifecycle
    status = Column(String(30), default="raw", index=True)

    # Triage
    reviewer_id = Column(String(36), nullable=True)
    reviewer_notes = Column(Text, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    priority = Column(String(20), nullable=True)  # Assigned priority after triage

    # AI Analysis
    ai_summary = Column(Text, nullable=True)
    similar_requests = Column(JSON, default=list)  # IDs of similar requests
    related_prds = Column(JSON, default=list)  # IDs of related PRDs
    related_chunks = Column(JSON, default=list)  # IDs of related requirements
    prd_skeleton = Column(JSON, nullable=True)  # AI-generated PRD skeleton

    # Vector/Graph references
    vector_id = Column(String(36), nullable=True)  # Qdrant reference
    graph_node_id = Column(String(36), nullable=True)  # FalkorDB reference

    # Evolution to PRD
    prd_id = Column(String(36), ForeignKey("prds.id", ondelete="SET NULL"), nullable=True)
    merged_into_id = Column(String(36), ForeignKey("feature_requests.id", ondelete="SET NULL"), nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    triaged_at = Column(DateTime(timezone=True), nullable=True)
    accepted_at = Column(DateTime(timezone=True), nullable=True)
    shipped_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    prd = relationship("PRDModel", foreign_keys=[prd_id])
    merged_into = relationship("FeatureRequestModel", remote_side=[id], foreign_keys=[merged_into_id])

    def to_dict(self, include_ai=True):
        result = {
            "id": self.id,
            "external_id": self.external_id,
            "requester_id": self.requester_id,
            "requester_name": self.requester_name,
            "source": self.source,
            "title": self.title,
            "problem_statement": self.problem_statement,
            "proposed_solution": self.proposed_solution,
            "success_criteria": self.success_criteria,
            "additional_context": self.additional_context,
            "request_type": self.request_type,
            "category": self.category,
            "tags": self.tags or [],
            "status": self.status,
            "priority": self.priority,
            "reviewer_id": self.reviewer_id,
            "reviewer_notes": self.reviewer_notes,
            "rejection_reason": self.rejection_reason,
            "prd_id": self.prd_id,
            "merged_into_id": self.merged_into_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "triaged_at": self.triaged_at.isoformat() if self.triaged_at else None,
            "accepted_at": self.accepted_at.isoformat() if self.accepted_at else None,
            "shipped_at": self.shipped_at.isoformat() if self.shipped_at else None,
        }

        if include_ai:
            result.update({
                "ai_summary": self.ai_summary,
                "priority_suggestion": self.priority_suggestion,
                "similar_requests": self.similar_requests or [],
                "related_prds": self.related_prds or [],
                "related_chunks": self.related_chunks or [],
                "prd_skeleton": self.prd_skeleton,
            })

        return result


class JobModel(Base):
    """
    Async job tracking for long-running operations.

    Provides progress tracking and status updates for operations like:
    - PRD document upload and processing
    - PRD optimization
    - Test case generation
    - Documentation generation
    - Export operations
    """
    __tablename__ = "jobs"

    id = Column(String(36), primary_key=True)
    job_type = Column(String(50), nullable=False, index=True)
    status = Column(String(20), default="pending", index=True)

    # Progress tracking
    progress = Column(Integer, default=0)  # 0-100 percentage
    current_step = Column(String(255), nullable=True)  # Human-readable current step
    total_steps = Column(Integer, default=0)
    completed_steps = Column(Integer, default=0)

    # Input/Output
    input_data = Column(JSON, default=dict)  # Job parameters
    result_data = Column(JSON, default=dict)  # Job results
    error_message = Column(Text, nullable=True)  # Error details if failed

    # Resource references
    prd_id = Column(String(36), ForeignKey("prds.id", ondelete="SET NULL"), nullable=True)

    # Timing
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Metadata
    created_by = Column(String(36), nullable=True)  # User who triggered the job

    # Relationships
    prd = relationship("PRDModel")

    def to_dict(self):
        return {
            "id": self.id,
            "job_type": self.job_type,
            "status": self.status,
            "progress": self.progress,
            "current_step": self.current_step,
            "total_steps": self.total_steps,
            "completed_steps": self.completed_steps,
            "result_data": self.result_data or {},
            "error_message": self.error_message,
            "prd_id": self.prd_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
        }

    def to_status_response(self):
        """Minimal status response for polling"""
        return {
            "id": self.id,
            "status": self.status,
            "progress": self.progress,
            "current_step": self.current_step,
            "error_message": self.error_message,
            "result_data": self.result_data if self.status == "completed" else None,
        }
