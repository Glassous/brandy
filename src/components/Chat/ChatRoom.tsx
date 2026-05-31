import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../shared/Avatar';
import { CloseIcon, BackIcon, InviteIcon, AdminIcon, KickIcon, BotIcon, HorizontalDotsIcon } from '../shared/Icons';
import { useApp, type Message } from '../../contexts/AppContext';
import { useToast } from '../shared/Toast';
import { API_BASE } from '../../config';
import COS from 'cos-js-sdk-v5';
import { calculateContextMenuPosition, calculatePopoverPosition } from '../../utils/popupPosition';
import CloudFilePicker from './CloudFilePicker';
import PendingFilesBar, { type PendingFile } from './PendingFilesBar';
import ChatBundleCard from './ChatBundleCard';
import MediaPreviewModal from './MediaPreviewModal';
import { ChatMediaContext, type MediaItem } from './ChatMediaContext';
import { Folder, File, Trash2, Upload, Plus, Edit3, ArrowLeft } from 'lucide-react';

interface ChatRoomProps {
  currentUserId: string;
  chatId: string;
  isGroup?: boolean;
  chatName?: string;
  chatAvatar?: string;
  messages: Message[];
  onSend: (chatId: string, content: string) => void;
  onLoad: (chatId: string, isGroup?: boolean) => Promise<void>;
  onBack?: () => void;
  highlightedMessageId?: string | null;
  onClearHighlight?: () => void;
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
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  
  const isToday = d.toDateString() === now.toDateString();
  
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  
  const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  
  if (isToday) {
    return timeStr;
  } else if (isYesterday) {
    return `昨天 ${timeStr}`;
  } else if (d.getFullYear() === now.getFullYear()) {
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${timeStr}`;
  } else {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${timeStr}`;
  }
}

interface ChatFileData {
  type: 'chat_file';
  file_name: string;
  file_size: number;
  file_type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  cos_key: string;
  uploading?: boolean;
  progress?: number;
}

export const getThumbnailUrl = (url: string, fileType: string) => {
  if (!url) return '';
  if (fileType !== 'image') return url;
  if (url.startsWith('blob:')) return url;
  if (url.includes('myqcloud.com') || url.includes('/api/chat/download') || url.startsWith('http')) {
    if (url.includes('?')) {
      return url.includes('imageMogr2') ? url : `${url}&imageMogr2/thumbnail/360x`;
    }
    return `${url}?imageMogr2/thumbnail/360x`;
  }
  return url;
};

