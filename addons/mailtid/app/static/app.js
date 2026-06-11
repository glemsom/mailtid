/**
 * Mailtid front-end.
 *
 * Tiny, no-framework script that wires the server-rendered HTML
 * to a few endpoints. Responsibilities:
 *
 *  1. Cycle a chip's filter state on click (neutral → include →
 *     exclude → neutral) and PUT the new state to /api/filter.
 *  2. Submit the custom-mandatory form to /api/custom-ingredients
 *     and re-render the custom-chip list when the user clicks
 *     "Fjern" (×).
 *  3. Render the 5 short-form Meal Inspirations with a loading
 *     skeleton while fetching, and a retry button on error.
 *
 * The page itself is server-rendered, so a no-JS user can still
 * see the saved state; this script only adds interactivity.
 */

const STATE_ORDER = ["neutral", "include", "exclude"];

function nextState(current) {
  const i = STATE_ORDER.indexOf(current);
  return STATE_ORDER[(i + 1) % STATE_ORDER.length];
}

function stateToFilterLists(chips) {
  const includes = [];
  const excludes = [];
  for (const chip of chips) {
    if (chip.dataset.state === "include") includes.push(chip.dataset.slug);
    if (chip.dataset.state === "exclude") excludes.push(chip.dataset.slug);
  }
  return { includes, excludes };
}

