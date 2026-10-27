import React, { useState } from 'react';
import { Activity, Lock, Mail, ArrowRight, ShieldCheck, CheckCircle2, AlertCircle, Sun, Moon, Info } from 'lucide-react';
import { api } from '../api';

export default function AuthScreen({ onAuthSuccess, sessionExpired = false, currentTheme, onToggleTheme }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(sessionExpired ? 'Your session has expired. Please sign in again.' : null);
  const [successMsg, setSuccessMsg] = useState(null);

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
        // 1. Register new user
        await api.register(trimmedEmail, password);
        setSuccessMsg('Account created successfully! Authenticating...');
        // 2. Automatically log in
        await api.login(trimmedEmail, password);
      } else {
        // Direct login
        await api.login(trimmedEmail, password);
      }

      // 3. Fetch authenticated user profile
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
    <div className="auth-page-container">
      {/* Top right theme toggle */}
      <div className="auth-top-bar">
        <button
          className="theme-toggle-btn"
          onClick={onToggleTheme}
          title={`Switch to ${currentTheme === 'light' ? 'Dark' : 'Light'} Mode`}
        >
          {currentTheme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      </div>

      <div className="auth-card-wrapper">
        <div className="glass-panel auth-card">
          {/* Brand header */}
          <div className="auth-brand">
            <div className="brand-icon" style={{ width: '48px', height: '48px', margin: '0 auto 12px' }}>
              <Activity size={26} />
            </div>
            <h1 className="auth-title">CloudMonitor</h1>
            <p className="auth-subtitle">
              {mode === 'login'
                ? 'Sign in to access your container observability workspace'
                : 'Create an account to monitor your Docker infrastructure'}
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="auth-tab-switch">
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); setError(null); }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); setError(null); }}
            >
              Create Account
            </button>
          </div>

          {/* Alerts */}
          {error && (
            <div className="status-banner error" style={{ marginBottom: '16px' }}>
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="status-banner success" style={{ marginBottom: '16px' }}>
              <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label className="form-label" htmlFor="auth-email">
                Email Address
              </label>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="admin@cloudmonitor.com"
                  className="auth-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="auth-password">
                Password
              </label>
              <div className="input-wrapper">
                <Lock size={18} className="input-icon" />
                <input
                  id="auth-password"
                  type="password"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder="••••••••"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              {mode === 'register' && (
                <span className="form-hint">At least 8 characters required.</span>
              )}
            </div>

            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label" htmlFor="auth-confirm-password">
                  Confirm Password
                </label>
                <div className="input-wrapper">
                  <Lock size={18} className="input-icon" />
                  <input
                    id="auth-confirm-password"
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="auth-input"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary auth-submit-btn"
              disabled={loading}
            >
              <span>{loading ? 'Processing...' : mode === 'login' ? 'Sign In' : 'Create Account'}</span>
              {!loading && <ArrowRight size={18} />}
            </button>
          </form>

          {/* Footer switch prompt */}
          <div className="auth-footer-prompt">
            {mode === 'login' ? (
              <span>
                Don't have an account?{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => { setMode('register'); setError(null); }}
                >
                  Create one now
                </button>
              </span>
            ) : (
              <span>
                Already have an account?{' '}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => { setMode('login'); setError(null); }}
                >
                  Sign in
                </button>
              </span>
            )}
          </div>
        </div>

        {/* Feature Badges below login card */}
        <div className="auth-feature-row">
          <div className="feature-pill">
            <ShieldCheck size={16} />
            <span>JWT Isolated Tenancy</span>
          </div>
          <div className="feature-pill">
            <Activity size={16} />
            <span>Real-Time Telemetry</span>
          </div>
          <div className="feature-pill">
            <Info size={16} />
            <span>SRE Failure Testing</span>
          </div>
        </div>
      </div>
    </div>
  );
}
