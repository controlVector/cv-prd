# cvPRD - AI-Powered Product Requirements Documentation System

A next-generation PRD tool that stores documentation as interconnected vector databases, enabling both human editing and AI-powered code generation with full context preservation.

## Overview

cvPRD replaces traditional document-based PRD tools (like Microsoft Word) with a knowledge graph architecture that:

- **Stores requirements as semantic chunks** in vector databases for intelligent search
- **Links chunks via knowledge graphs** to maintain relationships and dependencies
- **Provides dual interfaces**: Human-friendly editing + AI-optimized fact retrieval
- **Preserves context** for AI agents to generate code without losing important details
- **Enables intelligent queries** like "Find all security requirements for authentication"

## Key Features

### For Product Teams
- Rich text editor for natural PRD writing
- Automatic requirement extraction and categorization
- Dependency visualization and impact analysis
- Semantic search across all PRDs
- Version control and change tracking

### For Engineering Teams
- AI code generation from requirements
- Context-aware code suggestions
- Automatic documentation of implementation status
- Traceability from code back to requirements

### For AI Agents
- Optimized context packaging (prevents context loss)
- Graph-based relationship traversal
- Hybrid search (semantic + keyword + metadata)
- Token-budget-aware context building

## Architecture

```
Frontend (React + TypeScript)
    ↓
API Gateway (FastAPI)
    ↓
┌─────────────┬─────────────┬─────────────┐
│  PostgreSQL │   Qdrant    │    Neo4j    │
│  (Documents)│  (Vectors)  │   (Graph)   │
└─────────────┴─────────────┴─────────────┘
```

**Tech Stack:**
- **Backend**: Python + FastAPI
- **Frontend**: React + TypeScript
- **Vector DB**: Qdrant (semantic search)
- **Graph DB**: Neo4j (relationships)
- **Document Store**: PostgreSQL (source of truth)
- **Embeddings**: sentence-transformers (can upgrade to OpenAI)

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design.

## Project Documentation

| Document | Description |
|----------|-------------|
| **[SETUP.md](./SETUP.md)** | **⭐ Start here! Step-by-step setup guide for new developers** |
| [START_HERE.md](./START_HERE.md) | Quick overview and getting started |
| [USER_GUIDE.md](./USER_GUIDE.md) | How to use cvPRD application |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Complete system architecture and design |
| [API_SPEC.md](./API_SPEC.md) | Full REST API specification with examples |
| [DATA_MODELS.md](./DATA_MODELS.md) | PostgreSQL, Qdrant, and Neo4j data models |
| [ROADMAP.md](./ROADMAP.md) | Development roadmap and implementation guide |
| [DESKTOP_APP_README.md](./DESKTOP_APP_README.md) | Building and distributing desktop application |

## Quick Start

> **📖 New to cvPRD? Follow [SETUP.md](./SETUP.md) for step-by-step setup instructions!**

### Prerequisites
- **Python 3.10+** (with pip)
- **Node.js 18+** (with npm)
- **Docker & Docker Compose**

### Setup (5 minutes)

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd cvPRD
   ```

2. **Start databases** (Docker must be running)
   ```bash
   cd infrastructure/docker
   docker compose up -d
   # Wait ~30 seconds for services to start
   cd ../..
   ```

3. **Install backend dependencies**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   cd ..
   ```

4. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

5. **Start the application**
   ```bash
   ./start-app.sh  # On Windows: Use Git Bash or WSL
   ```

6. **Open your browser**
   - Frontend: http://localhost:3000
   - API Docs: http://localhost:8000/docs
   - Neo4j Browser: http://localhost:7474 (user: neo4j, pass: cvprd_dev)
   - Qdrant Dashboard: http://localhost:6333/dashboard

### Troubleshooting

**Ports already in use?**
```bash
./check-ports.sh  # Check what's using ports 3000, 8000, 5433, 6333, 7687
```

**Docker issues?**
```bash
cd infrastructure/docker
docker compose down
docker compose up -d
```

**Python dependencies failing?**
- Make sure you're using Python 3.10-3.12
- On Linux: May need `sudo apt install python3-dev`

**Still having issues?**
See [SETUP.md](./SETUP.md) for detailed troubleshooting and step-by-step instructions.

## Development Phases

### Phase 1: Core Backend (Weeks 2-3) ✓
- Database models and migrations
- Basic CRUD operations for PRDs
- FastAPI routes and authentication

