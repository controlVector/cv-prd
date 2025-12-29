#!/usr/bin/env python3
"""
Run script for cvPRD API server.

Uses configuration from app.core.config for host and port settings.
Supports environment variable overrides:
- HOST: Server host (default: 0.0.0.0)
- PORT: Server port (default: 8000)
"""

import uvicorn
from app.core.config import settings


def main():
    """Run the cvPRD API server."""
    print(f"Starting cvPRD API on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )


if __name__ == "__main__":
    main()
