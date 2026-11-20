# API contract change log

The contract (`docs/api/openapi.yaml`) is the single source of truth between the React app and the Spring Boot backend.
**1.0.0 freezes the Core contract** at the end of Phase 0. From here, every change gets an entry below with the date,
what changed and why, and both sides are updated in the same pull request.

| Version | Date | What | Why |
| --- | --- | --- | --- |
| 1.0.0 | 2026-11-20 | Automation (`/automation`, rules, preview, pause, run log and draft decisions, deputy), knowledge base (`/knowledge`), service catalogue and project templates (`/services`), client onboarding (`/onboarding`, `/clients/{id}/onboarding`). **Core frozen.** | Week 8: last prototype module; freeze before Phase 1 backend work starts. |
| 0.7.0 | 2026-11-19 | Creators (public sign-up and email verification, profile, verification, campaigns, payouts), client discovery, partner portal, PR hub, offers. | Week 7. |
| 0.6.0 | 2026-11-19 | Sales pipeline, people (attendance, leave, workload, scorecards), self-service `/me` (attendance, leave, performance, timesheet, timer). | Week 6. |
| 0.5.0 | 2026-11-17 | Finance (invoices with GST, quotes, payments with TDS, expenses, profit, CA export), client billing, monthly client reports. | Week 5. |
| 0.4.1 | 2026-11-17 | Admin clients (list, detail with health score, create, edit, notes). | Pulled forward from Week 6 (finance needs client records). |
| 0.4.0 | 2026-11-17 | Messages, tickets, uploads, files and signed download links, availability. | Week 4. |
| 0.3.0 | 2026-11-17 | Two-step login, invites, password reset, internal review, approvals with pins, client team, admin users, settings. | Week 3. |
| 0.2.0 | 2026-11-17 | Projects (paged, filtered) and tasks (list, detail, patch, checklist, comments). | Week 2. |
| 0.1.0 | 2026-11 | Auth (login, refresh, logout), `/me`, dashboards for every area. | Week 1. |

## How to change the frozen contract

1. Write the entry above first (date, what, why) and get the owner's OK for anything that changes an existing field.
2. Prefer additions (new optional fields, new endpoints). Renaming or removing a field needs a new minor version and a
   short period where both shapes are accepted.
3. Update `openapi.yaml`, regenerate the TypeScript types and the Spring controller interfaces, then the mock handler
   and the screen, in one pull request.
