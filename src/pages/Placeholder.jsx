import { useLocation } from 'react-router-dom';
import { LuClock } from 'react-icons/lu';
import { useAuth } from '@/auth/AuthContext';
import { Card, PageHeader } from '@/components/ui';
import { NAV } from '@/layout/nav';

/** Stands in for screens that later weeks will build, so navigation works end to end. */
export function Placeholder() {
  const { area, user } = useAuth();
  const { pathname } = useLocation();
  const item = area ? NAV[area].find((i) => i.to === pathname) : undefined;
  // Pages limited to some roles (e.g. Finance for Super Admin) are hidden from the rest.
  if (item?.roles && user && !item.roles.includes(user.role)) return <NotFound />;
  return (
    <div className="page">
      <PageHeader eyebrow="Coming soon" title={item?.label ?? 'Page'} />
      <Card>
        <div className="state">
          <LuClock size={28} aria-hidden />
          <div className="state__title">This screen is planned for week {item?.week ?? '–'} of the prototype</div>
          <div className="small">Navigation, layout and access are already wired up.</div>
        </div>
      </Card>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="page">
      <PageHeader title="Page not found" />
      <p className="muted">The link may be old, or this page belongs to a different portal.</p>
    </div>
  );
}
