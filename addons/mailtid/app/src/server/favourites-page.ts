import type { FavouriteMeal } from "../db/favourites.js";
import { escapeHtml } from "./html.js";

export interface FavouritesPageData {
  favourites: readonly FavouriteMeal[];
}

/**
 * Render the Mailtid "Favouritter" page as a full HTML document.
 * Server-rendered so saved meals appear immediately without a JS
 * round-trip. Shows an empty-state message when no favourites exist.
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

  <script>
    function escapeHtml(raw) {
      return raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    for (const btn of document.querySelectorAll(".recipe-btn")) {
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
            const el = document.getElementById("recipe-display");
            if (el) {
              el.innerHTML =
                '<article class="recipe">' +
                '<h3>' + escapeHtml(recipe.title) + '</h3>' +
                '<h4>Ingredienser</h4>' +
                '<ul>' + (recipe.ingredients || []).map(function(i) { return '<li>' + escapeHtml(i) + '</li>'; }).join("") + '</ul>' +
                '<h4>Fremgangsmåde</h4>' +
                '<ol>' + (recipe.steps || []).map(function(s) { return '<li>' + escapeHtml(s) + '</li>'; }).join("") + '</ol>' +
                '<button class="close-recipe">Luk</button>' +
                '</article>';
              el.querySelector(".close-recipe")?.addEventListener("click", function() { el.innerHTML = ""; });
              el.scrollIntoView({ behavior: "smooth" });
            }
          }
        } catch (err) {
          // Silently ignore.
        } finally {
          btn.disabled = false;
          btn.textContent = "Se opskrift";
        }
      });
    }
  </script>
</body>
</html>`;
}
