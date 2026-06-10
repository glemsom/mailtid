import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";

const ADDON_ROOT = resolve(__dirname, "../../..");

describe("addons/mailtid/config.yaml", () => {
  const configPath = resolve(ADDON_ROOT, "config.yaml");
  const config = parseYaml(readFileSync(configPath, "utf8")) as Record<
    string,
    unknown
  >;

  test("declares the expected add-on metadata", () => {
    expect(config.slug).toBe("mailtid");
    expect(config.name).toBe("Mailtid");
    expect(config.init).toBe(false);
    expect(config.startup).toBe("services");
    expect(config.boot).toBe("auto");
    expect(config.hassio_api).toBe(false);
    expect(config.homeassistant_api).toBe(false);
    expect(config.host_network).toBe(false);
  });

  test("exposes the web UI on port 8200", () => {
    expect(config.ports).toEqual({ "8200/tcp": 8200 });
  });

  test("targets aarch64, amd64, and armv7", () => {
    expect(config.arch).toEqual(["aarch64", "amd64", "armv7"]);
  });

  test("declares the four add-on options with the right defaults", () => {
    const opts = config.options as Record<string, unknown>;
    expect(opts.opencode_api_key).toBe("");
    expect(opts.log_level).toBe("info");
    expect(opts.port).toBe(8200);
    expect(opts.default_language).toBe("da");
  });

  test("uses HA schema for the add-on options", () => {
    const schema = config.schema as Record<string, string>;
    expect(schema.opencode_api_key).toBe("password");
    expect(schema.log_level).toMatch(/^list\(trace\|debug\|info\|warn\|error\)$/);
    expect(schema.port).toBe("port");
    expect(schema.default_language).toMatch(/^list\(da\|en\)$/);
  });
});

describe("addons/mailtid/ inventory", () => {
  const required = [
    "config.yaml",
    "Dockerfile",
    "run.sh",
    "icon.png",
    "DOCS.md",
    "CHANGELOG.md",
    "app/package.json",
    "app/tsconfig.json",
  ];

  for (const rel of required) {
    test(`has ${rel}`, () => {
      const p = resolve(ADDON_ROOT, rel);
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      expect(() => readFileSync(p)).not.toThrow();
    });
  }
});
