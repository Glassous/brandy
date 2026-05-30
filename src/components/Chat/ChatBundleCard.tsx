import { useState, useRef, useCallback } from 'react';
import { getThumbnailUrl } from './ChatRoom';
import { useChatMedia } from './ChatMediaContext';

interface BundleFile {
  file_name: string;
  file_size: number;
  file_type: 'image' | 'video' | 'audio' | 'file';
  url: string;
  cos_key?: string;
  source?: string;
  file_id?: string;
  uploading?: boolean;
  progress?: number;
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
  const { openViewer } = useChatMedia();

  // ── Carousel drag-to-scroll ──────────────────────────────────────────────
  const carouselRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragScrollLeft = useRef(0);
  const hasDragged = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!carouselRef.current) return;
    isDragging.current = true;
    hasDragged.current = false;
    dragStartX.current = e.pageX - carouselRef.current.getBoundingClientRect().left;
    dragScrollLeft.current = carouselRef.current.scrollLeft;
    carouselRef.current.style.cursor = 'grabbing';
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !carouselRef.current) return;
    const x = e.pageX - carouselRef.current.getBoundingClientRect().left;
    const walk = x - dragStartX.current;
    if (Math.abs(walk) > 3) hasDragged.current = true;
    carouselRef.current.scrollLeft = dragScrollLeft.current - walk;
  }, []);

  const endDrag = useCallback(() => {
    isDragging.current = false;
    if (carouselRef.current) carouselRef.current.style.cursor = 'grab';
    setTimeout(() => { hasDragged.current = false; }, 60);
  }, []);

  // ── PC nav buttons ───────────────────────────────────────────────────────
  const [activeIdx, setActiveIdx] = useState(0);

  const scrollToIdx = (idx: number) => {
    if (!carouselRef.current) return;
    const items = carouselRef.current.querySelectorAll<HTMLElement>('.bcbi');
    if (items[idx]) {
      const offset = items[idx].offsetLeft - carouselRef.current.offsetLeft;
      carouselRef.current.scrollTo({ left: offset, behavior: 'smooth' });
    }
  };

  const navPrev = () => { const n = Math.max(0, activeIdx - 1); setActiveIdx(n); scrollToIdx(n); };
  const navNext = () => { const n = Math.min(files.length - 1, activeIdx + 1); setActiveIdx(n); scrollToIdx(n); };

  const handleCardClick = (f: BundleFile) => {
    if (hasDragged.current || f.uploading) return;
    openViewer(f.url);
  };

  const CARD_W_MEDIA = 140;
  const CARD_W_FILE = 130;

  return (
    <>
      <style>{`
        .bcwrap {
          position: relative;
          overflow: hidden;
        }
        .bcc {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          padding: 2px 2px 6px 2px;
          cursor: grab;
        }
        .bcc::-webkit-scrollbar { display: none; }
        .bcbi {
          flex-shrink: 0;
          height: 175px;
          border-radius: 16px;
          overflow: hidden;
          background: var(--bg-card);
          border: 1px solid var(--border);
          position: relative;
          scroll-snap-align: start;
          transition: transform 0.2s, box-shadow 0.2s;
          display: flex;
          flex-direction: column;
          box-shadow: 0 2px 6px rgba(0,0,0,0.06);
          -webkit-user-drag: none;
          user-select: none;
        }
        .bcbi:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
        .bcnav {
          position: absolute;
          top: 50%;
          transform: translateY(-60%);
          width: 26px; height: 26px;
          border-radius: 50%;
          background: var(--bg-card);
          border: 1px solid var(--border);
          box-shadow: 0 2px 6px rgba(0,0,0,0.14);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; z-index: 10;
          color: var(--text); font-size: 16px;
          transition: background 0.15s, opacity 0.2s;
          opacity: 0; pointer-events: none;
        }
        .bcwrap:hover .bcnav:not(:disabled) { opacity: 1; pointer-events: auto; }
        .bcnav:disabled { opacity: 0 !important; pointer-events: none; }
        .bcnav:hover { background: var(--hover); }
        .bcnav-prev { left: 2px; }
        .bcnav-next { right: 2px; }
        @media (hover: none) { .bcnav { display: none !important; } }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', minWidth: 0 }}>
        {text && (
          <span className="msg-text" style={{ fontSize: '13.5px', wordBreak: 'break-all', display: 'block', padding: '0 2px' }}>
            {text}
          </span>
        )}

        {files.length > 0 && (
          <div className="bcwrap">
            <button className="bcnav bcnav-prev" onClick={navPrev} disabled={activeIdx === 0} title="上一张">‹</button>
            <button className="bcnav bcnav-next" onClick={navNext} disabled={activeIdx === files.length - 1} title="下一张">›</button>

            <div
              className="bcc"
              ref={carouselRef}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={endDrag}
              onMouseLeave={endDrag}
            >
              {files.map((f, i) => {
                const isMedia = f.file_type === 'image' || f.file_type === 'video';
                const width = isMedia ? CARD_W_MEDIA : CARD_W_FILE;

                if (isMedia) {
                  return (
                    <div
                      key={i}
                      className="bcbi"
                      style={{ width, cursor: f.uploading ? 'default' : 'pointer' }}
                      onClick={() => handleCardClick(f)}
                    >
                      <div style={{
                        width: '100%', height: '100%', flexShrink: 0,
                        background: `url(${getThumbnailUrl(f.url, 'image')}) center/cover no-repeat`,
                      }} />
                      {f.file_type === 'video' && !f.uploading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="#fff" stroke="none"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          </div>
                        </div>
                      )}
                      {f.uploading && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.48)', gap: '8px' }}>
                          <div style={{ width: 28, height: 28, border: '3px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          <span style={{ fontSize: 11, color: '#fff', fontWeight: 500 }}>{f.progress || 0}%</span>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={i}
                    className="bcbi"
                    style={{ width, padding: '14px 10px', alignItems: 'center', justifyContent: 'space-between', textAlign: 'center', cursor: f.uploading ? 'default' : 'pointer' }}
                    onClick={() => handleCardClick(f)}
                  >
                    <div style={{ color: 'var(--brand-blue)', marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {f.uploading ? (
                        <div style={{ width: 32, height: 32, border: '3px solid rgba(0,0,0,0.1)', borderTopColor: 'var(--brand-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <div style={{ transform: 'scale(1.3)', display: 'flex' }}>{getFileIcon(f.file_name)}</div>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%', overflow: 'hidden' }}>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', padding: '0 2px', pointerEvents: 'none' }}>
                        {f.file_name}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-dim)', pointerEvents: 'none' }}>
                        {f.uploading ? `上传中 ${f.progress || 0}%` : formatBytes(f.file_size)}
                      </div>
                    </div>

                    {!f.uploading && (
                      <div style={{ fontSize: 9.5, color: 'var(--brand-blue)', fontWeight: 700, border: '1px solid var(--border)', borderRadius: 10, padding: '2px 8px', background: 'var(--bg-paper)' }}>
                        查看
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
