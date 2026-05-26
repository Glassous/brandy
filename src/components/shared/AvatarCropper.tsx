import { useState, useRef, useEffect } from 'react';

interface AvatarCropperProps {
  imageSrc: string;
  onCrop: (blob: Blob) => void;
  onClose: () => void;
}

export function AvatarCropper({ imageSrc, onCrop, onClose }: AvatarCropperProps) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [imageStyle, setImageStyle] = useState<React.CSSProperties>({});
  
  const dragStart = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const cropBoxRef = useRef<HTMLDivElement>(null);

  // Reset states when image changes
  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, [imageSrc]);

  // Handle image load to determine size orientation
  const handleImageLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    const ar = img.naturalWidth / img.naturalHeight;
    if (ar > 1) {
      // Wide image -> fit height, let width overflow
      setImageStyle({
        height: '100%',
        width: 'auto',
        maxHeight: 'none',
        maxWidth: 'none',
      });
    } else {
      // Tall or square image -> fit width, let height overflow
      setImageStyle({
        width: '100%',
        height: 'auto',
        maxHeight: 'none',
        maxWidth: 'none',
      });
    }
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      const touch = e.touches[0];
      dragStart.current = { x: touch.clientX - offset.x, y: touch.clientY - offset.y };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setOffset({
      x: touch.clientX - dragStart.current.x,
      y: touch.clientY - dragStart.current.y,
    });
  };

  // Wheel zoom handler
  const handleWheel = (e: React.WheelEvent) => {
    const zoomStep = 0.1;
    const nextZoom = Math.min(Math.max(zoom - e.deltaY * zoomStep * 0.002, 1), 4);
    setZoom(nextZoom);
  };

  // Canvas drawing and cropping
  const handleSave = () => {
    const img = imgRef.current;
    const box = cropBoxRef.current;
    if (!img || !box) return;

    const canvas = document.createElement('canvas');
    // Save at 256x256 for a perfect square high-res avatar
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const boxRect = box.getBoundingClientRect();
    const imgRect = img.getBoundingClientRect();

    // Math to get source rectangle from original image
    const scaleX = img.naturalWidth / imgRect.width;
    const scaleY = img.naturalHeight / imgRect.height;

    const sx = (boxRect.left - imgRect.left) * scaleX;
    const sy = (boxRect.top - imgRect.top) * scaleY;
    const sWidth = boxRect.width * scaleX;
    const sHeight = boxRect.height * scaleY;

    // Draw to canvas and output blob
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, 256, 256);

    canvas.toBlob((blob) => {
      if (blob) {
        onCrop(blob);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <div className="crop-modal-overlay">
      <style>{`
        .crop-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.75);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(4px);
        }
        .crop-modal-card {
          background: var(--bg-paper);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          width: 320px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          animation: cropScaleUp 0.2s ease-out;
        }
        @keyframes cropScaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .crop-title {
          font-size: 16px;
          font-weight: 700;
          color: var(--text);
          margin: 0;
        }
        .crop-box-container {
          width: 260px;
          height: 260px;
          position: relative;
          overflow: hidden;
          background: #111;
          border-radius: 8px;
          border: 1px solid var(--border);
          cursor: move;
        }
        .crop-image {
          position: absolute;
          top: 0;
          left: 0;
          pointer-events: none;
          transform-origin: center center;
        }
        .crop-mask-circle {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
          border: 2px dashed var(--accent, #007bff);
          pointer-events: none;
          box-sizing: border-box;
        }
        .crop-slider-container {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text-dim);
          font-size: 13px;
        }
        .crop-slider {
          flex: 1;
          accent-color: var(--accent);
          height: 4px;
          border-radius: 2px;
          background: var(--border);
          outline: none;
        }
        .crop-actions {
          display: flex;
          width: 100%;
          gap: 12px;
        }
        .crop-btn {
          flex: 1;
          padding: 10px;
          font-size: 14px;
          font-weight: 600;
          border-radius: 20px;
          cursor: pointer;
          transition: background-color 0.2s, transform 0.1s;
        }
        .crop-btn:active {
          transform: scale(0.98);
        }
        .crop-btn-cancel {
          background: var(--hover);
          color: var(--text);
          border: 1px solid var(--border);
        }
        .crop-btn-cancel:hover {
          background: var(--border);
        }
        .crop-btn-save {
          background: var(--accent, #007bff);
          color: white;
          border: none;
        }
        .crop-btn-save:hover {
          filter: brightness(1.1);
        }
      `}</style>
      
      <div className="crop-modal-card">
        <h3 className="crop-title">编辑头像</h3>
        
        <div 
          ref={cropBoxRef}
          className="crop-box-container"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleMouseUp}
          onWheel={handleWheel}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="To crop"
            onLoad={handleImageLoad}
            className="crop-image"
            style={{
              ...imageStyle,
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            }}
          />
          <div className="crop-mask-circle" />
        </div>

        <div className="crop-slider-container">
          <span>A-</span>
          <input
            type="range"
            min="1"
            max="4"
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="crop-slider"
          />
          <span>A+</span>
        </div>

        <div className="crop-actions">
          <button onClick={onClose} className="crop-btn crop-btn-cancel">
            取消
          </button>
          <button onClick={handleSave} className="crop-btn crop-btn-save">
            保存头像
          </button>
        </div>
      </div>
    </div>
  );
}
