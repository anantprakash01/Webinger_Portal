import { lazy, Suspense } from 'react';
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
import { InfluencerSignupPage, VerifyEmailPage } from '@/pages/auth/InfluencerSignup';
import { NotFound, Placeholder } from '@/pages/Placeholder';
import { PageSkeleton } from '@/components/ui';

const AdminAutomation = lazy(() => import('@/pages/admin/AdminAutomation').then((m) => ({ default: m.AdminAutomation })));
const AdminServices = lazy(() => import('@/pages/admin/AdminServices').then((m) => ({ default: m.AdminServices })));
const KnowledgePage = lazy(() => import('@/pages/shared/KnowledgePage').then((m) => ({ default: m.KnowledgePage })));
const ClientOnboarding = lazy(() => import('@/pages/client/ClientOnboarding').then((m) => ({ default: m.ClientOnboarding })));
/* Week 8: every screen is its own chunk, so a client or creator downloads only the pages they open. */
const AdminClientDetail = lazy(() => import('@/pages/admin/AdminClientDetail').then((m) => ({ default: m.AdminClientDetail })));
const AdminClients = lazy(() => import('@/pages/admin/AdminClients').then((m) => ({ default: m.AdminClients })));
const AdminFinance = lazy(() => import('@/pages/admin/AdminFinance').then((m) => ({ default: m.AdminFinance })));
const AdminInvoice = lazy(() => import('@/pages/admin/AdminInvoice').then((m) => ({ default: m.AdminInvoice })));
const AdminReports = lazy(() => import('@/pages/admin/AdminReports').then((m) => ({ default: m.AdminReports })));
const AdminPeople = lazy(() => import('@/pages/admin/AdminPeople').then((m) => ({ default: m.AdminPeople })));
const AdminInfluencers = lazy(() => import('@/pages/admin/AdminInfluencers').then((m) => ({ default: m.AdminInfluencers })));
const AdminOffers = lazy(() => import('@/pages/admin/AdminOffers').then((m) => ({ default: m.AdminOffers })));
const AdminPr = lazy(() => import('@/pages/admin/AdminPr').then((m) => ({ default: m.AdminPr })));
const ClientInfluencers = lazy(() => import('@/pages/client/ClientInfluencers').then((m) => ({ default: m.ClientInfluencers })));
const InfluencerCampaigns = lazy(() => import('@/pages/influencer/InfluencerCampaigns').then((m) => ({ default: m.InfluencerCampaigns })));
const InfluencerPayouts = lazy(() => import('@/pages/influencer/InfluencerPayouts').then((m) => ({ default: m.InfluencerPayouts })));
const InfluencerProfile = lazy(() => import('@/pages/influencer/InfluencerProfile').then((m) => ({ default: m.InfluencerProfile })));
const PartnerBriefs = lazy(() => import('@/pages/partner/PartnerPages').then((m) => ({ default: m.PartnerBriefs })));
const PartnerInvoices = lazy(() => import('@/pages/partner/PartnerPages').then((m) => ({ default: m.PartnerInvoices })));
const AdminPipeline = lazy(() => import('@/pages/admin/AdminPipeline').then((m) => ({ default: m.AdminPipeline })));
const EmployeeLeave = lazy(() => import('@/pages/employee/EmployeeLeave').then((m) => ({ default: m.EmployeeLeave })));
const EmployeePerformance = lazy(() => import('@/pages/employee/EmployeePerformance').then((m) => ({ default: m.EmployeePerformance })));
const EmployeeTimesheet = lazy(() => import('@/pages/employee/EmployeeTimesheet').then((m) => ({ default: m.EmployeeTimesheet })));
const ClientBilling = lazy(() => import('@/pages/client/ClientBilling').then((m) => ({ default: m.ClientBilling })));
const ClientInvoice = lazy(() => import('@/pages/client/ClientInvoice').then((m) => ({ default: m.ClientInvoice })));
const ClientReports = lazy(() => import('@/pages/client/ClientReports').then((m) => ({ default: m.ClientReports })));
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings').then((m) => ({ default: m.AdminSettings })));
const ClientApprovalDetail = lazy(() => import('@/pages/client/ClientApprovalDetail').then((m) => ({ default: m.ClientApprovalDetail })));
const ClientApprovals = lazy(() => import('@/pages/client/ClientApprovals').then((m) => ({ default: m.ClientApprovals })));
const ClientFiles = lazy(() => import('@/pages/client/ClientFiles').then((m) => ({ default: m.ClientFiles })));
const MessagesPage = lazy(() => import('@/pages/shared/MessagesPage').then((m) => ({ default: m.MessagesPage })));
const ClientTeam = lazy(() => import('@/pages/client/ClientTeam').then((m) => ({ default: m.ClientTeam })));
const EmployeeReview = lazy(() => import('@/pages/employee/EmployeeReview').then((m) => ({ default: m.EmployeeReview })));
const AdminHome = lazy(() => import('@/pages/admin/AdminHome').then((m) => ({ default: m.AdminHome })));
const AdminProjectDetail = lazy(() => import('@/pages/admin/AdminProjectDetail').then((m) => ({ default: m.AdminProjectDetail })));
const AdminProjects = lazy(() => import('@/pages/admin/AdminProjects').then((m) => ({ default: m.AdminProjects })));
const ClientHome = lazy(() => import('@/pages/client/ClientHome').then((m) => ({ default: m.ClientHome })));
const ClientProjectDetail = lazy(() => import('@/pages/client/ClientProjectDetail').then((m) => ({ default: m.ClientProjectDetail })));
const ClientProjects = lazy(() => import('@/pages/client/ClientProjects').then((m) => ({ default: m.ClientProjects })));
const EmployeeHome = lazy(() => import('@/pages/employee/EmployeeHome').then((m) => ({ default: m.EmployeeHome })));
const EmployeeTasks = lazy(() => import('@/pages/employee/EmployeeTasks').then((m) => ({ default: m.EmployeeTasks })));
const InfluencerHome = lazy(() => import('@/pages/influencer/InfluencerHome').then((m) => ({ default: m.InfluencerHome })));
const PartnerHome = lazy(() => import('@/pages/partner/PartnerHome').then((m) => ({ default: m.PartnerHome })));

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
  '/admin/automation': AdminAutomation,
  '/admin/services': AdminServices,
  '/admin/knowledge': KnowledgePage,
  '/employee/knowledge': KnowledgePage,
  '/client/onboarding': ClientOnboarding,
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
        <Suspense fallback={<PageSkeleton />}>
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
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </QueryClientProvider>
  );
}
