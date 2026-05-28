import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../shared/Avatar';
import { useApp, type Message } from '../../contexts/AppContext';
import { useToast } from '../shared/Toast';
import { API_BASE } from '../../config';
import COS from 'cos-js-sdk-v5';

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

function ChatFileCard({ data }: { data: ChatFileData }) {
  const { token } = useApp();
  const { showToast } = useToast();
  const [transferred, setTransferred] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (data.uploading) {
      setChecking(false);
      return;
    }
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/disk/check-chat-transfer?cos_key=${encodeURIComponent(data.cos_key)}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const resData = await res.json();
          setTransferred(resData.transferred);
        }
      } catch { /* ignore */ }
      finally {
        setChecking(false);
      }
    };
    checkStatus();
  }, [data.cos_key, data.uploading, token]);

  const handleTransfer = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (saving || transferred) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/disk/save-chat-file`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          filename: data.file_name,
          size: data.file_size,
          cos_key: data.cos_key
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setTransferred(true);
        showToast('已物理转存至您的云盘文件夹！', 'success');
      } else {
        showToast(resData.error || '转存失败', 'error');
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

  if (data.uploading) {
    // Image upload preview with centered loading animation
    if (data.file_type === 'image') {
      return (
        <div className="chat-file-bubble media-preview uploading" style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px' }}>
          <div style={{ position: 'relative', width: '220px', height: '180px' }}>
            <img
              src={data.url}
              alt={data.file_name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '8px', opacity: 0.7 }}
            />
            {/* Centered loading overlay */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '8px',
              gap: '8px'
            }}>
              <div className="spinner" style={{
                width: '32px',
                height: '32px',
                border: '3px solid rgba(255,255,255,0.3)',
                borderTopColor: '#ffffff',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }}></div>
              <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 500 }}>{data.progress || 0}%</span>
            </div>
          </div>
        </div>
      );
    }

    // Video upload preview with centered loading animation
    if (data.file_type === 'video') {
      return (
        <div className="chat-file-bubble media-preview uploading" style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', width: '260px', height: '200px' }}>
          <video
            src={data.url}
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.7 }}
          />
          {/* Centered loading overlay */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: '8px',
            gap: '8px'
          }}>
            <div className="spinner" style={{
              width: '32px',
              height: '32px',
              border: '3px solid rgba(255,255,255,0.3)',
              borderTopColor: '#ffffff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }}></div>
            <span style={{ fontSize: '12px', color: '#ffffff', fontWeight: 500 }}>{data.progress || 0}%</span>
          </div>
        </div>
      );
    }

    // Audio upload with simple loading state
    return (
      <div className="chat-file-bubble uploading" style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '200px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="spinner" style={{
            width: '16px',
            height: '16px',
            border: '2px solid rgba(0,0,0,0.1)',
            borderTopColor: 'var(--brand-blue)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>正在发送 {data.file_name} ...</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, height: '4px', background: 'var(--border-light)', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ width: `${data.progress || 0}%`, height: '100%', background: 'var(--brand-blue)', transition: 'width 0.1s' }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{data.progress || 0}%</span>
        </div>
      </div>
    );
  }

  // Preview renderer
  if (data.file_type === 'image') {
    return (
      <div className="chat-file-bubble media-preview" style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px' }}>
        <div style={{ position: 'relative', width: '220px', height: '180px', cursor: 'pointer' }} onClick={() => setShowModal(true)}>
          <img
            src={data.url}
            alt={data.file_name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', borderRadius: '8px' }}
          />
        </div>
        
        {/* Full Image Lightbox Modal */}
        {showModal && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }} onClick={() => setShowModal(false)}>
            <div style={{ position: 'relative', maxWidth: '85%', maxHeight: '85%' }} onClick={e => e.stopPropagation()}>
              {/* Close Button */}
              <button 
                onClick={() => setShowModal(false)}
                style={{
                  position: 'absolute',
                  top: '-40px',
                  right: 0,
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '32px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  outline: 'none'
                }}
                title="关闭"
              >
                ×
              </button>
              <img src={data.url} alt={data.file_name} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '4px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'block' }} />
              <div style={{ position: 'absolute', bottom: '-40px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '20px', color: '#fff', fontSize: '13px' }}>
                <a href={data.url} download={data.file_name} target="_blank" rel="noopener noreferrer" style={{ color: 'fff', textDecoration: 'none', fontWeight: 600 }}>下载原图</a>
                <span style={{ cursor: 'pointer', fontWeight: 600 }} onClick={handleTransfer}>{transferred ? '已转存至云盘' : (saving ? '转存中...' : '转存至云盘')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (data.file_type === 'video') {
    return (
      <div className="chat-file-bubble media-preview" style={{ position: 'relative', overflow: 'hidden', borderRadius: '8px', width: '260px', height: '200px' }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', cursor: 'pointer' }} onClick={() => setShowModal(true)}>
          <video
            src={data.url}
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
          {/* Centered play button */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
            transition: 'background 0.2s'
          }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffffff" stroke="none">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          </div>
        </div>
        
        {/* Video Preview Modal */}
        {showModal && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }} onClick={() => setShowModal(false)}>
            <div style={{ position: 'relative', maxWidth: '85%', maxHeight: '85%' }} onClick={e => e.stopPropagation()}>
              {/* Close Button */}
              <button 
                onClick={() => setShowModal(false)}
                style={{
                  position: 'absolute',
                  top: '-40px',
                  right: 0,
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '32px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  outline: 'none'
                }}
                title="关闭"
              >
                ×
              </button>
              <video
                src={data.url}
                controls
                autoPlay
                style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '4px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', display: 'block' }}
              />
              <div style={{ position: 'absolute', bottom: '-40px', left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: '20px', color: '#fff', fontSize: '13px' }}>
                <a href={data.url} download={data.file_name} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'none', fontWeight: 600 }}>下载视频</a>
                <span style={{ cursor: 'pointer', fontWeight: 600 }} onClick={handleTransfer}>{transferred ? '已转存至云盘' : (saving ? '转存中...' : '转存至云盘')}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (data.file_type === 'audio') {
    return (
      <div className="chat-file-bubble media-preview" style={{ minWidth: '240px', background: 'var(--hover)', borderRadius: '8px', padding: '8px 10px', cursor: 'pointer' }} onClick={() => setShowModal(true)}>
        <audio src={data.url} controls style={{ width: '100%', height: '32px', display: 'block' }} />
        
        {/* Audio Preview Modal */}
        {showModal && (
          <div className="modal-overlay" style={{ background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }} onClick={() => setShowModal(false)}>
            <div className="modal-card" style={{ width: '360px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">音频详情</span>
                <button className="modal-close-btn" onClick={() => setShowModal(false)}>×</button>
              </div>
              <div className="modal-body" style={{ textAlign: 'center', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div style={{ color: 'var(--brand-blue)', marginBottom: '8px' }}>
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 18V5l12-2v13" />
                    <circle cx="6" cy="18" r="3" />
                    <circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <div style={{ fontWeight: 600, fontSize: '15px', wordBreak: 'break-all', color: 'var(--text)' }}>{data.file_name}</div>
                <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>大小: {formatBytes(data.file_size)}</div>
                <audio src={data.url} controls style={{ width: '100%', height: '40px', marginTop: '12px' }} />
              </div>
              <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowModal(false)}>关闭</button>
                <a href={data.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <button className="btn btn-secondary">下载</button>
                </a>
                {checking ? (
                  <button className="btn btn-primary" disabled>检测中...</button>
                ) : transferred ? (
                  <button className="btn btn-primary" disabled>已转存</button>
                ) : (
                  <button className="btn btn-primary" onClick={handleTransfer} disabled={saving}>
                    {saving ? '转存中...' : '转存至云盘'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Generic File - clicks open a details popup (弹窗) on web
  return (
    <div className="chat-file-bubble file-card" style={{ cursor: 'pointer', minWidth: '200px', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px' }} onClick={() => setShowModal(true)}>
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

      {showModal && (
        <div className="modal-overlay" onClick={e => e.stopPropagation()}>
          <div className="modal-card" style={{ width: '360px' }}>
            <div className="modal-header">
              <span className="modal-title">文件详情</span>
              <button className="modal-close-btn" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
              <div style={{ color: 'var(--brand-blue)', marginBottom: '8px' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div style={{ fontWeight: 600, fontSize: '15px', wordBreak: 'break-all', color: 'var(--text)' }}>{data.file_name}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-dim)' }}>大小: {formatBytes(data.file_size)}</div>
            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>关闭</button>
              <a href={data.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                <button className="btn btn-secondary">下载</button>
              </a>
              {checking ? (
                <button className="btn btn-primary" disabled>检测中...</button>
              ) : transferred ? (
                <button className="btn btn-primary" disabled>已转存</button>
              ) : (
                <button className="btn btn-primary" onClick={handleTransfer} disabled={saving}>
                  {saving ? '转存中...' : '转存至云盘'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ChatRoom({ currentUserId, chatId, isGroup, chatName, chatAvatar, messages, onSend, onLoad, onBack }: ChatRoomProps) {
  const [text, setText] = useState('');
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
    fetchGroupDetail,
    updateGroupName,
    addGroupMembers,
    removeGroupMember,
    addGroupAdmin,
    removeGroupAdmin,
    addAIMember,
    getAIMembers,
    removeAIMember
  } = useApp();
  const { showToast } = useToast();

  const [tempMessages, setTempMessages] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, messageId: string, content: string } | null>(null);
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

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

  // Mention List State
  const [showMentionList, setShowMentionList] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const mentionListRef = useRef<HTMLDivElement>(null);

  // Load chat and fetch group info
  useEffect(() => {
    onLoad(chatId, isGroup);
    if (isGroup) {
      const getDetail = async () => {
        const detail = await fetchGroupDetail(chatId);
        setGroupDetail(detail);
        // Load AI members
        const aiMembersList = await getAIMembers(chatId);
        setAIMembers(aiMembersList || []);
      };
      getDetail();
      setShowGroupSettings(false);
    } else {
      setGroupDetail(null);
      setShowGroupSettings(false);
      setAIMembers([]);
    }
  }, [chatId, isGroup, onLoad, fetchGroupDetail, getAIMembers]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const refreshGroupDetail = async () => {
    if (isGroup) {
      const detail = await fetchGroupDetail(chatId);
      setGroupDetail(detail);
      // Also refresh AI members
      const aiMembersList = await getAIMembers(chatId);
      setAIMembers(aiMembersList || []);
    }
  };

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

  // Close context menu on click elsewhere
  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, messageId: string, content: string) => {
    e.preventDefault();
    if (isMultiSelect) return;
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      messageId,
      content
    });
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
      setShowGroupSettings(prev => !prev);
    } else {
      navigate('/contacts', { state: { showDetailOfFriendId: chatId } });
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(chatId, text.trim());
    setText('');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const tempId = `temp-${Math.random().toString(36).substring(2, 9)}-${Date.now()}`;
    
    let fileType: 'image' | 'video' | 'audio' | 'file' = 'file';
    if (file.type.startsWith('image/')) fileType = 'image';
    else if (file.type.startsWith('video/')) fileType = 'video';
    else if (file.type.startsWith('audio/')) fileType = 'audio';

    const localUrl = URL.createObjectURL(file);

    const newTempMsg = {
      id: tempId,
      sender_id: currentUserId,
      content: JSON.stringify({
        type: 'chat_file',
        file_name: file.name,
        file_size: file.size,
        file_type: fileType,
        url: localUrl,
        cos_key: '',
        uploading: true,
        progress: 0
      }),
      created_at: new Date().toISOString()
    };

    setTempMessages(prev => [...prev, newTempMsg]);

    try {
      const credRes = await fetch(`${API_BASE}/api/chat/upload-credential`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          filename: file.name,
          size: file.size
        })
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
          setTempMessages(prev => prev.map(m => {
            if (m.id !== tempId) return m;
            return {
              ...m,
              content: JSON.stringify({
                type: 'chat_file',
                file_name: file.name,
                file_size: file.size,
                file_type: fileType,
                url: localUrl,
                cos_key: '',
                uploading: true,
                progress: percent
              })
            };
          }));
        }
      }, (err, _data) => {
        if (err) {
          showToast(`文件直传 COS 失败: ${(err as any).message || ''}`, 'error');
          setTempMessages(prev => prev.filter(m => m.id !== tempId));
          return;
        }

        const finalContent = JSON.stringify({
          type: 'chat_file',
          file_name: file.name,
          file_size: file.size,
          file_type: fileType,
          url: url,
          cos_key: cosKey
        });

        onSend(chatId, finalContent);
        setTempMessages(prev => prev.filter(m => m.id !== tempId));
      });

    } catch (err: any) {
      showToast(err.message || '文件上传失败', 'error');
      setTempMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
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
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
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
            max-width: 85% !important;
          }
          .cr-input-bar {
            padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important;
          }
          .cr-settings-sidebar {
            position: fixed;
            right: 0;
            top: 0;
            bottom: 0;
            z-index: 1500;
            box-shadow: -4px 0 16px rgba(0,0,0,0.15);
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

        /* Group Settings Sidebar */
        .cr-settings-sidebar {
          width: 280px;
          border-left: 1px solid var(--border);
          background: var(--bg-paper);
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow-y: auto;
          flex-shrink: 0;
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
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </button>
        </div>
 
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
                    return parsed.type === 'chat_file' && parsed.file_name === tempParsed.file_name && parsed.file_size === tempParsed.file_size;
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

            return allMsgs.map((m, i) => {
              const isOwn = m.sender_id === currentUserId;
              const isFirstOfGroup = i === 0 || allMsgs[i - 1].sender_id !== m.sender_id;

              // Resolve sender nickname & avatar for group chats
              let senderNickname = '';
              let senderAvatar = undefined;
              let senderIsAI = false;
              if (isGroup && groupDetail && groupDetail.members) {
                const member = groupDetail.members.find((mb: any) => mb.id === m.sender_id);
                if (member) {
                  senderNickname = member.nickname;
                  senderAvatar = member.avatar;
                }
              }
              // Check AI members if not found in regular members
              if (!senderNickname && isGroup && aiMembers.length > 0) {
                const aiMember = aiMembers.find((ai: any) => ai.user_id === m.sender_id);
                if (aiMember) {
                  senderNickname = aiMember.name;
                  senderAvatar = aiMember.avatar;
                  senderIsAI = true;
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
   
              return (
                <div key={m.id} className="msg-container">
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
                          if (m.content.startsWith('{')) {
                            try {
                              const parsed = JSON.parse(m.content);
                              if (parsed) {
                                if (parsed.type === 'file_share') {
                                  fileShareData = parsed;
                                } else if (parsed.type === 'chat_file') {
                                  chatFileData = parsed;
                                }
                              }
                            } catch { /* ignore */ }
                          }

                          const isMedia = chatFileData && (chatFileData.file_type === 'image' || chatFileData.file_type === 'video');
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
                              onContextMenu={(e) => handleContextMenu(e, m.id, m.content)}
                              onClick={() => isMultiSelect && handleToggleSelect(m.id)}
                              style={bubbleStyle}
                            >
                              {fileShareData && <FileShareCard fileShareData={fileShareData} isOwn={isOwn} />}
                              {chatFileData && <ChatFileCard data={chatFileData} />}
                              {!fileShareData && !chatFileData && <span className="msg-text">{m.content}</span>}
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
                        <span style={{ fontSize: '20px' }}>🤖</span>
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
            
            <form onSubmit={handleSend} className="cr-input-bar">
              <button type="button" className="btn btn-secondary" style={{ width: '42px', height: '42px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} onClick={() => fileInputRef.current?.click()} title="发送文件/媒体">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <input
                type="text"
                placeholder="输入消息... (输入@提及成员)"
                value={text}
                onChange={e => {
                  setText(e.target.value);
                  // Detect @ mention
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
                  // Re-show mention list if @ is present
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
              />
              <button type="submit" className="btn cr-send" disabled={!text.trim()}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Group Settings Sidebar */}
      {isGroup && showGroupSettings && groupDetail && (
        <div className="cr-settings-sidebar">
          <div className="cr-settings-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
            <Avatar name={chatName || '群聊'} url={chatAvatar} size={64} fontSize={24} />
            <div className="cr-settings-group-name" style={{ marginTop: 8, fontWeight: 700, fontSize: 16 }}>
              {groupDetail.name || '未命名群聊'}
            </div>
            {/* Show edit button for owner/admin */}
            {(groupDetail.owner_id === currentUserId || groupDetail.admins?.includes(currentUserId)) && (
              <button className="btn btn-secondary" style={{ marginTop: 8, fontSize: 12, padding: '4px 8px', borderRadius: 4 }} onClick={handleRenameGroup}>
                修改群名
              </button>
            )}
          </div>

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
                style={{ color: 'var(--brand-blue)', fontSize: 14 }}
              >
                ➕
              </button>
            </div>
            <div className="cr-settings-member-list">
              {groupDetail.members?.filter((member: any) => !member.is_ai).map((member: any) => {
                const isOwner = member.id === groupDetail.owner_id;
                const isAdmin = groupDetail.admins?.includes(member.id);
                const isMe = member.id === currentUserId;
                const canKick = (groupDetail.owner_id === currentUserId && !isOwner) || (groupDetail.admins?.includes(currentUserId) && !isOwner && !isAdmin);
                const canSetAdmin = groupDetail.owner_id === currentUserId && !isOwner;

                return (
                  <div key={member.id} className="cr-settings-member-item">
                    <div className="member-info">
                      <Avatar name={member.nickname} url={member.avatar} size={28} />
                      <span className="member-name">{member.nickname}</span>
                      {isOwner && <span className="member-badge badge-owner">群主</span>}
                      {isAdmin && <span className="member-badge badge-admin">管理员</span>}
                    </div>
                    <div className="cr-settings-member-actions">
                      {canSetAdmin && (
                        <button
                          className="member-action-btn"
                          title={isAdmin ? "取消管理员" : "设为管理员"}
                          onClick={() => handleToggleAdmin(member.id, isAdmin)}
                          style={{ fontSize: 11 }}
                        >
                          🛡️
                        </button>
                      )}
                      {canKick && !isMe && (
                        <button
                          className="member-action-btn danger"
                          title="移出群聊"
                          onClick={() => handleKickMember(member.id, member.nickname)}
                          style={{ fontSize: 11 }}
                        >
                          ❌
                        </button>
                      )}
                    </div>
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
                style={{ color: 'var(--brand-blue)', fontSize: 14 }}
              >
                ➕
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
                      <span style={{ fontSize: '20px' }}>🤖</span>
                      <span className="member-name">{ai.name}</span>
                      {ai.personality && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', marginLeft: '4px' }}>
                          ({ai.personality})
                        </span>
                      )}
                    </div>
                    <div className="cr-settings-member-actions">
                      <button
                        className="member-action-btn danger"
                        title="移除AI"
                        onClick={() => handleRemoveAI(ai.id)}
                        style={{ fontSize: 11 }}
                      >
                        ❌
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="cr-settings-section" style={{ marginTop: 'auto', borderBottom: 'none' }}>
            <button
              className="btn btn-danger"
              style={{ width: '100%', borderRadius: 8, padding: '10px' }}
              onClick={handleLeaveGroup}
            >
              退出群聊
            </button>
          </div>
        </div>
      )}

      {/* Invite Friends Modal */}
      {showInviteModal && (
        <div className="modal-overlay" onClick={() => setShowInviteModal(false)}>
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">邀请好友入群</span>
              <button className="modal-close-btn" onClick={() => setShowInviteModal(false)}>×</button>
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
              <button className="modal-close-btn" onClick={() => setShowForwardModal(false)}>×</button>
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
              <button className="modal-close-btn" onClick={() => setShowAddAIModal(false)}>×</button>
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
    </div>
  );
}
