# Software Factory

Type a prompt and get a deployed web app. Claude agents research, specify, design, build and review it, while the factory's own automated checks test and deploy it. Each prompt has a hard budget, and every step leaves a record you can read.

```
portal (prompt box) ──► factory API ──► pipeline ──► deployer ──► http://<runId>.apps.localhost
```

## Run it

You need Docker (Docker Desktop on macOS or Windows, or Docker Engine with the compose plugin on Linux) and an Anthropic API key.

```sh
cp .env.example .env              # set ANTHROPIC_API_KEY
docker compose up -d --build
open http://localhost             # or http://localhost:$HTTP_PORT
```

The API key is the only required setting. Everything else in `.env.example` is optional. Apps are served at `http://<runId>.apps.localhost`, and browsers resolve `*.localhost` without any DNS setup. On a server, set `BASE_DOMAIN` and point a wildcard DNS record `*.apps.<BASE_DOMAIN>` at the host.

## Pipeline

```
research ─► requirements ─► ┌ test cases   ┐ ─► development
                            │ architecture │        │
                            └ UI/UX design ┘        │
     ┌────────────────────────────────────────────┘
     ▼
  verify (no LLM)  ∥  review          all green → live
     │ otherwise, up to 2 rounds:
     ├─ container won't build/start/answer → deployment repair agent
     ├─ broken layout in the browser         → fix (with the exact elements)
     ├─ tests fail                         → test triage agent
     └─ app bugs, blocking review          → fix (resumes the developer's session)
        then verify ∥ re-review (diff only) again
```

| Stage | Kind | Model | Works in | Produces |
|---|---|---|---|---|
| Research | agent | Sonnet 5.5 | stage folder + web search/fetch | comparable products, common features, UI patterns, pitfalls, suggested MVP scope, sources |
| Requirements | agent | Sonnet 5.5 | stage folder | a PRD in the Feature + Screen template: features with Given/When/Then AC, business rules, screens, entities, roles and permissions |
| Test cases | agent | Sonnet 5.5 | stage folder | Given/When/Then cases mapped to criteria, smoke checks |
| Architecture | agent | Opus 5.5 | stage folder | stack, file tree, data model, API, commands, stylesheet location, Dockerfile plan |
| UI/UX design | agent | Opus 5.5 | stage folder | ZT: a template, components, actions and states per screen (`screens.json` contract). Custom: visual direction, design tokens, components, wireframes. See *Design systems* |
| Development | agent | Opus 5.5 | `workspace/` | the app, its tests (written test-first) and a Dockerfile |
| Verify | **code** | – | `workspace/` + deployer + headless Chromium | install + test suite, image build, container start, `/health`, GET smoke checks, and browser checks of every screen. Costs $0; a green verify *is* the deployment |
| Review | agent | Sonnet 5.5 | `workspace/` (read-only) | findings by severity, criterion coverage; re-reviews read only the diff |
| Test triage | agent, on failure | Sonnet 5.5 | `workspace/` (test files only) | fixes broken tests, reports real app bugs |
| Deployment repair | agent, on failure | Sonnet 5.5 | `workspace/` + Docker tools | fixed Dockerfile/start config, running container |
| Fix | agent, on failure | Opus 5.5 | `workspace/` | fixes app bugs and blocking findings, resuming the developer's session |

How the design saves money and time:
- **Plain code does the mechanical checks.** Running tests, building the image and hitting `/health` are yes/no facts, so the verify gate does them for free. The testing and deployment agents only run when something is broken.
- **Independent stages run in parallel:** test cases, architecture and UI/UX design all start from the PRD together, and verify runs alongside review.
- **Fix rounds resume the developer's session** (forked, so the original transcript stays intact), so they start with the code already in context instead of re-reading it. If resuming fails, the fix falls back to a fresh session.
- **Models are tiered.** Sonnet does documents and judgement, Opus does design and code. Set `FACTORY_MODEL` to force one model everywhere, for example a cheap model when testing the pipeline.
- **Specs are passed as compact JSON**, about 25% fewer characters than indented JSON, since agents re-read them on every turn.
- **Agents that run commands keep the prompt cache warm.** Each step stays short, files are written in parts, and nobody waits on long background tasks. A pause of more than 5 minutes expires the cache, and the next turn re-writes the whole context (up to ~150k tokens, ~$0.70 on Opus).
- **Document stages skip the Claude Code system prompt.** They get a short role prompt instead, which saves its tokens on every turn.

Research and UI/UX design are optional: if research fails, requirements are written from the prompt alone; if UI/UX design fails, the developer picks a visual direction itself. The agents can use any web stack that runs on the runtimes in the factory image (Node, Bun, Python, Go). Every app has to meet one contract: a single Dockerfile, listening on `$PORT`, with `GET /health` returning 200.

Configuration lives in `packages/factory/src/pipeline/pipeline.constants.ts`. That file sets each stage's model, skills, budget, effort, turn limit and timeout. Agent prompts and output schemas are in `packages/factory/src/agents/<stage>/`, and the verify gate is `packages/factory/src/pipeline/pipeline.gate.ts`.

