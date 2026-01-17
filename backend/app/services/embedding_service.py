"""Embedding service supporting multiple providers (OpenRouter, Ollama)"""
from typing import List, Optional
import logging
import os
import httpx

logger = logging.getLogger(__name__)

# Known embedding dimensions for common models
MODEL_DIMENSIONS = {
    # OpenAI models (via OpenRouter)
    "openai/text-embedding-3-small": 1536,
    "openai/text-embedding-3-large": 3072,
    "openai/text-embedding-ada-002": 1536,
    # Ollama models
    "nomic-embed-text": 768,
    "mxbai-embed-large": 1024,
    "all-minilm": 384,
    "snowflake-arctic-embed": 1024,
    # Sentence transformers
    "all-MiniLM-L6-v2": 384,
    "all-mpnet-base-v2": 768,
}


class EmbeddingService:
    """Service for generating text embeddings using OpenRouter or Ollama"""

    def __init__(
        self,
        model_name: str = "openai/text-embedding-3-small",
        provider: Optional[str] = None,  # "openrouter" or "ollama"
        ollama_url: Optional[str] = None,
    ):
        self.model_name = model_name
        self.ollama_url = ollama_url or os.environ.get("OLLAMA_URL", "http://localhost:11434")

        # Auto-detect provider from model name or explicit setting
        if provider:
            self.provider = provider
        elif "/" in model_name:  # OpenRouter uses "provider/model" format
            self.provider = "openrouter"
        else:
            self.provider = os.environ.get("EMBEDDING_PROVIDER", "ollama")

        # Get API key for OpenRouter
        self.api_key = os.environ.get("OPENROUTER_API_KEY")
        self.base_url = "https://openrouter.ai/api/v1"

        # Determine dimension from known models or detect it
        self._dimension = self._get_dimension()

        if self.provider == "openrouter" and not self.api_key:
            logger.warning("OPENROUTER_API_KEY not set - embeddings will be disabled")

        logger.info(f"Embedding service initialized: provider={self.provider}, model={model_name}, dimension={self._dimension}")

    def _get_dimension(self) -> int:
        """Get embedding dimension from known models or by probing"""
        # Check known dimensions first
        if self.model_name in MODEL_DIMENSIONS:
            return MODEL_DIMENSIONS[self.model_name]

        # For unknown models, try to detect by making a test embedding
        try:
            test_embedding = self._embed_single_raw("test")
            if test_embedding:
                dim = len(test_embedding)
                logger.info(f"Auto-detected embedding dimension: {dim}")
                return dim
        except Exception as e:
            logger.warning(f"Could not auto-detect embedding dimension: {e}")

        # Default fallback
        return 1536 if self.provider == "openrouter" else 768

    def _embed_single_raw(self, text: str) -> Optional[List[float]]:
        """Raw embedding call without fallback - used for dimension detection"""
        if self.provider == "ollama":
            return self._embed_ollama(text)
        else:
            return self._embed_openrouter(text)

    def _embed_openrouter(self, text: str) -> Optional[List[float]]:
        """Embed using OpenRouter API"""
        if not self.api_key:
            return None
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{self.base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={"model": self.model_name, "input": text}
                )
                response.raise_for_status()
                return response.json()["data"][0]["embedding"]
        except Exception as e:
            logger.error(f"OpenRouter embedding error: {e}")
            return None

    def _embed_ollama(self, text: str) -> Optional[List[float]]:
        """Embed using Ollama API"""
        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{self.ollama_url}/api/embeddings",
                    json={"model": self.model_name, "prompt": text}
                )
                response.raise_for_status()
                return response.json()["embedding"]
        except Exception as e:
            logger.error(f"Ollama embedding error: {e}")
            return None

    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text

        Args:
            text: Input text to embed

        Returns:
            List of floats representing the embedding vector
        """
        result = self._embed_single_raw(text)
        if result:
            return result
        return [0.0] * self._dimension

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts efficiently

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
        if self.provider == "ollama":
            # Ollama doesn't support batch, embed one by one
            return [self.embed_text(t) for t in texts]

        # OpenRouter batch embedding
        if not self.api_key:
            return [[0.0] * self._dimension for _ in texts]

        try:
            with httpx.Client(timeout=60.0) as client:
                response = client.post(
                    f"{self.base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={"model": self.model_name, "input": texts}
                )
                response.raise_for_status()
                return [item["embedding"] for item in response.json()["data"]]
        except Exception as e:
            logger.error(f"Batch embedding error: {e}")
            return [[0.0] * self._dimension for _ in texts]

    def get_dimension(self) -> int:
        """Get the dimension of the embedding vectors"""
        return self._dimension

    def is_available(self) -> bool:
        """Check if embedding service is available"""
        if self.provider == "openrouter":
            return self.api_key is not None
        # For Ollama, assume available (will fail gracefully if not running)
        return True
