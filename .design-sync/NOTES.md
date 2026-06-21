# PM Cursor design-sync notes

## Repo quirks

- **App, not a library**: cursor-for-pms is a Next.js app, not an npm-published component library. There is no `dist/` — we use a hand-authored entry at `cursor-for-pms/dist-ds/index.ts` that exports only the browser-bundleable components. The `entry` config key is cwd-relative; `cssEntry` and `tsconfig` are PKG_DIR-relative (relative to `cursor-for-pms/`).

- **No `.d.ts`**: TypeScript compiler runs with `noEmit: true`. Component discovery depends entirely on `cfg.componentSrcMap` (positive entries). Without these entries the converter would discover 0 components (since there's no .d.ts and the entry exists so synthesis doesn't kick in).

- **Fonts**: Inter, Playfair Display, JetBrains Mono are loaded via `next/font/google` at runtime. They're suppressed with `runtimeFontPrefixes` — no `@font-face` to ship. Previews render with system fonts; fully styled fonts only work when running inside the Next.js app.

- **`--font-inter/playfair/jetbrains` tokens**: CSS custom props set by Next.js's HTML injection (as class variables on `<html>`). They're absent from static previews — expected, non-blocking.

## Excluded components (and why)

| Component | Reason |
|---|---|
| Editor | Requires Tiptap editor setup and complex state |
| Sidebar | Requires Next.js routing + data fetching |
| ProductBrain | Requires Zustand store |
| CursorChat | Complex AI agent chat, many runtime deps |
| LandingPage | Full marketing page |
| KnowledgeBase | Requires API/data fetching |
| KnowledgeBaseInline | Same |
| AICommandModal | Requires Tiptap editor context |
| GlobalSearch | Requires data fetching |
| IntegrationSettings | Requires @clerk/nextjs auth |
| EditorToolbar | Uses @tiptap/react — bundle too large |
| DiagramCard | Uses dynamic import of mermaid — bundle too large |
| ArtifactCard | Imports next/navigation |
| TodaySchedule | Imports @clerk/nextjs |

## CSS build

Run from repo root: `cd cursor-for-pms && npx tailwindcss -i ./src/app/globals.css -o ./dist-ds/styles.css --config ./tailwind.config.ts`

Tailwind scans `src/pages/**`, `src/components/**`, `src/app/**` for class names. If new components are added, the CSS will pick up new classes automatically on rebuild.

## Re-sync risks

- **New components**: Add to `cursor-for-pms/dist-ds/index.ts` (the manual barrel entry), add to `cfg.componentSrcMap`, then rebuild. Skip if the component imports from `next/*`, `@clerk/nextjs`, or heavy libs (mermaid, tiptap).
- **`dist-ds/index.ts` can drift**: If new components are added to `src/components/` that ARE browser-safe, they won't appear automatically — requires manual entry in both the barrel file and componentSrcMap.
- **Render check was skipped**: No playwright installed. Previews are floor cards (never visually verified). Install playwright for machine verification.
- **Build assumed Node 24.11 on Windows** — uses Git Bash (`Bash` tool) for POSIX-style commands.
