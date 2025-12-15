# CV-PRD Rust Backend Rewrite Plan

This document outlines the plan for rewriting the Python/FastAPI backend in Rust. This would provide:
- **Single binary distribution** - No Python runtime needed
- **Better performance** - Rust's zero-cost abstractions
- **Smaller bundle size** - ~50MB vs ~500MB+ with PyInstaller
- **Memory safety** - Rust's ownership model prevents memory bugs
- **Native Tauri integration** - Direct IPC instead of HTTP

## Current Architecture (Python)

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
└─────────────────────────────────────────────────────────────┘
                              │ HTTP/REST
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI/Python)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Routes    │  │  Services   │  │  ML/Embeddings      │  │
│  │  /api/prd   │  │  PRDService │  │  sentence-transform │  │
│  │  /api/graph │  │  GraphSvc   │  │  torch              │  │
│  │  /api/search│  │  SearchSvc  │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
    ┌─────────┐      ┌───────────┐       ┌───────────┐
    │ SQLite/ │      │ FalkorDB  │       │  Qdrant   │
    │ Postgres│      │  (Graph)  │       │ (Vector)  │
    └─────────┘      └───────────┘       └───────────┘
```

## Target Architecture (Rust)

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
└─────────────────────────────────────────────────────────────┘
                              │ Tauri IPC (faster than HTTP)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Tauri App (Rust)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  Commands   │  │  Services   │  │   Embeddings        │  │
│  │  prd::*     │  │  PrdService │  │  candle/ort         │  │
│  │  graph::*   │  │  GraphSvc   │  │  (local inference)  │  │
│  │  search::*  │  │  SearchSvc  │  │                     │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
    ┌─────────┐      ┌───────────┐       ┌───────────┐
    │ SQLite  │      │ FalkorDB  │       │  Qdrant   │
    │ (rusqlite)     │  (redis)  │       │ (client)  │
    └─────────┘      └───────────┘       └───────────┘
```

## Recommended Rust Crates

### Web/API Layer
| Python | Rust Equivalent | Notes |
|--------|----------------|-------|
| FastAPI | **axum** | Tokio-based, great ergonomics |
| Pydantic | **serde** | Serialization/deserialization |
| uvicorn | Built into axum | Async by default |

### Database
| Python | Rust Equivalent | Notes |
|--------|----------------|-------|
| SQLAlchemy | **sqlx** | Compile-time checked queries |
| Alembic | **sqlx migrate** | Built-in migrations |
| asyncpg | **sqlx** (with postgres feature) | Async PostgreSQL |

### ML/Embeddings
| Python | Rust Equivalent | Notes |
|--------|----------------|-------|
| sentence-transformers | **candle** or **ort** | Local inference |
| torch | **candle** (Hugging Face) | Pure Rust ML framework |
| transformers | **candle-transformers** | Model implementations |

### Vector/Graph
| Python | Rust Equivalent | Notes |
|--------|----------------|-------|
| qdrant-client | **qdrant-client** | Official Rust client |
| redis (FalkorDB) | **redis** crate | Works with FalkorDB |

### Utilities
| Python | Rust Equivalent | Notes |
|--------|----------------|-------|
| httpx | **reqwest** | HTTP client |
| pydantic | **serde** + **validator** | Validation |
| python-multipart | **axum::extract::Multipart** | File uploads |

## Migration Strategy

### Phase 1: Core API (Week 1-2)
Rewrite the basic CRUD operations:

```rust
// src-tauri/src/commands/prd.rs
use tauri::State;
use crate::services::PrdService;

#[tauri::command]
pub async fn list_prds(
    service: State<'_, PrdService>
) -> Result<Vec<Prd>, String> {
    service.list().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_prd(
    service: State<'_, PrdService>,
    prd: CreatePrdRequest
) -> Result<Prd, String> {
    service.create(prd).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_prd(
    service: State<'_, PrdService>,
    id: String
) -> Result<Prd, String> {
    service.get(&id).await.map_err(|e| e.to_string())
}
```

### Phase 2: Database Layer (Week 2-3)
Implement with sqlx:

