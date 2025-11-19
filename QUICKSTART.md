# Quick Start Guide - cvPRD Prototype

Get the cvPRD prototype running in minutes and see vector databases and knowledge graphs in action!

## Prerequisites

- **Python 3.10+** installed
- **Docker and Docker Compose** installed
- At least 4GB of free RAM (for the databases)

## Setup Instructions

### 1. Start the Databases

First, start all the required databases using Docker Compose:

```bash
cd infrastructure/docker

# For Docker Compose V2 (newer):
docker compose up -d

# For Docker Compose V1 (older):
docker-compose up -d
```

**Note:** The setup script will automatically detect which version you have.

This will start:
- **PostgreSQL** on port 5433 (using 5433 to avoid conflicts with system PostgreSQL)
- **Neo4j** on ports 7474 (HTTP) and 7687 (Bolt)
- **Qdrant** on port 6333
- **Redis** on port 6380 (using 6380 to avoid conflicts with system Redis)

Wait ~30 seconds for all services to be healthy:

```bash
# V2:
docker compose ps

# V1:
docker-compose ps
```

All services should show status as "healthy".

### 2. Install Python Dependencies

Create a virtual environment and install dependencies:

```bash
cd backend
python -m venv venv

# Activate virtual environment
# On Linux/Mac:
source venv/bin/activate
# On Windows:
# venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

**Note:** The first time you run this, it will download the sentence-transformers model (~80MB). This is normal and only happens once.

### 3. Run the Demo

Now run the demo script to see everything in action:

```bash
cd ..
python demo/demo.py
```

## What the Demo Does

The demo script showcases the complete cvPRD workflow:

### 1. **PRD Creation & Chunking**
- Creates a sample "User Authentication System" PRD
- Breaks it down into 6 semantic chunks (requirements, features, constraints)
- Detects chunk types automatically

### 2. **Vector Embeddings**
- Generates 384-dimensional embeddings for each chunk
- Indexes them in Qdrant for semantic search
- Each chunk is searchable by meaning, not just keywords

### 3. **Knowledge Graph**
- Creates nodes in Neo4j for each chunk
- Automatically detects relationships (DEPENDS_ON, REFERENCES, IMPLEMENTS)
- Links related requirements together

### 4. **Semantic Search**
- Demonstrates natural language queries like "How do we handle security?"
- Finds relevant chunks based on semantic similarity
- Returns results with relevance scores

### 5. **Graph Traversal**
- Shows how to find all dependencies of a chunk
- Traverses the graph to find related requirements
- Useful for impact analysis

### 6. **AI Context Building**
- Demonstrates how to package context for AI agents
- Combines primary requirement + dependencies + related chunks
- Ready to send to an LLM for code generation

## Expected Output

You should see output like this:

```
================================================================================
  cvPRD Prototype Demo
================================================================================

This demo showcases:
  1. PRD Chunking - Breaking down PRDs into semantic chunks
  2. Vector Embeddings - Converting chunks to searchable vectors
  3. Semantic Search - Finding relevant chunks by meaning
  4. Knowledge Graph - Linking chunks with relationships
  5. Graph Traversal - Finding dependencies and related chunks

--- Initializing Services ---

Loading embedding model (this may take a moment)...
✓ Embedding model loaded (dimension: 384)

Connecting to Qdrant vector database...
✓ Connected to Qdrant

Connecting to Neo4j knowledge graph...
✓ Connected to Neo4j

