"""
Database service for PostgreSQL PRD persistence.

Provides CRUD operations for PRDs, sections, and chunks.
Works alongside FalkorDB (graph) and Qdrant (vectors).
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from typing import List, Dict, Any, Optional
import logging
import uuid

from app.models.db_models import Base, PRDModel, PRDSectionModel, ChunkModel
from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabaseService:
    """Service for PostgreSQL database operations"""

    def __init__(self, database_url: Optional[str] = None):
        self.database_url = database_url or settings.DATABASE_URL
        self.engine = create_engine(self.database_url, echo=False)
        self.SessionLocal = sessionmaker(bind=self.engine)
        self._init_db()

    def _init_db(self):
        """Create tables if they don't exist"""
        try:
            Base.metadata.create_all(self.engine)
            logger.info("Database tables initialized")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            raise

    def get_session(self) -> Session:
        """Get a new database session"""
        return self.SessionLocal()

    # =========================================================================
    # PRD Operations
    # =========================================================================

    def create_prd(
        self,
        prd_id: str,
        name: str,
        description: Optional[str] = None,
        raw_content: Optional[str] = None,
        source_file: Optional[str] = None,
    ) -> PRDModel:
        """Create a new PRD"""
        with self.get_session() as session:
            prd = PRDModel(
                id=prd_id,
                name=name,
                description=description,
                raw_content=raw_content,
                source_file=source_file,
            )
            session.add(prd)
            session.commit()
            session.refresh(prd)
            logger.info(f"Created PRD: {name} (ID: {prd_id})")
            return prd

    def get_prd(self, prd_id: str) -> Optional[PRDModel]:
        """Get a PRD by ID"""
        with self.get_session() as session:
            return session.query(PRDModel).filter(PRDModel.id == prd_id).first()

    def get_all_prds(self) -> List[Dict[str, Any]]:
        """Get all PRDs with chunk counts"""
        with self.get_session() as session:
            prds = session.query(PRDModel).all()
            result = []
            for prd in prds:
                chunk_count = session.query(ChunkModel).filter(
                    ChunkModel.prd_id == prd.id
                ).count()
                result.append({
                    **prd.to_dict(),
                    "chunk_count": chunk_count,
                })
            return result

    def get_prd_details(self, prd_id: str) -> Optional[Dict[str, Any]]:
        """Get PRD with all sections and chunks"""
        with self.get_session() as session:
            prd = session.query(PRDModel).filter(PRDModel.id == prd_id).first()
            if not prd:
                return None

            sections = session.query(PRDSectionModel).filter(
                PRDSectionModel.prd_id == prd_id
            ).all()

            chunks = session.query(ChunkModel).filter(
                ChunkModel.prd_id == prd_id
            ).all()

            return {
                **prd.to_dict(),
                "sections": [s.to_dict() for s in sections],
                "chunks": [c.to_dict() for c in chunks],
            }

    def update_prd(
        self,
        prd_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
    ) -> Optional[PRDModel]:
        """Update a PRD"""
        with self.get_session() as session:
            prd = session.query(PRDModel).filter(PRDModel.id == prd_id).first()
            if not prd:
                return None

            if name:
                prd.name = name
            if description:
                prd.description = description

            session.commit()
            session.refresh(prd)
            logger.info(f"Updated PRD: {prd_id}")
            return prd

    def delete_prd(self, prd_id: str) -> bool:
        """Delete a PRD and all related data"""
        with self.get_session() as session:
            prd = session.query(PRDModel).filter(PRDModel.id == prd_id).first()
            if not prd:
                return False

            session.delete(prd)
            session.commit()
            logger.info(f"Deleted PRD: {prd_id}")
            return True

    # =========================================================================
    # Section Operations
    # =========================================================================

    def create_section(
        self,
        prd_id: str,
        title: str,
        content: str,
        priority: str = "medium",
        tags: Optional[List[str]] = None,
        order_index: int = 0,
    ) -> PRDSectionModel:
        """Create a new PRD section"""
        with self.get_session() as session:
            section = PRDSectionModel(
                id=str(uuid.uuid4()),
                prd_id=prd_id,
                title=title,
                content=content,
                priority=priority,
                tags=tags or [],
                order_index=str(order_index),
            )
            session.add(section)
            session.commit()
            session.refresh(section)
            return section

    def get_sections_for_prd(self, prd_id: str) -> List[PRDSectionModel]:
        """Get all sections for a PRD"""
        with self.get_session() as session:
            return session.query(PRDSectionModel).filter(
                PRDSectionModel.prd_id == prd_id
            ).order_by(PRDSectionModel.order_index).all()

    # =========================================================================
    # Chunk Operations
    # =========================================================================

    def create_chunk(
        self,
        chunk_id: str,
        prd_id: str,
        chunk_type: str,
        text: str,
        context_prefix: Optional[str] = None,
        priority: str = "medium",
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        vector_id: Optional[str] = None,
        graph_node_id: Optional[str] = None,
    ) -> ChunkModel:
        """Create a new chunk"""
        with self.get_session() as session:
            chunk = ChunkModel(
                id=chunk_id,
                prd_id=prd_id,
                chunk_type=chunk_type,
                text=text,
                context_prefix=context_prefix,
                priority=priority,
                tags=tags or [],
                chunk_metadata=metadata or {},  # renamed field
                vector_id=vector_id,
                graph_node_id=graph_node_id,
            )
            session.add(chunk)
            session.commit()
            session.refresh(chunk)
            return chunk

    def get_chunks_for_prd(self, prd_id: str) -> List[ChunkModel]:
        """Get all chunks for a PRD"""
        with self.get_session() as session:
            return session.query(ChunkModel).filter(
                ChunkModel.prd_id == prd_id
            ).all()

    def get_chunk(self, chunk_id: str) -> Optional[ChunkModel]:
        """Get a chunk by ID"""
        with self.get_session() as session:
            return session.query(ChunkModel).filter(ChunkModel.id == chunk_id).first()

    def update_chunk_references(
        self,
        chunk_id: str,
        vector_id: Optional[str] = None,
        graph_node_id: Optional[str] = None,
    ) -> Optional[ChunkModel]:
        """Update chunk's vector and graph references"""
        with self.get_session() as session:
            chunk = session.query(ChunkModel).filter(ChunkModel.id == chunk_id).first()
            if not chunk:
                return None

            if vector_id:
                chunk.vector_id = vector_id
            if graph_node_id:
                chunk.graph_node_id = graph_node_id

            session.commit()
            session.refresh(chunk)
            return chunk

    # =========================================================================
    # Bulk Operations
    # =========================================================================

    def bulk_create_chunks(self, chunks: List[Dict[str, Any]]) -> int:
        """Create multiple chunks at once"""
        with self.get_session() as session:
            chunk_models = [
                ChunkModel(
                    id=c["id"],
                    prd_id=c["prd_id"],
                    chunk_type=c["chunk_type"],
                    text=c["text"],
                    context_prefix=c.get("context_prefix"),
                    priority=c.get("priority", "medium"),
                    tags=c.get("tags", []),
                    chunk_metadata=c.get("metadata", {}),  # renamed field
                    vector_id=c.get("vector_id"),
                    graph_node_id=c.get("graph_node_id"),
                )
                for c in chunks
            ]
            session.bulk_save_objects(chunk_models)
            session.commit()
            logger.info(f"Bulk created {len(chunks)} chunks")
            return len(chunks)

    # =========================================================================
    # Statistics
    # =========================================================================

    def get_stats(self) -> Dict[str, int]:
        """Get database statistics"""
        with self.get_session() as session:
            prd_count = session.query(PRDModel).count()
            section_count = session.query(PRDSectionModel).count()
            chunk_count = session.query(ChunkModel).count()

            return {
                "prds": prd_count,
                "sections": section_count,
                "chunks": chunk_count,
            }

    def close(self):
        """Close database connection"""
        self.engine.dispose()
        logger.info("Database connection closed")


# Singleton database service instance
_db_service: Optional[DatabaseService] = None


def get_database_service() -> DatabaseService:
    """Get the global database service instance."""
    global _db_service
    if _db_service is None:
        _db_service = DatabaseService()
    return _db_service


def get_db_session():
    """
    Get a database session as a context manager.

    Usage:
        with get_db_session() as session:
            session.query(...)
    """
    return get_database_service().get_session()
