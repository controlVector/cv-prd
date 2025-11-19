# PRD Knowledge Graph System - Architecture

## System Overview

A next-generation Product Requirements Documentation system that stores information as interconnected vector databases, enabling both human editing and AI agent code generation with context preservation.

### Core Principles
1. **Granular Context Isolation**: Each PRD component stored as semantically meaningful chunks
2. **Knowledge Graph Structure**: Chunks linked by typed relationships (dependencies, references, hierarchies)
3. **Dual Interface**: Human-friendly editing + AI-optimized fact retrieval
4. **Context Preservation**: Each vector maintains sufficient context for standalone AI comprehension

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   PRD Editor │  │  Graph View  │  │  AI Chat UI  │      │
│  │   (Rich Text)│  │  (Visualize) │  │  (Query/Gen) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                           │
                           │ REST/GraphQL API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           API Gateway (FastAPI/Node.js)                 │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │  Document    │ │  Chunking    │ │  Query Engine     │  │
│  │  Service     │ │  Service     │ │  (Hybrid Search)  │  │
│  └──────────────┘ └──────────────┘ └───────────────────┘  │
│  ┌──────────────┐ ┌──────────────┐ ┌───────────────────┐  │
│  │  Embedding   │ │  Graph       │ │  Context Builder  │  │
│  │  Service     │ │  Service     │ │  (AI Agent)       │  │
│  └──────────────┘ └──────────────┘ └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   Vector DB  │  │  Graph DB    │  │  Document    │
│   (Qdrant)   │  │  (Neo4j)     │  │  Store       │
│              │  │              │  │  (PostgreSQL)│
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## Tech Stack Recommendation

### Backend: **Python + FastAPI**
**Rationale:**
- Rich ecosystem for AI/ML (LangChain, sentence-transformers, OpenAI SDK)
- FastAPI provides async performance, auto-generated docs
- Strong typing with Pydantic for data validation
- Easy integration with vector DBs and graph databases

### Frontend: **React + TypeScript**
**Rationale:**
- Rich text editing libraries (Slate.js, ProseMirror, TipTap)
- Graph visualization (React Flow, D3.js, vis.js)
- Strong typing ensures API contract adherence
- Large ecosystem for PRD-specific UI components

### Vector Database: **Qdrant**
**Rationale:**
- Open-source, self-hostable
- Rich filtering with payload-based queries (critical for multi-PRD systems)
- High performance with HNSW indexing
- Native Python SDK
- Supports hybrid search (dense + sparse vectors)
- Built-in multi-tenancy

**Alternatives considered:**
- Pinecone (excellent but proprietary/hosted)
- Weaviate (good but Qdrant has better filtering)
- ChromaDB (lighter weight but less production-ready)

### Knowledge Graph: **Neo4j**
**Rationale:**
- Industry-standard graph database
- Cypher query language perfect for traversing relationships
- Powerful graph algorithms (PageRank, community detection)
- Neo4j Bloom for visualization
- APOC library for advanced operations

**Alternatives considered:**
- ArangoDB (multi-model but Cypher is more mature)
- Neptune (AWS-only)
- NetworkX (in-memory, not suitable for persistence)

### Document Store: **PostgreSQL + JSONB**
**Rationale:**
- Store raw PRD content, metadata, versions
- JSONB for flexible schema
- Strong consistency guarantees
- Well-understood operational model
- pgvector extension could complement Qdrant

### Embedding Model: **sentence-transformers (all-MiniLM-L6-v2)**
**Rationale:**
- Fast inference (384 dimensions)
- Good semantic understanding
- Can upgrade to larger models (all-mpnet-base-v2) if needed
- Option to use OpenAI embeddings (text-embedding-3-small) for production

---

## Core Components

### 1. Document Service
**Responsibilities:**
- CRUD operations for PRDs
- Version control (git-like tracking of changes)
- User permissions and collaboration
- Export/import (Markdown, JSON, Word)

**Tech:** FastAPI routes + PostgreSQL

### 2. Chunking Service
**Responsibilities:**
- Semantic segmentation of PRD content
- Chunk types: `requirement`, `feature`, `constraint`, `stakeholder`, `metric`, `dependency`
- Intelligent splitting (respect boundaries, maintain context)
- Metadata extraction (priority, status, owner, tags)

