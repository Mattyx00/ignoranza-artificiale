import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-bricolage)', 'sans-serif'],
        body: ['var(--font-dm-sans)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
        serif: ['var(--font-playfair)', 'serif'],
      },
      colors: {
        background: '#09090b',
        surface: '#18181b',
        border: '#27272a',
        'text-primary': '#fafafa',
        'text-muted': '#71717a',
        'accent-system': '#dc2626',
        'accent-system-subtle': '#450a0a',
      },
    },
  },
  plugins: [],
}

export default config
