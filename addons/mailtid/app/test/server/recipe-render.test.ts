import { describe, expect, test } from "vitest";
import { escapeHtml, renderIngredientLine, renderRecipeHtml } from "../../src/server/recipe-render.js";
import type { FullRecipe } from "../../src/inspiration/recipe-service.js";

/**
 * The exact JSON object the user pasted from the Chrome network
 * panel while debugging the "Se opskrift" bug — the recipe was
 * being fetched correctly but never rendered. Used here as the
 * regression fixture so the rendered HTML is asserted against
 * the same input the user reported.
 */
const USER_FIXTURE: FullRecipe = {
 title: "Kartoffelsalat med agurk og dild",
 description:
 "Nye kartofler vendt med agurk, radiser og frisk dild - en let og sommerlig salat.",
 ingredients: [
 { name: "nye kartofler", amount: "500", unit: "g" },
 { name: "agurk", amount: "1/2", unit: "stk" },
 { name: "radiser", amount: "10", unit: "stk" },
 { name: "frisk dild", amount: "10", unit: "g" },
 { name: "olivenolie", amount: "3", unit: "spsk" },
 { name: "hvidvinseddike", amount: "1", unit: "spsk" },
 { name: "salt", amount: "1", unit: "tsk" },
 { name: "peber", amount: "1/2", unit: "tsk" },
 { name: "sukker", amount: "1/2", unit: "tsk" },
 ],
 steps: [
 "Vask kartoflerne grundigt og kog dem i letsaltet vand i ca.15 minutter, til de er møre. Hæld vandet fra og lad dem afkøle let.",
 "Skær agurken i halve skiver, radiserne i tynde skiver og hak dilden groft.",
 "Rør dressingen af olivenolie, hvidvinseddike, salt, peber og sukker sammen i en skål.",
 "Bland de lune kartofler med agurk, radiser, dild og dressing. Vend det hele forsigtigt sammen.",
 "Smag til med ekstra salt og peber. Lad salaten trække i10 minutter inden servering.",
 ],
 timeMinutes:30,
};

