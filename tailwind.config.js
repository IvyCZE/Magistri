/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans Variable"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Outfit Variable"', '"Plus Jakarta Sans Variable"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'm3-xs': '4px',
        'm3-sm': '8px',
        'm3-md': '12px',
        'm3-lg': '16px',
        'm3-xl': '24px',
        'm3-2xl': '28px',
        'm3-3xl': '36px',
        'm3-full': '9999px',
      },
      colors: {
        m3: {
          primary: 'var(--m3-primary)',
          'on-primary': 'var(--m3-on-primary)',
          'primary-container': 'var(--m3-primary-container)',
          'on-primary-container': 'var(--m3-on-primary-container)',
          
          secondary: 'var(--m3-secondary)',
          'on-secondary': 'var(--m3-on-secondary)',
          'secondary-container': 'var(--m3-secondary-container)',
          'on-secondary-container': 'var(--m3-on-secondary-container)',
          
          tertiary: 'var(--m3-tertiary)',
          'on-tertiary': 'var(--m3-on-tertiary)',
          'tertiary-container': 'var(--m3-tertiary-container)',
          'on-tertiary-container': 'var(--m3-on-tertiary-container)',
          
          error: 'var(--m3-error)',
          'on-error': 'var(--m3-on-error)',
          'error-container': 'var(--m3-error-container)',
          'on-error-container': 'var(--m3-on-error-container)',
          
          surface: 'var(--m3-surface)',
          'on-surface': 'var(--m3-on-surface)',
          'on-surface-variant': 'var(--m3-on-surface-variant)',
          
          outline: 'var(--m3-outline)',
          'outline-variant': 'var(--m3-outline-variant)',
          
          'surface-dim': 'var(--m3-surface-dim)',
          'surface-bright': 'var(--m3-surface-bright)',
          'surface-container-lowest': 'var(--m3-surface-container-lowest)',
          'surface-container-low': 'var(--m3-surface-container-low)',
          'surface-container': 'var(--m3-surface-container)',
          'surface-container-high': 'var(--m3-surface-container-high)',
          'surface-container-highest': 'var(--m3-surface-container-highest)',
        },
      },
      boxShadow: {
        'm3-1': '0 1px 3px 1px rgba(0, 0, 0, 0.08), 0 1px 2px 0 rgba(0, 0, 0, 0.04)',
        'm3-2': '0 2px 6px 2px rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'm3-3': '0 4px 8px 3px rgba(0, 0, 0, 0.12), 0 1px 3px 0 rgba(0, 0, 0, 0.06)',
        'm3-4': '0 6px 10px 4px rgba(0, 0, 0, 0.14), 0 2px 3px 0 rgba(0, 0, 0, 0.08)',
        'm3-glow': '0 0 24px -4px var(--m3-primary-glow)',
      },
    },
  },
  plugins: [],
}
