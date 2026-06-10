/**
 * Escape a string for safe inclusion in an HTML text node or
 * double-quoted attribute value. Used by the server-rendered
 * template so user-supplied content (e.g. custom ingredient
 * names) can never inject markup.
 */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Re-export the Danish month name helper from the prompt module so
// the page template and the LLM prompt stay in lockstep.
export { danishMonthName } from "../llm/prompt.js";
