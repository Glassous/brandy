import { useState, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { Avatar } from '../components/shared/Avatar';
import { AvatarCropper } from '../components/shared/AvatarCropper';
import { Link } from 'react-router-dom';
import { API_BASE } from '../config';

const EyeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const EyeOffIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export function AccountSettingsPage() {
  const { user, token, updateNickname, logout, uploadAvatar, deleteAllLocalChatHistories } = useApp();
  const [nick, setNick] = useState(user?.nickname || '');
  const [saving, setSaving] = useState(false);

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdChanging, setPwdChanging] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  // Per-field password visibility
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleNick = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nick.trim() || nick.trim() === user?.nickname) return;
    setSaving(true);
    await updateNickname(nick.trim());
    setSaving(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');
    if (!oldPwd.trim() || !newPwd.trim()) { setPwdError('请填写当前密码和新密码'); return; }
    if (newPwd.length < 6) { setPwdError('新密码不能少于 6 位'); return; }
    if (newPwd !== confirmPwd) { setPwdError('两次输入的新密码不一致'); return; }
    if (newPwd === oldPwd) { setPwdError('新密码不能与当前密码相同'); return; }
    setPwdChanging(true);
    try {
      const res = await fetch(`${API_BASE}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ old_password: oldPwd, new_password: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) { setPwdError(data.error || '修改密码失败'); return; }
      setPwdSuccess('密码修改成功！');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch { setPwdError('网络错误，请稍后重试'); }
    finally { setPwdChanging(false); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setSelectedImage(reader.result as string);
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
        .ac-header { display:flex;align-items:center;height:48px;padding:0 16px;border-bottom:1px solid var(--border);gap:12px;flex-shrink:0;background:var(--bg); }
        .ac-back-btn { background:none;color:var(--text);padding:6px;display:flex;align-items:center;border-radius:50%;transition:background-color 0.2s; }
        .ac-back-btn:hover { background:var(--hover); }
        .ac-header-title { font-weight:700;font-size:15px; }
        .ac-content { flex:1;overflow-y:auto; max-width:600px; width:100%; margin:0 auto; }
        .pf-section { padding:24px 16px;border-bottom:1px solid var(--border); }
        .pf-section:last-of-type { border-bottom:none; }
        .pf-section-title { font-size:12px;font-weight:700;color:var(--text-dim);letter-spacing:0.5px;text-transform:uppercase;margin-bottom:14px; }
        .pf-row { display:flex;flex-direction:column;gap:6px; }
        .pf-row label { font-size:12px;font-weight:600;color:var(--text-dim); }
        .pf-center { display:flex;flex-direction:column;align-items:center;gap:8px; }
        .pf-avatar-wrapper { position:relative;cursor:pointer;border-radius:50%;overflow:hidden;width:64px;height:64px;display:flex;align-items:center;justify-content:center;border:2px solid var(--border);transition:border-color 0.2s,transform 0.2s; }
        .pf-avatar-wrapper:hover { border-color:var(--brand-blue);transform:scale(1.05); }
        .pf-avatar-overlay { position:absolute;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.2s;color:#fff; }
        .pf-avatar-wrapper:hover .pf-avatar-overlay { opacity:1; }
        .pf-avatar-uploading { position:absolute;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px; }
        .pf-name { font-size:18px;font-weight:700; }
        .pf-username { font-size:12px;color:var(--text-dim); }
        .pf-form { display:flex;flex-direction:column;gap:12px; }
        .pf-pwd-error { padding:9px 12px;background:rgba(232,122,94,0.08);border:1px solid rgba(232,122,94,0.25);border-radius:10px;font-size:13px;color:var(--badge-unread);animation:errorShake 0.4s ease; }
        .pf-pwd-success { padding:9px 12px;background:rgba(44,95,138,0.07);border:1px solid rgba(44,95,138,0.2);border-radius:10px;font-size:13px;color:var(--brand-blue); }
        [data-theme="dark"] .pf-pwd-success { border-color:rgba(74,129,173,0.3);color:var(--brand-yellow); }
        .pf-logout { padding:24px 16px;margin-top:4px; }
        .btn-round { border-radius:24px;padding:12px 20px; }
        .pf-pwd-field { position:relative; }
        .pf-pwd-field input { padding-right:38px; }
        .pf-pwd-eye {
          position:absolute;right:10px;top:50%;transform:translateY(-50%);
          background:none;border:none;color:var(--text-dim);cursor:pointer;
          padding:4px;display:flex;align-items:center;border-radius:6px;
          transition:color 0.15s;line-height:0;
        }
        .pf-pwd-eye:hover { color:var(--text); }
        @keyframes errorShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-4px)} 75%{transform:translateX(4px)} }
      `}</style>
      <div className="ac-header">
        <Link to="/profile" className="ac-back-btn" title="返回设置">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
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
            {uploading && <div className="pf-avatar-uploading">上传中</div>}
          </div>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />
          <div className="pf-name">{user?.nickname}</div>
          <div className="pf-username">@{user?.username}</div>
        </div>
        <div className="pf-section">
          <div className="pf-section-title">个人资料</div>
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
        <div className="pf-section">
          <div className="pf-section-title">修改密码</div>
          <form onSubmit={handleChangePassword} className="pf-form">
            {pwdError && <div className="pf-pwd-error">{pwdError}</div>}
            {pwdSuccess && <div className="pf-pwd-success">✓ {pwdSuccess}</div>}
            <div className="pf-row">
              <label>当前密码</label>
              <div className="pf-pwd-field">
                <input type={showOldPwd ? 'text' : 'password'} placeholder="输入当前密码" value={oldPwd} onChange={e => { setOldPwd(e.target.value); setPwdError(''); setPwdSuccess(''); }} disabled={pwdChanging} />
                <button type="button" className="pf-pwd-eye" tabIndex={-1} onClick={() => setShowOldPwd(v => !v)}>{showOldPwd ? <EyeOffIcon /> : <EyeIcon />}</button>
              </div>
            </div>
            <div className="pf-row">
              <label>新密码</label>
              <div className="pf-pwd-field">
                <input type={showNewPwd ? 'text' : 'password'} placeholder="至少 6 位" value={newPwd} onChange={e => { setNewPwd(e.target.value); setPwdError(''); setPwdSuccess(''); }} disabled={pwdChanging} />
                <button type="button" className="pf-pwd-eye" tabIndex={-1} onClick={() => setShowNewPwd(v => !v)}>{showNewPwd ? <EyeOffIcon /> : <EyeIcon />}</button>
              </div>
            </div>
            <div className="pf-row">
              <label>确认新密码</label>
              <div className="pf-pwd-field">
                <input type={showConfirmPwd ? 'text' : 'password'} placeholder="再次输入新密码" value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setPwdError(''); setPwdSuccess(''); }} disabled={pwdChanging} />
                <button type="button" className="pf-pwd-eye" tabIndex={-1} onClick={() => setShowConfirmPwd(v => !v)}>{showConfirmPwd ? <EyeOffIcon /> : <EyeIcon />}</button>
              </div>
            </div>
            <button type="submit" className="btn btn-round" disabled={pwdChanging || !oldPwd.trim() || !newPwd.trim() || !confirmPwd.trim()}>
              {pwdChanging ? '正在修改...' : '修改密码'}
            </button>
          </form>
        </div>
        <div className="pf-logout" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button 
            className="btn btn-secondary btn-round" 
            onClick={async () => {
              if (confirm("确定要清除当前浏览器上的所有本地聊天记录吗？这不会影响其他设备，但此操作不可撤销。")) {
                await deleteAllLocalChatHistories();
              }
            }} 
            style={{ width: '100%', border: '1px solid var(--border)', background: 'var(--bg-paper)', color: 'var(--badge-unread)' }}
          >
            清除本地所有聊天记录
          </button>
          <button className="btn btn-danger btn-round" onClick={logout} style={{ width: '100%' }}>退出登录</button>
        </div>
      </div>
      {selectedImage && (
        <AvatarCropper imageSrc={selectedImage} onCrop={handleCropComplete} onClose={() => { setSelectedImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} />
      )}
    </div>
  );
}
