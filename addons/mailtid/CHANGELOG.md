# Changelog

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
