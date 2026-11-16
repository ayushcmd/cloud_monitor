import pytest

@pytest.fixture
def enable_dev_provisioning(monkeypatch):
    """
    Narrowly scoped fixture to temporarily enable development provisioning
    in test environments only for tests that need to exercise authorized
    provisioning behavior, header forwarding protection, and tenant isolation.
    Environment variables are automatically restored after each test.
    """
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.setenv("ENABLE_DEV_PROVISIONING", "true")
    yield
