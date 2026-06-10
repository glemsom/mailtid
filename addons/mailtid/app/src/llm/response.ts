/**
 * Pull a JSON value (object or array) out of a raw LLM response.
 *
 * The LLM is told in the prompt to return pure JSON, but real
 * models sometimes wrap the answer in ```json``` fences or add a
 * one-line preamble / postamble of prose. This helper strips both
 * forms before parsing:
 *
 *   - ```json ... ``` (or ``` ... ```) fences are stripped.
 *   - A leading / trailing prose is ignored; we slice from the
 *     first `{` (or `[`) to the matching last `}` (or `]`).
 *
 * Throws if the response contains no JSON value or the extracted
 * substring is not valid JSON. The caller is responsible for
 * validating the *shape* of the returned value.
 */
export function extractJsonObject(raw: string): unknown {
  // Strip ```json ... ``` fences if the model added them.
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? raw;

  // Find the first opening bracket and the matching last closing
  // bracket — works for both top-level objects `{...}` and
  // top-level arrays `[...]`.
  const firstBrace = candidate.search(/[\[{]/);
  const lastBrace = Math.max(
    candidate.lastIndexOf("}"),
    candidate.lastIndexOf("]"),
  );
  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new Error("LLM response contained no JSON value");
  }
  try {
    return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
  } catch (err) {
    throw new Error(
      `LLM response was not valid JSON: ${(err as Error).message}`,
    );
  }
}
