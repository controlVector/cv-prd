"""
FalkorDB Graph Service for cv-prd

Manages the PRD knowledge graph using FalkorDB (Redis-based graph database).
Compatible with cv-git's graph infrastructure for future integration.
"""

import redis
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class GraphService:
    """Service for managing knowledge graph in FalkorDB"""

    def __init__(self, url: str = "redis://localhost:6379", database: str = "cvprd"):
        """
        Initialize FalkorDB connection.

        Args:
            url: Redis URL (e.g., redis://localhost:6379)
            database: Graph name (default: cvprd)
        """
        logger.info(f"Connecting to FalkorDB at {url}")
        self.url = url
        self.graph_name = database
        self.client: Optional[redis.Redis] = None
        self.available = False  # Track if FalkorDB is actually available
        self._connect()
        if self.available:
            self._ensure_indexes()

    def _connect(self) -> None:
        """Establish connection to FalkorDB via Redis."""
        try:
            self.client = redis.from_url(self.url, decode_responses=True)
            # Test connection
            self.client.ping()
            # Verify FalkorDB module is loaded by trying a simple command
            try:
                self.client.execute_command("GRAPH.LIST")
                self.available = True
                logger.info(f"Connected to FalkorDB, graph: {self.graph_name}")
            except Exception as e:
                if "unknown command" in str(e).lower():
                    logger.warning("Redis connected but FalkorDB module not loaded - graph features disabled")
                    self.available = False
                else:
                    raise
        except Exception as e:
            logger.error(f"Failed to connect to FalkorDB: {e}")
            raise

    def close(self) -> None:
        """Close the database connection."""
        if self.client:
            self.client.close()
            self.client = None
            logger.info("FalkorDB connection closed")

    def _ensure_indexes(self) -> None:
        """Create indexes for better query performance."""
        try:
            # Index on Chunk.id
            self._safe_create_index("Chunk", "id")
            # Index on Chunk.type
            self._safe_create_index("Chunk", "type")
            # Index on PRD.id
            self._safe_create_index("PRD", "id")
            logger.info("FalkorDB indexes created")
        except Exception as e:
            logger.warning(f"Index creation warning: {e}")

    def _safe_create_index(self, label: str, property: str) -> None:
        """Create index if it doesn't exist."""
        try:
            self._query(f"CREATE INDEX FOR (n:{label}) ON (n.{property})")
        except Exception as e:
            # Index might already exist - this is fine
            error_msg = str(e).lower()
            if "already indexed" in error_msg or "already exists" in error_msg:
                pass  # Silently ignore - index exists
            else:
                raise

    def _query(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Execute a Cypher query against FalkorDB.

        Args:
            cypher: Cypher query string
            params: Query parameters

        Returns:
            List of result dictionaries (empty list if FalkorDB unavailable)
        """
        if not self.client:
            logger.warning("FalkorDB client not connected")
            return []

        if not self.available:
            # FalkorDB module not loaded - silently return empty results
            return []

        # Replace parameters in query (FalkorDB style)
        processed_query = cypher
        if params:
            for key, value in params.items():
                placeholder = f"${key}"
                escaped_value = self._escape_value(value)
                processed_query = processed_query.replace(placeholder, escaped_value)

        try:
            # Execute using GRAPH.QUERY command
            result = self.client.execute_command(
                "GRAPH.QUERY",
                self.graph_name,
                processed_query,
                "--compact"
            )
            return self._parse_result(result)
        except Exception as e:
            logger.error(f"Query failed: {e}\nQuery: {cypher[:200]}")
            raise

    def _escape_value(self, value: Any) -> str:
        """Escape value for Cypher query."""
        if value is None:
            return "null"
        if isinstance(value, str):
            # Escape special characters
            escaped = (
                value
                .replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t")
            )
            return f"'{escaped}'"
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (int, float)):
            return str(value)
        if isinstance(value, list):
            return f"[{', '.join(self._escape_value(v) for v in value)}]"
        if isinstance(value, dict):
            props = ", ".join(f"{k}: {self._escape_value(v)}" for k, v in value.items())
            return f"{{{props}}}"
        return str(value)

    def _parse_result(self, result: Any) -> List[Dict[str, Any]]:
        """
        Parse FalkorDB query result.

        FalkorDB returns: [headers, rows, statistics]
        - headers: [[type, name], [type, name], ...]
        - rows: [[[type, value], [type, value], ...], ...]
        """
        if not result or not isinstance(result, list) or len(result) < 2:
            return []

        headers_raw = result[0]
        rows_raw = result[1]

        if not isinstance(headers_raw, list) or not isinstance(rows_raw, list):
            return []

        # Extract column names from headers
        headers = [h[1] if isinstance(h, list) and len(h) > 1 else str(h) for h in headers_raw]

        # Parse rows
        parsed = []
        for row in rows_raw:
            if not isinstance(row, list):
                continue
            obj = {}
            for idx, cell in enumerate(row):
                if idx < len(headers):
                    # cell is [type, value] in compact format
                    if isinstance(cell, list) and len(cell) >= 2:
                        obj[headers[idx]] = self._parse_cell_value(cell)
                    else:
                        obj[headers[idx]] = cell
            parsed.append(obj)

        return parsed

    def _parse_cell_value(self, cell: List) -> Any:
        """Parse a cell value from FalkorDB compact format."""
        if not isinstance(cell, list) or len(cell) < 2:
            return cell

        cell_type = cell[0]
        cell_value = cell[1]

        # Type codes from FalkorDB:
        # 1 = NULL, 2 = STRING, 3 = INTEGER, 4 = BOOLEAN, 5 = DOUBLE
        # 6 = ARRAY, 7 = EDGE, 8 = NODE, 9 = PATH
        if cell_type == 1:  # NULL
            return None
        elif cell_type == 6:  # ARRAY
            return [self._parse_cell_value(v) if isinstance(v, list) else v for v in cell_value]
        elif cell_type == 7:  # EDGE - return properties
            # Edge format: [id, type, src, dest, properties]
            if isinstance(cell_value, list) and len(cell_value) >= 5:
                return cell_value[4] if len(cell_value) > 4 else {}
            return cell_value
        elif cell_type == 8:  # NODE - return properties
            # Node format: [id, labels, properties]
            if isinstance(cell_value, list) and len(cell_value) >= 3:
                return cell_value[2] if len(cell_value) > 2 else {}
            return cell_value
        else:
            return cell_value

    # =========================================================================
    # PRD Operations
    # =========================================================================

    def create_prd_node(self, prd_id: str, prd_data: Dict[str, Any]) -> None:
        """Create or update a PRD node."""
        query = """
        MERGE (p:PRD {id: $id})
        SET p.name = $name,
            p.description = $description
        RETURN p
        """
        self._query(query, {
            "id": prd_id,
            "name": prd_data.get("name", ""),
            "description": prd_data.get("description", ""),
        })
        logger.info(f"Created PRD node: {prd_id}")

    # =========================================================================
    # Chunk Operations
    # =========================================================================

    def create_chunk_node(self, chunk_id: str, chunk_data: Dict[str, Any]) -> None:
        """Create or update a Chunk node."""
        query = """
        MERGE (c:Chunk {id: $id})
        SET c.type = $type,
            c.text = $text,
            c.priority = $priority,
            c.context = $context
        RETURN c
        """
        self._query(query, {
            "id": chunk_id,
            "type": chunk_data.get("type", ""),
            "text": chunk_data.get("text", ""),
            "priority": chunk_data.get("priority", "medium"),
            "context": chunk_data.get("context", ""),
        })
        logger.info(f"Created chunk node: {chunk_id}")

    def update_chunk_node(self, chunk_id: str, updates: Dict[str, Any]) -> None:
        """Update an existing Chunk node."""
        # Build SET clause dynamically
        set_clauses = []
        params = {"id": chunk_id}

        for key, value in updates.items():
            if key != "id":
                set_clauses.append(f"c.{key} = ${key}")
                params[key] = value

        if not set_clauses:
            return

        query = f"""
        MATCH (c:Chunk {{id: $id}})
        SET {', '.join(set_clauses)}
        RETURN c
        """
        self._query(query, params)
        logger.info(f"Updated chunk node: {chunk_id}")

    def link_chunk_to_prd(self, chunk_id: str, prd_id: str) -> None:
        """Create BELONGS_TO relationship between chunk and PRD."""
        query = """
        MATCH (c:Chunk {id: $chunk_id})
        MATCH (p:PRD {id: $prd_id})
        MERGE (c)-[:BELONGS_TO]->(p)
        """
        self._query(query, {"chunk_id": chunk_id, "prd_id": prd_id})
        logger.info(f"Linked chunk {chunk_id} to PRD {prd_id}")

    # =========================================================================
    # Relationship Operations
    # =========================================================================

    def create_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Create a relationship between two chunks."""
        # Build properties SET clause
        props_clause = ""
        if properties:
            props_parts = [f"r.{k} = {self._escape_value(v)}" for k, v in properties.items()]
            props_clause = f"SET {', '.join(props_parts)}"

        # Note: FalkorDB requires the relationship type to be literal in the query
        query = f"""
        MATCH (c1:Chunk {{id: $source}})
        MATCH (c2:Chunk {{id: $target}})
        MERGE (c1)-[r:{rel_type}]->(c2)
        {props_clause}
        RETURN r
        """
        self._query(query, {"source": source_id, "target": target_id})
        logger.info(f"Created {rel_type} relationship: {source_id} -> {target_id}")

    # =========================================================================
    # Artifact Relationship Operations (Tests, Docs, Designs)
    # =========================================================================

    def create_tests_relationship(
        self,
        test_chunk_id: str,
        requirement_chunk_id: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Create TESTS relationship: test_case -[:TESTS]-> requirement."""
        self.create_relationship(test_chunk_id, requirement_chunk_id, "TESTS", properties)

    def create_documents_relationship(
        self,
        doc_chunk_id: str,
        requirement_chunk_id: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Create DOCUMENTS relationship: documentation -[:DOCUMENTS]-> requirement."""
        self.create_relationship(doc_chunk_id, requirement_chunk_id, "DOCUMENTS", properties)

    def create_designs_relationship(
        self,
        design_chunk_id: str,
        requirement_chunk_id: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Create DESIGNS relationship: design_spec -[:DESIGNS]-> requirement."""
        self.create_relationship(design_chunk_id, requirement_chunk_id, "DESIGNS", properties)

    def get_tests_for_requirement(self, chunk_id: str) -> List[Dict[str, Any]]:
        """Get all test cases that test a requirement."""
        query = """
        MATCH (test:Chunk)-[:TESTS]->(req:Chunk {id: $chunk_id})
        RETURN test.id as id,
               test.type as type,
               test.text as text,
               test.priority as priority,
               test.context as context
        """
        return self._query(query, {"chunk_id": chunk_id})

    def get_documentation_for_requirement(self, chunk_id: str) -> List[Dict[str, Any]]:
        """Get all documentation chunks that document a requirement."""
        query = """
        MATCH (doc:Chunk)-[:DOCUMENTS]->(req:Chunk {id: $chunk_id})
        RETURN doc.id as id,
               doc.type as type,
               doc.text as text,
               doc.priority as priority,
               doc.context as context
        """
        return self._query(query, {"chunk_id": chunk_id})

    def get_designs_for_requirement(self, chunk_id: str) -> List[Dict[str, Any]]:
        """Get all design artifacts that design a requirement."""
        query = """
        MATCH (design:Chunk)-[:DESIGNS]->(req:Chunk {id: $chunk_id})
        RETURN design.id as id,
               design.type as type,
               design.text as text,
               design.priority as priority,
               design.context as context
        """
        return self._query(query, {"chunk_id": chunk_id})

    def get_all_tests_for_prd(self, prd_id: str) -> List[Dict[str, Any]]:
        """
        Get all test cases for a PRD.

        Returns test cases with their linked requirement info.
        """
        query = """
        MATCH (test:Chunk)-[:TESTS]->(req:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
        RETURN test.id as id,
               test.type as chunk_type,
               test.text as text,
               test.priority as priority,
               test.context as context,
               req.id as source_requirement_id,
               req.text as requirement_text
        ORDER BY test.type, test.priority
        """
        return self._query(query, {"prd_id": prd_id})

    def get_test_coverage(self, prd_id: str) -> Dict[str, Any]:
        """
        Calculate test coverage for a PRD.

        Returns counts and percentages of requirements covered by tests.
        """
        # Get all requirements in PRD
        req_query = """
        MATCH (req:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
        WHERE req.type IN ['requirement', 'feature', 'constraint']
        RETURN count(req) as total_requirements
        """
        req_result = self._query(req_query, {"prd_id": prd_id})
        total_requirements = req_result[0].get("total_requirements", 0) if req_result else 0

        # Get requirements that have tests
        covered_query = """
        MATCH (test:Chunk)-[:TESTS]->(req:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
        WHERE req.type IN ['requirement', 'feature', 'constraint']
        RETURN count(DISTINCT req) as covered_requirements
        """
        covered_result = self._query(covered_query, {"prd_id": prd_id})
        covered_requirements = covered_result[0].get("covered_requirements", 0) if covered_result else 0

        # Get test counts
        test_query = """
        MATCH (test:Chunk)-[:TESTS]->(req:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
        RETURN count(test) as total_tests
        """
        test_result = self._query(test_query, {"prd_id": prd_id})
        total_tests = test_result[0].get("total_tests", 0) if test_result else 0

        coverage_percent = (covered_requirements / total_requirements * 100) if total_requirements > 0 else 0

        return {
            "prd_id": prd_id,
            "total_requirements": total_requirements,
            "covered_requirements": covered_requirements,
            "uncovered_requirements": total_requirements - covered_requirements,
            "total_tests": total_tests,
            "coverage_percent": round(coverage_percent, 2),
        }

    def get_documentation_coverage(self, prd_id: str) -> Dict[str, Any]:
        """
        Calculate documentation coverage for a PRD.

        Returns counts and percentages of requirements covered by documentation.
        """
        # Get all requirements in PRD
        req_query = """
        MATCH (req:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
        WHERE req.type IN ['requirement', 'feature', 'constraint']
        RETURN count(req) as total_requirements
        """
        req_result = self._query(req_query, {"prd_id": prd_id})
        total_requirements = req_result[0].get("total_requirements", 0) if req_result else 0

        # Get requirements that have documentation
        covered_query = """
        MATCH (doc:Chunk)-[:DOCUMENTS]->(req:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
        WHERE req.type IN ['requirement', 'feature', 'constraint']
        RETURN count(DISTINCT req) as covered_requirements
        """
        covered_result = self._query(covered_query, {"prd_id": prd_id})
        covered_requirements = covered_result[0].get("covered_requirements", 0) if covered_result else 0

        # Get doc counts
        doc_query = """
        MATCH (doc:Chunk)-[:DOCUMENTS]->(req:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
        RETURN count(doc) as total_docs
        """
        doc_result = self._query(doc_query, {"prd_id": prd_id})
        total_docs = doc_result[0].get("total_docs", 0) if doc_result else 0

        coverage_percent = (covered_requirements / total_requirements * 100) if total_requirements > 0 else 0

        return {
            "prd_id": prd_id,
            "total_requirements": total_requirements,
            "covered_requirements": covered_requirements,
            "uncovered_requirements": total_requirements - covered_requirements,
            "total_docs": total_docs,
            "coverage_percent": round(coverage_percent, 2),
        }

    def get_full_traceability(self, chunk_id: str, depth: int = 3) -> Dict[str, Any]:
        """
        Get complete traceability for a chunk.

        Returns all related artifacts: dependencies, tests, documentation,
        designs, and code implementations.
        """
        result = {
            "chunk_id": chunk_id,
            "chunk": None,
            "dependencies": [],
            "dependents": [],
            "tests": [],
            "documentation": [],
            "designs": [],
            "implementations": [],
        }

        # Get the chunk itself
        chunk_query = """
        MATCH (c:Chunk {id: $chunk_id})
        RETURN c.id as id, c.type as type, c.text as text,
               c.priority as priority, c.context as context
        """
        chunk_result = self._query(chunk_query, {"chunk_id": chunk_id})
        if chunk_result:
            result["chunk"] = chunk_result[0]

        # Get dependencies (what this chunk depends on)
        deps_query = f"""
        MATCH (c:Chunk {{id: $chunk_id}})-[:DEPENDS_ON*1..{depth}]->(dep:Chunk)
        RETURN DISTINCT dep.id as id, dep.type as type, dep.text as text, dep.priority as priority
        """
        result["dependencies"] = self._query(deps_query, {"chunk_id": chunk_id})

        # Get dependents (what depends on this chunk)
        dependents_query = f"""
        MATCH (dependent:Chunk)-[:DEPENDS_ON*1..{depth}]->(c:Chunk {{id: $chunk_id}})
        RETURN DISTINCT dependent.id as id, dependent.type as type, dependent.text as text, dependent.priority as priority
        """
        result["dependents"] = self._query(dependents_query, {"chunk_id": chunk_id})

        # Get tests
        result["tests"] = self.get_tests_for_requirement(chunk_id)

        # Get documentation
        result["documentation"] = self.get_documentation_for_requirement(chunk_id)

        # Get designs
        result["designs"] = self.get_designs_for_requirement(chunk_id)

        # Get code implementations (Symbol nodes)
        impl_query = """
        MATCH (sym:Symbol)-[:IMPLEMENTS]->(c:Chunk {id: $chunk_id})
        RETURN sym.qualified_name as qualified_name,
               sym.kind as kind,
               sym.file as file
        """
        result["implementations"] = self._query(impl_query, {"chunk_id": chunk_id})

        return result

    # =========================================================================
    # Query Operations
    # =========================================================================

    def get_dependencies(
        self, chunk_id: str, depth: int = 3, direction: str = "outgoing"
    ) -> List[Dict[str, Any]]:
        """Get dependencies of a chunk."""
        # FalkorDB requires different query structure for incoming vs outgoing
        if direction == "outgoing":
            query = f"""
            MATCH (c:Chunk {{id: $chunk_id}})-[:DEPENDS_ON*1..{depth}]->(dep:Chunk)
            RETURN dep.id as chunk_id,
                   dep.type as type,
                   dep.text as text,
                   dep.priority as priority
            """
        else:
            # For incoming dependencies (what depends on this chunk)
            query = f"""
            MATCH (dep:Chunk)-[:DEPENDS_ON*1..{depth}]->(c:Chunk {{id: $chunk_id}})
            RETURN dep.id as chunk_id,
                   dep.type as type,
                   dep.text as text,
                   dep.priority as priority
            """
        return self._query(query, {"chunk_id": chunk_id})

    def get_all_relationships(self, chunk_id: str) -> Dict[str, List[Dict[str, Any]]]:
        """Get all relationships for a chunk."""
        # FalkorDB doesn't support multiple OPTIONAL MATCH with different directions well
        # Query each relationship type separately
        result = {
            "dependencies": [],
            "references": [],
            "dependents": [],
            "children": [],
        }

        # Outgoing DEPENDS_ON (what this chunk depends on)
        deps_query = """
        MATCH (c:Chunk {id: $chunk_id})-[:DEPENDS_ON]->(dep:Chunk)
        RETURN dep.id as id, dep.text as text, dep.type as type
        """
        deps = self._query(deps_query, {"chunk_id": chunk_id})
        result["dependencies"] = [r for r in deps if r.get("id")]

        # Outgoing REFERENCES
        refs_query = """
        MATCH (c:Chunk {id: $chunk_id})-[:REFERENCES]->(ref:Chunk)
        RETURN ref.id as id, ref.text as text, ref.type as type
        """
        refs = self._query(refs_query, {"chunk_id": chunk_id})
        result["references"] = [r for r in refs if r.get("id")]

        # Incoming DEPENDS_ON (what depends on this chunk)
        dependents_query = """
        MATCH (dependent:Chunk)-[:DEPENDS_ON]->(c:Chunk {id: $chunk_id})
        RETURN dependent.id as id, dependent.text as text, dependent.type as type
        """
        dependents = self._query(dependents_query, {"chunk_id": chunk_id})
        result["dependents"] = [r for r in dependents if r.get("id")]

        # Outgoing PARENT_OF
        children_query = """
        MATCH (c:Chunk {id: $chunk_id})-[:PARENT_OF]->(child:Chunk)
        RETURN child.id as id, child.text as text, child.type as type
        """
        children = self._query(children_query, {"chunk_id": chunk_id})
        result["children"] = [r for r in children if r.get("id")]

        return result

    def find_related_chunks(
        self, chunk_id: str, max_results: int = 10
    ) -> List[Dict[str, Any]]:
        """Find chunks related to the given chunk through any relationship."""
        query = """
        MATCH (c:Chunk {id: $chunk_id})-[r]-(related:Chunk)
        RETURN DISTINCT related.id as chunk_id,
               related.text as text,
               related.type as type,
               type(r) as relationship_type,
               related.priority as priority
        LIMIT $limit
        """
        return self._query(query, {"chunk_id": chunk_id, "limit": max_results})

    # =========================================================================
    # PRD List/Detail Operations
    # =========================================================================

    def get_all_prds(self) -> List[Dict[str, Any]]:
        """Get all PRDs with chunk counts (excluding test/doc artifacts)."""
        # Test/doc/design types to exclude from requirement count
        artifact_types = [
            'test_case', 'unit_test_spec', 'integration_test_spec', 'acceptance_criteria',
            'documentation', 'user_manual', 'api_doc', 'technical_spec', 'release_note',
            'design_spec', 'screen_flow', 'wireframe'
        ]
        query = """
        MATCH (p:PRD)
        OPTIONAL MATCH (p)<-[:BELONGS_TO]-(c:Chunk)
        WHERE c.type IS NULL OR NOT c.type IN $artifact_types
        WITH p, count(c) as requirement_count
        OPTIONAL MATCH (p)<-[:BELONGS_TO]-(t:Chunk)
        WHERE t.type IN ['test_case', 'unit_test_spec', 'integration_test_spec', 'acceptance_criteria']
        RETURN p.id as id,
               p.name as name,
               p.description as description,
               requirement_count as chunk_count,
               count(t) as test_count
        ORDER BY p.name
        """
        return self._query(query, {"artifact_types": artifact_types})

    def get_prd_details(self, prd_id: str) -> Optional[Dict[str, Any]]:
        """Get PRD with all its chunks."""
        # Test/doc/design types to exclude from requirement count
        artifact_types = [
            'test_case', 'unit_test_spec', 'integration_test_spec', 'acceptance_criteria',
            'documentation', 'user_manual', 'api_doc', 'technical_spec', 'release_note',
            'design_spec', 'screen_flow', 'wireframe'
        ]
        test_types = ['test_case', 'unit_test_spec', 'integration_test_spec', 'acceptance_criteria']

        # First get the PRD
        prd_query = """
        MATCH (p:PRD {id: $prd_id})
        RETURN p.id as id, p.name as name, p.description as description
        """
        prd_results = self._query(prd_query, {"prd_id": prd_id})
        if not prd_results:
            return None

        result = prd_results[0]

        # Then get chunks separately (FalkorDB handles this better)
        chunks_query = """
        MATCH (c:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id})
        RETURN c.id as id, c.type as type, c.text as text, c.priority as priority
        """
        chunks = self._query(chunks_query, {"prd_id": prd_id})
        all_chunks = [c for c in chunks if c.get("id")]

        # Separate requirements from tests/docs
        requirements = [c for c in all_chunks if c.get("type") not in artifact_types]
        tests = [c for c in all_chunks if c.get("type") in test_types]

        result["chunks"] = requirements  # Only show requirements in main chunks
        result["tests"] = tests  # Separate tests list
        result["chunk_count"] = len(requirements)
        result["test_count"] = len(tests)

        return result

    # =========================================================================
    # Statistics
    # =========================================================================

    def get_graph_stats(self) -> Dict[str, Any]:
        """Get statistics about the knowledge graph."""
        query = """
        MATCH (c:Chunk)
        OPTIONAL MATCH ()-[r:DEPENDS_ON]->()
        OPTIONAL MATCH ()-[r2:REFERENCES]->()
        RETURN count(DISTINCT c) as total_chunks,
               count(DISTINCT r) as dependency_count,
               count(DISTINCT r2) as reference_count
        """
        results = self._query(query)
        return results[0] if results else {}

    # =========================================================================
    # Maintenance
    # =========================================================================

    def delete_prd(self, prd_id: str) -> bool:
        """Delete a PRD and all its related chunks."""
        # Delete all chunks belonging to this PRD
        self._query(
            "MATCH (c:Chunk)-[:BELONGS_TO]->(p:PRD {id: $prd_id}) DETACH DELETE c",
            {"prd_id": prd_id}
        )
        # Delete the PRD node
        self._query(
            "MATCH (p:PRD {id: $prd_id}) DELETE p",
            {"prd_id": prd_id}
        )
        logger.info(f"Deleted PRD from graph: {prd_id}")
        return True

    def clear_all(self) -> None:
        """Clear all data from the graph (use with caution!)."""
        self._query("MATCH (n) DETACH DELETE n")
        logger.warning("Cleared all data from FalkorDB")
