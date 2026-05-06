# Design System: PM Cursor (Glassmorphism Luxe)

## 1. Visual Theme & Atmosphere
The atmosphere is **"Neo-Brutalist Elegance"** crossed with **"Glassmorphism Luxe."** We have abandoned all flat colors and default tailwind utility aesthetic. Instead, the design relies on physical depth, light emission, and premium materials. It feels like interacting with a piece of high-end hardware sitting on an architect's desk in a dark studio.

## 2. Color Palette & Roles
* **Obsidian Mesh** (`#050505` base) - The primary background isn't a flat color. It's a deep mesh gradient woven with faint `#D97706` (Amber) and `#FFFFFF` radial spotlights to give the screen physical dimension.
* **Dark Glass** (`bg-black/40` or `bg-black/20` with `backdrop-blur-3xl`) - Used for all panels. Nothing is opaque. Everything is layered.
* **Ivory** (`#F3F2F1`) - Primary text. Not harsh pure white, but a slightly softer, elegant tone for readability.
* **Silver Ash** (`rgba(255,255,255,0.6)`) - Secondary text.
* **Ember Gold / Amber** (`#D97706`) - The hero accent color. It functions as a light source. Active elements cast a physical drop shadow (`0 0 10px rgba(217,119,6,0.5)`).

## 3. Typography Rules
* **Font System:** Driven by premium Google Fonts, abandoning system defaults.
* **Headings & Logos:** `Playfair Display` (Serif). Used with extreme tracking (`tracking-[0.2em]`) for logos and section labels to evoke high-end editorial magazines.
* **Body:** `Inter` (Sans-serif). Clean, legible, with relaxed line heights.

## 4. Component Stylings
* **Sidebar:** Pure Obsidian. Borderless or separated only by a whisper-thin Graphite line. Minimalist typography hierarchy doing the work instead of colored backgrounds.
* **Editor:** Complete blackout. The text floats on screen. The text cursor and selection highlights are a soft, glowing Ember Gold.
* **AI Command Modal (Cmd+K):** A Graphite (`#111111`) floating panel with a very subtle Amber glow/shadow underneath (`shadow-[0_0_30px_-10px_rgba(217,119,6,0.2)]`). It feels like a physical, premium object resting on the glass. 
* **Buttons:** 
  * Primary: Solid Ember Gold (`#D97706`) with Ivory text. Sharp or very slightly rounded (`rounded-md`), avoiding bubbly pill-shapes to maintain the brutalist/elegant edge.
  * Ghost: Transparent, turning Soft Obsidian on hover.
* **Inputs/Forms:** Razor-sharp. No bulky borders—just a single bottom line that turns Amber when focused.

## 5. Layout Principles
* **Whitespace:** Extreme use of negative space. Elements should never feel cramped.
* **Structure:** Left sidebar (Navigation), Center (Editor), Right sidebar (Product Brain).
* **Alignment:** Sharp edges (`rounded-md` instead of `rounded-xl`). The lack of excessive roundness gives it a more mature, architectural feel.
