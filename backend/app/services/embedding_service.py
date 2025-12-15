"""Embedding service using OpenRouter API"""
from typing import List
import logging
import os
import httpx

logger = logging.getLogger(__name__)


class EmbeddingService:
    """Service for generating text embeddings using OpenRouter API"""

    def __init__(self, model_name: str = "openai/text-embedding-3-small"):
        self.model_name = model_name
        self.api_key = os.environ.get("OPENROUTER_API_KEY")
        self.base_url = "https://openrouter.ai/api/v1"
        self._dimension = 1536  # text-embedding-3-small dimension

        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not set - embeddings will be disabled")

    def embed_text(self, text: str) -> List[float]:
        """
        Generate embedding for a single text

        Args:
            text: Input text to embed

        Returns:
            List of floats representing the embedding vector
        """
        if not self.api_key:
            return [0.0] * self._dimension

        try:
            with httpx.Client(timeout=30.0) as client:
                response = client.post(
                    f"{self.base_url}/embeddings",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model_name,
                        "input": text
                    }
                )
                response.raise_for_status()
                data = response.json()
                return data["data"][0]["embedding"]
        except Exception as e:
            logger.error(f"Embedding API error: {e}")
            return [0.0] * self._dimension

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts efficiently

        Args:
            texts: List of texts to embed

        Returns:
            List of embedding vectors
        """
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
                    json={
                        "model": self.model_name,
                        "input": texts
                    }
                )
                response.raise_for_status()
                data = response.json()
                return [item["embedding"] for item in data["data"]]
        except Exception as e:
            logger.error(f"Embedding API error: {e}")
            return [[0.0] * self._dimension for _ in texts]

    def get_dimension(self) -> int:
        """Get the dimension of the embedding vectors"""
        return self._dimension

    def is_available(self) -> bool:
        """Check if embedding service is available"""
        return self.api_key is not None
