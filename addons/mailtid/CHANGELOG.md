# Changelog

## 0.4.0

- Filter-UI på hjemmesiden: in-season-chips der cykler
  neutral → include → exclude, fritekst-ingredienser der altid er
  positive, og en "Vis 5 nye"-knap
- `GET /` er nu server-renderet HTML (Hjem-skærmen), ikke plain
  tekst
- Tre nye endpoints:
  - `GET /api/filter`, `PUT /api/filter` — brugerens valg af
    in-season-chips (slugs), adskilt i `includes` og `excludes`
  - `GET /api/custom-ingredients`, `POST /api/custom-ingredients`,
    `DELETE /api/custom-ingredients/:slug` — fritekst-ingredienser
    brugeren selv tilføjer
- Nye databasetabeller: `filter_state` (single-row) og
  `custom_ingredients`
- Prompt-modulet udvidet med en "Filtreringskrav"-sektion
  (ADR-0001: OR i in-season-inkluder, AND med custom mandatory,
  AND på tværs af excludes). Tre uafhængige lister
- Statiske aktiver serveres fra `/static/app.js` og
  `/static/app.css` (klient-side chip-cykling, formular til
  tilføjelse af råvarer, "Vis 5 nye"-knap)
- `InspirationService` læser filter state fra DB og folder det
  ind i prompten
- 154 tests passerer (op fra 93)

## 0.3.0

- Fuld opskrift ved kort-klik: `RecipeService` laver et andet,
  målrettet LLM-kald for det valgte måltid
- `POST /api/inspiration/recipe` tager `{title, description}` og
  returnerer en fuld dansk opskrift (ingredienser, trin, tid)
- Nyt prompt-modul `addons/mailtid/app/src/llm/recipe-prompt.ts`
  (samt `extractJsonObject`-helper i `response.ts`, delt med
  short-form-parseren)
- Test: prompt-sektioner, parser, service, endpoint, refactor af
  eksisterende short-form-parser til den delte helper

## 0.2.0

- Sæsonbestemt database: `seasonality`-tabel, idempotent
  migrering og seed-import fra `data/seasonality.json`
- `LLMClient`-interface med `RealLLMClient` (OpenCode Go) og
  `MockLLMClient` (test)
- `InspirationService`: slår sæson op, bygger prompt, kalder LLM,
  parser svar
- `GET /api/seasonality?month=N` returnerer sæsonens råvarer
- `POST /api/inspiration` returnerer 5 korte måltidsforslag
- Prompt-modul: dansk, sektionsopdelt, testet pr. sektion

## 0.1.0

- Første udgivelse
- Add-on-skelet: Hono + better-sqlite3 + TypeScript
- `GET /` svarer med "Mailtid"
- Læser add-on-indstillinger fra `/data/options.json`
