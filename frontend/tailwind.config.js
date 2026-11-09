const teal = {
  50: '#E6F4F3', 100: '#C3EAE6', 200: '#9ADFD8', 300: '#65CCBD', 400: '#13AF9A',
  500: '#0A9B8A', 600: '#007C7B', 700: '#006765', 800: '#005452', 900: '#003F3E', 950: '#002E2D',
}

const aqua = {
  50: '#E5F8F7', 100: '#C3EAE6', 200: '#8BDDD9', 300: '#53CCC9', 400: '#0AB2B8',
  500: '#079CA4', 600: '#087F87', 700: '#09676E', 800: '#07545A', 900: '#06434A', 950: '#033238',
}

const green = {
  50: '#E9F6EF', 100: '#C7EBD6', 200: '#9DDBB8', 300: '#70C895', 400: '#42AE78',
  500: '#369B68', 600: '#2D875B', 700: '#26714D', 800: '#205B40', 900: '#194A35', 950: '#103526',
}

const orange = {
  50: '#FFF1E5', 100: '#FCE0C8', 200: '#F6C596', 300: '#EFAB65', 400: '#E99740',
  500: '#E5832B', 600: '#C96B1C', 700: '#A95617', 800: '#874514', 900: '#6E3913', 950: '#4A240B',
}

const yellow = {
  50: '#FAF9E2', 100: '#F1F4BD', 200: '#E4E99A', 300: '#CCD92B', 400: '#C0B22B',
  500: '#A89B20', 600: '#8A7F1A', 700: '#706718', 800: '#5A5417', 900: '#4B4617', 950: '#302C0D',
}

const neutral = {
  50: '#FAFAF5', 100: '#F1F4BD', 200: '#BFBFBF', 300: '#A7A7A4', 400: '#8B8A86',
  500: '#777672', 600: '#686765', 700: '#514F4E', 800: '#3A3736', 900: '#2D2928', 950: '#1C1918',
}

const red = {
  50: '#FCEAEA', 100: '#F6C8C8', 200: '#EE9696', 300: '#E46666', 400: '#D93636',
  500: '#C00000', 600: '#A70000', 700: '#890000', 800: '#700000', 900: '#5B0000', 950: '#390000',
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        blue: teal,
        violet: teal,
        teal,
        indigo: aqua,
        sky: aqua,
        emerald: green,
        amber: orange,
        orange,
        yellow,
        red,
        rose: red,
        gray: neutral,
        slate: neutral,
      },
    },
  },
  plugins: [],
}
