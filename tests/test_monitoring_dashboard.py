from fastapi import FastAPI
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, MagicMock, patch
from app.routers.monitoring import router
from app.auth.security import get_current_user


def test_monitoring_requires_authentication():
    app = FastAPI()
    app.include_router(router)
    assert TestClient(app).get('/dashboard').status_code == 401


def test_monitoring_bounds_and_series():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: object()
    client = TestClient(app)
    assert client.get('/dashboard?window=365d').status_code == 422
    assert client.get('/dashboard?category=custom').status_code == 422
    response = MagicMock()
    response.json.return_value = {'status': 'success', 'data': {'result': [
        {'metric': {'instance': 'test'}, 'values': [[1, 'NaN'], [2, '4.2']]}
    ]}}
    remote = AsyncMock()
    remote.get.return_value = response
    with patch('app.routers.monitoring.httpx.AsyncClient') as factory:
        factory.return_value.__aenter__.return_value = remote
        result = client.get('/dashboard?category=prometheus&window=15m')
    assert result.status_code == 200
    body = result.json()
    assert body['end'] - body['start'] == 900
    assert body['panels'][0]['series'][0]['points'] == [[1, None], [2, 4.2]]