**Algorithm:**
```python
# Recursive chunking with semantic boundaries
1. Parse PRD structure (headings, sections)
2. Identify chunk types via pattern matching + LLM classification
3. Split on semantic boundaries (max 500 tokens/chunk)
4. Add contextual prefix to each chunk (e.g., "Project: X, Feature: Y - Requirement: ...")
5. Generate metadata for filtering
```

**Tech:** LangChain TextSplitters + custom logic

### 3. Embedding Service
**Responsibilities:**
- Convert text chunks to vectors
- Batch processing for efficiency
- Caching for unchanged content

**Tech:** sentence-transformers or OpenAI API

### 4. Vector Store Service
**Responsibilities:**
- Index chunks with embeddings
- Store payload (original text, metadata, chunk_id)
- Hybrid search (semantic + keyword + filter)

**Schema:**
```python
{
  "id": "chunk_uuid",
  "vector": [0.1, 0.2, ...],  # 384 or 1536 dimensions
  "payload": {
    "prd_id": "prd_uuid",
    "chunk_type": "requirement",
    "text": "The system shall...",
    "context": "Project: X, Feature: Y",
    "metadata": {
      "priority": "high",
      "status": "approved",
      "tags": ["auth", "security"],
      "section_path": "3.2.1"
    }
  }
}
```

### 5. Graph Service
**Responsibilities:**
- Build knowledge graph from chunks
- Track relationships: `DEPENDS_ON`, `REFERENCES`, `PARENT_OF`, `CONTRADICTS`, `IMPLEMENTS`
- Graph traversal for context gathering
- Detect circular dependencies, orphaned requirements

**Graph Schema (Neo4j):**
```cypher
// Nodes
(:PRD {id, name, version, created_at})
(:Chunk {id, type, text, vector_id})
(:Concept {name, description})  // Extracted entities

// Relationships
(Chunk)-[:BELONGS_TO]->(PRD)
(Chunk)-[:DEPENDS_ON {strength: 0.8}]->(Chunk)
(Chunk)-[:REFERENCES]->(Chunk)
(Chunk)-[:PARENT_OF]->(Chunk)
(Chunk)-[:MENTIONS]->(Concept)
```

### 6. Query Engine
**Responsibilities:**
- Hybrid search across vector + graph + metadata
- Query types:
  - Semantic search: "Find all security requirements"
  - Graph traversal: "Show all dependencies of Feature X"
  - Filtered search: "High-priority backend requirements"
  - Contextual retrieval: "Get full context for requirement R123"

**Tech:** Qdrant search + Neo4j Cypher + custom ranking

### 7. Context Builder (AI Agent Interface)
**Responsibilities:**
- Package context for AI agents
- Strategies:
  - **Direct**: Single chunk + metadata
  - **Expanded**: Chunk + immediate dependencies
  - **Full Context**: Chunk + traversed graph (up to N hops)
  - **Summarized**: LLM-generated summary of related chunks
- Token budget management (e.g., keep under 4K tokens)
- Context formatting for code generation

**Output Format:**
```json
{
  "primary_requirement": {
    "text": "...",
    "metadata": {...}
  },
  "dependencies": [...],
  "related_features": [...],
  "constraints": [...],
  "total_tokens": 3847,
  "context_strategy": "expanded"
}
```

---

## Data Models

### PostgreSQL Schema

```sql
-- Core document storage
CREATE TABLE prds (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version INTEGER DEFAULT 1,
  content JSONB,  -- Full document content
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
  vector_id VARCHAR(255),  -- Reference to Qdrant
  graph_node_id VARCHAR(255),  -- Reference to Neo4j
  position INTEGER,
  created_at TIMESTAMP
);

CREATE TABLE versions (
  id UUID PRIMARY KEY,
  prd_id UUID REFERENCES prds(id),
  version INTEGER,
  changes JSONB,
  created_at TIMESTAMP,
  created_by UUID
);
```

---

## Key Workflows

### 1. Create PRD
```
User creates PRD → Document Service saves to PostgreSQL →
Chunking Service segments document → Embedding Service generates vectors →
Vector Store indexes chunks → Graph Service builds relationships →
Frontend displays editable chunks
```

