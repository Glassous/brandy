import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { useToast } from '../components/shared/Toast';
import { API_BASE, getWsUrl } from '../config';
import { LocalChatDB } from '../utils/indexedDB';

export interface User {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export interface ChatSession {
  friend_id: string;
  friend_name: string;
  friend_remark?: string;
  friend_avatar?: string;
  last_message: string;
  last_msg_time: string;
  unread_count: number;
}

export interface Friend {
  id: string;
  username: string;
  nickname: string;
  remark?: string;
  avatar?: string;
}

export interface FriendRequest {
  request_id: string;
  sender_id: string;
  sender_username: string;
  sender_nickname: string;
  sender_avatar?: string;
  created_at: string;
}

interface AppCtx {
  token: string | null;
  user: User | null;
  chats: ChatSession[];
  friends: Friend[];
  friendRequests: FriendRequest[];
  messages: Message[];
  activeChatFriendId: string | null;
  setActiveChatFriendId: (id: string | null) => void;
  login: (token: string, user: User) => void;
  logout: () => void;
  sendMessage: (receiverId: string, content: string) => void;
  loadChatMessages: (friendId: string) => Promise<void>;
  addFriend: (username: string) => Promise<boolean>;
  handleFriendRequest: (requestId: string, status: 'accepted' | 'rejected') => Promise<void>;
  deleteFriend: (friendId: string) => Promise<void>;
  updateNickname: (newNickname: string) => Promise<boolean>;
  uploadAvatar: (file: File) => Promise<string | null>;
  startChat: (friendId: string, friendName: string) => void;
  fetchChats: () => Promise<void>;
  fetchFriends: () => Promise<void>;
  fetchFriendRequests: () => Promise<void>;
  hiddenChats: string[];
  remarks: Record<string, string>;
  pinnedChats: string[];
  hideChat: (friendId: string) => void;
  updateRemark: (friendId: string, remarkName: string) => void;
  togglePinChat: (friendId: string) => void;
  deleteLocalChatHistory: (friendId: string) => Promise<void>;
  deleteAllLocalChatHistories: () => Promise<void>;
  deleteLocalMessage: (messageId: string) => Promise<void>;
  deleteLocalMessages: (messageIds: string[]) => Promise<void>;
}

const AppContext = createContext<AppCtx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();

  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [user, setUser] = useState<User | null>(() => {
    try {
      const s = localStorage.getItem('user');
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const [activeChatFriendId, setActiveChatFriendId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSession[]>([]);

  const activeChatFriendIdRef = useRef<string | null>(null);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    activeChatFriendIdRef.current = activeChatFriendId;
  }, [activeChatFriendId]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [hiddenChats, setHiddenChats] = useState<string[]>([]);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [pinnedChats, setPinnedChats] = useState<string[]>([]);

  // Sync state with localStorage based on logged-in user
  useEffect(() => {
    if (user) {
      try {
        const h = localStorage.getItem(`brandy_hidden_chats_${user.id}`);
        setHiddenChats(h ? JSON.parse(h) : []);
      } catch { setHiddenChats([]); }

      try {
        const r = localStorage.getItem(`brandy_remarks_${user.id}`);
        setRemarks(r ? JSON.parse(r) : {});
      } catch { setRemarks({}); }

      try {
        const p = localStorage.getItem(`brandy_pinned_chats_${user.id}`);
        setPinnedChats(p ? JSON.parse(p) : []);
      } catch { setPinnedChats([]); }
    } else {
      setHiddenChats([]);
      setRemarks({});
      setPinnedChats([]);
    }
  }, [user]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const localDbRef = useRef<LocalChatDB | null>(null);

  // Manage IndexedDB connection based on logged-in user
  useEffect(() => {
    if (user) {
      const db = new LocalChatDB(user.id);
      db.open()
        .then(() => {
          localDbRef.current = db;
        })
        .catch((err) => {
          console.error("Failed to open IndexedDB", err);
        });
      return () => {
        db.close();
        localDbRef.current = null;
      };
    } else {
      localDbRef.current = null;
    }
  }, [user]);

  const getHeaders = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  const fetchChats = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/chats`, { headers: getHeaders });
      if (res.ok) setChats(await res.json());
    } catch { /* ignore */ }
  }, [token, getHeaders]);

  const fetchFriends = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/friends`, { headers: getHeaders });
      if (res.ok) {
        const data: Friend[] = await res.json();
        setFriends(data);
        // Sync remarks from backend
        const r: Record<string, string> = {};
        data.forEach(f => {
          if (f.remark) {
            r[f.id] = f.remark;
          }
        });
        setRemarks(r);
      }
    } catch { /* ignore */ }
  }, [token, getHeaders]);

