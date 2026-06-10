# 0001 — Filter semantics: OR within in-season, AND with custom mandatory, AND across excludes

When a user has flagged multiple in-season ingredients as "must include", every meal suggestion must contain *at least one* of them (OR within the in-season set). Custom mandatory ingredients (e.g. "ris" for leftover rice) are AND against everything else. Excludes are AND across all flagged items. Picked because the in-season list represents *what's available* — the user is narrowing the basket, not building a shopping list — while leftovers are hard constraints that must survive. Hard to reverse, because the LLM prompt structure bakes this in; surprising without context, because a literal SQL reading would suggest AND everywhere; a real trade-off against an AND-only design that would be more "correct" in a literal sense but unusable in practice.

## Status

Accepted.

## Considered Options

- **AND across all includes** — meals must contain every flagged ingredient, whether in-season or custom. Rejected: AND'ing the in-season list makes the filter degenerate as soon as the user picks two unrelated chips (e.g. "asparges" + "jordbær" in June), and the user experience becomes "no results" for common combinations.
- **OR across all includes (no distinction between sources)** — every include, in-season or custom, is OR. Rejected: a leftover ingredient ("I have rice, deal with it") is qualitatively different from a basket-narrowing choice. Treating them the same means the user has no way to express "use this thing up, no matter what".
- **Hierarchical (custom first, then in-season as fallback)** — meals must contain all custom mandatory, and at least one in-season flagged. Functionally equivalent to the chosen design for the common case, but the prompt becomes more brittle and the rule harder to explain in the UI.

## Consequences

- The LLM prompt has three independent lists (in-season includes as OR, custom mandatory as AND, excludes as AND) instead of one merged list.
- The UI's "Vis 5 nye" button can be tapped at any time without losing the user's filter intent, and the model is not asked to "satisfy" the same number of constraints more strictly.
- Adding a fourth source (e.g. "pantry staples" — pantry items the user always has) requires a deliberate decision about its AND/OR classification, not an automatic extension.
