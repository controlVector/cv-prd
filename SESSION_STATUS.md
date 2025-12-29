# cv-prd Session Status

*Last updated: 2025-12-17*

## Current State

**cv-prd backend** is working with:
- PRD ingestion and chunking
- Knowledge graph (Neo4j/FalkorDB) with requirements, tests, and relationships
- Test generation via OpenRouter AI (19 tests generated for sample PRD)
- Test cases stored as separate graph nodes with `TESTS` edges to requirements
- API endpoints for PRDs, tests, coverage, and documentation

**cv-prd frontend** has:
- PRD list with correct counts (requirements vs tests separated)
- PRD detail with tabs: Requirements, Test Cases, Documentation
- Test Cases tab loads existing tests on mount and can generate new ones
- Coverage stats display (7 requirements, 19 tests, 100% coverage)

## What's Next (from the plan)

1. **Documentation Generation** - verify it works like test generation
2. **cv-git Integration (Phase 5)** - connect cv-prd to cv-git:
   - Extend prd-client types
   - Add MCP Server tools for AI context
   - Add CLI `--prd` flags
3. **Unified Context API** - `/context/unified` endpoint for full AI traversal

## How to Get Running

### Backend
```bash
cd /home/schmotz/project/cv-prd/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Frontend
```bash
cd /home/schmotz/project/cv-prd/frontend
npm run dev
```

### Apply API credentials (after backend starts)
```bash
curl -X PUT http://localhost:8000/api/v1/credentials \
  -H "Content-Type: application/json" \
  -d '{"openrouter_key":"YOUR_OPENROUTER_KEY"}'
```

### Verify
- Health: `curl http://localhost:8000/api/v1/health`
- Frontend: http://localhost:5173

## Key Files Modified This Session

### Backend
- `app/services/test_generation_service.py` - Robust JSON parsing for LLM responses
- `app/services/graph_service.py` - Added `get_all_tests_for_prd()`, updated PRD counts to exclude test artifacts
- `app/api/routes.py` - Added `GET /prds/{prd_id}/tests` endpoint

### Frontend
- `src/services/api.ts` - Added `getTestsForPrd()` function
- `src/components/TestsPanel.tsx` - Loads existing tests on mount, fixed coverage field names

## Graph Structure

```
PRD
├── Requirements (chunk_count) - shown in Requirements tab
│   ├── feature (4)
│   ├── requirement (3)
│   ├── stakeholder (1)
│   └── metric (1)
└── Tests (test_count) - shown in Test Cases tab
    ├── unit_test_spec (6)
    ├── integration_test_spec (7)
    ├── acceptance_criteria (4)
    └── test_case (2)
        └── [TESTS]→ Requirements they cover
```

## Reference: Plan File

Full implementation plan is at: `/root/.claude/plans/structured-swinging-galaxy.md`
