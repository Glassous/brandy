import { useEffect, useMemo, useCallback } from 'react';
import type { DiskItem } from './DiskPage';

export interface DiskPreviewProps {
  file: DiskItem;
  fileList: DiskItem[];
  currentIndex: number;
  onClose: () => void;
  onChangeIndex: (index: number) => void;
}

function getFileType(name: string): 'image' | 'video' | 'audio' | 'other' {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) return 'image';
  if (['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm', 'flv'].includes(ext || '')) return 'video';
  if (['mp3', 'wav', 'flac', 'ogg', 'wma', 'aac'].includes(ext || '')) return 'audio';
  return 'other';
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function DiskPreview({ file, fileList, currentIndex, onClose, onChangeIndex }: DiskPreviewProps) {
  const fileType = useMemo(() => getFileType(file.name), [file.name]);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < fileList.length - 1;

  const prev = useCallback(() => { if (hasPrev) onChangeIndex(currentIndex - 1); }, [hasPrev, currentIndex, onChangeIndex]);
  const next = useCallback(() => { if (hasNext) onChangeIndex(currentIndex + 1); }, [hasNext, currentIndex, onChangeIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onClose]);

  return (
    <div className="disk-preview-root">
      <style>{`
        .disk-preview-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          background: var(--bg-paper);
        }
        .dp-bar {
          display: flex;
          align-items: center;
          height: 52px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          gap: 12px;
          flex-shrink: 0;
          background: var(--bg-paper);
        }
        .dp-bar-back {
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
          white-space: nowrap;
        }
        .dp-bar-back:hover {
          background: var(--hover);
        }
        .dp-bar-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
          color: var(--text-secondary);
        }
        .dp-bar-name {
          color: var(--text-primary);
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dp-bar-sep {
          color: var(--border);
          font-size: 12px;
        }
        .dp-bar-size {
          font-size: 12px;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .dp-bar-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        .dp-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-primary);
          transition: background 0.14s, border-color 0.14s;
          white-space: nowrap;
          text-decoration: none;
          line-height: 1;
        }
        .dp-btn:hover { background: var(--hover); border-color: var(--border); }
        .dp-btn-close {
          width: 30px; height: 30px;
          border-radius: 6px;
          border: 1px solid var(--border);
          background: var(--bg-card);
          color: var(--text-secondary);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background 0.14s;
        }
        .dp-btn-close:hover { background: var(--hover); color: var(--text-primary); }
        .dp-stage {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 24px 72px;
          background: var(--bg);
        }
        .dp-media-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          max-width: 100%;
          max-height: 100%;
        }
        .dp-img {
          max-width: 100%;
          max-height: calc(100vh - 250px);
          border-radius: 6px;
          display: block;
          object-fit: contain;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
        }
        .dp-video {
          max-width: 100%;
          max-height: calc(100vh - 250px);
          border-radius: 6px;
          display: block;
          box-shadow: 0 4px 24px rgba(0,0,0,0.08);
        }
        .dp-audio-card {
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: 16px;
          padding: 36px 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          min-width: 320px;
          max-width: 440px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
        }
        .dp-audio-icon {
          width: 64px; height: 64px;
          border-radius: 16px;
          background: var(--hover);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary);
        }
        .dp-card-name {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          text-align: center;
          word-break: break-all;
          max-width: 100%;
        }
        .dp-card-size {
          font-size: 12px;
          color: var(--text-secondary);
        }
        .dp-audio-player {
          width: 100%;
          margin-top: 4px;
        }
        .dp-other-card {
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: 16px;
          padding: 40px 52px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          min-width: 300px;
          max-width: 440px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
        }
        .dp-other-icon {
          width: 64px; height: 64px;
          border-radius: 16px;
          background: var(--hover);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-secondary);
        }
        .dp-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 40px; height: 40px;
          border-radius: 50%;
          background: var(--bg-card);
          border: 1px solid var(--border);
          color: var(--text-secondary);
          font-size: 20px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
          user-select: none;
          box-shadow: 0 2px 8px rgba(0,0,0,0.06);
        }
        .dp-nav:hover:not(:disabled) { background: var(--hover); color: var(--text-primary); }
        .dp-nav:disabled { opacity: 0.2; cursor: default; pointer-events: none; }
        .dp-nav-prev { left: 16px; }
        .dp-nav-next { right: 16px; }
        .dp-footer {
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border-top: 1px solid var(--border);
          background: var(--bg-paper);
        }
        .dp-counter {
          color: var(--text-secondary);
          font-size: 12px;
          font-variant-numeric: tabular-nums;
        }
        @media (max-width: 1023px) {
          .dp-bar-back span { display: none; }
          .dp-btn span { display: none; }
        }
        @media (max-width: 768px) {
          .dp-stage { padding: 12px 44px; }
          .dp-bar { padding: 0 12px; gap: 8px; }
          .dp-bar-back { padding: 6px 8px; }
          .dp-nav { width: 32px; height: 32px; font-size: 16px; }
          .dp-nav-prev { left: 8px; }
          .dp-nav-next { right: 8px; }
          .dp-audio-card { padding: 24px 20px; min-width: 260px; }
          .dp-other-card { padding: 24px 20px; min-width: 240px; }
          .dp-bar-name { font-size: 13px; }
        }
      `}</style>

      {/* Top Bar */}
      <div className="dp-bar">
        <button className="dp-bar-back" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          返回文件列表
        </button>

        <div className="dp-bar-info">
          <span className="dp-bar-name" title={file.name}>{file.name}</span>
          <span className="dp-bar-sep">·</span>
          <span className="dp-bar-size">{formatBytes(file.size)}</span>
        </div>

        <div className="dp-bar-actions">
          {file.url && (
            <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" className="dp-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>下载</span>
            </a>
          )}
          <button className="dp-btn-close" onClick={onClose} title="关闭 (Esc)">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="dp-stage">
        <button className="dp-nav dp-nav-prev" onClick={prev} disabled={!hasPrev}>‹</button>

        <div className="dp-media-wrap">
          {fileType === 'image' && (
            <img
              key={file.id}
              src={file.url}
              alt={file.name}
              className="dp-img"
            />
          )}
          {fileType === 'video' && (
            <video
              key={file.id}
              src={file.url}
              controls
              autoPlay
              className="dp-video"
            />
          )}
          {fileType === 'audio' && (
            <div className="dp-audio-card">
              <div className="dp-audio-icon">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
              </div>
              <span className="dp-card-name">{file.name}</span>
              <span className="dp-card-size">{formatBytes(file.size)}</span>
              <audio key={file.id} src={file.url} controls autoPlay className="dp-audio-player" />
            </div>
          )}
          {fileType === 'other' && (
            <div className="dp-other-card">
              <div className="dp-other-icon">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
                </svg>
              </div>
              <span className="dp-card-name">{file.name}</span>
              <span className="dp-card-size">{formatBytes(file.size)}</span>
              {file.url && (
                <a href={file.url} download={file.name} target="_blank" rel="noopener noreferrer" className="dp-btn" style={{ marginTop: '8px' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  下载文件
                </a>
              )}
            </div>
          )}
        </div>

        <button className="dp-nav dp-nav-next" onClick={next} disabled={!hasNext}>›</button>
      </div>

      {/* Footer */}
      {fileList.length > 1 && (
        <div className="dp-footer">
          <span className="dp-counter">{currentIndex + 1} / {fileList.length}</span>
        </div>
      )}
    </div>
  );
}
