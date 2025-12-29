"""
Integration tests for Feature Request API endpoints.

Tests the REST API for feature requests via FastAPI TestClient.
"""

import pytest
import os
from fastapi.testclient import TestClient

# Use SQLite for testing
os.environ["DATABASE_URL"] = "sqlite:///./test_api.db"

from app.main import app


@pytest.fixture
def client():
    """Create a test client."""
    with TestClient(app) as test_client:
        yield test_client
    # Cleanup
    if os.path.exists("./test_api.db"):
        os.remove("./test_api.db")


@pytest.fixture
def sample_request_payload():
    """Sample feature request payload."""
    return {
        "external_id": "cvhub-test-123",
        "requester_id": "user-456",
        "requester_name": "Test User",
        "requester_email": "test@example.com",
        "source": "cv-hub",
        "title": "Add export to PDF",
        "problem_statement": "Users need to export their documents to PDF format for sharing with stakeholders who don't have access to the system.",
        "proposed_solution": "Add a PDF export button on the document view page",
        "success_criteria": "Users can generate a well-formatted PDF from any document",
    }


class TestCreateFeatureRequest:
    """Tests for POST /api/requests"""

    def test_create_request_success(self, client, sample_request_payload):
        """Test successful feature request creation."""
        response = client.post("/api/requests", json=sample_request_payload)

        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["external_id"] == sample_request_payload["external_id"]
        assert data["status"] == "raw"
        assert "ai_analysis" in data

    def test_create_request_minimal(self, client):
        """Test creating request with minimal required fields."""
        payload = {
            "external_id": "minimal-test",
            "requester_id": "user1",
            "source": "test",
            "title": "Minimal request",
            "problem_statement": "Minimal problem statement for testing.",
        }
        response = client.post("/api/requests", json=payload)

        assert response.status_code == 200
        data = response.json()
        assert data["external_id"] == "minimal-test"

    def test_create_request_missing_title(self, client):
        """Test that missing title returns validation error."""
        payload = {
            "external_id": "no-title",
            "requester_id": "user1",
            "source": "test",
            "problem_statement": "Problem without title",
        }
        response = client.post("/api/requests", json=payload)

        assert response.status_code == 422

    def test_create_request_missing_problem(self, client):
        """Test that missing problem statement returns validation error."""
        payload = {
            "external_id": "no-problem",
            "requester_id": "user1",
            "source": "test",
            "title": "Title without problem",
        }
        response = client.post("/api/requests", json=payload)

        assert response.status_code == 422


class TestGetFeatureRequest:
    """Tests for GET /api/requests/{id}"""

    def test_get_request_by_id(self, client, sample_request_payload):
        """Test retrieving a request by ID."""
        create_response = client.post("/api/requests", json=sample_request_payload)
        request_id = create_response.json()["id"]

        response = client.get(f"/api/requests/{request_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["id"] == request_id
        assert data["title"] == sample_request_payload["title"]

    def test_get_request_not_found(self, client):
        """Test 404 for non-existent request."""
        response = client.get("/api/requests/nonexistent-id")

        assert response.status_code == 404

    def test_get_request_by_external_id(self, client, sample_request_payload):
        """Test retrieving by external ID."""
        client.post("/api/requests", json=sample_request_payload)

        response = client.get(
            f"/api/requests/by-external-id/{sample_request_payload['external_id']}"
        )

        assert response.status_code == 200
        data = response.json()
        assert data["external_id"] == sample_request_payload["external_id"]


class TestListFeatureRequests:
    """Tests for GET /api/requests"""

    def test_list_requests_empty(self, client):
        """Test listing when no requests exist."""
        response = client.get("/api/requests")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["requests"] == []

    def test_list_requests_with_data(self, client, sample_request_payload):
        """Test listing with existing requests."""
        client.post("/api/requests", json=sample_request_payload)

        response = client.get("/api/requests")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["requests"]) >= 1

    def test_list_requests_pagination(self, client):
        """Test pagination parameters."""
        # Create multiple requests
        for i in range(5):
            payload = {
                "external_id": f"list-test-{i}",
                "requester_id": "user1",
                "source": "test",
                "title": f"Request {i}",
                "problem_statement": "Test problem",
            }
            client.post("/api/requests", json=payload)

        response = client.get("/api/requests?page=1&page_size=2")

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert len(data["requests"]) == 2
        assert data["has_more"] is True

    def test_list_requests_filter_by_status(self, client, sample_request_payload):
        """Test filtering by status."""
        client.post("/api/requests", json=sample_request_payload)

        response = client.get("/api/requests?status=raw")

        assert response.status_code == 200
        data = response.json()
        assert all(r["status"] == "raw" for r in data["requests"])

    def test_list_requests_filter_by_requester(self, client, sample_request_payload):
        """Test filtering by requester ID."""
        client.post("/api/requests", json=sample_request_payload)

        response = client.get(
            f"/api/requests?requester_id={sample_request_payload['requester_id']}"
        )

        assert response.status_code == 200
        data = response.json()
        assert all(
            r["requester_id"] == sample_request_payload["requester_id"]
            for r in data["requests"]
        )


