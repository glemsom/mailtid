import { describe, expect, test } from "vitest";
import { extractJsonObject } from "../../src/llm/response.js";

describe("extractJsonObject", () => {
  test("returns the parsed object from clean JSON input", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  test("strips ```json fences if the model added them", () => {
    expect(extractJsonObject("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  test("strips ``` fences without the json language tag", () => {
    expect(extractJsonObject("```\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  test("ignores prose before and after the JSON object", () => {
    expect(extractJsonObject('Her er svaret:\n{"a":1}\nGod fornøjelse!')).toEqual({
      a: 1,
    });
  });

  test("throws when there is no JSON object in the input", () => {
    expect(() => extractJsonObject("no json at all")).toThrow();
  });

  test("throws when the extracted substring is not valid JSON", () => {
    expect(() => extractJsonObject("garbage {not json} more garbage")).toThrow();
  });

  test("returns an array when the response is a top-level array", () => {
    // Useful if a future LLM call returns an array at the top level.
    expect(extractJsonObject("[1, 2, 3]")).toEqual([1, 2, 3]);
  });
});
