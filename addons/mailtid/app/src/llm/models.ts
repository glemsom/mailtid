import type { SettingsRepository, CachedModel } from "../db/settings.js";

/**
 * Base URL for the OpenCode Go provider. The model catalogue and
 * chat completions both live under this origin.
 */
const OPENCODE_GO_BASE = "https://opencode.ai/zen/go/v1";

/**
 * The shape we expect from `GET /zen/go/v1/models`. We only read the
 * `data` array; each entry has at least `id` and `endpoint`.
 * Additional fields (like `display_name`, `pricing.tier`) are
 * optional — we fall back to the `id` as the display name and
 * `"free"` as the tier when they are missing.
 */
interface OpenCodeModelEntry {
  id: string;
  endpoint: string;
  display_name?: string;
  owned_by?: string;
  pricing?: { tier?: string };
}

interface OpenCodeModelList {
  data: OpenCodeModelEntry[];
}

/**
 * Fetch the live model catalogue from the OpenCode Go provider and
 * update the cached model list in the settings repository.
 *
 * @param apiKey The OpenCode Go API key. If empty, returns a
 *               descriptive status but does not throw.
 * @param settings The repository to write the cached models into.
 * @returns A human-readable status string (for the "Opdater
 *          modeller" button feedback).
 */
export async function refreshModelCache(
  apiKey: string,
  settings: SettingsRepository,
): Promise<string> {
  if (!apiKey) {
    return "Ingen API-nøgle — modeller kan ikke hentes.";
  }

  const res = await fetch(`${OPENCODE_GO_BASE}/models`, {
    headers: {
      authorization: `Bearer ${apiKey}`,
      accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(
      `Kunne ikke hente modelliste (HTTP ${res.status})`,
    );
  }

  const raw: unknown = await res.json();
  const list = raw as OpenCodeModelList;
  if (!list.data || !Array.isArray(list.data)) {
    throw new Error("Uventet svar fra model-API: mangler 'data' array");
  }

  const models: CachedModel[] = list.data
    .filter((m) => !isAnthropicEndpoint(m.endpoint))
    .map((m) => ({
      modelId: m.id,
      displayName: m.display_name ?? m.owned_by ?? m.id,
      tier: normalizeTier(m.pricing?.tier),
    }));

  settings.replaceModelCache(models);

  return `Hentet ${models.length} modeller fra OpenCode Go.`;
}

/**
 * Determines if an endpoint string refers to the Anthropic-compatible
 * `/messages` API. The OpenCode Go provider exposes both OpenAI and
 * Anthropic shapes under the same catalogue; Mailtid only uses the
 * OpenAI-compatible endpoint (CONTEXT.md).
 *
 * We match `messages` either as the exact last segment or when it
 * appears in the last two segments (e.g. `/v1/messages` or
 * `/zen/go/v1/messages`). `chat/completions` is the complementary
 * kept endpoint — we check directly against the segment.
 */
function isAnthropicEndpoint(raw: string | undefined): boolean {
  // Endpoint may be absent for provider-level metadata entries.
  // Without an endpoint, the model can't reach the Anthropic API.
  if (!raw) return false;
  // Normalise: strip trailing slash, split into segments.
  const segments = raw.replace(/\/+$/, "").split("/");
  const last = segments[segments.length - 1];
  const secondLast = segments.length >= 2 ? segments[segments.length - 2] : "";
  // The most precise signal: the endpoint path ends with /messages,
  // meaning the model speaks Anthropic protocol.
  return last === "messages" || secondLast === "messages";
}

function normalizeTier(raw: string | undefined): "free" | "paid" {
  if (!raw) return "free";
  const lower = raw.toLowerCase();
  if (lower === "paid" || lower === "premium" || lower === "pro") return "paid";
  return "free";
}
