# Webinger Portal — project memory for Claude

Read this file fully before doing any work. It holds every decision made while planning and building this project. Keep it up to date: when a week or phase is finished, update the status tables and the "Current state" section.

Full blueprint document (same content, with diagrams): https://claude.ai/artifact/UoteqBmwidkuxG2ALHUF1B

---

## 1. Business context

- **Company:** Webinger, a digital marketing agency in India (website: webinger.in). Services: branding, website design, content production, graphics and motion, digital PR, content marketing, social media marketing, marketplaces, SEO, web store optimisation, 360 marketing, UI/UX, frontend development, marketing plans.
- **Owner's goals:**
  1. One professional portal with separate experiences for clients, employees, influencers and partners, all controlled by one admin panel.
  2. Automate routine agency work so the business runs in the owner's absence.
  3. Track performance of projects, employees, clients and revenue.
  4. Mobile-ready, usable anywhere.
  5. Admin issues all login credentials.
  6. Zero budget to start; spend only when real clients go live.
- **Developer:** the owner builds it as a developer. Frontend React, backend Java Spring Boot, database MySQL. Frontend first on mock data, backend after.

---

## 2. Architecture decisions

- **One app, one login page, one database.** Not four separate portals. The user's role decides which area and screens they see.
- **Frontend:** React 19 + TypeScript + Vite, react-router-dom, react-icons (Lucide set, `react-icons/lu`), PWA via vite-plugin-pwa, plain CSS with design tokens. Add TanStack Query in Week 2.
- **Backend (Phase 1+, separate repo):** Spring Boot modular monolith (one deployable, one package per module, not microservices). Spring Web, Security, Data JPA, Validation. JWT access token (short-lived, kept in memory in the browser) + refresh token in an httpOnly cookie. BCrypt password hashing. MySQL 8 with Flyway migrations. Spring WebSocket for chat (polling acceptable in Phase 1). Spring events + scheduled jobs for automation, Quartz when rules must survive restarts. Spring Mail via a transactional email service. Server-side PDF for invoices and reports. Files on local disk in dev, S3-compatible storage in production with signed expiring links.
- **API contract:** `docs/api/openapi.yaml` is the single source of truth between frontend and backend. Generate TypeScript types and Spring controller interfaces from it so the two sides cannot drift. Errors use RFC 9457 ProblemDetail.
- **Security model:** MySQL has no row-level security, so the Spring Boot service layer must check the role on every endpoint and filter every query by the caller's `organisationId`. React hiding something is never security.
- **Tests:** JUnit + Testcontainers (MySQL) for backend; access-rule tests are mandatory. Playwright smoke tests with three logins (admin, Client A, Client B).
- **Delivery:** Docker Compose locally; GitHub Actions to build and deploy; code in a private GitHub repo.

---

## 3. Roles and access

| Role | Area | Who | Account created by | Sees |
| --- | --- | --- | --- | --- |
| SUPER_ADMIN | admin | Owner + one backup owner | First accounts | Everything: finance, settings, audit log, cost rates |
| MANAGER | admin | Ops head, account directors | Admin | All projects in their teams; approves within a money limit; no payroll, finance, automation or system settings |
| EMPLOYEE | employee | Staff: SEO, social, design, content, ads, development, PR | Admin | Assigned projects and tasks, own performance |
| CLIENT_OWNER | client | Client's main contact | Admin invite link | Own company's projects, reports, invoices; invites representatives |
| CLIENT_REP | client | Client's team members | Client Owner invites, admin approves | Only projects they are added to; no billing unless granted |
| INFLUENCER | influencer | Creators | Self sign-up, admin verifies | Own profile, campaign invites, payouts |
| PARTNER | partner | PR contacts, vendors, freelancers | Admin invite | Only briefs and tasks shared with them, own invoices |

**Permission matrix**

| Module | Admin | Manager | Employee | Client | Influencer | Partner |
| --- | --- | --- | --- | --- | --- | --- |
| Projects and tasks | Full | Team | Assigned | Own, read and approve | None | Shared tasks |
| Chat | All | Team | Assigned channels | Own projects | Campaign threads | Shared threads |
| Files and approvals | Full | Team | Assigned | Client-visible only | Own submissions | Own submissions |
| Invoices and payments | Full | View team | None | Own | Own payouts | Own invoices |
| Reports and analytics | Full | Team | Own scorecard | Own results | Own campaign results | None |
| Influencer directory | Full | Full | Read | Read, contacts hidden | Own profile | None |
| PR and data hub | Full | Full | Read, no export | None | None | None |
| Employee performance | Full | Team | Own | None | None | None |
| Users, roles, settings | Full | None | None | Own representatives | None | None |
| Automation rules, audit log | Full | Read | None | None | None | None |

**Access rules**
- Admin issues every login: enters name, email, role; system emails an invite link; user sets their own password. Admin never sees passwords; can suspend, reset, force logout.
- Every comment, file and task has a visibility flag: internal or client-visible. Default internal.
- Roles and permissions stored as data so new roles (Finance, Intern) can be added later.
- Two Super Admins from day one.
- Two-step login for Super Admin and Manager.

---

## 4. Feature catalogue by portal

Phase numbers refer to backend phases (section 9). Every screen already exists in the Phase 0 React prototype.

