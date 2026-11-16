from datetime import datetime, timedelta, timezone
from test_container_history import client, create_authenticated_user, enroll
from app.database import SessionLocal
from app.models.agent import Agent


def test_zero_container_connection_transitions():
    _, token = create_authenticated_user('connection')
    agent = enroll(token, 'Zero container host')
    auth = {'Authorization': f'Bearer {token}'}
    url = f"/api/v1/agents/{agent['id']}/connection-status"
    assert client.get(url, headers=auth).json()['stage'] == 'waiting_for_agent'
    assert client.post('/api/v1/agents/heartbeat', headers={'X-Agent-Key':agent['agent_key']}, json={}).status_code == 200
    hb_result = client.get(url, headers=auth).json()
    assert hb_result['stage'] == 'heartbeat_received' and hb_result['status'] == 'online'
    assert client.post('/api/v1/metrics/ingest', headers={'X-Agent-Key':agent['agent_key']}, json={'containers': [], 'complete_inventory': True}).status_code == 200
    result = client.get(url, headers=auth).json()
    assert result['stage'] == 'connected' and result['status'] == 'online'
    assert result['container_count'] == 0
    with SessionLocal() as db:
        row = db.get(Agent, agent['id'])
        row.last_heartbeat = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()
    result = client.get(url, headers=auth).json()
    assert result['stage'] == 'offline' and result['status'] == 'offline'
    client.delete(f"/api/v1/agents/{agent['id']}", headers=auth)
    assert client.get(url, headers=auth).json()['stage'] == 'revoked'
