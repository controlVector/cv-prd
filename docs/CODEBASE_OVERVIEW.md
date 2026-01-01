# cvPRD Codebase Architecture & Implementation Guide
## Document Upload Feature Implementation

**Last Updated:** November 2025
**Project Type:** AI-Powered Product Requirements Documentation System
**Backend:** Python FastAPI | **Frontend:** React TypeScript | **Databases:** PostgreSQL, Neo4j, Qdrant

---

## 1. OVERALL PROJECT STRUCTURE

```
/home/jwscho/cvPRD/
├── backend/                          # Python FastAPI Application
│   ├── app/
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   └── routes.py              # FastAPI endpoints (POST /prds, /search, /optimize, etc.)
│   │   ├── services/                  # Business logic layer
│   │   │   ├── chunking_service.py    # PRD segmentation & relationship detection
│   │   │   ├── embedding_service.py   # Text to vector conversion (sentence-transformers)
│   │   │   ├── vector_service.py      # Qdrant vector DB operations
│   │   │   ├── graph_service.py       # Neo4j knowledge graph operations
│   │   │   ├── orchestrator.py        # Main workflow coordinator
│   │   │   ├── prd_optimizer_service.py  # LLM-based optimization
│   │   │   └── openrouter_service.py  # LLM API integration
│   │   ├── models/
│   │   │   └── prd_models.py          # Pydantic data models
│   │   ├── core/
│   │   │   └── config.py              # Environment configuration
│   │   └── main.py                    # FastAPI app initialization
│   ├── requirements.txt               # Python dependencies
│   ├── tests/
│   └── venv/                          # Python virtual environment
├── frontend/                          # React TypeScript Application
│   ├── src/
│   │   ├── components/                # React components
│   │   │   ├── PRDForm.tsx            # Create PRD form
│   │   │   ├── PRDList.tsx            # PRD listing
│   │   │   ├── PRDDetail.tsx          # PRD detail view
│   │   │   └── SearchInterface.tsx    # Semantic search UI
│   │   ├── services/
│   │   │   └── api.ts                 # Axios API client
│   │   ├── types/
│   │   │   └── index.ts               # TypeScript interfaces
│   │   └── main.tsx                   # React entry point
│   ├── package.json                   # Node.js dependencies
│   └── dist/                          # Build output
├── infrastructure/
│   └── docker/
│       └── docker-compose.yml         # Database services (PostgreSQL, Neo4j, Qdrant, Redis)
├── demo/
│   └── demo.py                        # Demonstration script
├── ARCHITECTURE.md                    # System design documentation
├── SETUP.md                           # Installation guide
└── README.md

```

---

## 2. KNOWLEDGE GRAPH & VECTOR DATABASE ARCHITECTURE

### 2.1 Vector Database - Qdrant

**Purpose:** Semantic search on PRD chunks

**Implementation File:** `/home/jwscho/cvPRD/backend/app/services/vector_service.py`

**Key Details:**
- **Library:** `qdrant-client>=1.7.0`
- **Vector Dimension:** 384 (from all-MiniLM-L6-v2 embeddings)
- **Distance Metric:** COSINE similarity
- **Collection Name:** `prd_chunks`
- **Port:** 6333 (HTTP API), 6334 (gRPC)

**Vector Payload Schema:**
```python
{
    "chunk_id": "uuid",
    "prd_id": "uuid",
    "chunk_type": "requirement|feature|constraint|stakeholder|metric|dependency|risk",
    "text": "Full chunk text",
    "context": "PRD: {name}, Section: {title} - {text}",
    "priority": "critical|high|medium|low",
    "tags": ["tag1", "tag2"],
    "section_title": "Section name"
}
```

**Key Operations:**
- `index_chunk(chunk_id, vector, payload)` - Single chunk indexing
- `index_batch(points)` - Batch indexing (efficient for multiple chunks)
- `search(query_vector, limit, score_threshold, filters)` - Filtered semantic search
- `delete_chunk(chunk_id)` - Remove chunk

