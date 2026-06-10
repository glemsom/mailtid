# Mailtid — dansk måltidsinspiration

Mailtid er en selv-hosset Home Assistant add-on, der foreslår 5 danske middagsretter baseret på sæsonens råvarer, din husstands profil, dine filtre og hvad du har lavet de sidste 14 dage.

Drevet af en [OpenCode Go](https://opencode.ai/zen/go/v1) LLM.

## Kom hurtigt i gang

```sh
# Byg og test lokalt
cd addons/mailtid/app
npm ci
npm test        # 258 tests, under 1 sekund

# Byg Docker-image
cd addons/mailtid
docker build -t mailtid .

# Kør containeren (med en fixture options.json)
docker run --rm -p 8200:8200 -v /path/to/options.json:/data/options.json mailtid
```

## Deploy til Home Assistant

```sh
./bin/deploy.sh
```

Læs [docs/deploy.md](docs/deploy.md) for detaljer.

## Projektstruktur

```
.
├── CONTEXT.md                  # Projekt-glossar (domænesprog)
├── docs/
│   ├── adr/                    # Arkitekturbeslutninger
│   └── agents/                 # Agent-instruktioner
├── addons/mailtid/             # Home Assistant add-on pakke
│   ├── config.yaml             # HA add-on metadata
│   ├── Dockerfile              # Docker image definition
│   ├── run.sh                  # Container entrypoint
│   └── app/                    # NodeJS web-app (TypeScript, Hono)
│       ├── src/                # Kildekode
│       ├── test/               # Tests (Vitest, 38 testfiler, 258 tests)
│       └── data/               # seasonality.json seed
└── bin/
    ├── deploy.sh               # One-command deploy til HA host
    └── smoke-test.sh           # Post-deploy smoke test
```

## Teknologi

| Lag              | Valg                        |
| ---------------- | --------------------------- |
| Runtime          | Node.js 20+ (TypeScript)    |
| Server           | Hono                        |
| Database         | SQLite via better-sqlite3   |
| Test             | Vitest                      |
| Container        | Docker (node:lts)           |
| LLM              | OpenCode Go (OpenAI SDK)    |

## Dokumentation

- [CONTEXT.md](CONTEXT.md) — domænesprog og produktbeslutninger
- [docs/adr/0001-filter-semantics.md](docs/adr/0001-filter-semantics.md) — filter-logik
- [docs/deploy.md](docs/deploy.md) — deployment
- [addons/mailtid/DOCS.md](addons/mailtid/DOCS.md) — add-on dokumentation (vises i HA Supervisor)
- [addons/mailtid/CHANGELOG.md](addons/mailtid/CHANGELOG.md) — versionshistorik

## Licens

Privat projekt — Glenn Sommer.
