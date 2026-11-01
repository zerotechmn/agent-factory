# Vendored skills

These skills are loaded by the factory's agents as a local Claude Code plugin named `factory` (see `pipeline.stage-runner.ts`). Each agent gets only the skills listed for its stage in `pipeline.constants.ts`.

| Skill | Source | Commit | Licence |
|---|---|---|---|
| test-driven-development | [obra/superpowers](https://github.com/obra/superpowers) `skills/test-driven-development` | `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b` | MIT, `LICENSES/superpowers-LICENSE` |
| systematic-debugging | [obra/superpowers](https://github.com/obra/superpowers) `skills/systematic-debugging` | same | MIT |
| verification-before-completion | [obra/superpowers](https://github.com/obra/superpowers) `skills/verification-before-completion` | same | MIT |
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills) `skills/frontend-design` | `ca45fc496a3436251f191354091d557da31c15b5` | Apache-2.0, `LICENSES/frontend-design-LICENSE.txt` |

## Changes from upstream

The agents run unattended, so steps that wait on a person were rewritten to "decide and record it in your report":

- **test-driven-development/SKILL.md:** the three "ask your human partner" escalations (exceptions, when stuck, final rule).
- **systematic-debugging/SKILL.md:** "Ask for help" and "Discuss with your human partner" now mean recording the question in the report. The "your human partner's Signals You're Doing It Wrong" section is removed, because it describes cues from a live human that never arrive. Cross-references now say `factory:` instead of `superpowers:`.
- **systematic-debugging/:** upstream's `CREATION-LOG.md` and `test-*.md` (the author's material for testing the skill itself) are not vendored.
- **frontend-design/SKILL.md:** "confirm with the client" now says to record the interpretation in the report.

To update, re-download from the source paths at a newer commit, re-apply the changes above, and update the commit column.
