import { Link } from 'react-router-dom';

export function ProfilePage() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <style>{`
        .setting-header {
          display: flex;
          align-items: center;
          height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          background: var(--bg);
        }
        .setting-header-title {
          font-weight: 700;
          font-size: 15px;
        }
        .setting-list {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .setting-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px;
          border: 1px solid var(--border);
          border-radius: var(--radius);
          text-decoration: none;
          color: var(--text);
          background: var(--bg-paper);
          transition: background-color 0.2s, transform 0.1s;
        }
        .setting-item:hover {
          background: var(--hover);
        }
        .setting-item:active {
          transform: scale(0.98);
        }
        .setting-item-content {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .setting-item-title {
          font-weight: 700;
          font-size: 15px;
        }
        .setting-item-desc {
          font-size: 12px;
          color: var(--text-dim);
        }
        .setting-item-arrow {
          color: var(--text-dim);
          display: flex;
        }
      `}</style>

      {/* Header */}
      <div className="setting-header">
        <span className="setting-header-title">设置</span>
      </div>

      {/* Menu List */}
      <div className="setting-list">
        <Link to="/profile/account" className="setting-item">
          <div className="setting-item-content">
            <span className="setting-item-title">账户设置</span>
            <span className="setting-item-desc">管理您的昵称、修改密码、以及登出账户</span>
          </div>
          <div className="setting-item-arrow">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </Link>

        <Link to="/profile/theme" className="setting-item">
          <div className="setting-item-content">
            <span className="setting-item-title">主题设置</span>
            <span className="setting-item-desc">切换浅色模式 / 深色模式以获得最佳视觉效果</span>
          </div>
          <div className="setting-item-arrow">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </div>
        </Link>
      </div>
    </div>
  );
}
