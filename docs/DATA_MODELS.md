# Data Models

Complete data model specifications for PostgreSQL, Qdrant (Vector DB), and Neo4j (Graph DB).

---

## PostgreSQL Models

### Pydantic Models (FastAPI)

```python
from datetime import datetime
from enum import Enum
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from uuid import UUID, uuid4


class ChunkType(str, Enum):
    REQUIREMENT = "requirement"
    FEATURE = "feature"
    CONSTRAINT = "constraint"
    STAKEHOLDER = "stakeholder"
    METRIC = "metric"
    DEPENDENCY = "dependency"
    RISK = "risk"
    ASSUMPTION = "assumption"


class Priority(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class Status(str, Enum):
    DRAFT = "draft"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    IMPLEMENTED = "implemented"
    DEPRECATED = "deprecated"


class ChunkMetadata(BaseModel):
    priority: Optional[Priority] = Priority.MEDIUM
    status: Optional[Status] = Status.DRAFT
    tags: List[str] = Field(default_factory=list)
    owner: Optional[str] = None
    section_path: Optional[str] = None  # e.g., "3.2.1"
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class ChunkCreate(BaseModel):
    prd_id: UUID
    chunk_type: ChunkType
    text: str
    context_prefix: Optional[str] = None
    metadata: ChunkMetadata = Field(default_factory=ChunkMetadata)


class Chunk(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    prd_id: UUID
    chunk_type: ChunkType
    text: str
    context_prefix: Optional[str] = None
    metadata: ChunkMetadata
    vector_id: Optional[str] = None
    graph_node_id: Optional[str] = None
    position: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        from_attributes = True


class PRDContent(BaseModel):
    """Flexible content structure for PRD"""
    sections: List[Dict[str, Any]] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class PRDCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    content: PRDContent = Field(default_factory=PRDContent)
    tags: List[str] = Field(default_factory=list)


class PRD(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    description: Optional[str] = None
    version: int = 1
    content: PRDContent
    tags: List[str] = Field(default_factory=list)
    status: Status = Status.DRAFT
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: UUID

    class Config:
        from_attributes = True


class Version(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    prd_id: UUID
    version: int
    changes: Dict[str, Any]  # JSON diff of changes
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: UUID
    comment: Optional[str] = None


class RelationshipType(str, Enum):
    DEPENDS_ON = "DEPENDS_ON"
    REFERENCES = "REFERENCES"
    PARENT_OF = "PARENT_OF"
    IMPLEMENTS = "IMPLEMENTS"
    CONTRADICTS = "CONTRADICTS"
    RELATES_TO = "RELATES_TO"


class Relationship(BaseModel):
    """Store relationships in PostgreSQL for quick access"""
    id: UUID = Field(default_factory=uuid4)
    source_chunk_id: UUID
    target_chunk_id: UUID
    relationship_type: RelationshipType
    strength: float = Field(default=1.0, ge=0.0, le=1.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

### SQLAlchemy Models

```python
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Float, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

Base = declarative_base()


