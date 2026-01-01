# cvPRD - AI-Powered Product Requirements Documentation

Create intelligent PRDs with semantic search, knowledge graphs, and AI-powered optimization.

## Quick Start

### Option A: Download a Release (Recommended)

Download the latest release for your platform from the [Releases page](https://github.com/yourusername/cv-prd/releases):
- **Windows**: `cvPRD-Setup-x.x.x.exe`
- **macOS**: `cvPRD-x.x.x.dmg`
- **Linux**: `cvPRD-x.x.x.AppImage`

Run the installer and you're done - the desktop app includes everything you need.

### Option B: Run from Source (Developers)

#### Prerequisites

- Python 3.10-3.12
- Node.js 18+
- Docker & Docker Compose

#### 1. Clone and Setup

```bash
git clone https://github.com/yourusername/cv-prd.git
cd cv-prd
```

#### 2. Configure API Keys

**Required for AI features**: You need an OpenRouter API key.

1. Get a free API key at https://openrouter.ai/
2. Create `backend/.env`:
```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

> **Without an API key configured, the app will start but AI features (PRD optimization, test generation, etc.) will not work.**
>
> *Ollama/local model support is planned for a future release.*

#### 3. Start Databases

```bash
cd infrastructure/docker
docker compose up -d
cd ../..
```

Wait ~30 seconds for services to be ready.

#### 4. Install Dependencies

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cd ..

# Frontend
cd frontend
npm install
cd ..
```

#### 5. Run the Application

```bash
./start-app.sh  # Windows: use Git Bash or WSL
```

Open http://localhost:3000

## What is cvPRD?

cvPRD replaces document-based PRDs with an intelligent system that:

- **Semantic Search**: Find requirements by meaning, not just keywords
- **Knowledge Graphs**: Visualize dependencies and relationships
- **AI Optimization**: Improve requirements for clarity and completeness
- **Context Packaging**: Export optimized context for AI code generation

## Architecture

```
Frontend (React + TypeScript)
    ↓
API Gateway (FastAPI)
    ↓
┌─────────────┬─────────────┬─────────────┐
│  PostgreSQL │   Qdrant    │  FalkorDB   │
│  (Documents)│  (Vectors)  │   (Graph)   │
└─────────────┴─────────────┴─────────────┘
```

## Documentation

| Document | Description |
|----------|-------------|
| [User Guide](docs/USER_GUIDE.md) | How to use the application |
| [Architecture](docs/ARCHITECTURE.md) | System design and data flow |
| [API Reference](docs/API_SPEC.md) | REST API documentation |
| [Desktop App](docs/desktop/README.md) | Building desktop releases |

## Troubleshooting

### "OPENROUTER_API_KEY not set"

This warning means AI features are disabled. See [Configure API Keys](#2-configure-api-keys) above.

### Port Already in Use

```bash
./check-ports.sh  # Check what's using ports 3000, 8000, etc.
```

### Docker Issues

```bash
cd infrastructure/docker
docker compose down
docker compose up -d
docker compose logs  # Check for errors
```

### Backend Crashes on Startup

Check `backend.log` for errors. Common issues:
- Missing Python dependencies: `pip install -r requirements.txt`
- Database not running: `docker compose ps`

## Development

```bash
# Run backend only
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Run frontend only
cd frontend
npm run dev
```

## License

[Your License]

## Contributing

See [ROADMAP](docs/ROADMAP.md) for planned features and how to contribute.
