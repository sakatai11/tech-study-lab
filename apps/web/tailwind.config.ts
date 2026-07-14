import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        well: 'var(--well)',
        border: 'var(--border)',
        'border-hi': 'var(--border-hi)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        mute: 'var(--mute)',
        faint: 'var(--faint)',
        green: 'var(--green)',
        red: 'var(--red)',
        blue: 'var(--blue)',
        purple: 'var(--purple)',
        yellow: 'var(--yellow)',
        orange: 'var(--orange)',
        'green-bg': 'var(--green-bg)',
        'red-bg': 'var(--red-bg)',
        'blue-bg': 'var(--blue-bg)',
        'purple-bg': 'var(--purple-bg)',
        'yellow-bg': 'var(--yellow-bg)',
        'orange-bg': 'var(--orange-bg)',
        'heat-0': 'var(--heat-0)',
        'heat-1': 'var(--heat-1)',
        'heat-2': 'var(--heat-2)',
        'heat-3': 'var(--heat-3)',
        'heat-4': 'var(--heat-4)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
}

export default config
