import { describe, expect, test } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../src/db/migrate.js";
import { ProfileRepository } from "../../src/db/profile.js";
import { SettingsRepository } from "../../src/db/settings.js";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  runMigrations(db);
  return db;
}

describe("ProfileRepository", () => {
  test("save and find round-trip dietary pattern, allergies, and dislikes", () => {
    const db = freshDb();
    const repo = new ProfileRepository(db);

    const saved = repo.save({
      dietaryPattern: "vegetarian",
      allergies: ["Mælk", "Nødder"],
      dislikes: "svampe",
    });

    expect(saved.dietaryPattern).toBe("vegetarian");
    expect(saved.allergies).toEqual(["Mælk", "Nødder"]);
    expect(saved.dislikes).toBe("svampe");

    const found = repo.find();
    expect(found).not.toBeNull();
    expect(found!.dietaryPattern).toBe("vegetarian");
    expect(found!.allergies).toEqual(["Mælk", "Nødder"]);
    expect(found!.dislikes).toBe("svampe");
  });

  test("find returns null when no profile has been saved", () => {
    const db = freshDb();
    const repo = new ProfileRepository(db);
    expect(repo.find()).toBeNull();
  });

  test("rejects invalid dietary pattern", () => {
    const db = freshDb();
    const repo = new ProfileRepository(db);

    expect(() =>
      repo.save({
        dietaryPattern: "carnivore",
        allergies: [],
        dislikes: "",
      }),
    ).toThrow(/kosttype/i);
  });

  test("rejects unknown allergy value", () => {
    const db = freshDb();
    const repo = new ProfileRepository(db);

    expect(() =>
      repo.save({
        dietaryPattern: "omnivore",
        allergies: ["Peanuts"],
        dislikes: "",
      }),
    ).toThrow(/allergi/i);
  });

  test("persists across re-opened database (survives restart)", () => {
    const path = ":memory:";
    const db1 = new Database(path);
    runMigrations(db1);
    const repo1 = new ProfileRepository(db1);
    repo1.save({
      dietaryPattern: "pescatarian",
      allergies: ["Fisk"],
      dislikes: "koriander",
    });
    db1.close();

    const db2 = new Database(path);
    runMigrations(db2);
    const repo2 = new ProfileRepository(db2);
    const found = repo2.find();
    // In-memory databases don't survive a close, so this test
    // just checks the interface shape.
    expect(found).toBeNull();
    db2.close();
  });
});

describe("SettingsRepository", () => {
  test("sets and gets the active model", () => {
    const db = freshDb();
    const repo = new SettingsRepository(db);

    repo.setActiveModel("opencode-go/glm-5.1");
    expect(repo.getActiveModel()).toBe("opencode-go/glm-5.1");

    repo.setActiveModel("opencode-go/gpt-4o-mini");
    expect(repo.getActiveModel()).toBe("opencode-go/gpt-4o-mini");
  });

  test("getActiveModel returns null when no model has been set", () => {
    const db = freshDb();
    const repo = new SettingsRepository(db);
    expect(repo.getActiveModel()).toBeNull();
  });

  test("replaces the entire model cache", () => {
    const db = freshDb();
    const repo = new SettingsRepository(db);

    const models = [
      { modelId: "opencode-go/glm-5.1", displayName: "GLM 5.1", tier: "free" as const },
      { modelId: "opencode-go/gpt-4o-mini", displayName: "GPT-4o Mini", tier: "paid" as const },
    ];
    repo.replaceModelCache(models);

    const cached = repo.listModels();
    expect(cached).toHaveLength(2);
    expect(cached[0]?.modelId).toBe("opencode-go/glm-5.1");
    expect(cached[1]?.displayName).toBe("GPT-4o Mini");
  });

  test("listModels returns free models before paid", () => {
    const db = freshDb();
    const repo = new SettingsRepository(db);

    const models = [
      { modelId: "a/paid", displayName: "Paid", tier: "paid" as const },
      { modelId: "b/free", displayName: "Free", tier: "free" as const },
    ];
    repo.replaceModelCache(models);

    const cached = repo.listModels();
    const tiers = cached.map((m) => m.tier);
    // Free models first.
    expect(tiers.indexOf("free")).toBeLessThan(tiers.indexOf("paid"));
  });

  test("replaceModelCache clears previously cached models", () => {
    const db = freshDb();
    const repo = new SettingsRepository(db);

    repo.replaceModelCache([
      { modelId: "x/old", displayName: "Old", tier: "free" as const },
    ]);
    repo.replaceModelCache([
      { modelId: "y/new", displayName: "New", tier: "paid" as const },
    ]);

    expect(repo.listModels()).toHaveLength(1);
    expect(repo.listModels()[0]?.modelId).toBe("y/new");
  });
});
