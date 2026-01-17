from pydantic_settings import BaseSettings
from typing import Optional
import os


def _get_data_dir() -> str:
    """Get the application data directory for the current platform."""
    if os.name == 'nt':  # Windows
        base = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        return os.path.join(base, 'cvprd', 'data')
    elif hasattr(os, 'uname') and os.uname().sysname == 'Darwin':  # macOS
        return os.path.expanduser('~/Library/Application Support/cvprd/data')
    else:  # Linux
        return os.path.expanduser('~/.local/share/cvprd/data')


def _get_default_database_url() -> str:
    """Get default database URL based on mode."""
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")
    if os.getenv("DESKTOP_MODE", "").lower() == "true":
        data_dir = _get_data_dir()
        os.makedirs(data_dir, exist_ok=True)
        return f"sqlite:///{os.path.join(data_dir, 'cvprd.db')}"
    return "postgresql://cvprd:cvprd_dev@localhost:5433/cvprd"


class Settings(BaseSettings):
    # Application
    APP_NAME: str = "cvPRD"
    DEBUG: bool = True

    # Desktop Mode - when true, uses embedded/local services instead of remote servers
    DESKTOP_MODE: bool = os.getenv("DESKTOP_MODE", "false").lower() == "true"

    # Server
    HOST: str = os.getenv("HOST", "127.0.0.1" if os.getenv("DESKTOP_MODE", "").lower() == "true" else "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

    # Database (PostgreSQL for server mode, SQLite for desktop mode)
    DATABASE_URL: str = _get_default_database_url()

    # FalkorDB (Redis-based graph database)
    # In desktop mode on Windows, falls back to in-memory graph since FalkorDB doesn't support Windows
    FALKORDB_ENABLED: bool = os.getenv("FALKORDB_ENABLED", "false" if os.getenv("DESKTOP_MODE", "").lower() == "true" and os.name == 'nt' else "true").lower() == "true"
    FALKORDB_URL: str = os.getenv("FALKORDB_URL", "redis://localhost:6379")
    FALKORDB_DATABASE: str = os.getenv("FALKORDB_DATABASE", "cvprd")

    # Legacy Neo4j settings (deprecated, kept for backwards compatibility)
    NEO4J_ENABLED: bool = False  # Deprecated - use FALKORDB_ENABLED
    NEO4J_URI: str = "bolt://localhost:7687"  # Deprecated
    NEO4J_USER: str = "neo4j"  # Deprecated
    NEO4J_PASSWORD: str = "cvprd_dev"  # Deprecated

    # Qdrant - in desktop mode, uses local file storage instead of remote server
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    QDRANT_COLLECTION: str = "prd_chunks"
    QDRANT_LOCAL_PATH: Optional[str] = os.getenv("QDRANT_LOCAL_PATH", os.path.join(_get_data_dir(), "qdrant") if os.getenv("DESKTOP_MODE", "").lower() == "true" else None)

    # Redis for caching/queues (disabled in desktop mode)
    REDIS_ENABLED: bool = os.getenv("REDIS_ENABLED", "false" if os.getenv("DESKTOP_MODE", "").lower() == "true" else "true").lower() == "true"
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

    # Bug Reporting (cv-Hub integration)
    BUG_REPORTING_ENABLED: bool = os.getenv("BUG_REPORTING_ENABLED", "true").lower() == "true"
    CV_HUB_URL: str = os.getenv("CV_HUB_URL", "https://hub.controlvector.io")
    CV_PROJECT_ID: str = os.getenv("CV_PROJECT_ID", "")
    CV_PROJECT_NAME: str = os.getenv("CV_PROJECT_NAME", "cv-prd")
    CV_HUB_API_KEY: str = os.getenv("CV_HUB_API_KEY", "")
    CV_HUB_SECRET_KEY: str = os.getenv("CV_HUB_SECRET_KEY", "")

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
