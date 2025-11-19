# cvPRD System Architecture Diagram

## High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND LAYER (React/TypeScript)                   │
│                                                                              │
│  ┌────────────────┐  ┌──────────────────┐  ┌──────────────────────┐       │
│  │  PRD Form UI   │  │  Search Interface │  │  Document Upload UI  │       │
│  │  (Manual Entry)│  │  (Semantic Query) │  │  (.docx, .md, .pdf)  │       │
│  └────────┬───────┘  └────────┬─────────┘  └──────────┬───────────┘       │
│           │                   │                       │                    │
│           └───────────────────┼───────────────────────┘                    │
│                               │                                            │
│                    HTTP/JSON API (Axios)                                  │
│                               │                                            │
└───────────────────────────────┼────────────────────────────────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │  CORS Middleware    │
                    │ (localhost:3000,    │
                    │  localhost:5173)    │
                    └───────────┬─────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────────┐
│                      API GATEWAY LAYER (FastAPI)                           │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ Router: /api/v1                                                  │    │
│  │  - POST   /prds              → Create PRD (manual)              │    │
│  │  - POST   /prds/upload       → Upload document (NEW)            │    │
│  │  - GET    /prds              → List PRDs                        │    │
│  │  - GET    /prds/{id}         → Get PRD details                  │    │
│  │  - POST   /search            → Semantic search                  │    │
│  │  - GET    /chunks/{id}/context → Get chunk context             │    │
│  │  - POST   /prds/{id}/optimize → LLM optimization               │    │
│  │  - GET    /health            → Health check                    │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                            │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
┌───────────────────────────────▼────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER (PRDOrchestrator)                   │
│                                                                            │
│  Creates and coordinates workflow:                                        │
│  1. Parse input (manual or document)                                      │
│  2. Chunk PRD into semantic segments                                      │
│  3. Generate embeddings for each chunk                                    │
│  4. Index vectors in Qdrant                                               │
│  5. Create graph nodes/edges in Neo4j                                     │
│  6. Return result to API                                                  │
│                                                                            │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         │                      │                      │
┌────────▼─────────┐  ┌────────▼─────────┐  ┌────────▼─────────┐
│ PARSING LAYER    │  │ PROCESSING LAYER │  │ INTEGRATION LAYER│
│                  │  │                  │  │                  │
│ DocumentParser   │  │ ChunkingService  │  │ GraphService     │
│ .parse_docx()    │  │ .chunk_prd()     │  │ .create_*()      │
│ .parse_markdown()│  │ .detect_*()      │  │ .find_*()        │
│ .parse_pdf()     │  │                  │  │                  │
└────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
         │                      │                     │
         │                      ▼                     │
         │            ┌─────────────────────────┐    │
         │            │ EmbeddingService        │    │
         │            │ (sentence-transformers) │    │
         │            │ .embed_text()           │    │
         │            │ .embed_batch()          │    │
         │            └────────────┬────────────┘    │
         │                         │                 │
         │                         ▼                 │
         │            ┌──────────────────────────┐   │
         │            │ VectorService (Qdrant)   │   │
         │            │ .index_chunk()           │   │
         │            │ .search()                │   │
         │            │ .index_batch()           │   │
         │            └──────────────┬───────────┘   │
         │                           │                │
         │                           │                ▼
         │                           │     ┌─────────────────────────┐
         │                           │     │ Database Operations     │
         │                           │     │ - Qdrant: Vector Search │
         │                           │     │ - Neo4j: Graph Queries  │
         │                           │     │ - PostgreSQL: Persist.  │
         │                           │     └─────────────────────────┘
         │                           │
         └───────────────────────────┴─────────────────────────────────┘

```

## Data Flow: Document Upload Example

```
USER UPLOADS DOCUMENT (.docx)
         │
         ▼
┌─────────────────────────────┐
│ DocumentUpload.tsx (React)  │  ← Creates FormData with file
└─────────────┬───────────────┘
              │
              ▼
      POST /api/v1/prds/upload
    multipart/form-data
              │
              ▼
