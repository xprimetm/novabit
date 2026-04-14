# Novabit Platform

This folder contains the Novabit API/backend and the local HTML server used for the static frontend.

The active frontend lives here:

- `C:\Users\COD\Documents\novabit\novabitwebdev`

## Workspace Layout

- `apps/api`: NestJS API
- `scripts/serve-html.mjs`: local HTML server for `novabitwebdev`

## Run Locally

Use separate terminals from `C:\Users\COD\Documents\novabit\novabit-platform`:

```powershell
npm.cmd run dev:html
npm.cmd run dev:api
```

For local PostgreSQL:

```powershell
npm.cmd run db:up
```

Default local URLs:

- HTML Frontend: `http://localhost:8080/index.html`
- API: `http://localhost:4000/api/v1`
- Health: `http://localhost:4000/api/v1/health`

## Environment

Create this file for local development:

- `C:\Users\COD\Documents\novabit\novabit-platform\.env`

Template reference:

- `apps/api/.env.example`

Suggested API env (PostgreSQL recommended for persistence):

```env
API_PORT=4000
CORS_ORIGIN=http://localhost:8080
PERSISTENCE_DRIVER=postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/novabit
DATABASE_SSL=false
NOVABIT_ADMIN_USERNAME=novabitadmin
NOVABIT_ADMIN_PASSWORD=NovabitAdmin123!
NOVABIT_ADMIN_EMAIL=admin@novabit.local
TURNSTILE_SECRET_KEY=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_CHECKOUT_ORIGIN=http://localhost:8080
STRIPE_WEBHOOK_SECRET=
STRIPE_CURRENCY=usd
```

Persistence behavior:

- `PERSISTENCE_DRIVER=auto`: prefers PostgreSQL when `DATABASE_URL` is available, otherwise falls back to in-memory for local development
- `PERSISTENCE_DRIVER=memory`: forces the dev-safe in-memory store
- `PERSISTENCE_DRIVER=postgres`: requires PostgreSQL and surfaces configuration or connection failures instead of falling back
- local memory mode is file-backed at `data/platform-store.json`
- for PostgreSQL later, add `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/novabit` and `DATABASE_SSL=false`

Admin auth behavior:

- the API seeds one admin account on startup if the configured admin username or email does not already exist
- the admin console uses its own cookie-backed session at `/auth/admin/login`
- admin sessions use a 30-minute idle window

## Current Project Rule

- frontend UI changes go to `C:\Users\COD\Documents\novabit\novabitwebdev`
- backend and API changes go to `apps/api`
- do not reintroduce a second frontend app in this repo

## Current Status

Completed:

- static HTML frontend retained at `novabitwebdev`
- local HTML server on `:8080` proxying `/api/*` to the API
- NestJS API bootstrap with versioned prefix and health endpoint
- auth and contact API flows backed by a swappable persistence layer
- PostgreSQL-ready persistence for users, sessions, contact submissions, dashboard accounts, statement entries, trades, portfolio positions, payment submissions, and rate limiting
- cookie-backed login sessions with `/auth/me` and `/auth/logout`
- server-side Turnstile enforcement with persistent request rate limiting on register, login, forgot-password, and contact flows
- dashboard account and payment submission backend flows

Recommended next slices:

1. Continue wiring the HTML pages to the API workflows
2. Add transactional email delivery for signup, reset, and support acknowledgements
3. Add mutation workflows for deposits, withdrawals, live trades, wallet connections, and profile updates
4. Continue removing placeholder content in the HTML frontend
