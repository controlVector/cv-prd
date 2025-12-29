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
from app.services.test_generation_service import TestGenerationService, TestType, TestFramework
from app.services.doc_generation_service import DocGenerationService, DocType
from app.core.config import settings
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

# Initialize test generation service
test_generation_service = TestGenerationService(
    openrouter=prd_optimizer.openrouter,
    graph_service=orchestrator.graph_service,
    embedding_service=orchestrator.embedding_service,
    vector_service=orchestrator.vector_service,
)

# Initialize doc generation service
doc_generation_service = DocGenerationService(
    openrouter=prd_optimizer.openrouter,
    graph_service=orchestrator.graph_service,
    embedding_service=orchestrator.embedding_service,
    vector_service=orchestrator.vector_service,
)


# Request/Response Models - flexible input section that accepts string priority
class CreatePRDSectionInput(BaseModel):
    """Flexible input model that accepts string priority values"""
    title: str
    content: str
    priority: str = "medium"  # Accept any string, normalize in route handler
    tags: List[str] = []


class CreatePRDRequest(BaseModel):
    name: str
    description: Optional[str] = None
    sections: List[CreatePRDSectionInput]


class GeneratePRDRequest(BaseModel):
    prompt: str


class FigmaImportRequest(BaseModel):
    url: str


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
        # Normalize sections - ensure priority is lowercase and valid
        valid_priorities = {"critical", "high", "medium", "low"}
        normalized_sections = []
        for section in request.sections:
            priority = section.priority.lower() if hasattr(section.priority, 'lower') else str(section.priority).lower()
            if priority not in valid_priorities:
                priority = "medium"
            normalized_sections.append(PRDSection(
                title=section.title,
                content=section.content,
                priority=Priority(priority),
                tags=section.tags if section.tags else []
            ))

        # Create PRD object
        prd = PRD(
            id=str(uuid.uuid4()),
            name=request.name,
            description=request.description,
            sections=normalized_sections,
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
        logger.error(f"Error creating PRD: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prds/generate")
async def generate_prd(request: GeneratePRDRequest):
    """
    Use AI to generate a PRD from a natural language description
    """
    import httpx
    import json
    import os

    api_key = os.environ.get("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=400,
            detail="OpenRouter API key not configured. Please set it in Settings."
        )

    system_prompt = """You are a PRD (Product Requirements Document) generator.
Given a product or feature description, generate a structured PRD with clear sections.

Return your response as valid JSON with this exact structure:
{
  "name": "Short product/feature name",
  "description": "One paragraph overview",
  "sections": [
    {
      "title": "Section title (e.g., 'User Authentication', 'Data Storage')",
      "content": "Detailed requirements for this section",
      "priority": "critical|high|medium|low",
      "tags": ["relevant", "tags"]
    }
  ]
}

Include sections for:
- Overview/Objectives
- Functional Requirements (multiple sections as needed)
- Non-Functional Requirements (performance, security, etc.)
- User Stories or Use Cases
- Technical Constraints
- Success Metrics

Be specific and actionable. Each section should have clear, testable requirements."""

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://cv-prd.local",
                    "X-Title": "cvPRD"
                },
                json={
                    "model": "anthropic/claude-3.5-sonnet",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Generate a PRD for: {request.prompt}"}
                    ],
                    "temperature": 0.7,
                    "max_tokens": 4000
                }
            )

            if response.status_code != 200:
                error_data = response.json()
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_data.get("error", {}).get("message", "AI generation failed")
                )

            data = response.json()
            content = data["choices"][0]["message"]["content"]

            # Parse JSON from response (handle markdown code blocks)
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            prd_data = json.loads(content.strip())
            return prd_data

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response: {e}")
        raise HTTPException(status_code=500, detail="Failed to parse AI response")
    except Exception as e:
        logger.error(f"AI generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/integrations/figma/import")
