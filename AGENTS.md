# AGENTS.md — ToggleTruth

Behavioral contract for agents working in this repository.

## Commands

- `npm install` — install TypeScript and Node types. No runtime dependencies.
- `npm run typecheck` — strict TypeScript check; must pass.
- `npm run build` — compile `src/` to `dist/`, mark the CLI executable.
- `npm test` — `node --test dist/*.test.js`; run after build.
- `npm run check` — typecheck, build, test, in that order. Required before commit.

## Style

- TypeScript strict, NodeNext modules, explicit `.js` extensions in imports.
- No runtime dependencies. Node 20+ built-ins only.
- `stats.ts` is a faithful port of upstream `api/experimentation/stats.py`. Do not
  introduce behaviour that differs from upstream without a documented reason and tests.
- API calls live in `client.ts`; rendering in `report.ts`; CLI parsing in `cli.ts`.
- No ANSI colour in the report. Keep every output line at 80 columns or fewer.

## Safety

- Never log, print or persist `FLAGSMITH_TOKEN` or an environment API key.
- `--demo` must stay in-process and must never contact a real Flagsmith instance.
- The tool is read-only. Do not add write operations without an explicit design change.
- `adaptPayload` must fail loudly on unknown shapes. Never guess statistical inputs.

## Tests

Write the failing test first and watch it fail for the expected reason. Cover the
ported formulas, every verdict branch, URL and auth header construction, payload
adaptation, and the demo exit codes. Assert on user-visible output and exit codes.

## Commits

Conventional commits (`feat:`, `fix:`, `docs:`, `test:`). One logical change per commit.
`npm run check` must be green before committing.
