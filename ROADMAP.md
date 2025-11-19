# Implementation Roadmap

Detailed step-by-step guide to build the PRD Knowledge Graph System from scratch.

---

## Phase 0: Project Setup (Week 1)

### Repository Structure
```bash
mkdir -p backend/{app/{api,services,models,db,core},tests}
mkdir -p frontend/{src/{components,services,hooks,types},public}
mkdir -p infrastructure/{docker,k8s}
mkdir -p docs
```

### Initialize Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install fastapi uvicorn sqlalchemy psycopg2-binary alembic pydantic-settings
pip install qdrant-client sentence-transformers neo4j
pip install python-jose[cryptography] passlib[bcrypt] python-multipart
pip install pytest pytest-asyncio httpx
pip freeze > requirements.txt
```

### Initialize Frontend
```bash
cd frontend
npx create-react-app . --template typescript
npm install @tanstack/react-query axios
npm install @tiptap/react @tiptap/starter-kit  # Rich text editor
npm install reactflow  # Graph visualization
npm install @mantine/core @mantine/hooks  # UI components
```

### Docker Compose Setup
```yaml
# infrastructure/docker/docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: cvprd
      POSTGRES_USER: cvprd
      POSTGRES_PASSWORD: cvprd_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  neo4j:
    image: neo4j:5
    environment:
      NEO4J_AUTH: neo4j/cvprd_dev
      NEO4J_PLUGINS: '["apoc"]'
    ports:
      - "7474:7474"  # HTTP
      - "7687:7687"  # Bolt
    volumes:
      - neo4j_data:/data

  qdrant:
    image: qdrant/qdrant:latest
    ports:
      - "6333:6333"  # HTTP
      - "6334:6334"  # gRPC
    volumes:
      - qdrant_data:/qdrant/storage

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
  neo4j_data:
  qdrant_data:
```

### Start Development Environment
```bash
cd infrastructure/docker
docker-compose up -d
```

---

## Phase 1: Core Backend (Weeks 2-3)

### Task 1.1: Database Models & Migrations

```python
# backend/app/models/prd.py
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.sql import func
import uuid

Base = declarative_base()

class PRD(Base):
    __tablename__ = "prds"
    # ... (use models from DATA_MODELS.md)

class Chunk(Base):
    __tablename__ = "chunks"
    # ... (use models from DATA_MODELS.md)
```

```bash
# Initialize Alembic
cd backend
alembic init alembic

# Configure alembic.ini and alembic/env.py
# Create first migration
alembic revision --autogenerate -m "Initial schema"
alembic upgrade head
```

### Task 1.2: Configuration & Database Connection

```python
# backend/app/core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "postgresql://cvprd:cvprd_dev@localhost/cvprd"

    # Neo4j
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "cvprd_dev"

    # Qdrant
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333

    # Redis
    REDIS_URL: str = "redis://localhost:6379"

    # Security
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # Embeddings
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384

    class Config:
        env_file = ".env"

settings = Settings()
```

```python
# backend/app/db/session.py
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

### Task 1.3: Basic CRUD Operations

```python
# backend/app/services/prd_service.py
from sqlalchemy.orm import Session
from app.models.prd import PRD, Chunk
from typing import List, Optional
import uuid

class PRDService:
    @staticmethod
    def create_prd(db: Session, name: str, content: dict, created_by: uuid.UUID) -> PRD:
        prd = PRD(
            name=name,
            content=content,
            created_by=created_by
        )
        db.add(prd)
        db.commit()
        db.refresh(prd)
        return prd

    @staticmethod
    def get_prd(db: Session, prd_id: uuid.UUID) -> Optional[PRD]:
        return db.query(PRD).filter(PRD.id == prd_id).first()

    @staticmethod
    def list_prds(db: Session, skip: int = 0, limit: int = 20) -> List[PRD]:
        return db.query(PRD).offset(skip).limit(limit).all()
```

