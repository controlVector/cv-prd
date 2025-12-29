# Feature Request System Design

## Overview

A "Progressive PRD" workflow where feature requests submitted via cv-hub evolve into full PRDs within cv-prd.

## Workflow

```
cv-hub (Submit)          cv-prd (Process & Evolve)
      │                           │
      │  POST /api/v1/requests    │
      │ ─────────────────────────>│
      │                           │
      │                    ┌──────┴──────┐
      │                    │   INTAKE    │
      │                    │ - AI enrich │
      │                    │ - Dedup     │
      │                    │ - Skeleton  │
      │                    └──────┬──────┘
      │                           │
      │                    ┌──────┴──────┐
      │                    │   TRIAGE    │
      │                    │ - Review    │
      │                    │ - Accept    │
      │                    │ - Reject    │
      │                    └──────┬──────┘
      │                           │
      │                    ┌──────┴──────┐
      │                    │  ELABORATE  │
      │                    │ - Add detail│
      │                    │ - Link deps │
      │                    └──────┬──────┘
      │                           │
      │  GET /api/v1/requests/:id │
      │ <─────────────────────────│
      │    (status updates)       │
```

## Data Model

### FeatureRequest (PostgreSQL)

```python
class FeatureRequestModel(Base):
    __tablename__ = "feature_requests"

    # Identity
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    external_id = Column(String(64), unique=True)  # For cv-hub reference

    # Requester info (from cv-hub)
    requester_id = Column(String(36), nullable=False)  # cv-hub user ID
    requester_name = Column(String(255))
    requester_email = Column(String(255))
    source = Column(String(50), default="cv-hub")  # cv-hub, api, internal

    # Request content
    title = Column(String(255), nullable=False)
    problem_statement = Column(Text, nullable=False)  # What problem are you solving?
    proposed_solution = Column(Text)  # Optional: user's idea
    success_criteria = Column(Text)  # What would success look like?
    additional_context = Column(Text)  # Any other details

    # Classification (AI-enriched)
    request_type = Column(String(50))  # feature, enhancement, bug, change
    category = Column(String(100))  # auto-categorized
    tags = Column(JSON, default=list)
    priority_suggestion = Column(String(20))  # AI-suggested priority

    # Lifecycle
    status = Column(String(30), default="raw")
    # Statuses: raw, under_review, accepted, rejected, merged, elaborating, ready, in_progress, shipped

    # Triage
    reviewer_id = Column(String(36))
    reviewer_notes = Column(Text)
    rejection_reason = Column(Text)

    # AI Analysis
    ai_summary = Column(Text)  # AI-generated summary
    similar_requests = Column(JSON, default=list)  # IDs of similar requests
    related_prds = Column(JSON, default=list)  # IDs of related PRDs
    related_chunks = Column(JSON, default=list)  # IDs of related requirements
    prd_skeleton = Column(JSON)  # AI-generated PRD skeleton

    # Evolution to PRD
    prd_id = Column(String(36), ForeignKey("prds.id"))  # Links to PRD when elaborated

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    triaged_at = Column(DateTime)
    accepted_at = Column(DateTime)
    shipped_at = Column(DateTime)
```

### Graph Relationships (FalkorDB)

```cypher
// Node: FeatureRequest
CREATE (r:FeatureRequest {
  id: "...",
  title: "...",
  status: "raw",
  priority: "medium"
})

// Relationships
(r:FeatureRequest)-[:SIMILAR_TO {score: 0.85}]->(r2:FeatureRequest)
(r:FeatureRequest)-[:RELATED_TO {score: 0.72}]->(c:Chunk)
(r:FeatureRequest)-[:EVOLVES_INTO]->(p:PRD)
(r:FeatureRequest)-[:SUBMITTED_BY {source: "cv-hub"}]->(u:User)
(r:FeatureRequest)-[:REVIEWED_BY]->(reviewer:User)
```

### Vector Storage (Qdrant)

Collection: `feature_requests`
- Vector: embedding of `title + problem_statement + proposed_solution`
- Payload: `{id, status, request_type, category, requester_id, created_at}`

## API Endpoints

### Submit Request (cv-hub calls this)

```
POST /api/v1/requests
Authorization: Bearer <cv-hub-service-token>

{
  "external_id": "cvhub-req-abc123",
  "requester_id": "user-uuid",
  "requester_name": "John Doe",
  "requester_email": "john@example.com",
  "title": "Add dark mode support",
  "problem_statement": "Users complain about eye strain when using the app at night...",
  "proposed_solution": "Add a toggle in settings that switches to dark colors...",
  "success_criteria": "Users can switch between light/dark mode, preference persists...",
  "additional_context": "Competitor apps X and Y have this feature..."
}

Response 201:
{
  "id": "req-uuid",
  "external_id": "cvhub-req-abc123",
  "status": "raw",
  "ai_analysis": {
    "summary": "Request to add theme switching capability...",
    "request_type": "feature",
    "category": "UI/UX",
    "priority_suggestion": "medium",
    "similar_requests": [...],
    "related_prds": [...],
    "prd_skeleton": {...}
  }
}
```

