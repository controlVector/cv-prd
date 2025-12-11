"""
API routes for cvPRD application
"""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import PlainTextResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from app.models.prd_models import PRD, PRDSection, Priority
from app.services.orchestrator import PRDOrchestrator
from app.services.prd_optimizer_service import PRDOptimizerService
from app.services.document_parser import DocumentParser, DocumentParserError
from app.services.export_service import ExportService, ExportFormat, ExportType
import uuid
import logging
import tempfile
import os
import shutil
import zipfile

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

# Initialize export service
export_service = ExportService(
    graph_service=orchestrator.graph_service,
    vector_service=orchestrator.vector_service,
    embedding_service=orchestrator.embedding_service,
    orchestrator=orchestrator,
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


@router.get("/prds/{prd_id}/export/markdown", response_class=PlainTextResponse)
async def export_prd_markdown(prd_id: str):
    """
    Export PRD as Markdown document (compatible with cv-md viewer)
    """
    try:
        prd = orchestrator.get_prd_details(prd_id)
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")

        # Generate markdown
        lines = []

        # Header
        lines.append(f"# {prd.get('name', 'Untitled PRD')}")
        lines.append("")

        if prd.get("description"):
            lines.append(f"> {prd['description']}")
            lines.append("")

        # Metadata
        lines.append("## Document Info")
        lines.append("")
        lines.append(f"- **PRD ID:** `{prd_id}`")
        if prd.get("source_file"):
            lines.append(f"- **Source File:** {prd['source_file']}")
        if prd.get("created_at"):
            lines.append(f"- **Created:** {prd['created_at']}")
        chunks = prd.get("chunks", [])
        lines.append(f"- **Total Items:** {len(chunks)}")
        lines.append("")

        # Group chunks by section/type
        grouped = {}
        for chunk in chunks:
            section = chunk.get("section_title") or chunk.get("type", "General")
            if section not in grouped:
                grouped[section] = []
            grouped[section].append(chunk)

        # Priority icons
        priority_icons = {
            "critical": "🔴 Critical",
            "high": "🟠 High",
            "medium": "🟡 Medium",
            "low": "🟢 Low",
        }

        # Type icons
        type_icons = {
            "requirement": "📋",
            "feature": "✨",
            "constraint": "🔒",
            "stakeholder": "👥",
            "metric": "📊",
            "dependency": "🔗",
            "risk": "⚠️",
            "objective": "🎯",
            "overview": "📄",
        }

        for section, section_chunks in grouped.items():
            lines.append(f"## {section}")
            lines.append("")

            for chunk in section_chunks:
                chunk_type = chunk.get("type", "item")
                icon = type_icons.get(chunk_type.lower(), "•")
                priority = chunk.get("priority", "medium")
                priority_badge = priority_icons.get(priority.lower(), priority)

                lines.append(f"### {icon} {chunk_type}")
                lines.append("")
                lines.append(f"**Priority:** {priority_badge}")

                tags = chunk.get("tags", [])
                if tags:
                    lines.append(f"**Tags:** {', '.join(tags)}")
                lines.append("")
                lines.append(chunk.get("text", ""))
                lines.append("")

                if chunk.get("optimized"):
                    lines.append("> ✓ *Optimized for AI Paired Programming*")
                    if chunk.get("optimization_notes"):
                        lines.append(f"> {chunk['optimization_notes']}")
                    lines.append("")

                lines.append("---")
                lines.append("")

        # Footer
        lines.append("---")
        lines.append("")
        lines.append("*Generated by cvPRD - AI-Powered Product Requirements Documentation*")
        lines.append("")

        return "\n".join(lines)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting PRD to markdown: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prds/{prd_id}/chunks")
async def get_prd_chunks(prd_id: str):
    """
    Get all chunks for a PRD (cv-git compatible)
    """
    try:
        prd = orchestrator.get_prd_details(prd_id)
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")
        return prd.get("chunks", [])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting PRD chunks: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chunks/{chunk_id}")
async def get_chunk(chunk_id: str):
    """
    Get a single chunk by ID (cv-git compatible)
    """
    try:
        # Try database first
        if orchestrator.db_service:
            chunk = orchestrator.db_service.get_chunk(chunk_id)
            if chunk:
                return chunk.to_dict()
        raise HTTPException(status_code=404, detail="Chunk not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting chunk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/chunks/{chunk_id}")
async def update_chunk(chunk_id: str, updates: Dict[str, Any]):
    """
    Update chunk metadata (cv-git compatible)
    """
    try:
        if not orchestrator.db_service:
            raise HTTPException(status_code=503, detail="Database service not available")

        metadata = updates.get("metadata", {})
        chunk = orchestrator.db_service.update_chunk_references(
            chunk_id,
            vector_id=metadata.get("vector_id"),
            graph_node_id=metadata.get("graph_node_id"),
        )
        if not chunk:
            raise HTTPException(status_code=404, detail="Chunk not found")
        return chunk.to_dict()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating chunk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/chunks/{chunk_id}/dependencies")
async def get_chunk_dependencies(chunk_id: str, depth: int = 3):
    """
    Get dependencies of a chunk (cv-git compatible)
    """
    try:
        if not orchestrator.graph_service:
            return {"direct": [], "transitive": [], "circular": []}

        # Get outgoing dependencies
        deps = orchestrator.graph_service.get_dependencies(chunk_id, depth=depth, direction="outgoing")
        return {
            "direct": deps[:10] if deps else [],
            "transitive": deps[10:] if len(deps) > 10 else [],
            "circular": [],
        }
    except Exception as e:
        logger.error(f"Error getting dependencies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/graph/chunks/{chunk_id}/dependents")
async def get_chunk_dependents(chunk_id: str):
    """
    Get chunks that depend on this chunk (cv-git compatible)
    """
    try:
        if not orchestrator.graph_service:
            return []

        deps = orchestrator.graph_service.get_dependencies(chunk_id, depth=1, direction="incoming")
        return deps or []
    except Exception as e:
        logger.error(f"Error getting dependents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CreateRelationshipRequest(BaseModel):
    source_chunk_id: str
    target_chunk_id: str
    relationship_type: str
    metadata: Optional[Dict[str, Any]] = None


@router.post("/graph/relationships")
async def create_relationship(request: CreateRelationshipRequest):
    """
    Create a relationship between chunks (cv-git compatible)
    """
    try:
        if not orchestrator.graph_service:
            raise HTTPException(status_code=503, detail="Graph service not available")

        orchestrator.graph_service.create_relationship(
            source_id=request.source_chunk_id,
            target_id=request.target_chunk_id,
            rel_type=request.relationship_type,
            properties=request.metadata,
        )
        return {"status": "created"}
    except Exception as e:
        logger.error(f"Error creating relationship: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search/semantic")
async def search_semantic_alt(request: SearchRequest):
    """
    Semantic search (cv-git compatible alias)
    """
    return await search_semantic(request)


# =========================================================================
# Implementation Tracking (cv-git integration)
# =========================================================================

class ImplementationLinkRequest(BaseModel):
    commit_sha: str
    symbols: List[str]
    files: List[str]


# In-memory implementation tracking (in production, use database)
implementation_links: Dict[str, List[Dict[str, Any]]] = {}


@router.post("/chunks/{chunk_id}/implementations")
async def link_implementation(chunk_id: str, request: ImplementationLinkRequest):
    """
    Link code implementation to a requirement chunk (cv-git integration)
    """
    try:
        from datetime import datetime

        link = {
            "chunk_id": chunk_id,
            "commit_sha": request.commit_sha,
            "symbols": request.symbols,
            "files": request.files,
            "linked_at": datetime.now().isoformat(),
        }

        if chunk_id not in implementation_links:
            implementation_links[chunk_id] = []
        implementation_links[chunk_id].append(link)

        logger.info(f"Linked implementation to chunk {chunk_id}: commit {request.commit_sha}")
        return {"status": "linked", "link": link}
    except Exception as e:
        logger.error(f"Error linking implementation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chunks/{chunk_id}/implementations")
async def get_implementations(chunk_id: str):
    """
    Get implementations linked to a chunk (cv-git integration)
    """
    return implementation_links.get(chunk_id, [])


@router.get("/implementations/by-commit/{commit_sha}")
async def find_requirements_by_commit(commit_sha: str):
    """
    Find requirements linked to a commit (cv-git integration)
    """
    results = []
    for chunk_id, links in implementation_links.items():
        for link in links:
            if link["commit_sha"] == commit_sha:
                # Get the chunk details
                if orchestrator.db_service:
                    chunk = orchestrator.db_service.get_chunk(chunk_id)
                    if chunk:
                        results.append(chunk.to_dict())
    return results


# =========================================================================
# Cross-Graph Integration (cv-git <-> cv-prd)
# =========================================================================

class LinkSymbolRequest(BaseModel):
    """Link a cv-git code symbol to a cv-prd requirement chunk"""
    symbol_qualified_name: str  # e.g., "DatabaseService.create_prd"
    symbol_kind: str  # function, class, method
    file_path: str
    commit_sha: Optional[str] = None


@router.post("/chunks/{chunk_id}/link-symbol")
async def link_symbol_to_chunk(chunk_id: str, request: LinkSymbolRequest):
    """
    Create an IMPLEMENTS relationship between a code symbol and requirement chunk.
    This enables tracing from requirements to code and vice versa.
    """
    try:
        if not orchestrator.graph_service:
            raise HTTPException(status_code=503, detail="Graph service not available")

        # Create the cross-graph relationship
        # The symbol may be in cv-git graph, chunk is in cvprd graph
        # Both share the same FalkorDB instance
        cypher = """
        MERGE (s:Symbol {qualified_name: $symbol_name})
        ON CREATE SET s.kind = $symbol_kind, s.file = $file_path, s.created_at = timestamp()
        WITH s
        MATCH (c:Chunk {id: $chunk_id})
        MERGE (s)-[r:IMPLEMENTS]->(c)
        SET r.linked_at = timestamp(),
            r.commit_sha = $commit_sha
        RETURN s, c
        """
        params = {
            "symbol_name": request.symbol_qualified_name,
            "symbol_kind": request.symbol_kind,
            "file_path": request.file_path,
            "chunk_id": chunk_id,
            "commit_sha": request.commit_sha or "",
        }

        orchestrator.graph_service._query(cypher, params)

        logger.info(f"Linked symbol {request.symbol_qualified_name} to chunk {chunk_id}")
        return {
            "status": "linked",
            "symbol": request.symbol_qualified_name,
            "chunk_id": chunk_id,
        }
    except Exception as e:
        logger.error(f"Error linking symbol to chunk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chunks/{chunk_id}/implementing-symbols")
async def get_implementing_symbols(chunk_id: str):
    """
    Get all code symbols that implement a requirement chunk.
    """
    try:
        if not orchestrator.graph_service:
            return []

        cypher = """
        MATCH (s:Symbol)-[r:IMPLEMENTS]->(c:Chunk {id: $chunk_id})
        RETURN s.qualified_name as symbol_name,
               s.kind as symbol_kind,
               s.file as file_path,
               r.commit_sha as commit_sha,
               r.linked_at as linked_at
        """
        results = orchestrator.graph_service._query(cypher, {"chunk_id": chunk_id})
        return results
    except Exception as e:
        logger.error(f"Error getting implementing symbols: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/symbols/{symbol_name}/requirements")
async def get_symbol_requirements(symbol_name: str):
    """
    Get all requirements implemented by a code symbol.
    """
    try:
        if not orchestrator.graph_service:
            return []

        cypher = """
        MATCH (s:Symbol {qualified_name: $symbol_name})-[r:IMPLEMENTS]->(c:Chunk)
        RETURN c.id as chunk_id,
               c.text as text,
               c.type as chunk_type,
               c.priority as priority,
               r.commit_sha as commit_sha
        """
        results = orchestrator.graph_service._query(cypher, {"symbol_name": symbol_name})
        return results
    except Exception as e:
        logger.error(f"Error getting symbol requirements: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traceability/matrix")
async def get_traceability_matrix(prd_id: Optional[str] = None):
    """
    Get a traceability matrix showing requirements → code mappings.
    """
    try:
        if not orchestrator.graph_service:
            return {"requirements": [], "implementations": []}

        # Build query
        if prd_id:
            cypher = """
            MATCH (c:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
            OPTIONAL MATCH (s:Symbol)-[:IMPLEMENTS]->(c)
            RETURN c.id as chunk_id,
                   c.text as requirement_text,
                   c.type as chunk_type,
                   c.priority as priority,
                   collect(DISTINCT {
                       symbol: s.qualified_name,
                       kind: s.kind,
                       file: s.file
                   }) as implementations
            """
            params = {"prd_id": prd_id}
        else:
            cypher = """
            MATCH (c:Chunk)
            OPTIONAL MATCH (s:Symbol)-[:IMPLEMENTS]->(c)
            RETURN c.id as chunk_id,
                   c.text as requirement_text,
                   c.type as chunk_type,
                   c.priority as priority,
                   collect(DISTINCT {
                       symbol: s.qualified_name,
                       kind: s.kind,
                       file: s.file
                   }) as implementations
            ORDER BY c.priority DESC
            LIMIT 100
            """
            params = {}

        results = orchestrator.graph_service._query(cypher, params)

        # Calculate coverage stats
        total = len(results)
        # Handle the case where implementations might be a list or nested structure
        def has_implementations(r):
            impls = r.get("implementations", [])
            if isinstance(impls, list):
                return any(i.get("symbol") if isinstance(i, dict) else i for i in impls)
            return bool(impls)
        implemented = sum(1 for r in results if has_implementations(r))

        return {
            "requirements": results,
            "stats": {
                "total_requirements": total,
                "implemented": implemented,
                "coverage_percent": round(implemented / total * 100, 1) if total > 0 else 0,
            },
        }
    except Exception as e:
        logger.error(f"Error getting traceability matrix: {e}")
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
            "graph_db": "connected" if orchestrator.graph_service else "disabled",
            "database": "connected" if orchestrator.db_service else "disabled",
            "embeddings": "loaded",
        },
    }