### Task 1.4: FastAPI Routes

```python
# backend/app/api/prds.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.services.prd_service import PRDService
from typing import List
import uuid

router = APIRouter(prefix="/prds", tags=["PRDs"])

@router.post("/", status_code=201)
def create_prd(
    name: str,
    content: dict,
    db: Session = Depends(get_db)
):
    # TODO: Get user from auth token
    user_id = uuid.uuid4()
    prd = PRDService.create_prd(db, name, content, user_id)
    return prd

@router.get("/{prd_id}")
def get_prd(prd_id: uuid.UUID, db: Session = Depends(get_db)):
    prd = PRDService.get_prd(db, prd_id)
    if not prd:
        raise HTTPException(status_code=404, detail="PRD not found")
    return prd

@router.get("/")
def list_prds(skip: int = 0, limit: int = 20, db: Session = Depends(get_db)):
    return PRDService.list_prds(db, skip, limit)
```

```python
# backend/app/main.py
from fastapi import FastAPI
from app.api import prds

app = FastAPI(title="cvPRD API")

app.include_router(prds.router, prefix="/api/v1")

@app.get("/health")
def health_check():
    return {"status": "healthy"}
```

### Task 1.5: Run & Test

```bash
# Start server
cd backend
uvicorn app.main:app --reload --port 8000

# Test endpoints
curl http://localhost:8000/health
curl -X POST http://localhost:8000/api/v1/prds \
  -H "Content-Type: application/json" \
  -d '{"name": "Test PRD", "content": {"sections": []}}'
```

---

## Phase 2: Chunking Service (Week 4)

### Task 2.1: Implement Semantic Chunking

```python
# backend/app/services/chunking_service.py
from typing import List, Dict, Any
import re
from app.models.prd import Chunk, ChunkType

class ChunkingService:
    @staticmethod
    def chunk_prd(prd_content: Dict[str, Any], prd_id: uuid.UUID) -> List[Chunk]:
        """
        Intelligent chunking of PRD content
        """
        chunks = []

        # Extract sections
        sections = prd_content.get("sections", [])

        for section in sections:
            # Detect chunk type
            chunk_type = ChunkingService._detect_chunk_type(section)

            # Create context prefix
            context = f"PRD: {section.get('prd_name', '')}, Section: {section.get('title', '')}"

            # Create chunk
            chunk = Chunk(
                prd_id=prd_id,
                chunk_type=chunk_type,
                text=section.get('content', ''),
                context_prefix=context,
                metadata={
                    "section_title": section.get('title', ''),
                    "priority": section.get('priority', 'medium'),
                    "tags": section.get('tags', [])
                }
            )
            chunks.append(chunk)

        return chunks

    @staticmethod
    def _detect_chunk_type(section: Dict[str, Any]) -> str:
        """Detect chunk type from section content"""
        title = section.get('title', '').lower()
        content = section.get('content', '').lower()

        if 'requirement' in title or 'shall' in content:
            return ChunkType.REQUIREMENT
        elif 'feature' in title:
            return ChunkType.FEATURE
        elif 'constraint' in title or 'limitation' in title:
            return ChunkType.CONSTRAINT
        elif 'stakeholder' in title or 'user' in title:
            return ChunkType.STAKEHOLDER
        else:
            return ChunkType.FEATURE
```

### Task 2.2: Integrate with PRD Creation

```python
# Modify backend/app/services/prd_service.py
from app.services.chunking_service import ChunkingService

class PRDService:
    @staticmethod
    def create_prd_with_chunks(
        db: Session,
        name: str,
        content: dict,
        created_by: uuid.UUID
    ) -> PRD:
        # Create PRD
        prd = PRD(name=name, content=content, created_by=created_by)
        db.add(prd)
        db.flush()  # Get PRD ID

        # Create chunks
        chunks = ChunkingService.chunk_prd(content, prd.id)
        for i, chunk in enumerate(chunks):
            chunk.position = i
            db.add(chunk)

        db.commit()
        db.refresh(prd)
        return prd
```

