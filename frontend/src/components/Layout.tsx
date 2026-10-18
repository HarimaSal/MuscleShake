import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useApp } from '../context/AppContext';
import { Avatar, Button, IconButton, Modal } from './Ui';
import { PrivacyGate } from './PrivacyGate';
import { ThemeToggle } from './ThemeToggle';
import { relativeTime } from '../lib/format';

const NAV_ITEMS = [
  { to: '/', label: '首页', end: true },
  { to: '/sessions', label: '记录' },
  { to: '/posts', label: '内容' },
  { to: '/data', label: '数据' },
  { to: '/community', label: '社区', soon: true },
  { to: '/settings', label: '我的' },
];

const MOBILE_ITEMS = [
  { to: '/sessions', label: '记录', icon: '▤' },
  { to: '/checkin', label: '打卡', icon: '◉' },
  { to: '/data', label: '数据', icon: '◨' },
  { to: '/community', label: '社区', icon: '◍' },
  { to: '/settings', label: '我的', icon: '☰' },
];

export function Layout() {
  const { user, me, config, signOut, toast } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
    setNotifyOpen(false);
  }, [location.pathname]);

  const openNotifications = async () => {
    setNotifyOpen(true);
    try {
      const data = await api.get('/api/auth/me/notifications');
      setNotifications(data.items);
      await api.post('/api/auth/me/notifications/read');
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="练迹首页">
            <span className="brand-mark">练</span>
            <span>
              练迹 <small>FitLog</small>
            </span>
          </Link>
          <nav className="nav" aria-label="主导航">
            {NAV_ITEMS.map((item) => {
              if (item.to === '/community' && !config?.communityVisible) return null;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                  onClick={() => {
                    if (item.to === '/community') {
                      api
                        .post('/api/config/events', {
                          name: 'reserved_entry_click',
                          props: { platform: 'web', entry: 'nav' },
                        })
                        .catch(() => undefined);
                    }
                  }}
                >
                  {item.label}
                  {item.soon && config?.communityVisible && <span className="nav-soon">敬请期待</span>}
                </NavLink>
              );
            })}
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            <IconButton label="通知" onClick={openNotifications}>
              <span style={{ position: 'relative' }}>
                ◔
                {!!me?.unreadNotifications && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -5,
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                    }}
                  />
                )}
              </span>
            </IconButton>
            <Button variant="primary" size="sm" onClick={() => navigate('/posts/new')}>
              + <span>写文章</span>
            </Button>
            {user ? (
              <Link to="/settings" aria-label="我的" style={{ display: 'flex' }}>
                <Avatar name={user.nickname} src={user.avatar} size={30} />
              </Link>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate('/login')}>
                登录
              </Button>
            )}
          </div>
        </div>
      </header>

      {me?.deletion && (
        <div className="page" style={{ paddingBottom: 0 }}>
          <div className="notice notice-warn">
            <span>⚠</span>
            <div>
              账号已申请注销，将在 {new Date(me.deletion.purgeAt).toLocaleDateString('zh-CN')} 彻底删除。
              <Link to="/settings" style={{ color: 'var(--accent)', marginLeft: 6 }}>
                前往设置撤销
              </Link>
            </div>
          </div>
        </div>
      )}

      <main className="page">
        <Outlet />
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', padding: '20px 24px', textAlign: 'center', color: 'var(--muted-2)', fontSize: 11.5 }}>
        练迹 FitLog · 训练记录与成长档案 · 数据与身体指标仅供参考，不构成健康或医疗建议
      </footer>

      <nav className="mobile-tabbar" aria-label="移动端导航">
        {MOBILE_ITEMS.map((item) => {
          if (item.to === '/community' && !config?.communityVisible) return null;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `mobile-tab ${isActive ? 'active' : ''}`}
              onClick={() => {
                if (item.to === '/community') {
                  api
                    .post('/api/config/events', {
                      name: 'reserved_entry_click',
                      props: { platform: 'web', entry: 'mobile_tab' },
                    })
                    .catch(() => undefined);
                }
              }}
            >
              <span className="mt-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <Modal open={notifyOpen} onClose={() => setNotifyOpen(false)} title="站内提醒" description="每日最多 1 次，可在设置中关闭">
        {notifications.length === 0 ? (
          <p className="muted small" style={{ padding: '20px 0' }}>
            暂无提醒。打卡提醒与周报提醒会显示在这里。
          </p>
        ) : (
          <div className="stack-sm">
            {notifications.map((item) => (
              <div key={item.id} className="notice" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                <div className="between" style={{ width: '100%' }}>
                  <strong>{item.title}</strong>
                  <span className="muted small">{relativeTime(item.createdAt)}</span>
                </div>
                <span>{item.body}</span>
              </div>
            ))}
          </div>
        )}
        <div className="modal-foot" style={{ padding: '16px 0 0', border: 0 }}>
          <Button
            variant="outline"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
          >
            退出登录
          </Button>
          <Button variant="primary" onClick={() => setNotifyOpen(false)}>
            知道了
          </Button>
        </div>
      </Modal>

      <PrivacyGate />
    </div>
  );
}
