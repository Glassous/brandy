import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { API_BASE } from '../../config';

interface DiskItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  url?: string;
  created_at: string;
  updated_at: string;
}

interface Breadcrumb {
  id: string;
  name: string;
}

interface CloudFilePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (files: { file_id: string; file_name: string; file_size: number; url: string }[]) => void;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext || '')) {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext || '')) {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>;
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
}

export default function CloudFilePicker({ isOpen, onClose, onSelect }: CloudFilePickerProps) {
  const { token } = useApp();
  const [items, setItems] = useState<DiskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(async (folderId: string | null) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/disk/items?parent_id=${folderId || 'root'}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setItems(await res.json());
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [token]);

  const fetchBreadcrumbs = useCallback(async (folderId: string | null) => {
    if (!token) return;
    if (!folderId) {
      setBreadcrumbs([]);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/disk/folders/${folderId}/path`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setBreadcrumbs(await res.json());
      }
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    if (isOpen) {
      setCurrentFolderId(null);
      setBreadcrumbs([]);
      setSelectedIds(new Set());
    }
  }, [isOpen]);

  useEffect(() => {
    fetchItems(currentFolderId);
    fetchBreadcrumbs(currentFolderId);
  }, [currentFolderId, fetchItems, fetchBreadcrumbs]);

  const handleNavigate = (folderId: string) => {
    setCurrentFolderId(folderId);
    setSelectedIds(new Set());
  };

  const handleBreadcrumb = (index: number) => {
    if (index === -1) {
      setCurrentFolderId(null);
    } else {
      setCurrentFolderId(breadcrumbs[index].id);
    }
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = () => {
    const selectedFiles = items.filter(i => selectedIds.has(i.id) && i.type === 'file').map(i => ({
      file_id: i.id,
      file_name: i.name,
      file_size: i.size,
      url: i.url || '',
    }));
    if (selectedFiles.length > 0) {
      onSelect(selectedFiles);
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      backdropFilter: 'blur(4px)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 2000,
      animation: 'fadeIn 0.2s ease-out'
    }}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', width: '520px', maxWidth: '90%',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        animation: 'slideUp 0.2s ease-out'
      }}>
        <div className="modal-header" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid var(--border)'
        }}>
          <span className="modal-title" style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
            从云盘选择文件
          </span>
          <button className="modal-close-btn" onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', padding: '4px'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div style={{
          padding: '10px 18px', display: 'flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)',
          flexShrink: 0, overflowX: 'auto'
        }}>
          <span
            onClick={() => handleBreadcrumb(-1)}
            style={{ cursor: 'pointer', fontWeight: currentFolderId === null ? 600 : 400, color: 'var(--text)', whiteSpace: 'nowrap' }}
          >
            根目录
          </span>
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
              <span style={{ color: 'var(--text-dim)' }}>/</span>
              <span
                onClick={() => handleBreadcrumb(i)}
                style={{ cursor: 'pointer', fontWeight: currentFolderId === crumb.id ? 600 : 400, color: 'var(--text)' }}
              >
                {crumb.name}
              </span>
            </span>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: '200px' }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-dim)', fontSize: '13px' }}>
              加载中...
            </div>
          ) : items.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-dim)', fontSize: '13px' }}>
              暂无文件
            </div>
          ) : (
            <div style={{ padding: '4px 0' }}>
              {items.map(item => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.type === 'folder') {
                      handleNavigate(item.id);
                    } else {
                      toggleSelect(item.id);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 18px', cursor: 'pointer',
                    background: selectedIds.has(item.id) ? 'var(--hover)' : 'transparent',
                    borderLeft: selectedIds.has(item.id) ? '2px solid var(--brand-blue)' : '2px solid transparent',
                    transition: 'background 0.15s',
                    fontSize: '13px'
                  }}
                  onMouseEnter={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = 'var(--hover)'; }}
                  onMouseLeave={e => { if (!selectedIds.has(item.id)) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ flexShrink: 0, color: item.type === 'folder' ? 'var(--brand-yellow)' : 'var(--brand-blue)', display: 'flex' }}>
                    {item.type === 'folder' ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                      </svg>
                    ) : getFileIcon(item.name)}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </div>
                    {item.type === 'file' && (
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '1px' }}>
                        {formatBytes(item.size)}
                      </div>
                    )}
                  </div>
                  {item.type === 'file' && (
                    <div
                      onClick={e => { e.stopPropagation(); toggleSelect(item.id); }}
                      style={{
                        width: '18px', height: '18px', borderRadius: '3px', border: '1.5px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        background: selectedIds.has(item.id) ? 'var(--brand-blue)' : 'transparent',
                        borderColor: selectedIds.has(item.id) ? 'var(--brand-blue)' : 'var(--border)',
                        transition: 'all 0.15s', cursor: 'pointer'
                      }}
                    >
                      {selectedIds.has(item.id) && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderTop: '1px solid var(--border)',
          flexShrink: 0
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            {selectedIds.size > 0 ? `已选 ${selectedIds.size} 个文件` : '请选择文件'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '7px 16px', borderRadius: '6px', border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer',
                fontSize: '13px', fontWeight: 500
              }}
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedIds.size === 0}
              style={{
                padding: '7px 16px', borderRadius: '6px', border: 'none',
                background: selectedIds.size > 0 ? 'var(--brand-blue)' : 'var(--border)',
                color: selectedIds.size > 0 ? '#fff' : 'var(--text-dim)',
                cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                fontSize: '13px', fontWeight: 600
              }}
            >
              确定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
