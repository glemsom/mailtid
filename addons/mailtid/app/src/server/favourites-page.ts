import type { FavouriteMeal } from "../db/favourites.js";
import { escapeHtml } from "./html.js";
import { renderRecipeHtml } from "./recipe-render.js";

export interface FavouritesPageData {
  favourites: readonly FavouriteMeal[];
}

/**
 * Render the Mailtid "Favouritter" page as a full HTML document.
 * Server-rendered so saved meals appear immediately without a JS
 * round-trip. Shows an empty-state message when no favourites exist.
 *
 * The recipe-rendering script below mirrors the logic in
 * {@link renderRecipeHtml} (`src/server/recipe-render.ts`). The
 * TS module is the single source of truth and is exercised by
 * `test/server/recipe-render.test.ts`; the inline `<script>` here
 * is a deliberate copy because the page is rendered server-side
 * with no bundler. Any drift between the two is a bug — keep them
 * in lockstep.
 */
export function renderFavouritesPage(data: FavouritesPageData): string {
  const hasFavourites = data.favourites.length > 0;

  const listHtml = hasFavourites
    ? data.favourites
        .map(
          (f) =>
            `<article class="meal">` +
            `<h3>${escapeHtml(f.title)}</h3>` +
            `<p>${escapeHtml(f.description)}</p>` +
            `<button class="recipe-btn" data-recipe-title="${escapeHtml(f.title)}"` +
            ` data-recipe-desc="${escapeHtml(f.description)}">Se opskrift</button>` +
            `</article>`,
        )
        .join("")
    : `<p class="empty">Ingen favoritter endnu — tryk hjertet på et måltid for at gemme det.</p>`;

  const countHtml = hasFavourites
    ? `<p class="count">${data.favourites.length} favorit${data.favourites.length === 1 ? "" : "ter"}</p>`
    : "";

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Favouritter — Mailtid</title>
  <link rel="stylesheet" href="/static/app.css">
</head>
<body>
  <header>
    <div class="nav">
      <h1>Mailtid</h1>
      <a href="/">← Tilbage til forsiden</a>
    </div>
    <p class="tagline">Dine gemte favoritter.</p>
  </header>

  <section aria-label="Favouritter">
    <h2>Favouritter</h2>
    ${countHtml}
    <div class="meals">${listHtml}</div>
  </section>

  <section id="recipe-display" aria-label="Fuld opskrift"></section>
  <p id="status" class="status" role="status" aria-live="polite"></p>

  <script>
    // ---- BEGIN mirror of src/server/recipe-render.ts ----
    // Keep in lockstep with the TS module: see
    // src/server/recipe-render.ts (renderRecipeHtml, renderIngredientLine,
    // escapeHtml) and test/server/recipe-render.test.ts for the contract.
    function escapeHtml(raw) {
      return String(raw)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    function renderIngredientLine(i) {
      const amount = escapeHtml(i.amount);
      const unit = escapeHtml(i.unit);
      const name = escapeHtml(i.name);
      return amount + " " + unit + " " + name;
    }
    function renderRecipeHtml(recipe) {
      const title = escapeHtml(recipe.title);
      const description = escapeHtml(recipe.description);
      const time = escapeHtml(recipe.timeMinutes);
      const ingredientList = (recipe.ingredients || [])
        .map(function (i) { return "<li>" + renderIngredientLine(i) + "</li>"; })
        .join("");
      const stepList = (recipe.steps || [])
        .map(function (s) { return "<li>" + escapeHtml(s) + "</li>"; })
        .join("");
      return (
        '<article class="recipe">' +
        '<h3>' + title + '</h3>' +
        '<p class="recipe-description">' + description + '</p>' +
        '<p class="recipe-time">Tid: ' + time + ' min</p>' +
        '<h4>Ingredienser</h4>' +
        '<ul>' + ingredientList + '</ul>' +
        '<h4>Fremgangsmåde</h4>' +
        '<ol>' + stepList + '</ol>' +
        '<button class="close-recipe">Luk</button>' +
        '</article>'
      );
    }
    // ---- END mirror of src/server/recipe-render.ts ----

    function setStatus(text) {
      const el = document.getElementById("status");
      if (el) el.textContent = text;
    }

    async function fetchRecipe(title, description) {
      const res = await fetch("/api/inspiration/recipe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Kunne ikke hente opskriften.");
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
              return JSON.parse(data);
            } else if (currentEvent === "error") {
              const errData = JSON.parse(data);
              throw new Error(errData.error || "Kunne ikke hente opskriften.");
            } else if (currentEvent === "status") {
              setStatus(data);
            }
          } else if (line === "") {
            currentEvent = "message";
          }
        }
      }

      throw new Error("Uventet afslutning på stream");
    }

    for (const btn of document.querySelectorAll(".recipe-btn")) {
      btn.addEventListener("click", async () => {
        const title = btn.getAttribute("data-recipe-title") || "";
        const description = btn.getAttribute("data-recipe-desc") || "";
        btn.disabled = true;
        const previousLabel = btn.textContent || "Se opskrift";
        btn.textContent = "Henter opskrift...";
        try {
          const recipe = await fetchRecipe(title, description);
          const el = document.getElementById("recipe-display");
          if (el) {
            el.innerHTML = renderRecipeHtml(recipe);
            el.querySelector(".close-recipe")?.addEventListener("click", function () {
              el.innerHTML = "";
            });
            el.scrollIntoView({ behavior: "smooth" });
          }
        } catch (err) {
          setStatus(err.message || "Kunne ikke hente opskriften. Prøv igen.");
        } finally {
          btn.disabled = false;
          btn.textContent = previousLabel;
        }
      });
    }
  </script>
</body>
</html>`;
}

