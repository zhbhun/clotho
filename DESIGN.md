---
name: Clotho
colors:
  background: '#ffffff'
  foreground: '#171717'
  foreground-subtle: '#404040'
  foreground-subtlest: '#737373'
  foreground-disabled: '#a1a1a1'
  card: '#ffffff'
  card-foreground: '#171717'
  popover: '#ffffff'
  popover-foreground: '#171717'
  primary: '#171717'
  primary-foreground: '#fafafa'
  secondary: '#f1f1f1'
  secondary-foreground: '#171717'
  muted: '#f1f1f1'
  muted-foreground: '#737373'
  accent: '#f1f1f1'
  accent-foreground: '#171717'
  destructive: '#e7000b'
  status-unread: oklch(0.58 0.19 255)
  border: '#e5e5e5'
  input: '#e5e5e5'
  ring: '#a0a0a0'
  chart-1: '#d4d4d4'
  chart-2: '#737373'
  chart-3: '#525252'
  chart-4: '#404040'
  chart-5: '#262626'
  sidebar: '#fafafa'
  sidebar-foreground: '#404040'
  sidebar-primary: '#171717'
  sidebar-primary-foreground: '#fafafa'
  sidebar-accent: '#f0f0f0'
  sidebar-accent-foreground: '#171717'
  sidebar-border: '#e5e5e5'
  sidebar-ring: '#a0a0a0'
  dark-background: '#1c1c1c'
  dark-foreground: '#f5f5f5'
  dark-foreground-subtle: '#d7d7d7'
  dark-foreground-subtlest: '#a6a6a6'
  dark-foreground-disabled: '#616161'
  dark-card: '#262626'
  dark-card-foreground: '#f5f5f5'
  dark-popover: '#262626'
  dark-popover-foreground: '#f5f5f5'
  dark-primary: '#f5f5f5'
  dark-primary-foreground: '#262626'
  dark-secondary: '#373737'
  dark-secondary-foreground: '#f5f5f5'
  dark-muted: '#373737'
  dark-muted-foreground: '#a6a6a6'
  dark-accent: '#373737'
  dark-accent-foreground: '#f5f5f5'
  dark-destructive: '#ff6467'
  dark-status-unread: oklch(0.72 0.16 255)
  dark-border: oklch(1 0 0 / 10%)
  dark-input: oklch(1 0 0 / 15%)
  dark-ring: '#727272'
  dark-chart-1: '#d7d7d7'
  dark-chart-2: '#7f7f7f'
  dark-chart-3: '#616161'
  dark-chart-4: '#505050'
  dark-chart-5: '#373737'
  dark-sidebar: '#262626'
  dark-sidebar-foreground: '#f5f5f5'
  dark-sidebar-primary: '#f5f5f5'
  dark-sidebar-primary-foreground: '#262626'
  dark-sidebar-accent: '#373737'
  dark-sidebar-accent-foreground: '#f5f5f5'
  dark-sidebar-border: oklch(1 0 0 / 10%)
  dark-sidebar-ring: '#727272'
neutralScale:
  '50': oklch(0.985 0 0)
  '100': oklch(0.97 0 0)
  '200': oklch(0.922 0 0)
  '300': oklch(0.87 0 0)
  '400': oklch(0.708 0 0)
  '500': oklch(0.556 0 0)
  '600': oklch(0.439 0 0)
  '700': oklch(0.371 0 0)
  '800': oklch(0.269 0 0)
  '900': oklch(0.205 0 0)
  '950': oklch(0.145 0 0)
