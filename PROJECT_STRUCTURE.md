# cvPRD Project Structure

## Overview

This document describes the complete project structure and what each file does.

## Directory Tree

```
cvPRD/
├── README.md                           # Main project overview
├── QUICKSTART.md                       # Quick start guide for the prototype
├── ARCHITECTURE.md                     # Complete system architecture
├── API_SPEC.md                         # REST API specification
├── DATA_MODELS.md                      # Database models and schemas
├── ROADMAP.md                          # 18-week implementation plan
├── PROJECT_STRUCTURE.md                # This file
├── .gitignore                          # Git ignore rules
├── setup.sh                            # Automated setup script
├── run-demo.sh                         # Demo runner script
│
├── backend/                            # Python backend
│   ├── requirements.txt                # Python dependencies
│   ├── .env.example                    # Environment variables template
│   │
│   ├── app/                            # Main application code
│   │   ├── __init__.py
│   │   │
│   │   ├── core/                       # Core configuration
│   │   │   ├── __init__.py
│   │   │   └── config.py               # Settings and configuration
│   │   │
│   │   ├── models/                     # Data models
│   │   │   ├── __init__.py
│   │   │   └── prd_models.py           # PRD, Chunk, Relationship models
│   │   │
│   │   └── services/                   # Business logic services
│   │       ├── __init__.py
│   │       ├── embedding_service.py    # Text embedding generation
│   │       ├── vector_service.py       # Qdrant vector DB operations
│   │       ├── graph_service.py        # Neo4j graph operations
│   │       └── chunking_service.py     # PRD chunking and relationship detection
│   │
│   └── tests/                          # Test files (to be added)
│
├── demo/                               # Demo scripts
│   └── demo.py                         # Interactive demo showcasing all features
│
├── infrastructure/                     # Infrastructure configuration
│   └── docker/                         # Docker setup
│       └── docker-compose.yml          # Database services (PostgreSQL, Neo4j, Qdrant, Redis)
│
├── frontend/                           # Frontend (future - React/TypeScript)
│   └── (to be created)
│
└── docs/                               # Additional documentation
    └── (future documentation)
```

## File Descriptions

### Root Level Files

#### Documentation
- **README.md**: Project overview, features, tech stack, quick examples
- **QUICKSTART.md**: Step-by-step guide to run the prototype in minutes
- **ARCHITECTURE.md**: Complete system architecture, component design, workflows
- **API_SPEC.md**: Full REST API specification with request/response examples
- **DATA_MODELS.md**: PostgreSQL, Qdrant, and Neo4j data models
- **ROADMAP.md**: 18-week implementation plan with code examples
- **PROJECT_STRUCTURE.md**: This file - explains the project structure

#### Scripts
- **setup.sh**: Automated setup script that:
  - Checks prerequisites (Python, Docker)
  - Starts Docker containers
  - Creates Python virtual environment
  - Installs dependencies

- **run-demo.sh**: Simple script to run the demo

#### Configuration
- **.gitignore**: Git ignore rules for Python, Docker, IDEs, etc.

### Backend Directory

#### `backend/requirements.txt`
Python dependencies including:
- FastAPI (web framework)
- SQLAlchemy (database ORM)
- Qdrant client (vector database)
- Neo4j driver (graph database)
- sentence-transformers (embeddings)
- pytest (testing)

#### `backend/.env.example`
Template for environment variables:
- Database connection strings
- API keys (for production)
- Model configuration
- Security settings

### Backend Application Code

#### `backend/app/core/`

**config.py**
- Centralized configuration using Pydantic Settings
- Database URLs
- Service endpoints
- Model selection
- Security settings

#### `backend/app/models/`

**prd_models.py**
- Pydantic models for data validation
- Classes: `PRD`, `PRDSection`, `Chunk`, `Relationship`
- Enums: `ChunkType`, `Priority`, `RelationshipType`

#### `backend/app/services/`

**embedding_service.py**
- Loads sentence-transformers model
- Generates embeddings for text
- Batch processing for efficiency
- Returns 384-dimensional vectors

**vector_service.py**
- Manages Qdrant vector database
- Creates/manages collections
- Indexes chunks with embeddings
- Performs semantic search
- Supports filtered queries

**graph_service.py**
- Manages Neo4j knowledge graph
- Creates nodes (PRD, Chunk)
- Creates relationships (DEPENDS_ON, REFERENCES, etc.)
- Traverses graph for dependencies
- Finds related chunks
- Provides graph statistics

**chunking_service.py**
- Breaks PRDs into semantic chunks
- Detects chunk types automatically
- Identifies relationships between chunks
- Extracts metadata
- Generates context prefixes

### Demo Directory

