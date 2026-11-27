# Flagsmith codebase analysis + FlagOps design proposal

Prepared 2026-11-27. Repo analysed at commit `f4de7145` (2026-11-27), version `2.295.2`.

---

## 0. Scope and honesty

I cloned the upstream repository to `/home/dutta/.hermes/cache/scratch/flagsmith-source`
(4,359 files, 88 MB). I did **not** read every file — that would be 2,065 files under
`api/`, 1,749 under `frontend/`, 418 under `docs/`, every migration and every test.
I opened roughly 25 files chosen to answer four questions: how the repo is governed,
how CI enforces quality, how a feature flag is actually modelled and mutated, and
what the MCP/SDK surfaces are. Everything below cites a file I actually opened.
Anything I inferred is marked as such. Build, test and Docker commands were **not
run** against the upstream repo — Docker is not installed on this machine.

---

## 1. Repo map (observed)

| Path | Files | What it is | Evidence |
|---|---:|---|---|
| `api/` | 2,065 | Django + DRF backend, management API, all domain apps | `api/README.md`, `api/features/`, `api/environments/` |
| `frontend/` | 1,749 | Next.js/Rspack dashboard, Jest + Playwright E2E/visual tests | `frontend/package.json`, `frontend/AGENTS.md` |
| `docs/` | 418 | docs.flagsmith.com source | root `AGENTS.md` |
| `mcp/` | 30 | Python FastMCP server, generated from the OpenAPI spec | `mcp/src/flagsmith_mcp/server.py`, `mcp/pyproject.toml` |
| `sdk/` | 3 | Only `openapi.yaml` + two JSON contracts — SDKs live in separate repos | `ls sdk` |
| `experimentation/` | 2 dirs | `clickhouse/` and `postgres/` analytics definitions | `ls experimentation` |
| `docker/` | 3 | container assets | `docker-compose.yml` |
| root | — | `openapi.yaml` (~31k lines), `Makefile`, `.pre-commit-config.yaml`, `CODEOWNERS` | direct reads |

**Entrypoints:** `api/manage.py`, `api/app/`, `frontend/api/index` (via `npm start`),
`flagsmith-mcp = flagsmith_mcp.server:run`.
**Contracts:** `openapi.yaml` at root is the public API contract; `sdk/openapi.yaml` is
the filtered SDK contract; `mcp/src/flagsmith_mcp/openapi.json` is the bundled spec the
MCP server generates tools from.
**CI:** 21 workflows under `.github/workflows/`, including `platform-pull-request.yml`,
`mcp-pull-request.yml`, `api-pull-request.yml`, `frontend-pull-request.yml`.

---

## 2. Reading path (the order I actually used)

1. `AGENTS.md` (root) — 11 lines. Sets two rules that govern everything: **use British
   English**, and an `AGENTS.local.md` takes priority if present (it is not present
   in this checkout). It delegates to `api/README.md`, `frontend/README.md`,
   `docs/README.md`, `mcp/README.md`.
2. `.github/workflows/platform-pull-request.yml` — before writing any code, see what
   CI does. It builds seven Docker targets (unified, api, frontend, api-test,
   private api-test, e2e, private cloud), runs E2E on x86 and ARM runners, adds a
   conventional-commit label from the PR title, and gates privileged jobs behind a
   write-permission check for outside contributors. That last detail matters for you:
   an outside PR gets the ephemeral/safe path automatically.
3. `.github/workflows/mcp-pull-request.yml` — runs, in `mcp/`: `make install`,
   `make typecheck`, `make test`.
4. `Makefile` (root) and `api/Makefile`, `mcp/Makefile` — root delegates `install`
   and `lint` to api/docs/frontend; `make docker-up` is just `docker compose up -d`.
5. `api/README.md` — the real engineering standard. **100% diff test coverage is
   required on backend PRs.** Tests are split into black-box `tests/integration` and
   unit `tests/unit`, use Given/When/Then, avoid test classes, and must be named
   `test_{subject}__{condition}__{expected outcome}`. It also defines metric naming
   (`flagsmith_{domain}_{entity}_{unit}`) and structured logging conventions.