themeTokens:
  light:
    background: var(--color-white)
    foreground: var(--color-neutral-900)
    foreground-subtle: color-mix(in oklab, var(--background), var(--foreground) 79.1195%)
    foreground-subtlest: color-mix(in oklab, var(--background), var(--foreground) 55.8491%)
    foreground-disabled: color-mix(in oklab, var(--background), var(--foreground) 36.7296%)
    card: var(--background)
    card-foreground: var(--foreground)
    popover: var(--background)
    popover-foreground: var(--foreground)
    popover-shadow: 0 4px 10px -4px color-mix(in oklab, var(--color-neutral-950) 18%, transparent), 0 8px 28px -12px color-mix(in oklab, var(--color-neutral-950) 24%, transparent)
    primary: var(--color-neutral-900)
    primary-foreground: color-mix(in oklab, var(--background), var(--foreground) 1.8868%)
    secondary: color-mix(in oklab, var(--background), var(--foreground) 5.25%)
    secondary-foreground: var(--foreground)
    muted: var(--secondary)
    muted-foreground: var(--foreground-subtlest)
    accent: var(--secondary)
    accent-foreground: var(--foreground)
    destructive: oklch(0.577 0.245 27.325)
    status-unread: oklch(0.58 0.19 255)
    border: oklch(0.922 0 0)
    input: var(--border)
    ring: color-mix(in oklab, var(--primary) 37%, var(--background))
    chart-1: color-mix(in oklab, var(--background), var(--foreground) 16.3522%)
    chart-2: color-mix(in oklab, var(--background), var(--foreground) 55.8491%)
    chart-3: color-mix(in oklab, var(--background), var(--foreground) 70.566%)
    chart-4: color-mix(in oklab, var(--background), var(--foreground) 79.1195%)
    chart-5: color-mix(in oklab, var(--background), var(--foreground) 91.9497%)
    radius: 0.625rem
    sidebar: color-mix(in oklab, var(--background), var(--foreground) 1.8868%)
    sidebar-foreground: var(--foreground-subtle)
    sidebar-primary: var(--primary)
    sidebar-primary-foreground: var(--primary-foreground)
    sidebar-accent: color-mix(in oklab, var(--sidebar), var(--sidebar-foreground) 5%)
    sidebar-accent-foreground: var(--foreground)
    sidebar-border: var(--border)
    sidebar-ring: var(--ring)
    float-shadow: 0 0 10px -4px color-mix(in oklab, var(--color-neutral-950) 18%, transparent), 0 0 28px -12px color-mix(in oklab, var(--color-neutral-950) 24%, transparent)
    dialog-shadow: 0 0 10px -4px color-mix(in oklab, var(--color-neutral-950) 20%, transparent), 0 0 28px -12px color-mix(in oklab, var(--color-neutral-950) 26%, transparent)
    divider: oklch(0 0 0 / 7%)
  dark:
    background: '#1c1c1c'
    foreground: var(--color-neutral-100)
    foreground-subtle: color-mix(in oklab, var(--background), var(--foreground) 87.8788%)
    foreground-subtlest: color-mix(in oklab, var(--background), var(--foreground) 67%)
    foreground-disabled: color-mix(in oklab, var(--background), var(--foreground) 35.6364%)
    card: color-mix(in oklab, var(--background), var(--foreground) 5.5%)
    card-foreground: var(--foreground)
    popover: var(--card)
    popover-foreground: var(--foreground)
    popover-shadow: 0 4px 12px -4px color-mix(in oklab, var(--color-neutral-950) 36%, transparent), 0 8px 30px -12px color-mix(in oklab, var(--color-neutral-950) 52%, transparent)
    primary: var(--color-neutral-100)
    primary-foreground: var(--card)
    secondary: color-mix(in oklab, var(--background), var(--foreground) 14.76%)
    secondary-foreground: var(--foreground)
    muted: var(--secondary)
    muted-foreground: var(--foreground-subtlest)
    accent: var(--secondary)
    accent-foreground: var(--foreground)
    destructive: oklch(0.704 0.191 22.216)
    status-unread: oklch(0.72 0.16 255)
    border: oklch(1 0 0 / 10%)
    input: oklch(1 0 0 / 15%)
    ring: color-mix(in oklab, var(--primary) 44%, var(--background))
    chart-1: color-mix(in oklab, var(--background), var(--foreground) 87.8788%)
    chart-2: color-mix(in oklab, var(--background), var(--foreground) 49.8182%)
    chart-3: color-mix(in oklab, var(--background), var(--foreground) 35.6364%)
    chart-4: color-mix(in oklab, var(--background), var(--foreground) 27.3939%)
    chart-5: var(--secondary)
    radius: 0.625rem
    sidebar: var(--card)
    sidebar-foreground: var(--foreground)
    sidebar-primary: var(--primary)
    sidebar-primary-foreground: var(--primary-foreground)
    sidebar-accent: var(--secondary)
    sidebar-accent-foreground: var(--accent-foreground)
    sidebar-border: var(--border)
    sidebar-ring: var(--ring)
    float-shadow: 0 0 12px -4px color-mix(in oklab, var(--color-neutral-950) 36%, transparent), 0 0 30px -12px color-mix(in oklab, var(--color-neutral-950) 52%, transparent)
    dialog-shadow: 0 0 12px -4px color-mix(in oklab, var(--color-neutral-950) 40%, transparent), 0 0 30px -12px color-mix(in oklab, var(--color-neutral-950) 56%, transparent)
    divider: oklch(1 0 0 / 5%)
typography:
  caption:
    fontFamily: Inter Variable, sans-serif
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: '0'
  body:
    fontFamily: Inter Variable, sans-serif
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: '0'
  button-label:
    fontFamily: Inter Variable, sans-serif
    fontSize: 14px
    fontWeight: '500'
    lineHeight: relaxed
    letterSpacing: '0'
  heading:
    fontFamily: Inter Variable, sans-serif
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
    letterSpacing: '0'
  markdown-body:
    fontFamily: Inter Variable, sans-serif
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.7'
    letterSpacing: '0'
  code:
    fontFamily: monospace
    fontSize: 12px
    fontWeight: '400'
    lineHeight: relaxed
    letterSpacing: '0'
  section-label:
    fontFamily: monospace
    fontSize: 10px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.375rem
  md: 0.5rem
  lg: 0.625rem
  xl: 0.875rem
  2xl: 1.125rem
  3xl: 1.375rem
  4xl: 1.625rem
  full: 9999px