async def import_from_figma(request: FigmaImportRequest):
    """
    Import screens and components from a Figma file
    """
    import httpx
    import re
    import os

    figma_token = os.environ.get("FIGMA_API_TOKEN")
    if not figma_token:
        raise HTTPException(
            status_code=400,
            detail="Figma API token not configured. Please set it in Settings."
        )

    # Parse Figma URL to extract file key
    # Formats:
    # https://www.figma.com/file/ABC123/FileName
    # https://www.figma.com/design/ABC123/FileName
    url_match = re.search(r'figma\.com/(?:file|design)/([a-zA-Z0-9]+)', request.url)
    if not url_match:
        raise HTTPException(status_code=400, detail="Invalid Figma URL format")

    file_key = url_match.group(1)

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Get file info
            response = await client.get(
                f"https://api.figma.com/v1/files/{file_key}",
                headers={"X-Figma-Token": figma_token}
            )

            if response.status_code == 403:
                raise HTTPException(status_code=403, detail="Invalid Figma token or no access to file")
            elif response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Failed to fetch Figma file")

            figma_data = response.json()

            # Extract screens (top-level frames)
            screens = []
            workflow_steps = []

            def extract_frames(node, depth=0):
                if node.get("type") == "FRAME" and depth <= 1:
                    screen = {
                        "name": node.get("name", "Unnamed"),
                        "id": node.get("id"),
                        "components": [],
                        "tags": []
                    }

                    # Extract component names
                    def get_components(n):
                        components = []
                        if n.get("type") in ["COMPONENT", "INSTANCE", "COMPONENT_SET"]:
                            components.append(n.get("name", "Unknown"))
                        for child in n.get("children", []):
                            components.extend(get_components(child))
                        return components

                    screen["components"] = list(set(get_components(node)))[:10]  # Top 10 unique

                    # Check for annotations/notes
                    if "annotation" in node.get("name", "").lower():
                        screen["tags"].append("annotated")

                    screens.append(screen)
                    workflow_steps.append(node.get("name", "Step"))

                for child in node.get("children", []):
                    extract_frames(child, depth + 1)

            # Start extraction from document
            document = figma_data.get("document", {})
            for page in document.get("children", []):
                extract_frames(page)

            # Generate workflow description
            workflow = None
            if len(workflow_steps) > 1:
                workflow = "User Flow:\n" + "\n".join(
                    f"{i+1}. {step}" for i, step in enumerate(workflow_steps[:10])
                )

            return {
                "file_name": figma_data.get("name", "Unknown"),
                "screens": screens[:20],  # Limit to 20 screens
                "workflow": workflow,
                "total_screens": len(screens)
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Figma import error: {e}")
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
# Settings Endpoints
# =========================================================================

class OpenRouterKeyRequest(BaseModel):
    api_key: str


class FigmaTokenRequest(BaseModel):
    token: str


@router.post("/settings/openrouter-key")
async def set_openrouter_key(request: OpenRouterKeyRequest):
    """
    Set the OpenRouter API key and update the embedding service
    """
    import os
    import httpx

    # Validate the key by testing it
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                "https://openrouter.ai/api/v1/models",
                headers={"Authorization": f"Bearer {request.api_key}"}
            )
            # OpenRouter returns models even without auth, but with auth we get user-specific info
            if response.status_code != 200:
                return {"status": "error", "message": "Invalid API key"}
    except Exception as e:
        logger.error(f"Error validating OpenRouter key: {e}")
        return {"status": "error", "message": f"Connection error: {str(e)}"}

    # Set the environment variable
    os.environ["OPENROUTER_API_KEY"] = request.api_key

    # Update the embedding service with the new key
    if orchestrator.embedding_service:
        orchestrator.embedding_service.api_key = request.api_key

    # Update the PRD optimizer service with the new key
    if prd_optimizer.openrouter:
        prd_optimizer.openrouter.api_key = request.api_key

    logger.info("OpenRouter API key updated")
    return {"status": "success", "message": "API key saved"}


@router.post("/settings/test-openrouter-key")
async def test_openrouter_key(request: OpenRouterKeyRequest):
    """
    Test an OpenRouter API key without saving it
    """
    import httpx

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # Make a minimal embeddings request to test the key
            response = await client.post(
                "https://openrouter.ai/api/v1/embeddings",
                headers={
                    "Authorization": f"Bearer {request.api_key}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://cv-prd.local",
                    "X-Title": "cvPRD"
                },
                json={
                    "model": "openai/text-embedding-3-small",
                    "input": "test"
                }
            )

            if response.status_code == 200:
                return {
                    "status": "success",
                    "message": "API key is valid"
                }
            elif response.status_code == 401 or response.status_code == 403:
                return {"status": "error", "message": "Invalid or unauthorized API key"}
            elif response.status_code == 402:
                return {"status": "error", "message": "Insufficient credits on this API key"}
            else:
                data = response.json()
                error_msg = data.get("error", {}).get("message", f"Error: {response.status_code}")
                return {"status": "error", "message": error_msg}
    except Exception as e:
        logger.error(f"Error testing OpenRouter key: {e}")
        return {"status": "error", "message": f"Connection error: {str(e)}"}


@router.post("/settings/figma-token")
async def set_figma_token(request: FigmaTokenRequest):
    """
    Set the Figma API token
    """
    import os

    os.environ["FIGMA_API_TOKEN"] = request.token
    logger.info("Figma API token updated")
    return {"status": "success", "message": "Figma token saved"}


# =========================================================================
# Shared ControlVector Credentials (cv-git <-> cv-prd)
# =========================================================================

CREDENTIALS_PATH = os.path.expanduser("~/.controlvector/credentials.json")


def _ensure_cv_dir():
    """Ensure ~/.controlvector directory exists"""
    cv_dir = os.path.dirname(CREDENTIALS_PATH)
    if not os.path.exists(cv_dir):
        os.makedirs(cv_dir, mode=0o700)


def _load_credentials() -> Dict[str, Any]:
    """Load credentials from shared file"""
    if os.path.exists(CREDENTIALS_PATH):
        try:
            with open(CREDENTIALS_PATH, 'r') as f:
                import json
                return json.load(f)
        except Exception as e:
            logger.warning(f"Could not load credentials: {e}")
    return {}


def _save_credentials(creds: Dict[str, Any]):
    """Save credentials to shared file"""
    _ensure_cv_dir()
    with open(CREDENTIALS_PATH, 'w') as f:
        import json
        json.dump(creds, f, indent=2)
    os.chmod(CREDENTIALS_PATH, 0o600)  # Restrict permissions


