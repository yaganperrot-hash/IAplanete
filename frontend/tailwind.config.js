/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'planet': {
          900: '#0a0f1a',
          800: '#0f1729',
          700: '#1a2540',
          600: '#243358',
        },
      },
    },
  },
  plugins: [],
};