### 2.2 Graph Database - Neo4j

**Purpose:** Knowledge graph for tracking relationships and dependencies

**Implementation File:** `/home/jwscho/cvPRD/backend/app/services/graph_service.py`

**Key Details:**
- **Library:** `neo4j>=5.14.1`
- **URL:** bolt://localhost:7687
- **Browser:** http://localhost:7474
- **Default Auth:** neo4j / cvprd_dev

**Node Types:**
```cypher
(:PRD {id, name, description})
(:Chunk {id, type, text, priority, context})
```

**Relationship Types:**
- `BELONGS_TO` - Chunk belongs to PRD
- `DEPENDS_ON` - Chunk depends on another
- `REFERENCES` - Chunk references another
- `PARENT_OF` - Hierarchical parent relationship
- `IMPLEMENTS` - Feature implements requirement

**Key Operations:**
- `create_prd_node(prd_id, prd_data)` - Create PRD node
- `create_chunk_node(chunk_id, chunk_data)` - Create chunk node
- `create_relationship(source_id, target_id, rel_type, properties)` - Link chunks
- `get_dependencies(chunk_id, depth, direction)` - Traverse relationships
- `get_all_relationships(chunk_id)` - Get all linked chunks

### 2.3 Document Storage - PostgreSQL

**Purpose:** Persistent storage of PRD content and metadata

**Database:** `cvprd` at localhost:5433

**Current Schema (implied, not yet implemented):**
```sql
CREATE TABLE prds (
    id UUID PRIMARY KEY,
    name VARCHAR(255),
    description TEXT,
    version INTEGER,
    content JSONB,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by UUID,
    status VARCHAR(50)
);

CREATE TABLE chunks (
    id UUID PRIMARY KEY,
    prd_id UUID REFERENCES prds(id),
    chunk_type VARCHAR(50),
    text TEXT,
    context_prefix TEXT,
    metadata JSONB,
    vector_id VARCHAR(255),
    graph_node_id VARCHAR(255),
    position INTEGER,
    created_at TIMESTAMP
);
```

**Note:** Currently, the system stores PRD state in memory through the Orchestrator and Neo4j. For production, you'll want to implement PostgreSQL persistence.

---

## 3. DATA MODELS & SCHEMAS

### 3.1 Pydantic Models

**File:** `/home/jwscho/cvPRD/backend/app/models/prd_models.py`

```python
class ChunkType(Enum):
    REQUIREMENT = "requirement"
    FEATURE = "feature"
    CONSTRAINT = "constraint"
    STAKEHOLDER = "stakeholder"
    METRIC = "metric"
    DEPENDENCY = "dependency"
    RISK = "risk"

class Priority(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class Chunk(BaseModel):
    id: str
    prd_id: str
    chunk_type: ChunkType
    text: str
    context_prefix: str
    priority: Priority
    tags: List[str]
    metadata: Dict[str, Any]

class PRDSection(BaseModel):
    title: str
    content: str
    priority: Priority
    tags: List[str]

class PRD(BaseModel):
    id: str
    name: str
    description: Optional[str]
    sections: List[PRDSection]

class Relationship(BaseModel):
    source_id: str
    target_id: str
    relationship_type: RelationshipType
    strength: float
    metadata: Dict[str, Any]
```

### 3.2 API Request/Response Models

**File:** `/home/jwscho/cvPRD/backend/app/api/routes.py`

```python
class CreatePRDRequest(BaseModel):
    name: str
    description: Optional[str]
    sections: List[PRDSection]

class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    prd_id: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None

class PRDResponse(BaseModel):
    prd_id: str
    prd_name: str
    chunks_created: int
    relationships_created: int
    chunks: List[Dict[str, Any]]
```

---

## 4. DATA INGESTION & PROCESSING WORKFLOW

### 4.1 Current Flow (Manual PRD Creation)

