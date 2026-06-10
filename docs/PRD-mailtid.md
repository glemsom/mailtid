# Mailtid — Product Requirements Document

> Parent issue: <to be set by `gh issue create`>
> Source brainstorm: see `CONTEXT.md` (project glossary) and
> `docs/adr/0001-filter-semantics.md`.

## Problem Statement

Deciding what to cook for dinner is a daily friction point, especially
when the goal is to cook with what's fresh, what's in season, and what
already happens to be in the fridge. A Danish household with an
existing Home Assistant installation has no local, private, Danish-
language tool that ties these together with an LLM and respects the
calendar of what's in season in Denmark right now. Existing recipe
sites and meal-planning apps are English-first, generic across
geographies, and depend on third-party services.

## Solution

Mailtid is a self-hosted Home Assistant add-on that runs a small
NodeJS web app on the household's LAN. On demand, it asks an LLM
(via the OpenCode Go provider) for five meal suggestions constrained
by:

- the current month's hardcoded Danish in-season ingredient list,
- the user's persistent profile (dietary pattern, allergies,
  dislikes),
- the user's filter state (in-season chips with include / exclude
  states, plus any custom mandatory ingredients the user has typed
  in), and
- the user's "cooked history" (meals stamped as cooked in the last
  14 days, excluded by default to encourage variety).

Each suggestion shows a Danish title and a 1-2 sentence Danish
description. Tapping a card fetches a full recipe (ingredients and
step-by-step instructions) in a second, targeted LLM call. The user
can mark meals as favourites and as cooked, and pick which LLM model
to use from a list that is fetched and cached from the OpenCode Go
catalogue.

## User Stories

1. As a Danish home cook, I want to see 5 meal suggestions, so that I can quickly decide what to cook tonight.
2. As a Danish home cook, I want the suggestions to use ingredients in season in Denmark, so that I'm cooking with the freshest produce.
3. As a Danish home cook, I want each suggestion to have a Danish title and a short Danish description, so that I can quickly decide if it appeals to me.
4. As a Danish home cook, I want to tap a suggestion to see the full recipe, so that I can cook it.
5. As a Danish home cook, I want to refresh the 5 suggestions with a "Vis 5 nye" button, so that I can see different options.
6. As a Danish home cook with dietary restrictions, I want to set my dietary pattern (omnivore / pescatarian / vegetarian / vegan) once, so that suggestions always match.
7. As a Danish home cook with allergies, I want to mark my allergies once, so that suggestions never include allergens.
8. As a Danish home cook with food dislikes, I want to enter a free-text dislikes list, so that suggestions avoid foods I don't like.
9. As a Danish home cook, I want to filter on in-season ingredients, so that I can see meals using a specific seasonal item.
10. As a Danish home cook, I want to exclude in-season ingredients, so that I can avoid meals containing something I'm not in the mood for.
11. As a Danish home cook with leftovers, I want to enter a custom mandatory ingredient, so that I can find meals using what I have at home.
12. As a Danish home cook, I want to see suggestions different from what I've cooked recently, so that I have variety.
13. As a Danish home cook, I want to mark a meal as cooked, so that Mailtid remembers and avoids it.
14. As a Danish home cook, I want to save favourite meals, so that I can find them again later.
15. As a Danish home cook, I want to see a "Favouritter" page with my saved meals.
16. As a Danish home cook, I want to choose which LLM model to use, so that I can balance cost and quality.
17. As a Danish home cook, I want to see which models are available, both free and paid.
18. As a Danish home cook, I want the model list to refresh, so that I see new models when OpenCode Go adds them.
19. As a Danish home cook, I want a Danish-language UI, so that the app feels natural.
20. As a Danish home cook, I want Mailtid to be reachable on my local network, so that I can use it from my phone.
21. As a Danish home cook, I want Mailtid installed as a Home Assistant add-on, so that it's managed by my existing HA setup.
22. As a Danish home cook, I want my OpenCode API key stored in the HA add-on options as a password field, so that it's not in plaintext anywhere in the app.
23. As a Danish home cook, I want the app to handle errors gracefully, so that I'm not stuck if the LLM call fails.
24. As a Danish home cook, I want a clear first-run experience, so that I can set up my profile before I see suggestions.
25. As a Danish home cook, I want the UI text and LLM prompts to be in Danish, so that dish names and descriptions feel natural.
26. As an admin (Glenn), I want to edit the seasonality dataset in the UI, so that I can correct or add ingredients without redeploying.
27. As an admin, I want to reset the dataset to the seed, so that I can undo my live changes.
28. As an admin, I want a one-command deployment script, so that I can push updates without thinking about the rsync details.
29. As an admin, I want the seasonality seed file to live in the repo as `seasonality.json`, so that the curated list is version-controlled and reviewable in PRs.
30. As an admin, I want logs at adjustable levels (trace / debug / info / warn / error), so that I can debug issues without rebuilding the container.

## Implementation Decisions

- **Home Assistant add-on shape.** Local add-on, no GitHub add-on
  repository. The package lives at
  `addons/mailtid/` in the repo and is installed by the HA
  Supervisor from the host's own `addons/` directory.
