import { useState, useEffect, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { Avatar } from '../components/shared/Avatar';
import { AvatarCropper } from '../components/shared/AvatarCropper';
import { Link } from 'react-router-dom';

const API_BASE = 'http://localhost:8181';

export function AccountSettingsPage() {
  const { user, updateNickname, logout, uploadAvatar } = useApp();
  const [nick, setNick] = useState(user?.nickname || '');
  const [saving, setSaving] = useState(false);

  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [resetting, setResetting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    
    setUploading(true);
    const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
    await uploadAvatar(file);
    setUploading(false);
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
        .pf-avatar-wrapper {
          position: relative;
          cursor: pointer;
          border-radius: 50%;
          overflow: hidden;
          width: 64px;
          height: 64px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--border);
          transition: border-color 0.2s, transform 0.2s;
        }
        .pf-avatar-wrapper:hover {
          border-color: var(--accent);
          transform: scale(1.05);
        }
        .pf-avatar-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 0.2s;
          color: #fff;
        }
        .pf-avatar-wrapper:hover .pf-avatar-overlay {
          opacity: 1;
        }
        .pf-avatar-uploading {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 11px;
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
          <div className="pf-avatar-wrapper" onClick={() => fileInputRef.current?.click()} title="更换头像">
            <Avatar name={user?.nickname || '?'} url={user?.avatar} size={60} fontSize={24} />
            <div className="pf-avatar-overlay">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
            </div>
            {uploading && (
              <div className="pf-avatar-uploading">
                上传中
              </div>
            )}
          </div>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/*"
            onChange={handleFileChange}
          />
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

      {selectedImage && (
        <AvatarCropper
          imageSrc={selectedImage}
          onCrop={handleCropComplete}
          onClose={() => {
            setSelectedImage(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
        />
      )}
    </div>
  );
}
