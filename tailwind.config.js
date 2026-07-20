/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        studio: {
          bg: '#080B11',
          card: 'rgba(22, 28, 45, 0.4)',
          border: 'rgba(255, 255, 255, 0.08)',
          borderHover: 'rgba(255, 255, 255, 0.15)',
          textMuted: '#94A3B8',
          textActive: '#F8FAFC',
          glowBlue: '#3B82F6',
          glowCyan: '#06B6D4',
          glowGreen: '#10B981',
          glowRed: '#EF4444',
          glowPurple: '#8B5CF6',
        }
      },
      backdropBlur: {
        studio: '16px',
      },
      boxShadow: {
        studio: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        glow: '0 0 15px rgba(59, 130, 246, 0.5)',
      }
    },
  },
  plugins: [],
}
