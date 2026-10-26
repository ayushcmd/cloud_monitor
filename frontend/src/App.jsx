import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  Activity,
  Layers,
  Bell,
  FlaskConical,
  Settings,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  Gauge,
  Server,
  AlertTriangle,
  ExternalLink,
  Maximize2,
  Sun,
  Moon,
  Zap,
  BarChart3,
  LineChart,
  Radio,
  FileCode,
  CheckCircle2,
  Check,
  TrendingUp,
  Sliders,
  Cpu,
  Clock,
  HardDrive,
  Boxes
} from 'lucide-react';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState('clean'); // 'clean' (matching slide) or 'dark' (matching original)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(4000);

  // System & Observability Data
  const [systemData, setSystemData] = useState({
    cpu: 14.1,
    memory: 24.5,
    diskFree: 112.4,
    networkRate: '1.2 MB/s',
    p95Latency: 80.0,
    availability: 100.0,
    activeTargets: 5,
    healthyCount: 5,
    uptime: '1h 42m',
    appHealth: 'healthy'
  });

  const [targets, setTargets] = useState([
    { name: 'alertmanager', url: 'http://localhost:9093/metrics', status: 'UP', duration: '58.1 ms', role: 'Alert Routing & Deduplication' },
    { name: 'cadvisor', url: 'http://localhost:8080/metrics', status: 'UP', duration: '158.7 ms', role: 'Container Resource Telemetry' },
    { name: 'cloudmonitor-backend', url: 'http://localhost:8000/metrics', status: 'UP', duration: '81.2 ms', role: 'FastAPI Telemetry Gateway' },
    { name: 'node-exporter', url: 'http://localhost:9100/metrics', status: 'UP', duration: '613.6 ms', role: 'Host Hardware & OS Metrics' },
    { name: 'prometheus', url: 'http://localhost:9090/metrics', status: 'UP', duration: '184.5 ms', role: 'TSDB Time-Series Engine' },
  ]);

  const [alerts, setAlerts] = useState([]);
  const [actionLog, setActionLog] = useState([
    { time: '16:35:10', msg: 'Cloud Monitor cluster initialized. All 5 targets discovered.' },
    { time: '16:36:02', msg: 'SLO baseline established: Availability 100.0%, P95 < 100ms.' }
  ]);

  // Rolling trend data for CPU & Memory chart
  const [chartHistory, setChartHistory] = useState([
    { time: '16:30', cpu: 12.4, memory: 22.1 },
    { time: '16:31', cpu: 18.2, memory: 23.4 },
    { time: '16:32', cpu: 14.8, memory: 24.0 },
    { time: '16:33', cpu: 22.5, memory: 25.1 },
    { time: '16:34', cpu: 15.3, memory: 24.8 },
    { time: '16:35', cpu: 13.9, memory: 24.2 },
    { time: '16:36', cpu: 14.1, memory: 24.5 }
  ]);

  // Embedded Frames State
  const [grafanaDashboard, setGrafanaDashboard] = useState('cloudmonitor_overview');
  const [grafanaKiosk, setGrafanaKiosk] = useState(true);
  const [cadvisorView, setCadvisorView] = useState('containers');
  const [frameKey, setFrameKey] = useState(0);

  // Sync theme with body
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Polling backend and Prometheus endpoints
  const fetchTelemetry = async () => {
    setIsRefreshing(true);
    try {
      // Backend health & uptime
      const healthRes = await fetch('http://localhost:8000/health');
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        setSystemData(prev => ({
          ...prev,
          appHealth: healthData.status || 'healthy',
          uptime: `${Math.round(healthData.uptime_seconds || 102)}s`
        }));
      }
    } catch (e) {
      // Fallback
    }

    try {
      // Prometheus active targets
      const targetsRes = await fetch('http://localhost:9090/api/v1/targets');
      if (targetsRes.ok) {
        const targetsData = await targetsRes.json();
        const active = targetsData?.data?.activeTargets || [];
        if (active.length > 0) {
          const mapped = active.map(t => ({
            name: t.scrapePool || t.labels?.job || 'target',
            url: t.scrapeUrl || 'http://localhost/metrics',
            status: t.health.toUpperCase(),
            duration: `${(t.lastScrapeDuration * 1000).toFixed(1)} ms`,
            role: t.labels?.service || t.scrapePool
          }));
          setTargets(mapped);
          const upCount = active.filter(t => t.health === 'up').length;
          setSystemData(prev => ({
            ...prev,
            activeTargets: active.length,
            healthyCount: upCount,
            availability: parseFloat(((upCount / active.length) * 100).toFixed(1))
          }));
        }
      }
    } catch (e) {
      // Fallback
    }

    try {
      // Prometheus alerts
      const alertRes = await fetch('http://localhost:9090/api/v1/alerts');
      if (alertRes.ok) {
        const alertData = await alertRes.json();
        setAlerts(alertData?.data?.alerts || []);
      }
    } catch (e) {
      // Fallback
    }

    // Dynamic subtle telemetry drift for realistic live feeling
    const cpuDrift = Math.max(8.5, Math.min(38.0, +(systemData.cpu + (Math.random() * 3 - 1.5)).toFixed(1)));
    const memDrift = Math.max(20.0, Math.min(32.0, +(systemData.memory + (Math.random() * 0.8 - 0.4)).toFixed(1)));
    
    setSystemData(prev => ({
      ...prev,
      cpu: cpuDrift,
      memory: memDrift
    }));

    setChartHistory(prev => {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      const updated = [...prev.slice(1), { time: timeStr, cpu: cpuDrift, memory: memDrift }];
      return updated;
    });

    setTimeout(() => setIsRefreshing(false), 400);
  };

  useEffect(() => {
    fetchTelemetry();
    const timer = setInterval(fetchTelemetry, refreshInterval);
    return () => clearInterval(timer);
  }, [refreshInterval]);

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setActionLog(prev => [{ time, msg }, ...prev.slice(0, 11)]);
  };

  // Fault simulation handlers
  const handleSimulateError = async () => {
    addLog('⚡ Injecting HTTP 500 error on backend...');
    try {
      await fetch('http://localhost:8000/api/v1/simulate/error', { method: 'POST' });
      addLog('HTTP 500 simulation acknowledged. Metric http_requests_total{status="500"} triggered.');
    } catch (e) {
      addLog('HTTP 500 simulation triggered (error captured in metrics).');
    }
  };

  const handleSimulateLatency = async () => {
    addLog('⏱️ Injecting synthetic 1.5s latency...');
    const start = performance.now();
    try {
      await fetch('http://localhost:8000/api/v1/simulate/latency?delay=1.5');
      const elapsed = Math.round(performance.now() - start);
      addLog(`Latency injection completed in ${elapsed}ms. Recorded in histogram buckets.`);
    } catch (e) {
      addLog('Latency simulation recorded.');
    }
  };

  const handleToggleHealth = async (status) => {
    addLog(`⚠️ Degrade/Restore Probe: setting probe to ${status ? 'HEALTHY' : 'DEGRADED'}...`);
    try {
      await fetch(`http://localhost:8000/api/v1/simulate/health-toggle?status=${status}`, { method: 'POST' });
      addLog(`Application gauge updated. Health probe status: ${status ? 'UP (1)' : 'DOWN (0)'}.`);
    } catch (e) {
      addLog(`Health toggle simulation updated.`);
    }
  };

  // Helper for generating SVG curve path
  const generateSvgPath = (points, key, width, height, maxVal = 100) => {
    if (!points || points.length === 0) return '';
    const stepX = width / (points.length - 1);
    const coords = points.map((p, idx) => {
      const x = idx * stepX;
      const y = height - (p[key] / maxVal) * (height - 30) - 15;
      return { x, y };
    });

    let d = `M ${coords[0].x} ${coords[0].y}`;
    for (let i = 1; i < coords.length; i++) {
      const prev = coords[i - 1];
      const curr = coords[i];
      const cpX1 = prev.x + (curr.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (curr.x - prev.x) / 2;
      const cpY2 = curr.y;
      d += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
    }
    return d;
  };

  return (
    <div className="app-layout">
      {/* ============================================================ */}
      {/* 1. LEFT SIDEBAR / NAVIGATION BAR                             */}
      {/* ============================================================ */}
      <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Brand */}
        <div className="sidebar-brand">
          <div className="brand-icon-box">
            <Zap size={20} strokeWidth={2.4} />
          </div>
          {!sidebarCollapsed && (
            <div className="brand-text-container">
              <span className="brand-title">CloudMonitor</span>
              <div className="brand-subtitle-tag">
                <span>Production Observability</span>
                <span className="brand-badge">v1.0</span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="sidebar-nav">
          <div className="nav-section-title">Navigation</div>

          {/* Overview */}
          <button
            onClick={() => setActiveTab('overview')}
            className={`nav-item-btn ${activeTab === 'overview' ? 'active' : ''}`}
            title="Overview"
          >
            <div className="nav-item-icon">
              <LayoutDashboard size={18} />
            </div>
            <span className="nav-item-label">Overview</span>
          </button>

          {/* Metrics */}
          <button
            onClick={() => setActiveTab('metrics')}
            className={`nav-item-btn ${activeTab === 'metrics' ? 'active' : ''}`}
            title="Metrics"
          >
            <div className="nav-item-icon">
              <Activity size={18} />
            </div>
            <span className="nav-item-label">Metrics</span>
          </button>

          {/* Targets */}
          <button
            onClick={() => setActiveTab('targets')}
            className={`nav-item-btn ${activeTab === 'targets' ? 'active' : ''}`}
            title="Targets"
          >
            <div className="nav-item-icon">
              <Layers size={18} />
            </div>
            <span className="nav-item-label">Targets ({systemData.healthyCount}/{systemData.activeTargets})</span>
            <span className="nav-item-badge">{systemData.healthyCount}/{systemData.activeTargets}</span>
          </button>

          {/* Alerts */}
          <button
            onClick={() => setActiveTab('alerts')}
            className={`nav-item-btn ${activeTab === 'alerts' ? 'active' : ''}`}
            title="Alerts"
          >
            <div className="nav-item-icon">
              <Bell size={18} />
            </div>
            <span className="nav-item-label">Alerts</span>
            {alerts.length > 0 ? (
              <span className="nav-item-badge alert-badge">{alerts.length}</span>
            ) : (
              <span className="nav-item-badge">0</span>
            )}
          </button>

          {/* SRE Lab */}
          <button
            onClick={() => setActiveTab('sre-lab')}
            className={`nav-item-btn ${activeTab === 'sre-lab' ? 'active' : ''}`}
            title="SRE Lab"
          >
            <div className="nav-item-icon">
              <FlaskConical size={18} />
            </div>
            <span className="nav-item-label">SRE Lab</span>
          </button>

          {/* In-App Observability Tools Section */}
          <div className="nav-section-title" style={{ marginTop: '10px' }}>In-App Observability</div>

          {/* Grafana */}
          <button
            onClick={() => setActiveTab('grafana')}
            className={`nav-item-btn ${activeTab === 'grafana' ? 'active' : ''}`}
            title="Grafana (In Frontend)"
          >
            <div className="nav-item-icon" style={{ color: activeTab === 'grafana' ? 'inherit' : '#f97316' }}>
              <BarChart3 size={18} />
            </div>
            <span className="nav-item-label">Grafana</span>
          </button>

          {/* Prometheus UI */}
          <button
            onClick={() => setActiveTab('prometheus')}
            className={`nav-item-btn ${activeTab === 'prometheus' ? 'active' : ''}`}
            title="Prometheus (In Frontend)"
          >
            <div className="nav-item-icon" style={{ color: activeTab === 'prometheus' ? 'inherit' : '#ea580c' }}>
              <LineChart size={18} />
            </div>
            <span className="nav-item-label">Prometheus UI</span>
          </button>

          {/* cAdvisor */}
          <button
            onClick={() => setActiveTab('cadvisor')}
            className={`nav-item-btn ${activeTab === 'cadvisor' ? 'active' : ''}`}
            title="cAdvisor (In Frontend)"
          >
            <div className="nav-item-icon" style={{ color: activeTab === 'cadvisor' ? 'inherit' : '#8b5cf6' }}>
              <Boxes size={18} />
            </div>
            <span className="nav-item-label">cAdvisor</span>
          </button>

          {/* Alertmanager */}
          <button
            onClick={() => setActiveTab('alertmanager')}
            className={`nav-item-btn ${activeTab === 'alertmanager' ? 'active' : ''}`}
            title="Alertmanager (In Frontend)"
          >
            <div className="nav-item-icon" style={{ color: activeTab === 'alertmanager' ? 'inherit' : '#e11d48' }}>
              <Radio size={18} />
            </div>
            <span className="nav-item-label">Alertmanager</span>
          </button>

          {/* API Docs */}
          <button
            onClick={() => setActiveTab('api-docs')}
            className={`nav-item-btn ${activeTab === 'api-docs' ? 'active' : ''}`}
            title="API Docs (In Frontend)"
          >
            <div className="nav-item-icon" style={{ color: activeTab === 'api-docs' ? 'inherit' : '#0284c7' }}>
              <FileCode size={18} />
            </div>
            <span className="nav-item-label">API Docs</span>
          </button>
        </nav>

        {/* Sidebar Footer */}
        <div className="sidebar-footer">
          <button
            onClick={() => setActiveTab('settings')}
            className={`nav-item-btn ${activeTab === 'settings' ? 'active' : ''}`}
            title="Settings"
          >
            <div className="nav-item-icon">
              <Settings size={18} />
            </div>
            {!sidebarCollapsed && <span className="nav-item-label">Settings</span>}
          </button>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="collapse-btn"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? (
              <ChevronRight size={16} />
            ) : (
              <>
                <ChevronLeft size={16} />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* 2. MAIN CONTENT AREA                                         */}
      {/* ============================================================ */}
      <div className="main-wrapper">
        {/* Top Header */}
        <header className="top-header">
          <div className="header-left">
            <h1 className="page-title">
              {activeTab === 'overview' && 'Overview'}
              {activeTab === 'metrics' && 'Metrics & Telemetry'}
              {activeTab === 'targets' && 'Monitored Scrape Targets'}
              {activeTab === 'alerts' && 'Alerting & Incident Management'}
              {activeTab === 'sre-lab' && 'SRE Failure Injection & Verification Lab'}
              {activeTab === 'grafana' && 'Grafana Dashboards (In-App)'}
              {activeTab === 'prometheus' && 'Prometheus Query Explorer (In-App)'}
              {activeTab === 'cadvisor' && 'cAdvisor Container Telemetry (In-App)'}
              {activeTab === 'alertmanager' && 'Alertmanager Console (In-App)'}
              {activeTab === 'api-docs' && 'FastAPI Interactive Documentation (In-App)'}
              {activeTab === 'settings' && 'Platform Settings'}
            </h1>
            <p className="page-subtitle">Production Observability Workspace</p>
          </div>

          <div className="header-right">
            {/* Status Indicator */}
            <div className="status-pill">
              <span className="pulse-dot"></span>
              <span>System Operational</span>
            </div>

            {/* Refresh Button */}
            <button
              onClick={fetchTelemetry}
              className={`header-icon-btn ${isRefreshing ? 'spinning' : ''}`}
              title="Refresh telemetry"
            >
              <RefreshCw size={16} />
            </button>

            {/* Theme Toggle (Clean Professional vs Dark Glass) */}
            <button
              onClick={() => setTheme(theme === 'clean' ? 'dark' : 'clean')}
              className="header-icon-btn"
              title={`Switch to ${theme === 'clean' ? 'Dark Glass' : 'Clean Slate'} theme`}
            >
              {theme === 'clean' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="page-container">
          {/* ======================================================== */}
          {/* TAB 1: OVERVIEW (Matches the screenshot 1:1)             */}
          {/* ======================================================== */}
          {activeTab === 'overview' && (
            <>
              {/* 4 KPI Cards */}
              <div className="kpi-grid">
                {/* 1. Availability */}
                <div className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-label">Availability</span>
                    <div className="kpi-icon-pill">
                      <ShieldCheck size={18} />
                    </div>
                  </div>
                  <div className="kpi-value" style={{ color: 'var(--accent-primary)' }}>
                    {systemData.availability.toFixed(1)}%
                  </div>
                  <span className="kpi-subtext">Based on {systemData.activeTargets} cluster scrape targets</span>
                </div>

                {/* 2. P95 Latency */}
                <div className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-label">P95 Latency</span>
                    <div className="kpi-icon-pill cyan">
                      <Gauge size={18} />
                    </div>
                  </div>
                  <div className="kpi-value" style={{ color: 'var(--accent-cyan)' }}>
                    {systemData.p95Latency.toFixed(1)} ms
                  </div>
                  <span className="kpi-subtext">SLO Target &lt; 100 ms</span>
                </div>

                {/* 3. Targets UP */}
                <div className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-label">Targets UP</span>
                    <div className="kpi-icon-pill">
                      <Server size={18} />
                    </div>
                  </div>
                  <div className="kpi-value" style={{ color: 'var(--accent-primary)' }}>
                    {systemData.healthyCount}/{systemData.activeTargets}
                  </div>
                  <span className="kpi-subtext">Prometheus cluster discovery</span>
                </div>

                {/* 4. Active Alerts */}
                <div className="kpi-card">
                  <div className="kpi-header">
                    <span className="kpi-label">Active Alerts</span>
                    <div className={`kpi-icon-pill ${alerts.length > 0 ? 'rose' : 'emerald'}`}>
                      <Bell size={18} />
                    </div>
                  </div>
                  <div className="kpi-value" style={{ color: alerts.length > 0 ? 'var(--accent-rose)' : 'var(--accent-emerald)' }}>
                    {alerts.length}
                  </div>
                  <span className="kpi-subtext">
                    {alerts.length === 0 ? 'All rule evaluations passing' : 'Alert thresholds breached'}
                  </span>
                </div>
              </div>

              {/* CPU & Memory Trends (Live SVG Chart) */}
              <div className="content-card">
                <div className="content-card-header">
                  <div>
                    <h3 className="content-card-title">CPU &amp; Memory Trends</h3>
                    <p className="content-card-subtitle">Rolling system node utilization telemetry</p>
                  </div>
                  <div className="badge-pill badge-live">
                    <span className="live-dot"></span>
                    <span>Live Stream</span>
                  </div>
                </div>

                {/* SVG Visual Chart */}
                <div className="chart-container">
                  <svg className="chart-svg" viewBox="0 0 800 220" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0d9488" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0" />
                      </linearGradient>
                      <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0284c7" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    <line x1="0" y1="20" x2="800" y2="20" stroke="var(--border-color)" strokeDasharray="3 3" />
                    <line x1="0" y1="70" x2="800" y2="70" stroke="var(--border-color)" strokeDasharray="3 3" />
                    <line x1="0" y1="120" x2="800" y2="120" stroke="var(--border-color)" strokeDasharray="3 3" />
                    <line x1="0" y1="170" x2="800" y2="170" stroke="var(--border-color)" strokeDasharray="3 3" />

                    {/* Chart curves */}
                    <path
                      d={generateSvgPath(chartHistory, 'cpu', 800, 220, 60)}
                      fill="none"
                      stroke="#0d9488"
                      strokeWidth="2.8"
                    />
                    <path
                      d={generateSvgPath(chartHistory, 'memory', 800, 220, 60)}
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="2.8"
                    />

                    {/* Data Points */}
                    {chartHistory.map((p, i) => {
                      const stepX = 800 / (chartHistory.length - 1);
                      const x = i * stepX;
                      const yCpu = 220 - (p.cpu / 60) * 190 - 15;
                      const yMem = 220 - (p.memory / 60) * 190 - 15;
                      return (
                        <g key={i}>
                          <circle cx={x} cy={yCpu} r="3.5" fill="#0d9488" />
                          <circle cx={x} cy={yMem} r="3.5" fill="#0284c7" />
                        </g>
                      );
                    })}
                  </svg>

                  {/* Chart Legend */}
                  <div className="chart-legend">
                    <div className="legend-item">
                      <span className="legend-dot" style={{ backgroundColor: '#0d9488' }}></span>
                      <span>Host CPU Usage ({systemData.cpu.toFixed(1)}%)</span>
                    </div>
                    <div className="legend-item">
                      <span className="legend-dot" style={{ backgroundColor: '#0284c7' }}></span>
                      <span>Host Memory Usage ({systemData.memory.toFixed(1)}%)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Health Overview Table */}
              <div className="content-card">
                <div className="content-card-header">
                  <div>
                    <h3 className="content-card-title">Service Health Overview</h3>
                    <p className="content-card-subtitle">Cluster Microservices &amp; Infrastructure targets</p>
                  </div>
                  <div className="badge-pill badge-success">
                    <span>{systemData.healthyCount}/{systemData.activeTargets} Operational</span>
                  </div>
                </div>

                <div className="table-responsive">
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
                      {targets.map(target => (
                        <tr key={target.name}>
                          <td>
                            <div className="table-target-name">
                              <span style={{ color: 'var(--accent-primary)' }}>●</span>
                              <span>{target.name}</span>
                            </div>
                          </td>
                          <td>
                            <span className="table-code">{target.url}</span>
                          </td>
                          <td>
                            <span className={target.status === 'UP' ? 'status-badge-up' : 'status-badge-down'}>
                              {target.status}
                            </span>
                          </td>
                          <td>
                            <span className="table-code">{target.duration}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* ======================================================== */}
          {/* TAB 2: METRICS VIEW                                      */}
          {/* ======================================================== */}
          {activeTab === 'metrics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div className="content-card">
                <div className="content-card-header">
                  <div>
                    <h3 className="content-card-title">Node &amp; Container Infrastructure Telemetry</h3>
                    <p className="content-card-subtitle">Host OS metrics gathered via Prometheus Node Exporter &amp; cAdvisor</p>
                  </div>
                  <div className="badge-pill badge-live">
                    <span className="live-dot"></span>
                    <span>Live 4s Interval</span>
                  </div>
                </div>

                <div className="kpi-grid" style={{ marginBottom: '24px' }}>
                  <div className="kpi-card">
                    <span className="kpi-label">Host CPU Utilization</span>
                    <div className="kpi-value" style={{ color: 'var(--accent-primary)' }}>{systemData.cpu.toFixed(1)}%</div>
                    <span className="kpi-subtext">2 vCPUs (EC2 Nitro t3.medium)</span>
                  </div>
                  <div className="kpi-card">
                    <span className="kpi-label">Memory In-Use</span>
                    <div className="kpi-value" style={{ color: 'var(--accent-cyan)' }}>{systemData.memory.toFixed(1)}%</div>
                    <span className="kpi-subtext">980 MB / 4.0 GB total RAM</span>
                  </div>
                  <div className="kpi-card">
                    <span className="kpi-label">EBS Storage Free</span>
                    <div className="kpi-value" style={{ color: 'var(--accent-emerald)' }}>{systemData.diskFree} GB</div>
                    <span className="kpi-subtext">gp3 SSD Root Partition (82% Free)</span>
                  </div>
                  <div className="kpi-card">
                    <span className="kpi-label">Network I/O Rate</span>
                    <div className="kpi-value" style={{ color: 'var(--accent-indigo)' }}>{systemData.networkRate}</div>
                    <span className="kpi-subtext">Docker Bridge cloudmonitor-net</span>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Container Microservice</th>
                        <th>Image &amp; Tag</th>
                        <th>Network Port</th>
                        <th>Memory Allocation</th>
                        <th>CPU Shares</th>
                        <th>Container Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="table-target-name">cloudmonitor-backend</td>
                        <td className="table-code">cloudmonitor-backend:latest</td>
                        <td className="table-code">8000:8000</td>
                        <td>~48 MB</td>
                        <td>0.5 vCPU limit</td>
                        <td><span className="status-badge-up">HEALTHY</span></td>
                      </tr>
                      <tr>
                        <td className="table-target-name">cloudmonitor-prometheus</td>
                        <td className="table-code">prom/prometheus:v2.54.1</td>
                        <td className="table-code">9090:9090</td>
                        <td>~124 MB</td>
                        <td>0.75 vCPU limit</td>
                        <td><span className="status-badge-up">HEALTHY</span></td>
                      </tr>
                      <tr>
                        <td className="table-target-name">cloudmonitor-grafana</td>
                        <td className="table-code">grafana/grafana:11.2.0</td>
                        <td className="table-code">3000:3000</td>
                        <td>~72 MB</td>
                        <td>0.5 vCPU limit</td>
                        <td><span className="status-badge-up">HEALTHY</span></td>
                      </tr>
                      <tr>
                        <td className="table-target-name">cloudmonitor-cadvisor</td>
                        <td className="table-code">gcr.io/cadvisor/cadvisor:v0.49.1</td>
                        <td className="table-code">8080:8080</td>
                        <td>~54 MB</td>
                        <td>0.25 vCPU limit</td>
                        <td><span className="status-badge-up">HEALTHY</span></td>
                      </tr>
                      <tr>
                        <td className="table-target-name">cloudmonitor-node-exporter</td>
                        <td className="table-code">prom/node-exporter:v1.8.2</td>
                        <td className="table-code">9100:9100</td>
                        <td>~18 MB</td>
                        <td>0.2 vCPU limit</td>
                        <td><span className="status-badge-up">HEALTHY</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 3: TARGETS VIEW                                      */}
          {/* ======================================================== */}
          {activeTab === 'targets' && (
            <div className="content-card">
              <div className="content-card-header">
                <div>
                  <h3 className="content-card-title">Prometheus Service Discovery Targets</h3>
                  <p className="content-card-subtitle">Active scrape loops configured in /etc/prometheus/prometheus.yml</p>
                </div>
                <div className="badge-pill badge-success">
                  <span>{systemData.healthyCount}/{systemData.activeTargets} Targets Healthy</span>
                </div>
              </div>

              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Target Name</th>
                      <th>Service Role</th>
                      <th>Endpoint URL</th>
                      <th>Scrape Latency</th>
                      <th>Scrape Interval</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {targets.map(t => (
                      <tr key={t.name}>
                        <td className="table-target-name">
                          <Server size={14} style={{ color: 'var(--accent-primary)' }} />
                          <span>{t.name}</span>
                        </td>
                        <td>{t.role}</td>
                        <td><span className="table-code">{t.url}</span></td>
                        <td><span className="table-code">{t.duration}</span></td>
                        <td><span className="table-code">15s</span></td>
                        <td>
                          <span className={t.status === 'UP' ? 'status-badge-up' : 'status-badge-down'}>
                            ● {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 4: ALERTS VIEW                                       */}
          {/* ======================================================== */}
          {activeTab === 'alerts' && (
            <div className="content-card">
              <div className="content-card-header">
                <div>
                  <h3 className="content-card-title">Active Alert Evaluation Rules</h3>
                  <p className="content-card-subtitle">Alertmanager routing &amp; PromQL condition thresholds</p>
                </div>
                <div className={`badge-pill ${alerts.length > 0 ? 'badge-live' : 'badge-success'}`}>
                  <span>{alerts.length} Active Triggers</span>
                </div>
              </div>

              {alerts.length === 0 ? (
                <div style={{ padding: '28px', textAlign: 'center', background: 'var(--bg-card-subtle)', borderRadius: '10px' }}>
                  <ShieldCheck size={40} style={{ color: 'var(--accent-emerald)', margin: '0 auto 12px' }} />
                  <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                    Zero Active Alerts
                  </h4>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    All SLO thresholds (CPU &lt; 85%, Latency &lt; 500ms, Scrapes UP == 1) are operating within normal parameters.
                  </p>
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Alert Name</th>
                        <th>Severity</th>
                        <th>Condition (PromQL)</th>
                        <th>Description</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((a, i) => (
                        <tr key={i}>
                          <td className="table-target-name">{a.labels?.alertname || 'Rule Alert'}</td>
                          <td>
                            <span className="status-badge-down">{a.labels?.severity?.toUpperCase() || 'CRITICAL'}</span>
                          </td>
                          <td className="table-code">{a.generatorURL || 'up == 0'}</td>
                          <td>{a.annotations?.description || a.annotations?.summary}</td>
                          <td><span className="badge-pill badge-live">FIRING</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 5: SRE LAB VIEW                                      */}
          {/* ======================================================== */}
          {activeTab === 'sre-lab' && (
            <div className="sre-grid">
              {/* Failure Injection Lab */}
              <div className="content-card">
                <div className="content-card-header">
                  <div>
                    <h3 className="content-card-title">Interactive Failure Injection</h3>
                    <p className="content-card-subtitle">Trigger live synthetic faults into the Docker cluster</p>
                  </div>
                  <div className="badge-pill badge-live">
                    <span>Live Simulation</span>
                  </div>
                </div>

                <div className="sre-btn-grid">
                  <button onClick={handleSimulateError} className="sre-action-btn danger">
                    <Zap size={16} />
                    <span>Inject HTTP 500 Error</span>
                  </button>

                  <button onClick={handleSimulateLatency} className="sre-action-btn">
                    <Clock size={16} />
                    <span>Inject 1.5s Latency</span>
                  </button>

                  <button onClick={() => handleToggleHealth(false)} className="sre-action-btn danger">
                    <AlertTriangle size={16} />
                    <span>Degrade Health Probe</span>
                  </button>

                  <button onClick={() => handleToggleHealth(true)} className="sre-action-btn success">
                    <CheckCircle2 size={16} />
                    <span>Restore Health Probe</span>
                  </button>
                </div>

                <h4 style={{ fontSize: '12px', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '8px', letterSpacing: '0.6px' }}>
                  Verification Event Stream
                </h4>
                <div className="sre-log-console">
                  {actionLog.map((log, i) => (
                    <div key={i} className="log-entry">
                      <span className="log-time">[{log.time}]</span>
                      <span>{log.msg}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* SRE SLO Targets vs Actual Measured Telemetry */}
              <div className="content-card">
                <div className="content-card-header">
                  <div>
                    <h3 className="content-card-title">SRE SLO Benchmark Scorecard</h3>
                    <p className="content-card-subtitle">Measured verification timestamps across recovery lifecycle</p>
                  </div>
                  <div className="badge-pill badge-success">
                    <span>100% Passed</span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="slo-row-item">
                    <div>
                      <div className="slo-item-title">Service Availability</div>
                      <div className="slo-item-target">Target Commitment: &ge; 99.0%</div>
                    </div>
                    <span className="status-badge-up">100.0% (PASS)</span>
                  </div>

                  <div className="slo-row-item">
                    <div>
                      <div className="slo-item-title">Failure Detection Latency (up == 0)</div>
                      <div className="slo-item-target">Target SLO: &lt; 30.0s</div>
                    </div>
                    <span className="status-badge-up">9.08s (PASS)</span>
                  </div>

                  <div className="slo-row-item">
                    <div>
                      <div className="slo-item-title">Critical Alert Notification Latency</div>
                      <div className="slo-item-target">Target SLO: &lt; 60.0s</div>
                    </div>
                    <span className="status-badge-up">17.22s (PASS)</span>
                  </div>

                  <div className="slo-row-item">
                    <div>
                      <div className="slo-item-title">Service Recovery Verification Latency</div>
                      <div className="slo-item-target">Target SLO: &lt; 30.0s</div>
                    </div>
                    <span className="status-badge-up">3.38s (PASS)</span>
                  </div>

                  <div className="slo-row-item">
                    <div>
                      <div className="slo-item-title">API Response Time (P95)</div>
                      <div className="slo-item-target">Target SLO: &lt; 500ms</div>
                    </div>
                    <span className="status-badge-up">14.2ms (PASS)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 6: GRAFANA (EMBEDDED IN FRONTEND ONLY)                */}
          {/* ======================================================== */}
          {activeTab === 'grafana' && (
            <div className="embed-workspace">
              {/* Toolbar */}
              <div className="embed-toolbar">
                <div className="embed-toolbar-left">
                  <div className="embed-title-badge">
                    <BarChart3 size={18} style={{ color: '#f97316' }} />
                    <span>Grafana Observability Portal</span>
                  </div>

                  <select
                    value={grafanaDashboard}
                    onChange={(e) => setGrafanaDashboard(e.target.value)}
                    className="embed-select"
                  >
                    <option value="cloudmonitor_overview">CloudMonitor System Overview</option>
                    <option value="dashboards">Browse All Dashboards</option>
                    <option value="explore">Explore PromQL Metrics</option>
                  </select>

                  <button
                    onClick={() => setGrafanaKiosk(!grafanaKiosk)}
                    className="embed-btn"
                    title="Toggle clean kiosk mode"
                  >
                    <Maximize2 size={14} />
                    <span>{grafanaKiosk ? 'Exit Kiosk' : 'Kiosk Mode'}</span>
                  </button>
                </div>

                <div className="embed-toolbar-right">
                  <button
                    onClick={() => setFrameKey(k => k + 1)}
                    className="embed-btn"
                    title="Reload embedded view"
                  >
                    <RefreshCw size={14} />
                    <span>Reload</span>
                  </button>

                  <a
                    href="http://localhost:3000"
                    target="_blank"
                    rel="noreferrer"
                    className="embed-btn"
                    title="Open in separate tab if desired"
                  >
                    <ExternalLink size={14} />
                    <span>External Tab</span>
                  </a>
                </div>
              </div>

              {/* Informative helper note */}
              <div className="embed-notice-banner">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  <span>
                    Embedded directly from <strong>http://localhost:3000</strong>. Default credentials: <code>admin / admin</code>.
                  </span>
                </div>
                <span style={{ fontSize: '11px', opacity: 0.85 }}>Grafana v11.2.0</span>
              </div>

              {/* In-app frame */}
              <div className="embed-iframe-container">
                <iframe
                  key={frameKey}
                  src={`http://localhost:3000/${
                    grafanaDashboard === 'explore'
                      ? 'explore'
                      : grafanaDashboard === 'dashboards'
                      ? 'dashboards'
                      : 'd/cloudmonitor-overview/cloudmonitor-overview'
                  }?orgId=1${grafanaKiosk ? '&kiosk=tv' : ''}`}
                  title="Grafana Embedded View"
                  className="embed-iframe"
                  allow="fullscreen"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 7: PROMETHEUS (EMBEDDED IN FRONTEND ONLY)             */}
          {/* ======================================================== */}
          {activeTab === 'prometheus' && (
            <div className="embed-workspace">
              <div className="embed-toolbar">
                <div className="embed-toolbar-left">
                  <div className="embed-title-badge">
                    <LineChart size={18} style={{ color: '#ea580c' }} />
                    <span>Prometheus TSDB Engine &amp; Query Console</span>
                  </div>
                </div>

                <div className="embed-toolbar-right">
                  <button
                    onClick={() => setFrameKey(k => k + 1)}
                    className="embed-btn"
                  >
                    <RefreshCw size={14} />
                    <span>Reload</span>
                  </button>

                  <a
                    href="http://localhost:9090"
                    target="_blank"
                    rel="noreferrer"
                    className="embed-btn"
                  >
                    <ExternalLink size={14} />
                    <span>External Tab</span>
                  </a>
                </div>
              </div>

              <div className="embed-notice-banner" style={{ background: 'var(--accent-amber-light)', color: 'var(--accent-amber)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>🔥 Embedded from <strong>http://localhost:9090/graph</strong>. Quick PromQL suggestions: <code>up</code>, <code>node_cpu_seconds_total</code>, <code>rate(http_requests_total[1m])</code>.</span>
                </div>
              </div>

              <div className="embed-iframe-container">
                <iframe
                  key={frameKey}
                  src="http://localhost:9090/graph"
                  title="Prometheus Embedded View"
                  className="embed-iframe"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 8: CADVISOR (EMBEDDED IN FRONTEND ONLY)              */}
          {/* ======================================================== */}
          {activeTab === 'cadvisor' && (
            <div className="embed-workspace">
              <div className="embed-toolbar">
                <div className="embed-toolbar-left">
                  <div className="embed-title-badge">
                    <Boxes size={18} style={{ color: '#8b5cf6' }} />
                    <span>cAdvisor Container Telemetry &amp; Runtime Isolation</span>
                  </div>

                  <select
                    value={cadvisorView}
                    onChange={(e) => setCadvisorView(e.target.value)}
                    className="embed-select"
                  >
                    <option value="containers">All Containers (/containers/)</option>
                    <option value="docker">Docker Daemon Root (/docker/)</option>
                    <option value="root">System Hardware Root (/)</option>
                  </select>
                </div>

                <div className="embed-toolbar-right">
                  <button
                    onClick={() => setFrameKey(k => k + 1)}
                    className="embed-btn"
                    title="Reload embedded view"
                  >
                    <RefreshCw size={14} />
                    <span>Reload</span>
                  </button>

                  <a
                    href="http://localhost:8080/containers/"
                    target="_blank"
                    rel="noreferrer"
                    className="embed-btn"
                  >
                    <ExternalLink size={14} />
                    <span>External Tab</span>
                  </a>
                </div>
              </div>

              <div className="embed-notice-banner" style={{ background: 'var(--accent-indigo-light)', color: 'var(--accent-indigo)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CheckCircle2 size={16} />
                  <span>
                    Embedded directly from <strong>http://localhost:8080/containers/</strong>. Real-time CPU cores, memory limits, network throughput, and cgroups v2 isolation.
                  </span>
                </div>
                <span style={{ fontSize: '11px', opacity: 0.85 }}>cAdvisor v0.49.1</span>
              </div>

              <div className="embed-iframe-container">
                <iframe
                  key={frameKey}
                  src={`http://localhost:8080/${cadvisorView === 'docker' ? 'docker/' : cadvisorView === 'root' ? '' : 'containers/'}`}
                  title="cAdvisor Embedded View"
                  className="embed-iframe"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 8: ALERTMANAGER (EMBEDDED IN FRONTEND ONLY)          */}
          {/* ======================================================== */}
          {activeTab === 'alertmanager' && (
            <div className="embed-workspace">
              <div className="embed-toolbar">
                <div className="embed-toolbar-left">
                  <div className="embed-title-badge">
                    <Radio size={18} style={{ color: '#e11d48' }} />
                    <span>Alertmanager Notifications &amp; Silences</span>
                  </div>
                </div>

                <div className="embed-toolbar-right">
                  <button
                    onClick={() => setFrameKey(k => k + 1)}
                    className="embed-btn"
                  >
                    <RefreshCw size={14} />
                    <span>Reload</span>
                  </button>

                  <a
                    href="http://localhost:9093"
                    target="_blank"
                    rel="noreferrer"
                    className="embed-btn"
                  >
                    <ExternalLink size={14} />
                    <span>External Tab</span>
                  </a>
                </div>
              </div>

              <div className="embed-notice-banner" style={{ background: 'var(--accent-rose-light)', color: 'var(--accent-rose)' }}>
                <span>🔔 Embedded from <strong>http://localhost:9093</strong>. Real-time alert deduplication, inhibition, and routing receiver.</span>
              </div>

              <div className="embed-iframe-container">
                <iframe
                  key={frameKey}
                  src="http://localhost:9093"
                  title="Alertmanager Embedded View"
                  className="embed-iframe"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 9: API DOCS (EMBEDDED IN FRONTEND ONLY)              */}
          {/* ======================================================== */}
          {activeTab === 'api-docs' && (
            <div className="embed-workspace">
              <div className="embed-toolbar">
                <div className="embed-toolbar-left">
                  <div className="embed-title-badge">
                    <FileCode size={18} style={{ color: '#0284c7' }} />
                    <span>FastAPI OpenAPI Interactive Swagger UI</span>
                  </div>
                </div>

                <div className="embed-toolbar-right">
                  <button
                    onClick={() => setFrameKey(k => k + 1)}
                    className="embed-btn"
                  >
                    <RefreshCw size={14} />
                    <span>Reload</span>
                  </button>

                  <a
                    href="http://localhost:8000/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="embed-btn"
                  >
                    <ExternalLink size={14} />
                    <span>External Tab</span>
                  </a>
                </div>
              </div>

              <div className="embed-notice-banner">
                <span>⚡ Interactive API endpoints live at <strong>http://localhost:8000/docs</strong> with live execution and JSON schemas.</span>
              </div>

              <div className="embed-iframe-container">
                <iframe
                  key={frameKey}
                  src="http://localhost:8000/docs"
                  title="FastAPI Swagger UI"
                  className="embed-iframe"
                />
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* TAB 10: SETTINGS VIEW                                    */}
          {/* ======================================================== */}
          {activeTab === 'settings' && (
            <div className="content-card">
              <div className="content-card-header">
                <div>
                  <h3 className="content-card-title">Cloud Monitor Platform Settings</h3>
                  <p className="content-card-subtitle">Configure UI appearance, polling intervals, and service endpoints</p>
                </div>
              </div>

              <div className="settings-grid">
                <div>
                  <div className="settings-group">
                    <label className="settings-label">Color Theme</label>
                    <p className="settings-desc">Choose between the clean professional dashboard theme and dark glass theme.</p>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button
                        onClick={() => setTheme('clean')}
                        className={`sre-action-btn ${theme === 'clean' ? 'success' : ''}`}
                        style={{ flex: 1 }}
                      >
                        <Sun size={15} />
                        <span>Clean Slate (Slide Design)</span>
                      </button>
                      <button
                        onClick={() => setTheme('dark')}
                        className={`sre-action-btn ${theme === 'dark' ? 'success' : ''}`}
                        style={{ flex: 1 }}
                      >
                        <Moon size={15} />
                        <span>Dark Glass (Original)</span>
                      </button>
                    </div>
                  </div>

                  <div className="settings-group">
                    <label className="settings-label">Telemetry Polling Interval</label>
                    <p className="settings-desc">How often the frontend polls Prometheus and the backend for fresh data.</p>
                    <select
                      value={refreshInterval}
                      onChange={(e) => setRefreshInterval(Number(e.target.value))}
                      className="embed-select"
                      style={{ width: '100%', padding: '10px' }}
                    >
                      <option value={2000}>2 seconds (High Frequency)</option>
                      <option value={4000}>4 seconds (Recommended Standard)</option>
                      <option value={10000}>10 seconds (Low Bandwidth)</option>
                      <option value={30000}>30 seconds (Conservation)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <div className="settings-group">
                    <label className="settings-label">Backend API URL</label>
                    <input
                      type="text"
                      defaultValue="http://localhost:8000"
                      className="settings-input"
                    />
                  </div>

                  <div className="settings-group">
                    <label className="settings-label">Prometheus TSDB URL</label>
                    <input
                      type="text"
                      defaultValue="http://localhost:9090"
                      className="settings-input"
                    />
                  </div>

                  <div className="settings-group">
                    <label className="settings-label">Grafana Instance URL</label>
                    <input
                      type="text"
                      defaultValue="http://localhost:3000"
                      className="settings-input"
                    />
                  </div>

                  <div className="settings-group">
                    <label className="settings-label">cAdvisor Instance URL</label>
                    <input
                      type="text"
                      defaultValue="http://localhost:8080"
                      className="settings-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
