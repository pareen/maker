import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use '/maker/' only for GitHub Pages production build
  base: process.env.GITHUB_PAGES ? '/maker/' : '/',
})
