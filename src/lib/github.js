import { supabase, isSupabaseConfigured } from './supabase';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Sign in with GitHub OAuth via Supabase
 */
export async function signInWithGitHub() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

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

/**
 * Fetch repos using OAuth token (includes private repos)
 */
export async function fetchAuthenticatedRepos() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.provider_token) {
    return null; // Not connected to GitHub
  }

  const response = await fetch(
    `${GITHUB_API_BASE}/user/repos?per_page=100&sort=pushed&type=all`,
    {
      headers: {
        'Authorization': `Bearer ${session.provider_token}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch repositories');
  }

  return response.json();
}

/**
 * Check if user has GitHub connected
 */
export async function getGitHubConnection() {
  if (!isSupabaseConfigured()) return null;

  const { data: { session } } = await supabase.auth.getSession();
  return session?.provider_token ? {
    connected: true,
    token: session.provider_token
  } : null;
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
    startDate: repo.created_at.split('T')[0],
    ongoing: !repo.archived,
    domains,
    links,
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