┌─────────────────────────────┐
│ FastAPI Route Handler       │  ← Receives UploadFile
│ @router.post("/prds/upload")│
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ DocumentParser.parse_docx() │  ← Extracts text & structure
│ Returns: PRD object         │
│ {                           │
│   id: uuid,                 │
│   name: "Document Name",    │
│   sections: [               │
│     {                       │
│       title: "Feature 1",   │
│       content: "...",       │
│       priority: "high",     │
│       tags: ["feature"]     │
│     },                      │
│     ...                     │
│   ]                         │
│ }                           │
└─────────────┬───────────────┘
              │
              ▼
┌─────────────────────────────┐
│ orchestrator.process_prd()  │
└─────────────┬───────────────┘
              │
     ┌────────┼────────┐
     │        │        │
     ▼        ▼        ▼
  CHUNK   EMBED     INDEX
  ────────────────────────
  
  1. Chunk Service
     ├─ section_1 → chunk_1
     ├─ section_2 → chunk_2
     └─ ...
     
  2. Embedding Service
     ├─ full_text_1 → vector_1 (384 dims)
     ├─ full_text_2 → vector_2 (384 dims)
     └─ ...
     
  3. Vector Service (Qdrant)
     ├─ Store: {id: chunk_id, vector: [...], payload: {...}}
     ├─ Store: {id: chunk_id, vector: [...], payload: {...}}
     └─ ...
     
  4. Relationship Detection
     ├─ chunk_1 → chunk_2 (DEPENDS_ON)
     ├─ chunk_2 → chunk_3 (REFERENCES)
     └─ ...
     
  5. Graph Service (Neo4j)
     ├─ Create: (:PRD {id, name, description})
     ├─ Create: (:Chunk {id, type, text, priority})
     ├─ Create: (Chunk)-[:BELONGS_TO]->(PRD)
     ├─ Create: (Chunk)-[:DEPENDS_ON]->(Chunk)
     └─ ...
              │
              ▼
┌──────────────────────────────────────────┐
│ Return: PRDResponse                      │
│ {                                        │
│   prd_id: "...",                         │
│   prd_name: "...",                       │
│   chunks_created: 5,                     │
│   relationships_created: 3,              │
│   chunks: [...]                          │
│ }                                        │
└──────────────────────────────────────────┘
              │
              ▼
         Frontend displays success
         and new PRD in list

```

## Service Dependencies

```
API Routes
  ├── Orchestrator
  │   ├── ChunkingService
  │   ├── EmbeddingService
  │   │   └── SentenceTransformer (all-MiniLM-L6-v2)
  │   ├── VectorService
  │   │   └── QdrantClient
  │   ├── GraphService
  │   │   └── Neo4j Driver
  │   └── PRDOptimizerService
  │       └── OpenRouterService (LLM)
  │
  └── DocumentParser (NEW)
      ├── python-docx (Word)
      ├── pypdf (PDF)
      ├── markdown (Markdown)
      └── Returns: PRD object

```

## Database Schema Overview

### Qdrant (Vector Database)

```
Collection: "prd_chunks"
Vector Size: 384
Distance: COSINE

Point Structure:
{
  id: "chunk_uuid",
  vector: [0.123, -0.456, ..., 0.789],  # 384 dimensions
  payload: {
    chunk_id: "chunk_uuid",
    prd_id: "prd_uuid",
    chunk_type: "requirement|feature|constraint|...",
    text: "Full chunk text",
    context: "PRD: name, Section: title - text",
    priority: "critical|high|medium|low",
    tags: ["tag1", "tag2"],
    section_title: "Original section title"
  }
}
```

### Neo4j (Graph Database)

```
Nodes:
  (:PRD {
    id: "prd_uuid",
    name: "PRD Name",
    description: "PRD Description"
  })
  
  (:Chunk {
    id: "chunk_uuid",
    type: "requirement|feature|...",
    text: "Chunk text",
    priority: "critical|high|medium|low",
    context: "Context prefix"
  })

