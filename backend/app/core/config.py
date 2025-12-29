from pydantic_settings import BaseSettings
from typing import Optional
import os


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "cvPRD"
    DEBUG: bool = True

    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Database (supports both PostgreSQL and SQLite)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql://cvprd:cvprd_dev@localhost:5433/cvprd")

    # FalkorDB (Redis-based graph database - replaces Neo4j)
    # Compatible with cv-git's graph infrastructure
    FALKORDB_ENABLED: bool = os.getenv("FALKORDB_ENABLED", "true").lower() == "true"
    FALKORDB_URL: str = os.getenv("FALKORDB_URL", "redis://localhost:6379")
    FALKORDB_DATABASE: str = os.getenv("FALKORDB_DATABASE", "cvprd")

    # Legacy Neo4j settings (deprecated, kept for backwards compatibility)
    # These are no longer used - FalkorDB is now the default graph database
    NEO4J_ENABLED: bool = False  # Deprecated - use FALKORDB_ENABLED
    NEO4J_URI: str = "bolt://localhost:7687"  # Deprecated
    NEO4J_USER: str = "neo4j"  # Deprecated
    NEO4J_PASSWORD: str = "cvprd_dev"  # Deprecated

    # Qdrant
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    QDRANT_COLLECTION: str = "prd_chunks"

    # Redis for caching/queues (separate from FalkorDB)
    REDIS_ENABLED: bool = os.getenv("REDIS_ENABLED", "true").lower() == "true"
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6380")

    # Embeddings - using OpenRouter's text-embedding-3-small (1536 dimensions)
    EMBEDDING_MODEL: str = "openai/text-embedding-3-small"
    EMBEDDING_DIMENSION: int = 1536

    # OpenRouter LLM API
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_API_URL: str = "https://openrouter.ai/api/v1/chat/completions"
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "anthropic/claude-3.5-sonnet")

    # AI Generation Settings (user-configurable)
    AI_TEMPERATURE: float = float(os.getenv("AI_TEMPERATURE", "0.7"))
    AI_MAX_TOKENS: int = int(os.getenv("AI_MAX_TOKENS", "4000"))
    DEFAULT_TEST_FRAMEWORK: str = os.getenv("DEFAULT_TEST_FRAMEWORK", "pytest")

    # Usage Tracking
    USAGE_TRACKING_ENABLED: bool = os.getenv("USAGE_TRACKING_ENABLED", "true").lower() == "true"

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
