import { useRef, useEffect } from 'react';

export interface PendingFile {
  id: string;
  file?: File;
  previewUrl: string;
  fileType: 'image' | 'video' | 'audio' | 'file';
  fileName: string;
  fileSize: number;
  source: 'local' | 'cloud';
  cloudItem?: { file_id: string; file_name: string; file_size: number; url: string };
  uploadProgress?: number;
  uploadStatus?: 'pending' | 'uploading' | 'done' | 'error';
}

interface PendingFilesBarProps {
  files: PendingFile[];
  sendMode: 'independent' | 'combined';
  onRemove: (id: string) => void;
  onModeChange: (mode: 'independent' | 'combined') => void;
  isSending: boolean;
}

function getFileIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext || '')) {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext || '')) {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
}

export default function PendingFilesBar({ files, sendMode, onRemove, onModeChange, isSending }: PendingFilesBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [files.length]);

  if (files.length === 0) return null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg)',
      padding: '8px 16px 4px 16px',
      gap: '6px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {files.length > 1 ? (
          <div style={{ display: 'flex', background: 'var(--hover)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
            <button
              onClick={() => onModeChange('independent')}
              disabled={isSending}
              style={{
                padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: isSending ? 'not-allowed' : 'pointer',
                fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
                background: sendMode === 'independent' ? 'var(--bg-card)' : 'transparent',
                color: sendMode === 'independent' ? 'var(--text)' : 'var(--text-dim)',
                boxShadow: sendMode === 'independent' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              分开发送
            </button>
            <button
              onClick={() => onModeChange('combined')}
              disabled={isSending}
              style={{
                padding: '4px 10px', borderRadius: '5px', border: 'none', cursor: isSending ? 'not-allowed' : 'pointer',
                fontSize: '11px', fontWeight: 600, whiteSpace: 'nowrap',
                background: sendMode === 'combined' ? 'var(--bg-card)' : 'transparent',
                color: sendMode === 'combined' ? 'var(--text)' : 'var(--text-dim)',
                boxShadow: sendMode === 'combined' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              合并发送
            </button>
          </div>
        ) : <div />}
        <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500 }}>
          {files.length} 个文件
        </span>
      </div>

      <div ref={scrollRef} style={{
        display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px',
        scrollbarWidth: 'thin'
      }}>
        {files.map(f => (
          <div key={f.id} style={{
            position: 'relative', flexShrink: 0, width: '72px', height: '72px',
            borderRadius: '8px', overflow: 'hidden',
            border: '1px solid var(--border)', background: 'var(--bg-card)',
            opacity: isSending && f.uploadStatus === 'done' ? 0.5 : 1,
            transition: 'opacity 0.2s'
          }}>
            {f.fileType === 'image' || f.fileType === 'video' ? (
              <img
                src={f.previewUrl}
                alt={f.fileName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{
                width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '2px',
                color: 'var(--brand-blue)', padding: '4px'
              }}>
                {getFileIcon(f.fileName)}
                <span style={{
                  fontSize: '9px', color: 'var(--text)', lineHeight: 1.2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  maxWidth: '64px', textAlign: 'center'
                }}>
                  {f.fileName}
                </span>
              </div>
            )}

            {f.fileType === 'video' && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.15)', pointerEvents: 'none'
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                  <polygon points="8,5 19,12 8,19" />
                </svg>
              </div>
            )}

            {(f.uploadStatus === 'uploading' || f.uploadStatus === 'pending') && isSending && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
                background: 'rgba(0,0,0,0.1)'
              }}>
                <div style={{
                  height: '100%', width: `${f.uploadProgress || 0}%`,
                  background: 'var(--brand-blue)', transition: 'width 0.3s',
                  borderRadius: '0 2px 2px 0'
                }} />
              </div>
            )}

            {f.uploadStatus === 'done' && isSending && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.2)'
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4caf50" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
            )}

            {!isSending && (
              <button
                onClick={() => onRemove(f.id)}
                style={{
                  position: 'absolute', top: '2px', right: '2px',
                  width: '18px', height: '18px', borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0, color: '#fff', opacity: 0.85,
                  transition: 'opacity 0.15s'
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                onMouseLeave={e => e.currentTarget.style.opacity = '0.85'}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
