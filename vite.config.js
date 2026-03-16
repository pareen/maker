import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite plugin: dev-only API endpoint for GitHub OAuth token exchange.
// GitHub's token endpoint doesn't support CORS, so the browser can't call
// it directly. In production, use a Cloudflare Worker or similar proxy
// and set VITE_GITHUB_PROXY_URL.
function githubOAuthProxy() {
  return {
    name: 'github-oauth-proxy',
    configureServer(server) {
      server.middlewares.use('/api/github/token', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        let body = ''
        for await (const chunk of req) body += chunk
        const { code } = JSON.parse(body)

        if (!code) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'Missing code' }))
          return
        }

        try {
          const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify({
              client_id: process.env.VITE_GITHUB_CLIENT_ID,
              client_secret: process.env.GITHUB_CLIENT_SECRET,
              code
            })
          })

          const data = await response.json()
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: err.message }))
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), githubOAuthProxy()],
  // Use '/maker/' only for GitHub Pages production build
  base: process.env.GITHUB_PAGES ? '/maker/' : '/',
})
