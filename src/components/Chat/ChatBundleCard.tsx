import { useState, useRef, useCallback } from 'react';

interface BundleFile {
  file_name: string;
  file_size: number;
  file_type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  cos_key?: string;
  source?: string;
  file_id?: string;
}

interface ChatBundleData {
  type: 'chat_bundle';
  text?: string;
  files: BundleFile[];
}

interface ChatBundleCardProps {
  data: ChatBundleData;
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
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>;
  }
  if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(ext || '')) {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>;
  }
  if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext || '')) {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext || '')) {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/></svg>;
  }
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>;
}

export default function ChatBundleCard({ data }: ChatBundleCardProps) {
  const { text, files } = data;
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const [showModal, setShowModal] = useState(false);
  const [showIndex, setShowIndex] = useState(0);

  const allImages = files.every(f => f.file_type === 'image');

  const goNext = useCallback(() => {
    if (currentIndex < files.length - 1) setCurrentIndex(i => i + 1);
  }, [currentIndex, files.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex(i => i - 1);
  }, [currentIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 40) {
      if (diff > 0) goNext();
      else goPrev();
    }
  };

  const openModal = (index: number) => {
    setShowIndex(index);
    setShowModal(true);
  };

  const currentFile = files[currentIndex];

  const arrowBtn: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    width: '24px', height: '24px', borderRadius: '50%',
    background: 'rgba(0,0,0,0.35)', border: 'none', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 0, color: '#fff', zIndex: 2,
    transition: 'background 0.15s'
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '100%' }}>
      {text && (
        <span className="msg-text" style={{ fontSize: '13px', marginBottom: '2px', wordBreak: 'break-all' }}>
          {text}
        </span>
      )}

      {files.length === 0 ? null : allImages ? (
        <div
          style={{ position: 'relative', width: '280px', maxWidth: '100%' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '0', overflow: 'hidden',
            borderRadius: '8px', height: '200px', position: 'relative',
            background: 'var(--bg)'
          }}>
            {currentIndex > 0 && (
              <div
                onClick={goPrev}
                style={{
                  flexShrink: 0, width: '14%', height: '100%',
                  background: `url(${files[currentIndex - 1].url}) center/cover no-repeat`,
                  filter: 'brightness(0.7)', cursor: 'pointer',
                  transition: 'filter 0.15s', position: 'relative'
                }}
                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.85)'}
                onMouseLeave={e => e.currentTarget.style.filter = 'brightness(0.7)'}
              />
            )}
            <div
              onClick={() => openModal(currentIndex)}
              style={{
                flex: 1, height: '100%', cursor: 'pointer',
                background: `url(${currentFile.url}) center/contain no-repeat`,
                backgroundSize: 'contain', minWidth: '72%',
                transition: 'opacity 0.2s'
              }}
            />
            {currentIndex < files.length - 1 && (
              <div
                onClick={goNext}
                style={{
                  flexShrink: 0, width: '14%', height: '100%',
                  background: `url(${files[currentIndex + 1].url}) center/cover no-repeat`,
                  filter: 'brightness(0.7)', cursor: 'pointer',
                  transition: 'filter 0.15s', position: 'relative'
                }}
                onMouseEnter={e => e.currentTarget.style.filter = 'brightness(0.85)'}
                onMouseLeave={e => e.currentTarget.style.filter = 'brightness(0.7)'}
              />
            )}
          </div>

          {currentIndex > 0 && (
            <button onClick={goPrev} style={{ ...arrowBtn, left: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          )}
          {currentIndex < files.length - 1 && (
            <button onClick={goNext} style={{ ...arrowBtn, right: '4px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          )}

          {files.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', marginTop: '6px' }}>
              {files.map((_, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  style={{
                    width: i === currentIndex ? '18px' : '6px', height: '6px',
                    borderRadius: '3px', background: i === currentIndex ? 'var(--brand-blue)' : 'var(--border)',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div
          style={{ position: 'relative', width: '260px', maxWidth: '100%', minHeight: '80px' }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {files.map((f, i) => {
            const isCurrent = i === currentIndex;
            const offset = i - currentIndex;
            return (
              <div
                key={i}
                onClick={isCurrent ? () => openModal(i) : () => setCurrentIndex(i)}
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  transform: isCurrent ? 'none' : `translateX(${offset * 8}px) translateY(${offset * 4}px)`,
                  zIndex: files.length - offset,
                  opacity: isCurrent ? 1 : Math.max(0.15, 1 - offset * 0.3),
                  cursor: isCurrent ? 'pointer' : 'pointer',
                  transition: 'transform 0.25s ease, opacity 0.25s ease',
                  pointerEvents: isCurrent || offset === 1 ? 'auto' : 'none',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px', padding: '10px 12px',
                  display: 'flex', alignItems: 'center', gap: '10px',
                  overflow: 'hidden'
                }}
              >
                <div style={{ flexShrink: 0, color: 'var(--brand-blue)', display: 'flex' }}>
                  {getFileIcon(f.file_name)}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.file_name}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginTop: '2px' }}>
                    {formatBytes(f.file_size)}
                  </div>
                </div>
              </div>
            );
          })}

          {files.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '100px' }}>
              <button
                onClick={goPrev}
                disabled={currentIndex === 0}
                style={{
                  background: 'none', border: 'none', cursor: currentIndex === 0 ? 'default' : 'pointer',
                  padding: '2px', color: currentIndex === 0 ? 'var(--text-dim)' : 'var(--text)',
                  fontSize: '13px', transition: 'color 0.15s',
                  opacity: currentIndex === 0 ? 0.3 : 1
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 500, userSelect: 'none' }}>
                {currentIndex + 1} / {files.length}
              </span>
              <button
                onClick={goNext}
                disabled={currentIndex === files.length - 1}
                style={{
                  background: 'none', border: 'none', cursor: currentIndex === files.length - 1 ? 'default' : 'pointer',
                  padding: '2px', color: currentIndex === files.length - 1 ? 'var(--text-dim)' : 'var(--text)',
                  fontSize: '13px', transition: 'color 0.15s',
                  opacity: currentIndex === files.length - 1 ? 0.3 : 1
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
          )}
        </div>
      )}

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.85)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: '12px'
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '80vh' }}
          >
            <img
              src={files[showIndex]?.url}
              alt={files[showIndex]?.file_name}
              style={{ maxWidth: '100%', maxHeight: '80vh', borderRadius: '4px', objectFit: 'contain' }}
            />
          </div>
          {files.length > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                onClick={() => setShowIndex(i => Math.max(0, i - 1))}
                disabled={showIndex === 0}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}
              >
                ‹
              </button>
              <span style={{ color: '#fff', fontSize: '13px' }}>{showIndex + 1} / {files.length}</span>
              <button
                onClick={() => setShowIndex(i => Math.min(files.length - 1, i + 1))}
                disabled={showIndex === files.length - 1}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}
              >
                ›
              </button>
            </div>
          )}
          <a
            href={files[showIndex]?.url}
            target="_blank" rel="noopener noreferrer"
            style={{ color: '#fff', fontSize: '12px', textDecoration: 'underline', opacity: 0.7 }}
          >
            在新标签页打开
          </a>
        </div>
      )}
    </div>
  );
}
