# Mailtid — Context

A Home Assistant add-on that suggests meal ideas. This file is the project's
domain glossary. It contains no implementation details.

## Canonical terms

### Mailtid
The Home Assistant add-on this project produces. Danish for "mealtime".
Owned and built by Glenn Sommer.

### Standalone Web UI
The user surface of Mailtid. The add-on runs a NodeJS HTTP server that
serves its own web page, independent of Home Assistant's own UI.

- **Port**: 8210
- **Scheme**: HTTP (no TLS). TLS termination is handled outside the add-on.
- **Access**: not yet decided — assumed local network only until stated otherwise.

### Add-on
The packaging unit: a Docker image that the Home Assistant Supervisor can
install. In the HA Supervisor model, "add-on" = "container that the
Supervisor manages". We are not using the Lovelace card or HA sidebar
panel patterns.

### Meal Inspiration
A single meal suggestion shown to the user. The product displays **5
Meal Inspirations by default**. A Meal Inspiration is a *prompt output*,
not a stored recipe — the LLM generates it on demand.

### Meal Inspiration — short form
The card shape on the home screen. Each card contains:

- **title** — Danish name of the dish
- **description** — 1–2 Danish sentences describing the dish, enough
  for the user to decide whether to dig further

5 of these are returned in a single LLM call.

### Meal Inspiration — full recipe
A richer shape fetched on demand when the user taps a card. Contains,
at minimum, ingredients and step-by-step instructions. Fetched in a
*second* LLM call scoped to a single Meal Inspiration, so the home
screen stays cheap and full recipes are only generated for meals the
user actually wants to cook.

### Default count = 5
A settled product constant: when the user opens Mailtid with no filter
applied, they see exactly 5 Meal Inspirations. (How this scales with
filters is still open.)

### Seasonality
"In season" in Mailtid is **a hardcoded Danish seasonality calendar
stored in SQLite**, owned and maintained by Glenn. The LLM is told which
ingredients are in season for the current month and is instructed to
feature those as central ingredients while supplementing with other
common ingredients. The LLM does not reason about seasonality on its own
and no external data source is consulted at query time.

Approximate scope of the dataset: ~80 ingredients × 12 months. The
exact list is to be curated; the current list is the source of truth
and lives in the database.

### Seasonality data lifecycle
The in-season dataset is managed through a **JSON seed file plus a
runtime admin UI**, with **DB-wins** semantics:

- The source of truth lives at
  `addons/mailtid/app/data/seasonality.json` in the repo. Edits to
  the curated list are made in PRs.
- On first start, the NodeJS app imports the seed into SQLite.
- A `/admin/seasonality` page in Mailtid lets the user add, edit,
  toggle months, or delete ingredients live — these are DB-only
  overrides, not edits to the seed.
- A "Nulstil til seed" button on the admin page wipes the override
  and re-imports the JSON.
- DB overrides win until reset, so a tweak from the admin UI
  survives subsequent deploys / re-imports.

## Open / unresolved

These are terms the project has not yet committed to. Do not encode them
in code until they are resolved here.

- **NodeJS server framework** (Express / Fastify / Hono / etc.) —
  implementation detail, not a glossary term.
- **Frontend rendering model** (server-rendered HTML, SPA, HTMX, etc.)
  — implementation detail.
- **TypeScript or plain JavaScript** — implementation detail.
- **The curated in-season dataset** — content, not glossary. Lives in
  the database seed, not in `CONTEXT.md`.
- **Model list refresh cadence** (on startup only, on a timer, on
  demand only) — minor ops decision.
- **First-run experience** (block the home screen until the profile
  is set, or show a banner) — minor UX decision.
- **Error UX** (what does the home screen show when the LLM call
  fails, the API key is missing, or the model returns malformed
  JSON) — minor UX decision.

### Model selection
Mailtid uses the **OpenCode Go** provider, not the generic opencode.ai
Zen provider. The Go provider is one of the product lines exposed
under `https://opencode.ai/zen/go/v1/`.

- Model catalogue: `GET https://opencode.ai/zen/go/v1/models`
- Chat completions: `POST https://opencode.ai/zen/go/v1/chat/completions`
  (OpenAI-compatible)
- Anthropic-compatible endpoint: `POST https://opencode.ai/zen/go/v1/messages`
  — **explicitly excluded**. Mailtid uses only the OpenAI-compatible
  endpoint.
- Model IDs in API calls must be prefixed with `opencode-go/`
  (e.g. `opencode-go/glm-5.1`).
- On startup, and on a manual "Opdater modeller" action, Mailtid
  calls the models endpoint and stores the result in SQLite. Any
  model whose endpoint is `/messages` is filtered out at fetch time;
  only `chat/completions`-style models are kept.