describe("renderRecipeHtml", () => {
 test("never renders '[object Object]' for an ingredient row (regression for the Se opskrift bug)", () => {
 const html = renderRecipeHtml(USER_FIXTURE);
 expect(html).not.toContain("[object Object]");
 });

 test("includes the recipe title in an h3", () => {
 const html = renderRecipeHtml(USER_FIXTURE);
 expect(html).toContain("<h3>Kartoffelsalat med agurk og dild</h3>");
 });

 test("includes the recipe description", () => {
 // The previous showRecipe never rendered the description even
 // though the server returned it — fix surfaces it.
 const html = renderRecipeHtml(USER_FIXTURE);
 expect(html).toContain("Nye kartofler vendt med agurk");
 });

 test("includes the time as '<n> min'", () => {
 // The previous showRecipe dropped timeMinutes entirely.
 const html = renderRecipeHtml(USER_FIXTURE);
 expect(html).toContain("Tid: 30 min");
 });

 test("renders every ingredient as '<amount> <unit> <name>' inside a list item", () => {
 const html = renderRecipeHtml(USER_FIXTURE);
 expect(html).toContain("<li>500 g nye kartofler</li>");
 expect(html).toContain("<li>1/2 stk agurk</li>");
 expect(html).toContain("<li>10 stk radiser</li>");
 expect(html).toContain("<li>10 g frisk dild</li>");
 expect(html).toContain("<li>3 spsk olivenolie</li>");
 expect(html).toContain("<li>1 spsk hvidvinseddike</li>");
 expect(html).toContain("<li>1 tsk salt</li>");
 expect(html).toContain("<li>1/2 tsk peber</li>");
 expect(html).toContain("<li>1/2 tsk sukker</li>");
 });

 test("renders the steps in an ordered list, one step per <li>", () => {
 const html = renderRecipeHtml(USER_FIXTURE);
 expect(html).toContain(
 "<li>Vask kartoflerne grundigt og kog dem i letsaltet vand i ca.15 minutter, til de er møre. Hæld vandet fra og lad dem afkøle let.</li>",
 );
 expect(html).toContain(
 "<li>Smag til med ekstra salt og peber. Lad salaten trække i10 minutter inden servering.</li>",
 );
 });

 test("includes a close button so the user can dismiss the recipe", () => {
 const html = renderRecipeHtml(USER_FIXTURE);
 expect(html).toContain('<button class="close-recipe">Luk</button>');
 });

 test("escapes HTML in the title, description and steps so the LLM cannot inject markup", () => {
 const html = renderRecipeHtml({
 ...USER_FIXTURE,
 title: "Tomat<b>salat</b> & <i>peber</i>",
 description: 'Farlig "beskrivelse" <script>',
 steps: ["Trin1 <em>med</em> markup & 'citater'."],
 });
 expect(html).toContain("Tomat&lt;b&gt;salat&lt;/b&gt; &amp; &lt;i&gt;peber&lt;/i&gt;");
 expect(html).toContain("Farlig &quot;beskrivelse&quot; &lt;script&gt;");
 expect(html).toContain("Trin1 &lt;em&gt;med&lt;/em&gt; markup &amp; &#39;citater&#39;.");
 // Make sure no raw <script> slipped through.
 expect(html.toLowerCase()).not.toContain("<script>");
 });

 test("escapes HTML in ingredient fields too", () => {
 const html = renderRecipeHtml({
 ...USER_FIXTURE,
 ingredients: [{ name: "<img onerror=alert(1)>", amount: "1", unit: "stk" }],
 });
 expect(html).not.toContain("<img onerror=alert(1)>");
 expect(html).toContain("&lt;img onerror=alert(1)&gt;");
 });

 test("renders an empty ingredient list gracefully when the array is missing", () => {
 const html = renderRecipeHtml({
 ...USER_FIXTURE,
 ingredients: undefined as unknown as FullRecipe["ingredients"],
 });
 expect(html).toContain("<h4>Ingredienser</h4>");
 expect(html).toContain("<ul></ul>");
 expect(html).not.toContain("[object Object]");
 });

 test("renders an empty step list gracefully when the array is missing", () => {
 const html = renderRecipeHtml({
 ...USER_FIXTURE,
 steps: undefined as unknown as FullRecipe["steps"],
 });
 // Steps are required to render, so we still emit the heading.
 expect(html).toContain("<h4>Fremgangsmåde</h4>");
 });

 test("the recipe card is wrapped in a <article class=\"recipe\"> root element", () => {
 const html = renderRecipeHtml(USER_FIXTURE);
 expect(html.startsWith('<article class="recipe">')).toBe(true);
 expect(html.endsWith("</article>")).toBe(true);
 });
});

describe("renderIngredientLine", () => {
 test("joins amount, unit and name with single spaces", () => {
 expect(renderIngredientLine({ name: "kartofler", amount: "500", unit: "g" })).toBe(
 "500 g kartofler",
 );
 });

 test("escapes each field independently", () => {
 expect(
 renderIngredientLine({ name: "<b>kartofler</b>", amount: "1 &1/2", unit: "kg <>" }),
 ).toBe("1 &amp;1/2 kg &lt;&gt; &lt;b&gt;kartofler&lt;/b&gt;");
 });
});

describe("escapeHtml", () => {
 test("escapes the five HTML-significant characters", () => {
 expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
 });

 test("escapes & first so subsequent entities are not double-escaped", () => {
 // "&amp;" -> "&amp;amp;" (the & gets escaped first, then amp is literal).
 expect(escapeHtml("&amp;")).toBe("&amp;amp;");
 });

 test("accepts a number by coercing it via String()", () => {
 expect(escapeHtml(30)).toBe("30");
 expect(escapeHtml(0)).toBe("0");
 });
});
