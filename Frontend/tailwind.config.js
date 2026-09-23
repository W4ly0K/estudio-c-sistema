/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Colores Oficiales CESMAG
        "cesmag-azul-1": "#1F5BA3",
        "cesmag-azul-2": "#2C3967",
        "cesmag-rojo-1": "#BA1828",
        "cesmag-rojo-2": "#E00F38",
        "cesmag-blanco": "#FFFFFF",
        
        // Mapeo semántico para tu interfaz
        "primary": "#2C3967", 
        "primary-hover": "#1F5BA3",
        "accent": "#E00F38", 
        "accent-hover": "#BA1828",
        
        // Fondos
        "background": "#f4f7f6",
        "surface": "#ffffff",
        "outline": "#c6c6cd",
      },
      fontFamily: {
        "sans": ["Roboto", "sans-serif"],
      }
    },
  },
  plugins: [],
}