class CredentialsResponse(BaseModel):
    openrouter_key: Optional[str] = None
    anthropic_key: Optional[str] = None
    figma_token: Optional[str] = None
    github_token: Optional[str] = None


class UpdateCredentialsRequest(BaseModel):
    openrouter_key: Optional[str] = None
    anthropic_key: Optional[str] = None
    figma_token: Optional[str] = None
    github_token: Optional[str] = None


@router.get("/credentials")
async def get_shared_credentials():
    """
    Get shared ControlVector credentials.
    Used by both cv-prd and cv-git for token sharing.
    Credentials are stored in ~/.controlvector/credentials.json
    """
    creds = _load_credentials()
    # Mask sensitive values for display (show last 4 chars only)
    masked = {}
    for key, value in creds.items():
        if value and len(value) > 8:
            masked[key] = f"***{value[-4:]}"
        else:
            masked[key] = "***" if value else None
    return {"credentials": masked, "path": CREDENTIALS_PATH}


def _apply_credentials(creds: dict):
    """Apply credentials to environment and service instances."""
    if creds.get("openrouter_key"):
        os.environ["OPENROUTER_API_KEY"] = creds["openrouter_key"]
        os.environ["CV_OPENROUTER_KEY"] = creds["openrouter_key"]
        if orchestrator.embedding_service:
            orchestrator.embedding_service.api_key = creds["openrouter_key"]
        # Update PRD optimizer and generation services
        if prd_optimizer.openrouter:
            prd_optimizer.openrouter.api_key = creds["openrouter_key"]
    if creds.get("anthropic_key"):
        os.environ["ANTHROPIC_API_KEY"] = creds["anthropic_key"]
        os.environ["CV_ANTHROPIC_KEY"] = creds["anthropic_key"]
    if creds.get("figma_token"):
        os.environ["FIGMA_API_TOKEN"] = creds["figma_token"]
    if creds.get("github_token"):
        os.environ["GITHUB_TOKEN"] = creds["github_token"]


# Load credentials at module initialization
def _init_credentials():
    """Load and apply credentials at startup."""
    try:
        creds = _load_credentials()
        _apply_credentials(creds)
        if creds.get("openrouter_key"):
            logger.info("Loaded OpenRouter API key from credentials file")
    except Exception as e:
        logger.warning(f"Could not load credentials at startup: {e}")


# Initialize credentials when module loads
_init_credentials()


@router.get("/credentials/raw")
async def get_credentials_raw():
    """
    Get raw credentials (for internal use by services).
    Also applies credentials to current environment.
    """
    creds = _load_credentials()
    _apply_credentials(creds)
    return creds


@router.put("/credentials")
async def update_shared_credentials(request: UpdateCredentialsRequest):
    """
    Update shared ControlVector credentials.
    Saves to ~/.controlvector/credentials.json for sharing with cv-git.
    """
    creds = _load_credentials()

    # Only update non-None values
    if request.openrouter_key is not None:
        creds["openrouter_key"] = request.openrouter_key
    if request.anthropic_key is not None:
        creds["anthropic_key"] = request.anthropic_key
    if request.figma_token is not None:
        creds["figma_token"] = request.figma_token
    if request.github_token is not None:
        creds["github_token"] = request.github_token

    _save_credentials(creds)
    _apply_credentials(creds)
    logger.info(f"Saved shared credentials to {CREDENTIALS_PATH}")

    return {"status": "success", "message": f"Credentials saved to {CREDENTIALS_PATH}"}


@router.post("/credentials/sync-from-env")
async def sync_credentials_from_env():
    """
    Sync credentials from environment variables to shared file.
    Useful for initial setup when keys are in .env files.
    """
    creds = _load_credentials()
    updated = []

    # Check environment variables
    env_mappings = {
        "openrouter_key": ["OPENROUTER_API_KEY", "CV_OPENROUTER_KEY"],
        "anthropic_key": ["ANTHROPIC_API_KEY", "CV_ANTHROPIC_KEY"],
        "figma_token": ["FIGMA_API_TOKEN"],
        "github_token": ["GITHUB_TOKEN", "GH_TOKEN"],
    }

    for cred_key, env_vars in env_mappings.items():
        for env_var in env_vars:
            if os.environ.get(env_var) and not creds.get(cred_key):
                creds[cred_key] = os.environ[env_var]
                updated.append(cred_key)
                break

    if updated:
        _save_credentials(creds)
        return {"status": "success", "synced": updated}
    return {"status": "no_changes", "message": "No new credentials found in environment"}


# =========================================================================
# Authentication Endpoints
# =========================================================================

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: Optional[str] = None


# Simple file-based user storage (for desktop app, not production multi-user)
USERS_PATH = os.path.expanduser("~/.controlvector/users.json")


def _load_users() -> Dict[str, Any]:
    """Load users from file"""
    if os.path.exists(USERS_PATH):
        try:
            with open(USERS_PATH, 'r') as f:
                import json
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_users(users: Dict[str, Any]):
    """Save users to file"""
    _ensure_cv_dir()
    with open(USERS_PATH, 'w') as f:
        import json
        json.dump(users, f, indent=2)
    os.chmod(USERS_PATH, 0o600)