class TestTriageEndpoints:
    """Tests for triage workflow endpoints."""

    def test_start_review(self, client, sample_request_payload):
        """Test starting a review."""
        create_response = client.post("/api/requests", json=sample_request_payload)
        request_id = create_response.json()["id"]

        response = client.post(
            f"/api/requests/{request_id}/start-review",
            json={"reviewer_id": "reviewer1"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "under_review"
        assert data["reviewer_id"] == "reviewer1"

    def test_accept_request(self, client, sample_request_payload):
        """Test accepting a request."""
        create_response = client.post("/api/requests", json=sample_request_payload)
        request_id = create_response.json()["id"]

        response = client.post(
            f"/api/requests/{request_id}/accept",
            json={
                "reviewer_id": "reviewer1",
                "reviewer_notes": "Approved",
                "priority": "high",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "accepted"
        assert data["priority"] == "high"

    def test_reject_request(self, client, sample_request_payload):
        """Test rejecting a request."""
        create_response = client.post("/api/requests", json=sample_request_payload)
        request_id = create_response.json()["id"]

        response = client.post(
            f"/api/requests/{request_id}/reject",
            json={
                "reviewer_id": "reviewer1",
                "rejection_reason": "Out of scope",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "rejected"
        assert data["rejection_reason"] == "Out of scope"

    def test_merge_request(self, client):
        """Test merging requests."""
        # Create two requests
        payload1 = {
            "external_id": "merge-target",
            "requester_id": "user1",
            "source": "test",
            "title": "Original request",
            "problem_statement": "Original problem",
        }
        payload2 = {
            "external_id": "merge-source",
            "requester_id": "user2",
            "source": "test",
            "title": "Duplicate request",
            "problem_statement": "Same problem",
        }

        resp1 = client.post("/api/requests", json=payload1)
        resp2 = client.post("/api/requests", json=payload2)

        target_id = resp1.json()["id"]
        source_id = resp2.json()["id"]

        response = client.post(
            f"/api/requests/{source_id}/merge",
            json={
                "merge_into_id": target_id,
                "reviewer_id": "reviewer1",
                "reviewer_notes": "Duplicate",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "merged"
        assert data["merged_into_id"] == target_id


class TestElaborateEndpoint:
    """Tests for POST /api/requests/{id}/elaborate"""

    def test_elaborate_accepted_request(self, client, sample_request_payload):
        """Test elaborating an accepted request."""
        create_response = client.post("/api/requests", json=sample_request_payload)
        request_id = create_response.json()["id"]

        # Accept the request first
        client.post(
            f"/api/requests/{request_id}/accept",
            json={"reviewer_id": "reviewer1", "priority": "medium"},
        )

        response = client.post(
            f"/api/requests/{request_id}/elaborate",
            json={"use_skeleton": True},
        )

        assert response.status_code == 200
        data = response.json()
        assert "prd_id" in data
        assert data["request_status"] == "elaborating"

    def test_elaborate_raw_request_fails(self, client, sample_request_payload):
        """Test that elaborating a raw request fails."""
        create_response = client.post("/api/requests", json=sample_request_payload)
        request_id = create_response.json()["id"]

        response = client.post(
            f"/api/requests/{request_id}/elaborate",
            json={"use_skeleton": True},
        )

        assert response.status_code == 400


class TestHealthCheck:
    """Tests for health check endpoint."""

    def test_health_check(self, client):
        """Test the health check endpoint."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
