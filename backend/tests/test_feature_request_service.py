"""
Unit tests for Feature Request Service.

Tests the feature request lifecycle:
- Creation and enrichment
- Triage workflow (accept, reject, merge)
- Elaboration to PRD
- AI analysis
"""

import pytest
import os
from datetime import datetime
from unittest.mock import patch, MagicMock

# Use SQLite for testing
os.environ["DATABASE_URL"] = "sqlite:///./test_feature_requests.db"

from app.services.feature_request_service import FeatureRequestService
from app.models.request_models import FeatureRequestCreate


@pytest.fixture
def service():
    """Create a fresh service instance with SQLite test database."""
    svc = FeatureRequestService(database_url="sqlite:///./test_feature_requests.db")
    yield svc
    # Cleanup
    if os.path.exists("./test_feature_requests.db"):
        os.remove("./test_feature_requests.db")


@pytest.fixture
def sample_request_data():
    """Sample feature request data."""
    return FeatureRequestCreate(
        external_id="cvhub-user123-1234567890",
        requester_id="user123",
        requester_name="Test User",
        requester_email="test@example.com",
        source="cv-hub",
        title="Add dark mode support",
        problem_statement="Users are experiencing eye strain when using the application in low-light environments. A dark mode option would significantly improve usability.",
        proposed_solution="Implement a theme toggle that switches between light and dark color schemes.",
        success_criteria="Users can toggle between light and dark mode, and the setting persists across sessions.",
    )


class TestFeatureRequestCreation:
    """Tests for feature request creation."""

    def test_create_request_basic(self, service, sample_request_data):
        """Test creating a basic feature request."""
        request = service.create_request(sample_request_data, enrich_with_ai=False)

        assert request is not None
        assert request.id is not None
        assert request.external_id == sample_request_data.external_id
        assert request.title == sample_request_data.title
        assert request.status == "raw"
        assert request.requester_id == sample_request_data.requester_id

    def test_create_request_with_enrichment(self, service, sample_request_data):
        """Test creating a request with AI enrichment."""
        request = service.create_request(sample_request_data, enrich_with_ai=True)

        assert request is not None
        assert request.request_type is not None
        assert request.category is not None
        assert request.ai_summary is not None
        assert request.prd_skeleton is not None

    def test_create_request_infers_type_enhancement(self, service):
        """Test that request type is inferred correctly for enhancements."""
        data = FeatureRequestCreate(
            external_id="test-enhance",
            requester_id="user1",
            source="test",
            title="Improve loading speed",
            problem_statement="The page loading is slow. We need to make it faster and better.",
        )
        request = service.create_request(data, enrich_with_ai=True)

        assert request.request_type == "enhancement"

    def test_create_request_infers_type_bug(self, service):
        """Test that request type is inferred correctly for bugs."""
        data = FeatureRequestCreate(
            external_id="test-bug",
            requester_id="user1",
            source="test",
            title="Fix login crash",
            problem_statement="The application crashes with an error when logging in.",
        )
        request = service.create_request(data, enrich_with_ai=True)

        assert request.request_type == "bug"

    def test_create_request_infers_category(self, service):
        """Test that category is inferred correctly."""
        data = FeatureRequestCreate(
            external_id="test-cat",
            requester_id="user1",
            source="test",
            title="Add MFA login",
            problem_statement="We need two-factor authentication for security.",
        )
        request = service.create_request(data, enrich_with_ai=True)

        assert request.category == "Authentication"


class TestFeatureRequestRetrieval:
    """Tests for retrieving feature requests."""

    def test_get_request_by_id(self, service, sample_request_data):
        """Test retrieving a request by ID."""
        created = service.create_request(sample_request_data, enrich_with_ai=False)
        retrieved = service.get_request(created.id)

        assert retrieved is not None
        assert retrieved.id == created.id
        assert retrieved.title == created.title

    def test_get_request_by_external_id(self, service, sample_request_data):
        """Test retrieving a request by external ID."""
        created = service.create_request(sample_request_data, enrich_with_ai=False)
        retrieved = service.get_request_by_external_id(sample_request_data.external_id)

        assert retrieved is not None
        assert retrieved.external_id == sample_request_data.external_id

    def test_get_nonexistent_request(self, service):
        """Test retrieving a request that doesn't exist."""
        result = service.get_request("nonexistent-id")
        assert result is None

    def test_list_requests_pagination(self, service):
        """Test listing requests with pagination."""
        # Create multiple requests
        for i in range(15):
            data = FeatureRequestCreate(
                external_id=f"test-list-{i}",
                requester_id="user1",
                source="test",
                title=f"Test request {i}",
                problem_statement="Test problem",
            )
            service.create_request(data, enrich_with_ai=False)

        # Test pagination
        page1, total = service.list_requests(page=1, page_size=10)
        assert len(page1) == 10
        assert total == 15

        page2, _ = service.list_requests(page=2, page_size=10)
        assert len(page2) == 5

    def test_list_requests_filter_by_status(self, service, sample_request_data):
        """Test filtering requests by status."""
        created = service.create_request(sample_request_data, enrich_with_ai=False)

        raw_requests, _ = service.list_requests(status="raw")
        assert len(raw_requests) >= 1
        assert any(r.id == created.id for r in raw_requests)

        accepted_requests, _ = service.list_requests(status="accepted")
        assert not any(r.id == created.id for r in accepted_requests)


