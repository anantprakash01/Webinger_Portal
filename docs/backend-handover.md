# Backend handover notes (Phase 1)

For the developer building the Spring Boot backend. Generated on 2026-11-20 from `docs/api/openapi.yaml` (v1.0.0) and the `BACKEND:` comments in `src/api/mock/*.ts`; regenerate rather than edit by hand.

## How to use this

- The mock handlers are the reference implementation: each endpoint in the contract has a function with the same rules, and the prototype's automated checks exercise them. Port the rule, keep the status codes.
- Every rule below is enforced in the **service layer**, never only in React. MySQL has no row-level security: filter every query by the caller's `organisationId` and check the role first.
- Records of another organisation answer **404**, not 403, so ids cannot be probed. A role that may never use an endpoint gets **403**. Validation errors are **400**, state conflicts **409**, expired links **410**, too many attempts **429**. All errors use RFC 9457 ProblemDetail.
- Money is INR. Invoice numbers come from a per-financial-year counter locked in the same transaction (no gaps). Payout and bank details, PAN and tokens are stored encrypted; only masked values leave the API.
- Switching the app to the real API is one setting: `VITE_API_MODE=http` and `VITE_API_BASE_URL`. Screens never call `fetch`.

## Modules

| Module | Spring package | Endpoints | Tables (CLAUDE.md section 7) |
| --- | --- | --- | --- |
| Auth and accounts | `auth, users` | 23 | profiles (users), roles, role_permissions, client_members, sessions, settings, audit_log |
| Projects, tasks and review | `projects` | 13 | projects, project_members, milestones, tasks, task_dependencies, deliverables |
| Approvals | `approvals` | 4 | approvals, files, file_versions |
| Messages and files | `messaging, files` | 12 | conversations, conversation_members, messages, tickets, notifications, files, file_versions |
| Clients | `clients` | 6 | organisations, contracts (+ client profile columns) |
| Finance and billing | `finance` | 26 | quotes, quote_items, invoices, invoice_items, payments, expenses, tax_settings |
| Client reports | `reports` | 5 | metric_entries, metric_snapshots |
| Sales pipeline | `sales` | 6 | leads, lead_activities |
| People and time | `people` | 20 | attendance, leaves, time_entries (+ metric_snapshots for scorecards) |
| Creators | `influencers` | 28 | influencers, influencer_platforms, campaigns, campaign_influencers, submissions, ratings, payouts (bank details in a separate restricted table) |
| Partners and PR hub | `partners, pr` | 17 | partners, media_contacts, pitches, coverage, assets |
| Offers | `growth` | 5 | offers, offer_clicks |
| Automation | `automation` | 7 | automation_rules, automation_runs (+ settings for deputy limits) |
| Knowledge, services, onboarding | `ops` | 14 | articles, services, project_templates, template_tasks, onboarding_items |

## Auth and accounts

Mock: `src/api/mock/accounts.ts` · Contract tags: `auth`, `admin`, `client-team`, `settings`

**Endpoints**

- `GET /auth/invites/{token}`: Read an invite before accepting it
- `POST /auth/invites/{token}/accept`: Set a password and activate the account
- `POST /auth/login`: Sign in with email and password
- `POST /auth/logout`: Revoke the refresh token and clear the cookie
- `POST /auth/mfa/verify`: Finish a two-step sign-in
- `POST /auth/password/forgot`: Email a reset link
- `POST /auth/password/reset`: Choose a new password with a reset token
- `POST /auth/refresh`: Exchange the refresh cookie for a new access token
- `GET /me`: The signed-in user
- `GET /admin/login-history`: Latest 100 sign-in attempts. SUPER_ADMIN only.
- `GET /admin/organisations`: Organisations for the invite form. SUPER_ADMIN only.
- `GET /admin/users`: All accounts. SUPER_ADMIN only.
- `POST /admin/users/invites`: Invite a user. SUPER_ADMIN only.
- `POST /admin/users/{id}/approve`: Approve a representative a client owner invited, and send the invite
- `POST /admin/users/{id}/logout`: Revoke every session of the user
- `POST /admin/users/{id}/reactivate`: Lift a suspension
- `POST /admin/users/{id}/reset`: Email a password reset link (or re-send the invite)
- `POST /admin/users/{id}/suspend`: Suspend and sign out everywhere
- `GET /client/team`: The caller's company people and projects. CLIENT_OWNER only.
- `POST /client/team/invites`: Invite a representative. CLIENT_OWNER only.
- `PATCH /client/team/{id}`: Change a representative's projects, billing access or access. CLIENT_OWNER only.
- `GET /settings`: Portal settings. Agency staff.
- `PUT /settings`: Save portal settings. SUPER_ADMIN only.

