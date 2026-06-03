import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { User } from '../../contexts/AppContext';
import { API_BASE } from '../../config';

interface AuthShellProps {
  onLoginSuccess: (token: string, user: User) => void;
}

type Mode = 'login' | 'register' | 'forgot_code';
type LoginMethod = 'password' | 'code';

// Eye icon SVGs
const EyeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export function AuthShell({ onLoginSuccess }: AuthShellProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password');

  // Input states
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  // Password retrieval & reset
  const [forgotNewPwd, setForgotNewPwd] = useState('');

  // Per-field password visibility
  const [showLoginPwd, setShowLoginPwd] = useState(false);
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [showForgotPwd, setShowForgotPwd] = useState(false);

  // Status states
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');

  // QR Login states
  const [qrState, setQrState] = useState<'loading' | 'active' | 'scanned' | 'confirmed' | 'expired'>('loading');
  const [qrUuid, setQrUuid] = useState('');
  const [qrUrl, setQrUrl] = useState('');

  const clearError = () => setError('');

  const fetchQRCode = async () => {
    if (mode !== 'login') return;
    setQrState('loading');
    try {
      const res = await fetch(`${API_BASE}/api/auth/qr/uuid`, { method: 'POST' });
      const body = await res.json();
      if (res.ok && body.data) {
        setQrUuid(body.data.uuid);
        setQrUrl(body.data.qr_url);
        setQrState('active');
      } else {
        setQrState('expired');
      }
    } catch {
      setQrState('expired');
    }
  };

  useEffect(() => {
    if (mode === 'login') {
      fetchQRCode();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== 'login' || !qrUuid || qrState === 'confirmed' || qrState === 'expired') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/auth/qr/status?uuid=${qrUuid}`);
        if (!res.ok) {
          setQrState('expired');
          clearInterval(interval);
          return;
        }
        const body = await res.json();
        if (body.data) {
          const status = body.data.status;
          if (status === 'scanned') {
            setQrState('scanned');
          } else if (status === 'confirmed' && body.data.token && body.data.user) {
            setQrState('confirmed');
            clearInterval(interval);
            onLoginSuccess(body.data.token, body.data.user);
          } else if (status === 'expired') {
            setQrState('expired');
            clearInterval(interval);
          }
        }
      } catch {
        // ignore errors during polling
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [qrUuid, qrState, mode]);


  // Countdown timer effect
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendCode = async (purpose: 'register' | 'login' | 'reset', targetEmail: string) => {
    if (!targetEmail.trim()) {
      setError('请输入电子邮箱');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(targetEmail)) {
      setError('请输入合法的电子邮箱地址');
      return;
    }

    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail.trim(), purpose }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '发送验证码失败');
        return;
      }
      setCountdown(60);
    } catch {
      setError('网络异常，发送验证码失败');
    } finally {
      setSending(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (loginMethod === 'password') {
      if (!username.trim() || !password.trim()) {
        setError('请填写用户名或邮箱以及密码');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: username.trim(), password }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || '登录失败');
          return;
        }
        onLoginSuccess(data.token, data.user);
      } catch {
        setError('网络错误，请稍后重试');
      } finally {
        setLoading(false);
      }
    } else {
      if (!email.trim() || !code.trim()) {
        setError('请填写邮箱和验证码');
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/auth/login-code`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim(), code: code.trim() }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || '登录失败');
          return;
        }
        onLoginSuccess(data.token, data.user);
      } catch {
        setError('网络错误，请稍后重试');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || !email.trim() || !code.trim()) {
      setError('请填写所有必要注册字段');
      return;
    }
    if (password.length < 6) {
      setError('密码长度不能少于6位');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          nickname: nickname.trim(),
          email: email.trim(),
          code: code.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '注册失败');
        return;
      }
      onLoginSuccess(data.token, data.user);
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !code.trim() || !forgotNewPwd.trim()) {
      setError('请填写所有必填字段');
      return;
    }
    if (forgotNewPwd.length < 6) {
      setError('新密码不能少于6位');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          code: code.trim(),
          new_password: forgotNewPwd,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '重置密码失败');
        return;
      }
      alert('密码重置成功，请重新登录！');
      switchMode('login');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    clearError();
    setCode('');
    setConfirmPassword('');
    setCountdown(0);
    setShowLoginPwd(false);
    setShowRegPwd(false);
    setShowRegConfirm(false);
    setShowForgotPwd(false);
  };

  return (
    <div className="auth-container">
      <style>{`
        .auth-container {
          height: 100%;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 10% 20%, var(--hover) 0%, var(--bg-paper) 90%);
          padding: 24px;
        }
        .auth-card {
          width: 100%;
          max-width: 380px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.04);
          padding: 36px 28px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        [data-theme="dark"] .auth-card {
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
        }
        .auth-logo-area {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }
        .auth-logo-icon {
          width: 40px;
          height: 40px;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));
        }
        .auth-header {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .auth-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
          text-align: center;
        }
        .auth-subtitle {
          font-size: 12px;
          color: var(--text-dim);
          text-align: center;
        }
        .auth-error {
          padding: 10px 14px;
          background: rgba(232, 122, 94, 0.08);
          border: 1px solid rgba(232, 122, 94, 0.2);
          color: var(--badge-unread);
          font-size: 13px;
          border-radius: 10px;
          text-align: center;
          animation: errorShake 0.4s ease;
        }
        .auth-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .auth-input-wrapper {
          position: relative;
        }
        .auth-input-wrapper input {
          width: 100%;
          padding: 11px 44px 11px 16px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg-paper);
          color: var(--text);
          font-size: 14px;
          transition: all 0.2s ease;
        }
        .auth-input-wrapper input[data-plain] {
          padding-right: 16px;
        }
        .auth-input-wrapper input:focus {
          border-color: var(--brand-blue);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(44, 95, 138, 0.15);
        }
        [data-theme="dark"] .auth-input-wrapper input:focus {
          box-shadow: 0 0 0 3px rgba(74, 129, 173, 0.2);
        }
        .auth-eye-btn {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          color: var(--text-dim);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          border-radius: 6px;
          transition: color 0.15s;
          line-height: 0;
        }
        .auth-eye-btn:hover { color: var(--text); }
        .auth-tab-group {
          display: flex;
          border-bottom: 1.5px solid var(--border);
          margin-bottom: 8px;
        }
        .auth-tab-btn {
          flex: 1;
          background: none;
          border: none;
          color: var(--text-dim);
          padding: 10px 0;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          position: relative;
          transition: color 0.2s;
        }
        .auth-tab-btn.active {
          color: var(--brand-blue);
        }
        [data-theme="dark"] .auth-tab-btn.active {
          color: var(--brand-yellow);
        }
        .auth-tab-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1.5px;
          left: 0;
          width: 100%;
          height: 2px;
          background: var(--brand-blue);
        }
        [data-theme="dark"] .auth-tab-btn.active::after {
          background: var(--brand-yellow);
        }
        .auth-code-wrapper {
          display: flex;
          gap: 10px;
        }
        .auth-code-wrapper input {
          flex: 1;
        }
        .auth-getcode-btn {
          padding: 11px 16px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          background: var(--hover);
          color: var(--text);
          border: 1px solid var(--border);
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
          min-width: 100px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .auth-getcode-btn:hover:not(:disabled) {
          background: var(--border);
          border-color: var(--text-dim);
        }
        .auth-getcode-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .auth-btn {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.5px;
          background: var(--brand-blue);
          color: #FFFFFF;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border: none;
          cursor: pointer;
        }
        [data-theme="dark"] .auth-btn {
          color: #1B1915;
          background: var(--brand-yellow);
        }
        .auth-btn:hover {
          opacity: 0.9;
          transform: translateY(-1px);
        }
        .auth-btn:active {
          transform: translateY(1px);
        }
        .auth-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }
        .auth-footer {
          display: flex;
          justify-content: center;
          gap: 16px;
          font-size: 13px;
          margin-top: 8px;
        }
        .auth-link-btn {
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 13px;
          cursor: pointer;
          transition: color 0.2s;
          padding: 4px;
        }
        .auth-link-btn:hover {
          color: var(--brand-blue);
          text-decoration: underline;
        }
        [data-theme="dark"] .auth-link-btn:hover {
          color: var(--brand-yellow);
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes errorShake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .auth-card.login-mode {
          max-width: 660px;
        }
        .auth-login-split {
          display: flex;
          gap: 28px;
          width: 100%;
        }
        .auth-form-side {
          flex: 1.2;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .auth-qr-side {
          flex: 0.8;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding-left: 28px;
          border-left: 1px solid var(--border);
          gap: 12px;
        }
        .qr-container-box {
          width: 160px;
          height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: #ffffff;
          padding: 8px;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
        }
        .qr-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.92);
          backdrop-filter: blur(2px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          color: #333333;
          font-size: 12px;
          font-weight: 600;
          text-align: center;
          padding: 8px;
          cursor: pointer;
        }
        .qr-overlay-success {
          background: rgba(255, 255, 255, 0.95);
          color: #2e7d32;
        }
        .qr-hint-text {
          font-size: 12px;
          color: var(--text-dim);
          text-align: center;
          margin-top: 4px;
        }
        .qr-success-tick {
          font-size: 32px;
          color: #4caf50;
          margin-bottom: 4px;
        }
        .qr-expired-icon {
          font-size: 24px;
          color: #f44336;
          margin-bottom: 4px;
        }
        @media (max-width: 600px) {
          .auth-card.login-mode {
            max-width: 380px;
          }
          .auth-login-split {
            flex-direction: column;
          }
          .auth-qr-side {
            border-left: none;
            border-top: 1px solid var(--border);
            padding-left: 0;
            padding-top: 20px;
            width: 100%;
          }
        }
      `}</style>

      <div className={`auth-card ${mode === 'login' ? 'login-mode' : ''}`}>
        {/* Brandy Logo */}
        <div className="auth-logo-area">
          <img src="/favicon.svg" alt="Brandy" className="auth-logo-icon" />
        </div>

        {/* Header */}
        <div className="auth-header">
          <div className="auth-title">
            {mode === 'login' && '登录 Brandy'}
            {mode === 'register' && '创建新账号'}
            {mode === 'forgot_code' && '重置账户密码'}
          </div>
          <div className="auth-subtitle">
            {mode === 'register' && '通过电子邮箱保障您的账户安全'}
            {mode === 'forgot_code' && '使用邮箱验证码重置您的密码'}
          </div>
        </div>

        {/* Error Notification */}
        {error && <div className="auth-error">{error}</div>}

        {/* LOGIN MODE */}
        {mode === 'login' && (
          <div className="auth-login-split">
            <form onSubmit={handleLogin} className="auth-form auth-form-side">
              <div className="auth-tab-group">
                <button
                  type="button"
                  className={`auth-tab-btn ${loginMethod === 'password' ? 'active' : ''}`}
                  onClick={() => { setLoginMethod('password'); clearError(); }}
                >
                  密码登录
                </button>
                <button
                  type="button"
                  className={`auth-tab-btn ${loginMethod === 'code' ? 'active' : ''}`}
                  onClick={() => { setLoginMethod('code'); clearError(); }}
                >
                  验证码登录
                </button>
              </div>

              {loginMethod === 'password' ? (
                <>
                  <div className="auth-input-wrapper">
                    <input
                      type="text"
                      placeholder="用户名 或 电子邮箱"
                      value={username}
                      onChange={e => { setUsername(e.target.value); clearError(); }}
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                  <div className="auth-input-wrapper">
                    <input
                      type={showLoginPwd ? 'text' : 'password'}
                      placeholder="密码"
                      value={password}
                      onChange={e => { setPassword(e.target.value); clearError(); }}
                      disabled={loading}
                    />
                    <button type="button" className="auth-eye-btn" tabIndex={-1} onClick={() => setShowLoginPwd(v => !v)}>
                      {showLoginPwd ? <EyeOffIcon /> : <EyeIcon />}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="auth-input-wrapper">
                    <input
                      type="text"
                      placeholder="电子邮箱"
                      value={email}
                      onChange={e => { setEmail(e.target.value); clearError(); }}
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                  <div className="auth-code-wrapper">
                    <div className="auth-input-wrapper" style={{ flex: 1 }}>
                      <input
                        type="text"
                        placeholder="6位验证码"
                        value={code}
                        onChange={e => { setCode(e.target.value); clearError(); }}
                        maxLength={6}
                        disabled={loading}
                      />
                    </div>
                    <button
                      type="button"
                      className="auth-getcode-btn"
                      disabled={loading || sending || countdown > 0}
                      onClick={() => handleSendCode('login', email)}
                    >
                      {countdown > 0 ? `${countdown}s` : sending ? '发送中...' : '获取验证码'}
                    </button>
                  </div>
                </>
              )}

              <button type="submit" className="auth-btn" disabled={loading}>
                {loading ? '正在登录...' : '登录'}
              </button>
              <div className="auth-footer">
                <button type="button" className="auth-link-btn" onClick={() => switchMode('register')}>注册账号</button>
                <button type="button" className="auth-link-btn" onClick={() => switchMode('forgot_code')}>忘记密码</button>
              </div>
            </form>

            <div className="auth-qr-side">
              <div className="qr-container-box">
                {qrState === 'loading' && <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>加载中...</div>}
                
                {qrState === 'active' && qrUrl && (
                  <QRCodeSVG value={qrUrl} size={144} />
                )}

                {qrState === 'scanned' && (
                  <>
                    <QRCodeSVG value={qrUrl} size={144} style={{ opacity: 0.15 }} />
                    <div className="qr-overlay qr-overlay-scanned">
                      <span className="qr-success-tick">✓</span>
                      <span>已扫描</span>
                      <span style={{ fontSize: '10px', color: '#666666', marginTop: '2px' }}>请在手机端确认</span>
                    </div>
                  </>
                )}

                {qrState === 'confirmed' && (
                  <div className="qr-overlay qr-overlay-success">
                    <span className="qr-success-tick">✓</span>
                    <span>登录成功</span>
                  </div>
                )}

                {qrState === 'expired' && (
                  <div className="qr-overlay" onClick={fetchQRCode}>
                    <span className="qr-expired-icon">↻</span>
                    <span>二维码已失效</span>
                    <span style={{ fontSize: '10px', color: '#888888', marginTop: '2px' }}>点击刷新</span>
                  </div>
                )}
              </div>
              <div className="qr-hint-text">
                使用 Brandy 手机端<strong>扫一扫</strong>登录
              </div>
            </div>
          </div>
        )}

        {/* REGISTER MODE */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="auth-input-wrapper">
              <input
                type="text"
                placeholder="用户名 (用于登录/唯一标识)"
                value={username}
                onChange={e => { setUsername(e.target.value); clearError(); }}
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="auth-input-wrapper">
              <input
                type="text"
                placeholder="个性昵称"
                value={nickname}
                onChange={e => { setNickname(e.target.value); clearError(); }}
                disabled={loading}
              />
            </div>
            <div className="auth-input-wrapper">
              <input
                type="text"
                placeholder="电子邮箱"
                value={email}
                onChange={e => { setEmail(e.target.value); clearError(); }}
                disabled={loading}
              />
            </div>
            <div className="auth-code-wrapper">
              <div className="auth-input-wrapper" style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="6位验证码"
                  value={code}
                  onChange={e => { setCode(e.target.value); clearError(); }}
                  maxLength={6}
                  disabled={loading}
                />
              </div>
              <button
                type="button"
                className="auth-getcode-btn"
                disabled={loading || sending || countdown > 0}
                onClick={() => handleSendCode('register', email)}
              >
                {countdown > 0 ? `${countdown}s` : sending ? '发送中...' : '获取验证码'}
              </button>
            </div>
            <div className="auth-input-wrapper">
              <input
                type={showRegPwd ? 'text' : 'password'}
                placeholder="设置密码 (至少 6 位)"
                value={password}
                onChange={e => { setPassword(e.target.value); clearError(); }}
                disabled={loading}
              />
              <button type="button" className="auth-eye-btn" tabIndex={-1} onClick={() => setShowRegPwd(v => !v)}>
                {showRegPwd ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <div className="auth-input-wrapper">
              <input
                type={showRegConfirm ? 'text' : 'password'}
                placeholder="确认密码"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); clearError(); }}
                disabled={loading}
              />
              <button type="button" className="auth-eye-btn" tabIndex={-1} onClick={() => setShowRegConfirm(v => !v)}>
                {showRegConfirm ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '正在注册...' : '立即注册'}
            </button>
            <div className="auth-footer">
              <button type="button" className="auth-link-btn" onClick={() => switchMode('login')}>已有账号？返回登录</button>
            </div>
          </form>
        )}

        {/* FORGOT PASSWORD MODE */}
        {mode === 'forgot_code' && (
          <form onSubmit={handleForgot} className="auth-form">
            <div className="auth-input-wrapper">
              <input
                type="text"
                placeholder="绑定电子邮箱"
                value={email}
                onChange={e => { setEmail(e.target.value); clearError(); }}
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="auth-code-wrapper">
              <div className="auth-input-wrapper" style={{ flex: 1 }}>
                <input
                  type="text"
                  placeholder="6位验证码"
                  value={code}
                  onChange={e => { setCode(e.target.value); clearError(); }}
                  maxLength={6}
                  disabled={loading}
                />
              </div>
              <button
                type="button"
                className="auth-getcode-btn"
                disabled={loading || sending || countdown > 0}
                onClick={() => handleSendCode('reset', email)}
              >
                {countdown > 0 ? `${countdown}s` : sending ? '发送中...' : '获取验证码'}
              </button>
            </div>
            <div className="auth-input-wrapper">
              <input
                type={showForgotPwd ? 'text' : 'password'}
                placeholder="输入新密码 (至少 6 位)"
                value={forgotNewPwd}
                onChange={e => { setForgotNewPwd(e.target.value); clearError(); }}
                disabled={loading}
              />
              <button type="button" className="auth-eye-btn" tabIndex={-1} onClick={() => setShowForgotPwd(v => !v)}>
                {showForgotPwd ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '正在重置...' : '重置并应用新密码'}
            </button>
            <div className="auth-footer">
              <button type="button" className="auth-link-btn" onClick={() => switchMode('login')}>返回登录</button>
              <button type="button" className="auth-link-btn" onClick={() => switchMode('register')}>注册账号</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
