# Software Factory

Type a prompt and get a deployed web app. Seven Claude agents (requirements, test cases, design, development, review, testing, deployment) work in a pipeline with a hard per-prompt budget, and every step leaves a record you can read.

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

| # | Agent | Works in | Produces |
|---|---|---|---|
| 1 | Requirements | its stage folder | user stories, acceptance criteria, non-goals |
| 2 | Test cases | its stage folder | Given/When/Then cases mapped to criteria, smoke checks |
| 3 | Designer | its stage folder | stack, file tree, data model, API, commands, Dockerfile plan |
| 4 | Developer | `workspace/` | the app, its tests and a Dockerfile |
| 5 | Reviewer | `workspace/` (read-only) | findings by severity, criterion coverage |
| 6 | Tester | `workspace/` (test files only) | pass/fail for each test case, smoke checks |
| 7 | Deployer | `workspace/` + Docker tools | running container, health result |

If review finds blockers or tests fail, the developer gets up to 2 fix rounds, and each round is reviewed and tested again. The agents can use any web stack that runs on the runtimes in the factory image (Node, Bun, Python, Go). Every app has to meet one contract: a single Dockerfile, listening on `$PORT`, with `GET /health` returning 200.

Configuration lives in `packages/factory/src/pipeline/pipeline.constants.ts`. That file sets each stage's budget, effort, turn limit and timeout. Agent prompts and output schemas are in `packages/factory/src/agents/<stage>/`.

## Budget and early stop

- `RUN_BUDGET_USD` (default **$15**) is a hard cap per prompt.
- Before each agent starts, the factory gives it `min(stage budget, remaining − deploy reserve)`. The Agent SDK enforces that amount with `maxBudgetUsd`, so a stage stops partway through if it reaches its limit.
- **$1.50 is reserved for deployment.** If the budget runs out after the app exists, the factory skips the remaining review and fix work and still ships it (`deployed_partial`). If the budget runs out before that, the run ends as `failed_budget`.
- Spend comes from the SDK's `total_cost_usd`, which is an estimate and not a bill. It is logged for every agent call in `ledger.jsonl`. The SDK checks the limit between turns, so a stage can go slightly over by up to one model turn.
- There are also global limits: `DAILY_SPEND_CAP_USD` (which counts in-flight runs at full budget), `RUNS_PER_IP_PER_DAY` and `MAX_CONCURRENT_RUNS`.

## Inspecting a run

The portal's **Inspect agent reports** page shows each agent's report. Everything is stored on disk under `data/runs/<runId>/`:

```
SUMMARY.md            status, stop reason, cost per stage, links to reports
run.json  ledger.jsonl
prompt.md
stages/01-requirements/
  REPORT.md           written by the agent for people
  handoff.json        structured output passed to later agents
  input-prompt.md     exactly what the agent was asked
  transcript.jsonl    full SDK message stream (tool calls, results)
  meta.json           model, effort, allowance, tokens, cost, outcome
stages/05-review/ …  stages/07-development-fix-1/ …
workspace/            generated app; `git -C workspace log -p` shows one commit per stage
```

Agents receive only `handoff.json` from earlier stages, plus the workspace. They never see `REPORT.md`, so prose written for people doesn't feed back into the pipeline.

## Security model

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
