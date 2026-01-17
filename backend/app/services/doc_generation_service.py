"""
Documentation Generation Service for cv-prd

Generates documentation (user manuals, API docs, technical specs, release notes)
from requirements using AI. Creates DOCUMENTS relationships in the knowledge graph.
"""

import json
import logging
import uuid
from typing import List, Dict, Any, Optional
from enum import Enum

from app.services.openrouter_service import OpenRouterService
from app.services.graph_service import GraphService
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.database_service import DatabaseService
from app.models.prd_models import ChunkType, Priority

logger = logging.getLogger(__name__)


class DocType(str, Enum):
    """Types of documentation that can be generated"""
    USER_MANUAL = "user_manual"
    API_DOC = "api_doc"
    TECHNICAL_SPEC = "technical_spec"
    RELEASE_NOTE = "release_note"
    ALL = "all"


class DocGenerationService:
    """Service for AI-powered documentation generation from requirements"""

    def __init__(
        self,
        openrouter: OpenRouterService,
        graph_service: Optional[GraphService] = None,
        embedding_service: Optional[EmbeddingService] = None,
        vector_service: Optional[VectorService] = None,
        database_service: Optional[DatabaseService] = None,
    ):
        self.openrouter = openrouter
        self.graph = graph_service
        self.embedding = embedding_service
        self.vector = vector_service
        self.db = database_service
        logger.info("DocGenerationService initialized (graph=%s, db=%s)",
                    "enabled" if graph_service and getattr(graph_service, 'available', True) else "disabled",
                    "enabled" if database_service else "disabled")

    async def generate_user_manual(
        self,
        prd_id: str,
        prd_name: str,
        chunks: List[Dict[str, Any]],
        audience: str = "end users",
    ) -> List[Dict[str, Any]]:
        """
        Generate user manual sections from PRD requirements.

        Args:
            prd_id: ID of the PRD
            prd_name: Name of the PRD
            chunks: List of requirement chunks
            audience: Target audience for the manual

        Returns:
            List of generated documentation chunks
        """
        logger.info(f"Generating user manual for PRD: {prd_id}")

        system_prompt = f"""You are a technical writer creating user documentation.
Your task is to generate clear, user-friendly manual sections from software requirements.

Target audience: {audience}

Write documentation that is:
- Clear and accessible to non-technical users
- Action-oriented with step-by-step instructions
- Organized by user tasks and workflows
- Free of technical jargon (or explains it when necessary)

Your response MUST be valid JSON with the following structure:
{{
  "manual_sections": [
    {{
      "section_id": "unique identifier",
      "title": "section title",
      "content": "markdown formatted content",
      "order": 1,
      "related_requirement_ids": ["req1", "req2"],
      "subsections": [
        {{
          "title": "subsection title",
          "content": "markdown content"
        }}
      ]
    }}
  ],
  "suggested_toc": "table of contents as markdown"
}}
"""

        user_prompt = self._build_doc_prompt(prd_name, chunks, DocType.USER_MANUAL)

        return await self._generate_docs(
            prd_id=prd_id,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            doc_type=DocType.USER_MANUAL,
            chunks=chunks,
        )

    async def generate_api_docs(
        self,
        prd_id: str,
        prd_name: str,
        chunks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Generate API documentation from PRD requirements.

        Args:
            prd_id: ID of the PRD
            prd_name: Name of the PRD
            chunks: List of requirement chunks

        Returns:
            List of generated API documentation chunks
        """
        logger.info(f"Generating API docs for PRD: {prd_id}")

        system_prompt = """You are a technical writer specializing in API documentation.
Your task is to generate comprehensive API documentation from software requirements.

Write documentation that includes:
- Clear endpoint descriptions
- Request/response formats
- Authentication requirements
- Error handling
- Code examples where applicable

Your response MUST be valid JSON with the following structure:
{
  "api_sections": [
    {
      "section_id": "unique identifier",
      "title": "section title (e.g., 'Authentication API')",
      "overview": "brief overview",
      "endpoints": [
        {
          "method": "GET|POST|PUT|DELETE",
          "path": "/api/path",
          "description": "what it does",
          "parameters": [{"name": "param", "type": "string", "required": true, "description": "desc"}],
          "request_body": "example request body if applicable",
          "response": "example response",
          "errors": [{"code": 400, "description": "error description"}]
        }
      ],
      "related_requirement_ids": ["req1", "req2"]
    }
  ]
}
"""

        user_prompt = self._build_doc_prompt(prd_name, chunks, DocType.API_DOC)

        return await self._generate_docs(
            prd_id=prd_id,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            doc_type=DocType.API_DOC,
            chunks=chunks,
        )

    async def generate_technical_spec(
        self,
        prd_id: str,
        prd_name: str,
        chunks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Generate technical specification from PRD requirements.

        Args:
            prd_id: ID of the PRD
            prd_name: Name of the PRD
            chunks: List of requirement chunks

        Returns:
            List of generated technical spec chunks
        """
        logger.info(f"Generating technical spec for PRD: {prd_id}")

        system_prompt = """You are a software architect creating technical specifications.
Your task is to generate detailed technical specifications from product requirements.

Write specifications that include:
- Architecture overview
- Component descriptions
- Data models
- Integration points
- Security considerations
- Performance requirements

Your response MUST be valid JSON with the following structure:
{
  "spec_sections": [
    {
      "section_id": "unique identifier",
      "title": "section title",
      "content": "markdown formatted technical content",
      "diagrams": ["description of diagrams that should be created"],
      "related_requirement_ids": ["req1", "req2"]
    }
  ],
  "architecture_notes": "high-level architecture notes"
}
"""

        user_prompt = self._build_doc_prompt(prd_name, chunks, DocType.TECHNICAL_SPEC)

        return await self._generate_docs(
            prd_id=prd_id,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            doc_type=DocType.TECHNICAL_SPEC,
            chunks=chunks,
        )

    async def generate_release_notes(
        self,
        prd_id: str,
        prd_name: str,
        version: str,
        chunks: List[Dict[str, Any]],
        changes: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """
        Generate release notes for a version.

        Args:
            prd_id: ID of the PRD
            prd_name: Name of the PRD
            version: Version number
            chunks: List of requirement chunks (features being released)
            changes: Optional list of specific changes to highlight

        Returns:
            Release notes document
        """
        logger.info(f"Generating release notes for {prd_name} v{version}")

        system_prompt = f"""You are a technical writer creating release notes.
Your task is to generate clear, informative release notes for version {version}.

Write release notes that include:
- Summary of what's new
- New features and improvements
- Bug fixes (if applicable)
- Breaking changes (if any)
- Migration notes (if needed)
- Known issues (if any)

Your response MUST be valid JSON with the following structure:
{{
  "version": "{version}",
  "release_date": "YYYY-MM-DD format",
  "summary": "brief summary of the release",
  "highlights": ["key highlight 1", "key highlight 2"],
  "sections": [
    {{
      "title": "New Features",
      "items": [
        {{
          "title": "feature title",
          "description": "feature description",
          "related_requirement_ids": ["req1"]
        }}
      ]
    }},
    {{
      "title": "Improvements",
      "items": []
    }},
    {{
      "title": "Bug Fixes",
      "items": []
    }},
    {{
      "title": "Breaking Changes",
      "items": []
    }}
  ],
  "full_markdown": "complete release notes in markdown format"
}}
"""

        # Build feature list from chunks
        features_text = "\n".join([
            f"- {chunk.get('text', '')[:200]}"
            for chunk in chunks
            if chunk.get('type') in ['feature', 'requirement']
        ][:20])  # Limit to 20 features

        changes_text = ""
        if changes:
            changes_text = "\n\nSpecific changes to highlight:\n" + "\n".join(f"- {c}" for c in changes)

        user_prompt = f"""Generate release notes for:

## Product: {prd_name}
## Version: {version}

## Features/Requirements being released:
{features_text}
{changes_text}
"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        try:
            response_text = await self.openrouter.chat_completion(
                messages=messages,
                temperature=0.3,
                max_tokens=4000
            )

            release_notes = self._parse_json_response(response_text)

            # Store as a chunk
            chunk_id = str(uuid.uuid4())
            text = release_notes.get("full_markdown", f"# Release Notes v{version}\n\n{release_notes.get('summary', '')}")

            self.graph.create_chunk_node(chunk_id, {
                "type": ChunkType.RELEASE_NOTE.value,
                "text": text,
                "priority": "high",
                "context": f"Release notes for {prd_name} v{version}",
            })

            self.graph.link_chunk_to_prd(chunk_id, prd_id)

            # Create DOCUMENTS relationships to featured requirements
            for chunk in chunks[:10]:  # Link to top 10 requirements
                if chunk.get('id'):
                    self.graph.create_documents_relationship(
                        doc_chunk_id=chunk_id,
                        requirement_chunk_id=chunk['id'],
                        properties={"doc_type": "release_note", "version": version}
                    )

            release_notes["chunk_id"] = chunk_id
            return release_notes

        except Exception as e:
            logger.error(f"Error generating release notes: {e}")
            raise

    def _build_doc_prompt(
        self,
        prd_name: str,
        chunks: List[Dict[str, Any]],
        doc_type: DocType,
    ) -> str:
        """Build the user prompt for documentation generation."""
        # Group chunks by type
        grouped = {}
        for chunk in chunks:
            ctype = chunk.get('type', 'unknown')
            if ctype not in grouped:
                grouped[ctype] = []
            grouped[ctype].append(chunk)

        prompt = f"""Generate documentation for: {prd_name}

## Requirements by Type:
"""

        for ctype, type_chunks in grouped.items():
            prompt += f"\n### {ctype.upper()}\n"
            for chunk in type_chunks[:10]:  # Limit each type to 10
                chunk_id = chunk.get('id', 'unknown')
                text = chunk.get('text', '')[:300]
                priority = chunk.get('priority', 'medium')
                prompt += f"\n[{chunk_id}] (Priority: {priority})\n{text}\n"

        if doc_type == DocType.USER_MANUAL:
            prompt += "\n\nFocus on creating user-facing documentation with clear instructions."
        elif doc_type == DocType.API_DOC:
            prompt += "\n\nFocus on extracting API endpoints and technical interfaces from the requirements."
        elif doc_type == DocType.TECHNICAL_SPEC:
            prompt += "\n\nFocus on architecture, data models, and technical implementation details."

        return prompt

    async def _generate_docs(
        self,
        prd_id: str,
        system_prompt: str,
        user_prompt: str,
        doc_type: DocType,
        chunks: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Generate documentation and store in graph."""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        try:
            response_text = await self.openrouter.chat_completion(
                messages=messages,
                temperature=0.3,
                max_tokens=4000
            )

            parsed = self._parse_json_response(response_text)
            doc_chunks = []

            # Extract sections based on doc type
            sections_key = {
                DocType.USER_MANUAL: "manual_sections",
                DocType.API_DOC: "api_sections",
                DocType.TECHNICAL_SPEC: "spec_sections",
            }.get(doc_type, "sections")

            sections = parsed.get(sections_key, [])

            for section in sections:
                chunk_id = str(uuid.uuid4())

                # Build text content
                if doc_type == DocType.API_DOC:
                    text = self._format_api_section(section)
                else:
                    text = f"# {section.get('title', 'Untitled')}\n\n{section.get('content', section.get('overview', ''))}"

                chunk_type = {
                    DocType.USER_MANUAL: ChunkType.USER_MANUAL.value,
                    DocType.API_DOC: ChunkType.API_DOC.value,
                    DocType.TECHNICAL_SPEC: ChunkType.TECHNICAL_SPEC.value,
                }.get(doc_type, ChunkType.DOCUMENTATION.value)

                related_ids = section.get("related_requirement_ids", [])

                # Store in database (primary storage for persistence)
                if self.db:
                    try:
                        self.db.create_chunk(
                            chunk_id=chunk_id,
                            prd_id=prd_id,
                            chunk_type=chunk_type,
                            text=text,
                            context_prefix=f"{doc_type.value} documentation",
                            priority="medium",
                            tags=[doc_type.value, "generated"],
                            metadata={
                                "doc_type": doc_type.value,
                                "title": section.get("title", ""),
                                "related_requirement_ids": related_ids,
                            },
                        )
                        logger.debug(f"Stored doc chunk {chunk_id} in database")
                    except Exception as e:
                        logger.warning(f"Failed to store doc chunk in database: {e}")

                # Store in graph if available
                graph_available = self.graph and getattr(self.graph, 'available', True)
                if graph_available:
                    try:
                        self.graph.create_chunk_node(chunk_id, {
                            "type": chunk_type,
                            "text": text,
                            "priority": "medium",
                            "context": f"{doc_type.value} for {prd_id}",
                        })

                        self.graph.link_chunk_to_prd(chunk_id, prd_id)

                        # Create DOCUMENTS relationships
                        for req_id in related_ids:
                            matching = [c for c in chunks if c.get('id') == req_id]
                            if matching:
                                self.graph.create_documents_relationship(
                                    doc_chunk_id=chunk_id,
                                    requirement_chunk_id=req_id,
                                    properties={"doc_type": doc_type.value}
                                )
                    except Exception as e:
                        logger.warning(f"Failed to store doc chunk in graph: {e}")

                # Optionally embed
                if self.embedding and self.vector:
                    try:
                        embedding = self.embedding.embed_text(text)
                        self.vector.index_chunk(
                            chunk_id=chunk_id,
                            vector=embedding,
                            payload={
                                "prd_id": prd_id,
                                "chunk_type": chunk_type,
                                "priority": "medium",
                            }
                        )
                    except Exception as e:
                        logger.warning(f"Failed to embed doc chunk {chunk_id}: {e}")

                doc_chunk = {
                    "id": chunk_id,
                    "prd_id": prd_id,
                    "chunk_type": chunk_type,
                    "title": section.get("title", ""),
                    "content": text,
                    "related_requirement_ids": related_ids,
                }
                doc_chunks.append(doc_chunk)

            logger.info(f"Generated {len(doc_chunks)} {doc_type.value} sections for PRD {prd_id}")
            return doc_chunks

        except Exception as e:
            logger.error(f"Error generating {doc_type.value}: {e}")
            raise

    def _format_api_section(self, section: Dict[str, Any]) -> str:
        """Format an API section as markdown."""
        text = f"# {section.get('title', 'API Section')}\n\n"
        text += f"{section.get('overview', '')}\n\n"

        for endpoint in section.get("endpoints", []):
            text += f"## {endpoint.get('method', 'GET')} {endpoint.get('path', '/')}\n\n"
            text += f"{endpoint.get('description', '')}\n\n"

            params = endpoint.get("parameters", [])
            if params:
                text += "### Parameters\n\n"
                text += "| Name | Type | Required | Description |\n"
                text += "|------|------|----------|-------------|\n"
                for p in params:
                    text += f"| {p.get('name')} | {p.get('type')} | {p.get('required', False)} | {p.get('description', '')} |\n"
                text += "\n"

            if endpoint.get("request_body"):
                text += f"### Request Body\n\n```json\n{endpoint['request_body']}\n```\n\n"

            if endpoint.get("response"):
                text += f"### Response\n\n```json\n{endpoint['response']}\n```\n\n"

            errors = endpoint.get("errors", [])
            if errors:
                text += "### Errors\n\n"
                for err in errors:
                    text += f"- **{err.get('code')}**: {err.get('description')}\n"
                text += "\n"

        return text

    def _parse_json_response(self, response_text: str) -> Dict[str, Any]:
        """Parse JSON from AI response."""
        try:
            # Extract JSON from markdown code blocks if present
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            # Find and parse JSON
            start_idx = response_text.find('{')
            if start_idx != -1:
                brace_count = 0
                for i in range(start_idx, len(response_text)):
                    if response_text[i] == '{':
                        brace_count += 1
                    elif response_text[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            json_text = response_text[start_idx:i+1]
                            return json.loads(json_text)

            return json.loads(response_text)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse response as JSON: {e}")
            logger.error(f"Response preview: {response_text[:500]}")
            return {}
