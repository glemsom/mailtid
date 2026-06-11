import { describe, expect, test } from "vitest";
import { parseShortFormResponse } from "../../src/inspiration/service.js";

/**
 * Regression tests for the bug:
 *   Error: meals[0].ingredients[7].amount must be a non-empty string
 *
 * The LLM sometimes returns ingredient amounts as numbers instead of
 * strings, as empty strings, or omits them. The validator now coerces
 * numbers to strings and tolerates empty/missing values.
 */
describe("ingredient amount coercion (regression)", () => {
  test("coerces numeric amount to string", () => {
    const raw = JSON.stringify({
      meals: [
        {
          title: "Test",
          description: "Test desc",
          ingredients: [
            { name: "a", amount: "100", unit: "g" },
            { name: "b", amount: "200", unit: "g" },
            { name: "c", amount: "300", unit: "g" },
            { name: "d", amount: "400", unit: "g" },
            { name: "e", amount: "500", unit: "g" },
            { name: "f", amount: "600", unit: "g" },
            { name: "g", amount: "700", unit: "g" },
            { name: "h", amount: 800, unit: "g" }, // number → string
          ],
          steps: ["step1"],
          time_minutes: 30,
        },
      ],
    });

    const meals = parseShortFormResponse(raw);
    expect(meals).toHaveLength(1);
    expect(meals[0]!.ingredients[7]!.amount).toBe("800");
    expect(typeof meals[0]!.ingredients[7]!.amount).toBe("string");
  });

  test("coerces numeric unit to string", () => {
    const raw = JSON.stringify({
      meals: [
        {
          title: "Test",
          description: "Test desc",
          ingredients: [
            { name: "a", amount: "100", unit: 200 }, // number unit
          ],
          steps: ["step1"],
          time_minutes: 30,
        },
      ],
    });

    const meals = parseShortFormResponse(raw);
    expect(meals[0]!.ingredients[0]!.unit).toBe("200");
    expect(typeof meals[0]!.ingredients[0]!.unit).toBe("string");
  });

  test("tolerates empty-string amount", () => {
    const raw = JSON.stringify({
      meals: [
        {
          title: "Test",
          description: "Test desc",
          ingredients: [
            { name: "salt", amount: "", unit: "efter smag" },
          ],
          steps: ["step1"],
          time_minutes: 30,
        },
      ],
    });

    // Must not throw — empty string is tolerated.
    const meals = parseShortFormResponse(raw);
    expect(meals[0]!.ingredients[0]!.amount).toBe("");
  });

  test("tolerates missing amount (defaults to empty string)", () => {
    const raw = JSON.stringify({
      meals: [
        {
          title: "Test",
          description: "Test desc",
          ingredients: [
            { name: "garnish", unit: "stk" }, // amount missing
          ],
          steps: ["step1"],
          time_minutes: 30,
        },
      ],
    });

    const meals = parseShortFormResponse(raw);
    expect(meals[0]!.ingredients[0]!.amount).toBe("");
  });

  test("tolerates missing unit (defaults to empty string)", () => {
    const raw = JSON.stringify({
      meals: [
        {
          title: "Test",
          description: "Test desc",
          ingredients: [
            { name: "garnish", amount: "lidt" }, // unit missing
          ],
          steps: ["step1"],
          time_minutes: 30,
        },
      ],
    });

    const meals = parseShortFormResponse(raw);
    expect(meals[0]!.ingredients[0]!.unit).toBe("");
  });

  test("null amount defaults to empty string", () => {
    const raw = JSON.stringify({
      meals: [
        {
          title: "Test",
          description: "Test desc",
          ingredients: [
            { name: "a", amount: null, unit: "g" },
          ],
          steps: ["step1"],
          time_minutes: 30,
        },
      ],
    });

    const meals = parseShortFormResponse(raw);
    expect(meals[0]!.ingredients[0]!.amount).toBe("");
  });

  test("full roundtrip: 5 meals with mixed valid and borderline ingredients", () => {
    // Simulates a realistic LLM response where most ingredients are
    // well-formed but a few have numbers or empty strings.
    const raw = JSON.stringify({
      meals: [
        {
          title: "Kylling i karry",
          description: "Cremet karryret med ris.",
          ingredients: [
            { name: "Kylling", amount: "500", unit: "g" },
            { name: "Ris", amount: "300", unit: "g" },
            { name: "Løg", amount: 2, unit: "stk" },
            { name: "Karrypasta", amount: "2", unit: "spsk" },
            { name: "Kokosmælk", amount: "400", unit: "ml" },
            { name: "Salt", amount: "", unit: "efter smag" },
            { name: "Olie", amount: 2, unit: "spsk" },
          ],
          steps: ["Steg kylling.", "Tilsæt løg og karry.", "Kog med kokosmælk.", "Server med ris."],
          time_minutes: 30,
        },
        {
          title: "Tomatsuppe",
          description: "Varm suppe med basilikum.",
          ingredients: [
            { name: "Tomater", amount: "800", unit: "g" },
            { name: "Løg", amount: 2, unit: "stk" },
            { name: "Basilikum", amount: "", unit: "" },
          ],
          steps: ["Hak tomater og løg.", "Kog op.", "Blend og server."],
          time_minutes: 20,
        },
        {
          title: "Kartoffelmos",
          description: "Blød mos med smør.",
          ingredients: [
            { name: "Kartofler", amount: "1", unit: "kg" },
            { name: "Smør", amount: 50, unit: "g" },
          ],
          steps: ["Kog kartofler.", "Mos med smør."],
          time_minutes: 25,
        },
        {
          title: "Pasta carbonara",
          description: "Italiensk klassiker.",
          ingredients: [
            { name: "Pasta", amount: "400", unit: "g" },
            { name: "Bacon", amount: "200", unit: "g" },
            { name: "Æg", amount: 4, unit: "stk" },
            { name: "Parmesan", amount: "100", unit: "g" },
            { name: "Sort peber", amount: "", unit: "efter smag" },
          ],
          steps: ["Kog pasta.", "Steg bacon.", "Bland æg og ost.", "Vend sammen."],
          time_minutes: 20,
        },
        {
          title: "Frugtsalat",
          description: "Frisk og sød afslutning.",
          ingredients: [
            { name: "Jordbær", amount: "200", unit: "g" },
            { name: "Blåbær", amount: 150, unit: "g" },
            { name: "Appelsinjuice", amount: "2", unit: "spsk" },
            { name: "Mynte", amount: "", unit: "" },
          ],
          steps: ["Skær frugt.", "Bland.", "Server koldt."],
          time_minutes: 10,
        },
      ],
    });

    const meals = parseShortFormResponse(raw);
    expect(meals).toHaveLength(5);

    // Check coercion in first meal
    expect(meals[0]!.ingredients[2]!.amount).toBe("2"); // was number
    expect(meals[1]!.ingredients[1]!.amount).toBe("2"); // was number

    // Check empty toleration
    expect(meals[0]!.ingredients[5]!.amount).toBe("");
    expect(meals[1]!.ingredients[2]!.unit).toBe("");
  });
});