def _hash_password(password: str) -> str:
    """Hash password using bcrypt"""
    import hashlib
    import secrets
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{hashed.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    """Verify password against stored hash"""
    import hashlib
    try:
        salt, hashed = stored.split(':')
        check = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
        return check.hex() == hashed
    except Exception:
        return False


def _generate_token() -> str:
    """Generate a session token"""
    import secrets
    return secrets.token_urlsafe(32)


# In-memory session store (resets on restart)
sessions: Dict[str, Dict[str, Any]] = {}


@router.post("/auth/register")
async def register(request: RegisterRequest):
    """
    Register a new user account.
    For desktop app - stores in ~/.controlvector/users.json
    """
    users = _load_users()

    if request.username in users:
        raise HTTPException(status_code=400, detail="Username already exists")

    users[request.username] = {
        "password_hash": _hash_password(request.password),
        "email": request.email,
        "created_at": __import__('datetime').datetime.now().isoformat()
    }

    _save_users(users)
    logger.info(f"Registered new user: {request.username}")

    # Auto-login after registration
    token = _generate_token()
    sessions[token] = {"username": request.username}

    return {
        "status": "success",
        "message": "Account created",
        "token": token,
        "username": request.username
    }


@router.post("/auth/login")
async def login(request: LoginRequest):
    """
    Login and get a session token.
    """
    users = _load_users()

    user = users.get(request.username)
    if not user or not _verify_password(request.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = _generate_token()
    sessions[token] = {"username": request.username}

    logger.info(f"User logged in: {request.username}")

    return {
        "status": "success",
        "token": token,
        "username": request.username
    }


@router.post("/auth/logout")
async def logout(token: Optional[str] = None):
    """
    Logout and invalidate session token.
    """
    if token and token in sessions:
        del sessions[token]
    return {"status": "success", "message": "Logged out"}


@router.get("/auth/me")
async def get_current_user(authorization: Optional[str] = None):
    """
    Get current user info from session token.
    Token should be passed in Authorization header as 'Bearer <token>'
    """
    from fastapi import Header

    # This is a simplified check - in production use proper dependency injection
    if not authorization:
        return {"authenticated": False}

    token = authorization.replace("Bearer ", "") if authorization.startswith("Bearer ") else authorization
    session = sessions.get(token)

    if not session:
        return {"authenticated": False}

    return {
        "authenticated": True,
        "username": session.get("username")
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


# =============================================================================
# Test Generation Endpoints
# =============================================================================

class GenerateTestsRequest(BaseModel):
    test_type: str = "all"  # unit, integration, acceptance, all
    framework: Optional[str] = None  # pytest, jest, etc.
    include_code_stub: bool = True


class GenerateTestSuiteRequest(BaseModel):
    framework: Optional[str] = None


@router.post("/chunks/{chunk_id}/generate-tests")
async def generate_tests_for_requirement(chunk_id: str, request: GenerateTestsRequest):
    """
    Generate test cases for a specific requirement chunk.

    Returns test specifications and optionally code stubs.
    """
    try:
        # Get the chunk
        if not orchestrator.db_service:
            raise HTTPException(status_code=503, detail="Database service not available")

        chunk = orchestrator.db_service.get_chunk(chunk_id)
        if not chunk:
            raise HTTPException(status_code=404, detail="Chunk not found")

        chunk_dict = chunk.to_dict()

        # Get PRD context
        prd = orchestrator.get_prd_details(chunk_dict.get("prd_id", ""))
        prd_context = {
            "prd_id": chunk_dict.get("prd_id"),
            "prd_name": prd.get("name", "Unknown") if prd else "Unknown",
        }

        # Map test type
        test_type_map = {
            "unit": TestType.UNIT,
            "integration": TestType.INTEGRATION,
            "acceptance": TestType.ACCEPTANCE,
            "all": TestType.ALL,
        }
        test_type = test_type_map.get(request.test_type.lower(), TestType.ALL)

        # Map framework
        framework = None
        if request.framework:
            framework_map = {
                "pytest": TestFramework.PYTEST,
                "jest": TestFramework.JEST,
                "mocha": TestFramework.MOCHA,
                "vitest": TestFramework.VITEST,
            }
            framework = framework_map.get(request.framework.lower())

        # Generate tests
        test_cases = await test_generation_service.generate_test_cases(
            requirement_chunk=chunk_dict,
            prd_context=prd_context,
            test_type=test_type,
            framework=framework,
            include_code_stub=request.include_code_stub,
        )

        return {
            "chunk_id": chunk_id,
            "test_cases": test_cases,
            "count": len(test_cases),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating tests: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prds/{prd_id}/generate-test-suite")
async def generate_test_suite(prd_id: str, request: GenerateTestSuiteRequest):
    """
    Generate a complete test suite for all requirements in a PRD.
    """
    try:
        prd = orchestrator.get_prd_details(prd_id)
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")

        chunks = prd.get("chunks", [])

        # Map framework
        framework = None
        if request.framework:
            framework_map = {
                "pytest": TestFramework.PYTEST,
                "jest": TestFramework.JEST,
                "mocha": TestFramework.MOCHA,
                "vitest": TestFramework.VITEST,
            }
            framework = framework_map.get(request.framework.lower())

        result = await test_generation_service.generate_test_suite(
            prd_id=prd_id,
            chunks=chunks,
            prd_name=prd.get("name", "Unknown"),
            framework=framework,
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating test suite: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prds/{prd_id}/tests")
async def get_tests_for_prd(prd_id: str):
    """
    Get all test cases for a PRD.

    Returns test cases with their linked requirement info.
    """
    try:
        if not orchestrator.graph_service:
            return {"tests": []}

        tests = orchestrator.graph_service.get_all_tests_for_prd(prd_id)

        # Parse test case info from stored text
        parsed_tests = []
        for test in tests or []:
            text = test.get("text", "")
            # Extract title from markdown header
            title = "Untitled Test"
            if text.startswith("# "):
                title = text.split("\n")[0][2:].strip()

            # Extract description (first paragraph after title)
            description = ""
            lines = text.split("\n")
            for i, line in enumerate(lines[1:], 1):
                if line.strip() and not line.startswith("#"):
                    description = line.strip()
                    break

            # Determine test_type from chunk_type
            chunk_type = test.get("chunk_type", "test_case")
            test_type = "unit"
            if "integration" in chunk_type:
                test_type = "integration"
            elif "acceptance" in chunk_type:
                test_type = "acceptance"

            # Extract code stub if present
            code_stub = ""
            if "```" in text:
                parts = text.split("```")
                if len(parts) >= 2:
                    code_stub = parts[1].strip()
                    if code_stub.startswith("python") or code_stub.startswith("javascript"):
                        code_stub = code_stub.split("\n", 1)[1] if "\n" in code_stub else ""

            parsed_tests.append({
                "id": test.get("id"),
                "name": title,
                "title": title,
                "description": description,
                "test_type": test_type,
                "priority": test.get("priority", "medium"),
                "code_stub": code_stub,
                "source_requirement_id": test.get("source_requirement_id"),
                "requirement_text": test.get("requirement_text", "")[:200],
            })

        return {"tests": parsed_tests}

    except Exception as e:
        logger.error(f"Error getting tests for PRD: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prds/{prd_id}/test-coverage")
async def get_test_coverage(prd_id: str):
    """
    Get test coverage metrics for a PRD.
    """
    try:
        if not orchestrator.graph_service:
            raise HTTPException(status_code=503, detail="Graph service not available")

        coverage = orchestrator.graph_service.get_test_coverage(prd_id)
        return coverage

    except Exception as e:
        logger.error(f"Error getting test coverage: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chunks/{chunk_id}/tests")
async def get_tests_for_chunk(chunk_id: str):
    """
    Get all test cases that test a specific requirement.
    """
    try:
        if not orchestrator.graph_service:
            return []

        tests = orchestrator.graph_service.get_tests_for_requirement(chunk_id)
        return tests or []

    except Exception as e:
        logger.error(f"Error getting tests for chunk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Documentation Generation Endpoints
# =============================================================================

class GenerateReleaseNotesRequest(BaseModel):
    version: str
    changes: Optional[List[str]] = None


@router.post("/prds/{prd_id}/generate-user-manual")
async def generate_user_manual(prd_id: str, audience: str = "end users"):
    """
    Generate user manual sections from PRD requirements.
    """
    try:
        prd = orchestrator.get_prd_details(prd_id)
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")

        chunks = prd.get("chunks", [])

        doc_chunks = await doc_generation_service.generate_user_manual(
            prd_id=prd_id,
            prd_name=prd.get("name", "Unknown"),
            chunks=chunks,
            audience=audience,
        )

        return {
            "prd_id": prd_id,
            "doc_type": "user_manual",
            "sections": doc_chunks,
            "count": len(doc_chunks),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating user manual: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prds/{prd_id}/generate-api-docs")
async def generate_api_docs(prd_id: str):
    """
    Generate API documentation from PRD requirements.
    """
    try:
        prd = orchestrator.get_prd_details(prd_id)
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")

        chunks = prd.get("chunks", [])

        doc_chunks = await doc_generation_service.generate_api_docs(
            prd_id=prd_id,
            prd_name=prd.get("name", "Unknown"),
            chunks=chunks,
        )

        return {
            "prd_id": prd_id,
            "doc_type": "api_docs",
            "sections": doc_chunks,
            "count": len(doc_chunks),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating API docs: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prds/{prd_id}/generate-technical-spec")
async def generate_technical_spec(prd_id: str):
    """
    Generate technical specification from PRD requirements.
    """
    try:
        prd = orchestrator.get_prd_details(prd_id)
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")

        chunks = prd.get("chunks", [])

        doc_chunks = await doc_generation_service.generate_technical_spec(
            prd_id=prd_id,
            prd_name=prd.get("name", "Unknown"),
            chunks=chunks,
        )

        return {
            "prd_id": prd_id,
            "doc_type": "technical_spec",
            "sections": doc_chunks,
            "count": len(doc_chunks),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating technical spec: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/prds/{prd_id}/generate-release-notes")
async def generate_release_notes(prd_id: str, request: GenerateReleaseNotesRequest):
    """
    Generate release notes for a version.
    """
    try:
        prd = orchestrator.get_prd_details(prd_id)
        if not prd:
            raise HTTPException(status_code=404, detail="PRD not found")

        chunks = prd.get("chunks", [])

        release_notes = await doc_generation_service.generate_release_notes(
            prd_id=prd_id,
            prd_name=prd.get("name", "Unknown"),
            version=request.version,
            chunks=chunks,
            changes=request.changes,
        )

        return release_notes

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating release notes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chunks/{chunk_id}/documentation")
async def get_documentation_for_chunk(chunk_id: str):
    """
    Get all documentation that documents a specific requirement.
    """
    try:
        if not orchestrator.graph_service:
            return []

        docs = orchestrator.graph_service.get_documentation_for_requirement(chunk_id)
        return docs or []

    except Exception as e:
        logger.error(f"Error getting documentation for chunk: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/prds/{prd_id}/documentation-coverage")
async def get_documentation_coverage(prd_id: str):
    """
    Get documentation coverage metrics for a PRD.
    """
    try:
        if not orchestrator.graph_service:
            raise HTTPException(status_code=503, detail="Graph service not available")

        coverage = orchestrator.graph_service.get_documentation_coverage(prd_id)
        return coverage

    except Exception as e:
        logger.error(f"Error getting documentation coverage: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# Unified Context API (for cv-git integration)
# =============================================================================

class UnifiedContextRequest(BaseModel):
    query: str
    prd_id: Optional[str] = None
    include_types: Optional[List[str]] = None
    depth: int = 3
    format: str = "structured"  # structured or narrative


@router.post("/context/unified")
async def get_unified_context(request: UnifiedContextRequest):
    """
    Get full context for AI traversal across all artifact types.

    Returns matching chunks with related tests, documentation, designs,
    and code implementations for comprehensive AI context.
    """
    try:
        # Default include types
        include_types = request.include_types or [
            "requirement", "feature", "constraint",
            "test_case", "unit_test_spec", "integration_test_spec",
            "documentation", "user_manual", "api_doc", "technical_spec",
            "design_spec"
        ]

        # Semantic search for matching chunks
        search_results = orchestrator.search_semantic(
            query=request.query,
            limit=20,
            prd_id=request.prd_id,
        )

        # Enrich results with related artifacts
        enriched_results = []
        for result in search_results:
            chunk_id = result.get("chunk_id") or result.get("id")
            if not chunk_id:
                continue

            # Get full traceability if graph is available
            if orchestrator.graph_service:
                traceability = orchestrator.graph_service.get_full_traceability(
                    chunk_id, depth=request.depth
                )
                result["traceability"] = traceability

            # Filter by include_types
            chunk_type = result.get("chunk_type") or result.get("type", "")
            if chunk_type in include_types:
                enriched_results.append(result)

        # Calculate coverage metrics
        coverage = {}
        if request.prd_id and orchestrator.graph_service:
            coverage = {
                "test_coverage": orchestrator.graph_service.get_test_coverage(request.prd_id),
                "doc_coverage": orchestrator.graph_service.get_documentation_coverage(request.prd_id),
            }

        return {
            "query": request.query,
            "prd_id": request.prd_id,
            "results": enriched_results,
            "count": len(enriched_results),
            "coverage": coverage,
            "include_types": include_types,
        }

    except Exception as e:
        logger.error(f"Error getting unified context: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traceability/full/{chunk_id}")
async def get_full_traceability(chunk_id: str, depth: int = 3):
    """
    Get complete traceability for a chunk.

    Returns all related artifacts: dependencies, tests, documentation,
    designs, and code implementations.
    """
    try:
        if not orchestrator.graph_service:
            raise HTTPException(status_code=503, detail="Graph service not available")

        traceability = orchestrator.graph_service.get_full_traceability(chunk_id, depth=depth)
        return traceability

    except Exception as e:
        logger.error(f"Error getting traceability: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# AI SETTINGS & CONFIGURATION
# =============================================================================

class AISettingsRequest(BaseModel):
    """Request model for updating AI settings."""
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    default_test_framework: Optional[str] = None


@router.get("/ai/settings")
async def get_ai_settings():
    """
    Get current AI configuration settings.
    """
    return {
        "model": settings.OPENROUTER_MODEL,
        "temperature": settings.AI_TEMPERATURE,
        "max_tokens": settings.AI_MAX_TOKENS,
        "default_test_framework": settings.DEFAULT_TEST_FRAMEWORK,
        "usage_tracking_enabled": settings.USAGE_TRACKING_ENABLED,
    }


@router.put("/ai/settings")
async def update_ai_settings(request: AISettingsRequest):
    """
    Update AI configuration settings.

    These settings are stored in the shared credentials file and
    loaded as environment variables on startup.
    """
    import json
    from pathlib import Path

    # Load existing config
    config_path = Path.home() / ".controlvector" / "ai_config.json"
    config_path.parent.mkdir(parents=True, exist_ok=True)

    config = {}
    if config_path.exists():
        try:
            with open(config_path) as f:
                config = json.load(f)
        except:
            pass

    # Update with new values
    if request.model is not None:
        config["model"] = request.model
        settings.OPENROUTER_MODEL = request.model
        os.environ["OPENROUTER_MODEL"] = request.model

    if request.temperature is not None:
        config["temperature"] = request.temperature
        settings.AI_TEMPERATURE = request.temperature
        os.environ["AI_TEMPERATURE"] = str(request.temperature)

    if request.max_tokens is not None:
        config["max_tokens"] = request.max_tokens
        settings.AI_MAX_TOKENS = request.max_tokens
        os.environ["AI_MAX_TOKENS"] = str(request.max_tokens)

    if request.default_test_framework is not None:
        config["default_test_framework"] = request.default_test_framework
        settings.DEFAULT_TEST_FRAMEWORK = request.default_test_framework
        os.environ["DEFAULT_TEST_FRAMEWORK"] = request.default_test_framework

    # Save config
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2)

    return {
        "success": True,
        "settings": {
            "model": settings.OPENROUTER_MODEL,
            "temperature": settings.AI_TEMPERATURE,
            "max_tokens": settings.AI_MAX_TOKENS,
            "default_test_framework": settings.DEFAULT_TEST_FRAMEWORK,
        }
    }


@router.get("/ai/models")
async def get_available_models():
    """
    Get list of available AI models with pricing info.
    """
    from app.services.usage_tracking_service import AVAILABLE_MODELS, MODEL_PRICING

    models = []
    for model in AVAILABLE_MODELS:
        pricing = MODEL_PRICING.get(model["id"], MODEL_PRICING["default"])
        models.append({
            **model,
            "pricing": {
                "input_per_1m": pricing["input"],
                "output_per_1m": pricing["output"],
            }
        })

    return {
        "models": models,
        "current_model": settings.OPENROUTER_MODEL,
    }


# =============================================================================
# USAGE TRACKING
# =============================================================================

@router.get("/usage/summary")
async def get_usage_summary(
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    days: int = 30,
):
    """
    Get usage summary for a user or project.

    Args:
        user_id: Filter by user ID
        project_id: Filter by project ID (PRD ID)
        days: Number of days to include (default: 30)
    """
    from app.services.usage_tracking_service import get_usage_service

    if not settings.USAGE_TRACKING_ENABLED:
        return {"error": "Usage tracking is disabled", "enabled": False}

    usage_service = get_usage_service()
    summary = usage_service.get_usage_summary(
        user_id=user_id,
        project_id=project_id,
        days=days,
    )

    return summary


@router.get("/usage/details")
async def get_usage_details(
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
    days: int = 7,
    limit: int = 100,
):
    """
    Get detailed usage records.

    Args:
        user_id: Filter by user ID
        project_id: Filter by project ID (PRD ID)
        days: Number of days to include (default: 7)
        limit: Maximum records to return (default: 100)
    """
    from app.services.usage_tracking_service import get_usage_service

    if not settings.USAGE_TRACKING_ENABLED:
        return {"error": "Usage tracking is disabled", "enabled": False}

    usage_service = get_usage_service()
    details = usage_service.get_usage_details(
        user_id=user_id,
        project_id=project_id,
        days=days,
        limit=limit,
    )

    return {"records": details, "count": len(details)}


@router.get("/usage/project/{prd_id}")
async def get_project_usage(prd_id: str, days: int = 30):
    """
    Get usage summary for a specific PRD/project.
    """
    from app.services.usage_tracking_service import get_usage_service

    if not settings.USAGE_TRACKING_ENABLED:
        return {"error": "Usage tracking is disabled", "enabled": False}

    usage_service = get_usage_service()
    return usage_service.get_project_usage(prd_id, days=days)


@router.get("/usage/estimate")
async def estimate_cost(
    model: str,
    tokens_in: int,
    tokens_out: int,
):
    """
    Estimate cost for a given model and token count.
    """
    from app.services.usage_tracking_service import UsageTrackingService

    cost = UsageTrackingService.estimate_cost(model, tokens_in, tokens_out)
    pricing = UsageTrackingService.get_model_pricing(model)

    return {
        "model": model,
        "tokens_in": tokens_in,
        "tokens_out": tokens_out,
        "estimated_cost_usd": cost,
        "pricing": pricing,
    }


# =========================================================================
# Feature Request Endpoints (Progressive PRD Workflow)
# =========================================================================

from app.models.request_models import (
    FeatureRequestCreate,
    FeatureRequestResponse,
    FeatureRequestListResponse,
    FeatureRequestCreateResponse,
    TriageAccept,
    TriageReject,
    TriageMerge,
    TriageRequestInfo,
    ElaborateRequest,
    TriageActionResponse,
    ElaborateResponse,
)
from app.services.feature_request_service import get_feature_request_service


@router.post("/requests", response_model=FeatureRequestCreateResponse)
async def create_feature_request(data: FeatureRequestCreate):
    """
    Create a new feature request (typically from cv-hub).

    The request will be:
    1. Saved to the database
    2. Enriched with AI analysis (categorization, summary, skeleton)
    3. Indexed for similarity search

    Returns the created request with AI analysis.
    """
    service = get_feature_request_service()

    try:
        request = service.create_request(data, enrich_with_ai=True)

        # Build AI analysis response
        ai_analysis = None
        if request.ai_summary:
            ai_analysis = {
                "summary": request.ai_summary,
                "request_type": request.request_type,
                "category": request.category,
                "priority_suggestion": request.priority_suggestion,
                "tags": request.tags or [],
                "similar_requests": request.similar_requests or [],
                "related_prds": request.related_prds or [],
                "related_chunks": request.related_chunks or [],
                "prd_skeleton": request.prd_skeleton,
            }

        return FeatureRequestCreateResponse(
            id=request.id,
            external_id=request.external_id,
            status=request.status,
            ai_analysis=ai_analysis,
        )

    except Exception as e:
        logger.error(f"Failed to create feature request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/requests", response_model=FeatureRequestListResponse)
async def list_feature_requests(
    status: Optional[str] = None,
    requester_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
):
    """
    List feature requests with optional filters.

    - status: Filter by status (raw, under_review, accepted, rejected, etc.)
    - requester_id: Filter by requester (cv-hub user ID)
    """
    service = get_feature_request_service()
    requests, total = service.list_requests(
        status=status,
        requester_id=requester_id,
        page=page,
        page_size=page_size,
    )

    return FeatureRequestListResponse(
        requests=[FeatureRequestResponse(**r.to_dict()) for r in requests],
        total=total,
        page=page,
        page_size=page_size,
        has_more=(page * page_size) < total,
    )


@router.get("/requests/{request_id}", response_model=FeatureRequestResponse)
async def get_feature_request(request_id: str):
    """Get a feature request by ID."""
    service = get_feature_request_service()
    request = service.get_request(request_id)

    if not request:
        raise HTTPException(status_code=404, detail="Feature request not found")

    return FeatureRequestResponse(**request.to_dict())


@router.get("/requests/by-external-id/{external_id}", response_model=FeatureRequestResponse)
async def get_feature_request_by_external_id(external_id: str):
    """
    Get a feature request by external ID (cv-hub reference).

    This is the primary way cv-hub checks request status.
    """
    service = get_feature_request_service()
    request = service.get_request_by_external_id(external_id)

    if not request:
        raise HTTPException(status_code=404, detail="Feature request not found")

    return FeatureRequestResponse(**request.to_dict())


@router.post("/requests/{request_id}/start-review", response_model=TriageActionResponse)
async def start_review(request_id: str, reviewer_id: str):
    """
    Mark a request as under review.

    Call this when a reviewer starts looking at a request.
    """
    service = get_feature_request_service()
    request = service.start_review(request_id, reviewer_id)

    if not request:
        raise HTTPException(status_code=404, detail="Feature request not found")

    return TriageActionResponse(
        id=request.id,
        status=request.status,
        message="Request is now under review",
    )


@router.post("/requests/{request_id}/accept", response_model=TriageActionResponse)
async def accept_request(request_id: str, data: TriageAccept, reviewer_id: str):
    """
    Accept a feature request.

    After acceptance, the request can be elaborated into a full PRD.
    """
    service = get_feature_request_service()
    request = service.accept_request(
        request_id,
        reviewer_id,
        data.reviewer_notes,
        data.priority,
    )

    if not request:
        raise HTTPException(status_code=404, detail="Feature request not found")

    return TriageActionResponse(
        id=request.id,
        status=request.status,
        message="Request has been accepted",
    )


@router.post("/requests/{request_id}/reject", response_model=TriageActionResponse)
async def reject_request(request_id: str, data: TriageReject, reviewer_id: str):
    """
    Reject a feature request.

    Provide a reason so the requester understands why.
    """
    service = get_feature_request_service()
    request = service.reject_request(
        request_id,
        reviewer_id,
        data.rejection_reason,
    )

    if not request:
        raise HTTPException(status_code=404, detail="Feature request not found")

    return TriageActionResponse(
        id=request.id,
        status=request.status,
        message="Request has been rejected",
    )


@router.post("/requests/{request_id}/merge", response_model=TriageActionResponse)
async def merge_request(request_id: str, data: TriageMerge, reviewer_id: str):
    """
    Merge a feature request into another.

    Use this when two requests are essentially the same.
    """
    service = get_feature_request_service()
    request = service.merge_request(
        request_id,
        data.merge_into_request_id,
        reviewer_id,
        data.reviewer_notes,
    )

    if not request:
        raise HTTPException(status_code=404, detail="Feature request not found")

    return TriageActionResponse(
        id=request.id,
        status=request.status,
        message=f"Request has been merged into {data.merge_into_request_id}",
    )


@router.post("/requests/{request_id}/elaborate", response_model=ElaborateResponse)
async def elaborate_request(request_id: str, data: ElaborateRequest):
    """
    Convert an accepted feature request into a full PRD.

    This creates a new PRD document based on the request content
    and AI-generated skeleton.
    """
    service = get_feature_request_service()
    result = service.elaborate_to_prd(
        request_id,
        use_skeleton=data.use_skeleton,
        additional_sections=data.additional_sections,
        prd_name=data.prd_name,
    )

    if not result:
        raise HTTPException(
            status_code=400,
            detail="Cannot elaborate request. Ensure it exists and has been accepted.",
        )

    return ElaborateResponse(**result)