async function saveFilter(chips) {
  const { includes, excludes } = stateToFilterLists(chips);
  const res = await fetch("/api/filter", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ includes, excludes }),
  });
  if (!res.ok) {
    setStatus("Kunne ikke gemme filteret. Prøv igen.");
  }
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function escapeHtml(raw) {
  return String(raw)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Show the thinking panel and display a phase label.
 * Called when a status SSE event arrives.
 */
function showPhase(phase) {
  const panel = document.getElementById("thinking-panel");
  const phaseEl = document.getElementById("thinking-phase");
  if (panel) {
    panel.hidden = false;
  }
  if (phaseEl) {
    phaseEl.textContent = phase;
    // Highlight the current phase.
    phaseEl.classList.add("active");
  }
}

/**
 * Accumulated raw reasoning text, kept in a module-level variable
 * so we can re-scan for ingredient matches on every token append.
 */
let thinkingRawText = "";

/**
 * Read in-season ingredient names from the DOM chip buttons.
 * Each .chip button has a data-name attribute with the Danish
 * ingredient name (e.g. "Kartofler", "Gulerødder").
 */
function getIngredientNames() {
  const chips = document.querySelectorAll("#chips .chip");
  const names = [];
  for (const chip of chips) {
    const name = chip.dataset.name;
    if (name) names.push(name);
  }
  return names;
}

/**
 * Escape characters that have special meaning in regular expressions.
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Scan the accumulated reasoning text and wrap matching in-season
 * ingredient names in <span class="thinking-chip"> elements.
 *
 * Matching is case-insensitive and whole-word only — "kartofler"
 * matches "Kartofler" but not "kartoffelmos". Unicode-aware word
 * boundaries (\p{L}\p{N}) ensure Danish letters like æ, ø, å are
 * treated as word characters.
 *
 * The returned string is safe for innerHTML assignment: non-matching
 * text is HTML-escaped, and matched ingredient names are wrapped in
 * spans.
 */
function highlightIngredients(safeText, ingredientNames) {
  if (ingredientNames.length === 0) return safeText;

  // Sort longest-first so "kartofler" matches before "kartoffel"
  // if both happen to be in the list.
  const sorted = [...ingredientNames].sort((a, b) => b.length - a.length);
  const escaped = sorted.map(escapeRegex);
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])(${escaped.join('|')})(?=[^\\p{L}\\p{N}]|$)`,
    'giu'
  );

  return safeText.replace(
    pattern,
    '$1<span class="thinking-chip">$2</span>'
  );
}

/**
 * Append a reasoning token to the collapsed raw-token area and
 * highlight in-season ingredient names that appear in the text.
 */
function showThinking(token) {
  const tokens = document.getElementById("thinking-tokens");
  if (!tokens) return;

  thinkingRawText += token;

  // Always escape HTML first so the LLM output can never inject markup.
  let html = escapeHtml(thinkingRawText);

  const ingredientNames = getIngredientNames();
  if (ingredientNames.length > 0) {
    html = highlightIngredients(html, ingredientNames);
  }

  tokens.innerHTML = html;
}

/**
 * Mark the thinking phase as finished.
 */
function finishPhase() {
  const phaseEl = document.getElementById("thinking-phase");
  if (phaseEl) {
    phaseEl.textContent = "Færdig \u2713";
    phaseEl.classList.remove("active");
    phaseEl.classList.add("finished");
  }
  // Auto-collapse the raw-token details.
  const details = document.getElementById("thinking-details");
  if (details) {
    details.open = false;
  }
  // Auto-hide the panel after a short delay.
  setTimeout(() => {
    const panel = document.getElementById("thinking-panel");
    if (panel && !panel.hidden) {
      panel.hidden = true;
    }
  }, 4000);
}

/**
 * Hide and reset the thinking panel. Called on error and when
 * a new inspiration request starts.
 */
function clearThinking() {
  const panel = document.getElementById("thinking-panel");
  const phaseEl = document.getElementById("thinking-phase");
  const tokens = document.getElementById("thinking-tokens");
  const details = document.getElementById("thinking-details");
  if (panel) {
    panel.hidden = true;
  }
  if (phaseEl) {
    phaseEl.textContent = "";
    phaseEl.classList.remove("active", "finished");
  }
  if (tokens) {
    tokens.innerHTML = "";
  }
  if (details) {
    details.open = false;
  }
  // Reset accumulated reasoning text for the next inspiration call.
  thinkingRawText = "";
  // Remove any summary line from a previous run.
  const existingSummary = document.querySelector(".thinking-summary-line");
  if (existingSummary) existingSummary.remove();
}

/**
 * Render 5 skeleton cards while the LLM call is in flight.
 * Shows the thinking panel above the skeleton.
 */
function renderSkeleton() {
  clearThinking();
  // Show the thinking panel inside #meals.
  const panel = document.getElementById("thinking-panel");
  if (panel) panel.hidden = false;

  const container = document.getElementById("meal-cards");
  if (!container) return;
  container.innerHTML = [1, 2, 3, 4, 5]
    .map(
      () =>
        `<article class="meal skeleton">` +
        `<div class="skel-line skel-title"></div>` +
        `<div class="skel-line skel-desc"></div>` +
        `<div class="skel-line skel-desc skel-short"></div>` +
        `<div class="skel-actions">` +
        `<span class="skel-btn"></span>` +
        `<span class="skel-btn"></span>` +
        `</div>` +
        `</article>`,
    )
    .join("");

  // Remove any existing summary line from a previous run.
  const existingSummary = document.querySelector(".thinking-summary-line");
  if (existingSummary) existingSummary.remove();
}

/**
 * In-memory cache of full recipe data indexed by meal title.
 * Populated when meals are rendered; read when "Se opskrift" is
 * clicked. No second LLM call needed — one-shot approach.
 */
let recipeCache = {};

function renderMeals(meals) {
  const container = document.getElementById("meal-cards");
  if (!container) return;
  if (meals.length === 0) {
    container.innerHTML =
      '<p class="empty">Ingen forslag endnu — tryk "Vis 5 nye".</p>';
    return;
  }

  // Populate the recipe cache from the one-shot response.
  recipeCache = {};
  for (const meal of meals) {
    if (meal.title) {
      recipeCache[meal.title] = {
        title: meal.title,
        description: meal.description,
        ingredients: meal.ingredients || [],
        steps: meal.steps || [],
        timeMinutes: meal.timeMinutes || 0,
      };
    }
  }

  container.innerHTML = meals
    .map(
      (meal) =>
        `<article class="meal">` +
        `<div class="meal-header">` +
        `<h3>${escapeHtml(meal.title)}</h3>` +
        `<button class="heart-btn" data-favourite-title="${escapeHtml(meal.title)}"` +
        ` data-favourite-desc="${escapeHtml(meal.description)}"` +
        ` aria-label="Gem som favorit" title="Gem som favorit">♥</button>` +
        `</div>` +
        `<p>${escapeHtml(meal.description)}</p>` +
        `<div class="meal-actions">` +
        `<button class="cooked-btn" data-cooked-title="${escapeHtml(meal.title)}"` +
        ` data-cooked-desc="${escapeHtml(meal.description)}">` +
        `Har lavet</button>` +
        `<button class="recipe-btn" data-recipe-title="${escapeHtml(meal.title)}">` +
        `Se opskrift</button>` +
        `</div>` +
        `</article>`,
    )
    .join("");

  // Wire heart buttons.
  for (const btn of container.querySelectorAll(".heart-btn")) {
    btn.addEventListener("click", async () => {
      const title = btn.getAttribute("data-favourite-title") || "";
      const description = btn.getAttribute("data-favourite-desc") || "";
      try {
        const res = await fetch("/api/favourites", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, description }),
        });
        if (res.ok) {
          btn.classList.add("hearted");
          setStatus("Gemt som favorit!");
        } else {
          setStatus("Kunne ikke gemme favorit.");
        }
      } catch (err) {
        setStatus("Kunne ikke gemme favorit.");
      }
    });
  }

  // Wire "Har lavet" buttons.
  for (const btn of container.querySelectorAll(".cooked-btn")) {
    btn.addEventListener("click", async () => {
      const title = btn.getAttribute("data-cooked-title") || "";
      const description = btn.getAttribute("data-cooked-desc") || "";
      try {
        const res = await fetch("/api/cooked", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, description }),
        });
        if (res.ok) {
          btn.classList.add("cooked");
          btn.textContent = "Lavet ✓";
          setStatus("Markeret som lavet!");
        } else {
          setStatus("Kunne ikke markere som lavet.");
        }
      } catch (err) {
        setStatus("Kunne ikke markere som lavet.");
      }
    });
  }

  // Wire recipe buttons — show cached recipe, no API call.
  for (const btn of container.querySelectorAll(".recipe-btn")) {
    btn.addEventListener("click", () => {
      const title = btn.getAttribute("data-recipe-title") || "";
      const recipe = recipeCache[title];
      if (recipe) {
        showRecipe(recipe);
      } else {
        setStatus("Opskrift ikke tilgængelig — prøv at hente nye forslag.");
      }
    });
  }

  // Show the one-line summary below the meals.
  showSummary(meals.length);
}

/**
 * Render a {@link FullRecipe} as the HTML injected into the
 * `#recipe-display` section when the user taps "Se opskrift".
 *
 * IMPORTANT: this function must stay in lockstep with
 * `src/server/recipe-render.ts` in the TypeScript build pipeline.
 * The TS version is the single source of truth and is exercised
 * by `test/server/recipe-render.test.ts`; the script below is a
 * mirror kept in sync manually because `static/app.js` is shipped
 * as a standalone browser asset (no bundler).
 *
 * Ingredient rows are `{name, amount, unit}` objects produced by
 * the LLM and validated server-side. Earlier versions of this
 * script coerced them to a string, which surfaced `[object Object]`
 * to the user — the exact bug reported on the "Se opskrift"
 * button.
 */