  const fetchFriendRequests = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/friends/requests`, { headers: getHeaders });
      if (res.ok) setFriendRequests(await res.json());
    } catch { /* ignore */ }
  }, [token, getHeaders]);

  const loadChatMessages = useCallback(async (friendId: string) => {
    if (!token) return;

    const db = localDbRef.current;
    let localMsgs: Message[] = [];
    let deletedBefore: string | null = null;
    let lastSyncTime: string | null = null;

    if (db) {
      try {
        const syncState = await db.getSyncState(friendId);
        deletedBefore = syncState.deleted_before;
        lastSyncTime = syncState.last_sync_time;
        localMsgs = await db.getMessages(friendId, deletedBefore);
        setMessages(localMsgs);
        setChats(prev => prev.map(c => c.friend_id === friendId ? { ...c, unread_count: 0 } : c));
      } catch (err) {
        console.error("Failed to load local chat history", err);
      }
    }

    try {
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const since = (!lastSyncTime || lastSyncTime < threeDaysAgo) ? threeDaysAgo : lastSyncTime;

      const res = await fetch(`${API_BASE}/api/chats/${friendId}/messages?since=${since}`, { headers: getHeaders });
      if (res.ok) {
        const serverMsgs: Message[] = await res.json();
        if (db && serverMsgs.length > 0) {
          const messagesToSave = serverMsgs.map(m => ({ ...m, friend_id: friendId }));
          await db.saveMessages(messagesToSave);
          
          const maxTime = serverMsgs.reduce((max, m) => m.created_at > max ? m.created_at : max, since);
          await db.updateSyncState({
            friend_id: friendId,
            last_sync_time: maxTime,
            deleted_before: deletedBefore
          });
        }

        if (db) {
          const updatedMsgs = await db.getMessages(friendId, deletedBefore);
          setMessages(updatedMsgs);
        } else {
          setMessages(serverMsgs);
        }

        setChats(prev => prev.map(c => c.friend_id === friendId ? { ...c, unread_count: 0 } : c));
        fetchChats();
      }
    } catch (err) {
      console.warn("Failed to fetch incremental history, offline mode", err);
    }
  }, [token, getHeaders, fetchChats]);

  const addFriend = useCallback(async (targetUsername: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${API_BASE}/api/friends/request`, {
        method: 'POST',
        headers: getHeaders,
        body: JSON.stringify({ username: targetUsername }),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || '发送失败', 'error'); return false; }
      showToast(data.message || '申请已发送', 'success');
      fetchFriendRequests();
      return true;
    } catch { showToast('网络错误', 'error'); return false; }
  }, [token, getHeaders, fetchFriendRequests, showToast]);

  const handleFriendRequest = useCallback(async (requestId: string, status: 'accepted' | 'rejected') => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/friends/requests/${requestId}`, {
        method: 'PUT',
        headers: getHeaders,
        body: JSON.stringify({ status }),
      });
      if (!res.ok) { showToast((await res.json()).error || '处理失败', 'error'); return; }
      showToast(status === 'accepted' ? '已接受' : '已拒绝', 'success');
      fetchFriendRequests();
      fetchFriends();
      fetchChats();
    } catch { showToast('网络错误', 'error'); }
  }, [token, getHeaders, fetchFriendRequests, fetchFriends, fetchChats, showToast]);

  const hideChat = useCallback((friendId: string) => {
    if (!user) return;
    setHiddenChats(prev => {
      const next = prev.includes(friendId) ? prev : [...prev, friendId];
      localStorage.setItem(`brandy_hidden_chats_${user.id}`, JSON.stringify(next));
      return next;
    });
  }, [user]);

  const updateRemark = useCallback(async (friendId: string, remarkName: string) => {
    if (!token || !user) return;
    try {
      const res = await fetch(`${API_BASE}/api/friends/${friendId}/remark`, {
        method: 'PUT',
        headers: getHeaders,
        body: JSON.stringify({ remark: remarkName.trim() }),
      });
      if (res.ok) {
        setRemarks(prev => {
          const next = { ...prev };
          if (remarkName.trim() === '') {
            delete next[friendId];
          } else {
            next[friendId] = remarkName.trim();
          }
          localStorage.setItem(`brandy_remarks_${user.id}`, JSON.stringify(next));
          return next;
        });
        fetchFriends();
        fetchChats();
      } else {
        showToast('更新备注失败', 'error');
      }
    } catch {
      showToast('更新备注失败，网络异常', 'error');
    }
  }, [token, user, getHeaders, fetchFriends, fetchChats, showToast]);

  const togglePinChat = useCallback((friendId: string) => {
    if (!user) return;
    setPinnedChats(prev => {
      const next = prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId];
      localStorage.setItem(`brandy_pinned_chats_${user.id}`, JSON.stringify(next));
      return next;
    });
  }, [user]);

  const deleteFriend = useCallback(async (friendId: string) => {
    if (!token || !user) return;
    try {
      const res = await fetch(`${API_BASE}/api/friends/${friendId}`, { method: 'DELETE', headers: getHeaders });
      if (!res.ok) { showToast((await res.json()).error || '删除失败', 'error'); return; }
      showToast('已删除', 'success');
      setActiveChatFriendId(null);

      // Clean up local friend metadata
      hideChat(friendId);
      
      // Clean up remark locally
      setRemarks(prev => {
        const next = { ...prev };
        delete next[friendId];
        localStorage.setItem(`brandy_remarks_${user.id}`, JSON.stringify(next));
        return next;
      });

      setPinnedChats(prev => {
        const next = prev.filter(id => id !== friendId);
        localStorage.setItem(`brandy_pinned_chats_${user.id}`, JSON.stringify(next));
        return next;
      });

      fetchFriends();
      fetchChats();
    } catch { showToast('网络错误', 'error'); }
  }, [token, user, getHeaders, fetchFriends, fetchChats, showToast, hideChat]);

  const updateNickname = useCallback(async (newNickname: string): Promise<boolean> => {
    if (!token || !user) return false;
    try {
      const res = await fetch(`${API_BASE}/api/user/profile`, {
        method: 'PUT',
        headers: getHeaders,
        body: JSON.stringify({ nickname: newNickname }),
      });
      if (!res.ok) { showToast((await res.json()).error || '修改失败', 'error'); return false; }
      const u = { ...user, nickname: newNickname };
      setUser(u);
      localStorage.setItem('user', JSON.stringify(u));
      fetchChats();
      return true;
    } catch { showToast('网络错误', 'error'); return false; }
  }, [token, user, getHeaders, fetchChats, showToast]);

  const uploadAvatar = useCallback(async (file: File): Promise<string | null> => {
    if (!token || !user) return null;
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch(`${API_BASE}/api/user/avatar`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || '上传头像失败', 'error');
        return null;
      }

      const u = { ...user, avatar: data.avatar };
      setUser(u);
      localStorage.setItem('user', JSON.stringify(u));
      
      showToast('头像已更新', 'success');
      fetchChats();
      fetchFriends();
      return data.avatar;
    } catch {
      showToast('网络错误，上传失败', 'error');
      return null;
    }
  }, [token, user, fetchChats, fetchFriends, showToast]);

  const startChat = useCallback((friendId: string, friendName: string) => {
    if (user) {
      setHiddenChats(prev => {
        if (prev.includes(friendId)) {
          const next = prev.filter(id => id !== friendId);
          localStorage.setItem(`brandy_hidden_chats_${user.id}`, JSON.stringify(next));
          return next;
        }
        return prev;
      });
    }
    setChats(prev => {
      if (prev.some(c => c.friend_id === friendId)) return prev;
      return [{
        friend_id: friendId,
        friend_name: friendName,
        last_message: '',
        last_msg_time: new Date().toISOString(),
        unread_count: 0,
      }, ...prev];
    });
    setActiveChatFriendId(friendId);
  }, [user]);

  const sendMessage = useCallback((receiverId: string, content: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: 'message',
        data: { receiver_id: receiverId, content },
      }));
    } else {
      showToast('消息发送失败，正在重连...', 'error');
    }
  }, [showToast]);

  const login = useCallback((newToken: string, loggedUser: User) => {
    setToken(newToken);
    setUser(loggedUser);
    localStorage.setItem('token', newToken);
    localStorage.setItem('user', JSON.stringify(loggedUser));
    setActiveChatFriendId(null);
  }, []);

  const logout = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    setToken(null);
    setUser(null);
    setChats([]);
    setFriends([]);
    setFriendRequests([]);
    setMessages([]);
    setActiveChatFriendId(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    showToast('已登出', 'info');
  }, [showToast]);

  const deleteLocalChatHistory = useCallback(async (friendId: string) => {
    const db = localDbRef.current;
    if (!db) return;
    try {
      const session = chats.find(c => c.friend_id === friendId);
      const nowStr = session?.last_msg_time || new Date().toISOString();
      await db.clearMessages(friendId);
      const current = await db.getSyncState(friendId);
      await db.updateSyncState({
        ...current,
        deleted_before: nowStr
      });
      if (activeChatFriendId === friendId) {
        setMessages([]);
      }
      hideChat(friendId);
      showToast("本地聊天记录已清除", "success");
      fetchChats();
    } catch (err) {
      console.error(err);
      showToast("清除聊天记录失败", "error");
    }
  }, [activeChatFriendId, chats, hideChat, fetchChats, showToast]);

  const deleteAllLocalChatHistories = useCallback(async () => {
    const db = localDbRef.current;
    if (!db || !user) return;
    try {
      const bufferTime = new Date(Date.now() - 5000).toISOString();
      await db.clearAllMessages();
      await db.updateAllSyncStates(bufferTime);
      setMessages([]);
      
      const allFriendIds = chats.map(c => c.friend_id);
      setHiddenChats(allFriendIds);
      localStorage.setItem(`brandy_hidden_chats_${user.id}`, JSON.stringify(allFriendIds));

      showToast("所有本地聊天记录已清除", "success");
      fetchChats();
    } catch (err) {
      console.error(err);
      showToast("清除所有聊天记录失败", "error");
    }
  }, [user, chats, fetchChats, showToast]);

  const deleteLocalMessage = useCallback(async (messageId: string) => {
    const db = localDbRef.current;
    if (!db) return;
    try {
      await db.deleteMessage(messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
      showToast("消息已删除", "success");
      fetchChats();
    } catch (err) {
      console.error(err);
      showToast("删除消息失败", "error");
    }
  }, [fetchChats, showToast]);

  const deleteLocalMessages = useCallback(async (messageIds: string[]) => {
    const db = localDbRef.current;
    if (!db) return;
    try {
      await db.deleteMessages(messageIds);
      setMessages(prev => prev.filter(m => !messageIds.includes(m.id)));
      showToast("选中的消息已删除", "success");
      fetchChats();
    } catch (err) {
      console.error(err);
      showToast("删除消息失败", "error");
    }
  }, [fetchChats, showToast]);

  // WebSocket connection
  useEffect(() => {
    if (!token) return;

    const connect = () => {
      if (wsRef.current) return;
      const ws = new WebSocket(getWsUrl(token));
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.event === 'message') {
            const m: Message = msg.data;
            const currentUser = userRef.current;
            const currentActiveFriendId = activeChatFriendIdRef.current;

            if (currentUser) {
              const partnerId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
              
              // Save received message to IndexedDB and update sync_states
              const db = localDbRef.current;
              if (db) {
                db.saveMessages([{ ...m, friend_id: partnerId }]).then(async () => {
                  const state = await db.getSyncState(partnerId);
                  await db.updateSyncState({
                    ...state,
                    last_sync_time: m.created_at
                  });
                }).catch(err => {
                  console.error("Failed to save real-time message to IndexedDB", err);
                });
              }

              // Auto show hidden chat on new message
              setHiddenChats(prev => {
                if (prev.includes(partnerId)) {
                  const next = prev.filter(id => id !== partnerId);
                  localStorage.setItem(`brandy_hidden_chats_${currentUser.id}`, JSON.stringify(next));
                  return next;
                }
                return prev;
              });

              // Only append to active chat room messages to avoid cross-chat bleeding
              if (partnerId === currentActiveFriendId) {
                setMessages(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
              }
            }
            fetchChats();
          }
        } catch { /* ignore */ }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (token) reconnectRef.current = window.setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    };

    connect();

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      if (reconnectRef.current) { clearTimeout(reconnectRef.current); reconnectRef.current = null; }
    };
  }, [token, fetchChats]);

  // Initial data load
  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (token && !initialLoadDone.current) {
      initialLoadDone.current = true;
      fetchChats();
      fetchFriends();
      fetchFriendRequests();
    }
    if (!token) initialLoadDone.current = false;
  }, [token, fetchChats, fetchFriends, fetchFriendRequests]);

  // Periodic poll friend requests
  useEffect(() => {
    if (!token) return;
    const i = setInterval(fetchFriendRequests, 15000);
    return () => clearInterval(i);
  }, [token, fetchFriendRequests]);

  return (
    <AppContext.Provider value={{
      token, user, chats, friends, friendRequests, messages,
      activeChatFriendId, setActiveChatFriendId,
      login, logout, sendMessage, loadChatMessages,
      addFriend, handleFriendRequest, deleteFriend, updateNickname, startChat,
      fetchChats, fetchFriends, fetchFriendRequests,
      hiddenChats, remarks, pinnedChats, hideChat, updateRemark, togglePinChat,
      uploadAvatar,
      deleteLocalChatHistory,
      deleteAllLocalChatHistories,
      deleteLocalMessage,
      deleteLocalMessages,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
}
