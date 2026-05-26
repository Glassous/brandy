import { useState, useEffect } from 'react';
import { useApp } from '../contexts/AppContext';
import { Avatar } from '../components/shared/Avatar';
import { Link } from 'react-router-dom';

const API_BASE = 'http://localhost:8181';

export function AccountSettingsPage() {
  const { user, updateNickname, logout } = useApp();
  const [nick, setNick] = useState(user?.nickname || '');
  const [saving, setSaving] = useState(false);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch(`${API_BASE}/api/auth/question?username=${encodeURIComponent(user.username)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setQuestion(d.security_question))
      .catch(() => {});
  }, [user]);

  const handleNick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nick.trim() || nick.trim() === user?.nickname) return;
    setSaving(true);
    await updateNickname(nick.trim());
    setSaving(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim() || !newPwd.trim()) return;
    setResetting(true);
    try {
      const r = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user?.username, security_answer: answer, new_password: newPwd }),
      });
      if (!r.ok) throw new Error((await r.json()).error);
      setAnswer('');
      setNewPwd('');
    } catch { /* ignore */ }
    setResetting(false);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <style>{`
        .ac-header {
          display: flex;
          align-items: center;
          height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          gap: 12px;
          flex-shrink: 0;
          background: var(--bg);
        }
        .ac-back-btn {
          background: none;
          color: var(--text);
          padding: 6px;
          display: flex;
          align-items: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        }
        .ac-back-btn:hover {
          background: var(--hover);
        }
        .ac-header-title {
          font-weight: 700;
          font-size: 15px;
        }
        .ac-content {
          flex: 1;
          overflow-y: auto;
        }
        .pf-section {
          padding: 24px 16px;
          border-bottom: 1px solid var(--border);
        }
        .pf-section:last-of-type { border-bottom: none; }
        .pf-row {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pf-row label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-dim);
        }
        .pf-center {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
        }
        .pf-name {
          font-size: 18px;
          font-weight: 700;
        }
        .pf-username {
          font-size: 12px;
          color: var(--text-dim);
        }
        .pf-form {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .pf-logout {
          padding: 24px 16px;
          margin-top: 12px;
        }
        .pf-question {
          padding: 10px 14px;
          font-size: 13px;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--hover);
        }
        .btn-round {
          border-radius: 24px;
          padding: 12px 20px;
        }
      `}</style>

      {/* Header */}
      <div className="ac-header">
        <Link to="/profile" className="ac-back-btn" title="返回设置">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <span className="ac-header-title">账户设置</span>
      </div>

      <div className="ac-content">
        <div className="pf-section pf-center">
          <Avatar name={user?.nickname || '?'} size={56} fontSize={22} />
          <div className="pf-name">{user?.nickname}</div>
          <div className="pf-username">@{user?.username}</div>
        </div>

        <div className="pf-section">
          <form onSubmit={handleNick} className="pf-form">
            <div className="pf-row">
              <label>昵称</label>
              <input value={nick} onChange={e => setNick(e.target.value)} disabled={saving} />
            </div>
            <button type="submit" className="btn btn-round" disabled={saving || !nick.trim() || nick.trim() === user?.nickname}>
              {saving ? '保存中...' : '保存修改'}
            </button>
          </form>
        </div>

        {question && (
          <div className="pf-section">
            <form onSubmit={handleReset} className="pf-form">
              <div className="pf-row">
                <label>密保问题</label>
                <div className="pf-question">{question}</div>
              </div>
              <div className="pf-row">
                <label>密保答案</label>
                <input value={answer} onChange={e => setAnswer(e.target.value)} disabled={resetting} />
              </div>
              <div className="pf-row">
                <label>新密码</label>
                <input type="password" placeholder="至少6位" value={newPwd} onChange={e => setNewPwd(e.target.value)} disabled={resetting} />
              </div>
              <button type="submit" className="btn btn-round" disabled={resetting || !answer.trim() || !newPwd.trim()}>
                {resetting ? '重置中...' : '重置密码'}
              </button>
            </form>
          </div>
        )}

        <div className="pf-logout">
          <button className="btn btn-danger btn-round" onClick={logout} style={{ width: '100%' }}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