spacing:
  unit: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  sidebar-width: 318px
  content-max-width: 56rem
shadows:
  float: 0 0 10px -4px color-mix(in oklab, var(--color-neutral-950) 18%, transparent), 0 0 28px -12px color-mix(in oklab, var(--color-neutral-950) 24%, transparent)
  popover: 0 4px 10px -4px color-mix(in oklab, var(--color-neutral-950) 18%, transparent), 0 8px 28px -12px color-mix(in oklab, var(--color-neutral-950) 24%, transparent)
  dialog: 0 0 10px -4px color-mix(in oklab, var(--color-neutral-950) 20%, transparent), 0 0 28px -12px color-mix(in oklab, var(--color-neutral-950) 26%, transparent)
  dark-float: 0 0 12px -4px color-mix(in oklab, var(--color-neutral-950) 36%, transparent), 0 0 30px -12px color-mix(in oklab, var(--color-neutral-950) 52%, transparent)
  dark-popover: 0 4px 12px -4px color-mix(in oklab, var(--color-neutral-950) 36%, transparent), 0 8px 30px -12px color-mix(in oklab, var(--color-neutral-950) 52%, transparent)
  dark-dialog: 0 0 12px -4px color-mix(in oklab, var(--color-neutral-950) 40%, transparent), 0 0 30px -12px color-mix(in oklab, var(--color-neutral-950) 56%, transparent)
---

# Design System: Clotho

## 1. Visual Theme & Atmosphere

Clotho uses a compact desktop application design language: quiet, monochrome, and intentionally dense. The interface should feel like a precise professional tool, not a marketing page or consumer social product. It favors stable navigation, clear hierarchy, tight controls, readable content areas, and subtle surface changes over expressive decoration.

The system is built around a neutral shadcn/ui theme with CSS variables as the source of truth. Light mode is almost pure white with soft neutral panels. Dark mode inverts into a near-black shell with low-contrast gray surfaces. Emphasis comes from type weight, opacity, borders, compact spacing, focus rings, and semantic theme tokens rather than saturated brand color.

## 2. Theme Tokens

### Token Contract

Tailwind v4's built-in `neutral-50` through `neutral-950` OKLCH scale is the primitive color foundation. Project theme values live as semantic CSS variables under `:root` and `.dark`, and `@theme inline` exposes them as Tailwind utilities. Components should use semantic utilities first, such as `bg-background`, `bg-muted`, `text-foreground`, `text-foreground-subtle`, `border-border`, and `ring-ring`.

The shadcn token contract remains available for registry components. `secondary` means a lower-emphasis filled action or control, `muted` means a subdued surface, and `accent` means an interactive hover or selected surface. These names must not be reused as the application's text hierarchy. For compatibility, shadcn's `muted-foreground` aliases `foreground-subtlest`.

The text hierarchy is intentionally small:

- `foreground` for default and high-emphasis content.
- `foreground-subtle` for readable supporting content, descriptions, and metadata.
- `foreground-subtlest` for tertiary information that should visibly recede.
- `foreground-disabled` for unavailable content when opacity alone is insufficient.

There are no `background-subtle` or `background-disabled` tokens. Use `muted` or an existing component surface for subdued backgrounds, and express disabled state through component state variants and opacity. The base token controls a surface, while its `-foreground` partner controls text and icons on that surface.

Dark mode works by overriding the same tokens under `.dark`. Do not use manual `dark:bg-*` and `dark:text-*` overrides for standard surfaces; update token values instead.

Direct palette utilities, including `neutral-*` and chromatic scales, are allowed for isolated visual details whose meaning is inherently palette-specific, such as file-type icons, diffs, syntax highlighting, charts, and external brand marks. If a choice repeats or needs coordinated theme behavior, promote it to a semantic token.

### Token Usage Table