6. `api/features/feature_states/models.py` + `api/features/serializers.py` — the data
   model: a feature value is typed (`string`, `integer`, `boolean`) with three separate
   DB columns and a `set_value()` validator.
7. `api/features/urls.py`, `api/environments/urls.py`, `api/features/views.py` — routing
   and permissions: `BaseFeatureStateViewSet` uses `IsAuthenticated` +
   `NestedEnvironmentPermissions`, and saving a feature state dispatches a VCS
   change event.
8. `mcp/src/flagsmith_mcp/server.py` + `config.py` — the MCP server is not hand-written
   tools: it is `FastMCP.from_openapi()` over a bundled spec, with route maps that
   expose only endpoints tagged `mcp` as tools and exclude everything else. HTTP
   method becomes an annotation (`readOnlyHint`, `destructiveHint`, `idempotentHint`).
   It adds Prometheus metrics, OTel tracing, Sentry, and OAuth fallback.
9. `frontend/package.json` + `.pre-commit-config.yaml` + `CODEOWNERS` — tooling and
   ownership. `mcp/` is owned by the backend team, not a separate MCP team.

---

## 3. Glossary (with source)

- **Feature** — a flag definition at project level; has `id`, `name`, `type`
  (`STANDARD` or `MULTIVARIATE`). Source: `openapi.yaml` `/api/v1/flags/` schema.
- **Feature state** — the value+enabled pair for a feature in one environment (and
  optionally one identity or segment). Source: `api/features/views.py:704-708`.
- **Typed value** — `string` / `integer` / `boolean` stored in three columns with a
  `type`; `set_value()` validates before writing. Source: `feature_states/models.py`.
- **Environment API key** — identifies an environment to SDK endpoints; distinct
  from the **Master API Key**, which authenticates management endpoints. Source:
  `mcp/config.py` docstrings and `openapi.yaml` security schemes.
- **Identity** — the user/visitor key; exposures and conversions are joined on it.
- **NestedEnvironmentPermissions** — DRF permission class guarding environment-scoped
  feature-state routes. Source: `api/features/views.py:710`.
- **VCS** in this repo means *version control/change tracking of feature states*, not
  "version control system": `dispatch_vcs_on_feature_state_changed()` fires on save.
  Source: `api/features/serializers.py:703-708`. This was an inference from the code
  name; I did not open the implementation.
- **Task processor** — separate service for async work; `docker-compose.yml` runs it
  on port 8001 when `TASK_RUN_METHOD=TASK_PROCESSOR`.
- **Warehouse** — analytics store for experimentation; the compose file enables
  experimentation against Postgres for local use and recommends a dedicated
  warehouse in production. Source: `docker-compose.yml:37-39`.

---

## 4. Risks and unknowns (observed vs inferred)

**Observed**
- No Docker on this machine, so the upstream self-host stack and my own compose file
  cannot be executed here. Any claim about them working would be unverified.
- The OpenAPI spec exposes both `/api/v1/features/featurestates/` (management) and
  nested `/api/v1/environments/{api_key}/featurestates/` routes; the serializer's
  `feature` field is a primary key, so a human-readable flag list must join feature
  IDs against `/api/v1/projects/{id}/features/`. Source: `api/features/serializers.py:684-687`,
  `api/projects/urls.py` (`projects_router.register(r"features", FeatureViewSet)`).
- Backend PRs need 100% diff coverage; MCP needs 100% total coverage. A contribution
  to upstream would be held to that bar. Source: `api/README.md`, `mcp/pyproject.toml`.

**Unknowns / need live verification**
- Exact JSON envelope for the nested featurestates list (paginated vs plain) — the
  root spec says paginated for the management route; I could not exercise a live
  instance.
- Whether a Master API Key can call every route my tool uses on a fresh self-hosted
  install without extra enterprise configuration.
- Which parts of the API are gated by the enterprise/workflows plugins
  (`settings.WORKFLOWS_LOGIC_INSTALLED` appears in `api/features/urls.py`).

**Decision I made that is yours to change:** I set the new project's licence to MIT.
Flagsmith core is BSD-3-Clause; if you want to upstream anything, MIT-compatible is
fine, but this is your call.

---

## 5. What this means for Track 03

