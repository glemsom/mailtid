import type { FullRecipe, FullRecipeIngredient } from "../inspiration/recipe-service.js";

/**
 * Render a {@link FullRecipe} as the HTML that `static/app.js` and
 * the favourites page's inline `<script>` both inject into the
 * `#recipe-display` section when the user taps "Se opskrift".
 *
 * Single source of truth for the recipe card shape on the
 * client. Lives in the TypeScript build pipeline so it has a
 * correct test seam; `static/app.js` mirrors the logic and any
 * drift between the two is a known follow-up (see TODO below).
 *
 * The ingredient shape produced by the LLM (and validated by
 * {@link FullRecipeIngredient}) is `{name, amount, unit}` — three
 * fields, not a single string. Rendering them as strings would
 * surface `[object Object]` to the user; this function does the
 * field-by-field concatenation instead.
 *
 * @returns A self-contained `<article class="recipe">…</article>`
 * string. No external dependencies, no DOM access — pure.
 */
export function renderRecipeHtml(recipe: FullRecipe): string {
 const title = escapeHtml(recipe.title);
 const description = escapeHtml(recipe.description);
 const time = escapeHtml(recipe.timeMinutes);
 const ingredientList = (recipe.ingredients ?? [])
 .map((i) => `<li>${renderIngredientLine(i)}</li>`)
 .join("");
 const stepList = (recipe.steps ?? [])
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
 * Render one ingredient line as `"<amount> <unit> <name>"` — the
 * conventional Danish recipe line ("500 g kartofler"). The fields
 * are escaped individually so a malicious or malformed `name`
 * cannot inject markup.
 */
export function renderIngredientLine(ingredient: FullRecipeIngredient): string {
 const amount = escapeHtml(ingredient.amount);
 const unit = escapeHtml(ingredient.unit);
 const name = escapeHtml(ingredient.name);
 return `${amount} ${unit} ${name}`;
}

/**
 * HTML-escape a string for safe interpolation into markup.
 * Accepts `number` too so callers do not need to coerce before
 * escaping (recipe `timeMinutes` is a number).
 *
 * Escapes `&` first so we do not double-escape the entities
 * introduced by the later replacements.
 */
export function escapeHtml(raw: string | number): string {
 return String(raw)
 .replace(/&/g, "&amp;")
 .replace(/</g, "&lt;")
 .replace(/>/g, "&gt;")
 .replace(/"/g, "&quot;")
 .replace(/'/g, "&#39;");
}
