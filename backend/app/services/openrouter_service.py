import httpx
import logging
from typing import List, Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)


class OpenRouterService:
    """Service for interacting with OpenRouter LLM API"""

    def __init__(self):
        self.api_key = settings.OPENROUTER_API_KEY
        self.api_url = settings.OPENROUTER_API_URL
        self.model = settings.OPENROUTER_MODEL

        if not self.api_key:
            logger.warning("OpenRouter API key not configured")
        else:
            logger.info(f"OpenRouter service initialized with model: {self.model}")

    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
        model: Optional[str] = None
    ) -> str:
        """
        Send a chat completion request to OpenRouter

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature (0-1)
            max_tokens: Maximum tokens to generate
            model: Override default model

        Returns:
            Response text from the LLM
        """
        if not self.api_key:
            raise ValueError("OpenRouter API key not configured")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/cvPRD",  # Optional, for OpenRouter analytics
            "X-Title": "cvPRD"  # Optional, for OpenRouter analytics
        }

        payload = {
            "model": model or self.model,
            "messages": messages,
            "temperature": temperature,
        }

        if max_tokens:
            payload["max_tokens"] = max_tokens

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    self.api_url,
                    json=payload,
                    headers=headers
                )
                response.raise_for_status()

                result = response.json()
                return result["choices"][0]["message"]["content"]

        except httpx.HTTPStatusError as e:
            logger.error(f"OpenRouter API error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Error calling OpenRouter: {str(e)}")
            raise

    async def analyze_prd_facts(
        self,
        prd_name: str,
        facts: List[Dict[str, Any]],
        optimization_goal: str = "AI Paired Programming"
    ) -> Dict[str, Any]:
        """
        Analyze PRD facts and provide optimization recommendations

        Args:
            prd_name: Name of the PRD
            facts: List of fact/chunk dictionaries
            optimization_goal: Goal for optimization (default: "AI Paired Programming")

        Returns:
            Dict with analysis and recommendations
        """
        # Build context from facts
        facts_text = "\n\n".join([
            f"**Fact {i+1}** (Type: {fact.get('type', 'UNKNOWN')}, Priority: {fact.get('priority', 'UNKNOWN')})\n{fact.get('text', '')}"
            for i, fact in enumerate(facts)
        ])

        system_prompt = f"""You are an expert technical product manager and software architect specializing in converting PRDs into production-ready requirements optimized for {optimization_goal}.

Your task is to analyze PRD facts and restructure them to maximize clarity, completeness, and code generation efficiency."""

        user_prompt = f"""Analyze the following PRD facts for "{prd_name}" and optimize them for {optimization_goal}.

# Current PRD Facts:
{facts_text}

# Analysis Required:

1. **Fact Quality Assessment**: Evaluate each fact for:
   - Clarity and specificity
   - Completeness of context
   - Technical detail sufficiency
   - Ambiguities or gaps

2. **Optimization Recommendations**: For each fact, suggest:
   - Reformulated text (if needed)
   - Additional context to add
   - Suggested priority adjustments
   - Better chunk type classification

3. **Relationship Insights**: Identify:
   - Missing dependencies between facts
   - Logical groupings
   - Conflicting requirements

4. **Structure Improvements**: Recommend:
   - New facts to add for completeness
   - Facts that should be split or merged
   - Optimal organization for code generation

Please provide your response in the following JSON structure:
{{
  "overall_assessment": "Brief assessment of PRD quality",
  "fact_optimizations": [
    {{
      "original_fact_index": 0,
      "quality_score": 0-10,
      "issues": ["list of issues"],
      "optimized_text": "improved version",
      "suggested_priority": "CRITICAL|HIGH|MEDIUM|LOW",
      "suggested_type": "REQUIREMENT|FEATURE|CONSTRAINT|etc",
      "additional_context": "context to add"
    }}
  ],
  "new_facts": [
    {{
      "text": "new fact text",
      "type": "chunk type",
      "priority": "priority level",
      "rationale": "why this is needed"
    }}
  ],
  "relationship_recommendations": [
    {{
      "from_fact_index": 0,
      "to_fact_index": 1,
      "relationship_type": "DEPENDS_ON|REFERENCES|etc",
      "rationale": "why this relationship exists"
    }}
  ],
  "structural_insights": "Overall structural recommendations"
}}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]

        response_text = await self.chat_completion(
            messages=messages,
            temperature=0.3,  # Lower temperature for more consistent analysis
            max_tokens=4000
        )

        # Parse JSON response
        import json
        try:
            # Extract JSON from markdown code blocks if present
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()

            # Try to find and parse valid JSON by finding matching braces
            # This handles cases where LLM adds text after the JSON
            start_idx = response_text.find('{')
            if start_idx != -1:
                # Count braces to find the complete JSON object
                brace_count = 0
                for i in range(start_idx, len(response_text)):
                    if response_text[i] == '{':
                        brace_count += 1
                    elif response_text[i] == '}':
                        brace_count -= 1
                        if brace_count == 0:
                            # Found matching closing brace
                            json_text = response_text[start_idx:i+1]
                            return json.loads(json_text)

            # Fallback: try parsing the whole response
            return json.loads(response_text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.error(f"Response preview: {response_text[:500]}")
            return {
                "overall_assessment": "Error parsing response",
                "raw_response": response_text,
                "error": str(e)
            }
