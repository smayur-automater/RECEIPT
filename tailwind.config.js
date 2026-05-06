/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-syne)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        brand: {
          50: '#e8f5ee',
          100: '#c6e6d4',
          400: '#3d9e6e',
          600: '#1a6b3f',
          700: '#155c35',
          800: '#0f4427',
        },
      },
    },
  },
  plugins: [],
}
