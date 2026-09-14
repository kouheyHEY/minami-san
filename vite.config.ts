import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/minami-san/',
  plugins: [react()],
  server: {
    port: 4175,
  },
})