| Token                                            | Role                                           | Use                                                                    |
| ------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `background` / `foreground`                      | Default app canvas and default text            | App shell, page sections, normal body text                             |
| `foreground-subtle`                              | Supporting text                                | Descriptions, metadata, helper text, inactive icons                    |
| `foreground-subtlest`                            | Tertiary and intentionally receded text        | Timestamps, quiet hints, weak placeholders, non-critical metadata      |
| `foreground-disabled`                            | Unavailable text                               | Disabled labels and unavailable content                                |
| `card` / `card-foreground`                       | Elevated or framed surfaces                    | Cards, panels, settings sections, grouped content                      |
| `popover` / `popover-foreground`                 | Floating surfaces                              | Popovers, dropdown menus, right-click menus, tooltips where applicable |
| `shadow-popover`                                 | Downward-offset floating shadow                | Popovers, completion panels, dropdown surfaces that may open up/down   |
| `primary` / `primary-foreground`                 | Highest-emphasis actions and selected surfaces | Explicit primary button, selected item, active accent                  |
| `secondary` / `secondary-foreground`             | Lower-emphasis filled actions                  | Secondary button, support action, subdued filled control               |
| `muted` / `muted-foreground`                     | shadcn subdued surface and compatibility pair  | Registry components and subdued panels; foreground aliases `subtlest`  |
| `accent` / `accent-foreground`                   | Interactive hover and active surfaces          | Hovered rows, selected menu items, ghost button hover states           |
| `destructive`                                    | Destructive action and error emphasis          | Delete actions, invalid states, destructive menu items                 |
| `status-unread`                                  | Unread status emphasis                         | Unread indicators and unread state markers                             |
| `border`                                         | Default structural borders                     | Cards, tables, menus, separators, layout dividers                      |
| `input`                                          | Form borders and input surface treatment       | Inputs, textareas, selects, outline-style controls                     |
| `ring`                                           | Focus rings and outlines                       | Buttons, inputs, checkboxes, menus, and focusable controls             |
| `chart-1` ... `chart-5`                          | Default chart palette                          | Charts, metrics, and neutral data visualizations                       |
| `sidebar` / `sidebar-foreground`                 | Sidebar base surface and text                  | Sidebar container and default sidebar content                          |
| `sidebar-primary` / `sidebar-primary-foreground` | High-emphasis sidebar actions                  | Active sidebar actions, icon tiles, sidebar CTAs                       |
| `sidebar-accent` / `sidebar-accent-foreground`   | Sidebar hover and selected states              | Sidebar rows, open groups, hovered navigation items                    |
| `sidebar-border`                                 | Sidebar-specific separators                    | Sidebar headers, groups, footers, internal dividers                    |
| `sidebar-ring`                                   | Sidebar-specific focus rings                   | Focused controls inside the sidebar                                    |
| `radius`                                         | Base corner radius                             | Cards, inputs, buttons, popovers, and derived `radius-*` values        |

### Current Theme Values

Theme variables are defined in `src/renderer/styles/variables.css`, imported by `src/renderer/index.css`. `styles/sidebar.css` applies local sidebar overrides. `components/theme-provider.tsx` applies runtime `primary`, `background`, and `foreground` overrides for non-Clotho presets and custom palettes. Light and dark palettes are configured and saved independently; system mode selects the matching palette. The named color presets change colors, not the Nova component geometry.

The front matter `colors` block records approximate default Clotho colors before local sidebar overrides. Translucent colors retain their alpha expression instead of assuming a backing surface. `neutralScale` records Tailwind's exact OKLCH primitives; `themeTokens` and `shadows` mirror the current CSS expressions. Derived colors use `color-mix(in oklab, ...)` and follow the active anchors; do not replace those expressions with the approximate hex samples.

#### Neutral Primitive Scale

| Token         | OKLCH              | Hex approximation |
| ------------- | ------------------ | ----------------- |
| `neutral-50`  | `oklch(0.985 0 0)` | `#fafafa`         |
| `neutral-100` | `oklch(0.97 0 0)`  | `#f5f5f5`         |
| `neutral-200` | `oklch(0.922 0 0)` | `#e5e5e5`         |
| `neutral-300` | `oklch(0.87 0 0)`  | `#d4d4d4`         |
| `neutral-400` | `oklch(0.708 0 0)` | `#a1a1a1`         |
| `neutral-500` | `oklch(0.556 0 0)` | `#737373`         |
| `neutral-600` | `oklch(0.439 0 0)` | `#525252`         |
| `neutral-700` | `oklch(0.371 0 0)` | `#404040`         |
| `neutral-800` | `oklch(0.269 0 0)` | `#262626`         |
| `neutral-900` | `oklch(0.205 0 0)` | `#171717`         |
| `neutral-950` | `oklch(0.145 0 0)` | `#0a0a0a`         |

#### Semantic Theme Mapping

| Token                                            | Light Clotho                                                    | Dark Clotho                                                      |
| ------------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------- |
| `background` / `foreground`                      | `#ffffff` / `#171717`                                           | `#1c1c1c` / `#f5f5f5`                                            |
| `foreground-subtle`                              | approximately `#404040`                                         | approximately `#d7d7d7`                                          |
| `foreground-subtlest`                            | approximately `#737373`                                         | approximately `#a6a6a6`                                          |
| `foreground-disabled`                            | approximately `#a1a1a1`                                         | approximately `#616161`                                          |
| `card` / `popover`                               | `background`                                                    | background mixed with 5.5% foreground, approximately `#262626`   |
| `primary` / `primary-foreground`                 | `neutral-900` / background mixed with 1.8868% foreground        | `neutral-100` / `card`                                           |
| `secondary` / `muted` / `accent`                 | background mixed with 5.25% foreground, approximately `#f1f1f1` | background mixed with 14.76% foreground, approximately `#373737` |
| `muted-foreground`                               | `foreground-subtlest`                                           | `foreground-subtlest`                                            |
| `border` / `input`                               | `oklch(0.922 0 0)` / `border`                                   | white at 10% / white at 15%                                      |
| `divider`                                        | black at 7%                                                     | white at 5%                                                      |
| `ring`                                           | primary mixed at 37% with background                            | primary mixed at 44% with background                             |
| `chart-1` ... `chart-5`                          | five derived grayscale steps                                    | five derived grayscale steps                                     |
| `sidebar` / `sidebar-foreground`                 | approximately `#fafafa` / `foreground-subtle`                   | `card` / `foreground`                                            |
| `sidebar-accent`                                 | sidebar mixed with 5% sidebar foreground                        | `secondary`                                                      |
| `sidebar-primary` / `sidebar-primary-foreground` | `primary` / `primary-foreground`                                | `primary` / `primary-foreground`                                 |
| `sidebar-border` / `sidebar-ring`                | `border` / `ring`                                               | `border` / `ring`                                                |
| `radius`                                         | `0.625rem`                                                      | `0.625rem`                                                       |

