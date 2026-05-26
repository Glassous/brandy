import { Avatar } from '../shared/Avatar';
import type { ChatSession } from '../../contexts/AppContext';

interface ChatListProps {
  chats: ChatSession[];
  remarks: Record<string, string>;
  pinnedChats: string[];
  onSelectFriend: (id: string) => void;
  onHideChat?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  activeFriendId?: string | null;
}

function formatTime(ts: string) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChatList({
  chats,
  remarks,
  pinnedChats,
  onSelectFriend,
  onHideChat,
  onTogglePin,
  activeFriendId
}: ChatListProps) {
  // Sort pinned chats first, then sort by last message time
  const sorted = [...chats].sort((a, b) => {
    const aPinned = pinnedChats.includes(a.friend_id);
    const bPinned = pinnedChats.includes(b.friend_id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return new Date(b.last_msg_time).getTime() - new Date(a.last_msg_time).getTime();
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <style>{`
        .chat-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
          border-left: 3px solid transparent;
          transition: background-color 0.2s, border-left-color 0.2s;
          position: relative;
        }
        .chat-item:hover { background: var(--hover); }
        .chat-item.active {
          background: var(--hover);
          border-left-color: var(--brand-blue);
        }
        .chat-item.pinned {
          background: rgba(212, 184, 122, 0.04);
          border-left-color: var(--brand-yellow);
        }
        .chat-item.pinned.active {
          background: var(--hover);
          border-left-color: var(--brand-blue);
        }
        .chat-info {
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .chat-info-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .chat-name {
          font-weight: 600;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chat-time {
          font-size: 11px;
          color: var(--text-dim);
          flex-shrink: 0;
        }
        .chat-preview {
          font-size: 12px;
          color: var(--text-dim);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .chat-badge {
          background: var(--badge-unread);
          color: #FFFFFF;
          font-size: 10px;
          font-weight: 700;
          min-width: 18px;
          height: 18px;
          line-height: 18px;
          text-align: center;
          border-radius: 2px;
          flex-shrink: 0;
          padding: 0 4px;
        }
        .chat-item-actions {
          display: none;
          gap: 6px;
          align-items: center;
          margin-left: 8px;
        }
        .chat-item:hover .chat-item-actions {
          display: flex;
        }
        .chat-action-btn {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: var(--bg-card);
          border: 1px solid var(--border);
          color: var(--text-dim);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .chat-action-btn:hover {
          background: var(--hover);
          color: var(--text);
          border-color: var(--text-dim);
        }
        .chat-action-btn.pin-active {
          color: var(--brand-yellow);
          border-color: var(--brand-yellow);
        }
        .empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-dim);
          font-size: 13px;
        }
      `}</style>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sorted.length === 0 ? (
          <div className="empty">暂无聊天</div>
        ) : (
          sorted.map(chat => {
            const isPinned = pinnedChats.includes(chat.friend_id);
            const displayName = remarks[chat.friend_id] || chat.friend_name;
            return (
              <div
                key={chat.friend_id}
                className={`chat-item ${activeFriendId === chat.friend_id ? 'active' : ''} ${isPinned ? 'pinned' : ''}`}
                onClick={() => {
                  onSelectFriend(chat.friend_id);
                }}
              >
                <Avatar name={displayName} url={chat.friend_avatar} size={40} />
                <div className="chat-info">
                  <div className="chat-info-top">
                    <span className="chat-name">{displayName}</span>
                    <span className="chat-time">{formatTime(chat.last_msg_time)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="chat-preview">{chat.last_message || '—'}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isPinned && <span style={{ fontSize: 12, color: 'var(--brand-yellow)', marginRight: 2 }} title="已置顶">📌</span>}
                      {chat.unread_count > 0 && <span className="chat-badge">{chat.unread_count}</span>}
                    </div>
                  </div>
                </div>
                
                {/* Actions: Pin / Hide */}
                <div className="chat-item-actions">
                  <button
                    type="button"
                    className={`chat-action-btn ${isPinned ? 'pin-active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTogglePin?.(chat.friend_id);
                    }}
                    title={isPinned ? "取消置顶" : "置顶对话"}
                  >
                    📌
                  </button>
                  <button
                    type="button"
                    className="chat-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onHideChat?.(chat.friend_id);
                    }}
                    title="不在主页显示该对话"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
