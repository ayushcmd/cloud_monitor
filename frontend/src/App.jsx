import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Activity,
  Server,
  Bell,
  FlaskConical,
  Settings as SettingsIcon,
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Cpu,
  HardDrive,
  Radio,
  Play,
  RotateCcw,
  Zap,
  Info,
  LogOut,
  User,
  Box,
  ShieldCheck,
  Check,
  ExternalLink
} from 'lucide-react';
import { api } from './api';
import AuthScreen from './components/AuthScreen';
import ConnectDockerModal from './components/ConnectDockerModal';

// Helper for formatting byte sizes (e.g., memory)
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Safe SVG Sparkline/Trend Chart
function TrendChart({
  dataSeries,
  height = 180,
  unit = '%',
  loading = false,
  error = null,
  emptyTitle = 'No metric samples recorded yet',
  emptySubtitle = 'Awaiting Prometheus Node Exporter scrape'
}) {
  if (loading) {
    return (
      <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '8px' }}>
        <RefreshCw size={22} className="spin-anim" style={{ color: 'var(--accent-cyan)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Loading metric samples...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--status-critical)', gap: '6px', padding: '12px', textAlign: 'center' }}>
        <AlertTriangle size={22} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Prometheus Telemetry Unavailable</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{error}</span>
      </div>
    );
  }

  const allValues = dataSeries ? dataSeries.flatMap(s => (s.points || []).map(p => p.val)) : [];
  if (!dataSeries || dataSeries.length === 0 || allValues.length === 0) {
    return (
      <div style={{ height, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', gap: '6px', textAlign: 'center', padding: '12px' }}>
        <Activity size={22} style={{ opacity: 0.5, color: 'var(--accent-cyan)' }} />
        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>{emptyTitle}</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{emptySubtitle}</span>
      </div>
    );
  }
  const minVal = Math.min(0, ...allValues);
  const maxVal = Math.max(10, ...allValues) * 1.15; // 15% headroom

  const width = 600;
  const padding = { top: 20, right: 20, bottom: 25, left: 45 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const getX = (index, total) => padding.left + (index / Math.max(1, total - 1)) * graphWidth;
  const getY = (val) => padding.top + graphHeight - ((val - minVal) / Math.max(0.0001, maxVal - minVal)) * graphHeight;

  return (
    <div className="chart-container" style={{ height }}>
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-svg" preserveAspectRatio="none">
        {/* Horizontal Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
          const y = padding.top + graphHeight * (1 - ratio);
          const labelVal = (minVal + ratio * (maxVal - minVal)).toFixed(1);
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="var(--chart-grid)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fill="var(--text-subtle)" fontSize="10" fontFamily="var(--font-mono)">
                {labelVal}{unit}
              </text>
            </g>
          );
        })}

        {/* Polylines for each series */}
        {dataSeries.map((series, idx) => {
          if (!series.points || series.points.length === 0) return null;
          const displayPoints = series.points.length === 1
            ? [series.points[0], series.points[0]]
            : series.points;
          const pointsStr = displayPoints
            .map((p, i) => `${getX(i, displayPoints.length)},${getY(p.val)}`)
            .join(' ');

          return (
            <g key={idx}>
              <polyline
                fill="none"
                stroke={series.color}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsStr}
              />
              {/* Endpoint glow dot */}
              {series.points.length > 0 && (
                <circle
                  cx={getX(series.points.length - 1, series.points.length)}
                  cy={getY(series.points[series.points.length - 1].val)}
                  r="4"
                  fill={series.color}
                  stroke="var(--bg-card)"
                  strokeWidth="2"
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function App() {
  // Authentication State
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);

  // Navigation & Theme
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('cloudmonitor_theme') || 'light');
  const [refreshInterval, setRefreshInterval] = useState(() => Number(localStorage.getItem('cloudmonitor_refresh')) || 10);

  // Docker Connect Modal State & Live Agent State
  const [dockerModalOpen, setDockerModalOpen] = useState(false);
  const [enrolledAgents, setEnrolledAgents] = useState([]);
  const [containerMetrics, setContainerMetrics] = useState([]);
  const [selectedHostId, setSelectedHostId] = useState(null);

  // Live Telemetry State
  const [backendHealth, setBackendHealth] = useState(null);
  const [targets, setTargets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [rules, setRules] = useState([]);
  const [kpis, setKpis] = useState({
    availability: '100.0%',
    p95Latency: '—',
    targetsUp: 0,
    targetsTotal: 0,
    firingAlerts: 0,
    activeRequests: 0,
    simulatedErrors: 0,
  });

  // Metrics Data History for Charts (In-memory rolling buffer)
  const [cpuHistory, setCpuHistory] = useState([]);
  const [memoryHistory, setMemoryHistory] = useState([]);
  const [promMetricsError, setPromMetricsError] = useState(null);
  const [promMetricsLoading, setPromMetricsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState(null);
  const [targetsLoading, setTargetsLoading] = useState(true);

  // SRE Lab States
  const [actionLog, setActionLog] = useState([
    { id: 1, time: new Date().toLocaleTimeString(), type: 'info', msg: 'CloudMonitor SRE Lab initialized in safe mode.' }
  ]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Status & Timestamps
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);

  // Sync Theme to HTML data-theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cloudmonitor_theme', theme);
  }, [theme]);

  // Persist Refresh Interval
  useEffect(() => {
    localStorage.setItem('cloudmonitor_refresh', refreshInterval.toString());
  }, [refreshInterval]);

  // Initial Auth Check: Verify JWT session with /auth/me
  useEffect(() => {
    async function verifyAuth() {
      const token = api.getToken();
      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const userProfile = await api.getMe();
        setCurrentUser(userProfile);
      } catch (err) {
        console.warn('Initial auth verification failed:', err.message);
        api.logout();
        setCurrentUser(null);
        setSessionExpiredNotice(true);
      } finally {
        setAuthLoading(false);
      }
    }

    verifyAuth();
  }, []);

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setSessionExpiredNotice(false);
    setEnrolledAgents([]);
    setContainerMetrics([]);
  };

  const addLog = (msg, type = 'info') => {
    setActionLog(prev => [
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), type, msg },
      ...prev.slice(0, 49) // Keep last 50 entries
    ]);
  };

  // Primary Polling Function (Only polls when authenticated)
  const fetchTelemetry = async () => {
    if (!currentUser) return;

    setIsRefreshing(true);
    setErrorBanner(null);

    try {
      // 1. Fetch Backend Health
      const healthData = await api.getHealth().catch(err => {
        console.warn('Backend /health unreachable:', err.message);
        return { status: 'unreachable', uptime_seconds: 0 };
      });
      setBackendHealth(healthData);

      // 2. Fetch Enrolled Agents & Real Container Metrics
      try {
        const agentsData = await api.listAgents().catch(() => []);
        setEnrolledAgents(agentsData);

        const metricsData = await api.getContainerMetrics().catch(() => []);
        setContainerMetrics(metricsData);
      } catch (e) {
        console.warn('Error fetching agent/container metrics:', e);
      }

      // 3. Fetch Prometheus Scrape Targets
      let activeTargets = [];
      try {
        const targetsRes = await api.getTargets();
        if (targetsRes && targetsRes.data && targetsRes.data.activeTargets) {
          activeTargets = targetsRes.data.activeTargets;
          setTargets(activeTargets);
          setTargetsError(null);
        } else {
          setTargets([]);
          setTargetsError('Prometheus returned empty target payload');
        }
      } catch (err) {
        console.warn('Prometheus /api/v1/targets unreachable:', err.message);
        setTargets([]);
        setTargetsError(err.message || 'Prometheus /api/v1/targets unreachable');
      } finally {
        setTargetsLoading(false);
      }

      const upCount = activeTargets.filter(t => t.health === 'up').length;
      const totalCount = activeTargets.length;

      // 4. Fetch Prometheus Alerts
      const alertsRes = await api.getAlerts().catch(() => null);
      const activeAlerts = alertsRes?.data?.alerts || [];
      setAlerts(activeAlerts);
      const firingCount = activeAlerts.filter(a => a.state === 'firing').length;

      // 5. Fetch Alert Rules
      const rulesRes = await api.getRules().catch(() => null);
      if (rulesRes?.data?.groups) {
        setRules(rulesRes.data.groups);
      }

      // 6. Query KPI & Chart Metrics via PromQL
      let p95Val = '—';
      try {
        const p95Res = await api.queryInstant(
          'histogram_quantile(0.95, sum by (le) (rate(cloudmonitor_http_request_duration_seconds_bucket[1m])))'
        );
        const rawP95 = p95Res?.data?.result?.[0]?.value?.[1];
        if (rawP95 && !isNaN(rawP95)) {
          p95Val = `${(parseFloat(rawP95) * 1000).toFixed(1)} ms`;
        }
      } catch (e) {}

      // Calculate Availability (Targets UP / Total)
      const availabilityPct = totalCount > 0 ? ((upCount / totalCount) * 100).toFixed(1) + '%' : '100.0%';

      // In-flight requests & simulated errors counter
      let activeReqs = 0;
      let simErrors = 0;
      try {
        const actRes = await api.queryInstant('cloudmonitor_active_requests');
        activeReqs = parseInt(actRes?.data?.result?.[0]?.value?.[1] || '0', 10);
        const errRes = await api.queryInstant('cloudmonitor_simulated_errors_total');
        simErrors = parseInt(errRes?.data?.result?.[0]?.value?.[1] || '0', 10);
      } catch (e) {}

      setKpis({
        availability: availabilityPct,
        p95Latency: p95Val,
        targetsUp: upCount,
        targetsTotal: totalCount,
        firingAlerts: firingCount,
        activeRequests: activeReqs,
        simulatedErrors: simErrors,
      });

      // Query Host CPU & Memory for Trends (Node Exporter)
      try {
        const cpuRes = await api.queryInstant('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)');
        const memRes = await api.queryInstant('((1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100)');

        const currentCpu = parseFloat(cpuRes?.data?.result?.[0]?.value?.[1] || '0');
        const currentMem = parseFloat(memRes?.data?.result?.[0]?.value?.[1] || '0');
        const hasCpuSamples = (cpuRes?.data?.result?.length || 0) > 0;
        const hasMemSamples = (memRes?.data?.result?.length || 0) > 0;

        if (hasCpuSamples || hasMemSamples) {
          setPromMetricsError(null);
        } else {
          setPromMetricsError('No host metrics received from Node Exporter yet');
        }

        const nowTime = new Date().toLocaleTimeString();

        setCpuHistory(prev => {
          if (prev.length === 0) {
            const nowSec = Math.floor(Date.now() / 1000);
            api.queryRange('100 - (avg(rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)', nowSec - 600, nowSec, '30s')
              .then(rangeRes => {
                const values = rangeRes?.data?.result?.[0]?.values;
                if (values && values.length > 0) {
                  setCpuHistory(values.map(([ts, val]) => ({
                    time: new Date(ts * 1000).toLocaleTimeString(),
                    val: parseFloat(val)
                  })));
                }
              })
              .catch(() => {});
            return hasCpuSamples ? [{ time: nowTime, val: currentCpu }] : [];
          }
          return hasCpuSamples ? [...prev.slice(-19), { time: nowTime, val: currentCpu }] : prev;
        });

        setMemoryHistory(prev => {
          if (prev.length === 0) {
            const nowSec = Math.floor(Date.now() / 1000);
            api.queryRange('((1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100)', nowSec - 600, nowSec, '30s')
              .then(rangeRes => {
                const values = rangeRes?.data?.result?.[0]?.values;
                if (values && values.length > 0) {
                  setMemoryHistory(values.map(([ts, val]) => ({
                    time: new Date(ts * 1000).toLocaleTimeString(),
                    val: parseFloat(val)
                  })));
                }
              })
              .catch(() => {});
            return hasMemSamples ? [{ time: nowTime, val: currentMem }] : [];
          }
          return hasMemSamples ? [...prev.slice(-19), { time: nowTime, val: currentMem }] : prev;
        });
      } catch (e) {
        setPromMetricsError(e.message || 'Failed to query Prometheus host metrics');
      } finally {
        setPromMetricsLoading(false);
      }

      setLastUpdated(new Date().toLocaleTimeString());
    } catch (globalErr) {
      setErrorBanner(`Monitoring cluster communication error: ${globalErr.message}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Polling Interval Hook
  useEffect(() => {
    if (!currentUser) return;
    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, refreshInterval * 1000);
    return () => clearInterval(timer);
  }, [currentUser, refreshInterval]);

  // SRE Lab Action Handlers with Confirmation Guard
  const handleExecuteFault = async (actionType) => {
    setConfirmModal(null);
    setActionLoading(true);

    try {
      if (actionType === '500_error') {
        addLog('Initiating simulated HTTP 500 fault to backend...', 'warn');
        const res = await api.simulateError();
        addLog(`Backend responded with simulated 500 error (${res.detail}). Counter incremented.`, 'error');
      } else if (actionType === 'latency') {
        addLog('Triggering synthetic 1.5s latency injection...', 'warn');
        const res = await api.simulateLatency(1.5);
        addLog(`Latency simulated: ${res.message}. Histogram bucket updated.`, 'success');
      } else if (actionType === 'degrade_health') {
        addLog('Toggling backend health gauge to DEGRADED (0)...', 'warn');
        await api.toggleHealth(false);
        addLog('Application health state switched to UNHEALTHY. Alert rule CloudMonitorHealthDegraded pending.', 'error');
      } else if (actionType === 'restore_health') {
        addLog('Restoring backend health gauge to HEALTHY (1)...', 'info');
        await api.toggleHealth(true);
        addLog('Application health probe restored to HEALTHY. Alert recovering.', 'success');
      }
      setTimeout(fetchTelemetry, 1000);
    } catch (err) {
      addLog(`Fault action failed: ${err.message}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Active agents calculation
  const onlineAgents = useMemo(() => {
    return enrolledAgents.filter(a => a.status === 'online' && !a.is_revoked);
  }, [enrolledAgents]);

  // Filtered container metrics by selected host
  const filteredContainerMetrics = useMemo(() => {
    if (!selectedHostId) return containerMetrics;
    return containerMetrics.filter(c => c.agent_id === selectedHostId);
  }, [containerMetrics, selectedHostId]);

  // 1. Initial Loading Splash
  if (authLoading) {
    return (
      <div className="auth-loading-screen">
        <div className="brand-icon spin-anim" style={{ width: '48px', height: '48px' }}>
          <Activity size={26} />
        </div>
        <p style={{ fontWeight: 600 }}>Verifying CloudMonitor session...</p>
      </div>
    );
  }

  // 2. Unauthenticated: Render Login/Register Screen
  if (!currentUser) {
    return (
      <AuthScreen
        onAuthSuccess={(userProfile) => {
          setCurrentUser(userProfile);
          setSessionExpiredNotice(false);
        }}
        sessionExpired={sessionExpiredNotice}
        currentTheme={theme}
        onToggleTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      />
    );
  }

  // 3. Authenticated: Render Personalized CloudMonitor Dashboard
  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Collapsible Left Sidebar */}
      <aside className={`app-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-badge">
            <div className="brand-icon">
              <Activity size={20} />
            </div>
            {!sidebarCollapsed && <span className="brand-title">CloudMonitor</span>}
          </div>
        </div>

        {/* Authenticated User Badge in Sidebar */}
        <div className="user-profile-badge" title={`Signed in as ${currentUser.email}`}>
          <div className="user-avatar">
            {currentUser.email.charAt(0).toUpperCase()}
          </div>
          {!sidebarCollapsed && (
            <div className="user-info">
              <span className="user-email">{currentUser.email}</span>
              <span className="user-role">Tenant ID #{currentUser.id}</span>
            </div>
          )}
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
            title="Overview"
          >
            <LayoutDashboard className="nav-icon" />
            {!sidebarCollapsed && <span>Overview</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'metrics' ? 'active' : ''}`}
            onClick={() => setActiveTab('metrics')}
            title="Metrics"
          >
            <Activity className="nav-icon" />
            {!sidebarCollapsed && <span>Metrics</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'targets' ? 'active' : ''}`}
            onClick={() => setActiveTab('targets')}
            title="Targets"
          >
            <Server className="nav-icon" />
            {!sidebarCollapsed && <span>Targets ({kpis.targetsUp}/{kpis.targetsTotal})</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'alerts' ? 'active' : ''}`}
            onClick={() => setActiveTab('alerts')}
            title="Alerts"
          >
            <Bell className="nav-icon" />
            {!sidebarCollapsed && <span>Alerts {kpis.firingAlerts > 0 && `(${kpis.firingAlerts})`}</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'sre' ? 'active' : ''}`}
            onClick={() => setActiveTab('sre')}
            title="SRE Lab"
          >
            <FlaskConical className="nav-icon" />
            {!sidebarCollapsed && <span>SRE Lab</span>}
          </button>

          <button
            className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            title="Settings"
          >
            <SettingsIcon className="nav-icon" />
            {!sidebarCollapsed && <span>Settings</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <button
            className="nav-item"
            style={{ marginBottom: '8px', color: 'var(--status-critical)' }}
            onClick={handleLogout}
            title="Log Out"
          >
            <LogOut className="nav-icon" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>

          <button
            className="collapse-btn"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            {!sidebarCollapsed && <span style={{ fontSize: '0.8125rem' }}>Collapse sidebar</span>}
          </button>
        </div>
      </aside>

      {/* Main View Shell */}
      <div className="app-main">
        {/* Top Sticky Header */}
        <header className="top-header">
          <div className="header-left">
            <h1 className="page-title">
              {activeTab === 'overview' && 'Personalized Overview'}
              {activeTab === 'metrics' && 'Telemetry & Metrics'}
              {activeTab === 'targets' && 'Scrape Target Endpoints'}
              {activeTab === 'alerts' && 'Active Alerts & Rules'}
              {activeTab === 'sre' && 'SRE Failure Injection Lab'}
              {activeTab === 'settings' && 'Portal Settings'}
            </h1>
            <span className="page-subtitle">User Workspace: {currentUser.email}</span>
          </div>

          <div className="header-right">
            {/* Real Docker Environment Indicator (Clickable) */}
            <button
              className="status-pill"
              onClick={() => setDockerModalOpen(true)}
              style={{ cursor: 'pointer', border: '1px solid var(--border-glass-strong)' }}
              title="Click to manage Docker Environments"
            >
              <Box size={14} style={{ color: onlineAgents.length > 0 ? 'var(--status-healthy)' : 'var(--status-warning)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Docker:</span>
              <span style={{ color: onlineAgents.length > 0 ? 'var(--status-healthy)' : 'var(--status-warning)', fontWeight: 600 }}>
                {onlineAgents.length > 0 ? `${onlineAgents.length} Online` : 'Not Connected'}
              </span>
            </button>

            {/* Core Platform API Status */}
            <div className="status-pill">
              <span className={`status-indicator-dot ${backendHealth?.status === 'healthy' ? '' : 'down'}`} />
              <span>{backendHealth?.status === 'healthy' ? 'Platform API: Operational' : 'Platform API: Degraded'}</span>
            </div>

            <button
              className="theme-toggle-btn"
              onClick={fetchTelemetry}
              disabled={isRefreshing}
              title="Refresh Telemetry"
            >
              <RefreshCw size={18} className={isRefreshing ? 'spin-anim' : ''} />
            </button>

            <button
              className="theme-toggle-btn"
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <button
              className="theme-toggle-btn"
              onClick={handleLogout}
              title="Sign Out of CloudMonitor"
              style={{ color: 'var(--status-critical)' }}
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="content-body">
          {errorBanner && (
            <div className="glass-panel" style={{ borderColor: 'var(--status-critical)', color: 'var(--status-critical)', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <XCircle size={20} />
              <span>{errorBanner}</span>
            </div>
          )}

          {/* VIEW 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <>
              {/* Personalized Welcome Banner */}
              <div className="glass-panel welcome-banner">
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                    Welcome to your CloudMonitor Dashboard
                  </h2>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    Signed in as <strong>{currentUser.email}</strong> (Tenant #{currentUser.id}) • Authenticated with signed JWT
                  </p>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => setDockerModalOpen(true)}
                >
                  <Box size={16} /> Connect Docker Environment
                </button>
              </div>

              {/* Connected Docker Hosts Bar */}
              {enrolledAgents.length > 0 && (
                <div className="glass-panel" style={{ marginBottom: '16px', padding: '14px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Box size={18} style={{ color: 'var(--accent-cyan)' }} />
                      <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                        Connected Docker Hosts ({enrolledAgents.length})
                      </h3>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className={`tab-pill ${selectedHostId === null ? 'active' : ''}`}
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => setSelectedHostId(null)}
                      >
                        All Hosts ({containerMetrics.length})
                      </button>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                        onClick={() => setDockerModalOpen(true)}
                      >
                        + Add Host
                      </button>
                    </div>
                  </div>

                  <div className="hosts-card-grid">
                    {enrolledAgents.map((host) => {
                      const isSelected = selectedHostId === host.id;
                      return (
                        <div
                          key={host.id}
                          className={`host-overview-card ${isSelected ? 'selected' : ''}`}
                          onClick={() => setSelectedHostId(isSelected ? null : host.id)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                {host.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                {host.os_type || 'linux'} • {host.hostname || 'Local Host'}
                              </div>
                            </div>
                            <span className={`badge ${host.status === 'online' ? 'badge-healthy' : host.is_revoked ? 'badge-critical' : 'badge-warning'}`}>
                              {host.is_revoked ? 'REVOKED' : host.status.toUpperCase()}
                            </span>
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.75rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>
                              Containers: <strong>{host.container_count || 0}</strong> ({host.running_count || 0} run)
                            </span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-subtle)' }}>
                              {host.last_heartbeat ? new Date(host.last_heartbeat).toLocaleTimeString() : 'Awaiting'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Real Docker Containers Overview (If containers ingested) OR Honest Empty State */}
              {containerMetrics.length > 0 ? (
                <div className="glass-panel">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">
                        Monitored Docker Containers {selectedHostId ? `(Filtered: ${enrolledAgents.find(a => a.id === selectedHostId)?.name || 'Host'})` : ''}
                      </h3>
                      <span className="panel-subtitle">Real-time telemetry streamed from authorized agents ({onlineAgents.length} active agent{onlineAgents.length > 1 ? 's' : ''})</span>
                    </div>
                    <span className="badge badge-healthy">{filteredContainerMetrics.length} Containers Active</span>
                  </div>

                  <div className="kpi-grid" style={{ marginBottom: '18px' }}>
                    <div className="glass-panel kpi-card" style={{ minHeight: '100px' }}>
                      <span className="kpi-label">Total Containers</span>
                      <div className="kpi-value">{filteredContainerMetrics.length}</div>
                    </div>
                    <div className="glass-panel kpi-card" style={{ minHeight: '100px' }}>
                      <span className="kpi-label">Running State</span>
                      <div className="kpi-value" style={{ color: 'var(--status-healthy)' }}>
                        {filteredContainerMetrics.filter(c => c.state === 'running').length}
                      </div>
                    </div>
                    <div className="glass-panel kpi-card" style={{ minHeight: '100px' }}>
                      <span className="kpi-label">Total Memory Used</span>
                      <div className="kpi-value" style={{ fontSize: '1.45rem' }}>
                        {formatBytes(filteredContainerMetrics.reduce((acc, c) => acc + c.memory_bytes, 0))}
                      </div>
                    </div>
                    <div className="glass-panel kpi-card" style={{ minHeight: '100px' }}>
                      <span className="kpi-label">Average Container CPU</span>
                      <div className="kpi-value" style={{ color: 'var(--accent-cyan)' }}>
                        {(filteredContainerMetrics.reduce((acc, c) => acc + c.cpu_percent, 0) / Math.max(1, filteredContainerMetrics.length)).toFixed(1)}%
                      </div>
                    </div>
                  </div>

                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Container Name</th>
                          <th>Host / Agent</th>
                          <th>State</th>
                          <th>CPU Usage</th>
                          <th>Memory RSS</th>
                          <th>Restarts</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredContainerMetrics.slice(0, 10).map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.name}</td>
                            <td><code>{c.agent_name}</code></td>
                            <td>
                              <span className={`badge ${c.state === 'running' ? 'badge-healthy' : 'badge-critical'}`}>
                                {c.state.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', minWidth: '45px' }}>{c.cpu_percent.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td>{formatBytes(c.memory_bytes)}</td>
                            <td>{c.restart_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Honest Empty State when no metrics are ingested */
                <div className="glass-panel docker-empty-card">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">Docker Host Environment</h3>
                      <span className="panel-subtitle">Container host connectivity and cgroup metrics stream</span>
                    </div>
                    <span className="badge badge-warning">
                      {enrolledAgents.length > 0 ? 'Agent Awaiting Telemetry' : 'No Daemon Linked'}
                    </span>
                  </div>
                  <div className="empty-state-content">
                    <div className="empty-state-icon">
                      <Box size={32} />
                    </div>
                    <h4>No Docker environment connected</h4>
                    <p>
                      {enrolledAgents.length > 0
                        ? `You have enrolled agent "${enrolledAgents[0].name}". Run the setup command on your Docker host to start streaming real container metrics.`
                        : 'Connect your local or cloud Docker daemon using the lightweight CloudMonitor agent to stream real-time container CPU, memory RSS, restart counters, and live health status.'}
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() => setDockerModalOpen(true)}
                    >
                      <Box size={16} /> Connect Docker Environment
                    </button>
                  </div>
                </div>
              )}

              {/* 4 Platform KPI Cards */}
              <div className="kpi-grid">
                <div className="glass-panel kpi-card">
                  <div className="kpi-card-header">
                    <span className="kpi-label">Platform Availability</span>
                    <div className="kpi-icon-wrap" style={{ color: 'var(--status-healthy)', background: 'rgba(34, 184, 160, 0.15)' }}>
                      <CheckCircle2 size={18} />
                    </div>
                  </div>
                  <div className="kpi-value" style={{ color: 'var(--status-healthy)' }}>
                    {kpis.availability}
                  </div>
                  <div className="kpi-footer">Based on {kpis.targetsTotal} core platform targets</div>
                </div>

                <div className="glass-panel kpi-card">
                  <div className="kpi-card-header">
                    <span className="kpi-label">P95 Latency</span>
                    <div className="kpi-icon-wrap" style={{ color: 'var(--accent-cyan)', background: 'rgba(84, 201, 239, 0.15)' }}>
                      <Clock size={18} />
                    </div>
                  </div>
                  <div className="kpi-value">{kpis.p95Latency}</div>
                  <div className="kpi-footer">SLO Target: &lt; 500 ms</div>
                </div>

                <div className="glass-panel kpi-card">
                  <div className="kpi-card-header">
                    <span className="kpi-label">Cluster Targets UP</span>
                    <div className="kpi-icon-wrap" style={{ color: 'var(--accent-teal)', background: 'rgba(34, 184, 176, 0.15)' }}>
                      <Server size={18} />
                    </div>
                  </div>
                  <div className="kpi-value">{kpis.targetsUp} / {kpis.targetsTotal}</div>
                  <div className="kpi-footer">Prometheus infrastructure discovery</div>
                </div>

                <div className="glass-panel kpi-card">
                  <div className="kpi-card-header">
                    <span className="kpi-label">Active Alerts</span>
                    <div className="kpi-icon-wrap" style={{
                      color: kpis.firingAlerts > 0 ? 'var(--status-critical)' : 'var(--status-healthy)',
                      background: kpis.firingAlerts > 0 ? 'rgba(239, 119, 119, 0.15)' : 'rgba(34, 184, 160, 0.15)'
                    }}>
                      <Bell size={18} />
                    </div>
                  </div>
                  <div className="kpi-value" style={{ color: kpis.firingAlerts > 0 ? 'var(--status-critical)' : 'var(--text-main)' }}>
                    {kpis.firingAlerts}
                  </div>
                  <div className="kpi-footer">
                    {kpis.firingAlerts > 0 ? 'Urgent attention required' : 'All rule evaluations passing'}
                  </div>
                </div>
              </div>

              {/* Host Node CPU & Memory Trends Chart (Real Telemetry from Node Exporter) */}
              <div className="glass-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Host System CPU &amp; Memory Trends</h2>
                    <span className="panel-subtitle">Rolling system node utilization telemetry (Node Exporter)</span>
                  </div>
                  <span className="badge badge-info">Host Node Live</span>
                </div>

                <TrendChart
                  dataSeries={[
                    { points: cpuHistory, color: 'var(--accent-cyan)', label: 'Host CPU %' },
                    { points: memoryHistory, color: 'var(--accent-teal)', label: 'Host RAM %' }
                  ]}
                  height={190}
                  unit="%"
                  loading={promMetricsLoading}
                  error={promMetricsError}
                  emptyTitle="Host metrics unavailable"
                  emptySubtitle="Node Exporter scrape telemetry has not produced samples yet"
                />

                <div className="chart-legend">
                  <div className="legend-item">
                    <span className="legend-dot" style={{ backgroundColor: 'var(--accent-cyan)' }} />
                    <span>Host CPU Usage ({cpuHistory.slice(-1)[0]?.val?.toFixed(1) || 0}%)</span>
                  </div>
                  <div className="legend-item">
                    <span className="legend-dot" style={{ backgroundColor: 'var(--accent-teal)' }} />
                    <span>Host Memory Usage ({memoryHistory.slice(-1)[0]?.val?.toFixed(1) || 0}%)</span>
                  </div>
                </div>
              </div>

              {/* Service Health Summary Table */}
              <div className="glass-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Platform Infrastructure Endpoints</h2>
                    <span className="panel-subtitle">Core observability microservices</span>
                  </div>
                  <span className="badge badge-healthy">Cluster Active</span>
                </div>

                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Service Target</th>
                        <th>Scrape URL</th>
                        <th>Status</th>
                        <th>Last Scrape Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((t, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{t.scrapePool}</td>
                          <td><code>{t.scrapeUrl}</code></td>
                          <td>
                            <span className={`badge ${t.health === 'up' ? 'badge-healthy' : 'badge-critical'}`}>
                              {t.health === 'up' ? 'UP' : 'DOWN'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>
                            {(parseFloat(t.lastScrapeDuration) * 1000).toFixed(1)} ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* VIEW 2: METRICS */}
          {activeTab === 'metrics' && (
            <>
              {/* Host Node Hardware Utilization */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
                <div className="glass-panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Host Node CPU Utilization (%)</h2>
                    <span className="badge badge-info">Node Exporter</span>
                  </div>
                  <TrendChart
                    dataSeries={[{ points: cpuHistory, color: 'var(--accent-cyan)' }]}
                    height={160}
                    unit="%"
                    loading={promMetricsLoading}
                    error={promMetricsError}
                    emptyTitle="Host CPU metric unavailable"
                    emptySubtitle="Awaiting Node Exporter node_cpu_seconds_total samples"
                  />
                  <div className="chart-legend">
                    <span>Current: {cpuHistory.slice(-1)[0]?.val?.toFixed(2) || '—'}%</span>
                  </div>
                </div>

                <div className="glass-panel">
                  <div className="panel-header">
                    <h2 className="panel-title">Host Node Memory Utilization (%)</h2>
                    <span className="badge badge-info">Node Exporter</span>
                  </div>
                  <TrendChart
                    dataSeries={[{ points: memoryHistory, color: 'var(--accent-teal)' }]}
                    height={160}
                    unit="%"
                    loading={promMetricsLoading}
                    error={promMetricsError}
                    emptyTitle="Host RAM metric unavailable"
                    emptySubtitle="Awaiting Node Exporter node_memory_MemAvailable_bytes samples"
                  />
                  <div className="chart-legend">
                    <span>Current: {memoryHistory.slice(-1)[0]?.val?.toFixed(2) || '—'}%</span>
                  </div>
                </div>
              </div>

              {/* REAL Container Telemetry Table (If metrics ingested) OR Honest Empty State */}
              {containerMetrics.length > 0 ? (
                <div className="glass-panel">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Container Metrics Telemetry</h2>
                      <span className="panel-subtitle">Real-time cgroup statistics streamed from your Docker hosts</span>
                    </div>
                    <span className="badge badge-healthy">{containerMetrics.length} Monitored</span>
                  </div>

                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Container Name</th>
                          <th>ID</th>
                          <th>Image</th>
                          <th>State</th>
                          <th>Health</th>
                          <th>CPU %</th>
                          <th>Memory RSS</th>
                          <th>Restarts</th>
                          <th>Last Sync</th>
                        </tr>
                      </thead>
                      <tbody>
                        {containerMetrics.map((c) => (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.name}</td>
                            <td><code>{c.container_id}</code></td>
                            <td style={{ fontSize: '0.8125rem' }}><code>{c.image || 'unknown'}</code></td>
                            <td>
                              <span className={`badge ${c.state === 'running' ? 'badge-healthy' : 'badge-critical'}`}>
                                {c.state.toUpperCase()}
                              </span>
                            </td>
                            <td>
                              {c.health_status ? (
                                <span className={`badge ${c.health_status === 'healthy' ? 'badge-healthy' : 'badge-warning'}`}>
                                  {c.health_status}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--text-subtle)', fontSize: '0.75rem' }}>N/A</span>
                              )}
                            </td>
                            <td>
                              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                                {c.cpu_percent.toFixed(1)}%
                              </span>
                            </td>
                            <td>
                              {formatBytes(c.memory_bytes)}
                              {c.memory_limit > 0 && (
                                <span style={{ color: 'var(--text-subtle)', fontSize: '0.75rem', marginLeft: '4px' }}>
                                  / {formatBytes(c.memory_limit)}
                                </span>
                              )}
                            </td>
                            <td>{c.restart_count}</td>
                            <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                              {c.recorded_at ? new Date(c.recorded_at).toLocaleTimeString() : 'Recent'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="glass-panel docker-empty-card">
                  <div className="panel-header">
                    <div>
                      <h2 className="panel-title">Container Metrics Overview</h2>
                      <span className="panel-subtitle">Container-level cgroup telemetry via Docker daemon</span>
                    </div>
                    <span className="badge badge-warning">Awaiting Telemetry</span>
                  </div>
                  <div className="empty-state-content">
                    <div className="empty-state-icon">
                      <Box size={36} />
                    </div>
                    <h4>No Docker environment connected</h4>
                    <p>
                      Live container telemetry (cgroup v2 CPU throttling, memory limits, network socket stats, and restart counters) will stream here once your Docker agent is linked to account <strong>{currentUser.email}</strong>.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() => setDockerModalOpen(true)}
                    >
                      <Box size={16} /> Connect Docker Environment
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* VIEW 3: TARGETS */}
          {activeTab === 'targets' && (
            <div className="glass-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Active Prometheus Scrape Targets</h2>
                  <span className="panel-subtitle">Live endpoint status queried directly from <code>/prom/api/v1/targets</code></span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span className="badge badge-info">{targets.length} Discovered</span>
                  <span className="badge badge-healthy">{kpis.targetsUp} UP</span>
                  {targets.length - kpis.targetsUp > 0 && (
                    <span className="badge badge-critical">{targets.length - kpis.targetsUp} DOWN</span>
                  )}
                </div>
              </div>

              {targetsLoading ? (
                <div style={{ padding: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'var(--text-muted)' }}>
                  <RefreshCw size={28} className="spin-anim" style={{ color: 'var(--accent-cyan)' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Discovering Prometheus scrape targets...</span>
                </div>
              ) : targetsError ? (
                <div style={{ margin: '16px', padding: '16px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: 'var(--status-critical)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>Prometheus Scrape Targets Unavailable</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{targetsError}</div>
                    <div style={{ fontSize: '0.75rem', marginTop: '8px', color: 'var(--text-muted)' }}>
                      Targets are polled via <code>/prom/api/v1/targets</code>. Ensure Prometheus is active and proxied by Nginx.
                    </div>
                  </div>
                </div>
              ) : targets.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Server size={32} style={{ opacity: 0.5, marginBottom: '12px' }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>No Scrape Targets Discovered</div>
                  <div style={{ fontSize: '0.85rem' }}>Prometheus responded successfully but has 0 active scrape targets configured.</div>
                </div>
              ) : (
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Scrape Pool</th>
                        <th>Service Label</th>
                        <th>Endpoint URL</th>
                        <th>Health</th>
                        <th>Last Scrape Duration</th>
                        <th>Last Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((t, idx) => (
                        <tr key={idx} style={t.health !== 'up' ? { backgroundColor: 'rgba(239, 68, 68, 0.05)' } : {}}>
                          <td style={{ fontWeight: 600 }}>{t.scrapePool}</td>
                          <td><code>{t.labels?.service || t.scrapePool}</code></td>
                          <td><a href={t.scrapeUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-cyan)' }}>{t.scrapeUrl}</a></td>
                          <td>
                            <span className={`badge ${t.health === 'up' ? 'badge-healthy' : 'badge-critical'}`}>
                              {t.health === 'up' ? 'UP' : 'DOWN'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>
                            {(parseFloat(t.lastScrapeDuration) * 1000).toFixed(1)} ms
                          </td>
                          <td style={{ color: t.lastError ? 'var(--status-critical)' : 'var(--text-subtle)' }}>
                            {t.lastError || 'None'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW 4: ALERTS */}
          {activeTab === 'alerts' && (
            <>
              {/* Active Alerts List */}
              <div className="glass-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Active Firing Alerts</h2>
                    <span className="panel-subtitle">Real-time alerts currently evaluated by Prometheus</span>
                  </div>
                  <span className={`badge ${alerts.length > 0 ? 'badge-critical' : 'badge-healthy'}`}>
                    {alerts.length} Triggered
                  </span>
                </div>

                {alerts.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: 'var(--status-healthy)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <CheckCircle2 size={20} />
                    <span>No active alerts firing. All systems within nominal SLO boundaries.</span>
                  </div>
                ) : (
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Alert Name</th>
                          <th>Severity</th>
                          <th>State</th>
                          <th>Summary</th>
                          <th>Active Since</th>
                        </tr>
                      </thead>
                      <tbody>
                        {alerts.map((a, idx) => (
                          <tr key={idx}>
                            <td style={{ fontWeight: 600 }}>{a.labels?.alertname}</td>
                            <td>
                              <span className={`badge ${a.labels?.severity === 'critical' ? 'badge-critical' : 'badge-warning'}`}>
                                {a.labels?.severity || 'warning'}
                              </span>
                            </td>
                            <td><span className="badge badge-critical">{a.state}</span></td>
                            <td>{a.annotations?.summary || a.annotations?.description}</td>
                            <td style={{ fontFamily: 'var(--font-mono)' }}>{a.activeAt ? new Date(a.activeAt).toLocaleTimeString() : 'Recent'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Configured Alert Rules */}
              <div className="glass-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">Configured Alert Rules</h2>
                    <span className="panel-subtitle">SRE thresholds defined in <code>monitoring/alerts/rules.yml</code></span>
                  </div>
                  <span className="badge badge-info">rules.yml</span>
                </div>

                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Rule Name</th>
                        <th>PromQL Expression</th>
                        <th>Duration</th>
                        <th>Severity</th>
                        <th>Evaluation Health</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rules.flatMap(g => g.rules).map((r, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600 }}>{r.name}</td>
                          <td><code>{r.query}</code></td>
                          <td style={{ fontFamily: 'var(--font-mono)' }}>{r.duration ? `${r.duration}s` : '15s'}</td>
                          <td>
                            <span className={`badge ${r.labels?.severity === 'critical' ? 'badge-critical' : 'badge-warning'}`}>
                              {r.labels?.severity || 'warning'}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${r.health === 'ok' ? 'badge-healthy' : 'badge-critical'}`}>
                              {r.health}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* VIEW 5: SRE FAILURE INJECTION LAB */}
          {activeTab === 'sre' && (
            <>
              <div className="glass-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">SRE Failure Injection &amp; Chaos Engineering Lab</h2>
                    <span className="panel-subtitle">Simulate incident scenarios to validate alert rules and SLA detection</span>
                  </div>
                  <span className="badge badge-warning">Controlled Development Demonstration</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginTop: '10px' }}>
                  <button
                    className="btn btn-danger"
                    disabled={actionLoading}
                    onClick={() => setConfirmModal({
                      title: 'Inject HTTP 500 Server Error',
                      desc: 'This will trigger an intentional 500 error on POST /api/v1/simulate/error, incrementing the simulated error counter and 5xx rate.',
                      action: '500_error'
                    })}
                  >
                    <Zap size={18} />
                    <span>Trigger HTTP 500 Error</span>
                  </button>

                  <button
                    className="btn btn-warning"
                    disabled={actionLoading}
                    onClick={() => setConfirmModal({
                      title: 'Inject Synthetic 1.5s Latency',
                      desc: 'This will delay the response on GET /api/v1/simulate/latency by 1.5 seconds, testing P95 latency measurements against the 500ms SLO.',
                      action: 'latency'
                    })}
                  >
                    <Clock size={18} />
                    <span>Inject 1.5s Latency</span>
                  </button>

                  <button
                    className="btn btn-danger"
                    disabled={actionLoading}
                    onClick={() => setConfirmModal({
                      title: 'Degrade Health Probe',
                      desc: 'This will set the backend health gauge to 0 on POST /api/v1/simulate/health-toggle?status=false, simulating component degradation and triggering CloudMonitorHealthDegraded.',
                      action: 'degrade_health'
                    })}
                  >
                    <AlertTriangle size={18} />
                    <span>Degrade Health Probe</span>
                  </button>

                  <button
                    className="btn btn-primary"
                    disabled={actionLoading}
                    onClick={() => handleExecuteFault('restore_health')}
                  >
                    <RotateCcw size={18} />
                    <span>Restore Health Probe</span>
                  </button>
                </div>
              </div>

              {/* Timestamped Action Terminal */}
              <div className="glass-panel">
                <div className="panel-header">
                  <div>
                    <h2 className="panel-title">SRE Action Audit Log</h2>
                    <span className="panel-subtitle">In-memory rolling trace of executed fault injection requests</span>
                  </div>
                  <button className="btn" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => setActionLog([])}>
                    Clear Log
                  </button>
                </div>

                <div className="terminal-window">
                  {actionLog.map(item => (
                    <div key={item.id} className="terminal-line">
                      <span className="terminal-time">[{item.time}]</span>
                      <span className={item.type === 'error' ? 'terminal-error' : item.type === 'warn' ? 'terminal-warn' : 'terminal-success'}>
                        {item.msg}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* VIEW 6: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="glass-panel">
              <div className="panel-header">
                <div>
                  <h2 className="panel-title">Account Preferences &amp; Platform Status</h2>
                  <span className="panel-subtitle">User tenancy profile and connectivity</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '580px' }}>
                {/* User Account Details */}
                <div style={{ background: 'var(--bg-card-solid)', padding: '18px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
                  <label style={{ display: 'block', fontWeight: 700, fontSize: '0.9375rem', marginBottom: '12px', color: 'var(--text-main)' }}>
                    Authenticated Account
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.875rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Email:</span>
                      <span style={{ fontWeight: 600 }}>{currentUser.email}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Tenant ID:</span>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>#{currentUser.id}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Member Since:</span>
                      <span>{new Date(currentUser.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Session Security:</span>
                      <span className="badge badge-healthy">Signed JWT (Bearer)</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Enrolled Agents:</span>
                      <span style={{ fontWeight: 600 }}>{enrolledAgents.length} ({onlineAgents.length} active)</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
                    <button
                      className="btn btn-primary"
                      onClick={() => setDockerModalOpen(true)}
                      style={{ flex: 1 }}
                    >
                      <Box size={16} /> Manage Agents
                    </button>
                    <button
                      className="btn btn-danger"
                      onClick={handleLogout}
                      style={{ flex: 1 }}
                    >
                      <LogOut size={16} /> Sign Out
                    </button>
                  </div>
                </div>

                {/* Interface Theme */}
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Interface Theme</label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      className={`btn ${theme === 'light' ? 'btn-primary' : ''}`}
                      onClick={() => setTheme('light')}
                    >
                      <Sun size={16} /> Light Mode (Default)
                    </button>
                    <button
                      className={`btn ${theme === 'dark' ? 'btn-primary' : ''}`}
                      onClick={() => setTheme('dark')}
                    >
                      <Moon size={16} /> Dark Mode
                    </button>
                  </div>
                </div>

                {/* Telemetry Poll Interval */}
                <div>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Telemetry Poll Interval</label>
                  <select
                    value={refreshInterval}
                    onChange={(e) => setRefreshInterval(Number(e.target.value))}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: '1px solid var(--border-glass-strong)',
                      background: 'var(--bg-input)',
                      color: 'var(--text-main)',
                      fontSize: '0.875rem',
                      width: '100%'
                    }}
                  >
                    <option value={5}>5 seconds (Fast Poll)</option>
                    <option value={10}>10 seconds (Standard)</option>
                    <option value={15}>15 seconds (Prometheus Scrape Interval)</option>
                    <option value={30}>30 seconds (Low Traffic)</option>
                  </select>
                </div>

                {/* Reverse Proxy Routing Info */}
                <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px' }}>Reverse Proxy Routing</label>
                  <ul style={{ listStyle: 'none', fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: '1.8' }}>
                    <li><code>/api/*</code> &rarr; FastAPI Backend (<code>http://localhost:8000</code>)</li>
                    <li><code>/prom/*</code> &rarr; Prometheus API (<code>http://localhost:9090</code>)</li>
                    <li>Last Polled: <strong>{lastUpdated || 'Never'}</strong></li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Connect Docker Modal */}
      <ConnectDockerModal
        isOpen={dockerModalOpen}
        onClose={() => setDockerModalOpen(false)}
        user={currentUser}
        onAgentChange={(updatedAgents) => {
          setEnrolledAgents(updatedAgents);
        }}
        onSelectHostMetrics={(hostId) => {
          setSelectedHostId(hostId);
          setActiveTab('overview');
        }}
      />

      {/* Confirmation Modal for SRE Actions */}
      {confirmModal && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-main)' }}>
              {confirmModal.title}
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: '1.6' }}>
              {confirmModal.desc}
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmModal(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleExecuteFault(confirmModal.action)}>
                Confirm Execution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