class TestTriageWorkflow:
    """Tests for the triage workflow."""

    def test_start_review(self, service, sample_request_data):
        """Test starting a review."""
        created = service.create_request(sample_request_data, enrich_with_ai=False)
        reviewed = service.start_review(created.id, reviewer_id="reviewer1")

        assert reviewed is not None
        assert reviewed.status == "under_review"
        assert reviewed.reviewer_id == "reviewer1"
        assert reviewed.triaged_at is not None

    def test_accept_request(self, service, sample_request_data):
        """Test accepting a request."""
        created = service.create_request(sample_request_data, enrich_with_ai=False)
        service.start_review(created.id, reviewer_id="reviewer1")

        accepted = service.accept_request(
            created.id,
            reviewer_id="reviewer1",
            reviewer_notes="Good idea, let's implement this.",
            priority="high",
        )

        assert accepted is not None
        assert accepted.status == "accepted"
        assert accepted.priority == "high"
        assert accepted.reviewer_notes == "Good idea, let's implement this."
        assert accepted.accepted_at is not None

    def test_reject_request(self, service, sample_request_data):
        """Test rejecting a request."""
        created = service.create_request(sample_request_data, enrich_with_ai=False)
        service.start_review(created.id, reviewer_id="reviewer1")

        rejected = service.reject_request(
            created.id,
            reviewer_id="reviewer1",
            rejection_reason="Out of scope for current roadmap",
        )

        assert rejected is not None
        assert rejected.status == "rejected"
        assert rejected.rejection_reason == "Out of scope for current roadmap"

    def test_merge_request(self, service):
        """Test merging a request into another."""
        # Create two similar requests
        data1 = FeatureRequestCreate(
            external_id="merge-1",
            requester_id="user1",
            source="test",
            title="Add dark mode",
            problem_statement="Need dark mode",
        )
        data2 = FeatureRequestCreate(
            external_id="merge-2",
            requester_id="user2",
            source="test",
            title="Dark theme support",
            problem_statement="Want dark theme",
        )

        request1 = service.create_request(data1, enrich_with_ai=False)
        request2 = service.create_request(data2, enrich_with_ai=False)

        merged = service.merge_request(
            request2.id,
            merge_into_id=request1.id,
            reviewer_id="reviewer1",
            reviewer_notes="Similar to existing request",
        )

        assert merged is not None
        assert merged.status == "merged"
        assert merged.merged_into_id == request1.id


class TestElaboration:
    """Tests for PRD elaboration."""

    def test_elaborate_accepted_request(self, service, sample_request_data):
        """Test elaborating an accepted request into a PRD."""
        created = service.create_request(sample_request_data, enrich_with_ai=True)
        service.accept_request(created.id, reviewer_id="reviewer1")

        result = service.elaborate_to_prd(created.id)

        assert result is not None
        assert "prd_id" in result
        assert result["request_status"] == "elaborating"
        assert result["prd_name"] == sample_request_data.title

    def test_cannot_elaborate_raw_request(self, service, sample_request_data):
        """Test that raw requests cannot be elaborated."""
        created = service.create_request(sample_request_data, enrich_with_ai=False)

        result = service.elaborate_to_prd(created.id)

        assert result is None

    def test_cannot_elaborate_rejected_request(self, service, sample_request_data):
        """Test that rejected requests cannot be elaborated."""
        created = service.create_request(sample_request_data, enrich_with_ai=False)
        service.reject_request(created.id, "reviewer1", "Not needed")

        result = service.elaborate_to_prd(created.id)

        assert result is None


class TestAIAnalysis:
    """Tests for AI analysis functions."""

    def test_priority_suggestion_critical(self, service):
        """Test critical priority detection."""
        data = FeatureRequestCreate(
            external_id="priority-critical",
            requester_id="user1",
            source="test",
            title="Critical security fix",
            problem_statement="This is a blocker that causes crashes in production.",
        )
        request = service.create_request(data, enrich_with_ai=True)

        assert request.priority_suggestion == "critical"

    def test_priority_suggestion_high(self, service):
        """Test high priority detection."""
        data = FeatureRequestCreate(
            external_id="priority-high",
            requester_id="user1",
            source="test",
            title="Important feature",
            problem_statement="This is a major issue that needs ASAP attention.",
        )
        request = service.create_request(data, enrich_with_ai=True)

        assert request.priority_suggestion == "high"

    def test_priority_suggestion_low(self, service):
        """Test low priority detection."""
        data = FeatureRequestCreate(
            external_id="priority-low",
            requester_id="user1",
            source="test",
            title="Nice to have feature",
            problem_statement="This is a minor improvement, eventually would be nice.",
        )
        request = service.create_request(data, enrich_with_ai=True)

        assert request.priority_suggestion == "low"

    def test_tags_generation(self, service):
        """Test that relevant tags are generated."""
        data = FeatureRequestCreate(
            external_id="tags-test",
            requester_id="user1",
            source="test",
            title="Mobile app performance",
            problem_statement="The mobile iOS app is slow and the backend API needs optimization.",
        )
        request = service.create_request(data, enrich_with_ai=True)

        assert request.tags is not None
        assert "mobile" in request.tags or "performance" in request.tags or "backend" in request.tags

    def test_summary_generation(self, service, sample_request_data):
        """Test that AI summary is generated."""
        request = service.create_request(sample_request_data, enrich_with_ai=True)

        assert request.ai_summary is not None
        assert len(request.ai_summary) > 0
        assert sample_request_data.title.lower() in request.ai_summary.lower()

    def test_prd_skeleton_structure(self, service, sample_request_data):
        """Test that PRD skeleton has correct structure."""
        request = service.create_request(sample_request_data, enrich_with_ai=True)

        skeleton = request.prd_skeleton
        assert skeleton is not None
        assert "name" in skeleton
        assert "description" in skeleton
        assert "sections" in skeleton
        assert len(skeleton["sections"]) > 0

        # Check section structure
        section = skeleton["sections"][0]
        assert "title" in section
        assert "suggested_content" in section
        assert "priority" in section


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
