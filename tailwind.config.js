/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {50:'#f7f8fa',100:'#f1f4f6',200:'#dce2e7',300:'#bbc7cf',400:'#8a9ba7',500:'#687d8b',600:'#526876',700:'#365e78',800:'#293f4f',900:'#202b33',950:'#14202a'},
        cyan: {200:'#dce8f0',300:'#b7cddc',400:'#6e98b4',500:'#527d99',600:'#365e78',700:'#2d5169',900:'#253e4d'},
        emerald: {200:'#dce8f0',300:'#b7cddc',400:'#6e98b4',500:'#527d99',900:'#253e4d',950:'#202b33'},
        sky: {900:'#365e78'},
        marine: {
          950: '#f7f8fa',
          900: '#ffffff',
          850: '#f1f4f6',
          800: '#dce2e7',
          700: '#bbc7cf',
          600: '#8a9ba7',
        },
        cyber: {
          cyan: '#365e78',
          teal: '#527d99',
          amber: '#ffb020',
          red: '#ff1744',
          emerald: '#365e78',
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
