"""Тесты открытия и закрытия сеансов."""

from fastapi.testclient import TestClient

from app.services.lighting import get_lighting_controller


def test_open_table(client: TestClient, table_id: int, tariff_id: int) -> None:
    response = client.post(
        f"/api/tables/{table_id}/open", json={"tariff_id": tariff_id}
    )
    assert response.status_code == 201
    session = response.json()
    assert session["table_id"] == table_id
    assert session["ended_at"] is None
    assert session["total_cost"] is None
    assert session["price_per_hour"] == 600

    dashboard = client.get("/api/dashboard").json()
    table = next(t for t in dashboard if t["id"] == table_id)
    assert table["status"] == "busy"
    assert table["light_on"] is True
    assert table["session"]["session_id"] == session["id"]
    assert get_lighting_controller().is_light_on(table_id)


def test_close_table(client: TestClient, table_id: int, tariff_id: int) -> None:
    client.post(f"/api/tables/{table_id}/open", json={"tariff_id": tariff_id})
    response = client.post(f"/api/tables/{table_id}/close")
    assert response.status_code == 200
    session = response.json()
    assert session["ended_at"] is not None
    assert session["total_cost"] is not None

    dashboard = client.get("/api/dashboard").json()
    table = next(t for t in dashboard if t["id"] == table_id)
    assert table["status"] == "free"
    assert table["session"] is None
    assert table["light_on"] is False
    assert not get_lighting_controller().is_light_on(table_id)

    history = client.get("/api/history").json()
    assert [s["id"] for s in history] == [session["id"]]

    events = [e["event"] for e in client.get("/api/journal").json()]
    for expected in ("session_opened", "light_on", "session_closed", "light_off"):
        assert expected in events


def test_cannot_open_busy_table(
    client: TestClient, table_id: int, tariff_id: int
) -> None:
    assert (
        client.post(
            f"/api/tables/{table_id}/open", json={"tariff_id": tariff_id}
        ).status_code
        == 201
    )
    response = client.post(
        f"/api/tables/{table_id}/open", json={"tariff_id": tariff_id}
    )
    assert response.status_code == 409

    # Открытых сеансов по-прежнему один.
    dashboard = client.get("/api/dashboard").json()
    assert sum(1 for t in dashboard if t["session"]) == 1


def test_cannot_close_free_table(client: TestClient, table_id: int) -> None:
    response = client.post(f"/api/tables/{table_id}/close")
    assert response.status_code == 409
    assert client.get("/api/history").json() == []


def test_open_unknown_table_or_tariff(
    client: TestClient, table_id: int, tariff_id: int
) -> None:
    assert (
        client.post("/api/tables/9999/open", json={"tariff_id": tariff_id}).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/tables/{table_id}/open", json={"tariff_id": 9999}
        ).status_code
        == 404
    )
