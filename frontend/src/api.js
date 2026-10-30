/**
 * Centralized API client for CloudMonitor
 * Uses same-origin reverse-proxy paths:
 *   - /api/*  -> FastAPI backend (:8000)
 *   - /prom/* -> Prometheus HTTP API (:9090)
 */

const DEFAULT_TIMEOUT_MS = 8000;
const AUTH_TOKEN_KEY = 'cloudmonitor_auth_token';

export function getStoredToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export function setStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {
    console.error('Failed to save auth token to localStorage:', e);
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (e) {
    console.error('Failed to clear auth token from localStorage:', e);
  }
}

// Configurable API base URL (defaults to same-origin reverse-proxy path if unset)
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  // Auto-attach stored Bearer token if not explicitly provided
  const token = getStoredToken();
  const headers = {
    ...options.headers,
  };

  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Prepend API_BASE_URL if configured and URL is a relative path
  const resolvedUrl = url.startsWith('http://') || url.startsWith('https://')
    ? url
    : `${API_BASE_URL}${url}`;

  try {
    const response = await fetch(resolvedUrl, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(id);
    return response;
  } catch (err) {
    clearTimeout(id);
    if (err.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw err;
  }
}

export const api = {
  // Token Helpers
  getToken: getStoredToken,
  setToken: setStoredToken,
  clearToken: clearStoredToken,

  // Authentication Endpoints
  async register(email, password) {
    const res = await fetchWithTimeout('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      let detail = 'Registration failed';
      try {
        const errorData = await res.json();
        if (typeof errorData.detail === 'string') {
          detail = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          detail = errorData.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
        }
      } catch (e) {
        detail = `HTTP error ${res.status}`;
      }

      if (res.status === 409) {
        detail = 'An account with this email address already exists. Please log in.';
      } else if (res.status === 422) {
        detail = 'Invalid input. Please provide a valid email and a password with at least 8 characters.';
      }

      throw new Error(detail);
    }

    return await res.json();
  },

  async login(email, password) {
    const res = await fetchWithTimeout('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      let detail = 'Authentication failed';
      try {
        const errorData = await res.json();
        if (typeof errorData.detail === 'string') {
          detail = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          detail = errorData.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
        }
      } catch (e) {
        detail = `HTTP error ${res.status}`;
      }

      if (res.status === 401) {
        detail = 'Invalid email or password. Please verify your credentials.';
      }

      throw new Error(detail);
    }

    const data = await res.json();
    if (data.access_token) {
      setStoredToken(data.access_token);
    }
    return data;
  },

  async getMe() {
    const token = getStoredToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const res = await fetchWithTimeout('/api/v1/auth/me', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!res.ok) {
      if (res.status === 401) {
        clearStoredToken();
        throw new Error('Session expired or invalid credentials');
      }
      throw new Error(`Profile request failed (${res.status})`);
    }

    return await res.json();
  },

  logout() {
    clearStoredToken();
  },

  // Agent Management Endpoints
  async enrollAgent(name, osType = 'linux') {
    const res = await fetchWithTimeout('/api/v1/agents/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, os_type: osType }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Agent enrollment failed (${res.status})`);
    }
    return await res.json();
  },

  async listAgents() {
    const res = await fetchWithTimeout('/api/v1/agents');
    if (!res.ok) {
      if (res.status === 401) {
        clearStoredToken();
        throw new Error('Session expired');
      }
      throw new Error(`Failed to list agents (${res.status})`);
    }
    return await res.json();
  },

  async getAgentConnectionStatus(agentId) {
    const res = await fetchWithTimeout(`/api/v1/agents/${agentId}/connection-status`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to fetch connection status (${res.status})`);
    }
    return await res.json();
  },

  async rotateAgentKey(agentId) {
    const res = await fetchWithTimeout(`/api/v1/agents/${agentId}/rotate-key`, {
      method: 'POST',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to rotate agent credentials (${res.status})`);
    }
    return await res.json();
  },

  async revokeAgent(agentId, purge = false) {
    const res = await fetchWithTimeout(`/api/v1/agents/${agentId}?purge=${purge}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to revoke agent (${res.status})`);
    }
    return await res.json();
  },

  // Container Metrics Endpoints
  async getContainerMetrics(agentId = null) {
    const url = agentId ? `/api/v1/metrics/containers?agent_id=${agentId}` : '/api/v1/metrics/containers';
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      if (res.status === 401) {
        clearStoredToken();
        throw new Error('Session expired');
      }
      throw new Error(`Failed to retrieve container metrics (${res.status})`);
    }
    return await res.json();
  },

  // Backend Endpoints
  async getHealth() {
    const res = await fetchWithTimeout('/api/health');
    if (!res.ok) throw new Error(`Backend health check failed (${res.status})`);
    return await res.json();
  },

  async getStatus() {
    const res = await fetchWithTimeout('/api/v1/status');
    if (!res.ok) throw new Error(`Backend status check failed (${res.status})`);
    return await res.json();
  },

  async simulateError() {
    const res = await fetchWithTimeout('/api/v1/simulate/error', { method: 'POST' });
    if (res.status === 500) {
      // Expected SRE fault injection response
      return { success: true, status: 500, detail: 'Simulated 500 internal server error triggered' };
    }
    if (res.status === 403) {
      throw new Error('Simulation endpoints are forbidden in non-development environments');
    }
    throw new Error(`Unexpected response code: ${res.status}`);
  },

  async simulateLatency(delay = 1.5) {
    const res = await fetchWithTimeout(`/api/v1/simulate/latency?delay=${delay}`);
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('Simulation endpoints are forbidden in non-development environments');
      }
      throw new Error(`Latency simulation failed (${res.status})`);
    }
    return await res.json();
  },

  async toggleHealth(healthyState) {
    const res = await fetchWithTimeout(`/api/v1/simulate/health-toggle?status=${healthyState}`, { method: 'POST' });
    if (!res.ok) {
      if (res.status === 403) {
        throw new Error('Simulation endpoints are forbidden in non-development environments');
      }
      throw new Error(`Health toggle failed (${res.status})`);
    }
    return await res.json();
  },

  // Prometheus Endpoints
  async getTargets() {
    const res = await fetchWithTimeout('/prom/api/v1/targets');
    if (!res.ok) throw new Error(`Prometheus targets query failed (${res.status})`);
    return await res.json();
  },

  async getAlerts() {
    const res = await fetchWithTimeout('/prom/api/v1/alerts');
    if (!res.ok) throw new Error(`Prometheus alerts query failed (${res.status})`);
    return await res.json();
  },

  async getRules() {
    const res = await fetchWithTimeout('/prom/api/v1/rules');
    if (!res.ok) throw new Error(`Prometheus rules query failed (${res.status})`);
    return await res.json();
  },

  async queryInstant(promQL) {
    const encoded = encodeURIComponent(promQL);
    const res = await fetchWithTimeout(`/prom/api/v1/query?query=${encoded}`);
    if (!res.ok) throw new Error(`PromQL instant query failed (${res.status})`);
    return await res.json();
  },

  async queryRange(promQL, startSec, endSec, step = '15s') {
    const encoded = encodeURIComponent(promQL);
    const res = await fetchWithTimeout(
      `/prom/api/v1/query_range?query=${encoded}&start=${startSec}&end=${endSec}&step=${step}`
    );
    if (!res.ok) throw new Error(`PromQL range query failed (${res.status})`);
    return await res.json();
  },
};
