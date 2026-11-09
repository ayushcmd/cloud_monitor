import React, { useState } from 'react';
import { Activity, Lock, Mail, ArrowRight, ShieldCheck, Sun, Moon, Info } from 'lucide-react';
import { Alert, CircularProgress, Tooltip, IconButton, Chip } from '@mui/material';
import { api } from '../api';
import PasswordToggleButton from './PasswordToggleButton';

export default function AuthScreen({ onAuthSuccess, sessionExpired = false, currentTheme, onToggleTheme }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(sessionExpired ? 'Your session has expired. Please sign in again.' : null);
  const [successMsg, setSuccessMsg] = useState(null);

  const switchMode = (newMode) => {
    setMode(newMode);
    setError(null);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    if (mode === 'register') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }
    }

    setLoading(true);

    try {
      if (mode === 'register') {
        await api.register(trimmedEmail, password);
        setSuccessMsg('Account created successfully! Authenticating...');
        await api.login(trimmedEmail, password);
      } else {
        await api.login(trimmedEmail, password);
      }

      const userProfile = await api.getMe();
      if (onAuthSuccess) {
        onAuthSuccess(userProfile);
      }
    } catch (err) {
      setError(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-container flex flex-col justify-center items-center min-h-screen p-6 relative">
      {/* Top right theme toggle with MUI Tooltip */}
      <div className="auth-top-bar absolute top-6 right-7">
        <Tooltip title={`Switch to ${currentTheme === 'light' ? 'Dark' : 'Light'} Mode`} arrow>
          <IconButton
            className="theme-toggle-btn w-10 h-10 rounded-xl border border-theme-glass bg-theme-card text-theme-main shadow-sm hover:bg-theme-card-hover transition-all"
            onClick={onToggleTheme}
            sx={{
              border: '1px solid var(--border-glass)',
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-main)',
              borderRadius: '12px',
              '&:hover': {
                backgroundColor: 'var(--bg-card-hover)',
              }
            }}
          >
            {currentTheme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </IconButton>
        </Tooltip>
      </div>

      <div className="auth-card-wrapper max-w-[440px] w-full">
        <div className="glass-panel auth-card p-8 sm:p-9 text-center rounded-2xl shadow-xl border border-theme-glass bg-theme-card backdrop-blur-md">
          {/* Brand header */}
          <div className="auth-brand mb-6 text-center">
            <div className="brand-icon w-12 h-12 rounded-xl mx-auto mb-3.5 bg-gradient-to-br from-brand-teal to-brand-cyan flex items-center justify-center text-white shadow-lg shadow-teal-500/20">
              <Activity size={26} />
            </div>
            <h1 className="auth-title text-2xl font-bold tracking-tight text-theme-main">CloudMonitor</h1>
            <p className="auth-subtitle text-sm text-theme-muted mt-1 leading-relaxed">
              {mode === 'login'
                ? 'Sign in to access your container observability workspace'
                : 'Create an account to monitor your Docker infrastructure'}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="auth-tab-switch flex p-1 rounded-xl bg-theme-input border border-theme-glass mb-5">
            <button
              type="button"
              className={`auth-tab-btn flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                mode === 'login'
                  ? 'bg-theme-card-solid text-theme-main shadow-sm'
                  : 'text-theme-muted hover:text-theme-main'
              }`}
              onClick={() => switchMode('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab-btn flex-1 py-2 px-3 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
                mode === 'register'
                  ? 'bg-theme-card-solid text-theme-main shadow-sm'
                  : 'text-theme-muted hover:text-theme-main'
              }`}
              onClick={() => switchMode('register')}
            >
              Create Account
            </button>
          </div>

          {/* Alerts via MUI Alert */}
          {error && (
            <Alert
              severity="error"
              className="mb-4 text-left"
              sx={{
                mb: 2,
                borderRadius: '10px',
                fontSize: '0.8125rem',
                backgroundColor: 'rgba(239, 119, 119, 0.12)',
                border: '1px solid rgba(239, 119, 119, 0.35)',
                color: 'var(--status-critical)',
                '& .MuiAlert-icon': { color: 'var(--status-critical)' }
              }}
            >
              {error}
            </Alert>
          )}

          {successMsg && (
            <Alert
              severity="success"
              className="mb-4 text-left"
              sx={{
                mb: 2,
                borderRadius: '10px',
                fontSize: '0.8125rem',
                backgroundColor: 'rgba(34, 184, 160, 0.12)',
                border: '1px solid rgba(34, 184, 160, 0.35)',
                color: 'var(--status-healthy)',
                '& .MuiAlert-icon': { color: 'var(--status-healthy)' }
              }}
            >
              {successMsg}
            </Alert>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form flex flex-col gap-4 text-left">
            <div className="form-group flex flex-col">
              <label className="form-label text-xs font-semibold text-theme-main mb-1.5" htmlFor="auth-email">
                Email Address
              </label>
              <div className="input-wrapper relative flex items-center">
                <Mail size={18} className="input-icon absolute left-3.5 text-theme-subtle pointer-events-none" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@cloudmonitor.com"
                  className="auth-input w-full py-2.5 pr-3.5 pl-11 rounded-lg border border-theme-glass-strong bg-theme-input text-theme-main text-sm outline-none transition-all focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group flex flex-col">
              <label className="form-label text-xs font-semibold text-theme-main mb-1.5" htmlFor="auth-password">
                Password
              </label>
              <div className="input-wrapper relative flex items-center">
                <Lock size={18} className="input-icon absolute left-3.5 text-theme-subtle pointer-events-none" />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  className="auth-input w-full py-2.5 pr-11 pl-11 rounded-lg border border-theme-glass-strong bg-theme-input text-theme-main text-sm outline-none transition-all focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
                <PasswordToggleButton
                  isVisible={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  disabled={loading}
                />
              </div>
              {mode === 'register' && (
                <span className="form-hint text-xs text-theme-muted mt-1">At least 8 characters required.</span>
              )}
            </div>

            {mode === 'register' && (
              <div className="form-group flex flex-col">
                <label className="form-label text-xs font-semibold text-theme-main mb-1.5" htmlFor="auth-confirm-password">
                  Confirm Password
                </label>
                <div className="input-wrapper relative flex items-center">
                  <Lock size={18} className="input-icon absolute left-3.5 text-theme-subtle pointer-events-none" />
                  <input
                    id="auth-confirm-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="auth-input w-full py-2.5 pr-11 pl-11 rounded-lg border border-theme-glass-strong bg-theme-input text-theme-main text-sm outline-none transition-all focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                  <PasswordToggleButton
                    isVisible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword((prev) => !prev)}
                    label="confirm password"
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary auth-submit-btn w-full py-3 mt-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer transition-all"
              disabled={loading}
            >
              {loading ? (
                <>
                  <CircularProgress size={18} color="inherit" thickness={4} />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          {/* Footer switch prompt */}
          <div className="auth-footer-prompt mt-5 text-xs text-theme-muted">
            {mode === 'login' ? (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  className="link-btn text-brand-teal hover:text-brand-cyan font-semibold underline ml-1 cursor-pointer"
                  onClick={() => switchMode('register')}
                >
                  Create one now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  className="link-btn text-brand-teal hover:text-brand-cyan font-semibold underline ml-1 cursor-pointer"
                  onClick={() => switchMode('login')}
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Feature Badges below login card using MUI Chip with Tailwind layout */}
        <div className="auth-feature-row flex justify-center gap-2.5 mt-6 flex-wrap">
          <Chip
            icon={<ShieldCheck size={16} />}
            label="JWT Isolated Tenancy"
            size="small"
            sx={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-glass)',
              fontWeight: 500,
              fontSize: '0.75rem',
              py: 1.5,
              '& .MuiChip-icon': { color: 'var(--accent-teal)' }
            }}
          />
          <Chip
            icon={<Activity size={16} />}
            label="Real-Time Telemetry"
            size="small"
            sx={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-glass)',
              fontWeight: 500,
              fontSize: '0.75rem',
              py: 1.5,
              '& .MuiChip-icon': { color: 'var(--accent-cyan)' }
            }}
          />
          <Chip
            icon={<Info size={16} />}
            label="SRE Failure Testing"
            size="small"
            sx={{
              backgroundColor: 'var(--bg-card)',
              color: 'var(--text-muted)',
              border: '1px solid var(--border-glass)',
              fontWeight: 500,
              fontSize: '0.75rem',
              py: 1.5,
              '& .MuiChip-icon': { color: 'var(--status-warning)' }
            }}
          />
        </div>
      </div>
    </div>
  );
}