### Browser checks

HTTP checks can't see layout, so verify also opens every screen in headless Chromium (Playwright, `packages/factory/ui-check/ui-check.mjs`). It checks at desktop (1366px) and phone (390px) width. The developer reports a URL for each PRD screen and seeds demo data, including deliberately long text, so screens have content to lay out.

| Check | Fails the build when |
|---|---|
| Broken words | an ordinary word (≤20 characters) is split across lines, e.g. "Viewi / ng". The report also names the global CSS rule behind it |
| Text overflow | text is wider than its own box and spills out |
| Sideways scroll | the page is wider than the viewport. The report names the widest elements |
| Broken images | an `<img>` was requested but failed to load, for example a dead photo URL in the seed data |
| JS errors, failed requests | an uncaught exception, or one of the app's own requests returns 404 or 5xx (401/403 and other 4xx are warnings: often a normal "not logged in" answer) |
| Accessibility | axe-core finds a WCAG A/AA violation rated serious or critical. Moderate and minor ones are listed as warnings |

The developer can run the same checks itself mid-session through its `browser_check` tool, against its own local server (`packages/factory/src/agents/development/development.tools.ts`), so most problems get fixed before verify sees them. Failures go to the developer's fix round with the screen, viewport, element and measurement. Full-page screenshots are kept in the verify folder for people to look at. If Chromium is unavailable (for example when running the factory outside Docker), the step is reported as skipped instead of failing.

### Design systems

Each run picks a design system on the portal's form (`designSystem` in `POST /api/runs`, default `zt`):

| | **ZT Design System** (default) | **Custom design** |
|---|---|---|
| For | Business and internal apps | Consumer apps, catalogues, landing pages |
| Frontend | React + Ant Design 6 (Vite), fixed tokens; only `colorPrimary` per project | Any stack; design tokens invented per product as CSS custom properties |
| UI/UX output | `screens.json`-style spec: menu, a template per screen (list, detail, form, dashboard, approval, auth), field → component and action → button mappings, states, self-check | Visual direction, tokens, components, wireframes per screen |
| Skill | `zt-design-system` (UI/UX, development, fix, review) | `frontend-design` (UI/UX, development, fix) |
| Phone-width checks | Only when the PRD or the UI design requires mobile (ZT is desktop-first) | Always |

The ZT file is vendored as `skills-plugin/skills/zt-design-system/SKILL.md`, unchanged, under a short "Factory overrides" section:
- no Figma
- UI language follows the prompt and PRD
- mobile only when the PRD asks
- `operationId` comes from the architecture
- `NEW-COMPONENT?` and change requests are recorded in the output instead of asked about

To update the design system, replace the text below that section.

### PRD (requirements)

The requirements agent writes a PRD following *PRD Template v2 (Feature + Screen)*, using its IDs (`F-xx`, `AC-Fxx-yy`, `BRL-xx`, `S-xx`, `ENT-xx`, …) and its central rule: logic lives in features and business rules, and screens only reference them.

- **The agent only fills in structured data** (`requirements.schema.ts`). The factory renders `REPORT.md` in the template's layout, with its section numbers and column names (`requirements.report.ts`), so the model never spends tokens on formatting. The permission matrix (§3) and traceability matrix (§18) are built from the IDs.
- **Cross-references are checked by code** (`requirements.validate.ts`): ID formats, duplicates, acceptance criteria naming their feature, and every feature, screen, rule and role reference resolving. If anything is broken, the requirements session is resumed once to fix it (the `requirements (repair)` stage). Anything left over is listed at the end of the PRD.
- **Each later agent gets only its slice** (`requirements.utils.ts`): test cases get features, AC, rules, permissions and screen states; architecture gets entities, screen fields and actions, and roles; UI/UX design gets screens, user flows and roles; review gets AC, rules and permissions. Only development gets the whole PRD.
- **Sections that need a human process are omitted:** approvers, success metrics, deployment, UAT, sign-off, and real external integrations (apps are self-contained). Open questions become decisions the agent took, with its reasons.
- The PRD is written in the language of the user's prompt.

### Skills

Agents use proven engineering skills, vendored in `packages/factory/skills-plugin/` and loaded as a local plugin. Each agent sees only its own skills.

| Skill | Source | Used by |
|---|---|---|
| test-driven-development | [obra/superpowers](https://github.com/obra/superpowers) (MIT) | development, fix |
| verification-before-completion | obra/superpowers (MIT) | development, fix |
| systematic-debugging | obra/superpowers (MIT) | fix, test triage |
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills) (Apache-2.0) | UI/UX design, development, fix |
| web-interface-guidelines | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (MIT) | development, fix, review |

The web interface guidelines are the UI baseline (104 checkable rules on accessibility, focus, forms, motion, copy and more): the developer builds to them, the reviewer checks against them, and the UI/UX spec doesn't restate them, which keeps it short. The upstream skills ask a human at a few decision points. The vendored copies are edited so an unattended agent decides and records the decision in its report instead. `skills-plugin/NOTICE.md` lists every change and the pinned commits.

