# PM Cursor (PMind) Design System — Conventions

## Setup

Wrap all compositions in `ThemeProvider` from `window.CursorForPms.ThemeProvider`. Without it, `useTheme()` has no context and dark-mode classes won't toggle. For a light preview: just render children with a `<div class="bg-[#FAFAFA] text-[#1A1A1A]">` wrapper. For dark mode: add class `dark` on the wrapper.

```jsx
// Minimal composition wrapper
<ThemeProvider attribute="class" defaultTheme="light">
  <div className="bg-background text-foreground p-6">
    {/* your component here */}
  </div>
</ThemeProvider>
```

**Font note**: Inter, Playfair Display, and JetBrains Mono are loaded at runtime by Next.js (`next/font/google`). In static previews these fall back to system fonts — `font-sans` → system sans, `font-serif` → Georgia.

## Styling idiom — Tailwind + globals.css custom classes

This DS uses Tailwind utility classes **plus** a set of named custom classes defined in `_ds_bundle.css`. Use `_ds_bundle.css` vocabulary for brand moments, Tailwind for layout and spacing.

### Custom class vocabulary (use exactly these names)

| Class | Effect |
|---|---|
| `.glass-pane` | Floating surface — frosted glass, amber border in dark mode |
| `.glass-inset` | Recessed surface inside a glass pane (e.g. bubbles) |
| `.glass` / `.glass-amber` | Darker glass variants for dark-bg contexts |
| `.editorial-display` | Hero heading — Playfair Display 48px, tight tracking |
| `.editorial-h1` | Section heading — Playfair Display 32px |
| `.editorial-h2` | Subsection / card title — Playfair Display 22px |
| `.editorial-lead` | Opening paragraph — 17px, muted |
| `.editorial-eyebrow` | Small-caps overline in amber — sits above a heading |
| `.mono-meta` | Machine data — IDs, timestamps, scores, file paths |
| `.hairline` | 1px border using `var(--hairline)` (8% black / 6% white) |
| `.hairline-t/b/l/r` | Directional hairline variants |
| `.pull-quote` | Editorial blockquote with hanging curly quote |
| `.pull-quote-attr` | Attribution line below a pull-quote |
| `.amber-grad` | Amber CTA gradient button surface |
| `.amber-halo` | Amber focus ring / icon halo |
| `.thin-scroll` | Quiet scrollbar, amber on hover |
| `.pm-fade-in` | 0.28s fade-in + slide-up entrance |
| `.pm-slide-up` | 0.32s slide-up entrance |
| `.pm-pop-in` | 0.22s spring pop-in entrance |
| `.pm-shimmer-text` | Animated amber shimmer over text |
| `.hover-lift` | Subtle translateY(-1px) on hover |

### Custom Tailwind colors

`bg-amber` / `text-amber` (#D97706), `bg-graphite` (#111111), `bg-ivory` (#F3F2F1), `text-silver` (#8A8A8A), `bg-void` (#000000).

### CSS custom properties

`var(--hairline)` — on-brand divider color (light/dark-aware). `var(--type-body)` (14px), `var(--type-ui)` (12.5px), `var(--type-meta)` (11px). Full scale: `--type-display` through `--type-eyebrow`.

Dark-mode: add class `dark` on any ancestor; token values flip automatically.

## Where the truth lives

Component docs: `components/<group>/<Name>/<Name>.prompt.md`  
Stylesheet: `styles.css` (imports `_ds_bundle.css` which has all custom classes + design tokens)

## Idiomatic example

```jsx
// CitationChip — minimal amber badge with popover
<CitationChip
  index={1}
  source={{ id: "kb-1", kind: "kb", title: "Product brief", snippet: "The core value prop..." }}
/>

// Glass surface card
<div className="glass-pane rounded-xl p-4 space-y-2">
  <p className="editorial-eyebrow">Research insight</p>
  <h2 className="editorial-h2">User pain point</h2>
  <p className="text-sm text-silver">Details about the finding…</p>
</div>
```