function renderRecipeHtml(recipe) {
  const title = escapeHtml(recipe.title);
  const description = escapeHtml(recipe.description);
  const time = escapeHtml(recipe.timeMinutes);
  const ingredientList = (recipe.ingredients || [])
    .map((i) => `<li>${renderIngredientLine(i)}</li>`)
    .join("");
  const stepList = (recipe.steps || [])
    .map((s) => `<li>${escapeHtml(s)}</li>`)
    .join("");
  return (
    `<article class="recipe">` +
    `<h3>${title}</h3>` +
    `<p class="recipe-description">${description}</p>` +
    `<p class="recipe-time">Tid: ${time} min</p>` +
    `<h4>Ingredienser</h4>` +
    `<ul>${ingredientList}</ul>` +
    `<h4>Fremgangsmåde</h4>` +
    `<ol>${stepList}</ol>` +
    `<button class="close-recipe">Luk</button>` +
    `</article>`
  );
}

/**
 * Render one ingredient line as `"<amount> <unit> <name>"` —
 * the conventional Danish recipe line ("500 g kartofler").
 * Fields are escaped individually so the LLM cannot inject markup.
 */
function renderIngredientLine(ingredient) {
  const amount = escapeHtml(ingredient.amount);
  const unit = escapeHtml(ingredient.unit);
  const name = escapeHtml(ingredient.name);
  return `${amount} ${unit} ${name}`;
}

function showRecipe(recipe) {
  // Show the full recipe in a modal or inline below the cards.
  const container = document.getElementById("recipe-display");
  if (!container) {
    // Create one if it doesn't exist.
    const section = document.createElement("section");
    section.id = "recipe-display";
    section.setAttribute("aria-label", "Fuld opskrift");
    const results = document.getElementById("results");
    if (results) results.appendChild(section);
  }
  const el = document.getElementById("recipe-display");
  if (!el) return;
  el.innerHTML = renderRecipeHtml(recipe);
  el.querySelector(".close-recipe")?.addEventListener("click", () => {
    el.innerHTML = "";
  });
  el.scrollIntoView({ behavior: "smooth" });
}

function applyChipState(chip) {
  const state = chip.dataset.state || "neutral";
  chip.setAttribute("aria-pressed", state !== "neutral" ? "true" : "false");
  chip.classList.toggle("include", state === "include");
  chip.classList.toggle("exclude", state === "exclude");
  chip.classList.toggle("neutral", state === "neutral");
}

function wireChips() {
  const container = document.getElementById("chips");
  if (!container) return;
  const chips = Array.from(container.querySelectorAll(".chip"));
  for (const chip of chips) {
    chip.addEventListener("click", async () => {
      chip.dataset.state = nextState(chip.dataset.state);
      applyChipState(chip);
      await saveFilter(chips);
    });
  }
}

