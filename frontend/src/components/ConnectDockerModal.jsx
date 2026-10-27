import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Copy,
  Check,
  X,
  ShieldCheck,
  Terminal,
  Info,
  RefreshCw,
  Trash2,
  KeyRound,
  AlertCircle,
  Server,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Cpu,
  HardDrive,
  ExternalLink,
  Laptop,
  Monitor,
  Apple
} from 'lucide-react';
import { api } from '../api';

export default function ConnectDockerModal({ isOpen, onClose, user, onAgentChange, onSelectHostMetrics }) {
  // Navigation / Wizard step: 'list' | 'step_a' | 'step_b' | 'step_c' | 'step_d' | 'step_e'
  const [currentStep, setCurrentStep] = useState('step_a');

  // Enrolled agents state
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Wizard input state
  const [selectedOS, setSelectedOS] = useState('windows'); // 'windows' | 'linux' | 'macos'
  const [hostName, setHostName] = useState('My Local Docker Host');
  const [enrolling, setEnrolling] = useState(false);

  // Active / newly created agent session
  const [activeAgent, setActiveAgent] = useState(null);
  const [activeKey, setActiveKey] = useState(null);

  // UI state for Screen C
  const [shellTab, setShellTab] = useState('powershell'); // 'powershell' | 'cmd' | 'bash' | 'compose'
  const [copied, setCopied] = useState(false);

  // Screen D verification polling state
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [verifySeconds, setVerifySeconds] = useState(0);
  const [verifyTimeout, setVerifyTimeout] = useState(false);

  // Modals for Rotate / Disconnect
  const [confirmRotate, setConfirmRotate] = useState(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Polling ref for cleanup
  const pollingRef = useRef(null);

  // Fetch agents list
  const fetchAgents = async () => {
    if (!isOpen) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.listAgents();
      setAgents(data);
      if (onAgentChange) onAgentChange(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch enrolled hosts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAgents();
      if (!activeAgent) {
        setCurrentStep('step_a');
      }
    } else {
      // Reset wizard on close
      clearInterval(pollingRef.current);
      setError(null);
      setVerifySeconds(0);
      setVerifyTimeout(false);
    }
  }, [isOpen]);

  // Sync shellTab default when OS changes
  useEffect(() => {
    if (selectedOS === 'windows') {
      setShellTab('powershell');
      setHostName(prev => prev.includes('Host') ? 'Windows Workstation' : prev);
    } else if (selectedOS === 'linux') {
      setShellTab('bash');
      setHostName(prev => prev.includes('Host') || prev.includes('Windows') ? 'Linux Server' : prev);
    } else if (selectedOS === 'macos') {
      setShellTab('bash');
      setHostName(prev => prev.includes('Host') || prev.includes('Windows') || prev.includes('Linux') ? 'Mac Workstation' : prev);
    }
  }, [selectedOS]);

  // Screen D verification polling timer
  useEffect(() => {
    if (currentStep === 'step_d' && activeAgent) {
      setVerifySeconds(0);
      setVerifyTimeout(false);

      const checkStatus = async () => {
        try {
          const statusData = await api.getAgentConnectionStatus(activeAgent.id);
          setConnectionStatus(statusData);

          if (statusData.stage === 'connected' || (statusData.container_count > 0 && statusData.status === 'online')) {
            clearInterval(pollingRef.current);
            await fetchAgents();
            setCurrentStep('step_e');
          }
        } catch (err) {
          console.warn('Polling connection status:', err);
        }
      };

      checkStatus();
      pollingRef.current = setInterval(() => {
        setVerifySeconds(s => {
          if (s >= 55) {
            setVerifyTimeout(true);
          }
          return s + 2;
        });
        checkStatus();
      }, 2000);

      return () => clearInterval(pollingRef.current);
    }
  }, [currentStep, activeAgent]);

  if (!isOpen) return null;

  // Resolve public API Server URL automatically (no hardcoded localhost or tunnels!)
  const serverUrl = (import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/\/$/, '');
  const agentSecret = activeKey || activeAgent?.agent_key || 'YOUR_GENERATED_AGENT_KEY';

  // Build OS-specific, idempotent commands
  const getCommand = () => {
    if (shellTab === 'powershell') {
      return `# 1. Remove previous agent container if present (safe retry)
docker rm -f cloudmonitor-agent 2>$null

# 2. Launch CloudMonitor Agent with read-only Docker socket
docker run -d \`
  --name cloudmonitor-agent \`
  --restart unless-stopped \`
  -v /var/run/docker.sock:/var/run/docker.sock:ro \`
  -e CLOUDMONITOR_SERVER="${serverUrl}" \`
  -e CLOUDMONITOR_AGENT_KEY="${agentSecret}" \`
  cloudmonitor-agent:latest`;
    }

    if (shellTab === 'cmd') {
      return `docker rm -f cloudmonitor-agent 2>nul
docker run -d ^
  --name cloudmonitor-agent ^
  --restart unless-stopped ^
  -v /var/run/docker.sock:/var/run/docker.sock:ro ^
  -e CLOUDMONITOR_SERVER="${serverUrl}" ^
  -e CLOUDMONITOR_AGENT_KEY="${agentSecret}" ^
  cloudmonitor-agent:latest`;
    }

    if (shellTab === 'bash') {
      return `# 1. Remove previous agent container if present (idempotent)
docker rm -f cloudmonitor-agent 2>/dev/null || true

# 2. Run CloudMonitor Agent (outbound HTTPS, read-only socket)
docker run -d \\
  --name cloudmonitor-agent \\
  --restart unless-stopped \\
  -v /var/run/docker.sock:/var/run/docker.sock:ro \\
  -e CLOUDMONITOR_SERVER="${serverUrl}" \\
  -e CLOUDMONITOR_AGENT_KEY="${agentSecret}" \\
  cloudmonitor-agent:latest`;
    }

    if (shellTab === 'compose') {
      return `services:
  cloudmonitor-agent:
    image: cloudmonitor-agent:latest
    container_name: cloudmonitor-agent
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - CLOUDMONITOR_SERVER=${serverUrl}
      - CLOUDMONITOR_AGENT_KEY=${agentSecret}`;
    }

    return '';
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(getCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Screen B -> Screen C: Create Connection (Enroll on Backend)
  const handleCreateConnection = async (e) => {
    if (e) e.preventDefault();
    if (!hostName.trim()) return;

    setEnrolling(true);
    setError(null);
    try {
      const res = await api.enrollAgent(hostName.trim(), selectedOS);
      setActiveAgent(res);
      setActiveKey(res.agent_key);
      await fetchAgents();
      setCurrentStep('step_c');
    } catch (err) {
      setError(err.message || 'Host connection creation failed');
    } finally {
      setEnrolling(false);
    }
  };

  // Rotate Key
  const handleRotateKey = async (agent) => {
    setActionLoading(true);
    try {
      const res = await api.rotateAgentKey(agent.id);
      setActiveAgent(res);
      setActiveKey(res.agent_key);
      setConfirmRotate(null);
      await fetchAgents();
      setCurrentStep('step_c');
    } catch (err) {
      setError(err.message || 'Key rotation failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Disconnect / Revoke Host
  const handleDisconnect = async (agentId, purge = false) => {
    setActionLoading(true);
    try {
      await api.revokeAgent(agentId, purge);
      setConfirmDisconnect(null);
      if (activeAgent?.id === agentId) {
        setActiveAgent(null);
        setActiveKey(null);
        setCurrentStep('step_a');
      }
      await fetchAgents();
    } catch (err) {
      setError(err.message || 'Failed to disconnect host');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog connect-docker-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div className="brand-icon" style={{ width: '38px', height: '38px' }}>
              <Box size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Connect Docker Environment
              </h3>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Tenant: <strong>{user?.email}</strong> (Tenant ID #{user?.id})
              </p>
            </div>
          </div>
          <button className="theme-toggle-btn" onClick={onClose} title="Close" style={{ width: '32px', height: '32px' }}>
            <X size={18} />
          </button>
        </div>

        {/* Wizard Stepper Bar */}
        <div className="wizard-stepper">
          <button
            className={`wizard-step-pill ${currentStep === 'step_a' ? 'active' : ''}`}
            onClick={() => setCurrentStep('step_a')}
          >
            <span className="step-num">1</span> Choose OS
          </button>
          <button
            className={`wizard-step-pill ${currentStep === 'step_b' ? 'active' : ''}`}
            onClick={() => setCurrentStep('step_b')}
          >
            <span className="step-num">2</span> Configure
          </button>
          <button
            className={`wizard-step-pill ${currentStep === 'step_c' ? 'active' : ''}`}
            onClick={() => activeAgent && setCurrentStep('step_c')}
            disabled={!activeAgent}
          >
            <span className="step-num">3</span> Install
          </button>
          <button
            className={`wizard-step-pill ${currentStep === 'step_d' ? 'active' : ''}`}
            onClick={() => activeAgent && setCurrentStep('step_d')}
            disabled={!activeAgent}
          >
            <span className="step-num">4</span> Verify
          </button>
          <button
            className={`wizard-step-pill ${currentStep === 'step_e' ? 'active' : ''}`}
            onClick={() => activeAgent && setCurrentStep('step_e')}
            disabled={!connectionStatus && currentStep !== 'step_e'}
          >
            <span className="step-num">5</span> Summary
          </button>
          {agents.length > 0 && (
            <button
              className={`wizard-step-pill ${currentStep === 'list' ? 'active' : ''}`}
              style={{ marginLeft: 'auto' }}
              onClick={() => setCurrentStep('list')}
            >
              Manage Hosts ({agents.length})
            </button>
          )}
        </div>

        <div className="connect-docker-body">
          {error && (
            <div className="status-banner error" style={{ marginBottom: '14px' }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {/* ============================================================ */}
          {/* SCREEN A — CHOOSE ENVIRONMENT                                */}
          {/* ============================================================ */}
          {currentStep === 'step_a' && (
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                Select Your Operating System
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Select the platform hosting your Docker engine. CloudMonitor will tailor the installation commands and socket bindings.
              </p>

              <div className="os-cards-grid">
                {/* Windows Card */}
                <div
                  className={`os-card ${selectedOS === 'windows' ? 'selected' : ''}`}
                  onClick={() => setSelectedOS('windows')}
                >
                  <div className="os-card-header">
                    <Monitor size={28} className="os-icon" />
                    <span className="badge badge-healthy">Verified</span>
                  </div>
                  <h5 className="os-title">Windows</h5>
                  <p className="os-desc">Docker Desktop for Windows 10/11 using WSL2 or Hyper-V backend.</p>
                  <div className="os-tags">
                    <span className="os-tag">Docker Desktop 4+</span>
                    <span className="os-tag">Unix Socket / WSL2</span>
                  </div>
                </div>

                {/* Linux Card */}
                <div
                  className={`os-card ${selectedOS === 'linux' ? 'selected' : ''}`}
                  onClick={() => setSelectedOS('linux')}
                >
                  <div className="os-card-header">
                    <Terminal size={28} className="os-icon" />
                    <span className="badge badge-healthy">Verified</span>
                  </div>
                  <h5 className="os-title">Linux</h5>
                  <p className="os-desc">Native Docker Engine or Docker Desktop on Ubuntu, Debian, RHEL, CentOS.</p>
                  <div className="os-tags">
                    <span className="os-tag">Docker Engine 20.10+</span>
                    <span className="os-tag">/var/run/docker.sock</span>
                  </div>
                </div>

                {/* macOS Card */}
                <div
                  className={`os-card ${selectedOS === 'macos' ? 'selected' : ''}`}
                  onClick={() => setSelectedOS('macos')}
                >
                  <div className="os-card-header">
                    <Apple size={28} className="os-icon" />
                    <span className="badge badge-healthy">Verified</span>
                  </div>
                  <h5 className="os-title">macOS</h5>
                  <p className="os-desc">Docker Desktop for macOS on Apple Silicon (M-series) or Intel Macs.</p>
                  <div className="os-tags">
                    <span className="os-tag">Apple Silicon / Intel</span>
                    <span className="os-tag">Docker Desktop 4+</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
                <button className="btn btn-primary" onClick={() => setCurrentStep('step_b')}>
                  Continue to Configuration <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SCREEN B — CREATE CONNECTION                                 */}
          {/* ============================================================ */}
          {currentStep === 'step_b' && (
            <div>
              <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                Name Your Docker Host
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '18px' }}>
                Assign a friendly identifier to distinguish this Docker environment in your telemetry dashboard.
              </p>

              <form onSubmit={handleCreateConnection}>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px' }}>
                    Docker Host Name
                  </label>
                  <input
                    type="text"
                    className="auth-input"
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="e.g. Production-EC2-Node or Home-Workstation"
                    required
                  />
                </div>

                <div className="info-callout" style={{ marginBottom: '20px' }}>
                  <ShieldCheck size={20} style={{ color: 'var(--status-healthy)', flexShrink: 0 }} />
                  <div style={{ fontSize: '0.8125rem' }}>
                    <strong>Automated & Cryptographically Isolated:</strong>
                    <p style={{ marginTop: '2px', opacity: 0.9 }}>
                      Clicking <strong>Install & Connect</strong> creates an isolated host record for Tenant #{user?.id} and generates a unique 256-bit secret key. Only a SHA-256 hash is permanently saved in PostgreSQL.
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="btn" onClick={() => setCurrentStep('step_a')}>
                    <ArrowLeft size={16} /> Back
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={enrolling || !hostName.trim()}>
                    {enrolling ? <RefreshCw size={16} className="spin-anim" /> : <ShieldCheck size={16} />}
                    {enrolling ? 'Generating Credentials...' : 'Install & Connect'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ============================================================ */}
          {/* SCREEN C — INSTALL AGENT                                     */}
          {/* ============================================================ */}
          {currentStep === 'step_c' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Install Agent on {activeAgent?.name || hostName}
                  </h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Public Server: <code>{serverUrl}</code> • Operating System: <strong style={{ textTransform: 'capitalize' }}>{selectedOS}</strong>
                  </p>
                </div>
                <span className="badge badge-warning">Awaiting Execution</span>
              </div>

              {/* Shell Selector Tabs */}
              <div className="tab-pill-group" style={{ marginBottom: '10px' }}>
                {selectedOS === 'windows' && (
                  <>
                    <button
                      className={`tab-pill ${shellTab === 'powershell' ? 'active' : ''}`}
                      onClick={() => setShellTab('powershell')}
                    >
                      PowerShell
                    </button>
                    <button
                      className={`tab-pill ${shellTab === 'cmd' ? 'active' : ''}`}
                      onClick={() => setShellTab('cmd')}
                    >
                      Command Prompt (CMD)
                    </button>
                  </>
                )}
                {(selectedOS === 'linux' || selectedOS === 'macos') && (
                  <button
                    className={`tab-pill ${shellTab === 'bash' ? 'active' : ''}`}
                    onClick={() => setShellTab('bash')}
                  >
                    Terminal (Bash / Zsh)
                  </button>
                )}
                <button
                  className={`tab-pill ${shellTab === 'compose' ? 'active' : ''}`}
                  onClick={() => setShellTab('compose')}
                >
                  Docker Compose
                </button>
              </div>

              {/* Code Box */}
              <div className="code-block-container" style={{ marginBottom: '14px' }}>
                <pre className="code-block" style={{ maxHeight: '180px' }}>{getCommand()}</pre>
                <button className="copy-btn" onClick={handleCopy} title="Copy to Clipboard">
                  {copied ? <Check size={16} style={{ color: 'var(--status-healthy)' }} /> : <Copy size={16} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>

              {/* Security Guardrails Callout */}
              <div className="info-callout" style={{ marginBottom: '18px' }}>
                <ShieldCheck size={18} style={{ color: 'var(--status-healthy)', flexShrink: 0 }} />
                <div style={{ fontSize: '0.785rem' }}>
                  <strong>Security & Least-Privilege Design:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    <li>Mounts <code>/var/run/docker.sock:ro</code> in strict read-only mode.</li>
                    <li>Transmits telemetry over public HTTPS (no SSH tunnels or inbound ports).</li>
                    <li>Strict privacy: never reads container env variables, secrets, or shell commands.</li>
                    <li>Idempotent: safely replaces previous agent containers on the same host.</li>
                  </ul>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn" onClick={() => setCurrentStep('step_b')}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button className="btn btn-primary" onClick={() => setCurrentStep('step_d')}>
                  I've Run the Command / Verify <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SCREEN D — VERIFY CONNECTION                                 */}
          {/* ============================================================ */}
          {currentStep === 'step_d' && (
            <div>
              <div style={{ textAlign: 'center', padding: '12px 0 20px 0' }}>
                <div className="verify-spinner-wrap">
                  <RefreshCw size={36} className="spin-anim" style={{ color: 'var(--accent-cyan)' }} />
                </div>
                <h4 style={{ fontSize: '1.15rem', fontWeight: 700, marginTop: '12px', color: 'var(--text-main)' }}>
                  Listening for Agent Connection...
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Target Host: <strong>{activeAgent?.name || hostName}</strong> • Polling elapsed: {verifySeconds}s
                </p>
              </div>

              {/* Verification Progress Stepper */}
              <div className="verification-steps-card">
                <div className="v-step done">
                  <CheckCircle2 size={18} className="v-icon done" />
                  <div className="v-info">
                    <span className="v-title">1. Host & Secret Provisioned</span>
                    <span className="v-desc">Tenant isolation validated on PostgreSQL</span>
                  </div>
                </div>

                <div className={`v-step ${connectionStatus?.last_heartbeat ? 'done' : 'active'}`}>
                  {connectionStatus?.last_heartbeat ? (
                    <CheckCircle2 size={18} className="v-icon done" />
                  ) : (
                    <RefreshCw size={18} className="v-icon active spin-anim" />
                  )}
                  <div className="v-info">
                    <span className="v-title">2. Agent Authentication & Heartbeat</span>
                    <span className="v-desc">
                      {connectionStatus?.last_heartbeat
                        ? `Received heartbeat from ${connectionStatus.hostname || 'agent'} (${connectionStatus.os_info || 'Docker'})`
                        : 'Waiting for agent daemon to deliver initial heartbeat...'}
                    </span>
                  </div>
                </div>

                <div className={`v-step ${connectionStatus?.container_count > 0 ? 'done' : connectionStatus?.last_heartbeat ? 'active' : 'pending'}`}>
                  {connectionStatus?.container_count > 0 ? (
                    <CheckCircle2 size={18} className="v-icon done" />
                  ) : connectionStatus?.last_heartbeat ? (
                    <RefreshCw size={18} className="v-icon active spin-anim" />
                  ) : (
                    <div className="v-icon pending" />
                  )}
                  <div className="v-info">
                    <span className="v-title">3. Container Discovery & Telemetry Ingestion</span>
                    <span className="v-desc">
                      {connectionStatus?.container_count > 0
                        ? `Discovered ${connectionStatus.container_count} container(s) (${connectionStatus.running_count} running)`
                        : 'Awaiting container cgroup metrics payload...'}
                    </span>
                  </div>
                </div>
              </div>

              {verifyTimeout && (
                <div className="status-banner warning" style={{ marginTop: '16px' }}>
                  <AlertCircle size={20} style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Connection taking longer than expected?</strong>
                    <p style={{ fontSize: '0.8rem', marginTop: '2px' }}>
                      Ensure Docker Desktop or Docker Engine is running on your machine, then run the setup command in your terminal.
                    </p>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
                <button className="btn" onClick={() => setCurrentStep('step_c')}>
                  <ArrowLeft size={16} /> View Command Again
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setVerifySeconds(0);
                    setVerifyTimeout(false);
                  }}
                >
                  <RefreshCw size={14} /> Retry Verification
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* SCREEN E — SUCCESS                                           */}
          {/* ============================================================ */}
          {currentStep === 'step_e' && (
            <div>
              <div className="success-banner-box">
                <div className="success-icon-badge">
                  <CheckCircle2 size={32} />
                </div>
                <h4 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '8px' }}>
                  Docker Host Successfully Connected!
                </h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Agent is online and streaming live container metrics to your dashboard.
                </p>
              </div>

              {/* Connected Host Details Card */}
              <div className="glass-panel" style={{ padding: '16px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div>
                    <h5 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                      {connectionStatus?.name || activeAgent?.name}
                    </h5>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Host: {connectionStatus?.hostname || 'Local Node'} • OS: {connectionStatus?.os_info || selectedOS}
                    </span>
                  </div>
                  <span className="badge badge-healthy" style={{ padding: '4px 10px', fontSize: '0.8125rem' }}>
                    <span className="status-indicator-dot" style={{ width: '8px', height: '8px' }} /> ONLINE
                  </span>
                </div>

                <div className="kpi-grid" style={{ marginBottom: '12px' }}>
                  <div className="kpi-card" style={{ padding: '10px' }}>
                    <span className="kpi-label">Containers</span>
                    <div className="kpi-value" style={{ fontSize: '1.25rem' }}>
                      {connectionStatus?.container_count || 0}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--status-healthy)' }}>
                      {connectionStatus?.running_count || 0} running
                    </span>
                  </div>

                  <div className="kpi-card" style={{ padding: '10px' }}>
                    <span className="kpi-label">Docker Engine</span>
                    <div className="kpi-value" style={{ fontSize: '1.15rem' }}>
                      {connectionStatus?.docker_version || 'v27+'}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Socket IPC</span>
                  </div>

                  <div className="kpi-card" style={{ padding: '10px' }}>
                    <span className="kpi-label">Agent Version</span>
                    <div className="kpi-value" style={{ fontSize: '1.15rem' }}>
                      v{connectionStatus?.agent_version || '1.1.0'}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>Active Daemon</span>
                  </div>

                  <div className="kpi-card" style={{ padding: '10px' }}>
                    <span className="kpi-label">Total Container CPU</span>
                    <div className="kpi-value" style={{ fontSize: '1.15rem' }}>
                      {(connectionStatus?.total_cpu_percent || 0).toFixed(1)}%
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Aggregated</span>
                  </div>
                </div>

                <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>Last Heartbeat: {connectionStatus?.last_heartbeat ? new Date(connectionStatus.last_heartbeat).toLocaleTimeString() : 'Just now'}</span>
                  <span>Auto-Restart: enabled (unless-stopped)</span>
                </div>
              </div>

              {/* 4 Functional Action Buttons */}
              <div className="wizard-actions-grid">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (onSelectHostMetrics) {
                      onSelectHostMetrics(activeAgent?.id || connectionStatus?.agent_id);
                    }
                    onClose();
                  }}
                >
                  <Server size={15} /> View Metrics
                </button>

                <button
                  className="btn"
                  onClick={() => setCurrentStep('step_c')}
                  title="View setup command again"
                >
                  <RefreshCw size={15} /> Reconnect
                </button>

                <button
                  className="btn"
                  onClick={() => setConfirmRotate(activeAgent || connectionStatus)}
                  title="Rotate agent credentials"
                >
                  <KeyRound size={15} /> Rotate Credential
                </button>

                <button
                  className="btn btn-danger"
                  onClick={() => setConfirmDisconnect(activeAgent || connectionStatus)}
                  title="Disconnect and revoke host"
                >
                  <Trash2 size={15} /> Disconnect Host
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* MANAGE ENROLLED HOSTS LIST                                   */}
          {/* ============================================================ */}
          {currentStep === 'list' && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                <div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    Enrolled Docker Hosts ({agents.length})
                  </h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    Manage credentials, inspect connectivity status, and disconnect hosts.
                  </p>
                </div>
                <button className="btn btn-primary" onClick={() => setCurrentStep('step_a')}>
                  + Connect Another Host
                </button>
              </div>

              <div className="data-table-wrap" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Host Name</th>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Containers</th>
                      <th>Last Heartbeat</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agents.map((ag) => (
                      <tr key={ag.id}>
                        <td style={{ fontWeight: 600 }}>{ag.name}</td>
                        <td style={{ textTransform: 'capitalize' }}>{ag.os_type || 'linux'}</td>
                        <td>
                          <span className={`badge ${ag.status === 'online' ? 'badge-healthy' : ag.is_revoked ? 'badge-critical' : 'badge-warning'}`}>
                            {ag.is_revoked ? 'REVOKED' : ag.status.toUpperCase()}
                          </span>
                        </td>
                        <td>{ag.container_count || 0}</td>
                        <td style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>
                          {ag.last_heartbeat ? new Date(ag.last_heartbeat).toLocaleTimeString() : 'Awaiting'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            {!ag.is_revoked && (
                              <>
                                <button
                                  className="btn"
                                  style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    setActiveAgent(ag);
                                    setCurrentStep('step_c');
                                  }}
                                  title="View Setup Command"
                                >
                                  Reconnect
                                </button>
                                <button
                                  className="btn"
                                  style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                                  onClick={() => setConfirmRotate(ag)}
                                  title="Rotate Credential"
                                >
                                  Rotate
                                </button>
                              </>
                            )}
                            <button
                              className="btn btn-danger"
                              style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                              onClick={() => setConfirmDisconnect(ag)}
                              title="Disconnect Host"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="modal-actions" style={{ marginTop: '20px' }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Sub-Modal: Rotate Credential */}
      {confirmRotate && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-dialog" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '8px' }}>
              Rotate Credential for "{confirmRotate.name}"?
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Rotating the credential will immediately invalidate the current agent key. The existing agent on that host will stop sending metrics until restarted with the newly generated key.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn" onClick={() => setConfirmRotate(null)} disabled={actionLoading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={() => handleRotateKey(confirmRotate)} disabled={actionLoading}>
                {actionLoading ? 'Rotating...' : 'Confirm Rotation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Sub-Modal: Disconnect Host */}
      {confirmDisconnect && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-dialog" style={{ maxWidth: '440px' }} onClick={(e) => e.stopPropagation()}>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--status-critical)', marginBottom: '8px' }}>
              Disconnect "{confirmDisconnect.name}"?
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Are you sure you want to disconnect this Docker host? The agent will be revoked and barred from transmitting metrics to your account.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button className="btn" onClick={() => setConfirmDisconnect(null)} disabled={actionLoading}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDisconnect(confirmDisconnect.id, true)}
                disabled={actionLoading}
              >
                {actionLoading ? 'Disconnecting...' : 'Disconnect & Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