```
Frontend (React)
    ↓
CreatePRDRequest (name, sections)
    ↓
POST /api/v1/prds
    ↓
FastAPI Router
    ↓
PRDOrchestrator.process_prd(prd)
    ├─→ ChunkingService.chunk_prd(prd)
    │    ├─ Detect chunk type (keyword matching)
    │    └─ Create metadata
    │
    ├─→ EmbeddingService.embed_text(full_text)
    │    └─ Generate 384-dim vector
    │
    ├─→ VectorService.index_chunk()
    │    └─ Store in Qdrant with payload
    │
    ├─→ GraphService.create_chunk_node()
    │    └─ Create Neo4j node
    │
    └─→ ChunkingService.detect_relationships()
         ├─ Keyword overlap analysis
         ├─ Dependency detection
         └─ GraphService.create_relationship()
```

### 4.2 Key Processing Steps

**Step 1: Chunking** (`/backend/app/services/chunking_service.py`)
- Divides each section into semantic chunks
- Detects chunk type via keyword matching
- Adds context prefix (e.g., "PRD: X, Section: Y")
- Extracts metadata (priority, tags)

**Step 2: Embedding** (`/backend/app/services/embedding_service.py`)
- Uses `sentence-transformers/all-MiniLM-L6-v2`
- Input: Full text (context + content)
- Output: 384-dimensional vector
- Supports batch processing for efficiency

**Step 3: Indexing** (`/backend/app/services/vector_service.py`)
- Stores vector + payload in Qdrant
- Enables filtered semantic search
- Supports TTL and update operations

**Step 4: Relationship Detection** (`/backend/app/services/chunking_service.py`)
- Analyzes text overlap between chunks
- Searches for dependency keywords ("depends on", "requires", "prerequisites")
- Creates relationship nodes in Neo4j
- Computes relationship strength (0.0-1.0)

**Step 5: Graph Building** (`/backend/app/services/graph_service.py`)
- Creates PRD node
- Creates chunk nodes
- Links chunks to PRD (BELONGS_TO)
- Creates inter-chunk relationships

---

## 5. BACKEND FRAMEWORK & TECHNOLOGY STACK

### 5.1 Core Framework

**Technology:** Python + FastAPI

**File:** `/home/jwscho/cvPRD/backend/app/main.py`

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="cvPRD API",
    description="AI-Powered PRD System",
    version="0.1.0"
)

# CORS Configuration for React dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes registered at /api/v1 prefix
app.include_router(router, prefix="/api/v1", tags=["PRD"])
```

### 5.2 API Endpoints

**File:** `/home/jwscho/cvPRD/backend/app/api/routes.py`

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/prds` | Create PRD and process |
| GET | `/api/v1/prds` | List all PRDs |
| GET | `/api/v1/prds/{prd_id}` | Get PRD details |
| POST | `/api/v1/search` | Semantic search |
| GET | `/api/v1/chunks/{chunk_id}/context` | Get chunk context with dependencies |
| POST | `/api/v1/prds/{prd_id}/optimize` | Optimize PRD with LLM |
| GET | `/api/v1/health` | Health check |

### 5.3 Service Layer Architecture

**Orchestrator Pattern** - Single coordinator handles workflow

```python
# /backend/app/services/orchestrator.py
class PRDOrchestrator:
    def __init__(self):
        self.embedding_service = EmbeddingService()
        self.vector_service = VectorService()
        self.graph_service = GraphService()  # Optional (disabled in desktop)
    
    def process_prd(self, prd: PRD) -> Dict[str, Any]:
        # Coordinates entire workflow
        chunks = ChunkingService.chunk_prd(prd)
        # ... embed, index, create graph
        return results
```

### 5.4 Dependencies

**File:** `/home/jwscho/cvPRD/backend/requirements.txt`

