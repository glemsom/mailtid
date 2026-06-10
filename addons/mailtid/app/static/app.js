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
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render 5 skeleton cards while the LLM call is in flight.
 */
function renderSkeleton() {
  const container = document.getElementById("meals");
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
}

function renderMeals(meals) {
  const container = document.getElementById("meals");
  if (!container) return;
  if (meals.length === 0) {
    container.innerHTML =
      '<p class="empty">Ingen forslag endnu — tryk "Vis 5 nye".</p>';
    return;
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
        `<button class="recipe-btn" data-recipe-title="${escapeHtml(meal.title)}"` +
        ` data-recipe-desc="${escapeHtml(meal.description)}">` +
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

  // Wire recipe buttons.
  for (const btn of container.querySelectorAll(".recipe-btn")) {
    btn.addEventListener("click", async () => {
      const title = btn.getAttribute("data-recipe-title") || "";
      const description = btn.getAttribute("data-recipe-desc") || "";
      btn.disabled = true;
      btn.textContent = "Henter opskrift...";
      try {
        const res = await fetch("/api/inspiration/recipe", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, description }),
        });
        if (res.ok) {
          const recipe = await res.json();
          showRecipe(recipe);
        } else {
          setStatus("Kunne ikke hente opskrift.");
        }
      } catch (err) {
        setStatus("Kunne ikke hente opskrift.");
      } finally {
        btn.disabled = false;
        btn.textContent = "Se opskrift";
      }
    });
  }
}

function showRecipe(recipe) {
  // Show the full recipe in a modal or inline below the cards.
  // For now, render it in the status area as a simple display.
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
  el.innerHTML =
    `<article class="recipe">` +
    `<h3>${escapeHtml(recipe.title)}</h3>` +
    `<h4>Ingredienser</h4>` +
    `<ul>${(recipe.ingredients || []).map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` +
    `<h4>Fremgangsmåde</h4>` +
    `<ol>${(recipe.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>` +
    `<button class="close-recipe">Luk</button>` +
    `</article>`;
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
 * Refresh: show skeleton, fetch inspiration, render meals or
 * show a retry button on error.
 */
function wireRefresh() {
  const btn = document.getElementById("refresh");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    renderSkeleton();
    setStatus("");
    btn.disabled = true;
    try {
      const res = await fetch("/api/inspiration", { method: "POST" });
      if (res.ok) {
        const body = await res.json();
        renderMeals(body.meals || []);
        const count = body.meals ? body.meals.length : 0;
        setStatus(count > 0 ? "" : "Ingen forslag.");
      } else {
        const body = await res.json();
        const msg = body.error || "Kunne ikke få forslag — prøv igen";
        showError(msg);
      }
    } catch (err) {
      showError("Kunne ikke få forslag — prøv igen");
    } finally {
      btn.disabled = false;
    }
  });
}

/**
 * Show an error message with a retry button in the meals area.
 */
function showError(message) {
  const container = document.getElementById("meals");
  if (!container) return;
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

function init() {
  for (const chip of document.querySelectorAll(".chip")) {
    applyChipState(chip);
  }
  wireChips();
  wireCustomForm();
  wireRefresh();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
