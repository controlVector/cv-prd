"""
Test Generation Service for cv-prd

Generates test cases (specs and code stubs) from requirements using AI.
Creates TESTS relationships in the knowledge graph for traceability.
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


class TestType(str, Enum):
    """Types of tests that can be generated"""
    UNIT = "unit"
    INTEGRATION = "integration"
    ACCEPTANCE = "acceptance"
    ALL = "all"


class TestFramework(str, Enum):
    """Supported test frameworks for code stub generation"""
    PYTEST = "pytest"
    JEST = "jest"
    MOCHA = "mocha"
    VITEST = "vitest"
    GO_TEST = "go_test"
    RUST_TEST = "rust_test"
    UNKNOWN = "unknown"


class TestGenerationService:
    """Service for AI-powered test case generation from requirements"""

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
        logger.info("TestGenerationService initialized (graph=%s, db=%s)",
                    "enabled" if graph_service and getattr(graph_service, 'available', True) else "disabled",
                    "enabled" if database_service else "disabled")

    async def generate_test_cases(
        self,
        requirement_chunk: Dict[str, Any],
        prd_context: Dict[str, Any],
        test_type: TestType = TestType.ALL,
        framework: Optional[TestFramework] = None,
        include_code_stub: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        Generate test cases from a requirement chunk.

        Args:
            requirement_chunk: The requirement to generate tests for
            prd_context: Context about the PRD (name, description, related chunks)
            test_type: Type of tests to generate (unit, integration, acceptance, all)
            framework: Test framework for code stubs (auto-detected if not specified)
            include_code_stub: Whether to generate code stubs

        Returns:
            List of generated test case dictionaries
        """
        logger.info(f"Generating {test_type.value} tests for chunk: {requirement_chunk.get('id')}")

        # Build the prompt
        system_prompt = self._build_system_prompt(test_type, framework, include_code_stub)
        user_prompt = self._build_user_prompt(requirement_chunk, prd_context, test_type, framework)

        # Call OpenRouter
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        try:
            response_text = await self.openrouter.chat_completion(
                messages=messages,
                temperature=0.3,
                max_tokens=6000,
                endpoint="test_generation",
            )

            # Parse the response
            test_cases = self._parse_test_response(response_text, requirement_chunk, prd_context)

            # Create graph nodes and relationships for each test case
            for test_case in test_cases:
                await self._store_test_case(test_case, requirement_chunk)

            logger.info(f"Generated {len(test_cases)} test cases for chunk {requirement_chunk.get('id')}")
            return test_cases

        except Exception as e:
            logger.error(f"Error generating test cases: {e}")
            raise

    async def generate_test_suite(
        self,
        prd_id: str,
        chunks: List[Dict[str, Any]],
        prd_name: str,
        framework: Optional[TestFramework] = None,
    ) -> Dict[str, Any]:
        """
        Generate a complete test suite for a PRD.

        Args:
            prd_id: ID of the PRD
            chunks: List of requirement chunks to generate tests for
            prd_name: Name of the PRD for context
            framework: Test framework for code stubs

        Returns:
            Summary of generated test suite
        """
        logger.info(f"Generating test suite for PRD: {prd_id}")

        # Filter to testable chunk types
        testable_types = [
            ChunkType.REQUIREMENT.value,
            ChunkType.FEATURE.value,
            ChunkType.CONSTRAINT.value,
        ]
        testable_chunks = [c for c in chunks if c.get("type") in testable_types]

        all_tests = []
        prd_context = {
            "prd_id": prd_id,
            "prd_name": prd_name,
            "total_chunks": len(chunks),
        }

        for chunk in testable_chunks:
            try:
                tests = await self.generate_test_cases(
                    requirement_chunk=chunk,
                    prd_context=prd_context,
                    test_type=TestType.ALL,
                    framework=framework,
                    include_code_stub=True,
                )
                all_tests.extend(tests)
            except Exception as e:
                logger.error(f"Failed to generate tests for chunk {chunk.get('id')}: {e}")

        # Calculate coverage if graph is available
        coverage = None
        graph_available = self.graph and getattr(self.graph, 'available', True)
        if graph_available:
            try:
                coverage = self.graph.get_test_coverage(prd_id)
            except Exception as e:
                logger.warning(f"Could not calculate test coverage: {e}")

        return {
            "prd_id": prd_id,
            "total_requirements": len(testable_chunks),
            "total_tests_generated": len(all_tests),
            "test_cases": all_tests,
            "coverage": coverage,
        }

    def detect_test_framework(self, file_patterns: List[str]) -> TestFramework:
        """
        Detect the test framework based on project files.

        Args:
            file_patterns: List of file paths/names in the project

        Returns:
            Detected test framework
        """
        patterns = " ".join(file_patterns).lower()

        if "pytest" in patterns or "conftest.py" in patterns:
            return TestFramework.PYTEST
        elif "jest.config" in patterns or "jest.setup" in patterns:
            return TestFramework.JEST
        elif "vitest.config" in patterns:
            return TestFramework.VITEST
        elif "mocha" in patterns:
            return TestFramework.MOCHA
        elif "_test.go" in patterns:
            return TestFramework.GO_TEST
        elif "_test.rs" in patterns or "tests/" in patterns:
            return TestFramework.RUST_TEST

        return TestFramework.UNKNOWN

    def _build_system_prompt(
        self,
        test_type: TestType,
        framework: Optional[TestFramework],
        include_code_stub: bool,
    ) -> str:
        """Build the system prompt for test generation."""

        prompt = f"""You are an expert software test engineer. Your task is to generate comprehensive, LANGUAGE-AGNOSTIC test specifications from software requirements.

Generate test specifications that are:
- Specific, measurable, and technology-neutral
- Covering both positive and negative scenarios
- Including edge cases and boundary conditions
- Traceable back to the requirement
- Written so they can be implemented in ANY programming language

Test types to generate: {test_type.value}

For each test case, also recommend the most suitable programming language/framework based on:
- The nature of the requirement (web, API, mobile, embedded, etc.)
- Common industry practices for similar testing needs
- Ease of implementation and maintenance

IMPORTANT: Return ONLY valid JSON, no markdown code blocks.
Generate exactly 2-3 test cases maximum.
Keep descriptions brief but complete.

Your response MUST be this exact JSON structure:
{{
  "recommended_stack": {{
    "language": "python",
    "framework": "pytest",
    "reasoning": "Brief reason why this stack is recommended"
  }},
  "test_cases": [
    {{
      "test_id": "TC001",
      "test_type": "unit",
      "title": "Brief test title",
      "description": "What this test verifies",
      "preconditions": ["System state required before test"],
      "steps": ["Step 1: Do X", "Step 2: Verify Y"],
      "expected_result": "Expected outcome",
      "priority": "high"
    }}
  ]
}}
"""
        # Only add code stub guidance if explicitly requested with a framework
        if include_code_stub and framework and framework != TestFramework.UNKNOWN:
            prompt += f"""
Additionally, since {framework.value} was explicitly requested, include a "code_stub" field with example code for each test case.
"""
        return prompt

    def _build_user_prompt(
        self,
        requirement_chunk: Dict[str, Any],
        prd_context: Dict[str, Any],
        test_type: TestType,
        framework: Optional[TestFramework],
    ) -> str:
        """Build the user prompt with requirement context."""
        prompt = f"""Generate test cases for the following requirement:

## PRD Context
- PRD Name: {prd_context.get('prd_name', 'Unknown')}
- PRD ID: {prd_context.get('prd_id', 'Unknown')}

## Requirement to Test
- ID: {requirement_chunk.get('id', 'Unknown')}
- Type: {requirement_chunk.get('type', 'Unknown')}
- Priority: {requirement_chunk.get('priority', 'medium')}
- Content:
{requirement_chunk.get('text', '')}

## Context Prefix
{requirement_chunk.get('context_prefix', '')}
"""

        # Add dependencies if available
        dependencies = prd_context.get('dependencies', [])
        if dependencies:
            prompt += "\n## Related Requirements (Dependencies)\n"
            for dep in dependencies[:5]:  # Limit to 5 for context window
                prompt += f"- {dep.get('text', '')[:200]}\n"

        # Add test type guidance
        if test_type == TestType.UNIT:
            prompt += "\nFocus on unit-level tests for individual components/functions."
        elif test_type == TestType.INTEGRATION:
            prompt += "\nFocus on integration tests that verify component interactions."
        elif test_type == TestType.ACCEPTANCE:
            prompt += "\nFocus on acceptance tests from the user's perspective."
        else:
            prompt += "\nGenerate a mix of unit, integration, and acceptance tests."

        # Add framework guidance
        if framework and framework != TestFramework.UNKNOWN:
            prompt += f"\n\nGenerate code stubs using {framework.value} syntax."

        return prompt

    def _parse_test_response(
        self,
        response_text: str,
        requirement_chunk: Dict[str, Any],
        prd_context: Dict[str, Any],
    ) -> List[Dict[str, Any]]:
        """Parse the AI response into test case objects."""
        import re

        original_text = response_text
        logger.debug(f"Raw response length: {len(response_text)}")

        try:
            # Step 1: Extract JSON from markdown code blocks if present
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                parts = response_text.split("```")
                if len(parts) >= 2:
                    response_text = parts[1].strip()

            parsed = None

            # Step 2: Try direct JSON parsing
            try:
                parsed = json.loads(response_text)
                logger.info("Direct JSON parsing succeeded")
            except json.JSONDecodeError as e:
                logger.debug(f"Direct parsing failed: {e}")

            # Step 3: Try to repair truncated JSON
            if not parsed:
                # Find the start of JSON
                start_idx = response_text.find('{')
                if start_idx != -1:
                    json_text = response_text[start_idx:]

                    # Try adding closing brackets/braces to repair truncated JSON
                    # Count open brackets
                    open_braces = json_text.count('{') - json_text.count('}')
                    open_brackets = json_text.count('[') - json_text.count(']')

                    if open_braces > 0 or open_brackets > 0:
                        # Truncate at last complete-looking structure
                        # Find last complete test case by looking for pattern
                        last_complete = json_text.rfind('"code_stub"')
                        if last_complete == -1:
                            last_complete = json_text.rfind('"priority"')
                        if last_complete == -1:
                            last_complete = json_text.rfind('"expected_result"')

                        if last_complete != -1:
                            # Find the closing of this field's value
                            search_start = last_complete
                            # Look for end of string value or closing brace
                            for i in range(search_start, len(json_text)):
                                if json_text[i:i+2] == '"}':
                                    json_text = json_text[:i+2]
                                    break

                        # Now add closing brackets
                        repaired = json_text
                        open_braces = repaired.count('{') - repaired.count('}')
                        open_brackets = repaired.count('[') - repaired.count(']')

                        # Close any open arrays then objects
                        repaired += ']' * open_brackets
                        repaired += '}' * open_braces

                        try:
                            parsed = json.loads(repaired)
                            logger.info(f"Repaired truncated JSON successfully")
                        except json.JSONDecodeError as e:
                            logger.debug(f"Repair attempt failed: {e}")

            # Step 4: Extract individual test cases using regex
            if not parsed:
                test_cases_extracted = []

                # Pattern to match individual test case objects
                # Look for objects with test_id or test_type fields
                pattern = r'\{[^{}]*"test_(?:id|type)"[^{}]*\}'
                simple_matches = re.findall(pattern, response_text)

                for match in simple_matches:
                    try:
                        tc = json.loads(match)
                        if tc.get("test_type") or tc.get("test_id"):
                            test_cases_extracted.append(tc)
                    except json.JSONDecodeError:
                        continue

                # Try more aggressive extraction - find JSON-like structures
                if not test_cases_extracted:
                    # Split by test case boundaries
                    case_pattern = r'"test_id"\s*:\s*"([^"]+)"'
                    ids = re.findall(case_pattern, response_text)

                    for test_id in ids:
                        # Build a minimal test case from what we can extract
                        tc = {"test_id": test_id}

                        # Extract test_type
                        type_match = re.search(
                            rf'"test_id"\s*:\s*"{re.escape(test_id)}"[^{{}}]*"test_type"\s*:\s*"([^"]+)"',
                            response_text
                        )
                        if type_match:
                            tc["test_type"] = type_match.group(1)

                        # Extract title
                        title_match = re.search(
                            rf'"test_id"\s*:\s*"{re.escape(test_id)}"[^{{}}]*"title"\s*:\s*"([^"]+)"',
                            response_text
                        )
                        if title_match:
                            tc["title"] = title_match.group(1)

                        # Extract description
                        desc_match = re.search(
                            rf'"test_id"\s*:\s*"{re.escape(test_id)}"[^{{}}]*"description"\s*:\s*"([^"]*)"',
                            response_text
                        )
                        if desc_match:
                            tc["description"] = desc_match.group(1)

                        if tc.get("title") or tc.get("description"):
                            test_cases_extracted.append(tc)

                if test_cases_extracted:
                    parsed = {"test_cases": test_cases_extracted}
                    logger.info(f"Extracted {len(test_cases_extracted)} test cases via regex")

            if not parsed:
                logger.error(f"All parsing methods failed")
                logger.error(f"Response preview: {original_text[:1000]}")
                return []

            # Extract recommended stack if present
            recommended_stack = parsed.get("recommended_stack", {})

            # Convert to our format
            test_cases = []
            for tc in parsed.get("test_cases", []):
                test_case = {
                    "id": str(uuid.uuid4()),
                    "prd_id": prd_context.get("prd_id"),
                    "source_requirement_id": requirement_chunk.get("id"),
                    "test_type": tc.get("test_type", "unit"),
                    "title": tc.get("title", tc.get("test_id", "Untitled Test")),
                    "description": tc.get("description", ""),
                    "preconditions": tc.get("preconditions", []),
                    "steps": tc.get("steps", []),
                    "expected_result": tc.get("expected_result", ""),
                    "priority": tc.get("priority", "medium"),
                    "code_stub": tc.get("code_stub", ""),
                    "chunk_type": self._map_test_type_to_chunk_type(tc.get("test_type", "unit")),
                    # Add recommended stack to each test case for display
                    "recommended_language": recommended_stack.get("language"),
                    "recommended_framework": recommended_stack.get("framework"),
                    "stack_reasoning": recommended_stack.get("reasoning"),
                }
                test_cases.append(test_case)

            logger.info(f"Successfully parsed {len(test_cases)} test cases")
            return test_cases

        except Exception as e:
            logger.error(f"Unexpected error parsing test response: {e}")
            logger.error(f"Response preview: {original_text[:500]}")
            return []

    def _map_test_type_to_chunk_type(self, test_type: str) -> str:
        """Map test type to chunk type for storage."""
        mapping = {
            "unit": ChunkType.UNIT_TEST_SPEC.value,
            "integration": ChunkType.INTEGRATION_TEST_SPEC.value,
            "acceptance": ChunkType.ACCEPTANCE_CRITERIA.value,
        }
        return mapping.get(test_type.lower(), ChunkType.TEST_CASE.value)

    async def _store_test_case(
        self,
        test_case: Dict[str, Any],
        requirement_chunk: Dict[str, Any],
    ) -> None:
        """Store a test case in the graph (if available) and optionally vector store."""
        chunk_id = test_case["id"]
        requirement_id = requirement_chunk.get("id")

        # Build text representation for storage
        text = f"""# {test_case['title']}

{test_case['description']}

## Preconditions
{chr(10).join('- ' + p for p in test_case.get('preconditions', []))}

## Steps
{chr(10).join(f'{i+1}. {s}' for i, s in enumerate(test_case.get('steps', [])))}

## Expected Result
{test_case['expected_result']}
"""

        # Add recommended stack info if present
        if test_case.get('recommended_language'):
            text += f"""
## Recommended Implementation
- **Language:** {test_case.get('recommended_language')}
- **Framework:** {test_case.get('recommended_framework', 'N/A')}
- **Reasoning:** {test_case.get('stack_reasoning', 'N/A')}
"""

        if test_case.get('code_stub'):
            text += f"""
## Code Stub
```
{test_case['code_stub']}
```
"""

        # Store in database (primary storage for persistence)
        if self.db:
            try:
                self.db.create_chunk(
                    chunk_id=chunk_id,
                    prd_id=test_case.get("prd_id"),
                    chunk_type=test_case["chunk_type"],
                    text=text,
                    context_prefix=f"Test for: {requirement_chunk.get('text', '')[:100]}",
                    priority=test_case["priority"],
                    tags=[test_case["test_type"], "generated"],
                    metadata={
                        "source_requirement_id": requirement_id,
                        "test_type": test_case["test_type"],
                        "title": test_case.get("title"),
                        "recommended_language": test_case.get("recommended_language"),
                        "recommended_framework": test_case.get("recommended_framework"),
                    },
                )
                logger.debug(f"Stored test case {chunk_id} in database")
            except Exception as e:
                logger.warning(f"Failed to store test case in database: {e}")

        # Store in graph if available
        graph_available = self.graph and getattr(self.graph, 'available', True)
        if graph_available:
            try:
                self.graph.create_chunk_node(chunk_id, {
                    "type": test_case["chunk_type"],
                    "text": text,
                    "priority": test_case["priority"],
                    "context": f"Test for: {requirement_chunk.get('text', '')[:100]}",
                })

                # Link to PRD
                if test_case.get("prd_id"):
                    self.graph.link_chunk_to_prd(chunk_id, test_case["prd_id"])

                # Create TESTS relationship
                if requirement_id:
                    self.graph.create_tests_relationship(
                        test_chunk_id=chunk_id,
                        requirement_chunk_id=requirement_id,
                        properties={
                            "test_type": test_case["test_type"],
                            "generated": True,
                        }
                    )
            except Exception as e:
                logger.warning(f"Failed to store test case in graph: {e}")
        else:
            logger.debug("Graph service not available, skipping graph storage")

        # Optionally embed and index in vector store
        if self.embedding and self.vector:
            try:
                embedding = self.embedding.embed_text(text)
                self.vector.index_chunk(
                    chunk_id=chunk_id,
                    vector=embedding,
                    payload={
                        "prd_id": test_case.get("prd_id"),
                        "chunk_type": test_case["chunk_type"],
                        "priority": test_case["priority"],
                        "source_requirement_id": test_case.get("source_requirement_id"),
                    }
                )
            except Exception as e:
                logger.warning(f"Failed to embed test case {chunk_id}: {e}")

        logger.info(f"Stored test case {chunk_id} for requirement {requirement_id}")