```
# Core
fastapi>=0.104.1
uvicorn[standard]>=0.24.0
pydantic>=2.5.0
pydantic-settings>=2.1.0

# Databases
sqlalchemy>=2.0.23
psycopg2-binary>=2.9.9
neo4j>=5.14.1
qdrant-client>=1.7.0
redis>=5.0.1

# ML/Embeddings
sentence-transformers>=2.2.2
torch>=2.2.0

# Utilities
python-dotenv>=1.0.0
httpx>=0.25.2
```

### 5.5 Configuration

**File:** `/home/jwscho/cvPRD/backend/app/core/config.py`

```python
class Settings(BaseSettings):
    # Application
    APP_NAME: str = "cvPRD"
    DEBUG: bool = True
    
    # Database (currently PostgreSQL URL configured but not actively used)
    DATABASE_URL: str = "postgresql://cvprd:cvprd_dev@localhost:5433/cvprd"
    
    # Neo4j (optional, can be disabled)
    NEO4J_ENABLED: bool = True
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "cvprd_dev"
    
    # Qdrant
    QDRANT_HOST: str = "localhost"
    QDRANT_PORT: int = 6333
    QDRANT_COLLECTION: str = "prd_chunks"
    
    # Embeddings
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384
    
    # OpenRouter LLM
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = "anthropic/claude-3.5-sonnet"
```

---

## 6. DOCUMENT PARSING & PROCESSING UTILITIES

### 6.1 Existing Chunking Service

**File:** `/home/jwscho/cvPRD/backend/app/services/chunking_service.py`

**Current Capabilities:**
1. **Simple section-based chunking** - Treats each PRDSection as a chunk
2. **Chunk type detection** - Keyword-based classification
3. **Relationship detection** - Word overlap and keyword analysis
4. **Context prefix generation** - Adds PRD/section context

**Limitations:**
- No support for markdown formatting
- No Word (.docx) document parsing
- No smart semantic segmentation
- No advanced text analysis

### 6.2 What's Missing for Document Upload

To implement document upload, you'll need to build:

1. **File Upload Handler** - Accept .docx, .md, .pdf files
2. **Document Parsers:**
   - **Markdown Parser** - Extract structure from markdown
   - **Word Parser** - Extract text from .docx files
   - **PDF Parser** - Extract text from PDFs
3. **Enhanced Chunking** - Respect document structure (headings, lists)
4. **Format Conversion** - Convert uploaded content to PRD structure

---

## 7. FRONTEND ARCHITECTURE

### 7.1 React TypeScript Setup

**File:** `/home/jwscho/cvPRD/frontend/package.json`

```json
{
  "name": "cvprd-frontend",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "axios": "^1.6.0",
    "react-query": "^3.39.3"
  }
}
```

### 7.2 API Client

**File:** `/home/jwscho/cvPRD/frontend/src/services/api.ts`

```typescript
import axios from 'axios'

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' }
})

export const createPRD = async (data: CreatePRDRequest): Promise<PRDResponse>
export const searchSemantic = async (query: string): Promise<SearchResponse>
export const optimizePRD = async (prdId: string): Promise<OptimizeResponse>
```

### 7.3 UI Components

```
/frontend/src/components/
├── PRDForm.tsx           # Create PRD form
├── PRDList.tsx           # List of PRDs
├── PRDDetail.tsx         # PRD details & chunks
└── SearchInterface.tsx   # Semantic search UI
```

### 7.4 Type Definitions

**File:** `/home/jwscho/cvPRD/frontend/src/types/index.ts`

Key interfaces for document upload would be:
```typescript
interface PRDSection {
  title: string
  content: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  tags: string[]
}

interface CreatePRDRequest {
  name: string
  description?: string
  sections: PRDSection[]
}
```

---

## 8. INFRASTRUCTURE & DEPLOYMENT

### 8.1 Docker Compose Stack

**File:** `/home/jwscho/cvPRD/infrastructure/docker/docker-compose.yml`