#### `demo/demo.py`
Interactive demonstration that:
1. Creates a sample PRD (authentication system)
2. Chunks it into semantic components
3. Generates embeddings and indexes in Qdrant
4. Builds knowledge graph in Neo4j
5. Demonstrates semantic search
6. Shows graph traversal
7. Builds AI context packages

### Infrastructure Directory

#### `infrastructure/docker/docker-compose.yml`
Defines Docker services:
- **PostgreSQL**: Relational database for document storage
- **Neo4j**: Graph database for relationships
- **Qdrant**: Vector database for embeddings
- **Redis**: Cache (for future use)

All services include:
- Health checks
- Port mappings
- Volume mounts for persistence
- Environment configuration

## Data Flow

### 1. PRD Creation
```
User Input (PRD sections)
    ↓
ChunkingService.chunk_prd()
    ↓
List of Chunk objects
```

### 2. Vector Indexing
```
Chunk text
    ↓
EmbeddingService.embed_text()
    ↓
384D vector
    ↓
VectorService.index_chunk()
    ↓
Stored in Qdrant
```

### 3. Graph Building
```
Chunk objects
    ↓
GraphService.create_chunk_node()
    ↓
Nodes in Neo4j
    ↓
ChunkingService.detect_relationships()
    ↓
GraphService.create_relationship()
    ↓
Relationships in Neo4j
```

### 4. Semantic Search
```
User query
    ↓
EmbeddingService.embed_text()
    ↓
Query vector
    ↓
VectorService.search()
    ↓
Relevant chunks with scores
```

### 5. Graph Traversal
```
Chunk ID
    ↓
GraphService.get_dependencies()
    ↓
Related chunks from graph
```

## Key Design Patterns

### Service Layer Pattern
All business logic is in service classes:
- `EmbeddingService`: Handles embeddings
- `VectorService`: Handles vector operations
- `GraphService`: Handles graph operations
- `ChunkingService`: Handles chunking logic

Benefits:
- Separation of concerns
- Easy to test
- Reusable components
- Clear interfaces

### Dependency Injection
Services are instantiated and passed where needed:
```python
embedding_service = EmbeddingService()
vector_service = VectorService()
# Use services...
```

### Configuration Management
All settings in one place (`config.py`):
- Environment-based configuration
- Easy to modify for different environments
- Type-safe with Pydantic

## Database Schemas

### Qdrant (Vector DB)
```python
{
    "id": "chunk_uuid",
    "vector": [0.1, 0.2, ...],  # 384 dimensions
    "payload": {
        "chunk_id": "uuid",
        "prd_id": "uuid",
        "chunk_type": "requirement",
        "text": "...",
        "priority": "high",
        "tags": ["auth", "security"]
    }
}
```

### Neo4j (Graph DB)
```cypher
// Nodes
(p:PRD {id, name, description})
(c:Chunk {id, type, text, priority, context})

// Relationships
(c1:Chunk)-[:DEPENDS_ON]->(c2:Chunk)
(c1:Chunk)-[:REFERENCES]->(c2:Chunk)
(c:Chunk)-[:BELONGS_TO]->(p:PRD)
```

## Running the Prototype

### Quick Start
```bash
# 1. Run setup
./setup.sh

# 2. Run demo
./run-demo.sh
```

### Manual Start
```bash
# 1. Start databases
cd infrastructure/docker
docker-compose up -d

# 2. Install Python deps
cd ../../backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Run demo
cd ..
python demo/demo.py
```

### Explore Results

**Neo4j Browser**: http://localhost:7474
```cypher
MATCH (p:PRD)<-[:BELONGS_TO]-(c:Chunk)
OPTIONAL MATCH (c)-[r]->(c2:Chunk)
RETURN p, c, r, c2
```

**Qdrant Dashboard**: http://localhost:6333/dashboard

## Next Development Steps

1. **Add FastAPI REST API** (see API_SPEC.md)
2. **Implement PostgreSQL storage** (see DATA_MODELS.md)
3. **Build frontend** (React + TypeScript)
4. **Add authentication** (JWT-based)
5. **Implement AI integration** (code generation)

Follow the [ROADMAP.md](./ROADMAP.md) for detailed implementation steps.

## Testing

### Current Status
Basic prototype - tests to be added.

### Future Testing Strategy
```
backend/tests/
├── test_embedding_service.py
├── test_vector_service.py
├── test_graph_service.py
├── test_chunking_service.py
└── test_integration.py
```

## Contributing

When adding new features:
1. Add service classes in `backend/app/services/`
2. Add models in `backend/app/models/`
3. Update configuration in `backend/app/core/config.py`
4. Add tests in `backend/tests/`
5. Update relevant documentation

## License

[Your license here]
