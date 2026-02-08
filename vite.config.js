import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use '/' for Vercel, '/maker/' for GitHub Pages
  base: process.env.VERCEL ? '/' : '/maker/',
})
