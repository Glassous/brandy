import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../shared/Avatar';
import { useApp, type Message } from '../../contexts/AppContext';
import { useToast } from '../shared/Toast';

const API_BASE = 'http://localhost:8181';

interface ChatRoomProps {
  currentUserId: string;
  friendId: string;
  friendName?: string;
  friendAvatar?: string;
  messages: Message[];
  onSend: (receiverId: string, content: string) => void;
  onLoad: (friendId: string) => Promise<void>;
  onBack?: () => void;
}

interface FileShareData {
  type: string;
  file_id: string;
  file_name: string;
  file_size: number;
  url: string;
}

function FileShareCard({ fileShareData, isOwn }: { fileShareData: FileShareData; isOwn: boolean }) {
  const { token } = useApp();
  const { showToast } = useToast();
  const [transferred, setTransferred] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOwn) {
      setChecking(false);
      return;
    }
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/disk/check-transfer/${fileShareData.file_id}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setTransferred(data.transferred);
        }
      } catch { /* ignore */ }
      finally {
        setChecking(false);
      }
    };
    checkStatus();
  }, [fileShareData.file_id, isOwn, token]);

  const handleTransfer = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/disk/transfer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ file_id: fileShareData.file_id }),
      });
      const data = await res.json();
      if (res.ok) {
        setTransferred(true);
        showToast('转存成功并已物理复制为您的独立文件！', 'success');
      } else {
        showToast(data.error || '转存失败', 'error');
      }
    } catch {
      showToast('网络错误，转存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="12" y1="6" x2="12" y2="18" />
          <line x1="8" y1="10" x2="16" y2="10" />
          <line x1="8" y1="14" x2="16" y2="14" />
        </svg>
      );
    }
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
    );
  };

  return (
    <div className="share-card-container">
      <div className="share-card-info">
        <div style={{ color: 'var(--brand-blue)', display: 'flex', alignItems: 'center' }}>
          {getFileIcon(fileShareData.file_name)}
        </div>
        <div className="share-card-details">
          <span className="share-card-name" title={fileShareData.file_name}>{fileShareData.file_name}</span>
          <span className="share-card-size">{formatBytes(fileShareData.file_size)}</span>
        </div>
      </div>
      <div className="share-card-actions">
        <a href={fileShareData.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textDecoration: 'none' }}>
          <button className="share-card-btn" style={{ width: '100%' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: '4px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            下载
          </button>
        </a>

        {isOwn ? (
          <button className="share-card-btn" disabled style={{ flex: 1 }}>
            已分享的文件
          </button>
        ) : checking ? (
          <button className="share-card-btn" disabled style={{ flex: 1 }}>
            检测中...
          </button>
        ) : transferred ? (
          <button className="share-card-btn" disabled style={{ flex: 1 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ color: 'var(--brand-yellow)', marginRight: '4px' }}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
            已转存
          </button>
        ) : (
          <button
            className="share-card-btn primary"
            onClick={handleTransfer}
            disabled={saving}
            style={{ flex: 1 }}
          >
            {saving ? '转存中...' : '转存至云盘'}
          </button>
        )}
      </div>
    </div>
  );
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatRoom({ currentUserId, friendId, friendName, friendAvatar, messages, onSend, onLoad, onBack }: ChatRoomProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => { onLoad(friendId); }, [friendId, onLoad]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleShowDetails = () => {
    navigate('/contacts', { state: { showDetailOfFriendId: friendId } });
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(friendId, text.trim());
    setText('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <style>{`
        .cr-header {
          display: flex;
          align-items: center;
          height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          gap: 10px;
          flex-shrink: 0;
          background: var(--bg);
        }
        .cr-back-btn {
          display: none;
        }
        .cr-name {
          font-weight: 700;
          font-size: 15px;
          flex: 1;
        }
        .cr-info {
          background: none;
          color: var(--text-dim);
          padding: 6px;
          display: flex;
          border-radius: var(--radius);
          transition: color 0.2s, background-color 0.2s;
        }
        .cr-info:hover { color: var(--brand-blue); background: var(--hover); }
        
        @media (max-width: 768px) {
          .cr-back-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            background: none;
            border: none;
            color: var(--text);
            padding: 6px;
            border-radius: 50%;
            cursor: pointer;
            transition: background-color 0.2s;
          }
          .cr-back-btn:hover {
            background: var(--hover);
          }
          .msg-bubble {
            max-width: 85% !important;
          }
          .cr-input-bar {
            padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
          }
        }
 
        .cr-msgs {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .msg-container {
          display: flex;
          flex-direction: column;
          width: 100%;
          margin-bottom: 2px;
        }
        .msg-row {
          display: flex;
          width: 100%;
          align-items: flex-end;
        }
        .msg-own {
          justify-content: flex-end;
        }
        .msg-other {
          justify-content: flex-start;
          gap: 8px;
        }
        .msg-bubble {
          max-width: 70%;
          padding: 10px 14px;
          display: flex;
          flex-direction: column;
          word-break: break-all;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .bubble-own {
          background: var(--bubble-self);
          color: var(--bubble-self-text);
        }
        .bubble-other {
          background: var(--bubble-other);
          color: var(--text-primary);
        }
 
        .bubble-other.first-of-group {
          border-radius: 4px 16px 16px 16px;
        }
        .bubble-other.consecutive {
          border-radius: 16px 16px 16px 16px;
        }
        .bubble-own.first-of-group {
          border-radius: 16px 4px 16px 16px;
        }
        .bubble-own.consecutive {
          border-radius: 16px 16px 16px 16px;
        }
 
        .msg-text {
          font-size: 14px;
          line-height: 1.45;
        }
        .msg-time-container {
          font-size: 10px;
          color: var(--text-dim);
          margin-top: 4px;
          margin-bottom: 8px;
          user-select: none;
        }
        .time-own {
          align-self: flex-end;
          padding-right: 4px;
        }
        .time-other {
          align-self: flex-start;
          margin-left: 40px; /* 32px avatar + 8px gap */
        }
 
        .cr-input-bar {
          display: flex;
          gap: 12px;
          padding: 12px 16px 16px 16px;
          background: transparent;
          align-items: center;
          flex-shrink: 0;
        }
        .cr-input-bar input {
          flex: 1;
          border-radius: 24px;
          border: 1px solid var(--border);
          background: var(--bg);
          padding: 11px 18px;
          font-size: 14px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .cr-input-bar input:focus {
          border-color: var(--text);
        }
        .cr-send {
          width: 42px;
          height: 42px;
          border-radius: 50% !important;
          padding: 0 !important;
          background: var(--btn-bg);
          color: var(--btn-text);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: opacity 0.2s, transform 0.1s;
        }
        .cr-send:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .cr-send:not(:disabled):active {
          transform: scale(0.92);
        }
        .cr-empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-dim);
          font-size: 13px;
        }

        /* File Share Card Styles */
        .share-card-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 230px;
          padding: 4px 0;
        }
        .share-card-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .share-card-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          flex: 1;
        }
        .share-card-name {
          font-weight: 600;
          font-size: 13.5px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--text-primary);
        }
        .bubble-own .share-card-name {
          color: var(--bubble-self-text);
        }
        .share-card-size {
          font-size: 11px;
          opacity: 0.75;
          color: var(--text-secondary);
        }
        .bubble-own .share-card-size {
          color: var(--bubble-self-text);
          opacity: 0.8;
        }
        .share-card-actions {
          display: flex;
          gap: 8px;
          border-top: 1px solid rgba(0,0,0,0.06);
          padding-top: 8px;
          margin-top: 4px;
        }
        [data-theme="dark"] .share-card-actions {
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .share-card-btn {
          flex: 1;
          font-size: 11.5px;
          padding: 6px 8px;
          border-radius: 6px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          background: var(--bg-card);
          color: var(--text-primary);
          border: 1px solid var(--border-light);
          cursor: pointer;
          transition: all 0.2s;
        }
        .share-card-btn:hover:not(:disabled) {
          background: var(--hover);
        }
        .share-card-btn:disabled {
          opacity: 0.75;
          cursor: not-allowed;
        }
        .share-card-btn.primary {
          background: var(--brand-blue);
          color: #fff;
          border: none;
        }
        .share-card-btn.primary:hover:not(:disabled) {
          opacity: 0.9;
        }
      `}</style>
 
      {/* Header Info */}
      <div className="cr-header">
        {onBack && (
          <button className="cr-back-btn" onClick={onBack} title="返回会话列表">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
          </button>
        )}
        <span className="cr-name">{friendName || '聊天'}</span>
        <button className="cr-info" title="查看资料" onClick={handleShowDetails}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </button>
      </div>
 
      {/* Messages Scroll Area */}
      <div className="cr-msgs">
        {messages.length === 0 ? (
          <div className="cr-empty">打个招呼吧</div>
        ) : (
          messages.map((m, i) => {
            const isOwn = m.sender_id === currentUserId;
            const isFirstOfGroup = i === 0 || messages[i - 1].sender_id !== m.sender_id;
 
            // Shared timestamp helper: display time below bubble at 5-minute intervals or for last message
            let showTime = false;
            if (i === messages.length - 1) {
              showTime = true;
            } else {
              const nextMsg = messages[i + 1];
              const currentMs = new Date(m.created_at).getTime();
              const nextMs = new Date(nextMsg.created_at).getTime();
              showTime = (nextMs - currentMs) > 5 * 60 * 1000;
            }
 
            return (
              <div key={m.id} className="msg-container">
                <div className={`msg-row ${isOwn ? 'msg-own' : 'msg-other'}`}>
                  {!isOwn && (
                    isFirstOfGroup ? (
                      <Avatar name={friendName || '?'} url={friendAvatar} size={32} fontSize={13} />
                    ) : (
                      <div style={{ width: 32, flexShrink: 0 }} />
                    )
                  )}
                  <div className={`msg-bubble ${isOwn ? 'bubble-own' : 'bubble-other'} ${isFirstOfGroup ? 'first-of-group' : 'consecutive'}`}>
                    {(() => {
                      let fileShareData = null;
                      if (m.content.startsWith('{')) {
                        try {
                          const parsed = JSON.parse(m.content);
                          if (parsed && parsed.type === 'file_share') {
                            fileShareData = parsed;
                          }
                        } catch { /* ignore */ }
                      }

                      if (fileShareData) {
                        return <FileShareCard fileShareData={fileShareData} isOwn={isOwn} />;
                      }
                      return <span className="msg-text">{m.content}</span>;
                    })()}
                  </div>
                </div>
                {showTime && (
                  <div className={`msg-time-container ${isOwn ? 'time-own' : 'time-other'}`}>
                    {formatTime(m.created_at)}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
 
      {/* Input Sender Bar */}
      <form onSubmit={handleSend} className="cr-input-bar">
        <input
          type="text"
          placeholder="输入消息..."
          value={text}
          onChange={e => setText(e.target.value)}
        />
        <button type="submit" className="btn cr-send" disabled={!text.trim()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}