### 4.1 Client portal
| Module | What it does | Phase |
| --- | --- | --- |
| Dashboard | Active projects with progress and next milestone; "waiting on you" (approvals, unpaid invoices); results headline; account manager card; one offer banner | 1 |
| Projects | Scope, milestone timeline, deliverables with status, team, activity feed. Clients see milestones and deliverables, never internal tasks | 1 |
| Approvals | Approve or request changes on creatives, copy, calendars; comments pinned to the asset; revision counter vs contract limit | 1 |
| Chat and support | One channel per project with the account manager; issues become tickets with a response-time clock; business hours shown | 1 |
| Files and brand vault | Brand kit, final deliverables, version history, expiring download links | 1 |
| Billing | Accept quotes and contracts online, GST invoices, pay link, receipts, history, renewal dates | 1 manual, 2 online payment |
| Team | Client Owner invites representatives and controls billing visibility | 1 |
| Onboarding checklist | Brand questionnaire, goals, competitors, access handover status for social/ads/analytics | 2 |
| Results and reports | KPIs per service (SEO, social, ads, website); monthly report page + PDF | 2 |
| Content calendar | Planned and published posts; approve in place | 2 |
| Service requests | Brief form → quote → project | 2 |
| Meetings | Book a call from the manager's free slots; notes and action items saved | 2 |
| Feedback | One-tap rating per milestone; quarterly recommend score; good scores trigger testimonial and referral request | 2 |
| Offers | Admin-managed banner slot targeted at services the client doesn't buy; a click creates a lead | 3 |
| Influencer marketplace | Browse verified influencers, shortlist, request collaboration through the agency; contacts hidden | 3 |
| AI assistant | Answers status questions from live data, hands over to the account manager when unsure | 4 |

Decisions: chat goes to the project owner, then backup, then manager if unanswered past the response time. Never store client passwords; use partner/role access in Meta Business, Google Ads, Analytics and record only "access granted". One modest dismissible offer slot. Reports start as manual entry; live Google/Meta data in Phase 4.

### 4.2 Employee portal
| Module | What it does | Phase |
| --- | --- | --- |
| My day | Today's tasks, this week, unread client messages, announcements | 1 |
| Tasks and projects | Board and list, subtasks, checklists, priority, due date, dependencies, brief and files | 1 |
| Internal review | Work goes to a reviewer before the client sees it | 1 |
| Chat | Team, project and client channels; staff join client channels only when assigned; internal-note mode | 1 |
| Time tracking | Timer or manual entry, billable flag, weekly timesheet | 2 |
| My performance | On-time rate, turnaround, revision rate, client ratings, hours vs capacity, goals | 2 |
| Workload view | Assigned hours per person per week | 2 |
| Attendance and leave | Check-in, leave request and approval, holidays; approved leave flags affected tasks | 2 |
| Knowledge base | SOPs, templates, checklists, onboarding lessons | 2 |
| Auto daily report | Compiled from tasks moved and time logged | 2 |
| Announcements and recognition | Notices, peer kudos | 3 |
| Expenses and payslips | Expense claims with bill photo, payslips | 3 |
| Joining and exit | Joiner checklist; exit revokes access and lists tasks to reassign | 3 |

Decisions: client contact is permission-based. Measure outcomes, not keystrokes (no screenshot tracking). Every task belongs to a project, every project to a client (internal work under an "Internal" client).

### 4.3 Influencer portal
| Module | What it does | Phase |
| --- | --- | --- |
| Sign-up | Email/phone verification, terms, consent to share profile with clients | 3 |
| Profile | Niche, languages, city, platforms and handles, followers, engagement rate, audience split, rate card, past work, availability | 3 |
| Verification | Admin review with insight screenshots; verified badge; unverified hidden from clients | 3 |
| Discovery (client/staff) | Filter by niche, city, platform, tier, price, engagement; shortlist and compare | 3 |
| Campaign flow | Brief → invite → accept/counter → agreement → draft → approval → live link → proof → payout | 3 |
| Messaging | Campaign thread; phone and email masked | 3 |
| Payouts | Encrypted bank/UPI details, payout request after proof, statement | 3 |
| Ratings | Client and agency ratings feed discovery ranking | 3 |
| Product shipments | Barter address, courier tracking | 4 |
| Tracked links and codes | Unique link or coupon per influencer | 4 |

Decisions: agency stays in the middle (no direct client–influencer contact; non-bypass clause). Check fake followers via engagement vs followers and audience screenshots. Paid posts need disclosure per India's ASCI influencer guidelines (confirm wording with a lawyer). TDS may apply to payouts including barter (confirm with CA); build the deduction field from the start.

### 4.4 PR and data hub (internal, plus Partner logins)
| Module | What it holds | Phase |
| --- | --- | --- |
| Media contacts | Journalists, editors, bloggers: outlet, beat, city, language, last contacted, who knows them | 3 |
| Pitch tracker | Release, recipients, status, follow-up date | 3 |
| Coverage log | Published links by client; feeds client results | 3 |
| Vendor and freelancer directory | Rates, rating, documents, past jobs | 3 |
| Partner login | Sees shared briefs only, uploads work, submits invoice | 3 |
| Prospect and lead data | Source, consent status, do-not-contact flag | 3 |
| Asset library | Case studies, decks, proposal templates | 3 |

Decisions: bulk export admin-only and logged. Owner + last-verified date per record; stale after six months. Duplicate check on email and phone. Consent recorded per contact (DPDP Act). Open question: owner hasn't confirmed this is internal-only rather than a public portal.

### 4.5 Admin command centre
| Module | What it controls | Phase |
| --- | --- | --- |
| Overview | Revenue, recurring revenue, unpaid invoices, project health mix, overdue tasks, team load, satisfaction, pipeline, "waiting on you" | 1 basic, 2 full |
| Users and access | Create/invite users, roles, suspend, reset, force logout, login history, 2FA for admins/managers | 1 |
| Clients | Profile, contacts, contracts, services, health score, history | 1 |
| Project control | All projects; assign teams; owner + backup; budget hours; health | 1 |
| Finance | Quotes, GST invoices, recurring billing, payments, expenses, payouts, profit per project/client, CA export | 1 invoices, 2 rest |
| Sales pipeline (CRM) | Leads from website form, offer clicks, referrals; won deal creates client + project | 2 |
| Service catalogue and templates | Each service: price, timeline, task list with roles; one click → project | 2 |
| People | Departments, attendance, leave approvals, scorecards, reviews, payroll inputs | 2 |
| Reports | Scheduled reports for owner and clients; PDF and spreadsheet export | 2 |
| Influencer and partner moderation | Approve profiles, campaigns, payouts | 3 |
| Offers and announcements | Banner slots, targeting, dates, click counts | 3 |
| Automation rules | Trigger → condition → action; on/off/draft-for-review | 4 |
| Deputy mode | Hand approval rights to a manager for a date range within a money limit | 4 |
| Settings | Branding, business hours, response times, approval limits, tax rates, templates | 1+ |
| Audit log | Who did what and when; append-only | 1 |
| View as user | Admin sees exactly what a client or employee sees; logged | 2 |

