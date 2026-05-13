"""
Tests for the Hall of Shame endpoints.
"""

import pytest
from httpx import AsyncClient
from uuid import uuid4
from app.models.shame import HallOfShameEntry


@pytest.mark.asyncio
async def test_shame_list_returns_200(client: AsyncClient):
    """Test that shame list endpoint returns 200 OK."""
    response = await client.get("/api/v1/shame")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_shame_list_returns_paginated_response(client: AsyncClient):
    """Test that shame list has pagination metadata."""
    response = await client.get("/api/v1/shame")
    data = response.json()
    assert "entries" in data
    assert "pagination" in data
    assert isinstance(data["entries"], list)


@pytest.mark.asyncio
async def test_shame_list_pagination_metadata(client: AsyncClient):
    """Test pagination metadata structure."""
    response = await client.get("/api/v1/shame")
    data = response.json()
    pagination = data.get("pagination", {})

    required_fields = ["page", "page_size", "total_entries", "total_pages"]
    for field in required_fields:
        assert field in pagination, f"Pagination missing field: {field}"


@pytest.mark.asyncio
async def test_shame_list_default_pagination(client: AsyncClient):
    """Test default pagination values."""
    response = await client.get("/api/v1/shame")
    data = response.json()
    pagination = data.get("pagination", {})
    assert pagination.get("page") == 1
    assert pagination.get("page_size") == 20


@pytest.mark.asyncio
async def test_shame_list_custom_page(client: AsyncClient):
    """Test custom page parameter."""
    response = await client.get("/api/v1/shame?page=2")
    assert response.status_code == 200
    data = response.json()
    assert data["pagination"]["page"] == 2


@pytest.mark.asyncio
async def test_shame_list_invalid_page_returns_422(client: AsyncClient):
    """Test invalid page parameter."""
    response = await client.get("/api/v1/shame?page=0")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_shame_list_custom_page_size(client: AsyncClient):
    """Test custom page_size parameter."""
    response = await client.get("/api/v1/shame?page_size=10")
    assert response.status_code == 200
    data = response.json()
    assert data["pagination"]["page_size"] == 10


@pytest.mark.asyncio
async def test_shame_list_page_size_max_limit(client: AsyncClient):
    """Test page_size maximum limit (50)."""
    response = await client.get("/api/v1/shame?page_size=51")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_shame_list_sort_parameter(client: AsyncClient):
    """Test sort parameter accepts 'newest' and 'top'."""
    response_newest = await client.get("/api/v1/shame?sort=newest")
    assert response_newest.status_code == 200

    response_top = await client.get("/api/v1/shame?sort=top")
    assert response_top.status_code == 200


@pytest.mark.asyncio
async def test_shame_list_invalid_sort_returns_422(client: AsyncClient):
    """Test invalid sort parameter."""
    response = await client.get("/api/v1/shame?sort=invalid")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_shame_list_agent_slug_filter(client: AsyncClient):
    """Test agent_slug filter parameter."""
    response = await client.get("/api/v1/shame?agent_slug=test-agent")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_shame_get_by_slug_not_found(client: AsyncClient):
    """Test getting non-existent shame entry returns 404."""
    response = await client.get("/api/v1/shame/nonexistent-slug-AAAAAAAAAAA")
    assert response.status_code == 404
    data = response.json()
    assert data["detail"]["code"] == "ENTRY_NOT_FOUND"


@pytest.mark.asyncio
async def test_shame_get_by_slug_invalid_format(client: AsyncClient):
    """Test getting shame entry with invalid slug format returns 422."""
    response = await client.get("/api/v1/shame/INVALID_SLUG")
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_shame_submit_missing_session_id_returns_400(client: AsyncClient):
    """Test submitting shame without session ID returns 400."""
    response = await client.post(
        "/api/v1/shame",
        json={
            "title": "Test",
            "agent_slugs": [],
            "transcript": [],
            "conversation_id": str(uuid4()),
        },
        headers={},  # No X-Session-ID
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_shame_submit_invalid_transcript(client: AsyncClient):
    """Test submitting shame with invalid transcript."""
    response = await client.post(
        "/api/v1/shame",
        json={
            "title": "Test",
            "agent_slugs": [],
            "transcript": [{"invalid": "structure"}],
            "conversation_id": str(uuid4()),
        },
        headers={"X-Session-ID": "valid-session"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_shame_submit_missing_fields_returns_422(client: AsyncClient):
    """Test submitting shame with missing required fields."""
    response = await client.post(
        "/api/v1/shame",
        json={},
        headers={"X-Session-ID": "valid-session"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_shame_upvote_missing_session_id_returns_400(client: AsyncClient):
    """Test upvoting without session ID returns 400."""
    response = await client.post(
        "/api/v1/shame/test-slug-AAAAAAAAAAA/upvote",
        headers={},  # No X-Session-ID
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_shame_upvote_invalid_slug_returns_422(client: AsyncClient):
    """Test upvoting with invalid slug format returns 422."""
    response = await client.post(
        "/api/v1/shame/INVALID/upvote",
        headers={"X-Session-ID": "valid-session"},
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_shame_upvote_nonexistent_returns_404(client: AsyncClient):
    """Test upvoting non-existent entry returns 404."""
    response = await client.post(
        "/api/v1/shame/nonexistent-slug-AAAAAAAAAAA/upvote",
        headers={"X-Session-ID": "valid-session"},
    )
    assert response.status_code == 404
    data = response.json()
    assert data["detail"]["code"] == "ENTRY_NOT_FOUND"


@pytest.mark.asyncio
async def test_shame_entry_card_structure(client: AsyncClient):
    """Test shame entry card has required fields."""
    response = await client.get("/api/v1/shame")
    data = response.json()
    entries = data.get("entries", [])

    if entries:
        entry = entries[0]
        required_fields = [
            "id",
            "slug",
            "title",
            "agent_slugs",
            "upvote_count",
            "is_featured",
            "preview",
            "created_at",
        ]
        for field in required_fields:
            assert field in entry, f"Entry card missing field: {field}"
