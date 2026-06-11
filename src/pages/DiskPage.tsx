import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useApp } from '../contexts/AppContext';
import { useToast } from '../components/shared/Toast';
import COS from 'cos-js-sdk-v5';
import { API_BASE } from '../config';
import DiskPreview from './DiskPreview';
import {
  Folder, Trash2, ArrowLeft, Upload, FolderPlus, List,
  FileImage, FileArchive, FileVideo, FileAudio, FileText, File,
  FileSpreadsheet, FileType, FileCode,
  Download, Link, Share2, Move, Copy, Pencil, RotateCcw,
  X, CloudUpload, ChevronUp, ChevronDown, XCircle, Loader, CheckCircle,
  MoreHorizontal, FolderOpen
} from 'lucide-react';

export interface DiskItem {
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
  const [limitSpace, setLimitSpace] = useState<number>(2 * 1024 * 1024 * 1024); // Upgrade default to 2GB

  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Tabs for main view: drive vs trash
  const [activeTab, setActiveTab] = useState<'drive' | 'trash'>('drive');
  const [category, setCategory] = useState<string>('all');
  const [trashItems, setTrashItems] = useState<DiskItem[]>([]);

  // Multi Selection state (persisted per folder level)
  const [selectionMap, setSelectionMap] = useState<Map<string | null, Set<string>>>(new Map());
  const selectedIds = useMemo(() => selectionMap.get(currentFolderId) ?? new Set<string>(), [selectionMap, currentFolderId]);

  // File preview state
  const [previewFile, setPreviewFile] = useState<DiskItem | null>(null);
  const previewFileList = useMemo(() => items.filter(i => i.type === 'file'), [items]);
  const previewIndex = previewFile ? previewFileList.findIndex(i => i.id === previewFile.id) : -1;

  // Close preview when navigating to a different folder
  useEffect(() => { setPreviewFile(null); }, [currentFolderId]);
  // Close preview if the file is no longer in the list
  useEffect(() => {
    if (previewFile && !items.some(i => i.id === previewFile.id)) setPreviewFile(null);
  }, [items, previewFile]);

  // Folder selector modal for move/copy
  const [showFolderSelector, setShowFolderSelector] = useState<'move' | 'copy' | null>(null);
  const [selectorFolderId, setSelectorFolderId] = useState<string | null>(null);
  const [singleActionItem, setSingleActionItem] = useState<DiskItem | null>(null);
  const [selectorItems, setSelectorItems] = useState<DiskItem[]>([]);
  const [selectorBreadcrumbs, setSelectorBreadcrumbs] = useState<Breadcrumb[]>([]);

