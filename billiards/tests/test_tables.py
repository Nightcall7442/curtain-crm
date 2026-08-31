"""Тесты создания столов."""

from fastapi.testclient import TestClient


def test_create_table(client: TestClient) -> None:
    response = client.post("/api/tables", json={"name": "Стол А"})
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Стол А"
    assert body["status"] == "free"

    listed = client.get("/api/tables").json()
    assert [t["name"] for t in listed] == ["Стол А"]


def test_create_table_duplicate_name_rejected(client: TestClient) -> None:
    assert client.post("/api/tables", json={"name": "Стол А"}).status_code == 201
    response = client.post("/api/tables", json={"name": "Стол А"})
    assert response.status_code == 409


def test_create_table_writes_journal(client: TestClient) -> None:
    client.post("/api/tables", json={"name": "Стол А"})
    events = [e["event"] for e in client.get("/api/journal").json()]
    assert "table_created" in events