...
```

The demo takes about 1-2 minutes to run.

## Explore the Results

### Neo4j Browser (Knowledge Graph Visualization)

1. Open http://localhost:7474 in your browser
2. Login with:
   - Username: `neo4j`
   - Password: `cvprd_dev`
3. Run this Cypher query to visualize the graph:

```cypher
MATCH (p:PRD)<-[:BELONGS_TO]-(c:Chunk)
OPTIONAL MATCH (c)-[r]->(c2:Chunk)
RETURN p, c, r, c2
```

You'll see:
- PRD node in the center
- All chunk nodes connected to it
- Relationships between chunks (dependencies, references)

### Qdrant Dashboard (Vector Database)

1. Open http://localhost:6333/dashboard in your browser
2. Navigate to "Collections"
3. Click on "prd_chunks"
4. You can see:
   - Number of vectors indexed
   - Vector dimension (384)
   - All stored payloads

## Modifying the Demo

Want to try your own PRD? Edit `demo/demo.py`:

```python
def create_sample_prd():
    prd = PRD(
        id=str(uuid.uuid4()),
        name="Your PRD Name",
        description="Your description",
        sections=[
            PRDSection(
                title="Your Requirement",
                content="Your requirement text...",
                priority=Priority.HIGH,
                tags=["your", "tags"],
            ),
            # Add more sections...
        ],
    )
    return prd
```

Then run the demo again:

```bash
python demo/demo.py
```

## Testing Different Queries

You can modify the semantic search queries in the demo:

```python
search_queries = [
    "Your custom query here",
    "Another query",
]
```

Try queries like:
- "What are the security requirements?"
- "How do we handle user sessions?"
- "What depends on authentication?"

## Troubleshooting

### Port conflicts (Address already in use)

If you get errors about ports already in use, you have services running on your system using those ports.

**Check what's using the ports:**
```bash
# Check PostgreSQL port
lsof -i :5433
# or on some systems:
netstat -tuln | grep 5433

# Check Neo4j ports
lsof -i :7474
lsof -i :7687

# Check Qdrant port
lsof -i :6333

# Check Redis port
lsof -i :6380
```

**Option 1: Stop the conflicting service**
```bash
# If you have PostgreSQL running:
sudo systemctl stop postgresql
# or on Mac:
brew services stop postgresql

# If you have Redis running:
sudo systemctl stop redis
# or on Mac:
brew services stop redis
```

**Option 2: Use different ports**

Edit `infrastructure/docker/docker-compose.yml` and change the port mappings:
```yaml
ports:
  - "5434:5432"  # Change left number to any available port
```

Then update `backend/app/core/config.py` to match the new port.

### Docker containers not starting

```bash
# Check logs
cd infrastructure/docker
docker compose logs  # or docker-compose logs

# Restart containers
docker compose down  # or docker-compose down
docker compose up -d  # or docker-compose up -d
```

### Connection errors

Make sure all containers are healthy:

```bash
docker compose ps  # or docker-compose ps
```

Wait until all show "healthy" status.

### Python import errors

Make sure you're in the virtual environment:

```bash
# Check if venv is activated (you should see (venv) in your prompt)
which python  # Should point to venv/bin/python

# If not activated:
cd backend
source venv/bin/activate
```

### Embedding model download fails

If you're behind a firewall or have network issues:

```bash
# Set HTTP proxy if needed
export HTTP_PROXY=your-proxy
export HTTPS_PROXY=your-proxy

# Then retry
pip install -r requirements.txt
```

## Cleanup

When you're done exploring:

```bash
# Stop databases (data is preserved)
cd infrastructure/docker
docker compose stop  # or docker-compose stop

# Or remove everything (deletes all data)
docker compose down -v  # or docker-compose down -v
```

## Next Steps

After running the demo:

1. **Explore the Architecture** - Read [ARCHITECTURE.md](./ARCHITECTURE.md)
2. **Check the API Spec** - See [API_SPEC.md](./API_SPEC.md)
3. **Review the Roadmap** - Follow [ROADMAP.md](./ROADMAP.md) to build the full system
4. **Experiment** - Modify the demo to try different PRDs and queries

## Getting Help

- Check the main [README.md](./README.md) for overview
- Review architecture docs for deep dives
- Examine the source code in `backend/app/services/`

Enjoy exploring cvPRD! 🚀
