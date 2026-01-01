# API Specification

## Base URL
```
Development: http://localhost:8000/api/v1
Production: https://api.cvprd.com/api/v1
```

## Authentication
All endpoints require JWT token in header:
```
Authorization: Bearer <token>
```

---

## PRD Endpoints

### Create PRD
```http
POST /prds
Content-Type: application/json

{
  "name": "User Authentication System",
  "description": "Complete auth system with OAuth2",
  "content": {
    "sections": [
      {
        "title": "Overview",
        "content": "..."
      }
    ]
  },
  "tags": ["auth", "backend"]
}

Response: 201 Created
{
  "id": "uuid",
  "name": "...",
  "status": "draft",
  "created_at": "2025-01-15T10:30:00Z",
  "chunks_created": 15
}
```

### Get PRD
```http
GET /prds/{prd_id}

Response: 200 OK
{
  "id": "uuid",
  "name": "...",
  "content": {...},
  "chunks": [
    {
      "id": "chunk_uuid",
      "type": "requirement",
      "text": "...",
      "metadata": {...}
    }
  ],
  "stats": {
    "total_chunks": 15,
    "requirements": 8,
    "features": 4,
    "constraints": 3
  }
}
```

### Update PRD
```http
PATCH /prds/{prd_id}

{
  "name": "Updated name",
  "content": {...}
}

Response: 200 OK
```

### List PRDs
```http
GET /prds?page=1&limit=20&status=draft&tags=auth

Response: 200 OK
{
  "items": [...],
  "total": 45,
  "page": 1,
  "pages": 3
}
```

---

## Chunk Endpoints

### Get Chunk
```http
GET /chunks/{chunk_id}

Response: 200 OK
{
  "id": "uuid",
  "prd_id": "uuid",
  "type": "requirement",
  "text": "The system shall authenticate users via OAuth2",
  "context": "Project: Auth System, Feature: User Login",
  "metadata": {
    "priority": "high",
    "status": "approved",
    "tags": ["auth", "security"]
  },
  "relationships": {
    "depends_on": ["chunk_id_1", "chunk_id_2"],
    "referenced_by": ["chunk_id_3"]
  },
  "embedding_status": "completed"
}
```

### Update Chunk
```http
PATCH /chunks/{chunk_id}

{
  "text": "Updated requirement text",
  "metadata": {
    "priority": "critical"
  }
}

Response: 200 OK
{
  "id": "uuid",
  "updated_at": "2025-01-15T11:00:00Z",
  "reprocessing": true  // Vector and relationships being updated
}
```

### Get Chunk Context
```http
GET /chunks/{chunk_id}/context?strategy=expanded&max_tokens=4000

Response: 200 OK
{
  "primary": {...},
  "dependencies": [...],
  "related": [...],
  "metadata": {
    "total_tokens": 3847,
    "strategy": "expanded",
    "depth": 2
  }
}
```

---

## Search Endpoints

### Semantic Search
```http
POST /search/semantic

{
  "query": "How does user authentication work?",
  "prd_ids": ["uuid1", "uuid2"],  // Optional: limit to specific PRDs
  "filters": {
    "chunk_type": ["requirement", "feature"],
    "priority": ["high", "critical"],
    "tags": ["auth"]
  },
  "limit": 10,
  "include_context": true
}

Response: 200 OK
{
  "results": [
    {
      "chunk_id": "uuid",
      "score": 0.89,
      "chunk": {...},
      "context": {...}  // If include_context=true
    }
  ],
  "total": 156,
  "search_time_ms": 45
}
```

### Keyword Search
```http
POST /search/keyword

{
  "query": "OAuth2 AND (login OR authentication)",
  "prd_ids": ["uuid1"],
  "limit": 20
}

Response: 200 OK
```

### Hybrid Search
```http
POST /search/hybrid

{
  "query": "authentication requirements",
  "semantic_weight": 0.7,
  "keyword_weight": 0.3,
  "filters": {...},
  "limit": 10
}

Response: 200 OK
```

---

## Graph Endpoints

### Get Relationships
```http
GET /graph/chunks/{chunk_id}/relationships?depth=2&types=DEPENDS_ON,REFERENCES

Response: 200 OK
{
  "chunk_id": "uuid",
  "relationships": [
    {
      "type": "DEPENDS_ON",
      "target_chunk_id": "uuid2",
      "target_chunk": {...},
      "strength": 0.8,
      "created_at": "2025-01-15T10:30:00Z"
    }
  ],
  "graph": {
    "nodes": [...],
    "edges": [...]
  }
}
```

### Get Dependency Tree
```http
GET /graph/chunks/{chunk_id}/dependencies?direction=upstream

Response: 200 OK
{
  "root": {...},
  "dependencies": {
    "direct": [...],
    "transitive": [...],
    "circular": []  // Warning if circular dependencies detected
  }
}
```

### Analyze Impact
```http
POST /graph/analyze/impact

{
  "chunk_id": "uuid",
  "change_type": "delete"  // or "modify"
}

Response: 200 OK
{
  "affected_chunks": [
    {
      "chunk_id": "uuid",
      "impact_type": "direct_dependency",
      "severity": "high"
    }
  ],
  "total_affected": 12,
  "warning": "This change affects 3 high-priority requirements"
}
```

