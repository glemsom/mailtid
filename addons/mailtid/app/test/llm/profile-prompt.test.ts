import { describe, expect, test } from "vitest";
import {
  buildShortFormPrompt,
  type ShortFormFilter,
} from "../../src/llm/prompt.js";
import type { UserProfile } from "../../src/db/profile.js";
import type { SeasonalityIngredient } from "../../src/db/seasonality.js";

const JUNE_INGREDIENTS: SeasonalityIngredient[] = [
  { slug: "asparges", nameDa: "Asparges", month: 6 },
  { slug: "jordbaer", nameDa: "Jordbær", month: 6 },
  { slug: "kartofler", nameDa: "Kartofler", month: 6 },
];

const EMPTY_FILTER: ShortFormFilter = {
  inSeasonIncludes: [],
  customMandatory: [],
  excludes: [],
  pantry: [],
};

describe("buildShortFormPrompt with profile", () => {
  test("includes dietary pattern as hard constraint", () => {
    const profile: UserProfile = {
      dietaryPattern: "vegetarian",
      allergies: [],
      dislikes: "",
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, EMPTY_FILTER, profile);

    expect(prompt).toContain("Kostprofil");
    expect(prompt).toContain("vegetarian");
    expect(prompt.toLowerCase()).toMatch(/vegetar/);
  });

  test("includes allergies as hard excludes", () => {
    const profile: UserProfile = {
      dietaryPattern: "omnivore",
      allergies: ["Mælk", "Gluten"],
      dislikes: "",
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, EMPTY_FILTER, profile);

    expect(prompt).toContain("Kostprofil");
    expect(prompt).toContain("Mælk");
    expect(prompt).toContain("Gluten");
    expect(prompt.toLowerCase()).toMatch(/allergi|indeholde ikke/);
  });

  test("includes dislikes as soft avoids", () => {
    const profile: UserProfile = {
      dietaryPattern: "omnivore",
      allergies: [],
      dislikes: "svampe, koriander",
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, EMPTY_FILTER, profile);

    expect(prompt).toContain("Kostprofil");
    expect(prompt).toContain("svampe");
    expect(prompt).toContain("koriander");
    expect(prompt.toLowerCase()).toMatch(/undgå/);
  });

  test("no profile section when profile is undefined (backwards compat)", () => {
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, EMPTY_FILTER);

    expect(prompt).not.toContain("Kostprofil");
  });

  test("all three profile fields appear together", () => {
    const profile: UserProfile = {
      dietaryPattern: "vegan",
      allergies: ["Soja", "Nødder"],
      dislikes: "koriander",
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, EMPTY_FILTER, profile);

    expect(prompt).toContain("vegan");
    expect(prompt).toContain("Soja");
    expect(prompt).toContain("Nødder");
    expect(prompt).toContain("koriander");
    expect(prompt).toContain("Kostprofil");
  });

  test("profile and filter sections coexist without overlap", () => {
    const profile: UserProfile = {
      dietaryPattern: "pescatarian",
      allergies: ["Skaldyr"],
      dislikes: "",
    };
    const filter: ShortFormFilter = {
      inSeasonIncludes: [{ slug: "asparges", nameDa: "Asparges" }],
      customMandatory: ["Ris"],
      excludes: [{ slug: "champignon", nameDa: "Champignon" }],
      pantry: [],
    };
    const prompt = buildShortFormPrompt(6, JUNE_INGREDIENTS, filter, profile);

    expect(prompt).toContain("Kostprofil");
    expect(prompt).toContain("Filtreringskrav");
    expect(prompt).toContain("pescatarian");
    expect(prompt).toContain("Skaldyr");
    expect(prompt).toContain("Asparges");
    expect(prompt).toContain("Ris");
    expect(prompt).toContain("Champignon");
  });
});
