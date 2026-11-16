"""Focused checks for persisted Docker telemetry and tenant boundaries."""
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def create_authenticated_user(prefix):
    email = f'{prefix}_{datetime.now(timezone.utc).timestamp()}@test.internal'
    password = 'StrongPassword123!'
    assert client.post('/api/v1/auth/register', json={'email': email, 'password': password}).status_code == 201
    response = client.post('/api/v1/auth/login', json={'email': email, 'password': password})
    assert response.status_code == 200
    return email, response.json()['access_token']


def enroll(token, name):
    response = client.post('/api/v1/agents/enroll', headers={'Authorization': f'Bearer {token}'}, json={'name': name})
    assert response.status_code == 201, response.text
    return response.json()


def sample(container_id='sample', recorded_at=None):
    return {'container_id': container_id, 'name': container_id, 'state': 'running',
            'health_status': 'healthy', 'cpu_percent': 12.5, 'memory_bytes': 100,
            'memory_limit': 200, 'restart_count': 0, 'network_rx_bytes': 500,
            'network_tx_bytes': 200, 'block_read_bytes': 100, 'block_write_bytes': 50,
            'recorded_at': (recorded_at or datetime.now(timezone.utc)).isoformat()}


def test_history_retry_tenant_range_and_removed():
    _, owner = create_authenticated_user('history_owner')
    _, outsider = create_authenticated_user('history_outsider')
    agent = enroll(owner, 'history host')
    timestamp = datetime.now(timezone.utc) - timedelta(seconds=15)
    payload = {'timestamp': timestamp.isoformat(), 'complete_inventory': True,
               'containers': [sample(recorded_at=timestamp)]}
    key = {'X-Agent-Key': agent['agent_key']}
    for _ in range(2):
        response = client.post('/api/v1/metrics/ingest', headers=key, json=payload)
        assert response.status_code == 200, response.text
    auth = {'Authorization': f'Bearer {owner}'}
    history_url = f"/api/v1/metrics/containers/history?agent_id={agent['id']}&container_id=sample"
    history = client.get(history_url, headers=auth)
    assert history.status_code == 200, history.text
    assert len(history.json()['samples']) == 1
    assert history.json()['samples'][0]['network_rx_bytes'] == 500
    assert client.get(history_url, headers={'Authorization': f'Bearer {outsider}'}).json()['samples'] == []
    specific = client.get(f"/api/v1/metrics/containers/sample/history?agent_id={agent['id']}", headers=auth)
    assert specific.status_code == 200 and len(specific.json()['samples']) == 1
    assert client.get(f"/api/v1/metrics/containers/sample/history?agent_id={agent['id']}", headers={'Authorization': f'Bearer {outsider}'}).json()['samples'] == []
    future_start = datetime.now(timezone.utc).isoformat()
    future_end = (datetime.now(timezone.utc) + timedelta(seconds=30)).isoformat()
    filtered = client.get('/api/v1/metrics/containers/history', headers=auth, params={'agent_id': agent['id'], 'container_id': 'sample', 'start': future_start, 'end': future_end})
    assert filtered.status_code == 200 and filtered.json()['samples'] == []
    missing = {'timestamp': datetime.now(timezone.utc).isoformat(), 'complete_inventory': True, 'containers': []}
    assert client.post('/api/v1/metrics/ingest', headers=key, json=missing).status_code == 200
    current = client.get('/api/v1/metrics/containers', headers=auth).json()
    item = next(row for row in current if row['agent_id'] == agent['id'])
    assert item['monitoring_status'] == 'removed'
    assert item['cpu_percent'] is None
    assert len(client.get(history_url, headers=auth).json()['samples']) == 2
    events = client.get(f"/api/v1/metrics/containers/events?agent_id={agent['id']}", headers=auth).json()['events']
    assert events[-1]['state'] == 'removed'
    assert client.get(f"/api/v1/metrics/containers/events?agent_id={agent['id']}", headers={'Authorization': f'Bearer {outsider}'}).json()['events'] == []


def test_offline_heartbeat_and_old_agent_payload():
    _, owner = create_authenticated_user('history_legacy')
    agent = enroll(owner, 'legacy host')
    key = {'X-Agent-Key': agent['agent_key']}
    old_sample = sample('legacy')
    for field in ('recorded_at', 'network_rx_bytes', 'network_tx_bytes', 'block_read_bytes', 'block_write_bytes'):
        old_sample.pop(field)
    response = client.post('/api/v1/metrics/ingest', headers=key, json={'containers': [old_sample]})
    assert response.status_code == 200, response.text
    from app.database import SessionLocal
    from app.models.agent import Agent
    with SessionLocal() as db:
        row = db.get(Agent, agent['id'])
        row.last_heartbeat = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()
    current = client.get('/api/v1/metrics/containers', headers={'Authorization': f'Bearer {owner}'}).json()
    assert next(row for row in current if row['agent_id'] == agent['id'])['monitoring_status'] == 'agent_offline'
