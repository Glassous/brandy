import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../components/shared/Toast';
import COS from 'cos-js-sdk-v5';
import { API_BASE } from '../config';

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

interface UploadTask {
  id: string;
  fileName: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'cancelled';
  errorMessage?: string;
  speed: number;
  loaded: number;
  lastTime: number;
  lastLoaded: number;
  cancelFn?: () => void;
}

export function DiskPage() {
  const { token, friends } = useApp();
  const { showToast } = useToast();

  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const [showUploadList, setShowUploadList] = useState(false);
  const [isUploadListMinimized, setIsUploadListMinimized] = useState(false);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [items, setItems] = useState<DiskItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [usedSpace, setUsedSpace] = useState<number>(0);
  const [limitSpace, setLimitSpace] = useState<number>(500 * 1024 * 1024); // Upgrade default to 500M

  const [loading, setLoading] = useState(false);

  // Tabs for main view: drive vs trash
  const [activeTab, setActiveTab] = useState<'drive' | 'trash'>('drive');
  const [trashItems, setTrashItems] = useState<DiskItem[]>([]);

  // Multi Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Folder selector modal for move/copy
  const [showFolderSelector, setShowFolderSelector] = useState<'move' | 'copy' | null>(null);
  const [selectorFolderId, setSelectorFolderId] = useState<string | null>(null);
  const [selectorItems, setSelectorItems] = useState<DiskItem[]>([]);
  const [selectorBreadcrumbs, setSelectorBreadcrumbs] = useState<Breadcrumb[]>([]);

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
        setLimitSpace(data.limit_space || 500 * 1024 * 1024);
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

  // Fetch trash items
  const fetchTrash = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/disk/trash`, { headers: getHeaders() });
      if (res.ok) {
        setTrashItems(await res.json());
      } else {
        showToast('获取回收站失败', 'error');
      }
    } catch {
      showToast('网络错误，获取回收站失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, getHeaders, showToast]);

  // Fetch items inside target selector folder
  const fetchSelectorItems = useCallback(async (folderId: string | null) => {
    try {
      const url = `${API_BASE}/api/disk/items?parent_id=${folderId || 'root'}`;
      const res = await fetch(url, { headers: getHeaders() });
      if (res.ok) {
        const data: DiskItem[] = await res.json();
        // Exclude the selected items to prevent loops
        setSelectorItems(data.filter(item => item.type === 'folder' && !selectedIds.has(item.id)));
      }
    } catch { /* ignore */ }
  }, [getHeaders, selectedIds]);

  const fetchSelectorBreadcrumbs = useCallback(async (folderId: string | null) => {
    if (!folderId) {
      setSelectorBreadcrumbs([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/disk/folders/${folderId}/path`, {
        headers: getHeaders(),
      });
      if (res.ok) {
        setSelectorBreadcrumbs(await res.json());
      }
    } catch { /* ignore */ }
  }, [getHeaders]);

  // Initial and reactive load
  useEffect(() => {
    if (activeTab === 'drive') {
      fetchItems(currentFolderId);
      fetchBreadcrumbs(currentFolderId);
    } else {
      fetchTrash();
    }
    fetchUsage();
  }, [currentFolderId, activeTab, fetchItems, fetchBreadcrumbs, fetchTrash, fetchUsage]);

  useEffect(() => {
    if (showFolderSelector) {
      fetchSelectorItems(selectorFolderId);
      fetchSelectorBreadcrumbs(selectorFolderId);
    }
  }, [showFolderSelector, selectorFolderId, fetchSelectorItems, fetchSelectorBreadcrumbs]);

  // Clear Recycle Bin
  const handleClearTrash = async () => {
    if (!confirm('确定要清空回收站吗？此操作将永久删除所有文件，且不可恢复！')) return;
    try {
      const res = await fetch(`${API_BASE}/api/disk/trash/clear`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        showToast('回收站已清空', 'success');
        fetchTrash();
        fetchUsage();
      } else {
        showToast('清空回收站失败', 'error');
      }
    } catch {
      showToast('网络错误，操作失败', 'error');
    }
  };

  // Restore Trashed Item
  const handleRestore = async (itemId: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/disk/trash/${itemId}/restore`, {
        method: 'POST',
        headers: getHeaders(),
      });
      if (res.ok) {
        showToast('项目已还原', 'success');
        fetchTrash();
        fetchUsage();
      } else {
        showToast('还原项目失败', 'error');
      }
    } catch {
      showToast('网络错误，操作失败', 'error');
    }
  };

  // Permanent Delete
  const handlePermanentDelete = async (itemId: string) => {
    if (!confirm('确定要永久删除此项目吗？此操作不可恢复！')) return;
    try {
      const res = await fetch(`${API_BASE}/api/disk/trash/${itemId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      if (res.ok) {
        showToast('项目已永久删除', 'success');
        fetchTrash();
        fetchUsage();
      } else {
        showToast('永久删除失败', 'error');
      }
    } catch {
      showToast('网络错误，操作失败', 'error');
    }
  };

  // Batch Delete (Move to Recycle Bin)
  const handleBatchDelete = async () => {
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个项目吗？如果是文件夹，其下所有子内容也将移入回收站。`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/disk/items/batch-delete`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ item_ids: Array.from(selectedIds) }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('批量移入回收站成功', 'success');
        setSelectedIds(new Set());
        fetchItems(currentFolderId);
        fetchUsage();
      } else {
        showToast(data.error || '批量删除失败', 'error');
      }
    } catch {
      showToast('网络错误，操作失败', 'error');
    }
  };

  // Open folder tree selector modal
  const handleOpenFolderSelector = (type: 'move' | 'copy') => {
    setSelectorFolderId(null);
    setShowFolderSelector(type);
  };

  // Confirm Move / Copy
  const handleFolderSelectorConfirm = async () => {
    if (!showFolderSelector) return;
    const targetParentId = selectorFolderId || 'root';
    const itemIds = Array.from(selectedIds);
    const url = showFolderSelector === 'move' ? `${API_BASE}/api/disk/items/move` : `${API_BASE}/api/disk/items/copy`;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ item_ids: itemIds, target_parent_id: targetParentId }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(showFolderSelector === 'move' ? '移动成功' : '复制成功', 'success');
        setShowFolderSelector(null);
        setSelectedIds(new Set());
        fetchItems(currentFolderId);
        fetchUsage();
      } else {
        showToast(data.error || '操作失败', 'error');
      }
    } catch {
      showToast('网络错误，操作失败', 'error');
    }
  };

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

  const initiateSingleFileUpload = (file: File, taskId: string) => {
    // 1. 设置状态为上传中
    setUploadTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'uploading', lastTime: Date.now() } : t));

    (async () => {
      let currentCosKey = '';
      let currentUrl = '';
      try {
        // A. 请求 STS 凭证
        const credentialRes = await fetch(`${API_BASE}/api/disk/upload-credential`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            filename: file.name,
            size: file.size,
            parent_id: currentFolderId || 'root',
          }),
        });

        if (!credentialRes.ok) {
          const errData = await credentialRes.json();
          throw new Error(errData.error || '获取上传凭证失败');
        }

        const credentialData = await credentialRes.json();
        const { credentials, bucket, region, cosKey, url } = credentialData;
        currentCosKey = cosKey;
        currentUrl = url;

        // B. 初始化 COS 客户端
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

        // C. 开始直传并记录进度与取消操作
        cos.uploadFile({
          Bucket: bucket,
          Region: region,
          Key: cosKey,
          Body: file,
          onTaskReady: (tid) => {
            setUploadTasks(prev => prev.map(t => t.id === taskId ? {
              ...t,
              cancelFn: () => {
                cos.cancelTask(tid);
              }
            } : t));
          },
          onProgress: (progressData) => {
            const { loaded, total } = progressData;
            const now = Date.now();
            const percent = Math.round((loaded / total) * 100);

            setUploadTasks(prev => prev.map(t => {
              if (t.id !== taskId) return t;

              let speed = t.speed;
              let lastTime = t.lastTime;
              let lastLoaded = t.lastLoaded;

              const timeDiff = (now - lastTime) / 1000;
              if (timeDiff >= 0.5) {
                const loadedDiff = loaded - lastLoaded;
                const currentSpeed = loadedDiff / timeDiff;
                // 滑动均值平滑处理速度
                speed = speed === 0 ? currentSpeed : speed * 0.7 + currentSpeed * 0.3;
                lastTime = now;
                lastLoaded = loaded;
              }

              return {
                ...t,
                progress: percent,
                loaded,
                speed,
                lastTime,
                lastLoaded,
              };
            }));
          },
        }, async (err, _data) => {
          if (err) {
            const errorObj = err as any;
            const isCancel = errorObj.error === 'cancelled' || 
                             errorObj.name === 'cancel' || 
                             errorObj.message === 'cancelled' ||
                             (errorObj.message && typeof errorObj.message === 'string' && errorObj.message.toLowerCase().includes('cancel')) ||
                             (errorObj.error && typeof errorObj.error === 'string' && errorObj.error.toLowerCase().includes('cancel'));

            setUploadTasks(prev => prev.map(t => t.id === taskId ? {
              ...t,
              status: isCancel ? 'cancelled' : 'error',
              errorMessage: isCancel ? '用户已取消' : (errorObj.message || '直传 COS 失败'),
              speed: 0,
            } : t));

            if (!isCancel) {
              showToast(`文件「${file.name}」上传失败: ${errorObj.message || ''}`, 'error');
            }
            return;
          }

          // D. 通知后端直传完成并入库
          try {
            const completeRes = await fetch(`${API_BASE}/api/disk/upload-complete`, {
              method: 'POST',
              headers: getHeaders(),
              body: JSON.stringify({
                filename: file.name,
                size: file.size,
                parent_id: currentFolderId || 'root',
                cos_key: currentCosKey,
                url: currentUrl,
              }),
            });

            if (!completeRes.ok) {
              const errData = await completeRes.json();
              throw new Error(errData.error || '保存文件元数据失败');
            }

            setUploadTasks(prev => prev.map(t => t.id === taskId ? {
              ...t,
              status: 'completed',
              progress: 100,
              speed: 0,
            } : t));

            showToast(`文件「${file.name}」上传成功`, 'success');
            fetchItems(currentFolderId);
            fetchUsage();
          } catch (completeErr: any) {
            setUploadTasks(prev => prev.map(t => t.id === taskId ? {
              ...t,
              status: 'error',
              errorMessage: completeErr.message || '保存文件信息失败',
              speed: 0,
            } : t));
            showToast(`文件「${file.name}」保存元数据失败: ${completeErr.message}`, 'error');
          }
        });

      } catch (uploadErr: any) {
        setUploadTasks(prev => prev.map(t => t.id === taskId ? {
          ...t,
          status: 'error',
          errorMessage: uploadErr.message || '初始化上传失败',
          speed: 0,
        } : t));
        showToast(`文件「${file.name}」初始化失败: ${uploadErr.message}`, 'error');
      }
    })();
  };

  // Handle file upload with progress
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    
    // 容量配额校验
    const totalSelectedSize = filesArray.reduce((sum, file) => sum + file.size, 0);
    const availableSpace = limitSpace - usedSpace;

    if (totalSelectedSize > availableSpace) {
      showToast(`选中文件总大小（${formatBytes(totalSelectedSize)}）超过剩余可用容量（${formatBytes(availableSpace)}）！`, 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 打开上传浮层并展开
    setShowUploadList(true);
    setIsUploadListMinimized(false);

    // 逐一创建任务并并发上传
    filesArray.forEach(file => {
      const taskId = Math.random().toString(36).substring(2, 9) + '-' + Date.now();
      const newTask: UploadTask = {
        id: taskId,
        fileName: file.name,
        size: file.size,
        progress: 0,
        status: 'pending',
        speed: 0,
        loaded: 0,
        lastTime: Date.now(),
        lastLoaded: 0,
      };

      setUploadTasks(prev => [newTask, ...prev]);
      initiateSingleFileUpload(file, taskId);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
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
          width: 240px;
          height: 100%;
          border-right: 1px solid var(--border);
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          flex-shrink: 0;
          background: var(--bg-paper);
        }

        .disk-sidebar-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text-primary);
        }

        .usage-card {
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: var(--radius);
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
        }

        .usage-info {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
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
          position: relative;
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
          grid-template-columns: 40px 2fr 1fr 1fr 120px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border);
          font-size: 12px;
          font-weight: 600;
          color: var(--text-secondary);
          user-select: none;
        }

        .item-row {
          display: grid;
          grid-template-columns: 40px 2fr 1fr 1fr 120px;
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

        .item-row.selected {
          background-color: var(--hover-light, rgba(0, 122, 255, 0.05));
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

        .item-name-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .item-name-text {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .item-meta-mobile {
          display: none;
          font-size: 11px;
          color: var(--text-dim);
          margin-top: 2px;
        }
        .btn-text {
          margin-left: 6px;
        }

        @media (max-width: 768px) {
          .disk-sidebar {
            display: none;
          }
          .btn-text {
            display: none;
          }
          .disk-header {
            height: auto !important;
            min-height: 56px;
            padding: 8px 16px !important;
            flex-wrap: wrap;
            gap: 8px !important;
          }
          .top-usage-container {
            max-width: none !important;
            width: 100% !important;
            order: 3;
            margin: 4px 0 !important;
          }
          .breadcrumbs {
            order: 1;
          }
          .header-actions {
            order: 2;
          }
          .list-header {
            display: none !important;
          }
          .item-row {
            grid-template-columns: 1fr auto !important;
            padding: 10px 12px !important;
            gap: 12px !important;
          }
          .item-size-col, .item-time-col {
            display: none !important;
          }
          .item-actions-col {
            opacity: 1 !important;
            display: flex;
            gap: 4px;
          }
          .action-icon-btn {
            padding: 6px !important;
          }
          .disk-list-pane {
            padding: 8px 16px !important;
          }
          .item-meta-mobile {
            display: inline !important;
          }
          .upload-queue-panel {
            width: calc(100% - 32px) !important;
            left: 16px !important;
            right: 16px !important;
            bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important;
          }
        }

        /* Top Space Capacity & Actions Header styling */
        .top-usage-container {
          display: flex;
          align-items: center;
          gap: 10px;
          margin: 0 16px;
          flex: 1;
          justify-content: center;
          max-width: 320px;
        }

        .top-usage-text {
          font-size: 12px;
          color: var(--text-secondary);
          white-space: nowrap;
        }

        .top-progress-container {
          height: 6px;
          flex: 1;
          background: var(--hover);
          border-radius: 3px;
          overflow: hidden;
          min-width: 80px;
        }

        .top-progress-fill {
          height: 100%;
          transition: width 0.3s ease;
          border-radius: 3px;
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Floating upload queue panel styles */
        .upload-queue-panel {
          position: fixed;
          bottom: 24px;
          right: 24px;
          width: 380px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
          z-index: 1000;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          transition: all 0.3s ease;
        }

        .upload-queue-panel.minimized {
          height: 48px;
        }

        .upload-queue-header {
          height: 48px;
          background: var(--bg-paper);
          border-bottom: 1px solid var(--border);
          padding: 0 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
        }

        .upload-queue-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-primary);
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .upload-queue-controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .upload-queue-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s, color 0.2s;
        }

        .upload-queue-btn:hover {
          background-color: var(--hover);
          color: var(--text-primary);
        }

        .upload-queue-body {
          max-height: 320px;
          overflow-y: auto;
          background: var(--bg-card);
        }

        .upload-queue-item {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-light);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .upload-queue-item:last-child {
          border-bottom: none;
        }

        .queue-item-info {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .queue-item-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
        }

        .queue-item-meta {
          font-size: 11px;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .queue-item-progress-container {
          height: 4px;
          width: 100%;
          background: var(--hover);
          border-radius: 2px;
          overflow: hidden;
        }

        .queue-item-progress-fill {
          height: 100%;
          background: var(--brand-blue);
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .queue-item-progress-fill.completed {
          background: var(--brand-green, #4CAF50);
        }

        .queue-item-progress-fill.error {
          background: var(--badge-unread, #E87A5E);
        }

        .queue-item-progress-fill.cancelled {
          background: var(--text-secondary);
        }

        .queue-item-status-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>

      {/* Sidebar for Navigation & Tabs */}
      <div className="disk-sidebar">
        <div className="disk-sidebar-title">文件整理</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            className={`btn ${activeTab === 'drive' ? '' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', textAlign: 'left', width: '100%', padding: '10px 14px', borderRadius: '8px' }}
            onClick={() => {
              setActiveTab('drive');
              setSelectedIds(new Set());
            }}
          >
            📁 我的文件
          </button>
          <button
            className={`btn ${activeTab === 'trash' ? '' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', textAlign: 'left', width: '100%', padding: '10px 14px', borderRadius: '8px' }}
            onClick={() => {
              setActiveTab('trash');
              setSelectedIds(new Set());
            }}
          >
            🗑️ 回收站
          </button>
        </div>

        <div className="usage-card" style={{ marginTop: 'auto' }}>
          <div className="usage-info">
            <span>已用容量</span>
            <span className="usage-percent">{usagePercent.toFixed(1)}%</span>
          </div>
          <div className="progress-bar-container" title={`已使用 ${usagePercent.toFixed(1)}%`}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${usagePercent}%`,
                backgroundColor: getProgressColor(),
              }}
            />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
            {formatBytes(usedSpace)} / {formatBytes(limitSpace)}
          </span>
        </div>
      </div>

      {/* File Browser Panel occupies the main screen area */}
      <main className="disk-main">
        {/* Navigation Breadcrumbs Header & Space Usage & Controls */}
        <div className="disk-header">
          {activeTab === 'drive' && currentFolderId && (
            <button
              className="back-btn"
              onClick={() => {
                if (breadcrumbs.length <= 1) {
                  setCurrentFolderId(null);
                } else {
                  setCurrentFolderId(breadcrumbs[breadcrumbs.length - 2].id);
                }
                setSelectedIds(new Set());
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              返回上一级
            </button>
          )}

          {activeTab === 'drive' ? (
            <div className="breadcrumbs">
              <span
                className="breadcrumb-item"
                onClick={() => { setCurrentFolderId(null); setSelectedIds(new Set()); }}
              >
                根目录
              </span>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="breadcrumb-separator">/</span>
                  <span
                    className="breadcrumb-item"
                    onClick={() => { setCurrentFolderId(crumb.id); setSelectedIds(new Set()); }}
                  >
                    {crumb.name}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ flex: 1, fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>
              回收站
            </div>
          )}

          {/* Horizontal Capacity Bar */}
          <div className="top-usage-container">
            <span className="top-usage-text">
              容量: {formatBytes(usedSpace)} / {formatBytes(limitSpace)}
            </span>
            <div className="top-progress-container" title={`已使用 ${usagePercent.toFixed(1)}%`}>
              <div
                className="top-progress-fill"
                style={{
                  width: `${usagePercent}%`,
                  backgroundColor: getProgressColor(),
                }}
              />
            </div>
          </div>

          {/* Operation Buttons */}
          <div className="header-actions">
            {activeTab === 'drive' ? (
              <>
                <button className="btn" onClick={() => fileInputRef.current?.click()}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span className="btn-text">上传文件</span>
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  multiple
                  onChange={handleFileUpload}
                />

                <button className="btn btn-secondary" onClick={() => setShowNewFolderModal(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                  </svg>
                  <span className="btn-text">新建文件夹</span>
                </button>
              </>
            ) : (
              <button className="btn btn-danger" onClick={handleClearTrash} disabled={trashItems.length === 0}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span className="btn-text">清空回收站</span>
              </button>
            )}

            <button className="btn btn-secondary" onClick={() => setShowUploadList(prev => !prev)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="8" y1="6" x2="21" y2="6" />
                <line x1="8" y1="12" x2="21" y2="12" />
                <line x1="8" y1="18" x2="21" y2="18" />
                <line x1="3" y1="6" x2="3.01" y2="6" />
                <line x1="3" y1="12" x2="3.01" y2="12" />
                <line x1="3" y1="18" x2="3.01" y2="18" />
              </svg>
              <span className="btn-text">
                传输列表 {uploadTasks.filter(t => t.status === 'uploading' || t.status === 'pending').length > 0 ? `(${uploadTasks.filter(t => t.status === 'uploading' || t.status === 'pending').length})` : ''}
              </span>
            </button>
          </div>
        </div>

        {/* File and Folder List Container */}
        <div className="disk-list-pane">
          {loading ? (
            <div className="empty-pane">
              <div>正在加载文件列表...</div>
            </div>
          ) : activeTab === 'drive' && items.length === 0 ? (
            <div className="empty-pane">
              <svg className="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.008 1.24l.885 1.77a2.25 2.25 0 002.007 1.24h1.98a2.25 2.25 0 002.007-1.24l.885-1.77a2.25 2.25 0 012.007-1.24h3.86m-18 0h18a2.25 2.25 0 012.25 2.25v4.25a2.25 2.25 0 01-2.25 2.25H2.25A2.25 2.25 0 010 20.25v-4.25A2.25 2.25 0 012.25 13.5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3h16.5M4.5 6h15M5.25 9h13.5" />
              </svg>
              <div>当前文件夹为空</div>
            </div>
          ) : activeTab === 'trash' && trashItems.length === 0 ? (
            <div className="empty-pane">
              <svg className="empty-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <div>回收站为空</div>
            </div>
          ) : (
            <>
              {/* Header Titles */}
              <div className="list-header" style={{ gridTemplateColumns: activeTab === 'trash' ? '2fr 1fr 1fr 160px' : '40px 2fr 1fr 1fr 120px' }}>
                {activeTab === 'drive' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <input
                      type="checkbox"
                      checked={items.length > 0 && selectedIds.size === items.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(new Set(items.map(item => item.id)));
                        } else {
                          setSelectedIds(new Set());
                        }
                      }}
                      style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--brand-blue)' }}
                    />
                  </div>
                )}
                <div>名称</div>
                <div>大小</div>
                <div>{activeTab === 'drive' ? '修改日期' : '删除日期'}</div>
                <div style={{ textAlign: 'right' }}>操作</div>
              </div>

              {/* Rows */}
              {(activeTab === 'drive' ? items : trashItems).map((item) => (
                <div
                  key={item.id}
                  className={`item-row ${selectedIds.has(item.id) ? 'selected' : ''}`}
                  style={{ gridTemplateColumns: activeTab === 'trash' ? '2fr 1fr 1fr 160px' : '40px 2fr 1fr 1fr 120px' }}
                  onClick={(e) => {
                    if (activeTab === 'trash') return;
                    e.stopPropagation();
                    setSelectedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(item.id)) {
                        next.delete(item.id);
                      } else {
                        next.add(item.id);
                      }
                      return next;
                    });
                  }}
                >
                  {/* Select Checkbox (Only in drive view) */}
                  {activeTab === 'drive' && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (next.has(item.id)) {
                              next.delete(item.id);
                            } else {
                              next.add(item.id);
                            }
                            return next;
                          });
                        }}
                        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: 'var(--brand-blue)' }}
                      />
                    </div>
                  )}

                  {/* Name Column */}
                  <div className="item-name-col" onClick={(e) => {
                    if (activeTab === 'drive' && item.type === 'folder') {
                      e.stopPropagation();
                      setCurrentFolderId(item.id);
                      setSelectedIds(new Set());
                    }
                  }}>
                    {item.type === 'folder' ? (
                      <svg className="item-icon folder" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    ) : (
                      <span className="item-icon">{getFileIcon(item.name)}</span>
                    )}
                    <div className="item-name-details">
                      <span className="item-name-text" title={item.name}>{item.name}</span>
                      <span className="item-meta-mobile">
                        {item.type === 'file' ? formatBytes(item.size) : '文件夹'} • {new Date(item.updated_at).toLocaleDateString()}
                      </span>
                    </div>
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
                    {activeTab === 'drive' ? (
                      <>
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
                      </>
                    ) : (
                      <>
                        {/* Restore */}
                        <button className="action-icon-btn" title="还原" onClick={() => handleRestore(item.id)} style={{ color: 'var(--brand-blue)' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                          </svg>
                        </button>

                        {/* Delete Permanently */}
                        <button className="action-icon-btn delete" title="彻底删除" onClick={() => handlePermanentDelete(item.id)}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </main>

      {/* Floating Upload Queue Panel */}
      {showUploadList && (
        <div className={`upload-queue-panel ${isUploadListMinimized ? 'minimized' : ''}`}>
          <div
            className="upload-queue-header"
            onClick={() => setIsUploadListMinimized(prev => !prev)}
          >
            <div className="upload-queue-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="16 16 12 12 8 16" />
                <line x1="12" y1="12" x2="12" y2="21" />
                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
              </svg>
              {uploadTasks.filter(t => t.status === 'uploading' || t.status === 'pending').length > 0
                ? `正在上传 ${uploadTasks.filter(t => t.status === 'uploading' || t.status === 'pending').length} 个文件...`
                : '上传任务列表'}
            </div>
            <div className="upload-queue-controls" onClick={e => e.stopPropagation()}>
              <button
                className="upload-queue-btn"
                title={isUploadListMinimized ? '展开' : '折叠'}
                onClick={() => setIsUploadListMinimized(prev => !prev)}
              >
                {isUploadListMinimized ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                )}
              </button>
              
              <button
                className="upload-queue-btn"
                title="清除已完成任务"
                onClick={() => setUploadTasks(prev => prev.filter(t => t.status === 'uploading' || t.status === 'pending'))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M3 6h18" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>

              <button
                className="upload-queue-btn"
                title="关闭列表"
                onClick={() => setShowUploadList(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>

          {!isUploadListMinimized && (
            <div className="upload-queue-body">
              {uploadTasks.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  暂无上传任务
                </div>
              ) : (
                uploadTasks.map(task => (
                  <div key={task.id} className="upload-queue-item">
                    <div className="queue-item-info">
                      <span className="queue-item-name" title={task.fileName}>
                        {task.fileName}
                      </span>
                      <div className="queue-item-status-icon">
                        {task.status === 'uploading' && (
                          <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation: 'spin 1s linear infinite' }}>
                            <path d="M21 12a9 9 0 0 1-9 9m-9-9a9 9 0 0 1 9-9" />
                          </svg>
                        )}
                        {task.status === 'pending' && (
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>排队中</span>
                        )}
                        {task.status === 'completed' && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-green, #4CAF50)" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                        {task.status === 'error' && (
                          <span title={task.errorMessage}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--badge-unread, #E87A5E)" strokeWidth="3">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </span>
                        )}
                        {task.status === 'cancelled' && (
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>已取消</span>
                        )}
                        {task.status === 'uploading' && task.cancelFn && (
                          <button
                            className="upload-queue-btn"
                            title="取消上传"
                            onClick={() => {
                              if (task.cancelFn) task.cancelFn();
                            }}
                            style={{ padding: '2px', marginLeft: '6px' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--badge-unread, #E87A5E)" strokeWidth="3">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {(task.status === 'uploading' || task.status === 'pending') && (
                      <div className="queue-item-progress-container">
                        <div
                          className="queue-item-progress-fill"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                    )}

                    <div className="queue-item-meta">
                      <span>{formatBytes(task.loaded)} / {formatBytes(task.size)}</span>
                      {task.status === 'uploading' && task.speed > 0 && (
                        <span style={{ color: 'var(--brand-blue)', marginLeft: '8px' }}>
                          速度: {formatBytes(task.speed)}/s
                        </span>
                      )}
                      {task.status === 'error' && task.errorMessage && (
                        <span style={{ color: 'var(--badge-unread, #E87A5E)', marginLeft: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: '200px' }} title={task.errorMessage}>
                          ({task.errorMessage})
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

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

      {/* Floating Selection Action Toolbar */}
      {selectedIds.size > 0 && activeTab === 'drive' && (
        <div className="floating-select-toolbar" style={{
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.15)',
          borderRadius: '12px',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          zIndex: 900
        }}>
          <span style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
            已选择 {selectedIds.size} 个项目
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => handleOpenFolderSelector('move')}>
              移动到
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => handleOpenFolderSelector('copy')}>
              复制到
            </button>
            <button className="btn btn-danger btn-sm" onClick={handleBatchDelete}>
              批量删除
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedIds(new Set())}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* Modal: Target Folder Selector Tree Browser */}
      {showFolderSelector && (
        <div className="modal-overlay" onClick={() => setShowFolderSelector(null)}>
          <div className="modal-content" style={{ width: '460px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', margin: 0 }}>
              {showFolderSelector === 'move' ? '选择移动目标目录' : '选择复制目标目录'}
            </h3>
            
            {/* Modal breadcrumbs */}
            <div className="breadcrumbs" style={{ padding: '12px 0', borderBottom: '1px solid var(--border-light)', overflowX: 'auto', flexShrink: 0 }}>
              <span
                className="breadcrumb-item"
                style={{ fontSize: '13px' }}
                onClick={() => setSelectorFolderId(null)}
              >
                根目录
              </span>
              {selectorBreadcrumbs.map((crumb) => (
                <span key={crumb.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                  <span className="breadcrumb-separator">/</span>
                  <span
                    className="breadcrumb-item"
                    onClick={() => setSelectorFolderId(crumb.id)}
                  >
                    {crumb.name}
                  </span>
                </span>
              ))}
            </div>

            {/* Folder list block */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', minHeight: '180px', maxHeight: '300px' }}>
              {selectorItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-secondary)', fontSize: '13px' }}>
                  此目录下暂无可用子文件夹
                </div>
              ) : (
                selectorItems.map(folder => (
                  <div
                    key={folder.id}
                    onClick={() => setSelectorFolderId(folder.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13.5px',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <svg className="item-icon folder" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: 'var(--brand-yellow)' }}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{folder.name}</span>
                  </div>
                ))
              )}
            </div>

            {/* Modal actions */}
            <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', margin: 0, flexShrink: 0 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowFolderSelector(null)}>
                取消
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={handleFolderSelectorConfirm}>
                确定选择此目录
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
