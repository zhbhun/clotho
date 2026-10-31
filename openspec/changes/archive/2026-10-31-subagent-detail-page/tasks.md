# Tasks

## 1. Detail-view store

- [x] 1.1 Create the subagent detail store (`pages/settings/components/subagent-detail-store.ts` or exported from `agent-subagent-settings.tsx`): state `view: 'list' | { kind: 'detail'; file: string | null }` plus `isDirty`, with actions to open detail (file or new), mark dirty, and return to list; reset `isDirty` on view change.

## 2. Detail page from SubagentEditor

- [x] 2.1 Reshape `SubagentEditor` into the detail page body: page header (h1 = subagent name or localized `New subagent`, description line below), drop the bordered-card wrapper, keep field order and footer (danger Delete left; Cancel + primary Save right).
- [x] 2.2 Add dirty tracking via baseline snapshot of the form on mount; wire Cancel and Save through the store (`requestLeave` confirm-if-dirty; Save writes then returns to list); Delete keeps existing confirm-then-delete flow and returns to list.

## 3. List page switch

- [x] 3.1 In `AgentSubagentSettings`, remove the inline editor render and `draft` state; chevron and Add now open the detail view via the store; keep list refresh after save/delete (trigger reload when the detail view closes).

## 4. Breadcrumb bar and category guard in settings index

- [x] 4.1 In `SettingsPageContent`, render the breadcrumb bar inside `SidebarInset` above `TransientScrollArea` only when the subagent detail view is open: root `Subagents` (clickable, `requestLeave`) + separator + leaf (name or `New subagent`, truncated); bar hidden on list view.
- [x] 4.2 Render the detail page instead of the list inside the `agent-subagents` `SettingsCategory` when the detail view is open.
- [x] 4.3 Guard sidebar category switching: when the detail view is open and dirty, intercept `setCategoryId` and open the discard dialog; on confirm return to the list without activating the clicked category, on decline do nothing.
- [x] 4.4 Add the discard confirmation dialog (existing Dialog pattern, keys under `settings.agent.subagent.discard*`).

## 5. i18n

- [x] 5.1 Add catalog keys (en/zh-CN/zh-TW): `New subagent` leaf/title, detail description line, breadcrumb-root label fallback (reuse `settings.categories.agentSubagents`), discard dialog title/body/buttons.

## 6. Verification

- [x] 6.1 Update `agent-subagent-settings.test.tsx` for the detail-page flow (open via chevron/Add, save/cancel/delete returns to list, dirty-guard on Cancel); cover the breadcrumb-root and sidebar-switch leave guard in `index.test.tsx` (dirty confirms, clean passes through); run affected tests plus `npm run check`.
- [x] 6.2 Validate in the running app via `npm run debug`: list → chevron → detail with breadcrumb; edit field → breadcrumb root/sidebar/Cancel each trigger the dialog; clean paths skip it; Save returns to list; Esc closes settings.

## Workflow follow-up

- Archive the change with `/openspec-archive-change` (syncs the spec delta and archives `prototype.html` with the change).
