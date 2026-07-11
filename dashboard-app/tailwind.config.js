/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)', 'ink-soft': 'var(--ink-soft)', 'ink-faint': 'var(--ink-faint)',
        porcelain: 'var(--porcelain)', surface: 'var(--surface)', 'surface-2': 'var(--surface-2)',
        accent: 'var(--accent)', 'accent-deep': 'var(--accent-deep)', 'accent-lite': 'var(--accent-lite)',
        warn: 'var(--warn)', hairline: 'var(--hairline)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      borderRadius: { glass: '20px' },
    },
  },
  plugins: [],
};