---

## Phase 3: Vector Search (Week 5)

### Task 3.1: Embedding Service

```python
# backend/app/services/embedding_service.py
from sentence_transformers import SentenceTransformer
from typing import List
import numpy as np

class EmbeddingService:
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)

    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text"""
        embedding = self.model.encode(text)
        return embedding.tolist()

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        embeddings = self.model.encode(texts)
        return embeddings.tolist()
```

### Task 3.2: Qdrant Integration

```python
# backend/app/services/vector_service.py
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter
from typing import List, Dict, Any
from app.core.config import settings

class VectorService:
    def __init__(self):
        self.client = QdrantClient(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT
        )
        self.collection_name = "prd_chunks"
        self._ensure_collection()

    def _ensure_collection(self):
        """Create collection if it doesn't exist"""
        collections = self.client.get_collections().collections
        if self.collection_name not in [c.name for c in collections]:
            self.client.create_collection(
                collection_name=self.collection_name,
                vectors_config=VectorParams(
                    size=settings.EMBEDDING_DIMENSION,
                    distance=Distance.COSINE
                )
            )

    def index_chunk(
        self,
        chunk_id: str,
        vector: List[float],
        payload: Dict[str, Any]
    ):
        """Index a single chunk"""
        point = PointStruct(
            id=chunk_id,
            vector=vector,
            payload=payload
        )
        self.client.upsert(
            collection_name=self.collection_name,
            points=[point]
        )

    def search(
        self,
        query_vector: List[float],
        limit: int = 10,
        filter_conditions: Filter = None
    ) -> List[Dict]:
        """Search for similar chunks"""
        results = self.client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=limit,
            query_filter=filter_conditions
        )
        return [
            {
                "chunk_id": hit.id,
                "score": hit.score,
                "payload": hit.payload
            }
            for hit in results
        ]
```

### Task 3.3: Search API Endpoint

```python
# backend/app/api/search.py
from fastapi import APIRouter, Depends
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from typing import List, Optional

router = APIRouter(prefix="/search", tags=["Search"])

embedding_service = EmbeddingService()
vector_service = VectorService()

@router.post("/semantic")
def semantic_search(
    query: str,
    limit: int = 10,
    prd_ids: Optional[List[str]] = None
):
    # Generate query embedding
    query_vector = embedding_service.embed_text(query)

    # Build filter
    filter_conditions = None
    if prd_ids:
        from qdrant_client.models import Filter, FieldCondition, MatchAny
        filter_conditions = Filter(
            must=[
                FieldCondition(
                    key="prd_id",
                    match=MatchAny(any=prd_ids)
                )
            ]
        )

    # Search
    results = vector_service.search(
        query_vector=query_vector,
        limit=limit,
        filter_conditions=filter_conditions
    )

    return {"results": results}
```

---

## Phase 4: Knowledge Graph (Weeks 6-7)

### Task 4.1: Neo4j Service

