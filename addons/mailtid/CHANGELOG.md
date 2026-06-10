# Changelog

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
