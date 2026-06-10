/**
 * Mailtid front-end.
 *
 * Tiny, no-framework script that wires the server-rendered HTML
 * to a few endpoints. Three responsibilities:
 *
 *  1. Cycle a chip's filter state on click (neutral → include →
 *     exclude → neutral) and PUT the new state to /api/filter.
 *  2. Submit the custom-mandatory form to /api/custom-ingredients
 *     and re-render the custom-chip list when the user clicks
 *     "Fjern" (×).
 *  3. Render the 5 short-form Meal Inspirations returned by
 *     /api/inspiration when the "Vis 5 nye" button is clicked.
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
        `<article class="meal"><h3>${escapeHtml(meal.title)}</h3>` +
        `<p>${escapeHtml(meal.description)}</p></article>`,
    )
    .join("");
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

function wireRefresh() {
  const btn = document.getElementById("refresh");
  if (!btn) return;
  btn.addEventListener("click", async () => {
    setStatus("Henter forslag...");
    btn.disabled = true;
    try {
      const res = await fetch("/api/inspiration", { method: "POST" });
      if (!res.ok) {
        setStatus("Kunne ikke få forslag — prøv igen.");
        return;
      }
      const body = await res.json();
      renderMeals(body.meals || []);
      setStatus(body.meals && body.meals.length > 0 ? "" : "Ingen forslag.");
    } catch (err) {
      setStatus("Kunne ikke få forslag — prøv igen.");
    } finally {
      btn.disabled = false;
    }
  });
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
