# PRD Optimization Feature Guide

## Overview

The PRD Optimization feature uses LLM (Large Language Model) analysis to review, restructure, and optimize your PRD facts for better code generation outcomes. This feature is specifically designed to enhance PRDs for "vibe coding" - creating requirements that result in the best production-grade code.

## What Does It Do?

The optimizer:

1. **Analyzes all facts** in your PRD knowledge graph
2. **Reviews each fact** for clarity, completeness, and technical detail
3. **Suggests improvements** to existing facts
4. **Identifies missing facts** that would improve code generation
5. **Detects relationships** between facts that weren't previously captured
6. **Restructures the knowledge graph** with optimized facts

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  1. Fetch PRD Facts from Vector DB + Graph DB       │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  2. Send to OpenRouter LLM API                      │
│     - Analyzes fact quality                         │
│     - Suggests optimizations                        │
│     - Recommends new facts                          │
│     - Identifies missing relationships              │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  3. Apply Optimizations                             │
│     - Update existing facts                         │
│     - Create new facts                              │
│     - Add new relationships                         │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│  4. Update Vector DB + Knowledge Graph              │
│     - Re-embed optimized facts                      │
│     - Update graph nodes                            │
│     - Create new relationships                      │
└─────────────────────────────────────────────────────┘
```

## Components

### Backend Services

#### 1. **OpenRouter Service** (`app/services/openrouter_service.py`)
- Handles communication with OpenRouter API
- Supports any LLM model available on OpenRouter
- Default: Claude 3.5 Sonnet (Anthropic)
- Configurable via environment variables

#### 2. **PRD Optimizer Service** (`app/services/prd_optimizer_service.py`)
- Orchestrates the optimization workflow
- Fetches facts from vector store
- Applies LLM recommendations
- Updates both vector DB and knowledge graph

### API Endpoint

```
POST /api/v1/prds/{prd_id}/optimize?optimization_goal=vibe%20coding
```

**Parameters:**
- `prd_id` (path): ID of the PRD to optimize
- `optimization_goal` (query, optional): Goal for optimization (default: "vibe coding")

**Response:**
```json
{
  "status": "success",
  "prd_id": "...",
  "prd_name": "...",
  "optimization_goal": "vibe coding",
  "analysis": {
    "overall_assessment": "Brief assessment of PRD quality",
    "structural_insights": "Overall structural recommendations"
  },
  "statistics": {
    "facts_updated": 5,
    "facts_created": 3,
    "relationships_created": 7,
    "facts_unchanged": 2
  },
  "detailed_analysis": {
    "fact_optimizations": [...],
    "new_facts": [...],
    "relationship_recommendations": [...]
  }
}
```

### Frontend Integration

The PRD List component (`frontend/src/components/PRDList.tsx`) now includes an "Optimize for Vibe Coding" button for each PRD:

```typescript
<button onClick={() => handleOptimize(prd.id, prd.name)}>
  🚀 Optimize for Vibe Coding
</button>
```

When clicked:
1. Shows "Optimizing..." state
2. Calls the optimization API
3. Displays results in an alert
4. Shows statistics and LLM assessment

## Configuration

### Environment Variables

Add to `/home/jwscho/cvPRD/backend/.env`:

```bash
# OpenRouter LLM API
OPENROUTER_API_KEY=your-api-key-here
OPENROUTER_MODEL=anthropic/claude-3.5-sonnet
```

**Supported Models:**
- `anthropic/claude-3.5-sonnet` (default, recommended)
- `anthropic/claude-3-opus`
- `openai/gpt-4-turbo`
- `openai/gpt-4o`
- Any other model available on OpenRouter

### Settings (`app/core/config.py`)

```python
OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_API_URL: str = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")
```

## How the LLM Analysis Works

### Prompt Strategy

The optimizer sends a carefully crafted prompt to the LLM that includes:

1. **System Prompt**: Establishes the LLM's role as a technical PM and software architect
2. **Context**: All PRD facts with their metadata (type, priority, text)
3. **Analysis Requirements**:
   - Fact quality assessment
   - Optimization recommendations
   - Relationship insights
   - Structure improvements

### Analysis Criteria

The LLM evaluates each fact on:

- **Clarity**: Is the requirement unambiguous?
- **Specificity**: Are technical details sufficient?
- **Completeness**: Is all necessary context included?
- **Implementability**: Can a developer write code from this?

### Quality Scoring

- **Score 8-10**: Fact is excellent, kept unchanged
- **Score 5-7**: Fact needs minor improvements, updated
- **Score 0-4**: Fact needs major revision, significantly rewritten

## Usage

### Via API (cURL)

```bash
# Get PRD ID from list
curl http://localhost:8000/api/v1/prds

