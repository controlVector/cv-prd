"""
Usage Tracking Service for cv-prd

Tracks AI API usage including tokens, costs, and usage patterns.
Provides analytics for users and projects.
"""

import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from pathlib import Path
import threading

logger = logging.getLogger(__name__)

# Model pricing per 1M tokens (as of late 2024 - update periodically)
# Format: {"model_id": {"input": price_per_1M, "output": price_per_1M}}
MODEL_PRICING = {
    # Anthropic models
    "anthropic/claude-3.5-sonnet": {"input": 3.00, "output": 15.00},
    "anthropic/claude-3.5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "anthropic/claude-3-opus": {"input": 15.00, "output": 75.00},
    "anthropic/claude-3-sonnet": {"input": 3.00, "output": 15.00},
    "anthropic/claude-3-haiku": {"input": 0.25, "output": 1.25},
    # OpenAI models
    "openai/gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "openai/gpt-4o": {"input": 5.00, "output": 15.00},
    "openai/gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "openai/gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    # Google models
    "google/gemini-pro": {"input": 0.50, "output": 1.50},
    "google/gemini-pro-1.5": {"input": 3.50, "output": 10.50},
    # Meta models
    "meta-llama/llama-3.1-70b-instruct": {"input": 0.88, "output": 0.88},
    "meta-llama/llama-3.1-8b-instruct": {"input": 0.18, "output": 0.18},
    # Mistral models
    "mistralai/mistral-large": {"input": 4.00, "output": 12.00},
    "mistralai/mistral-medium": {"input": 2.70, "output": 8.10},
    "mistralai/mistral-small": {"input": 1.00, "output": 3.00},
    "mistralai/mixtral-8x7b-instruct": {"input": 0.24, "output": 0.24},
    # Default fallback
    "default": {"input": 1.00, "output": 3.00},
}

# Available models for UI selection
AVAILABLE_MODELS = [
    {"id": "anthropic/claude-3.5-sonnet", "name": "Claude 3.5 Sonnet", "provider": "Anthropic", "tier": "recommended"},
    {"id": "anthropic/claude-3-opus", "name": "Claude 3 Opus", "provider": "Anthropic", "tier": "premium"},
    {"id": "anthropic/claude-3-haiku", "name": "Claude 3 Haiku", "provider": "Anthropic", "tier": "fast"},
    {"id": "openai/gpt-4o", "name": "GPT-4o", "provider": "OpenAI", "tier": "recommended"},
    {"id": "openai/gpt-4o-mini", "name": "GPT-4o Mini", "provider": "OpenAI", "tier": "fast"},
    {"id": "openai/gpt-4-turbo", "name": "GPT-4 Turbo", "provider": "OpenAI", "tier": "premium"},
    {"id": "google/gemini-pro-1.5", "name": "Gemini Pro 1.5", "provider": "Google", "tier": "recommended"},
    {"id": "meta-llama/llama-3.1-70b-instruct", "name": "Llama 3.1 70B", "provider": "Meta", "tier": "open"},
    {"id": "meta-llama/llama-3.1-8b-instruct", "name": "Llama 3.1 8B", "provider": "Meta", "tier": "fast"},
    {"id": "mistralai/mistral-large", "name": "Mistral Large", "provider": "Mistral", "tier": "premium"},
    {"id": "mistralai/mixtral-8x7b-instruct", "name": "Mixtral 8x7B", "provider": "Mistral", "tier": "open"},
]


