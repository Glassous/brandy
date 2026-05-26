import { Outlet, Link, useLocation } from 'react-router-dom';
import { useApp } from '../../contexts/AppContext';

export function MainLayout() {
  const { pathname } = useLocation();
  const { chats, friendRequests } = useApp();

  const unread = chats.reduce((s, c) => s + c.unread_count, 0);
  const requests = friendRequests.length;

  const isChatRoute = pathname.startsWith('/chat');

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', width: '100%', background: 'var(--bg)', overflow: 'hidden' }}>
      <style>{`
        :root {
          --rail-bg: var(--bg-paper);
          --rail-active-pill: var(--brand-yellow);
          --rail-active-text: #1A1A1A;
          --rail-inactive-text: var(--text-secondary);
          --rail-hover-pill: var(--hover);
          --rail-badge-bg: var(--badge-unread);
          --rail-badge-text: #FFFFFF;
        }

        [data-theme="dark"] {
          --rail-bg: var(--bg-paper);
          --rail-active-pill: var(--brand-yellow);
          --rail-active-text: #1B1915;
          --rail-inactive-text: var(--text-secondary);
          --rail-hover-pill: var(--hover);
          --rail-badge-bg: var(--badge-unread);
          --rail-badge-text: #1B1915;
        }

        .navigation-rail {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          height: 100%;
          width: 80px;
          padding: 24px 0;
          background: var(--rail-bg);
          border-right: 1px solid var(--border);
          flex-shrink: 0;
          z-index: 10;
        }

        .rail-group {
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: center;
          width: 100%;
        }

        .rail-item {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 48px;
          text-decoration: none;
          outline: none;
          -webkit-tap-highlight-color: transparent;
        }

        .rail-pill {
          position: relative;
          width: 56px;
          height: 32px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          color: var(--rail-inactive-text);
          transition: background-color 0.2s cubic-bezier(0.2, 0, 0, 1), 
                      color 0.2s cubic-bezier(0.2, 0, 0, 1),
                      transform 0.1s ease;
        }

        .rail-pill:active {
          transform: scale(0.92);
        }

        .rail-item:hover .rail-pill {
          background: var(--rail-hover-pill);
        }

        .rail-item.active .rail-pill {
          background: var(--rail-active-pill);
          color: var(--rail-active-text);
        }

        .rail-icon {
          stroke: currentColor;
          transition: transform 0.2s;
        }

        .rail-item.active .rail-icon {
          transform: scale(1.05);
        }

        .rail-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background: var(--rail-badge-bg);
          color: var(--rail-badge-text);
          font-size: 9px;
          font-weight: 700;
          min-width: 16px;
          height: 16px;
          line-height: 16px;
          border-radius: 8px;
          padding: 0 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 48px;
          padding: 0 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          font-weight: 700;
          font-size: 15px;
          background: var(--bg);
        }

        .content {
          flex: 1;
          overflow: hidden;
          position: relative;
        }
      `}</style>

      {/* MD3 Navigation Rail */}
      <nav className="navigation-rail">
        {/* Top Destination Items */}
        <div className="rail-group">
          {/* Chat Link */}
          <Link to="/chat" className={`rail-item ${isChatRoute ? 'active' : ''}`} title="聊天">
            <div className="rail-pill">
              {unread > 0 && <span className="rail-badge">{unread}</span>}
              <svg className="rail-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
          </Link>

          {/* Contacts Link */}
          <Link to="/contacts" className={`rail-item ${pathname.startsWith('/contacts') || pathname === '/add-friend' ? 'active' : ''}`} title="联系人">
            <div className="rail-pill">
              {requests > 0 && <span className="rail-badge">{requests}</span>}
              <svg className="rail-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
          </Link>

          {/* Cloud Disk Link */}
          <Link to="/disk" className={`rail-item ${pathname.startsWith('/disk') ? 'active' : ''}`} title="云盘">
            <div className="rail-pill">
              <svg className="rail-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
              </svg>
            </div>
          </Link>
        </div>

        {/* Bottom Destination Items */}
        <div className="rail-group">
          {/* Settings / Profile Link */}
          <Link to="/profile" className={`rail-item ${pathname.startsWith('/profile') ? 'active' : ''}`} title="设置">
            <div className="rail-pill">
              <svg className="rail-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </div>
          </Link>
        </div>
      </nav>

      {/* Main Content Pane */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
