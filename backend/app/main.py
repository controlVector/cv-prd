"""
cvPRD FastAPI Application
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
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


# Exception handler for validation errors - log and return 500 with details
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logging.error(f"Validation error for {request.url}: {exc.errors()}")
    logging.error(f"Request body: {exc.body}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Validation error: {exc.errors()}"}
    )


# Catch-all exception handler to log ALL unhandled exceptions
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    logging.error(f"Unhandled exception for {request.url}: {type(exc).__name__}: {exc}")
    logging.error(f"Traceback:\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {str(exc)}"}
    )


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to cvPRD API",
        "docs": "/docs",
        "version": "0.1.0",
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "cvPRD"}


@app.on_event("startup")
async def startup_event():
    """Startup event handler"""
    logging.info("cvPRD API starting up...")
    logging.info("API documentation available at /docs")


@app.on_event("shutdown")
async def shutdown_event():
    """Shutdown event handler"""
    logging.info("cvPRD API shutting down...")