class UsageTrackingService:
    """Service for tracking and analyzing AI API usage."""

    def __init__(self, storage_path: Optional[str] = None):
        """
        Initialize usage tracking service.

        Args:
            storage_path: Path to store usage logs. Defaults to ~/.controlvector/usage/
        """
        if storage_path:
            self.storage_path = Path(storage_path)
        else:
            self.storage_path = Path.home() / ".controlvector" / "usage"

        self.storage_path.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        logger.info(f"UsageTrackingService initialized, storage: {self.storage_path}")

    def log_usage(
        self,
        user_id: Optional[str],
        project_id: Optional[str],
        model: str,
        endpoint: str,
        tokens_in: int,
        tokens_out: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Log an API usage event.

        Args:
            user_id: ID of the user making the request
            project_id: ID of the project/PRD (if applicable)
            model: Model ID used (e.g., "anthropic/claude-3.5-sonnet")
            endpoint: API endpoint called (e.g., "generate_tests", "generate_docs")
            tokens_in: Number of input tokens
            tokens_out: Number of output tokens
            metadata: Additional metadata about the request

        Returns:
            Usage record with calculated cost
        """
        # Calculate cost
        pricing = MODEL_PRICING.get(model, MODEL_PRICING["default"])
        cost_in = (tokens_in / 1_000_000) * pricing["input"]
        cost_out = (tokens_out / 1_000_000) * pricing["output"]
        total_cost = cost_in + cost_out

        record = {
            "id": f"{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}_{os.urandom(4).hex()}",
            "timestamp": datetime.utcnow().isoformat(),
            "user_id": user_id,
            "project_id": project_id,
            "model": model,
            "endpoint": endpoint,
            "tokens_in": tokens_in,
            "tokens_out": tokens_out,
            "tokens_total": tokens_in + tokens_out,
            "cost_usd": round(total_cost, 6),
            "metadata": metadata or {},
        }

        # Store the record
        self._store_record(record)

        logger.info(
            f"Usage logged: {endpoint} - {model} - "
            f"{tokens_in}+{tokens_out} tokens - ${total_cost:.6f}"
        )

        return record

    def _store_record(self, record: Dict[str, Any]) -> None:
        """Store a usage record to disk."""
        # Organize by date for easier querying
        date_str = record["timestamp"][:10]  # YYYY-MM-DD
        file_path = self.storage_path / f"usage_{date_str}.jsonl"

        with self._lock:
            with open(file_path, "a") as f:
                f.write(json.dumps(record) + "\n")

    def get_usage_summary(
        self,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        days: int = 30,
    ) -> Dict[str, Any]:
        """
        Get usage summary for a user or project.

        Args:
            user_id: Filter by user ID
            project_id: Filter by project ID
            days: Number of days to include

        Returns:
            Summary with totals and breakdown
        """
        records = self._load_records(days)

        # Filter
        if user_id:
            records = [r for r in records if r.get("user_id") == user_id]
        if project_id:
            records = [r for r in records if r.get("project_id") == project_id]

        if not records:
            return {
                "period_days": days,
                "total_requests": 0,
                "total_tokens": 0,
                "total_cost_usd": 0,
                "by_model": {},
                "by_endpoint": {},
                "by_day": {},
            }

        # Aggregate
        total_tokens = sum(r.get("tokens_total", 0) for r in records)
        total_cost = sum(r.get("cost_usd", 0) for r in records)

        by_model = {}
        by_endpoint = {}
        by_day = {}

        for r in records:
            # By model
            model = r.get("model", "unknown")
            if model not in by_model:
                by_model[model] = {"requests": 0, "tokens": 0, "cost_usd": 0}
            by_model[model]["requests"] += 1
            by_model[model]["tokens"] += r.get("tokens_total", 0)
            by_model[model]["cost_usd"] += r.get("cost_usd", 0)

            # By endpoint
            endpoint = r.get("endpoint", "unknown")
            if endpoint not in by_endpoint:
                by_endpoint[endpoint] = {"requests": 0, "tokens": 0, "cost_usd": 0}
            by_endpoint[endpoint]["requests"] += 1
            by_endpoint[endpoint]["tokens"] += r.get("tokens_total", 0)
            by_endpoint[endpoint]["cost_usd"] += r.get("cost_usd", 0)

            # By day
            day = r.get("timestamp", "")[:10]
            if day not in by_day:
                by_day[day] = {"requests": 0, "tokens": 0, "cost_usd": 0}
            by_day[day]["requests"] += 1
            by_day[day]["tokens"] += r.get("tokens_total", 0)
            by_day[day]["cost_usd"] += r.get("cost_usd", 0)

        # Round costs
        for v in by_model.values():
            v["cost_usd"] = round(v["cost_usd"], 4)
        for v in by_endpoint.values():
            v["cost_usd"] = round(v["cost_usd"], 4)
        for v in by_day.values():
            v["cost_usd"] = round(v["cost_usd"], 4)

        return {
            "period_days": days,
            "total_requests": len(records),
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
            "by_model": by_model,
            "by_endpoint": by_endpoint,
            "by_day": dict(sorted(by_day.items())),
        }

    def get_usage_details(
        self,
        user_id: Optional[str] = None,
        project_id: Optional[str] = None,
        days: int = 7,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """
        Get detailed usage records.

        Args:
            user_id: Filter by user ID
            project_id: Filter by project ID
            days: Number of days to include
            limit: Maximum records to return

        Returns:
            List of usage records (most recent first)
        """
        records = self._load_records(days)

        # Filter
        if user_id:
            records = [r for r in records if r.get("user_id") == user_id]
        if project_id:
            records = [r for r in records if r.get("project_id") == project_id]

        # Sort by timestamp descending and limit
        records.sort(key=lambda r: r.get("timestamp", ""), reverse=True)
        return records[:limit]

    def get_project_usage(self, project_id: str, days: int = 30) -> Dict[str, Any]:
        """Get usage summary for a specific project."""
        return self.get_usage_summary(project_id=project_id, days=days)

    def get_user_usage(self, user_id: str, days: int = 30) -> Dict[str, Any]:
        """Get usage summary for a specific user."""
        return self.get_usage_summary(user_id=user_id, days=days)

    def _load_records(self, days: int) -> List[Dict[str, Any]]:
        """Load usage records from disk for the specified number of days."""
        records = []
        cutoff = datetime.utcnow() - timedelta(days=days)

        for i in range(days + 1):
            date = datetime.utcnow() - timedelta(days=i)
            date_str = date.strftime("%Y-%m-%d")
            file_path = self.storage_path / f"usage_{date_str}.jsonl"

            if file_path.exists():
                try:
                    with open(file_path, "r") as f:
                        for line in f:
                            if line.strip():
                                record = json.loads(line)
                                records.append(record)
                except Exception as e:
                    logger.warning(f"Error reading usage file {file_path}: {e}")

        return records

    @staticmethod
    def get_available_models() -> List[Dict[str, str]]:
        """Get list of available models for UI selection."""
        return AVAILABLE_MODELS

    @staticmethod
    def get_model_pricing(model: str) -> Dict[str, float]:
        """Get pricing for a specific model."""
        return MODEL_PRICING.get(model, MODEL_PRICING["default"])

    @staticmethod
    def estimate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
        """Estimate cost for a given model and token count."""
        pricing = MODEL_PRICING.get(model, MODEL_PRICING["default"])
        cost_in = (tokens_in / 1_000_000) * pricing["input"]
        cost_out = (tokens_out / 1_000_000) * pricing["output"]
        return round(cost_in + cost_out, 6)


# Singleton instance
_usage_service: Optional[UsageTrackingService] = None


def get_usage_service() -> UsageTrackingService:
    """Get the singleton usage tracking service instance."""
    global _usage_service
    if _usage_service is None:
        _usage_service = UsageTrackingService()
    return _usage_service
