# Design

## Context

Three coexisting row-list forms in settings (see proposal.md — Why). The stack: React 19 + Tailwind 4 + shadcn/ui (`base-mira`, Base UI). Relevant primitives already in place: `Card` (`@/shadcn/card`), `Separator` (`@/shadcn/separator`), `Field` family (`@/shadcn/field`), color token `--border-in-card` defined in `src/renderer/styles/variables.css` (light 6.87% / dark 8.98% foreground mix into card). `SettingsSection` (`src/renderer/components/settings-section.tsx`) is the shared section wrapper; the new components sit below it, page-private under `pages/settings/components/` until another surface needs them.

## Goals / Non-Goals

**Goals:**
- One shared list container + row component that owns dividers, padding, and hover.
- All three forms migrate; per-entry-card lists (projects, providers, permission) become rows in one card.
- Divider insets on both ends, aligned to row padding; `border-in-card` color everywhere.

**Non-Goals:**
- No behavior/API/RPC changes; page content, actions, navigation untouched.
- Non-row elements (info boxes, theme preview, editor forms) keep current markup.
- Not promoting the components to root `src/renderer/components/` yet.

## Decisions

**D1. Component shape: `SettingsList` + `SettingsRow` (names TBD in code), not CSS-only convention.**
A convention ("use Card + inset Separator everywhere") was rejected: the exact failure this change fixes is three pages already drifting under a loose convention. The container renders the card (`rounded-lg border`, `overflow-hidden`, `gap-0`) and renders dividers itself between `SettingsRow` children, so pages cannot get the separator wrong. Rows use the `Field` family inside (`FieldTitle`/`FieldDescription`) to stay consistent with existing preference rows.

**D2. Divider implementation: explicit separator elements between rows, not `divide-y`.**
`divide-y` cannot inset (it paints the container's child borders full-width) and cannot use a different color without per-child overrides. The container maps children and interleaves `<div className="mx-5 h-px bg-border-in-card" />` between them. `mx-5` equals the shared row horizontal padding, which yields the both-ends inset by construction. Dividers are the container's concern: rows never declare one. The first/last row get no divider.

**D3. Row padding: `px-5` everywhere; two densities via variant prop.**
Preference row: `min-h-20 px-5 py-4` (matches current Card+Separator pages). Compact list row: `min-h-14 px-5` with slimmer vertical padding (current `divide-y` rows use `px-4 py-2`; horizontal moves 4→5). One horizontal padding guarantees divider alignment per spec. `SettingsRow` exposes `variant: 'preference' | 'compact'` (default `preference`) rather than two components, keeping the padding source single.

**D4. Hover: built into `SettingsRow` via `bg-muted/40` on hover, full row width.**
Full-width means the row's own box (which spans the card interior edge to edge); divider insets don't clip it. Rows whose whole surface is already interactive (permission radio rows use a radio group, provider/project rows open detail pages) keep their existing interaction; the hover style is uniform, replacing per-page `group-hover:` visibility tricks where they existed on card rows. Buttons inside rows keep their own hover states; row hover is background only.

**D5. Per-entry-card lists become rows, keeping per-row affordances.**
- Projects: each row keeps icon + name + path + hover-visible edit/delete buttons (hover visibility now driven by row-level group class).
- Providers: row keeps name, model-count badge, usage badges, hover-visible edit/delete.
- Permission radio group: the three mode options become rows inside the card; selected-state indicator (check icon + icon tile colors) stays per-row; the RadioGroup stays the semantics owner, rows lose their own `rounded-lg bg-card ring-1` chrome (the card supplies the container).
Not feasible without behavior change: none — all three lists are visually row-shaped already; only the container changes.

**D6. Component location: `pages/settings/components/settings-list.tsx` (single file).**
Both components are small and one responsibility; `SettingsSection` precedent (root components) applies only when shared across pages — nothing outside settings uses row lists today. Promotion deferred.

**D7. Divider color stays the `border-in-card` token; no new token.**
Token already implements "lighter inside card" for both themes. The `divide-y` pages currently use the heavier `border` token; unified to `border-in-card` per spec.

## Risks / Trade-offs

- [Visual regression: `divide-y` pages' dividers get lighter; rows get taller (`py-2` → py-4-ish padding in compact rows may shift)] → Review each migrated page in `npm run debug` (CDP 3367) in both themes; density variants keep compact rows visibly tighter than preference rows.
- [Test selectors break: tests querying per-row Cards or divide-y containers] → Run affected modules' tests (`*.test.tsx` co-located) after each migration batch; update selectors to the shared container.
- [Interleaved-children approach breaks if a page passes non-row children (e.g. an empty state)] → Container treats only `SettingsRow` elements as rows and renders other children untouched (no divider around them); pages render `Empty` outside the list.
- [Two densities reintroduce per-page height fiddling] → Variant prop is the only knob; no per-page height overrides accepted in review.

## Migration Plan

Component first, then migrate in three batches (Card+Separator pages → divide-y pages → per-entry-card pages), running affected tests per batch and a debug-run visual pass per batch. Rollback: single-component addition + per-page swaps revert cleanly per commit; no data or contract changes.

## Open Questions

(none — insets, scope, and encapsulation decided with the user; density defaults confirmed as two-variant)
