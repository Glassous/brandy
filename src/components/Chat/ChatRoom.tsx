import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../shared/Avatar';
import type { Message } from '../../contexts/AppContext';

interface ChatRoomProps {
  currentUserId: string;
  friendId: string;
  friendName?: string;
  friendAvatar?: string;
  messages: Message[];
  onSend: (receiverId: string, content: string) => void;
  onLoad: (friendId: string) => Promise<void>;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatRoom({ currentUserId, friendId, friendName, friendAvatar, messages, onSend, onLoad }: ChatRoomProps) {
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
      `}</style>

      {/* Header Info */}
      <div className="cr-header">
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
                    <span className="msg-text">{m.content}</span>
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
