import { supabase, isSupabaseConfigured } from './supabase';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Get the GitHub token from either the Supabase session or localStorage.
 * Supabase only provides provider_token on the initial OAuth callback;
 * after a page refresh it's gone. We persist it in localStorage so
 * GitHub API calls keep working across reloads.
 */
async function getGitHubToken() {
  if (isSupabaseConfigured()) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.provider_token) {
      // Fresh token from Supabase — persist it
      localStorage.setItem('makerPortfolio_githubToken', session.provider_token);
      return session.provider_token;
    }
  }
  // Fall back to persisted token
  return localStorage.getItem('makerPortfolio_githubToken');
}

/**
 * Start the GitHub OAuth flow.
 * If Supabase is configured, use Supabase's OAuth provider.
 * Otherwise, use direct GitHub OAuth redirect flow.
 */
export async function signInWithGitHub() {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: 'repo',
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
    return data;
  }

  // Direct GitHub OAuth flow
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
  if (!clientId) {
    throw new Error('VITE_GITHUB_CLIENT_ID is not set');
  }

  // Save current location so we can restore after redirect
  sessionStorage.setItem('makerPortfolio_githubRedirect', 'true');

  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'repo',
    redirect_uri: window.location.origin,
    state: 'github_oauth'
  });

  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * Handle GitHub OAuth redirect callback.
 * Called on page load to check for ?code= from GitHub.
 * Exchanges the code for an access token via our proxy.
 */
export async function handleGitHubOAuthRedirect() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code || state !== 'github_oauth') return false;
  if (!sessionStorage.getItem('makerPortfolio_githubRedirect')) return false;

  // Clean up URL and flag
  sessionStorage.removeItem('makerPortfolio_githubRedirect');
  window.history.replaceState(null, '', window.location.pathname);

  // Exchange code for token via our proxy (dev server or production worker)
  const proxyUrl = import.meta.env.VITE_GITHUB_PROXY_URL || '/api/github/token';

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed (${response.status})`);
  }

  const data = await response.json();

  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || 'GitHub OAuth failed');
  }

  localStorage.setItem('makerPortfolio_githubToken', data.access_token);
  return true;
}

/**
 * Fetch repos using OAuth token (includes private repos)
 */
export async function fetchAuthenticatedRepos() {
  const token = await getGitHubToken();
  if (!token) return null;

  const response = await fetch(
    `${GITHUB_API_BASE}/user/repos?per_page=100&sort=pushed&type=all`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      // Token expired — clear it
      localStorage.removeItem('makerPortfolio_githubToken');
      return null;
    }
    if (response.status === 403) {
      throw new Error('GitHub API rate limit exceeded. Try again later.');
    }
    throw new Error('Failed to fetch repositories');
  }

  return response.json();
}

/**
 * Check if user has GitHub connected
 */
export async function getGitHubConnection() {
  const token = await getGitHubToken();
  return token ? { connected: true } : null;
}

/**
 * Fetch public repositories for a GitHub user
 */
export async function fetchUserRepos(username) {
  const response = await fetch(
    `${GITHUB_API_BASE}/users/${username}/repos?per_page=100&sort=updated`,
    {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
      }
    }
  );

  if (!response.ok) {
    if (response.status === 404) throw new Error('GitHub user not found');
    if (response.status === 403) throw new Error('Rate limit exceeded. Try again later.');
    throw new Error('Failed to fetch repositories');
  }

  return response.json();
}

/**
 * Infer project stage from GitHub repo metrics
 */
function inferStage(repo) {
  const stars = repo.stargazers_count;
  const hasHomepage = !!repo.homepage;

  if (repo.archived) {
    return stars >= 100 ? 'users' : 'launch';
  }
  if (stars >= 500) return 'users';
  if (stars >= 100) return 'believers';
  if (stars >= 10 || hasHomepage) return 'launch';
  if (stars >= 1) return 'mvp';
  return 'idea';
}

/**
 * Convert a GitHub repo to a project object
 */
export function mapRepoToProject(repo) {
  const domains = [...(repo.topics || [])];
  if (repo.language && !domains.includes(repo.language.toLowerCase())) {
    domains.push(repo.language.toLowerCase());
  }

  const links = [repo.html_url];
  if (repo.homepage) links.push(repo.homepage);

  return {
    name: repo.name,
    oneLiner: repo.description || `A ${repo.language || 'code'} project`,
    role: 'solo',
    currentStage: inferStage(repo),
    startDate: repo.created_at ? repo.created_at.slice(0, 7) : '',
    ongoing: !repo.archived,
    domains,
    links,
    githubUrl: repo.html_url, // Canonical GitHub URL for dedup
    outcome: '',
    // Metadata for display in selection UI (not saved to DB)
    _github: {
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      language: repo.language,
      isFork: repo.fork,
      isArchived: repo.archived,
      pushedAt: repo.pushed_at
    }
  };
}
