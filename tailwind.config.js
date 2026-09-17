/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F7F4EE',
        'paper-dim': '#EFEBE2',
        ink: '#2B2A28',
        muted: '#8A8478',
        border: '#E4DECE',
        accent: '#3F6E64',
        'accent-soft': '#E4EEEC',
        pin: '#C98A3D',
        sidebar: '#EDEAE2',
        danger: '#B4553F',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
