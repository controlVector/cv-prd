# cvPRD Application - Interactive PRD Generator

🎉 **Complete interactive web application for creating AI-powered Product Requirements Documents!**

## What You Have Now

A full-stack application with:

✅ **React Frontend** (TypeScript + Vite)
- Create PRDs with multiple sections
- Semantic search interface
- View all your PRDs
- Modern, responsive UI

✅ **FastAPI Backend** (Python)
- REST API for PRD operations
- Automatic chunking and processing
- Semantic search endpoint
- Knowledge graph queries

✅ **Three Databases** (Docker)
- Qdrant for vector embeddings
- Neo4j for knowledge graph
- PostgreSQL for document storage
- Redis for caching

## Quick Start (3 steps!)

### 1. Ensure Docker containers are running

```bash
cd infrastructure/docker
docker compose ps  # Check if running

# If not running:
docker compose up -d
```

### 2. Start the complete application

```bash
# From the root directory
./start-app.sh
```

This single command starts everything:
- Backend API on http://localhost:8000
- Frontend on http://localhost:3000
- Logs to `backend.log` and `frontend.log`

### 3. Open your browser

Navigate to: **http://localhost:3000**

That's it! You're ready to create PRDs.

## Your First PRD

1. **Fill in the form:**
   - Name: "E-commerce Checkout System"
   - Description: "Complete checkout flow with payment processing"

2. **Add sections** (click "+ Add Section" for more):

   **Section 1:**
   - Title: "Payment Processing"
   - Content: "The system shall support credit card payments via Stripe API with PCI compliance"
   - Priority: Critical
   - Tags: payment, stripe, security

   **Section 2:**
   - Title: "Cart Management"
   - Content: "Users shall be able to add, remove, and update quantities in their shopping cart"
   - Priority: High
   - Tags: cart, ui

   **Section 3:**
   - Title: "Order Confirmation"
   - Content: "The system must send order confirmation emails within 30 seconds of successful payment"
   - Priority: High
   - Tags: email, notifications

3. **Click "Create PRD"**

Watch as it:
- Creates 3 semantic chunks
- Generates embeddings
- Builds knowledge graph
- Detects relationships

4. **Try searching:**
   - Switch to "Search" tab
   - Query: "How do we handle payments?"
   - See semantic search in action!

5. **Explore the graph:**
   - Open http://localhost:7474
   - Login: `neo4j` / `cvprd_dev`
   - Run: `MATCH (p:PRD)<-[:BELONGS_TO]-(c) OPTIONAL MATCH (c)-[r]->(c2) RETURN p,c,r,c2`

## Application Architecture

```
Frontend (React)              Backend (FastAPI)              Databases
┌─────────────┐              ┌──────────────┐              ┌─────────┐
│             │              │              │              │ Qdrant  │
│ PRD Form    │─────HTTP────▶│ /api/v1/prds │─────────────▶│ Vectors │
│             │              │              │              └─────────┘
│ Search UI   │◀────JSON─────│ Orchestrator │
│             │              │              │              ┌─────────┐
│ PRD List    │              │ /api/v1/     │─────────────▶│ Neo4j   │
│             │              │  search      │              │ Graph   │
└─────────────┘              └──────────────┘              └─────────┘

http://localhost:3000        http://localhost:8000         Ports: 6333, 7687
```

## Features

### ✨ Create PRDs Interactively
- Multi-section forms
- Priority levels (Critical → Low)
- Tagging system
- Real-time processing

### 🔍 Semantic Search
- Natural language queries
- Relevance scoring
- Filter by priority/type
- Full context view

### 📊 Knowledge Graph
- Automatic relationship detection
- Dependency tracking
- Visual graph in Neo4j
- Cypher queries

### 🎯 Vector Search
- 384-dimensional embeddings
- Cosine similarity
- Fast retrieval
- Payload filtering

## API Documentation

Once the backend is running, visit:
**http://localhost:8000/docs**

Interactive Swagger UI with:
- All API endpoints
- Request/response schemas
- Try it out feature

Key endpoints:
- `POST /api/v1/prds` - Create PRD
- `GET /api/v1/prds` - List all PRDs
- `POST /api/v1/search` - Semantic search
- `GET /api/v1/chunks/{id}/context` - Get chunk relationships

## File Structure

```
cvPRD/
├── frontend/               # React application
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── PRDForm.tsx       # PRD creation form
│   │   │   ├── SearchInterface.tsx
│   │   │   └── PRDList.tsx
│   │   ├── services/      # API client
│   │   ├── types/         # TypeScript types
│   │   └── App.tsx        # Main app component
│   └── package.json
│
├── backend/               # FastAPI application
│   └── app/
│       ├── api/           # REST endpoints
│       │   └── routes.py
│       ├── services/      # Business logic
│       │   ├── orchestrator.py    # Main workflow
│       │   ├── embedding_service.py
│       │   ├── vector_service.py
│       │   ├── graph_service.py
│       │   └── chunking_service.py
│       ├── models/        # Data models
│       └── main.py        # FastAPI app
│
├── infrastructure/docker/  # Database services
│   └── docker-compose.yml
│
├── demo/                  # Original demo script
│   └── demo.py
│
└── start-app.sh          # Start everything!
```

## Development

### Run Backend Only

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --reload
```

Visit http://localhost:8000/docs for API docs

### Run Frontend Only

```bash
cd frontend
npm run dev
```

Visit http://localhost:3000

### Check Logs

```bash
# Backend logs
tail -f backend.log

# Frontend logs
tail -f frontend.log
```

## Customization

### Add New Section Types

Edit `backend/app/services/chunking_service.py`:

```python
class ChunkType(str, Enum):
    REQUIREMENT = "requirement"
    FEATURE = "feature"
    YOUR_TYPE = "your_type"  # Add here
```

### Modify UI Styling

Edit `frontend/src/App.css` - all styles are in one file for easy customization.

### Add New API Endpoints

1. Add to `backend/app/api/routes.py`
2. Update frontend service in `frontend/src/services/api.ts`
3. Create UI component in `frontend/src/components/`

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000 or 8000
lsof -i :3000
lsof -i :8000

# Kill the process or use different ports
```

### Frontend Won't Start

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Backend Won't Start

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

### Database Connection Issues

```bash
cd infrastructure/docker
docker compose down
docker compose up -d
# Wait 30 seconds for health checks
```

## What's Next?

Now that you have a working application, you can:

1. **Create Real PRDs** - Use it for actual project planning
2. **Extend the UI** - Add graphs, charts, visualizations
3. **Add AI Features** - Integrate GPT for code generation
4. **Export Functions** - Generate Word docs, PDFs
5. **Collaboration** - Add user auth, real-time editing
6. **Templates** - Pre-built PRD templates
7. **Analytics** - PRD completeness scores, metrics

See [ROADMAP.md](./ROADMAP.md) for the complete implementation plan.

## Documentation

- **[USER_GUIDE.md](./USER_GUIDE.md)** - How to use the application
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System design
- **[API_SPEC.md](./API_SPEC.md)** - Complete API reference
- **[QUICKSTART.md](./QUICKSTART.md)** - Demo setup guide

## Support

- **Neo4j Browser**: http://localhost:7474
- **Qdrant Dashboard**: http://localhost:6333/dashboard
- **API Docs**: http://localhost:8000/docs

---

**Enjoy creating AI-powered PRDs!** 🚀

Built with React, FastAPI, Qdrant, Neo4j, and sentence-transformers.
