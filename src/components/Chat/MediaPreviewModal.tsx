import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../shared/Toast';
import { CloseIcon } from '../shared/Icons';
import { API_BASE } from '../../config';
import type { MediaItem } from './ChatMediaContext';
import {
  isTextFile,
  getFileExtension,
  getPrismLanguage,
  CodeHighlight,
  MarkdownPreview,
  CSVPreview
} from '../../utils/previewHelper';

interface MediaPreviewModalProps {
  files: MediaItem[];
  index: number;
  onIndexChange: (idx: number) => void;
  onClose: () => void;
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CloudUpIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FileTypeIcon({ type }: { type: string }) {
  if (type === 'image') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  );
  if (type === 'video') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
  if (type === 'audio') return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
    </svg>
  );
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
    </svg>
  );
}

export default function MediaPreviewModal({ files, index, onIndexChange, onClose }: MediaPreviewModalProps) {
  const { token } = useApp();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [htmlMode, setHtmlMode] = useState<'preview' | 'code'>('preview');

  const file = files[index];
  const isText = file ? isTextFile(file.file_name) : false;
  const ext = file ? getFileExtension(file.file_name) : '';
  const hasPrev = index > 0;
  const hasNext = index < files.length - 1;
  const isSaved = file ? savedUrls.has(file.url) : false;

  useEffect(() => {
    if (!file || !isText) return;
    setLoadingText(true);
    setTextError(null);
    setTextContent(null);
    fetch(file.url)
      .then(res => {
        if (!res.ok) throw new Error('无法读取文件内容');
        return res.text();
      })
      .then(data => {
        setTextContent(data);
        setLoadingText(false);
      })
      .catch(err => {
        setTextError(err.message || '加载文本失败');
        setLoadingText(false);
      });
  }, [file?.url, file?.file_name, isText]);

  const prev = useCallback(() => { if (hasPrev) onIndexChange(index - 1); }, [hasPrev, index, onIndexChange]);
  const next = useCallback(() => { if (hasNext) onIndexChange(index + 1); }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, onClose]);

  const handleSave = async () => {
    if (!file || saving || isSaved) return;
    if (!file.cos_key) { showToast('该文件不支持转存', 'info'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/disk/save-chat-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ filename: file.file_name, size: file.file_size, cos_key: file.cos_key }),
      });
      const d = await res.json();
      if (res.ok) {
        setSavedUrls(s => new Set([...s, file.url]));
        showToast('已转存至云盘！', 'success');
      } else {
        showToast(d.error || '转存失败', 'error');
      }
    } catch {
      showToast('网络错误', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!file) return null;
  const isImage = file.file_type === 'image';
  const isVideo = file.file_type === 'video';
  const isAudio = file.file_type === 'audio';

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column' }}
      onClick={onClose}
    >
      <style>{`
        @keyframes mpv-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .mpv-root {
          position: fixed; inset: 0; z-index: 9999;
          display: flex; flex-direction: column;
          background: #0a0a0a;
          animation: mpv-in 0.16s ease-out;
        }
        /* ── Top bar ── */
        .mpv-bar {
          height: 54px;
          display: flex;
          align-items: center;
          padding: 0 12px 0 16px;
          gap: 10px;
          background: rgba(14,14,14,0.95);
          border-bottom: 1px solid rgba(255,255,255,0.07);
          flex-shrink: 0;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
        }
        .mpv-bar-info {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          min-width: 0;
          color: rgba(255,255,255,0.45);
        }
        .mpv-bar-name {
          color: rgba(255,255,255,0.92);
          font-size: 13.5px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .mpv-bar-sep {
          color: rgba(255,255,255,0.2);
          font-size: 11px;
        }
        .mpv-bar-size {
          font-size: 11px;
          color: rgba(255,255,255,0.32);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .mpv-bar-actions {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
        }
        /* Action button (text+icon) */
        .mpv-btn {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 5px 12px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.82);
          transition: background 0.14s, border-color 0.14s;
          white-space: nowrap;
          text-decoration: none;
          line-height: 1;
        }
        .mpv-btn:hover { background: rgba(255,255,255,0.13); border-color: rgba(255,255,255,0.18); }
        .mpv-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .mpv-btn.saved {
          color: rgba(52,199,89,0.9);
          border-color: rgba(52,199,89,0.25);
          background: rgba(52,199,89,0.08);
        }
        /* Divider between action groups */
        .mpv-divider {
          width: 1px; height: 18px;
          background: rgba(255,255,255,0.1);
          margin: 0 2px;
          flex-shrink: 0;
        }
        /* Close icon button */
        .mpv-close {
          width: 30px; height: 30px;
          border-radius: 7px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.65);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background 0.14s;
        }
        .mpv-close:hover { background: rgba(255,255,255,0.14); color: #fff; }
        /* ── Content area ── */
        .mpv-stage {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          padding: 24px 72px; /* room for nav arrows */
        }
        .mpv-media-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          max-width: 100%;
          max-height: 100%;
        }
        .mpv-img {
          max-width: 100%;
          max-height: calc(100vh - 54px - 48px);
          border-radius: 5px;
          display: block;
          object-fit: contain;
          box-shadow: 0 12px 60px rgba(0,0,0,0.7);
          animation: mpv-in 0.2s ease-out;
        }
        .mpv-video {
          max-width: 100%;
          max-height: calc(100vh - 54px - 48px);
          border-radius: 5px;
          display: block;
          box-shadow: 0 12px 60px rgba(0,0,0,0.7);
        }
        /* Audio / File card */
        .mpv-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.09);
          border-radius: 18px;
          padding: 40px 52px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          min-width: 300px;
          max-width: 440px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.5);
        }
        .mpv-card-icon {
          width: 68px; height: 68px;
          border-radius: 18px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.07);
          display: flex; align-items: center; justify-content: center;
          color: rgba(255,255,255,0.55);
        }
        .mpv-card-name {
          font-size: 15px;
          font-weight: 600;
          color: rgba(255,255,255,0.88);
          text-align: center;
          word-break: break-all;
          max-width: 100%;
          line-height: 1.4;
        }
        .mpv-card-size {
          font-size: 12px;
          color: rgba(255,255,255,0.3);
        }
        /* Navigation arrows */
        .mpv-nav {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          width: 44px; height: 44px;
          border-radius: 50%;
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.75);
          font-size: 22px;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer;
          transition: background 0.15s, opacity 0.2s;
          backdrop-filter: blur(8px);
          user-select: none;
        }
        .mpv-nav:hover:not(:disabled) { background: rgba(255,255,255,0.14); color: #fff; }
        .mpv-nav:disabled { opacity: 0.15; cursor: default; pointer-events: none; }
        .mpv-nav-prev { left: 14px; }
        .mpv-nav-next { right: 14px; }
        /* ── Bottom counter ── */
        .mpv-footer {
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          gap: 8px;
        }
        .mpv-counter {
          color: rgba(255,255,255,0.28);
          font-size: 12px;
          letter-spacing: 0.8px;
          font-variant-numeric: tabular-nums;
        }
        /* Dot indicators (up to 9) */
        .mpv-dots {
          display: flex;
          gap: 5px;
          align-items: center;
        }
        .mpv-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          transition: background 0.2s, transform 0.2s;
        }
        .mpv-dot.active {
          background: rgba(255,255,255,0.75);
          transform: scale(1.3);
        }
        @media (max-width: 600px) {
          .mpv-bar-name { font-size: 12px; }
          .mpv-btn span { display: none; }
          .mpv-stage { padding: 16px 60px; }
        }
      `}</style>

      <div className="mpv-root" onClick={onClose}>
        {/* ── Top bar ── */}
        <div className="mpv-bar" onClick={e => e.stopPropagation()}>
          <div className="mpv-bar-info">
            <FileTypeIcon type={file.file_type} />
            <span className="mpv-bar-name" title={file.file_name}>{file.file_name}</span>
            <span className="mpv-bar-sep">·</span>
            <span className="mpv-bar-size">{formatBytes(file.file_size)}</span>
          </div>

          <div className="mpv-bar-actions">
            {/* Download */}
            <a
              href={file.url}
              download={file.file_name}
              target="_blank"
              rel="noopener noreferrer"
              className="mpv-btn"
              onClick={e => e.stopPropagation()}
            >
              <DownloadIcon />
              <span>下载</span>
            </a>

            {/* Save to cloud (only if cos_key) */}
            {file.cos_key && (
              <button
                className={`mpv-btn${isSaved ? ' saved' : ''}`}
                onClick={e => { e.stopPropagation(); handleSave(); }}
                disabled={saving || isSaved}
              >
                {isSaved ? <CheckIcon /> : <CloudUpIcon />}
                <span>{isSaved ? '已转存' : saving ? '转存中...' : '转存至云盘'}</span>
              </button>
            )}

            <div className="mpv-divider" />

            {/* Close */}
            <button className="mpv-close" onClick={e => { e.stopPropagation(); onClose(); }} title="关闭 (Esc)">
              <CloseIcon size={15} color="currentColor" />
            </button>
          </div>
        </div>

        {/* ── Stage ── */}
        <div className="mpv-stage">
          {/* Prev */}
          <button className="mpv-nav mpv-nav-prev" onClick={e => { e.stopPropagation(); prev(); }} disabled={!hasPrev}>‹</button>

          {/* Media */}
          <div className="mpv-media-wrap" onClick={e => e.stopPropagation()}>
            {isImage && (
              <img
                key={file.url}
                src={file.url}
                alt={file.file_name}
                className="mpv-img"
              />
            )}
            {isVideo && (
              <video
                key={file.url}
                src={file.url}
                controls
                autoPlay
                className="mpv-video"
              />
            )}
            {isAudio && (
              <div className="mpv-card">
                <div className="mpv-card-icon">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <p className="mpv-card-name">{file.file_name}</p>
                <span className="mpv-card-size">{formatBytes(file.file_size)}</span>
                <audio key={file.url} src={file.url} controls autoPlay style={{ width: '100%', marginTop: '4px' }} />
              </div>
            )}
            {!isImage && !isVideo && !isAudio && isText && (
              <div style={{
                width: '90vw',
                height: 'calc(100vh - 160px)',
                maxWidth: '1000px',
                display: 'flex',
                flexDirection: 'column',
                color: '#fff',
                ['--text-primary' as any]: '#ffffff',
                ['--text-secondary' as any]: 'rgba(255, 255, 255, 0.7)',
                ['--bg-card' as any]: 'rgba(255, 255, 255, 0.03)',
                ['--border' as any]: 'rgba(255, 255, 255, 0.1)',
                ['--hover' as any]: 'rgba(255, 255, 255, 0.08)'
              }}>
                {loadingText && (
                  <div style={{ color: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                      <circle cx="12" cy="12" r="10" strokeDasharray="30 30" />
                    </svg>
                    <span>正在加载内容...</span>
                  </div>
                )}
                {textError && (
                  <div className="mpv-card">
                    <p className="mpv-card-name" style={{ color: '#ff6b6b' }}>{textError}</p>
                    <span className="mpv-card-size">{formatBytes(file.file_size)}</span>
                  </div>
                )}
                {!loadingText && !textError && textContent !== null && (
                  <>
                    {(ext === 'html' || ext === 'htm') && (
                      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexShrink: 0 }}>
                          <button
                            className={`mpv-btn ${htmlMode === 'preview' ? 'saved' : ''}`}
                            onClick={() => setHtmlMode('preview')}
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >
                            网页预览
                          </button>
                          <button
                            className={`mpv-btn ${htmlMode === 'code' ? 'saved' : ''}`}
                            onClick={() => setHtmlMode('code')}
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >
                            HTML 源码
                          </button>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                          {htmlMode === 'preview' ? (
                            <iframe
                              sandbox=""
                              srcDoc={textContent}
                              title="html-preview"
                              style={{ width: '100%', height: '100%', border: 'none', background: '#ffffff', borderRadius: '6px' }}
                            />
                          ) : (
                            <CodeHighlight code={textContent} language="markup" />
                          )}
                        </div>
                      </div>
                    )}
                    {ext === 'csv' && (
                      <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
                        <CSVPreview content={textContent} />
                      </div>
                    )}
                    {(ext === 'md' || ext === 'markdown') && (
                      <div style={{ height: '100%', width: '100%', overflow: 'auto', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <MarkdownPreview content={textContent} />
                      </div>
                    )}
                    {ext !== 'html' && ext !== 'htm' && ext !== 'csv' && ext !== 'md' && ext !== 'markdown' && (
                      <div style={{ height: '100%', width: '100%', overflow: 'auto' }}>
                        <CodeHighlight code={textContent} language={getPrismLanguage(ext)} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            {!isImage && !isVideo && !isAudio && !isText && (
              <div className="mpv-card">
                <div className="mpv-card-icon">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" />
                  </svg>
                </div>
                <p className="mpv-card-name">{file.file_name}</p>
                <span className="mpv-card-size">{formatBytes(file.file_size)}</span>
              </div>
            )}
          </div>

          {/* Next */}
          <button className="mpv-nav mpv-nav-next" onClick={e => { e.stopPropagation(); next(); }} disabled={!hasNext}>›</button>
        </div>

        {/* ── Footer ── */}
        {files.length > 1 && (
          <div className="mpv-footer" onClick={e => e.stopPropagation()}>
            {files.length <= 12 ? (
              <div className="mpv-dots">
                {files.map((_, i) => (
                  <div
                    key={i}
                    className={`mpv-dot${i === index ? ' active' : ''}`}
                    onClick={() => onIndexChange(i)}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </div>
            ) : (
              <span className="mpv-counter">{index + 1} / {files.length}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
