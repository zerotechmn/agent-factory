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
research ─► requirements ─► PRD gates ─► ┌ test cases   ┐ ─► ┌ development
                            │ architecture │    └ acceptance tests (independent tester)
                            └ UI/UX design ┘        │
     ┌────────────────────────────────────────────┘
     ▼
  verify (no LLM)  ∥  review          all green → live
     │ otherwise, up to 2 rounds:
     ├─ container won't build/start/answer → deployment repair agent
     ├─ broken layout in the browser         → fix (with the exact elements)
     ├─ tests (or blocking acceptance) fail  → test triage agent
     └─ app bugs, blocking review          → fix (resumes the developer's session)
        then verify ∥ re-review (diff only) again
```

| Stage | Kind | Model | Works in | Produces |
|---|---|---|---|---|
| Research | agent | Sonnet 5.5 | stage folder + web search/fetch | comparable products, common features, UI patterns, pitfalls, suggested MVP scope, sources |
| Requirements | agent | Sonnet 5.5 | stage folder | a PRD in the Feature + Screen template: features with Given/When/Then AC, business rules, screens, entities, roles and permissions |
| PRD check | agent | Sonnet 5.5 | stage folder | whether the PRD covers every request in the customer's prompt (and nothing unasked for). See *PRD gates* |
| Test cases | agent | Sonnet 5.5 | stage folder | Given/When/Then cases mapped to criteria, smoke checks |
| Architecture | agent | Opus 5.5 | stage folder | stack, file tree, data model, the API contract (request, response and errors per endpoint, auth per role, screen routes), commands, stylesheet location, Dockerfile plan |
| UI/UX design | agent | Opus 5.5 | stage folder | ZT: a template, components, actions and states per screen (`screens.json` contract). Custom: visual direction, design tokens, components, wireframes. See *Design systems* |
| Development | agent | Opus 5.5 | `workspace/` | the app, its tests (written test-first) and a Dockerfile. Larger apps are built in parts: a scaffold, one session per feature group, and a finish (see *Development in parts*) |
| Acceptance tests | agent, in parallel with development | Sonnet 5.5 | stage folder | black-box tests of the test plan, from the architecture's API contract only. See *Acceptance tests* |
| Verify | **code** | – | `workspace/` + deployer + headless Chromium | install + test suite, image build, container start, `/health`, GET smoke checks, browser checks of every screen, and the independent acceptance tests against a throwaway copy of the app. Costs $0; a green verify *is* the deployment |
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

### Acceptance tests

Before this, the developer wrote both the code and its tests, so "tests pass" meant it had graded its own work: misread a rule, and test and code agree on the wrong behaviour. Now an **independent acceptance tester** (Sonnet, about $0.6) turns the test plan into black-box tests while the developer builds, from the architecture's contract alone. The contract covers each endpoint's request, response and errors, how to act as each role, and screen routes. The tester never sees the code.

- **Stack-independent:** tests are plain `node:test` files in `acceptance/`, using a factory harness (`acceptance-harness/harness.mjs`). `api(method, path, { body, role })` handles each role's auth (header or login session), and `withPage(fn, { role })` runs a Playwright browser for the few flows that need one. Each test is named after its test case (`TC-3: …`).
- **Checked before use:** every file must pass `node --check`. If one fails, the tester's session is resumed once to fix it, and files that still don't parse are left out.
- **The developer can read them but never change them.** After every development, fix and deployment-repair stage, the factory restores anything changed under `acceptance/` and notes it in `SUMMARY.md`. Test triage may fix a test that contradicts the contract, never to match the app.
- **They run against a throwaway copy of the app.** It uses the same image, has no route and starts with a fresh `/data` (the deployer's `acceptance` instance), so test data never reaches the live app. The container is removed afterwards.
- **`ACCEPTANCE_MODE`:**
  - `advisory` (default): results appear in the verify report, on the task board (they decide test case cards) and in `SUMMARY.md`, without failing the build.
  - `blocking`: failures go to test triage and a fix round like any failed test.

  Switch to blocking once the benchmark shows the tests are reliable.

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

### PRD gates

Everything after the PRD (about $4.50 of design and development) is built from it, so a PRD that misses or misreads the request makes every later gate pass on the wrong app. Four checks run before the parallel stages start:

| Gate | Checks | Cost |
|---|---|---|
| Cross-references (code) | ID formats, duplicates, every reference resolves | Free |
| Testability (code) | Every feature has a positive acceptance criterion, and a negative one when it uses business rules; every rule has a worked example; every screen has loading and error states (screen states carry a language-independent `kind`, so this works for Mongolian PRDs) | Free |
| Scope (code) | At most 8 features, 10 screens and 50 acceptance criteria, about what one development session builds well (past runs: 6–7, 6–8, 31–41) | Free |
| Prompt coverage (`PRD check`, Sonnet) | Splits the customer's prompt into its requests, quoting their words, and marks each covered, partial, missing or deliberately out of scope; flags features nobody asked for | About $0.05–0.10, +30–60 s |

Problems get **one** resumed repair of the requirements session (about $0.10–0.30). Cross-reference problems are always repaired. The other three follow `PRD_GATES`: `advisory` (default) only reports them, in the PRD report, the PRD check report and `SUMMARY.md`; `repair` sends them back to the requirements agent too. Nothing here stops a run.

### Customer questions

Agents never wait for a person mid-session: an idle session's prompt cache expires, and the customer may not be watching. Instead, the researcher and the requirements agent end their stage with questions, and the **factory** pauses between stages and asks in the portal. The run shows as "Waiting for your answers", with a countdown.

| Checkpoint | Asks | Answers go to |
|---|---|---|
| After research | Up to 4 questions the prompt leaves open and research can't settle (who the users are, a key rule, essential versus later), each with 2–4 options and the researcher's suggestion | The requirements prompt, where they win over research and the agent's own guesses |
| After the PRD and PRD check | Decisions the requirements agent flagged for the customer (`askCustomer`, at most 5), the PRD check's gaps ("add it" / "leave it out") and unrequested features ("keep" / "remove"), next to a summary of features, screens and roles | The PRD gates' single repair round, as "Customer feedback" that wins over the agent's choices |

- **Skipped when empty:** a checkpoint without questions doesn't pause.
- **Answering:** the suggestion is preselected, so "Use the suggestions" or "Approve as is" is one click. "Other" and a free-text box take anything else. Answering continues the run at once.
- **Only while someone is watching** (`CUSTOMER_WAIT_ONLY_IF_WATCHING=on`, the default): every tab of a build's page tells the factory it's open (it polls the run every 2 seconds with `?watch=1`; the sidebar's recent-runs list doesn't count). If nobody has the build open when questions come up, the run continues at once with the agents' choices. If you leave the page during a wait, it continues within a minute. A background tab counts as away, because browsers pause its polling.
- **No answer:** after `CUSTOMER_TIMEOUT_MINUTES` (default 5) the run continues with the agents' choices. With the watching rule off, a timed-out first checkpoint also skips the second.
- **Cost:** waiting costs no tokens. Resuming the requirements session after more than 5 minutes rewrites its small cache (about $0.05–0.10).
- **Queue:** a waiting run keeps its run slot, so with `MAX_CONCURRENT_RUNS=1` the next run can wait behind it, at most about 10 minutes, and only while someone is answering.
- **Opting out:** `CUSTOMER_QUESTIONS=off` turns the checkpoints off. Runs created with `interactive: false` never pause; the benchmark sends this.
- **Record:** `SUMMARY.md` lists every question, its answer, and whether the customer or the agent decided.

### Feedback after deploy

A deployed app's status page has **Feedback on your app**. Sending it starts a feedback round, a revision of the same app at the same address, built from the run's stored data rather than from scratch.

1. **Spec:** a fresh requirements session updates the stored PRD from the feedback. It keeps unchanged items and IDs identical, so the factory can compute exactly what changed (`prdDiff`).
2. **PRD gates and confirmation:** the PRD gates run, and the customer sees "What will change" and confirms or adjusts it. The usual auto-continue applies.
3. **Downstream updates:** test cases, architecture, UI design and the acceptance suite each get their previous output plus the change list and return an updated version.
4. **Code:** the developer runs a change round (`REVISION_DEV_BUDGET_USD`, $2.50) in a **fresh session**, primed with the updated spec and contract and its own earlier handoff. Old agent sessions aren't reused: they live in the container and are lost on rebuilds, and resuming one hours later would rewrite its whole cache.
5. **Checks and review:** verify, fix rounds and review run as usual; review reads only the round's diff.
6. **Deploy with rollback:** the deployer keeps the image that was live as `:prev`. If the new version never passes `/health`, `/rollback` puts the previous one back, the round is marked failed, and the app stays live.

The task board moves changed features, screens and their tests back to To do. Each round has its own budget (`REVISION_BUDGET_USD`, default $5) on top of the run's, and is checked against the per-IP limit and the daily spend cap. An app can have at most `MAX_REVISIONS` (default 5) feedback rounds. Returning to a finished run's status page no longer redirects you to the app; the redirect only happens when a build finishes while you watch.

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

### Development in parts

One long development session re-reads its whole context on every turn: the spec, then all the code and tool output so far. Past sessions re-read 0.9–7.1 M cached tokens, and the last feature was built inside a context full of the first ones. So a larger app is built in parts, each a fresh session:

| Part | Stage label | Sees | Builds |
|---|---|---|---|
| Scaffold | `Development (scaffold)` | the architecture, the PRD's entities, roles and screen list, the UI design minus per-screen detail, the library index and stack lessons | the project and Dockerfile, the data layer for **every** entity, the server, auth, the app shell and menu, a placeholder route per screen, the test setup, an empty seed. Its `notes` are the conventions every feature session follows |
| Feature group | `Development (F-02+F-03)` | **only its slice**: its features, rules, screens, test cases, contract endpoints, entities and UI screens, plus the earlier parts' notes | its tests first, then its API and screens; seed records; the **full** suite and `browser_check` on its screens. `spec_get` / `spec_trace` reach anything outside the slice |
| Finish | `Development (finish)` | what each part built, every PRD screen, the commands | seed data for every screen, the full suite, `browser_check` on every screen, the README; the final commands and screen map |

- **How features are grouped** (`development.slices.ts`): features that share a screen go together, since they edit the same files. Order is Must → Should → Could, with at most 6 groups (the smallest merge into a neighbour). With fewer than `DEV_MIN_SLICES` groups (default 3), the app is built in one session as before; small apps don't pay for the overhead.
- **Prompt size:** on four past specs, a feature session starts with 9–25 k characters of prompt instead of 72–86 k.
- **Budget:** the development pool ($7) gives $1.50 to the scaffold, $1.00 to the finish, and $0.80–2.00 to each group, with a $0.40 minimum per part.
- **When a part fails or the money runs out:** if a group runs out of money, the later groups are skipped. The finish still runs, the missing features are listed in `knownGaps` and the stop reason, and the run ships as `deployed_partial`, never as fully deployed.
- **Downstream reads one merged handoff:** latest commands, latest path per screen, and all tests, files and gaps. Verify, review, the acceptance tests and fix rounds are unchanged.
- **Fix rounds** resume the finish session.
- **The board:** each feature part moves only its own features, screens and tests.
- **Restarts:** a restart reruns only the interrupted part.
- **Feedback rounds** stay single-session.
- **Unproven so far.** More sessions also mean more cache writes and more re-reading of existing code. `DEV_SLICING=off` restores the single session; compare the two with the benchmark before relying on it.

## Task board

Each run has a kanban board at `/runs/<id>/board`. The status page shows a summary bar that links to it. Cards come from the plan: PRD features (F-xx) and screens (S-xx), and the test plan's cases (TC-x) and smoke checks. Each card sits in one of five columns: **To do**, **In progress**, **Built**, **Verified** and **Failed**. Every move is recorded, with who made it and when, in the card's history and the activity feed.

Who moves cards:

| Mover | Move | How |
|---|---|---|
| Developer's stream | Test cases → In progress | A test case id appears in code the developer writes, through Write/Edit or a shell heredoc (tests are named `TC-3: …`) |
| Developer's stream | Test cases → Built / back to In progress | The developer's own test runs: per-test result lines, or a fully green total (`# pass 59 / # fail 0`), which proves every test written so far passes |
| Developer's stream | Features → In progress / Built | Follow their linked test cases |
| Development handoff | Test cases → Built (`testsWritten`); screens → Built (their URL); features → Built, unless listed in `knownGaps`. Built in parts, each feature part moves only its own features, screens and tests; scaffold and finish move no feature | When the stage (or part) finishes |
| Verify gate | Test cases → Verified / Failed | From each test's result line in `tests.log` (TAP, spec reporters, bun, pytest -v), or from the whole suite passing |
| Verify gate | Smoke checks and screens → Verified / Failed | From HTTP and browser check results |
| Verify gate | Features → Verified / Failed | From their linked test cases |

Everything is read from the message stream the factory already receives, so the board costs no tokens and asks nothing of the agents. Only the verify gate can move a card to Verified or Failed, so the board never shows an agent's claim as proven. Runs finished before the board existed are rebuilt from their stage folders the first time their board is opened. Board updates are reporting only: an error there is logged and never fails a build. Tables: `board_cards` and `board_events`.

### Live activity

While a run is in progress, the status page shows what each running agent is doing, in plain words, such as "Writing test/bookings.test.js, then running the tests" or "Test run: 6 passing, 7 failing". It also shows each agent's elapsed time and a one-line description of its job. The lines come from the agents' tool calls and the verify gate's steps (`pipeline/pipeline.activity.ts`). They are kept in memory only, since every action is also in `transcript.jsonl`.

## Librarian

Agents share a **librarian**, an in-process MCP server (`packages/factory/src/librarian/`). It gives them four kinds of knowledge, so they guess less and repeat fewer mistakes from earlier runs:

| Tools | Knows | Stages |
|---|---|---|
| `spec_get`, `spec_trace` | This run's PRD, test plan and architecture by id (F-03, AC-F03-02, S-02, BRL-01, TC-7, an endpoint's operationId), and what each item links to, with task board status | development, fix, review, test triage |
| `lessons_search` | Problems earlier runs hit, their root causes and the fixes that made verify pass | architecture, development, fix, test triage, deployment repair |
| `docs_search`, `docs_read` | Version-pinned docs: antd@6, `@ant-design/icons`@6 (every real icon name), react-router@6, vite@6, vitest@3, express@4, better-sqlite3@11, dayjs@1, supertest@7, node:test@22, and the ZT design system by section | architecture, UI/UX design, development, fix, review |
| `catalog_search`, `catalog_get` | Reviewed modules from earlier green apps; `catalog_get` copies one into the workspace and never overwrites files | architecture, development |

