import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../src/components/Ui';
import { ThemeToggle } from '../../src/components/ThemeToggle';
import { useOpsAuth } from './OpsAuth';

type NavItem = { to: string; label: string; icon: string; end?: boolean };

const SECTIONS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '概览',
    items: [{ to: '/', label: '工作台', end: true, icon: '⌂' }],
  },
  {
    label: '动作库',
    items: [
      { to: '/exercises', label: '动作列表', icon: '▤' },
      { to: '/exercises/import', label: '批量导入', icon: '⇧' },
      { to: '/exercises/search-quality', label: '搜索质量', icon: '⌕' },
      { to: '/exercises/merge', label: '合并与归档', icon: '⇄' },
    ],
  },
  {
    label: '内容',
    items: [
      { to: '/official', label: '官方内容', icon: '✎' },
      { to: '/official/templates', label: '训练模板', icon: '▦' },
      { to: '/official/help', label: '帮助页 / FAQ', icon: '?' },
      { to: '/official/banners', label: '横幅公告', icon: '▬' },
    ],
  },
  {
    label: '审核',
    items: [
      { to: '/review', label: '审核队列', icon: '◷' },
      { to: '/review/reports', label: '举报 / 申诉', icon: '⚑' },
      { to: '/review/rules', label: '规则库', icon: '§' },
      { to: '/review/spotcheck', label: '抽查工作台', icon: '◉' },
    ],
  },
  {
    label: '运营',
    items: [
      { to: '/configs', label: '配置中心', icon: '⚙' },
      { to: '/users', label: '用户与处置', icon: '◍' },
      { to: '/analytics', label: '数据看板', icon: '◨' },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/test-account', label: '测试号', icon: '◎' },
      { to: '/system', label: '系统与审计', icon: '⌘' },
    ],
  },
];

const BREADCRUMBS: Record<string, string> = {
  '/': '工作台',
  '/exercises': '动作列表',
  '/exercises/new': '新建动作',
  '/exercises/import': '批量导入',
  '/exercises/search-quality': '搜索质量',
  '/exercises/merge': '合并与归档',
  '/official': '官方内容',
  '/official/new': '新建官方内容',
  '/official/templates': '训练模板',
  '/official/help': '帮助页 / FAQ',
  '/official/banners': '横幅公告',
  '/review': '审核队列',
  '/review/reports': '举报 / 申诉',
  '/review/rules': '规则库',
  '/review/spotcheck': '抽查工作台',
  '/configs': '配置中心',
  '/users': '用户与处置',
  '/analytics': '数据看板',
  '/test-account': '测试号',
  '/system': '系统与审计',
};

export function OpsLayout() {
  const { admin, signOut } = useOpsAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState('');
  const title = BREADCRUMBS[location.pathname] ?? (location.pathname.includes('/exercises/') ? '动作详情' : location.pathname.includes('/official/') ? '官方内容编辑' : location.pathname.includes('/configs/') ? '配置详情' : '运营后台');
  const visibleSections = SECTIONS.filter((section) => {
    if (section.label === '系统' && admin?.role !== 'super_admin') return false;
    if (section.label === '运营' && admin?.role === 'viewer') return false;
    return true;
  });

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <NavLink to="/" className="ops-brand">
          <span className="ops-brand-mark">练</span>
          <span>
            <strong>FitLog Ops</strong>
            <small>运营后台 v2.0</small>
          </span>
        </NavLink>
        <div className="ops-env"><span /> 内部系统 · 生产口径</div>
        <nav className="ops-nav" aria-label="运营后台导航">
          {visibleSections.map((section) => (
            <div className="ops-nav-section" key={section.label}>
              <div className="ops-nav-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `ops-nav-link ${isActive ? 'active' : ''}`}
                >
                  <span className="ops-nav-icon">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="ops-sidebar-foot">
          <div className="ops-account">
            <span className="ops-avatar">{admin?.username?.slice(0, 1).toUpperCase() ?? 'A'}</span>
            <div>
              <strong>{admin?.username ?? 'admin'}</strong>
              <small>{roleLabel(admin?.role)}</small>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => void signOut()}>退出</Button>
        </div>
      </aside>

      <div className="ops-main">
        <header className="ops-topbar">
          <div className="ops-breadcrumb">
            <span>FitLog Ops</span>
            <i>/</i>
            <strong>{title}</strong>
          </div>
          <form
            className="ops-global-search"
            onSubmit={(event) => {
              event.preventDefault();
              const value = search.trim();
              navigate(value ? `/exercises?q=${encodeURIComponent(value)}` : '/exercises');
            }}
          >
            <span>⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索动作、内容或用户（Enter）"
              aria-label="全局搜索"
            />
          </form>
          <div className="ops-top-actions">
            <span className="ops-live"><i /> 系统正常</span>
            <ThemeToggle />
            <div className="ops-user-menu">
              <button type="button" onClick={() => setMenu((value) => !value)} aria-expanded={menu}>
                <span className="ops-avatar small">{admin?.username?.slice(0, 1).toUpperCase() ?? 'A'}</span>
                {admin?.username}
                <span>⌄</span>
              </button>
              {menu && (
                <div className="ops-menu-pop">
                  <div><strong>{admin?.username}</strong><span>{roleLabel(admin?.role)}</span></div>
                  <NavLink to="/system" onClick={() => setMenu(false)}>账号与审计</NavLink>
                  <button type="button" onClick={() => void signOut()}>退出后台</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="ops-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function roleLabel(role?: string) {
  return { super_admin: '超级管理员', operator: '运营', reviewer: '审核员', viewer: '只读观察' }[role ?? ''] ?? '后台账号';
}