## Task board

Each run has a kanban board at `/runs/<id>/board`. The status page shows a summary bar that links to it. Cards come from the plan: PRD features (F-xx) and screens (S-xx), and the test plan's cases (TC-x) and smoke checks. Each card sits in one of five columns: **To do**, **In progress**, **Built**, **Verified** and **Failed**. Every move is recorded, with who made it and when, in the card's history and the activity feed.

Who moves cards:

| Mover | Move | How |
|---|---|---|
| Developer | Test cases → In progress | Automatic: a test case id appears in code the developer writes (tests are named `TC-3: …`) |
| Developer | Features and screens → In progress / Built | The developer calls the `update_tasks` tool, batched with other tool calls so it adds no turns |
| Development handoff | Test cases → Built (`testsWritten`); screens → Built (their URL); features → Built, unless listed in `knownGaps` | When the stage finishes |
| Verify gate | Test cases → Verified / Failed | From each test's result line in `tests.log` (TAP, spec reporters, bun, pytest -v), or from the whole suite passing |
| Verify gate | Smoke checks and screens → Verified / Failed | From HTTP and browser check results |
| Verify gate | Features → Verified / Failed | From their linked test cases |

Only the verify gate can move a card to Verified or Failed, so the board never shows an agent's claim as proven. Runs finished before the board existed are rebuilt from their stage folders the first time their board is opened. Board updates are reporting only: an error there is logged and never fails a build. Tables: `board_cards` and `board_events`.

## Budget and early stop

- `RUN_BUDGET_USD` (default **$15**) is a hard cap per prompt. A straight pass is allocated about $10.20, which leaves room for repair and fix rounds.
- Before each agent starts, the factory gives it `min(stage budget, available − reserve)` and holds that amount until the agent finishes, so parallel stages can never claim the same money. The Agent SDK enforces the allowance with `maxBudgetUsd`, so a stage stops partway through if it reaches its limit.
- **$1 is reserved for deployment repair.** If the budget runs out after the app exists, the factory skips the remaining review and fix work, redeploys the latest code and still ships it (`deployed_partial`). If the budget runs out before that, the run ends as `failed_budget`.
- Spend comes from the SDK's `total_cost_usd`, which is an estimate and not a bill. It is logged for every agent call in `ledger.jsonl`, and verify entries show $0. The SDK checks the limit between turns, so a stage can go slightly over by up to one model turn.
- There are also global limits: `DAILY_SPEND_CAP_USD` (which counts in-flight runs at full budget), `RUNS_PER_IP_PER_DAY` and `MAX_CONCURRENT_RUNS`.

## Inspecting a run

The portal's **Inspect agent reports** page shows each agent's report. Everything is stored on disk under `data/runs/<runId>/`:

```
SUMMARY.md            status, stop reason, cost per stage, links to reports
run.json  ledger.jsonl
prompt.md
stages/01-research/  02-requirements/ (REPORT.md is the PRD) …
  REPORT.md           written by the agent for people
  handoff.json        structured output passed to later agents
  input-prompt.md     exactly what the agent was asked
  transcript.jsonl    full SDK message stream (tool calls, results)
  meta.json           model, skills, effort, allowance, tokens, cost, outcome, resumed session
stages/06-verify/     written by the factory, not an agent
  REPORT.md           pass/fail per check, failure output
  handoff.json        the verify result repair agents receive
  tests.log  build.log  container.log
  <screen>-desktop.png  <screen>-mobile.png   screenshots from the browser checks
stages/07-review/ …  stages/08-testing-triage-1/ …  stages/09-development-fix-1/ …
workspace/            generated app; `git -C workspace log -p` shows one commit per stage
```

Agents receive only `handoff.json` from earlier stages, plus the workspace. They never see `REPORT.md`, so prose written for people doesn't feed back into the pipeline.

## Security model

- The verify gate runs generated test commands with `ANTHROPIC_API_KEY` removed from their environment.
- Agents run as an unprivileged user inside the `factory` container, which has **no Docker socket**. Their Bash commands cannot reach the host.
- Only the `deployer` sidecar holds the socket. It exposes four operations (build, run, check, logs), each scoped to one run id. Calls must carry a token that the deployer writes to the data volume, which app containers cannot read.
- Each app container is limited to 512 MB of memory, 1 CPU and 512 processes, and has its own `/data` volume.
- The portal has no login. Rate limits and the daily spend cap are what protect your API key. Put the portal behind your own auth before exposing it publicly.

## Development

```sh
bun install
bun test                        # budget allocator tests
bun run typecheck
ANTHROPIC_API_KEY=… bun packages/factory/src/server.ts   # API on :4000 (deployment needs the deployer)
cd packages/portal && bun run dev                         # portal on :5173, proxies /api
```

## Operations

- List deployed apps: `docker ps --filter label=factory.app=true`
- Remove an app: `docker rm -f factory-app-<runId> && docker volume rm factory-app-<runId>-data`
- If the factory restarts during a run, that run is marked failed. Queued runs resume automatically.