### List Requests (for triage UI)

```
GET /api/v1/requests?status=raw&limit=20

Response 200:
{
  "requests": [...],
  "total": 42,
  "page": 1
}
```

### Get Request Details

```
GET /api/v1/requests/{id}

Response 200:
{
  "id": "...",
  "title": "...",
  "status": "under_review",
  "ai_analysis": {...},
  "timeline": [
    {"event": "created", "at": "...", "by": "requester"},
    {"event": "ai_analyzed", "at": "..."},
    {"event": "review_started", "at": "...", "by": "reviewer"}
  ]
}
```

### Triage Actions

```
POST /api/v1/requests/{id}/accept
{
  "reviewer_notes": "Good idea, aligns with Q2 roadmap",
  "priority": "high"
}

POST /api/v1/requests/{id}/reject
{
  "rejection_reason": "Out of scope for current product direction"
}

POST /api/v1/requests/{id}/merge
{
  "merge_into_request_id": "other-req-uuid"
}

POST /api/v1/requests/{id}/request-info
{
  "questions": ["Can you clarify the expected behavior when...?"]
}
```

### Elaborate (convert to PRD)

```
POST /api/v1/requests/{id}/elaborate
{
  "use_skeleton": true,
  "additional_sections": ["Technical Requirements", "Risks"]
}

Response 200:
{
  "prd_id": "new-prd-uuid",
  "request_status": "elaborating"
}
```

### Check Status (cv-hub polls or webhook)

```
GET /api/v1/requests/by-external-id/{external_id}

Response 200:
{
  "id": "...",
  "external_id": "cvhub-req-abc123",
  "status": "accepted",
  "prd_id": null,
  "updated_at": "..."
}
```

## AI Enrichment Pipeline

When a request is submitted:

1. **Generate Embedding** - Vectorize the request
2. **Find Similar** - Search Qdrant for similar requests (dedup)
3. **Find Related** - Search for related PRD chunks
4. **Categorize** - LLM classifies request type, category
5. **Summarize** - LLM generates concise summary
6. **Generate Skeleton** - LLM creates PRD skeleton structure
7. **Store** - Save to PostgreSQL, Qdrant, FalkorDB

## Status Flow

```
         ┌─────────────────────────────────────────────────────────────┐
         │                                                              │
         ▼                                                              │
       [RAW] ──────► [UNDER_REVIEW] ──────► [ACCEPTED] ──► [ELABORATING]
         │                │                     │               │
         │                │                     │               ▼
         │                ▼                     │           [READY]
         │           [REJECTED]                 │               │
         │                                      │               ▼
         │                                      │         [IN_PROGRESS]
         │                                      │               │
         │                                      ▼               ▼
         └────────────────────────────────► [MERGED]       [SHIPPED]
```

## cv-hub Integration

### Submit Request (cv-hub → cv-prd)

```typescript
// cv-hub: services/feature-request.service.ts
export async function submitFeatureRequest(
  userId: string,
  request: FeatureRequestInput
): Promise<FeatureRequestResult> {
  const response = await fetch(`${CV_PRD_API_URL}/api/v1/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CV_PRD_SERVICE_TOKEN}`,
    },
    body: JSON.stringify({
      external_id: `cvhub-${userId}-${Date.now()}`,
      requester_id: userId,
      ...request,
    }),
  });
  return response.json();
}
```

### Poll Status (cv-hub ← cv-prd)

```typescript
// cv-hub: services/feature-request.service.ts
export async function getRequestStatus(externalId: string): Promise<RequestStatus> {
  const response = await fetch(
    `${CV_PRD_API_URL}/api/v1/requests/by-external-id/${externalId}`,
    { headers: { 'Authorization': `Bearer ${CV_PRD_SERVICE_TOKEN}` } }
  );
  return response.json();
}
```

## Implementation Phases

### Phase 1: cv-prd Backend
1. Add FeatureRequestModel to database
2. Add Qdrant collection for requests
3. Add FalkorDB node type
4. Implement POST /api/v1/requests with AI enrichment
5. Implement GET endpoints

### Phase 2: cv-prd Triage
1. Implement triage action endpoints
2. Add reviewer assignment logic
3. Implement elaborate → PRD conversion

### Phase 3: cv-hub Integration
1. Add feature request submission form
2. Add "My Requests" tracking page
3. Implement API integration with cv-prd
4. Add status notifications