**Rules to enforce**

- Same policy on accept-invite and reset. Phase 1 also checks a breached-password list. (`accounts.ts:81`)
- Rate-limit per email and per IP. Answer 429 without saying whether the email exists. (`accounts.ts:107`)
- A password change signs out every other session. (`accounts.ts:195`)
- Users, roles and settings are SUPER_ADMIN only (permission matrix). (`accounts.ts:201`)
- There must always be at least one active Super Admin (two from day one). (`accounts.ts:310`)
- Only the client owner manages their own company's people. (`accounts.ts:380`)
- Bot check and per-IP rate limit on the sign-up endpoint; the account stays INVITED (cannot sign in) until the emailed link (24 h, single use) is opened. (`accounts.ts:481`)

## Projects, tasks and review

Mock: `src/api/mock/handlers.ts` · Contract tags: `dashboard`, `projects`, `tasks`

**Endpoints**

- `GET /dashboard/admin`: Agency overview. Roles SUPER_ADMIN, MANAGER
- `GET /dashboard/client`: Client home. Roles CLIENT_OWNER, CLIENT_REP
- `GET /dashboard/employee`: Employee "My day". Role EMPLOYEE
- `GET /dashboard/influencer`: Influencer home. Role INFLUENCER
- `GET /dashboard/partner`: Partner home. Role PARTNER
- `GET /projects`: Projects the caller may see. Staff and client roles.
- `GET /projects/{id}`: Project with milestones, deliverables, team and activity
- `GET /tasks`: Internal tasks. Staff only.
- `GET /tasks/{id}`: Task with brief, checklist, files and comments
- `PATCH /tasks/{id}`: Change status, assignee or due date
- `PATCH /tasks/{id}/checklist/{itemId}`: Tick or untick a checklist item. Assignee, reviewer or admin area.
- `POST /tasks/{id}/comments`: Add a comment. Staff only. The UI defaults visibility to INTERNAL.
- `POST /tasks/{id}/review`: Pass or fail internal review. Reviewer or admin area only.

**Rules to enforce**

- Answer 404, not 403, for records in another organisation, so ids cannot be probed. (`handlers.ts:63`)
- Grants on top of the role. Client owners always have both; reps get billing only if the owner allows it. (`handlers.ts:78`)
- The single rule for "may this caller see this project". Use it in the repository query (WHERE clause), never by filtering after loading. (`handlers.ts:102`)
- Internal task counts are never sent to client roles. (`handlers.ts:157`)
- Billing needs the BILLING_VIEW permission (owners always; reps only if granted). (`handlers.ts:213`)
- Influencers and partners have no project list (partners get shared briefs in Week 7). (`handlers.ts:277`)
- Only active accounts appear in a project's team; pending or suspended people stay hidden. (`handlers.ts:331`)
- Clients see their own people and the agency contacts, never other client companies. (`handlers.ts:353`)
- Client roles only ever receive CLIENT-visible activity. (`handlers.ts:355`)
- Internal tasks are never serialised for client roles. (`handlers.ts:361`)
- Tasks are internal. Only staff may read them. Admin area sees all; employees see tasks they are assigned to or review, and tasks of projects they are a member of. (`handlers.ts:406`)
- Clients see milestones and deliverables, never internal tasks. (`handlers.ts:427`)
- Only the admin area reassigns work or moves due dates. (`handlers.ts:466`)
- Internal review rule. Client-facing work cannot skip the reviewer. (`handlers.ts:480`)
- Only the named reviewer or the admin area can pass or fail a review. (`handlers.ts:561`)

## Approvals

Mock: `src/api/mock/approvals.ts` · Contract tags: `approvals`

**Endpoints**

- `GET /approvals`: Approvals on projects the caller may see. Staff and client roles.
- `GET /approvals/{id}`: Approval with every version and pinned comment
- `POST /approvals/{id}/comments`: Pin a comment to a spot on the latest version
- `POST /approvals/{id}/decision`: Approve or request changes. Client roles only.

**Rules to enforce**

