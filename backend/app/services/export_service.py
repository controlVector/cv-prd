"""
Export Service for cv-prd

Exports PRD data in various formats:
- .cv (cv-git compatible format with graph nodes, edges, and vectors)
- .md (Markdown document)
- .pdf (PDF report) - future

Export types:
- "structure": Nodes and edges only (lightweight, ~100KB)
- "full": Includes vector embeddings (~5-20MB)
"""

import json
import os
import tempfile
import shutil
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from enum import Enum
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class ExportFormat(str, Enum):
    """Supported export formats"""
    CV = "cv"  # cv-git compatible
    MARKDOWN = "md"
    PDF = "pdf"


class ExportType(str, Enum):
    """Export content types"""
    STRUCTURE = "structure"  # Nodes and edges only
    FULL = "full"  # Include embeddings


class ExportManifest(BaseModel):
    """Manifest for .cv export"""
    version: str = "1.0.0"
    format: str = "cv-prd-export"
    exportType: str
    created: str
    source: Dict[str, Any]
    stats: Dict[str, int]
    embedding: Optional[Dict[str, Any]] = None


class ExportService:
    """Service for exporting PRD data"""

    def __init__(
        self,
        graph_service,
        vector_service,
        embedding_service,
        orchestrator
    ):
        self.graph_service = graph_service
        self.vector_service = vector_service
        self.embedding_service = embedding_service
        self.orchestrator = orchestrator

    async def export_cv(
        self,
        prd_ids: Optional[List[str]] = None,
        export_type: ExportType = ExportType.STRUCTURE,
        project_name: str = "cv-prd-export"
    ) -> str:
        """
        Export PRDs to cv-git compatible .cv format

        Args:
            prd_ids: List of PRD IDs to export (None = all)
            export_type: "structure" or "full"
            project_name: Name for the export

        Returns:
            Path to the created export directory
        """
        # Create export directory
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        export_name = f"export-{project_name}-{timestamp}.cv"
        export_dir = os.path.join(tempfile.gettempdir(), export_name)
        os.makedirs(export_dir, exist_ok=True)

        try:
            # Get PRDs to export
            if prd_ids:
                prds = [self.orchestrator.get_prd_details(pid) for pid in prd_ids]
                prds = [p for p in prds if p is not None]
            else:
                prds_data = self.orchestrator.get_all_prds()
                prds = prds_data.get("prds", []) if isinstance(prds_data, dict) else prds_data

            # Create subdirectories
            prds_dir = os.path.join(export_dir, "prds")
            vectors_dir = os.path.join(export_dir, "vectors")
            os.makedirs(prds_dir, exist_ok=True)
            os.makedirs(vectors_dir, exist_ok=True)

            # Export PRD nodes
            prd_nodes = []
            chunk_nodes = []
            link_edges = []
            vectors = []

            for prd in prds:
                prd_id = prd.get("id") or prd.get("prd_id")
                prd_name = prd.get("name", "Unknown")

                # Create PRD node
                prd_node = {
                    "id": f"prd:{prd_id}",
                    "type": "prd",
                    "name": prd_name,
                    "description": prd.get("description", ""),
                    "priority": prd.get("priority", "medium"),
                    "status": prd.get("status", "draft"),
                    "chunkIds": []
                }

                # Get chunks for this PRD
                chunks = prd.get("chunks", [])
                if not chunks:
                    # Try to get from graph
                    try:
                        chunks = self._get_chunks_from_graph(prd_id)
                    except Exception as e:
                        logger.warning(f"Could not get chunks for PRD {prd_id}: {e}")
                        chunks = []

                for chunk in chunks:
                    chunk_id = chunk.get("id") or chunk.get("chunk_id")
                    prd_node["chunkIds"].append(f"chunk:{chunk_id}")

                    # Create chunk node
                    chunk_node = {
                        "id": f"chunk:{chunk_id}",
                        "type": "prd_chunk",
                        "prd_id": prd_id,
                        "chunk_type": chunk.get("chunk_type", "requirement"),
                        "text": chunk.get("text", ""),
                        "priority": chunk.get("priority", "medium"),
                        "tags": chunk.get("tags", []),
                        "metadata": chunk.get("metadata", {})
                    }
                    chunk_nodes.append(chunk_node)

                    # Get implementation links
                    links = chunk.get("implementations", [])
                    for link in links:
                        link_edge = {
                            "source": link.get("symbol_id", link.get("file", "")),
                            "target": f"chunk:{chunk_id}",
                            "type": "implements",
                            "metadata": {
                                "file": link.get("file", ""),
                                "line": link.get("line"),
                                "verified": link.get("verified", False)
                            }
                        }
                        link_edges.append(link_edge)

                    # Get vector if full export
                    if export_type == ExportType.FULL:
                        try:
                            vector_data = self._get_vector_for_chunk(chunk_id)
                            if vector_data:
                                vectors.append({
                                    "id": f"vec:{chunk_id}",
                                    "text": chunk.get("text", ""),
                                    "embedding": vector_data.get("embedding", []),
                                    "metadata": {
                                        "prd_id": prd_id,
                                        "chunk_id": chunk_id,
                                        "chunk_type": chunk.get("chunk_type", "requirement"),
                                        "type": "prd"
                                    }
                                })
                        except Exception as e:
                            logger.warning(f"Could not get vector for chunk {chunk_id}: {e}")

                prd_nodes.append(prd_node)

            # Write JSONL files
            self._write_jsonl(os.path.join(prds_dir, "nodes.jsonl"), prd_nodes)
            self._write_jsonl(os.path.join(prds_dir, "chunks.jsonl"), chunk_nodes)
            self._write_jsonl(os.path.join(prds_dir, "links.jsonl"), link_edges)

            if export_type == ExportType.FULL and vectors:
                self._write_jsonl(os.path.join(vectors_dir, "prds.jsonl"), vectors)

            # Create manifest
            manifest = ExportManifest(
                version="1.0.0",
                format="cv-prd-export",
                exportType=export_type.value,
                created=datetime.utcnow().isoformat() + "Z",
                source={
                    "app": "cv-prd",
                    "version": "0.5.0",
                    "project": project_name
                },
                stats={
                    "prds": len(prd_nodes),
                    "chunks": len(chunk_nodes),
                    "links": len(link_edges),
                    "vectors": len(vectors) if export_type == ExportType.FULL else 0
                },
                embedding={
                    "provider": "openrouter",
                    "model": "openai/text-embedding-3-small",
                    "dimensions": 1536
                } if export_type == ExportType.FULL else None
            )

            with open(os.path.join(export_dir, "manifest.json"), "w") as f:
                f.write(manifest.model_dump_json(indent=2))

            # Create README
            self._create_readme(export_dir, manifest, prd_nodes)

            logger.info(f"Export completed: {export_dir}")
            return export_dir

        except Exception as e:
            # Cleanup on error
            if os.path.exists(export_dir):
                shutil.rmtree(export_dir)
            raise e

    def _get_chunks_from_graph(self, prd_id: str) -> List[Dict]:
        """Get chunks for a PRD from the graph database"""
        query = f"""
        MATCH (p:PRD {{id: '{prd_id}'}})-[:HAS_CHUNK]->(c:Chunk)
        RETURN c
        """
        result = self.graph_service.query(query)
        return [dict(r.get("c", {})) for r in result] if result else []

    def _get_vector_for_chunk(self, chunk_id: str) -> Optional[Dict]:
        """Get vector embedding for a chunk"""
        try:
            # Search by chunk ID
            result = self.vector_service.get_by_id(chunk_id)
            return result
        except:
            return None

    def _write_jsonl(self, filepath: str, items: List[Dict]) -> None:
        """Write items to JSONL file"""
        with open(filepath, "w") as f:
            for item in items:
                f.write(json.dumps(item) + "\n")

    def _create_readme(
        self,
        export_dir: str,
        manifest: ExportManifest,
        prd_nodes: List[Dict]
    ) -> None:
        """Create human-readable README for the export"""
        readme = f"""# cv-prd Export

**Exported:** {manifest.created}
**Format:** {manifest.format} v{manifest.version}
**Type:** {manifest.exportType}

## Statistics

- PRDs: {manifest.stats['prds']}
- Chunks: {manifest.stats['chunks']}
- Implementation Links: {manifest.stats['links']}
- Vectors: {manifest.stats['vectors']}

## PRDs Included

"""
        for prd in prd_nodes:
            readme += f"- **{prd['name']}** (`{prd['id']}`)\n"
            readme += f"  - Chunks: {len(prd.get('chunkIds', []))}\n"

        readme += """

## Usage

### Import to cv-git

```bash
cv import ./export-*.cv
```

Or place in your repository and run:

```bash
cv sync  # Auto-detects and imports PRD data
```

### File Structure

```
{export_name}/
├── manifest.json      # Export metadata
├── prds/
│   ├── nodes.jsonl    # PRD nodes
│   ├── chunks.jsonl   # Requirement chunks
│   └── links.jsonl    # Implementation links
├── vectors/           # Only if "full" export
│   └── prds.jsonl     # Chunk embeddings
└── README.md          # This file
```
"""

        with open(os.path.join(export_dir, "README.md"), "w") as f:
            f.write(readme)

    async def export_markdown(
        self,
        prd_ids: Optional[List[str]] = None,
        include_metadata: bool = True
    ) -> str:
        """Export PRDs as Markdown document"""
        # Get PRDs
        if prd_ids:
            prds = [self.orchestrator.get_prd_details(pid) for pid in prd_ids]
            prds = [p for p in prds if p is not None]
        else:
            prds_data = self.orchestrator.get_all_prds()
            prds = prds_data.get("prds", []) if isinstance(prds_data, dict) else prds_data

        # Generate markdown
        md = "# Product Requirements Documents\n\n"
        md += f"*Exported: {datetime.utcnow().isoformat()}Z*\n\n"
        md += "---\n\n"

        for prd in prds:
            prd_name = prd.get("name", "Unknown PRD")
            prd_desc = prd.get("description", "")

            md += f"## {prd_name}\n\n"
            if prd_desc:
                md += f"{prd_desc}\n\n"

            chunks = prd.get("chunks", [])
            if chunks:
                md += "### Requirements\n\n"
                for chunk in chunks:
                    chunk_type = chunk.get("chunk_type", "requirement")
                    text = chunk.get("text", "")
                    priority = chunk.get("priority", "medium")

                    md += f"- **[{chunk_type.upper()}]** {text}\n"
                    if include_metadata:
                        md += f"  - Priority: {priority}\n"
                        tags = chunk.get("tags", [])
                        if tags:
                            md += f"  - Tags: {', '.join(tags)}\n"
                md += "\n"

            md += "---\n\n"

        # Write to temp file
        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        filepath = os.path.join(tempfile.gettempdir(), f"prds-{timestamp}.md")
        with open(filepath, "w") as f:
            f.write(md)

        return filepath
