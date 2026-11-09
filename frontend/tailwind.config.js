/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          teal: '#22B8B0',
          cyan: '#54C9EF',
        },
        status: {
          healthy: '#22B8A0',
          warning: '#F2C94C',
          critical: '#EF7777',
          info: '#54C9EF',
        },
        theme: {
          page: 'var(--bg-page)',
          sidebar: 'var(--bg-sidebar)',
          card: 'var(--bg-card)',
          'card-hover': 'var(--bg-card-hover)',
          'card-solid': 'var(--bg-card-solid)',
          input: 'var(--bg-input)',
          glass: 'var(--border-glass)',
          'glass-strong': 'var(--border-glass-strong)',
          main: 'var(--text-main)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
        }
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'glow-teal': 'var(--shadow-glow-teal)',
        'glow-cyan': 'var(--shadow-glow-cyan)',
      }
    },
  },
  plugins: [],
};