Decisions: templates are the engine of automation (write them before Phase 2). Health is a rule: amber = any task overdue or approval pending > 5 days; red = milestone missed, invoice 15 days late, or satisfaction ≤ 2. Money actions always need a human (refunds, discounts, payouts above limit, pausing a client).

---

## 5. Automation rules (Phase 4 engine, design now)

| # | Trigger | System action | Escalation |
| --- | --- | --- | --- |
| 1 | Enquiry from website form or offer click | Create lead, assign salesperson in rotation, send acknowledgement | Follow-ups day 1, 3, 7; unassigned alerts manager |
| 2 | Client accepts quote | Create client account, send invite, issue agreement and advance invoice | Reminders day 2 and 5 |
| 3 | Advance payment recorded | Create project from service template, assign by role and load, send onboarding checklist | Manager alerted if no capacity |
| 4 | Task due in 24 h | Remind assignee | Overdue → manager; 48 h overdue → project amber |
| 5 | Deliverable marked done | Send to internal reviewer | Review pending 24 h → reviewer then manager |
| 6 | Reviewer passes | Put in client approval queue, notify client | Reminder 48 h; 5 days → "call the client" task |
| 7 | Client requests changes | Reopen task with comments, revision counter +1 | At limit → account manager discusses extra charges |
| 8 | Client message arrives | Notify channel owner | Past response time → backup → manager |
| 9 | First of month | Generate and send recurring invoices | Reminders 3 days before, on due date, 3 and 7 days after |
| 10 | Invoice 15 days overdue | Prepare "pause work" decision for admin/deputy | A person decides |
| 11 | Month end | Compile client reports; manager reviews; publish | Missing numbers → tasks for responsible employee |
| 12 | Milestone completed | Send one-tap rating | Score ≤ 3 → manager alert + recovery task |
| 13 | Leave approved | List affected tasks, propose reassignment | Manager confirms |
| 14 | Project hours at 80% of budget | Alert owner | 100% → manager decides extra billing |
| 15 | Contract ends in 30 days | Renewal task + renewal offer to client | Weekly reminder |
| 16 | Influencer submits profile/content | Validate, queue for verification/approval | Queue > 3 days → moderator alert |
| 17 | Influencer posts with proof | Create payout request | Within limit → deputy; above → owner |
| 18 | Daily | Morning owner digest + employee task lists; nightly backup and health check | Failure → alert two people |

Safety: deputy with money limit; every client-facing rule starts in draft-for-review mode for a month; per-rule kill switch and run log. Never automate refunds, discounts, contract changes, pausing work, removing users, payouts above limit.

---

## 6. Performance measures

| Area | Measure | Calculation |
| --- | --- | --- |
| Revenue | Monthly recurring revenue | Sum of active retainers |
| Revenue | By service and client | Paid invoices grouped |
| Revenue | Outstanding, days to collect | Unpaid total; avg invoice → payment days |
| Revenue | Pipeline value, win rate | Open quotes; won ÷ closed |
| Profit | Project margin | Invoice − (hours × cost rate) − direct costs |
| Profit | Client lifetime value | Total paid; months retained |
| Projects | On-time delivery | Milestones met on time % |
| Projects | Revision rounds | Avg change requests per deliverable |
| Projects | Health mix | Green / amber / red counts |
| Employees | On-time task rate | Closed by due ÷ due |
| Employees | Utilisation | Billable ÷ available hours |
| Employees | First-pass quality | Passed internal review without rework |
| Employees | Client rating | Avg milestone rating on their projects |
| Employees | Response time | Median first reply in client channels |
| Clients | Satisfaction, recommend score | Ratings; quarterly survey |
| Clients | Approval speed | Avg days to approve |
| Clients | Churn | Lost ÷ clients at period start |
| Influencers | Reliability | Posts live on agreed date % |
| Influencers | Cost per engagement | Fee ÷ engagements |
| Portal | Adoption | Share of users logged in this week |

Rules: read employee measures together; stop the employee clock while waiting on client approval; cost rate visible to Super Admin only; save monthly snapshots.

---

## 7. Data model (≈55 tables, 10 groups)

| Group | Tables |
| --- | --- |
| People and access | organisations, profiles (users), roles, role_permissions, client_members, sessions |
| Sales | leads, lead_activities, services, quotes, quote_items, contracts |
| Delivery | project_templates, template_tasks, projects, project_members, milestones, tasks, task_dependencies, time_entries |
| Approvals and files | deliverables, approvals, files, file_versions |
| Communication | conversations, conversation_members, messages, tickets, notifications |
| Finance | invoices, invoice_items, payments, expenses, payouts, tax_settings |
| Influencers | influencers, influencer_platforms, campaigns, campaign_influencers, submissions, ratings (bank details in a separate restricted table) |
| PR and partners | media_contacts, pitches, coverage, partners, assets |
| Growth | offers, offer_clicks, feedback, metric_entries, metric_snapshots |
| System | automation_rules, automation_runs, audit_log, settings |

Rules for every table: `organisation_id` column; `created_by`, `created_at`, `updated_at`; soft delete (archived flag); statuses as fixed enums. Each table = a JPA entity + Flyway migration. Invoices numbered in sequence (format `WEB/2026-27/0112`), never deleted, only cancelled. Messages carry an internal-note flag. Files are versioned, never overwritten.

---

## 8. Brand and UI

- Look of webinger.in: white pages, heavy black geometric headlines, one red accent from the logo, dark navy photography, lots of white space.
- Tokens (in `src/styles/tokens.css`): brand red `#D40000` (estimate — replace with exact logo colour), ink `#111111`, surface `#FFFFFF`, soft grey `#F5F5F5`, border `#E5E5E5`, navy `#0F1B33`, status green/amber/danger separate from brand red. Font Inter (700–800 headings, 400 body).
- Brand red only for primary buttons, active nav, key numbers. Errors use `--danger` with icon and text.
- One login page for all roles; influencers get a separate public sign-up page.
- Mobile: PWA installable; sidebar becomes bottom nav (4 items + More) under 900 px; tables collapse to cards using `data-label`; large tap targets; iPhone push works only after "Add to Home Screen".
- Logo in `src/components/Logo.tsx` is a placeholder wordmark until the owner supplies the logo file.

