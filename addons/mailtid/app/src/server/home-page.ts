import type { SeasonalityIngredient } from "../db/seasonality.js";
import type { FilterState } from "../db/filter-state.js";
import type { CustomIngredient } from "../db/custom-ingredients.js";
import type { UserProfile } from "../db/profile.js";
import type { MealInspiration } from "../inspiration/service.js";
import { escapeHtml, danishMonthName } from "./html.js";

/** Dietary pattern display names in Danish. */
const DIETARY_LABELS: Record<string, string> = {
  omnivore: "Altspisende",
  pescatarian: "Pescetar",
  vegetarian: "Vegetarisk",
  vegan: "Vegansk",
};

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
  /** Cached meal batch from the most recent generation, if any. */
  cachedMeals?: readonly MealInspiration[];
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
  // The user can set the key either in the HA add-on Configuration tab
  // (Settings → Add-ons → Mailtid → Configuration) or on this in-app page.
  const missingKeyHtml = data.hasApiKey
    ? ""
    : `<div class="banner banner-warning" role="alert">
  ⚠️ <strong>OpenCode API-nøgle mangler.</strong><br>
  Indtast din nøgle enten i HA's add-on-konfiguration
  (Indstillinger → Add-ons → Mailtid → Konfiguration) og genstart,
  eller indtast den her i web-UI'en (virker med det samme).
  <br><a href="/indstillinger">Gå til indstillinger →</a>
</div>`;

  // First-run banner: shown when the profile is empty.
  const firstRunHtml = data.profile
    ? ""
    : `<div class="banner banner-info" role="alert">
  👋 Velkommen — fortæl os lidt om dig for at få bedre forslag.
  <a href="/indstillinger">Gå til indstillinger</a>
</div>`;

  const monthName = danishMonthName(data.month);
  const profileLabel = data.profile
    ? DIETARY_LABELS[data.profile.dietaryPattern] ?? ""
    : "";

  // Render cached meals as HTML cards so the first paint is snappy.
  const cachedMealsHtml = data.cachedMeals && data.cachedMeals.length > 0
    ? data.cachedMeals.map((m) => renderMealCard(m)).join("")
    : "";

  // Embed the full meal data so the client-side JS can populate
  // the recipeCache and wire the action buttons without a round-trip.
  const cachedMealsJson = data.cachedMeals && data.cachedMeals.length > 0
    ? `<script>window.__MAILTID_CACHED_MEALS__ = ${JSON.stringify(data.cachedMeals)};</script>`
    : "";

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Mailtid — dansk madinspiration</title>
  <link rel="stylesheet" href="/static/app.css">
</head>
<body data-profile-label="${escapeHtml(profileLabel)}">
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
    <div id="chips" class="chips" data-inseason-count="${data.inSeason.length}">${chipHtml}</div>

    <h2>Skal med (rester fra køleskabet)</h2>
    <form id="custom-form">
      <input type="text" name="name" placeholder="fx ris" required>
      <button type="submit">Tilføj</button>
    </form>
    <ul id="custom-list" class="custom-chips">${customHtml}</ul>
  </section>

  <section id="results" aria-label="Forslag">
    <button id="refresh" type="button" class="primary">Vis 5 nye</button>
    <div id="meals" class="meals">
      <div id="thinking-panel" class="thinking-panel collapsed">
        <div class="thinking-header">
          <span id="thinking-phase" class="thinking-phase" role="status" aria-live="polite"></span>
          <button id="thinking-dismiss" class="thinking-dismiss" type="button" aria-label="Skjul tænkeboks">Skjul ▲</button>
        </div>
        <details id="thinking-details" class="thinking-details">
          <summary class="thinking-summary">Hvad overvejer AI&apos;en? ▸</summary>
          <div id="thinking-tokens" class="thinking-tokens"></div>
        </details>
      </div>
      <div id="meal-cards">${cachedMealsHtml}</div>
    </div>
    <p id="status" class="status" role="status" aria-live="polite"></p>
  </section>
  ${cachedMealsJson}
  <script src="/static/app.js"></script>
</body>
</html>`;
}

/**
 * Render a single cached MealInspiration as a server-side HTML card.
 * Must stay in lockstep with the `renderMeals()` template in
 * `static/app.js` so the CSS and JS button-wiring selectors match.
 */
function renderMealCard(m: MealInspiration): string {
  return (
    `<article class="meal">` +
    `<div class="meal-header">` +
    `<h3>${escapeHtml(m.title)}</h3>` +
    `<button class="heart-btn" data-favourite-title="${escapeHtml(m.title)}"` +
    ` data-favourite-desc="${escapeHtml(m.description)}"` +
    ` aria-label="Gem som favorit" title="Gem som favorit">♥</button>` +
    `</div>` +
    `<p>${escapeHtml(m.description)}</p>` +
    `<div class="meal-actions">` +
    `<button class="cooked-btn" data-cooked-title="${escapeHtml(m.title)}"` +
    ` data-cooked-desc="${escapeHtml(m.description)}">` +
    `Har lavet</button>` +
    `<button class="recipe-btn" data-recipe-title="${escapeHtml(m.title)}">` +
    `Se opskrift</button>` +
    `</div>` +
    `</article>`
  );
}