```yaml
services:
  postgres:        # Port 5433 - Document storage
  neo4j:           # Port 7687 (Bolt), 7474 (Browser) - Knowledge graph
  qdrant:          # Port 6333 (HTTP), 6334 (gRPC) - Vector DB
  redis:           # Port 6380 - Caching (optional)
```

### 8.2 Service Ports Reference

| Service | Host Port | Container Port | Purpose |
|---------|-----------|-----------------|---------|
| PostgreSQL | 5433 | 5432 | Document persistence |
| Neo4j Bolt | 7687 | 7687 | Graph database queries |
| Neo4j Browser | 7474 | 7474 | Graph visualization |
| Qdrant HTTP | 6333 | 6333 | Vector search API |
| Qdrant gRPC | 6334 | 6334 | Vector search (gRPC) |
| Redis | 6380 | 6379 | Caching |

---

## 9. KEY FILES FOR DOCUMENT UPLOAD IMPLEMENTATION

### 9.1 Files You'll Need to Modify/Create

**Priority 1 (Core Implementation):**
1. `/backend/app/services/document_parser.py` - NEW: Parse uploaded documents
2. `/backend/app/api/routes.py` - Modify: Add upload endpoint
3. `/backend/app/services/orchestrator.py` - Modify: Handle document-derived PRDs

**Priority 2 (Enhancement):**
4. `/frontend/src/components/DocumentUpload.tsx` - NEW: Upload UI
5. `/backend/app/core/config.py` - Modify: Add document parsing config

**Priority 3 (Support):**
6. `/backend/requirements.txt` - Add: python-docx, pypdf, markdown libraries
7. `/frontend/package.json` - Add: File upload libraries

### 9.2 Integration Points

```
Document Upload Flow:
1. Frontend: DocumentUpload.tsx
   └─→ 2. API: POST /api/v1/prds/upload (NEW)
       └─→ 3. Backend: document_parser.py
           └─→ 4. Convert to PRD structure
               └─→ 5. Call orchestrator.process_prd()
                   └─→ 6. Existing workflow (chunking, embedding, etc.)
```

---

## 10. IMPLEMENTATION ROADMAP

### Phase 1: Document Parsing Libraries
- Add dependencies: `python-docx`, `pypdf`, `markdown`, `python-pptx` (optional)
- Create `document_parser.py` with support for:
  - Word documents (.docx)
  - Markdown files (.md)
  - PDF files (.pdf)

### Phase 2: Document Upload Endpoint
- Create FastAPI endpoint: `POST /api/v1/prds/upload`
- Handle multipart form data
- Extract text and structure from documents
- Convert to PRD sections

### Phase 3: Frontend Upload Component
- Create React component for file selection
- Support drag-and-drop
- Show upload progress
- Handle errors and validation

### Phase 4: Smart Chunking
- Enhance `chunking_service.py` to:
  - Respect document structure (headings)
  - Preserve formatting information
  - Auto-detect chunk types from structure
  - Extract and preserve hierarchies

### Phase 5: Quality Assurance
- Implement validation rules
- Add duplicate detection
- Build preview interface
- Support manual editing before final commit

---

## 11. EXAMPLE: HOW DATA FLOWS THROUGH THE SYSTEM

### 11.1 Manual PRD Creation (Current)