- **Add-on metadata.** `slug: mailtid`, port `8200`, `arch: aarch64 |
  amd64 | armv7`, `init: false`, `startup: services`, `boot: auto`,
  `hassio_api: false`, `homeassistant_api: false`. Network is the
  default (bridge) with port mapping `8200:8200`; `host_network: false`.
- **NodeJS app shape.** A single NodeJS process running a small
  HTTP server. TypeScript. Framework to be chosen at slice 1
  (Hono is the leading candidate, but the choice is implementation,
  not a glossary term).
- **Database.** SQLite via `better-sqlite3`, single file at
  `/data/mailtid.db` (HA Supervisor maps `/data` to a host path that
  survives container restarts and add-on updates). One file, one
  connection, synchronous API.
- **LLM client.** A thin module that wraps the OpenAI Node SDK
  pointed at `https://opencode.ai/zen/go/v1` (the OpenCode Go
  provider). Model IDs are passed with the `opencode-go/` prefix.
  Anthropic-compatible models are filtered out at fetch time.
- **Frontend rendering.** Server-rendered HTML with a small amount
  of vanilla JS or Alpine.js for interactivity. The UI is a thin
  shell that calls `/api/*`. **Not a SPA.** This keeps the test
  surface at the API boundary.
- **Test seams.** Primary: HTTP API at `/api/*` via `supertest`.
  Secondary: LLM client interface (substitute a `MockLLMClient` in
  tests). Tertiary: SQLite repositories (substitute `:memory:` in
  tests). Pure data: the `seasonality.json` seed. No end-to-end
  browser tests in v1.
- **Seasonality seed.** Versioned at
  `addons/mailtid/app/data/seasonality.json` in the repo. Imported
  into SQLite on first start. Live overrides via the admin UI live
  in the DB. "Nulstil til seed" wipes the override and re-imports.
- **Add-on options (HA restart required).** `opencode_api_key`
  (password), `log_level` (select), `port` (number, default 8200),
  `default_language` (select, default `da`).
- **In-app settings (live).** Active model, user profile (dietary
  pattern, allergies, dislikes), custom mandatory ingredients
  history, favourites, cooked history.
- **Filter semantics.** Captured in ADR-0001: OR within the in-season
  include set, AND with custom mandatory ingredients, AND across
  excludes. The LLM prompt has three independent lists.
- **Cooked-history window.** 14 days, configurable later.
- **Deployment.** `bin/deploy.sh` in the repo root rsyncs
  `addons/mailtid/` to `root@192.168.50.171:/addons/mailtid/`. The
  HA Supervisor builds the image on the host from the local
  `Dockerfile`. No external registry.
- **Out of network access for v1.** Assumed LAN-only. No auth beyond
  the LAN. TLS is the user's responsibility, terminated outside the
  add-on.

## Testing Decisions

- **What makes a good test.** Tests assert on the *external*
  behaviour of the system: the JSON returned by an HTTP endpoint,
  the rows written to SQLite, the prompt string handed to the
  `MockLLMClient`. They do not assert on internal module structure
  or on specific function names inside `src/`.
- **Where the seams live.**
  - HTTP API tests in `addons/mailtid/app/test/api/`.
  - LLM client tests in `addons/mailtid/app/test/llm/`.
  - Repository tests in `addons/mailtid/app/test/db/`.
  - Pure-data tests for `seasonality.json` in
    `addons/mailtid/app/test/data/`.
- **Test runner.** Vitest. One command (`npm test`) runs everything.
- **No live network.** Tests never reach opencode.ai. The
  `MockLLMClient` is a fixed-shape in-memory double. Real LLM
  behaviour is verified manually after deploy.
- **No live DB on disk.** Tests use `:memory:` SQLite. The schema
  and seed import are run at the start of every test suite that
  needs them.
- **CI posture.** No CI in v1. The test command is run by the
  developer (or AFK agent) before claiming a slice is done.

## Out of Scope

- Multi-user support (a single household / single profile is assumed).
- Household size, max cook time, cuisine preference, weekly meal
  planning (all listed in `CONTEXT.md` as "out of scope for v1").
- Grocery list generation, shopping list export, pantry tracking.
- Per-meal "aldrig igen" hard avoid list (the profile's `dislikes`
  field already covers ingredient-level exclusions).
- Playwright / end-to-end browser tests.
- TLS termination inside the add-on.
- Anthropic-compatible models (`/zen/go/v1/messages`).
- Authentication beyond the LAN assumption.
- Community-addon publication (GitHub add-on store, public docs,
  `repository.yaml`).
- CI / automated deployments.

## Further Notes

- The seasonality dataset is the load-bearing dataset. Its
  correctness is the difference between "inspiration app" and "joke
  app". Slice 0 is the AFK agent's research output; the user reviews
  and can edit before the first end-to-end test.
- The LLM prompt is the most likely place where v1's design will
  bend. Treat the prompt as a first-class module
  (`addons/mailtid/app/src/llm/prompt.ts`) and have one test per
  prompt section (seasonality, filter, profile, cooked history) so
  regressions are caught.
- The 5-meal / 14-day / 80-ingredient numbers are all small
  constants chosen for a single household. None of them is sacred
  and none needs to be configurable in v1.
- The `addons/mailtid/app/data/seasonality.json` file is the only
  non-code artifact that needs to be reviewed in PRs. Keep it
  small, human-readable, and alphabetical within months.