- The cached list is surfaced in the settings page as a dropdown
  grouped by price tier (free / paid). The user picks exactly one
  active model.
- The active model is read on every LLM call. Swapping models is a
  settings-page action that takes effect immediately.
- Paid models are accepted; the product does not enforce free-only.

### Filter sources
Mailtid's "must include" / "must exclude" controls accept ingredients
from two sources:

1. **In-season chips** — ingredients shown because they are in season
   in Denmark this month (the same list that drives the prompt). User
   picks from these by tapping. Each chip can be set to include or
   exclude.
2. **Custom mandatory ingredients** — ingredients the user types in
   themselves (e.g. "ris" because of leftover rice). These are *always*
   positive. They are not constrained by the seasonality calendar —
   the "leftover rice in February" use case is the whole point.

A meal suggestion must contain every "must include" ingredient (from
either source) and must not contain any "must exclude" ingredient.
The semantics across multiple in-season includes (AND vs OR) is **OR**
(see "Filter semantics" below).

### Default filter state
On first load, no chip is selected. The user opts in to filtering.
A "Vis 5 nye" button explicitly re-runs the request. No
auto-rotation.

### User profile
A persistent, server-side set of preferences stored in SQLite. Captured
once (with a settings page to edit). The LLM is always told the current
profile, on every request.

For v1, the profile contains exactly three fields:

- **dietary pattern** — single choice (omnivore / pescatarian /
  vegetarian / vegan). Drives the broadest constraint.
- **allergies** — multi-select from a fixed list. Drives hard
  exclusions.
- **dislikes** — free-text "fritekst" of foods / ingredients to
  avoid. Drives soft exclusions.

Out of scope for v1: household size, max cook time, cuisine
preference, weekly planning. These can be added later.

### Persistence
Beyond the user profile, Mailtid stores two kinds of records:

- **Favourites** — short-form Meal Inspirations the user has
  bookmarked (heart icon). Surfaced on a separate "Favouritter" page.
- **Cooked history** — a timestamped log of Meal Inspirations the
  user has marked as cooked. The LLM is told *"do not suggest meals
  the user cooked in the last 14 days"* on every request.

A "har lavet" button on each card appends a record. The cooked-history
section of the prompt is built fresh per request from the last 14
days of stamps.

Out of scope for v1: a per-meal "aldrig igen" hard avoid list. The
profile's `dislikes` field already covers ingredient-level exclusions.

### Configuration surfaces
Configuration is split across two surfaces based on restart cost:

- **Home Assistant add-on options** (container restart required):
  - `opencode_api_key` — password field, the OpenCode Go API key
  - `log_level` — `trace` / `debug` / `info` / `warn` / `error`
  - `port` — number, default 8210
  - `default_language` — select, default `da`
- **In-app settings page** (live, no restart):
  - Active model (dropdown populated from cached model list)
  - User profile (dietary pattern, allergies, dislikes)
  - Custom mandatory ingredients history
  - Favourites / cooked history (these are data, not config, but
    live in the same surface)

### Project structure
The repo is a **single-context** repo with the Home Assistant add-on
package nested under `addons/mailtid/`:

- Repo root holds the dev-time documentation: `AGENTS.md`,
  `CONTEXT.md`, `docs/adr/`, `docs/agents/`.
- `addons/mailtid/` is the add-on package itself: `config.yaml`,
  `Dockerfile`, `run.sh`, `icon.png`, `DOCS.md`, `CHANGELOG.md`, and
  `app/` (the NodeJS web app source).
- The HA Supervisor's local add-on install path is
  `<ha-config>/addons/mailtid/`, so `addons/mailtid/` in the repo
  is a 1:1 copy of what lives on the HA host.

### Deployment
Deployment is a literal `rsync` of `addons/mailtid/` to
`root@192.168.50.171:/addons/mailtid/`. The HA Supervisor builds the
Docker image from the local `Dockerfile` on the host itself. A
`bin/deploy.sh` script in the repo root wraps the rsync + any
pre-flight checks.

No external registry, no remote image build, no `docker save/load`
shuttling — for a single-household add-on, simplicity wins.

### Filter semantics
How the include and exclude filter sets combine when the user has
selected multiple items:

- **In-season chips, multiple includes** — OR. Every meal must
  contain at least one of the in-season ingredients the user has
  flagged as include. The in-season list is "what's available"; the
  user is narrowing the basket, not building a shopping list.
- **Custom mandatory ingredients** — AND. They are hard constraints
  ("I have rice, deal with it") and combine with AND against the
  rest of the include set.
- **Excludes** — AND of all excludes. A meal must exclude every
  ingredient the user has flagged as exclude.
