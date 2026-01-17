#!/usr/bin/env python3
"""
Standalone server entry point for cvPRD backend
This is used by PyInstaller/Nuitka to create a bundled executable
"""

import os
import sys
import uvicorn
from pathlib import Path


def is_bundled() -> bool:
    """Check if we're running from a bundled executable (PyInstaller or Nuitka)."""
    # PyInstaller sets sys.frozen
    if getattr(sys, 'frozen', False):
        return True
    # Nuitka sets __compiled__
    if "__compiled__" in dir():
        return True
    # Check for common bundled executable indicators
    if hasattr(sys, '_MEIPASS'):  # PyInstaller temp directory
        return True
    return False


def setup_desktop_mode():
    """Configure environment for desktop/bundled mode."""
    # Enable desktop mode - uses embedded services (local Qdrant, SQLite)
    os.environ['DESKTOP_MODE'] = 'true'

    # Bind to localhost only for security
    os.environ.setdefault('HOST', '127.0.0.1')

    # Use SQLite instead of PostgreSQL (override .env file)
    data_dir = _get_desktop_data_dir()
    os.environ['DATABASE_URL'] = f"sqlite:///{os.path.join(data_dir, 'cvprd.db')}"

    # Use local Qdrant storage
    os.environ['QDRANT_LOCAL_PATH'] = os.path.join(data_dir, 'qdrant')

    # Disable services that require external servers on Windows
    if os.name == 'nt':
        # FalkorDB doesn't support Windows natively
        os.environ['FALKORDB_ENABLED'] = 'false'

    print("Desktop mode enabled - using embedded services")
    print(f"Data directory: {data_dir}")


def _get_desktop_data_dir() -> str:
    """Get the application data directory for desktop mode."""
    if os.name == 'nt':  # Windows
        base = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
        data_dir = os.path.join(base, 'cvprd', 'data')
    elif hasattr(os, 'uname') and os.uname().sysname == 'Darwin':  # macOS
        data_dir = os.path.expanduser('~/Library/Application Support/cvprd/data')
    else:  # Linux
        data_dir = os.path.expanduser('~/.local/share/cvprd/data')
    os.makedirs(data_dir, exist_ok=True)
    return data_dir


# Add the app directory to the path for development
sys.path.insert(0, str(Path(__file__).parent))

# Detect bundled mode and configure accordingly
# IMPORTANT: Must set env vars BEFORE importing app modules
if is_bundled() or os.environ.get('DESKTOP_MODE', '').lower() == 'true':
    setup_desktop_mode()

# Explicitly import ALL app modules so PyInstaller includes them
# This forces PyInstaller to trace and bundle these modules
import app
import app.main
import app.api
import app.api.routes
import app.core
import app.core.config
import app.models
import app.models.db_models
import app.models.prd_models
import app.services
import app.services.chunking_service
import app.services.database_service
import app.services.document_parser
import app.services.embedding_service
import app.services.export_service
import app.services.graph_service
import app.services.openrouter_service
import app.services.orchestrator
import app.services.prd_optimizer_service
import app.services.vector_service

# Import app directly so PyInstaller bundles it
from app.main import app as fastapi_app

def main():
    """Main entry point for the standalone server"""

    # Get configuration from environment variables
    host = os.environ.get('HOST', '127.0.0.1' if is_bundled() else '0.0.0.0')
    port = int(os.environ.get('PORT', 8000))

    # Configure logging
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["default"]["fmt"] = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    mode = "DESKTOP" if os.environ.get('DESKTOP_MODE', '').lower() == 'true' else "SERVER"
    print(f"Starting cvPRD Backend ({mode} mode) on {host}:{port}")

    from app.core.config import settings
    print(f"Database: {settings.DATABASE_URL}")
    if settings.QDRANT_LOCAL_PATH:
        print(f"Qdrant: LOCAL MODE at {settings.QDRANT_LOCAL_PATH}")
    else:
        print(f"Qdrant: {settings.QDRANT_HOST}:{settings.QDRANT_PORT}")
    print(f"FalkorDB: {'enabled' if settings.FALKORDB_ENABLED else 'disabled'}")

    # Start the server - use app object directly for PyInstaller compatibility
    uvicorn.run(
        fastapi_app,
        host=host,
        port=port,
        log_config=log_config,
        access_log=True
    )

if __name__ == "__main__":
    main()
