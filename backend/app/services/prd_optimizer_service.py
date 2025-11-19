"""
PRD Optimizer service that uses LLM to review and optimize PRD facts
"""

from app.models.prd_models import Chunk, ChunkType, Priority
from app.services.openrouter_service import OpenRouterService
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.graph_service import GraphService
from app.core.config import settings
from typing import List, Dict, Any
import logging
import uuid

logger = logging.getLogger(__name__)


class PRDOptimizerService:
    """Service for optimizing PRD facts using LLM analysis"""

    def __init__(
        self,
        embedding_service: EmbeddingService,
        vector_service: VectorService,
        graph_service: GraphService = None,
    ):
        self.openrouter = OpenRouterService()
        self.embedding_service = embedding_service
        self.vector_service = vector_service
        self.graph_service = graph_service

    async def optimize_prd(
        self, prd_id: str, prd_name: str, optimization_goal: str = "AI Paired Programming"
    ) -> Dict[str, Any]:
        """
        Optimize a PRD by analyzing its facts with LLM and restructuring

        Args:
            prd_id: ID of the PRD to optimize
            prd_name: Name of the PRD
            optimization_goal: Goal for optimization (default: "AI Paired Programming")

        Returns:
            Dictionary with optimization results
        """
        logger.info(f"Starting PRD optimization for: {prd_name} (ID: {prd_id})")

        # Step 1: Fetch all facts/chunks for this PRD
        facts = await self._fetch_prd_facts(prd_id)
        logger.info(f"Fetched {len(facts)} facts for analysis")

        if not facts:
            return {
                "status": "error",
                "message": "No facts found for this PRD",
                "prd_id": prd_id,
            }

        # Step 2: Send to LLM for analysis
        logger.info("Sending facts to LLM for analysis...")
        analysis = await self.openrouter.analyze_prd_facts(
            prd_name=prd_name, facts=facts, optimization_goal=optimization_goal
        )

        # Check for error in analysis
        if "error" in analysis:
            return {
                "status": "error",
                "message": "Failed to parse LLM response",
                "error": analysis["error"],
                "raw_response": analysis.get("raw_response", ""),
            }

        logger.info("LLM analysis complete")

        # Step 3: Apply optimizations
        optimization_stats = await self._apply_optimizations(
            prd_id=prd_id, prd_name=prd_name, facts=facts, analysis=analysis
        )

        return {
            "status": "success",
            "prd_id": prd_id,
            "prd_name": prd_name,
            "optimization_goal": optimization_goal,
            "analysis": {
                "overall_assessment": analysis.get("overall_assessment", ""),
                "structural_insights": analysis.get("structural_insights", ""),
            },
            "statistics": optimization_stats,
            "detailed_analysis": analysis,  # Include full analysis for review
        }

    async def _fetch_prd_facts(self, prd_id: str) -> List[Dict[str, Any]]:
        """
        Fetch all facts/chunks for a PRD from vector store

        Args:
            prd_id: PRD ID

        Returns:
            List of fact dictionaries
        """
        # Use vector service to get all chunks for this PRD
        # We'll do a broad search and filter by prd_id
        results = self.vector_service.search(
            query_vector=[0.0] * settings.EMBEDDING_DIMENSION,  # Dummy vector
            limit=1000,  # High limit to get all chunks
            score_threshold=-1.0,  # Accept all scores
            filters={"prd_id": prd_id},
        )

        # Convert results to fact format
        facts = []
        for result in results:
            payload = result.get("payload", {})
            facts.append(
                {
                    "chunk_id": payload.get("chunk_id"),
                    "text": payload.get("text", ""),
                    "type": payload.get("chunk_type", "UNKNOWN"),
                    "priority": payload.get("priority", "MEDIUM"),
                    "context": payload.get("context", ""),
                    "tags": payload.get("tags", []),
                    "section_title": payload.get("section_title", ""),
                }
            )

        return facts

    async def _apply_optimizations(
        self,
        prd_id: str,
        prd_name: str,
        facts: List[Dict[str, Any]],
        analysis: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Apply LLM-suggested optimizations to the PRD

        Args:
            prd_id: PRD ID
            prd_name: PRD name
            facts: Original facts
            analysis: LLM analysis with recommendations

        Returns:
            Statistics about applied optimizations
        """
        stats = {
            "facts_updated": 0,
            "facts_created": 0,
            "relationships_created": 0,
            "facts_unchanged": 0,
        }

        # Step 1: Update existing facts
        fact_optimizations = analysis.get("fact_optimizations", [])
        for optimization in fact_optimizations:
            try:
                fact_index = optimization.get("original_fact_index")
                if fact_index is None or fact_index >= len(facts):
                    logger.warning(f"Invalid fact index: {fact_index}")
                    continue

                original_fact = facts[fact_index]
                quality_score = optimization.get("quality_score", 0)

                # Only update if LLM suggests improvements (quality_score < 8)
                if quality_score >= 8:
                    stats["facts_unchanged"] += 1
                    continue

                # Update the fact
                await self._update_fact(
                    prd_id=prd_id,
                    prd_name=prd_name,
                    original_fact=original_fact,
                    optimization=optimization,
                )
                stats["facts_updated"] += 1

            except Exception as e:
                logger.error(f"Error updating fact {fact_index}: {e}")

        # Step 2: Create new facts
        new_facts = analysis.get("new_facts", [])
        for new_fact_spec in new_facts:
            try:
                await self._create_fact(
                    prd_id=prd_id, prd_name=prd_name, fact_spec=new_fact_spec
                )
                stats["facts_created"] += 1
            except Exception as e:
                logger.error(f"Error creating new fact: {e}")

        # Step 3: Create new relationships (if graph service available)
        if self.graph_service:
            relationship_recs = analysis.get("relationship_recommendations", [])
            for rel_rec in relationship_recs:
                try:
                    from_index = rel_rec.get("from_fact_index")
                    to_index = rel_rec.get("to_fact_index")

                    if (
                        from_index is None
                        or to_index is None
                        or from_index >= len(facts)
                        or to_index >= len(facts)
                    ):
                        continue

                    from_chunk_id = facts[from_index].get("chunk_id")
                    to_chunk_id = facts[to_index].get("chunk_id")
                    rel_type = rel_rec.get("relationship_type", "REFERENCES")

                    self.graph_service.create_relationship(
                        source_id=from_chunk_id,
                        target_id=to_chunk_id,
                        rel_type=rel_type,
                        properties={"strength": 0.9, "source": "llm_optimization"},
                    )
                    stats["relationships_created"] += 1

                except Exception as e:
                    logger.error(f"Error creating relationship: {e}")

        return stats

    async def _update_fact(
        self,
        prd_id: str,
        prd_name: str,
        original_fact: Dict[str, Any],
        optimization: Dict[str, Any],
    ):
        """
        Update an existing fact with optimized version

        Args:
            prd_id: PRD ID
            prd_name: PRD name
            original_fact: Original fact dict
            optimization: LLM optimization recommendation
        """
        chunk_id = original_fact.get("chunk_id")

        # Build updated text and metadata
        optimized_text = optimization.get("optimized_text", original_fact["text"])
        additional_context = optimization.get("additional_context", "")

        if additional_context:
            optimized_text = f"{optimized_text}\n\nContext: {additional_context}"

        # Update type and priority if suggested
        chunk_type = optimization.get("suggested_type", original_fact["type"])
        priority = optimization.get("suggested_priority", original_fact["priority"])

        # Build context
        context_prefix = f"PRD: {prd_name}, Section: {original_fact.get('section_title', 'General')}"
        full_text = f"{context_prefix} - {optimized_text}"

        # Generate new embedding
        vector = self.embedding_service.embed_text(full_text)

        # Update in vector store
        payload = {
            "chunk_id": chunk_id,
            "prd_id": prd_id,
            "chunk_type": chunk_type,
            "text": optimized_text,
            "context": full_text,
            "priority": priority,
            "tags": original_fact.get("tags", []),
            "section_title": original_fact.get("section_title", ""),
            "optimized": True,
            "optimization_notes": ", ".join(optimization.get("issues", [])),
        }

        self.vector_service.index_chunk(chunk_id=chunk_id, vector=vector, payload=payload)

        # Update in graph (if available)
        if self.graph_service:
            # Delete old node and create new one
            # (Neo4j doesn't have a simple update, so we recreate)
            try:
                with self.graph_service.driver.session() as session:
                    session.run(
                        """
                        MATCH (c:Chunk {id: $chunk_id})
                        SET c.text = $text,
                            c.type = $type,
                            c.priority = $priority,
                            c.optimized = true
                        """,
                        chunk_id=chunk_id,
                        text=optimized_text,
                        type=chunk_type,
                        priority=priority,
                    )
            except Exception as e:
                logger.error(f"Error updating graph node: {e}")

        logger.info(f"Updated fact {chunk_id}")

    async def _create_fact(
        self, prd_id: str, prd_name: str, fact_spec: Dict[str, Any]
    ):
        """
        Create a new fact based on LLM recommendation

        Args:
            prd_id: PRD ID
            prd_name: PRD name
            fact_spec: Specification for new fact
        """
        chunk_id = str(uuid.uuid4())
        text = fact_spec.get("text", "")
        chunk_type = fact_spec.get("type", "REQUIREMENT")
        priority = fact_spec.get("priority", "MEDIUM")

        # Build context
        context_prefix = f"PRD: {prd_name}, Section: LLM-Generated"
        full_text = f"{context_prefix} - {text}"

        # Generate embedding
        vector = self.embedding_service.embed_text(full_text)

        # Index in vector store
        payload = {
            "chunk_id": chunk_id,
            "prd_id": prd_id,
            "chunk_type": chunk_type,
            "text": text,
            "context": full_text,
            "priority": priority,
            "tags": ["llm-generated"],
            "section_title": "LLM-Generated",
            "optimized": True,
            "creation_rationale": fact_spec.get("rationale", ""),
        }

        self.vector_service.index_chunk(chunk_id=chunk_id, vector=vector, payload=payload)

        # Create in graph (if available)
        if self.graph_service:
            self.graph_service.create_chunk_node(
                chunk_id=chunk_id,
                chunk_data={
                    "type": chunk_type,
                    "text": text,
                    "priority": priority,
                    "context": context_prefix,
                    "optimized": True,
                },
            )
            self.graph_service.link_chunk_to_prd(chunk_id=chunk_id, prd_id=prd_id)

        logger.info(f"Created new fact {chunk_id}")
