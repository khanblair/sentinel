# Sentinel — AI-Driven Desktop Testing Platform — Design Spec

**Status:** Brainstormed and approved by the user (2026-07-30). Not yet implemented.
**Name:** Sentinel.
**Relationship to Testify:** This is a new, separate product — not an evolution of the `testify` Chrome extension in this repo. It reuses and evolves Testify's execution engine (checklist generation, action loop, judgment, run control, precondition/destructive/input confirmation gates), rehosted in a proper backend instead of an MV3 service worker. Testify itself is not being retired by this spec.

## 1. Vision

A desktop-native, AI-driven browser testing tool with a Claude-Code-style interaction model: a chat/plan pane that proposes a checklist, asks you things when it needs to, and shows live step-by-step progress, alongside a live preview of the actual browser executing the test. You manage test projects/suites/cases with full CRUD, or skip authoring entirely and just paste a URL with an instruction — "test this, focus on checkout" — and let the agent figure out what to check.

## 2. Goals

- Full CRUD for test Projects, Suites, and Test Cases (not just CSV/XLSX upload).
- Ad-hoc, chat-first testing: paste a URL, describe intent, get a live-executed test with no pre-authored test case required — with the option to save the result as a reusable Suite afterward.
- A live preview of the real browser executing each test (not a text log after the fact).
- Multiple AI providers (Claude, DeepSeek, Gemini, OpenAI, OpenRouter), user-configured API keys, selectable per Assistant/run.
- Customizable AI behavior via Assistants (personas), Skills (toggleable capability packs), and Rules (standing instructions) — global and per-project.
- Scheduled, unattended runs (cron / interval / one-time) with a Full-Auto (YOLO) mode that doesn't block on a human who isn't there.
- Analytics: pass/fail trends, flakiness, module risk heatmap, AI cost/usage tracking.
- Loop engineering & metacognition: the agent watches its own execution and reasoning for stuck loops, low-confidence judgments, and systemic (not just isolated) failures — see §6.
- Cross-platform desktop app (macOS, Windows, Linux) via Electron.

## 3. Non-goals (explicitly excluded)

- **No remote access or chat-platform integration.** No WebUI-for-phone, no Slack/Telegram/Discord/Lark bot. Sentinel is used directly, on the machine it's installed on, for v1 and the foreseeable roadmap.
- **No wrapping of external CLI agent tools.** Sentinel has one built-in agent engine that talks directly to the five provider APIs. It is not a multi-CLI launcher/detector (unlike tools such as AionUi, which this spec draws UI/feature inspiration from but not this particular capability).
- **No real-time multi-user sync in v1.** Team sharing (see §10) is export/import only for now.

## 4. User flow

### 4.1 First launch
Install Sentinel (`.dmg` / `.exe` / `.AppImage`). Add at least one provider API key in Settings. Optionally set Global Rules and review the built-in Assistants/Skills before doing anything else.

### 4.2 Home
A list of Projects (e.g. "SoundWave"). Each Project holds: Suites (each with Test Cases), Environments (named base-URL + credentials profile), Project Rules, a default Assistant, run history, and its own analytics dashboard.

### 4.3 Structured testing
Open a Suite → see its Test Cases in a table with full CRUD (add/edit/delete/reorder/tag/clone; CSV/XLSX import still available for bulk-add). Click "Run Suite" → pick an Environment + Assistant (defaults pre-filled) → the chat/plan pane shows the checklist about to run → a live preview window opens on the real browser → a step-by-step ticker shows progress in the chat pane → pause-and-ask cards appear inline whenever a real credential, email verification, destructive-action confirmation, or manual precondition is needed → run finishes → export a report (Markdown / CSV / XLSX; brief one-liner for passing steps, full detail + tool-call trace for fail/blocked) → results feed into the Suite's history and the Project's analytics.

### 4.4 Ad-hoc chat testing
Start a new chat instead of opening a Suite. Paste a URL, type intent ("test the checkout flow, focus on validation errors"). The agent loads the page in live preview, proposes its own checklist from the URL + instructions (shown for approval/edits first — plan-mode style, before executing), then runs it through the same live-preview/step-ticker/pause-and-ask machinery as a structured Suite. On completion: **"Save this as a Suite?"** — turns the ad-hoc checklist into real, editable, re-runnable Test Cases filed under a chosen Project.