The acceptance tester gets no librarian on purpose: it works from the architecture's contract alone.

**Push where the factory knows the need, pull where only the agent does.** Asking costs a turn, and agents rarely ask, so the factory hands knowledge over itself whenever it can tell what's needed. Pushes cost no extra turn:

| When | What the factory hands over |
|---|---|
| Architecture starts | The documented libraries and their majors, with "prefer these and pin the major" (so the developer's docs match its code), the catalog list, and the top 3 container lessons |
| First build starts | The top 5 lessons ranked by this run's stack (Express, antd, Vite… from the architecture), and the catalog list |
| Fix, test triage or deployment repair starts | Up to 3 lessons matching the exact failure (failed steps plus the meaningful log lines, with paths and numbers stripped) |
| A command fails mid-session | Up to 2 matching lessons, attached to that command's output with an SDK `PostToolUse` hook |
| A file first imports a documented library | The ids of that component's or hook's doc sections (e.g. `antd@6/table#api`), attached the same way |

Hook notes start with "Librarian:", are capped at 1,200 characters, fire at most once per distinct failure or import, and at most 6 times per session. Pulls follow concrete rules in the system prompt: search lessons before debugging, docs before using a library API not yet used in that step, the catalog before writing an app shell, page or Dockerfile, and spec ids before relying on them. Each tool result names the next useful tool.

- **Lessons cost no extra agent call.** Fix, test triage and deployment repair agents add `lessons` to the output they already return. The factory stores a lesson only after a later verify (or review) shows that check now passes. Lessons whose check still fails are dropped. A lesson seen again in another run is counted, not duplicated.
- **Lessons hold engineering knowledge only.** They are shared with every future run, so the schema asks for general wording, and lessons that quote five or more consecutive words of the user's prompt are skipped. Set `LIBRARIAN_LESSONS=off` to stop storing new ones.
- **Docs** are fetched at pinned refs with `bun packages/factory/scripts/librarian-sync-docs.ts [library…]`, committed under `packages/factory/librarian/docs/` (sources and licences in `SOURCES.md`), and split into sections small enough to return whole. The ZT design system skill is indexed from `skills-plugin/` as library `zt-design-system`. The index rebuilds on startup only when the files change. Doc search matches word prefixes ("search" finds `SearchOutlined`). Lesson search matches whole words only, so loose matches don't reach a repair prompt.
- **The catalog only contains reviewed code.** `bun packages/factory/scripts/librarian-promote.ts <runId> <name> <path>…` copies files from a fully `deployed` run into `packages/factory/librarian/catalog/<name>/` as a draft. Drafts (`Status: draft` in the README) are not indexed until someone makes the code generic, writes the README and removes that line.
- **Cost guardrails.** Every call is one more agent turn, so results are capped at 3,000 characters and each step has a call limit (20 for development, 8 for the others). The system prompt asks agents to batch lookups in one turn. Each stage's tool list is fixed, which keeps the prompt cache warm. Lookups themselves take under a millisecond (SQLite FTS5).
- **Seeing it work.** Every lookup and push is logged in `library_queries`: `auto:lessons` and `auto:catalog` for prompt pushes, `auto:hook-lessons` and `auto:hook-docs` for hook notes, and `limit` when a call hit the step's cap. The Librarian table in `SUMMARY.md` shows per stage what agents asked, how many asks found something, how many pushes had content, and how often the cap was hit. Set `LIBRARIAN=off` to run without it.

**In the portal.** Two read-only pages show customers that the library exists and is used:
- `/librarian` ("What the factory knows"): documentation per library, the proven modules, the lessons with cause, fix and how many builds they were seen in, and overall counts.
- `/runs/<id>/librarian` ("How this build used the library"): every lookup an agent made and everything the factory handed over, with what came back named in words (e.g. "antd@6 › table › API", a lesson's problem), per-stage counts, and the lessons that build taught the factory. The run status page links to it, with a one-line summary.

The portal has no login, so the global page shows only shared knowledge and totals, never another run's queries or ids. A run's lookups appear only under that run's id, like its board and reports. API: `GET /api/librarian` and `GET /api/runs/:id/librarian` (`src/librarian/librarian.routes.ts`). Each logged lookup stores refs to what it returned (`results`: `lesson:<id>`, `doc:<id>`, `catalog:<name>`, `spec:<id>`). Rows logged before that column existed show counts only.

Tables: `library_lessons`, `library_docs`, `library_catalog` (each with an FTS5 index), `library_index_meta`, `library_queries`.

## Benchmark

Factory changes are judged on a fixed set of 6 varied prompts (`packages/factory/benchmark/prompts.json`), not single runs:
- a car rental marketplace
- a Mongolian order-approval workflow with 4 roles
- an inventory dashboard
- a habit tracker
- HR leave requests
- a recipe box

```bash
# from the repo root; BENCHMARK_TOKEN (16+ chars) set in .env for the factory and in this shell
bun packages/factory/scripts/benchmark.ts run baseline-v1          # real spend: about $35, runs one at a time
bun packages/factory/scripts/benchmark.ts report next baseline-v1  # compare two benchmarks
```

`run` submits the prompts through the API and waits for them. The token skips the per-IP run limit, but not the daily spend cap. `report` reads the run folders and the database without changing them (while a factory is running it reads the safe snapshot `data/backups/latest.sqlite`, up to 10 minutes old, never the live file; see *Database safety*), and writes `data/benchmarks/<label>.md`:
- deployed count and acceptance pass rate (independent)
- verify passed first time, and fix rounds
- mean and total cost, run time, and development time
- per run: acceptance coverage, blocker and major review findings, librarian calls

## Cancel, delete and recent builds

- **Cancel** (status page, or `POST /api/runs/:id/cancel`):
  - **Queued:** the build never starts.
  - **Running:** the agent session in progress is aborted at once. The pipeline also checks between stages and while waiting for your answers, and the build ends as `cancelled` with nothing more spent. A verify step in progress finishes its current check first.
  - **Feedback round:** cancelling one keeps the previous version live (rolled back if verify had already replaced it).
- **Delete** (status page, or `DELETE /api/runs/:id`), for finished or cancelled builds only:
  - the deployer's `/destroy` removes the app's containers, images and data volume
  - the factory deletes the run folder and the run's rows in every table, in one transaction in its own process
  - lessons stay
- **Who can do this:** anyone with the build's link, the same rule as viewing it. Run IDs are 10 random characters.
- **Recent builds:** the front page lists the builds started from this browser (kept in this browser only, since the portal has no login), and opens any build from a pasted ID or link.
- **Never edit `data/factory.sqlite` from the Mac while the factory runs.** SQLite's locking doesn't work across Docker Desktop's file sharing, and two writers corrupt the file; this happened once. Use these features, or stop the factory first.

## Budget and early stop

- `RUN_BUDGET_USD` (default **$15**) is a hard cap per prompt. A straight pass is allocated about $10.20, which leaves room for repair and fix rounds.
- Before each agent starts, the factory gives it `min(stage budget, available − reserve)` and holds that amount until the agent finishes, so parallel stages can never claim the same money. The Agent SDK enforces the allowance with `maxBudgetUsd`, so a stage stops partway through if it reaches its limit.
- **$1 is reserved for deployment repair.** If the budget runs out after the app exists, the factory skips the remaining review and fix work, redeploys the latest code and still ships it (`deployed_partial`). If the budget runs out before that, the run ends as `failed_budget`.
- **$1.50 is reserved for the first fix round.** Spec, design, the first build and the first review can't spend it, so a run that spends heavily on its first build still fixes what verify finds instead of shipping it. Earlier runs stopped "before Fix 1" for exactly this reason. Fix rounds, test triage and re-reviews may use it; only deployment repair may use the deploy reserve. A feedback round holds a fifth of its smaller budget instead.
- Spend comes from the SDK's `total_cost_usd`, which is an estimate and not a bill. It is logged for every agent call in `ledger.jsonl`, and verify entries show $0. The SDK checks the limit between turns, so a stage can go slightly over by up to one model turn.
- There are also global limits: `DAILY_SPEND_CAP_USD` (which counts in-flight runs at full budget), `RUNS_PER_IP_PER_DAY` and `MAX_CONCURRENT_RUNS`.
- The portal's **Ask** tab answers questions about a run with `CHAT_MODEL` (default `claude-opus-5-5`), reading the run's request, stages and reports. Its spend counts against `DAILY_SPEND_CAP_USD`, and `CHAT_MESSAGES_PER_IP_PER_DAY` (default 100) limits how much one visitor can ask.

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
bun run test                    # factory unit tests, against a throwaway database (bare `bun test` at the root is refused)
bun run typecheck
ANTHROPIC_API_KEY=… bun packages/factory/src/server.ts   # API on :4000 (deployment needs the deployer)
cd packages/portal && bun run dev                         # portal on :5173, proxies /api
```

## Operations

- List deployed apps: `docker ps --filter label=factory.app=true`
- Remove an app: `docker rm -f factory-app-<runId> && docker volume rm factory-app-<runId>-data`
- **Restarts don't lose runs.** A run in progress when the factory stops (a rebuild, a crash, `docker compose restart`) goes back to the front of the queue and resumes:
  - every agent step that had finished is replayed from its stage folder (`handoff.json`, `meta.json`) instead of being run and paid for again
  - the step that was cut off runs again from its start, after its half-written files are dropped (`git reset --hard` + `git clean` in the workspace; ignored files such as `node_modules` stay)
  - verify always runs for real (it is free, and it restarts the container)
  - customer questions already answered are not asked again, and an open checkpoint keeps the deadline the customer was shown
  - spend already made counts against the budget as before

  A run the factory keeps dying on is failed after `MAX_RESUMES` restarts (default 2) instead of looping. Feedback rounds are not resumed: the previous version stays live, as before. Queued runs start automatically after a restart.

### Database safety

The factory's SQLite database (`data/factory.sqlite`) runs in WAL mode, which only works when every process using it is on the same machine. A factory in Docker and anything on the Mac opening the same file (a second factory, a script, the `sqlite3` CLI) can corrupt it; one run ended with `database disk image is malformed`. So:
- **One factory per data folder.** On start the factory claims `data/factory.lock` and refreshes it every 10 s. A second factory pointed at the same folder refuses to start and names the one holding it. A crashed factory's lock goes stale after 35 s.
- **Read the snapshot, never the live file.** Every 10 minutes the factory writes `data/backups/latest.sqlite`, a complete standalone copy (`VACUUM INTO`, no WAL) that is safe to open from anywhere, and keeps one copy per hour for two days (`data/backups/factory-YYYYMMDDHH.sqlite`). For live queries use `docker compose exec factory sqlite3 /data/factory.sqlite`.
- **Integrity check on start.** A damaged database is reported loudly in the log. To recover, stop the factory, move `factory.sqlite*` aside, copy a backup to `data/factory.sqlite` and start again.
