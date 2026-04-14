# CLAUDE.md

This file provides guidance for working in this repository.

## Repository Overview

This repository has two active parts:

1. `novabitwebdev/` - static HTML frontend
2. `novabit-platform/` - NestJS API, persistence layer, and local HTML server

## Working Rule

- UI and page changes go to `novabitwebdev/`
- API and backend changes go to `novabit-platform/apps/api/`
- The frontend served locally is `http://localhost:8080/index.html`
- Do not recreate or reintroduce a second frontend app

## novabit-platform

Main paths:

- `apps/api/` - NestJS API
- `scripts/serve-html.mjs` - serves `novabitwebdev/` on port 8080 and proxies `/api/*` to port 4000
- `docker-compose.yml` - local PostgreSQL

Common commands from `novabit-platform/`:

```bash
npm run dev:html
npm run dev:api
npm run db:up
npm run db:down
npm run lint:api
npm run typecheck:api
npm run test:api
npm run test:api:e2e
npm run build:api
```

API notes:

- Base path: `/api/v1`
- Health endpoint: `GET /api/v1/health`
- Auth: cookie-based sessions
- In-memory persistence is file-backed at `data/platform-store.json`
- Admin login route: `/auth/admin/login`

## novabitwebdev

Static HTML frontend served by the local HTML server.

Structure:

- `index.html` and other `*.html` pages
- `light-theme.css`
- `light-theme.js`
- `platform-html-bridge.js`

Important notes:

- This is the only frontend to edit for UI work
- The HTML server resolves files from `novabitwebdev/`
- Relative mirrored asset paths must remain compatible with direct HTML serving
