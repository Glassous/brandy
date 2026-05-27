import { useState, useEffect } from 'react';

interface UploadProgressProps {
  fileName: string;
  progress: number;
  onCancel?: () => void;
  onComplete?: () => void;
  onError?: (error: string) => void;
  status: 'uploading' | 'completed' | 'error';
  errorMessage?: string;
}

export function UploadProgress({
  fileName,
  progress,
  onCancel,
  status,
  errorMessage,
}: UploadProgressProps) {
  const [displayProgress, setDisplayProgress] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayProgress(progress);
    }, 50);
    return () => clearTimeout(timer);
  }, [progress]);

  const formatFileName = (name: string, maxLength: number = 20) => {
    if (name.length <= maxLength) return name;
    const ext = name.split('.').pop();
    const nameWithoutExt = name.slice(0, name.lastIndexOf('.'));
    const truncated = nameWithoutExt.slice(0, maxLength - 4 - (ext?.length || 0));
    return `${truncated}...${ext}`;
  };

  const getStatusColor = () => {
    switch (status) {
      case 'completed': return 'var(--brand-green, #4CAF50)';
      case 'error': return 'var(--badge-unread, #E87A5E)';
      default: return 'var(--brand-blue)';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
      case 'error':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="upload-progress-container">
      <style>{`
        .upload-progress-container {
          background: var(--bg-card);
          border: 1px solid var(--border-light);
          border-radius: 8px;
          padding: 12px;
          margin-top: 12px;
          animation: slideIn 0.3s ease;
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .upload-progress-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }

        .upload-file-icon {
          color: var(--brand-blue);
          flex-shrink: 0;
        }

        .upload-file-name {
          flex: 1;
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .upload-status-icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
        }

        .upload-progress-bar-container {
          height: 6px;
          width: 100%;
          background: var(--hover);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 6px;
        }

        .upload-progress-bar-fill {
          height: 100%;
          transition: width 0.3s ease;
          border-radius: 3px;
          background: var(--brand-blue);
        }

        .upload-progress-bar-fill.completed {
          background: var(--brand-green, #4CAF50);
        }

        .upload-progress-bar-fill.error {
          background: var(--badge-unread, #E87A5E);
        }

        .upload-progress-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .upload-progress-text {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .upload-cancel-btn {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 12px;
          color: var(--text-secondary);
          padding: 2px 6px;
          border-radius: 4px;
          transition: all 0.2s;
        }

        .upload-cancel-btn:hover {
          background: var(--hover);
          color: var(--text-primary);
        }

        .upload-error-message {
          font-size: 12px;
          color: var(--badge-unread, #E87A5E);
          margin-top: 4px;
        }
      `}</style>

      <div className="upload-progress-header">
        <svg className="upload-file-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <polyline points="13 2 13 9 20 9" />
        </svg>
        <span className="upload-file-name" title={fileName}>
          {formatFileName(fileName)}
        </span>
        {status !== 'uploading' && (
          <span className="upload-status-icon" style={{ color: getStatusColor() }}>
            {getStatusIcon()}
          </span>
        )}
      </div>

      <div className="upload-progress-bar-container">
        <div
          className={`upload-progress-bar-fill ${status}`}
          style={{ width: `${displayProgress}%` }}
        />
      </div>

      <div className="upload-progress-footer">
        <span className="upload-progress-text">
          {status === 'completed' ? '上传完成' : 
           status === 'error' ? '上传失败' : 
           `${Math.round(displayProgress)}%`}
        </span>
        {status === 'uploading' && onCancel && (
          <button className="upload-cancel-btn" onClick={onCancel}>
            取消
          </button>
        )}
      </div>

      {status === 'error' && errorMessage && (
        <div className="upload-error-message">{errorMessage}</div>
      )}
    </div>
  );
}

export function useUploadProgress() {
  const [uploadState, setUploadState] = useState<{
    active: boolean;
    fileName: string;
    progress: number;
    status: 'uploading' | 'completed' | 'error';
    errorMessage?: string;
    cancelFn?: () => void;
  }>({
    active: false,
    fileName: '',
    progress: 0,
    status: 'uploading',
  });

  const startUpload = (fileName: string) => {
    setUploadState({
      active: true,
      fileName,
      progress: 0,
      status: 'uploading',
    });
  };

  const updateProgress = (progress: number) => {
    setUploadState(prev => ({ ...prev, progress }));
  };

  const completeUpload = () => {
    setUploadState(prev => ({ ...prev, progress: 100, status: 'completed' }));
    setTimeout(() => {
      setUploadState(prev => ({ ...prev, active: false }));
    }, 2000);
  };

  const errorUpload = (message: string) => {
    setUploadState(prev => ({ ...prev, status: 'error', errorMessage: message }));
    setTimeout(() => {
      setUploadState(prev => ({ ...prev, active: false }));
    }, 3000);
  };

  const cancelUpload = () => {
    if (uploadState.cancelFn) {
      uploadState.cancelFn();
    }
    setUploadState(prev => ({ ...prev, active: false }));
  };

  const setCancelFn = (cancelFn: () => void) => {
    setUploadState(prev => ({ ...prev, cancelFn }));
  };

  return {
    uploadState,
    startUpload,
    updateProgress,
    completeUpload,
    errorUpload,
    cancelUpload,
    setCancelFn,
  };
}