function wireCustomForm() {
  const form = document.getElementById("custom-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    if (name.length === 0) return;
    const res = await fetch("/api/custom-ingredients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      form.reset();
      reloadPage();
    } else {
      setStatus("Kunne ikke tilføje råvaren. Prøv igen.");
    }
  });

  for (const removeBtn of document.querySelectorAll("[data-remove-custom]")) {
    removeBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      const slug = removeBtn.getAttribute("data-remove-custom");
      const res = await fetch(
        `/api/custom-ingredients/${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      if (res.ok) reloadPage();
    });
  }
}

function reloadPage() {
  window.location.reload();
}

/**
 * Fetch inspiration using Server-Sent Events (SSE) to provide
 * real-time feedback to the user while the LLM is thinking.
 */
async function streamInspiration() {
  const res = await fetch("/api/inspiration", { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Kunne ikke få forslag");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (currentEvent === "done") {
          const parsed = JSON.parse(data);
          finishPhase();
          return parsed;
        } else if (currentEvent === "error") {
          clearThinking();
          const errData = JSON.parse(data);
          throw new Error(errData.error || "Fejl");
        } else if (currentEvent === "status") {
          showPhase(data);
          setStatus(data);
        } else if (currentEvent === "thinking") {
          showThinking(data);
        }
      } else if (line === "") {
        currentEvent = "message";
      }
    }
  }
  
  throw new Error("Uventet afslutning på stream");
}

/**
 * Refresh: show skeleton, fetch inspiration, render meals or
 * show a retry button on error.
 */
function wireRefresh() {
  const btn = document.getElementById("refresh");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    renderSkeleton();
    setStatus("Forbereder...");
    btn.disabled = true;
    try {
      const body = await streamInspiration();
      renderMeals(body.meals || []);
      const count = body.meals ? body.meals.length : 0;
      setStatus(count > 0 ? "" : "Ingen forslag.");
    } catch (err) {
      showError(err.message || "Kunne ikke få forslag — prøv igen");
    } finally {
      btn.disabled = false;
    }
  });
}

/**
 * Show an error message with a retry button in the meals area.
 */
function showError(message) {
  const container = document.getElementById("meal-cards");
  if (!container) return;
  // Hide the thinking panel on error.
  const panel = document.getElementById("thinking-panel");
  if (panel) panel.hidden = true;
  // Remove any summary line.
  const existingSummary = document.querySelector(".thinking-summary-line");
  if (existingSummary) existingSummary.remove();

  container.innerHTML =
    `<div class="error-block">` +
    `<p>${escapeHtml(message)}</p>` +
    `<button id="retry-btn" class="primary" type="button">Prøv igen</button>` +
    `</div>`;
  const retry = document.getElementById("retry-btn");
  if (retry) {
    retry.addEventListener("click", () => {
      const refresh = document.getElementById("refresh");
      if (refresh) refresh.click();
    });
  }
}

/**
 * Render a one-line summary below the meal cards after generation.
 * Uses real counts from the DOM (in-season ingredients, active
 * filters) and the user's dietary profile label.
 */
function showSummary(mealCount) {
  const mealsEl = document.getElementById("meals");
  if (!mealsEl) return;

  // Remove any existing summary line.
  const existing = mealsEl.querySelector(".thinking-summary-line");
  if (existing) existing.remove();

  const chips = document.querySelectorAll("#chips .chip");
  const inSeasonCount = chips.length;
  const activeFilterCount = Array.from(chips).filter(
    (c) => c.dataset.state !== "neutral",
  ).length;
  const profileLabel =
    document.body.getAttribute("data-profile-label") || "";

  let text = `Fandt ${mealCount} forslag ud fra ${inSeasonCount} sæsonråvarer`;

  const extras = [];
  if (activeFilterCount > 0) {
    extras.push(`${activeFilterCount} aktive filtre`);
  }
  if (profileLabel) {
    extras.push(`din profil`);
  }

  if (extras.length === 2) {
    text += `, ${extras[0]} og ${extras[1]}`;
  } else if (extras.length === 1) {
    text += ` og ${extras[0]}`;
  }

  text += ".";

  const summaryEl = document.createElement("p");
  summaryEl.className = "thinking-summary-line";
  summaryEl.textContent = text;
  mealsEl.appendChild(summaryEl);
}

function init() {
  for (const chip of document.querySelectorAll(".chip")) {
    applyChipState(chip);
  }
  wireChips();
  wireCustomForm();
  wireRefresh();
  wireThinkingDismiss();
}

/**
 * Wire the dismiss button on the thinking panel.
 */
function wireThinkingDismiss() {
  const dismissBtn = document.getElementById("thinking-dismiss");
  if (dismissBtn) {
    dismissBtn.addEventListener("click", () => {
      const panel = document.getElementById("thinking-panel");
      if (panel) {
        panel.hidden = true;
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
