import { useState } from 'react';
import type { User } from '../../contexts/AppContext';

const API_BASE = 'http://localhost:8181';

interface AuthShellProps {
  onLoginSuccess: (token: string, user: User) => void;
}

type Mode = 'login' | 'register' | 'forgot_answer';

export function AuthShell({ onLoginSuccess }: AuthShellProps) {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [forgotStep, setForgotStep] = useState<'question' | 'reset'>('question');
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [forgotNewPwd, setForgotNewPwd] = useState('');

  const clearError = () => setError('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) { setError('请填写用户名和密码'); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '登录失败'); return; }
      onLoginSuccess(data.token, data.user);
    } catch { setError('网络错误，请稍后重试'); }
    finally { setLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || !nickname.trim() || !securityQuestion.trim() || !securityAnswer.trim()) {
      setError('请填写所有注册字段'); return;
    }
    if (password.length < 6) { setError('密码长度不能少于6位'); return; }
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
          security_question: securityQuestion.trim(),
          security_answer: securityAnswer.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || '注册失败'); return; }
      onLoginSuccess(data.token, data.user);
    } catch { setError('网络错误，请稍后重试'); }
    finally { setLoading(false); }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (forgotStep === 'question') {
      if (!username.trim()) { setError('请输入用户名'); return; }
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/auth/question?username=${encodeURIComponent(username.trim())}`);
        if (!res.ok) { setError('用户名不存在'); return; }
        const data = await res.json();
        setSecurityQuestion(data.security_question);
        setForgotStep('reset');
      } catch { setError('网络错误，请稍后重试'); }
      finally { setLoading(false); }
    } else {
      if (!forgotAnswer.trim() || !forgotNewPwd.trim()) { setError('请填写答案和新密码'); return; }
      if (forgotNewPwd.length < 6) { setError('新密码不能少于6位'); return; }
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: username.trim(),
            security_answer: forgotAnswer.trim(),
            new_password: forgotNewPwd,
          }),
        });
        if (!res.ok) { const d = await res.json(); setError(d.error || '重置密码失败'); return; }
        setMode('login');
        setForgotStep('question');
        setForgotAnswer('');
        setForgotNewPwd('');
      } catch { setError('网络错误，请稍后重试'); }
      finally { setLoading(false); }
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    clearError();
    setForgotStep('question');
    setForgotAnswer('');
    setForgotNewPwd('');
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
        .auth-logo-text {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: -0.5px;
          background: linear-gradient(135deg, var(--brand-blue) 0%, var(--brand-yellow) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
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
          padding: 11px 16px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--bg-paper);
          color: var(--text);
          font-size: 14px;
          transition: all 0.2s ease;
        }
        .auth-input-wrapper input:focus {
          border-color: var(--brand-blue);
          background: var(--bg-card);
          box-shadow: 0 0 0 3px rgba(44, 95, 138, 0.15);
        }
        [data-theme="dark"] .auth-input-wrapper input:focus {
          box-shadow: 0 0 0 3px rgba(74, 129, 173, 0.2);
        }
        .auth-question-banner {
          font-size: 13px;
          padding: 12px;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--hover);
          color: var(--text);
          text-align: left;
          line-height: 1.4;
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
        @keyframes logoFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
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
      `}</style>

      <div className="auth-card">
        {/* Brandy Logo/Branding */}
        <div className="auth-logo-area">
          <img src="/favicon.svg" alt="Brandy" className="auth-logo-icon" />
        </div>

        {/* Dynamic Titles */}
        <div className="auth-header">
          <div className="auth-title">
            {mode === 'login' && '登录 Brandy'}
            {mode === 'register' && '创建新账号'}
            {mode === 'forgot_answer' && '重置账户密码'}
          </div>
          <div className="auth-subtitle">
            {mode === 'register' && '通过密保问题保障您的账户安全'}
            {mode === 'forgot_answer' && forgotStep === 'question' ? '第 1 步：输入您的用户名' : mode === 'forgot_answer' && '第 2 步：验证密保并输入新密码'}
          </div>
        </div>

        {/* Error notification banner */}
        {error && <div className="auth-error">{error}</div>}

        {/* LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLogin} className="auth-form">
            <div className="auth-input-wrapper">
              <input
                type="text"
                placeholder="用户名"
                value={username}
                onChange={e => { setUsername(e.target.value); clearError(); }}
                autoFocus
                disabled={loading}
              />
            </div>
            <div className="auth-input-wrapper">
              <input
                type="password"
                placeholder="密码"
                value={password}
                onChange={e => { setPassword(e.target.value); clearError(); }}
                disabled={loading}
              />
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '正在登录...' : '登录'}
            </button>
            <div className="auth-footer">
              <button type="button" className="auth-link-btn" onClick={() => switchMode('register')}>注册账号</button>
              <button type="button" className="auth-link-btn" onClick={() => switchMode('forgot_answer')}>忘记密码</button>
            </div>
          </form>
        )}

        {/* REGISTER FORM */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="auth-form">
            <div className="auth-input-wrapper">
              <input
                type="text"
                placeholder="用户名 (英文字母/数字)"
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
                type="password"
                placeholder="密码 (至少 6 位)"
                value={password}
                onChange={e => { setPassword(e.target.value); clearError(); }}
                disabled={loading}
              />
            </div>
            <div className="auth-input-wrapper">
              <input
                type="text"
                placeholder="密保问题 (如：我最喜欢的食物)"
                value={securityQuestion}
                onChange={e => { setSecurityQuestion(e.target.value); clearError(); }}
                disabled={loading}
              />
            </div>
            <div className="auth-input-wrapper">
              <input
                type="text"
                placeholder="密保答案"
                value={securityAnswer}
                onChange={e => { setSecurityAnswer(e.target.value); clearError(); }}
                disabled={loading}
              />
            </div>
            <button type="submit" className="auth-btn" disabled={loading}>
              {loading ? '正在注册...' : '立即注册'}
            </button>
            <div className="auth-footer">
              <button type="button" className="auth-link-btn" onClick={() => switchMode('login')}>已有账号？返回登录</button>
            </div>
          </form>
        )}

        {/* FORGOT PASSWORD FORM */}
        {mode === 'forgot_answer' && (
          <form onSubmit={handleForgot} className="auth-form">
            {forgotStep === 'question' ? (
              <>
                <div className="auth-input-wrapper">
                  <input
                    type="text"
                    placeholder="输入用户名"
                    value={username}
                    onChange={e => { setUsername(e.target.value); clearError(); }}
                    autoFocus
                    disabled={loading}
                  />
                </div>
                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading ? '正在查询...' : '查询密保问题'}
                </button>
              </>
            ) : (
              <>
                <div className="auth-question-banner">
                  <strong>密保问题：</strong>
                  <div>{securityQuestion}</div>
                </div>
                <div className="auth-input-wrapper">
                  <input
                    type="text"
                    placeholder="回答密保答案"
                    value={forgotAnswer}
                    onChange={e => { setForgotAnswer(e.target.value); clearError(); }}
                    autoFocus
                    disabled={loading}
                  />
                </div>
                <div className="auth-input-wrapper">
                  <input
                    type="password"
                    placeholder="输入新密码 (至少 6 位)"
                    value={forgotNewPwd}
                    onChange={e => { setForgotNewPwd(e.target.value); clearError(); }}
                    disabled={loading}
                  />
                </div>
                <button type="submit" className="auth-btn" disabled={loading}>
                  {loading ? '正在重置...' : '重置并应用新密码'}
                </button>
              </>
            )}
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
