import type { UserProfile, DIETARY_PATTERNS, ALLERGY_OPTIONS } from "../db/profile.js";
import type { CachedModel } from "../db/settings.js";
import type { PantryItem } from "../db/pantry.js";
import { escapeHtml } from "./html.js";

/**
 * Re-export the valid option lists so the template can render
 * them without importing from the profile module directly.
 */
export { DIETARY_PATTERNS, ALLERGY_OPTIONS } from "../db/profile.js";

/**
 * Dietary pattern display names in Danish.
 */
const DIETARY_LABELS: Record<string, string> = {
  omnivore: "Altspisende",
  pescatarian: "Pescetar (fisk + grønt)",
  vegetarian: "Vegetarisk",
  vegan: "Vegansk",
  lowcarb: "Low-carb (lavkulhydrat)",
};

export interface SettingsPageData {
  /** The user's current profile, or null if not set. */
  profile: UserProfile | null;
  /** The cached model list. */
  models: readonly CachedModel[];
  /** The active model id, or null if none selected. */
  activeModel: string | null;
  /** Whether an API key has been saved (so the UI can show a hint). */
  hasApiKey: boolean;
  /** The user's pantry staples (basisvarer). */
  pantry: readonly PantryItem[];
}

/**
 * Render the Mailtid settings page as a full HTML document.
 * Server-rendered so the page loads with the saved state visible
 * immediately; a small client-side script handles form submissions
 * and the "Opdater modeller" button.
 */
export function renderSettingsPage(data: SettingsPageData): string {
  const dietOptions = DIETARY_PATTERNS
    .map(
      (v) =>
        `<option value="${v}"${
          data.profile?.dietaryPattern === v ? " selected" : ""
        }>${escapeHtml(DIETARY_LABELS[v] ?? v)}</option>`,
    )
    .join("");

  const allergyOptions = [
    "Mælk",
    "Æg",
    "Fisk",
    "Skaldyr",
    "Nødder",
    "Jordnødder",
    "Soja",
    "Gluten",
    "Selleri",
    "Sennep",
    "Sesam",
    "Lupin",
  ]
    .map((a) => {
      const checked = data.profile?.allergies.includes(a) ?? false;
      return (
        `<label class="allergy-chip"><input type="checkbox" name="allergies"` +
        ` value="${escapeHtml(a)}"${checked ? " checked" : ""}>` +
        escapeHtml(a) +
        `</label>`
      );
    })
    .join("");

  // Build model option groups.
  let modelPickerHtml = "";
  const freeModels = data.models.filter((m) => m.tier === "free");
  const paidModels = data.models.filter((m) => m.tier === "paid");
  if (freeModels.length > 0) {
    modelPickerHtml +=
      `<optgroup label="Gratis">` +
      freeModels
        .map(
          (m) =>
            `<option value="${escapeHtml(m.modelId)}"${
              data.activeModel === m.modelId ? " selected" : ""
            }>${escapeHtml(m.displayName)}</option>`,
        )
        .join("") +
      `</optgroup>`;
  }
  if (paidModels.length > 0) {
    modelPickerHtml +=
      `<optgroup label="Betalt">` +
      paidModels
        .map(
          (m) =>
            `<option value="${escapeHtml(m.modelId)}"${
              data.activeModel === m.modelId ? " selected" : ""
            }>${escapeHtml(m.displayName)}</option>`,
        )
        .join("") +
      `</optgroup>`;
  }
  const modelCount = data.models.length;
  // Warn when the saved active model is no longer in the cached list.
  const activeModelInCache =
    data.activeModel !== null &&
    data.models.some((m) => m.modelId === data.activeModel);

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Indstillinger — Mailtid</title>
  <link rel="stylesheet" href="/static/app.css">
  <style>
    /* Settings-page-specific styles */
    .settings-page { max-width: 640px; }
    .form-group { margin: 20px 0; }
    .form-group label.legend {
      display: block;
      font-weight: 600;
      margin-bottom: 6px;
    }
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid var(--neutral-border);
      border-radius: var(--radius);
      font-size: 14px;
      font-family: inherit;
    }
    .form-group textarea { min-height: 60px; resize: vertical; }
    .allergy-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .allergy-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid var(--neutral-border);
      border-radius: 999px;
      padding: 6px 12px;
      font-size: 14px;
      cursor: pointer;
      background: var(--neutral);
    }
    .allergy-chip:has(input:checked) {
      background: var(--include-soft);
      border-color: var(--include);
      color: var(--include);
      font-weight: 600;
    }
    .allergy-chip input { accent-color: var(--accent); }
    .model-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .model-row select { flex: 1; }
    .model-info { color: var(--muted); font-size: 13px; margin-top: 4px; }
    .back-link { display: inline-block; margin-bottom: 16px; color: var(--accent); }
    .save-status { color: var(--accent); font-size: 14px; min-height: 1.5em; }
    .nav { display: flex; gap: 12px; align-items: baseline; }
    .nav a { color: var(--accent); }
    .pantry-input-row {
      display: flex;
      gap: 8px;
    }
    .pantry-input-row input {
      flex: 1;
      padding: 8px 10px;
      border: 1px solid var(--neutral-border);
      border-radius: var(--radius);
      font-size: 14px;
      font-family: inherit;
    }
    .pantry-list {
      list-style: none;
      padding: 0;
      margin-top: 12px;
    }
    .pantry-list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      margin-bottom: 4px;
      background: var(--neutral);
      border: 1px solid var(--neutral-border);
      border-radius: var(--radius);
    }
    .pantry-remove {
      padding: 4px 8px;
      font-size: 13px;
    }
  </style>