# =========================================================================
# Export Endpoints
# =========================================================================

class ExportRequest(BaseModel):
    """Request model for PRD export"""
    format: str = "cv"  # cv, md, pdf
    export_type: str = "structure"  # structure, full
    prd_ids: Optional[List[str]] = None  # None = all PRDs
    project_name: Optional[str] = "cv-prd-export"


@router.post("/export")
async def export_prds(request: ExportRequest):
    """
    Export PRDs in various formats
    
    Formats:
    - cv: cv-git compatible (.cv directory with JSONL files)
    - md: Markdown document
    - pdf: PDF report (future)
    
    Export types (for .cv format):
    - structure: Nodes and edges only (~100KB)
    - full: Include vector embeddings (~5-20MB)
    """
    try:
        format_enum = ExportFormat(request.format.lower())
        type_enum = ExportType(request.export_type.lower())
        
        if format_enum == ExportFormat.CV:
            # Export to .cv format
            export_dir = await export_service.export_cv(
                prd_ids=request.prd_ids,
                export_type=type_enum,
                project_name=request.project_name or "cv-prd-export"
            )
            
            # Zip the directory for download
            zip_path = f"{export_dir}.zip"
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(export_dir):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, os.path.dirname(export_dir))
                        zipf.write(file_path, arcname)
            
            # Clean up directory
            shutil.rmtree(export_dir)
            
            return FileResponse(
                path=zip_path,
                filename=os.path.basename(zip_path),
                media_type="application/zip"
            )
            
        elif format_enum == ExportFormat.MARKDOWN:
            # Export to Markdown
            md_path = await export_service.export_markdown(
                prd_ids=request.prd_ids
            )
            return FileResponse(
                path=md_path,
                filename=os.path.basename(md_path),
                media_type="text/markdown"
            )
            
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported export format: {request.format}"
            )
            
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Export failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/formats")
async def get_export_formats():
    """Get available export formats and options"""
    return {
        "formats": [
            {
                "id": "cv",
                "name": "cv-git (.cv)",
                "description": "cv-git compatible format for code traceability",
                "types": [
                    {
                        "id": "structure",
                        "name": "Structure Only",
                        "description": "Nodes and edges (~100KB)",
                    },
                    {
                        "id": "full", 
                        "name": "Full (with embeddings)",
                        "description": "Include vector embeddings (~5-20MB)",
                    }
                ]
            },
            {
                "id": "md",
                "name": "Markdown (.md)",
                "description": "Human-readable Markdown document",
                "types": []
            },
            {
                "id": "pdf",
                "name": "PDF (.pdf)",
                "description": "Formatted PDF report (coming soon)",
                "types": [],
                "disabled": True
            }
        ]
    }