---

## 9. Roadmap

| Phase | Weeks | Ships | Gate |
| --- | --- | --- | --- |
| 0. Prototype (frontend first) | 1–8 | API contract, design system, every portal's screens on mock data, phone layouts | Owner, two staff and one friendly client click through every flow; screens signed off; Core API contract frozen |
| 1. Core (backend) | 9–16 | Spring Boot + MySQL; login, roles, org filter; users, clients, projects, tasks, internal review, approvals, chat, files, manual invoices, audit log; Core screens switched to real API | Two real clients + whole team use it for two weeks |
| 2. Operations | 17–22 | Time tracking, scorecards, workload, leave, pipeline, service templates, recurring invoices, online payment, client reports, push notifications | Spreadsheets and status meetings retired |
| 3. Marketplace | 23–28 | Influencer portal, campaigns, payouts, PR hub, partner logins, offers | One influencer campaign runs brief → payout in portal |
| 4. Autopilot | 29–34 | Automation rules, deputy mode, daily digest, AI assistant, live Google/Meta data | Owner away one week and nothing stalls |

Week estimates assume one or two developers with AI assistance.

---

## 10. Phase 0 week-by-week plan (React)

| Week | Scope | Status |
| --- | --- | --- |
| 1 | Scaffold, tokens, base components, API contract v0, mock layer, login, role routing, app shell, home dashboard per area | **Done** |
| 2 | Projects and tasks | **Done** |
| 3 | Approvals, review queue, client team, admin users & settings, password reset | **Done** |
| 4 | Messages and files | **Done** |
| 4b | Admin clients (pulled forward from Week 6) | **Done** |
| 5 | Finance, billing, client reports | Next |
| 6 | Sales pipeline, people, performance | |
| 7 | Influencer portal, partner portal, discovery | |
| 8 | Automation UI, knowledge base, polish, contract freeze | |

### Week 1 — Done
- Vite + React + TS project, PWA manifest, `@/` alias, `.env.example` (`VITE_API_MODE=mock|http`, `VITE_API_BASE_URL`, `VITE_MOCK_DELAY_MS`), dev proxy `/api` → `localhost:8080`.
- Tokens + global CSS; components in `src/components/ui`: Button, Card, Badge, Input, Progress, Avatar, Stat, PageHeader, EmptyState, ErrorState, PageSkeleton; helpers formatINR, formatDate, dueLabel, daysFromToday. Status badges in `src/components/status.tsx`.
- `docs/api/openapi.yaml` v0: `/auth/login`, `/auth/refresh`, `/auth/logout`, `/me`, `/dashboard/{admin|client|employee|influencer|partner}`.
- `src/types`: Role, Area, AREA_BY_ROLE, ROLE_LABEL, User, Session, dashboards, ApiError.
- `src/api/client.ts` (single backend gateway, mock vs http), `src/api/useApi.ts`, `src/api/mock/data.ts` + `handlers.ts` (enforce role + organisation rules).
- Auth context, `RequireArea` guard, `AppShell` (sidebar, phone bottom nav + More sheet, demo "View as" switcher), nav config per role in `src/layout/nav.ts`, Placeholder pages for future weeks (role-restricted ones show Not Found).
- Login with validation and demo account picker; dashboards for all five areas.
- Verified in a browser: all seven roles; Client Rep sees only their project and no billing; Manager blocked from Finance; client redirected away from /admin; desktop and 390 px phone.
- Not yet verified: `npm run build` with real dependencies.

Demo accounts (password `demo1234`; Super Admin and Manager also need the two-step code `123456`): admin@webinger.in (Super Admin), isha@webinger.in (second Super Admin), manager@webinger.in, priya@webinger.in (Employee), arjun@terrafoods.in (Client Owner, Terra Foods), neha@terrafoods.in (Client Rep), sameer@novaclinics.in (Client Owner, Nova Clinics), farah@sunriseretail.in (Client Owner, 40 projects), ananya@creator.in (Influencer), hello@lensworks.in (Partner). All names invented.