`float-shadow`, `popover-shadow`, and `dialog-shadow` have separate light/dark expressions recorded in the front matter. Popover shadows have downward offsets; float and dialog shadows are centered. Local app sidebar colors and divider/shadow treatments are defined in `styles/sidebar.css` and take precedence within that layout.

`destructive` and `status-unread` remain chromatic semantic tokens because they communicate state rather than neutral hierarchy.

### Token Maintenance

Project-specific semantic decisions belong in `:root` and `.dark`. The `@theme inline` block is the Tailwind v4 mapping layer; change it only when adding, removing, or renaming a semantic token. Do not redefine Tailwind's neutral scale locally.

When adding a custom token, define both the surface and foreground pair where appropriate:

```css
:root {
  --warning: oklch(...);
  --warning-foreground: oklch(...);
}

.dark {
  --warning: oklch(...);
  --warning-foreground: oklch(...);
}

@theme inline {
  --color-warning: var(--warning);
  --color-warning-foreground: var(--warning-foreground);
}
```

Then use `bg-warning text-warning-foreground`. A single palette-specific detail may use a direct Tailwind color utility, but repeated domain meaning belongs behind a semantic token.

## 3. Color Palette & Roles

### Surfaces

**Canvas** (`background`) is white in light Clotho and `#1c1c1c` in dark Clotho. **Card** and **Popover** match the light canvas; in dark mode they mix 5.5% foreground into the canvas, approximately `#262626`. Secondary, muted, and accent surfaces share the next tier, approximately `#f1f1f1` light and `#373737` dark.

**Muted Surface** (`muted`) is the general low-emphasis fill for helper panels, code blocks, and subdued containers. Use opacity variants such as `bg-muted/30` and `bg-muted/50` when an even quieter surface is needed.

**Secondary Surface** (`secondary`) is reserved for lower-emphasis filled actions and controls. It is not a generic background level and does not represent secondary text.

**Accent Surface** (`accent`) is reserved for hover, selected, and active interaction states. It should feel like a quiet surface change rather than a brand-colored highlight.

**Hairline Neutral Border** is approximately `#e5e5e5` for both `border` and `input` in light mode. Dark borders use white at 10%, and input borders use white at 15%, adapting to their backing surface. Separator uses a separate `divider`: black at 7% in light mode and white at 5% in dark mode.

**Sidebar Wash** and **Sidebar Accent** derive from the active anchors. The main app sidebar additionally overrides its background, active surface, divider, and inset separation shadow in `styles/sidebar.css`; use those scoped tokens rather than assuming the global sidebar sample is the rendered rail color.

### Accent & Interactive

**Primary Ink** (`primary`) is the theme accent, used by explicit primary buttons, selected controls, and other accent-driven states. Clotho defaults to `#171717` light and `#f5f5f5` dark. Other presets and custom palettes may use a chromatic accent. Default buttons intentionally use foreground/background instead.

**Stable Filled Text** uses the matching `*-foreground` token. Low-emphasis controls and selected rows should communicate state primarily through their surface rather than through arbitrary text-color changes.

**Destructive Red** (`destructive`, `#e7000b`) is reserved for delete actions, invalid states, destructive menu items, and critical errors. Prefer tinted text or soft backgrounds (`bg-destructive/10` to `/20`) instead of a full danger block.

### Text Hierarchy

**Primary Text** (`foreground`, `neutral-900` light / `neutral-100` dark) carries titles, current content, selected labels, and normal body copy.

**Subtle Text** (`foreground-subtle`, approximately `#404040` light / `#d7d7d7` dark) carries descriptions, metadata, helper text, inactive icons, and supporting content while remaining readable at compact sizes.

**Subtlest Text** (`foreground-subtlest`, approximately `#737373` light / `#a6a6a6` dark) carries timestamps, quiet hints, weak placeholders, and non-critical metadata. Do not use it for long-form body copy.

**Disabled Text** (`foreground-disabled`, approximately `#a1a1a1` light / `#616161` dark) is reserved for unavailable content when a component's disabled opacity treatment is not sufficient.

`muted-foreground` is a shadcn compatibility alias for `foreground-subtlest`, not a separate text level. Business components should use the foreground hierarchy directly.

