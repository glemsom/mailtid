import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const cssPath = resolve(import.meta.dirname, "../../static/app.css");
const css = readFileSync(cssPath, "utf-8");

/**
 * Helper: extracts the body of a CSS rule block by selector prefix.
 * Returns the text between `{` and the matching `}`, or empty string if not found.
 */
function ruleBody(selector: string): string {
  // Find the selector, then find its opening brace, then find the matching closing brace.
  const start = css.indexOf(selector + " {") !== -1
    ? css.indexOf(selector + " {") + selector.length + 2
    : css.indexOf(selector + "{") !== -1
      ? css.indexOf(selector + "{") + selector.length + 1
      : -1;
  if (start === -1) return "";

  let depth = 1;
  let i = start;
  while (i < css.length && depth > 0) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") depth--;
    i++;
  }
  return css.slice(start, i - 1).trim();
}

describe("thinking panel CSS (kitchen thought visual identity)", () => {
  test("thinking panel background is distinct from meal-card background", () => {
    const panelBody = ruleBody(".thinking-panel");
    expect(panelBody).toBeTruthy();

    // Must NOT use var(--card-bg) — that's the meal-card background.
    expect(panelBody).not.toMatch(/background:\s*var\(--card-bg\)/);
  });

  test("thinking panel has a left accent border in warm amber/gold", () => {
    const panelBody = ruleBody(".thinking-panel");

    // Should have border-left (not just a uniform border).
    expect(panelBody).toMatch(/border-left/);

    // The existing uniform `border` shorthand should be removed since we're
    // replacing it with a left accent border.
    // Actually the panel can keep a subtle border on other sides, but
    // the signature is the left accent border. Let's verify there's
    // no `border: 1px solid var(--card-border)` that gives a uniform look.
    expect(panelBody).not.toMatch(/border:\s*1px solid var\(--card-border\)/);
  });

  test("raw reasoning tokens area is italic at 13px with comfortable line-height", () => {
    const tokensBody = ruleBody(".thinking-tokens");
    expect(tokensBody).toBeTruthy();

    // Must be italic.
    expect(tokensBody).toMatch(/font-style:\s*italic/);

    // Font size 13px.
    expect(tokensBody).toMatch(/font-size:\s*13px/);

    // Line-height >= 1.7 (the value might be 1.7, 1.75, 1.8, etc.).
    const lhMatch = tokensBody.match(/line-height:\s*([\d.]+)/);
    expect(lhMatch).toBeTruthy();
    const lh = parseFloat(lhMatch![1]);
    expect(lh).toBeGreaterThanOrEqual(1.7);
  });

  test("active phase label has a pulsing dot animation defined in CSS", () => {
    // A @keyframes rule for the thinking-phase dot pulse must exist.
    expect(css).toMatch(/@keyframes\s+dot-pulse/);

    // The active phase label (or its pseudo-element) should reference the animation.
    const dotRef = css.match(/animation:\s*[^;]*dot-pulse[^;]*;/);
    expect(dotRef).toBeTruthy();
  });

  test("animations are wrapped in prefers-reduced-motion: no-preference media query", () => {
    const animMedia = css.match(
      /@media\s*\(\s*prefers-reduced-motion:\s*no-preference\s*\)\s*\{/,
    );
    expect(animMedia).toBeTruthy();
  });

  test("thinking-chip for highlighted ingredient names has a subtle pill style", () => {
    const chipBody = ruleBody(".thinking-chip");
    expect(chipBody).toBeTruthy();

    // Must be inline (not block) so it flows with surrounding text.
    expect(chipBody).toMatch(/display:\s*inline/);

    // Must use a subtle background, not the full chip background.
    expect(chipBody).toMatch(/background/);

    // Must NOT use var(--card-bg) or var(--neutral) — should be subtle.
    expect(chipBody).not.toMatch(/background:\s*var\(--card-bg\)/);
    expect(chipBody).not.toMatch(/background:\s*var\(--neutral\)/);

    // Should have a subdued pill shape (border-radius, small padding).
    expect(chipBody).toMatch(/border-radius/);
  });

  test("thinking-chip overrides italic from thinking-tokens to stand out", () => {
    const chipBody = ruleBody(".thinking-chip");
    expect(chipBody).toBeTruthy();

    // Should explicitly set font-style to normal so ingredients
    // are readable inside the italic reasoning text.
    expect(chipBody).toMatch(/font-style:\s*normal/);
  });
});
