import { NavLink, Outlet, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLive } from '../context/LiveContext';
import { useTheme } from '../context/ThemeContext';
import { subscription, branches as branchesApi } from '../api/endpoints';
import { Icons } from './Icons';

const BASE_NAV_ITEMS = [
  { to: '/', label: 'Dashboard', mobileLabel: 'Home', icon: Icons.dashboard, end: true },
  { to: '/inventory', label: 'Inventory', mobileLabel: 'Stock', icon: Icons.inventory },
];

const REPAIRS_NAV_ITEM = { to: '/repairs', label: 'Service', mobileLabel: 'Service', icon: Icons.repairs };

const SALES_NAV_ITEM = { to: '/sales', label: 'Sales', mobileLabel: 'Sales', icon: Icons.sales };

const PRINTER_NAV_ITEM = { to: '/printer-setup', label: 'Printer', mobileLabel: 'Printer', icon: Icons.printer };

const OWNER_NAV_ITEMS = [
  { to: '/reports', label: 'Reports', mobileLabel: 'Reports', icon: Icons.reports },
  { to: '/liabilities', label: 'Liabilities', mobileLabel: 'Owe', icon: Icons.liabilities },
  { to: '/workers', label: 'Workers', mobileLabel: 'Workers', icon: Icons.workers },
  { to: '/billing', label: 'Billing', mobileLabel: 'Billing', icon: Icons.billing },
  { to: '/settings', label: 'Settings', mobileLabel: 'Settings', icon: Icons.settings },
];

export default function Layout() {
  const { user, logout, isOwner, isCeo, shopName, repairsEnabled } = useAuth();
  const { status: liveStatus, versions } = useLive();
  const { theme, toggleTheme } = useTheme();
  // Repairs only makes sense for businesses that actually fix devices —
  // a clothing or general retail shop never sees the tab at all, rather
  // than seeing an empty/irrelevant section. Driven entirely by what the
  // owner picked at signup (Organization.business_type on the backend).
  const coreItems = repairsEnabled
    ? [...BASE_NAV_ITEMS, REPAIRS_NAV_ITEM, SALES_NAV_ITEM, PRINTER_NAV_ITEM]
    : [...BASE_NAV_ITEMS, SALES_NAV_ITEM, PRINTER_NAV_ITEM];
  const items = isOwner ? [...coreItems, ...OWNER_NAV_ITEMS] : coreItems;

  const [sub, setSub] = useState(null);
  useEffect(() => {
    subscription.status().then(({ data }) => setSub(data)).catch(() => {});
  }, [versions.subscription]);

  // Only relevant for a CEO running more than one branch — everyone else
  // has exactly one branch and the backend scopes every request to it
  // automatically, so there's nothing to switch. See api/client.js's
  // X-Branch-ID header and backend core.utils.get_shops_for_user.
  const [branchList, setBranchList] = useState(null);
  const [currentBranch, setCurrentBranch] = useState(localStorage.getItem('current_branch_id') || '');
  useEffect(() => {
    if (!isCeo) return;
    branchesApi.list().then(({ data }) => setBranchList(data.results || data)).catch(() => {});
  }, [isCeo]);

  function switchBranch(id) {
    if (id) localStorage.setItem('current_branch_id', id);
    else localStorage.removeItem('current_branch_id');
    setCurrentBranch(id);
    window.location.reload(); // simplest way to make every already-fetched page re-scope to the new branch
  }

  return (
    <div className="app-shell">
      <div className="sidebar">
        <div className="brand"><span className="dot" />{shopName}</div>
        {isCeo && branchList && branchList.length > 1 && (
          <select
            className="branch-switcher"
            value={currentBranch}
            onChange={(e) => switchBranch(e.target.value)}
            title="Switch which branch you're viewing"
          >
            <option value="">All branches</option>
            {branchList.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `navitem ${isActive ? 'active' : ''}`}
          >
            {item.icon}<span>{item.label}</span>
          </NavLink>
        ))}
        <div className="nav-footer mono">
          {user?.full_name || user?.username}
          <div style={{ opacity: 0.6, fontSize: 10.5, marginTop: 2, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            {isOwner ? 'Owner' : 'Seller'}
          </div>
          <div className={`live-indicator ${liveStatus === 'open' ? 'live' : ''}`} title={
            liveStatus === 'open' ? 'Live — sales and stock changes appear instantly' : 'Reconnecting…'
          }>
            <span className="dot" />
            {liveStatus === 'open' ? 'Live' : 'Reconnecting…'}
          </div>
          <button
            className="btn ghost small"
            style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
            onClick={logout}
          >
            {Icons.logout} Log out
          </button>
          <button className="theme-toggle" onClick={toggleTheme}>
            {theme === 'dark' ? Icons.sun : Icons.moon}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </div>

      <main className="content">
        {sub && !sub.cloud_services_enabled && (
          <div className="banner warn" style={{ marginBottom: 18 }}>
            {sub.effective_status === 'expired'
              ? 'Subscription expired — cloud sync and the CEO app are paused. Selling on this desktop still works normally.'
              : "Subscription in its grace period — renew soon to keep cloud sync running."}
            {isOwner && <Link to="/billing" style={{ marginLeft: 'auto', fontWeight: 700 }}>Subscribe →</Link>}
          </div>
        )}
        <Outlet />
      </main>

      <button className="theme-toggle-fab" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === 'dark' ? Icons.sun : Icons.moon}
      </button>

      <div className="bottomnav">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => (isActive ? 'active' : '')}
          >
            {item.icon}<span>{item.mobileLabel}</span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
