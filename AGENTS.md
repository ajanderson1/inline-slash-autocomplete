# AGENTS.md
> Project-specific context.

## What this is
Pi extension that expands skills and prompt templates inside a draft, including at the start of later lines. First-line slash commands remain native; inline extension commands and built-ins are excluded.

## Stack constraints
- Runtime: Pi extension API (`@earendil-works/pi-coding-agent`).
- Module type: ESM (`"type": "module"`).

## Canonical commands
- dev: n/a (loaded by Pi host)
- build: n/a
- test: `npm test` (standalone Node assertions against the installed Pi host; no added test runner)
- lint: n/a
- format: n/a
- typecheck: n/a

## Where things live
- `index.ts` — autocomplete provider and content expansion.
- `editor.ts` — CustomEditor adapter with an isolated private autocomplete-trigger bridge.
- `inline-token.ts` — inline versus native slash-context detection.
- `tests/regression.mjs` — real-host editor regressions; fixtures use temporary files.
- `TESTING.md` — verification and compatibility limits.
- `docs/solutions/` — debugging learnings.

## Project glossary
- **Pi** — Earendil Works terminal coding agent.
