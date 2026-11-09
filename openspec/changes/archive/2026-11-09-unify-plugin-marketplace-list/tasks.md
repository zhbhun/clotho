# Tasks

## 1. Catalog helper: dedup, ordering, source labels

- [x] 1.1 Create a pure catalog helper module (per design D2) with: the `DIRECTORY_MARKETPLACE` constant (with a comment documenting the CLI JSON omission), name-based dedup with the installed > registered-marketplace > directory precedence and lexicographic tiebreak, the deterministic ordering (install count desc, unknown counts last, then alphabetical), and a source-label resolver (verbatim marketplace name for all sources). Export typed inputs/outputs. Verify: `npm run check` passes on the new module.
- [x] 1.2 Add unit tests next to the helper covering: same-name entries dedup to one (installed wins, registered wins over directory, tiebreak stable), ordering (install count desc, unknown counts last, alphabetical for equal counts), and source-label resolution for directory vs registered names. Verify: `npx vitest run <helper test>` passes.

## 2. Install page: unified list UI

- [x] 2.1 Rewrite `InstallPluginPage` state pipeline: remove `tab`/`CatalogTab`/`tabForMarketplace`; feed catalog + marketplaces + installed ids through the helper (dedup → order), keep search, and add source-filter state storing the raw marketplace name (empty = all). Installed names extracted from `name@marketplace` ids (split at last `@`). Verify: `npm run check` passes.
- [x] 2.2 Replace the `Tabs` control with the source filter dropdown next to search (per design D3: `All` default option + distinct sources in the deduplicated catalog, directory label last (per the reviewed prototype)). Verify: `npm run debug` + CDP — open Plugins › Install plugin, confirm no tabs, filter narrows the list, search applies on top of filter.
- [x] 2.3 Render entries as a single-column three-line list: name / description / `source · ⬇count` (download icon before the number, Lucide `Download`, no unit word; count omitted when unknown). No result-count line anywhere on the page. Render incrementally per design D7: full data in memory, first page of 100 rows rendered, IntersectionObserver-style sentinel appends the next page near the viewport end; filter/search changes reset to the first page. Verify: `npm run debug` + CDP — rows show three lines; scrolling near the list end appends rows; changing filter/search restarts from the top; no count text under the filter.
- [x] 2.4 Row actions: uninstalled entries get a borderless `+` (install via `installPluginWithToast`, restart hint); installed entries get a `⋮` dropdown-menu button with Enable/Disable (via `setAgentPluginEnabled`, optimistic update + rollback on error, label matching current state), Open (only when the details' `homepage` is set, via `appOpenLink`), and Uninstall (destructive, via `installPluginWithToast`-style error toast; menu closes after each action; `stopPropagation` so the row click doesn't open the detail page). Verify: `npm run debug` + CDP — menu items appear per state, Disable flips the label, Uninstall flips the row to `+`.
- [x] 2.5 Update i18n resources: remove `tabPublic`/`tabCommunity`/`tabPersonal`; add filter label, `All`, `directory` label, and Enable/Disable/Open/Uninstall menu strings. Verify: `grep -r "tabPublic\|tabCommunity\|tabPersonal" src/renderer` returns no hits.
- [x] 2.6 Update `agent-plugin-settings.test.tsx`: replace tab-classification tests with component tests for the unified list — no tab control rendered, directory + marketplace entries in one list, dedup shows one `superpowers` entry as installed, filter and search interaction, `⋮` menu offers Enable/Disable + Uninstall (Open only with homepage). Verify: `npx vitest run src/renderer/pages/settings/components/agent-plugin-settings.test.tsx` passes.

## 3. Integration verification

- [x] 3.1 Full-flow check via `npm run debug` + CDP: with `superpowers` installed from `superpowers-marketplace`, the Install page shows a single installed `superpowers` entry (no installable directory copy); a never-installed plugin from a registered marketplace and a directory-only plugin both install from `+` with restart hint and flip to the `⋮` menu; Disable → Enable round-trip works; Uninstall flips back to `+`. Stop the app if this task started it. Verify: observable behavior in CDP screenshots/DOM checks matches the spec scenarios.
- [x] 3.2 Run `npm run lint` and Prettier on changed files; run `npm run check`. Verify: all clean.

## Workflow follow-up

- Prototype already built at `openspec/changes/unify-plugin-marketplace-list/prototype.html` (variant A won; 9 review adjustments recorded in its header). Archive it with the change.
- Archive the change with `/openspec-archive-change` after apply, syncing the `plugin-settings-pages` spec.