### 2. Edit Chunk
```
User edits chunk → Document Service updates PostgreSQL →
Re-embed changed chunk → Update vector store →
Graph Service recomputes relationships → Notify dependent chunks
```

### 3. AI Code Generation Query
```
User asks "Generate auth code" → Query Engine semantic search →
Find relevant auth requirements → Graph Service traverses dependencies →
Context Builder packages context → Send to AI agent → Return code
```

### 4. Dependency Analysis
```
User selects requirement → Graph Service queries Neo4j →
Cypher: MATCH (r:Chunk {id: X})-[:DEPENDS_ON*1..3]-(related) →
Return dependency graph → Frontend visualizes with React Flow
```

---

## Scaling Considerations

### Performance
- **Vector search**: Qdrant handles millions of vectors efficiently with HNSW
- **Graph queries**: Add indexes on frequently queried relationships
- **Caching**: Redis for frequently accessed context bundles
- **Async processing**: Celery for background chunking/embedding

### Storage
- **Vector DB**: ~1.5KB per chunk (384D vectors) = 1.5MB per 1000 chunks
- **Graph DB**: Lightweight, relationships are edges
- **PostgreSQL**: Primary storage, plan for versioning overhead

### Multi-tenancy
- **Qdrant**: Use collections per tenant or payload filtering
- **Neo4j**: Graph database supports multi-tenancy with node labels
- **PostgreSQL**: Row-level security

---

## Implementation Phases

### Phase 1: MVP Core (4-6 weeks)
- Basic FastAPI backend with PostgreSQL
- Simple chunking (heading-based)
- Qdrant integration for vector storage
- Basic semantic search
- Simple React frontend with markdown editor

### Phase 2: Knowledge Graph (3-4 weeks)
- Neo4j integration
- Relationship detection and building
- Graph visualization in frontend
- Dependency analysis features

### Phase 3: AI Agent Integration (2-3 weeks)
- Context Builder service
- AI chat interface
- Code generation from requirements
- Feedback loop (AI → human review → PRD update)

### Phase 4: Advanced Features (4-6 weeks)
- Collaboration (real-time editing)
- Advanced chunking (ML-based semantic segmentation)
- Conflict detection
- Analytics and metrics
- Export/import workflows

---

## Development Setup

### Repository Structure
```
cvPRD/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routes
│   │   ├── services/     # Business logic
│   │   ├── models/       # Pydantic models
│   │   ├── db/           # Database connections
│   │   └── core/         # Config, auth
│   ├── tests/
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── services/     # API clients
│   │   ├── hooks/        # Custom hooks
│   │   └── types/        # TypeScript types
│   └── package.json
├── infrastructure/
│   ├── docker-compose.yml
│   └── k8s/              # Kubernetes configs
└── docs/
```

### Local Development Stack
```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:15
  neo4j:
    image: neo4j:5
  qdrant:
    image: qdrant/qdrant:latest
  redis:
    image: redis:7
  backend:
    build: ./backend
  frontend:
    build: ./frontend
```

---

## Security Considerations

1. **Authentication**: JWT-based auth with role-based access control
2. **Vector isolation**: Ensure users can only search their PRDs (payload filtering)
3. **Graph permissions**: Row-level security in Neo4j queries
4. **API rate limiting**: Prevent abuse of embedding/AI services
5. **Data encryption**: At rest (database) and in transit (TLS)

---

## Monitoring and Observability

- **APM**: Sentry for error tracking
- **Metrics**: Prometheus + Grafana for system metrics
- **Logging**: Structured logging with ELK stack
- **Tracing**: OpenTelemetry for distributed tracing
- **Key metrics**:
  - Vector search latency
  - Embedding generation time
  - Graph query performance
  - AI agent context build time

---

## Future Enhancements

1. **Multi-modal**: Support images, diagrams, videos in PRDs
2. **Auto-linking**: ML-based automatic relationship detection
3. **Smart suggestions**: AI-suggested requirements based on existing content
4. **Template library**: Pre-built PRD templates for common use cases
5. **Integration**: Jira, GitHub, Confluence sync
6. **Compliance**: Requirements traceability matrix for regulated industries
