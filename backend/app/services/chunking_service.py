from typing import List
import re
import uuid
from app.models.prd_models import Chunk, ChunkType, PRD, Priority


class ChunkingService:
    """Service for intelligently chunking PRD content"""

    @staticmethod
    def chunk_prd(prd: PRD) -> List[Chunk]:
        """
        Convert PRD sections into semantic chunks

        Args:
            prd: PRD object with sections

        Returns:
            List of Chunk objects
        """
        chunks = []

        for section in prd.sections:
            # Detect chunk type from section
            chunk_type = ChunkingService._detect_chunk_type(
                section.title, section.content
            )

            # Create context prefix
            context_prefix = f"PRD: {prd.name}, Section: {section.title}"

            # Create chunk
            chunk = Chunk(
                id=str(uuid.uuid4()),
                prd_id=prd.id,
                chunk_type=chunk_type,
                text=section.content,
                context_prefix=context_prefix,
                priority=section.priority,
                tags=section.tags,
                metadata={
                    "section_title": section.title,
                    "prd_name": prd.name,
                },
            )

            chunks.append(chunk)

        return chunks

    @staticmethod
    def _detect_chunk_type(title: str, content: str) -> ChunkType:
        """
        Detect chunk type from section title and content

        Args:
            title: Section title
            content: Section content

        Returns:
            ChunkType enum value
        """
        title_lower = title.lower()
        content_lower = content.lower()

        # Check for keywords in title and content
        if "requirement" in title_lower or "shall" in content_lower or "must" in content_lower:
            return ChunkType.REQUIREMENT
        elif "feature" in title_lower or "capability" in title_lower:
            return ChunkType.FEATURE
        elif "constraint" in title_lower or "limitation" in title_lower:
            return ChunkType.CONSTRAINT
        elif "stakeholder" in title_lower or "user" in title_lower or "persona" in title_lower:
            return ChunkType.STAKEHOLDER
        elif "metric" in title_lower or "kpi" in title_lower or "measure" in title_lower:
            return ChunkType.METRIC
        elif "dependency" in title_lower or "depends" in content_lower:
            return ChunkType.DEPENDENCY
        elif "risk" in title_lower or "threat" in title_lower:
            return ChunkType.RISK
        else:
            # Default to feature
            return ChunkType.FEATURE

    @staticmethod
    def detect_relationships(chunks: List[Chunk]) -> List[tuple]:
        """
        Detect relationships between chunks based on content analysis

        Args:
            chunks: List of Chunk objects

        Returns:
            List of tuples (source_id, target_id, relationship_type)
        """
        relationships = []

        for i, chunk1 in enumerate(chunks):
            for chunk2 in chunks[i + 1 :]:
                # Check for dependency keywords
                if ChunkingService._has_dependency(chunk1.text, chunk2):
                    relationships.append((chunk1.id, chunk2.id, "DEPENDS_ON"))

                # Check for references
                if ChunkingService._has_reference(chunk1.text, chunk2):
                    relationships.append((chunk1.id, chunk2.id, "REFERENCES"))

                # Check if chunk1 implements chunk2 (feature implements requirement)
                if (
                    chunk1.chunk_type == ChunkType.FEATURE
                    and chunk2.chunk_type == ChunkType.REQUIREMENT
                ):
                    if ChunkingService._has_implementation(chunk1.text, chunk2.text):
                        relationships.append((chunk1.id, chunk2.id, "IMPLEMENTS"))

        return relationships

    @staticmethod
    def _has_dependency(text: str, target_chunk: Chunk) -> bool:
        """Check if text mentions dependency on target chunk"""
        dependency_keywords = [
            "depends on",
            "requires",
            "needs",
            "prerequisite",
            "relies on",
            "based on",
        ]

        text_lower = text.lower()

        # Check if dependency keyword exists
        has_keyword = any(kw in text_lower for kw in dependency_keywords)

        if has_keyword:
            # Check if target chunk's section title or key terms are mentioned
            target_terms = target_chunk.metadata.get("section_title", "").lower().split()
            return any(term in text_lower for term in target_terms if len(term) > 3)

        return False

    @staticmethod
    def _has_reference(text: str, target_chunk: Chunk) -> bool:
        """Check if text references target chunk"""
        # Simple keyword overlap check
        text_words = set(re.findall(r'\w+', text.lower()))
        target_words = set(re.findall(r'\w+', target_chunk.text.lower()))

        # Remove common stop words
        stop_words = {
            "the",
            "a",
            "an",
            "and",
            "or",
            "but",
            "in",
            "on",
            "at",
            "to",
            "for",
            "of",
            "with",
            "by",
        }
        text_words -= stop_words
        target_words -= stop_words

        # Check overlap (threshold: 3+ common words)
        overlap = text_words & target_words
        return len(overlap) >= 3

    @staticmethod
    def _has_implementation(feature_text: str, requirement_text: str) -> bool:
        """Check if feature implements requirement"""
        # Extract key terms from requirement
        req_words = set(re.findall(r'\w+', requirement_text.lower()))
        feature_words = set(re.findall(r'\w+', feature_text.lower()))

        # Remove stop words
        stop_words = {
            "the",
            "a",
            "an",
            "and",
            "or",
            "but",
            "in",
            "on",
            "at",
            "to",
            "for",
            "of",
            "with",
            "by",
            "shall",
            "must",
            "will",
        }
        req_words -= stop_words
        feature_words -= stop_words

        # Check if feature has significant overlap with requirement
        overlap = req_words & feature_words
        return len(overlap) >= 2
