import type { SeasonalityIngredient } from "../db/seasonality.js";
import type { FilterState } from "../db/filter-state.js";
import type { CustomIngredient } from "../db/custom-ingredients.js";
import type { UserProfile } from "../db/profile.js";
import { escapeHtml, danishMonthName } from "./html.js";

/**
 * The data the home page needs to render. Assembled by the Hono
 * handler so the template stays a pure function of its inputs.
 */
export interface HomePageData {
  /** The current month, 1-12. */
  month: number;
  /** In-season ingredients for the current month. */
  inSeason: readonly SeasonalityIngredient[];
  /** The user's saved in-season filter state. */
  filter: FilterState;
  /** The user's saved custom mandatory ingredients. */
  custom: readonly CustomIngredient[];
  /** The user's dietary profile, or null if not set. */
  profile: UserProfile | null;
  /** Whether the OpenCode API key is configured. */
  hasApiKey: boolean;
}

/**
 * Render the Mailtid home page as a full HTML document. The page
 * is server-rendered so the initial paint shows the saved filter
 * state without a JS round-trip; a small client-side script then
 * handles chip cycling, custom-mandatory adds, and the "Vis 5 nye"
 * button.
 */
export function renderHomePage(data: HomePageData): string {
  const includeSet = new Set(data.filter.includes);
  const excludeSet = new Set(data.filter.excludes);

  const chipHtml = data.inSeason
    .map((ing) => {
      const state = excludeSet.has(ing.slug)
        ? "exclude"
        : includeSet.has(ing.slug)
          ? "include"
          : "neutral";
      return (
        `<button class="chip" data-slug="${escapeHtml(ing.slug)}"` +
        ` data-state="${state}" data-name="${escapeHtml(ing.nameDa)}"` +
        ` aria-pressed="${state !== "neutral"}">` +
        escapeHtml(ing.nameDa) +
        `</button>`
      );
    })
    .join("");

  const customHtml = data.custom
    .map(
      (c) =>
        `<li class="custom-chip" data-slug="${escapeHtml(c.slug)}">` +
        `<span>${escapeHtml(c.nameDa)}</span>` +
        `<button class="remove" data-remove-custom="${escapeHtml(c.slug)}"` +
        ` aria-label="Fjern ${escapeHtml(c.nameDa)}">×</button>` +
        `</li>`,
    )
    .join("");

  // Missing-API-key banner: shown when the key is not set.
  const missingKeyHtml = data.hasApiKey
    ? ""
    : `<div class="banner banner-warning" role="alert">
  ⚠️ Indtast din OpenCode API-nøgle i indstillingerne.
  <a href="/indstillinger">Gå til indstillinger</a>
</div>`;

  // First-run banner: shown when the profile is empty.
  const firstRunHtml = data.profile
    ? ""
    : `<div class="banner banner-info" role="alert">
  👋 Velkommen — fortæl os lidt om dig for at få bedre forslag.
  <a href="/indstillinger">Gå til indstillinger</a>
</div>`;

  const monthName = danishMonthName(data.month);

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mailtid — dansk madinspiration</title>
  <link rel="stylesheet" href="/static/app.css">
</head>
<body>
  <header>
    <div class="nav">
      <h1>Mailtid</h1>
      <span class="nav-links">
        <a href="/favouritter">Favouritter</a>
        <a href="/indstillinger">Indstillinger</a>
      </span>
    </div>
    <p class="tagline">Forslag til aftensmad — dansk, i sæson, til dig.</p>
  </header>

  ${firstRunHtml}
  ${missingKeyHtml}

  <section id="filters" aria-label="Filtrer på råvarer i sæson">
    <h2>Råvarer i sæson — ${escapeHtml(monthName)}</h2>
    <p class="hint">Tryk på en råvare for at skifte mellem <em>neutral</em>, <em>skal med</em> og <em>ikke med</em>.</p>
    <div id="chips" class="chips">${chipHtml}</div>

    <h2>Skal med (rester fra køleskabet)</h2>
    <form id="custom-form">
      <input type="text" name="name" placeholder="fx ris" required>
      <button type="submit">Tilføj</button>
    </form>
    <ul id="custom-list" class="custom-chips">${customHtml}</ul>
  </section>

  <section id="results" aria-label="Forslag">
    <button id="refresh" type="button" class="primary">Vis 5 nye</button>
    <div id="meals" class="meals"></div>
    <p id="status" class="status" role="status" aria-live="polite"></p>
    <p class="thinking-label" id="thinking-label">AI&apos;ens tanker:</p>
    <div id="thinking" class="thinking-box" style="display:none"></div>
  </section>

  <script src="/static/app.js"></script>
</body>
</html>`;
}