- Influencers and partners have no access to client approvals. (`approvals.ts:27`)
- Only the client decides. Staff recording a decision made elsewhere is a later feature with its own audit entry. (`approvals.ts:79`)
- Pins go on the latest version only; older versions are history. (`approvals.ts:128`)

## Messages and files

Mock: `src/api/mock/chat.ts`, `src/api/mock/files.ts`, `src/api/mock/hours.ts` · Contract tags: `messages`, `tickets`, `files`

**Endpoints**

- `GET /availability`: Is the team working now? Any signed-in user.
- `GET /conversations`: Channels the caller may read. Staff and client roles.
- `GET /conversations/{id}/messages`: Messages in a channel, oldest first
- `POST /conversations/{id}/messages`: Send a message or internal note
- `POST /conversations/{id}/read`: Read receipts up to and including a message
- `POST /uploads`: Upload one file to attach to a message
- `POST /messages/{id}/ticket`: Turn a client message into a ticket. Staff only.
- `GET /tickets`: Tickets in channels the caller may read
- `PATCH /tickets/{id}`: Change status or owner. Staff only.
- `GET /files`: Brand vault files and approved deliverables the caller may see
- `GET /files/{id}`: File with version history (newest first)
- `POST /files/{id}/link`: Create a signed download link

**Rules to enforce**

- Who may read a channel. Team channel: staff. Project channel: admin area always; employees only when assigned to the project (not merely reviewing a task); clients per project visibility. (`chat.ts:30`)
- Internal notes are filtered out in the query for client roles, never in the browser. (`chat.ts:51`)
- Only staff can write internal notes. (`chat.ts:131`)
- Clocks start when the client wrote, and only count business hours. (`chat.ts:255`)
- Clients see their own company's vault (CLIENT visibility only) and deliverables of projects they can see. Staff: admin area everything; employees the vaults and deliverables of client companies whose projects they work on. (`files.ts:46`)
- The same rules decide response deadlines; use java.time with ZoneId "Asia/Kolkata". (`hours.ts:3`)

## Clients

Mock: `src/api/mock/clients.ts` · Contract tags: `clients`

**Endpoints**

- `GET /clients`: Client companies. SUPER_ADMIN and MANAGER.
- `POST /clients`: Add a client and invite its owner. SUPER_ADMIN only.
- `GET /clients/account-managers`: Active agency staff who can be account manager or backup
- `GET /clients/{id}`: Client record with health factors, contacts, contracts, projects and history
- `PATCH /clients/{id}`: Edit profile, account manager or status
- `POST /clients/{id}/notes`: Add an internal note to the client history

**Rules to enforce**

- The clients module is admin area only (Super Admin and Manager). Phase 1: a manager sees only clients of their teams; in the demo Kavya manages every team. (`clients.ts:163`)
- The client health rule (CLAUDE.md, section 4.5), the same rule as project health: amber = any task overdue, or an approval waiting more than 5 days; red = a milestone missed, an invoice 15+ days late, or satisfaction 2 or lower. The score (100 minus penalties) only ranks clients; the level always follows the rule. Only live work counts: active projects, pending approvals, unpaid invoices. (`clients.ts:188`)
- Money totals beyond outstanding/retainer are finance data, SUPER_ADMIN only (managers: "view team" invoices). (`clients.ts:350`)
- Account managers are active agency staff (Super Admin, Manager or Employee). (`clients.ts:355`)
- SUPER_ADMIN only, because it issues a login (admin issues every login). Creates the organisation, the profile and the owner's account in one transaction, then emails the owner an invite (7 days). Duplicate company names are refused. Phase 2: a won deal in the pipeline calls the same service. (`clients.ts:368`)
- Pausing or ending a client is a money decision, so only a Super Admin makes it. (`clients.ts:432`)

## Finance and billing

Mock: `src/api/mock/finance.ts` · Contract tags: `finance`, `billing`

**Endpoints**