```python
# backend/app/services/graph_service.py
from neo4j import GraphDatabase
from typing import List, Dict, Any
from app.core.config import settings

class GraphService:
    def __init__(self):
        self.driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD)
        )

    def create_chunk_node(self, chunk_id: str, chunk_data: Dict[str, Any]):
        """Create chunk node"""
        with self.driver.session() as session:
            session.execute_write(
                self._create_chunk_tx, chunk_id, chunk_data
            )

    @staticmethod
    def _create_chunk_tx(tx, chunk_id: str, data: Dict[str, Any]):
        query = """
        MERGE (c:Chunk {id: $id})
        SET c.type = $type,
            c.text = $text,
            c.priority = $priority
        """
        tx.run(query, id=chunk_id, **data)

    def create_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        properties: Dict[str, Any] = None
    ):
        """Create relationship between chunks"""
        with self.driver.session() as session:
            session.execute_write(
                self._create_rel_tx,
                source_id,
                target_id,
                rel_type,
                properties or {}
            )

    @staticmethod
    def _create_rel_tx(tx, source_id, target_id, rel_type, props):
        query = f"""
        MATCH (c1:Chunk {{id: $source}})
        MATCH (c2:Chunk {{id: $target}})
        MERGE (c1)-[r:{rel_type}]->(c2)
        SET r += $props
        """
        tx.run(query, source=source_id, target=target_id, props=props)

    def get_dependencies(self, chunk_id: str, depth: int = 3) -> List[Dict]:
        """Get chunk dependencies"""
        with self.driver.session() as session:
            result = session.execute_read(
                self._get_deps_tx, chunk_id, depth
            )
            return result

    @staticmethod
    def _get_deps_tx(tx, chunk_id, depth):
        query = """
        MATCH path = (c:Chunk {id: $chunk_id})-[:DEPENDS_ON*1..$depth]->(dep)
        RETURN dep, length(path) as distance
        """
        result = tx.run(query, chunk_id=chunk_id, depth=depth)
        return [dict(record) for record in result]
```

### Task 4.2: Relationship Detection

```python
# backend/app/services/relationship_detector.py
from typing import List, Tuple
import re

class RelationshipDetector:
    @staticmethod
    def detect_relationships(chunks: List[Chunk]) -> List[Tuple[str, str, str]]:
        """
        Detect relationships between chunks
        Returns: List of (source_id, target_id, relationship_type)
        """
        relationships = []

        for i, chunk1 in enumerate(chunks):
            for chunk2 in chunks[i+1:]:
                # Detect dependencies
                if RelationshipDetector._mentions_dependency(chunk1.text, chunk2.text):
                    relationships.append((
                        str(chunk1.id),
                        str(chunk2.id),
                        "DEPENDS_ON"
                    ))

                # Detect references
                if RelationshipDetector._has_reference(chunk1.text, chunk2.text):
                    relationships.append((
                        str(chunk1.id),
                        str(chunk2.id),
                        "REFERENCES"
                    ))

        return relationships

    @staticmethod
    def _mentions_dependency(text1: str, text2: str) -> bool:
        """Check if text1 mentions dependency on text2"""
        keywords = ['depends on', 'requires', 'needs', 'prerequisite']
        return any(kw in text1.lower() for kw in keywords)

    @staticmethod
    def _has_reference(text1: str, text2: str) -> bool:
        """Check if text1 references text2"""
        # Simple keyword overlap check
        words1 = set(text1.lower().split())
        words2 = set(text2.lower().split())
        overlap = len(words1 & words2)
        return overlap > 5  # Threshold
```

---

## Phase 5: Frontend MVP (Weeks 8-9)

### Task 5.1: Setup React Components

```tsx
// frontend/src/components/PRDEditor.tsx
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

export function PRDEditor() {
  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Start writing your PRD...</p>',
  })

  return (
    <div className="editor">
      <EditorContent editor={editor} />
    </div>
  )
}
```

```tsx
// frontend/src/components/ChunkList.tsx
import { useQuery } from '@tanstack/react-query'
import { getChunks } from '../services/api'

export function ChunkList({ prdId }: { prdId: string }) {
  const { data: chunks, isLoading } = useQuery({
    queryKey: ['chunks', prdId],
    queryFn: () => getChunks(prdId)
  })

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="chunk-list">
      {chunks?.map(chunk => (
        <div key={chunk.id} className="chunk-card">
          <span className="chunk-type">{chunk.type}</span>
          <p>{chunk.text}</p>
          <div className="chunk-meta">
            Priority: {chunk.metadata.priority}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Task 5.2: API Client

```typescript
// frontend/src/services/api.ts
import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:8000/api/v1'
})

export const createPRD = async (data: any) => {
  const response = await api.post('/prds', data)
  return response.data
}