</head>
<body class="settings-page">
  <header>
    <div class="nav">
      <h1>Mailtid</h1>
      <a href="/">← Tilbage til forsiden</a>
    </div>
    <p class="tagline">Indstillinger — din profil og model.</p>
  </header>

  <section aria-label="Profil">
    <h2>Din profil</h2>
    <p class="hint">Dine præferencer bruges til at give bedre forslag.</p>

    <form id="profile-form">
      <div class="form-group">
        <label class="legend" for="dietaryPattern">Kosttype</label>
        <select name="dietaryPattern" id="dietaryPattern">
          ${dietOptions}
        </select>
      </div>

      <div class="form-group">
        <fieldset style="border:0;padding:0;margin:0;">
          <legend class="legend">Allergier</legend>
          <div class="allergy-chips">
            ${allergyOptions}
          </div>
        </fieldset>
      </div>

      <div class="form-group">
        <label class="legend" for="dislikes">Uønskede råvarer (fritekst)</label>
        <textarea name="dislikes" id="dislikes"
          placeholder="fx svampe, koriander">${
            escapeHtml(data.profile?.dislikes ?? "")
          }</textarea>
      </div>

      <button type="submit" class="primary">Gem profil</button>
      <span id="profile-status" class="save-status" role="status" aria-live="polite"></span>
    </form>
  </section>

  <section aria-label="API-nøgle">
    <h2>OpenCode API-nøgle</h2>
    <p class="hint">Indtast din OpenCode Go API-nøgle. Nøglen gemmes lokalt og bruges straks — ingen genstart nødvendig.</p>
    <form id="apikey-form">
      <div class="form-group">
        <input type="password" id="apikey-input" name="apiKey"
          placeholder="sk-...">
      </div>
      <p class="model-info" id="apikey-info">${
        data.hasApiKey ? "✅ API-nøgle er gemt." : "⚠️ Ingen API-nøgle gemt endnu."
      }</p>
      <button type="submit" class="primary">Gem API-nøgle</button>
      <span id="apikey-status" class="save-status" role="status" aria-live="polite"></span>
    </form>
  </section>

  <section aria-label="Basisvarer">
    <h2>Basisvarer</h2>
    <p class="hint">Ingredienser du altid har på lager (fx salt, olie, ris). Disse bliver automatisk inkluderet i alle forslag.</p>

    <form id="pantry-form">
      <div class="form-group pantry-input-row">
        <input type="text" id="pantry-input" name="pantry"
          placeholder="fx Ris" autocomplete="off">
        <button type="submit" class="primary">Tilføj</button>
      </div>
      <span id="pantry-status" class="save-status" role="status" aria-live="polite"></span>
    </form>

    <ul id="pantry-list" class="pantry-list">${
      data.pantry
        .map(
          (item) =>
            `<li data-slug="${escapeHtml(item.slug)}">` +
            `<span>${escapeHtml(item.nameDa)}</span>` +
            `<button class="pantry-remove danger" data-slug="${escapeHtml(item.slug)}">Fjern</button>` +
            `</li>`,
        )
        .join("")
    }</ul>
  </section>

  <section aria-label="Model">
    <h2>Model</h2>
    <p class="hint">Vælg hvilken OpenCode Go-model Mailtid skal bruge til at generere forslag.</p>

    <div class="model-row">
      <select id="model-picker">
        ${modelPickerHtml}
      </select>
      <button id="refresh-models" type="button">Opdater modeller</button>
    </div>
    <p class="model-info" id="model-info">${
      modelCount > 0
        ? `${modelCount} modeller tilgængelige.`
        : "Ingen modeller hentet endnu — tryk \"Opdater modeller\"."
    }</p>
    ${
      data.activeModel !== null && !activeModelInCache
        ? `<p class="model-info" style="color:var(--error, #c00);">` +
          `⚠ Din tidligere model "${escapeHtml(data.activeModel)}" er ikke længere tilgængelig. Vælg en ny model.` +
          `</p>`
        : ""
    }
    <span id="model-status" class="save-status" role="status" aria-live="polite"></span>
  </section>

  <script>
    // Settings page client: API key form + profile form + model picker + refresh.
    function setApiKeyStatus(text) {
      var el = document.getElementById("apikey-status");
      if (el) { el.textContent = text; setTimeout(function(){ el.textContent = ""; }, 3000); }
    }
    document.getElementById("apikey-form").addEventListener("submit", async function(e) {
      e.preventDefault();
      var key = document.getElementById("apikey-input").value;
      try {
        var res = await fetch("/api/settings/apikey", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ apiKey: key })
        });
        if (res.ok) {
          setApiKeyStatus("API-nøgle gemt.");
          var info = document.getElementById("apikey-info");
          if (info) { info.textContent = "✅ API-nøgle er gemt."; }
        } else {
          var body = await res.json();
          setApiKeyStatus(body.error || "Kunne ikke gemme API-nøglen.");
        }
      } catch (err) {
        setApiKeyStatus("Kunne ikke gemme API-nøglen.");
      }
    });
    function setProfileStatus(text) {
      var el = document.getElementById("profile-status");
      if (el) { el.textContent = text; setTimeout(function(){ el.textContent = ""; }, 3000); }
    }
    function setModelStatus(text) {
      var el = document.getElementById("model-status");
      if (el) { el.textContent = text; setTimeout(function(){ el.textContent = ""; }, 3000); }
    }
    document.getElementById("profile-form").addEventListener("submit", async function(e) {
      e.preventDefault();
      var form = e.target;
      var dietaryPattern = form.dietaryPattern.value;
      var checkboxes = form.querySelectorAll('input[name="allergies"]:checked');
      var allergies = Array.from(checkboxes).map(function(cb) { return cb.value; });
      var dislikes = form.dislikes.value;
      try {
        var res = await fetch("/api/profile", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dietaryPattern: dietaryPattern, allergies: allergies, dislikes: dislikes })
        });
        if (res.ok) {
          setProfileStatus("Profil gemt.");
        } else {
          var body = await res.json();
          setProfileStatus(body.error || "Kunne ikke gemme profilen.");
        }
      } catch (err) {
        setProfileStatus("Kunne ikke gemme profilen.");
      }
    });
    document.getElementById("model-picker").addEventListener("change", async function() {
      var model = this.value;
      if (!model) {
        setModelStatus("Vælg en model.");
        return;
      }
      try {
        var res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ activeModel: model })
        });
        if (res.ok) {
          setModelStatus("Model gemt.");
        } else {
          var errBody = await res.json().catch(function(){ return {}; });
          setModelStatus(errBody.error || "Kunne ikke gemme modelvalg.");
        }
      } catch (err) {
        setModelStatus("Kunne ikke gemme modelvalg.");
      }
    });
    document.getElementById("refresh-models").addEventListener("click", async function() {
      var btn = this;
      btn.disabled = true;
      setModelStatus("Henter modeller...");
      try {
        var res = await fetch("/api/models/refresh", { method: "POST" });
        if (res.ok) {
          window.location.reload();
        } else {
          var body = await res.json();
          setModelStatus(body.error || "Kunne ikke hente modeller.");
        }
      } catch (err) {
        setModelStatus("Kunne ikke hente modeller.");
      } finally {
        btn.disabled = false;
      }
    });

    // Pantry (basisvarer) management.
    function setPantryStatus(text) {
      var el = document.getElementById("pantry-status");
      if (el) { el.textContent = text; setTimeout(function(){ el.textContent = ""; }, 3000); }
    }
    function removePantryItem(slug) {
      var li = document.querySelector('#pantry-list li[data-slug="' + slug + '"]');
      if (li) { li.remove(); }
    }
    function addPantryItemToList(slug, name) {
      var list = document.getElementById("pantry-list");
      if (!list) return;
      var li = document.createElement("li");
      li.setAttribute("data-slug", slug);
      li.innerHTML = '<span>' + name + '</span><button class="pantry-remove danger" data-slug="' + slug + '">Fjern</button>';
      li.querySelector(".pantry-remove").addEventListener("click", async function() {
        var s = this.getAttribute("data-slug");
        try {
          var res = await fetch("/api/pantry/" + encodeURIComponent(s), { method: "DELETE" });
          if (res.ok) {
            removePantryItem(s);
            setPantryStatus("Basisvare fjernet.");
          }
        } catch (err) {
          setPantryStatus("Kunne ikke fjerne basisvare.");
        }
      });
      list.appendChild(li);
    }
    // Wire existing remove buttons (server-rendered).
    document.querySelectorAll(".pantry-remove").forEach(function(btn) {
      btn.addEventListener("click", async function() {
        var slug = this.getAttribute("data-slug");
        try {
          var res = await fetch("/api/pantry/" + encodeURIComponent(slug), { method: "DELETE" });
          if (res.ok) {
            removePantryItem(slug);
            setPantryStatus("Basisvare fjernet.");
          }
        } catch (err) {
          setPantryStatus("Kunne ikke fjerne basisvare.");
        }
      });
    });
    document.getElementById("pantry-form").addEventListener("submit", async function(e) {
      e.preventDefault();
      var input = document.getElementById("pantry-input");
      var name = input.value.trim();
      if (!name) { setPantryStatus("Indtast en basisvare."); return; }
      try {
        var res = await fetch("/api/pantry", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name })
        });
        if (res.ok) {
          var stored = await res.json();
          addPantryItemToList(stored.slug, stored.nameDa);
          input.value = "";
          setPantryStatus("Basisvare tilføjet.");
        } else {
          var body = await res.json().catch(function(){ return {}; });
          setPantryStatus(body.error || "Kunne ikke tilføje basisvare.");
        }
      } catch (err) {
        setPantryStatus("Kunne ikke tilføje basisvare.");
      }
    });
  </script>
</body>
</html>`;
}
