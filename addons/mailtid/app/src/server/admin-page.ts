import type { SeasonalityIngredientGroup } from "../db/seasonality.js";
import { escapeHtml } from "./html.js";

export interface AdminPageData {
  ingredients: readonly SeasonalityIngredientGroup[];
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "Maj", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dec",
];

/**
 * Render the seasonality admin page as a full HTML document.
 * The page lists all ingredients in an editable table with
 * month checkboxes, plus add / delete / reset controls.
 * Client-side vanilla JS handles the AJAX calls so the page
 * never does a full reload on edit.
 */
export function renderAdminPage(data: AdminPageData): string {
  const rowsHtml = data.ingredients
    .map((ing) => {
      const monthChecks = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const checked = ing.months.includes(m) ? " checked" : "";
        return (
          `<label class="month-check">` +
          `<input type="checkbox" data-month="${m}"${checked}>` +
          `<span>${MONTH_LABELS[i]}</span>` +
          `</label>`
        );
      }).join("");

      return (
        `<tr data-slug="${escapeHtml(ing.slug)}">` +
        `<td class="name-cell">` +
        `<span class="name-display">${escapeHtml(ing.nameDa)}</span>` +
        `<input type="text" class="name-input" value="${escapeHtml(ing.nameDa)}" style="display:none">` +
        `</td>` +
        `<td class="months-cell">${monthChecks}</td>` +
        `<td class="actions-cell">` +
        `<button class="edit-btn">Rediger</button>` +
        `<button class="save-btn" style="display:none">Gem</button>` +
        `<button class="cancel-btn" style="display:none">Annuller</button>` +
        `<button class="delete-btn">Slet</button>` +
        `</td>` +
        `</tr>`
      );
    })
    .join("");

  return `<!doctype html>
<html lang="da">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Admin — Sæsondata — Mailtid</title>
  <link rel="stylesheet" href="/static/app.css">
  <style>
    .admin-table { width:100%; border-collapse:collapse; margin:1em 0; }
    .admin-table th, .admin-table td { padding:6px 8px; border-bottom:1px solid #ddd; vertical-align:top; }
    .admin-table th { text-align:left; background:#f5f5f5; }
    .month-check { display:inline-flex; align-items:center; margin-right:4px; font-size:0.78em; }
    .month-check input { margin-right:2px; }
    .months-cell { max-width:340px; }
    .actions-cell { white-space:nowrap; }
    .actions-cell button { margin-right:4px; font-size:0.85em; padding:2px 8px; cursor:pointer; }
    .add-form { margin:1.5em 0; padding:1em; background:#f9f9f9; border:1px solid #ddd; border-radius:4px; }
    .add-form label { display:block; margin-bottom:4px; font-weight:bold; }
    .add-form .row { display:flex; gap:12px; align-items:flex-end; flex-wrap:wrap; }
    .add-form input[type="text"] { padding:4px 8px; min-width:200px; }
    .add-form .month-toggles { display:flex; flex-wrap:wrap; gap:2px; }
    .reset-section { margin-top:2em; padding:1em; border-top:2px solid #ccc; }
    .toast { position:fixed; bottom:20px; right:20px; padding:8px 16px; background:#333; color:#fff; border-radius:4px; z-index:100; }
  </style>
</head>
<body>
  <header>
    <div class="nav">
      <h1>Mailtid — Admin</h1>
      <span class="nav-links">
        <a href="/">Forside</a>
        <a href="/indstillinger">Indstillinger</a>
        <a href="/admin/seasonality">Sæsondata</a>
      </span>
    </div>
    <p class="tagline">Administrer sæsonkalenderen — tilføj, rediger og slet råvarer.</p>
  </header>

  <section>
    <h2>Tilføj ny råvare</h2>
    <form id="add-form" class="add-form">
      <div class="row">
        <div>
          <label for="add-name">Dansk navn</label>
          <input type="text" id="add-name" name="nameDa" required placeholder="fx Ingefærd">
        </div>
        <div>
          <label>Måneder i sæson</label>
          <div class="month-toggles" id="add-months">
            ${MONTH_LABELS.map((l, i) =>
              `<label class="month-check"><input type="checkbox" value="${i + 1}"><span>${l}</span></label>`
            ).join("")}
          </div>
        </div>
        <button type="submit">Tilføj</button>
      </div>
    </form>
  </section>

  <section>
    <h2>Råvarer i sæsonkalenderen</h2>
    <table class="admin-table">
      <thead>
        <tr>
          <th>Råvare</th>
          <th>Måneder</th>
          <th>Handlinger</th>
        </tr>
      </thead>
      <tbody id="ingredient-table">
        ${rowsHtml}
      </tbody>
    </table>
  </section>

  <section class="reset-section">
    <h2>Nulstil</h2>
    <p>Nulstil til seed-værdierne fra <code>seasonality.json</code>. Alle live-redigeringer mistes.</p>
    <button id="reset-btn" class="danger">Nulstil til seed</button>
    <span id="reset-status"></span>
  </section>

  <div id="toast" class="toast" style="display:none"></div>

  <script>
// Admin page client logic — vanilla JS, no framework.

const TABLE = document.getElementById("ingredient-table");
const TOAST = document.getElementById("toast");

function showToast(msg, ms) {
  TOAST.textContent = msg;
  TOAST.style.display = "block";
  if (ms === undefined) ms = 2000;
  clearTimeout(TOAST._tid);
  TOAST._tid = setTimeout(function() { TOAST.style.display = "none"; }, ms);
}

// --- Edit / Save / Cancel -------------------------------------------------

TABLE.addEventListener("click", function(e) {
  const row = e.target.closest("tr[data-slug]");
  if (!row) return;

  if (e.target.classList.contains("edit-btn")) {
    startEdit(row);
  } else if (e.target.classList.contains("save-btn")) {
    saveEdit(row);
  } else if (e.target.classList.contains("cancel-btn")) {
    cancelEdit(row);
  } else if (e.target.classList.contains("delete-btn")) {
    deleteIngredient(row);
  }
});

function startEdit(row) {
  row.querySelector(".name-display").style.display = "none";
  row.querySelector(".name-input").style.display = "";
  row.querySelector(".edit-btn").style.display = "none";
  row.querySelector(".save-btn").style.display = "";
  row.querySelector(".cancel-btn").style.display = "";
}

function cancelEdit(row) {
  row.querySelector(".name-input").value = row.querySelector(".name-display").textContent;
  row.querySelector(".name-display").style.display = "";
  row.querySelector(".name-input").style.display = "none";
  row.querySelector(".edit-btn").style.display = "";
  row.querySelector(".save-btn").style.display = "none";
  row.querySelector(".cancel-btn").style.display = "none";
}

async function saveEdit(row) {
  const slug = row.dataset.slug;
  const nameDa = row.querySelector(".name-input").value.trim();
  if (!nameDa) { showToast("Navn må ikke være tomt"); return; }
  const months = [];
  row.querySelectorAll("input[data-month]").forEach(function(cb) {
    if (cb.checked) months.push(parseInt(cb.dataset.month, 10));
  });
  if (months.length === 0) { showToast("Vælg mindst én måned"); return; }

  const res = await fetch("/api/admin/seasonality/" + encodeURIComponent(slug), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nameDa: nameDa, months: months }),
  });
  if (!res.ok) { showToast("Fejl ved gem: " + res.status); return; }

  row.querySelector(".name-display").textContent = nameDa;
  row.querySelector(".name-display").style.display = "";
  row.querySelector(".name-input").style.display = "none";
  row.querySelector(".edit-btn").style.display = "";
  row.querySelector(".save-btn").style.display = "none";
  row.querySelector(".cancel-btn").style.display = "none";
  showToast("Gemt ✓");
}

async function deleteIngredient(row) {
  const name = row.querySelector(".name-display").textContent;
  if (!confirm("Slet \\"" + name + "\\" permanent?")) return;
  const slug = row.dataset.slug;
  const res = await fetch("/api/admin/seasonality/" + encodeURIComponent(slug), {
    method: "DELETE",
  });
  if (!res.ok) { showToast("Fejl ved sletning: " + res.status); return; }
  row.remove();
  showToast("Slettet ✓");
}

// --- Add new ingredient ----------------------------------------------------

document.getElementById("add-form").addEventListener("submit", async function(e) {
  e.preventDefault();
  const nameDa = document.getElementById("add-name").value.trim();
  if (!nameDa) { showToast("Indtast et navn"); return; }
  const months = [];
  document.querySelectorAll("#add-months input[type=checkbox]:checked").forEach(function(cb) {
    months.push(parseInt(cb.value, 10));
  });
  if (months.length === 0) { showToast("Vælg mindst én måned"); return; }

  const res = await fetch("/api/admin/seasonality", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nameDa: nameDa, months: months }),
  });
  if (!res.ok) { showToast("Fejl ved oprettelse: " + res.status); return; }

  const data = await res.json();
  // Append a new row to the table.
  var monthChecks = [];
  for (var m = 1; m <= 12; m++) {
    var checked = data.months.indexOf(m) !== -1 ? " checked" : "";
    var labels = ["Jan","Feb","Mar","Apr","Maj","Jun","Jul","Aug","Sep","Okt","Nov","Dec"];
    monthChecks.push(
      '<label class="month-check">' +
      '<input type="checkbox" data-month="' + m + '"' + checked + '>' +
      '<span>' + labels[m-1] + '</span>' +
      '</label>'
    );
  }
  var tr = document.createElement("tr");
  tr.dataset.slug = data.slug;
  tr.innerHTML =
    '<td class="name-cell">' +
    '<span class="name-display">' + esc(data.nameDa) + '</span>' +
    '<input type="text" class="name-input" value="' + esc(data.nameDa) + '" style="display:none">' +
    '</td>' +
    '<td class="months-cell">' + monthChecks.join("") + '</td>' +
    '<td class="actions-cell">' +
    '<button class="edit-btn">Rediger</button>' +
    '<button class="save-btn" style="display:none">Gem</button>' +
    '<button class="cancel-btn" style="display:none">Annuller</button>' +
    '<button class="delete-btn">Slet</button>' +
    '</td>';
  TABLE.appendChild(tr);
  document.getElementById("add-name").value = "";
  document.querySelectorAll("#add-months input[type=checkbox]").forEach(function(cb) { cb.checked = false; });
  showToast("Tilføjet ✓");
});

// --- Reset to seed ---------------------------------------------------------

document.getElementById("reset-btn").addEventListener("click", async function() {
  if (!confirm("Nulstil alle råvarer til seed-værdierne? Alle live-redigeringer mistes.")) return;
  var btn = document.getElementById("reset-btn");
  btn.disabled = true;
  document.getElementById("reset-status").textContent = " Nulstiller…";
  var res = await fetch("/api/admin/seasonality/reset", { method: "POST" });
  if (!res.ok) { showToast("Fejl ved nulstilling: " + res.status); btn.disabled = false; return; }
  // Reload the page to show the seed data.
  location.reload();
});

// Quick HTML escape for client-side.
function esc(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
  </script>
</body>
</html>`;
}
