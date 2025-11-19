#!/usr/bin/env python3
"""
Standalone server entry point for cvPRD backend
This is used by PyInstaller to create a bundled executable
"""

import os
import sys
import uvicorn
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

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

    # Start the server
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        log_config=log_config,
        access_log=True
    )

if __name__ == "__main__":
    main()