```
User Input (React Form)
  name: "User Authentication System"
  sections: [
    {
      title: "OAuth2 Requirement",
      content: "The system shall authenticate...",
      priority: "critical",
      tags: ["auth", "security"]
    }
  ]

  ↓

POST /api/v1/prds (axios)

  ↓

FastAPI Route Handler
  prd = PRD(
    id=uuid.uuid4(),
    name="User Authentication System",
    sections=[PRDSection(...)]
  )

  ↓

orchestrator.process_prd(prd)
  
  ├─ chunks = ChunkingService.chunk_prd(prd)
  │   chunk = Chunk(
  │     id=uuid.uuid4(),
  │     prd_id=prd.id,
  │     chunk_type="requirement",
  │     text="The system shall authenticate...",
  │     context_prefix="PRD: User Auth System, Section: OAuth2 Requirement",
  │     priority="critical",
  │     tags=["auth", "security"],
  │     metadata={"section_title": "OAuth2 Requirement"}
  │   )
  │
  ├─ for chunk in chunks:
  │   ├─ vector = embedding_service.embed_text(
  │   │    "PRD: User Auth System, Section: OAuth2 Requirement - The system shall..."
  │   │  )  # Returns [0.123, -0.456, ..., 0.789] (384 dimensions)
  │   │
  │   ├─ vector_service.index_chunk(
  │   │    chunk_id=chunk.id,
  │   │    vector=vector,
  │   │    payload={
  │   │      "chunk_id": chunk.id,
  │   │      "prd_id": prd.id,
  │   │      "chunk_type": "requirement",
  │   │      "text": "The system shall authenticate...",
  │   │      "priority": "critical",
  │   │      "tags": ["auth", "security"],
  │   │      "section_title": "OAuth2 Requirement"
  │   │    }
  │   │  )  # Stored in Qdrant
  │   │
  │   └─ graph_service.create_chunk_node(
  │        chunk_id=chunk.id,
  │        chunk_data={...}
  │      )  # Neo4j node created
  │
  └─ relationships = ChunkingService.detect_relationships(chunks)
     # Analyzes chunk-to-chunk connections
```

**Result in Databases:**

**Qdrant (Vector DB):**
```json
{
  "id": "chunk_uuid_1",
  "vector": [0.123, -0.456, ..., 0.789],
  "payload": {
    "chunk_id": "chunk_uuid_1",
    "prd_id": "prd_uuid",
    "chunk_type": "requirement",
    "text": "The system shall authenticate...",
    "priority": "critical",
    "tags": ["auth", "security"]
  }
}
```

**Neo4j (Graph DB):**
```cypher
(:PRD {id: "prd_uuid", name: "User Authentication System"})
  ←[:BELONGS_TO]—
(:Chunk {id: "chunk_uuid_1", type: "requirement", text: "The system shall..."})
```

---

## 12. RELEVANT CODE SNIPPETS FOR REFERENCE

### 12.1 Creating a PRD Programmatically

```python
from app.models.prd_models import PRD, PRDSection, Priority

prd = PRD(
    id=str(uuid.uuid4()),
    name="My Document",
    description="Parsed from Word doc",
    sections=[
        PRDSection(
            title="Feature 1",
            content="Description of feature 1",
            priority=Priority.HIGH,
            tags=["feature", "backend"]
        ),
        PRDSection(
            title="Requirement 2",
            content="Description of requirement",
            priority=Priority.MEDIUM,
            tags=["requirement", "api"]
        )
    ]
)

# Process it
from app.services.orchestrator import PRDOrchestrator
orchestrator = PRDOrchestrator()
result = orchestrator.process_prd(prd)
```

### 12.2 Semantic Search Example

```python
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService

embedding_service = EmbeddingService()
vector_service = VectorService()

# Search
query = "How do we handle authentication?"
query_vector = embedding_service.embed_text(query)

results = vector_service.search(
    query_vector=query_vector,
    limit=5,
    filters={"chunk_type": ["requirement", "feature"]}
)

for result in results:
    print(f"Score: {result['score']}")
    print(f"Text: {result['payload']['text']}")
```

### 12.3 Adding Document Parser Service

