import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        void: "#000000",
        graphite: "#111111",
        "soft-obsidian": "#1A1A1A",
        ivory: "#F3F2F1",
        silver: "#8A8A8A",
        amber: "#D97706",
        edge: "#1A1A1A",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        serif: ["var(--font-playfair)", "serif"],
      },
      typography: (theme: any) => ({
        bespoke: {
          css: {
            '--tw-prose-body': theme('colors.ivory'),
            '--tw-prose-headings': theme('colors.ivory'),
            '--tw-prose-lead': theme('colors.silver'),
            '--tw-prose-links': theme('colors.amber'),
            '--tw-prose-bold': theme('colors.ivory'),
            '--tw-prose-counters': theme('colors.silver'),
            '--tw-prose-bullets': theme('colors.amber'),
            '--tw-prose-hr': theme('colors.soft-obsidian'),
            '--tw-prose-quotes': theme('colors.ivory'),
            '--tw-prose-quote-borders': theme('colors.amber'),
            '--tw-prose-captions': theme('colors.silver'),
            '--tw-prose-code': theme('colors.amber'),
            '--tw-prose-pre-code': theme('colors.ivory'),
            '--tw-prose-pre-bg': theme('colors.graphite'),
            '--tw-prose-th-borders': theme('colors.soft-obsidian'),
            '--tw-prose-td-borders': theme('colors.soft-obsidian'),
            h1: {
              fontFamily: 'var(--font-playfair), serif',
              fontWeight: '600',
              letterSpacing: '-0.025em',
            },
            h2: {
              fontFamily: 'var(--font-playfair), serif',
              fontWeight: '600',
              letterSpacing: '-0.025em',
            },
            h3: {
              fontFamily: 'var(--font-playfair), serif',
              fontWeight: '600',
            },
            blockquote: {
              fontStyle: 'normal',
              backgroundColor: 'rgba(217, 119, 6, 0.05)',
              padding: '1rem',
              borderRadius: '0.375rem',
            },
            a: {
              textDecoration: 'none',
              borderBottom: '1px solid rgba(217, 119, 6, 0.3)',
              transition: 'border-color 0.2s ease',
              '&:hover': {
                borderBottomColor: theme('colors.amber'),
              },
            },
          },
        },
      }),
    },
  },
  plugins: [require("@tailwindcss/typography")],
};

export default config;
