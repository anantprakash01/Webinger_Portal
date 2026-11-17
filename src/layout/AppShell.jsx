import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LuEllipsis, LuLogOut, LuX } from 'react-icons/lu';
import { isMock } from '@/api/client';
import { demoAccounts, DEMO_MFA_CODE, DEMO_PASSWORD } from '@/api/mock/data';
import { homePath, useAuth } from '@/auth/AuthContext';
import { Logo } from '@/components/Logo';
import { Avatar, Button } from '@/components/ui';
import { AREA_BY_ROLE, ROLE_LABEL } from '@/types';
import { AREA_TITLE, navFor } from './nav';
import './shell.css';

export function AppShell() {
  const { user, area, logout, login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [switchError, setSwitchError] = useState(null);

  useEffect(() => setMoreOpen(false), [location.pathname]);

  if (!user || !area) return null;
  const items = navFor(area, user);
  const primary = items.filter((i) => i.primary).slice(0, 4);
  const hasMore = items.length > primary.length;
  const end = (to) => to === homePath(area);

  const signOut = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const switchTo = async (email) => {
    setSwitchError(null);
    try {
      // Demo aid only: switches account and fills the two-step code itself.
      const r = await login(email, DEMO_PASSWORD);
      const u = r.mfa ? await verifyMfa(r.mfa.mfaToken, DEMO_MFA_CODE) : r.user;
      navigate(homePath(AREA_BY_ROLE[u.role]), { replace: true });
    } catch (e) {
      // e.g. that demo account was suspended or its password was reset during the demo.
      setSwitchError(e instanceof Error ? e.message : 'Could not switch account.');
    }
  };

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Main navigation">
        <div className="sidebar__brand">
          <Logo height={26} />
          <div className="sidebar__area">{AREA_TITLE[area]}</div>
        </div>
        <nav className="sidebar__nav">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end(to)} className="navlink">
              <Icon size={18} aria-hidden /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar__foot">
          <div className="me">
            <Avatar name={user.name} />
            <div style={{ minWidth: 0 }}>
              <div className="me__name">{user.name}</div>
              <div className="me__role">
                {ROLE_LABEL[user.role]} · {user.organisationName}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LuLogOut aria-hidden /> Sign out
          </Button>
        </div>
      </aside>

      <div className="main">
        {isMock && (
          <div className="demo-bar" role="note">
            <strong>Prototype</strong>
            <span>Demo data, nothing is saved.</span>
            {switchError && (
              <span role="alert" className="demo-bar__error">
                {switchError}
              </span>
            )}
            <span className="spacer" />
            <label htmlFor="role-switch">View as</label>
            <select id="role-switch" value={user.email} onChange={(e) => void switchTo(e.target.value)}>
              {demoAccounts.map((a) => (
                <option key={a.email} value={a.email}>
                  {ROLE_LABEL[a.role]}{a.note ? ` · ${a.note}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <header className="topbar">
          <Logo height={22} />
          <span className="spacer" />
          <Avatar name={user.name} size={32} />
        </header>

        <main id="content">
          <Outlet />
        </main>
      </div>

      <nav className="bottomnav" aria-label="Main navigation">
        {primary.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end(to)}>
            <Icon size={22} aria-hidden />
            {label}
          </NavLink>
        ))}
        {hasMore && (
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
            <LuEllipsis size={22} aria-hidden />
            More
          </button>
        )}
      </nav>

      {moreOpen && (
        <>
          <div className="sheet-backdrop" onClick={() => setMoreOpen(false)} />
          <div className="sheet" role="dialog" aria-modal="true" aria-label="More pages">
            <div className="row" style={{ marginBottom: 8 }}>
              <strong>{AREA_TITLE[area]}</strong>
              <span className="spacer" />
              <Button variant="ghost" icon onClick={() => setMoreOpen(false)} aria-label="Close">
                <LuX size={20} />
              </Button>
            </div>
            {items.map(({ to, label, icon: Icon }) => (
              <NavLink key={to} to={to} end={end(to)} className="navlink">
                <Icon size={18} aria-hidden /> {label}
              </NavLink>
            ))}
            <Button variant="secondary" onClick={signOut} style={{ marginTop: 12 }}>
              <LuLogOut aria-hidden /> Sign out
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
