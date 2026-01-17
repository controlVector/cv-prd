"""
Orchestrator service that coordinates all operations for PRD processing
"""

from app.models.prd_models import PRD, Chunk
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.graph_service import GraphService
from app.services.database_service import DatabaseService
from app.services.chunking_service import ChunkingService
from app.core.config import settings
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class PRDOrchestrator:
    """Orchestrates the complete workflow for PRD processing"""

    def __init__(self):
        self.embedding_service = EmbeddingService(model_name=settings.EMBEDDING_MODEL)

        # Initialize Qdrant - uses local mode if QDRANT_LOCAL_PATH is set or in DESKTOP_MODE
        self.vector_service = VectorService(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            collection_name=settings.QDRANT_COLLECTION,
            vector_size=settings.EMBEDDING_DIMENSION,
            local_path=settings.QDRANT_LOCAL_PATH,
        )

        if settings.DESKTOP_MODE:
            logger.info("Running in DESKTOP MODE - using embedded services")

        # Database service (PostgreSQL or SQLite based on DATABASE_URL)
        self.db_service: Optional[DatabaseService] = None
        try:
            self.db_service = DatabaseService()
            db_type = "SQLite" if "sqlite" in settings.DATABASE_URL else "PostgreSQL"
            logger.info(f"{db_type} database service initialized")
        except Exception as e:
            logger.warning(f"Could not initialize database service: {e}")
            logger.info("Running without database persistence")

        # Graph service is optional (disabled in desktop mode on Windows, or if FALKORDB_ENABLED=false)
        self.graph_service: Optional[GraphService] = None
        if settings.FALKORDB_ENABLED:
            try:
                self.graph_service = GraphService(
                    url=settings.FALKORDB_URL,
                    database=settings.FALKORDB_DATABASE,
                )
                logger.info("FalkorDB graph service initialized")
            except Exception as e:
                logger.warning(f"Could not initialize graph service: {e}")
                logger.info("Running without graph features")
        else:
            logger.info("FalkorDB disabled - running without graph features")

    def process_prd(self, prd: PRD, source_file: Optional[str] = None) -> Dict[str, Any]:
        """
        Complete workflow for processing a new PRD

        Args:
            prd: PRD object to process
            source_file: Optional source filename for uploaded documents

        Returns:
            Dictionary with processing results
        """
        logger.info(f"Processing PRD: {prd.name}")

        # 1. Save PRD to PostgreSQL (if enabled)
        if self.db_service:
            try:
                self.db_service.create_prd(
                    prd_id=prd.id,
                    name=prd.name,
                    description=prd.description,
                    raw_content=prd.content,
                    source_file=source_file,
                )
                # Save sections
                for idx, section in enumerate(prd.sections):
                    self.db_service.create_section(
                        prd_id=prd.id,
                        title=section.title,
                        content=section.content,
                        priority=section.priority.value,
                        tags=section.tags,
                        order_index=idx,
                    )
                logger.info(f"Saved PRD to PostgreSQL: {prd.id}")
            except Exception as e:
                logger.warning(f"Failed to save PRD to PostgreSQL: {e}")

        # 2. Chunk the PRD
        chunks = ChunkingService.chunk_prd(prd)
        logger.info(f"Created {len(chunks)} chunks")

        # 3. Create PRD node in graph (if enabled)
        if self.graph_service:
            self.graph_service.create_prd_node(
                prd_id=prd.id, prd_data={"name": prd.name, "description": prd.description}
            )

        # 4. Process each chunk
        for chunk in chunks:
            # Generate embedding
            full_text = f"{chunk.context_prefix} - {chunk.text}"
            vector = self.embedding_service.embed_text(full_text)

            # Index in Qdrant
            payload = {
                "chunk_id": chunk.id,
                "prd_id": chunk.prd_id,
                "chunk_type": chunk.chunk_type.value,
                "text": chunk.text,
                "context": full_text,
                "priority": chunk.priority.value,
                "tags": chunk.tags,
                "section_title": chunk.metadata.get("section_title", ""),
            }
            self.vector_service.index_chunk(
                chunk_id=chunk.id, vector=vector, payload=payload
            )

            # Save chunk to PostgreSQL (if enabled)
            if self.db_service:
                try:
                    self.db_service.create_chunk(
                        chunk_id=chunk.id,
                        prd_id=chunk.prd_id,
                        chunk_type=chunk.chunk_type.value,
                        text=chunk.text,
                        context_prefix=chunk.context_prefix,
                        priority=chunk.priority.value,
                        tags=chunk.tags,
                        metadata=chunk.metadata,
                        vector_id=chunk.id,  # Same as chunk_id in Qdrant
                    )
                except Exception as e:
                    logger.warning(f"Failed to save chunk to PostgreSQL: {e}")

            # Create node in FalkorDB (if enabled)
            if self.graph_service:
                self.graph_service.create_chunk_node(
                    chunk_id=chunk.id,
                    chunk_data={
                        "type": chunk.chunk_type.value,
                        "text": chunk.text,
                        "priority": chunk.priority.value,
                        "context": chunk.context_prefix,
                    },
                )

                # Link to PRD
                self.graph_service.link_chunk_to_prd(chunk_id=chunk.id, prd_id=prd.id)

        # 4. Detect and create relationships (if graph enabled)
        relationships = []
        if self.graph_service:
            relationships = ChunkingService.detect_relationships(chunks)
            logger.info(f"Found {len(relationships)} relationships")

            for source_id, target_id, rel_type in relationships:
                self.graph_service.create_relationship(
                    source_id=source_id,
                    target_id=target_id,
                    rel_type=rel_type,
                    properties={"strength": 0.8},
                )

        # 5. Get statistics
        stats = self.graph_service.get_graph_stats() if self.graph_service else {}
        collection_info = self.vector_service.get_collection_info()

        return {
            "prd_id": prd.id,
            "prd_name": prd.name,
            "chunks_created": len(chunks),
            "relationships_created": len(relationships),
            "graph_stats": stats,
            "vector_stats": collection_info,
            "chunks": [
                {
                    "id": c.id,
                    "type": c.chunk_type.value,
                    "text": c.text,
                    "priority": c.priority.value,
                    "tags": c.tags,
                }
                for c in chunks
            ],
        }

    def search_semantic(
        self,
        query: str,
        limit: int = 10,
        prd_id: str = None,
        filters: Dict[str, Any] = None,
    ) -> List[Dict[str, Any]]:
        """
        Perform semantic search across chunks

        Args:
            query: Search query
            limit: Maximum results
            prd_id: Optional PRD ID filter
            filters: Optional additional filters

        Returns:
            List of search results
        """
        # Generate query embedding
        query_vector = self.embedding_service.embed_text(query)

        # Build filters
        search_filters = filters or {}
        if prd_id:
            search_filters["prd_id"] = prd_id

        # Search
        results = self.vector_service.search(
            query_vector=query_vector,
            limit=limit,
            score_threshold=0.0,
            filters=search_filters,
        )

        return results

    def get_chunk_context(self, chunk_id: str, max_depth: int = 2) -> Dict[str, Any]:
        """
        Get full context for a chunk including dependencies and related chunks

        Args:
            chunk_id: Chunk ID
            max_depth: Maximum graph traversal depth

        Returns:
            Context dictionary
        """
        if not self.graph_service:
            return {
                "chunk_id": chunk_id,
                "relationships": {},
                "dependencies": [],
                "dependents": [],
                "note": "Graph features disabled"
            }

        # Get graph relationships
        relationships = self.graph_service.get_all_relationships(chunk_id)

        # Get dependencies
        dependencies = self.graph_service.get_dependencies(
            chunk_id, depth=max_depth, direction="outgoing"
        )

        # Get dependents (things that depend on this)
        dependents = self.graph_service.get_dependencies(
            chunk_id, depth=max_depth, direction="incoming"
        )

        return {
            "chunk_id": chunk_id,
            "relationships": relationships,
            "dependencies": dependencies,
            "dependents": dependents,
        }

    def get_all_prds(self) -> List[Dict[str, Any]]:
        """
        Get all PRDs - tries graph first, falls back to PostgreSQL

        Returns:
            List of PRD summaries
        """
        # Try graph first (has chunk counts)
        if self.graph_service:
            try:
                return self.graph_service.get_all_prds()
            except Exception as e:
                logger.warning(f"Failed to get PRDs from graph: {e}")

        # Fall back to PostgreSQL
        if self.db_service:
            try:
                return self.db_service.get_all_prds()
            except Exception as e:
                logger.warning(f"Failed to get PRDs from database: {e}")

        logger.info("No data services available, returning empty PRD list")
        return []

    def get_prd_details(self, prd_id: str) -> Optional[Dict[str, Any]]:
        """
        Get detailed information about a PRD - tries graph first, falls back to PostgreSQL

        Args:
            prd_id: PRD ID

        Returns:
            PRD details including chunks and statistics
        """
        # Try graph first
        if self.graph_service:
            try:
                result = self.graph_service.get_prd_details(prd_id)
                if result:
                    return result
            except Exception as e:
                logger.warning(f"Failed to get PRD details from graph: {e}")

        # Fall back to PostgreSQL
        if self.db_service:
            try:
                return self.db_service.get_prd_details(prd_id)
            except Exception as e:
                logger.warning(f"Failed to get PRD details from database: {e}")

        return None

    def delete_prd(self, prd_id: str) -> bool:
        """
        Delete a PRD from all storage systems

        Args:
            prd_id: PRD ID to delete

        Returns:
            True if successful
        """
        success = True

        # Delete from PostgreSQL
        if self.db_service:
            try:
                self.db_service.delete_prd(prd_id)
                logger.info(f"Deleted PRD from PostgreSQL: {prd_id}")
            except Exception as e:
                logger.warning(f"Failed to delete PRD from PostgreSQL: {e}")
                success = False

        # Delete from graph
        if self.graph_service:
            try:
                self.graph_service.delete_prd(prd_id)
                logger.info(f"Deleted PRD from FalkorDB: {prd_id}")
            except Exception as e:
                logger.warning(f"Failed to delete PRD from graph: {e}")
                success = False

        # Note: Qdrant chunks would need to be deleted too in production
        # For now, they will be orphaned

        return success

    def close(self):
        """Close all service connections"""
        if self.graph_service:
            self.graph_service.close()
        if self.db_service:
            self.db_service.close()
