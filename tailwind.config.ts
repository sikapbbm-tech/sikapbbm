import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#0f7a3d', dark: '#0a5a2d', light: '#e7f4ec' },
        merah: { DEFAULT: '#c8102e' },
      },
    },
  },
  plugins: [],
}
export default config