Relationships:
  (Chunk)-[:BELONGS_TO]->(PRD)
  (Chunk)-[:DEPENDS_ON {strength: 0.8}]->(Chunk)
  (Chunk)-[:REFERENCES]->(Chunk)
  (Chunk)-[:PARENT_OF]->(Chunk)
  (Chunk)-[:IMPLEMENTS]->(Chunk)
```

### PostgreSQL (Document Store)

```
Table: prds
  id UUID PRIMARY KEY
  name VARCHAR(255)
  description TEXT
  version INTEGER
  content JSONB
  created_at TIMESTAMP
  updated_at TIMESTAMP
  created_by UUID
  status VARCHAR(50)

Table: chunks
  id UUID PRIMARY KEY
  prd_id UUID (FK: prds.id)
  chunk_type VARCHAR(50)
  text TEXT
  context_prefix TEXT
  metadata JSONB
  vector_id VARCHAR(255)
  graph_node_id VARCHAR(255)
  position INTEGER
  created_at TIMESTAMP

Note: Currently in-memory. Implement PostgreSQL
persistence for production.
```

## Embedding & Vectorization Pipeline

```
Input Text
    │
    ▼
┌─────────────────────────────────┐
│ Sentence-Transformers Model     │
│ all-MiniLM-L6-v2                │
│ • Fast inference                │
│ • Good semantic quality         │
│ • 384 dimensions                │
└─────────────────────────────────┘
    │
    ▼
Output Vector [0.123, -0.456, ..., 0.789]
    │
    ▼
┌─────────────────────────────────┐
│ Qdrant Vector Store             │
│ • COSINE similarity search      │
│ • Payload filtering             │
│ • High-performance indexing     │
└─────────────────────────────────┘
    │
    ▼
Search Results with Similarity Scores
```

## Semantic Search Flow

```
User Query: "How do we handle authentication?"
    │
    ▼
EmbeddingService.embed_text()
    │
    ▼
query_vector (384 dims)
    │
    ▼
VectorService.search(
  query_vector,
  limit: 10,
  filters: {...}
)
    │
    ▼
Qdrant HNSW Index
(Hierarchical Navigable Small World)
    │
    ▼
Top-K Results Ranked by Cosine Similarity
    │
    ├─ {score: 0.94, chunk_id: "...", text: "OAuth2 requirement..."}
    ├─ {score: 0.87, chunk_id: "...", text: "MFA requirement..."}
    ├─ {score: 0.82, chunk_id: "...", text: "Session management..."}
    └─ ...
```

## Relationship Detection Pipeline

```
Multiple Chunks Analyzed
    │
    ├─ chunk_1: "User must authenticate with OAuth2..."
    ├─ chunk_2: "MFA support is required..."
    ├─ chunk_3: "Session timeout after 30 minutes..."
    └─ chunk_4: "Rate limiting on auth endpoints..."
    │
    ▼
ChunkingService.detect_relationships()
    │
    ├─ Keyword overlap analysis
    │  (shared terms: "auth", "require", "must")
    │
    ├─ Dependency keyword detection
    │  ("depends on", "requires", "prerequisite")
    │
    └─ Implementation detection
       (feature implements requirement)
    │
    ▼
Identified Relationships
    │
    ├─ chunk_2 -[DEPENDS_ON]-> chunk_1
    │  (MFA depends on authentication)
    │
    ├─ chunk_3 -[REFERENCES]-> chunk_1
    │  (Session management references auth)
    │
    ├─ chunk_4 -[REFERENCES]-> chunk_1
    │  (Rate limiting references auth)
    │
    └─ chunk_4 -[REFERENCES]-> chunk_2
       (Rate limiting applies to MFA too)
    │
    ▼
Neo4j Graph Updated
```

---

Generated: November 2025
