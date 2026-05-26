import { useMemo, useCallback } from 'react';
import { useApp } from '../contexts/AppContext';
import { ChatList } from '../components/Chat/ChatList';
import { ChatRoom } from '../components/Chat/ChatRoom';

export function ChatPage() {
  const {
    chats,
    friends,
    activeChatFriendId,
    setActiveChatFriendId,
    user,
    messages,
    sendMessage,
    loadChatMessages,
    hiddenChats,
    remarks,
    pinnedChats,
    hideChat,
    togglePinChat,
  } = useApp();

  const handleSelectFriend = (friendId: string | null) => {
    if (activeChatFriendId === friendId) {
      setActiveChatFriendId(null);
    } else {
      setActiveChatFriendId(friendId);
    }
  };

  // Filter out hidden chats, but always keep active chat visible, and prepend temporary sessions
  const displayedChats = useMemo(() => {
    const visibleChats = chats.filter(c => !hiddenChats.includes(c.friend_id) || c.friend_id === activeChatFriendId);
    const hasActiveChatInChats = visibleChats.some(c => c.friend_id === activeChatFriendId);
    if (activeChatFriendId && !hasActiveChatInChats) {
      const activeFriend = friends.find(f => f.id === activeChatFriendId);
      if (activeFriend) {
        const tempSession = {
          friend_id: activeFriend.id,
          friend_name: remarks[activeFriend.id] || activeFriend.nickname || activeFriend.username,
          friend_avatar: activeFriend.avatar,
          last_message: '',
          last_msg_time: new Date().toISOString(),
          unread_count: 0,
        };
        return [tempSession, ...visibleChats];
      }
    }
    return visibleChats;
  }, [chats, activeChatFriendId, friends, hiddenChats, remarks]);

  // Find active chat details
  const activeChat = useMemo(() => {
    if (!activeChatFriendId) return null;
    return displayedChats.find(c => c.friend_id === activeChatFriendId) || null;
  }, [activeChatFriendId, displayedChats]);

  const handleSend = (friendId: string, content: string) => {
    sendMessage(friendId, content);
  };

  const handleLoad = useCallback(async (friendId: string) => {
    await loadChatMessages(friendId);
  }, [loadChatMessages]);

  return (
    <div className="chat-page-container">
      <style>{`
        .chat-page-container {
          display: flex;
          height: 100%;
          width: 100%;
          background: var(--bg-paper);
          overflow: hidden;
        }
        .chat-sidebar {
          width: 320px;
          height: 100%;
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          flex-shrink: 0;
          background: var(--bg-paper);
        }
        .chat-sidebar-list {
          flex: 1;
          overflow-y: auto;
        }
        .chat-content-pane {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-paper);
        }
        .chat-placeholder {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--text-dim);
          text-align: center;
          padding: 32px;
          gap: 16px;
          background: var(--bg-paper);
          user-select: none;
        }
        .chat-placeholder-icon {
          width: 64px;
          height: 64px;
          color: var(--text-dim);
          opacity: 0.3;
          animation: floatAnimation 3s ease-in-out infinite;
        }
        @keyframes floatAnimation {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .chat-placeholder-title {
          font-size: 18px;
          font-weight: 600;
          color: var(--text);
        }
        .chat-placeholder-desc {
          font-size: 13px;
          max-width: 320px;
          line-height: 1.5;
        }
      `}</style>

      {/* Left Pane: Chat List */}
      <div className="chat-sidebar">
        <div className="chat-sidebar-list">
          <ChatList
            chats={displayedChats}
            remarks={remarks}
            pinnedChats={pinnedChats}
            onSelectFriend={handleSelectFriend}
            onHideChat={hideChat}
            onTogglePin={togglePinChat}
            activeFriendId={activeChatFriendId}
          />
        </div>
      </div>

      {/* Right Pane: Chat Room or Empty State */}
      <div className="chat-content-pane">
        {activeChat && user ? (
          <ChatRoom
            currentUserId={user.id}
            friendId={activeChat.friend_id}
            friendName={remarks[activeChat.friend_id] || activeChat.friend_name}
            friendAvatar={activeChat.friend_avatar}
            messages={messages}
            onSend={(fid, content) => handleSend(fid, content)}
            onLoad={handleLoad}
          />
        ) : (
          <div className="chat-placeholder">
            <svg className="chat-placeholder-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a.75.75 0 01-1.074-.765 6 6 0 011.236-4.57 8.249 8.249 0 01-1.122-3.385C4.453 7.444 8.483 3.75 13.5 3.75S21 7.444 21 12z" />
            </svg>
            <div className="chat-placeholder-title">
              欢迎回来，{user?.nickname || 'Brandy 用户'}
            </div>
            <div className="chat-placeholder-desc">
              在左侧会话列表中选择一个联系人开始聊天，或者点击侧栏进入“联系人”页面添加好友。
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
