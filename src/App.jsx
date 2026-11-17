import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { queryClient } from '@/api/queries';
import { AuthProvider, homePath, useAuth } from '@/auth/AuthContext';
import { RequireArea } from '@/auth/RequireArea';
import { AppShell } from '@/layout/AppShell';
import { NAV, canSee } from '@/layout/nav';
import { LoginPage } from '@/pages/Login';
import { AcceptInvitePage } from '@/pages/auth/AcceptInvite';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPassword';
import { ResetPasswordPage } from '@/pages/auth/ResetPassword';
import { AdminSettings } from '@/pages/admin/AdminSettings';
import { ClientApprovalDetail } from '@/pages/client/ClientApprovalDetail';
import { ClientApprovals } from '@/pages/client/ClientApprovals';
import { ClientTeam } from '@/pages/client/ClientTeam';
import { EmployeeReview } from '@/pages/employee/EmployeeReview';
import { NotFound, Placeholder } from '@/pages/Placeholder';
import { AdminHome } from '@/pages/admin/AdminHome';
import { AdminProjectDetail } from '@/pages/admin/AdminProjectDetail';
import { AdminProjects } from '@/pages/admin/AdminProjects';
import { ClientHome } from '@/pages/client/ClientHome';
import { ClientProjectDetail } from '@/pages/client/ClientProjectDetail';
import { ClientProjects } from '@/pages/client/ClientProjects';
import { EmployeeHome } from '@/pages/employee/EmployeeHome';
import { EmployeeTasks } from '@/pages/employee/EmployeeTasks';
import { InfluencerHome } from '@/pages/influencer/InfluencerHome';
import { PartnerHome } from '@/pages/partner/PartnerHome';

const HOME = {
  admin: AdminHome,
  client: ClientHome,
  employee: EmployeeHome,
  influencer: InfluencerHome,
  partner: PartnerHome,
};

/** Real screens by path. Nav items without an entry here still render <Placeholder />. */
const PAGES = {
  '/admin/projects': AdminProjects,
  '/client/projects': ClientProjects,
  '/employee/tasks': EmployeeTasks,
  '/employee/review': EmployeeReview,
  '/client/approvals': ClientApprovals,
  '/client/team': ClientTeam,
  '/admin/settings': AdminSettings,
};

/** Detail routes that have no nav item of their own. Paths are relative to the area. */
const DETAIL_ROUTES = {
  admin: [{ path: 'projects/:id', Page: AdminProjectDetail }],
  client: [
    { path: 'projects/:id', Page: ClientProjectDetail },
    { path: 'approvals/:id', Page: ClientApprovalDetail },
  ],
};

/**
 * Hides pages limited to some roles or grants (e.g. Settings for Super Admin).
 * UI convenience only: the API refuses these calls for everyone else.
 */
function Guarded({ item, Page }) {
  const { user } = useAuth();
  return user && canSee(user, item) ? <Page /> : <NotFound />;
}

function RootRedirect() {
  const { area } = useAuth();
  return <Navigate to={area ? homePath(area) : '/login'} replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/" element={<RootRedirect />} />

          {Object.keys(HOME).map((area) => {
            const Home = HOME[area];
            return (
              <Route key={area} path={`/${area}`} element={<RequireArea area={area} />}>
                <Route element={<AppShell />}>
                  <Route index element={<Home />} />
                  {NAV[area]
                    .filter((i) => i.to !== `/${area}`)
                    .map((i) => {
                      const Page = PAGES[i.to] ?? Placeholder;
                      return <Route key={i.to} path={i.to.slice(area.length + 2)} element={<Guarded item={i} Page={Page} />} />;
                    })}
                  {(DETAIL_ROUTES[area] ?? []).map(({ path, Page }) => (
                    <Route key={path} path={path} element={<Page />} />
                  ))}
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Route>
            );
          })}

          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </QueryClientProvider>
  );
}
