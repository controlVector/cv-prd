"""
Orchestrator service that coordinates all operations for PRD processing
"""

from app.models.prd_models import PRD, Chunk
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.graph_service import GraphService
from app.services.chunking_service import ChunkingService
from app.core.config import settings
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)


class PRDOrchestrator:
    """Orchestrates the complete workflow for PRD processing"""

    def __init__(self):
        self.embedding_service = EmbeddingService(model_name=settings.EMBEDDING_MODEL)
        self.vector_service = VectorService(
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            collection_name=settings.QDRANT_COLLECTION,
            vector_size=settings.EMBEDDING_DIMENSION,
        )
        # Graph service is optional (disabled in desktop mode)
        self.graph_service = None
        if settings.NEO4J_ENABLED:
            try:
                self.graph_service = GraphService(
                    uri=settings.NEO4J_URI,
                    user=settings.NEO4J_USER,
                    password=settings.NEO4J_PASSWORD,
                )
                logger.info("Graph service initialized")
            except Exception as e:
                logger.warning(f"Could not initialize graph service: {e}")
                logger.info("Running without graph features")

    def process_prd(self, prd: PRD) -> Dict[str, Any]:
        """
        Complete workflow for processing a new PRD

        Args:
            prd: PRD object to process

        Returns:
            Dictionary with processing results
        """
        logger.info(f"Processing PRD: {prd.name}")

        # 1. Chunk the PRD
        chunks = ChunkingService.chunk_prd(prd)
        logger.info(f"Created {len(chunks)} chunks")

        # 2. Create PRD node in graph (if enabled)
        if self.graph_service:
            self.graph_service.create_prd_node(
                prd_id=prd.id, prd_data={"name": prd.name, "description": prd.description}
            )

        # 3. Process each chunk
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

            # Create node in Neo4j (if enabled)
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
        # Get the chunk from vector store
        # (In production, you'd also store chunks in PostgreSQL)

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
        Get all PRDs from the graph

        Returns:
            List of PRD summaries
        """
        if not self.graph_service:
            # In desktop mode without Neo4j, return empty list
            # In production, you'd query PostgreSQL
            logger.info("Graph service not available, returning empty PRD list")
            return []

        # This is a simple implementation
        # In production, you'd query PostgreSQL
        with self.graph_service.driver.session() as session:
            result = session.run(
                """
                MATCH (p:PRD)
                OPTIONAL MATCH (p)<-[:BELONGS_TO]-(c:Chunk)
                RETURN p.id as id,
                       p.name as name,
                       p.description as description,
                       count(c) as chunk_count
                ORDER BY p.name
            """
            )
            return [dict(record) for record in result]

    def get_prd_details(self, prd_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a PRD

        Args:
            prd_id: PRD ID

        Returns:
            PRD details including chunks and statistics
        """
        if not self.graph_service:
            logger.info("Graph service not available")
            return None

        with self.graph_service.driver.session() as session:
            # Get PRD info
            prd_result = session.run(
                """
                MATCH (p:PRD {id: $prd_id})
                OPTIONAL MATCH (p)<-[:BELONGS_TO]-(c:Chunk)
                RETURN p.id as id,
                       p.name as name,
                       p.description as description,
                       collect({
                           id: c.id,
                           type: c.type,
                           text: c.text,
                           priority: c.priority
                       }) as chunks
            """,
                prd_id=prd_id,
            )

            record = prd_result.single()
            if not record:
                return None

            return dict(record)

    def close(self):
        """Close all service connections"""
        if self.graph_service:
            self.graph_service.close()
