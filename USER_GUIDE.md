# cvPRD User Guide

## Starting the Application

The easiest way to start the complete cvPRD application:

```bash
./start-app.sh
```

This single command will:
1. Start all Docker containers (PostgreSQL, Neo4j, Qdrant, Redis)
2. Start the FastAPI backend on port 8000
3. Start the React frontend on port 3000

### Access Points

Once started, you can access:

- **Main Application**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Neo4j Browser**: http://localhost:7474 (user: `neo4j`, pass: `cvprd_dev`)
- **Qdrant Dashboard**: http://localhost:6333/dashboard

## Using the Application

### 1. Create a PRD

1. Click on the **"Create PRD"** tab (default view)
2. Fill in the PRD details:
   - **Name**: Give your PRD a descriptive name (e.g., "User Authentication System")
   - **Description**: Optional overview of what this PRD covers
3. Add sections/requirements:
   - **Section Title**: Name of the requirement or feature
   - **Content**: The actual requirement text (use "shall", "must", "should")
   - **Priority**: Critical, High, Medium, or Low
   - **Tags**: Comma-separated tags (e.g., "auth, security, oauth2")
4. Click **"+ Add Section"** to add more requirements
5. Click **"Create PRD"** to process it

**What happens behind the scenes:**
- Your PRD is broken into semantic chunks
- Each chunk gets a 384-dimensional embedding
- Chunks are indexed in Qdrant for semantic search
- Nodes and relationships are created in Neo4j
- Dependencies between requirements are automatically detected

### 2. Search Your Requirements

1. Click on the **"Search"** tab
2. Enter a natural language query, such as:
   - "How do we handle security?"
   - "What are the authentication requirements?"
   - "Tell me about password management"
3. Click **"Search"**

**Features:**
- **Semantic search**: Finds requirements by meaning, not just keywords
- **Relevance scores**: Higher scores mean better matches
- **Full context**: Click "View Full Context" to see the chunk with its PRD context
- **Filtering**: Results show priority, type, and tags

### 3. View Your PRDs

1. Click on the **"Your PRDs"** tab
2. See all created PRDs with statistics:
   - Number of chunks per PRD
   - Description
3. Click **"Refresh"** to reload the list

## Example PRD

Here's a complete example you can use:

**PRD Name**: User Authentication System

**Section 1:**
- Title: OAuth2 Authentication
- Content: The system shall authenticate users using OAuth2 protocol with support for Google, GitHub, and Microsoft providers.
- Priority: Critical
- Tags: auth, security, oauth2

**Section 2:**
- Title: Multi-Factor Authentication
- Content: The system must support MFA using TOTP (Time-based One-Time Password). This feature depends on OAuth2 authentication being implemented first.
- Priority: High
- Tags: auth, security, mfa

**Section 3:**
- Title: Session Management
- Content: The system shall manage user sessions with configurable timeout periods. Sessions must be stored securely using Redis.
- Priority: High
- Tags: auth, session, redis

**Section 4:**
- Title: Password Reset
- Content: Users shall be able to reset their password through email verification.
- Priority: Medium
- Tags: auth, password, email

## Exploring the Knowledge Graph

After creating a PRD, explore the knowledge graph in Neo4j:

1. Open http://localhost:7474
2. Login with username `neo4j` and password `cvprd_dev`
3. Run this query to visualize your PRD:

```cypher
MATCH (p:PRD)<-[:BELONGS_TO]-(c:Chunk)
OPTIONAL MATCH (c)-[r]->(c2:Chunk)
RETURN p, c, r, c2
```

**What you'll see:**
- PRD node in the center
- All chunks connected to it
- Relationships between chunks:
  - `DEPENDS_ON`: Dependencies
  - `REFERENCES`: Related requirements
  - `IMPLEMENTS`: Feature implementations

**Useful queries:**

Find all high-priority requirements:
```cypher
MATCH (c:Chunk {priority: 'high'})
RETURN c.text as requirement
```

Find dependencies of a specific chunk:
```cypher
MATCH (c:Chunk)-[:DEPENDS_ON]->(dep:Chunk)
WHERE c.text CONTAINS 'MFA'
RETURN c.text as requirement, dep.text as dependency
```

Find orphaned requirements (no relationships):
```cypher
MATCH (c:Chunk)
WHERE NOT (c)-[:DEPENDS_ON|REFERENCES]-()
RETURN c.text as isolated_requirement
```

## Exploring the Vector Database

View your embeddings in Qdrant:

1. Open http://localhost:6333/dashboard
2. Navigate to **Collections** → **prd_chunks**
3. See:
   - Total vectors indexed
   - Vector dimension (384)
   - Payloads (metadata stored with each vector)

## Tips for Writing Better PRDs

1. **Use clear language**:
   - "The system shall..." (requirements)
   - "The system must..." (mandatory)
   - "The system should..." (nice-to-have)

2. **Be specific**:
   - Bad: "The system should be secure"
   - Good: "The system shall implement rate limiting of 5 requests per minute per IP address"

3. **Use meaningful tags**:
   - Tags help organize and filter requirements
   - Use technology names, domains, and categories

4. **Set appropriate priorities**:
   - Critical: System cannot function without this
   - High: Important for initial release
   - Medium: Should have but can be delayed
   - Low: Nice to have

5. **Mention dependencies explicitly**:
   - "This feature depends on X being implemented first"
   - "This requires the email notification system"
   - The system will automatically detect these relationships!

## Troubleshooting

### Backend not starting

```bash
# Check if backend dependencies are installed
cd backend
source venv/bin/activate
pip list | grep fastapi

# If missing, install:
pip install -r requirements.txt
```

### Frontend not starting

```bash
# Install dependencies
cd frontend
npm install

# Start manually
npm run dev
```

### Docker containers not running

```bash
cd infrastructure/docker
docker compose ps  # Check status
docker compose up -d  # Start them
```

### Can't connect to services

Check ports are not in use:
```bash
lsof -i :3000  # Frontend
lsof -i :8000  # Backend
lsof -i :7474  # Neo4j
lsof -i :6333  # Qdrant
```

## Advanced Usage

### API Endpoints

You can also interact with the backend API directly:

**Create PRD:**
```bash
curl -X POST http://localhost:8000/api/v1/prds \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My PRD",
    "sections": [{
      "title": "Requirement 1",
      "content": "The system shall...",
      "priority": "high",
      "tags": ["feature"]
    }]
  }'
```

**Search:**
```bash
curl -X POST http://localhost:8000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "authentication requirements",
    "limit": 5
  }'
```

**List PRDs:**
```bash
curl http://localhost:8000/api/v1/prds
```

### Stopping the Application

Press `Ctrl+C` in the terminal where you ran `./start-app.sh`

Or stop individual components:

```bash
# Stop Docker containers
cd infrastructure/docker
docker compose stop

# Stop backend (if running separately)
pkill -f uvicorn

# Stop frontend (if running separately)
pkill -f vite
```

## Next Steps

1. **Create your first PRD** using the web interface
2. **Search across requirements** using natural language
3. **Explore the knowledge graph** in Neo4j
4. **View embeddings** in Qdrant
5. **Build on this** - extend with AI code generation, more visualizations, etc.

Enjoy using cvPRD!
