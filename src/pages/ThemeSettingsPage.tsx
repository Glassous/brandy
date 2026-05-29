import { useTheme } from '../contexts/ThemeContext';
import { Link } from 'react-router-dom';
import { SunIcon, MoonIcon, MonitorIcon, CheckIcon } from '../components/shared/Icons';

export function ThemeSettingsPage() {
  const { theme, setTheme } = useTheme();

  const handleSelectTheme = (selected: 'light' | 'dark' | 'system') => {
    setTheme(selected);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <style>{`
        .tm-header {
          display: flex;
          align-items: center;
          height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          gap: 12px;
          flex-shrink: 0;
          background: var(--bg);
        }
        .tm-back-btn {
          background: none;
          color: var(--text);
          padding: 6px;
          display: flex;
          align-items: center;
          border-radius: 50%;
          transition: background-color 0.2s;
        }
        .tm-back-btn:hover {
          background: var(--hover);
        }
        .tm-header-title {
          font-weight: 700;
          font-size: 15px;
        }
        .tm-content {
          flex: 1;
          padding: 24px 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 600px;
          width: 100%;
          margin: 0 auto;
        }
        .tm-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .tm-cards-container {
          display: flex;
          gap: 16px;
          width: 100%;
        }
        @media (max-width: 480px) {
          .tm-cards-container {
            flex-direction: column;
            gap: 12px;
          }
        }
        .tm-card {
          flex: 1;
          border: 2px solid var(--border);
          border-radius: var(--radius);
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          cursor: pointer;
          background: var(--bg);
          transition: border-color 0.2s, background-color 0.2s, transform 0.1s;
          user-select: none;
        }
        .tm-card:hover {
          background: var(--hover);
        }
        .tm-card:active {
          transform: scale(0.97);
        }
        .tm-card.active {
          border-color: var(--brand-blue);
          background: var(--hover);
        }
        .tm-preview-box {
          width: 100%;
          height: 80px;
          border-radius: 6px;
          border: 1px solid var(--border);
          position: relative;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .tm-preview-light {
          background: #f4f4f5;
        }
        .tm-preview-dark {
          background: #0e1621;
        }
        .tm-preview-system {
          background: linear-gradient(135deg, #f4f4f5 50%, #0e1621 50%);
        }
        .tm-preview-inner {
          position: absolute;
          top: 10px;
          left: 10px;
          right: 10px;
          bottom: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tm-preview-line {
          height: 6px;
          border-radius: 3px;
          width: 80%;
        }
        .tm-preview-light .tm-preview-line {
          background: #d9d9d9;
        }
        .tm-preview-dark .tm-preview-line {
          background: #2b5278;
        }
        .tm-preview-light .tm-preview-line.short {
          background: #3390ec;
          width: 40%;
        }
        .tm-preview-dark .tm-preview-line.short {
          background: #5288c1;
          width: 40%;
        }
        .tm-card-label {
          font-weight: 700;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tm-check-icon {
          color: var(--text);
          display: flex;
        }
      `}</style>

      {/* Header */}
      <div className="tm-header">
        <Link to="/profile" className="tm-back-btn" title="返回设置">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
        </Link>
        <span className="tm-header-title">主题设置</span>
      </div>

      {/* Content */}
      <div className="tm-content">
        <h2 className="tm-title">选择外观</h2>
        <div className="tm-cards-container">
          {/* Light Theme Card */}
          <div 
            className={`tm-card ${theme === 'light' ? 'active' : ''}`}
            onClick={() => handleSelectTheme('light')}
          >
            <div className="tm-preview-box tm-preview-light">
              <div className="tm-preview-inner">
                <div className="tm-preview-line short" />
                <div className="tm-preview-line" />
                <div className="tm-preview-line" style={{ width: '60%' }} />
              </div>
            </div>
            <span className="tm-card-label">
              <SunIcon size={16} />
              浅色模式
              {theme === 'light' && (
                <span className="tm-check-icon">
                  <CheckIcon size={15} />
                </span>
              )}
            </span>
          </div>

          {/* Dark Theme Card */}
          <div 
            className={`tm-card ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => handleSelectTheme('dark')}
          >
            <div className="tm-preview-box tm-preview-dark">
              <div className="tm-preview-inner">
                <div className="tm-preview-line short" />
                <div className="tm-preview-line" />
                <div className="tm-preview-line" style={{ width: '60%' }} />
              </div>
            </div>
            <span className="tm-card-label">
              <MoonIcon size={16} />
              深色模式
              {theme === 'dark' && (
                <span className="tm-check-icon">
                  <CheckIcon size={15} />
                </span>
              )}
            </span>
          </div>

          {/* System Theme Card */}
          <div 
            className={`tm-card ${theme === 'system' ? 'active' : ''}`}
            onClick={() => handleSelectTheme('system')}
          >
            <div className="tm-preview-box tm-preview-system">
              <div className="tm-preview-inner" style={{ left: 10, right: 'auto', width: '35%' }}>
                <div className="tm-preview-line short" style={{ background: '#D4B87A' }} />
                <div className="tm-preview-line" style={{ background: '#E5DFD0' }} />
              </div>
              <div className="tm-preview-inner" style={{ left: 'auto', right: 10, width: '35%' }}>
                <div className="tm-preview-line short" style={{ background: '#E5C68A' }} />
                <div className="tm-preview-line" style={{ background: '#3D372C' }} />
              </div>
            </div>
            <span className="tm-card-label">
              <MonitorIcon size={16} />
              跟随系统
              {theme === 'system' && (
                <span className="tm-check-icon">
                  <CheckIcon size={15} />
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