export const getPRD = async (id: string) => {
  const response = await api.get(`/prds/${id}`)
  return response.data
}

export const getChunks = async (prdId: string) => {
  const response = await api.get(`/prds/${prdId}`)
  return response.data.chunks
}

export const search = async (query: string) => {
  const response = await api.post('/search/semantic', { query })
  return response.data.results
}
```

---

## Phase 6: Integration & Testing (Week 10)

### Task 6.1: End-to-End Workflow

```python
# backend/app/services/orchestrator.py
from sqlalchemy.orm import Session
from app.services.prd_service import PRDService
from app.services.chunking_service import ChunkingService
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.graph_service import GraphService
from app.services.relationship_detector import RelationshipDetector

class PRDOrchestrator:
    def __init__(self, db: Session):
        self.db = db
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()
        self.graph_service = GraphService()

    def process_new_prd(self, name: str, content: dict, user_id: uuid.UUID):
        """Complete workflow for new PRD"""

        # 1. Create PRD and chunks
        prd = PRDService.create_prd_with_chunks(
            self.db, name, content, user_id
        )

        # 2. Generate embeddings and index in Qdrant
        for chunk in prd.chunks:
            # Combine context + text for embedding
            full_text = f"{chunk.context_prefix} - {chunk.text}"
            vector = self.embedding_service.embed_text(full_text)

            # Index in Qdrant
            self.vector_service.index_chunk(
                chunk_id=str(chunk.id),
                vector=vector,
                payload={
                    "chunk_id": str(chunk.id),
                    "prd_id": str(prd.id),
                    "chunk_type": chunk.chunk_type,
                    "text": chunk.text,
                    "context": full_text,
                    "metadata": chunk.metadata
                }
            )

            # Create node in Neo4j
            self.graph_service.create_chunk_node(
                chunk_id=str(chunk.id),
                chunk_data={
                    "type": chunk.chunk_type,
                    "text": chunk.text,
                    "priority": chunk.metadata.get("priority", "medium")
                }
            )

        # 3. Detect and create relationships
        relationships = RelationshipDetector.detect_relationships(prd.chunks)
        for source, target, rel_type in relationships:
            self.graph_service.create_relationship(source, target, rel_type)

        return prd
```

### Task 6.2: Testing

```python
# backend/tests/test_prd_workflow.py
import pytest
from app.services.orchestrator import PRDOrchestrator

def test_create_prd_workflow(db_session):
    orchestrator = PRDOrchestrator(db_session)

    prd_content = {
        "sections": [
            {
                "title": "User Authentication",
                "content": "The system shall authenticate users via OAuth2",
                "priority": "high",
                "tags": ["auth", "security"]
            }
        ]
    }

    prd = orchestrator.process_new_prd(
        name="Auth System PRD",
        content=prd_content,
        user_id=uuid.uuid4()
    )

    assert prd.id is not None
    assert len(prd.chunks) > 0
    # Verify chunks indexed in Qdrant
    # Verify nodes in Neo4j
```

---

## Next Steps: Advanced Features

After MVP, prioritize:

1. **AI Agent Integration** (Weeks 11-12)
   - Context Builder service
   - Code generation endpoint
   - AI chat interface

2. **Collaboration Features** (Weeks 13-14)
   - Real-time editing (WebSockets)
   - Comments and annotations
   - User permissions

3. **Analytics** (Week 15)
   - PRD completeness scores
   - Dependency visualization
   - Change impact analysis

4. **Production Readiness** (Weeks 16-18)
   - Authentication & authorization
   - Rate limiting
   - Monitoring & logging
   - Deployment (Docker + K8s)

---

## Success Metrics

- **MVP (Phase 1-5)**: Working PRD editor with search and basic graph
- **Beta (Phase 6 + AI)**: AI code generation from requirements
- **Production**: Multi-user collaboration, advanced analytics

This roadmap provides a practical, step-by-step path from empty repository to working system!
