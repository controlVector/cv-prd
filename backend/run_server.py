#!/usr/bin/env python3
"""
Standalone server entry point for cvPRD backend
This is used by PyInstaller to create a bundled executable
"""

import os
import sys
import uvicorn
from pathlib import Path

# Add the app directory to the path for development
sys.path.insert(0, str(Path(__file__).parent))

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
    host = os.environ.get('HOST', '0.0.0.0')
    port = int(os.environ.get('PORT', 8000))

    # Configure logging
    log_config = uvicorn.config.LOGGING_CONFIG
    log_config["formatters"]["default"]["fmt"] = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"

    print(f"Starting cvPRD Backend Server on {host}:{port}")
    print(f"Database: {os.environ.get('DATABASE_URL', 'Not configured')}")
    print(f"Qdrant: {os.environ.get('QDRANT_HOST', 'localhost')}:{os.environ.get('QDRANT_PORT', '6333')}")

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
