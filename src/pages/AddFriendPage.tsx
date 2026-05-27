import { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/shared/Avatar';

const API_BASE = 'http://localhost:8181';

export function AddFriendPage() {
  const { addFriend, friends, user, token } = useApp();
  const [username, setUsername] = useState('');
  
  const [searching, setSearching] = useState(false);
  const [searchedUser, setSearchedUser] = useState<any>(null);
  const [searchError, setSearchError] = useState('');
  
  const [sending, setSending] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const queryName = username.trim();
    if (!queryName) return;

    setSearching(true);
    setSearchedUser(null);
    setSearchError('');

    try {
      const res = await fetch(`${API_BASE}/api/users/search?username=${encodeURIComponent(queryName)}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (res.status === 404) {
        setSearchError('未查找到该用户，请检查用户名拼写是否正确（系统不区分大小写）。');
      } else if (!res.ok) {
        setSearchError('搜索失败，网络连接异常或服务器错误。');
      } else {
        const data = await res.json();
        setSearchedUser(data);
      }
    } catch {
      setSearchError('网络故障，请稍后重试。');
    } finally {
      setSearching(false);
    }
  };

  const handleAddFriend = async () => {
    if (!searchedUser) return;
    setSending(true);
    const ok = await addFriend(searchedUser.username);
    if (ok) {
      setSearchedUser(null);
      setUsername('');
    }
    setSending(false);
  };

  const isSelf = searchedUser ? searchedUser.id === user?.id : false;
  const isAlreadyFriend = searchedUser ? friends.some(f => f.id === searchedUser.id) : false;

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <style>{`
        .af-header {
          display: flex;
          align-items: center;
          height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          gap: 12px;
          flex-shrink: 0;
          background: var(--bg);
        }
        .af-back-btn {
          background: none;
          color: var(--text);
          padding: 6px;
          display: flex;
          align-items: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        }
        .af-back-btn:hover {
          background: var(--hover);
        }
        .af-header-title {
          font-weight: 700;
          font-size: 15px;
        }
        .af-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 24px;
          gap: 24px;
          overflow-y: auto;
          max-width: 600px;
          width: 100%;
          margin: 0 auto;
        }
        .af-title-group {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .af-title {
          font-size: 20px;
          font-weight: 700;
        }
        .af-desc {
          font-size: 13px;
          color: var(--text-dim);
        }
        .af-form {
          width: 100%;
          max-width: 360px;
          display: flex;
          gap: 8px;
        }
        .af-form input {
          border-radius: 24px;
          padding: 12px 18px;
          flex: 1;
        }
        .af-search-btn {
          border-radius: 24px;
          padding: 12px 24px;
          background: var(--btn-bg);
          color: var(--btn-text);
          font-weight: 600;
          border: none;
          cursor: pointer;
        }
        .af-search-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        /* 404 & Warning banner */
        .af-error-banner {
          width: 100%;
          max-width: 360px;
          background: rgba(232, 122, 94, 0.08);
          border: 1px solid rgba(232, 122, 94, 0.2);
          padding: 16px;
          border-radius: 16px;
          display: flex;
          align-items: flex-start;
          gap: 12px;
          animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .af-error-icon {
          font-size: 20px;
          line-height: 1;
        }
        .af-error-text {
          font-size: 13px;
          color: var(--badge-unread);
          line-height: 1.4;
        }

        /* Profile preview card */
        .af-preview-card {
          width: 100%;
          max-width: 360px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 20px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.02);
          padding: 28px 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          text-align: center;
          animation: popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .af-preview-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .af-preview-name {
          font-size: 18px;
          font-weight: 700;
          color: var(--text);
        }
        .af-preview-username {
          font-size: 13px;
          color: var(--text-dim);
        }
        .af-preview-meta {
          font-size: 12px;
          color: var(--text-dim);
          background: var(--hover);
          padding: 6px 12px;
          border-radius: 12px;
          margin-top: 4px;
        }
        .af-action-btn {
          width: 100%;
          border-radius: 24px;
          padding: 12px;
          font-weight: 700;
          font-size: 14px;
          margin-top: 8px;
        }

        @keyframes popIn {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(8px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>

      {/* Header */}
      <div className="af-header">
        <Link to="/contacts" className="af-back-btn" title="返回联系人">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <span className="af-header-title">添加好友</span>
      </div>

      <div className="af-content">
        <div className="af-title-group">
          <div className="af-title">添加好友</div>
          <div className="af-desc">通过用户名搜索并查看账户信息</div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} className="af-form">
          <input
            type="text"
            placeholder="输入好友用户名"
            value={username}
            onChange={e => { setUsername(e.target.value); setSearchError(''); setSearchedUser(null); }}
            disabled={searching || sending}
            autoFocus
          />
          <button type="submit" className="af-search-btn" disabled={searching || sending || !username.trim()}>
            {searching ? '搜索中...' : '搜索'}
          </button>
        </form>

        {/* Enhanced Error Banner */}
        {searchError && (
          <div className="af-error-banner">
            <span className="af-error-icon">⚠️</span>
            <div className="af-error-text">{searchError}</div>
          </div>
        )}

        {/* User Card Preview */}
        {searchedUser && (
          <div className="af-preview-card">
            <Avatar name={searchedUser.nickname} url={searchedUser.avatar} size={64} fontSize={26} />
            <div className="af-preview-info">
              <div className="af-preview-name">{searchedUser.nickname}</div>
              <div className="af-preview-username">@{searchedUser.username}</div>
              <div className="af-preview-meta">加入社区：{formatDate(searchedUser.created_at)}</div>
            </div>

            {isSelf ? (
              <button className="btn btn-secondary af-action-btn" disabled>
                这是您自己
              </button>
            ) : isAlreadyFriend ? (
              <button className="btn btn-secondary af-action-btn" disabled>
                已经是好友
              </button>
            ) : (
              <button 
                className="btn af-action-btn" 
                onClick={handleAddFriend}
                disabled={sending}
              >
                {sending ? '发送中...' : '申请添加好友'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
