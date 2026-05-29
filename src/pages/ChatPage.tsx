import { useMemo, useCallback, useState } from 'react';
import { useApp, type ChatSession } from '../contexts/AppContext';
import { ChatList } from '../components/Chat/ChatList';
import { ChatRoom } from '../components/Chat/ChatRoom';
import { Avatar } from '../components/shared/Avatar';
import { CloseIcon } from '../components/shared/Icons';

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
    createGroup,
    startChat,
  } = useApp();

  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);

  const handleSelectFriend = (friendId: string | null) => {
    if (activeChatFriendId === friendId) {
      setActiveChatFriendId(null);
    } else {
      setActiveChatFriendId(friendId);
    }
  };

  // Filter out hidden chats, but always keep active chat visible
  const displayedChats = useMemo(() => {
    const visibleChats = chats.filter(c => {
      const id = c.is_group ? c.group_id! : c.friend_id!;
      return !hiddenChats.includes(id) || id === activeChatFriendId;
    });
    const hasActiveChatInChats = visibleChats.some(c => (c.is_group ? c.group_id : c.friend_id) === activeChatFriendId);
    if (activeChatFriendId && !hasActiveChatInChats) {
      const activeFriend = friends.find(f => f.id === activeChatFriendId);
      if (activeFriend) {
        const tempSession: ChatSession = {
          friend_id: activeFriend.id,
          friend_name: remarks[activeFriend.id] || activeFriend.nickname || activeFriend.username,
          friend_avatar: activeFriend.avatar,
          last_message: '',
          last_msg_time: new Date().toISOString(),
          unread_count: 0,
          is_group: false,
        };
        return [tempSession, ...visibleChats];
      }
    }
    return visibleChats;
  }, [chats, activeChatFriendId, friends, hiddenChats, remarks]);

  // Find active chat details
  const activeChat = useMemo(() => {
    if (!activeChatFriendId) return null;
    return displayedChats.find(c => (c.is_group ? c.group_id : c.friend_id) === activeChatFriendId) || null;
  }, [activeChatFriendId, displayedChats]);

  const handleSend = (chatId: string, content: string) => {
    sendMessage(chatId, content, activeChat?.is_group);
  };

  const handleLoad = useCallback(async (chatId: string, isGroup?: boolean) => {
    await loadChatMessages(chatId, isGroup);
  }, [loadChatMessages]);

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev =>
      prev.includes(friendId) ? prev.filter(id => id !== friendId) : [...prev, friendId]
    );
  };

  const handleCreateGroupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFriends.length === 0) {
      alert("请选择至少一个好友加入群聊");
      return;
    }
    const newGroup = await createGroup(groupName.trim(), selectedFriends);
    if (newGroup) {
      setShowCreateGroupModal(false);
      setGroupName('');
      setSelectedFriends([]);
      const fallbackName = newGroup.name || newGroup.members.map((m: any) => m.nickname).join(', ');
      startChat(newGroup.id, fallbackName, true);
    }
  };

  return (
    <div className={`chat-page-container ${activeChatFriendId ? 'has-active-chat' : ''}`}>
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
        .chat-header {
          display: flex;
          align-items: center;
          height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          background: var(--bg);
        }
        .chat-header-title {
          font-weight: 700;
          font-size: 15px;
        }
        .create-group-btn {
          background: none;
          border: none;
          color: var(--text-dim);
          padding: 6px;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s, color 0.2s;
        }
        .create-group-btn:hover {
          background: var(--hover);
          color: var(--brand-blue);
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
        
        @media (max-width: 768px) {
          .chat-sidebar {
            width: 100% !important;
          }
          .chat-page-container.has-active-chat .chat-sidebar {
            display: none !important;
          }
          .chat-page-container:not(.has-active-chat) .chat-content-pane {
            display: none !important;
          }
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

        /* Modal styling */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          animation: fadeIn 0.2s ease-out;
        }
        .modal-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          width: 400px;
          max-width: 90%;
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.25);
          animation: slideUp 0.2s ease-out;
          overflow: hidden;
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--border);
        }
        .modal-title {
          font-weight: 700;
          font-size: 16px;
          color: var(--text);
        }
        .modal-close-btn {
          background: none;
          border: none;
          color: var(--text-dim);
          font-size: 24px;
          cursor: pointer;
          line-height: 1;
        }
        .modal-body {
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          overflow-y: auto;
          max-height: 55vh;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .form-group label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-dim);
        }
        .form-group input[type="text"] {
          border-radius: var(--radius);
          border: 1px solid var(--border);
          background: var(--bg);
          padding: 10px 14px;
          font-size: 14px;
          color: var(--text);
        }
        .friends-select-list {
          border: 1px solid var(--border);
          border-radius: var(--radius);
          max-height: 240px;
          overflow-y: auto;
          background: var(--bg);
        }
        .friend-select-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          cursor: pointer;
          border-bottom: 1px solid var(--border-light);
          transition: background-color 0.2s;
          color: var(--text);
        }
        .friend-select-item:hover {
          background: var(--hover);
        }
        .friend-select-item.selected {
          background: var(--hover);
        }
        .modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding: 16px;
          border-top: 1px solid var(--border);
          background: var(--bg);
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* Left Pane: Chat List */}
      <div className="chat-sidebar">
        <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <span className="chat-header-title">聊天</span>
          <button className="create-group-btn" onClick={() => setShowCreateGroupModal(true)} title="发起群聊">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </button>
        </div>
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
            chatId={activeChat.is_group ? activeChat.group_id! : activeChat.friend_id!}
            isGroup={activeChat.is_group}
            chatName={activeChat.is_group ? activeChat.group_name : (remarks[activeChat.friend_id!] || activeChat.friend_name)}
            chatAvatar={activeChat.is_group ? activeChat.group_avatar : activeChat.friend_avatar}
            messages={messages}
            onSend={handleSend}
            onLoad={handleLoad}
            onBack={() => setActiveChatFriendId(null)}
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
              在左侧会话列表中选择一个联系人或群组开始聊天，或者点击侧栏进入“联系人”页面添加好友。
            </div>
          </div>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className="modal-overlay" onClick={() => setShowCreateGroupModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">发起群聊</span>
              <button className="modal-close-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowCreateGroupModal(false)}><CloseIcon size={20} /></button>
            </div>
            <form onSubmit={handleCreateGroupSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label>群聊名称 (选填)</label>
                  <input
                    type="text"
                    placeholder="不填则自动使用成员昵称生成"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                  />
                </div>
                <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <label>选择成员 ({selectedFriends.length})</label>
                  <div className="friends-select-list">
                    {friends.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>
                        暂无可选择的好友，请先添加好友。
                      </div>
                    ) : (
                      friends.map(f => (
                        <div
                          key={f.id}
                          className={`friend-select-item ${selectedFriends.includes(f.id) ? 'selected' : ''}`}
                          onClick={() => toggleFriendSelection(f.id)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedFriends.includes(f.id)}
                            onChange={() => {}} // handled by container click
                            style={{ pointerEvents: 'none', marginRight: 8 }}
                          />
                          <Avatar name={remarks[f.id] || f.nickname} url={f.avatar} size={32} />
                          <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 8 }}>
                            {remarks[f.id] || f.nickname} (@{f.username})
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateGroupModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={selectedFriends.length === 0}>
                  确定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
