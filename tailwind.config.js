/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        marine: {
          950: '#050b14',
          900: '#0a1220',
          850: '#0e1a2d',
          800: '#14233c',
          700: '#1e355b',
          600: '#2b4c80',
        },
        cyber: {
          cyan: '#00f0ff',
          teal: '#00d4aa',
          amber: '#ffb020',
          red: '#ff1744',
          emerald: '#00e676',
          purple: '#b388ff',
        }
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'Consolas', 'Menlo', 'monospace'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash-critical': 'flash 0.6s infinite alternate',
        'radar-sweep': 'spin 4s linear infinite',
      },
      keyframes: {
        flash: {
          '0%': { opacity: '1', boxShadow: '0 0 20px rgba(255, 23, 68, 0.8)' },
          '100%': { opacity: '0.3', boxShadow: '0 0 5px rgba(255, 23, 68, 0.2)' },
        }
      }
    },
  },
  plugins: [],
}
