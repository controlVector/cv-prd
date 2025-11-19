"""
API routes for cvPRD application
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.models.prd_models import PRD, PRDSection, Priority
from app.services.orchestrator import PRDOrchestrator
from app.services.prd_optimizer_service import PRDOptimizerService
from app.services.document_parser import DocumentParser, DocumentParserError
import uuid
import logging
import tempfile
import os

logger = logging.getLogger(__name__)

router = APIRouter()

# Initialize orchestrator (in production, use dependency injection)
orchestrator = PRDOrchestrator()

# Initialize optimizer service
prd_optimizer = PRDOptimizerService(
    embedding_service=orchestrator.embedding_service,
    vector_service=orchestrator.vector_service,
    graph_service=orchestrator.graph_service,
)


# Request/Response Models
class CreatePRDRequest(BaseModel):
    name: str
    description: Optional[str] = None
    sections: List[PRDSection]


class SearchRequest(BaseModel):
    query: str
    limit: int = 10
    prd_id: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None


class OptimizePRDRequest(BaseModel):
    prd_id: str
    prd_name: str
    optimization_goal: Optional[str] = "AI Paired Programming"


class PRDResponse(BaseModel):
    prd_id: str
    prd_name: str
    chunks_created: int
    relationships_created: int
    chunks: List[Dict[str, Any]]


# Routes
@router.post("/prds", response_model=PRDResponse)
async def create_prd(request: CreatePRDRequest):
    """
    Create a new PRD and process it through the complete workflow
    """
    try:
        # Create PRD object
        prd = PRD(
            id=str(uuid.uuid4()),
            name=request.name,
            description=request.description,
            sections=request.sections,
        )

        # Process through orchestrator
        result = orchestrator.process_prd(prd)

        logger.info(f"Created PRD: {prd.name} with {result['chunks_created']} chunks")

        return PRDResponse(
            prd_id=result["prd_id"],
            prd_name=result["prd_name"],
            chunks_created=result["chunks_created"],
            relationships_created=result["relationships_created"],
            chunks=result["chunks"],
        )

    except Exception as e:
        logger.error(f"Error creating PRD: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prds")
async def list_prds():
    """
    Get list of all PRDs
    """
    try:
        prds = orchestrator.get_all_prds()
        return {"prds": prds}
    except Exception as e:
        logger.error(f"Error listing PRDs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prds/{prd_id}")
async def get_prd(prd_id: str):
    """
    Get details of a specific PRD
    """
    try:
        prd = orchestrator.get_prd_details(prd_id)
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")
        return prd
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting PRD: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search")
async def search_semantic(request: SearchRequest):
    """
    Perform semantic search across all chunks
    """
    try:
        results = orchestrator.search_semantic(
            query=request.query,
            limit=request.limit,
            prd_id=request.prd_id,
            filters=request.filters,
        )

        return {"query": request.query, "results": results, "count": len(results)}

    except Exception as e:
        logger.error(f"Error in semantic search: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chunks/{chunk_id}/context")
async def get_chunk_context(chunk_id: str, max_depth: int = 2):
    """
    Get full context for a chunk including dependencies
    """
    try:
        context = orchestrator.get_chunk_context(chunk_id, max_depth=max_depth)
        return context
    except Exception as e:
        logger.error(f"Error getting chunk context: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prds/{prd_id}/optimize")
async def optimize_prd(prd_id: str, optimization_goal: Optional[str] = "AI Paired Programming"):
    """
    Optimize a PRD by analyzing its facts with LLM and restructuring the knowledge graph

    This endpoint:
    1. Fetches all facts/chunks for the PRD
    2. Sends them to LLM (via OpenRouter) for analysis
    3. Applies optimization recommendations (updates existing facts, creates new ones)
    4. Updates the vector database and knowledge graph
    """
    try:
        # First, get the PRD details to ensure it exists
        prd_details = orchestrator.get_prd_details(prd_id)
        if not prd_details:
            raise HTTPException(status_code=404, detail="PRD not found")

        prd_name = prd_details.get("name", "Unknown PRD")

        logger.info(f"Starting optimization for PRD: {prd_name} (ID: {prd_id})")

        # Run the optimization
        result = await prd_optimizer.optimize_prd(
            prd_id=prd_id, prd_name=prd_name, optimization_goal=optimization_goal
        )

        if result.get("status") == "error":
            raise HTTPException(status_code=400, detail=result.get("message", "Optimization failed"))

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error optimizing PRD: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prds/upload", response_model=PRDResponse)
async def upload_prd_document(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
):
    """
    Upload a PRD document (Word or Markdown) and process it

    Accepts .docx, .md, or .markdown files
    """
    try:
        # Validate file type
        filename = file.filename or ""
        allowed_extensions = [".docx", ".md", ".markdown"]
        file_ext = os.path.splitext(filename)[1].lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {file_ext}. Supported types: {', '.join(allowed_extensions)}",
            )

        # Save uploaded file to a temporary location
        with tempfile.NamedTemporaryFile(
            delete=False, suffix=file_ext
        ) as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_file_path = temp_file.name

        try:
            # Parse the document
            logger.info(f"Parsing uploaded document: {filename}")
            prd = DocumentParser.parse_document(
                temp_file_path,
                prd_name=name,
                prd_description=description,
            )

            # Process through orchestrator
            result = orchestrator.process_prd(prd)

            logger.info(
                f"Uploaded and processed PRD: {prd.name} with {result['chunks_created']} chunks"
            )

            return PRDResponse(
                prd_id=result["prd_id"],
                prd_name=result["prd_name"],
                chunks_created=result["chunks_created"],
                relationships_created=result["relationships_created"],
                chunks=result["chunks"],
            )

        finally:
            # Clean up temporary file
            if os.path.exists(temp_file_path):
                os.unlink(temp_file_path)

    except DocumentParserError as e:
        logger.error(f"Error parsing document: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to parse document: {str(e)}")
    except Exception as e:
        logger.error(f"Error uploading PRD document: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """
    Health check endpoint
    """
    return {
        "status": "healthy",
        "services": {
            "vector_db": "connected",
            "graph_db": "connected",
            "embeddings": "loaded",
        },
    }