```python
# NEW FILE: /backend/app/services/document_parser.py

from typing import List
from app.models.prd_models import PRD, PRDSection
import uuid

class DocumentParser:
    @staticmethod
    def parse_markdown(content: str, filename: str) -> PRD:
        """Parse markdown document into PRD structure"""
        # Extract sections from markdown
        sections = DocumentParser._extract_sections_from_markdown(content)
        return PRD(
            id=str(uuid.uuid4()),
            name=filename.replace('.md', ''),
            sections=sections
        )
    
    @staticmethod
    def parse_docx(file_path: str) -> PRD:
        """Parse Word document into PRD structure"""
        from docx import Document
        doc = Document(file_path)
        sections = []
        
        for para in doc.paragraphs:
            if para.style.name.startswith('Heading'):
                title = para.text
                # Collect content until next heading
                content = ""
                # ... extract content
                sections.append(PRDSection(title=title, content=content))
        
        return PRD(
            id=str(uuid.uuid4()),
            name=doc.core_properties.title or "Untitled",
            sections=sections
        )
```

---

## 13. TESTING THE EXISTING SYSTEM

### 13.1 Run the Demo

```bash
cd /home/jwscho/cvPRD
source backend/venv/bin/activate
python demo/demo.py
```

### 13.2 API Testing with FastAPI Docs

```
http://localhost:8000/docs
```

Provides interactive API documentation with try-it-out capability.

### 13.3 Database Exploration

**Neo4j Browser:**
```
http://localhost:7474
```
Query example:
```cypher
MATCH (p:PRD)-[:BELONGS_TO]-(c:Chunk)
RETURN p.name, c.type, c.text
```

**Qdrant Dashboard:**
```
http://localhost:6333/dashboard
```

---

## 14. SUMMARY TABLE: FILES TO FOCUS ON

| File Path | Purpose | For Upload Feature |
|-----------|---------|-------------------|
| `/backend/app/models/prd_models.py` | Data models | Reference existing structures |
| `/backend/app/services/chunking_service.py` | PRD segmentation | Enhance for document structure |
| `/backend/app/services/embedding_service.py` | Text→Vector | Use as-is for document chunks |
| `/backend/app/services/vector_service.py` | Vector indexing | Use as-is for search |
| `/backend/app/services/graph_service.py` | Relationships | Use as-is for graph building |
| `/backend/app/services/orchestrator.py` | Workflow | Integrate document parsing |
| `/backend/app/api/routes.py` | API endpoints | Add document upload endpoint |
| `/backend/app/core/config.py` | Configuration | Add document storage config |
| `/backend/requirements.txt` | Dependencies | Add document parsing libraries |
| `/frontend/src/services/api.ts` | API client | Add upload API calls |
| `/frontend/src/components/` | UI | Create DocumentUpload component |

---

## 15. KEY ARCHITECTURAL INSIGHTS

1. **Layered Architecture:**
   - API Layer (FastAPI routes) → Service Layer (orchestration, parsing) → Data Layer (Qdrant, Neo4j, PostgreSQL)

2. **Separation of Concerns:**
   - Chunking handles segmentation
   - Embedding handles vectorization
   - Vector Service handles indexing
   - Graph Service handles relationships
   - Orchestrator coordinates all

3. **Flexibility:**
   - Graph database is optional (can be disabled for desktop version)
   - Services are loosely coupled
   - Easy to add new document types

4. **Scalability Considerations:**
   - Batch processing in vector indexing
   - Redis for caching (configured but optional)
   - Qdrant for distributed vector search
   - Neo4j for complex relationship queries

---

## 16. NEXT STEPS FOR DOCUMENT UPLOAD FEATURE

1. **Research & Planning:**
   - Review existing chunking logic
   - Plan document type support (.docx, .md, .pdf)
   - Design document→PRD conversion strategy

2. **Backend Development:**
   - Install document parsing libraries
   - Create `document_parser.py` service
   - Add `POST /prds/upload` endpoint
   - Integrate with existing orchestrator

3. **Frontend Development:**
   - Create file upload component
   - Add drag-and-drop support
   - Implement preview functionality
   - Connect to backend API

4. **Testing:**
   - Test with various document types
   - Verify chunking quality
   - Test semantic search on uploaded content
   - Validate relationship detection

5. **Refinement:**
   - Improve chunk quality detection
   - Add format preservation options
   - Build advanced editor for generated PRDs
   - Implement batch document processing

