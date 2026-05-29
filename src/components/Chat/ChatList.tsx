import { useState, useEffect } from 'react';
import { Avatar } from '../shared/Avatar';
import type { ChatSession } from '../../contexts/AppContext';
import { PinIcon, CloseIcon } from '../shared/Icons';
import { calculateContextMenuPosition } from '../../utils/popupPosition';

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
  const now = new Date();
  
  const isToday = d.toDateString() === now.toDateString();
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  
  if (isToday) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } else if (isYesterday) {
    return '昨天';
  } else if (d.getFullYear() === now.getFullYear()) {
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } else {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

function formatLastMessage(msg: string) {
  if (!msg) return '—';
  if (msg.startsWith('{')) {
    try {
      const parsed = JSON.parse(msg);
      if (parsed) {
        if (parsed.type === 'chat_file') {
          switch (parsed.file_type) {
            case 'image': return '[图片]';
            case 'video': return '[视频]';
            case 'audio': return '[音频]';
            default: return '[文件]';
          }
        }
        if (parsed.type === 'file_share') {
          return '[文件]';
        }
        return '[消息]';
      }
    } catch {
      return '[消息]';
    }
  }
  return msg;
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
  const [contextMenu, setContextMenu] = useState<{ friendId: string; x: number; y: number } | null>(null);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, friendId: string) => {
    e.preventDefault();
    const pos = calculateContextMenuPosition({
      x: e.clientX,
      y: e.clientY,
      popupSize: { width: 200, height: 80 }
    });
    setContextMenu({ friendId, x: pos.left, y: pos.top });
  };

  // Sort pinned chats first, then sort by last message time
  const sorted = [...chats].sort((a, b) => {
    const aId = a.is_group ? a.group_id! : a.friend_id!;
    const bId = b.is_group ? b.group_id! : b.friend_id!;
    const aPinned = pinnedChats.includes(aId);
    const bPinned = pinnedChats.includes(bId);
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
          color: var(--text);
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

        .empty {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-dim);
          font-size: 13px;
        }
        .context-menu {
          position: fixed;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 4px 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          z-index: 1000;
        }
        .context-menu-item {
          display: block;
          width: 100%;
          padding: 8px 16px;
          border: none;
          background: none;
          cursor: pointer;
          text-align: left;
          font-size: 13px;
          color: var(--text);
        }
        .context-menu-item:hover {
          background: var(--hover);
        }
      `}</style>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {sorted.length === 0 ? (
          <div className="empty">暂无聊天</div>
        ) : (
          sorted.map(chat => {
            const id = chat.is_group ? chat.group_id! : chat.friend_id!;
            const isPinned = pinnedChats.includes(id);
            const displayName = chat.is_group ? chat.group_name! : (remarks[chat.friend_id!] || chat.friend_name!);
            const displayAvatar = chat.is_group ? chat.group_avatar : chat.friend_avatar;
            return (
              <div
                key={id}
                className={`chat-item ${activeFriendId === id ? 'active' : ''} ${isPinned ? 'pinned' : ''}`}
                onClick={() => {
                  onSelectFriend(id);
                }}
                onContextMenu={(e) => handleContextMenu(e, id)}
              >
                <Avatar name={displayName} url={displayAvatar} size={40} />
                <div className="chat-info">
                  <div className="chat-info-top">
                    <span className="chat-name">{displayName}</span>
                    <span className="chat-time">{formatTime(chat.last_msg_time)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="chat-preview">{formatLastMessage(chat.last_message)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {isPinned && <PinIcon size={12} style={{ color: 'var(--brand-yellow)', marginRight: 2 }} aria-label="已置顶" />}
                      {chat.unread_count > 0 && <span className="chat-badge">{chat.unread_count}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              onTogglePin?.(contextMenu.friendId);
              setContextMenu(null);
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <PinIcon size={14} color="var(--text)" />
              {pinnedChats.includes(contextMenu.friendId) ? '取消置顶' : '置顶对话'}
            </span>
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              onHideChat?.(contextMenu.friendId);
              setContextMenu(null);
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--badge-unread)' }}>
              <CloseIcon size={14} color="var(--badge-unread)" />
              不在主页显示该对话
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