```rust
// src-tauri/src/db/mod.rs
use sqlx::{Pool, Sqlite};

pub struct Database {
    pool: Pool<Sqlite>,
}

impl Database {
    pub async fn new(url: &str) -> Result<Self, sqlx::Error> {
        let pool = Pool::connect(url).await?;
        sqlx::migrate!("./migrations").run(&pool).await?;
        Ok(Self { pool })
    }
}

// src-tauri/src/models/prd.rs
#[derive(sqlx::FromRow, serde::Serialize)]
pub struct Prd {
    pub id: String,
    pub name: String,
    pub content: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
```

### Phase 3: Embeddings (Week 3-4)
Use candle for local inference:

```rust
// src-tauri/src/services/embeddings.rs
use candle_core::{Device, Tensor};
use candle_transformers::models::bert::BertModel;

pub struct EmbeddingService {
    model: BertModel,
    tokenizer: tokenizers::Tokenizer,
    device: Device,
}

impl EmbeddingService {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        // Load MiniLM model
        let device = Device::Cpu; // or Device::cuda_if_available()?
        // ... model loading
        Ok(Self { model, tokenizer, device })
    }

    pub fn embed(&self, text: &str) -> Result<Vec<f32>, Box<dyn std::error::Error>> {
        let tokens = self.tokenizer.encode(text, true)?;
        let input_ids = Tensor::new(tokens.get_ids(), &self.device)?;
        let embeddings = self.model.forward(&input_ids)?;
        // Mean pooling
        Ok(embeddings.mean(1)?.to_vec1()?)
    }
}
```

### Phase 4: Vector Search (Week 4-5)
Integrate with Qdrant:

```rust
// src-tauri/src/services/search.rs
use qdrant_client::prelude::*;

pub struct SearchService {
    client: QdrantClient,
    embeddings: EmbeddingService,
}

impl SearchService {
    pub async fn search(
        &self,
        query: &str,
        limit: usize
    ) -> Result<Vec<SearchResult>, Box<dyn std::error::Error>> {
        let embedding = self.embeddings.embed(query)?;

        let results = self.client
            .search_points(&SearchPoints {
                collection_name: "prd_chunks".to_string(),
                vector: embedding,
                limit: limit as u64,
                with_payload: Some(true.into()),
                ..Default::default()
            })
            .await?;

        Ok(results.result.into_iter().map(|p| SearchResult {
            id: p.id.to_string(),
            score: p.score,
            // ...
        }).collect())
    }
}
```

### Phase 5: Graph Operations (Week 5-6)
FalkorDB via Redis protocol:

```rust
// src-tauri/src/services/graph.rs
use redis::AsyncCommands;

pub struct GraphService {
    client: redis::Client,
}

impl GraphService {
    pub async fn query(&self, cypher: &str) -> Result<Vec<Node>, Box<dyn std::error::Error>> {
        let mut conn = self.client.get_async_connection().await?;
        let result: redis::Value = redis::cmd("GRAPH.QUERY")
            .arg("prd_graph")
            .arg(cypher)
            .query_async(&mut conn)
            .await?;
        // Parse FalkorDB response
        Ok(parse_graph_result(result)?)
    }
}
```

## File Structure

```
src-tauri/
├── Cargo.toml
├── src/
│   ├── main.rs              # Entry point
│   ├── lib.rs               # Tauri setup & commands registration
│   ├── commands/            # Tauri command handlers
│   │   ├── mod.rs
│   │   ├── prd.rs           # PRD CRUD commands
│   │   ├── graph.rs         # Graph query commands
│   │   └── search.rs        # Search commands
│   ├── services/            # Business logic
│   │   ├── mod.rs
│   │   ├── prd.rs           # PRD service
│   │   ├── embeddings.rs    # ML embeddings
│   │   ├── search.rs        # Vector search
│   │   └── graph.rs         # Graph operations
│   ├── db/                  # Database layer
│   │   ├── mod.rs
│   │   └── migrations/      # SQL migrations
│   ├── models/              # Data structures
│   │   ├── mod.rs
│   │   ├── prd.rs
│   │   └── graph.rs
│   └── error.rs             # Error types
└── migrations/              # SQLx migrations
    └── 001_initial.sql
```