### 4.5 Assistants & Skills in use
Before any run, an Assistant is active — a markdown-defined persona (system prompt + default enabled Skills). Examples: **Regression Runner** (saved Suites, minimal creativity), **Exploratory Tester** (URL-only ad-hoc sessions), **Accessibility Auditor**, **Visual Regression Checker** (screenshot-diff against a baseline), **API/Network Watcher** (asserts on network responses, not just DOM). Skills (e.g. `accessibility-audit`, `network-assertion`, `visual-diff`) toggle per-run via a skill indicator in the chat header. Global Rules + Project Rules always apply underneath whichever Assistant is active.

### 4.6 Scheduling
Any Suite (or saved ad-hoc session) can be scheduled: standard cron expression (with timezone), fixed interval (every N minutes/hours), or one-time trigger. Scheduled runs default to **Full-Auto (YOLO) mode**: no interactive pause-and-ask — sensible defaults are applied, or the step fails fast, instead of blocking on a confirmation nobody is present to answer. Manually-triggered runs default to **Interactive mode** (today's Testify behavior — pause and ask). Either mode is switchable per run. Scheduled results land in the same run history/analytics as manual runs.

### 4.7 Analytics
Per-Project dashboard: pass/fail trend over time, flaky cases (verdict flips across recent runs), module/sub-module risk heatmap, AI cost/usage per provider/model (tokens + estimated spend), split by manual vs. scheduled runs.

## 5. Features (detailed)

### 5.1 Test management (CRUD)
- Hierarchy: **Project → Suite → Test Case.**
- Test Case fields: Module, Sub-module, Priority, URL Path, Precondition + Precondition Type (auto/manual), Steps, Expected Result, **Tags** (freeform, e.g. "smoke", "regression", "a11y"), **Owner**, **Linked issue** (optional — an MCP integration point to file/link a Jira/Linear/GitHub issue from a failed case), **edit history**, **reference screenshot attachments**.
- **Environments**: named base-URL + optional credentials profile, so one Suite can target staging/production/a PR preview without editing every case's URL.
- Archive instead of hard-delete, so history stays intact. Clone/duplicate a Suite or Case.
- CSV/XLSX import remains supported as a bulk-add path into a Suite (matching Testify's existing schema: Test ID, Module, Sub-module, Title/Scenario, Priority, URL Path, Precondition, Steps, Expected Result, Precondition Type).

### 5.2 Ad-hoc chat testing
- Not gated behind a pre-authored Test Case. A chat session accepts a URL (or several) plus natural-language intent.
- The agent proposes a checklist before executing (visible, editable) — mirrors the existing checklist-generation step, just triggered from a URL + free-text prompt instead of a CSV row.
- Reuses the exact same execution engine (action loop, judgment, pause-and-ask gates) as structured Suites — no separate code path for "how a test actually runs."
- "Save as Suite" converts the session's generated checklist into real, persisted Test Case(s).

### 5.3 Execution engine (evolved from Testify)
Ported and evolved from the existing Chrome extension's background logic:
- Checklist generation (decompose an Expected Result, or a free-text instruction against an observed page, into atomic checkable steps).
- Action loop: click / type / navigate / scroll / wait_for_element / extract_text / assert_condition / request_input / request_tester_action, with per-tool-call live progress reporting.
- Judgment: compare actual vs. expected per step.
- Run control: Stop Run / Skip Case, cancelling in-flight AI calls immediately.
- Precondition gating (manual precondition type pauses for tester confirmation).
- Destructive-action confirmation.
- `request_input` (real credentials/emails/codes) and `request_tester_action` (out-of-band verification) — both already built for Testify, ported as-is.
- Extraction fixes already made in Testify carry over: page title captured, images/icons/logos have alt/aria-label in the element list, checkbox/radio checked-state exposed.
- No more service-worker lifecycle fighting — a long-running Node backend process replaces the MV3 service worker, so no keep-alive hacks, no 30s idle death, no state lost when a window closes.

### 5.4 Live preview
- Real-time view of the actual browser executing the test, streamed via Chrome DevTools Protocol screencast (not an iframe — CSP frame-ancestors restrictions break iframe embedding on most real sites).
- Runs in a dedicated, properly-sized Playwright-controlled browser instance — no viewport-collapse-from-a-docked-panel problem (the bug fixed in Testify) because there's no docked panel at all.

### 5.5 Assistants
- Markdown-defined personas: system prompt + default enabled Skills + default provider/model routing.
- Built-in set (initial): Regression Runner, Exploratory Tester, Accessibility Auditor, Visual Regression Checker, API/Network Watcher.
- User-creatable/editable custom Assistants, same markdown-file mechanism as the built-ins.
- Selected per-run; a Project can have a default Assistant.

### 5.6 Skills
- Three-tier: built-in (shipped), custom (user-authored), later an extension mechanism if ever needed (not required for v1).
- Toggleable per conversation/run via a skill indicator.
- Initial built-in set: `network-assertion` (assert on network responses, not just DOM state — e.g. the feedback-form POST check from Testify's SoundWave tests), `accessibility-audit` (alt text, contrast, keyboard nav, ARIA roles), `visual-diff` (screenshot comparison against a stored baseline).

### 5.7 Rules
- **Global Rules**: standing instructions applied to every session regardless of project (e.g. "never submit real payment forms").
- **Project Rules**: project-specific standing instructions (e.g. "this site's nav collapses below 768px — that's expected, not a bug").
- Folded into the system prompt underneath whichever Assistant is active.

### 5.8 Scheduling
- Cron expression (with timezone), fixed interval (every N minutes/hours), or one-time trigger, per Suite or saved ad-hoc session.
- Full-Auto (YOLO) mode for unattended runs vs. Interactive mode for manual runs; switchable per run regardless of trigger type.
- Missed-trigger detection is out of scope for v1 (no "catch up on sleep/wake" requirement, unlike a Cowork-style always-on assumption — this is a testing tool, not a 24/7 agent).

### 5.9 AI provider management
- Global API key entry for Claude, DeepSeek, Gemini, OpenAI, OpenRouter in Settings.
- Per-Assistant (and per-run override) selection of which provider/model handles checklist generation vs. action vs. judgment — these need not be the same provider.
- Cost/usage is tracked per call (see Analytics) regardless of which provider handled it.

### 5.10 Analytics
- Pass/fail trend over time, per Project/Suite.
- Flakiness: cases whose verdict flips across recent runs.
- Module/sub-module risk heatmap.
- AI cost/usage: tokens and estimated spend per provider/model, per run and cumulative, split manual vs. scheduled.

### 5.11 Reporting
- Export a run as Markdown, CSV, or XLSX, matching the QA-template columns already established in Testify (Test ID, Module, Sub-module, Title/Scenario, Priority, URL Path, Precondition, Steps, Expected Result, Actual Status, Actual Result Notes).
- Brevity rule carried over: passing steps render as a single line; fail/blocked steps get full detail plus a numbered tool-call trace; any single text blob over ~300 characters is truncated.

## 6. Loop engineering & metacognition

Directly motivated by this session's own experience building Testify: a real 10-case run showed 9/10 failing, and it took a *separate* AI session manually reading the extension's source code to work out that most failures were tooling limitations (missing page-title capture, no alt-text on images, report noise burying real evidence) rather than actual site bugs. This component builds that diagnostic instinct into the product itself, instead of relying on the tester pasting a report into a different AI session for a second opinion.

### 6.1 Per-step: stuck detection & escalation, not blind turn exhaustion
- The action loop caps each step at a turn budget (8 in Testify) and today marks it "blocked" on timeout with only the last observation visible, discarding everything before it. This component makes the loop actively watch itself mid-step: if the same or a near-identical tool call repeats with no change in observation, treat that as "stuck" immediately — try a materially different approach next turn, or conclude 'blocked' with an explicit "I appear to be repeating the same action" reason — rather than silently burning the remaining budget.
- Before calling a concluding tool (`extract_text`/`assert_condition`), require a brief explicit self-check: "what evidence have I actually observed, and does it really support the verdict I'm about to reach?" — targets the "flat-out judge miss" failure mode directly (the SoundWave report's validation-message check: the text was literally present in the captured page dump, but the judge missed it in a noisy blob).

### 6.2 Judgment: confidence, not just verdict
- Every judgment carries a confidence signal alongside pass/fail/blocked, plus a short "why" citing the specific evidence relied on — for a pass, not only a fail (today's `mismatchReason` is fail/blocked-only).
- Low-confidence verdicts of either polarity are flagged distinctly in the report/UI, so a tester's attention goes to "the agent itself wasn't sure" cases first, not only outright failures.

### 6.3 Run-level: an automatic Insights pass
- After every run, a built-in review step (always runs — not a separate Assistant the tester has to remember to invoke) reads the whole run's results and asks: which failures look like real site bugs vs. tooling/extraction limitations? Do several failures share one root cause (e.g. "every failure here is a page-title check")? Does this look like a regression, or an artifact of how the checklist itself was worded?
- Surfaces as a short "Run Insights" summary alongside the raw pass/fail counts — the product doing automatically what happened manually this session when a report got pasted into a separate Claude conversation for root-cause analysis.
- Feeds Analytics (§5.10): flakiness/heatmap data gets annotated "looks systemic" vs. "looks genuinely flaky" instead of presenting bare statistics with no interpretation.

### 6.4 Orchestration-level: agent-initiated pause, not just user-initiated Stop
- Distinct from the existing user-initiated Stop Run/Skip Case controls (§5.3): if the failure/blocked rate within a run crosses a threshold early — e.g. the first several cases all fail in a visibly similar way — the agent can pause the whole run and ask the tester "something looks fundamentally wrong here; several early failures share [pattern]. Continue anyway, or stop and look?" rather than grinding through an entire suite broken for one root cause.
- Applies only in Interactive mode. Full-Auto/scheduled runs log the same signal into Run Insights instead of pausing, since nobody is present to answer.

## 7. Architecture

- **Electron shell**: thin React + TypeScript renderer — chat/plan pane, checklist view, live preview pane, CRUD screens, Settings. No business logic lives here.
- **Backend service**: Node.js + TypeScript (Express or Fastify + WebSocket), spawned locally by Electron as a child process for v1. It is network-addressable from day one (not Electron-IPC-only), so it can later run standalone on a real server for team/hosted mode with no rework — Electron becomes just one more client pointing at it.
- **Browser automation**: Playwright (Chromium by default), driven entirely by the backend. Its CDP session feeds both the action-loop tool calls and the live-preview screencast.
- **Database**: SQLite via Prisma (schema/migrations/type-safe queries) — the relational structure the analytics queries need. Tables: `Project`, `Suite`, `TestCase`, `Environment`, `Run`, `StepLog`, `Assistant`, `Skill`, `Rule`, `ProviderConfig`, `ScheduledJob`, `ProviderUsage`.
- **AI provider layer**: one normalized provider interface built on the **Vercel AI SDK**, which already handles tool-calling normalization for Anthropic/OpenAI/Google and has an OpenAI-compatible mode covering DeepSeek and OpenRouter directly — avoids hand-rolling five separate raw clients the way Testify's DeepSeek-only client was built.
- **Packaging**: `electron-builder` for macOS/Windows/Linux installers.
- **Scheduler**: an in-backend cron/interval/one-time job runner (e.g. `node-cron` or a small custom scheduler over `setTimeout`/persisted next-run timestamps), triggering the same run-execution path as a manual "Run Suite" click, with Full-Auto mode set by default.

## 8. Data model (high level)

```
Project 1—N Suite 1—N TestCase
Project 1—N Environment
Project 1—N Rule (project-scoped)
Rule (global-scoped, no Project)
Assistant (built-in or user-authored; optionally scoped to a default Project)
Skill (built-in or user-authored)
Suite 1—N Run 1—N StepLog
Run —1 Assistant, —1 Environment, —N ProviderUsage
ScheduledJob —1 Suite (or ad-hoc session), triggers Run
ProviderConfig (API keys, one row per provider)
```

This mirrors Testify's existing shape (`RunSummary` / `TestCaseResult` / `StepLogEntry`) but relational, with `Run` + `StepLog` replacing the single-JSON-blob-in-`chrome.storage.local` approach.

## 9. Error handling & reliability

- No MV3-style lifecycle constraints — the backend is a normal long-running process, so no keep-alive workarounds are needed.
- DeepSeek/other-provider request timeouts (the AbortController-based fix already built in Testify) carry over unchanged, generalized across all five providers via the Vercel AI SDK's own abort-signal support.
- Stop Run / Skip Case semantics carry over unchanged (per-run and per-case AbortController, resolving any pending confirmation as declined).
- Scheduled Full-Auto runs must degrade gracefully when a step would otherwise pause-and-ask: apply a documented default (e.g. decline destructive actions, treat an unanswered `request_input` as "no value provided" and let judgment fail that step) rather than hanging forever with nobody present to answer.

## 10. Team sharing (deferred, not v1)

- v1 is single-user, local-first (SQLite on the tester's own machine).
- Lightweight sharing in v1: export a Project as a portable bundle file; import it on another machine. No live sync.
- Later phase: point multiple Electron clients at one hosted instance of the same backend service (enabled by the network-addressable architecture chosen in §7) for real-time shared results — not designed in detail here; revisit as its own spec when prioritized.

## 11. Out of scope for this spec

- Detailed UI mockups/visual design (left for implementation-time design work).
- The exact Assistant/Skill markdown file format (to be nailed down in the implementation plan, following AionUi's `assistant/*.md` pattern as a starting reference).
- Multi-user auth/roles (irrelevant until the team-sharing phase in §10 is prioritized).
- Detailed build/implementation sequencing (belongs to the implementation plan, not this design spec).

## 12. Implementation status (as of this pass)

Everything in §5 is built except the two items below. Both were deliberately cut
rather than half-built, after the rest of §5 (test management, ad-hoc chat testing,
execution engine, Assistants, Rules, scheduling, provider management, analytics, and
reporting including XLSX) shipped in full, along with §10's project export/import
bundle and a `TestCase.linkedIssueUrl` field (store-and-render only, no issue-tracker
API integration — see below).

- **§5.4 Live preview.** Not built. This needs a CDP screencast channel streamed from
  the backend's Playwright session into the Electron renderer — infrastructure that
  doesn't exist yet on either side (no screencast plumbing in the backend, no preview
  pane in the renderer) — and it can't be verified in this environment: every
  automated check in this codebase runs against `FakePageFactory`/`FakePage` in tests
  or a real Playwright browser driven headlessly by a verification script, never a
  full Electron window. Shipping an unverifiable streaming feature was judged worse
  than not shipping it. Revisit with a real Electron smoke-test environment available.
- **§5.6 `visual-diff` Skill.** The Skill row is seeded (`seedSkills.ts`) and
  selectable on Assistants, but nothing executes it — Skills in general are currently
  a name registry only; none of them (built-in or custom) are folded into the actual
  system prompt or given real tool implementations in the action loop (the same class
  of gap that Assistant persona + Rules had until this pass fixed *that* one — see
  `orchestrator/systemPrompt.ts`). Building real visual diffing needs, at minimum: a
  `Page.screenshot()` method (`automation/page.ts` has none today), a baseline-image
  storage model, a new tool-call type the LLM can invoke, and Skills becoming real
  enough to gate which tools are available. That's a subsystem, not an increment —
  deferred as its own future pass rather than partially wired in.
- **Linked issue field**, by contrast, *is* built — but only the minimum §5.1 implies:
  a user pastes a URL into `linkedIssueUrl` and it renders as a link. There is no
  GitHub/Linear/Jira push integration (filing or updating a real issue from a failed
  test case) — there's nowhere in the current data model to hold per-provider issue
  tracker auth (`ProviderConfig` is specifically for AI provider keys), and building
  that is a distinct, larger feature.