Prefer these named layers before opacity suffixes. Use one-off opacity utilities only for local animation, transition, or blending effects.

**Chart Neutrals** (`chart-1` through `chart-5`) are a grayscale data palette from light gray to charcoal. Use them only for neutral dashboard-like blocks unless a chart needs stronger semantic color.

## 4. Typography Rules

### Hierarchy & Weights

The system uses **Inter Variable** as its English-first primary family, with generic `sans-serif` handling missing glyphs through the operating system. `font-heading` intentionally aliases `font-sans`; it is a semantic role for headings, not a separate display face. Heading hierarchy comes from size and weight. Do not add platform-specific CJK fallback lists or a decorative display face unless the product direction changes.

Business UI uses Tailwind's standard type scale. `text-xs` (12px) is for captions, metadata, tool output, and compact controls; all former 11px through 12.5px values map here. `text-sm` (14px) is the default app text and control size; former 13px values map here. `text-base` (16px) and `text-lg` (18px) are reserved for progressively stronger headings. shadcn registry components may retain their upstream 10px micro labels and shortcuts, but business code must not introduce arbitrary font sizes.

Long-form content is more readable than the surrounding chrome. It uses line-height `1.7`, 500-weight headings, and the standard heading sizes `text-lg`, `text-base`, and `text-sm`, with generous paragraph rhythm. This creates a clear distinction between reading surfaces and the operational UI around them.

Use monospace only for code, identifiers, file paths, and compact technical summaries. Tiny technical labels may use tracking and low contrast, but they should not become prominent badges.

### Spacing Principles

The typography rhythm is compact but not cramped. Rows are often 20px to 32px tall. Sidebar rows retain their page-specific sizing; default Nova buttons and single-line inputs are 32px high. Icon buttons range from 24px to 36px. Larger input or reading areas may use extra internal padding, but they should still align to the compact density scale.

Keep letter spacing at zero for normal text. Only tiny technical labels may use slight positive tracking. Use tabular numbers for counters, elapsed time, and progress summaries.

## 5. Component Styling Rules

### Buttons

Buttons follow shadcn `base-nova` composition with the project palette and an additional `primary` variant. The default shape is `rounded-lg`. Default and large button text is 14px, small is 12.8px (`text-[0.8rem]`), and extra-small is 12px; the default weight is 500 (`font-medium`). The `xs`, `sm`, default, and `lg` heights are 24px, 28px, 32px, and 36px respectively. Controls use subtle transitions.

The implicit `default` variant uses `bg-foreground text-background`, hovering to `bg-foreground/80`. Use explicit `variant="primary"` for `bg-primary text-primary-foreground` with `bg-primary/80` hover. Secondary has a persistent secondary fill and mixes in 5% foreground in oklab on hover. Outline follows Nova: background fill and border-border in light mode, border-input and input/30 fill in dark mode, with muted hover in light and input/50 hover in dark. Ghost is transparent until hovered or expanded, uses muted, and uses muted/50 on dark hover. Destructive and link retain upstream variant color rules.

The former mute, surface, and surface-strong variants have been removed. Quiet actions use ghost with local `text-muted-foreground` where needed. Buttons retain project 2px/30% focus rings and 2px invalid rings with destructive color overrides; the upstream 1px press translation is removed.

Icon buttons use Nova's size variants: `icon-xs` is 24px, `icon-sm` is 28px, default icon is 32px, and `icon-lg` is 36px. Use Lucide icons and `data-icon` placement in text buttons. Compact pending-message actions use `icon-sm`, retain 14px icons, and keep their circular shape. Use size variants rather than fixed dimensions to express standard control sizes.

Form labels, option titles, and badges use their component defaults (500 weight). The model picker button intentionally retains 400 weight to read like a selection control; session tab titles retain 400 weight as application navigation. Fullscreen settings, image previews, composer geometry, and circular actions retain their existing layout-specific overrides.

### Surfaces & Cards

Cards are not decorative page sections. They are framed surfaces for grouped content, settings, summaries, forms, and dialogs. Use rounded edges, hairline borders, and muted translucent fills.

Default cards use `card` and `card-foreground`. Subdued panels may use `muted/30` to `muted/50`. Use borders for structure before adding shadow. When elevation is needed, keep it soft and ambient rather than dramatic.

Compact panels use `rounded-md border border-border/50 bg-muted/30`, with `px-3 py-2` padding. Larger grouped sections may use `rounded-lg` with `px-4 py-3`. Avoid nesting card-like surfaces unless a modal, repeated item, or standalone interactive surface genuinely needs its own boundary.

Card, Dialog, AlertDialog, Popover, HoverCard, Select, Combobox, DropdownMenu, and ContextMenu use the upstream constant 1px `ring-foreground/10` edge. This edge is separate from an interactive focus ring. Menus, Popover, and Combobox retain `shadow-popover`, with downward offsets and wider blur than upstream; dark mode increases shadow strength. Dropdown submenus also use this shadow; context submenus retain shadow-lg. Select and HoverCard retain shadow-md. The exact float, popover, and dialog shadow expressions live in variables.css.