### Week 2 — Projects and tasks (Done, 2026-11-17)
What was built (spec below kept for reference):
- Contract v0.2.0: `GET /projects` (q, status, health, clientId, service, ownerId, zero-based page/size; returns `ProjectPage` with `facets` for filter choices), `GET /projects/{id}`, `GET /tasks` (mine, projectId, status), `GET /tasks/{id}`, `PATCH /tasks/{id}`, `PATCH /tasks/{id}/checklist/{itemId}` (added: ticking a checklist item), `POST /tasks/{id}/comments`.
- Rules now in the mock handlers (and the contract) that the backend must copy: records the caller can't see return 404, not 403; tasks are staff-only (403 for client, influencer, partner); clients never receive tasks, task counts, budget hours or INTERNAL activity; only the admin area changes assignee or due date; **internal review rule**: a `clientFacing` task can only move to With client / Done by its reviewer or the admin area (409 otherwise); every task change is written to project activity (INTERNAL), and "sent for your approval" also as CLIENT.
- TanStack Query: `src/api/queries.ts` (queryClient, `keys`, `useDashboard`, `useProjects`, `useProject`, `useTasks`, `useTask`, `useUpdateTask` with optimistic update + rollback, `useSetChecklistItem`, `useAddComment`). `useApi.ts` deleted. The cache is cleared on login/logout so "View as" never shows another user's data.
- Screens: `/admin/projects` (search, filters, pagination, all in the URL), `/admin/projects/:id` (internal tasks list/board, drawer with reassign + due date, budget hours), `/client/projects` (cards, status tabs, search when > 6), `/client/projects/:id` (milestone timeline, deliverables with Review link, team, client-visible activity), `/employee/tasks` (list grouped by due, kanban with drag-and-drop plus a "Move" select for touch/keyboard, "Assigned to me / I review" scope, `?task=id` opens the drawer). My day task titles link to the drawer.
- Shared components: `src/components/projects.jsx`, `src/components/tasks.jsx` (TaskDrawer, TaskBoard, TaskRow), new UI kit pieces (Select, SearchInput, Segmented, Pagination, Drawer), new badges in `status.jsx`, styles in `src/styles/work.css`.
- Mock data: 4 more staff, client **Sunrise Retail Group** with 40 generated projects (login farah@sunriseretail.in), milestones, deliverables, activity, 21 hand-written + generated tasks with checklists, files, comments.
- Verified: `npm run build` passes; 30 access-rule checks against the handlers pass; driven in headless Edge at 1366 px and 390 px (admin filters/pagination, optimistic move rolled back by the review rule, drag to Done, checklist, comment validation + visibility reset, client 404 on another company's project, rep sees 1 project, no horizontal scroll on phone).
- Note: components and pages are `.jsx` (not `.tsx`); types, API and mock layers are `.ts`. **Owner's standing rule: all new UI files stay `.jsx`.**

Original spec:
- Contract: `GET /projects` (filter status, health, client, service, owner; paginated), `GET /projects/{id}` (milestones, deliverables, team, activity), `GET /tasks` (mine, by project, by status), `GET /tasks/{id}`, `PATCH /tasks/{id}` (status, assignee, due), `POST /tasks/{id}/comments`.
- Install `@tanstack/react-query`; replace `useApi` with queries and mutations; optimistic task status updates.
- Admin `/admin/projects`: searchable, filterable table (health, service, owner), progress, health badge; `/admin/projects/:id` detail with internal tasks.
- Client `/client/projects` + `/client/projects/:id`: cards, milestone timeline, deliverables, team, activity feed; never internal tasks.
- Employee `/employee/tasks`: list + kanban (To do, In progress, In review, With client, Done), filters, task detail drawer with checklist, files list, comments with internal / client-visible toggle.
- Mock data: milestones, deliverables, activity, more tasks.

### Week 3 — Approvals, users, settings (Done, 2026-11-17)
What was built (spec below kept for reference):
- Contract v0.3.0 (38 paths): `POST /auth/mfa/verify`, `GET /auth/invites/{token}`, `POST /auth/invites/{token}/accept`, `POST /auth/password/forgot` (always 202), `POST /auth/password/reset`; `POST /tasks/{id}/review`; `GET /approvals`, `GET /approvals/{id}`, `POST /approvals/{id}/decision`, `POST /approvals/{id}/comments`; `GET /client/team`, `POST /client/team/invites`, `PATCH /client/team/{id}`; `GET /admin/users`, `POST /admin/users/invites`, `POST /admin/users/{id}/approve|suspend|reactivate|reset|logout`, `GET /admin/organisations`, `GET /admin/login-history`; `GET/PUT /settings`. `/auth/login` now returns a Session **or** an MfaChallenge.
- Mock split into modules: `handlers.ts` (projects, tasks, review, shared rule helpers), `approvals.ts`, `accounts.ts` (sign-in, sessions, invites/resets, admin users, client team, settings, demo outbox), `art.ts` (SVG placeholder artwork).
- Rules the backend must copy (all marked `BACKEND:` in the mock):
  - Every request re-checks the account: suspended, or session issued before `sessionsRevokedAt` → 401. Force logout, suspension and password reset all revoke sessions.
  - Login: same 401 for unknown email and wrong password; 5 failures in 15 min → 429; suspended + right password → 403; SUPER_ADMIN/MANAGER always get a two-step challenge (token single use, 5 min).
  - Invite links 7 days, reset links 30 min, both single use (410 after). Password: 8+ chars with a letter and a number. Forgot-password never reveals whether an email exists.
  - Users/settings: SUPER_ADMIN only. Cannot suspend yourself or the last active Super Admin. Role must match organisation kind. Admin never sees or sets passwords.
  - Client team: CLIENT_OWNER only, own organisation only; reps invited by the owner wait in PENDING_APPROVAL until a Super Admin approves; billing visibility is a `BILLING_VIEW` permission on the user (owners always, reps when granted). Nav items can now require a `permission` as well as `roles`.
  - Internal review: only the named reviewer or admin area; task must be IN_REVIEW; FAIL needs a note and counts a rework (`reviewFailures`). PASS on client-facing work goes through `sendToClient`, which creates the deliverable/approval and a new version; any move to "With client" uses the same path.
  - Approvals: only client roles decide; only the latest version of a PENDING approval; request changes needs a note, adds a revision, reopens the linked task with the client's note; going past the contract limit is allowed but logged INTERNAL for the project owner (automation rule 7). Pins only on the latest version.
- Screens: `/client/approvals` (+ `/:id` viewer with page thumbnails, numbered pins placed by clicking, version history, decide panel with revision-limit warning), `/employee/review` (queue + panel; stacked on phones), `/client/team`, `/admin/settings` (Users with pending-approval card, invite drawer, inline-confirmed suspend/sign-out; Login history; Business settings with validation and sticky save bar), `/login` (two-step step, forgot link, "why you were signed out" notice), `/forgot-password`, `/reset-password`, `/accept-invite`. Real pages are wrapped in a role/permission guard in `App.jsx`.
- Prototype aids: a **demo inbox** (`api.demo.outbox`, `DemoEmail` component) shows the email the system would have sent so invite/reset links can be opened; "View as" fills the two-step code itself.
- Verified: build passes; 68 new + 30 Week 2 access-rule checks pass; 40 browser checks in headless Edge (two-step, approve rep, invite → accept → signed in, suspend, settings validation/save, manager blocked, review send-back, pin + approve, team invite + billing grant reflected in the rep's nav, over-limit warning, forgot → reset → old password refused, phone layouts without horizontal scroll); Week 2 browser checks still pass.
- Known limits: data lives in each tab's memory, so a forced logout only shows in the same tab; a session ended elsewhere is noticed on the next API call (cached screens can show up to 30 s longer). Phase 1: admins/managers set up two-step during invite acceptance.

Original spec:
- Client `/client/approvals`: queue, asset viewer (image/PDF), pinned comments, approve / request changes, revision counter vs limit, version history.
- Employee `/employee/review`: internal review pass/fail with notes.
- Client `/client/team` (owner only): invite representative, choose projects, billing visibility.
- Admin `/admin/settings`: users list, invite user (name, email, role, organisation), suspend, reset, force logout, login history; business hours, response times, approval limits.
- Auth screens: accept invite + set password, forgot password, reset password, 2FA prompt mock.

### Week 4 — Messages and files (Done, 2026-11-17)
What was built (spec below kept for reference):
- Contract v0.4.0 (49 paths): `GET /conversations`, `GET|POST /conversations/{id}/messages` (`after` cursor for catch-up), `POST /conversations/{id}/read`, `POST /messages/{id}/ticket`, `GET /tickets`, `PATCH /tickets/{id}`, `GET /availability`, `POST /uploads` (multipart), `GET /files`, `GET /files/{id}`, `POST /files/{id}/link`.
- Mock modules: `chat.ts` (channels, messages, receipts, uploads, tickets, availability, dashboard previews), `files.ts` (vault + deliverables + signed links), `hours.ts` (business-hours maths in IST), `data4.ts` (seed). The old static `messages` list is gone; dashboards now read real chat data.
- Live updates: `src/api/realtime.ts` is the only place that knows the transport. It polls every 4 s (inbox every 10 s), pauses while the tab is hidden, and emits `created` / `updated` events. Phase 1 swaps its body for a Spring WebSocket (STOMP) client: `/topic/conversations/{id}` and `/user/queue/inbox`, same event shapes.
- Rules the backend must copy (all marked `BACKEND:` in the mock):
  - One channel per project (with the client) plus a staff-only team channel. Employees see a project channel only when assigned to the project; admin area sees all; clients per project visibility (reps only their projects).
  - Internal notes are staff-only to write and are filtered out of every client response (messages, previews, last-message line).
  - Uploads: images, PDF, Office, CSV, TXT, ZIP up to 10 MB; an upload can be attached once, only by its uploader; max 5 per message.
  - Tickets: staff turn a public client message into a ticket (once per message). Clocks start at the client's message and count business hours only (Settings → response times). A public staff reply stops the first-reply clock. Assigned to the project owner. Clients see their own tickets as read-only "requests".
  - "Awaiting reply" clock on a channel (staff only) when the last public message is from the client.
  - Files: clients see their company's CLIENT-visible vault files and deliverables of projects they can see; internal working files stay hidden. Deliverables are approvals with status APPROVED (approving in Week 3 adds the file). Download links are signed, per version, and expire after 5 minutes (410 after).
- Screens: one `MessagesPage` for admin, employee and client (`/x/messages`, `?c=` opens a chat, `?tab=tickets`): conversation list with search, unread counts, reply clocks; thread with day separators, internal-note styling, image/file attachments, read receipts ("Seen by …"), "Make ticket"; composer with attach, Enter to send, and for staff an **Internal note / Reply to client** switch that **defaults to Internal note** (portal rule: everything defaults internal). Tickets tab with status, owner ("Take it"), first-reply and resolve clocks. Client sees a business-hours banner (offline variant out of hours). `/client/files`: folder tabs, preview cards, drawer with version history and a download link with a live 5-minute countdown.
- Prototype aids: the other side "reads" a new client/agency message after ~5 s so receipts and polling can be seen in one tab (`simulateOtherSide` in `chat.ts`; delete with the real API). Downloads in the demo are the SVG preview or a short text note.
- Verified: build passes; 60 new + 98 earlier access-rule checks pass; 36 Week 4 browser checks in headless Edge (client sees no internal notes or other company channels, send with Enter, receipt arrives by polling, image upload and rejected .exe, files without internal file, version history, real download, employee channel limits, internal-note default, make ticket, reply stops the clocks, resolve ticket, admin search across 46 channels, phone list ↔ thread, no horizontal scroll); Week 2 and Week 3 browser suites still pass.
- Fixed along the way: tab strips (Segmented) could widen the whole page on phones; page sections now shrink (`.page > * { min-width: 0 }`) and tab strips scroll sideways.
- Known limits: chat attachments from seed data (non-images) are display-only in the demo; employees have no files page yet (clients only, as planned).

Original spec:
- Messages for client, employee, admin: conversation list per project, thread view, attachments, read receipts, internal-note mode (staff only), convert message to ticket, ticket list with response-time clock, business-hours banner.
- Mock real-time with polling; design so Spring WebSocket drops in later.
- Client `/client/files`: brand vault (logos, fonts, guidelines), deliverables, version history, download with expiring link.

### Admin clients — pulled forward from Week 6 (Done, 2026-11-17)
Why early: the nav had Clients tagged "Week 2" while the plan put it in Week 6, so the menu showed a placeholder that looked forgotten. Built before Week 5 because finance (invoices, GST, profit per client) needs real client records to hang off. Branch `addmin-clients`.
- Contract v0.4.1 (53 paths): `GET /clients` (q, status, health, accountManagerId), `POST /clients`, `GET /clients/account-managers`, `GET|PATCH /clients/{id}`, `POST /clients/{id}/notes`. A client's id is its `organisationId`.
- Mock module `src/api/mock/clients.ts`: client profile rows (legal name, GSTIN, industry, city, address, status, account manager + backup, satisfaction, lifetime value, contracts, stored history), seeded for Terra, Nova, Sunrise and a former client **Bluepeak Fitness** (ENDED, no logins, added to `ORG` / `organisations`).
- Rules the backend must copy (all marked `BACKEND:`):
  - `/clients` is SUPER_ADMIN and MANAGER only (403 for everyone else; unknown id 404). Phase 1: managers see only clients of their teams.
  - Creating a client is SUPER_ADMIN only because it issues a login: one transaction creates the organisation (CLIENT), the profile (ONBOARDING), the CLIENT_OWNER account (INVITED) and the 7-day invite email. Duplicate company name or existing email → 409. GSTIN validated (15-char format).
  - Changing status (Onboarding / Active / Paused / Ended) is SUPER_ADMIN only; managers may edit the rest. Account manager and backup must be active agency staff and different people. Every change and status move is written to the client history; notes are staff-only (clients never see their record).
  - `lifetimeValue` (paid to date) is SUPER_ADMIN only; managers get retainer and outstanding (matrix: invoices "view team").
  - **Health rule** = section 4.5 applied per client over live work: AMBER when a task on an active project is overdue or an approval waits > 5 days; RED when a milestone is missed, an invoice is 15+ days late, or satisfaction ≤ 2. `healthScore` = 100 − factor penalties (overdue tasks 5 each max 20, slow approvals 10 each max 20, missed milestones 15 each max 30, invoice 15+ days 25 / under 15 days 5, satisfaction ≤ 2 25 / < 3.5 10). The score only ranks; the colour always follows the rule.
  - Contracts: ENDING_SOON within 30 days of the end date (automation rule 15). Monthly retainer = running RETAINER contracts only.
  - The client dashboard's account-manager card now reads the client record (`accountManagerOf`), so reassigning in admin changes what the client sees.
- Screens: `/admin/clients` (summary cards, search + status/health/manager filters in the URL, table → cards on phones, "Add client" drawer for Super Admin that lands on the new record with the demo invite email), `/admin/clients/:id` (facts strip, health card with each factor and its penalty, profile, projects capped at the 8 most at risk with a link to Projects filtered by client, contacts with account status and billing access, contracts, history with internal notes, edit drawer with status locked for managers).
- Verified: build + typecheck pass; 72 new + 158 earlier access-rule checks pass; 31 browser checks in headless Edge (real page not placeholder, filters/search, Nova late-invoice factor, note, GSTIN validation, reassign manager → history, add client → invite → new owner signs in and sees no other company's projects, manager has no Add/paid-to-date/status, employee kept out, phone layouts without horizontal scroll); Week 2, 3 and 4 browser suites still pass.
- Note for the owner: by this rule all three live demo clients are red (Terra: homepage sign-off milestone passed; Nova: invoice 17 days late; Sunrise: missed store milestones). Project health on `/admin/projects` is still a stored value, not computed by the rule, so a project can say "Needs attention" while its client is red. Compute project health from the same rule in Phase 1.
- Not built yet: adding contracts (Week 5 finance: accepted quote → contract), client logo/brand fields, export.

### Week 5 — Finance and reports
- Admin `/admin/finance` (Super Admin only): quotes, invoices (GST fields, sequence numbering), payments, expenses, outstanding, profit per project and client, CA export.
- Client `/client/billing` (owner): invoices, pay button (mock), receipts, quotes and contracts to accept.
- Client `/client/reports`: KPIs per service, month picker, print/PDF-friendly layout.
- Admin metric entry screen for monthly client results.

### Week 6 — Pipeline, people, performance
- Admin `/admin/pipeline`: kanban stages, lead detail, activities, convert won deal to client + project.
- ~~Admin `/admin/clients` list + detail with health score.~~ Done early (see "Admin clients" above).
- Admin `/admin/people`: departments, attendance, leave approvals, workload view, scorecards.
- Employee `/employee/performance` and `/employee/leave`; time tracking timer and weekly timesheet.

### Week 7 — Influencers and partners
- Public influencer sign-up page + profile wizard.
- Influencer `/influencer/campaigns`, `/influencer/profile`, `/influencer/payouts`.
- Admin `/admin/influencers`: verification queue, campaigns, payout approvals.
- Client `/client/influencers`: discovery filters, shortlist, compare, collaboration request (contacts masked).
- Partner `/partner/briefs` and `/partner/invoices`; admin PR hub screens (media contacts, pitches, coverage, vendors).
- Client offers banner management in admin.

### Week 8 — Automation UI and polish
- Admin `/admin/automation`: rule list (the 18 rules), trigger/condition/action editor, on/off/draft mode, run log, deputy mode settings.
- Employee `/employee/knowledge`; onboarding checklist for clients; service catalogue and templates editor.
- Accessibility pass, empty/error states everywhere, phone review of every screen, performance check.
- Freeze Core API contract; write backend handover notes per module.

---

## 11. Frontend-first rules
1. Data model and API contract before the first screen of each module.
2. All data through `src/api/client.ts`; switching mock → real is one setting.
3. Mock awkward cases: slow responses, errors, empty lists, a client with 1 project and one with 40.
4. The "View as" role switcher is a demo aid, not security.
5. Go deep on Core screens; later-phase screens can stay shallow until just before their backend phase.
6. Label the prototype as a demo; data resets and nothing is saved.
7. One module per AI session; commit when it works.
8. Freeze the contract per module at each gate; later changes go in a change log (date, what, why).

## 12. Coding conventions
1. New data → `docs/api/openapi.yaml` → `src/types` → mock handler in `src/api/mock/handlers.ts` → method on `api` in `src/api/client.ts` → screen.
2. Components call `api.*` only, never `fetch`.
3. Mock handlers enforce the real access rules (role check, `organisationId` filter, CLIENT_REP project membership and no billing). Comment the backend rule.
4. Every screen handles loading (`PageSkeleton`), error (`ErrorState` with retry), empty (`EmptyState`).
5. Mobile-first; test at 390 px. Tables use `data-label` on each `td`.
6. Use tokens only; brand red never for errors.
7. Mock names and companies are invented; mock dates relative to today via `day(offset)`.
8. Money in INR via `formatINR`; dates via `formatDate` / `dueLabel`.
9. New page: add to `NAV` in `src/layout/nav.ts` (with `week` and optional `roles` / `permission`), then register the real component in `PAGES` (or `DETAIL_ROUTES`) in `App.jsx`. New UI files are `.jsx`.
10. Never put tokens in localStorage. Never send real client data to tools whose free projects are public.

## 13. Project structure
```
docs/api/openapi.yaml      contract shared with the Spring Boot backend
src/api/client.ts          only place that talks to a backend
src/api/queries.ts         TanStack Query client, cache keys, hooks (reads + mutations)
src/api/mock/              fake data + handlers (reference for backend access rules):
                           handlers.ts, approvals.ts, accounts.ts, chat.ts, files.ts,
                           clients.ts, hours.ts, data.ts, data4.ts, art.ts
src/auth/                  AuthContext, RequireArea guard
src/components/ui/         base components and format helpers
src/components/status.jsx  health, task, project, deliverable, priority, visibility badges
src/components/projects.jsx milestone timeline, deliverables, team, activity feed
src/components/tasks.jsx   task drawer, kanban board, task rows
src/components/approvals.jsx asset viewer with pins, revision meter, approval badge
src/components/auth.jsx    auth layout, new-password fields, demo inbox
src/components/chat.jsx    conversation list, thread, composer, response clock, hours banner
src/api/realtime.ts        live-update transport (polling now, WebSocket in Phase 1)
src/pages/shared/          screens shared by several areas (MessagesPage)
src/components/Logo.jsx    placeholder wordmark
src/layout/                AppShell, nav per role, shell.css
src/pages/<area>/          screens per portal area
src/styles/                tokens.css, global.css, work.css (Week 2), week3.css, week4.css, clients.css
```

---

## 14. Security, reliability, compliance
- Role + organisation checks on every API call, proven by automated tests with two client accounts.
- Server-side validation of all input; BCrypt; short-lived access tokens; refresh token httpOnly cookie; logout revokes.
- Invite-only accounts except influencer sign-up (email verification, bot check, rate limits).
- 2FA for Super Admin and Manager.
- Bank/UPI details encrypted, masked, finance/admin only.
- Private files via short-lived signed links.
- Bulk export admin-only and logged.
- Nightly mysqldump to storage outside the server; monthly restore test; uptime monitor alerting two people; staging + production environments; schema changes only through Flyway; append-only audit log.
- Two Super Admins; one-page runbook; all accounts on a company email.
- India: privacy policy, consent at sign-up, data deletion on request (DPDP Act); GST invoices; TDS on influencer payouts; ASCI disclosure. One review each by a CA and a lawyer.
- Security review by a second developer before go-live.

## 15. Hosting and environments
- Now (Phase 0, mock data): auto-deploy the frontend to Cloudflare Pages from GitHub on every push (free, commercial use allowed, ~500 builds/month, preview URL per pull request). Build `npm run build`, output `dist`, env `VITE_API_MODE=mock`. Optionally protect with Cloudflare Access so only the owner's brother/reviewers can open it. Quick live demos: `cloudflared tunnel --url http://localhost:5173`.
- Phase 1+: staging (UAT) from a `develop` branch — staging frontend + staging Spring Boot + staging MySQL (e.g. Oracle Cloud Always Free VM: 2 Arm cores, 12 GB, card required, idle instances reclaimed). Production from `main` only.
- Before real client data: small paid VPS (~$5–10/month) for backend + MySQL with daily backups.

## 16. Risks and fixes
| Problem | Fix |
| --- | --- |
| Build collapses as AI loses track | One module per session; commit after each working step; no full rewrites |
| Free AI credits run out | Precise spec + contract first; hand-write what AI keeps getting wrong; budget one paid month if needed |
| One client sees another's data | Org filter in every query + automated two-client tests on every build |
| Clients keep using WhatsApp | Approvals and payments only in portal; alerts link back into it; onboarding call |
| Employees don't update tasks | Uploading the deliverable closes the task; auto daily reports |
| Endless feature creep | Backlog with priorities; nothing enters a phase after it starts |
| Clients and influencers bypass agency | Masked contacts, in-portal chat and payments, non-bypass clauses |
| Fake influencers | Manual verification, engagement checks, ratings |
| Automation sends wrong thing | Draft-for-review first, kill switch, run log |
| Scorecards demotivate or get gamed | Paired measures, client-delay clock stop, staff see own data |
| Server down or data lost | Uptime monitor, nightly dump to second location, monthly restore test |
| Tool shuts down or reprices | Code in GitHub, mainstream stack |
| Late payments | Advance billing, reminders, pause clause, human decision at 15 days |
| Midnight reply expectations | Business hours, response times, AI assistant out of hours |
| Compliance gaps | GST, TDS, DPDP, ASCI fields from the start; CA + lawyer review |
| Everything stops when owner is away | Deputy with limits, second Super Admin, runbook, daily digest |
| Staff resist measurement | Launch workload view first, scorecards a month later |
| Disk fills with files | Compress images, link large videos, archive closed projects |
| Prototype mistaken for product | Demo label, data resets, roadmap shown beside it |
| Frontend and backend drift | One OpenAPI contract generates both; freeze per module |
| Free Java hosting doesn't last | Laptop for dev, free VM for pilot, paid VPS before client data |

## 17. Open decisions (owner)
- [ ] PR and data hub: internal only, or also partner/vendor/PR logins? (assumed internal + optional partner logins)
- [ ] Deputy: who, and approval money limit
- [ ] Service list with standard tasks, roles, timelines (needed for templates and automation)
- [ ] Logo file and exact brand red
- [ ] Which AI tool generates React screens and which component library (currently plain CSS)
- [ ] Chat policy: fully in portal, or WhatsApp for alerts only
- [ ] Payment gateway account (e.g. Razorpay) — start KYC early
- [ ] CA review (GST invoice format, TDS) and lawyer review (privacy policy, agreements)

## 18. Current state and next action
- Weeks 1–4 and Admin clients are done; `npm run build` passes. On a new machine: `npm install`, `cp .env.example .env`, `npm run dev`.
- Push to a private GitHub repo and connect Cloudflare Pages so reviewers see every push.
- Git workflow: one branch per week from an up-to-date `main` (e.g. `week-5-finance`), pull request into `main`, merge, then start the next week. Never stack a week on an unmerged branch.
- Week 5 can reuse: client records (`clients.ts`: legal name, GSTIN, address for GST invoices; contracts for recurring billing; `lifetimeValue` and `outstanding` should come from real invoices/payments), `files.ts` signed links for invoice PDFs, `hours.ts` for due dates, `DemoEmail` for invoice emails, ticket clocks for payment reminders.
- **Next: start Week 5 (finance, billing, client reports) as described in section 10.**
