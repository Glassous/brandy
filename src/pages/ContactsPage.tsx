import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { Avatar } from '../components/shared/Avatar';
import { useToast } from '../components/shared/Toast';
import { API_BASE } from '../config';

function getFirstLetter(name: string): string {
  if (!name) return '#';
  const ch = name.charAt(0);
  if (/[A-Za-z]/.test(ch)) return ch.toUpperCase();
  if (/[0-9]/.test(ch)) return '#';
  if (/[\u4e00-\u9fff]/.test(ch)) {
    const code = ch.charCodeAt(0) - 0x4e00;
    const index = code % 26;
    return String.fromCharCode(65 + index);
  }
  return '#';
}

export function ContactsPage() {
  const { token, friends, friendRequests, handleFriendRequest, startChat, remarks, updateRemark, deleteFriend, deleteLocalChatHistory } = useApp();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [currentView, setCurrentView] = useState<'list' | 'requests' | 'detail' | 'groups'>('list');
  const [selectedFriend, setSelectedFriend] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (currentView === 'groups' && token) {
      setLoadingGroups(true);
      fetch(`${API_BASE}/api/groups`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        }
      })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setGroups(data);
        }
      })
      .catch(err => console.error(err))
      .finally(() => setLoadingGroups(false));
    }
  }, [currentView, token]);

  const location = useLocation();
  const state = location.state as { showDetailOfFriendId?: string } | null;

  const groupedFriends = useMemo(() => {
    const groups: Record<string, any[]> = {};
    for (const f of friends) {
      const remark = remarks[f.id];
      const displayName = remark ? `${remark} (${f.nickname})` : f.nickname;
      const letter = getFirstLetter(displayName);
      if (!groups[letter]) groups[letter] = [];
      groups[letter].push({ ...f, displayName });
    }
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });
    for (const key of sortedKeys) {
      groups[key].sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    return { keys: sortedKeys, groups };
  }, [friends, remarks]);

  const availableLetters = useMemo(() => {
    const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'.split('');
    return all.map(l => ({ letter: l, available: groupedFriends.keys.includes(l) }));
  }, [groupedFriends]);

  // Handle Android/browser back button for sub-views
  useEffect(() => {
    const onPopState = () => {
      if (currentView !== 'list') {
        setCurrentView('list');
        setSelectedFriend(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [currentView]);

  const fetchDetailedFriend = async (friendId: string, baseFriend: any) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/users/search?id=${friendId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const fullUser = await res.json();
        setSelectedFriend({
          ...baseFriend,
          ...fullUser,
          status: fullUser.bio || '开启新的一天！🌟'
        });
      }
    } catch (e) {
      console.error("Failed to fetch detailed profile", e);
    }
  };

  useEffect(() => {
    if (state?.showDetailOfFriendId) {
      const found = friends.find(f => f.id === state.showDetailOfFriendId) as any;
      if (found) {
        const detailedFriend = {
          ...found,
          status: found.status || '开启新的一天！🌟'
        };
        setSelectedFriend(detailedFriend);
        setCurrentView('detail');
        window.history.pushState({ view: 'detail' }, '');
        navigate(location.pathname, { replace: true, state: null });
        fetchDetailedFriend(found.id, detailedFriend);
      }
    }
  }, [state, friends, navigate, location.pathname, token]);

  const handleStartChat = (friendId: string, friendName: string) => {
    startChat(friendId, friendName);
    navigate('/chat');
  };

  const handleAcceptRequest = async (req: any) => {
    await handleFriendRequest(req.request_id, 'accepted');
    if (friendRequests.length <= 1) {
      setCurrentView('list');
    }
  };

  const handleIgnoreRequest = async (req: any) => {
    await handleFriendRequest(req.request_id, 'rejected');
    if (friendRequests.length <= 1) {
      setCurrentView('list');
    }
  };

  const handleFriendClick = (friend: any) => {
    const detailedFriend = {
      ...friend,
      status: friend.status || '开启新的一天！🌟'
    };
    setSelectedFriend(detailedFriend);
    setCurrentView('detail');
    window.history.pushState({ view: 'detail' }, '');
    fetchDetailedFriend(friend.id, detailedFriend);
  };

  const handleSetRemark = () => {
    if (!selectedFriend) return;
    const currentRemark = remarks[selectedFriend.id] || '';
    const newRemark = prompt('请输入好友备注名（留空则取消备注）：', currentRemark);
    if (newRemark !== null) {
      updateRemark(selectedFriend.id, newRemark);
      showToast('备注设置成功', 'success');
      setSelectedFriend((prev: any) => ({
        ...prev,
        remarkName: newRemark.trim() || undefined
      }));
    }
  };

  const handleDelete = async () => {
    if (!selectedFriend) return;
    const name = remarks[selectedFriend.id] || selectedFriend.nickname;
    if (confirm(`确定要删除好友 ${name} 吗？`)) {
      await deleteFriend(selectedFriend.id);
      setCurrentView('list');
      setSelectedFriend(null);
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      <style>{`
        .ct-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          background: var(--bg);
        }
        .ct-header-title {
          font-weight: 700;
          font-size: 15px;
        }
        .ct-header-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ct-requests-badge-btn {
          position: relative;
          background: var(--hover);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }
        .ct-requests-badge-btn:hover {
          background: var(--border);
        }
        .ct-badge-dot {
          background: var(--badge-unread);
          color: #FFFFFF;
          font-size: 9px;
          font-weight: 700;
          min-width: 16px;
          height: 16px;
          line-height: 16px;
          border-radius: 8px;
          padding: 0 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ct-add-btn {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--btn-bg);
          color: var(--btn-text);
          display: flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          transition: transform 0.1s;
        }
        .ct-add-btn:active {
          transform: scale(0.92);
        }

        .ct-back-btn {
          background: none;
          color: var(--text);
          padding: 6px;
          display: flex;
          align-items: center;
          border-radius: 50%;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .ct-back-btn:hover {
          background: var(--hover);
        }

        .ct-content {
          flex: 1;
          overflow-y: auto;
        }

        /* Friends list styles */
        .ct-item {
          display: flex;
          align-items: center;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          gap: 12px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        .ct-item:hover {
          background: var(--hover);
        }
        .ct-item-info {
          flex: 1;
          overflow: hidden;
        }
        .ct-item-name {
          font-weight: 600;
          font-size: 14px;
        }
        .ct-item-sub {
          font-size: 12px;
          color: var(--text-dim);
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ct-section-title {
          padding: 14px 16px 6px;
          font-size: 11px;
          font-weight: 700;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .ct-empty {
          padding: 48px 16px;
          text-align: center;
          color: var(--text-dim);
          font-size: 13px;
        }
        .ct-letter-header {
          padding: 8px 16px 4px;
          font-size: 12px;
          font-weight: 700;
          color: var(--brand-blue);
          background: var(--bg);
          position: sticky;
          top: 0;
          z-index: 1;
        }
        .ct-count-footer {
          text-align: center;
          padding: 20px 16px;
          font-size: 12px;
          color: var(--text-dim);
        }
        .ct-az-index {
          position: fixed;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          z-index: 10;
          user-select: none;
          -webkit-user-select: none;
        }
        .ct-az-letter {
          font-size: 10px;
          font-weight: 600;
          color: var(--brand-blue);
          padding: 1px 4px;
          cursor: pointer;
          line-height: 1.4;
          border-radius: 4px;
          transition: background 0.15s;
        }
        .ct-az-letter:active {
          background: var(--hover);
        }
        .ct-az-letter.disabled {
          color: var(--border);
          cursor: default;
          pointer-events: none;
        }

        /* Requests view styles */
        .ct-req-card {
          display: flex;
          align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          gap: 12px;
        }
        .ct-req-info {
          flex: 1;
          overflow: hidden;
        }
        .ct-req-name {
          font-weight: 600;
          font-size: 14px;
        }
        .ct-req-sub {
          font-size: 12px;
          color: var(--text-dim);
        }
        .ct-req-actions {
          display: flex;
          gap: 8px;
        }
        .ct-req-btn {
          font-size: 12px;
          font-weight: 600;
          padding: 8px 14px;
          border-radius: 20px;
        }

        /* Detail card styles */
        .ct-detail-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 24px;
          gap: 24px;
          text-align: center;
          max-width: 480px;
          width: 100%;
          margin: 0 auto;
        }
        .ct-detail-avatar-wrapper {
          position: relative;
        }
        .ct-detail-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .ct-detail-name {
          font-size: 20px;
          font-weight: 700;
          color: var(--text);
        }
        .ct-detail-username {
          font-size: 13px;
          color: var(--text-dim);
        }
        .ct-detail-divider {
          width: 80px;
          height: 1px;
          background: var(--border);
          margin: 12px auto;
        }
        .ct-detail-status {
          font-size: 14px;
          color: var(--text);
          background: var(--hover);
          padding: 12px 20px;
          border-radius: 16px;
          max-width: 280px;
          line-height: 1.4;
          word-break: break-word;
        }
        .ct-detail-action-btn {
          width: 100%;
          max-width: 240px;
          font-size: 14px;
          font-weight: 700;
          padding: 12px 24px;
          border-radius: 24px;
          margin-top: 12px;
        }
      `}</style>

      {/* RENDER VIEW: LIST */}
      {currentView === 'list' && (
        <>
          <div className="ct-header">
            <span className="ct-header-title">联系人</span>
            <div className="ct-header-actions">
              {friendRequests.length > 0 && (
                <button className="ct-requests-badge-btn" onClick={() => { setCurrentView('requests'); window.history.pushState({ view: 'requests' }, ''); }} title="查看好友申请">
                  <span>新申请</span>
                  <span className="ct-requests-badge-btn-count ct-badge-dot">{friendRequests.length}</span>
                </button>
              )}
              <Link to="/add-friend" className="ct-add-btn" title="添加好友">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </Link>
            </div>
          </div>

          <div className="ct-content" style={{ position: 'relative' }}>
            <div className="ct-item" onClick={() => { setCurrentView('groups'); window.history.pushState({ view: 'groups' }, ''); }}>
              <div className="ct-item-info">
                <div className="ct-item-name">群聊</div>
              </div>
            </div>

            {friends.length === 0 ? (
              <div className="ct-empty">暂无联系人</div>
            ) : (
              <>
                {groupedFriends.keys.map(letter => (
                  <div key={letter} id={`section-${letter}`}>
                    <div className="ct-letter-header">{letter}</div>
                    {groupedFriends.groups[letter].map((f: any) => (
                      <div key={f.id} className="ct-item" onClick={() => handleFriendClick(f)}>
                        <Avatar name={f.displayName} url={f.avatar} size={40} />
                        <div className="ct-item-info">
                          <div className="ct-item-name">{f.displayName}</div>
                          <div className="ct-item-sub">@{f.username}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                <div className="ct-count-footer">共 {friends.length} 位联系人</div>
              </>
            )}
            {friends.length > 0 && (
              <div className="ct-az-index">
                {availableLetters.map(({ letter, available }) => (
                  <span
                    key={letter}
                    className={`ct-az-letter ${available ? '' : 'disabled'}`}
                    onClick={() => {
                      if (available) {
                        document.getElementById(`section-${letter}`)?.scrollIntoView({ behavior: 'smooth' });
                      }
                    }}
                  >
                    {letter}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* RENDER VIEW: REQUESTS */}
      {currentView === 'requests' && (
        <>
          <div className="ct-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="ct-back-btn" onClick={() => navigate(-1)} title="返回">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <span className="ct-header-title">好友申请</span>
            </div>
            <span style={{ width: 24 }} />
          </div>

          <div className="ct-content">
            {friendRequests.length === 0 ? (
              <div className="ct-empty">暂无好友申请</div>
            ) : (
              friendRequests.map(req => (
                <div key={req.request_id} className="ct-req-card">
                  <Avatar name={req.sender_nickname} url={req.sender_avatar} size={40} />
                  <div className="ct-req-info">
                    <div className="ct-req-name">{req.sender_nickname}</div>
                    <div className="ct-req-sub">@{req.sender_username}</div>
                  </div>
                  <div className="ct-req-actions">
                    <button className="btn ct-req-btn" onClick={() => handleAcceptRequest(req)}>同意</button>
                    <button className="btn btn-secondary ct-req-btn" onClick={() => handleIgnoreRequest(req)}>忽略</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* RENDER VIEW: DETAIL */}
      {currentView === 'detail' && selectedFriend && (
        <>
          <div className="ct-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="ct-back-btn" onClick={() => navigate(-1)} title="返回">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <span className="ct-header-title">详细资料</span>
            </div>
            <span style={{ width: 24 }} />
          </div>

          <div className="ct-content">
            <div className="ct-detail-container">
              <div className="ct-detail-avatar-wrapper">
                <Avatar name={remarks[selectedFriend.id] || selectedFriend.nickname} url={selectedFriend.avatar} size={80} fontSize={32} />
              </div>
              <div className="ct-detail-info">
                <div className="ct-detail-name">{remarks[selectedFriend.id] || selectedFriend.nickname}</div>
                {remarks[selectedFriend.id] && (
                  <div className="ct-detail-username" style={{ marginTop: -2, marginBottom: 4 }}>昵称: {selectedFriend.nickname}</div>
                )}
                <div className="ct-detail-username">@{selectedFriend.username}</div>
                <div className="ct-detail-divider" />
                <div className="ct-detail-status">
                  {selectedFriend.status}
                </div>
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, textAlign: 'left', width: '100%', background: 'var(--hover)', padding: 12, borderRadius: 12, border: '1px solid var(--border)' }}>
                  <div><strong>性别：</strong>{selectedFriend.gender || '（保密）'}</div>
                  <div><strong>生日：</strong>{selectedFriend.birthday || '（未设置）'}</div>
                  <div><strong>地区：</strong>{[selectedFriend.country, selectedFriend.city].filter(Boolean).join(' - ') || '（未知）'}</div>
                  <div><strong>网站：</strong>{selectedFriend.website ? <a href={selectedFriend.website} target="_blank" rel="noreferrer" style={{color: 'var(--brand-blue)', wordBreak: 'break-all'}}>{selectedFriend.website}</a> : '（无）'}</div>
                  <div><strong>职业：</strong>{selectedFriend.job || '（未设置）'}</div>
                </div>
              </div>
              
              <div style={{ width: '100%', maxWidth: 240, display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                <button 
                  className="btn ct-detail-action-btn" 
                  onClick={() => handleStartChat(selectedFriend.id, remarks[selectedFriend.id] || selectedFriend.nickname)}
                  style={{ width: '100%' }}
                >
                  发消息
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleSetRemark}
                  style={{ width: '100%', borderRadius: 24, padding: '12px 24px' }}
                >
                  设置备注
                </button>
                <button 
                  className="btn btn-secondary" 
                  onClick={async () => {
                    if (confirm("确定要清除与该好友在当前浏览器上的聊天记录吗？此操作不可恢复。")) {
                      await deleteLocalChatHistory(selectedFriend.id);
                    }
                  }}
                  style={{ width: '100%', borderRadius: 24, padding: '12px 24px', background: 'var(--hover)', color: 'var(--badge-unread)' }}
                >
                  清除本地聊天记录
                </button>
                <button 
                  className="btn btn-danger" 
                  onClick={handleDelete}
                  style={{ width: '100%', borderRadius: 24, padding: '12px 24px' }}
                >
                  删除好友
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* RENDER VIEW: GROUPS */}
      {currentView === 'groups' && (
        <>
          <div className="ct-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="ct-back-btn" onClick={() => navigate(-1)} title="返回">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </button>
              <span className="ct-header-title">群聊</span>
            </div>
            <span style={{ width: 24 }} />
          </div>

          <div className="ct-content">
            {loadingGroups ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                <span>加载中...</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="ct-empty">暂无加入的群聊</div>
            ) : (
              groups.map(group => (
                <div key={group.id} className="ct-item" onClick={() => {
                  startChat(group.id, group.name, true);
                  navigate('/chat');
                }}>
                  <Avatar name={group.name} url={group.avatar} size={40} />
                  <div className="ct-item-info">
                    <div className="ct-item-name">{group.name}</div>
                    <div className="ct-item-sub">成员: {group.members?.length || 0}人</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
