# Sentinel

AI-driven desktop testing platform — a chat/plan pane that proposes a checklist,
executes it against a live-previewed real browser, and asks you things when it
needs to. See [`docs/`](docs/) for the full design spec and repository structure
rationale.

## Packages

- `apps/desktop` — Electron shell (React + TypeScript renderer, no business logic)
- `apps/backend` — Node.js backend service (Fastify + WebSocket + Prisma/SQLite)
- `packages/shared` — Types and WebSocket message contracts shared by both apps

## Development

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
pnpm --filter @sentinel/backend run db:migrate
pnpm dev:backend   # terminal 1
pnpm dev:desktop   # terminal 2
```

## Verification

```bash
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run test
```
