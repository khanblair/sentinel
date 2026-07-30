# Sentinel — Project/Folder Structure

Companion to `2026-07-30-ai-testing-platform-design.md`. Describes the proposed repository layout for Sentinel, the new product this spec introduces (a separate repo/project from `testify`, this Chrome extension).

## Monorepo layout

pnpm workspaces (matches the tooling already used in `testify`), two apps sharing one package of types:

```
<new-repo-root>/
├── apps/
│   ├── desktop/                    # Electron shell — UI only, no business logic
│   │   ├── src/
│   │   │   ├── main/                # Electron main process: window/lifecycle mgmt, spawns the backend child process, forwards WebSocket <-> IPC
│   │   │   ├── preload/              # contextBridge-exposed APIs (safe surface between renderer and main)
│   │   │   └── renderer/             # React + TypeScript UI
│   │   │       ├── views/            # Home, Project, Suite, Chat/Ad-hoc, Settings, Analytics
│   │   │       ├── components/       # Chat pane, checklist ticker, live-preview canvas, CRUD tables, confirm cards
│   │   │       └── hooks/            # run-state hook (equivalent to testify's useRunState), etc.
│   │   ├── electron-builder.yml
│   │   └── package.json
│   │
│   └── backend/                     # Node.js backend service — network-addressable, spawned locally for v1
│       ├── src/
│       │   ├── server/               # Express/Fastify HTTP + WebSocket entrypoint
│       │   ├── orchestrator/         # Ported/evolved from testify/src/background/orchestrator.ts:
│       │   │                         #   run control, precondition/destructive/input gating, case/step loop
│       │   ├── executionLoop/        # Ported from testify/src/background/executionLoop.ts: action loop + judgment
│       │   ├── metacognition/        # Net new (no Testify equivalent) — stuck/repetition detection in the action
│       │   │                         #   loop, confidence scoring in judgment, the post-run Insights reviewer, and
│       │   │                         #   the orchestration-level "this run looks broken" pause. See design doc §6.
│       │   ├── checklistGenerator/   # Ported from testify/src/background/checklistGenerator.ts, extended to accept
│       │   │                         #   a free-text instruction + URL (ad-hoc mode) as well as a CSV-derived Test Case
│       │   ├── automation/           # Playwright driver: page/browser lifecycle, tool execution (click/type/etc.),
│       │   │                         #   CDP screencast capture for live preview
│       │   ├── providers/            # AI provider adapters (Claude/DeepSeek/Gemini/OpenAI/OpenRouter) via Vercel AI SDK
│       │   ├── scheduler/            # cron/interval/one-time job runner, triggers a Run the same way a manual click does
│       │   ├── reports/              # Ported from testify/src/background/reportGenerator.ts (md/csv/xlsx export)
│       │   ├── db/                   # Prisma client + repositories (Project/Suite/TestCase/Run/StepLog/etc.)
│       │   └── ws/                   # WebSocket message contracts + broadcast helpers (evolved from testify/src/lib/messaging.ts)
│       ├── prisma/
│       │   ├── schema.prisma
│       │   └── migrations/
│       └── package.json
│
├── packages/
│   └── shared/                       # Types shared by desktop + backend: Run/StepLog/TestCase/Assistant/Skill/etc.,
│       │                             #   WebSocket message contracts — mirrors testify/src/lib/types.ts + messaging.ts
│       └── src/
│
├── assistants/                       # User-editable Assistant markdown files (shipped defaults live here too)
│   ├── regression-runner.md
│   ├── exploratory-tester.md
│   ├── accessibility-auditor.md
│   ├── visual-regression-checker.md
│   └── api-network-watcher.md
│
├── skills/                           # User-editable Skill definitions (shipped defaults live here too)
│   ├── network-assertion/
│   ├── accessibility-audit/
│   └── visual-diff/
│
├── docs/
│   └── superpowers/specs/            # Design docs (this one, and future ones)
│
├── pnpm-workspace.yaml
├── package.json                      # Workspace root
└── tsconfig.base.json                # Shared TS config extended by apps/* and packages/*
```

## Why this shape

- **`apps/desktop` has no business logic.** Everything the backend already needs to do (talk to AI providers, drive Playwright, read/write the database) lives in `apps/backend`, reachable over WebSocket. This is what makes the later "run the backend on a real server, Electron becomes one more client" move possible without restructuring code — only where the backend process *runs* changes, not its code.
- **`packages/shared` prevents drift** between the desktop UI's expectations and the backend's actual message/data shapes — the same problem `testify/src/lib/messaging.ts` and `types.ts` solve today, just usable from two separate processes/packages instead of one extension's shared module graph.
- **`assistants/` and `skills/` are top-level, not buried in `apps/backend/src`.** They're user-editable content, not application source — same convention AionUi uses for its own `assistant/` and `skills/` directories. Keeping them at the repo root makes "go edit a persona" obviously different from "go edit application code."
- **Prisma lives inside `apps/backend`**, not at the repo root, since the backend is the only thing that touches the database directly.

## Mapping from the existing `testify` extension

| Testify (Chrome extension) | Sentinel |
| --- | --- |
| `src/background/orchestrator.ts` | `apps/backend/src/orchestrator/` |
| `src/background/executionLoop.ts` | `apps/backend/src/executionLoop/` |
| *(none — net new)* | `apps/backend/src/metacognition/` (stuck detection, judgment confidence, post-run Insights, orchestration-level pause — design doc §6) |
| `src/background/checklistGenerator.ts` | `apps/backend/src/checklistGenerator/` (extended for ad-hoc URL+prompt input) |
| `src/background/deepseekClient.ts` | `apps/backend/src/providers/` (generalized to 5 providers via Vercel AI SDK) |
| `src/background/reportGenerator.ts` | `apps/backend/src/reports/` |
| `src/background/runStore.ts` | `apps/backend/src/db/` (Prisma repositories replace `chrome.storage.local`) |
| `src/content/*` (content-script DOM actions, element map) | `apps/backend/src/automation/` (same tool logic, executed via Playwright page handles instead of `chrome.tabs.sendMessage` to an injected content script) |
| `src/lib/messaging.ts` | `packages/shared/src/` (WebSocket contracts) + `apps/backend/src/ws/` |
| `src/sidepanel/*` | `apps/desktop/src/renderer/` |
| `src/options/*` | `apps/desktop/src/renderer/views/Settings` |

Most of the actual reasoning/prompting logic (system prompts, tool definitions, judgment logic) ports over close to as-is — the rewrite is mainly in how it's *hosted* (a real process instead of an MV3 service worker) and *driven* (Playwright instead of a content script), not in how it *thinks*.
