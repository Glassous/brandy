import { Link } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { Avatar } from '../components/shared/Avatar';
import { ChevronRightIcon, UserIcon } from '../components/shared/Icons';

// Sun icon inline for theme settings
const SunMoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

export function ProfilePage() {
  const { user } = useApp();

  const settingsItems = [
    {
      to: '/profile/account',
      icon: <UserIcon size={18} color="var(--brand-blue)" />,
      iconBg: 'rgba(51, 144, 236, 0.12)',
      title: '账户设置',
      desc: '昵称、密码、头像、转存路径',
    },
    {
      to: '/profile/theme',
      icon: <SunMoonIcon />,
      iconBg: 'rgba(255, 149, 0, 0.12)',
      title: '主题设置',
      desc: '浅色 / 深色 / 跟随系统',
    },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      <style>{`
        .pf-page-header {
          display: flex;
          align-items: center;
          height: 52px;
          padding: 0 20px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          background: var(--bg);
        }
        .pf-page-title {
          font-weight: 700;
          font-size: 17px;
          letter-spacing: -0.3px;
        }
        .pf-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 24px 16px 40px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          max-width: 600px;
          width: 100%;
          margin: 0 auto;
        }

        /* Profile hero card */
        .pf-hero-card {
          background: var(--bg-card);
          border-radius: 16px;
          padding: 24px 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          border: 1px solid var(--border);
          box-shadow: var(--shadow-sm);
          transition: box-shadow 0.2s;
        }
        .pf-hero-card:hover {
          box-shadow: var(--shadow-md);
        }
        .pf-hero-info {
          flex: 1;
          min-width: 0;
        }
        .pf-hero-name {
          font-size: 18px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--text);
        }
        .pf-hero-username {
          font-size: 13px;
          color: var(--text-dim);
          margin-top: 3px;
        }

        /* Settings section */
        .pf-section-label {
          font-size: 11px;
          font-weight: 700;
          color: var(--text-dim);
          text-transform: uppercase;
          letter-spacing: 0.7px;
          padding: 0 4px;
          margin-bottom: -8px;
        }
        .pf-settings-group {
          background: var(--bg-card);
          border-radius: 16px;
          border: 1px solid var(--border);
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .pf-setting-item {
          display: flex;
          align-items: center;
          padding: 14px 16px;
          gap: 14px;
          cursor: pointer;
          text-decoration: none;
          color: var(--text);
          transition: background-color 0.15s;
          border-bottom: 1px solid var(--border);
          position: relative;
        }
        .pf-setting-item:last-child {
          border-bottom: none;
        }
        .pf-setting-item:hover {
          background: var(--hover);
        }
        .pf-setting-item:active {
          background: var(--border);
        }
        .pf-setting-icon-wrap {
          width: 36px;
          height: 36px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pf-setting-content {
          flex: 1;
          min-width: 0;
        }
        .pf-setting-title {
          font-weight: 600;
          font-size: 15px;
          color: var(--text);
        }
        .pf-setting-desc {
          font-size: 12px;
          color: var(--text-dim);
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pf-setting-chevron {
          color: var(--text-dim);
          opacity: 0.6;
          flex-shrink: 0;
        }
      `}</style>

      {/* Header */}
      <div className="pf-page-header">
        <span className="pf-page-title">设置</span>
      </div>

      {/* Scrollable content */}
      <div className="pf-scroll">

        {/* Hero Profile Card */}
        <div className="pf-hero-card">
          <Avatar name={user?.nickname || '?'} url={user?.avatar} size={56} fontSize={22} />
          <div className="pf-hero-info">
            <div className="pf-hero-name">{user?.nickname || '用户'}</div>
            <div className="pf-hero-username">@{user?.username}</div>
          </div>
        </div>

        {/* Settings Group */}
        <div className="pf-section-label">账户与外观</div>
        <div className="pf-settings-group">
          {settingsItems.map((item) => (
            <Link key={item.to} to={item.to} className="pf-setting-item">
              <div className="pf-setting-icon-wrap" style={{ background: item.iconBg }}>
                {item.icon}
              </div>
              <div className="pf-setting-content">
                <div className="pf-setting-title">{item.title}</div>
                <div className="pf-setting-desc">{item.desc}</div>
              </div>
              <div className="pf-setting-chevron">
                <ChevronRightIcon size={16} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