Card, Dialog, and AlertDialog footers retain their padding, bottom rounding, and layout but omit the upstream top border and muted/50 fill. Badge outline retains a transparent fill. Default Tabs active triggers retain shadow-sm; line Tabs have no active shadow. These are the registry Tabs, separate from the custom conversation tabs.

### Navigation

The sidebar is a stable navigation surface, not a brand banner. Use `sidebar` and `sidebar-foreground` for the base, `sidebar-border` for internal dividers, and `sidebar-accent` for hover or selected rows.

Navigation groups are tight vertical stacks. Rows are compact, rounded-md, and truncate aggressively. Active rows use `bg-sidebar-accent text-sidebar-accent-foreground`; inactive rows use muted text and only surface on hover. Secondary actions should be visually quiet until hover or focus.

Settings navigation uses default 32px menu buttons, 2px menu gaps, 400-weight text, and 14px icons. Sidebar buttons do not add transparent layout borders or background clipping. The main sidebar retains its hover preview and scoped palette/press effects. Top bars and section headers should use background translucency only when they need to float above content.

### Inputs & Forms

Inputs and input groups use Nova's `h-8 rounded-lg` geometry, with `px-2.5 py-1` on standard inputs. Textareas use `rounded-lg`, `px-2.5 py-2`, and `min-h-16`. Standard input and textarea text uses `text-base md:text-sm` (14px at desktop widths). Use border-input with a transparent light fill and dark:bg-input/30. Input and Textarea disabled fills use input/50 light and input/80 dark; InputGroup applies those fills and opacity-50 to the group while its inner controls stay transparent. Input and Textarea disable spellcheck by default; Textarea retains resize-none. Search wrappers may retain their layout-specific surface treatment.

Placeholder text uses `foreground-subtlest`; helper text uses `foreground-subtle`. Focus states use `ring`, not a one-off color. Validation uses `destructive` and `aria-invalid`, with the invalid state on the control and the visual grouping state on the field.

Use shadcn form composition when available: `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`, and `FieldSet`. Checkbox and Radio selected colors use primary/primary-foreground. Card-style FieldLabel options retain upstream primary-tinted selected fill and border, muted/50 hover when enabled, and an outer 2px/30% focus ring; nested controls suppress their duplicate ring. AI question options use these defaults without local neutral-selection, border, or padding overrides.

InputGroup addon button and kbd offsets follow upstream. Combobox popup search groups use border-input/30 and input/30 fill; chips areas are transparent in light mode and input/30 in dark, and chips use muted. Select and Command indicators remain opt-in; Select also supports hiding its chevron. Option sets may use ToggleGroup when appropriate.

### Overlays & Menus

Menus, popovers, and dialogs use `popover` or `background` depending on modality. Dropdown and right-click menu rows use `accent` for hover and selected states. Dialog-like surfaces require a title for accessibility, even when visually hidden.

Reuse the existing component stacking rules; avoid new page-specific z-index overrides. DialogContent supports showOverlay=false for unshaded floating dialogs, adding shadow-dialog when not fullscreen. Modality is independently controlled by Dialog's modal prop. isFullscreen suppresses the overlay and float shadow; callers supply viewport geometry and usually hide the default close button. Settings and image preview use this path. Nested Dialog/AlertDialog overlays hide the ancestor overlay and disable its pointer events while the nested overlay is open. Sheet is not installed; its unused implementation was removed.

Glass-enabled surfaces use an 80% surface fill and blur(8px), with a stronger light-mode accent. Reduced-transparency and unsupported-filter paths restore an opaque surface.

### Feedback & States

Use `destructive` for destructive or invalid states. Use `muted` for subdued surfaces, `foreground-subtle` for helper states, and `foreground-subtlest` for weaker tertiary copy. Disabled controls should use their component state treatment and opacity, with `foreground-disabled` only when an explicit unavailable text color is needed. Use `Skeleton` for loading placeholders, `Alert` for callouts, `Badge` for compact state labels, `Progress` for progress, and `Separator` for visual dividers.

### Focus, Notifications & Scrolling

Ordinary component focus rings use 2px and ring/30; validation keeps its destructive color and opacity overrides. ScrollArea intentionally omits the whole-viewport focus ring. Attachment keeps its specific focus-visible treatment: the card itself or its attachment trigger highlights the card, while a focused remove action only highlights that action.

Toast retains top-center placement at 16px, a 460px maximum width, glass background, custom light/dark shadows, downward stacking, and top-oriented entry/exit. Content aligns at the top; action buttons stay vertically centered. The small circular close button sits outside the top-right corner and appears on hover or focus. Tooltip defaults to a 1000ms provider delay and disableHoverablePopup=true, keeping upstream geometry and colors.

