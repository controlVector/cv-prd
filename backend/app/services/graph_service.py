from neo4j import GraphDatabase
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class GraphService:
    """Service for managing knowledge graph in Neo4j"""

    def __init__(self, uri: str, user: str, password: str):
        logger.info(f"Connecting to Neo4j at {uri}")
        self.driver = GraphDatabase.driver(uri, auth=(user, password))
        self._ensure_constraints()

    def close(self):
        """Close the database connection"""
        self.driver.close()

    def _ensure_constraints(self):
        """Create necessary constraints and indexes"""
        with self.driver.session() as session:
            # Create unique constraints
            session.run(
                """
                CREATE CONSTRAINT chunk_id_unique IF NOT EXISTS
                FOR (c:Chunk) REQUIRE c.id IS UNIQUE
            """
            )

            session.run(
                """
                CREATE CONSTRAINT prd_id_unique IF NOT EXISTS
                FOR (p:PRD) REQUIRE p.id IS UNIQUE
            """
            )

            # Create indexes
            session.run(
                """
                CREATE INDEX chunk_type_idx IF NOT EXISTS
                FOR (c:Chunk) ON (c.type)
            """
            )

            logger.info("Neo4j constraints and indexes created")

    def create_prd_node(self, prd_id: str, prd_data: Dict[str, Any]) -> None:
        """
        Create a PRD node

        Args:
            prd_id: Unique identifier for the PRD
            prd_data: PRD metadata
        """
        with self.driver.session() as session:
            session.execute_write(self._create_prd_tx, prd_id, prd_data)
        logger.info(f"Created PRD node: {prd_id}")

    @staticmethod
    def _create_prd_tx(tx, prd_id: str, data: Dict[str, Any]):
        query = """
        MERGE (p:PRD {id: $id})
        SET p.name = $name,
            p.description = $description
        RETURN p
        """
        tx.run(
            query,
            id=prd_id,
            name=data.get("name", ""),
            description=data.get("description", ""),
        )

    def create_chunk_node(self, chunk_id: str, chunk_data: Dict[str, Any]) -> None:
        """
        Create a chunk node

        Args:
            chunk_id: Unique identifier for the chunk
            chunk_data: Chunk metadata
        """
        with self.driver.session() as session:
            session.execute_write(self._create_chunk_tx, chunk_id, chunk_data)
        logger.info(f"Created chunk node: {chunk_id}")

    @staticmethod
    def _create_chunk_tx(tx, chunk_id: str, data: Dict[str, Any]):
        query = """
        MERGE (c:Chunk {id: $id})
        SET c.type = $type,
            c.text = $text,
            c.priority = $priority,
            c.context = $context
        RETURN c
        """
        tx.run(
            query,
            id=chunk_id,
            type=data.get("type", ""),
            text=data.get("text", ""),
            priority=data.get("priority", "medium"),
            context=data.get("context", ""),
        )

    def link_chunk_to_prd(self, chunk_id: str, prd_id: str) -> None:
        """Create BELONGS_TO relationship between chunk and PRD"""
        with self.driver.session() as session:
            session.execute_write(self._link_chunk_to_prd_tx, chunk_id, prd_id)
        logger.info(f"Linked chunk {chunk_id} to PRD {prd_id}")

    @staticmethod
    def _link_chunk_to_prd_tx(tx, chunk_id: str, prd_id: str):
        query = """
        MATCH (c:Chunk {id: $chunk_id})
        MATCH (p:PRD {id: $prd_id})
        MERGE (c)-[:BELONGS_TO]->(p)
        """
        tx.run(query, chunk_id=chunk_id, prd_id=prd_id)

    def create_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Create a relationship between two chunks

        Args:
            source_id: Source chunk ID
            target_id: Target chunk ID
            rel_type: Type of relationship (DEPENDS_ON, REFERENCES, etc.)
            properties: Optional properties for the relationship
        """
        with self.driver.session() as session:
            session.execute_write(
                self._create_relationship_tx,
                source_id,
                target_id,
                rel_type,
                properties or {},
            )
        logger.info(f"Created {rel_type} relationship: {source_id} -> {target_id}")

    @staticmethod
    def _create_relationship_tx(tx, source_id, target_id, rel_type, props):
        query = f"""
        MATCH (c1:Chunk {{id: $source}})
        MATCH (c2:Chunk {{id: $target}})
        MERGE (c1)-[r:{rel_type}]->(c2)
        SET r += $props
        RETURN r
        """
        tx.run(query, source=source_id, target=target_id, props=props)

    def get_dependencies(
        self, chunk_id: str, depth: int = 3, direction: str = "outgoing"
    ) -> List[Dict[str, Any]]:
        """
        Get dependencies of a chunk

        Args:
            chunk_id: Chunk ID to query
            depth: Maximum depth to traverse
            direction: 'outgoing' (dependencies) or 'incoming' (dependents)

        Returns:
            List of dependent chunks with distances
        """
        with self.driver.session() as session:
            result = session.execute_read(
                self._get_dependencies_tx, chunk_id, depth, direction
            )
        return result

    @staticmethod
    def _get_dependencies_tx(tx, chunk_id, depth, direction):
        arrow = "->" if direction == "outgoing" else "<-"
        query = f"""
        MATCH path = (c:Chunk {{id: $chunk_id}})-[:DEPENDS_ON*1..{depth}]{arrow}(dep:Chunk)
        RETURN dep.id as chunk_id,
               dep.type as type,
               dep.text as text,
               dep.priority as priority,
               length(path) as distance
        ORDER BY distance
        """
        result = tx.run(query, chunk_id=chunk_id)
        return [dict(record) for record in result]

    def get_all_relationships(self, chunk_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all relationships for a chunk

        Args:
            chunk_id: Chunk ID to query

        Returns:
            Dictionary with relationship types as keys
        """
        with self.driver.session() as session:
            result = session.execute_read(self._get_all_relationships_tx, chunk_id)
        return result

    @staticmethod
    def _get_all_relationships_tx(tx, chunk_id):
        query = """
        MATCH (c:Chunk {id: $chunk_id})
        OPTIONAL MATCH (c)-[:DEPENDS_ON]->(dep:Chunk)
        OPTIONAL MATCH (c)-[:REFERENCES]->(ref:Chunk)
        OPTIONAL MATCH (c)<-[:DEPENDS_ON]-(dependent:Chunk)
        OPTIONAL MATCH (c)-[:PARENT_OF]->(child:Chunk)
        RETURN
            collect(DISTINCT {id: dep.id, text: dep.text, type: dep.type}) as dependencies,
            collect(DISTINCT {id: ref.id, text: ref.text, type: ref.type}) as references,
            collect(DISTINCT {id: dependent.id, text: dependent.text, type: dependent.type}) as dependents,
            collect(DISTINCT {id: child.id, text: child.text, type: child.type}) as children
        """
        result = tx.run(query, chunk_id=chunk_id)
        record = result.single()

        if record:
            return {
                "dependencies": [r for r in record["dependencies"] if r["id"]],
                "references": [r for r in record["references"] if r["id"]],
                "dependents": [r for r in record["dependents"] if r["id"]],
                "children": [r for r in record["children"] if r["id"]],
            }
        return {
            "dependencies": [],
            "references": [],
            "dependents": [],
            "children": [],
        }

    def find_related_chunks(
        self, chunk_id: str, max_results: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Find chunks related to the given chunk through any relationship

        Args:
            chunk_id: Chunk ID to query
            max_results: Maximum number of results

        Returns:
            List of related chunks
        """
        with self.driver.session() as session:
            result = session.execute_read(
                self._find_related_chunks_tx, chunk_id, max_results
            )
        return result

    @staticmethod
    def _find_related_chunks_tx(tx, chunk_id, max_results):
        query = """
        MATCH (c:Chunk {id: $chunk_id})-[r]-(related:Chunk)
        RETURN DISTINCT related.id as chunk_id,
               related.text as text,
               related.type as type,
               type(r) as relationship_type,
               related.priority as priority
        LIMIT $limit
        """
        result = tx.run(query, chunk_id=chunk_id, limit=max_results)
        return [dict(record) for record in result]

    def get_graph_stats(self) -> Dict[str, Any]:
        """Get statistics about the knowledge graph"""
        with self.driver.session() as session:
            result = session.execute_read(self._get_stats_tx)
        return result

    @staticmethod
    def _get_stats_tx(tx):
        query = """
        MATCH (c:Chunk)
        OPTIONAL MATCH ()-[r:DEPENDS_ON]->()
        OPTIONAL MATCH ()-[r2:REFERENCES]->()
        RETURN count(DISTINCT c) as total_chunks,
               count(DISTINCT r) as dependency_count,
               count(DISTINCT r2) as reference_count
        """
        result = tx.run(query)
        record = result.single()
        return dict(record) if record else {}

    def clear_all(self) -> None:
        """Clear all data from the graph (use with caution!)"""
        with self.driver.session() as session:
            session.run("MATCH (n) DETACH DELETE n")
        logger.warning("Cleared all data from Neo4j")
