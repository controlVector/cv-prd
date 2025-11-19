"""
cvPRD FastAPI Application
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

# Create FastAPI app
app = FastAPI(
    title="cvPRD API",
    description="AI-Powered Product Requirements Documentation System",
    version="0.1.0",
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],  # React dev servers
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(router, prefix="/api/v1", tags=["PRD"])


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to cvPRD API",
        "docs": "/docs",
        "version": "0.1.0",
    }


@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    logging.info("cvPRD API starting up...")
    logging.info("API documentation available at /docs")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    logging.info("cvPRD API shutting down...")
