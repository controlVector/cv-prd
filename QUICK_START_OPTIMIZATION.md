# Quick Start: PRD Optimization Feature

## What We Built

A complete LLM-powered workflow that:
- ✅ Analyzes PRD facts using OpenRouter API (Claude 3.5 Sonnet)
- ✅ Reviews fact quality and suggests improvements
- ✅ Restructures knowledge graph for optimal code generation
- ✅ Optimizes requirements for "vibe coding"

## Files Created/Modified

### Backend
- ✅ `backend/.env` - Added OpenRouter API key
- ✅ `backend/app/core/config.py` - Added OpenRouter configuration
- ✅ `backend/app/services/openrouter_service.py` - **NEW** - OpenRouter LLM integration
- ✅ `backend/app/services/prd_optimizer_service.py` - **NEW** - PRD optimization orchestrator
- ✅ `backend/app/api/routes.py` - Added `/prds/{prd_id}/optimize` endpoint

### Frontend
- ✅ `frontend/src/types/index.ts` - Added OptimizeResponse type
- ✅ `frontend/src/services/api.ts` - Added optimizePRD function
- ✅ `frontend/src/components/PRDList.tsx` - Added "Optimize for Vibe Coding" button

### Testing & Documentation
- ✅ `test_prd_optimizer.py` - **NEW** - End-to-end test script
- ✅ `PRD_OPTIMIZATION_GUIDE.md` - **NEW** - Comprehensive feature documentation
- ✅ `QUICK_START_OPTIMIZATION.md` - **NEW** - This quick start guide

## How to Use

### Option 1: Via Frontend (Recommended)

1. **Start the infrastructure**:
   ```bash
   cd /home/jwscho/cvPRD/infrastructure/docker
   docker-compose up -d
   ```

2. **Start the backend**:
   ```bash
   cd /home/jwscho/cvPRD/backend
   uvicorn app.main:app --reload
   ```

3. **Start the frontend**:
   ```bash
   cd /home/jwscho/cvPRD/frontend
   npm run dev
   ```

4. **Use the feature**:
   - Open http://localhost:3000 in your browser
   - Create a PRD or select an existing one
   - Click "🚀 Optimize for Vibe Coding"
   - Wait 30-60 seconds for LLM analysis
   - Review the optimization results

### Option 2: Via API (cURL)

```bash
# First, create a PRD (or use existing PRD ID)
curl -X POST http://localhost:8000/api/v1/prds \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test PRD",
    "description": "A test PRD for optimization",
    "sections": [
      {
        "title": "Features",
        "content": "User login. Product catalog. Shopping cart.",
        "priority": "high",
        "tags": ["core"]
      }
    ]
  }'

# Copy the prd_id from response, then optimize
curl -X POST "http://localhost:8000/api/v1/prds/{PRD_ID}/optimize?optimization_goal=vibe%20coding"
```

### Option 3: Via Test Script (Easiest)

```bash
cd /home/jwscho/cvPRD
python3 test_prd_optimizer.py
```

This will:
1. Create a sample e-commerce PRD
2. Run optimization
3. Display detailed results
4. Save results to JSON file

## What Happens During Optimization

```
Your PRD Facts
     ↓
[1] Fetch all facts from Vector DB & Knowledge Graph
     ↓
[2] Send to OpenRouter (Claude 3.5 Sonnet)
     │
     ├─ Analyze fact quality (clarity, completeness, specificity)
     ├─ Suggest optimized text for each fact
     ├─ Recommend new facts to add
     └─ Identify missing relationships
     ↓
[3] Apply LLM recommendations
     │
     ├─ Update existing facts with optimized text
     ├─ Create new facts suggested by LLM
     └─ Add new relationships between facts
     ↓
[4] Update databases
     │
     ├─ Re-embed optimized facts (new vectors)
     ├─ Update Qdrant vector database
     └─ Update Neo4j knowledge graph
     ↓
Optimized PRD Ready for Code Generation!
```

## Example Results

After optimization, you'll see:

```
✓ PRD "E-Commerce Platform" optimized successfully!

Updated: 5 facts
Created: 3 new facts
New relationships: 7

Assessment: The PRD now includes explicit authentication
mechanisms, detailed data models, and clear API contracts.
All requirements are specific and actionable for code generation.
```

## Configuration

The OpenRouter API key is already configured in `/home/jwscho/cvPRD/backend/.env`:

```bash
OPENROUTER_API_KEY=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
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

### Changing the LLM Model

Edit `.env` to use a different model:

```bash
# Faster, cheaper (good for testing)
OPENROUTER_MODEL=anthropic/claude-3-haiku

# Most capable (best quality, slower)
OPENROUTER_MODEL=anthropic/claude-3-opus

# OpenAI alternative
OPENROUTER_MODEL=openai/gpt-4-turbo
```

## Verification Steps

### 1. Check Backend is Running
```bash
curl http://localhost:8000/api/v1/health
```
Should return: `{"status":"healthy",...}`

### 2. Check OpenRouter Configuration
```bash
cd /home/jwscho/cvPRD/backend
grep OPENROUTER .env
```
Should show your API key

### 3. Test the Optimizer
```bash
python3 test_prd_optimizer.py
```
Should create a PRD and optimize it successfully

## Troubleshooting

### Backend won't start
```bash
# Check if ports are in use
lsof -i :8000

# Install dependencies
cd /home/jwscho/cvPRD/backend
pip install -r requirements.txt
```

### "OpenRouter API key not configured"
```bash
# Verify .env file exists
ls -la /home/jwscho/cvPRD/backend/.env

# Check content
cat /home/jwscho/cvPRD/backend/.env | grep OPENROUTER
```

### Services not running
```bash
# Check Docker services
cd /home/jwscho/cvPRD/infrastructure/docker
docker-compose ps

# Start if needed
docker-compose up -d
```

## Next Steps

1. **Test with your own PRDs**:
   - Create a real PRD with your actual requirements
   - Run optimization
   - Review the LLM suggestions
   - Use optimized PRD for code generation

2. **Integrate with code generation**:
   - Use optimized facts as input to code generation LLMs
   - Compare code quality before/after optimization
   - Iterate on optimization prompts

3. **Customize optimization goals**:
   - Try different optimization goals
   - Modify the prompt in `openrouter_service.py`
   - Experiment with different LLM models

## Performance Expectations

- **Small PRD** (5-10 facts): ~15-30 seconds
- **Medium PRD** (20-30 facts): ~30-60 seconds
- **Large PRD** (50+ facts): ~60-120 seconds

Times vary based on:
- LLM model selected (Haiku faster, Opus slower)
- OpenRouter API response time
- Number of facts in PRD
- Complexity of optimizations needed

## Cost Estimates

Using Claude 3.5 Sonnet via OpenRouter:
- **Small PRD**: ~$0.05-0.10 per optimization
- **Medium PRD**: ~$0.10-0.25 per optimization
- **Large PRD**: ~$0.25-0.50 per optimization

Note: Costs are estimates and depend on token usage. Check OpenRouter pricing for latest rates.

## Getting Help

- **Feature Documentation**: See `PRD_OPTIMIZATION_GUIDE.md`
- **Backend Logs**: `tail -f /home/jwscho/cvPRD/backend/logs/app.log`
- **Test Script**: Run `python3 test_prd_optimizer.py` for diagnostics

## What Makes This Special?

🎯 **Optimized for "Vibe Coding"**
- Facts are reformulated for maximum code generation quality
- LLM adds missing technical details developers need
- Relationships ensure consistent implementation

🧠 **AI-Powered Analysis**
- Claude 3.5 Sonnet evaluates every fact
- Identifies ambiguities and gaps
- Suggests concrete improvements

🔄 **Automatic Knowledge Graph Restructuring**
- Updates vector embeddings for better search
- Adds missing relationships between facts
- Creates new facts to fill gaps

📊 **Transparent Results**
- See exactly what changed
- Review LLM reasoning
- Full analysis saved to JSON

---

**Ready to optimize your PRDs for better code generation?**

Start with: `python3 test_prd_optimizer.py`
