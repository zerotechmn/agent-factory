# Vendored skills

These skills are loaded by the factory's agents as a local Claude Code plugin named `factory` (see `pipeline.stage-runner.ts`). Each agent gets only the skills listed for its stage in `pipeline.constants.ts`.

| Skill | Source | Commit | Licence |
|---|---|---|---|
| test-driven-development | [obra/superpowers](https://github.com/obra/superpowers) `skills/test-driven-development` | `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` | MIT, `LICENSES/superpowers-LICENSE` |
| systematic-debugging | [obra/superpowers](https://github.com/obra/superpowers) `skills/systematic-debugging` | same | MIT |
| verification-before-completion | [obra/superpowers](https://github.com/obra/superpowers) `skills/verification-before-completion` | same | MIT |
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills) `skills/frontend-design` | `ca45fc496a3436251f191354091d557da31c15b5` | Apache-2.0, `LICENSES/frontend-design-LICENSE.txt` |
| web-interface-guidelines | [vercel-labs/web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) `command.md` | `434b7f91364665f2f733b310ec54809bf8f37937` | MIT, `LICENSES/web-interface-guidelines-LICENSE` |
| zt-design-system | Zerotech internal: `zt-design-system.md` v2.0 (Ant Design 6), supplied by the factory owner | — | Zerotech proprietary, internal use |

## Changes from upstream

The agents run unattended, so steps that wait on a person were rewritten to "decide and record it in your report":

- **test-driven-development/SKILL.md:** the three "ask your human partner" escalations (exceptions, when stuck, final rule).
- **systematic-debugging/SKILL.md:** "Ask for help" and "Discuss with your human partner" now mean recording the question in the report. The "your human partner's Signals You're Doing It Wrong" section is removed, because it describes cues from a live human that never arrive. Cross-references now say `factory:` instead of `superpowers:`.
- **systematic-debugging/:** upstream's `CREATION-LOG.md` and `test-*.md` (the author's material for testing the skill itself) are not vendored.
- **frontend-design/SKILL.md:** "confirm with the client" now says to record the interpretation in the report.

- **web-interface-guidelines/SKILL.md:** upstream is a review command (`command.md`), so its "## Rules" section is kept as-is under a new skill header that covers both building and reviewing, with a severity rule for the factory's reviewer. The "Output Format" section (editor-oriented) is dropped. Rule edits: "Title Case for headings/buttons (Chicago style)" now defers to the UI/UX design and defaults to sentence case, matching frontend-design and non-English UIs. `htmlFor` becomes `for`/`htmlFor`. `hover:` becomes "a hover state". "Hydration Safety" is marked as server-rendered frameworks only. "Text containers handle long content" is made specific (`overflow-wrap: break-word`, on user-text elements only) and two rules are added after it: never `overflow-wrap: anywhere`/`word-break: break-all` on body or layout containers, and `nowrap` + `flex-shrink: 0` for short labels in a row. Added after run gt29eh7rws, where a global `body { overflow-wrap: anywhere }` split header words mid-letter.

- **zt-design-system/SKILL.md:** the source file is kept verbatim below a "Factory overrides" section: no Figma (step 9, §15 and the `figma` field are skipped), UI language follows the prompt and PRD instead of Mongolian-by-default, mobile only when the PRD asks, `operationId` from the architecture's endpoints, and `NEW-COMPONENT?`/change requests are recorded in output instead of asked about. To update, replace everything below the overrides with the new version.

To update the open-source skills, re-download from the source paths at a newer commit, re-apply the changes above, and update the commit column.
