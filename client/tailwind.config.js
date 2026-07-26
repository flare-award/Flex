/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Discord-like palette
        flex: {
          bg: '#313338',
          sidebar: '#2b2d31',
          server: '#1e1f22',
          channel: '#313338',
          hover: '#35373c',
          active: '#404249',
          text: '#dbdee1',
          muted: '#949ba4',
          accent: '#5865f2',
          green: '#23a55a',
          yellow: '#f0b232',
          red: '#f23f43',
          mention: '#f23f4333',
        },
      },
      fontFamily: {
        sans: ['gg sans', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-soft': 'pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};