# Optimize a specific PRD
curl -X POST "http://localhost:8000/api/v1/prds/{PRD_ID}/optimize?optimization_goal=vibe%20coding"
```

### Via Frontend

1. Open the cvPRD application
2. Navigate to the PRD list
3. Click "🚀 Optimize for Vibe Coding" on any PRD
4. Wait for optimization to complete (30-60 seconds)
5. Review the results in the popup

### Via Test Script

```bash
cd /home/jwscho/cvPRD
python test_prd_optimizer.py
```

The test script will:
1. Create a sample PRD
2. Run optimization
3. Display detailed results
4. Save results to JSON file

## Example Output

```
OPTIMIZATION RESULTS
================================================================================

PRD: E-Commerce Platform
Goal: vibe coding

STATISTICS:
--------------------------------------------------------------------------------
  Facts Updated:           5
  New Facts Created:       3
  Relationships Created:   7
  Facts Unchanged:         2

LLM ANALYSIS:
--------------------------------------------------------------------------------
Overall Assessment:
  The PRD provides a good foundation but lacks technical specificity in
  several areas. Authentication mechanism is undefined, database schemas
  are not specified, and performance requirements are missing.

Structural Insights:
  Add dedicated sections for: API design, data models, performance
  requirements, security considerations, and error handling. Split the
  Shopping Cart section into cart management and checkout flow.
```

## Benefits

### For Developers

- **Clearer Requirements**: More specific, actionable requirements
- **Better Context**: Additional context helps understand the "why"
- **Fewer Ambiguities**: LLM identifies and resolves unclear statements
- **Complete Picture**: Missing requirements are identified and added

### For Code Generation

- **Higher Quality Output**: LLMs generate better code from optimized facts
- **Fewer Iterations**: Less back-and-forth due to missing information
- **Better Architecture**: Relationships help maintain consistency
- **Production-Ready**: Optimized for real-world implementation

## Technical Details

### Fact Update Strategy

When a fact is optimized:

1. **Text Update**: Replace with LLM-suggested optimized text
2. **Metadata Update**: Adjust type and priority if recommended
3. **Context Enhancement**: Append additional context if suggested
4. **Re-embedding**: Generate new embedding for updated text
5. **Vector Update**: Update in Qdrant with new embedding
6. **Graph Update**: Update Neo4j node properties

### New Fact Creation

When LLM suggests new facts:

1. **Generate UUID**: Create unique ID for new fact
2. **Set Metadata**: Type, priority, tags from LLM recommendation
3. **Generate Embedding**: Create vector embedding
4. **Index in Qdrant**: Add to vector database
5. **Create Graph Node**: Add to Neo4j
6. **Link to PRD**: Create BELONGS_TO relationship

### Relationship Detection

LLM-detected relationships:

- **DEPENDS_ON**: One fact requires another
- **REFERENCES**: One fact mentions another
- **IMPLEMENTS**: Implementation detail of a higher-level requirement
- **CONFLICTS_WITH**: Potential conflicts to resolve

## Limitations

- **API Costs**: Each optimization makes LLM API calls (charged by tokens)
- **Processing Time**: 30-60 seconds per PRD depending on size and model
- **Quality Varies**: Results depend on LLM model and prompt quality
- **Context Window**: Very large PRDs may exceed LLM context limits

## Future Enhancements

- [ ] Batch optimization for multiple PRDs
- [ ] Incremental optimization (only new/changed facts)
- [ ] Custom optimization goals beyond "vibe coding"
- [ ] Optimization history and versioning
- [ ] A/B testing of different optimization strategies
- [ ] Cost estimation before running optimization
- [ ] Streaming results for real-time feedback

## Troubleshooting

### "OpenRouter API key not configured"

**Solution**: Add `OPENROUTER_API_KEY` to `.env` file

### "Failed to parse LLM response as JSON"

**Cause**: LLM returned non-JSON response

**Solution**:
- Check model supports JSON output
- Try different model (Claude 3.5 Sonnet is most reliable)
- Check API logs for raw response

### "Optimization failed with 500 error"

**Cause**: Backend error during processing

**Solution**:
- Check backend logs: `tail -f backend/logs/app.log`
- Verify Qdrant and Neo4j are running
- Check OpenRouter API quota/credits

### Very slow optimization

**Cause**: Large PRD or slow LLM model

**Solution**:
- Use faster model (e.g., `anthropic/claude-3-haiku`)
- Split large PRDs into smaller ones
- Reduce context by filtering facts

## API Key Security

⚠️ **Important**: Never commit `.env` file to git!

The `.env` file containing your OpenRouter API key is gitignored. If you need to deploy:

1. Set environment variables on your server
2. Use secrets management (AWS Secrets Manager, HashiCorp Vault, etc.)
3. Never hardcode API keys in source code

## Support

For issues or questions:
- Check backend logs: `/home/jwscho/cvPRD/backend/logs/`
- Run test script for diagnostics: `python test_prd_optimizer.py`
- Review OpenRouter API status: https://openrouter.ai/status