class PRDModel(Base):
    __tablename__ = "prds"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text)
    version = Column(Integer, default=1)
    content = Column(JSONB, nullable=False)
    tags = Column(JSONB, default=list)
    status = Column(String(50), default="draft", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(UUID(as_uuid=True), nullable=False)

    # Relationships
    chunks = relationship("ChunkModel", back_populates="prd", cascade="all, delete-orphan")
    versions = relationship("VersionModel", back_populates="prd")


class ChunkModel(Base):
    __tablename__ = "chunks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prd_id = Column(UUID(as_uuid=True), ForeignKey("prds.id"), nullable=False, index=True)
    chunk_type = Column(String(50), nullable=False, index=True)
    text = Column(Text, nullable=False)
    context_prefix = Column(Text)
    metadata = Column(JSONB, default=dict)
    vector_id = Column(String(255), index=True)
    graph_node_id = Column(String(255), index=True)
    position = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    prd = relationship("PRDModel", back_populates="chunks")


class VersionModel(Base):
    __tablename__ = "versions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    prd_id = Column(UUID(as_uuid=True), ForeignKey("prds.id"), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    changes = Column(JSONB, nullable=False)
    comment = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(UUID(as_uuid=True), nullable=False)

    # Relationships
    prd = relationship("PRDModel", back_populates="versions")


class RelationshipModel(Base):
    __tablename__ = "relationships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    source_chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id"), nullable=False, index=True)
    target_chunk_id = Column(UUID(as_uuid=True), ForeignKey("chunks.id"), nullable=False, index=True)
    relationship_type = Column(String(50), nullable=False, index=True)
    strength = Column(Float, default=1.0)
    metadata = Column(JSONB, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

---

## Qdrant Models

### Collection Configuration

```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PayloadSchemaType

# Initialize client
client = QdrantClient(host="localhost", port=6333)

# Create collection
collection_name = "prd_chunks"

client.create_collection(
    collection_name=collection_name,
    vectors_config=VectorParams(
        size=384,  # all-MiniLM-L6-v2 dimension
        distance=Distance.COSINE
    )
)

# Create payload indexes for fast filtering
client.create_payload_index(
    collection_name=collection_name,
    field_name="prd_id",
    field_schema=PayloadSchemaType.KEYWORD
)

client.create_payload_index(
    collection_name=collection_name,
    field_name="chunk_type",
    field_schema=PayloadSchemaType.KEYWORD
)

client.create_payload_index(
    collection_name=collection_name,
    field_name="metadata.priority",
    field_schema=PayloadSchemaType.KEYWORD
)

client.create_payload_index(
    collection_name=collection_name,
    field_name="metadata.status",
    field_schema=PayloadSchemaType.KEYWORD
)

client.create_payload_index(
    collection_name=collection_name,
    field_name="metadata.tags",
    field_schema=PayloadSchemaType.KEYWORD
)
```

### Vector Point Structure

```python
from pydantic import BaseModel
from typing import List, Dict, Any
from uuid import UUID

class VectorPayload(BaseModel):
    """Payload stored with each vector in Qdrant"""
    chunk_id: str  # UUID as string
    prd_id: str  # UUID as string
    chunk_type: str
    text: str
    context: str  # Full contextual text (prefix + text)
    metadata: Dict[str, Any]
    created_at: str  # ISO format


class VectorPoint(BaseModel):
    id: str  # Chunk UUID as string
    vector: List[float]  # 384-dimensional embedding
    payload: VectorPayload


# Example usage
point = VectorPoint(
    id="chunk_uuid_string",
    vector=[0.1, 0.2, ...],  # 384 floats
    payload=VectorPayload(
        chunk_id="chunk_uuid_string",
        prd_id="prd_uuid_string",
        chunk_type="requirement",
        text="The system shall authenticate users via OAuth2",
        context="Project: Auth System, Feature: User Login - The system shall authenticate users via OAuth2",
        metadata={
            "priority": "high",
            "status": "approved",
            "tags": ["auth", "security"],
            "section_path": "3.2.1",
            "owner": "john@example.com"
        },
        created_at="2025-01-15T10:30:00Z"
    )
)
```

### Search Filters

```python
from qdrant_client.models import Filter, FieldCondition, MatchValue, MatchAny

# Example: Search high-priority auth requirements
filter_condition = Filter(
    must=[
        FieldCondition(
            key="chunk_type",
            match=MatchValue(value="requirement")
        ),
        FieldCondition(
            key="metadata.priority",
            match=MatchValue(value="high")
        ),
        FieldCondition(
            key="metadata.tags",
            match=MatchAny(any=["auth", "security"])
        ),
        FieldCondition(
            key="prd_id",
            match=MatchValue(value="specific_prd_uuid")
        )
    ]
)
```

---

## Neo4j Models

### Node Labels and Properties

```cypher
// PRD Node
CREATE (p:PRD {
    id: 'uuid',
    name: 'User Authentication System',
    version: 1,
    status: 'approved',
    created_at: datetime(),
    created_by: 'user_uuid'
})

// Chunk Node
CREATE (c:Chunk {
    id: 'uuid',
    type: 'requirement',
    text: 'The system shall...',
    priority: 'high',
    status: 'approved',
    section_path: '3.2.1',
    created_at: datetime()
})

// Add secondary labels for chunk types
CREATE (c:Chunk:Requirement {
    id: 'uuid',
    // ...
})

// Concept Node (extracted entities)
CREATE (con:Concept {
    name: 'OAuth2',
    description: 'Authentication protocol',
    category: 'technology'
})

// User/Stakeholder Node
CREATE (u:User {
    id: 'uuid',
    name: 'John Doe',
    role: 'Product Manager'
})
```

### Relationships

```cypher
// Chunk belongs to PRD
CREATE (c:Chunk)-[:BELONGS_TO]->(p:PRD)

// Dependency relationship
CREATE (c1:Chunk)-[:DEPENDS_ON {
    strength: 0.8,
    reason: 'Feature requires auth to be implemented first',
    created_at: datetime()
}]->(c2:Chunk)

// Reference relationship
CREATE (c1:Chunk)-[:REFERENCES {
    context: 'Mentioned in constraints section',
    created_at: datetime()
}]->(c2:Chunk)

// Hierarchy relationship
CREATE (parent:Chunk)-[:PARENT_OF {
    order: 1
}]->(child:Chunk)

// Implementation relationship
CREATE (feature:Chunk)-[:IMPLEMENTS]->(requirement:Chunk)

// Contradiction relationship (for conflict detection)
CREATE (c1:Chunk)-[:CONTRADICTS {
    severity: 'high',
    description: 'Different auth methods specified',
    detected_at: datetime()
}]->(c2:Chunk)

// Concept mention
CREATE (c:Chunk)-[:MENTIONS {
    frequency: 3,
    relevance: 0.9
}]->(con:Concept)

// Ownership
CREATE (u:User)-[:OWNS]->(c:Chunk)

// Change tracking
CREATE (u:User)-[:MODIFIED {
    timestamp: datetime(),
    change_type: 'text_update'
}]->(c:Chunk)
```

### Indexes and Constraints

```cypher
// Unique constraints
CREATE CONSTRAINT prd_id_unique IF NOT EXISTS
FOR (p:PRD) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
FOR (c:Chunk) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT concept_name_unique IF NOT EXISTS
FOR (c:Concept) REQUIRE c.name IS UNIQUE;

// Indexes for fast lookups
CREATE INDEX chunk_type_idx IF NOT EXISTS
FOR (c:Chunk) ON (c.type);

CREATE INDEX chunk_priority_idx IF NOT EXISTS
FOR (c:Chunk) ON (c.priority);

CREATE INDEX chunk_status_idx IF NOT EXISTS
FOR (c:Chunk) ON (c.status);

CREATE INDEX prd_name_idx IF NOT EXISTS
FOR (p:PRD) ON (p.name);
```

### Cypher Query Examples

```cypher
// 1. Find all dependencies of a chunk (up to 3 levels deep)
MATCH path = (c:Chunk {id: $chunk_id})-[:DEPENDS_ON*1..3]->(dependency:Chunk)
RETURN path, dependency
ORDER BY length(path);

// 2. Find chunks that would be affected by deleting a chunk
MATCH (c:Chunk {id: $chunk_id})<-[:DEPENDS_ON*1..]-(affected:Chunk)
RETURN DISTINCT affected, count(*) as impact_count
ORDER BY impact_count DESC;

// 3. Find circular dependencies
MATCH (c1:Chunk)-[:DEPENDS_ON*]->(c2:Chunk)-[:DEPENDS_ON*]->(c1)
RETURN c1, c2;

// 4. Find all chunks in a PRD with their immediate relationships
MATCH (p:PRD {id: $prd_id})<-[:BELONGS_TO]-(c:Chunk)
OPTIONAL MATCH (c)-[r]-(related:Chunk)
RETURN c, collect({type: type(r), chunk: related}) as relationships;

// 5. Find most referenced chunks (high importance)
MATCH (c:Chunk)<-[:REFERENCES|DEPENDS_ON]-()
WITH c, count(*) as reference_count
WHERE reference_count > 3
RETURN c
ORDER BY reference_count DESC;

// 6. Find isolated chunks (potential orphans)
MATCH (p:PRD {id: $prd_id})<-[:BELONGS_TO]-(c:Chunk)
WHERE NOT (c)-[:DEPENDS_ON|REFERENCES|PARENT_OF]-()
RETURN c;

// 7. Get full context for a chunk (all related chunks)
MATCH (c:Chunk {id: $chunk_id})
OPTIONAL MATCH (c)-[:DEPENDS_ON]->(dep:Chunk)
OPTIONAL MATCH (c)-[:REFERENCES]->(ref:Chunk)
OPTIONAL MATCH (c)<-[:PARENT_OF]-(parent:Chunk)
OPTIONAL MATCH (c)-[:PARENT_OF]->(child:Chunk)
RETURN c,
       collect(DISTINCT dep) as dependencies,
       collect(DISTINCT ref) as references,
       parent,
       collect(DISTINCT child) as children;

// 8. Find contradictions
MATCH (c1:Chunk)-[r:CONTRADICTS]-(c2:Chunk)
WHERE (c1)-[:BELONGS_TO]->(:PRD {id: $prd_id})
RETURN c1, c2, r.description as reason, r.severity;

// 9. Analyze PRD completeness
MATCH (p:PRD {id: $prd_id})<-[:BELONGS_TO]-(c:Chunk)
WITH p, count(c) as total_chunks
MATCH (p)<-[:BELONGS_TO]-(req:Chunk {type: 'requirement'})
WHERE NOT (req)<-[:IMPLEMENTS]-()
WITH p, total_chunks, count(req) as unimplemented_requirements
MATCH (p)<-[:BELONGS_TO]-(isolated:Chunk)
WHERE NOT (isolated)-[:DEPENDS_ON|REFERENCES]-()
RETURN {
    total_chunks: total_chunks,
    unimplemented_requirements: unimplemented_requirements,
    isolated_chunks: count(isolated),
    completeness_score: 100.0 * (1.0 - (unimplemented_requirements * 1.0 / total_chunks))
} as metrics;

// 10. Find related chunks by concept
MATCH (c1:Chunk)-[:MENTIONS]->(con:Concept)<-[:MENTIONS]-(c2:Chunk)
WHERE c1.id = $chunk_id AND c1 <> c2
WITH c2, count(DISTINCT con) as shared_concepts
RETURN c2
ORDER BY shared_concepts DESC
LIMIT 10;
```

---

## Python Neo4j Driver Models

```python
from neo4j import GraphDatabase
from typing import List, Dict, Any
from datetime import datetime

class Neo4jClient:
    def __init__(self, uri: str, user: str, password: str):
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self):
        self.driver.close()

    def create_chunk_node(self, chunk_id: str, chunk_data: Dict[str, Any]):
        """Create a chunk node in Neo4j"""
        with self.driver.session() as session:
            result = session.execute_write(
                self._create_chunk_tx, chunk_id, chunk_data
            )
            return result

    @staticmethod
    def _create_chunk_tx(tx, chunk_id: str, data: Dict[str, Any]):
        query = """
        CREATE (c:Chunk {
            id: $id,
            type: $type,
            text: $text,
            priority: $priority,
            status: $status,
            created_at: datetime()
        })
        RETURN c
        """
        result = tx.run(query, id=chunk_id, **data)
        return result.single()

    def create_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        properties: Dict[str, Any] = None
    ):
        """Create a relationship between two chunks"""
        with self.driver.session() as session:
            result = session.execute_write(
                self._create_relationship_tx,
                source_id,
                target_id,
                rel_type,
                properties or {}
            )
            return result

    @staticmethod
    def _create_relationship_tx(tx, source_id, target_id, rel_type, properties):
        query = f"""
        MATCH (c1:Chunk {{id: $source_id}})
        MATCH (c2:Chunk {{id: $target_id}})
        CREATE (c1)-[r:{rel_type} $properties]->(c2)
        RETURN r
        """
        result = tx.run(
            query,
            source_id=source_id,
            target_id=target_id,
            properties=properties
        )
        return result.single()

    def get_dependencies(self, chunk_id: str, depth: int = 3) -> List[Dict]:
        """Get all dependencies of a chunk"""
        with self.driver.session() as session:
            result = session.execute_read(
                self._get_dependencies_tx, chunk_id, depth
            )
            return result

    @staticmethod
    def _get_dependencies_tx(tx, chunk_id, depth):
        query = """
        MATCH path = (c:Chunk {id: $chunk_id})-[:DEPENDS_ON*1..$depth]->(dep:Chunk)
        RETURN dep, length(path) as distance
        ORDER BY distance
        """
        result = tx.run(query, chunk_id=chunk_id, depth=depth)
        return [{"chunk": dict(record["dep"]), "distance": record["distance"]}
                for record in result]
```

---

## Context Builder Data Structures

```python
from typing import List, Dict, Any, Literal
from pydantic import BaseModel, Field

class ChunkContext(BaseModel):
    """Context information for a single chunk"""
    chunk_id: str
    text: str
    chunk_type: str
    metadata: Dict[str, Any]
    relationship: Optional[str] = None  # How this chunk relates to primary
    distance: int = 0  # Graph distance from primary chunk


class AIContext(BaseModel):
    """Full context package for AI agents"""
    primary_chunk: ChunkContext
    dependencies: List[ChunkContext] = Field(default_factory=list)
    references: List[ChunkContext] = Field(default_factory=list)
    related: List[ChunkContext] = Field(default_factory=list)
    constraints: List[ChunkContext] = Field(default_factory=list)

    # Metadata
    strategy: Literal["direct", "expanded", "full", "summarized"]
    total_tokens: int
    max_tokens: int
    prd_info: Dict[str, Any]

    def to_prompt(self) -> str:
        """Convert context to a formatted prompt for AI"""
        prompt_parts = [
            f"## Primary Requirement\n{self.primary_chunk.text}\n",
            f"Type: {self.primary_chunk.chunk_type}",
            f"Priority: {self.primary_chunk.metadata.get('priority', 'N/A')}\n"
        ]

        if self.dependencies:
            prompt_parts.append("## Dependencies")
            for dep in self.dependencies:
                prompt_parts.append(f"- {dep.text}")

        if self.constraints:
            prompt_parts.append("\n## Constraints")
            for con in self.constraints:
                prompt_parts.append(f"- {con.text}")

        if self.references:
            prompt_parts.append("\n## Related Requirements")
            for ref in self.references:
                prompt_parts.append(f"- {ref.text}")

        return "\n".join(prompt_parts)
```

This comprehensive data model specification provides the foundation for implementing the entire system with proper types, validations, and database schemas.