---

## AI Agent Endpoints

### Generate Code
```http
POST /ai/generate-code

{
  "chunk_ids": ["uuid1", "uuid2"],
  "language": "python",
  "framework": "fastapi",
  "additional_context": "Use SQLAlchemy for database",
  "max_tokens": 2000
}

Response: 200 OK
{
  "code": "...",
  "explanation": "...",
  "requirements_covered": ["uuid1", "uuid2"],
  "tokens_used": 1847,
  "model": "gpt-4"
}
```

### Ask Question
```http
POST /ai/question

{
  "question": "What are the security requirements for user authentication?",
  "prd_ids": ["uuid1"],
  "max_results": 5
}

Response: 200 OK
{
  "answer": "Based on the PRD, the security requirements are...",
  "sources": [
    {
      "chunk_id": "uuid",
      "relevance": 0.92,
      "excerpt": "..."
    }
  ],
  "confidence": 0.87
}
```

### Validate Consistency
```http
POST /ai/validate

{
  "prd_id": "uuid"
}

Response: 200 OK
{
  "issues": [
    {
      "type": "contradiction",
      "severity": "high",
      "chunk_ids": ["uuid1", "uuid2"],
      "description": "Requirement R1 contradicts R2 regarding authentication method"
    },
    {
      "type": "missing_dependency",
      "severity": "medium",
      "chunk_id": "uuid3",
      "description": "Feature F1 requires database setup but no database requirement found"
    }
  ],
  "score": 78  // Overall consistency score 0-100
}
```

---

## Processing Endpoints

### Reprocess PRD
```http
POST /prds/{prd_id}/reprocess

{
  "operations": ["chunk", "embed", "graph"]  // Which operations to run
}

Response: 202 Accepted
{
  "job_id": "uuid",
  "status": "queued",
  "estimated_time_seconds": 120
}
```

### Get Job Status
```http
GET /jobs/{job_id}

Response: 200 OK
{
  "job_id": "uuid",
  "status": "processing",  // queued, processing, completed, failed
  "progress": 0.45,
  "current_step": "embedding",
  "result": null  // Populated when completed
}
```

---

## Analytics Endpoints

### PRD Statistics
```http
GET /prds/{prd_id}/stats

Response: 200 OK
{
  "chunks": {
    "total": 45,
    "by_type": {
      "requirement": 20,
      "feature": 10,
      "constraint": 8,
      "stakeholder": 4,
      "metric": 3
    },
    "by_priority": {
      "critical": 5,
      "high": 15,
      "medium": 20,
      "low": 5
    }
  },
  "relationships": {
    "total": 78,
    "by_type": {
      "DEPENDS_ON": 34,
      "REFERENCES": 28,
      "PARENT_OF": 16
    }
  },
  "complexity": {
    "dependency_depth": 4,
    "interconnectedness": 0.67,
    "completeness": 0.82
  }
}
```

---

## Webhook Endpoints

### Register Webhook
```http
POST /webhooks

{
  "url": "https://yourapp.com/webhook",
  "events": ["chunk.updated", "prd.published"],
  "secret": "your_secret_key"
}

Response: 201 Created
{
  "id": "uuid",
  "url": "...",
  "events": [...],
  "created_at": "2025-01-15T10:30:00Z"
}
```

### Webhook Events
```json
// chunk.updated
{
  "event": "chunk.updated",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "chunk_id": "uuid",
    "prd_id": "uuid",
    "changes": ["text", "metadata"],
    "updated_by": "user_id"
  }
}

// prd.published
{
  "event": "prd.published",
  "timestamp": "2025-01-15T10:30:00Z",
  "data": {
    "prd_id": "uuid",
    "version": 2,
    "published_by": "user_id"
  }
}
```

---

## Error Responses

### Standard Error Format
```json
{
  "error": {
    "code": "CHUNK_NOT_FOUND",
    "message": "Chunk with id 'uuid' not found",
    "details": {...},
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_uuid"
  }
}
```

### Error Codes
- `400 BAD_REQUEST`: Invalid input
- `401 UNAUTHORIZED`: Missing/invalid auth token
- `403 FORBIDDEN`: Insufficient permissions
- `404 NOT_FOUND`: Resource not found
- `409 CONFLICT`: Resource conflict (e.g., version mismatch)
- `422 UNPROCESSABLE_ENTITY`: Validation failed
- `429 RATE_LIMIT_EXCEEDED`: Too many requests
- `500 INTERNAL_SERVER_ERROR`: Server error
- `503 SERVICE_UNAVAILABLE`: Service temporarily unavailable

---

## Rate Limits

```
Tier: Free
- 100 requests/minute per user
- 10 AI requests/hour per user

Tier: Pro
- 1000 requests/minute per user
- 100 AI requests/hour per user

Tier: Enterprise
- Unlimited
```

---

## Versioning

API versions are specified in the URL path:
```
/api/v1/prds
/api/v2/prds  // Future version
```

Breaking changes trigger new major version. Backwards-compatible changes are added to current version.