### Phase 2: Chunking Service (Week 4)
- Semantic text segmentation
- Chunk type detection
- Metadata extraction

### Phase 3: Vector Search (Week 5)
- Embedding generation
- Qdrant integration
- Semantic search API

### Phase 4: Knowledge Graph (Weeks 6-7)
- Neo4j integration
- Relationship detection
- Dependency analysis

### Phase 5: Frontend MVP (Weeks 8-9)
- Rich text editor
- Chunk visualization
- Search interface

### Phase 6: AI Integration (Weeks 10-12)
- Context builder
- Code generation
- AI chat interface

See [ROADMAP.md](./ROADMAP.md) for detailed tasks.

## Example Use Cases

### 1. Write PRD with Auto-Chunking
```
User writes: "The system shall authenticate users via OAuth2.
              This feature depends on the user database being set up."

cvPRD automatically:
- Creates "Requirement" chunk for authentication
- Creates "Dependency" relationship to database setup
- Generates embeddings for semantic search
- Links to relevant existing requirements
```

### 2. Semantic Search
```
Query: "What are our security requirements?"

Returns:
- All chunks tagged with "security"
- Requirements mentioning auth, encryption, etc.
- Related constraints and risks
- With full context from knowledge graph
```

### 3. AI Code Generation
```
User: "Generate authentication code for requirement R123"

cvPRD:
1. Retrieves requirement R123
2. Traverses graph to get dependencies
3. Builds context package (req + deps + constraints)
4. Sends to AI agent with token budget
5. Returns generated code with traceability
```

### 4. Impact Analysis
```
User: "What happens if I change this requirement?"

cvPRD shows:
- All features that depend on it
- Downstream requirements affected
- Implementation status
- Risk assessment
```

## API Examples

### Create PRD with Chunks
```bash
POST /api/v1/prds
{
  "name": "User Authentication System",
  "content": {
    "sections": [
      {
        "title": "OAuth2 Integration",
        "content": "System shall support OAuth2...",
        "priority": "high",
        "tags": ["auth", "security"]
      }
    ]
  }
}
```

### Semantic Search
```bash
POST /api/v1/search/semantic
{
  "query": "authentication requirements",
  "filters": {
    "priority": ["high", "critical"],
    "tags": ["auth"]
  },
  "limit": 10
}
```

### Get Dependencies
```bash
GET /api/v1/graph/chunks/{chunk_id}/dependencies?depth=3

Response:
{
  "direct": [...],
  "transitive": [...],
  "circular": []
}
```

### Generate Code
```bash
POST /api/v1/ai/generate-code
{
  "chunk_ids": ["req-123", "req-456"],
  "language": "python",
  "framework": "fastapi"
}
```

See [API_SPEC.md](./API_SPEC.md) for complete API documentation.

## Data Flow

### 1. PRD Creation Flow
```
User writes PRD → Save to PostgreSQL → Chunk text →
Generate embeddings → Index in Qdrant →
Detect relationships → Build graph in Neo4j →
Display to user
```

### 2. Search Flow
```
User enters query → Generate query embedding →
Search Qdrant with filters →
Retrieve chunks from PostgreSQL →
Enhance with graph context → Return results
```

### 3. AI Code Generation Flow
```
User selects requirement → Retrieve from PostgreSQL →
Query Neo4j for dependencies →
Build context package → Send to AI →
Generate code → Link back to requirements
```

## Contributing

This is currently an architecture and design project. To start contributing:

1. Review [ARCHITECTURE.md](./ARCHITECTURE.md) to understand the system design
2. Check [ROADMAP.md](./ROADMAP.md) for current phase
3. Pick a task from the current phase
4. Follow the implementation guides in the roadmap

## Future Enhancements

- **Multi-modal PRDs**: Support images, diagrams, videos
- **Auto-linking**: ML-based automatic relationship detection
- **Smart suggestions**: AI-suggested requirements
- **Template library**: Pre-built PRD templates
- **Integrations**: Jira, GitHub, Confluence sync
- **Compliance**: Requirements traceability matrix

## License

[Your chosen license]

## Contact

[Your contact information]

---

**Ready to replace Word docs with intelligent, AI-powered PRDs?**

Start with [ROADMAP.md](./ROADMAP.md) Phase 0 to set up your development environment!