  // Modals state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [showUrlTransferModal, setShowUrlTransferModal] = useState(false);
  const [transferUrl, setTransferUrl] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  const [renameTarget, setRenameTarget] = useState<DiskItem | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const [shareTarget, setShareTarget] = useState<DiskItem | null>(null);
  const [selectedFriendId, setSelectedFriendId] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);
  const [actionMenuTarget, setActionMenuTarget] = useState<string | null>(null);

  // Close action overflow menu on outside click
  useEffect(() => {
    if (!actionMenuTarget) return;
    const handleClick = (e: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setActionMenuTarget(null);
      }
    };
    // Delay adding listener to avoid the triggering click itself
    setTimeout(() => document.addEventListener('click', handleClick), 0);
    return () => document.removeEventListener('click', handleClick);
  }, [actionMenuTarget]);

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
      let url = `${API_BASE}/api/disk/items?parent_id=${folderId || 'root'}`;
      if (category !== 'all') {
        url += `&category=${category}`;
      }
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
  }, [token, getHeaders, showToast, category]);

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
        // Exclude the selected/single-action items to prevent loops
        setSelectorItems(data.filter(item =>
          item.type === 'folder' &&
          !selectedIds.has(item.id) &&
          item.id !== singleActionItem?.id
        ));
      }
    } catch { /* ignore */ }
  }, [getHeaders, selectedIds, singleActionItem]);

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

  // Handle Android/browser back button for folder navigation
  useEffect(() => {
    const onPopState = () => {
      if (currentFolderId !== null) {
        if (breadcrumbs.length <= 1) {
          setCurrentFolderId(null);
        } else {
          setCurrentFolderId(breadcrumbs[breadcrumbs.length - 2].id);
        }
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [currentFolderId, breadcrumbs]);

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
        setSelectionMap(prev => { const n = new Map(prev); n.set(currentFolderId, new Set()); return n; });
        fetchItems(currentFolderId);
        fetchUsage();
      } else {
        showToast(data.error || '批量删除失败', 'error');
      }
    } catch {
      showToast('网络错误，操作失败', 'error');
    }
  };

  // Open folder tree selector modal (batch or single)
  const handleOpenFolderSelector = (type: 'move' | 'copy', item?: DiskItem) => {
    setSingleActionItem(item ?? null);
    setSelectorFolderId(null);
    setShowFolderSelector(type);
  };

  // Confirm Move / Copy
  const handleFolderSelectorConfirm = async () => {
    if (!showFolderSelector) return;
    const targetParentId = selectorFolderId || 'root';
    const itemIds = singleActionItem ? [singleActionItem.id] : Array.from(selectedIds);
    if (itemIds.length === 0) return;
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
        setSingleActionItem(null);
        if (!singleActionItem) {
          setSelectionMap(prev => { const n = new Map(prev); n.set(currentFolderId, new Set()); return n; });
        }
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

  // Handle URL link transfer
  const handleUrlTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = transferUrl.trim();
    if (!trimmedUrl) return;

    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      showToast('链接必须以 http:// 或 https:// 开头', 'error');
      return;
    }

    // 1. Close modal and clean input early for non-blocking feel
    setShowUrlTransferModal(false);
    setTransferUrl('');

    // 2. Generate a local task ID to represent this transfer in UI
    const localTaskId = 'url-transfer-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now();
    
    // Extract name from URL path
    let fileName = '转存文件';
    try {
      const u = new URL(trimmedUrl);
      const parts = u.pathname.split('/');
      const lastPart = parts[parts.length - 1];
      if (lastPart) {
        fileName = decodeURIComponent(lastPart);
      }
    } catch { /* ignore */ }

    const newTask: UploadTask = {
      id: localTaskId,
      fileName: `[链接转存] ${fileName}`,
      size: 0,
      progress: 0,
      status: 'pending',
      speed: 0,
      loaded: 0,
      lastTime: Date.now(),
      lastLoaded: 0,
    };

    // Add to upload list and open upload drawer
    setUploadTasks(prev => [newTask, ...prev]);
    setShowUploadList(true);
    setIsUploadListMinimized(false);

    try {
      const res = await fetch(`${API_BASE}/api/disk/url-transfer`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          url: trimmedUrl,
          parent_id: currentFolderId || 'root'
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '后端启动转存任务失败');
      }

      const data = await res.json();
      const backendTaskId = data.task_id;

      // Update filename if backend parsed a better one
      if (data.name) {
        setUploadTasks(prev => prev.map(t => t.id === localTaskId ? { ...t, fileName: `[链接转存] ${data.name}` } : t));
      }

      // Start polling status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`${API_BASE}/api/disk/url-transfer/status/${backendTaskId}`, {
            headers: getHeaders(),
          });

          if (!statusRes.ok) {
            clearInterval(pollInterval);
            const errData = await statusRes.json();
            throw new Error(errData.error || '获取转存状态失败');
          }

          const statusData = await statusRes.json();

          if (statusData.status === 'completed') {
            clearInterval(pollInterval);
            setUploadTasks(prev => prev.map(t => t.id === localTaskId ? {
              ...t,
              status: 'completed',
              progress: 100,
              size: statusData.size || 0,
              loaded: statusData.size || 0,
              speed: 0
            } : t));
            showToast(`文件「${statusData.filename || fileName}」转存成功！`, 'success');
            fetchItems(currentFolderId);
            fetchUsage();
          } else if (statusData.status === 'error') {
            clearInterval(pollInterval);
            setUploadTasks(prev => prev.map(t => t.id === localTaskId ? {
              ...t,
              status: 'error',
              errorMessage: statusData.error_message || '转存失败',
              speed: 0
            } : t));
            showToast(`转存失败: ${statusData.error_message || ''}`, 'error');
          } else {
            // Updating status (downloading / uploading)
            setUploadTasks(prev => prev.map(t => {
              if (t.id !== localTaskId) return t;

              // Calculate speed if bytes downloaded/uploaded changed
              const now = Date.now();
              const timeDiff = (now - t.lastTime) / 1000;
              let currentLoaded = statusData.status === 'downloading' ? statusData.downloaded : statusData.uploaded;
              let speed = t.speed;
              if (timeDiff >= 0.5) {
                const loadedDiff = currentLoaded - t.lastLoaded;
                const currentSpeed = loadedDiff / timeDiff;
                speed = speed === 0 ? currentSpeed : speed * 0.7 + currentSpeed * 0.3;
              }

              return {
                ...t,
                status: 'uploading',
                fileName: `[转存:${statusData.status === 'downloading' ? '下载中' : '上传中'}] ${statusData.filename || fileName}`,
                size: statusData.size || 0,
                loaded: currentLoaded,
                progress: statusData.progress,
                speed: speed,
                lastTime: now,
                lastLoaded: currentLoaded,
              };
            }));
          }
        } catch (pollErr: any) {
          clearInterval(pollInterval);
          setUploadTasks(prev => prev.map(t => t.id === localTaskId ? {
            ...t,
            status: 'error',
            errorMessage: pollErr.message || '轮询任务状态失败',
            speed: 0
          } : t));
        }
      }, 1500);

    } catch (err: any) {
      setUploadTasks(prev => prev.map(t => t.id === localTaskId ? {
        ...t,
        status: 'error',
        errorMessage: err.message || '启动转存请求失败',
        speed: 0
      } : t));
      showToast(err.message || '网络错误，转存请求失败', 'error');
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
      return <FileImage size={24} />;
    }
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
      return <FileArchive size={24} />;
    }
    if (['mp4', 'mkv', 'avi', 'mov', 'wmv'].includes(ext || '')) {
      return <FileVideo size={24} />;
    }
    if (['mp3', 'wav', 'flac', 'ogg', 'wma'].includes(ext || '')) {
      return <FileAudio size={24} />;
    }
    if (['pdf'].includes(ext || '')) {
      return <FileText size={24} />;
    }
    if (['doc', 'docx'].includes(ext || '')) {
      return <FileType size={24} />;
    }
    if (['xls', 'xlsx'].includes(ext || '')) {
      return <FileSpreadsheet size={24} />;
    }
    if (['ppt', 'pptx'].includes(ext || '')) {
      return <FileText size={24} />;
    }
    if (['txt'].includes(ext || '')) {
      return <FileText size={24} />;
    }
    if (['md'].includes(ext || '')) {
      return <FileCode size={24} />;
    }
    return <File size={24} />;
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (activeTab === 'drive') {
      setIsDragging(true);
    }
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (activeTab !== 'drive') return;
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const filesArray = Array.from(files);
      const totalSelectedSize = filesArray.reduce((sum, file) => sum + file.size, 0);
      const availableSpace = limitSpace - usedSpace;

      if (totalSelectedSize > availableSpace) {
        showToast(`选中文件总大小（${formatBytes(totalSelectedSize)}）超过剩余可用容量（${formatBytes(availableSpace)}）！`, 'error');
        return;
      }

      setShowUploadList(true);
      setIsUploadListMinimized(false);

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
    }
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
          background-color: var(--hover);
          border-left: 2px solid var(--brand-blue);
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
          border-color: var(--brand-blue);
          box-shadow: 0 0 0 2px rgba(51, 144, 236, 0.15);
          outline: none;
        }

        .checkbox-col {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .item-name-details {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          min-width: 0;
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

        @keyframes indeterminate-progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        .queue-item-progress-fill.indeterminate {
          width: 50% !important;
          background: linear-gradient(90deg, transparent, var(--brand-blue), transparent);
          animation: indeterminate-progress 1.5s infinite linear;
          transform-origin: left;
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

        /* ===== Action Overflow Menu ===== */
        .action-btn-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .action-more-btn {
          display: none;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--text-secondary);
          padding: 4px 6px;
          border-radius: 4px;
          transition: background 0.2s, color 0.2s;
          line-height: 1;
        }
        .action-more-btn:hover { background: var(--border-light); color: var(--text-primary); }
        .action-overlay {
          position: fixed;
          inset: 0;
          z-index: 950;
          background: rgba(0,0,0,0.15);
        }
        .action-sheet {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: var(--bg-card);
          border-radius: 16px 16px 0 0;
          box-shadow: 0 -4px 30px rgba(0,0,0,0.12);
          max-height: 70vh;
          overflow-y: auto;
          animation: sheet-up 0.2s ease-out;
        }
        @keyframes sheet-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        .action-sheet-arrow {
          width: 36px; height: 4px;
          background: var(--border);
          border-radius: 2px;
          margin: 10px auto 4px;
        }
        .action-sheet-body {
          padding: 8px 16px 24px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .action-sheet-item-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary);
          padding: 8px 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          border-bottom: 1px solid var(--border-light);
          margin-bottom: 6px;
        }
        .action-sheet-btn {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 12px;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: var(--text-primary);
          font-size: 14px;
          cursor: pointer;
          transition: background 0.15s;
          text-decoration: none;
          width: 100%;
          text-align: left;
        }
        .action-sheet-btn:hover { background: var(--hover); }
        .action-sheet-btn-danger { color: var(--badge-unread); }
        .action-sheet-btn svg { flex-shrink: 0; }

        /* ===== Tablet Responsive (768px - 1023px) ===== */
        @media (min-width: 768px) and (max-width: 1023px) {
          .disk-sidebar {
            width: 60px;
            padding: 20px 8px;
            align-items: center;
          }
          .disk-sidebar-title { display: none; }
          .disk-sidebar .btn span { display: none; }
          .disk-sidebar .btn {
            justify-content: center !important;
            padding: 10px 0 !important;
            font-size: 20px !important;
          }
          .usage-card { display: none; }
          .checkbox-col { display: none; }
          .list-header { grid-template-columns: 1fr auto !important; }
          .item-row { grid-template-columns: 1fr auto !important; }
          .item-size-col, .item-time-col { display: none; }
          .item-actions-col { opacity: 1; gap: 4px; }
          .action-btn-group { gap: 4px; }
          .action-icon-btn { padding: 5px; }
          .top-usage-container { max-width: 160px; gap: 6px; }
          .disk-list-pane { padding: 12px 20px; }
          .disk-header { gap: 8px; padding: 0 16px; }
          .back-btn { padding: 6px 8px; }
          .back-btn span { display: none; }
          .header-actions .btn,
          .header-actions .btn-secondary {
            background: transparent;
            border: none;
            padding: 6px;
            gap: 0;
            min-width: 0;
          }
          .header-actions .btn-danger {
            background: transparent;
            border: none;
            padding: 6px;
            gap: 0;
            min-width: 0;
            color: var(--badge-unread);
          }
        }

        /* ===== Mobile Responsive (< 768px) ===== */
        @media (max-width: 768px) {
          .disk-sidebar { display: none; }
          .btn-text { display: none; }
          .checkbox-col { display: none !important; }
          .disk-header {
            height: auto !important;
            min-height: 48px;
            padding: 6px 12px !important;
            flex-wrap: wrap;
            gap: 4px !important;
          }
          .back-btn {
            padding: 4px 6px;
            border: none;
            background: transparent;
          }
          .back-btn span { display: none; }
          .breadcrumbs { order: 1; font-size: 13px; }
          .header-actions { order: 2; gap: 2px; }
          .header-actions .btn,
          .header-actions .btn-secondary,
          .header-actions .btn-danger {
            background: transparent !important;
            border: none !important;
            padding: 6px !important;
            gap: 0 !important;
            min-width: 0 !important;
            box-shadow: none !important;
            color: var(--text-secondary);
          }
          .header-actions .btn:hover,
          .header-actions .btn-secondary:hover,
          .header-actions .btn-danger:hover {
            background: var(--hover) !important;
            color: var(--text-primary) !important;
          }
          .header-actions .btn-danger { color: var(--badge-unread); }
          .header-actions svg { width: 18px; height: 18px; }
          .list-header { display: none !important; }
          .item-row {
            grid-template-columns: 1fr auto !important;
            padding: 10px 12px !important;
            gap: 10px !important;
          }
          .item-name-col { gap: 8px; min-width: 0; }
          .item-size-col, .item-time-col { display: none !important; }
          .item-actions-col {
            opacity: 1 !important;
            display: flex;
            gap: 2px;
            align-items: center;
          }
          .action-btn-group { display: none !important; }
          .action-more-btn { display: flex !important; }
          .disk-list-pane { padding: 6px 12px !important; }
          .item-meta-mobile { display: inline !important; }
          .top-usage-container {
            max-width: none !important;
            width: 100% !important;
            order: 3;
            margin: 2px 0 !important;
          }
          .upload-queue-panel {
            width: calc(100% - 32px) !important;
            left: 16px !important;
            right: 16px !important;
            bottom: calc(88px + env(safe-area-inset-bottom, 0px)) !important;
          }
          .floating-select-toolbar {
            left: 50% !important;
            transform: translateX(-50%) !important;
            width: calc(100% - 32px) !important;
            padding: 10px 16px !important;
            gap: 12px !important;
            flex-wrap: wrap;
            justify-content: center;
          }
          .floating-select-toolbar > span { width: 100%; text-align: center; }
          .floating-select-toolbar .btn-sm { font-size: 12px !important; padding: 6px 10px !important; }
          .modal-content { width: calc(100% - 32px) !important; max-width: 400px; }
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
              setSelectionMap(new Map());
            }}
          >
            <Folder size={18} /> 我的文件
          </button>
          <button
            className={`btn ${activeTab === 'trash' ? '' : 'btn-secondary'}`}
            style={{ justifyContent: 'flex-start', textAlign: 'left', width: '100%', padding: '10px 14px', borderRadius: '8px' }}
            onClick={() => {
              setActiveTab('trash');
              setSelectionMap(new Map());
            }}
          >
            <Trash2 size={18} /> 回收站
          </button>
        </div>

        {activeTab === 'drive' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)', paddingLeft: '14px', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>分类检索</span>
            {[
              { code: 'all', name: '全部文件', icon: <List size={16} /> },
              { code: 'document', name: '文档', icon: <FileText size={16} /> },
              { code: 'image', name: '图片', icon: <FileImage size={16} /> },
              { code: 'video', name: '视频', icon: <FileVideo size={16} /> },
              { code: 'audio', name: '音频', icon: <FileAudio size={16} /> },
              { code: 'other', name: '其他', icon: <File size={16} /> },
            ].map(cat => (
              <button
                key={cat.code}
                className={`btn ${category === cat.code ? '' : 'btn-secondary'}`}
                style={{ justifyContent: 'flex-start', textAlign: 'left', width: '100%', padding: '8px 14px', borderRadius: '8px', fontSize: '13px' }}
                onClick={() => {
                  setCategory(cat.code);
                  setSelectionMap(new Map());
                }}
              >
                {cat.icon} <span style={{ marginLeft: '8px' }}>{cat.name}</span>
              </button>
            ))}
          </div>
        )}

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

      <main 
        className="disk-main"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDragging && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(51, 144, 236, 0.12)', border: '2.5px dashed var(--brand-blue)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, pointerEvents: 'none' }}>
            <div style={{ background: 'var(--bg-card)', padding: '16px 24px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--brand-blue)', fontWeight: 600 }}>
              <CloudUpload size={24} /> 释放文件以上传到当前目录
            </div>
          </div>
        )}
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
              }}
            >
              <ArrowLeft size={14} />
              返回上一级
            </button>
          )}

          {activeTab === 'drive' ? (
            <div className="breadcrumbs">
              <span
                className="breadcrumb-item"
                onClick={() => { setCurrentFolderId(null); }}
              >
                根目录
              </span>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="breadcrumb-separator">/</span>
                  <span
                    className="breadcrumb-item"
                    onClick={() => { setCurrentFolderId(crumb.id); }}
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
                  <Upload size={16} />
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
                  <FolderPlus size={16} />
                  <span className="btn-text">新建文件夹</span>
                </button>

                <button className="btn btn-secondary" onClick={() => setShowUrlTransferModal(true)}>
                  <Link size={16} />
                  <span className="btn-text">URL转存</span>
                </button>
              </>
            ) : (
              <button className="btn btn-danger" onClick={handleClearTrash} disabled={trashItems.length === 0}>
                <Trash2 size={16} />
                <span className="btn-text">清空回收站</span>
              </button>
            )}

            <button className="btn btn-secondary" onClick={() => setShowUploadList(prev => !prev)}>
              <List size={16} />
              <span className="btn-text">
                传输列表 {uploadTasks.filter(t => t.status === 'uploading' || t.status === 'pending').length > 0 ? `(${uploadTasks.filter(t => t.status === 'uploading' || t.status === 'pending').length})` : ''}
              </span>
            </button>
          </div>
        </div>

        {/* File and Folder List Container */}
        <div className="disk-list-pane">
          {previewFile && activeTab === 'drive' ? (
            <DiskPreview
              file={previewFile}
              fileList={previewFileList}
              currentIndex={previewIndex}
              onClose={() => setPreviewFile(null)}
              onChangeIndex={(idx) => setPreviewFile(previewFileList[idx])}
            />
          ) : loading ? (
            <div className="empty-pane">
              <div>正在加载文件列表...</div>
            </div>
          ) : activeTab === 'drive' && items.length === 0 ? (
            <div className="empty-pane">
              <FolderOpen size={48} className="empty-icon" />
              <div>当前文件夹为空</div>
            </div>
          ) : activeTab === 'trash' && trashItems.length === 0 ? (
            <div className="empty-pane">
              <Trash2 size={48} className="empty-icon" />
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
                        setSelectionMap(prev => {
                          const n = new Map(prev);
                          n.set(currentFolderId, e.target.checked ? new Set(items.map(i => i.id)) : new Set());
                          return n;
                        });
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
                >
                  {/* Select Checkbox (Only in drive view) */}
                  {activeTab === 'drive' && (
                    <div className="checkbox-col" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => {
                          setSelectionMap(prev => {
                            const n = new Map(prev);
                            const cur = n.get(currentFolderId) ?? new Set<string>();
                            const upd = new Set(cur);
                            if (upd.has(item.id)) { upd.delete(item.id); } else { upd.add(item.id); }
                            n.set(currentFolderId, upd);
                            return n;
                          });
                        }}
                        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: 'var(--brand-blue)' }}
                      />
                    </div>
                  )}

                  {/* Name Column */}
                  <div className="item-name-col" onClick={(e) => {
                    if (activeTab === 'drive') {
                      e.stopPropagation();
                      if (item.type === 'folder') {
                        setCurrentFolderId(item.id);
                        window.history.pushState({ folderId: item.id }, '');
                      } else {
                        setPreviewFile(item);
                      }
                    }
                  }}>
                    {item.type === 'folder' ? (
                      <Folder size={24} className="item-icon folder" />
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
                        <div className="action-btn-group">
                          {item.type === 'file' && (
                            <>
                              {/* Download link */}
                              <a href={item.url} target="_blank" rel="noopener noreferrer">
                                <button className="action-icon-btn" title="下载">
                                  <Download size={16} />
                                </button>
                              </a>

                              {/* Copy URL */}
                              {item.url && (
                                <button className="action-icon-btn" title="复制链接" onClick={() => handleCopyLink(item.url!)}>
                                  <Link size={16} />
                                </button>
                              )}

                              {/* Share */}
                              <button className="action-icon-btn" title="分享给好友" onClick={() => { setShareTarget(item); setSelectedFriendId(friends[0]?.id || ''); }}>
                                <Share2 size={16} />
                              </button>
                            </>
                          )}

                          {/* Move */}
                          <button className="action-icon-btn" title="移动到" onClick={() => handleOpenFolderSelector('move', item)}>
                            <Move size={16} />
                          </button>

                          {/* Copy */}
                          <button className="action-icon-btn" title="复制到" onClick={() => handleOpenFolderSelector('copy', item)}>
                            <Copy size={16} />
                          </button>

                          {/* Rename */}
                          <button className="action-icon-btn" title="重命名" onClick={() => { setRenameTarget(item); setRenameValue(item.name); }}>
                            <Pencil size={16} />
                          </button>

                          {/* Delete */}
                          <button className="action-icon-btn delete" title="删除" onClick={() => handleDelete(item.id)}>
                            <Trash2 size={16} />
                          </button>
                        </div>

                        {/* Mobile more button */}
                        <button
                          className="action-more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActionMenuTarget(actionMenuTarget === item.id ? null : item.id);
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </>
                    ) : (
                      <>
                        {/* Restore */}
                        <button className="action-icon-btn" title="还原" onClick={() => handleRestore(item.id)} style={{ color: 'var(--brand-blue)' }}>
                          <RotateCcw size={16} />
                        </button>

                        {/* Delete Permanently */}
                        <button className="action-icon-btn delete" title="彻底删除" onClick={() => handlePermanentDelete(item.id)}>
                          <Trash2 size={16} />
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
              <CloudUpload size={16} />
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
                  <ChevronDown size={14} />
                ) : (
                  <ChevronUp size={14} />
                )}
              </button>
              
              <button
                className="upload-queue-btn"
                title="清除已完成任务"
                onClick={() => setUploadTasks(prev => prev.filter(t => t.status === 'uploading' || t.status === 'pending'))}
              >
                <XCircle size={14} />
              </button>

              <button
                className="upload-queue-btn"
                title="关闭列表"
                onClick={() => setShowUploadList(false)}
              >
                <X size={14} />
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
                          <Loader size={16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                        )}
                        {task.status === 'pending' && (
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>排队中</span>
                        )}
                        {task.status === 'completed' && (
                          <CheckCircle size={16} color="var(--brand-green, #4CAF50)" />
                        )}
                        {task.status === 'error' && (
                          <span title={task.errorMessage}>
                            <XCircle size={16} color="var(--badge-unread, #E87A5E)" />
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
                            <X size={12} color="var(--badge-unread, #E87A5E)" />
                          </button>
                        )}
                      </div>
                    </div>

                    {(task.status === 'uploading' || task.status === 'pending') && (
                      <div className="queue-item-progress-container">
                        <div
                          className={`queue-item-progress-fill ${task.id.startsWith('url-transfer-') && task.size === 0 ? 'indeterminate' : ''}`}
                          style={{ width: task.id.startsWith('url-transfer-') && task.size === 0 ? '100%' : `${task.progress}%` }}
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

      {/* Modal: URL Transfer */}
      {showUrlTransferModal && (
        <div className="modal-overlay" onClick={() => !isTransferring && setShowUrlTransferModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">URL 链接转存</h3>
            <form onSubmit={handleUrlTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                输入 HTTP/HTTPS 文件直链，系统会自动下载该文件并保存至当前文件夹目录（大小限制 2GB 以内）。
              </div>
              <textarea
                value={transferUrl}
                onChange={(e) => setTransferUrl(e.target.value)}
                placeholder="请输入文件直链 URL，例如 https://example.com/file.zip"
                disabled={isTransferring}
                rows={4}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  fontSize: '13px',
                  resize: 'none',
                  outline: 'none',
                }}
                autoFocus
              />
              <div className="modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={isTransferring}
                  onClick={() => {
                    setShowUrlTransferModal(false);
                    setTransferUrl('');
                  }}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="btn btn-sm"
                  disabled={isTransferring || !transferUrl.trim()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {isTransferring ? (
                    <>
                      <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
                      正在启动...
                    </>
                  ) : (
                    '开始转存'
                  )}
                </button>
              </div>
            </form>
          </div>
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
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectionMap(prev => { const n = new Map(prev); n.set(currentFolderId, new Set()); return n; })}>
              取消
            </button>
          </div>
        </div>
      )}

      {/* Mobile/Tablet Action Overflow Menu */}
      {actionMenuTarget && activeTab === 'drive' && (
        <div className="action-overlay" onClick={() => setActionMenuTarget(null)}>
          <div className="action-sheet" ref={actionMenuRef} onClick={(e) => e.stopPropagation()}>
            <div className="action-sheet-arrow" />
            <div className="action-sheet-body">
              {(() => {
                const target = items.find(i => i.id === actionMenuTarget);
                if (!target) return null;
                return (
                  <>
                    <div className="action-sheet-item-name">{target.name}</div>
                    {target.type === 'file' && (
                      <>
                        {target.url && (
                          <a href={target.url} target="_blank" rel="noopener noreferrer" className="action-sheet-btn" onClick={() => setActionMenuTarget(null)}>
                            <Download size={16} />
                            下载
                          </a>
                        )}
                        {target.url && (
                          <button className="action-sheet-btn" onClick={() => { handleCopyLink(target.url!); setActionMenuTarget(null); }}>
                            <Link size={16} />
                            复制链接
                          </button>
                        )}
                        <button className="action-sheet-btn" onClick={() => { setShareTarget(target); setSelectedFriendId(friends[0]?.id || ''); setActionMenuTarget(null); }}>
                          <Share2 size={16} />
                          分享给好友
                        </button>
                      </>
                    )}
                    <button className="action-sheet-btn" onClick={() => { handleOpenFolderSelector('move', target); setActionMenuTarget(null); }}>
                      <Move size={16} />
                      移动到
                    </button>
                    <button className="action-sheet-btn" onClick={() => { handleOpenFolderSelector('copy', target); setActionMenuTarget(null); }}>
                      <Copy size={16} />
                      复制到
                    </button>
                    <button className="action-sheet-btn" onClick={() => { setRenameTarget(target); setRenameValue(target.name); setActionMenuTarget(null); }}>
                      <Pencil size={16} />
                      重命名
                    </button>
                    <button className="action-sheet-btn action-sheet-btn-danger" onClick={() => { handleDelete(target.id); setActionMenuTarget(null); }}>
                      <Trash2 size={16} />
                      删除
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Target Folder Selector Tree Browser */}
      {showFolderSelector && (
        <div className="modal-overlay" onClick={() => { setShowFolderSelector(null); setSingleActionItem(null); }}>
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
                    <Folder size={20} className="item-icon folder" style={{ color: 'var(--brand-yellow)' }} />
                    <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{folder.name}</span>
                  </div>
                ))
              )}
            </div>

            {/* Modal actions */}
            <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', margin: 0, flexShrink: 0 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setShowFolderSelector(null); setSingleActionItem(null); }}>
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
