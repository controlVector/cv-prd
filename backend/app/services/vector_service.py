from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    Filter,
    FieldCondition,
    MatchValue,
    MatchAny,
)
from typing import List, Dict, Any, Optional
import logging
import os

logger = logging.getLogger(__name__)


class VectorService:
    """Service for managing vector embeddings in Qdrant"""

    def __init__(
        self,
        host: str = "localhost",
        port: int = 6333,
        collection_name: str = "prd_chunks",
        vector_size: int = 384,
        local_path: Optional[str] = None,
    ):
        self.collection_name = collection_name
        self.vector_size = vector_size

        # Determine if we should use local mode (embedded Qdrant)
        # Priority: local_path param > QDRANT_LOCAL_PATH env > DESKTOP_MODE env > remote server
        if local_path:
            self._init_local(local_path)
        elif os.getenv("QDRANT_LOCAL_PATH"):
            self._init_local(os.getenv("QDRANT_LOCAL_PATH"))
        elif os.getenv("DESKTOP_MODE", "").lower() == "true":
            # Desktop mode: use local storage in user's data directory
            data_dir = self._get_data_dir()
            self._init_local(os.path.join(data_dir, "qdrant"))
        else:
            # Server mode: connect to remote Qdrant
            self._init_remote(host, port)

        self._ensure_collection()

    def _get_data_dir(self) -> str:
        """Get the application data directory for the current platform."""
        if os.name == 'nt':  # Windows
            base = os.environ.get('LOCALAPPDATA', os.path.expanduser('~'))
            data_dir = os.path.join(base, 'cvprd', 'data')
        elif os.uname().sysname == 'Darwin':  # macOS
            data_dir = os.path.expanduser('~/Library/Application Support/cvprd/data')
        else:  # Linux
            data_dir = os.path.expanduser('~/.local/share/cvprd/data')

        os.makedirs(data_dir, exist_ok=True)
        return data_dir

    def _init_local(self, path: str) -> None:
        """Initialize Qdrant in local/embedded mode with file storage."""
        os.makedirs(path, exist_ok=True)
        logger.info(f"Initializing Qdrant in local mode at: {path}")
        self.client = QdrantClient(path=path)
        self.is_local = True

    def _init_remote(self, host: str, port: int) -> None:
        """Initialize Qdrant connection to remote server."""
        logger.info(f"Connecting to Qdrant server at {host}:{port}")
        self.client = QdrantClient(host=host, port=port)
        self.is_local = False

    def _ensure_collection(self):
        """Create collection if it doesn't exist or has wrong dimensions"""
        collections = self.client.get_collections().collections
        collection_names = [c.name for c in collections]

        if self.collection_name in collection_names:
            # Check if existing collection has correct dimensions
            try:
                collection_info = self.client.get_collection(self.collection_name)
                existing_size = collection_info.config.params.vectors.size
                if existing_size != self.vector_size:
                    logger.warning(
                        f"Collection {self.collection_name} has wrong dimensions "
                        f"({existing_size} vs {self.vector_size}). Recreating..."
                    )
                    self.client.delete_collection(self.collection_name)
                else:
                    logger.info(f"Collection {self.collection_name} already exists with correct dimensions")
                    return
            except Exception as e:
                logger.warning(f"Could not verify collection dimensions: {e}")
                return

        logger.info(f"Creating collection: {self.collection_name} with {self.vector_size} dimensions")
        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(
                size=self.vector_size, distance=Distance.COSINE
            ),
        )
        logger.info("Collection created successfully")

    def index_chunk(
        self, chunk_id: str, vector: List[float], payload: Dict[str, Any]
    ) -> None:
        """
        Index a single chunk with its embedding

        Args:
            chunk_id: Unique identifier for the chunk
            vector: Embedding vector
            payload: Metadata to store with the vector
        """
        point = PointStruct(id=chunk_id, vector=vector, payload=payload)

        self.client.upsert(collection_name=self.collection_name, points=[point])

        logger.info(f"Indexed chunk: {chunk_id}")

    def index_batch(self, points: List[Dict[str, Any]]) -> None:
        """
        Index multiple chunks at once

        Args:
            points: List of dicts with 'id', 'vector', and 'payload'
        """
        qdrant_points = [
            PointStruct(id=p["id"], vector=p["vector"], payload=p["payload"])
            for p in points
        ]

        self.client.upsert(collection_name=self.collection_name, points=qdrant_points)

        logger.info(f"Indexed {len(points)} chunks")

    def search(
        self,
        query_vector: List[float],
        limit: int = 10,
        score_threshold: float = 0.0,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Search for similar chunks

        Args:
            query_vector: Query embedding vector
            limit: Maximum number of results
            score_threshold: Minimum similarity score (0-1)
            filters: Optional filters for metadata

        Returns:
            List of search results with scores and payloads
        """
        # Build filter if provided
        query_filter = None
        if filters:
            conditions = []

            if "prd_id" in filters:
                conditions.append(
                    FieldCondition(
                        key="prd_id", match=MatchValue(value=filters["prd_id"])
                    )
                )

            if "chunk_type" in filters:
                if isinstance(filters["chunk_type"], list):
                    conditions.append(
                        FieldCondition(
                            key="chunk_type", match=MatchAny(any=filters["chunk_type"])
                        )
                    )
                else:
                    conditions.append(
                        FieldCondition(
                            key="chunk_type",
                            match=MatchValue(value=filters["chunk_type"]),
                        )
                    )

            if "priority" in filters:
                if isinstance(filters["priority"], list):
                    conditions.append(
                        FieldCondition(
                            key="priority", match=MatchAny(any=filters["priority"])
                        )
                    )
                else:
                    conditions.append(
                        FieldCondition(
                            key="priority", match=MatchValue(value=filters["priority"])
                        )
                    )

            if "tags" in filters:
                conditions.append(
                    FieldCondition(key="tags", match=MatchAny(any=filters["tags"]))
                )

            if conditions:
                query_filter = Filter(must=conditions)

        # Perform search using query_points (new Qdrant API)
        results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=limit,
            score_threshold=score_threshold if score_threshold > 0 else None,
            query_filter=query_filter,
        )

        # Format results - query_points returns QueryResponse with .points
        formatted_results = []
        for hit in results.points:
            formatted_results.append(
                {"chunk_id": hit.id, "score": hit.score, "payload": hit.payload}
            )

        logger.info(f"Found {len(formatted_results)} results")
        return formatted_results

    def delete_chunk(self, chunk_id: str) -> None:
        """Delete a chunk from the vector database"""
        self.client.delete(collection_name=self.collection_name, points_selector=[chunk_id])
        logger.info(f"Deleted chunk: {chunk_id}")

    def get_collection_info(self) -> Dict[str, Any]:
        """Get information about the collection"""
        info = self.client.get_collection(collection_name=self.collection_name)
        # Qdrant API changed - vectors_count may be in different locations
        vectors_count = getattr(info, 'vectors_count', None)
        if vectors_count is None:
            vectors_count = getattr(info, 'points_count', 0)
        points_count = getattr(info, 'points_count', 0)
        return {
            "name": self.collection_name,
            "vectors_count": vectors_count,
            "points_count": points_count,
        }
