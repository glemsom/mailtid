# Mailtid

Mailtid foreslår 5 danske middagsretter baseret på sæsonens råvarer,
din husstands profil og hvad du har lavet de sidste 14 dage.

## Installation

1. Kopiér `addons/mailtid/` til `<ha-config>/addons/mailtid/` på din
   Home Assistant-vært.
2. Under **Indstillinger → Add-ons → Lokale tilføjelser** skulle
   Mailtid nu optræde. Klik **Installer**.
3. Angiv en OpenCode Go API-nøgle under **Konfiguration**.
4. Start add-on'et. Web-UI'en er tilgængelig på
   `http://<ha-host>:8200`.

## Konfiguration

| Nøgle | Type | Standard | Beskrivelse |
| --- | --- | --- | --- |
| `opencode_api_key` | password | (tom) | OpenCode Go API-nøgle. |
| `log_level` | select | `info` | Logger-tærskel. |
| `port` | number | `8200` | HTTP-port. |
| `default_language` | select | `da` | UI- og prompt-sprog. |

Ændringer kræver genstart af add-on'et.

## Videre

- `/` viser 5 korte måltidsforslag
- `/api/inspiration` (POST) returnerer 5 forslag som JSON
- `/api/seasonality?month=N` (GET) returnerer årstidens råvarer for
  måned `N` (1-12) som JSON
- `/admin/seasonality` lader dig rette sæsondataene