- `GET /finance/expenses`: Expenses
- `POST /finance/expenses`: Record an expense, optionally charged to a project
- `GET /finance/export`: CSV for the accountant (invoices, payments or expenses)
- `GET /finance/exports`: Export log, newest first
- `GET /finance/invoices`: Invoices (drafts first, then overdue)
- `POST /finance/invoices`: Create a draft invoice (no number yet)
- `GET /finance/invoices/{id}`: Invoice with lines, GST split, payments and event trail
- `PATCH /finance/invoices/{id}`: Edit a draft
- `POST /finance/invoices/{id}/cancel`: Cancel with a reason (kept on record)
- `POST /finance/invoices/{id}/payments`: Record money received (bank, UPI, cheque, card) with optional TDS
- `POST /finance/invoices/{id}/remind`: Email a payment reminder (once a day)
- `POST /finance/invoices/{id}/send`: Give the next number and email the billing contacts
- `GET /finance/payments`: Payments received, newest first
- `GET /finance/profit`: Margin per client and per project
- `GET /finance/projects`: A client's billable projects (for invoice lines)
- `GET /finance/quotes`: Quotes
- `POST /finance/quotes`: Create a draft quote
- `GET /finance/quotes/{id}`: Quote with lines and event trail
- `POST /finance/quotes/{id}/send`: Send to the client owner
- `GET /finance/summary`: Money overview: collected, recurring, outstanding, days to collect, 6 months, by service
- `GET /billing`: The client's invoices, quotes, contracts and receipts
- `GET /billing/invoices/{id}`: One invoice (no internal event trail)
- `POST /billing/invoices/{id}/pay`: Pay the balance online
- `GET /billing/quotes/{id}`: One quote
- `POST /billing/quotes/{id}/accept`: Accept (CLIENT_OWNER only)
- `POST /billing/quotes/{id}/decline`: Decline with a reason (CLIENT_OWNER only)

**Rules to enforce**

- The whole finance module is SUPER_ADMIN only. Managers see outstanding and retainer on client records. (`finance.ts:73`)
- Billing needs a client role plus BILLING_VIEW; always scoped to the caller's organisation. (`finance.ts:77`)
- Intra-state supply → CGST + SGST (half each); inter-state → IGST. (`finance.ts:87`)
- The event trail is internal (who drafted, reminders sent); clients get the invoice only. (`finance.ts:216`)
- A line can only point at a project of the same client. (`finance.ts:311`)
- Only drafts change; a sent invoice is a legal document (cancel and re-issue instead). (`finance.ts:396`)
- The number is given here, next in sequence for the financial year, in the same transaction (a row lock on the counter), so numbers have no gaps and drafts never use one. (`finance.ts:417`)
- Never deleted; paid or part-paid invoices need a credit note (Phase 1). (`finance.ts:461`)
- TDS is at most 10% of the taxable value (sections 194C / 194J); the CA confirms the rate. (`finance.ts:499`)
- Only the owner can accept, so the owner must be able to sign in. (`finance.ts:571`)
- Cost rates are SUPER_ADMIN only. Time entries are costed per person at their own rate (Week 6); hours logged before the timesheet existed are costed at the average rate of the project's staff. (`finance.ts:700`)
- Bulk export is SUPER_ADMIN only and every export is logged (CLAUDE.md section 14). (`finance.ts:779`)
- Clients never see drafts (not yet issued) or anything of another organisation. (`finance.ts:828`)
- Another company's invoice, or a draft, is "not found" (404), never 403. (`finance.ts:853`)
- Create a payment-gateway order here and mark the invoice paid only from the gateway's signed webhook. The browser can never mark an invoice paid by itself. (`finance.ts:871`)
- Accepting a quote is a contract; only the client's owner signs it. (`finance.ts:894`)
- The advance invoice stays a draft until a Super Admin sends it (money actions need a person). (`finance.ts:910`)

## Client reports

Mock: `src/api/mock/reports.ts` · Contract tags: `reports`

**Endpoints**

- `GET /admin/reports`: Where each live client's report stands for a month (default: last month)
- `GET /admin/reports/{clientId}/{month}`: One report for editing (empty skeleton if not started)
- `PUT /admin/reports/{clientId}/{month}`: Save numbers (draft, or a correction to a published month)
- `POST /admin/reports/{clientId}/{month}/publish`: Publish to the client and email them
- `GET /reports`: The caller's published monthly report (latest when no month)

**Rules to enforce**

- Clients compare against the previous *published* month only. (`reports.ts:71`)
- Only PUBLISHED reports of the caller's organisation. Reps see the sections of services they work on (projects they were added to); owners see everything. (`reports.ts:99`)
- Values are numbers ≥ 0, percentages ≤ 100; null means "not entered yet". (`reports.ts:195`)
- Every number and a summary are required; missing numbers are listed so they can be chased. (`reports.ts:241`)

## Sales pipeline

