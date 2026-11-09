import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Copy,
  Check,
  X,
  ShieldCheck,
  Terminal,
  RefreshCw,
  Trash2,
  KeyRound,
  AlertCircle,
  Server,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Monitor,
  Apple
} from 'lucide-react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Chip,
  LinearProgress,
  CircularProgress,
  Alert,
  Button
} from '@mui/material';
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
      setHostName((prev) => (prev.includes('Host') ? 'Windows Workstation' : prev));
    } else if (selectedOS === 'linux') {
      setShellTab('bash');
      setHostName((prev) => (prev.includes('Host') || prev.includes('Windows') ? 'Linux Server' : prev));
    } else if (selectedOS === 'macos') {
      setShellTab('bash');
      setHostName((prev) => (prev.includes('Host') || prev.includes('Windows') || prev.includes('Linux') ? 'Mac Workstation' : prev));
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
        setVerifySeconds((s) => {
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

  const serverUrl = (import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/\/$/, '');
  const agentSecret = activeKey || activeAgent?.agent_key || 'YOUR_GENERATED_AGENT_KEY';

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
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '20px',
          backgroundColor: 'var(--bg-card-solid)',
          border: '1px solid var(--border-glass-strong)',
          backgroundImage: 'none',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.45)',
          overflow: 'hidden',
        },
      }}
    >
      {/* Header */}
      <DialogTitle
        sx={{
          p: '20px 24px',
          borderBottom: '1px solid var(--border-glass)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="brand-icon w-10 h-10 rounded-xl bg-gradient-to-br from-brand-teal to-brand-cyan flex items-center justify-center text-white shadow-md">
            <Box size={22} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-theme-main leading-tight">Connect Docker Environment</h3>
            <p className="text-xs text-theme-muted mt-0.5">
              Tenant: <strong className="text-theme-main">{user?.email}</strong> (Tenant ID #{user?.id})
            </p>
          </div>
        </div>
        <Tooltip title="Close" arrow>
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              color: 'var(--text-muted)',
              border: '1px solid var(--border-glass)',
              borderRadius: '8px',
              '&:hover': { color: 'var(--text-main)', backgroundColor: 'var(--bg-hover)' },
            }}
          >
            <X size={18} />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent sx={{ p: '20px 24px' }}>
        {/* Wizard Stepper Bar */}
        <div className="wizard-stepper flex items-center gap-1.5 p-1.5 mb-5 bg-theme-input border border-theme-glass rounded-xl overflow-x-auto">
          <button
            className={`wizard-step-pill flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              currentStep === 'step_a' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'text-theme-muted hover:text-theme-main'
            }`}
            onClick={() => setCurrentStep('step_a')}
          >
            <span className="step-num w-4 h-4 rounded-full bg-white/20 inline-flex items-center justify-center text-[0.65rem]">1</span> Choose OS
          </button>
          <button
            className={`wizard-step-pill flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              currentStep === 'step_b' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'text-theme-muted hover:text-theme-main'
            }`}
            onClick={() => setCurrentStep('step_b')}
          >
            <span className="step-num w-4 h-4 rounded-full bg-white/20 inline-flex items-center justify-center text-[0.65rem]">2</span> Configure
          </button>
          <button
            className={`wizard-step-pill flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !activeAgent ? 'opacity-40 cursor-not-allowed text-theme-muted' : currentStep === 'step_c' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'text-theme-muted hover:text-theme-main cursor-pointer'
            }`}
            onClick={() => activeAgent && setCurrentStep('step_c')}
            disabled={!activeAgent}
          >
            <span className="step-num w-4 h-4 rounded-full bg-white/20 inline-flex items-center justify-center text-[0.65rem]">3</span> Install
          </button>
          <button
            className={`wizard-step-pill flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !activeAgent ? 'opacity-40 cursor-not-allowed text-theme-muted' : currentStep === 'step_d' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'text-theme-muted hover:text-theme-main cursor-pointer'
            }`}
            onClick={() => activeAgent && setCurrentStep('step_d')}
            disabled={!activeAgent}
          >
            <span className="step-num w-4 h-4 rounded-full bg-white/20 inline-flex items-center justify-center text-[0.65rem]">4</span> Verify
          </button>
          <button
            className={`wizard-step-pill flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              !connectionStatus && currentStep !== 'step_e' ? 'opacity-40 cursor-not-allowed text-theme-muted' : currentStep === 'step_e' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'text-theme-muted hover:text-theme-main cursor-pointer'
            }`}
            onClick={() => activeAgent && setCurrentStep('step_e')}
            disabled={!connectionStatus && currentStep !== 'step_e'}
          >
            <span className="step-num w-4 h-4 rounded-full bg-white/20 inline-flex items-center justify-center text-[0.65rem]">5</span> Summary
          </button>
          {agents.length > 0 && (
            <button
              className={`wizard-step-pill ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                currentStep === 'list' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'text-theme-muted hover:text-theme-main'
              }`}
              onClick={() => setCurrentStep('list')}
            >
              Manage Hosts ({agents.length})
            </button>
          )}
        </div>

        {error && (
          <Alert
            severity="error"
            className="mb-4 text-left"
            sx={{
              mb: 2,
              borderRadius: '10px',
              backgroundColor: 'rgba(239, 119, 119, 0.12)',
              border: '1px solid rgba(239, 119, 119, 0.35)',
              color: 'var(--status-critical)',
              '& .MuiAlert-icon': { color: 'var(--status-critical)' },
            }}
          >
            {error}
          </Alert>
        )}

        {/* ============================================================ */}
        {/* SCREEN A — CHOOSE ENVIRONMENT                                */}
        {/* ============================================================ */}
        {currentStep === 'step_a' && (
          <div>
            <h4 className="text-base font-semibold text-theme-main mb-1">Select Your Operating System</h4>
            <p className="text-xs sm:text-sm text-theme-muted mb-4">
              Select the platform hosting your Docker engine. CloudMonitor will tailor the installation commands and socket bindings.
            </p>

            <div className="os-cards-grid grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {/* Windows Card */}
              <div
                className={`os-card p-4 rounded-xl border cursor-pointer transition-all flex flex-col hover:-translate-y-0.5 ${
                  selectedOS === 'windows'
                    ? 'border-brand-cyan bg-brand-cyan/10 ring-2 ring-brand-cyan/35'
                    : 'bg-theme-card border-theme-glass hover:border-theme-glass-strong'
                }`}
                onClick={() => setSelectedOS('windows')}
              >
                <div className="os-card-header flex justify-between items-center mb-3">
                  <Monitor size={26} className="text-brand-cyan" />
                  <Chip label="Verified" size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                </div>
                <h5 className="os-title text-base font-bold text-theme-main mb-1">Windows</h5>
                <p className="os-desc text-xs text-theme-muted mb-3 flex-1 leading-snug">
                  Docker Desktop for Windows 10/11 using WSL2 or Hyper-V backend.
                </p>
                <div className="os-tags flex flex-wrap gap-1.5">
                  <span className="os-tag text-[0.7rem] px-1.5 py-0.5 rounded bg-theme-glass text-theme-subtle border border-theme-glass">Docker Desktop 4+</span>
                  <span className="os-tag text-[0.7rem] px-1.5 py-0.5 rounded bg-theme-glass text-theme-subtle border border-theme-glass">Unix Socket / WSL2</span>
                </div>
              </div>

              {/* Linux Card */}
              <div
                className={`os-card p-4 rounded-xl border cursor-pointer transition-all flex flex-col hover:-translate-y-0.5 ${
                  selectedOS === 'linux'
                    ? 'border-brand-cyan bg-brand-cyan/10 ring-2 ring-brand-cyan/35'
                    : 'bg-theme-card border-theme-glass hover:border-theme-glass-strong'
                }`}
                onClick={() => setSelectedOS('linux')}
              >
                <div className="os-card-header flex justify-between items-center mb-3">
                  <Terminal size={26} className="text-brand-cyan" />
                  <Chip label="Verified" size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                </div>
                <h5 className="os-title text-base font-bold text-theme-main mb-1">Linux</h5>
                <p className="os-desc text-xs text-theme-muted mb-3 flex-1 leading-snug">
                  Native Docker Engine or Docker Desktop on Ubuntu, Debian, RHEL, CentOS.
                </p>
                <div className="os-tags flex flex-wrap gap-1.5">
                  <span className="os-tag text-[0.7rem] px-1.5 py-0.5 rounded bg-theme-glass text-theme-subtle border border-theme-glass">Docker Engine 20.10+</span>
                  <span className="os-tag text-[0.7rem] px-1.5 py-0.5 rounded bg-theme-glass text-theme-subtle border border-theme-glass">/var/run/docker.sock</span>
                </div>
              </div>

              {/* macOS Card */}
              <div
                className={`os-card p-4 rounded-xl border cursor-pointer transition-all flex flex-col hover:-translate-y-0.5 ${
                  selectedOS === 'macos'
                    ? 'border-brand-cyan bg-brand-cyan/10 ring-2 ring-brand-cyan/35'
                    : 'bg-theme-card border-theme-glass hover:border-theme-glass-strong'
                }`}
                onClick={() => setSelectedOS('macos')}
              >
                <div className="os-card-header flex justify-between items-center mb-3">
                  <Apple size={26} className="text-brand-cyan" />
                  <Chip label="Verified" size="small" color="success" sx={{ height: 20, fontSize: '0.65rem' }} />
                </div>
                <h5 className="os-title text-base font-bold text-theme-main mb-1">macOS</h5>
                <p className="os-desc text-xs text-theme-muted mb-3 flex-1 leading-snug">
                  Docker Desktop for macOS on Apple Silicon (M-series) or Intel Macs.
                </p>
                <div className="os-tags flex flex-wrap gap-1.5">
                  <span className="os-tag text-[0.7rem] px-1.5 py-0.5 rounded bg-theme-glass text-theme-subtle border border-theme-glass">Apple Silicon / Intel</span>
                  <span className="os-tag text-[0.7rem] px-1.5 py-0.5 rounded bg-theme-glass text-theme-subtle border border-theme-glass">Docker Desktop 4+</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button className="btn btn-primary px-5 py-2.5 rounded-xl font-semibold flex items-center gap-2 cursor-pointer transition-all" onClick={() => setCurrentStep('step_b')}>
                <span>Continue to Configuration</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN B — CREATE CONNECTION                                 */}
        {/* ============================================================ */}
        {currentStep === 'step_b' && (
          <div>
            <h4 className="text-base font-semibold text-theme-main mb-1">Name Your Docker Host</h4>
            <p className="text-xs sm:text-sm text-theme-muted mb-4">
              Assign a friendly identifier to distinguish this Docker environment in your telemetry dashboard.
            </p>

            <form onSubmit={handleCreateConnection} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-theme-main mb-1.5">Docker Host Name</label>
                <input
                  type="text"
                  className="auth-input w-full py-2.5 px-3.5 rounded-lg border border-theme-glass-strong bg-theme-input text-theme-main text-sm outline-none transition-all focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                  value={hostName}
                  onChange={(e) => setHostName(e.target.value)}
                  placeholder="e.g. Production-EC2-Node or Home-Workstation"
                  required
                />
              </div>

              <div className="info-callout p-3.5 rounded-xl bg-theme-input border border-theme-glass flex items-start gap-3">
                <ShieldCheck size={20} className="text-status-healthy flex-shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-theme-muted">
                  <strong className="text-theme-main block mb-0.5">Automated & Cryptographically Isolated:</strong>
                  Clicking <strong>Install & Connect</strong> creates an isolated host record for Tenant #{user?.id} and generates a unique 256-bit secret key. Only a SHA-256 hash is permanently saved in PostgreSQL.
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button type="button" className="btn px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer" onClick={() => setCurrentStep('step_a')}>
                  <ArrowLeft size={16} /> Back
                </button>
                <button type="submit" className="btn btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer" disabled={enrolling || !hostName.trim()}>
                  {enrolling ? <CircularProgress size={16} color="inherit" /> : <ShieldCheck size={16} />}
                  <span>{enrolling ? 'Generating Credentials...' : 'Install & Connect'}</span>
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
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-base font-semibold text-theme-main">
                  Install Agent on {activeAgent?.name || hostName}
                </h4>
                <p className="text-xs text-theme-muted mt-0.5">
                  Public Server: <code className="bg-theme-glass px-1 py-0.5 rounded text-theme-main font-mono">{serverUrl}</code> • Operating System: <strong className="capitalize text-theme-main">{selectedOS}</strong>
                </p>
              </div>
              <Chip label="Awaiting Execution" size="small" color="warning" sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }} />
            </div>

            {/* Shell Selector Tabs */}
            <div className="tab-pill-group flex gap-1.5 my-3">
              {selectedOS === 'windows' && (
                <>
                  <button
                    className={`tab-pill px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      shellTab === 'powershell' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'bg-theme-input text-theme-muted hover:text-theme-main border border-theme-glass'
                    }`}
                    onClick={() => setShellTab('powershell')}
                  >
                    PowerShell
                  </button>
                  <button
                    className={`tab-pill px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                      shellTab === 'cmd' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'bg-theme-input text-theme-muted hover:text-theme-main border border-theme-glass'
                    }`}
                    onClick={() => setShellTab('cmd')}
                  >
                    Command Prompt (CMD)
                  </button>
                </>
              )}
              {(selectedOS === 'linux' || selectedOS === 'macos') && (
                <button
                  className={`tab-pill px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    shellTab === 'bash' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'bg-theme-input text-theme-muted hover:text-theme-main border border-theme-glass'
                  }`}
                  onClick={() => setShellTab('bash')}
                >
                  Terminal (Bash / Zsh)
                </button>
              )}
              <button
                className={`tab-pill px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  shellTab === 'compose' ? 'active bg-gradient-to-r from-brand-teal to-brand-cyan text-white shadow-sm' : 'bg-theme-input text-theme-muted hover:text-theme-main border border-theme-glass'
                }`}
                onClick={() => setShellTab('compose')}
              >
                Docker Compose
              </button>
            </div>

            {/* Code Box */}
            <div className="code-block-container relative my-3">
              <pre className="code-block bg-[#0B111A] text-[#E2E8F0] p-4 rounded-xl font-mono text-xs overflow-x-auto border border-theme-glass leading-relaxed max-h-[190px]">
                {getCommand()}
              </pre>
              <Tooltip title={copied ? 'Copied to Clipboard!' : 'Copy Command'} arrow>
                <button
                  className="copy-btn absolute top-2.5 right-2.5 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-lg px-2.5 py-1 text-xs font-medium cursor-pointer transition-all"
                  onClick={handleCopy}
                >
                  {copied ? <Check size={14} className="text-status-healthy" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
              </Tooltip>
            </div>

            {/* Security Guardrails Callout */}
            <div className="info-callout p-3 rounded-xl bg-theme-input border border-theme-glass flex items-start gap-3 mb-4">
              <ShieldCheck size={18} className="text-status-healthy flex-shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-theme-muted">
                <strong className="text-theme-main block mb-1">Security & Least-Privilege Design:</strong>
                <ul className="list-disc ml-4 space-y-0.5">
                  <li>Mounts <code className="text-theme-main">/var/run/docker.sock:ro</code> in strict read-only mode.</li>
                  <li>Transmits telemetry over public HTTPS (no SSH tunnels or inbound ports).</li>
                  <li>Strict privacy: never reads container env variables, secrets, or shell commands.</li>
                </ul>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button className="btn px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer" onClick={() => setCurrentStep('step_b')}>
                <ArrowLeft size={16} /> Back
              </button>
              <button className="btn btn-primary px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer" onClick={() => setCurrentStep('step_d')}>
                <span>I've Run the Command / Verify</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* SCREEN D — VERIFY CONNECTION                                 */}
        {/* ============================================================ */}
        {currentStep === 'step_d' && (
          <div>
            <div className="text-center py-3 mb-2">
              <div className="verify-spinner-wrap w-14 h-14 mx-auto rounded-full bg-brand-cyan/15 flex items-center justify-center mb-2">
                <CircularProgress size={30} sx={{ color: 'var(--accent-cyan)' }} />
              </div>
              <h4 className="text-lg font-bold text-theme-main mt-1">Listening for Agent Connection...</h4>
              <p className="text-xs text-theme-muted mt-0.5">
                Target Host: <strong className="text-theme-main">{activeAgent?.name || hostName}</strong> • Polling elapsed: {verifySeconds}s
              </p>
            </div>

            <div className="verification-steps-card flex flex-col gap-2.5 p-3.5 rounded-xl bg-theme-input border border-theme-glass">
              <div className="v-step flex items-start gap-3 p-2 rounded-lg bg-status-healthy/10">
                <CheckCircle2 size={18} className="text-status-healthy flex-shrink-0 mt-0.5" />
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-theme-main">1. Host & Secret Provisioned</span>
                  <span className="text-[0.75rem] text-theme-muted">Tenant isolation validated on PostgreSQL</span>
                </div>
              </div>

              <div className={`v-step flex items-start gap-3 p-2 rounded-lg ${connectionStatus?.last_heartbeat ? 'bg-status-healthy/10' : 'bg-brand-cyan/10 border border-brand-cyan/25'}`}>
                {connectionStatus?.last_heartbeat ? (
                  <CheckCircle2 size={18} className="text-status-healthy flex-shrink-0 mt-0.5" />
                ) : (
                  <CircularProgress size={16} sx={{ color: 'var(--accent-cyan)', mt: 0.5, flexShrink: 0 }} />
                )}
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-theme-main">2. Agent Authentication & Heartbeat</span>
                  <span className="text-[0.75rem] text-theme-muted">
                    {connectionStatus?.last_heartbeat
                      ? `Received heartbeat from ${connectionStatus.hostname || 'agent'} (${connectionStatus.os_info || 'Docker'})`
                      : 'Waiting for agent daemon to deliver initial heartbeat...'}
                  </span>
                </div>
              </div>

              <div className={`v-step flex items-start gap-3 p-2 rounded-lg ${connectionStatus?.container_count > 0 ? 'bg-status-healthy/10' : connectionStatus?.last_heartbeat ? 'bg-brand-cyan/10 border border-brand-cyan/25' : 'opacity-50'}`}>
                {connectionStatus?.container_count > 0 ? (
                  <CheckCircle2 size={18} className="text-status-healthy flex-shrink-0 mt-0.5" />
                ) : connectionStatus?.last_heartbeat ? (
                  <CircularProgress size={16} sx={{ color: 'var(--accent-cyan)', mt: 0.5, flexShrink: 0 }} />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-theme-glass-strong flex-shrink-0 mt-0.5" />
                )}
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-theme-main">3. Container Discovery & Telemetry Ingestion</span>
                  <span className="text-[0.75rem] text-theme-muted">
                    {connectionStatus?.container_count > 0
                      ? `Discovered ${connectionStatus.container_count} container(s) (${connectionStatus.running_count} running)`
                      : 'Awaiting container cgroup metrics payload...'}
                  </span>
                </div>
              </div>
            </div>

            {verifyTimeout && (
              <Alert severity="warning" className="mt-3 text-left" sx={{ borderRadius: '10px' }}>
                <strong className="block">Connection taking longer than expected?</strong>
                Ensure Docker Desktop or Docker Engine is running on your machine, then run the setup command in your terminal.
              </Alert>
            )}

            <div className="flex justify-between items-center mt-5">
              <button className="btn px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer" onClick={() => setCurrentStep('step_c')}>
                <ArrowLeft size={16} /> View Command Again
              </button>
              <button
                className="btn btn-primary px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer"
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
            <div className="text-center py-4 mb-2">
              <div className="w-14 h-14 rounded-full bg-status-healthy/15 text-status-healthy inline-flex items-center justify-center mb-2">
                <CheckCircle2 size={32} />
              </div>
              <h4 className="text-xl font-bold text-theme-main">Docker Host Successfully Connected!</h4>
              <p className="text-xs text-theme-muted mt-1">
                Agent is online and streaming live container metrics to your dashboard.
              </p>
            </div>

            {/* Connected Host Details Card */}
            <div className="glass-panel p-4 rounded-xl border border-theme-glass bg-theme-input mb-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <h5 className="text-base font-bold text-theme-main leading-tight">
                    {connectionStatus?.name || activeAgent?.name}
                  </h5>
                  <span className="text-xs text-theme-muted">
                    Host: {connectionStatus?.hostname || 'Local Node'} • OS: {connectionStatus?.os_info || selectedOS}
                  </span>
                </div>
                <Chip label="ONLINE" size="small" color="success" sx={{ fontWeight: 700, height: 22, fontSize: '0.7rem' }} />
              </div>

              <div className="kpi-grid grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
                <div className="kpi-card p-2.5 rounded-lg bg-theme-card border border-theme-glass">
                  <span className="kpi-label text-xs text-theme-muted">Containers</span>
                  <div className="kpi-value text-base font-bold text-theme-main mt-0.5">
                    {connectionStatus?.container_count || 0}
                  </div>
                  <span className="text-[0.7rem] text-status-healthy">
                    {connectionStatus?.running_count || 0} running
                  </span>
                </div>

                <div className="kpi-card p-2.5 rounded-lg bg-theme-card border border-theme-glass">
                  <span className="kpi-label text-xs text-theme-muted">Docker Engine</span>
                  <div className="kpi-value text-base font-bold text-theme-main mt-0.5">
                    {connectionStatus?.docker_version || 'v27+'}
                  </div>
                  <span className="text-[0.7rem] text-theme-muted">Socket IPC</span>
                </div>

                <div className="kpi-card p-2.5 rounded-lg bg-theme-card border border-theme-glass">
                  <span className="kpi-label text-xs text-theme-muted">Agent Version</span>
                  <div className="kpi-value text-base font-bold text-theme-main mt-0.5">
                    v{connectionStatus?.agent_version || '1.1.0'}
                  </div>
                  <span className="text-[0.7rem] text-brand-cyan">Active Daemon</span>
                </div>

                <div className="kpi-card p-2.5 rounded-lg bg-theme-card border border-theme-glass">
                  <span className="kpi-label text-xs text-theme-muted">Total CPU</span>
                  <div className="kpi-value text-base font-bold text-theme-main mt-0.5">
                    {(connectionStatus?.total_cpu_percent || 0).toFixed(1)}%
                  </div>
                  <span className="text-[0.7rem] text-theme-muted">Aggregated</span>
                </div>
              </div>

              <div className="text-[0.75rem] text-theme-muted flex justify-between">
                <span>Last Heartbeat: {connectionStatus?.last_heartbeat ? new Date(connectionStatus.last_heartbeat).toLocaleTimeString() : 'Just now'}</span>
                <span>Auto-Restart: enabled (unless-stopped)</span>
              </div>
            </div>

            {/* 4 Functional Action Buttons */}
            <div className="wizard-actions-grid grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                className="btn btn-primary py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                onClick={() => {
                  if (onSelectHostMetrics) {
                    onSelectHostMetrics(activeAgent?.id || connectionStatus?.agent_id);
                  }
                  onClose();
                }}
              >
                <Server size={14} /> View Metrics
              </button>

              <button
                className="btn py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                onClick={() => setCurrentStep('step_c')}
              >
                <RefreshCw size={14} /> Reconnect
              </button>

              <button
                className="btn py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                onClick={() => setConfirmRotate(activeAgent || connectionStatus)}
              >
                <KeyRound size={14} /> Rotate Key
              </button>

              <button
                className="btn btn-danger py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                onClick={() => setConfirmDisconnect(activeAgent || connectionStatus)}
              >
                <Trash2 size={14} /> Disconnect
              </button>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* MANAGE ENROLLED HOSTS LIST                                   */}
        {/* ============================================================ */}
        {currentStep === 'list' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-base font-semibold text-theme-main">Enrolled Docker Hosts ({agents.length})</h4>
                <p className="text-xs text-theme-muted">
                  Manage credentials, inspect connectivity status, and disconnect hosts.
                </p>
              </div>
              <button className="btn btn-primary px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer" onClick={() => setCurrentStep('step_a')}>
                + Connect Another Host
              </button>
            </div>

            <div className="data-table-wrap max-h-[280px] overflow-y-auto rounded-xl border border-theme-glass">
              <table className="data-table w-full">
                <thead>
                  <tr className="bg-theme-card text-xs text-theme-muted uppercase">
                    <th className="p-3 text-left">Host Name</th>
                    <th className="p-3 text-left">Platform</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Containers</th>
                    <th className="p-3 text-left">Last Heartbeat</th>
                    <th className="p-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-glass text-xs">
                  {agents.map((ag) => (
                    <tr key={ag.id} className="hover:bg-theme-card-hover transition-colors">
                      <td className="p-3 font-semibold text-theme-main">{ag.name}</td>
                      <td className="p-3 capitalize text-theme-muted">{ag.os_type || 'linux'}</td>
                      <td className="p-3">
                        <Chip
                          label={ag.is_revoked ? 'REVOKED' : ag.status.toUpperCase()}
                          size="small"
                          color={ag.status === 'online' ? 'success' : ag.is_revoked ? 'error' : 'warning'}
                          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
                        />
                      </td>
                      <td className="p-3 text-theme-main">{ag.container_count || 0}</td>
                      <td className="p-3 font-mono text-theme-muted">
                        {ag.last_heartbeat ? new Date(ag.last_heartbeat).toLocaleTimeString() : 'Awaiting'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1.5">
                          {!ag.is_revoked && (
                            <>
                              <Tooltip title="View Setup Command" arrow>
                                <button
                                  className="btn py-1 px-2 text-xs rounded-md cursor-pointer"
                                  onClick={() => {
                                    setActiveAgent(ag);
                                    setCurrentStep('step_c');
                                  }}
                                >
                                  Reconnect
                                </button>
                              </Tooltip>
                              <Tooltip title="Rotate Credential" arrow>
                                <button
                                  className="btn py-1 px-2 text-xs rounded-md cursor-pointer"
                                  onClick={() => setConfirmRotate(ag)}
                                >
                                  Rotate
                                </button>
                              </Tooltip>
                            </>
                          )}
                          <Tooltip title="Disconnect Host" arrow>
                            <button
                              className="btn btn-danger py-1 px-2 text-xs rounded-md cursor-pointer text-status-critical"
                              onClick={() => setConfirmDisconnect(ag)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </Tooltip>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>

      <DialogActions sx={{ p: '16px 24px', borderTop: '1px solid var(--border-glass)' }}>
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            borderRadius: '10px',
            color: 'var(--text-main)',
            borderColor: 'var(--border-glass)',
            '&:hover': { borderColor: 'var(--border-glass-strong)', backgroundColor: 'var(--bg-hover)' },
          }}
        >
          Close
        </Button>
      </DialogActions>

      {/* Confirmation Sub-Modal: Rotate Credential via MUI Dialog */}
      <Dialog
        open={Boolean(confirmRotate)}
        onClose={() => setConfirmRotate(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            backgroundColor: 'var(--bg-card-solid)',
            border: '1px solid var(--border-glass-strong)',
            backgroundImage: 'none',
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>
          Rotate Credential for "{confirmRotate?.name}"?
        </DialogTitle>
        <DialogContent>
          <p className="text-xs text-theme-muted leading-relaxed">
            Rotating the credential will immediately invalidate the current agent key. The existing agent on that host will stop sending metrics until restarted with the newly generated key.
          </p>
        </DialogContent>
        <DialogActions sx={{ p: '12px 16px' }}>
          <Button onClick={() => setConfirmRotate(null)} disabled={actionLoading} sx={{ color: 'var(--text-muted)' }}>
            Cancel
          </Button>
          <Button
            onClick={() => handleRotateKey(confirmRotate)}
            disabled={actionLoading}
            variant="contained"
            color="primary"
          >
            {actionLoading ? 'Rotating...' : 'Confirm Rotation'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirmation Sub-Modal: Disconnect Host via MUI Dialog */}
      <Dialog
        open={Boolean(confirmDisconnect)}
        onClose={() => setConfirmDisconnect(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '16px',
            backgroundColor: 'var(--bg-card-solid)',
            border: '1px solid var(--border-glass-strong)',
            backgroundImage: 'none',
            p: 1,
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--status-critical)' }}>
          Disconnect "{confirmDisconnect?.name}"?
        </DialogTitle>
        <DialogContent>
          <p className="text-xs text-theme-muted leading-relaxed">
            Are you sure you want to disconnect this Docker host? The agent will be revoked and barred from transmitting metrics to your account.
          </p>
        </DialogContent>
        <DialogActions sx={{ p: '12px 16px' }}>
          <Button onClick={() => setConfirmDisconnect(null)} disabled={actionLoading} sx={{ color: 'var(--text-muted)' }}>
            Cancel
          </Button>
          <Button
            onClick={() => handleDisconnect(confirmDisconnect.id, true)}
            disabled={actionLoading}
            variant="contained"
            color="error"
          >
            {actionLoading ? 'Disconnecting...' : 'Disconnect & Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