// ── ChatFileCard ─────────────────────────────────────────────────────────────
// Simplified: no local modal or transfer state — everything is handled by the
// global MediaPreviewModal (via ChatMediaContext) which lives in ChatRoom.
function ChatFileCard({ data }: { data: ChatFileData }) {
  const { openViewer } = React.useContext(ChatMediaContext);

  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  };

  // ── Uploading states ──────────────────────────────────────────────────────
  if (data.uploading) {
    if (data.file_type === 'image') {
      return (
        <div className="chat-file-bubble media-preview uploading" style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px' }}>
          <div style={{ position: 'relative', width: '220px', height: '180px' }}>
            <img src={data.url} alt={data.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '8px', opacity: 0.7 }} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', gap: '8px' }}>
              <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{data.progress || 0}%</span>
            </div>
          </div>
        </div>
      );
    }
    if (data.file_type === 'video') {
      return (
        <div className="chat-file-bubble media-preview uploading" style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', width: '260px', height: '200px' }}>
          <video src={data.url} preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.7 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', gap: '8px' }}>
            <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>{data.progress || 0}%</span>
          </div>
        </div>
      );
    }
    // Audio / file uploading
    return (
      <div className="chat-file-bubble uploading" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 16, height: 16, border: '2px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--brand-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>正在发送 {data.file_name} ...</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: 4, background: 'var(--border-light)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${data.progress || 0}%`, height: '100%', background: 'var(--brand-blue)', transition: 'width 0.1s' }} />
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{data.progress || 0}%</span>
        </div>
      </div>
    );
  }

  // ── Delivered states — open global viewer on click ─────────────────────────
  if (data.file_type === 'image') {
    return (
      <div
        className="chat-file-bubble media-preview"
        style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', cursor: 'pointer' }}
        onClick={() => openViewer(data.url)}
      >
        <div style={{ width: '220px', height: '180px' }}>
          <img
            src={getThumbnailUrl(data.url, 'image')}
            alt={data.file_name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '8px' }}
          />
        </div>
      </div>
    );
  }

  if (data.file_type === 'video') {
    return (
      <div
        className="chat-file-bubble media-preview"
        style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', width: '260px', height: '200px', cursor: 'pointer' }}
        onClick={() => openViewer(data.url)}
      >
        <video src={data.url} preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </div>
        </div>
      </div>
    );
  }

  if (data.file_type === 'audio') {
    // Inline player stays; click on the label row opens viewer for download/save options
    return (
      <div className="chat-file-bubble media-preview" style={{ minWidth: '240px', background: 'var(--hover)', borderRadius: '8px', padding: '8px 10px' }}>
        <audio src={data.url} controls style={{ width: '100%', height: '32px', display: 'block' }} />
      </div>
    );
  }

  // Generic file card
  return (
    <div
      className="chat-file-bubble file-card"
      style={{ cursor: 'pointer', minWidth: '200px', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }}
      onClick={() => openViewer(data.url)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ color: 'var(--brand-blue)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }} title={data.file_name}>{data.file_name}</span>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{formatBytes(data.file_size)}</span>
        </div>
      </div>
    </div>
  );
}

export function ChatRoom({ currentUserId, chatId, isGroup, chatName, chatAvatar, messages, onSend, onLoad, onBack, highlightedMessageId, onClearHighlight }: ChatRoomProps) {
  const [text, setText] = useState('');
  // Group settings view tab state
  const [settingsTab, setSettingsTab] = useState<'main' | 'drive' | 'logs'>('main');

  // Group Shared Drive States
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [driveItems, setDriveItems] = useState<any[]>([]);
  const [driveBreadcrumbs, setDriveBreadcrumbs] = useState<any[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [showNewDriveFolder, setShowNewDriveFolder] = useState(false);
  const [newDriveFolderName, setNewDriveFolderName] = useState('');
  const groupDriveFileInputRef = useRef<HTMLInputElement>(null);
  const [driveUploading, setDriveUploading] = useState(false);
  const [driveUploadProgress, setDriveUploadProgress] = useState(0);

  // Group Audit Logs States
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // AI Member Editing States
  const [editingAI, setEditingAI] = useState<any>(null);
  const [editingAIName, setEditingAIName] = useState('');
  const [editingAIPersonality, setEditingAIPersonality] = useState('');
  const [editingAIAvatar, setEditingAIAvatar] = useState('');
  const editingAIAvatarInputRef = useRef<HTMLInputElement>(null);
  const [aiAvatarUploading, setAiAvatarUploading] = useState(false);

  // Group Avatar Input
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);

  // Chat drag and drop upload
  const [chatDragging, setChatDragging] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const {
    token,
    deleteLocalMessage,
    deleteLocalMessages,
    chats,
    friends,
    remarks,
    sendMessage,
    sendQuoteMessage,
    recallMessage,
    editMessage,
    fetchGroupDetail,
    updateGroupName,
    addGroupMembers,
    removeGroupMember,
    addGroupAdmin,
    removeGroupAdmin,
    addAIMember,
    getAIMembers,
    removeAIMember,
    updateGroupAnnouncement,
    dissolveGroup,
    muteAllGroup,
    muteGroupMember,
    groupUpdateTrigger,
    fetchChats
  } = useApp();
  const { showToast } = useToast();

  const [tempMessages, setTempMessages] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, messageId: string, content: string, senderId: string, createdAt: string } | null>(null);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // Edit / Quote State
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [quotedMsg, setQuotedMsg] = useState<Message | null>(null);

  // Group Details & Settings Drawer State
  const [groupDetail, setGroupDetail] = useState<any>(null);
  const [showGroupSettings, setShowGroupSettings] = useState(false);

  // Invite Members Modal State
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedInviteFriends, setSelectedInviteFriends] = useState<string[]>([]);

  // Forward Modal State
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [messagesToForward, setMessagesToForward] = useState<string[]>([]);
  const [forwardTargets, setForwardTargets] = useState<{ id: string, name: string, isGroup: boolean }[]>([]);

  // AI Members State
  const [aiMembers, setAIMembers] = useState<any[]>([]);
  const [showAddAIModal, setShowAddAIModal] = useState(false);
  const [aiName, setAIName] = useState('');
  const [aiPersonality, setAIPersonality] = useState('');

  // Member Action Popover State
  const [activeMemberMenuId, setActiveMemberMenuId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  // Upload Menu & Cloud Picker
  const [showUploadMenu, setShowUploadMenu] = useState(false);
  const [showCloudPicker, setShowCloudPicker] = useState(false);
  const uploadMenuRef = useRef<HTMLDivElement>(null);

  // Pending Files
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [sendMode, setSendMode] = useState<'independent' | 'combined'>('independent');

  // Mention List State
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const mentionListRef = useRef<HTMLDivElement>(null);

  // ── Global Media Viewer ─────────────────────────────────────────────────────
  // Collect all delivered media items (chat_file + chat_bundle files) in order.
  const allChatMedia = useMemo<MediaItem[]>(() => {
    const media: MediaItem[] = [];
    for (const m of messages) {
      if (!m.content?.startsWith('{')) continue;
      try {
        const parsed = JSON.parse(m.content);
        if (parsed.type === 'chat_file' && !parsed.uploading && parsed.url) {
          media.push({
            url: parsed.url,
            file_name: parsed.file_name,
            file_size: parsed.file_size,
            file_type: parsed.file_type as MediaItem['file_type'],
            cos_key: parsed.cos_key,
          });
        } else if (parsed.type === 'chat_bundle' && Array.isArray(parsed.files)) {
          for (const f of parsed.files) {
            if (!f.uploading && f.url) {
              media.push({
                url: f.url,
                file_name: f.file_name,
                file_size: f.file_size,
                file_type: f.file_type as MediaItem['file_type'],
                cos_key: f.cos_key,
              });
            }
          }
        }
      } catch { /* ignore malformed JSON */ }
    }
    return media;
  }, [messages]);

  // URL of the currently viewed media (null = viewer closed)
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  const viewerIndex = useMemo(() => {
    if (!viewerUrl) return 0;
    const idx = allChatMedia.findIndex(m => m.url === viewerUrl);
    return idx === -1 ? 0 : idx;
  }, [viewerUrl, allChatMedia]);

  const openMediaViewer = useCallback((url: string) => {
    setViewerUrl(url);
  }, []);

  const handleViewerIndexChange = useCallback((idx: number) => {
    if (idx >= 0 && idx < allChatMedia.length) {
      setViewerUrl(allChatMedia[idx].url);
    }
  }, [allChatMedia]);

  // Initialize chat settings when switching channels
  useEffect(() => {
    onLoad(chatId, isGroup);
    setShowGroupSettings(false);
    setPendingFiles([]);
  }, [chatId, isGroup, onLoad]);

  // Handle Android/browser back button for group settings overlay
  useEffect(() => {
    const onPopState = () => {
      if (showGroupSettings) {
        setShowGroupSettings(false);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [showGroupSettings]);

  const refreshGroupDetail = useCallback(async () => {
    if (isGroup) {
      const detail = await fetchGroupDetail(chatId);
      setGroupDetail(detail);
      const aiMembersList = await getAIMembers(chatId);
      setAIMembers(aiMembersList || []);
    } else {
      setGroupDetail(null);
      setAIMembers([]);
    }
  }, [chatId, isGroup, fetchGroupDetail, getAIMembers]);

  // Load chat and fetch group info
  useEffect(() => {
    refreshGroupDetail();
    if (isGroup) {
      getAIMembers(chatId).then(list => setAIMembers(list || []));
    } else {
      setAIMembers([]);
    }
  }, [chatId, isGroup, refreshGroupDetail, getAIMembers, groupUpdateTrigger]);

  // Global message highlight and scrolling
  useEffect(() => {
    if (highlightedMessageId && messages.length > 0) {
      // Find the element and scroll to it
      setTimeout(() => {
        const el = document.getElementById(`msg-${highlightedMessageId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('highlight-flash');
          setTimeout(() => {
            el.classList.remove('highlight-flash');
            onClearHighlight?.();
          }, 2000);
        }
      }, 300);
    }
  }, [highlightedMessageId, messages, onClearHighlight]);

  // Group Shared Drive fetch functions
  const fetchDriveItems = useCallback(async (folderId: string | null) => {
    if (!token || !isGroup) return;
    setDriveLoading(true);
    try {
      const parentId = folderId || 'root';
      const res = await fetch(`${API_BASE}/api/disk/items?parent_id=${parentId}&group_id=${chatId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDriveItems(await res.json());
      }
    } catch { /* ignore */ }
    finally { setDriveLoading(false); }
  }, [token, chatId, isGroup]);

  const fetchDriveBreadcrumbs = useCallback(async (folderId: string | null) => {
    if (!token || !folderId) {
      setDriveBreadcrumbs([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/disk/folders/${folderId}/path`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDriveBreadcrumbs(await res.json());
      }
    } catch { /* ignore */ }
  }, [token]);

  // Fetch drive items reactive
  useEffect(() => {
    if (isGroup && showGroupSettings && settingsTab === 'drive') {
      fetchDriveItems(driveFolderId);
      fetchDriveBreadcrumbs(driveFolderId);
    }
  }, [isGroup, showGroupSettings, settingsTab, driveFolderId, fetchDriveItems, fetchDriveBreadcrumbs]);

  // Group Audit Logs fetch
  const fetchAuditLogs = useCallback(async () => {
    if (!token || !isGroup) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/groups/${chatId}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setAuditLogs(await res.json());
      }
    } catch { /* ignore */ }
    finally { setLogsLoading(false); }
  }, [token, chatId, isGroup]);

  useEffect(() => {
    if (isGroup && showGroupSettings && settingsTab === 'logs') {
      fetchAuditLogs();
    }
  }, [isGroup, showGroupSettings, settingsTab, fetchAuditLogs]);

  // Drag and drop event handlers for ChatRoom
  const handleChatDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setChatDragging(true);
  };

  const handleChatDragLeave = () => {
    setChatDragging(false);
  };

  const handleChatDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setChatDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      addToPendingFiles(files);
    }
  };

  // Group Shared Drive Actions
  const handleCreateDriveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriveFolderName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/disk/folders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newDriveFolderName.trim(),
          parent_id: driveFolderId || 'root',
          group_id: chatId
        })
      });
      if (res.ok) {
        showToast('新建文件夹成功', 'success');
        setShowNewDriveFolder(false);
        setNewDriveFolderName('');
        fetchDriveItems(driveFolderId);
      } else {
        const data = await res.json();
        showToast(data.error || '新建文件夹失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    }
  };

  const handleDriveFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setDriveUploading(true);
    setDriveUploadProgress(0);
    try {
      const credentialRes = await fetch(`${API_BASE}/api/disk/upload-credential`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          filename: file.name,
          size: file.size,
          parent_id: driveFolderId || 'root',
          group_id: chatId
        })
      });

      if (!credentialRes.ok) {
        const errData = await credentialRes.json();
        throw new Error(errData.error || '获取上传凭证失败');
      }

      const credentialData = await credentialRes.json();
      const { credentials, bucket, region, cosKey, url } = credentialData;

      const cos = new COS({
        getAuthorization: (_options, callback) => {
          callback({
            TmpSecretId: credentials.tmpSecretId,
            TmpSecretKey: credentials.tmpSecretKey,
            SecurityToken: credentials.sessionToken,
            StartTime: credentialData.startTime,
            ExpiredTime: credentialData.expiredTime,
          });
        },
      });

      cos.uploadFile({
        Bucket: bucket,
        Region: region,
        Key: cosKey,
        Body: file,
        onProgress: (progressData) => {
          const percent = Math.round((progressData.loaded / progressData.total) * 100);
          setDriveUploadProgress(percent);
        }
      }, async (err) => {
        if (err) {
          showToast('上传失败', 'error');
          setDriveUploading(false);
          return;
        }

        try {
          const completeRes = await fetch(`${API_BASE}/api/disk/upload-complete`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
              filename: file.name,
              size: file.size,
              parent_id: driveFolderId || 'root',
              group_id: chatId,
              cos_key: cosKey,
              url: url
            })
          });

          if (completeRes.ok) {
            showToast('上传成功', 'success');
            fetchDriveItems(driveFolderId);
          } else {
            const data = await completeRes.json();
            showToast(data.error || '保存文件元数据失败', 'error');
          }
        } catch {
          showToast('网络错误，保存文件元数据失败', 'error');
        } finally {
          setDriveUploading(false);
        }
      });
    } catch (err: any) {
      showToast(err.message || '上传初始化失败', 'error');
      setDriveUploading(false);
    }
    if (groupDriveFileInputRef.current) groupDriveFileInputRef.current.value = '';
  };

  const handleDeleteDriveItem = async (itemId: string, itemType: string) => {
    if (!confirm(`确定要删除此${itemType === 'folder' ? '文件夹' : '文件'}吗？`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/disk/items/${itemId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        showToast('删除成功', 'success');
        fetchDriveItems(driveFolderId);
      } else {
        const data = await res.json();
        showToast(data.error || '删除失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    }
  };

  const handleGroupAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      showToast('正在上传群头像...', 'info');
      const result = await uploadFileToCOS(file, 'image');
      if (result && result.url) {
        const res = await fetch(`${API_BASE}/api/groups/${chatId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ avatar: result.url })
        });
        if (res.ok) {
          showToast('群头像已更新', 'success');
          refreshGroupDetail();
          fetchChats();
        } else {
          const data = await res.json();
          showToast(data.error || '群头像更新失败', 'error');
        }
      }
    } catch (err: any) {
      showToast(`群头像更新失败: ${err.message || ''}`, 'error');
    }
    if (groupAvatarInputRef.current) groupAvatarInputRef.current.value = '';
  };

  const handleEditAIAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAiAvatarUploading(true);
    try {
      const result = await uploadFileToCOS(file, 'image');
      if (result && result.url) {
        setEditingAIAvatar(result.url);
        showToast('AI头像上传成功', 'success');
      }
    } catch (err: any) {
      showToast(`AI头像上传失败: ${err.message || ''}`, 'error');
    } finally {
      setAiAvatarUploading(false);
    }
    if (editingAIAvatarInputRef.current) editingAIAvatarInputRef.current.value = '';
  };

  const handleSaveEditAI = async () => {
    if (!editingAIName.trim()) {
      showToast('请输入AI名字', 'error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/groups/${chatId}/ai-members/${editingAI.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: editingAIName.trim(),
          personality: editingAIPersonality.trim(),
          avatar: editingAIAvatar
        })
      });
      if (res.ok) {
        showToast('修改AI资料成功', 'success');
        setEditingAI(null);
        refreshGroupDetail();
      } else {
        const data = await res.json();
        showToast(data.error || '修改AI资料失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    }
  };

  // useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // AI Member Management
  const handleAddAI = async () => {
    if (!aiName.trim()) {
      showToast('请输入AI名字', 'error');
      return;
    }
    const success = await addAIMember(chatId, aiName.trim(), aiPersonality.trim());
    if (success) {
      setShowAddAIModal(false);
      setAIName('');
      setAIPersonality('');
      refreshGroupDetail();
    }
  };

  const handleRemoveAI = async (aiId: string) => {
    if (!confirm('确定要移除该AI成员吗？')) return;
    const success = await removeAIMember(chatId, aiId);
    if (success) {
      refreshGroupDetail();
    }
  };

  // Get mention list (group members + AI members, excluding current user)
  const getMentionList = () => {
    const members: { id: string; name: string; avatar?: string; isAI: boolean }[] = [];
    
    // Add regular members (excluding current user)
    if (groupDetail?.members) {
      groupDetail.members.forEach((m: any) => {
        if (m.id !== currentUserId && !m.is_ai) {
          members.push({ id: m.id, name: m.nickname, avatar: m.avatar, isAI: false });
        }
      });
    }
    
    // Add AI members
    aiMembers.forEach(ai => {
      members.push({ id: ai.id, name: ai.name, avatar: ai.avatar, isAI: true });
    });
    
    // Filter by query
    if (mentionQuery) {
      return members.filter(m => 
        m.name.toLowerCase().includes(mentionQuery.toLowerCase())
      );
    }
    
    return members;
  };

  // Close context menu and member popover on click elsewhere
  useEffect(() => {
    const handleCloseMenu = () => {
      setContextMenu(null);
      setActiveMemberMenuId(null);
      setPopoverPos(null);
      setShowUploadMenu(false);
    };
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, messageId: string, content: string, senderId: string, createdAt: string) => {
    e.preventDefault();
    if (isMultiSelect) return;
    const pos = calculateContextMenuPosition({
      x: e.clientX,
      y: e.clientY,
      popupSize: { width: 150, height: 250 }
    });
    setContextMenu({
      x: pos.left,
      y: pos.top,
      messageId,
      content,
      senderId,
      createdAt
    });
  };

  const handleEditSelect = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg) {
      setEditingMsg(msg);
      setQuotedMsg(null);
      setText(msg.content);
      setContextMenu(null);
    }
  };

  const handleQuoteSelect = (messageId: string) => {
    const msg = messages.find(m => m.id === messageId);
    if (msg) {
      setQuotedMsg({
        ...msg,
        sender_name: msg.sender_name || (msg.sender_id === currentUserId ? '我' : '对方')
      });
      setEditingMsg(null);
      setContextMenu(null);
    }
  };

  const handleReEdit = (content: string) => {
    setText(content);
  };

  const isUserMuted = () => {
    if (!isGroup || !groupDetail) return false;
    if (groupDetail.owner_id === currentUserId) return false;
    if (groupDetail.mute_all) return true;
    if (groupDetail.muted_members && groupDetail.muted_members[currentUserId]) return true;
    return false;
  };

  const handleToggleMute = async (userId: string, isMuted: boolean) => {
    const ok = await muteGroupMember(chatId, userId, !isMuted);
    if (ok) {
      refreshGroupDetail();
    }
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    showToast("已复制到剪贴板", "success");
    setContextMenu(null);
  };

  const handleDeleteSingle = (messageId: string) => {
    deleteLocalMessage(messageId);
    setContextMenu(null);
  };

  const handleStartMultiSelect = (messageId: string) => {
    setIsMultiSelect(true);
    setSelectedMessageIds(new Set([messageId]));
    setContextMenu(null);
  };

  const handleToggleSelect = (messageId: string) => {
    setSelectedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const handleCancelMultiSelect = () => {
    setIsMultiSelect(false);
    setSelectedMessageIds(new Set());
  };

  const handleConfirmDeleteMultiple = () => {
    if (selectedMessageIds.size === 0) return;
    if (window.confirm(`确定要删除选中的 ${selectedMessageIds.size} 条消息吗？此操作仅对本地生效，云端记录仍保留。`)) {
      deleteLocalMessages(Array.from(selectedMessageIds));
      setIsMultiSelect(false);
      setSelectedMessageIds(new Set());
    }
  };

  const handleShowDetails = () => {
    if (isGroup) {
      setShowGroupSettings(prev => {
        if (!prev) window.history.pushState({ view: 'groupSettings' }, '');
        return !prev;
      });
    } else {
      navigate('/contacts', { state: { showDetailOfFriendId: chatId } });
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && pendingFiles.length === 0) return;
    if (isUserMuted()) return;

    if (editingMsg) {
      const ok = await editMessage(editingMsg.id, text.trim());
      if (ok) { setEditingMsg(null); setText(''); }
      return;
    }

    const textContent = text.trim();

    if (textContent && (pendingFiles.length === 0 || sendMode === 'independent')) {
      if (quotedMsg) {
        sendQuoteMessage(chatId, textContent, quotedMsg.id, quotedMsg.sender_name || '?', quotedMsg.content, isGroup);
        setQuotedMsg(null);
      } else {
        onSend(chatId, textContent);
      }
    }
    if (quotedMsg) setQuotedMsg(null);
    setText('');

    if (pendingFiles.length === 0) return;

    const filesToSend = [...pendingFiles];
    setPendingFiles([]); // Clear pending files immediately to release input area!

    if (sendMode === 'independent') {
      filesToSend.forEach(pf => {
        if (pf.source === 'local' && pf.file) {
          uploadAndSendSingleFileBackground(pf);
        } else if (pf.source === 'cloud' && pf.cloudItem) {
          onSend(chatId, JSON.stringify({ type: 'file_share', ...pf.cloudItem }));
        }
      });
    } else {
      uploadAndSendBundleBackground(filesToSend, textContent);
    }
  };

  const addToPendingFiles = (files: FileList | File[]) => {
    const pending: PendingFile[] = Array.from(files).map(file => {
      let fileType: 'image' | 'video' | 'audio' | 'file' = 'file';
      if (file.type.startsWith('image/')) fileType = 'image';
      else if (file.type.startsWith('video/')) fileType = 'video';
      else if (file.type.startsWith('audio/')) fileType = 'audio';

      return {
        id: `pending-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        fileType,
        fileName: file.name,
        fileSize: file.size,
        source: 'local' as const,
        uploadStatus: 'pending' as const,
        uploadProgress: 0,
      };
    });
    setPendingFiles(prev => [...prev, ...pending]);
  };

  const removePendingFile = (id: string) => {
    setPendingFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) URL.revokeObjectURL(file.previewUrl);
      return prev.filter(f => f.id !== id);
    });
  };

  const uploadFileToCOS = (
    file: File,
    fileType: string,
    onProgressUpdate?: (percent: number) => void
  ): Promise<{ file_name: string; file_size: number; file_type: string; url: string; cos_key: string }> => {
    return new Promise(async (resolve, reject) => {
      try {
        const credRes = await fetch(`${API_BASE}/api/chat/upload-credential`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ filename: file.name, size: file.size })
        });
        if (!credRes.ok) {
          const errData = await credRes.json();
          throw new Error(errData.error || '获取上传凭证失败');
        }
        const credData = await credRes.json();
        const { credentials, bucket, region, cosKey, url } = credData;

        const cos = new COS({
          getAuthorization: (_options, callback) => {
            callback({
              TmpSecretId: credentials.tmpSecretId,
              TmpSecretKey: credentials.tmpSecretKey,
              SecurityToken: credentials.sessionToken,
              StartTime: credData.startTime,
              ExpiredTime: credData.expiredTime,
            });
          },
        });

        cos.uploadFile({
          Bucket: bucket,
          Region: region,
          Key: cosKey,
          Body: file,
          onProgress: (progressData) => {
            const percent = Math.round((progressData.loaded / progressData.total) * 100);
            if (onProgressUpdate) onProgressUpdate(percent);
          }
        }, (err) => {
          if (err) reject(err);
          else resolve({ file_name: file.name, file_size: file.size, file_type: fileType, url, cos_key: cosKey });
        });
      } catch (err) {
        reject(err);
      }
    });
  };

  const uploadAndSendSingleFileBackground = (pf: PendingFile) => {
    if (!pf.file) return;
    const file = pf.file;
    const fileType = pf.fileType;
    const tempId = `temp-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    const localUrl = pf.previewUrl;

    setTempMessages(prev => [...prev, {
      id: tempId,
      sender_id: currentUserId,
      content: JSON.stringify({ type: 'chat_file', file_name: file.name, file_size: file.size, file_type: fileType, url: localUrl, cos_key: '', uploading: true, progress: 0 }),
      created_at: new Date().toISOString()
    }]);

    uploadFileToCOS(file, fileType, (percent) => {
      setTempMessages(prev => prev.map(m => {
        if (m.id !== tempId) return m;
        return { ...m, content: JSON.stringify({ type: 'chat_file', file_name: file.name, file_size: file.size, file_type: fileType, url: localUrl, cos_key: '', uploading: true, progress: percent }) };
      }));
    }).then((result) => {
      const finalContent = JSON.stringify({ type: 'chat_file', file_name: result.file_name, file_size: result.file_size, file_type: result.file_type, url: result.url, cos_key: result.cos_key });
      onSend(chatId, finalContent);
      setTempMessages(prev => prev.filter(m => m.id !== tempId));
    }).catch((err) => {
      showToast(`${file.name} 上传失败: ${err.message || ''}`, 'error');
      setTempMessages(prev => prev.filter(m => m.id !== tempId));
    });
  };

  const uploadAndSendBundleBackground = (filesToSend: PendingFile[], textContent: string) => {
    const tempId = `temp-bundle-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    
    const filesForTemp = filesToSend.map(pf => {
      if (pf.source === 'local') {
        return {
          file_name: pf.fileName,
          file_size: pf.fileSize,
          file_type: pf.fileType,
          url: pf.previewUrl,
          uploading: true,
          progress: 0,
          id: pf.id
        };
      } else {
        const cloudItem = pf.cloudItem;
        return {
          file_id: cloudItem?.file_id || '',
          file_name: cloudItem?.file_name || pf.fileName,
          file_size: cloudItem?.file_size || pf.fileSize,
          file_type: pf.fileType,
          url: cloudItem?.url || pf.previewUrl,
          source: 'cloud'
        };
      }
    });

    setTempMessages(prev => [...prev, {
      id: tempId,
      sender_id: currentUserId,
      content: JSON.stringify({
        type: 'chat_bundle',
        text: textContent || undefined,
        files: filesForTemp,
        uploading: true
      }),
      created_at: new Date().toISOString()
    }]);

    const uploadPromises = filesToSend.map(async (pf) => {
      if (pf.source === 'local' && pf.file) {
        try {
          const result = await uploadFileToCOS(pf.file, pf.fileType, (percent) => {
            setTempMessages(prev => prev.map(m => {
              if (m.id !== tempId) return m;
              try {
                const parsed = JSON.parse(m.content);
                const updatedFiles = parsed.files.map((f: any) => {
                  if (f.id === pf.id) {
                    return { ...f, progress: percent };
                  }
                  return f;
                });
                return { ...m, content: JSON.stringify({ ...parsed, files: updatedFiles }) };
              } catch {
                return m;
              }
            }));
          });

          setTempMessages(prev => prev.map(m => {
            if (m.id !== tempId) return m;
            try {
              const parsed = JSON.parse(m.content);
              const updatedFiles = parsed.files.map((f: any) => {
                if (f.id === pf.id) {
                  return {
                    file_name: result.file_name,
                    file_size: result.file_size,
                    file_type: result.file_type,
                    url: result.url,
                    cos_key: result.cos_key,
                    uploading: false,
                    progress: 100
                  };
                }
                return f;
              });
              return { ...m, content: JSON.stringify({ ...parsed, files: updatedFiles }) };
            } catch {
              return m;
            }
          }));

          return result;
        } catch (err: any) {
          showToast(`${pf.fileName} 上传失败: ${err.message || ''}`, 'error');
          throw err;
        }
      } else if (pf.source === 'cloud' && pf.cloudItem) {
        return { ...pf.cloudItem, source: 'cloud' };
      }
      return null;
    });

    Promise.all(uploadPromises).then((results) => {
      const finalFiles = results.filter(Boolean).map((r: any) => ({
        file_name: r.file_name,
        file_size: r.file_size,
        file_type: r.file_type,
        url: r.url,
        cos_key: r.cos_key,
        source: r.source || undefined,
        file_id: r.file_id || undefined
      }));

      const bundleContent = JSON.stringify({
        type: 'chat_bundle',
        text: textContent || undefined,
        files: finalFiles
      });
      onSend(chatId, bundleContent);
      setTempMessages(prev => prev.filter(m => m.id !== tempId));
    }).catch(() => {
      setTempMessages(prev => prev.filter(m => m.id !== tempId));
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    addToPendingFiles(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const fileItems: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) fileItems.push(file);
      }
    }
    if (fileItems.length > 0) {
      e.preventDefault();
      addToPendingFiles(fileItems);
    }
  };

  // Group Details Management
  const handleRenameGroup = async () => {
    if (!groupDetail) return;
    const newName = prompt("请输入新的群聊名称：", groupDetail.name);
    if (newName !== null) {
      const ok = await updateGroupName(chatId, newName.trim());
      if (ok) {
        refreshGroupDetail();
      }
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm("确定要退出该群聊吗？")) return;
    const ok = await removeGroupMember(chatId, currentUserId);
    if (ok) {
      onBack?.();
    }
  };

  const handleKickMember = async (userId: string, userNickname: string) => {
    if (!window.confirm(`确定要将 ${userNickname} 移出群聊吗？`)) return;
    const ok = await removeGroupMember(chatId, userId);
    if (ok) {
      refreshGroupDetail();
    }
  };

  const handleToggleAdmin = async (userId: string, isAdmin: boolean) => {
    let ok = false;
    if (isAdmin) {
      ok = await removeGroupAdmin(chatId, userId);
    } else {
      ok = await addGroupAdmin(chatId, userId);
    }
    if (ok) {
      refreshGroupDetail();
    }
  };

  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedInviteFriends.length === 0) return;
    const ok = await addGroupMembers(chatId, selectedInviteFriends);
    if (ok) {
      setShowInviteModal(false);
      setSelectedInviteFriends([]);
      refreshGroupDetail();
    }
  };

  // Forwarding Methods
  const handleForwardSingle = (content: string) => {
    setMessagesToForward([content]);
    setForwardTargets([]);
    setShowForwardModal(true);
    setContextMenu(null);
  };

  const handleForwardMultiple = () => {
    if (selectedMessageIds.size === 0) return;
    const selectedMsgs = messages.filter(m => selectedMessageIds.has(m.id)).map(m => m.content);
    setMessagesToForward(selectedMsgs);
    setForwardTargets([]);
    setShowForwardModal(true);
  };

  const handleForwardSubmit = async () => {
    if (forwardTargets.length === 0 || messagesToForward.length === 0) return;
    
    for (const target of forwardTargets) {
      for (const msgContent of messagesToForward) {
        sendMessage(target.id, msgContent, target.isGroup);
        await new Promise(r => setTimeout(r, 80));
      }
    }
    
    showToast(`消息已转发`, 'success');
    setShowForwardModal(false);
    setIsMultiSelect(false);
    setSelectedMessageIds(new Set());
  };

  const toggleForwardTarget = (id: string, name: string, isGroup: boolean) => {
    setForwardTargets(prev => {
      const exists = prev.some(t => t.id === id);
      if (exists) {
        return prev.filter(t => t.id !== id);
      } else {
        return [...prev, { id, name, isGroup }];
      }
    });
  };

  return (
    <ChatMediaContext.Provider value={{ openViewer: openMediaViewer }}>
    <div 
      style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg)', position: 'relative' }}
      onDragOver={handleChatDragOver}
      onDragLeave={handleChatDragLeave}
      onDrop={handleChatDrop}
    >
      {chatDragging && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(51, 144, 236, 0.12)', border: '2.5px dashed var(--brand-blue)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, pointerEvents: 'none' }}>
          <div style={{ background: 'var(--bg-card)', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--brand-blue)', fontWeight: 600 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            释放文件以发送到聊天
          </div>
        </div>
      )}
      <style>{`
        .cr-main-area {
          display: flex;
          flex-direction: column;
          flex: 1;
          height: 100%;
          overflow: hidden;
          background: var(--bg);
        }
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
          color: var(--text);
        }
        .cr-info {
          background: none;
          color: var(--text-dim);
          padding: 6px;
          display: flex;
          border-radius: var(--radius);
          transition: color 0.2s, background-color 0.2s;
          border: none;
          cursor: pointer;
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
            max-width: 90% !important;
          }
          .cr-input-bar {
            padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
          }
          .cr-settings-panel {
            max-width: 100%;
          }
        }
 
        .cr-msgs {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column-reverse;
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
          color: var(--text);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .cr-input-bar input:focus {
          border-color: var(--text);
          outline: none;
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

        /* Context Menu Styles */
        .cr-context-menu {
          position: fixed;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          display: flex;
          flex-direction: column;
          padding: 4px 0;
          min-width: 100px;
        }
        .cr-context-menu-item {
          padding: 8px 16px;
          font-size: 13px;
          cursor: pointer;
          color: var(--text-primary);
          transition: background 0.2s;
          text-align: left;
          background: none;
          border: none;
          width: 100%;
        }
        .cr-context-menu-item:hover {
          background: var(--hover);
        }
        .cr-context-menu-item.danger {
          color: var(--badge-unread);
        }
        .cr-multi-select-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--bg-card);
          border-top: 1px solid var(--border);
          flex-shrink: 0;
        }
        .cr-multi-select-info {
          font-size: 14px;
          font-weight: 500;
          color: var(--text);
        }
        .cr-multi-select-actions {
          display: flex;
          gap: 10px;
        }
        .msg-checkbox {
          margin-right: 8px;
          width: 16px;
          height: 16px;
          cursor: pointer;
          accent-color: var(--brand-blue);
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

        /* Group Settings Overlay */
        .cr-settings-overlay {
          position: fixed;
          inset: 0;
          z-index: 500;
          display: flex;
          align-items: flex-start;
          justify-content: flex-end;
          animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .cr-settings-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
        }
        .cr-settings-panel {
          position: relative;
          width: 100%;
          max-width: 560px;
          height: 100%;
          background: var(--bg-paper);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          box-shadow: -4px 0 24px rgba(0,0,0,0.2);
          animation: slideInRight 0.2s ease-out;
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .cr-settings-section {
          padding: 16px;
          border-bottom: 1px solid var(--border);
        }
        .cr-settings-title {
          font-size: 12px;
          font-weight: 700;
          color: var(--text-dim);
          text-transform: uppercase;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .cr-settings-group-name {
          font-weight: 700;
          font-size: 15px;
          text-align: center;
          color: var(--text);
        }
        .cr-settings-member-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 350px;
          overflow-y: auto;
        }
        .cr-settings-member-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          font-size: 13px;
        }
        .member-info {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow: hidden;
          flex: 1;
        }
        .member-name {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 500;
          color: var(--text);
        }
        .member-badge {
          font-size: 9px;
          padding: 1px 4px;
          border-radius: 4px;
          font-weight: 700;
        }
        .badge-owner {
          background: rgba(212, 184, 122, 0.15);
          color: var(--brand-yellow);
        }
        .badge-admin {
          background: rgba(0, 122, 255, 0.15);
          color: var(--brand-blue);
        }
        .cr-settings-member-actions {
          display: flex;
          gap: 4px;
        }
        .member-action-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          color: var(--text-dim);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .member-action-btn:hover {
          background: var(--hover);
          color: var(--text);
        }
        .member-action-btn.danger:hover {
          color: var(--badge-unread);
        }
        .member-menu-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          color: var(--text-dim);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .member-menu-btn:hover {
          background: var(--hover);
          color: var(--text);
        }
        .member-popover {
          position: fixed;
          z-index: 300;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.18);
          padding: 6px 0;
          min-width: 180px;
          animation: popoverFadeIn 0.15s ease-out;
        }
        @keyframes popoverFadeIn {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .member-popover-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          font-size: 13px;
          color: var(--text);
          cursor: pointer;
          transition: background 0.15s;
          gap: 10px;
          background: none;
          border: none;
          width: 100%;
          text-align: left;
        }
        .member-popover-item:hover {
          background: var(--hover);
        }
        .member-popover-item.danger {
          color: var(--badge-unread);
        }
        .member-popover-item.danger:hover {
          background: rgba(192, 57, 43, 0.08);
        }
        .member-popover-divider {
          height: 1px;
          background: var(--border);
          margin: 4px 0;
        }
        .toggle-switch {
          position: relative;
          width: 36px;
          height: 20px;
          flex-shrink: 0;
        }
        .toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
          position: absolute;
        }
        .toggle-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background: var(--border);
          border-radius: 20px;
          transition: background 0.2s;
        }
        .toggle-slider::before {
          content: '';
          position: absolute;
          width: 16px;
          height: 16px;
          left: 2px;
          bottom: 2px;
          background: #fff;
          border-radius: 50%;
          transition: transform 0.2s;
        }
        .toggle-switch input:checked + .toggle-slider {
          background: var(--brand-blue);
        }
        .toggle-switch input:checked + .toggle-slider::before {
          transform: translateX(16px);
        }
      `}</style>

      {/* Main Chat Area */}
      <div className="cr-main-area">
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
          <span className="cr-name">{chatName || '聊天'}</span>
          <button className="cr-info" title={isGroup ? "群设置" : "查看资料"} onClick={handleShowDetails}>
            {isGroup ? (
              <HorizontalDotsIcon size={20} />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </button>
        </div>

        {/* Group Announcement Static Banner */}
        {isGroup && groupDetail?.announcement && (
          <div className="group-announcement-banner" style={{
            background: 'var(--hover)',
            borderBottom: '1px solid var(--border)',
            padding: '10px 16px',
            fontSize: '13px',
            color: 'var(--text)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
            borderLeft: '3px solid var(--brand-blue)',
          }}>
            <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', color: 'var(--brand-blue)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={groupDetail.announcement}>
              {groupDetail.announcement}
            </div>
            {(groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) && (
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button 
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-blue)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                  onClick={() => {
                    const ann = prompt("请输入新的群公告：", groupDetail.announcement || "");
                    if (ann !== null) {
                      updateGroupAnnouncement(chatId, ann.trim()).then(ok => {
                        if (ok) refreshGroupDetail();
                      });
                    }
                  }}
                >
                  修改
                </button>
                <button 
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--badge-unread)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                  onClick={() => {
                    if (confirm("确定要清除群公告吗？")) {
                      updateGroupAnnouncement(chatId, "").then(ok => {
                        if (ok) refreshGroupDetail();
                      });
                    }
                  }}
                >
                  清除
                </button>
              </div>
            )}
          </div>
        )}
 
        {/* Messages Scroll Area */}
        <div className="cr-msgs">
          {(() => {
            const filteredTempMessages = tempMessages.filter(temp => {
              try {
                const tempParsed = JSON.parse(temp.content);
                const isAlreadyDelivered = messages.some(m => {
                  if (m.sender_id !== currentUserId) return false;
                  try {
                    const parsed = JSON.parse(m.content);
                    if (parsed.type === 'chat_file' && tempParsed.type === 'chat_file') {
                      return parsed.file_name === tempParsed.file_name && parsed.file_size === tempParsed.file_size;
                    }
                    if (parsed.type === 'chat_bundle' && tempParsed.type === 'chat_bundle') {
                      if (parsed.files?.length !== tempParsed.files?.length) return false;
                      return parsed.files.every((pf: any, idx: number) => {
                        const tpf = tempParsed.files[idx];
                        return pf.file_name === tpf.file_name && pf.file_size === tpf.file_size;
                      });
                    }
                    return false;
                  } catch {
                    return false;
                  }
                });
                return !isAlreadyDelivered;
              } catch {
                return true;
              }
            });
            const allMsgs = [...messages, ...filteredTempMessages];
            if (allMsgs.length === 0) {
              return <div className="cr-empty">打个招呼吧</div>;
            }

            const mappedMsgs = allMsgs.map((m, i) => {
              const isOwn = m.sender_id === currentUserId;
              const isFirstOfGroup = i === 0 || allMsgs[i - 1].sender_id !== m.sender_id;

              // Resolve sender nickname & avatar for group chats
              let senderNickname = m.sender_name || '';
              let senderAvatar = m.sender_avatar;
              let senderIsAI = false;

              if (isGroup) {
                // Determine if sender is AI (to set senderIsAI flag)
                if (aiMembers.length > 0) {
                  const aiMember = aiMembers.find((ai: any) => ai.user_id === m.sender_id);
                  if (aiMember) {
                    senderIsAI = true;
                    if (!senderNickname) {
                      senderNickname = aiMember.name;
                      senderAvatar = aiMember.avatar;
                    }
                  }
                }

                // Fallback for regular members if backend values are missing (e.g. legacy local cache)
                if (!senderNickname && groupDetail && groupDetail.members) {
                  const member = groupDetail.members.find((mb: any) => mb.id === m.sender_id);
                  if (member) {
                    senderNickname = member.nickname;
                    senderAvatar = member.avatar;
                  }
                }
              }
   
              let showTime = false;
              if (i === allMsgs.length - 1) {
                showTime = true;
              } else {
                const nextMsg = allMsgs[i + 1];
                const currentMs = new Date(m.created_at).getTime();
                const nextMs = new Date(nextMsg.created_at).getTime();
                showTime = (nextMs - currentMs) > 5 * 60 * 1000;
              }

              return {
                m,
                isOwn,
                isFirstOfGroup,
                senderNickname,
                senderAvatar,
                senderIsAI,
                showTime
              };
            });

            return mappedMsgs.reverse().map(({ m, isOwn, isFirstOfGroup, senderNickname, senderAvatar, senderIsAI, showTime }) => {
              if (m.is_recalled) {
                const showReEdit = isOwn && !m.content.startsWith('{') && (Date.now() - new Date(m.created_at).getTime()) < 5 * 60 * 1000;
                return (
                  <div key={m.id} id={`msg-${m.id}`} className="msg-container" style={{ margin: '8px 0', alignItems: 'center' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'var(--hover)',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      color: 'var(--text-dim)',
                      fontSize: '12px',
                      userSelect: 'none',
                      gap: '8px'
                    }}>
                      <span>
                        {isOwn ? "你撤回了一条消息" : (isGroup ? `${senderNickname || '某人'} 撤回了一条消息` : "对方撤回了一条消息")}
                      </span>
                      {showReEdit && (
                        <button
                          onClick={() => handleReEdit(m.content)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--brand-blue)',
                            fontSize: '12px',
                            cursor: 'pointer',
                            padding: 0,
                            fontWeight: 600
                          }}
                        >
                          重新编辑
                        </button>
                      )}
                    </div>
                    {showTime && (
                      <div className="msg-time-container" style={{ marginTop: '6px' }}>
                        {formatTime(m.created_at)}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <div key={m.id} id={`msg-${m.id}`} className="msg-container">
                  <div className={`msg-row ${isOwn ? 'msg-own' : 'msg-other'}`}>
                    {isMultiSelect && (
                      <input
                        type="checkbox"
                        className="msg-checkbox"
                        checked={selectedMessageIds.has(m.id)}
                        onChange={() => handleToggleSelect(m.id)}
                      />
                    )}
                    {!isOwn && (
                      isFirstOfGroup ? (
                        <Avatar name={senderNickname || chatName || '?'} url={isGroup ? senderAvatar : chatAvatar} size={32} fontSize={13} />
                      ) : (
                        <div style={{ width: 32, flexShrink: 0 }} />
                      )
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, maxWidth: '70%', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                      {isGroup && !isOwn && isFirstOfGroup && senderNickname && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 2, marginLeft: 4, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {senderNickname}
                          {senderIsAI && (
                            <span style={{
                              fontSize: '9px',
                              background: 'var(--brand-blue)',
                              color: '#fff',
                              padding: '1px 4px',
                              borderRadius: '3px',
                              fontWeight: 700
                            }}>
                              AI
                            </span>
                          )}
                        </span>
                      )}
                        {(() => {
                          let fileShareData = null;
                          let chatFileData = null;
                          let chatBundleData = null;
                          if (m.content.startsWith('{')) {
                            try {
                              const parsed = JSON.parse(m.content);
                              if (parsed) {
                                if (parsed.type === 'file_share') {
                                  fileShareData = parsed;
                                } else if (parsed.type === 'chat_file') {
                                  chatFileData = parsed;
                                } else if (parsed.type === 'chat_bundle') {
                                  chatBundleData = parsed;
                                }
                              }
                            } catch { /* ignore */ }
                          }

                          const isMedia = (chatFileData && (chatFileData.file_type === 'image' || chatFileData.file_type === 'video'));
                          const bubbleStyle = isMedia ? {
                            cursor: isMultiSelect ? 'pointer' : 'default',
                            maxWidth: '100%',
                            background: 'transparent',
                            padding: 0,
                            boxShadow: 'none'
                          } : {
                            cursor: isMultiSelect ? 'pointer' : 'default',
                            maxWidth: '100%'
                          };

                          return (
                            <div
                              className={`msg-bubble ${isOwn ? 'bubble-own' : 'bubble-other'} ${isFirstOfGroup ? 'first-of-group' : 'consecutive'}`}
                              onContextMenu={(e) => handleContextMenu(e, m.id, m.content, m.sender_id, m.created_at)}
                              onClick={() => isMultiSelect && handleToggleSelect(m.id)}
                              style={bubbleStyle}
                            >
                              {m.quote_id && (
                                <div className="msg-quote-area" style={{
                                  fontSize: '11px',
                                  color: 'var(--text-dim)',
                                  background: isOwn ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)',
                                  borderLeft: '2.5px solid var(--brand-blue)',
                                  padding: '4px 8px',
                                  marginBottom: '6px',
                                  borderRadius: '3px',
                                  opacity: 0.85,
                                  wordBreak: 'break-all',
                                  cursor: 'pointer'
                                }} onClick={() => {
                                  const el = document.getElementById(`msg-${m.quote_id}`);
                                  if (el) {
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    el.classList.add('highlight-flash');
                                    setTimeout(() => el.classList.remove('highlight-flash'), 1500);
                                  } else {
                                    showToast('引用的消息在本地已不存在', 'info');
                                  }
                                }}>
                                  <strong>{m.quote_sender_name}</strong>: {
                                    m.quote_content?.startsWith('{') ? '[文件/媒体]' : m.quote_content
                                  }
                                </div>
                              )}
                              {fileShareData && <FileShareCard fileShareData={fileShareData} isOwn={isOwn} />}
                              {chatFileData && <ChatFileCard data={chatFileData} />}
                              {chatBundleData && <ChatBundleCard data={chatBundleData} />}
                              {!fileShareData && !chatFileData && !chatBundleData && (
                                <span className="msg-text">
                                  {m.content}
                                  {m.is_edited && (
                                    <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px', verticalAlign: 'middle', userSelect: 'none' }}>
                                      (已编辑)
                                    </span>
                                  )}
                                </span>
                              )}
                            </div>
                          );
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
            });
          })()}
          <div ref={bottomRef} />
        </div>
   
        {/* Input Sender Bar or Multi-Select Bar */}
        {isMultiSelect ? (
          <div className="cr-multi-select-bar">
            <span className="cr-multi-select-info">已选择 {selectedMessageIds.size} 条消息</span>
            <div className="cr-multi-select-actions">
              <button className="btn btn-secondary" onClick={handleCancelMultiSelect}>
                取消
              </button>
              <button className="btn btn-secondary" onClick={handleForwardMultiple} disabled={selectedMessageIds.size === 0}>
                转发
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmDeleteMultiple}
                disabled={selectedMessageIds.size === 0}
              >
                删除
              </button>
            </div>
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            {/* Mention List */}
            {showMentionList && isGroup && (
              <div
                ref={mentionListRef}
                className="cr-mention-list"
                onMouseDown={e => e.preventDefault()}
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  right: 0,
                  maxHeight: '200px',
                  overflowY: 'auto',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  boxShadow: '0 -4px 12px rgba(0,0,0,0.1)',
                  zIndex: 100,
                  marginBottom: '4px'
                }}
              >
                {getMentionList().length === 0 ? (
                  <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>
                    无匹配成员
                  </div>
                ) : (
                  getMentionList().map(member => (
                    <div
                      key={member.id}
                      className="cr-mention-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const lastAtIndex = text.lastIndexOf('@');
                        if (lastAtIndex !== -1) {
                          setText(text.substring(0, lastAtIndex) + '@' + member.name + ' ');
                        }
                        setShowMentionList(false);
                        setMentionQuery('');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {member.isAI ? (
                        <span style={{ display: 'flex', alignItems: 'center', color: 'var(--brand-blue)' }}><BotIcon size={22} /></span>
                      ) : (
                        <Avatar name={member.name} url={member.avatar} size={28} />
                      )}
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{member.name}</span>
                      {member.isAI && (
                        <span style={{
                          fontSize: '10px',
                          background: 'var(--brand-blue)',
                          color: '#fff',
                          padding: '1px 4px',
                          borderRadius: '4px',
                          marginLeft: 'auto'
                        }}>
                          AI
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
            
            {editingMsg && (
              <div className="cr-input-preview-bar" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'between',
                padding: '8px 16px',
                background: 'var(--hover)',
                borderTop: '1px solid var(--border)',
                fontSize: '13px',
                color: 'var(--text)',
                gap: '12px'
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  正在编辑消息: {editingMsg.content}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingMsg(null);
                    setText('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--brand-blue)',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 600,
                    flexShrink: 0
                  }}
                >
                  取消编辑
                </button>
              </div>
            )}

            {quotedMsg && (
              <div className="cr-input-preview-bar" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'between',
                padding: '8px 16px',
                background: 'var(--hover)',
                borderTop: '1px solid var(--border)',
                fontSize: '13px',
                color: 'var(--text)',
                gap: '12px'
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  引用 <strong>{quotedMsg.sender_name || '?'}</strong>: {quotedMsg.content.startsWith('{') ? '[文件/媒体]' : quotedMsg.content}
                </span>
                <button
                  type="button"
                  onClick={() => setQuotedMsg(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    flexShrink: 0
                  }}
                >
                  <CloseIcon size={16} />
                </button>
              </div>
            )}

            <PendingFilesBar
              files={pendingFiles}
              sendMode={sendMode}
              onRemove={removePendingFile}
              onModeChange={setSendMode}
              isSending={false}
            />

            <form onSubmit={handleSend} className="cr-input-bar">
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ width: '42px', height: '42px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                  onClick={(e) => { e.stopPropagation(); setShowUploadMenu(prev => !prev); }}
                  disabled={isUserMuted()}
                  title={isUserMuted() ? "禁言中" : "发送文件/媒体"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>
                {showUploadMenu && (
                  <div ref={uploadMenuRef} onClick={(e) => e.stopPropagation()} style={{
                    position: 'absolute', bottom: '100%', left: 0, marginBottom: '4px',
                    background: 'var(--bg-card)', border: '1px solid var(--border)',
                    borderRadius: '10px', boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
                    zIndex: 300, minWidth: '160px', padding: '6px 0',
                    animation: 'popoverFadeIn 0.15s ease-out'
                  }}>
                    <button
                      onClick={() => { fileInputRef.current?.click(); setShowUploadMenu(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                        padding: '10px 14px', fontSize: '13px', color: 'var(--text)',
                        cursor: 'pointer', background: 'none', border: 'none',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      从本地选择
                    </button>
                    <button
                      onClick={() => { setShowCloudPicker(true); setShowUploadMenu(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                        padding: '10px 14px', fontSize: '13px', color: 'var(--text)',
                        cursor: 'pointer', background: 'none', border: 'none',
                        transition: 'background 0.15s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>
                      </svg>
                      从云盘上传
                    </button>
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
                multiple
              />
              <input
                type="text"
                placeholder={isUserMuted() ? (groupDetail?.mute_all ? "全体禁言中" : "您已被禁言") : "输入消息... (输入@提及成员)"}
                value={text}
                disabled={isUserMuted()}
                onChange={e => {
                  setText(e.target.value);
                  const cursorPos = e.target.selectionStart || 0;
                  const textBeforeCursor = e.target.value.substring(0, cursorPos);
                  const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                  if (lastAtIndex !== -1 && (lastAtIndex === 0 || textBeforeCursor[lastAtIndex - 1] === ' ')) {
                    const query = textBeforeCursor.substring(lastAtIndex + 1);
                    if (!query.includes(' ')) {
                      setMentionQuery(query);
                      setShowMentionList(true);
                      return;
                    }
                  }
                  setShowMentionList(false);
                  setMentionQuery('');
                }}
                onFocus={() => {
                  const cursorPos = text.length;
                  const textBeforeCursor = text.substring(0, cursorPos);
                  const lastAtIndex = textBeforeCursor.lastIndexOf('@');
                  if (lastAtIndex !== -1 && (lastAtIndex === 0 || textBeforeCursor[lastAtIndex - 1] === ' ')) {
                    const query = textBeforeCursor.substring(lastAtIndex + 1);
                    if (!query.includes(' ')) {
                      setMentionQuery(query);
                      setShowMentionList(true);
                    }
                  }
                }}
                onPaste={handlePaste}
              />
              <button type="submit" className="btn cr-send" disabled={(!text.trim() && pendingFiles.length === 0) || isUserMuted()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>

            <CloudFilePicker
              isOpen={showCloudPicker}
              onClose={() => setShowCloudPicker(false)}
              onSelect={(selectedFiles) => {
                const cloudPending: PendingFile[] = selectedFiles.map(sf => ({
                  id: `pending-cloud-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`,
                  previewUrl: '',
                  fileType: 'file' as const,
                  fileName: sf.file_name,
                  fileSize: sf.file_size,
                  source: 'cloud' as const,
                  cloudItem: { file_id: sf.file_id, file_name: sf.file_name, file_size: sf.file_size, url: sf.url },
                  uploadStatus: 'done' as const,
                  uploadProgress: 100,
                }));
                setPendingFiles(prev => [...prev, ...cloudPending]);
              }}
            />
          </div>
        )}
      </div>

      {/* Group Settings Overlay */}
      {isGroup && showGroupSettings && groupDetail && (
        <div className="cr-settings-overlay">
          <div className="cr-settings-backdrop" onClick={() => setShowGroupSettings(false)} />
          <div className="cr-settings-panel">
            {/* Settings Header with Back Button */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 8 }}>
              <button
                onClick={() => setShowGroupSettings(false)}
                title="关闭群设置"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text)', padding: '4px', display: 'flex', alignItems: 'center', borderRadius: '50%', transition: 'background 0.2s' }}
              >
                <BackIcon size={20} />
              </button>
              <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>群设置</span>
            </div>

            {/* Tab navigation */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-paper)', flexShrink: 0 }}>
              <button 
                style={{ flex: 1, padding: '12px', background: 'none', border: 'none', borderBottom: settingsTab === 'main' ? '2.5px solid var(--brand-blue)' : '2.5px solid transparent', color: settingsTab === 'main' ? 'var(--brand-blue)' : 'var(--text-dim)', fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: 'all 0.2s' }}
                onClick={() => setSettingsTab('main')}
              >
                常规设置
              </button>
              <button 
                style={{ flex: 1, padding: '12px', background: 'none', border: 'none', borderBottom: settingsTab === 'drive' ? '2.5px solid var(--brand-blue)' : '2.5px solid transparent', color: settingsTab === 'drive' ? 'var(--brand-blue)' : 'var(--text-dim)', fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: 'all 0.2s' }}
                onClick={() => { setSettingsTab('drive'); setDriveFolderId(null); }}
              >
                共享云盘
              </button>
              <button 
                style={{ flex: 1, padding: '12px', background: 'none', border: 'none', borderBottom: settingsTab === 'logs' ? '2.5px solid var(--brand-blue)' : '2.5px solid transparent', color: settingsTab === 'logs' ? 'var(--brand-blue)' : 'var(--text-dim)', fontWeight: 600, cursor: 'pointer', fontSize: 13, transition: 'all 0.2s' }}
                onClick={() => setSettingsTab('logs')}
              >
                审计日志
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {settingsTab === 'main' && (
                <>
                  <div className="cr-settings-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid var(--border)', gap: 10 }}>
                    <div 
                      onClick={() => {
                        if (groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) {
                          groupAvatarInputRef.current?.click();
                        }
                      }}
                      style={{
                        position: 'relative',
                        cursor: (groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) ? 'pointer' : 'default',
                        borderRadius: '50%',
                        overflow: 'hidden'
                      }}
                    >
                      <Avatar name={groupDetail?.name || chatName || '群聊'} url={groupDetail?.avatar || chatAvatar} size={68} fontSize={24} />
                      {(groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) && (
                        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s', color: '#fff' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0'}>
                          <Edit3 size={16} />
                        </div>
                      )}
                    </div>
                    <input type="file" ref={groupAvatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleGroupAvatarChange} />
                    
                    <div className="cr-settings-group-name" style={{ fontWeight: 700, fontSize: 16 }}>
                      {groupDetail.name || '未命名群聊'}
                    </div>
                    {(groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) && (
                      <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4 }} onClick={handleRenameGroup}>
                        修改群名
                      </button>
                    )}
                  </div>

                  {/* Group Announcement Panel */}
                  <div className="cr-settings-section">
                    <div className="cr-settings-title">群公告</div>
                    {groupDetail.announcement ? (
                      <div style={{ fontSize: '13px', color: 'var(--text)', background: 'var(--hover)', padding: '10px', borderRadius: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {groupDetail.announcement}
                      </div>
                    ) : (
                      <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>暂无公告</div>
                    )}
                    {(groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: 8 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ flex: 1, fontSize: 12, padding: '6px' }}
                          onClick={() => {
                            const ann = prompt("请输入新的群公告：", groupDetail.announcement || "");
                            if (ann !== null) {
                              updateGroupAnnouncement(chatId, ann.trim()).then(ok => {
                                if (ok) refreshGroupDetail();
                              });
                            }
                          }}
                        >
                          修改公告
                        </button>
                        {groupDetail.announcement && (
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            onClick={() => {
                              if (confirm("确定要清除群公告吗？")) {
                                updateGroupAnnouncement(chatId, "").then(ok => {
                                  if (ok) refreshGroupDetail();
                                });
                              }
                            }}
                          >
                            删除
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Mute Control Panel */}
                  {(groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) && (
                    <div className="cr-settings-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>全体禁言</span>
                      <input
                        type="checkbox"
                        checked={!!groupDetail.mute_all}
                        onChange={async (e) => {
                          const ok = await muteAllGroup(chatId, e.target.checked);
                          if (ok) refreshGroupDetail();
                        }}
                        style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: 'var(--brand-blue)' }}
                      />
                    </div>
                  )}

                  <div className="cr-settings-section">
                    <div className="cr-settings-title">
                      <span>群成员 ({groupDetail.members?.filter((m: any) => !m.is_ai).length || 0})</span>
                      <button
                        className="member-action-btn"
                        title="邀请好友"
                        onClick={() => {
                          setSelectedInviteFriends([]);
                          setShowInviteModal(true);
                        }}
                        style={{ color: 'var(--brand-blue)', display: 'flex', alignItems: 'center' }}
                      >
                        <InviteIcon size={15} />
                      </button>
                    </div>
                    <div className="cr-settings-member-list">
                      {groupDetail.members?.filter((member: any) => !member.is_ai).map((member: any) => {
                        const isOwner = member.id === groupDetail.owner_id;
                        const isAdmin = groupDetail.admins?.includes(member.id);
                        const isMe = member.id === currentUserId;
                        const canKick = (groupDetail.owner_id === currentUserId && !isOwner) || (groupDetail.admins?.includes(currentUserId) && !isOwner && !isAdmin);
                        const canSetAdmin = groupDetail.owner_id === currentUserId && !isOwner;
                        
                        const isMuted = groupDetail.muted_members && !!groupDetail.muted_members[member.id];
                        const canMute = !isOwner && !isMe && (
                          groupDetail.owner_id === currentUserId ||
                          (groupDetail.admins?.includes(currentUserId) && !isAdmin)
                        );

                        const hasActions = canMute || canSetAdmin || (canKick && !isMe);
                        const isMenuOpen = activeMemberMenuId === member.id;

                        return (
                          <div key={member.id} className="cr-settings-member-item" style={{ position: 'relative' }}>
                            <div className="member-info">
                              <Avatar name={member.nickname} url={member.avatar} size={28} />
                              <span className="member-name">{member.nickname}</span>
                              {isOwner && <span className="member-badge badge-owner">群主</span>}
                              {isAdmin && <span className="member-badge badge-admin">管理员</span>}
                            </div>
                            {hasActions && (
                              <button
                                className="member-menu-btn"
                                title="更多操作"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isMenuOpen) {
                                    setActiveMemberMenuId(null);
                                    setPopoverPos(null);
                                  } else {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setActiveMemberMenuId(member.id);
                                    const pos = calculatePopoverPosition({
                                      triggerRect: rect,
                                      popupSize: { width: 180, height: 120 }
                                    });
                                    setPopoverPos(pos);
                                  }
                                }}
                              >
                                <HorizontalDotsIcon size={16} />
                              </button>
                            )}
                            {isMenuOpen && hasActions && (
                              <div className="member-popover" style={popoverPos ? { top: popoverPos.top, left: popoverPos.left } : undefined} onClick={(e) => e.stopPropagation()}>
                                {canMute && (
                                  <div className="member-popover-item">
                                    <span>禁言</span>
                                    <label className="toggle-switch">
                                      <input
                                        type="checkbox"
                                        checked={isMuted}
                                        onChange={() => {
                                          handleToggleMute(member.id, isMuted);
                                          setActiveMemberMenuId(null);
                                        }}
                                      />
                                      <span className="toggle-slider" />
                                    </label>
                                  </div>
                                )}
                                {canMute && (canSetAdmin || (canKick && !isMe)) && <div className="member-popover-divider" />}
                                {canSetAdmin && (
                                  <button
                                    className="member-popover-item"
                                    onClick={() => {
                                      handleToggleAdmin(member.id, isAdmin);
                                      setActiveMemberMenuId(null);
                                    }}
                                  >
                                    <span>{isAdmin ? '取消管理员' : '设为管理员'}</span>
                                    <AdminIcon size={15} />
                                  </button>
                                )}
                                {canSetAdmin && (canKick && !isMe) && <div className="member-popover-divider" />}
                                {canKick && !isMe && (
                                  <button
                                    className="member-popover-item danger"
                                    onClick={() => {
                                      handleKickMember(member.id, member.nickname);
                                      setActiveMemberMenuId(null);
                                    }}
                                  >
                                    <span>移出群聊</span>
                                    <KickIcon size={14} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI Members Section */}
                  <div className="cr-settings-section">
                    <div className="cr-settings-title">
                      <span>AI成员 ({aiMembers.length || 0})</span>
                      <button
                        className="member-action-btn"
                        title="添加AI成员"
                        onClick={() => {
                          setAIName('');
                          setAIPersonality('');
                          setShowAddAIModal(true);
                        }}
                        style={{ color: 'var(--brand-blue)', display: 'flex', alignItems: 'center' }}
                      >
                        <InviteIcon size={15} />
                      </button>
                    </div>
                    <div className="cr-settings-member-list">
                      {aiMembers.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '12px', color: 'var(--text-dim)', fontSize: '12px' }}>
                          暂无AI成员
                        </div>
                      ) : (
                        aiMembers.map(ai => (
                          <div key={ai.id} className="cr-settings-member-item">
                            <div className="member-info">
                              <Avatar name={ai.name} url={ai.avatar} size={28} />
                              <span className="member-name">{ai.name}</span>
                              {ai.personality && (
                                <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: '4px' }}>
                                  ({ai.personality})
                                </span>
                              )}
                            </div>
                            <div className="cr-settings-member-actions" style={{ display: 'flex', gap: '8px' }}>
                              {(groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) && (
                                <button
                                  className="member-action-btn"
                                  title="编辑AI"
                                  onClick={() => {
                                    setEditingAI(ai);
                                    setEditingAIName(ai.name);
                                    setEditingAIPersonality(ai.personality || '');
                                    setEditingAIAvatar(ai.avatar || '');
                                  }}
                                  style={{ display: 'flex', alignItems: 'center', color: 'var(--brand-blue)' }}
                                >
                                  <Edit3 size={14} />
                                </button>
                              )}
                              {(groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) && (
                                <button
                                  className="member-action-btn danger"
                                  title="移除AI"
                                  onClick={() => handleRemoveAI(ai.id)}
                                  style={{ display: 'flex', alignItems: 'center' }}
                                >
                                  <KickIcon size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="cr-settings-section" style={{ marginTop: 'auto', borderBottom: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {groupDetail.owner_id === currentUserId ? (
                      <button
                        className="btn btn-danger"
                        style={{ width: '100%', borderRadius: 8, padding: '10px' }}
                        onClick={async () => {
                          if (confirm("确定要解散该群聊吗？此操作不可撤销！")) {
                            const ok = await dissolveGroup(chatId);
                            if (ok) onBack?.();
                          }
                        }}
                      >
                        解散群聊
                      </button>
                    ) : (
                      <button
                        className="btn btn-danger"
                        style={{ width: '100%', borderRadius: 8, padding: '10px' }}
                        onClick={handleLeaveGroup}
                      >
                        退出群聊
                      </button>
                    )}
                  </div>
                </>
              )}

              {settingsTab === 'drive' && (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Breadcrumbs Navigation */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '13px' }}>
                    <span 
                      style={{ cursor: 'pointer', color: 'var(--brand-blue)', fontWeight: 600 }}
                      onClick={() => setDriveFolderId(null)}
                    >
                      根目录
                    </span>
                    {driveBreadcrumbs.map((crumb, idx) => (
                      <React.Fragment key={crumb.id}>
                        <span style={{ color: 'var(--text-dim)' }}>/</span>
                        <span 
                          style={{ cursor: 'pointer', color: idx === driveBreadcrumbs.length - 1 ? 'var(--text)' : 'var(--brand-blue)' }}
                          onClick={() => setDriveFolderId(crumb.id)}
                        >
                          {crumb.name}
                        </span>
                      </React.Fragment>
                    ))}
                    {driveFolderId && (
                      <button 
                        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text)', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
                        onClick={() => {
                          if (driveBreadcrumbs.length <= 1) {
                            setDriveFolderId(null);
                          } else {
                            setDriveFolderId(driveBreadcrumbs[driveBreadcrumbs.length - 2].id);
                          }
                        }}
                      >
                        <ArrowLeft size={12} /> 返回上一级
                      </button>
                    )}
                  </div>

                  {/* Operation Bar */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      className="btn btn-primary" 
                      style={{ flex: 1, padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onClick={() => groupDriveFileInputRef.current?.click()}
                      disabled={driveUploading}
                    >
                      <Upload size={14} /> 上传文件
                    </button>
                    <button 
                      className="btn btn-secondary" 
                      style={{ flex: 1, padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      onClick={() => setShowNewDriveFolder(v => !v)}
                    >
                      <Plus size={14} /> 新建文件夹
                    </button>
                    <input type="file" ref={groupDriveFileInputRef} style={{ display: 'none' }} onChange={handleDriveFileUpload} />
                  </div>

                  {showNewDriveFolder && (
                    <form onSubmit={handleCreateDriveFolder} style={{ display: 'flex', gap: '8px' }}>
                      <input 
                        placeholder="文件夹名称"
                        value={newDriveFolderName}
                        onChange={e => setNewDriveFolderName(e.target.value)}
                        style={{ flex: 1, padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--text)', fontSize: '13px' }}
                      />
                      <button type="submit" className="btn btn-primary" style={{ padding: '8px 14px', fontSize: '12px' }}>创建</button>
                    </form>
                  )}

                  {driveUploading && (
                    <div style={{ background: 'var(--hover)', padding: '10px 14px', borderRadius: '8px', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <span>文件上传中...</span>
                        <span>{driveUploadProgress}%</span>
                      </div>
                      <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ width: `${driveUploadProgress}%`, height: '100%', background: 'var(--brand-blue)' }} />
                      </div>
                    </div>
                  )}

                  {driveLoading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>加载中...</div>
                  ) : driveItems.length === 0 ? (
                    <div style={{ padding: '36px 12px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px', border: '1px dashed var(--border)', borderRadius: '8px' }}>
                      暂无共享文件，点击上方按钮上传或新建。
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      {driveItems.map((item: any) => {
                        const isFolder = item.type === 'folder';
                        return (
                          <div 
                            key={item.id} 
                            style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-card)', gap: '10px', cursor: isFolder ? 'pointer' : 'default' }}
                            onClick={() => { if (isFolder) setDriveFolderId(item.id); }}
                          >
                            {isFolder ? <Folder size={20} style={{ color: 'var(--brand-yellow)' }} /> : <File size={20} style={{ color: 'var(--brand-blue)' }} />}
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.name}
                              </span>
                              {!isFolder && (
                                <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                                  {Math.round(item.size / 1024 * 10) / 10} KB • {new Date(item.created_at).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                              {!isFolder && (
                                <a 
                                  href={item.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  style={{ color: 'var(--brand-blue)', fontSize: '11px', textDecoration: 'none', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: '4px', background: 'var(--bg-paper)' }}
                                >
                                  下载
                                </a>
                              )}
                              <button 
                                onClick={() => handleDeleteDriveItem(item.id, item.type)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--badge-unread)', padding: '4px' }}
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {settingsTab === 'logs' && (
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {logsLoading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '13px' }}>加载中...</div>
                  ) : auditLogs.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px' }}>暂无审计日志</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderLeft: '2px solid var(--border)', paddingLeft: '14px', marginLeft: '6px' }}>
                      {auditLogs.map((log: any) => (
                        <div key={log.id} style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {/* Dot indicator */}
                          <div style={{ position: 'absolute', width: '8px', height: '8px', background: 'var(--brand-blue)', borderRadius: '50%', left: '-19px', top: '4px' }} />
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text)' }}>
                              {log.operator_nickname || '系统'}
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text)' }}>
                            {log.action_text || log.details}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Invite Friends Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">邀请好友入群</span>
              <button className="modal-close-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowInviteModal(false)}><CloseIcon size={20} /></button>
            </div>
            <form onSubmit={handleInviteSubmit}>
              <div className="modal-body" style={{ maxHeight: '50vh' }}>
                <div className="friends-select-list">
                  {friends.filter(f => !groupDetail.members?.some((mb: any) => mb.id === f.id)).length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>
                      所有好友均已在群聊中。
                    </div>
                  ) : (
                    friends
                      .filter(f => !groupDetail.members?.some((mb: any) => mb.id === f.id))
                      .map(f => (
                        <div
                          key={f.id}
                          className={`friend-select-item ${selectedInviteFriends.includes(f.id) ? 'selected' : ''}`}
                          onClick={() => {
                            setSelectedInviteFriends(prev =>
                              prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id]
                            );
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedInviteFriends.includes(f.id)}
                            onChange={() => {}}
                            style={{ pointerEvents: 'none', marginRight: 8 }}
                          />
                          <Avatar name={remarks[f.id] || f.nickname} url={f.avatar} size={32} />
                          <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 8 }}>
                            {remarks[f.id] || f.nickname}
                          </span>
                        </div>
                      ))
                  )}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowInviteModal(false)}>
                  取消
                </button>
                <button type="submit" className="btn btn-primary" disabled={selectedInviteFriends.length === 0}>
                  确定
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Forward Message Modal */}
      {showForwardModal && (
        <div className="modal-overlay" onClick={() => setShowForwardModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">转发消息</span>
              <button className="modal-close-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowForwardModal(false)}><CloseIcon size={20} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh' }}>
              <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
                选择要转发到的会话或联系人：
              </div>
              <div className="friends-select-list" style={{ maxHeight: '40vh' }}>
                {chats.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-dim)' }}>
                    暂无可用会话
                  </div>
                ) : (
                  chats.map(c => {
                    const id = c.is_group ? c.group_id! : c.friend_id!;
                    const name = c.is_group ? c.group_name! : (remarks[c.friend_id!] || c.friend_name!);
                    const avatar = c.is_group ? c.group_avatar : c.friend_avatar;
                    return (
                      <div
                        key={`chat-${id}`}
                        className={`friend-select-item ${forwardTargets.some(t => t.id === id) ? 'selected' : ''}`}
                        onClick={() => toggleForwardTarget(id, name, !!c.is_group)}
                      >
                        <input
                          type="checkbox"
                          checked={forwardTargets.some(t => t.id === id)}
                          onChange={() => {}}
                          style={{ pointerEvents: 'none', marginRight: 8 }}
                        />
                        <Avatar name={name} url={avatar} size={32} />
                        <span style={{ fontSize: 13, fontWeight: 500, marginLeft: 8 }}>
                          {name} {c.is_group && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>(群组)</span>}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowForwardModal(false)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleForwardSubmit}
                disabled={forwardTargets.length === 0}
              >
                确定 ({forwardTargets.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right-click Floating Context Menu */}
      {contextMenu && (
        <div
          className="cr-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="cr-context-menu-item" onClick={() => handleCopy(contextMenu.content)}>
            复制
          </button>
          <button className="cr-context-menu-item" onClick={() => handleForwardSingle(contextMenu.content)}>
            转发
          </button>
          {!contextMenu.content.startsWith('{') && (
            <button className="cr-context-menu-item" onClick={() => handleQuoteSelect(contextMenu.messageId)}>
              引用
            </button>
          )}
          {contextMenu.senderId === currentUserId && !contextMenu.content.startsWith('{') && (
            <button className="cr-context-menu-item" onClick={() => handleEditSelect(contextMenu.messageId)}>
              编辑
            </button>
          )}
          {contextMenu.senderId === currentUserId && (Date.now() - new Date(contextMenu.createdAt).getTime()) < 5 * 60 * 1000 && (
            <button className="cr-context-menu-item danger" onClick={() => {
              recallMessage(contextMenu.messageId);
              setContextMenu(null);
            }}>
              撤回
            </button>
          )}
          <button className="cr-context-menu-item" onClick={() => handleStartMultiSelect(contextMenu.messageId)}>
            多选
          </button>
          <button className="cr-context-menu-item danger" onClick={() => handleDeleteSingle(contextMenu.messageId)}>
            删除
          </button>
        </div>
      )}

      {/* Add AI Member Modal */}
      {showAddAIModal && (
        <div className="modal-overlay" onClick={() => setShowAddAIModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">添加AI成员</span>
              <button className="modal-close-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAddAIModal(false)}><CloseIcon size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                  AI名字 <span style={{ color: 'var(--badge-unread)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="输入AI名字（群内唯一）"
                  value={aiName}
                  onChange={e => setAIName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                  性格描述（可选）
                </label>
                <input
                  type="text"
                  placeholder="例如：活泼开朗、幽默风趣、温柔体贴"
                  value={aiPersonality}
                  onChange={e => setAIPersonality(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowAddAIModal(false)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAddAI} disabled={!aiName.trim()}>
                确定
            </button>
            </div>
          </div>
        </div>
      )}
      {/* Edit AI Member Modal */}
      {editingAI && (
        <div className="modal-overlay" onClick={() => setEditingAI(null)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">编辑 AI 成员资料</span>
              <button className="modal-close-btn" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setEditingAI(null)}><CloseIcon size={20} /></button>
            </div>
            <div className="modal-body">
              {/* AI Avatar Selector */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px', gap: '8px' }}>
                <div 
                  onClick={() => editingAIAvatarInputRef.current?.click()}
                  style={{ position: 'relative', cursor: 'pointer', borderRadius: '50%', overflow: 'hidden', width: '64px', height: '64px', border: '1px solid var(--border)' }}
                >
                  <Avatar name={editingAIName || '?'} url={editingAIAvatar} size={64} fontSize={24} />
                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s', color: '#fff' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0'}>
                    <Edit3 size={16} />
                  </div>
                  {aiAvatarUploading && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px' }}>上传中</div>
                  )}
                </div>
                <input type="file" ref={editingAIAvatarInputRef} style={{ display: 'none' }} accept="image/*" onChange={handleEditAIAvatarChange} />
                <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>点击更换头像</span>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                  AI名字 <span style={{ color: 'var(--badge-unread)' }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="输入AI名字"
                  value={editingAIName}
                  onChange={e => setEditingAIName(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                  性格描述
                </label>
                <input
                  type="text"
                  placeholder="例如：活泼开朗、幽默风趣"
                  value={editingAIPersonality}
                  onChange={e => setEditingAIPersonality(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setEditingAI(null)}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveEditAI} disabled={!editingAIName.trim() || aiAvatarUploading}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Global media viewer — navigates across ALL chat media */}
    {viewerUrl !== null && allChatMedia.length > 0 && (
      <MediaPreviewModal
        files={allChatMedia}
        index={viewerIndex}
        onIndexChange={handleViewerIndexChange}
        onClose={() => setViewerUrl(null)}
      />
    )}
    </ChatMediaContext.Provider>
  );
}
