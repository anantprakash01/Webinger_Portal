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
import { AdminClientDetail } from '@/pages/admin/AdminClientDetail';
import { AdminClients } from '@/pages/admin/AdminClients';
import { AdminFinance } from '@/pages/admin/AdminFinance';
import { AdminInvoice } from '@/pages/admin/AdminInvoice';
import { AdminReports } from '@/pages/admin/AdminReports';
import { AdminPeople } from '@/pages/admin/AdminPeople';
import { AdminInfluencers } from '@/pages/admin/AdminInfluencers';
import { AdminOffers } from '@/pages/admin/AdminOffers';
import { AdminPr } from '@/pages/admin/AdminPr';
import { ClientInfluencers } from '@/pages/client/ClientInfluencers';
import { InfluencerCampaigns } from '@/pages/influencer/InfluencerCampaigns';
import { InfluencerPayouts } from '@/pages/influencer/InfluencerPayouts';
import { InfluencerProfile } from '@/pages/influencer/InfluencerProfile';
import { PartnerBriefs, PartnerInvoices } from '@/pages/partner/PartnerPages';
import { InfluencerSignupPage, VerifyEmailPage } from '@/pages/auth/InfluencerSignup';
import { AdminPipeline } from '@/pages/admin/AdminPipeline';
import { EmployeeLeave } from '@/pages/employee/EmployeeLeave';
import { EmployeePerformance } from '@/pages/employee/EmployeePerformance';
import { EmployeeTimesheet } from '@/pages/employee/EmployeeTimesheet';
import { ClientBilling } from '@/pages/client/ClientBilling';
import { ClientInvoice } from '@/pages/client/ClientInvoice';
import { ClientReports } from '@/pages/client/ClientReports';
import { AdminSettings } from '@/pages/admin/AdminSettings';
import { ClientApprovalDetail } from '@/pages/client/ClientApprovalDetail';
import { ClientApprovals } from '@/pages/client/ClientApprovals';
import { ClientFiles } from '@/pages/client/ClientFiles';
import { MessagesPage } from '@/pages/shared/MessagesPage';
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
  '/admin/clients': AdminClients,
  '/client/projects': ClientProjects,
  '/employee/tasks': EmployeeTasks,
  '/employee/review': EmployeeReview,
  '/client/approvals': ClientApprovals,
  '/client/team': ClientTeam,
  '/admin/settings': AdminSettings,
  '/admin/messages': MessagesPage,
  '/client/messages': MessagesPage,
  '/employee/messages': MessagesPage,
  '/client/files': ClientFiles,
  '/admin/finance': AdminFinance,
  '/admin/reports': AdminReports,
  '/client/billing': ClientBilling,
  '/client/reports': ClientReports,
  '/admin/pipeline': AdminPipeline,
  '/admin/people': AdminPeople,
  '/employee/timesheet': EmployeeTimesheet,
  '/employee/performance': EmployeePerformance,
  '/employee/leave': EmployeeLeave,
  '/admin/influencers': AdminInfluencers,
  '/admin/pr': AdminPr,
  '/admin/offers': AdminOffers,
  '/client/influencers': ClientInfluencers,
  '/influencer/campaigns': InfluencerCampaigns,
  '/influencer/profile': InfluencerProfile,
  '/influencer/payouts': InfluencerPayouts,
  '/partner/briefs': PartnerBriefs,
  '/partner/invoices': PartnerInvoices,
};

/**
 * Detail routes that have no nav item of their own. Paths are relative to the area.
 * `guard` names the nav item whose role/permission rule also applies (e.g. invoices follow Billing).
 */
const DETAIL_ROUTES = {
  admin: [
    { path: 'projects/:id', Page: AdminProjectDetail },
    { path: 'clients/:id', Page: AdminClientDetail },
    { path: 'finance/invoices/:id', Page: AdminInvoice, guard: '/admin/finance' },
  ],
  client: [
    { path: 'projects/:id', Page: ClientProjectDetail },
    { path: 'approvals/:id', Page: ClientApprovalDetail },
    { path: 'billing/invoices/:id', Page: ClientInvoice, guard: '/client/billing' },
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
          {/* Week 7: the only public sign-up (creators). */}
          <Route path="/join" element={<InfluencerSignupPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
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
                  {(DETAIL_ROUTES[area] ?? []).map(({ path, Page, guard }) => {
                    const item = guard && NAV[area].find((i) => i.to === guard);
                    return <Route key={path} path={path} element={item ? <Guarded item={item} Page={Page} /> : <Page />} />;
                  })}
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
