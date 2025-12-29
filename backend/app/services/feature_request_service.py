"""
Feature Request Service for Progressive PRD workflow.

Handles:
- Creating and managing feature requests from cv-hub
- AI enrichment (dedup, categorization, skeleton generation)
- Triage workflow (accept, reject, merge)
- Elaboration into full PRDs
"""

from sqlalchemy import create_engine, desc
from sqlalchemy.orm import sessionmaker, Session
from typing import List, Dict, Any, Optional
from datetime import datetime
import logging
import uuid

from app.models.db_models import Base, PRDModel, FeatureRequestModel
from app.models.request_models import (
    FeatureRequestCreate,
    AIAnalysis,
    PRDSkeleton,
    PRDSkeletonSection,
    RequestType,
)
from app.core.config import settings

logger = logging.getLogger(__name__)


class FeatureRequestService:
    """Service for feature request operations"""

    def __init__(
        self,
        database_url: Optional[str] = None,
        vector_service=None,
        graph_service=None,
        openrouter_service=None,
    ):
        self.database_url = database_url or settings.DATABASE_URL
        self.engine = create_engine(self.database_url, echo=False)
        self.SessionLocal = sessionmaker(bind=self.engine)

        # External services (injected or lazy-loaded)
        self._vector_service = vector_service
        self._graph_service = graph_service
        self._openrouter_service = openrouter_service

        self._ensure_table()

    def _ensure_table(self):
        """Ensure feature_requests table exists"""
        try:
            Base.metadata.create_all(self.engine, tables=[FeatureRequestModel.__table__])
            logger.info("Feature requests table initialized")
        except Exception as e:
            logger.error(f"Failed to initialize feature_requests table: {e}")

    def get_session(self) -> Session:
        """Get a new database session"""
        return self.SessionLocal()

    # =========================================================================
    # CRUD Operations
    # =========================================================================

    def create_request(
        self,
        data: FeatureRequestCreate,
        enrich_with_ai: bool = True,
    ) -> FeatureRequestModel:
        """
        Create a new feature request.

        If enrich_with_ai is True, performs:
        - Vector embedding and similarity search
        - AI categorization and summary
        - PRD skeleton generation
        """
        request_id = str(uuid.uuid4())

        with self.get_session() as session:
            request = FeatureRequestModel(
                id=request_id,
                external_id=data.external_id,
                requester_id=data.requester_id,
                requester_name=data.requester_name,
                requester_email=data.requester_email,
                source=data.source,
                title=data.title,
                problem_statement=data.problem_statement,
                proposed_solution=data.proposed_solution,
                success_criteria=data.success_criteria,
                additional_context=data.additional_context,
                status="raw",
            )

            session.add(request)
            session.commit()
            session.refresh(request)
            logger.info(f"Created feature request: {data.title} (ID: {request_id})")

            # AI enrichment (async in production, sync for now)
            if enrich_with_ai:
                self._enrich_request(session, request)
                session.commit()
                session.refresh(request)

            return request

    def get_request(self, request_id: str) -> Optional[FeatureRequestModel]:
        """Get a feature request by ID"""
        with self.get_session() as session:
            return session.query(FeatureRequestModel).filter(
                FeatureRequestModel.id == request_id
            ).first()

    def get_request_by_external_id(self, external_id: str) -> Optional[FeatureRequestModel]:
        """Get a feature request by external ID (cv-hub reference)"""
        with self.get_session() as session:
            return session.query(FeatureRequestModel).filter(
                FeatureRequestModel.external_id == external_id
            ).first()

    def list_requests(
        self,
        status: Optional[str] = None,
        requester_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[List[FeatureRequestModel], int]:
        """List feature requests with optional filters"""
        with self.get_session() as session:
            query = session.query(FeatureRequestModel)

            if status:
                query = query.filter(FeatureRequestModel.status == status)
            if requester_id:
                query = query.filter(FeatureRequestModel.requester_id == requester_id)

            total = query.count()
            requests = query.order_by(
                desc(FeatureRequestModel.created_at)
            ).offset((page - 1) * page_size).limit(page_size).all()

            return requests, total

    def update_request(
        self,
        request_id: str,
        updates: Dict[str, Any],
    ) -> Optional[FeatureRequestModel]:
        """Update a feature request"""
        with self.get_session() as session:
            request = session.query(FeatureRequestModel).filter(
                FeatureRequestModel.id == request_id
            ).first()

            if not request:
                return None

            for key, value in updates.items():
                if hasattr(request, key):
                    setattr(request, key, value)

            session.commit()
            session.refresh(request)
            return request

    # =========================================================================
    # Triage Operations
    # =========================================================================

    def start_review(self, request_id: str, reviewer_id: str) -> Optional[FeatureRequestModel]:
        """Mark a request as under review"""
        return self.update_request(request_id, {
            "status": "under_review",
            "reviewer_id": reviewer_id,
            "triaged_at": datetime.utcnow(),
        })

    def accept_request(
        self,
        request_id: str,
        reviewer_id: str,
        reviewer_notes: Optional[str] = None,
        priority: Optional[str] = None,
    ) -> Optional[FeatureRequestModel]:
        """Accept a feature request"""
        return self.update_request(request_id, {
            "status": "accepted",
            "reviewer_id": reviewer_id,
            "reviewer_notes": reviewer_notes,
            "priority": priority,
            "accepted_at": datetime.utcnow(),
        })

    def reject_request(
        self,
        request_id: str,
        reviewer_id: str,
        rejection_reason: str,
    ) -> Optional[FeatureRequestModel]:
        """Reject a feature request"""
        return self.update_request(request_id, {
            "status": "rejected",
            "reviewer_id": reviewer_id,
            "rejection_reason": rejection_reason,
        })

    def merge_request(
        self,
        request_id: str,
        merge_into_id: str,
        reviewer_id: str,
        reviewer_notes: Optional[str] = None,
    ) -> Optional[FeatureRequestModel]:
        """Merge a request into another"""
        return self.update_request(request_id, {
            "status": "merged",
            "merged_into_id": merge_into_id,
            "reviewer_id": reviewer_id,
            "reviewer_notes": reviewer_notes,
        })

    # =========================================================================
    # Elaboration (Convert to PRD)
    # =========================================================================

    def elaborate_to_prd(
        self,
        request_id: str,
        use_skeleton: bool = True,
        additional_sections: Optional[List[str]] = None,
        prd_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Convert an accepted feature request into a full PRD.

        Returns dict with prd_id and updated request.
        """
        with self.get_session() as session:
            request = session.query(FeatureRequestModel).filter(
                FeatureRequestModel.id == request_id
            ).first()

            if not request:
                return None

            if request.status not in ["accepted", "elaborating"]:
                logger.warning(f"Cannot elaborate request {request_id} with status {request.status}")
                return None

            # Update status
            request.status = "elaborating"

            # Create PRD from skeleton or from scratch
            prd_id = str(uuid.uuid4())
            name = prd_name or request.title

            # Build PRD content from request and skeleton
            description = request.ai_summary or request.problem_statement[:500]

            prd = PRDModel(
                id=prd_id,
                name=name,
                description=description,
                raw_content=self._build_prd_content(request, use_skeleton, additional_sections),
            )

            session.add(prd)
            request.prd_id = prd_id
            session.commit()

            logger.info(f"Elaborated request {request_id} into PRD {prd_id}")

            return {
                "request_id": request_id,
                "prd_id": prd_id,
                "request_status": request.status,
                "prd_name": name,
            }

    def _build_prd_content(
        self,
        request: FeatureRequestModel,
        use_skeleton: bool,
        additional_sections: Optional[List[str]],
    ) -> str:
        """Build PRD markdown content from request"""
        sections = []

        # Header
        sections.append(f"# {request.title}\n")

        # Overview
        sections.append("## Overview\n")
        if request.ai_summary:
            sections.append(request.ai_summary + "\n")

        # Problem Statement
        sections.append("## Problem Statement\n")
        sections.append(request.problem_statement + "\n")

        # Proposed Solution
        if request.proposed_solution:
            sections.append("## Proposed Solution\n")
            sections.append(request.proposed_solution + "\n")

        # Success Criteria
        if request.success_criteria:
            sections.append("## Success Criteria\n")
            sections.append(request.success_criteria + "\n")

        # Use skeleton sections if available
        if use_skeleton and request.prd_skeleton:
            skeleton = request.prd_skeleton
            if isinstance(skeleton, dict) and "sections" in skeleton:
                for section in skeleton["sections"]:
                    title = section.get("title", "Section")
                    content = section.get("suggested_content", "")
                    sections.append(f"## {title}\n")
                    sections.append(content + "\n")

        # Additional context
        if request.additional_context:
            sections.append("## Additional Context\n")
            sections.append(request.additional_context + "\n")

        # Metadata
        sections.append("## Metadata\n")
        sections.append(f"- **Request ID**: {request.id}\n")
        sections.append(f"- **Requester**: {request.requester_name or request.requester_id}\n")
        sections.append(f"- **Type**: {request.request_type or 'feature'}\n")
        sections.append(f"- **Category**: {request.category or 'uncategorized'}\n")
        sections.append(f"- **Created**: {request.created_at}\n")

        return "\n".join(sections)

    # =========================================================================
    # AI Enrichment
    # =========================================================================

    def _enrich_request(self, session: Session, request: FeatureRequestModel):
        """
        Enrich a feature request with AI analysis.

        This is a simplified version - in production, this would:
        1. Generate embeddings via OpenRouter
        2. Search Qdrant for similar requests
        3. Search for related PRD chunks
        4. Use LLM to categorize and summarize
        5. Generate PRD skeleton

        For now, we do basic analysis without external calls.
        """
        try:
            # Basic analysis without external services
            request.request_type = self._infer_request_type(request)
            request.category = self._infer_category(request)
            request.tags = self._generate_tags(request)
            request.priority_suggestion = self._suggest_priority(request)
            request.ai_summary = self._generate_summary(request)
            request.prd_skeleton = self._generate_skeleton(request)

            logger.info(f"Enriched request {request.id} with basic AI analysis")

        except Exception as e:
            logger.error(f"Failed to enrich request {request.id}: {e}")

    def _infer_request_type(self, request: FeatureRequestModel) -> str:
        """Infer request type from content"""
        text = (request.title + " " + request.problem_statement).lower()

        if any(word in text for word in ["bug", "error", "crash", "broken", "fix"]):
            return "bug"
        if any(word in text for word in ["improve", "better", "enhance", "faster"]):
            return "enhancement"
        if any(word in text for word in ["integrate", "connect", "api", "sync"]):
            return "integration"
        if any(word in text for word in ["easier", "confusing", "ux", "ui", "usability"]):
            return "usability"
        if any(word in text for word in ["change", "modify", "update", "replace"]):
            return "change"

        return "feature"

    def _infer_category(self, request: FeatureRequestModel) -> str:
        """Infer category from content"""
        text = (request.title + " " + request.problem_statement).lower()

        categories = {
            "Authentication": ["login", "auth", "password", "sign in", "sign up", "mfa", "2fa"],
            "UI/UX": ["ui", "ux", "design", "theme", "dark mode", "layout", "style"],
            "Performance": ["slow", "fast", "performance", "speed", "optimize", "cache"],
            "API": ["api", "endpoint", "rest", "graphql", "webhook"],
            "Integration": ["integrate", "connect", "sync", "import", "export"],
            "Security": ["security", "encrypt", "permission", "access", "role"],
            "Data": ["data", "database", "storage", "backup", "migration"],
            "Reporting": ["report", "analytics", "dashboard", "metrics", "chart"],
        }

        for category, keywords in categories.items():
            if any(keyword in text for keyword in keywords):
                return category

        return "General"

    def _generate_tags(self, request: FeatureRequestModel) -> List[str]:
        """Generate tags from content"""
        tags = []
        text = (request.title + " " + request.problem_statement).lower()

        tag_keywords = {
            "mobile": ["mobile", "ios", "android", "app"],
            "web": ["web", "browser", "frontend"],
            "backend": ["backend", "server", "api"],
            "database": ["database", "sql", "storage"],
            "security": ["security", "auth", "permission"],
            "performance": ["performance", "speed", "optimize"],
            "ux": ["ux", "usability", "user experience"],
            "integration": ["integration", "third-party", "external"],
        }

        for tag, keywords in tag_keywords.items():
            if any(keyword in text for keyword in keywords):
                tags.append(tag)

        return tags[:5]  # Limit to 5 tags

    def _suggest_priority(self, request: FeatureRequestModel) -> str:
        """Suggest priority based on content"""
        text = (request.title + " " + request.problem_statement).lower()

        if any(word in text for word in ["critical", "urgent", "emergency", "blocker", "crash"]):
            return "critical"
        if any(word in text for word in ["important", "major", "significant", "asap"]):
            return "high"
        if any(word in text for word in ["nice to have", "minor", "small", "eventually"]):
            return "low"

        return "medium"

    def _generate_summary(self, request: FeatureRequestModel) -> str:
        """Generate a summary of the request"""
        # Simple extraction-based summary
        problem = request.problem_statement[:200]
        if len(request.problem_statement) > 200:
            problem = problem.rsplit(" ", 1)[0] + "..."

        summary = f"Request to {request.title.lower()}. {problem}"
        return summary

    def _generate_skeleton(self, request: FeatureRequestModel) -> Dict[str, Any]:
        """Generate a PRD skeleton structure"""
        sections = [
            {
                "title": "Requirements",
                "suggested_content": "Define the functional requirements for this feature.",
                "priority": "high",
            },
            {
                "title": "User Stories",
                "suggested_content": "As a [user type], I want [goal] so that [benefit].",
                "priority": "high",
            },
            {
                "title": "Acceptance Criteria",
                "suggested_content": "Define what 'done' looks like for this feature.",
                "priority": "high",
            },
            {
                "title": "Technical Considerations",
                "suggested_content": "Outline technical approach, dependencies, and constraints.",
                "priority": "medium",
            },
            {
                "title": "Risks & Mitigations",
                "suggested_content": "Identify potential risks and how to address them.",
                "priority": "medium",
            },
        ]

        return {
            "name": request.title,
            "description": request.ai_summary or request.problem_statement[:200],
            "sections": sections,
        }


# Singleton instance (initialized on import)
_feature_request_service: Optional[FeatureRequestService] = None


def get_feature_request_service() -> FeatureRequestService:
    """Get or create the feature request service singleton"""
    global _feature_request_service
    if _feature_request_service is None:
        _feature_request_service = FeatureRequestService()
    return _feature_request_service
