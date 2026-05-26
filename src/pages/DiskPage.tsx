import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../components/shared/Toast';
import { UploadProgress, useUploadProgress } from '../components/shared/UploadProgress';

const API_BASE = 'http://localhost:8181';

interface DiskItem {
  id: string;
  user_id: string;
  parent_id?: string;
  origin_item_id?: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  cos_key?: string;
  url?: string;
  created_at: string;
  updated_at: string;
}

interface Breadcrumb {
  id: string;
  name: string;
}

export function DiskPage() {
  const { token, friends } = useApp();
  const { showToast } = useToast();
  const { uploadState, startUpload, updateProgress, completeUpload, errorUpload, cancelUpload, setXhr } = useUploadProgress();

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<DiskItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [usedSpace, setUsedSpace] = useState<number>(0);
  const [limitSpace, setLimitSpace] = useState<number>(200 * 1024 * 1024); // 200M

  const [loading, setLoading] = useState(false);

  // Modals state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renameTarget, setRenameTarget] = useState<DiskItem | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [shareTarget, setShareTarget] = useState<DiskItem | null>(null);
  const [selectedFriendId, setSelectedFriendId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const getHeaders = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  // Fetch disk usage info
  const fetchUsage = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/disk/usage`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setUsedSpace(data.used_space || 0);
        setLimitSpace(data.limit_space || 200 * 1024 * 1024);
      }
    } catch { /* ignore */ }
  }, [token, getHeaders]);

  // Fetch folder contents
  const fetchItems = useCallback(async (folderId: string | null) => {
    if (!token) return;
    setLoading(true);
    try {
      const url = `${API_BASE}/api/disk/items?parent_id=${folderId || 'root'}`;
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      } else {
        showToast('获取云盘列表失败', 'error');
      }
    } catch {
      showToast('网络错误，获取云盘列表失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, getHeaders, showToast]);

  // Fetch breadcrumbs
  const fetchBreadcrumbs = useCallback(async (folderId: string | null) => {
    if (!token) return;
    if (!folderId) {
      setBreadcrumbs([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/disk/folders/${folderId}/path`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        setBreadcrumbs(await res.json());
      }
    } catch { /* ignore */ }
  }, [token, getHeaders]);

  // Initial and reactive load
  useEffect(() => {
    fetchItems(currentFolderId);
    fetchBreadcrumbs(currentFolderId);
    fetchUsage();
  }, [currentFolderId, fetchItems, fetchBreadcrumbs, fetchUsage]);

  // Handle create folder
  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/disk/folders`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          name: newFolderName.trim(),
          parent_id: currentFolderId || 'root',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('新建文件夹成功', 'success');
        setShowNewFolderModal(false);
        setNewFolderName('');
        fetchItems(currentFolderId);
      } else {
        showToast(data.error || '新建文件夹失败', 'error');
      }
    } catch {
      showToast('网络错误，创建失败', 'error');
    }
  };

  // Handle file upload with progress
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    // Local capacity preview check
    if (usedSpace + file.size > limitSpace) {
      showToast('云盘容量不足，无法上传（限额200MB）', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    startUpload(file.name);

    const formData = new FormData();
    formData.append('file', file);
    if (currentFolderId) {
      formData.append('parent_id', currentFolderId);
    }

    const xhr = new XMLHttpRequest();
    setXhr(xhr);

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        const percentComplete = Math.round((event.loaded / event.total) * 100);
        updateProgress(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        completeUpload();
        showToast('文件上传成功', 'success');
        fetchItems(currentFolderId);
        fetchUsage();
      } else {
        try {
          const data = JSON.parse(xhr.responseText);
          errorUpload(data.error || '文件上传失败');
          showToast(data.error || '文件上传失败', 'error');
        } catch {
          errorUpload('文件上传失败');
          showToast('文件上传失败', 'error');
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    });

    xhr.addEventListener('error', () => {
      errorUpload('网络错误，上传失败');
      showToast('网络错误，上传失败', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
    });

    xhr.addEventListener('abort', () => {
      if (fileInputRef.current) fileInputRef.current.value = '';
    });

    xhr.open('POST', `${API_BASE}/api/disk/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(formData);
  };

  // Handle rename
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameTarget || !renameValue.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/disk/items/${renameTarget.id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ name: renameValue.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('重命名成功', 'success');
        setRenameTarget(null);
        setRenameValue('');
        fetchItems(currentFolderId);
      } else {
        showToast(data.error || '重命名失败', 'error');
      }
    } catch {
      showToast('网络错误，重命名失败', 'error');
    }
  };

  // Handle delete
  const handleDelete = async (itemId: string) => {
    if (!confirm('您确定要删除此项目吗？如果是文件夹，其子内容也将被一并删除。')) return;

    try {
      const res = await fetch(`${API_BASE}/api/disk/items/${itemId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('删除成功', 'success');
        fetchItems(currentFolderId);
        fetchUsage();
      } else {
        showToast(data.error || '删除失败', 'error');
      }
    } catch {
      showToast('网络错误，删除失败', 'error');
    }
  };

  // Handle share
  const handleShareToFriend = async () => {
    if (!shareTarget || !selectedFriendId) return;

    try {
      const res = await fetch(`${API_BASE}/api/disk/share/friend`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          file_id: shareTarget.id,
          friend_id: selectedFriendId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast('已分享至好友聊天', 'success');
        setShareTarget(null);
        setSelectedFriendId('');
      } else {
        showToast(data.error || '分享失败', 'error');
      }
    } catch {
      showToast('网络错误，分享失败', 'error');
    }
  };

  // Copy URL to clipboard
  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast('链接已复制到剪贴板', 'success');
  };

  // File size formatting helper
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const usagePercent = Math.min((usedSpace / limitSpace) * 100, 100);

  // Determine progress bar color based on usage
  const getProgressColor = () => {
    if (usagePercent > 95) return '#E87A5E'; // Red/Warning
    if (usagePercent > 80) return '#E5C68A'; // Yellow/Warning
    return 'var(--brand-blue)'; // Default Blue
  };

  // File type icon selection helper
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
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext || '')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
          <line x1="7" y1="2" x2="7" y2="22" />
          <line x1="17" y1="2" x2="17" y2="22" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <line x1="2" y1="7" x2="7" y2="7" />
          <line x1="2" y1="17" x2="7" y2="17" />
          <line x1="17" y1="17" x2="22" y2="17" />
          <line x1="17" y1="7" x2="22" y2="7" />
        </svg>
      );
    }
    if (['mp3', 'wav', 'flac', 'ogg', 'wma'].includes(ext || '')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18V5l12-2v13" />
          <circle cx="6.5" cy="18" r="3.5" />
          <circle cx="18.5" cy="16" r="3.5" />
        </svg>
      );
    }
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md'].includes(ext || '')) {
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );
    }
    // Generic file
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <polyline points="13 2 13 9 20 9" />
      </svg>
    );
  };

  return (
    <div className="disk-container">
      <style>{`
        .disk-container {
          display: flex;
          height: 100%;
          width: 100%;
          background: var(--bg-paper);
          overflow: hidden;
        }

        .disk-sidebar {
          width: 300px;
          height: 100%;
          border-right: 1px solid var(--border);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          flex-shrink: 0;
          background: var(--bg-paper);
        }

        .disk-sidebar-title {
          font-size: 20px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .usage-card {
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: var(--radius);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }

        .usage-info {
          display: flex;
          justify-content: space-between;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .usage-percent {
          font-weight: 700;
          color: var(--text-primary);
        }

        .progress-bar-container {
          height: 6px;
          width: 100%;
          background: var(--hover);
          border-radius: 3px;
          overflow: hidden;
        }

        .progress-bar-fill {
          height: 100%;
          transition: width 0.3s ease;
          border-radius: 3px;
        }

        .disk-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .disk-main {
          flex: 1;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: var(--bg-paper);
        }

        .disk-header {
          display: flex;
          align-items: center;
          height: 64px;
          padding: 0 24px;
          border-bottom: 1px solid var(--border);
          background: var(--bg-paper);
          gap: 12px;
        }

        .breadcrumbs {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          color: var(--text-secondary);
          flex: 1;
          overflow-x: auto;
          white-space: nowrap;
        }

        .breadcrumb-item {
          cursor: pointer;
          transition: color 0.2s;
        }

        .breadcrumb-item:hover {
          color: var(--text-primary);
          text-decoration: underline;
        }

        .breadcrumb-separator {
          color: var(--border);
          user-select: none;
        }

        .disk-list-pane {
          flex: 1;
          overflow-y: auto;
          padding: 16px 24px;
        }

        .list-header {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 120px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          user-select: none;
        }

        .item-row {
          display: grid;
          grid-template-columns: 2fr 1fr 1fr 120px;
          align-items: center;
          padding: 12px;
          border-bottom: 1px solid var(--border);
          border-radius: 8px;
          transition: background-color 0.2s, transform 0.1s;
          cursor: pointer;
          font-size: 14px;
        }

        .item-row:hover {
          background-color: var(--hover);
        }

        .item-name-col {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .item-icon {
          color: var(--brand-blue);
          flex-shrink: 0;
        }

        .item-icon.folder {
          color: var(--brand-yellow);
        }

        .item-size-col, .item-time-col {
          color: var(--text-secondary);
          font-size: 13px;
        }

        .item-actions-col {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .item-row:hover .item-actions-col {
          opacity: 1;
        }

        .action-icon-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-secondary);
          padding: 4px;
          border-radius: 4px;
          transition: background-color 0.2s, color 0.2s;
        }

        .action-icon-btn:hover {
          background-color: var(--border-light);
          color: var(--text-primary);
        }

        .action-icon-btn.delete:hover {
          background-color: rgba(232, 122, 94, 0.1);
          color: var(--badge-unread);
        }

        .empty-pane {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 80%;
          color: var(--text-secondary);
          gap: 16px;
        }

        .empty-icon {
          width: 64px;
          height: 64px;
          opacity: 0.2;
        }

        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .modal-content {
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: var(--radius);
          width: 400px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
        }

        .modal-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 8px;
        }

        .back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 13px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg-card);
          color: var(--text-primary);
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .back-btn:hover {
          background: var(--hover);
        }

        .form-select {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          background: var(--bg);
          color: var(--text);
          outline: none;
        }

        .form-select:focus {
          border-color: var(--text);
        }
      `}</style>

      {/* Left Sidebar: Space Usage and Quick Buttons */}
      <aside className="disk-sidebar">
        <h2 className="disk-sidebar-title">云端空间</h2>

        {/* Space Capacity Card */}
        <div className="usage-card">
          <div className="usage-info">
            <span>已使用容量</span>
            <span className="usage-percent">{usagePercent.toFixed(1)}%</span>
          </div>
          <div className="progress-bar-container">
            <div
              className="progress-bar-fill"
              style={{
                width: `${usagePercent}%`,
                backgroundColor: getProgressColor(),
              }}
            />
          </div>
          <div className="usage-info" style={{ fontSize: '12px' }}>
            <span>{formatBytes(usedSpace)}</span>
            <span>限额 {formatBytes(limitSpace)}</span>
          </div>
        </div>

        {/* Operations */}
        <div className="disk-actions">
          <button
            className="btn"
            style={{ width: '100%' }}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState.active}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {uploadState.active ? '上传中...' : '上传文件'}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleFileUpload}
          />

          <button
            className="btn btn-secondary"
            style={{ width: '100%' }}
            onClick={() => setShowNewFolderModal(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
            新建文件夹
          </button>
        </div>

        {uploadState.active && (
          <UploadProgress
            fileName={uploadState.fileName}
            progress={uploadState.progress}
            status={uploadState.status}
            errorMessage={uploadState.errorMessage}
            onCancel={cancelUpload}
          />
        )}
      </aside>

      {/* Right Content Pane: File Browser */}
      <main className="disk-main">
        {/* Navigation Breadcrumbs Header */}
        <div className="disk-header">
          {currentFolderId && (
            <button
              className="back-btn"
              onClick={() => {
                if (breadcrumbs.length <= 1) {
                  setCurrentFolderId(null);
                } else {
                  setCurrentFolderId(breadcrumbs[breadcrumbs.length - 2].id);
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              返回上一级
            </button>
          )}

          <div className="breadcrumbs">
            <span
              className="breadcrumb-item"
              onClick={() => setCurrentFolderId(null)}
            >
              根目录
            </span>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="breadcrumb-separator">/</span>
                <span
                  className="breadcrumb-item"
                  onClick={() => setCurrentFolderId(crumb.id)}
                >
                  {crumb.name}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* File and Folder List Container */}
        <div className="disk-list-pane">
          {loading ? (
            <div className="empty-pane">
              <div>正在加载文件列表...</div>
            </div>
          ) : items.length === 0 ? (
            <div className="empty-pane">
              <svg className="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.008 1.24l.885 1.77a2.25 2.25 0 002.007 1.24h1.98a2.25 2.25 0 002.007-1.24l.885-1.77a2.25 2.25 0 012.007-1.24h3.86m-18 0h18a2.25 2.25 0 012.25 2.25v4.25a2.25 2.25 0 01-2.25 2.25H2.25A2.25 2.25 0 010 20.25v-4.25A2.25 2.25 0 012.25 13.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3h16.5M4.5 6h15M5.25 9h13.5" />
              </svg>
              <div>当前文件夹为空</div>
            </div>
          ) : (
            <>
              {/* Header Titles */}
              <div className="list-header">
                <div>名称</div>
                <div>大小</div>
                <div>修改日期</div>
                <div style={{ textAlign: 'right' }}>操作</div>
              </div>

              {/* Rows */}
              {items.map((item) => (
                <div
                  key={item.id}
                  className="item-row"
                  onClick={() => {
                    if (item.type === 'folder') {
                      setCurrentFolderId(item.id);
                    }
                  }}
                >
                  {/* Name Column */}
                  <div className="item-name-col">
                    {item.type === 'folder' ? (
                      <svg className="item-icon folder" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : (
                      <span className="item-icon">{getFileIcon(item.name)}</span>
                    )}
                    <span title={item.name}>{item.name}</span>
                  </div>

                  {/* Size Column */}
                  <div className="item-size-col">
                    {item.type === 'folder' ? '-' : formatBytes(item.size)}
                  </div>

                  {/* Date Column */}
                  <div className="item-time-col">
                    {new Date(item.updated_at).toLocaleDateString()}
                  </div>

                  {/* Action Buttons Column */}
                  <div className="item-actions-col" onClick={(e) => e.stopPropagation()}>
                    {item.type === 'file' && (
                      <>
                        {/* Download link */}
                        <a href={item.url} target="_blank" rel="noopener noreferrer">
                          <button className="action-icon-btn" title="下载">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                          </button>
                        </a>

                        {/* Copy URL */}
                        {item.url && (
                          <button className="action-icon-btn" title="复制链接" onClick={() => handleCopyLink(item.url!)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                            </svg>
                          </button>
                        )}

                        {/* Share */}
                        <button className="action-icon-btn" title="分享给好友" onClick={() => { setShareTarget(item); setSelectedFriendId(friends[0]?.id || ''); }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="18" cy="5" r="3" />
                            <circle cx="6" cy="12" r="3" />
                            <circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                          </svg>
                        </button>
                      </>
                    )}

                    {/* Rename */}
                    <button className="action-icon-btn" title="重命名" onClick={() => { setRenameTarget(item); setRenameValue(item.name); }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>

                    {/* Delete */}
                    <button className="action-icon-btn delete" title="删除" onClick={() => handleDelete(item.id)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </main>

      {/* Modal: New Folder */}
      {showNewFolderModal && (
        <div className="modal-overlay" onClick={() => setShowNewFolderModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">新建文件夹</h3>
            <form onSubmit={handleCreateFolder} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="文件夹名称"
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewFolderModal(false)}>取消</button>
                <button type="submit" className="btn btn-sm" disabled={!newFolderName.trim()}>创建</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rename */}
      {renameTarget && (
        <div className="modal-overlay" onClick={() => setRenameTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">重命名「{renameTarget.name}」</h3>
            <form onSubmit={handleRename} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="新名称"
                autoFocus
              />
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRenameTarget(null)}>取消</button>
                <button type="submit" className="btn btn-sm" disabled={!renameValue.trim() || renameValue === renameTarget.name}>确定</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Share */}
      {shareTarget && (
        <div className="modal-overlay" onClick={() => setShareTarget(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">分享文件</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Copy URL Section */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>公开下载链接：</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" readOnly value={shareTarget.url} style={{ flex: 1, fontSize: '12px', background: 'var(--hover)' }} />
                  <button className="btn btn-sm" onClick={() => handleCopyLink(shareTarget.url!)}>复制</button>
                </div>
              </div>

              {/* Share to friend section */}
              {friends.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>发给好友：</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      className="form-select"
                      value={selectedFriendId}
                      onChange={(e) => setSelectedFriendId(e.target.value)}
                    >
                      {friends.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.remark || f.nickname || f.username}
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-sm" onClick={handleShareToFriend}>发送</button>
                  </div>
                </div>
              ) : (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                  您还没有好友，添加好友后即可快捷分享。
                </div>
              )}

              <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '0' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShareTarget(null)}>关闭</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
