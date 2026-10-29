/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mood-offwhite': '#F7F7F0',
        'mood-forest': '#174D3A',
        'mood-lime': '#B7D957',
        'mood-cobalt': '#3158C9',
        'mood-mustard': '#E8BD45',
        'mood-black': '#20251F',
      }
    },
  },
  plugins: [],
}