## Frontend Changes

Update API calls to use Tauri IPC instead of HTTP:

```typescript
// frontend/src/api.ts
import { invoke } from '@tauri-apps/api/tauri';

// Before (HTTP)
export async function listPrds(): Promise<Prd[]> {
  const response = await fetch('http://localhost:8000/api/prds');
  return response.json();
}

// After (Tauri IPC)
export async function listPrds(): Promise<Prd[]> {
  return invoke('list_prds');
}

// Hybrid approach (works in both browser and Tauri)
export async function listPrds(): Promise<Prd[]> {
  if (window.__TAURI__) {
    return invoke('list_prds');
  }
  const response = await fetch('http://localhost:8000/api/prds');
  return response.json();
}
```

## Testing Strategy

```rust
// src-tauri/src/services/prd.rs
#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn setup_test_db() -> Database {
        let pool = SqlitePoolOptions::new()
            .connect(":memory:")
            .await
            .unwrap();
        sqlx::migrate!().run(&pool).await.unwrap();
        Database { pool }
    }

    #[tokio::test]
    async fn test_create_prd() {
        let db = setup_test_db().await;
        let service = PrdService::new(db);

        let prd = service.create(CreatePrdRequest {
            name: "Test PRD".to_string(),
            content: "Content".to_string(),
        }).await.unwrap();

        assert_eq!(prd.name, "Test PRD");
    }
}
```

## Performance Comparison

| Metric | Python (current) | Rust (expected) |
|--------|-----------------|-----------------|
| Startup time | ~3-5s | <500ms |
| Memory usage | ~200-500MB | ~50-100MB |
| Bundle size | ~500MB-2GB | ~50-100MB |
| API latency | ~10-50ms | ~1-5ms |
| Embedding (MiniLM) | ~50ms | ~10-20ms |

## Risks and Mitigations

### Risk: ML model compatibility
- **Mitigation**: candle supports most transformer models; fallback to ONNX Runtime

### Risk: Learning curve
- **Mitigation**: Rust has excellent documentation; start with simple endpoints

### Risk: FalkorDB compatibility
- **Mitigation**: Uses standard Redis protocol; well-supported by redis crate

### Risk: Development time
- **Mitigation**: Incremental migration; keep Python backend as fallback

## Recommended Learning Resources

1. **Rust Basics**
   - [The Rust Book](https://doc.rust-lang.org/book/)
   - [Rust by Example](https://doc.rust-lang.org/rust-by-example/)

2. **Async Rust**
   - [Tokio Tutorial](https://tokio.rs/tokio/tutorial)
   - [Async Book](https://rust-lang.github.io/async-book/)

3. **Web Development**
   - [Axum Examples](https://github.com/tokio-rs/axum/tree/main/examples)
   - [Zero to Production in Rust](https://www.zero2prod.com/)

4. **ML in Rust**
   - [Candle Documentation](https://github.com/huggingface/candle)
   - [ONNX Runtime Rust](https://github.com/pykeio/ort)

5. **Tauri**
   - [Tauri Guides](https://tauri.app/v1/guides/)
   - [Tauri API Reference](https://docs.rs/tauri/latest/tauri/)

## Timeline Estimate

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Phase 1: Core API | 1-2 weeks | Basic CRUD working |
| Phase 2: Database | 1 week | SQLite/Postgres support |
| Phase 3: Embeddings | 1-2 weeks | Local inference working |
| Phase 4: Vector Search | 1 week | Qdrant integration |
| Phase 5: Graph | 1 week | FalkorDB queries |
| Testing & Polish | 1-2 weeks | Production ready |
| **Total** | **6-10 weeks** | Full Rust backend |

## Conclusion

The Rust rewrite is a significant undertaking but offers substantial benefits:
- **10x smaller** bundle size
- **10x faster** startup
- **Single binary** distribution
- **Native Tauri** integration

The migration can be done incrementally, keeping the Python backend as a fallback until the Rust version is feature-complete.
