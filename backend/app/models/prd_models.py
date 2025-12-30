"""
PRD Models for cvPRD application

These models define the structure for Product Requirements Documents (PRDs),
their sections, chunks, and related metadata.
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import uuid


class Priority(str, Enum):
    """Priority levels for PRD sections and chunks"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ChunkType(str, Enum):
    """Types of semantic chunks in a PRD"""
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


class PRDSection(BaseModel):
    """
    A section within a PRD document.

    Sections are the raw structure extracted from documents (Word, Markdown).
    They get converted to Chunks for indexing and graph storage.
    """
    title: str = Field(..., description="Section title/heading")
    content: str = Field(..., description="Section content text")
    priority: Priority = Field(default=Priority.MEDIUM, description="Section priority")
    tags: List[str] = Field(default_factory=list, description="Tags/categories")


class PRD(BaseModel):
    """
    Product Requirements Document model.

    Contains metadata and sections that define product requirements.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique PRD ID")
    name: str = Field(..., description="PRD name/title")
    description: Optional[str] = Field(None, description="Brief description of the PRD")
    sections: List[PRDSection] = Field(default_factory=list, description="Document sections")
    content: Optional[str] = Field(None, description="Raw content (if not sectioned)")

    class Config:
        """Pydantic config"""
        json_schema_extra = {
            "example": {
                "id": "550e8400-e29b-41d4-a716-446655440000",
                "name": "User Authentication System",
                "description": "Requirements for implementing user auth",
                "sections": [
                    {
                        "title": "Login Requirements",
                        "content": "The system shall support login via email and password",
                        "priority": "high",
                        "tags": ["authentication", "security"]
                    }
                ]
            }
        }


class Chunk(BaseModel):
    """
    A semantic chunk extracted from a PRD section.

    Chunks are the atomic units stored in the vector database and knowledge graph.
    They contain embeddings for semantic search and relationships to other chunks.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), description="Unique chunk ID")
    prd_id: str = Field(..., description="Parent PRD ID")
    chunk_type: ChunkType = Field(..., description="Type of chunk")
    text: str = Field(..., description="Chunk text content")
    context_prefix: str = Field(default="", description="Context prefix for embedding")
    priority: Priority = Field(default=Priority.MEDIUM, description="Chunk priority")
    tags: List[str] = Field(default_factory=list, description="Tags/categories")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    # Vector reference (set after embedding)
    vector_id: Optional[str] = Field(None, description="Reference to vector in Qdrant")

    class Config:
        """Pydantic config"""
        json_schema_extra = {
            "example": {
                "id": "chunk-123",
                "prd_id": "prd-456",
                "chunk_type": "requirement",
                "text": "The system shall support OAuth2 authentication",
                "context_prefix": "PRD: Auth System, Section: Login",
                "priority": "high",
                "tags": ["auth", "oauth"],
                "metadata": {"section_title": "Login Requirements"}
            }
        }