Mock: `src/api/mock/pipeline.ts` · Contract tags: `pipeline`

**Endpoints**

- `GET /pipeline`: Lead board, summary and the people who can own leads
- `POST /pipeline/leads`: Add a lead (first follow-up tomorrow)
- `GET /pipeline/leads/{id}`: Lead with activity history
- `PATCH /pipeline/leads/{id}`: Move stage, change owner, follow-up, value or services
- `POST /pipeline/leads/{id}/activities`: Log a call, email, meeting or note
- `POST /pipeline/leads/{id}/convert`: Mark as won: create the client, invite the contact, start the first project

**Rules to enforce**

- The pipeline is admin area only (permission matrix). Phase 1: managers see their team's leads. (`pipeline.ts:48`)
- One open lead per email, so two people don't chase the same contact. (`pipeline.ts:174`)
- Moving forward sets the next follow-up (rule 1: day 1, 3, 7 cadence) unless one is set. (`pipeline.ts:217`)
- SUPER_ADMIN only (it issues the client's login). One transaction: client (via the same service as POST /clients, so the same checks and the invite), first project, lead WON. (`pipeline.ts:263`)

## People and time

Mock: `src/api/mock/people.ts`, `src/api/mock/timesheet.ts` · Contract tags: `people`, `me`

**Endpoints**

- `GET /people`: Staff with today's attendance, this week's load and upcoming leave
- `GET /people/attendance`: Attendance grid for one week
- `GET /people/leave`: Leave requests; pending ones list the tasks due while away
- `POST /people/leave/{id}/decision`: Approve (optionally handing over tasks) or decline
- `GET /people/scorecards`: Scorecards for the team (last 30 days)
- `GET /people/workload`: Planned vs available hours per person for one week
- `GET /people/{id}/scorecard`: One scorecard with a six-month trend
- `GET /me/attendance`: Today and this month
- `POST /me/attendance/check-in`: Check in (office or home), once a day
- `POST /me/attendance/check-out`: Check out
- `GET /me/leave`: Balances, requests and coming holidays
- `POST /me/leave`: Apply for leave
- `POST /me/leave/{id}/cancel`: Cancel a pending request, or approved leave that has not started
- `GET /me/performance`: Your own scorecard
- `POST /me/time-entries`: Add time manually
- `DELETE /me/time-entries/{id}`: Delete one of your entries
- `POST /me/timer/start`: Start the timer (one at a time; the server keeps the start time)
- `POST /me/timer/stop`: Stop the timer and log it
- `GET /me/timesheet`: One week of your time, the running timer and your projects
- `POST /me/timesheet/submit`: Submit (lock) a week

**Rules to enforce**

- Phase 1 managers see only people in their teams; in the demo Kavya manages everyone. (`people.ts:55`)
- The day's status is derived: approved leave beats a missing check-in; past working days with nothing are ABSENT. (`people.ts:75`)
- Sick leave can be recorded up to 7 days late; everything else is applied for in advance. (`people.ts:214`)
- Admin area; nobody approves their own leave (a manager's leave goes to a Super Admin). Approving can hand over the affected tasks in the same transaction; each is logged on its project. (`people.ts:257`)
- An employee sees only their own; the admin area sees everyone (Phase 1: managers their team). (`people.ts:388`)
- You log time only on active projects you work on (member, owner or assignee). (`timesheet.ts:23`)
- Someone else's entry is "not found". (`timesheet.ts:115`)
- One running timer per person; the server keeps the start time. (`timesheet.ts:124`)

## Creators

Mock: `src/api/mock/influencers.ts` · Contract tags: `creators`, `discovery`, `creators-admin`

**Endpoints**

- `GET /me/campaigns`: Own campaign rows (no budget, no other creators' fees)
- `POST /me/campaigns/{id}/draft`: Submit a draft
- `POST /me/campaigns/{id}/live`: Share the live link and proof; creates the payout request (rule 17)
- `POST /me/campaigns/{id}/respond`: Accept, counter (higher, at most 3x) or decline an invite
- `GET /me/influencer`: Own creator profile with completeness
- `PATCH /me/influencer`: Update own profile
- `POST /me/influencer/submit`: Send for verification (profile must be complete)
- `GET /me/payouts`: Own payout statement (gross, TDS, net)
- `POST /public/influencers/signup`: Creator sign-up (public)
- `POST /public/influencers/verify`: Confirm the email and sign in
- `GET /discovery/influencers`: Verified creators for clients, ranked by rating then engagement
- `GET /discovery/requests`: The client's own collaboration requests
- `POST /discovery/requests`: Ask the agency to run a collaboration with 1-5 creators
- `POST /discovery/shortlist/{id}`: Toggle a creator on the client's shared shortlist (max 30)
- `GET /campaigns`: Campaigns
- `POST /campaigns`: Create a campaign (optionally from a client request)
- `GET /campaigns/{id}`: Campaign with every creator row
- `POST /campaigns/{id}/collabs/{influencerId}/counter`: Accept or decline a counter offer
- `POST /campaigns/{id}/collabs/{influencerId}/rating`: Rate a creator 1-5 after the post is live (feeds discovery ranking)
- `POST /campaigns/{id}/collabs/{influencerId}/review`: Approve a draft or request changes
- `POST /campaigns/{id}/invites`: Invite a verified creator
- `GET /influencers`: All creators with contacts and automatic flags
- `GET /influencers/requests`: Client collaboration requests, new first
- `POST /influencers/{id}/verification`: Verify or ask for changes (reason 10+ chars)
- `GET /payouts`: Creator payouts
- `POST /payouts/{id}/approve`: Approve (above the deputy limit: Super Admin only)
- `POST /payouts/{id}/paid`: Record the transfer (Super Admin)
- `POST /payouts/{id}/reject`: Put a payout on hold with a reason

**Rules to enforce**

- Influencer directory is "Full" for Super Admin and Manager (permission matrix). (`influencers.ts:58`)
- Bot check + rate limit; terms and consent recorded with time and IP (DPDP Act). (`influencers.ts:146`)
- Payout details and PAN go to a restricted, encrypted table; only masked forms are returned. Changing platforms or follower numbers on a verified profile sends it back for review (hidden from brands meanwhile). (`influencers.ts:233`)
- Never the full handle, email or phone (agency stays in the middle; non-bypass clause). (`influencers.ts:361`)
- Only verified creators can be invited; paused creators are not taking work. (`influencers.ts:540`)
- A draft is approved only with the paid-partnership disclosure (ASCI). Phase 3: the client approves too. (`influencers.ts:576`)
- Only this creator's own row; never the budget or other creators' fees. (`influencers.ts:621`)
- Within the deputy payout limit a Manager may approve; above it only a Super Admin. Payouts are never automatic. (`influencers.ts:744`)

## Partners and PR hub

Mock: `src/api/mock/partners.ts` · Contract tags: `partners`, `partners-admin`, `pr`

**Endpoints**

- `GET /partner/briefs`: The partner's own briefs (client and project names only)
- `POST /partner/briefs/{id}/start`: Start a brief
- `POST /partner/briefs/{id}/submit`: Submit work (1-10 files)
- `GET /partner/invoices`: The partner's own invoices
- `POST /partner/invoices`: Invoice an approved brief
- `GET /partner-briefs`: All partner briefs
- `POST /partner-briefs`: Share a brief with a partner
- `POST /partner-briefs/{id}/review`: Approve submitted work or request changes
- `GET /partner-invoices`: Partner invoices
- `POST /partner-invoices/{id}/decision`: Approve, reject (reason) or mark paid (reference); Super Admin
- `GET /pr`: Media contacts, pitches, coverage and vendors
- `POST /pr/contacts`: Add a media contact (duplicate check on email and phone)
- `GET /pr/contacts/export`: CSV of contacts without do-not-contact rows (Super Admin, logged)
- `PATCH /pr/contacts/{id}`: Mark verified, set consent or do-not-contact
- `POST /pr/coverage`: Log published coverage (marks the pitch covered)
- `POST /pr/pitches`: Draft a pitch
- `PATCH /pr/pitches/{id}`: Change pitch status

**Rules to enforce**

- PR and data hub: Full for admin area, Read (no export) for employees, None for everyone else. (`partners.ts:50`)
- Another partner's brief is "not found". (`partners.ts:91`)
- One open invoice per brief; amount up to the agreed fee; GST up to 18%; invoice number unique per partner. (`partners.ts:191`)
- Money decisions are SUPER_ADMIN only (finance). Paid invoices become an expense on the project. (`partners.ts:221`)
- Duplicate check on email and phone; consent recorded (DPDP Act). (`partners.ts:324`)
- Sending skips nobody silently: it refuses while any recipient has no consent, is do-not-contact, or has not been verified in six months. Sending sets a follow-up in 3 days. (`partners.ts:377`)

## Offers

Mock: `src/api/mock/offers.ts` · Contract tags: `offers`

**Endpoints**

- `GET /offers`: Offers with views, clicks and leads
- `POST /offers`: Create an offer
- `PUT /offers/{id}`: Edit an offer
- `POST /offers/{id}/click`: Client clicked the offer: counts it and creates or updates a pipeline lead (rule 1)
- `POST /offers/{id}/dismiss`: Hide the offer for this person

**Rules to enforce**

- Never an offer for a service they already buy. (`offers.ts:35`)

## Automation

Mock: `src/api/mock/automation.ts` · Contract tags: `automation`

**Endpoints**

- `GET /automation`: Rules, waiting drafts, pause state, deputy and the never-automated list
- `PUT /automation/deputy`: Set or clear the deputy and the money limits (Super Admin)
- `POST /automation/pause`: Pause or resume every rule (Super Admin)
- `PATCH /automation/rules/{id}`: Change mode, settings or actions (Super Admin)
- `POST /automation/rules/{id}/preview`: What the rule would do with today's data (nothing is sent)
- `GET /automation/runs`: Run log, waiting drafts first
- `POST /automation/runs/{id}/decision`: Approve (runs now) or discard a draft

**Rules to enforce**

- Automation rules and the audit trail: Super Admin full, Manager read (permission matrix). (`automation.ts:27`)
- Super Admin only. The deputy is an active Manager, for at most 90 days; the money limits are the same Settings values every approval checks (payouts above the limit always go to a Super Admin). (`automation.ts:89`)
- Super Admin only. A client-facing rule must spend 30 days in DRAFT before it can be ON. Settings stay inside each parameter's range; a rule keeps at least one action (turn it OFF instead). (`automation.ts:134`)
- Anything about money (rule 9 invoices and reminders) is Super Admin only; nothing runs while automation is paused. (`automation.ts:201`)

## Knowledge, services, onboarding

Mock: `src/api/mock/ops.ts` · Contract tags: `knowledge`, `services`, `onboarding`

**Endpoints**

- `GET /knowledge`: Articles (staff)
- `POST /knowledge`: Create an article (admin area)
- `GET /knowledge/{id}`: One article
- `PUT /knowledge/{id}`: Edit an article (admin area)
- `POST /knowledge/{id}/helpful`: Toggle your helpful vote
- `GET /services`: Service catalogue with task templates (admin area)
- `POST /services`: Add a service (Super Admin)
- `PUT /services/{id}`: Edit a service (Super Admin)
- `POST /services/{id}/preview`: Who would get each task and when (rule 3)
- `POST /services/{id}/projects`: Create the project, milestones and tasks from the template
- `GET /clients/{id}/onboarding`: A client's checklist (admin area)
- `POST /clients/{id}/onboarding/verify`: Staff confirm granted access works
- `GET /onboarding`: The client's own getting-started checklist
- `PATCH /onboarding`: Questionnaire answers, access handover, kick-off booking

**Rules to enforce**

- Admin area writes; every save stamps who and when (stale after 6 months). (`ops.ts:87`)
- Super Admin only (prices). (`ops.ts:157`)
- Admin area; one transaction for the project, its milestones and its tasks; a department with nobody available gets the manager as a placeholder and is reported back (rule 3: manager alerted). (`ops.ts:229`)
- Never store a password. An "account reference" is a public ID (Business ID, property ID, domain). (`ops.ts:331`)
- Client roles, own organisation only; VERIFIED is set only by staff. (`ops.ts:336`)

## Not built in the prototype (Phase 1+ decisions)

- Server-side PDF for invoices and reports (the prototype prints from the browser).
- Payment gateway (Razorpay): create an order, mark paid only from the signed webhook.
- Credit notes, e-invoicing (IRN) and TDS certificates; CA to confirm GST/TDS sections and invoice wording.
- File storage (S3-compatible, signed expiring links); uploads in the prototype record names only.
- Spring WebSocket for chat (the prototype polls every 4 s through `src/api/realtime.ts`).
- The automation engine itself (Spring events + Quartz); the prototype stores settings, previews and executes approved drafts.
- Audit log screen (append-only table exists in the data model).
- Time entries per person for older hours, task estimates, timesheet approval and payroll inputs.
