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
research ─► requirements ─► ┌ test cases ┐ ─► development
                            └ design     ┘        │
     ┌────────────────────────────────────────────┘
     ▼
  verify (no LLM)  ∥  review          all green → live
     │ otherwise, up to 2 rounds:
     ├─ container won't build/start/answer → deployment repair agent
     ├─ tests fail                         → test triage agent
     └─ app bugs, blocking review          → fix (resumes the developer's session)
        then verify ∥ re-review (diff only) again
```

| Stage | Kind | Model | Works in | Produces |
|---|---|---|---|---|
| Research | agent | Sonnet 5.5 | stage folder + web search/fetch | comparable products, common features, UI patterns, pitfalls, suggested MVP scope, sources |
| Requirements | agent | Sonnet 5.5 | stage folder | a PRD in the Feature + Screen template: features with Given/When/Then AC, business rules, screens, entities, roles and permissions |
| Test cases | agent | Sonnet 5.5 | stage folder | Given/When/Then cases mapped to criteria, smoke checks |
| Design | agent | Opus 5.5 | stage folder | stack, file tree, data model, API, commands, visual direction, Dockerfile plan |
| Development | agent | Opus 5.5 | `workspace/` | the app, its tests (written test-first) and a Dockerfile |
| Verify | **code** | – | `workspace/` + deployer | install + test suite, image build, container start, `/health`, GET smoke checks. Costs $0; a green verify *is* the deployment |
| Review | agent | Sonnet 5.5 | `workspace/` (read-only) | findings by severity, criterion coverage; re-reviews read only the diff |
| Test triage | agent, on failure | Sonnet 5.5 | `workspace/` (test files only) | fixes broken tests, reports real app bugs |
| Deployment repair | agent, on failure | Sonnet 5.5 | `workspace/` + Docker tools | fixed Dockerfile/start config, running container |
| Fix | agent, on failure | Opus 5.5 | `workspace/` | fixes app bugs and blocking findings, resuming the developer's session |

How the design saves money and time:
- **Plain code does the mechanical checks.** Running tests, building the image and hitting `/health` are yes/no facts, so the verify gate does them for free. The testing and deployment agents only run when something is broken.
- **Independent stages run in parallel:** test cases with design, and verify with review.
- **Fix rounds resume the developer's session** (forked, so the original transcript stays intact), so they start with the code already in context instead of re-reading it. If resuming fails, the fix falls back to a fresh session.
- **Models are tiered.** Sonnet does documents and judgement, Opus does design and code. Set `FACTORY_MODEL` to force one model everywhere, for example a cheap model when testing the pipeline.
- **Document stages skip the Claude Code system prompt.** They get a short role prompt instead, which saves its tokens on every turn.

Research is optional: if it fails, requirements are written from the prompt alone. The agents can use any web stack that runs on the runtimes in the factory image (Node, Bun, Python, Go). Every app has to meet one contract: a single Dockerfile, listening on `$PORT`, with `GET /health` returning 200.

Configuration lives in `packages/factory/src/pipeline/pipeline.constants.ts`. That file sets each stage's model, skills, budget, effort, turn limit and timeout. Agent prompts and output schemas are in `packages/factory/src/agents/<stage>/`, and the verify gate is `packages/factory/src/pipeline/pipeline.gate.ts`.

### PRD (requirements)

The requirements agent writes a PRD following *PRD Template v2 (Feature + Screen)*, using its IDs (`F-xx`, `AC-Fxx-yy`, `BRL-xx`, `S-xx`, `ENT-xx`, …) and its central rule: logic lives in features and business rules, and screens only reference them.

- **The agent only fills in structured data** (`requirements.schema.ts`). The factory renders `REPORT.md` in the template's layout, with its section numbers and column names (`requirements.report.ts`), so the model never spends tokens on formatting. The permission matrix (§3) and traceability matrix (§18) are built from the IDs.
- **Cross-references are checked by code** (`requirements.validate.ts`): ID formats, duplicates, acceptance criteria naming their feature, and every feature, screen, rule and role reference resolving. If anything is broken, the requirements session is resumed once to fix it (the `requirements (repair)` stage). Anything left over is listed at the end of the PRD.
- **Each later agent gets only its slice** (`requirements.utils.ts`): test cases get features, AC, rules, permissions and screen states; design gets entities, screens and roles; review gets AC, rules and permissions. Only development gets the whole PRD.
- **Sections that need a human process are omitted:** approvers, success metrics, deployment, UAT, sign-off, and real external integrations (apps are self-contained). Open questions become decisions the agent took, with its reasons.
- The PRD is written in the language of the user's prompt.

### Skills

Agents use proven engineering skills, vendored in `packages/factory/skills-plugin/` and loaded as a local plugin. Each agent sees only its own skills.

| Skill | Source | Used by |
|---|---|---|
| test-driven-development | [obra/superpowers](https://github.com/obra/superpowers) (MIT) | development, fix |
| verification-before-completion | obra/superpowers (MIT) | development, fix |
| systematic-debugging | obra/superpowers (MIT) | fix, test triage |
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills) (Apache-2.0) | design, development, fix |

The upstream skills ask a human at a few decision points. The vendored copies are edited so an unattended agent decides and records the decision in its report instead. `skills-plugin/NOTICE.md` lists every change and the pinned commits.

## Budget and early stop

- `RUN_BUDGET_USD` (default **$15**) is a hard cap per prompt. A straight pass is allocated about $9.60, which leaves room for repair and fix rounds.
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
