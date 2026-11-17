# Webinger Portal — frontend (Phase 0, Week 1)

React + JavaScript/JSX + TypeScript API types + Vite. One app, one login, five portal areas chosen by role.
Runs entirely on mock data until the Spring Boot API exists.

## Run it

```bash
npm install
cp .env.example .env      # VITE_API_MODE=mock
npm run dev               # http://localhost:5173
```

Sign in with any demo account on the login page. Password for all: `demo1234`.
The dark bar at the top lets you switch role without signing out.

| Role | Email | Lands on |
| --- | --- | --- |
| Super Admin | admin@webinger.in | /admin |
| Manager | manager@webinger.in | /admin (no Finance, Automation, Settings) |
| Employee | priya@webinger.in | /employee |
| Client Owner | arjun@terrafoods.in | /client |
| Client Representative | neha@terrafoods.in | /client (own projects only, no billing) |
| Influencer | ananya@creator.in | /influencer |
| Partner | hello@lensworks.in | /partner |

## What Week 1 delivers

- Project scaffold, PWA manifest, path alias `@/`
- Webinger design tokens (`src/styles/tokens.css`) and base components (`src/components/ui`)
- API contract v0 (`docs/api/openapi.yaml`) and matching types (`src/types`)
- One API client (`src/api/client.ts`) with mock and HTTP modes
- Mock data and handlers that enforce role and organisation rules (`src/api/mock`)
- Login with validation, role-based routing, sidebar (desktop) and bottom nav (phone)
- A home dashboard for each of the five areas; every other menu item opens a placeholder

## Folder map

```
docs/api/openapi.yaml      contract shared with the Spring Boot team
src/api/client.ts          the only place that talks to a backend
src/api/mock/              fake data + handlers (reference for backend access rules)
src/auth/                  session context and area guard
src/components/ui/         Button, Card, Badge, Input, Progress, Avatar, Stat, states
src/layout/                AppShell, navigation per role
src/pages/<area>/          screens, one folder per portal area
src/styles/                tokens and global styles
```

## Rules for adding screens

1. Add or change the endpoint in `docs/api/openapi.yaml` first.
2. Mirror it in `src/types`, add a mock handler, then a method in `api` in `client.ts`.
3. Screens call `api.*` only. Never `fetch` inside a component.
4. Every screen handles loading, error and empty states.
5. Hiding something in React is not security. Note the access rule in the mock handler so the backend copies it.

## Switching to the real backend (Phase 1)

Set `VITE_API_MODE=http`. Vite proxies `/api` to `localhost:8080`.
Access token stays in memory; the refresh token comes back as an httpOnly cookie from `POST /auth/refresh`.

## Before go-live

- Replace the placeholder wordmark in `src/components/Logo.jsx` with the real logo file.
- Replace `--brand-red` in `tokens.css` with the exact code from the logo.
- Add PNG icons (192 and 512 px) to the PWA manifest for older Android devices.