The judging signals for Track 03 are: self-hosted Flagsmith, integrations/plugins,
developer tools, and "easy for others to reuse". The tip says getting Flagsmith
running is the *start*, not the project, and to build the thing you wished existed
while setting it up.

The upstream repo confirms the gap. There is a polished web dashboard (`frontend/`),
a CLI, and an MCP server — but no first-class terminal surface for watching and
toggling flags across environments while you work. A TUI is also the smallest
surface I can actually verify here without Docker or a browser.

### Proposal: **FlagOps** — a terminal control room for Flagsmith

**User and value.** A developer self-hosting Flagsmith who is shipping a flagged
change. Today: switch to browser, find project, find environment, find flag, toggle.
With FlagOps: one command in the terminal, same information density as `k9s`, flag
state and experiment tags visible across environments, toggles in place.

**Success metric for the hackathon demo.** A judge can, from a cold terminal, run one
command, see flags from a self-hosted instance, toggle one, and see the state change
— with no browser and no explanation from you.

**Non-goals.** Not a replacement dashboard; no editing segments, no creating flags,
no auth flow, no writing secrets to disk.

**Why zero runtime dependencies.** Node 20+ has `fetch` and `node:test`. A single
compiled CLI with no dependency tree is genuinely reusable and trivial to install —
it also keeps the token and review burden low, matching your "simplest setup that
works" preference.

### Data flow (corrected after reading the source)

1. `GET /api/v1/projects/` → project id + name (Master API key).
2. `GET /api/v1/environments/?project=<id>` → environment id, name, `api_key`.
3. `GET /api/v1/projects/<id>/features/` → feature id → name/type map.
4. `GET /api/v1/environments/<api_key>/featurestates/` → state id, feature id,
   `enabled`, typed `feature_state_value`. Join with step 3 by feature id.
5. Toggle → `PATCH /api/v1/features/featurestates/<state_id>/` with `{"enabled": <bool>}`.
   The OpenAPI spec confirms `PatchedWritableNestedFeatureState`, so all fields are
   optional on PATCH.

This is a **separate tool** built on Flagsmith's public API, which is exactly what
Track 03 asks for. It does not fork or modify upstream.

### Design system

`DESIGN.md` is already written. One named terminal aesthetic — **dense operational** —
with truecolor roles and 256 fallbacks, one outer rounded frame, no inner boxes,
a muted colour ladder, cell-width (not character-width) truncation, `NO_COLOR` and
non-TTY handling, and explicit 80x24 / 120x40 layouts. The rendered output at those
two sizes is the evidence, per the TUI craft guidance.

### What I already wrote (6 files, no source code yet)

`package.json`, `tsconfig.json`, `.gitignore`, `LICENSE`, `DESIGN.md`, `AGENTS.md`.
These are scaffolding only — nothing in `src/` exists yet, so **there is no working
code to review or run at this point**.

### What remains

`src/types.ts`, `src/api.ts`, `src/mock.ts`, `src/render.ts`, `src/app.ts`,
`src/index.ts`, colocated `*.test.ts`, `README.md`, `docker-compose.yml`,
`sample-app/`, `.github/workflows/ci.yml`.

### Verification plan (nothing claimed yet)

- `npm run typecheck` — strict TypeScript, must exit 0.
- `npm test` — tests against an in-process mock, covering API URLs/headers, PATCH
  payload, error propagation, cell-width truncation, 80x24/120x40 render shapes,
  NO_COLOR, non-TTY, and the toggle flow.
- `npm run build` — must exit 0 and produce an executable `dist/index.js`.
- Pasted 80x24 and 120x40 `node dist/index.js --demo` output as the visual evidence.
- Docker compose and the real Flagsmith connection stay **unverified here** and will
  be labelled as such; you can smoke-test them on your machine.

---

## 6. Skills that shaped this

`omh-codebase-onboarding` (repo map, reading path, glossary, risk map),
`omh-frontend` → `references/tui-craft.md` (design contract and render sizes),
`omh-idea-to-deploy` → `references/project-bootstrap.md` (bootstrap order), and the
Anti-Skills router, which surfaced `verification-before-completion` (evidence before
any completion claim) and `code-review-checklist` (functionality/quality/security/
performance/tests axes). I have not yet run a code review or any verification command.