ScrollArea retains optional transient scrollbars, axis selection, viewportRef/viewportProps, and the business wrapper's drag protection. Transient bars appear during scrolling and hide after about one second without input, stay visible while hovered, and widen on hover. Base UI Content observes content size changes so overflow state stays current as content grows or shrinks; its minimum width is reset to zero to preserve normal text wrapping. Scrollbars stay mounted for listeners and measurement but become invisible whenever their axis has no overflow, using Base UI overflow attributes; overflow returning restores the normal visibility behavior.

Global body text is 14px. Settings primary names use 500 and supporting content 400; navigation stays at its existing 400 weight, and subagent tool checkbox labels retain their agreed 400 weight. Text selection is disabled except in inputs, editable regions, and select-text content. Preserve font smoothing, reduced-motion preferences, optional pointer cursors, and Electron drag/no-drag regions.

## 6. Layout Principles

### Grid & Structure

The app shell is a full-height desktop layout: `flex h-svh overflow-hidden bg-background text-foreground`. A fixed sidebar can sit beside a flexible main area. There is no landing page structure and no marketing-style hero.

The primary content column is centered with `max-w-4xl` or the `content-max-width` token. Use generous side padding for readable content, tighter padding for controls, and stable top/bottom offsets when fixed bars are present. Primary areas may use a subtle vertical gradient from `background` to a background/muted mix.

### Whitespace Strategy

Whitespace is functional and dense. Major layout padding is generous enough to keep long-form content readable, while internal controls use 4px and 8px gaps. Menus and rows prefer `gap-1`, `gap-1.5`, `gap-2`, with small vertical padding rather than large card spacing.

Use 4px as the micro-spacing unit, 8px for compact component rhythm, 16px for panel grouping, 24px for larger local separation, and 32px only for major page or layout separation.

### Alignment & Visual Balance

Use left alignment almost everywhere. Centering is reserved for empty states, loading states, compact progress indicators, or truly symmetric modal content. The interface should feel stable, scannable, and quiet.

The strongest visual weight belongs to the current primary action, active navigation row, focused input, and current content surface. Everything else should recede through subtle foreground color, opacity, and low-contrast borders.

### Responsive Behavior & Touch

This is a desktop-first system. Use viewport-safe width constraints for floating panels, menus, and headers. Do not scale font sizes with viewport width.

Keep controls compact for desktop productivity: standard icon buttons range from 24px to 36px, default buttons and single-line inputs are 32px high, and list rows retain their page-specific density. Existing application chrome may use smaller custom targets where its layout requires them. When designing new responsive views, preserve density on desktop and only increase targets when a mobile or tablet mode is explicitly introduced.

## 7. Design System Notes for Stitch Generation

### Generation Language

Use generation phrases like: "compact desktop application", "neutral shadcn monochrome theme", "semantic theme tokens", "hairline borders", "muted panels", "dense sidebar", "compact controls", "Inter typography", "low-saturation operational UI", and "desktop chrome with subtle backdrop blur".

Avoid generation phrases like: "landing page", "hero section", "gradient orb", "large marketing cards", "colorful SaaS dashboard", "purple-blue neon", "playful rounded interface", or "consumer messaging app".

### Color References

Use the default Clotho samples and derivation rules above. Light canvas/card/popover are white; foreground is #171717; secondary/muted/accent are approximately #f1f1f1. Dark canvas is #1c1c1c, card/popover approximately #262626, secondary/muted/accent approximately #373737, and foreground #f5f5f5. Supporting dark text uses derived values around #d7d7d7, #a6a6a6, and #616161. These are samples of the active-anchor expressions, not replacements for them. Respect custom palette and local sidebar overrides.

### Reusable Patterns

**Desktop Shell:** Create a full-height desktop app shell with a fixed 318px neutral sidebar, a flexible primary content region, a compact top bar, and subtle dividers. Use `background`, `sidebar`, `sidebar-border`, and `muted` tokens.

**Settings Panel:** Create a compact settings surface with `card` background, `divider` separators, small Inter labels, muted descriptions, grouped fields, and primary/secondary actions using shadcn Button variants.

**Data List:** Create a dense list with 28px to 32px rows, truncation, muted metadata, hover state using `accent`, selected state using `accent-foreground`, and row actions that appear on hover or focus.

**Overlay Menu:** Create a compact floating menu using `popover`, `popover-foreground`, `ring-1 ring-foreground/10`, `shadow-popover`, rounded-md rows, `accent` hover states, and no custom z-index.

### Incremental Iteration

When extending the design, start by choosing the semantic shadcn token role, then place the component into the existing density scale. New surfaces should use `background`, `muted`, `card`, or `popover`; new high-emphasis actions should use `primary`; hover and selected states should use `accent` or sidebar-specific accent tokens.

Do not add raw brand colors unless they encode domain meaning. If a new state is needed, add a named CSS variable under `:root` and `.dark`, expose it through `@theme inline`, and document its role here.

Prefer compact shadcn composition over custom markup. Components should preserve semantic token usage, focus rings, each Nova component's default radius, full accessible composition, and the current control density. Default buttons and inputs use `rounded-lg`; other components and deliberate application-specific shapes follow their own definitions.
