import React, { useState, useEffect, useRef } from 'react';
import * as db from './lib/database';
const { setAuthMode } = db;
import { fetchUserRepos, mapRepoToProject, signInWithGitHub, fetchAuthenticatedRepos, getGitHubConnection, handleGitHubOAuthRedirect } from './lib/github';
import { isSupabaseConfigured } from './lib/supabase';
import { formatCurrency, formatNumber, parseCurrencyInput, parseNumberInput, formatCentsPreview, formatNumberPreview } from './lib/format';
import { track, identify, resetAnalytics } from './lib/analytics';

const ensureUrl = (url) => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^(javascript|data|vbscript):/i.test(url)) return '';
  if (url.includes('.')) return `https://${url}`;
  return url;
};

const safeImageUrl = (url) => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return '';
};

// ============================================
// MAKER PORTFOLIO - Full Functional App
// ============================================

// Design tokens — single source of truth for visual system
const t = Object.freeze({
  // Colors: Tailwind Stone scale + semantic accents
  bg: '#0c0a09',           // stone-950
  surface: '#1c1917',      // stone-900
  text: '#e7e5e4',         // stone-200
  textSecondary: '#a8a29e', // stone-400
  textTertiary: '#78716c',  // stone-500
  textFaint: '#57534e',     // stone-600
  textDim: '#44403c',       // stone-700
  textMuted: '#d6d3d1',     // stone-300
  accent: '#fbbf24',        // amber-400
  accentHover: '#f59e0b',   // amber-500
  accentActive: '#d97706',  // amber-600
  success: '#4ade80',       // green-400
  error: '#ef4444',         // red-500
  errorBg: '#7f1d1d',       // red-900
  errorText: '#fca5a5',     // red-300
  successBg: '#166534',     // green-900
  pink: '#f472b6',
  purple: '#a78bfa',
  cyan: '#22d3ee',
  orange: '#fb923c',
  white: '#fff',
  // Typography
  fontHeading: "'Newsreader', Georgia, serif",
  fontBody: "'IBM Plex Mono', monospace",
  // Border radius
  radiusSm: '8px',
  radiusMd: '12px',
  radiusLg: '16px',
  radiusXl: '20px',
  // Common surfaces
  surfaceBorder: 'rgba(255,255,255,0.06)',
  surfaceBorderLight: 'rgba(255,255,255,0.08)',
  surfaceBorderHover: 'rgba(255,255,255,0.15)',
  surfaceBg: 'rgba(255,255,255,0.03)',
  surfaceBgHover: 'rgba(255,255,255,0.05)',
  // Accent surfaces
  accentBorder: 'rgba(251,191,36,0.2)',
  accentBg: 'rgba(251,191,36,0.1)',
  accentBgSubtle: 'rgba(251,191,36,0.05)',
  successBorder: 'rgba(74,222,128,0.2)',
  successBgSubtle: 'rgba(74,222,128,0.1)',
});

// Define stages and roles FIRST (used by multiple components)
const stages = [
  { key: 'idea', label: 'Idea', color: t.textFaint },
  { key: 'mvp', label: 'MVP', color: t.textTertiary },
  { key: 'launch', label: 'Launch', color: t.textSecondary },
  { key: 'believers', label: 'Believers', color: t.accent },
  { key: 'users', label: 'Users', color: t.orange },
  { key: 'paying', label: 'Paying', color: t.pink },
  { key: 'funded', label: 'Funded', color: t.purple },
  { key: 'revenue', label: 'Revenue', color: t.success },
  { key: 'acquired', label: 'Acquired', color: t.cyan },
  { key: 'ipo', label: 'IPO', color: t.white },
];

const roles = [
  { key: 'solo', label: 'Solo', color: t.accent },
  { key: 'cofounder', label: 'Co-founder', color: t.pink },
  { key: 'early_team', label: 'Early team', color: t.purple },
  { key: 'contributor', label: 'Contributor', color: t.cyan },
];

// Parse the URL path to determine initial view
function getInitialRoute() {
  const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
  if (path === 'login') return { view: 'login' };
  if (path === 'signup') return { view: 'signup' };
  if (path === 'admin') return { view: 'admin' };
  if (path === 'makers') return { view: 'makers' };
  if (path === 'hire') return { view: 'hire' };
  if (path === 'recruiters') return { view: 'recruiters' };
  if (path === 'memo') return { view: 'memo' };
  if (path === 'cracked-squad') return { view: 'crackedSquad' };
  if (path && path !== '' && !path.includes('/')) return { view: 'publicProfile', username: path };
  return { view: null }; // null = determine after auth check
}

const App = () => {
  const initialRoute = useRef(getInitialRoute());
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState('landing'); // landing, login, signup, dashboard, profile, publicProfile
  const [authLoading, setAuthLoading] = useState(true);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [notification, setNotification] = useState(null);

  // Track whether the current user was authenticated via Supabase or localStorage.
  // This prevents Supabase's onAuthStateChange(SIGNED_OUT) from kicking out
  // users who authenticated via Google OAuth (localStorage-only).
  const authSourceRef = useRef(null); // 'supabase' | 'local' | null

  // Version counter to prevent stale async callbacks from overwriting newer state.
  // Every auth action increments this; async callbacks check it before applying state.
  const authVersionRef = useRef(0);

  // Navigate helper: updates view state and browser URL
  const navigate = (view, { username, replace = false } = {}) => {
    setCurrentView(view);
    let path = '/';
    if (view === 'publicProfile' && username) path = `/${username}`;
    else if (view === 'admin') path = '/admin';
    else if (view === 'makers') path = '/makers';
    else if (view === 'hire') path = '/hire';
    else if (view === 'recruiters') path = '/recruiters';
    else if (view === 'memo') path = '/memo';
    else if (view === 'crackedSquad') path = '/cracked-squad';
    else if (view === 'login') path = '/login';
    else if (view === 'signup') path = '/signup';
    const method = replace ? 'replaceState' : 'pushState';
    window.history[method](null, '', path);
  };

  // Shared helper: load full user data (profile + projects) and set state
  const loadFullUser = async (user, version) => {
    const source = user.aud ? 'supabase' : 'local';
    authSourceRef.current = source;
    setAuthMode(source);
    const profile = source === 'supabase' ? await db.getProfile(user.id) : null;
    const projects = await db.getProjectsByUserId(user.id);
    if (authVersionRef.current !== version) return null; // stale
    const fullUser = { ...user, ...profile, projects };
    setCurrentUser(fullUser);
    return fullUser;
  };

  // Decide which view to show based on URL route after auth is known
  const resolveRoute = (user) => {
    const route = initialRoute.current;
    if (route.view === 'publicProfile' && route.username) {
      if (user?.username === route.username) {
        setCurrentView('profile');
      } else {
        // Load the public profile — viewPublicProfile handles its own loading state
        viewPublicProfile(route.username);
      }
    } else if (route.view === 'makers') {
      setCurrentView('makers');
    } else if (route.view === 'hire') {
      setCurrentView('hire');
    } else if (route.view === 'recruiters') {
      setCurrentView('recruiters');
    } else if (route.view === 'memo') {
      setCurrentView('memo');
    } else if (route.view === 'crackedSquad') {
      setCurrentView('crackedSquad');
    } else if (route.view === 'admin') {
      if (user && db.isAdmin(user.id)) {
        setCurrentView('admin');
      } else {
        setCurrentView(user ? 'dashboard' : 'landing');
      }
    } else if (!user) {
      if (route.view === 'login') setCurrentView('login');
      else if (route.view === 'signup') setCurrentView('signup');
      // else stays on 'landing' (default)
    } else {
      setCurrentView('dashboard');
    }
  };

  // Load user on mount and listen for auth changes
  useEffect(() => {
    let initialLoadDone = false;

    const loadUser = async () => {
      const version = ++authVersionRef.current;
      try {
        // Check for GitHub OAuth redirect (repo import, not login)
        await handleGitHubOAuthRedirect();

        const user = await db.getCurrentUser();
        if (authVersionRef.current !== version) return; // stale

        if (user) {
          const fullUser = await loadFullUser(user, version);
          if (!fullUser) return; // stale
          resolveRoute(fullUser);
        } else {
          resolveRoute(null);
        }
      } catch (error) {
        console.error('Error loading user:', error);
        if (authVersionRef.current === version) {
          showNotification('Login failed: ' + error.message, 'error');
        }
      } finally {
        initialLoadDone = true;
        setAuthLoading(false);
      }
    };

    loadUser();

    // Listen for Supabase auth state changes (login/logout from other tabs, OAuth redirects)
    const { data: { subscription } } = db.onAuthStateChange(async (event, session) => {
      // Persist GitHub provider_token when available
      if (session?.provider_token) {
        localStorage.setItem('makerPortfolio_githubToken', session.provider_token);
      }

      if (event === 'SIGNED_IN' && session?.user) {
        // Skip if loadUser hasn't finished yet — it will handle the session
        if (!initialLoadDone) return;
        // Skip if user already loaded (e.g. onSuccess already called loadFullUser)
        if (authSourceRef.current === 'supabase') return;

        const version = ++authVersionRef.current;
        authSourceRef.current = 'supabase';
        setAuthMode('supabase');
        try {
          await db.migrateLocalStorageData(session.user);
          const fullUser = await loadFullUser(session.user, version);
          if (!fullUser) return; // stale
          identify(fullUser.id, { username: fullUser.username, email: session.user.email });
          track('signed_in', { method: 'supabase' });
          setCurrentView('dashboard');
        } catch (err) {
          console.error('Failed to load user data on sign-in:', err);
          if (authVersionRef.current !== version) return;
          setCurrentUser(session.user);
          setCurrentView('dashboard');
        }
      } else if (event === 'SIGNED_OUT') {
        if (authSourceRef.current === 'supabase') {
          authVersionRef.current++;
          authSourceRef.current = null;
          setAuthMode(null);
          localStorage.removeItem('makerPortfolio_githubToken');
          setCurrentUser(null);
          resetAnalytics();
          navigate('landing');
        }
      }
    });

    return () => subscription?.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), type === 'error' ? 6000 : 3000);
  };

  const handleLogout = async () => {
    try {
      await db.signOut();
      localStorage.removeItem('makerPortfolio_githubToken');
      authSourceRef.current = null;
      setAuthMode(null);
      setCurrentUser(null);
      navigate('landing');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const [profileLoading, setProfileLoading] = useState(false);

  const viewPublicProfile = async (username) => {
    setProfileLoading(true);
    setCurrentView('publicProfile');
    window.history.pushState(null, '', `/${username}`);
    try {
      const user = await db.getProfileByUsername(username);
      if (user) {
        setViewingProfile(user);
      } else {
        showNotification('Profile not found', 'error');
        // Use authSourceRef (not currentUser state) — state may be stale in closure
        navigate(authSourceRef.current ? 'dashboard' : 'landing', { replace: true });
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      showNotification('Profile not found', 'error');
      navigate(authSourceRef.current ? 'dashboard' : 'landing', { replace: true });
    } finally {
      setProfileLoading(false);
    }
  };

  // Handle browser back/forward
  useEffect(() => {
    const handlePopState = () => {
      const route = getInitialRoute();
      if (route.view === 'publicProfile' && route.username) {
        viewPublicProfile(route.username);
      } else if (route.view === 'makers') {
        setCurrentView('makers');
      } else if (route.view === 'hire') {
        setCurrentView('hire');
      } else if (route.view === 'memo') {
        setCurrentView('memo');
      } else if (route.view === 'crackedSquad') {
        setCurrentView('crackedSquad');
      } else if (route.view === 'admin' && currentUser && db.isAdmin(currentUser.id)) {
        setCurrentView('admin');
      } else if (route.view === 'login') {
        setCurrentView('login');
      } else if (route.view === 'signup') {
        setCurrentView('signup');
      } else {
        setCurrentView(currentUser ? 'dashboard' : 'landing');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: t.bg, color: t.text, fontFamily: t.fontBody, lineHeight: 1.6 }}>
      <a href="#main-content" className="sr-only-focusable" style={{
        position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden',
        zIndex: 1001, padding: '12px 24px', background: t.accent, color: t.bg, fontWeight: 600, borderRadius: 8, fontSize: 14, textDecoration: 'none'
      }}>Skip to main content</a>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        .sr-only-focusable:focus { position: fixed; left: 16px; top: 16px; width: auto; height: auto; overflow: visible; clip: auto; white-space: normal; z-index: 1001; }
        input, textarea, button, select { font-family: inherit; }
        input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid #fbbf24; outline-offset: 2px; }
        button:focus-visible, a:focus-visible, [role="button"]:focus-visible { outline: 2px solid #fbbf24; outline-offset: 2px; }
        a { color: inherit; text-decoration: none; }

        .btn { padding: 14px 24px; border-radius: 8px; border: none; cursor: pointer; font-weight: 500; transition: background-color 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s; font-size: 14px; user-select: none; }
        .btn:active { transform: scale(0.97); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .btn:disabled:hover { box-shadow: none; }
        .btn-primary { background: #fbbf24; color: #0c0a09; }
        .btn-primary:hover { background: #f59e0b; box-shadow: 0 0 16px rgba(251,191,36,0.25); }
        .btn-primary:active { background: #d97706; }
        .btn-secondary { background: rgba(255,255,255,0.08); color: #e7e5e4; border: 1px solid rgba(255,255,255,0.15); }
        .btn-secondary:hover { background: rgba(255,255,255,0.14); border-color: rgba(255,255,255,0.25); }
        .btn-secondary:active { background: rgba(255,255,255,0.06); }
        .btn-ghost { background: transparent; color: #a8a29e; }
        .btn-ghost:hover { color: #e7e5e4; background: rgba(255,255,255,0.06); }
        .btn-ghost:active { background: rgba(255,255,255,0.03); }

        .input { width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #e7e5e4; font-size: 14px; }
        .input:focus { border-color: #fbbf24; background: rgba(255,255,255,0.08); }
        .input::placeholder { color: #57534e; }

        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }

        .tag { padding: 4px 12px; border-radius: 16px; font-size: 11px; font-weight: 500; }

        .notification { position: fixed; top: 20px; right: 20px; padding: 16px 24px; border-radius: 8px; z-index: 1000; animation: slideIn 0.2s ease; }
        .notification.success { background: #166534; color: #4ade80; }
        .notification.error { background: #7f1d1d; color: #fca5a5; }

        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; animation: fadeIn 0.15s ease; }
        .modal { background: #1c1917; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 480px; width: 90%; animation: slideIn 0.2s ease; }

        .social-btn { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: background-color 0.15s, border-color 0.15s, transform 0.15s; width: 100%; }
        .social-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }
        .social-btn:active { transform: scale(0.98); background: rgba(255,255,255,0.05); }

        .stage-dot { width: 10px; height: 10px; border-radius: 50%; transition: width 0.2s, height 0.2s; }
        .stage-dot.active { width: 14px; height: 14px; }

        .project-card { transition: background-color 0.15s, border-color 0.15s; cursor: pointer; }
        .project-card:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); }

        .ongoing-pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
        }

        @media (max-width: 768px) {
          .desktop-grid { grid-template-columns: 1fr !important; }
          .desktop-header { padding: 12px 16px !important; }
          .desktop-header .header-actions { display: none !important; }
          .desktop-header .mobile-menu-toggle { display: flex !important; }
          .desktop-content { padding-left: 16px !important; padding-right: 16px !important; }
          .hero-title { font-size: 36px !important; }
          .hero-subtitle { font-size: 16px !important; }
          .profile-name { font-size: 32px !important; }
          .share-grid { grid-template-columns: 1fr !important; }
          .section-padding { padding: 48px 16px !important; }
          .maker-directory-grid { grid-template-columns: 1fr !important; }
          .profile-container { padding: 32px 16px !important; }
          .footer-wrap { padding: 32px 16px 24px !important; }
          .footer-links { gap: 24px !important; }
          .sample-profile-card { padding: 24px !important; }
          .card-padding-mobile { padding: 20px !important; }
          .memo-article { padding: 48px 16px 40px !important; }
          .memo-title { font-size: 32px !important; }
          .hire-filter-grid { grid-template-columns: 1fr !important; }
          .hide-mobile { display: none !important; }
          .directory-container { padding: 24px 16px !important; }
        }

        @media (max-width: 480px) {
          .hero-title { font-size: 28px !important; }
          .hero-cta-group { flex-direction: column !important; align-items: stretch !important; }
          .hero-cta-group .btn { width: 100% !important; }
          .profile-name { font-size: 28px !important; }
          .desktop-header { padding: 10px 12px !important; }
        }
      `}</style>

      {notification && (
        <div className={`notification ${notification.type}`} role="alert" aria-live="polite">
          {notification.message}
        </div>
      )}

      {showShareModal && (
        <ShareModal
          username={currentUser?.username}
          todayMaking={currentUser?.todayMaking}
          onClose={() => setShowShareModal(false)}
          showNotification={showNotification}
        />
      )}

      <main id="main-content">
      {authLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div style={{ color: t.textSecondary, fontSize: '14px' }}>Loading…</div>
        </div>
      )}

      {!authLoading && currentView === 'landing' && (
        <LandingPage
          onLogin={() => navigate('login')}
          onSignup={() => navigate('signup')}
          onMakers={() => navigate('makers')}
          onHire={() => navigate('hire')}
          onMemo={() => navigate('memo')}
          onCrackedSquad={() => navigate('crackedSquad')}
        />
      )}

      {currentView === 'login' && (
        <AuthPage
          mode="login"
          onSwitch={() => navigate('signup', { replace: true })}
          onBack={() => navigate('landing')}
          onSuccess={async (user) => {
            const version = ++authVersionRef.current;
            const fullUser = await loadFullUser(user, version);
            if (fullUser) setCurrentView('dashboard');
          }}
          showNotification={showNotification}
        />
      )}

      {currentView === 'signup' && (
        <AuthPage
          mode="signup"
          onSwitch={() => navigate('login', { replace: true })}
          onBack={() => navigate('landing')}
          onSuccess={async (user) => {
            const version = ++authVersionRef.current;
            const fullUser = await loadFullUser(user, version);
            if (fullUser) setCurrentView('onboarding');
          }}
          showNotification={showNotification}
        />
      )}

      {currentView === 'dashboard' && currentUser && (
        <Dashboard
          user={currentUser}
          setUser={setCurrentUser}
          onViewProfile={() => setCurrentView('profile')}
          onLogout={handleLogout}
          onShare={() => setShowShareModal(true)}
          onAdmin={db.isAdmin(currentUser.id) ? () => navigate('admin') : null}
          onMakers={() => navigate('makers')}
          showNotification={showNotification}
          isAdmin={db.isAdmin(currentUser.id)}
        />
      )}

      {currentView === 'onboarding' && currentUser && (
        <Onboarding
          user={currentUser}
          setUser={setCurrentUser}
          onComplete={() => setCurrentView('dashboard')}
          showNotification={showNotification}
        />
      )}

      {currentView === 'profile' && currentUser && (
        <ProfileView
          user={currentUser}
          isOwner={true}
          onBack={() => setCurrentView('dashboard')}
          onEdit={() => setCurrentView('dashboard')}
          onShare={() => setShowShareModal(true)}
        />
      )}


      {currentView === 'makers' && (
        <MakerDirectory
          currentUser={currentUser}
          onViewProfile={(username) => viewPublicProfile(username)}
          onBack={() => navigate(currentUser ? 'dashboard' : 'landing')}
          onLogin={() => navigate('login')}
          onHire={() => navigate('hire')}
        />
      )}

      {currentView === 'hire' && (
        <HirePage
          currentUser={currentUser}
          onViewProfile={(username) => viewPublicProfile(username)}
          onMakers={() => navigate('makers')}
          onBack={() => navigate(currentUser ? 'dashboard' : 'landing')}
          onSignup={() => navigate('signup')}
          onRecruiters={() => navigate('recruiters')}
          showNotification={showNotification}
        />
      )}

      {currentView === 'recruiters' && (
        <RecruiterPage
          currentUser={currentUser}
          onViewProfile={(username) => viewPublicProfile(username)}
          onMakers={() => navigate('makers')}
          onBack={() => navigate(currentUser ? 'dashboard' : 'landing')}
          onSignup={() => navigate('signup')}
          onHire={() => navigate('hire')}
          showNotification={showNotification}
        />
      )}

      {currentView === 'memo' && (
        <MemoPage
          onBack={() => navigate(currentUser ? 'dashboard' : 'landing')}
          onSignup={() => navigate('signup')}
          onMakers={() => navigate('makers')}
          onCrackedSquad={() => navigate('crackedSquad')}
        />
      )}

      {currentView === 'crackedSquad' && (
        <CrackedSquadPage
          currentUser={currentUser}
          onBack={() => navigate(currentUser ? 'dashboard' : 'landing')}
          onSignup={() => navigate('signup')}
          onLogin={() => navigate('login')}
          onViewProfile={(username) => viewPublicProfile(username)}
          showNotification={showNotification}
        />
      )}

      {currentView === 'admin' && currentUser && db.isAdmin(currentUser.id) && (
        <AdminPanel
          user={currentUser}
          onBack={() => setCurrentView('dashboard')}
          showNotification={showNotification}
          onViewProfile={(username) => viewPublicProfile(username)}
        />
      )}

      {currentView === 'publicProfile' && profileLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <div style={{ color: t.textSecondary, fontSize: '14px' }}>Loading profile...</div>
        </div>
      )}

      {currentView === 'publicProfile' && !profileLoading && viewingProfile && (
        <ProfileView
          user={viewingProfile}
          isOwner={false}
          onBack={() => { setViewingProfile(null); navigate(currentUser ? 'dashboard' : 'landing'); }}
        />
      )}
      </main>
    </div>
  );
};

// ============================================
// LANDING PAGE
// ============================================
const sampleMaker = {
  name: "Priya Sharma",
  username: "priya",
  bio: "I make things that make things easier. Sometimes they work.",
  firstMake: { description: "A marble run out of cardboard tubes and tape. Spent three weeks on it.", age: "8" },
  todayMaking: "Building the onboarding flow for my new CLI tool",
  domains: ["apps", "developer tools", "communities", "hardware"],
  socials: { twitter: "https://twitter.com/priya", github: "https://github.com/priya" },
  projects: [
    { id: '1', name: "DevLog", oneLiner: "CLI tool for timestamped work journals", role: "solo", currentStage: "users", ongoing: true },
    { id: '2', name: "Mailbird", oneLiner: "Email client that only shows 5 emails at a time", role: "cofounder", currentStage: "acquired", ongoing: false },
    { id: '3', name: "APIWrapper", oneLiner: "Turn any website into an API", role: "cofounder", currentStage: "funded", ongoing: false },
    { id: '4', name: "Recipe Parser", oneLiner: "Chrome extension to clean up recipe blogs", role: "solo", currentStage: "users", ongoing: true },
    { id: '5', name: "Hardware Meetup BLR", oneLiner: "Monthly hardware hacking meetup", role: "solo", currentStage: "believers", ongoing: true },
    { id: '6', name: "Compliance Bot", oneLiner: "Slack bot for SOC2 reminders", role: "solo", currentStage: "paying", ongoing: true },
  ]
};

const builderQuotes = [
  { quote: "Learn to sell. Learn to build. If you can do both, you will be unstoppable.", author: "Naval Ravikant", role: "Entrepreneur & Angel Investor" },
  { quote: "Real artists ship.", author: "Steve Jobs", role: "Co-founder, Apple" },
  { quote: "Make something people want.", author: "Paul Graham", role: "Co-founder, Y Combinator" },
  { quote: "If you're not embarrassed by the first version of your product, you've launched too late.", author: "Reid Hoffman", role: "Co-founder, LinkedIn" },
];

const SiteFooter = () => {
  const linkStyle = { fontSize: '13px', color: t.textSecondary, textDecoration: 'none' };
  return (
    <footer className="footer-wrap" style={{ borderTop: `1px solid ${t.surfaceBorder}`, padding: '48px 40px 32px', marginTop: 'auto' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '32px' }}>
        <div>
          <a href="/" style={{ fontSize: '14px', letterSpacing: '0.15em', color: t.accent, fontWeight: '600', marginBottom: '16px', display: 'block', textDecoration: 'none' }}>MAKERLY</a>
          <p style={{ fontSize: '13px', color: t.textTertiary, maxWidth: '260px', lineHeight: 1.5 }}>
            Resumes are dead. Show what you've made.
          </p>
        </div>
        <div className="footer-links" style={{ display: 'flex', gap: '48px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, fontWeight: '500' }}>EXPLORE</span>
            <a href="/makers" style={linkStyle}>Browse Makers</a>
            <a href="/hire" style={linkStyle}>Hire Makers</a>
            <a href="/recruiters" style={linkStyle}>Post a Job</a>
            <a href="/memo" style={linkStyle}>Memo</a>
            <a href="/cracked-squad" style={{ ...linkStyle, color: t.error }}>Cracked Squad</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, fontWeight: '500' }}>ACCOUNT</span>
            <a href="/signup" style={linkStyle}>Create Profile</a>
            <a href="/login" style={linkStyle}>Log In</a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, fontWeight: '500' }}>CONNECT</span>
            <a href="https://twitter.com/Pareen" target="_blank" rel="noopener noreferrer" style={linkStyle}>Twitter</a>
            <a href="https://github.com/pareen/maker" target="_blank" rel="noopener noreferrer" style={linkStyle}>GitHub</a>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: '900px', margin: '24px auto 0', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: t.textFaint }}>Made by <a href="https://twitter.com/Pareen" target="_blank" rel="noopener noreferrer" style={{ color: t.accent, textDecoration: 'none' }}>Pareen</a></span>
        <span style={{ fontSize: '12px', color: t.textDim }}>&copy; {new Date().getFullYear()} Makerly</span>
      </div>
    </footer>
  );
};

const MobileMenuButton = ({ onClick, isOpen }) => (
  <button
    className="btn btn-ghost mobile-menu-toggle"
    onClick={onClick}
    aria-label={isOpen ? 'Close menu' : 'Open menu'}
    aria-expanded={isOpen}
    style={{ display: 'none', padding: '8px', fontSize: '20px', lineHeight: 1 }}
  >
    {isOpen ? '✕' : '☰'}
  </button>
);

const MobileDrawer = ({ isOpen, onClose, children }) => {
  React.useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener('keydown', handleKey); };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu" style={{
      position: 'fixed', inset: 0, zIndex: 99, animation: 'fadeIn 0.15s ease'
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <nav style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: '280px',
        background: t.surface, borderLeft: '1px solid rgba(255,255,255,0.08)',
        padding: '24px', display: 'flex', flexDirection: 'column', gap: '4px',
        animation: 'slideInRight 0.2s ease', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close menu" style={{ padding: '8px', fontSize: '20px', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </nav>
    </div>
  );
};

const LandingPage = ({ onLogin, onSignup, onMakers, onHire, onMemo, onCrackedSquad: _onCrackedSquad }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const sampleRoleBreakdown = roles.map(role => ({
    ...role,
    count: sampleMaker.projects.filter(p => p.role === role.key).length,
    percentage: Math.round((sampleMaker.projects.filter(p => p.role === role.key).length / sampleMaker.projects.length) * 100)
  })).filter(r => r.count > 0);

  const sampleStats = [
    { label: "Things made", value: sampleMaker.projects.length, color: t.text },
    { label: "Reached users", value: sampleMaker.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 4).length, color: t.orange },
    { label: "Reached paying", value: sampleMaker.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 5).length, color: t.pink },
    { label: "Funded", value: sampleMaker.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 6).length, color: t.purple },
    { label: "Acquisitions", value: sampleMaker.projects.filter(p => p.currentStage === 'acquired').length, color: t.cyan },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="desktop-header" style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ fontSize: '14px', letterSpacing: '0.15em', color: t.accent, fontWeight: '600' }}>MAKERLY</div>
        <nav className="header-actions" aria-label="Main navigation" style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-ghost" onClick={onMemo}>Memo</button>
          <button className="btn btn-ghost" onClick={onMakers}>Browse Makers</button>
          <button className="btn btn-ghost" onClick={onHire}>Hire</button>
          <button className="btn btn-ghost" onClick={onLogin}>Log in</button>
          <button className="btn btn-primary" onClick={onSignup}>Sign up</button>
        </nav>
        <MobileMenuButton onClick={() => setMobileMenuOpen(true)} isOpen={mobileMenuOpen} />
      </header>

      <MobileDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
        <button className="btn btn-ghost" style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => { setMobileMenuOpen(false); onMemo(); }}>Memo</button>
        <button className="btn btn-ghost" style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => { setMobileMenuOpen(false); onMakers(); }}>Browse Makers</button>
        <button className="btn btn-ghost" style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => { setMobileMenuOpen(false); onHire(); }}>Hire</button>
        <button className="btn btn-ghost" style={{ textAlign: 'left', justifyContent: 'flex-start' }} onClick={() => { setMobileMenuOpen(false); onLogin(); }}>Log in</button>
        <div style={{ marginTop: '8px' }}>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setMobileMenuOpen(false); onSignup(); }}>Sign up</button>
        </div>
      </MobileDrawer>

      {/* Hero */}
      <section className="desktop-content" style={{ padding: '100px 40px 80px', textAlign: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ fontSize: '13px', letterSpacing: '0.15em', color: t.accent, fontWeight: '500', marginBottom: '24px' }}>FOR THE ONES WHO BUILD</div>
        <h1 className="hero-title" style={{ fontSize: '60px', fontFamily: t.fontHeading, fontWeight: '500', letterSpacing: '-0.02em', maxWidth: '750px', lineHeight: 1.05, margin: '0 auto 28px' }}>
          Resumes are dead.<br />
          <span style={{ color: t.textTertiary }}>Show what you've made.</span>
        </h1>
        <p className="hero-subtitle" style={{ fontSize: '18px', color: t.textSecondary, maxWidth: '520px', lineHeight: 1.6, margin: '0 auto 48px' }}>
          In the AI era, you are what you build. The smartest people don't send resumes —
          they send their Makerly.
        </p>
        <div className="hero-cta-group" style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ padding: '16px 48px', fontSize: '16px' }} onClick={onSignup}>
            Start your maker profile
          </button>
          <button className="btn btn-ghost" style={{ padding: '16px 32px', fontSize: '16px', color: t.textTertiary }} onClick={onHire}>
            I'm hiring →
          </button>
        </div>
      </section>

      {/* The Contrast: LinkedIn vs Makerly */}
      <section className="section-padding" style={{ padding: '80px 40px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <h2 style={{ fontSize: '32px', fontFamily: t.fontHeading }}>Cool people don't send resumes.</h2>
            <p style={{ color: t.textFaint, fontSize: '14px', marginTop: '8px' }}>They send their Makerly.</p>
          </div>

          <div className="desktop-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* LinkedIn/Resume side */}
            <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusLg, padding: '32px', opacity: 0.6 }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.textFaint, marginBottom: '24px', fontWeight: '500' }}>WHAT A RESUME SHOWS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '12px 16px', background: t.surfaceBg, borderRadius: t.radiusSm }}>
                  <div style={{ fontSize: '14px', color: t.textTertiary }}>Software Engineer</div>
                  <div style={{ fontSize: '12px', color: t.textFaint }}>Some Corp · 2022 — Present</div>
                </div>
                <div style={{ padding: '12px 16px', background: t.surfaceBg, borderRadius: t.radiusSm }}>
                  <div style={{ fontSize: '14px', color: t.textTertiary }}>Junior Developer</div>
                  <div style={{ fontSize: '12px', color: t.textFaint }}>Another Inc · 2020 — 2022</div>
                </div>
                <div style={{ padding: '12px 16px', background: t.surfaceBg, borderRadius: t.radiusSm }}>
                  <div style={{ fontSize: '14px', color: t.textTertiary }}>B.Tech Computer Science</div>
                  <div style={{ fontSize: '12px', color: t.textFaint }}>Some University · 2020</div>
                </div>
                <div style={{ padding: '8px 16px', fontSize: '12px', color: t.textFaint, fontStyle: 'italic' }}>
                  Skills: JavaScript, React, Node.js, "Team Player"
                </div>
              </div>
              <div style={{ marginTop: '20px', fontSize: '13px', color: t.textFaint, textAlign: 'center', fontStyle: 'italic' }}>Where you worked. What title you held. Yawn.</div>
            </div>

            {/* Makerly side */}
            <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.05) 0%, rgba(251,191,36,0.01) 100%)', border: `1px solid ${t.accentBorder}`, borderRadius: t.radiusLg, padding: '32px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.accent, marginBottom: '24px', fontWeight: '500' }}>WHAT MAKERLY SHOWS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '12px 16px', background: t.accentBgSubtle, borderRadius: t.radiusSm, border: '1px solid rgba(251,191,36,0.1)' }}>
                  <div style={{ fontSize: '14px', color: t.text }}>6 things built — 2 ongoing</div>
                  <div style={{ fontSize: '12px', color: t.textSecondary }}>Solo, co-founder, early team</div>
                </div>
                <div style={{ padding: '12px 16px', background: t.accentBgSubtle, borderRadius: t.radiusSm, border: '1px solid rgba(251,191,36,0.1)' }}>
                  <div style={{ fontSize: '14px', color: t.text }}>Reached paying users twice</div>
                  <div style={{ fontSize: '12px', color: t.textSecondary }}>From idea → IPO, tracked at every stage</div>
                </div>
                <div style={{ padding: '12px 16px', background: t.accentBgSubtle, borderRadius: t.radiusSm, border: '1px solid rgba(251,191,36,0.1)' }}>
                  <div style={{ fontSize: '14px', color: t.text }}>First make: cardboard marble run, age 8</div>
                  <div style={{ fontSize: '12px', color: t.textSecondary }}>Where it all started</div>
                </div>
                <div style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="ongoing-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.success }} />
                  <span style={{ fontSize: '13px', color: t.success }}>Right now: building a CLI tool</span>
                </div>
              </div>
              <div style={{ marginTop: '20px', fontSize: '13px', color: t.accent, textAlign: 'center', fontWeight: '500' }}>What you built. How far it went. What's next.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Everything Counts */}
      <section className="section-padding" style={{ padding: '80px 40px', textAlign: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginBottom: '28px' }}>
            Everything counts.
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
            {[
              "A Lego set you built at age 7.",
              "A Chrome extension 3 people used.",
              "A startup that failed in 4 months.",
              "A weekend hack that accidentally went viral.",
              "A robot made from cardboard and tape.",
              "An app your friends actually use.",
            ].map((line, i) => (
              <div key={i} style={{ padding: '14px 20px', background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: '10px', fontSize: '15px', color: t.textSecondary, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ color: t.accent, fontSize: '18px' }}>+</span>
                {line}
              </div>
            ))}
          </div>
          <p style={{ color: t.textFaint, fontSize: '14px', marginTop: '28px', lineHeight: 1.6 }}>
            Most platforms only show wins. Makerly shows the whole journey.<br />
            <span style={{ color: t.textSecondary }}>Because makers aren't defined by one thing — they're defined by everything they've made.</span>
          </p>
        </div>
      </section>

      {/* Quotes */}
      <section className="section-padding" style={{ padding: '80px 40px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.accent, fontWeight: '500' }}>THE BUILDER ETHOS</span>
            <h2 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginTop: '12px' }}>The world runs on people who make things.</h2>
          </div>

          <div className="desktop-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {builderQuotes.map((q, i) => (
              <div key={i} style={{
                background: t.surfaceBg,
                border: `1px solid ${t.surfaceBorder}`,
                borderRadius: t.radiusLg,
                padding: '28px'
              }}>
                <p style={{ fontSize: '16px', fontFamily: t.fontHeading, color: t.text, lineHeight: 1.5, marginBottom: '16px' }}>
                  "{q.quote}"
                </p>
                <div>
                  <div style={{ fontSize: '13px', color: t.textSecondary, fontWeight: '500' }}>{q.author}</div>
                  <div style={{ fontSize: '11px', color: t.textFaint }}>{q.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sample Profile */}
      <section className="section-padding" style={{ padding: '80px 40px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.accent, fontWeight: '500' }}>EXAMPLE PROFILE</span>
          <h2 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginTop: '12px' }}>This is Priya. She's made 6 things.<br /><span style={{ color: t.textTertiary }}>Some worked, some didn't. That's the point.</span></h2>
        </div>

        {/* Sample Profile Card */}
        <div className="sample-profile-card" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', border: `1px solid ${t.surfaceBorderLight}`, borderRadius: t.radiusXl, padding: '40px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          <div className="desktop-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '48px' }}>
            {/* Left: Profile Info */}
            <div>
              {/* Making Today */}
              <div style={{ marginBottom: '20px', padding: '10px 14px', background: t.successBgSubtle, border: `1px solid ${t.successBorder}`, borderRadius: t.radiusSm, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="ongoing-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.success }} />
                <span style={{ fontSize: '12px', color: t.success, fontWeight: '500' }}>MAKING: </span>
                <span style={{ color: t.textSecondary, fontSize: '13px' }}>{sampleMaker.todayMaking}</span>
              </div>

              <h3 style={{ fontSize: '24px', fontFamily: t.fontHeading, marginBottom: '8px' }}>{sampleMaker.name}</h3>
              <p style={{ color: t.textTertiary, fontSize: '13px', marginBottom: '16px' }}>makerly.me/{sampleMaker.username}</p>
              <p style={{ fontSize: '16px', color: t.textSecondary, marginBottom: '24px', lineHeight: 1.5 }}>{sampleMaker.bio}</p>

              {/* First Make */}
              <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(251,191,36,0.03) 100%)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: t.accent, marginBottom: '6px', fontWeight: '500' }}>FIRST MAKE · AGE {sampleMaker.firstMake.age}</div>
                <p style={{ fontSize: '14px', fontFamily: t.fontHeading, lineHeight: 1.5, color: t.text }}>"{sampleMaker.firstMake.description}"</p>
              </div>

              {/* Domains */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {sampleMaker.domains.map(d => (
                  <span key={d} className="tag" style={{ background: t.accentBg, border: '1px solid rgba(251,191,36,0.3)', color: t.accent, fontSize: '11px' }}>{d}</span>
                ))}
              </div>

              {/* Socials */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <span style={{ color: t.textTertiary, fontSize: '12px' }}>𝕏 Twitter</span>
                <span style={{ color: t.textTertiary, fontSize: '12px' }}>◐ GitHub</span>
              </div>
            </div>

            {/* Right: Stats */}
            <div>
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: t.radiusMd, padding: '16px 20px', marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '12px' }}>OUTCOMES</div>
                {sampleStats.map(stat => (
                  <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: t.textTertiary, fontSize: '12px' }}>{stat.label}</span>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: t.radiusMd, padding: '16px 20px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '12px' }}>ROLE BREAKDOWN</div>
                <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
                  {sampleRoleBreakdown.map(r => (
                    <div key={r.key} style={{ width: `${r.percentage}%`, background: r.color }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {sampleRoleBreakdown.map(r => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: r.color }} />
                      <span style={{ color: t.textSecondary }}>{r.label}</span>
                      <span style={{ color: t.textFaint }}>{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Projects List */}
          <div style={{ marginTop: '32px', borderTop: `1px solid ${t.surfaceBorder}`, paddingTop: '24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '16px' }}>
              PROJECTS ({sampleMaker.projects.length})
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sampleMaker.projects.map((project) => {
                const stageIndex = stages.findIndex(s => s.key === project.currentStage);
                const stage = stages[stageIndex];
                const role = roles.find(r => r.key === project.role);

                return (
                  <div key={project.id} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '10px', padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '500' }}>{project.name}</span>
                          {project.ongoing && <span className="ongoing-pulse" style={{ width: '5px', height: '5px', borderRadius: '50%', background: t.success }} />}
                          <span className="tag" style={{ background: `${role?.color}20`, color: role?.color, fontSize: '10px', padding: '2px 8px' }}>{role?.label}</span>
                        </div>
                        <p style={{ color: t.textTertiary, fontSize: '12px' }}>{project.oneLiner}</p>
                      </div>
                      <span className="tag" style={{ background: `${stage?.color}20`, color: stage?.color, fontSize: '10px', padding: '2px 8px' }}>{stage?.label}</span>
                    </div>

                    {/* Mini stage dots */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      {stages.map((s, i) => (
                        <React.Fragment key={s.key}>
                          <div style={{
                            width: i === stageIndex ? '8px' : '5px',
                            height: i === stageIndex ? '8px' : '5px',
                            borderRadius: '50%',
                            background: i <= stageIndex ? s.color : 'rgba(255,255,255,0.08)',
                            boxShadow: i === stageIndex ? `0 0 6px ${s.color}50` : 'none'
                          }} />
                          {i < stages.length - 1 && <div style={{ width: '4px', height: '1px', background: i < stageIndex ? stages[i + 1].color : 'rgba(255,255,255,0.06)' }} />}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* CTA below sample */}
        <div style={{ textAlign: 'center', marginTop: '48px' }}>
          <button className="btn btn-primary" style={{ padding: '16px 48px', fontSize: '16px' }} onClick={onSignup}>
            Create yours in 2 minutes
          </button>
        </div>
      </section>

      {/* Makers Club / Telegram */}
      <section className="section-padding" style={{ padding: '80px 40px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.accent, fontWeight: '500', marginBottom: '16px' }}>MAKERS CLUB</div>
          <h2 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginBottom: '16px' }}>
            Hang out with the others who build.
          </h2>
          <p style={{ fontSize: '16px', color: t.textSecondary, lineHeight: 1.6, marginBottom: '32px' }}>
            We've started a Telegram group for makers shipping things, sharing wins, and dropping their Makerly links. Come show off what you've made.
          </p>
          <a
            className="btn btn-primary"
            href="https://t.me/+gv6c_XN7aDU2OWJl"
            target="_blank"
            rel="noopener noreferrer"
            style={{ padding: '16px 40px', fontSize: '16px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '10px' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
            </svg>
            Join the Makers Club on Telegram
          </a>
          <p style={{ fontSize: '12px', color: t.textFaint, marginTop: '16px' }}>Free · Open to anyone who's made something</p>
        </div>
      </section>

      {/* Hiring pitch — Job Board */}
      <section className="section-padding" style={{ padding: '80px 40px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.accent, fontWeight: '500' }}>NEW · JOB BOARD</span>
            <h2 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginTop: '12px', marginBottom: '12px' }}>
              Now hiring builders.<br />
              <span style={{ color: t.textTertiary }}>Now applying with proof.</span>
            </h2>
            <p style={{ fontSize: '15px', color: t.textSecondary, maxWidth: '520px', margin: '0 auto', lineHeight: 1.6 }}>
              Companies post real jobs for the projects they're building. Makers apply with their portfolios — your work speaks for itself, no resume required.
            </p>
          </div>

          <div className="desktop-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div style={{ background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusLg, padding: '28px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.cyan, fontWeight: '500', marginBottom: '12px' }}>FOR MAKERS</div>
              <h3 style={{ fontSize: '20px', fontFamily: t.fontHeading, marginBottom: '8px' }}>Browse jobs. Apply with your work.</h3>
              <p style={{ fontSize: '14px', color: t.textSecondary, lineHeight: 1.6, marginBottom: '20px' }}>
                Filter by role, remote, and domain. Every application links to your maker profile, so recruiters see what you've built.
              </p>
              <button className="btn btn-ghost" onClick={onHire} style={{ color: t.cyan, padding: '8px 0' }}>
                Browse the job board →
              </button>
            </div>

            <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.05) 0%, rgba(251,191,36,0.01) 100%)', border: `1px solid ${t.accentBorder}`, borderRadius: t.radiusLg, padding: '28px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.accent, fontWeight: '500', marginBottom: '12px' }}>FOR RECRUITERS</div>
              <h3 style={{ fontSize: '20px', fontFamily: t.fontHeading, marginBottom: '8px' }}>Post jobs. Hire builders, not resumes.</h3>
              <p style={{ fontSize: '14px', color: t.textSecondary, lineHeight: 1.6, marginBottom: '20px' }}>
                Set up your recruiter profile, post the project you're hiring for, and review applications from makers with real, verifiable work.
              </p>
              <a href="/recruiters" className="btn btn-ghost" style={{ color: t.accent, padding: '8px 0', textDecoration: 'none', display: 'inline-block' }}>
                Post a job →
              </a>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

// ============================================
// AUTH PAGE
// ============================================
const AuthPage = ({ mode, onSwitch, onBack, onSuccess, showNotification }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const user = await db.signUp(email, password, username);
        identify(user.id, { username, email });
        track('signed_up', { method: 'email' });
        showNotification('Account created!');
        onSuccess({ ...user, username, projects: [] });
      } else {
        const user = await db.signIn(email, password);
        // Set auth mode BEFORE CRUD calls so they route to the correct backend
        db.setAuthMode(user.aud ? 'supabase' : 'local');
        const profile = await db.getProfile(user.id);
        const projects = await db.getProjectsByUserId(user.id);
        showNotification('Welcome back!');
        onSuccess({ ...user, ...profile, projects });
      }
    } catch (error) {
      showNotification(error.message, 'error');
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '32px' }}>← Back</button>

        <h1 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginBottom: '8px' }}>
          {mode === 'login' ? 'Welcome back' : 'Create your profile'}
        </h1>
        <p style={{ color: t.textTertiary, marginBottom: '32px' }}>
          {mode === 'login' ? 'Log in to your maker profile' : 'Start tracking what you make'}
        </p>

        <button
          className="btn"
          onClick={async () => {
            try {
              await db.signInWithGoogle();
            } catch (error) {
              showNotification(error.message, 'error');
            }
          }}
          style={{
            width: '100%',
            padding: '12px',
            background: t.white,
            color: t.surface,
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: t.radiusSm,
            cursor: 'pointer',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#FBBC05" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Continue with Google
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '24px 0' }}>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ fontSize: '12px', color: t.textFaint }}>or</span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Username</label>
              <input
                className="input"
                type="text"
                placeholder="priya"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                required
              />
              <div style={{ fontSize: '11px', color: t.textFaint, marginTop: '4px' }}>makerly.me/{username || 'yourname'}</div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Email</label>
            <input
              className="input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Password</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>

          <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Loading...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '24px', color: t.textTertiary, fontSize: '14px' }}>
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={onSwitch} style={{ color: t.accent, background: 'none', border: 'none', cursor: 'pointer' }}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
};

// ============================================
// DASHBOARD
// ============================================
const Dashboard = ({ user, setUser, onViewProfile, onLogout, onShare, onAdmin, onMakers, showNotification, isAdmin }) => {
  const [updateText, setUpdateText] = useState('');
  const [updates, setUpdates] = useState([]);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [showGitHubImport, setShowGitHubImport] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [updatesPage, setUpdatesPage] = useState(1);
  const UPDATES_PER_PAGE = 10;
  const [bulkSelectMode, setBulkSelectMode] = useState(false);
  const [selectedProjects, setSelectedProjects] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Profile editing state (merged from EditProfile)
  const [formData, setFormData] = useState({ ...user });
  const [newDomain, setNewDomain] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const totalRaisedRef = useRef(null);
  const totalValuationRef = useRef(null);
  const totalUsersRef = useRef(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedStats, setExtractedStats] = useState(null);

  const lastProcessed = localStorage.getItem('lastStatsProcessed');
  const canProcess = isAdmin || !lastProcessed || (Date.now() - parseInt(lastProcessed, 10)) > 7 * 24 * 60 * 60 * 1000;
  const daysUntilProcess = lastProcessed ? Math.max(0, Math.ceil((parseInt(lastProcessed, 10) + 7 * 24 * 60 * 60 * 1000 - Date.now()) / (24 * 60 * 60 * 1000))) : 0;

  // Keep formData in sync when user prop changes (e.g. after project save)
  useEffect(() => {
    setFormData(prev => ({ ...prev, ...user }));
  }, [user]);

  // Load updates on mount
  useEffect(() => {
    db.getUpdatesByUserId(user.id).then(setUpdates).catch(console.error);
  }, [user.id]);

  // Auto-open GitHub import if user just completed OAuth and has no projects
  useEffect(() => {
    const checkOAuthReturn = async () => {
      try {
        if (user.projects?.length === 0) {
          const connection = await getGitHubConnection();
          if (connection?.connected) {
            setShowGitHubImport(true);
          }
        }
      } catch (error) {
        console.error('GitHub OAuth check failed:', error);
      }
    };
    checkOAuthReturn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postUpdate = async () => {
    if (!updateText.trim()) return;
    try {
      const newUpdate = await db.createUpdate(user.id, updateText.trim());
      setUpdates([newUpdate, ...updates]);
      setUser(prev => ({ ...prev, todayMaking: updateText.trim() }));
      setUpdateText('');
      track('update_posted', { length: updateText.trim().length });
      showNotification('Update posted!');
    } catch (error) {
      console.error('Error posting update:', error);
      showNotification('Error posting update: ' + (error?.message || String(error)), 'error');
    }
  };

  const handleDeleteUpdate = async (updateId) => {
    try {
      await db.deleteUpdate(updateId, user.id);
      const remaining = updates.filter(u => u.id !== updateId);
      setUpdates(remaining);
      // Sync todayMaking in local state
      const latestContent = remaining[0]?.content || '';
      setUser(u => ({ ...u, todayMaking: latestContent }));
      showNotification('Update deleted');
    } catch (error) {
      console.error('Error deleting update:', error);
      showNotification('Error deleting update: ' + (error?.message || String(error)), 'error');
    }
  };

  const saveProject = async (project) => {
    try {
      if (editingProject) {
        await db.updateProject(project.id, project);
        setUser(prev => ({ ...prev, projects: prev.projects.map(p => p.id === project.id ? project : p) }));
        showNotification('Project updated!');
      } else {
        const newProject = await db.createProject(user.id, project);
        setUser(prev => ({ ...prev, projects: [...prev.projects, newProject] }));
        track('project_created', { stage: project.currentStage, source: 'manual' });
        showNotification('Project added!');
      }
      setShowProjectModal(false);
      setEditingProject(null);
    } catch (error) {
      console.error('Error saving project:', error);
      const msg = error?.message || String(error);
      showNotification('Error saving project: ' + msg, 'error');
    }
  };

  const deleteProject = async (projectId, projectName) => {
    if (confirm(`Delete "${projectName || 'this project'}"?`)) {
      try {
        await db.deleteProject(projectId);
        setUser(prev => ({ ...prev, projects: prev.projects.filter(p => p.id !== projectId) }));
        showNotification('Project deleted');
      } catch (error) {
        console.error('Error deleting project:', error);
        showNotification('Error deleting project: ' + (error?.message || String(error)), 'error');
      }
    }
  };

  const bulkDeleteProjects = async () => {
    const count = selectedProjects.size;
    if (count === 0) return;
    if (!confirm(`Delete ${count} project${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const ids = [...selectedProjects];
      const results = await Promise.allSettled(ids.map(id => db.deleteProject(id)));
      const succeeded = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
      const failed = ids.length - succeeded.size;
      if (succeeded.size > 0) {
        setUser(prev => ({ ...prev, projects: prev.projects.filter(p => !succeeded.has(p.id)) }));
      }
      if (failed > 0) {
        showNotification(`Deleted ${succeeded.size}, failed ${failed}`, 'error');
      } else {
        showNotification(`${count} project${count > 1 ? 's' : ''} deleted`);
      }
      setSelectedProjects(new Set());
      setBulkSelectMode(false);
    } catch (error) {
      console.error('Bulk delete error:', error);
      showNotification('Error deleting projects: ' + (error?.message || String(error)), 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleProjectSelection = (projectId) => {
    setSelectedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const importGitHubProjects = async (projects) => {
    const createdProjects = [];
    const existingIds = new Set(user.projects.map(p => p.id));
    for (const project of projects) {
      try {
        const { _github: _meta, ...projectData } = project;
        const result = await db.createProject(user.id, projectData);
        // createProject returns existing project if deduped — only count truly new ones
        if (!existingIds.has(result.id)) {
          createdProjects.push(result);
          track('project_created', { stage: projectData.currentStage, source: 'github_import' });
        }
      } catch (error) {
        console.error(`Failed to import project ${project.name}:`, error);
      }
    }
    if (createdProjects.length === 0 && projects.length > 0) {
      showNotification('All selected repos are already imported', 'error');
      return [];
    }
    if (createdProjects.length > 0) {
      setUser(prev => ({ ...prev, projects: [...prev.projects, ...createdProjects] }));
    }
    return createdProjects;
  };

  const handleGitHubImportClose = () => {
    setShowGitHubImport(false);
    // Refresh projects in case they were updated during review
    db.getProjectsByUserId(user.id).then(projects => {
      // Only update if we actually got projects back — prevents wiping
      // projects for localStorage users when Supabase RLS returns empty
      if (projects && projects.length > 0) {
        setUser(u => ({ ...u, projects }));
      }
    }).catch(err => console.error('Failed to refresh projects:', err));
  };

  // Profile save handler
  const handleSaveProfile = async () => {
    if (savingProfile) return;
    setSavingProfile(true);
    try {
      const finalData = { ...formData };
      if (totalRaisedRef.current) {
        const val = totalRaisedRef.current.value.trim();
        finalData.totalRaised = val ? (parseCurrencyInput(val) || null) : null;
      }
      if (totalValuationRef.current) {
        const val = totalValuationRef.current.value.trim();
        finalData.totalValuation = val ? (parseCurrencyInput(val) || null) : null;
      }
      if (totalUsersRef.current) {
        const val = totalUsersRef.current.value.trim();
        finalData.totalUsers = val ? (parseNumberInput(val) || null) : null;
      }
      await db.updateProfile(user.id, finalData);
      setUser({ ...user, ...finalData });
      showNotification('Profile saved!');
    } catch (error) {
      console.error('Error saving profile:', error);
      showNotification('Error saving profile: ' + (error?.message || String(error)), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const processStats = async () => {
    if (!canProcess || extracting) return;
    setExtracting(true);
    try {
      const projectData = user.projects.map(p => ({
        id: p.id,
        name: p.name,
        keyMetric: p.keyMetric,
        oneLiner: p.oneLiner,
        description: p.description,
      }));
      const res = await fetch('/api/extract-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projects: projectData }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to process');
      }
      const { results } = await res.json();
      const merged = user.projects.map((p, i) => ({
        id: p.id,
        name: p.name,
        fundingRaised: results[i]?.fundingRaised ?? 0,
        valuation: results[i]?.valuation ?? 0,
        usersReached: results[i]?.usersReached ?? 0,
      }));
      setExtractedStats(merged);
    } catch (error) {
      console.error('Extract stats error:', error);
      showNotification('Error processing stats: ' + (error?.message || String(error)), 'error');
    } finally {
      setExtracting(false);
    }
  };

  const applyExtractedStats = async () => {
    if (!extractedStats) return;
    setSavingProfile(true);
    try {
      for (const stat of extractedStats) {
        if (stat.fundingRaised > 0 || stat.valuation > 0 || stat.usersReached > 0) {
          await db.updateProject(stat.id, {
            ...user.projects.find(p => p.id === stat.id),
            fundingRaised: stat.fundingRaised,
            valuation: stat.valuation,
            usersReached: stat.usersReached,
          });
        }
      }
      setUser(prev => ({
        ...prev,
        projects: prev.projects.map(p => {
          const stat = extractedStats.find(s => s.id === p.id);
          return stat ? { ...p, fundingRaised: stat.fundingRaised, valuation: stat.valuation, usersReached: stat.usersReached } : p;
        }),
      }));
      localStorage.setItem('lastStatsProcessed', String(Date.now()));
      setExtractedStats(null);
      showNotification('Stats updated across all projects!');
    } catch (error) {
      console.error('Apply stats error:', error);
      showNotification('Error saving stats: ' + (error?.message || String(error)), 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const addDomain = () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (trimmed && !formData.domains.some(d => d.toLowerCase() === trimmed)) {
      setFormData({ ...formData, domains: [...formData.domains, trimmed] });
      setNewDomain('');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header className="desktop-header" style={{ padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.surfaceBorder}`, flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ fontSize: '14px', letterSpacing: '0.15em', color: t.accent, fontWeight: '600' }}>MAKER.PROFILE</div>
        <nav className="header-actions" aria-label="Dashboard navigation" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={onShare} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span aria-hidden="true">↗</span> Share
          </button>
          <button className="btn btn-secondary" onClick={onViewProfile}>Preview</button>
          <button className="btn btn-ghost" onClick={onMakers}>Makers</button>
          {onAdmin && <button className="btn btn-ghost" onClick={onAdmin} style={{ color: t.accent }}>Admin</button>}
          <button className="btn btn-ghost" onClick={onLogout}>Log out</button>
        </nav>
        <MobileMenuButton onClick={() => setMobileMenuOpen(true)} isOpen={mobileMenuOpen} />
      </header>

      <MobileDrawer isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
        <button className="btn btn-ghost" style={{ textAlign: 'left' }} onClick={() => { setMobileMenuOpen(false); onViewProfile(); }}>Preview Profile</button>
        <button className="btn btn-ghost" style={{ textAlign: 'left' }} onClick={() => { setMobileMenuOpen(false); onMakers(); }}>Makers</button>
        {onAdmin && <button className="btn btn-ghost" style={{ textAlign: 'left', color: t.accent }} onClick={() => { setMobileMenuOpen(false); onAdmin(); }}>Admin</button>}
        <button className="btn btn-ghost" style={{ textAlign: 'left' }} onClick={() => { setMobileMenuOpen(false); onLogout(); }}>Log out</button>
        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button className="btn btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => { setMobileMenuOpen(false); onShare(); }}>
            <span aria-hidden="true">↗</span> Share
          </button>
        </div>
      </MobileDrawer>

      <div className="desktop-content" style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
        {/* Welcome */}
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginBottom: '8px' }}>
            Hey{user.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p style={{ color: t.textTertiary }}>What are you making today?</p>
        </div>

        {/* Cracked Squad Card */}
        {user.crackedSquad && (
          <div style={{ marginBottom: '32px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: t.radiusMd, padding: '28px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '24px', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: '200px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.2em', color: t.error, fontWeight: '600', marginBottom: '12px' }}>CRACKED SQUAD MEMBER</div>
                <div style={{ fontSize: '24px', fontFamily: t.fontHeading, marginBottom: '4px' }}>{user.name || user.username}</div>
                <div style={{ fontSize: '13px', color: t.textFaint, marginBottom: '16px' }}>makerly.me/{user.username}</div>
                <p style={{ fontSize: '13px', color: t.textTertiary, lineHeight: 1.5, margin: 0 }}>
                  Share your Cracked Squad card on socials. Let people know you made the cut.
                </p>
              </div>
              <div id="cracked-squad-card" style={{ width: '320px', background: '#0c0a09', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px', padding: '28px', textAlign: 'center', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.3em', color: '#ef4444', fontWeight: '600', marginBottom: '16px' }}>CRACKED SQUAD</div>
                <div style={{ fontSize: '22px', fontWeight: '600', color: '#e7e5e4', marginBottom: '4px', fontFamily: 'serif' }}>{user.name || user.username}</div>
                <div style={{ fontSize: '12px', color: '#78716c', marginBottom: '16px' }}>makerly.me/{user.username}</div>
                <div style={{ width: '40px', height: '1px', background: 'rgba(239,68,68,0.3)', margin: '0 auto 16px' }} />
                <div style={{ fontSize: '10px', color: '#57534e', letterSpacing: '0.1em' }}>MAKERLY</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
              <button
                className="btn"
                onClick={() => {
                  const text = `I just got selected for the Cracked Squad on @makikiapp — a group of teenage builders who are unreasonably ambitious.\n\nmakerly.me/${user.username}`;
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
                }}
                style={{ padding: '8px 16px', fontSize: '12px', background: 'rgba(239,68,68,0.1)', color: t.error, border: '1px solid rgba(239,68,68,0.25)', borderRadius: t.radiusSm, cursor: 'pointer', fontWeight: '500' }}
              >
                Share on X
              </button>
              <button
                className="btn"
                onClick={() => {
                  const text = `I just got selected for the Cracked Squad on Makerly — a group of teenage builders who are unreasonably ambitious.\n\nmakerly.me/${user.username}`;
                  window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://makerly.me/${user.username}`)}&summary=${encodeURIComponent(text)}`, '_blank');
                }}
                style={{ padding: '8px 16px', fontSize: '12px', background: 'rgba(239,68,68,0.1)', color: t.error, border: '1px solid rgba(239,68,68,0.25)', borderRadius: t.radiusSm, cursor: 'pointer', fontWeight: '500' }}
              >
                Share on LinkedIn
              </button>
              <button
                className="btn"
                onClick={() => {
                  const text = `Cracked Squad member — makerly.me/${user.username}`;
                  navigator.clipboard.writeText(text).then(() => showNotification('Copied to clipboard!')).catch(() => {});
                }}
                style={{ padding: '8px 16px', fontSize: '12px', background: 'transparent', color: t.textFaint, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, cursor: 'pointer' }}
              >
                Copy Link
              </button>
            </div>
          </div>
        )}

        {/* Post Update */}
        <div className="card" style={{ padding: '24px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <label htmlFor="daily-update" className="sr-only">What are you making today?</label>
            <input
              id="daily-update"
              className="input"
              placeholder="What are you making today?"
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && postUpdate()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={postUpdate}>Post</button>
          </div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: t.textFaint }}>
            Latest update shows on your public profile. All updates are saved as a timeline.
          </div>
        </div>

        {/* Updates Timeline */}
        {updates.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{ fontSize: '12px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '16px' }}>UPDATES ({updates.length})</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {updates.slice(0, updatesPage * UPDATES_PER_PAGE).map((update) => (
                <div key={update.id} className="card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: t.textMuted, fontSize: '14px' }}>{update.content}</span>
                    <div style={{ fontSize: '11px', color: t.textFaint, marginTop: '6px' }}>
                      {new Date(update.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}
                      {new Date(update.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteUpdate(update.id)}
                    style={{ background: 'none', border: 'none', color: t.textFaint, cursor: 'pointer', fontSize: '16px', padding: '2px 6px', lineHeight: 1 }}
                    aria-label="Delete update"
                  >×</button>
                </div>
              ))}
            </div>
            {updates.length > updatesPage * UPDATES_PER_PAGE && (
              <button
                className="btn btn-ghost"
                onClick={() => setUpdatesPage(p => p + 1)}
                style={{ width: '100%', marginTop: '8px', fontSize: '13px' }}
              >
                Show more ({updates.length - updatesPage * UPDATES_PER_PAGE} remaining)
              </button>
            )}
          </div>
        )}

        {/* Projects */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h2 style={{ fontSize: '12px', letterSpacing: '0.1em', color: t.textFaint }}>YOUR PROJECTS ({user.projects.length})</h2>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {bulkSelectMode ? (
                <>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: '12px', padding: '6px 12px' }}
                    onClick={() => {
                      if (selectedProjects.size === user.projects.length) setSelectedProjects(new Set());
                      else setSelectedProjects(new Set(user.projects.map(p => p.id)));
                    }}
                  >
                    {selectedProjects.size === user.projects.length ? 'Deselect All' : 'Select All'}
                  </button>
                  <button
                    className="btn"
                    style={{ fontSize: '12px', padding: '6px 14px', background: selectedProjects.size > 0 ? 'rgba(239,68,68,0.15)' : 'transparent', color: selectedProjects.size > 0 ? t.error : t.textFaint, border: `1px solid ${selectedProjects.size > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: t.radiusSm, cursor: selectedProjects.size > 0 ? 'pointer' : 'default' }}
                    onClick={bulkDeleteProjects}
                    disabled={selectedProjects.size === 0 || bulkDeleting}
                  >
                    {bulkDeleting ? 'Deleting...' : `Delete ${selectedProjects.size > 0 ? `(${selectedProjects.size})` : ''}`}
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: '12px', padding: '6px 12px' }} onClick={() => { setBulkSelectMode(false); setSelectedProjects(new Set()); }}>Cancel</button>
                </>
              ) : (
                <>
                  {user.projects.length > 1 && (
                    <button className="btn btn-secondary" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={() => setBulkSelectMode(true)}>Select</button>
                  )}
                  <button className="btn btn-secondary" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={() => setShowGitHubImport(true)}>Import from GitHub</button>
                  <button className="btn btn-primary" style={{ fontSize: '13px', padding: '6px 14px' }} onClick={() => { setEditingProject(null); setShowProjectModal(true); }}>+ Add Project</button>
                </>
              )}
            </div>
          </div>

          {user.projects.length === 0 ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
              <h2 style={{ fontSize: '24px', fontFamily: t.fontHeading, marginBottom: '8px' }}>Build your maker timeline</h2>
              <p style={{ color: t.textTertiary, marginBottom: '24px' }}>Import from GitHub or add your first project above</p>
            </div>
          ) : (
            <div aria-label="Your projects" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {user.projects.map(project => (
                bulkSelectMode ? (
                  <div
                    key={project.id}
                    onClick={() => toggleProjectSelection(project.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer',
                      padding: '14px 18px', borderRadius: t.radiusMd,
                      background: selectedProjects.has(project.id) ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.2)',
                      border: `1px solid ${selectedProjects.has(project.id) ? 'rgba(239,68,68,0.25)' : 'transparent'}`,
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '4px', flexShrink: 0,
                      border: `2px solid ${selectedProjects.has(project.id) ? t.error : 'rgba(255,255,255,0.15)'}`,
                      background: selectedProjects.has(project.id) ? t.error : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s ease',
                    }}>
                      {selectedProjects.has(project.id) && <span style={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}>✓</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: t.text }}>{project.name}</div>
                      {project.oneLiner && <div style={{ fontSize: '12px', color: t.textFaint, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.oneLiner}</div>}
                    </div>
                  </div>
                ) : (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onEdit={() => { setEditingProject(project); setShowProjectModal(true); }}
                    onDelete={() => deleteProject(project.id, project.name)}
                  />
                )
              ))}
            </div>
          )}
        </div>

        {/* ── PROFILE SETTINGS ── */}
        <div style={{ marginTop: '48px', borderTop: `1px solid ${t.surfaceBorder}`, paddingTop: '48px' }}>
          <h2 style={{ fontSize: '12px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '24px' }}>PROFILE SETTINGS</h2>

          {/* Basic Info */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>BASIC INFO</h2>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Name</label>
              <input
                className="input"
                placeholder="Your name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Username</label>
              <input className="input" value={formData.username} disabled style={{ opacity: 0.6 }} />
              <div style={{ fontSize: '11px', color: t.textFaint, marginTop: '4px' }}>makerly.me/{formData.username}</div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Bio</label>
              <textarea
                className="input"
                placeholder="I make things that..."
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Philosophy</label>
              <input
                className="input"
                placeholder="Your maker philosophy in one line"
                maxLength={200}
                value={formData.philosophy || ''}
                onChange={(e) => setFormData({ ...formData, philosophy: e.target.value })}
              />
              <div style={{ fontSize: '11px', color: t.textFaint, marginTop: '4px' }}>Shows as an italic quote on your profile.</div>
            </div>
          </div>

          {/* First Make */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>FIRST MAKE</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, marginBottom: '16px' }}>
              What do you remember as your first make? A Lego set? A school project? A treehouse?
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>What was it?</label>
              <textarea
                className="input"
                placeholder="A marble run out of cardboard tubes and tape. Spent three weeks on it."
                value={formData.firstMake?.description || ''}
                onChange={(e) => setFormData({ ...formData, firstMake: { ...formData.firstMake, description: e.target.value } })}
                rows={2}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>How old were you?</label>
              <input
                className="input"
                placeholder="8"
                value={formData.firstMake?.age || ''}
                onChange={(e) => setFormData({ ...formData, firstMake: { ...formData.firstMake, age: e.target.value } })}
                style={{ width: '100px' }}
              />
            </div>
          </div>

          {/* Domains */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>DOMAINS</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, marginBottom: '16px' }}>
              What kinds of things do you make? Apps, hardware, communities, art, music...
            </p>

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                className="input"
                placeholder="e.g. apps, hardware, developer tools"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDomain())}
              />
              <button className="btn btn-secondary" onClick={addDomain}>Add</button>
            </div>

            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {formData.domains.map(d => (
                <button type="button" key={d} className="tag" aria-label={`Remove ${d}`} style={{ background: t.accentBg, color: t.accent, cursor: 'pointer', border: 'none' }}
                  onClick={() => setFormData({ ...formData, domains: formData.domains.filter(x => x !== d) })}>
                  {d} ×
                </button>
              ))}
            </div>
          </div>

          {/* Social Links */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>SOCIAL & PROOF OF WORK</h2>

            {[
              { key: 'twitter', label: 'Twitter/X', placeholder: 'https://twitter.com/yourhandle' },
              { key: 'github', label: 'GitHub', placeholder: 'https://github.com/yourusername' },
              { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/yourprofile' },
              { key: 'substack', label: 'Substack', placeholder: 'https://yourname.substack.com' },
              { key: 'website', label: 'Personal Website', placeholder: 'https://yoursite.com' },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>{label}</label>
                <input
                  className="input"
                  placeholder={placeholder}
                  value={formData.socials?.[key] || ''}
                  onChange={(e) => setFormData({ ...formData, socials: { ...formData.socials, [key]: e.target.value } })}
                />
              </div>
            ))}
          </div>

          {/* Contact */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>CONTACT</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, marginBottom: '16px' }}>
              Let people message you directly from your profile. Your email stays private — visitors just see a contact button.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.showEmail || false}
                  onChange={(e) => setFormData({ ...formData, showEmail: e.target.checked })}
                  style={{ width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '14px', color: t.textSecondary }}>Enable contact form on my profile</span>
              </label>
            </div>

            {formData.showEmail && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Where should messages be sent?</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@email.com"
                  value={formData.contactEmail || ''}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                />
                <div style={{ fontSize: '11px', color: t.textFaint, marginTop: '4px' }}>Messages from visitors will be emailed here. This address is never shown publicly.</div>
              </div>
            )}
          </div>

          {/* Embed Feed */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>EMBED FEED</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, marginBottom: '16px' }}>
              Show your latest tweets or Substack posts on your profile.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Feed Type</label>
              <select
                className="input"
                value={formData.embedFeed?.type || ''}
                onChange={(e) => setFormData({ ...formData, embedFeed: { ...formData.embedFeed, type: e.target.value || null } })}
              >
                <option value="">None</option>
                <option value="twitter">Twitter/X Timeline</option>
                <option value="substack">Substack</option>
              </select>
            </div>

            {formData.embedFeed?.type && (
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>
                  {formData.embedFeed.type === 'twitter' ? 'Twitter Username' : 'Substack URL'}
                </label>
                <input
                  className="input"
                  placeholder={formData.embedFeed.type === 'twitter' ? '@yourhandle' : 'https://yourname.substack.com'}
                  value={formData.embedFeed?.url || ''}
                  onChange={(e) => setFormData({ ...formData, embedFeed: { ...formData.embedFeed, url: e.target.value } })}
                />
              </div>
            )}
          </div>

          {/* Press Links */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>PRESS & SOCIAL PROOF</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, marginBottom: '16px' }}>
              Add links to press mentions, interviews, or notable features.
            </p>

            {(formData.pressLinks || []).map((link, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                <input
                  className="input"
                  placeholder="URL"
                  value={link.url || ''}
                  onChange={(e) => {
                    const updated = [...(formData.pressLinks || [])];
                    updated[i] = { ...updated[i], url: e.target.value };
                    if (!updated[i].source && e.target.value) {
                      updated[i].source = getLinkLabel(e.target.value);
                    }
                    setFormData({ ...formData, pressLinks: updated });
                  }}
                  style={{ flex: 2 }}
                />
                <input
                  className="input"
                  placeholder="Source (e.g. TechCrunch)"
                  value={link.source || ''}
                  onChange={(e) => {
                    const updated = [...(formData.pressLinks || [])];
                    updated[i] = { ...updated[i], source: e.target.value };
                    setFormData({ ...formData, pressLinks: updated });
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    const updated = (formData.pressLinks || []).filter((_, j) => j !== i);
                    setFormData({ ...formData, pressLinks: updated });
                  }}
                  style={{ color: t.error, padding: '8px' }}
                >×</button>
              </div>
            ))}

            <button
              className="btn btn-secondary"
              onClick={() => setFormData({ ...formData, pressLinks: [...(formData.pressLinks || []), { url: '', title: '', source: '' }] })}
            >+ Add press link</button>
          </div>

          {/* Process Stats with AI */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>HEADLINE STATS</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, marginBottom: '16px' }}>
              Extract funding, valuation, and user stats from your project descriptions using AI. Runs once per week.
            </p>

            {extractedStats ? (
              <div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${t.surfaceBorder}` }}>
                        <th style={{ textAlign: 'left', padding: '8px 4px', color: t.textFaint, fontWeight: 500 }}>Project</th>
                        <th style={{ textAlign: 'right', padding: '8px 4px', color: t.accent, fontWeight: 500 }}>Raised</th>
                        <th style={{ textAlign: 'right', padding: '8px 4px', color: t.accent, fontWeight: 500 }}>Valuation</th>
                        <th style={{ textAlign: 'right', padding: '8px 4px', color: t.textFaint, fontWeight: 500 }}>Users</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extractedStats.map((stat) => (
                        <tr key={stat.id} style={{ borderBottom: `1px solid ${t.surfaceBorder}` }}>
                          <td style={{ padding: '8px 4px', color: t.text }}>{stat.name}</td>
                          <td style={{ textAlign: 'right', padding: '8px 4px', color: stat.fundingRaised > 0 ? t.accent : t.textFaint }}>
                            {stat.fundingRaised > 0 ? formatCentsPreview(stat.fundingRaised) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px 4px', color: stat.valuation > 0 ? t.accent : t.textFaint }}>
                            {stat.valuation > 0 ? formatCentsPreview(stat.valuation) : '—'}
                          </td>
                          <td style={{ textAlign: 'right', padding: '8px 4px', color: stat.usersReached > 0 ? t.text : t.textFaint }}>
                            {stat.usersReached > 0 ? formatNumberPreview(stat.usersReached) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                  <button className="btn btn-primary" onClick={applyExtractedStats} disabled={savingProfile}>
                    {savingProfile ? 'Saving...' : 'Apply Stats'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setExtractedStats(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <button
                  className="btn btn-primary"
                  onClick={processStats}
                  disabled={!canProcess || extracting}
                  style={{ opacity: canProcess ? 1 : 0.5 }}
                >
                  {extracting ? 'Processing...' : 'Process My Stats'}
                </button>
                {!canProcess && (
                  <p style={{ fontSize: '12px', color: t.textFaint, marginTop: '8px' }}>
                    Available again in {daysUntilProcess} day{daysUntilProcess !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Headline Stats Overrides */}
          <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '20px' }}>OVERRIDE TOTALS</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, marginBottom: '16px' }}>
              Override the auto-calculated totals. Leave blank to use per-project sums.
            </p>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Total $ Raised</label>
              <input
                ref={totalRaisedRef}
                className="input"
                inputMode="decimal"
                placeholder="e.g. $5M"
                defaultValue={formData.totalRaised ? formatCentsPreview(formData.totalRaised) : ''}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (!val) {
                    setFormData(prev => ({ ...prev, totalRaised: null }));
                  } else {
                    const cents = parseCurrencyInput(val);
                    setFormData(prev => ({ ...prev, totalRaised: cents || null }));
                    if (cents > 0) e.target.value = formatCentsPreview(cents);
                  }
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Total Valuation</label>
              <input
                ref={totalValuationRef}
                className="input"
                inputMode="decimal"
                placeholder="e.g. $50M"
                defaultValue={formData.totalValuation ? formatCentsPreview(formData.totalValuation) : ''}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (!val) {
                    setFormData(prev => ({ ...prev, totalValuation: null }));
                  } else {
                    const cents = parseCurrencyInput(val);
                    setFormData(prev => ({ ...prev, totalValuation: cents || null }));
                    if (cents > 0) e.target.value = formatCentsPreview(cents);
                  }
                }}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textFaint, marginBottom: '8px' }}>Total Users</label>
              <input
                ref={totalUsersRef}
                className="input"
                inputMode="decimal"
                placeholder="e.g. 500K"
                defaultValue={formData.totalUsers ? formatNumberPreview(formData.totalUsers) : ''}
                onBlur={(e) => {
                  const val = e.target.value.trim();
                  if (!val) {
                    setFormData(prev => ({ ...prev, totalUsers: null }));
                  } else {
                    const count = parseNumberInput(val);
                    setFormData(prev => ({ ...prev, totalUsers: count || null }));
                    if (count > 0) e.target.value = formatNumberPreview(count);
                  }
                }}
              />
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleSaveProfile} disabled={savingProfile} style={{ width: '100%' }}>
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>

      {showProjectModal && (
        <ProjectModal
          project={editingProject}
          onSave={saveProject}
          onDelete={editingProject ? () => {
            deleteProject(editingProject.id, editingProject.name);
            setShowProjectModal(false);
            setEditingProject(null);
          } : null}
          onClose={() => { setShowProjectModal(false); setEditingProject(null); }}
        />
      )}

      {showGitHubImport && (
        <GitHubImportModal
          onImport={importGitHubProjects}
          onClose={handleGitHubImportClose}
          showNotification={showNotification}
          existingProjects={user.projects}
        />
      )}
      <SiteFooter />
    </div>
  );
};

// ============================================
// PROJECT CARD
// ============================================
const ProjectCard = ({ project, onEdit, onDelete }) => {
  const stageIndex = stages.findIndex(s => s.key === project.currentStage);
  const stage = stages[stageIndex];
  const role = roles.find(r => r.key === project.role);

  return (
    <div className="card project-card" style={{ padding: '20px 24px' }} onClick={onEdit} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(); } }} tabIndex={0} role="button" aria-label={`Edit project ${project.name}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{project.name}</h3>
            {project.ongoing && (
              <span className="ongoing-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.success }} />
            )}
            <span className="tag" style={{ background: `${role?.color}20`, color: role?.color }}>{role?.label}</span>
          </div>
          <p style={{ color: t.textTertiary, fontSize: '14px', marginBottom: '12px' }}>{project.oneLiner}</p>

          {/* Stage dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {stages.map((s, idx) => (
              <React.Fragment key={s.key}>
                <div
                  className={`stage-dot ${idx === stageIndex ? 'active' : ''}`}
                  style={{
                    background: idx <= stageIndex ? s.color : 'rgba(255,255,255,0.1)',
                    boxShadow: idx === stageIndex ? `0 0 8px ${s.color}50` : 'none'
                  }}
                />
                {idx < stages.length - 1 && (
                  <div style={{ width: '8px', height: '2px', background: idx < stageIndex ? stages[idx + 1].color : 'rgba(255,255,255,0.06)' }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <span className="tag" style={{ background: `${stage?.color}20`, color: stage?.color }}>{stage?.label}</span>
          <button
            className="btn btn-ghost"
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            onKeyDown={(e) => { e.stopPropagation(); }}
            aria-label={`Delete project ${project.name}`}
            style={{ padding: '4px 8px', color: t.error }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================
// PROJECT MODAL
// ============================================
const ProjectModal = ({ project, onSave, onDelete, onClose }) => {
  const [formData, setFormData] = useState(project || {
    name: '',
    oneLiner: '',
    role: 'solo',
    currentStage: 'idea',
    startDate: new Date().toISOString().slice(0, 7),
    endDate: '',
    ongoing: true,
    domains: [],
    links: [],
    outcome: '',
    description: '',
    imageUrl: '',
    featured: false,
    keyMetric: '',
  });

  const [newDomain, setNewDomain] = useState('');
  const [newLink, setNewLink] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await onSave(formData);
    } finally {
      setSaving(false);
    }
  };

  const addDomain = () => {
    const trimmed = newDomain.trim().toLowerCase();
    if (trimmed && !formData.domains.some(d => d.toLowerCase() === trimmed)) {
      setFormData({ ...formData, domains: [...formData.domains, trimmed] });
      setNewDomain('');
    }
  };

  const [linkError, setLinkError] = useState('');

  const addLink = () => {
    if (!newLink) return;
    setLinkError('');
    // Auto-prepend https:// if user typed a bare domain
    let url = newLink.trim();
    if (url && !url.match(/^https?:\/\//i)) {
      url = 'https://' + url;
    }
    try {
      new URL(url); // validate URL format
    } catch {
      setLinkError('Invalid URL format');
      return;
    }
    if (!formData.links.includes(url)) {
      setFormData({ ...formData, links: [...formData.links, url] });
    }
    setNewLink('');
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="project-modal-title">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', maxHeight: '90vh', overflow: 'auto' }}>
        <h2 id="project-modal-title" style={{ fontSize: '24px', fontFamily: t.fontHeading, marginBottom: '24px' }}>
          {project ? 'Edit Project' : 'Add New Project'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Project Name *</label>
            <input
              className="input"
              placeholder="My Awesome Project"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>One-liner *</label>
            <input
              className="input"
              placeholder="A tool that does something cool"
              value={formData.oneLiner}
              onChange={(e) => setFormData({ ...formData, oneLiner: e.target.value })}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Description</label>
            <textarea
              className="input"
              placeholder="Tell the story of this project. What problem were you solving? How did you build it? What happened?"
              value={formData.description || ''}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Your Role</label>
              <select
                className="input"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                {roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Current Stage</label>
              <select
                className="input"
                value={formData.currentStage}
                onChange={(e) => setFormData({ ...formData, currentStage: e.target.value })}
              >
                {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Start</label>
              <input
                className="input"
                type="month"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>End</label>
              <input
                className="input"
                type="month"
                value={formData.endDate || ''}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value, ongoing: false })}
                disabled={formData.ongoing}
                style={{ opacity: formData.ongoing ? 0.5 : 1 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formData.ongoing}
                  onChange={(e) => setFormData({ ...formData, ongoing: e.target.checked, endDate: e.target.checked ? '' : formData.endDate })}
                  style={{ width: '16px', height: '16px' }}
                />
                <span style={{ fontSize: '14px', color: t.textSecondary }}>Ongoing</span>
              </label>
            </div>
          </div>

          {/* Domains */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Domains/Tags</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                className="input"
                placeholder="e.g. apps, hardware, community"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addDomain())}
              />
              <button type="button" className="btn btn-secondary" onClick={addDomain}>Add</button>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {formData.domains.map(d => (
                <button type="button" key={d} className="tag" aria-label={`Remove ${d}`} style={{ background: t.accentBg, color: t.accent, cursor: 'pointer', border: 'none' }}
                  onClick={() => setFormData({ ...formData, domains: formData.domains.filter(x => x !== d) })}>
                  {d} ×
                </button>
              ))}
            </div>
          </div>

          {/* Links */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Links</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                className="input"
                placeholder="https://github.com/..."
                value={newLink}
                onChange={(e) => setNewLink(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addLink())}
              />
              <button type="button" className="btn btn-secondary" onClick={addLink}>Add</button>
            </div>
            {linkError && <div style={{ color: t.error, fontSize: '12px', marginBottom: '4px' }}>{linkError}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {formData.links.map(l => (
                <div key={l} style={{ fontSize: '13px', color: t.textSecondary, display: 'flex', justifyContent: 'space-between' }}>
                  <span>{l}</span>
                  <button type="button" aria-label={`Remove ${l}`} style={{ color: t.error, background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setFormData({ ...formData, links: formData.links.filter(x => x !== l) })}>×</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Outcome (optional)</label>
            <input
              className="input"
              placeholder="e.g. Acquired by X, 10k users, shut down"
              value={formData.outcome}
              onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Key Metric (optional)</label>
            <input
              className="input"
              placeholder="e.g. 50k MAU, $2k MRR, #1 on HN"
              value={formData.keyMetric || ''}
              onChange={(e) => setFormData({ ...formData, keyMetric: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Cover Image URL (optional)</label>
            <input
              className="input"
              placeholder="https://example.com/screenshot.png"
              value={formData.imageUrl || ''}
              onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
            />
            {formData.imageUrl && (
              <div style={{ marginTop: '8px', borderRadius: t.radiusSm, overflow: 'hidden', maxHeight: '120px' }}>
                <img src={safeImageUrl(formData.imageUrl)} alt="Preview" style={{ width: '100%', height: '120px', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
              </div>
            )}
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formData.featured || false}
                onChange={(e) => setFormData({ ...formData, featured: e.target.checked })}
                style={{ width: '16px', height: '16px' }}
              />
              <span style={{ fontSize: '14px', color: t.textSecondary }}>Feature this project</span>
              <span style={{ fontSize: '11px', color: t.textFaint }}>(shows as a hero card on your profile)</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
            {onDelete ? (
              <button type="button" className="btn btn-ghost" onClick={onDelete} style={{ color: t.error }}>Delete</button>
            ) : <div />}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Project'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// GITHUB IMPORT MODAL
// ============================================
const GitHubImportModal = ({ onImport, onClose, showNotification, existingProjects = [] }) => {
  const [username, setUsername] = useState('');
  const [repos, setRepos] = useState([]);
  const [selectedRepos, setSelectedRepos] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('input'); // input | select | review
  const [, setIsOAuthConnected] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // Review step state
  const [importedProjects, setImportedProjects] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewData, setReviewData] = useState(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [dateError, setDateError] = useState(null);

  // Check for OAuth connection on mount
  useEffect(() => {
    const checkOAuthAndFetch = async () => {
      try {
        const connection = await getGitHubConnection();
        if (connection?.connected) {
          setIsOAuthConnected(true);
          setLoading(true);
          const fetchedRepos = await fetchAuthenticatedRepos();
          if (fetchedRepos) {
            const mappedRepos = fetchedRepos.map(mapRepoToProject);
            setRepos(mappedRepos);
            setSelectedRepos(new Set());
            setStep('select');
          }
          setLoading(false);
        }
      } catch (error) {
        console.error('OAuth check failed:', error);
        setFetchError('GitHub connection check failed. Try entering your username instead.');
        setLoading(false);
      }
    };
    checkOAuthAndFetch();
  }, []);

  const handleFetch = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setFetchError(null);
    try {
      const fetchedRepos = await fetchUserRepos(username.trim());
      const mappedRepos = fetchedRepos.map(mapRepoToProject);
      setRepos(mappedRepos);
      setSelectedRepos(new Set());
      setStep('select');
    } catch (error) {
      setFetchError(error.message || 'Failed to fetch repositories. Check the username and try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRepo = (index) => {
    const newSelected = new Set(selectedRepos);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRepos(newSelected);
  };

  const selectAll = () => {
    const importable = repos.map((repo, i) => {
      const alreadyImported = existingProjects.some(p =>
        (repo.githubRepoId && p.githubRepoId === repo.githubRepoId) ||
        p.links?.some(l => repo.links?.includes(l))
      );
      return alreadyImported ? null : i;
    }).filter(i => i !== null);
    setSelectedRepos(new Set(importable));
  };

  const selectNone = () => {
    setSelectedRepos(new Set());
  };

  const handleImport = async () => {
    const selected = repos.filter((_, i) => selectedRepos.has(i));
    if (selected.length === 0) {
      showNotification('Select at least one repo', 'error');
      return;
    }

    // Import all projects first, then start review
    setLoading(true);
    try {
      const projects = await onImport(selected);
      if (projects.length === 0) {
        // All were duplicates — close without review
        return;
      }
      setImportedProjects(projects);
      setReviewIndex(0);
      setReviewData({ ...projects[0] });
      setStep('review');
    } catch {
      showNotification('Failed to import projects', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSave = async () => {
    // Validate dates
    if (reviewData.startDate && reviewData.endDate && !reviewData.ongoing) {
      if (new Date(reviewData.endDate) < new Date(reviewData.startDate)) {
        setDateError('End date cannot be before start date');
        return;
      }
    }
    setDateError(null);
    setReviewSaving(true);
    try {
      await db.updateProject(importedProjects[reviewIndex].id, reviewData);
      importedProjects[reviewIndex] = { ...importedProjects[reviewIndex], ...reviewData };
      moveToNext();
    } catch {
      showNotification('Failed to save changes', 'error');
    } finally {
      setReviewSaving(false);
    }
  };

  const handleReviewSkip = () => {
    moveToNext();
  };

  const moveToNext = () => {
    if (reviewIndex < importedProjects.length - 1) {
      const nextIndex = reviewIndex + 1;
      setReviewIndex(nextIndex);
      setReviewData({ ...importedProjects[nextIndex] });
    } else {
      showNotification(`Imported ${importedProjects.length} project${importedProjects.length === 1 ? '' : 's'}!`);
      onClose();
    }
  };

  const handleFinishEarly = () => {
    showNotification(`Imported ${importedProjects.length} project${importedProjects.length === 1 ? '' : 's'}!`);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="github-modal-title">
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
        <h2 id="github-modal-title" style={{ fontSize: '24px', fontFamily: t.fontHeading, marginBottom: '8px' }}>
          {step === 'review' ? `Review Projects (${reviewIndex + 1} of ${importedProjects.length})` : 'Import from GitHub'}
        </h2>
        <p style={{ color: t.textTertiary, marginBottom: '24px' }}>
          {step === 'input' && 'Enter a GitHub username to fetch repositories'}
          {step === 'select' && `Select repositories to import (${selectedRepos.size} selected)`}
          {step === 'review' && 'Add details to your imported projects'}
        </p>

        {step === 'input' && (
          <>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: '24px', marginBottom: '12px', animation: 'spin 1s linear infinite' }}>◐</div>
                <div style={{ color: t.textSecondary }}>Fetching repositories...</div>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            ) : (
              <>
                {fetchError && (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: t.radiusSm,
                    padding: '12px 16px',
                    marginBottom: '16px',
                    color: t.errorText,
                    fontSize: '14px'
                  }}>
                    {fetchError}
                  </div>
                )}
                {(isSupabaseConfigured() || import.meta.env.VITE_GITHUB_CLIENT_ID) && (
                  <div style={{ marginBottom: '24px' }}>
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%', padding: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={async () => {
                        try {
                          await signInWithGitHub();
                        } catch (error) {
                          setFetchError(error.message || 'Failed to connect GitHub');
                        }
                      }}
                      disabled={loading}
                    >
                      <span>◐</span> Connect GitHub (includes private repos)
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                      <span style={{ color: t.textFaint, fontSize: '12px' }}>or fetch public repos</span>
                      <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)' }} />
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
                  <input
                    className="input"
                    placeholder="GitHub username"
                    aria-label="GitHub username"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setFetchError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <button className="btn btn-primary" onClick={handleFetch} disabled={!username.trim()}>
                    Fetch Repos
                  </button>
                </div>
                <button className="btn btn-ghost" onClick={onClose} style={{ width: '100%' }}>Cancel</button>
              </>
            )}
          </>
        )}

        {step === 'select' && (
          <>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <button className="btn btn-ghost" onClick={selectAll} style={{ fontSize: '12px' }}>Select All</button>
              <button className="btn btn-ghost" onClick={selectNone} style={{ fontSize: '12px' }}>Select None</button>
              <button className="btn btn-ghost" onClick={() => setStep('input')} style={{ fontSize: '12px', marginLeft: 'auto' }}>
                ← Back
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px', maxHeight: '400px', overflow: 'auto' }}>
              {repos.map((repo, index) => {
                const alreadyImported = existingProjects.some(p =>
                  (repo.githubRepoId && p.githubRepoId === repo.githubRepoId) ||
                  p.links?.some(l => repo.links?.includes(l))
                );
                return (
                  <div
                    key={index}
                    role="checkbox"
                    aria-checked={selectedRepos.has(index)}
                    aria-disabled={alreadyImported}
                    tabIndex={alreadyImported ? -1 : 0}
                    onClick={() => !alreadyImported && toggleRepo(index)}
                    onKeyDown={e => { if (!alreadyImported && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleRepo(index); } }}
                    style={{
                      padding: '12px 16px',
                      background: alreadyImported ? 'rgba(255,255,255,0.02)' : selectedRepos.has(index) ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.03)',
                      border: selectedRepos.has(index) ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                      borderRadius: t.radiusSm,
                      cursor: alreadyImported ? 'default' : 'pointer',
                      transition: 'all 0.15s',
                      opacity: alreadyImported ? 0.5 : 1
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '500' }}>{repo.name}</span>
                          {alreadyImported && <span className="tag" style={{ fontSize: '10px', background: 'rgba(74,222,128,0.15)', color: t.success }}>imported</span>}
                          {repo._github.isFork && <span className="tag" style={{ fontSize: '10px' }}>fork</span>}
                          {repo._github.isArchived && <span className="tag" style={{ fontSize: '10px' }}>archived</span>}
                        </div>
                        <div style={{ fontSize: '13px', color: t.textTertiary }}>{repo.oneLiner}</div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: t.textFaint }}>
                        {repo._github.language && <span>{repo._github.language}</span>}
                        <span>★ {repo._github.stars}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {repos.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: t.textFaint }}>
                  No public repositories found
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleImport} style={{ flex: 1 }} disabled={selectedRepos.size === 0 || loading}>
                {loading ? 'Importing...' : `Import ${selectedRepos.size} Project${selectedRepos.size === 1 ? '' : 's'}`}
              </button>
            </div>
          </>
        )}

        {step === 'review' && reviewData && (
          <>
            {/* Project header */}
            <div style={{ background: t.surfaceBg, borderRadius: t.radiusSm, padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: '500', fontSize: '16px', marginBottom: '4px' }}>{reviewData.name}</div>
              <div style={{ fontSize: '13px', color: t.textTertiary }}>{reviewData.oneLiner}</div>
            </div>

            {/* Editable fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Role</label>
                <select
                  className="input"
                  value={reviewData.role}
                  onChange={(e) => setReviewData({ ...reviewData, role: e.target.value })}
                >
                  {roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Stage</label>
                <select
                  className="input"
                  value={reviewData.currentStage}
                  onChange={(e) => setReviewData({ ...reviewData, currentStage: e.target.value })}
                >
                  {stages.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Start</label>
                <input
                  className="input"
                  type="month"
                  value={reviewData.startDate || ''}
                  onChange={(e) => { setReviewData({ ...reviewData, startDate: e.target.value }); setDateError(null); }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>End</label>
                <input
                  className="input"
                  type="month"
                  value={reviewData.endDate || ''}
                  onChange={(e) => { setReviewData({ ...reviewData, endDate: e.target.value, ongoing: false }); setDateError(null); }}
                  disabled={reviewData.ongoing}
                  style={{ opacity: reviewData.ongoing ? 0.5 : 1 }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: '24px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={reviewData.ongoing}
                    onChange={(e) => setReviewData({ ...reviewData, ongoing: e.target.checked, endDate: e.target.checked ? '' : reviewData.endDate })}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '14px', color: t.textSecondary }}>Ongoing</span>
                </label>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Outcome</label>
              <input
                className="input"
                placeholder="e.g. 1000 users, acquired, shut down, still active"
                value={reviewData.outcome || ''}
                onChange={(e) => setReviewData({ ...reviewData, outcome: e.target.value })}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>Description</label>
              <textarea
                className="input"
                placeholder="Tell the story of this project. What problem were you solving? How did you build it? What happened?"
                value={reviewData.description || ''}
                onChange={(e) => setReviewData({ ...reviewData, description: e.target.value })}
                rows={4}
                style={{ resize: 'vertical' }}
              />
            </div>

            {dateError && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: t.radiusSm,
                padding: '10px 14px',
                marginBottom: '16px',
                color: t.errorText,
                fontSize: '13px'
              }}>
                {dateError}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={handleReviewSkip} style={{ flex: 1 }} disabled={reviewSaving}>Skip</button>
              <button className="btn btn-primary" onClick={handleReviewSave} style={{ flex: 1 }} disabled={reviewSaving}>
                {reviewSaving ? 'Saving...' : reviewIndex < importedProjects.length - 1 ? 'Save & Next →' : 'Finish'}
              </button>
            </div>
            {reviewIndex < importedProjects.length - 1 && (
              <button className="btn btn-ghost" onClick={handleFinishEarly} style={{ width: '100%', marginTop: '12px', fontSize: '12px' }}>
                Finish Early ({importedProjects.length - reviewIndex - 1} remaining)
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ============================================
// TWITTER EMBED
// ============================================
const TwitterEmbed = ({ username }) => {
  const sanitized = (username || '').replace(/[^a-zA-Z0-9_]/g, '');
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Clear any previous embed
    container.innerHTML = '';

    // Create the timeline anchor that Twitter's widget.js looks for
    const anchor = document.createElement('a');
    anchor.className = 'twitter-timeline';
    anchor.setAttribute('data-theme', 'dark');
    anchor.setAttribute('data-chrome', 'noheader nofooter noborders transparent');
    anchor.setAttribute('data-tweet-limit', '3');
    anchor.href = `https://twitter.com/${sanitized}`;
    anchor.textContent = `Tweets by @${sanitized}`;
    container.appendChild(anchor);

    // Load or re-run the Twitter widget script
    if (window.twttr?.widgets) {
      window.twttr.widgets.load(container);
    } else {
      const script = document.createElement('script');
      script.src = 'https://platform.twitter.com/widgets.js';
      script.async = true;
      container.appendChild(script);
    }

    return () => { container.innerHTML = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  return <div ref={containerRef} style={{ maxHeight: '500px', overflow: 'auto' }} />;
};

// ============================================
// COLLAPSIBLE DESCRIPTION
// ============================================
const CollapsibleDescription = ({ text, maxLines = 3 }) => {
  const [expanded, setExpanded] = useState(false);
  if (!text) return null;

  const lines = text.split('\n');
  const needsCollapse = lines.length > maxLines || text.length > 200;

  if (!needsCollapse) {
    return <p style={{ color: t.textSecondary, fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</p>;
  }

  return (
    <div>
      <p style={{
        color: t.textSecondary, fontSize: '14px', lineHeight: 1.6, whiteSpace: 'pre-wrap',
        ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: maxLines, WebkitBoxOrient: 'vertical', overflow: 'hidden' })
      }}>
        {text}
      </p>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ background: 'none', border: 'none', color: t.textTertiary, fontSize: '12px', cursor: 'pointer', padding: '4px 0', marginTop: '4px' }}
      >
        {expanded ? '← Show less' : 'Read more →'}
      </button>
    </div>
  );
};

// ============================================
// LINK LABEL HELPER
// ============================================
function getLinkLabel(url) {
  let hostname;
  try { hostname = new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  const labels = {
    'github.com': 'GitHub',
    'twitter.com': 'Twitter',
    'x.com': 'Twitter',
    'youtube.com': 'YouTube',
    'youtu.be': 'YouTube',
    'yourstory.com': 'Press',
    'thebetterindia.com': 'Press',
    'techcrunch.com': 'Press',
    'producthunt.com': 'Product Hunt',
    'play.google.com': 'Play Store',
    'apps.apple.com': 'App Store',
    'instagram.com': 'Instagram',
    't.me': 'Telegram',
    'discord.gg': 'Discord',
    'linkedin.com': 'LinkedIn',
    'medium.com': 'Blog',
    'substack.com': 'Substack',
    'vercel.app': 'Demo',
    'netlify.app': 'Demo',
    'herokuapp.com': 'Demo',
  };
  for (const [domain, label] of Object.entries(labels)) {
    if (hostname.includes(domain)) return label;
  }
  return hostname;
}

// ============================================
// TIMELINE VIEW
// ============================================
const TimelineView = ({ projects }) => {
  const projectsWithDates = projects.filter(p => p.startDate);
  if (projectsWithDates.length === 0) return <div style={{ color: t.textFaint, padding: '24px', textAlign: 'center' }}>No date information available for timeline view.</div>;

  const sorted = [...projectsWithDates].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || ''));
  const minYear = parseInt(sorted[0].startDate?.slice(0, 4) || new Date().getFullYear());
  const maxYear = new Date().getFullYear();
  const totalYears = maxYear - minYear + 1;

  return (
    <div style={{ overflowX: 'auto', padding: '16px 0' }}>
      {/* Year markers */}
      <div style={{ display: 'flex', position: 'relative', minWidth: `${totalYears * 120}px`, marginBottom: '8px' }}>
        {Array.from({ length: totalYears }, (_, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'left', fontSize: '11px', color: t.textFaint, borderLeft: '1px solid rgba(255,255,255,0.06)', paddingLeft: '8px' }}>
            {minYear + i}
          </div>
        ))}
      </div>

      {/* Project bars */}
      <div style={{ position: 'relative', minWidth: `${totalYears * 120}px` }}>
        {sorted.map((project) => {
          const startMonth = ((parseInt(project.startDate?.slice(0, 4) || minYear) - minYear) * 12) + (parseInt(project.startDate?.slice(5, 7) || 1) - 1);
          const endMonth = project.ongoing
            ? (maxYear - minYear + 1) * 12
            : project.endDate
              ? ((parseInt(project.endDate.slice(0, 4)) - minYear) * 12) + parseInt(project.endDate.slice(5, 7))
              : startMonth + 6;
          const totalMonths = totalYears * 12;
          const leftPct = (startMonth / totalMonths) * 100;
          const widthPct = Math.max(((endMonth - startMonth) / totalMonths) * 100, 2);

          const stage = stages.find(s => s.key === project.currentStage);

          return (
            <div key={project.id} style={{ position: 'relative', height: '36px', marginBottom: '4px' }}>
              <div
                title={`${project.name} — ${project.oneLiner}`}
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  height: '28px',
                  background: `${stage?.color || '#57534e'}20`,
                  border: `1px solid ${stage?.color || '#57534e'}40`,
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 10px',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  cursor: 'default',
                  top: '4px'
                }}
              >
                {project.ongoing && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.success, marginRight: '6px', flexShrink: 0 }} />}
                <span style={{ fontSize: '12px', fontWeight: '500', color: stage?.color || '#a8a29e', overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.name}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================
// PROFILE VIEW (Public)
// ============================================
const ProfileView = ({ user, isOwner, onBack, onEdit, onShare }) => {
  const [showAllUpdates, setShowAllUpdates] = useState(false);
  const [updates, setUpdates] = useState(user.updates || []);
  const [projectViewMode, setProjectViewMode] = useState('list'); // 'list' | 'timeline'
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactMsg, setContactMsg] = useState({ name: '', email: '', message: '' });
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const PROFILE_UPDATES_LIMIT = 5;

  const handleContactSubmit = async () => {
    if (!contactMsg.message.trim()) return;
    setContactSending(true);
    try {
      const res = await fetch('/api/contact-maker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: user.contactEmail,
          toUsername: user.username,
          senderName: contactMsg.name,
          senderEmail: contactMsg.email,
          message: contactMsg.message,
        }),
      });
      if (!res.ok) throw new Error('Failed to send');
      track('contact_form_submitted', { toUsername: user.username, hasReplyEmail: !!contactMsg.email });
      setContactSent(true);
      setContactMsg({ name: '', email: '', message: '' });
    } catch {
      alert('Failed to send message. Please try again.');
    } finally {
      setContactSending(false);
    }
  };

  // Load updates for the logged-in user (they're not on the user object)
  useEffect(() => {
    if (isOwner && (!user.updates || user.updates.length === 0)) {
      db.getUpdatesByUserId(user.id).then(setUpdates).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isOwner]);

  // Update page title
  useEffect(() => {
    document.title = `${user.name || user.username} — Maker Portfolio`;
    return () => { document.title = 'Maker Portfolio — The portfolio for people who make things'; };
  }, [user.name, user.username]);

  // Hero stats: profile-level overrides take precedence, fall back to per-project sums
  const totalRaised = user.totalRaised ?? user.projects.reduce((sum, p) => sum + (p.fundingRaised || 0), 0);
  const totalValuation = user.totalValuation ?? user.projects.reduce((sum, p) => sum + (p.valuation || 0), 0);
  const totalUsers = user.totalUsers ?? user.projects.reduce((sum, p) => sum + (p.usersReached || 0), 0);
  const heroStats = [
    totalRaised > 0 && { label: 'raised', value: formatCurrency(totalRaised), raw: totalRaised, color: t.accent },
    totalValuation > 0 && { label: 'valuation', value: formatCurrency(totalValuation), raw: totalValuation, color: t.accent },
    totalUsers > 0 && { label: 'users', value: formatNumber(totalUsers), raw: totalUsers, color: t.text },
    user.projects.length > 0 && { label: 'things made', value: user.projects.length, raw: user.projects.length, color: t.text },
  ].filter(Boolean);

  const stats = [
    { label: "Things made", value: user.projects.length, color: t.text },
    { label: "Reached users", value: user.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 4).length, color: t.orange },
    { label: "Reached paying", value: user.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 5).length, color: t.pink },
    { label: "Funded", value: user.projects.filter(p => p.currentStage === 'funded').length, color: t.purple },
    { label: "Acquisitions", value: user.projects.filter(p => p.currentStage === 'acquired').length, color: t.cyan },
  ].filter(s => s.value > 0 || s.label === 'Things made');

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header className="desktop-header" style={{ padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-ghost" onClick={onBack}>← Back</button>
          <span className="hide-mobile" style={{ fontSize: '14px', letterSpacing: '0.1em', color: t.textFaint }}>makerly.me/{user.username}</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {!isOwner && user.showEmail && user.contactEmail && (
            <button className="btn btn-primary" onClick={() => { setShowContactForm(f => { if (!f) track('contact_form_opened', { toUsername: user.username }); return !f; }); setContactSent(false); }} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {showContactForm ? 'Close' : 'Contact'}
            </button>
          )}
          {isOwner && (
            <>
              <button className="btn btn-primary" onClick={onShare} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span aria-hidden="true">↗</span> Share
              </button>
              <button className="btn btn-secondary" onClick={onEdit}>Edit</button>
            </>
          )}
        </div>
      </header>

      {/* Contact Form */}
      {showContactForm && (
        <div style={{ borderBottom: `1px solid ${t.surfaceBorder}`, padding: '24px 40px', background: t.surfaceRaised }}>
          <div style={{ maxWidth: '500px', margin: '0 auto' }}>
            {contactSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '18px', marginBottom: '8px' }}>Message sent</div>
                <p style={{ fontSize: '13px', color: t.textSecondary }}>{user.name || user.username} will receive your message via email.</p>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: '14px', color: t.textTertiary, marginBottom: '16px' }}>Send a message to {user.name || user.username}</h3>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                  <input
                    className="input"
                    placeholder="Your name"
                    value={contactMsg.name}
                    onChange={e => setContactMsg(m => ({ ...m, name: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                  <input
                    className="input"
                    type="email"
                    placeholder="Your email (for reply)"
                    value={contactMsg.email}
                    onChange={e => setContactMsg(m => ({ ...m, email: e.target.value }))}
                    style={{ flex: 1 }}
                  />
                </div>
                <textarea
                  className="input"
                  placeholder="Your message..."
                  value={contactMsg.message}
                  onChange={e => setContactMsg(m => ({ ...m, message: e.target.value }))}
                  rows={4}
                  maxLength={2000}
                  style={{ width: '100%', resize: 'vertical', marginBottom: '12px' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: t.textFaint }}>{contactMsg.message.length}/2000</span>
                  <button
                    className="btn btn-primary"
                    onClick={handleContactSubmit}
                    disabled={contactSending || !contactMsg.message.trim()}
                  >
                    {contactSending ? 'Sending...' : 'Send message'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="profile-container" style={{ padding: '60px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Profile Header */}
        <div className="desktop-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '60px', marginBottom: '60px' }}>
          <div>
            {/* Latest Update */}
            {user.todayMaking && (
              <div style={{ marginBottom: '24px', padding: '12px 16px', background: t.successBgSubtle, border: `1px solid ${t.successBorder}`, borderRadius: t.radiusSm }}>
                <span style={{ fontSize: '11px', color: t.success, fontWeight: '500' }}>LATEST: </span>
                <span style={{ color: t.textSecondary }}>{user.todayMaking}</span>
              </div>
            )}

            <h1 className="profile-name" style={{ fontSize: '48px', fontFamily: t.fontHeading, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
              {user.name || user.username}
              {user.crackedSquad && (
                <span style={{
                  fontSize: '11px',
                  fontFamily: t.fontBody,
                  letterSpacing: '0.1em',
                  fontWeight: '600',
                  color: t.error,
                  background: 'rgba(239,68,68,0.1)',
                  border: '1px solid rgba(239,68,68,0.25)',
                  padding: '4px 12px',
                  borderRadius: '16px',
                  whiteSpace: 'nowrap'
                }}>CRACKED SQUAD</span>
              )}
            </h1>
            {user.bio && <p style={{ fontSize: '18px', color: t.textSecondary, marginBottom: '32px', lineHeight: 1.5 }}>{user.bio}</p>}

            {/* Philosophy */}
            {user.philosophy && (
              <p style={{ fontSize: '16px', fontFamily: t.fontHeading, fontStyle: 'italic', color: t.textSecondary, marginBottom: '32px', lineHeight: 1.5 }}>
                "{user.philosophy}"
              </p>
            )}

            {/* First Make */}
            {user.firstMake?.description && (
              <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(251,191,36,0.02) 100%)', border: `1px solid ${t.accentBorder}`, borderRadius: t.radiusMd, padding: '20px 24px', marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.accent, marginBottom: '8px', fontWeight: '500' }}>FIRST MAKE {user.firstMake.age && `· AGE ${user.firstMake.age}`}</div>
                <p style={{ fontSize: '16px', fontFamily: t.fontHeading, lineHeight: 1.5 }}>"{user.firstMake.description}"</p>
              </div>
            )}

            {/* Domains */}
            {user.domains?.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
                {user.domains.map(d => (
                  <span key={d} className="tag" style={{ background: t.accentBg, border: '1px solid rgba(251,191,36,0.3)', color: t.accent }}>{d}</span>
                ))}
              </div>
            )}

            {/* Social Links */}
            {Object.values(user.socials || {}).some(v => v) && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {user.socials?.twitter && (
                  <a href={user.socials.twitter.includes('.') ? ensureUrl(user.socials.twitter) : `https://twitter.com/${user.socials.twitter.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>𝕏</span> Twitter
                  </a>
                )}
                {user.socials?.github && (
                  <a href={user.socials.github.includes('.') ? ensureUrl(user.socials.github) : `https://github.com/${user.socials.github}`} target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>◐</span> GitHub
                  </a>
                )}
                {user.socials?.linkedin && (
                  <a href={user.socials.linkedin.includes('.') ? ensureUrl(user.socials.linkedin) : `https://linkedin.com/in/${user.socials.linkedin}`} target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>in</span> LinkedIn
                  </a>
                )}
                {user.socials?.substack && (
                  <a href={user.socials.substack.includes('.') ? ensureUrl(user.socials.substack) : `https://${user.socials.substack}.substack.com`} target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>◉</span> Substack
                  </a>
                )}
                {user.socials?.website && (
                  <a href={ensureUrl(user.socials.website)} target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span aria-hidden="true">↗</span> Website
                  </a>
                )}
              </div>
            )}

            {/* Press / Social Proof */}
            {user.pressLinks?.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '12px' }}>AS SEEN IN</div>
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  {user.pressLinks.map((link, i) => (
                    <a key={i} href={ensureUrl(link.url)} target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span aria-hidden="true">↗</span> {link.source || link.title || getLinkLabel(link.url)}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Stats */}
          <div>
            {/* Hero Stats */}
            {heroStats.length > 0 && (
              <div className="card" style={{ padding: '24px', marginBottom: '16px' }} aria-label="Maker statistics">
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '16px' }}>HEADLINE STATS</div>
                <div style={{ display: 'grid', gridTemplateColumns: heroStats.length === 1 ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  {heroStats.map(stat => (
                    <div key={stat.label}>
                      <div style={{ fontSize: '28px', fontWeight: '700', fontFamily: t.fontHeading, color: stat.color }} aria-label={`${stat.value} ${stat.label}`}>
                        {stat.value}
                      </div>
                      <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, marginTop: '4px' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Outcomes */}
            <div className="card" style={{ padding: '20px 24px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '16px' }}>OUTCOMES</div>
              {stats.map(stat => (
                <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: t.textTertiary, fontSize: '13px' }}>{stat.label}</span>
                  <span style={{ fontSize: '18px', fontWeight: '600', color: stat.color }}>{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Embed Feed */}
        {user.embedFeed?.type && user.embedFeed?.url && (
          <div className="card" style={{ padding: '24px', marginBottom: '48px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '16px' }}>
              {user.embedFeed.type === 'twitter' ? 'LATEST TWEETS' : 'LATEST POSTS'}
            </div>
            {user.embedFeed.type === 'twitter' ? (
              <TwitterEmbed username={user.embedFeed.url.replace('@', '')} />
            ) : (
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: t.radiusSm, padding: '24px', textAlign: 'center', color: t.textFaint }}>
                <p style={{ marginBottom: '12px' }}>Substack feed from {user.embedFeed.url}</p>
                <a href={user.embedFeed.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                  View on Substack ↗
                </a>
              </div>
            )}
          </div>
        )}

        {/* Updates Timeline */}
        {updates?.length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '16px' }}>
              UPDATES ({updates.length})
            </div>
            <div style={{ borderLeft: '2px solid rgba(74, 222, 128, 0.2)', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(showAllUpdates ? updates : updates.slice(0, PROFILE_UPDATES_LIMIT)).map((update) => (
                <div key={update.id} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '-27px', top: '6px', width: '10px', height: '10px', borderRadius: '50%', background: t.surface, border: '2px solid rgba(74, 222, 128, 0.4)' }} />
                  <div style={{ color: t.textMuted, fontSize: '14px', lineHeight: 1.5 }}>{update.content}</div>
                  <div style={{ fontSize: '11px', color: t.textFaint, marginTop: '4px' }}>
                    {new Date(update.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
            {!showAllUpdates && updates.length > PROFILE_UPDATES_LIMIT && (
              <button
                className="btn btn-ghost"
                onClick={() => setShowAllUpdates(true)}
                style={{ marginTop: '12px', fontSize: '13px' }}
              >
                Show all {updates.length} updates
              </button>
            )}
          </div>
        )}

        {/* Featured Projects */}
        {user.projects.filter(p => p.featured).length > 0 && (
          <div style={{ marginBottom: '48px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, marginBottom: '16px' }}>FEATURED</div>
            <div style={{ display: 'grid', gridTemplateColumns: user.projects.filter(p => p.featured).length === 1 ? '1fr' : '1fr 1fr', gap: '16px' }}>
              {user.projects.filter(p => p.featured).map(project => {
                const stageIndex = stages.findIndex(s => s.key === project.currentStage);
                const stage = stages[stageIndex];
                const role = roles.find(r => r.key === project.role);
                return (
                  <div key={project.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {project.imageUrl && (
                      <div style={{ width: '100%', height: '180px', overflow: 'hidden' }}>
                        <img src={safeImageUrl(project.imageUrl)} alt={project.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                    )}
                    <div style={{ padding: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <h3 style={{ fontSize: '20px', fontWeight: '600', fontFamily: t.fontHeading }}>{project.name}</h3>
                        {project.ongoing && <span className="ongoing-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.success }} />}
                      </div>
                      <p style={{ color: t.textSecondary, fontSize: '15px', marginBottom: '12px' }}>{project.oneLiner}</p>

                      {/* Key metric callout */}
                      {project.keyMetric && (
                        <div style={{ padding: '10px 14px', background: 'rgba(74, 222, 128, 0.08)', border: `1px solid ${t.successBorder}`, borderRadius: t.radiusSm, marginBottom: '12px' }}>
                          <span style={{ fontSize: '16px', fontWeight: '600', color: t.success }}>{project.keyMetric}</span>
                        </div>
                      )}

                      {/* Outcome */}
                      {project.outcome && (
                        <div style={{ padding: '8px 12px', background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: t.radiusSm, marginBottom: '12px' }}>
                          <span style={{ fontSize: '11px', letterSpacing: '0.05em', color: t.accent, fontWeight: '500' }}>OUTCOME: </span>
                          <span style={{ color: t.accent, fontSize: '14px' }}>{project.outcome}</span>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                        <span className="tag" style={{ background: `${role?.color}20`, color: role?.color }}>{role?.label}</span>
                        <span className="tag" style={{ background: `${stage?.color}20`, color: stage?.color }}>{stage?.label}</span>
                        {project.startDate && (
                          <span className="tag" style={{ background: t.surfaceBgHover, color: t.textTertiary }}>
                            {project.startDate.slice(0, 4)}{project.endDate ? `–${project.endDate.slice(0, 4)}` : project.ongoing ? '–now' : ''}
                          </span>
                        )}
                      </div>

                      {project.links?.length > 0 && (
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {project.links.map(link => (
                            <a key={link} href={link} target="_blank" rel="noopener noreferrer" style={{ color: t.accent, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                              ↗ {getLinkLabel(link)}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Projects */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint }}>
              PROJECTS ({user.projects.length})
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setProjectViewMode('list')}
                style={{ background: projectViewMode === 'list' ? 'rgba(255,255,255,0.08)' : 'none', border: `1px solid ${t.surfaceBorderLight}`, borderRadius: '6px', padding: '4px 10px', fontSize: '11px', color: projectViewMode === 'list' ? t.text : t.textFaint, cursor: 'pointer' }}
              >
                List
              </button>
              <button
                onClick={() => setProjectViewMode('timeline')}
                style={{ background: projectViewMode === 'timeline' ? 'rgba(255,255,255,0.08)' : 'none', border: `1px solid ${t.surfaceBorderLight}`, borderRadius: '6px', padding: '4px 10px', fontSize: '11px', color: projectViewMode === 'timeline' ? t.text : t.textFaint, cursor: 'pointer' }}
              >
                Timeline
              </button>
            </div>
          </div>

          {user.projects.length === 0 ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center', color: t.textFaint }}>
              No projects yet
            </div>
          ) : projectViewMode === 'timeline' ? (
            <div className="card" style={{ padding: '20px 24px' }}>
              <TimelineView projects={user.projects} />
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {user.projects.filter(p => !p.featured).map((project, idx, arr) => {
                const stageIndex = stages.findIndex(s => s.key === project.currentStage);
                const stage = stages[stageIndex];
                const role = roles.find(r => r.key === project.role);

                return (
                  <div key={project.id} style={{ padding: '20px 24px', borderBottom: idx < arr.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    {/* Cover image */}
                    {project.imageUrl && (
                      <div style={{ marginBottom: '12px', borderRadius: t.radiusSm, overflow: 'hidden', maxHeight: '160px' }}>
                        <img src={safeImageUrl(project.imageUrl)} alt={project.name} style={{ width: '100%', height: '160px', objectFit: 'cover' }} />
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{project.name}</h3>
                          {project.ongoing && <span className="ongoing-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.success }} />}
                          <span className="tag" style={{ background: `${role?.color}20`, color: role?.color }}>{role?.label}</span>
                          {project.startDate && (
                            <span style={{ fontSize: '12px', color: t.textFaint }}>
                              {project.startDate.slice(0, 4)}{project.endDate ? `–${project.endDate.slice(0, 4)}` : project.ongoing ? '–now' : ''}
                            </span>
                          )}
                        </div>
                        <p style={{ color: t.textTertiary, fontSize: '14px' }}>{project.oneLiner}</p>
                      </div>
                      <span className="tag" style={{ background: `${stage?.color}20`, color: stage?.color }}>{stage?.label}</span>
                    </div>

                    {/* Stage dots — larger, with current stage label */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '10px' }}>
                      {stages.map((s, i) => (
                        <React.Fragment key={s.key}>
                          <div
                            title={s.label}
                            style={{
                              width: i === stageIndex ? '14px' : '10px',
                              height: i === stageIndex ? '14px' : '10px',
                              borderRadius: '50%',
                              background: i <= stageIndex ? s.color : 'rgba(255,255,255,0.08)',
                              boxShadow: i === stageIndex ? `0 0 10px ${s.color}50` : 'none',
                              transition: 'all 0.2s'
                            }}
                          />
                          {i < stages.length - 1 && <div style={{ width: '8px', height: '2px', background: i < stageIndex ? stages[i + 1].color : 'rgba(255,255,255,0.06)' }} />}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Key metric callout */}
                    {project.keyMetric && (
                      <div style={{ display: 'inline-block', padding: '6px 12px', background: 'rgba(74, 222, 128, 0.08)', border: `1px solid ${t.successBorder}`, borderRadius: '6px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: '600', color: t.success }}>{project.keyMetric}</span>
                      </div>
                    )}

                    {/* Outcome */}
                    {project.outcome && (
                      <div style={{ display: 'inline-block', padding: '6px 12px', background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)', borderRadius: '6px', marginBottom: '10px', marginLeft: project.keyMetric ? '8px' : 0 }}>
                        <span style={{ fontSize: '11px', letterSpacing: '0.05em', color: t.accent, fontWeight: '500' }}>OUTCOME </span>
                        <span style={{ color: t.accent, fontSize: '13px' }}>{project.outcome}</span>
                      </div>
                    )}

                    {/* Per-project domains */}
                    {project.domains?.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                        {project.domains.map(d => (
                          <span key={d} className="tag" style={{ background: 'rgba(255,255,255,0.04)', color: t.textTertiary, fontSize: '11px', padding: '2px 8px' }}>{d}</span>
                        ))}
                      </div>
                    )}

                    {/* Collapsible description */}
                    {project.description && (
                      <div style={{ marginBottom: '10px' }}>
                        <CollapsibleDescription text={project.description} />
                      </div>
                    )}

                    {/* Project links with labels */}
                    {project.links?.length > 0 && (
                      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {project.links.map(link => (
                          <a key={link} href={link} target="_blank" rel="noopener noreferrer" style={{ color: t.accent, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            ↗ {getLinkLabel(link)}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <SiteFooter />
    </div>
  );
};

// ============================================
// ONBOARDING (post-signup)
// ============================================
const Onboarding = ({ user, setUser, onComplete, showNotification }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(user.name || '');
  const [firstMakeDesc, setFirstMakeDesc] = useState('');
  const [firstMakeAge, setFirstMakeAge] = useState('');
  const [todayMaking, setTodayMaking] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    try {
      const updates = {};
      if (name.trim()) updates.name = name.trim();
      if (firstMakeDesc.trim() || firstMakeAge.trim()) {
        updates.firstMake = { description: firstMakeDesc.trim(), age: firstMakeAge.trim() };
      }
      if (todayMaking.trim()) updates.todayMaking = todayMaking.trim();

      if (Object.keys(updates).length > 0) {
        await db.updateProfile(user.id, updates);
        setUser(prev => ({ ...prev, ...updates }));
      }
      onComplete();
    } catch (err) {
      console.error('Onboarding save error:', err);
      showNotification('Failed to save — you can fill this in later', 'error');
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    // Step 0: Welcome / Name
    () => (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>&#9733;</div>
        <div style={{
          width: '80px', height: '4px', borderRadius: '2px', margin: '0 auto 32px',
          background: 'linear-gradient(90deg, #fbbf24, #f472b6, #a78bfa)'
        }} />
        <h1 style={{ fontSize: '36px', fontFamily: t.fontHeading, marginBottom: '12px' }}>
          Welcome to Makerly.
        </h1>
        <p style={{ color: t.textTertiary, fontSize: '15px', lineHeight: 1.6, marginBottom: '40px', maxWidth: '400px', margin: '0 auto 40px' }}>
          You just joined a community of people who build things.<br />
          Let's set up your profile in 60 seconds.
        </p>
        <div style={{ maxWidth: '360px', margin: '0 auto' }}>
          <label htmlFor="onboard-name" style={{ display: 'block', fontSize: '12px', color: t.textFaint, letterSpacing: '0.1em', marginBottom: '8px', textAlign: 'left' }}>WHAT SHOULD WE CALL YOU?</label>
          <input
            id="onboard-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            style={{
              width: '100%',
              padding: '16px',
              background: t.surfaceBgHover,
              border: `1px solid ${t.surfaceBorderHover}`,
              borderRadius: t.radiusMd,
              color: t.text,
              fontSize: '18px',
              textAlign: 'center'
            }}
            onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(1)}
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setStep(1)}
          disabled={!name.trim()}
          style={{ marginTop: '32px', padding: '14px 48px', fontSize: '15px' }}
        >
          Next
        </button>
      </div>
    ),

    // Step 1: First Make (the emotional hook)
    () => (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>&#10024;</div>
        <div style={{
          width: '80px', height: '4px', borderRadius: '2px', margin: '0 auto 32px',
          background: 'linear-gradient(90deg, #fbbf24 33%, rgba(255,255,255,0.1) 33%)'
        }} />
        <h1 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginBottom: '12px' }}>
          What was the first thing you ever made?
        </h1>
        <p style={{ color: t.textTertiary, fontSize: '14px', lineHeight: 1.6, marginBottom: '36px', maxWidth: '440px', margin: '0 auto 36px' }}>
          A paper airplane. A birthday card. A birdhouse. A terrible website.<br />
          <span style={{ color: t.textSecondary }}>This is where it all started.</span>
        </p>
        <div style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'left' }}>
          <label htmlFor="onboard-firstmake" className="sr-only">Describe your first make</label>
          <textarea
            id="onboard-firstmake"
            value={firstMakeDesc}
            onChange={e => setFirstMakeDesc(e.target.value)}
            placeholder="I built a..."
            autoFocus
            rows={3}
            style={{
              width: '100%',
              padding: '16px',
              background: t.surfaceBgHover,
              border: `1px solid ${t.surfaceBorderHover}`,
              borderRadius: t.radiusMd,
              color: t.text,
              fontSize: '15px',
              resize: 'none',
              lineHeight: 1.5
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', flexWrap: 'wrap' }}>
            <label htmlFor="onboard-age" style={{ fontSize: '12px', color: t.textFaint }}>HOW OLD WERE YOU?</label>
            <input
              id="onboard-age"
              type="number"
              min="1"
              max="120"
              value={firstMakeAge}
              onChange={e => setFirstMakeAge(e.target.value)}
              placeholder="e.g. 7"
              style={{
                width: '80px',
                padding: '12px',
                background: t.surfaceBgHover,
                border: `1px solid ${t.surfaceBorderHover}`,
                borderRadius: '10px',
                color: t.text,
                fontSize: '15px',
                textAlign: 'center'
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '32px' }}>
          <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>
          <button
            className="btn btn-primary"
            onClick={() => setStep(2)}
            style={{ padding: '14px 48px', fontSize: '15px' }}
          >
            Next
          </button>
        </div>
      </div>
    ),

    // Step 2: What are you making right now?
    () => (
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>&#9889;</div>
        <div style={{
          width: '80px', height: '4px', borderRadius: '2px', margin: '0 auto 32px',
          background: 'linear-gradient(90deg, #fbbf24 66%, rgba(255,255,255,0.1) 66%)'
        }} />
        <h1 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginBottom: '12px' }}>
          What are you making right now?
        </h1>
        <p style={{ color: t.textTertiary, fontSize: '14px', lineHeight: 1.6, marginBottom: '36px', maxWidth: '440px', margin: '0 auto 36px' }}>
          Could be anything. An app, a song, a zine, a robot, a business.<br />
          <span style={{ color: t.textSecondary }}>This shows up live on your profile.</span>
        </p>
        <div style={{ maxWidth: '400px', margin: '0 auto' }}>
          <label htmlFor="onboard-making" className="sr-only">What are you making right now?</label>
          <input
            id="onboard-making"
            type="text"
            value={todayMaking}
            onChange={e => setTodayMaking(e.target.value)}
            placeholder="Building a..."
            autoFocus
            style={{
              width: '100%',
              padding: '16px',
              background: t.surfaceBgHover,
              border: `1px solid ${t.surfaceBorderHover}`,
              borderRadius: t.radiusMd,
              color: t.text,
              fontSize: '18px',
              textAlign: 'center'
            }}
            onKeyDown={e => e.key === 'Enter' && handleFinish()}
          />
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '32px' }}>
          <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
          <button
            className="btn btn-primary"
            onClick={handleFinish}
            disabled={saving}
            style={{ padding: '14px 48px', fontSize: '15px' }}
          >
            {saving ? 'Saving...' : todayMaking.trim() ? "Let's go" : 'Skip & finish'}
          </button>
        </div>
      </div>
    ),
  ];

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px'
      }}>
        <div style={{ maxWidth: '500px', width: '100%' }}>
          {steps[step]()}
          <button
            className="btn btn-ghost"
            onClick={handleFinish}
            style={{ display: 'block', margin: '40px auto 0', fontSize: '12px', color: t.textFaint }}
          >
            Skip setup — go to dashboard
          </button>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
};

// ============================================
// SHARE MODAL
// ============================================
const ShareModal = ({ username, todayMaking, onClose, showNotification }) => {
  const profileUrl = `makerly.me/${username}`;
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`https://${profileUrl}`);
      setCopied(true);
      track('profile_shared', { platform: 'copy_link', username });
      showNotification('Link copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showNotification('Could not copy — try manually', 'error');
    }
  };

  const shareTo = (platform, url) => {
    track('profile_shared', { platform, username });
    window.open(url, '_blank');
  };

  const shareOptions = [
    { name: 'Twitter / X', icon: '𝕏', action: () => shareTo('twitter', `https://twitter.com/intent/tweet?text=Check out my maker profile&url=https://${profileUrl}`) },
    { name: 'LinkedIn', icon: 'in', action: () => shareTo('linkedin', `https://www.linkedin.com/sharing/share-offsite/?url=https://${profileUrl}`) },
    { name: 'WhatsApp', icon: 'W', action: () => shareTo('whatsapp', `https://wa.me/?text=Check out my maker profile: https://${profileUrl}`) },
    { name: 'Email', icon: '@', action: () => shareTo('email', `mailto:?subject=Check out my maker profile&body=https://${profileUrl}`) },
  ];

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="share-modal-title">
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 id="share-modal-title" style={{ fontSize: '24px', fontFamily: t.fontHeading, marginBottom: '8px' }}>Share your profile</h2>
        <p style={{ color: t.textTertiary, marginBottom: '16px' }}>Let people see what you've built</p>

        {/* Currently Making */}
        {todayMaking && (
          <div style={{ background: t.successBgSubtle, border: `1px solid ${t.successBorder}`, borderRadius: t.radiusSm, padding: '10px 14px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.success, flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: t.textSecondary }}>
              <span style={{ color: t.success, fontWeight: '500' }}>Making: </span>{todayMaking}
            </span>
          </div>
        )}

        {/* URL Preview */}
        <div style={{ background: t.surfaceBgHover, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, padding: '12px 16px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ color: t.textSecondary, fontSize: '14px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>https://{profileUrl}</span>
          <button className="btn btn-primary" onClick={copyLink} style={{ padding: '8px 16px', flexShrink: 0 }}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        {/* Share Options */}
        <div className="share-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
          {shareOptions.map(option => (
            <button key={option.name} className="social-btn" onClick={option.action}>
              <span style={{ fontSize: '16px', width: '20px', textAlign: 'center' }}>{option.icon}</span>
              <span style={{ color: t.text }}>{option.name}</span>
            </button>
          ))}
        </div>

        <button className="btn btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: '20px' }}>Close</button>
      </div>
    </div>
  );
};

// ============================================
// ADMIN PANEL
// ============================================
const MakerDirectory = ({ currentUser, onViewProfile, onBack, onLogin, onHire }) => {
  const [makers, setMakers] = useState([]);
  const [recentUpdates, setRecentUpdates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [crackedOnly, setCrackedOnly] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [makerList, updates] = await Promise.all([
          db.getPublicMakers(),
          db.getRecentUpdates(30)
        ]);
        // Score by profile quality, not just project count
        const score = (m) => {
          let s = 0;
          // Profile completeness (max 30)
          if (m.name) s += 5;
          if (m.bio && m.bio.length > 20) s += 10;
          else if (m.bio) s += 3;
          if (m.firstMake?.description) s += 5;
          if (m.domains?.length > 0) s += 5;
          if (m.socials && Object.values(m.socials).some(v => v)) s += 5;
          // Has projects, but cap the bonus (max 15)
          const pc = Math.min(m.projectCount || 0, 3);
          s += pc * 5;
          // Active right now (max 15)
          if (m.todayMaking) s += 15;
          // Recent activity (max 10)
          if (m.lastActivity) {
            const daysAgo = (Date.now() - new Date(m.lastActivity).getTime()) / 86400000;
            if (daysAgo < 1) s += 10;
            else if (daysAgo < 7) s += 7;
            else if (daysAgo < 30) s += 3;
          }
          return s;
        };
        const sorted = makerList.sort((a, b) => score(b) - score(a));
        setMakers(sorted);
        setRecentUpdates(updates);
      } catch (err) {
        console.error('Failed to load directory:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = makers.filter(m => {
    if (crackedOnly && !m.crackedSquad) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (m.name || '').toLowerCase().includes(q) ||
           (m.username || '').toLowerCase().includes(q) ||
           (m.domains || []).some(d => d.toLowerCase().includes(q)) ||
           (m.bio || '').toLowerCase().includes(q);
  });

  const formatRelative = (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ color: t.textSecondary, fontSize: '14px' }}>Loading makers...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="directory-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px', flex: 1 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontFamily: t.fontHeading, color: t.text, margin: 0 }}>Maker Directory</h1>
          <p style={{ color: t.textFaint, fontSize: '13px', marginTop: '4px' }}>{makers.length} people who build things</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {onHire && <button className="btn btn-ghost" onClick={onHire} style={{ color: t.accent }}>Hiring?</button>}
          {currentUser ? (
            <button className="btn btn-ghost" onClick={onBack}>Dashboard</button>
          ) : (
            <button className="btn btn-primary" onClick={onLogin}>Join</button>
          )}
        </div>
      </div>

      <div className="maker-directory-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '32px', alignItems: 'start' }}>
        {/* Main: Maker Cards */}
        <div>
          {/* Search */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <label htmlFor="maker-search" className="sr-only">Search makers</label>
            <input
              id="maker-search"
              type="text"
              placeholder="Search makers, domains..."
              value={filter}
              onChange={e => setFilter(e.target.value)}
              style={{
                flex: 1,
                padding: '12px 16px',
                background: t.surfaceBgHover,
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: t.radiusSm,
                color: t.text,
                fontSize: '14px'
              }}
            />
            <button
              onClick={() => setCrackedOnly(!crackedOnly)}
              style={{
                padding: '8px 14px',
                borderRadius: t.radiusSm,
                border: `1px solid ${crackedOnly ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
                background: crackedOnly ? 'rgba(239,68,68,0.1)' : 'transparent',
                color: crackedOnly ? t.error : t.textFaint,
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s'
              }}
            >
              CRACKED SQUAD
            </button>
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: t.textFaint }}>
              {filter ? 'No makers match your search' : 'No makers yet'}
            </div>
          )}

          <div aria-label="Makers" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {filtered.map(maker => (
              <div
                key={maker.id}
                role="button"
                onClick={() => onViewProfile(maker.username)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewProfile(maker.username); } }}
                tabIndex={0}
                aria-label={`View ${maker.name || maker.username}'s profile`}
                style={{
                  background: t.surfaceBg,
                  border: `1px solid ${t.surfaceBorder}`,
                  borderRadius: t.radiusMd,
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '500', color: t.text }}>{maker.name || maker.username}</span>
                      {maker.crackedSquad && (
                        <span style={{ fontSize: '9px', letterSpacing: '0.05em', fontWeight: '600', color: t.error, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '2px 6px', borderRadius: '8px', whiteSpace: 'nowrap' }}>CRACKED</span>
                      )}
                      {maker.todayMaking && (
                        <span className="ongoing-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.success, flexShrink: 0 }} />
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: t.textFaint, marginTop: '2px' }}>makerly.me/{maker.username}</div>
                  </div>
                  {maker.projectCount > 0 && (
                    <span style={{ fontSize: '13px', color: t.accent, fontWeight: '500', whiteSpace: 'nowrap' }}>
                      {maker.projectCount} made
                    </span>
                  )}
                </div>
                {maker.bio && (
                  <p style={{ color: t.textSecondary, fontSize: '13px', marginTop: '8px', lineHeight: '1.5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {maker.bio}
                  </p>
                )}
                {maker.todayMaking && (
                  <div style={{ marginTop: '10px', padding: '6px 10px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: '6px', fontSize: '12px', color: t.textSecondary }}>
                    <span style={{ color: t.success, fontWeight: '500' }}>Building now:</span> {maker.todayMaking}
                  </div>
                )}
                {maker.domains?.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {maker.domains.slice(0, 4).map(d => (
                      <span key={d} style={{ fontSize: '11px', color: t.textFaint, background: t.surfaceBgHover, padding: '2px 8px', borderRadius: t.radiusSm }}>{d}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar: Latest Updates */}
        <div style={{
          background: t.surfaceBg,
          border: `1px solid ${t.surfaceBorder}`,
          borderRadius: t.radiusMd,
          padding: '20px',
          position: 'sticky',
          top: '24px'
        }}>
          <h3 style={{ fontSize: '14px', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '16px' }}>Latest Updates</h3>
          {recentUpdates.length === 0 ? (
            <p style={{ color: t.textFaint, fontSize: '13px' }}>No updates yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
              {recentUpdates.map((update, i) => (
                <div key={update.id} style={{
                  padding: '12px 0',
                  borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span
                      onClick={() => onViewProfile(update.username)}
                      style={{ fontSize: '12px', color: t.textSecondary, cursor: 'pointer', fontWeight: '500' }}
                      onMouseOver={e => e.target.style.color = t.text}
                      onMouseOut={e => e.target.style.color = t.textSecondary}
                    >
                      {update.name}
                    </span>
                    <span style={{ fontSize: '11px', color: t.textFaint }}>{formatRelative(update.createdAt)}</span>
                  </div>
                  <p style={{ fontSize: '13px', color: t.textMuted, lineHeight: '1.4', margin: 0 }}>{update.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
      <SiteFooter />
    </div>
  );
};

// ============================================
// RECRUITER DASHBOARD — Manage profile, postings, and applications
// ============================================
const jobRoles = [
  { key: 'engineer', label: 'Engineer' },
  { key: 'designer', label: 'Designer' },
  { key: 'pm', label: 'Product Manager' },
  { key: 'marketer', label: 'Marketer' },
  { key: 'cofounder', label: 'Co-founder' },
  { key: 'other', label: 'Other' },
];

const RecruiterPage = ({ currentUser, onViewProfile, onMakers, onBack, onSignup, onHire, showNotification }) => {
  const [recruiterProfile, setRecruiterProfile] = useState(null);
  const [postings, setPostings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showPostingForm, setShowPostingForm] = useState(false);
  const [editingPosting, setEditingPosting] = useState(null);
  const [viewingApplications, setViewingApplications] = useState(null); // jobId
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);

  // Profile form
  const [companyName, setCompanyName] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  // Posting form
  const [postTitle, setPostTitle] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [postProjectName, setPostProjectName] = useState('');
  const [postProjectDesc, setPostProjectDesc] = useState('');
  const [postRoleNeeded, setPostRoleNeeded] = useState('');
  const [postDomains, setPostDomains] = useState('');
  const [postLocation, setPostLocation] = useState('');
  const [postRemote, setPostRemote] = useState(true);
  const [postCompensation, setPostCompensation] = useState('');
  const [postStatus, setPostStatus] = useState('draft');

  useEffect(() => {
    document.title = 'Recruiter Dashboard — Makerly';
    return () => { document.title = 'Makerly — Show what you\'ve made'; };
  }, []);

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    const load = async () => {
      try {
        const profile = await db.getRecruiterProfile(currentUser.id);
        setRecruiterProfile(profile);
        if (profile) {
          setCompanyName(profile.companyName || '');
          setCompanyUrl(profile.companyUrl || '');
          setRoleTitle(profile.roleTitle || '');
          setBio(profile.bio || '');
          const jobs = await db.getJobPostingsByRecruiter(profile.id);
          setPostings(jobs);
        }
      } catch (err) {
        console.error('Failed to load recruiter data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!companyName.trim()) return;
    setSaving(true);
    try {
      if (recruiterProfile) {
        const updated = await db.updateRecruiterProfile(currentUser.id, { companyName: companyName.trim(), companyUrl: companyUrl.trim(), roleTitle: roleTitle.trim(), bio: bio.trim() });
        setRecruiterProfile(updated);
        setEditing(false);
      } else {
        const created = await db.createRecruiterProfile(currentUser.id, { companyName: companyName.trim(), companyUrl: companyUrl.trim(), roleTitle: roleTitle.trim(), bio: bio.trim() });
        setRecruiterProfile(created);
      }
      showNotification('Recruiter profile saved');
    } catch (err) {
      console.error('Failed to save recruiter profile:', err);
      showNotification('Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const resetPostingForm = () => {
    setPostTitle(''); setPostDescription(''); setPostProjectName(''); setPostProjectDesc('');
    setPostRoleNeeded(''); setPostDomains(''); setPostLocation(''); setPostRemote(true);
    setPostCompensation(''); setPostStatus('draft'); setEditingPosting(null);
  };

  const openEditPosting = (posting) => {
    setPostTitle(posting.title); setPostDescription(posting.description);
    setPostProjectName(posting.projectName || ''); setPostProjectDesc(posting.projectDescription || '');
    setPostRoleNeeded(posting.roleNeeded || ''); setPostDomains((posting.domains || []).join(', '));
    setPostLocation(posting.location || ''); setPostRemote(posting.remote);
    setPostCompensation(posting.compensation || ''); setPostStatus(posting.status);
    setEditingPosting(posting.id); setShowPostingForm(true);
  };

  const handleSavePosting = async (e) => {
    e.preventDefault();
    if (!postTitle.trim() || !postDescription.trim()) return;
    setSaving(true);
    const data = {
      title: postTitle.trim(), description: postDescription.trim(),
      projectName: postProjectName.trim() || null, projectDescription: postProjectDesc.trim() || null,
      roleNeeded: postRoleNeeded || null, domains: postDomains.split(',').map(d => d.trim()).filter(Boolean),
      location: postLocation.trim() || null, remote: postRemote,
      compensation: postCompensation.trim() || null, status: postStatus
    };
    try {
      if (editingPosting) {
        const updated = await db.updateJobPosting(editingPosting, data);
        setPostings(prev => prev.map(p => p.id === editingPosting ? updated : p));
        showNotification('Job posting updated');
      } else {
        const created = await db.createJobPosting(recruiterProfile.id, data);
        setPostings(prev => [created, ...prev]);
        showNotification('Job posting created');
      }
      setShowPostingForm(false);
      resetPostingForm();
    } catch (err) {
      console.error('Failed to save posting:', err);
      showNotification('Failed to save posting', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePosting = async (jobId) => {
    try {
      await db.deleteJobPosting(jobId);
      setPostings(prev => prev.filter(p => p.id !== jobId));
      showNotification('Posting deleted');
    } catch (_err) {
      showNotification('Failed to delete posting', 'error');
    }
  };

  const handleToggleStatus = async (posting) => {
    const next = posting.status === 'open' ? 'closed' : 'open';
    try {
      const updated = await db.updateJobPosting(posting.id, { status: next });
      setPostings(prev => prev.map(p => p.id === posting.id ? updated : p));
      showNotification(`Posting ${next === 'open' ? 'published' : 'closed'}`);
    } catch (_err) {
      showNotification('Failed to update status', 'error');
    }
  };

  const loadApplications = async (jobId) => {
    setViewingApplications(jobId);
    setAppsLoading(true);
    try {
      const apps = await db.getApplicationsForJob(jobId);
      setApplications(apps);
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setAppsLoading(false);
    }
  };

  const handleUpdateAppStatus = async (appId, status) => {
    try {
      await db.updateApplicationStatus(appId, status);
      setApplications(prev => prev.map(a => a.id === appId ? { ...a, status } : a));
      showNotification(`Application ${status}`);
    } catch (_err) {
      showNotification('Failed to update application', 'error');
    }
  };

  const statusColors = {
    draft: { bg: 'rgba(168,162,158,0.1)', color: t.textFaint, border: 'rgba(168,162,158,0.2)' },
    open: { bg: 'rgba(74,222,128,0.1)', color: t.success, border: 'rgba(74,222,128,0.2)' },
    closed: { bg: 'rgba(239,68,68,0.1)', color: t.error, border: 'rgba(239,68,68,0.2)' },
    pending: { bg: 'rgba(251,191,36,0.1)', color: t.accent, border: 'rgba(251,191,36,0.2)' },
    reviewed: { bg: 'rgba(34,211,238,0.1)', color: t.cyan, border: 'rgba(34,211,238,0.2)' },
    accepted: { bg: 'rgba(74,222,128,0.1)', color: t.success, border: 'rgba(74,222,128,0.2)' },
    rejected: { bg: 'rgba(239,68,68,0.1)', color: t.error, border: 'rgba(239,68,68,0.2)' },
  };

  const inputStyle = { width: '100%', padding: '10px 14px', background: t.surfaceBgHover, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, color: t.text, fontSize: '14px' };
  const labelStyle = { fontSize: '12px', color: t.textSecondary, fontWeight: '500', marginBottom: '6px', display: 'block' };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}><div style={{ color: t.textSecondary, fontSize: '14px' }}>Loading...</div></div>;
  }

  // Not logged in
  if (!currentUser) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <header className="desktop-header" style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
          <button onClick={onBack} style={{ fontSize: '14px', letterSpacing: '0.15em', color: t.accent, fontWeight: '600', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>MAKERLY</button>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-ghost" onClick={onHire}>Job Board</button>
            <button className="btn btn-ghost" onClick={onBack}>Back</button>
          </div>
        </header>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '40px' }}>
          <div style={{ textAlign: 'center', maxWidth: '400px' }}>
            <div style={{ fontSize: '13px', letterSpacing: '0.15em', color: t.accent, fontWeight: '500', marginBottom: '16px' }}>FOR RECRUITERS</div>
            <h1 style={{ fontSize: '36px', fontFamily: t.fontHeading, marginBottom: '16px' }}>Post jobs. Find makers.</h1>
            <p style={{ fontSize: '15px', color: t.textSecondary, lineHeight: 1.6, marginBottom: '32px' }}>Sign in to create your recruiter profile and start posting positions for makers to apply.</p>
            <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: '15px' }} onClick={onSignup}>Sign up to get started</button>
          </div>
        </div>
        <SiteFooter />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="desktop-header" style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} style={{ fontSize: '14px', letterSpacing: '0.15em', color: t.accent, fontWeight: '600', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>MAKERLY</button>
          <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, fontWeight: '500', background: 'rgba(251,191,36,0.1)', border: `1px solid ${t.accentBorder}`, padding: '3px 8px', borderRadius: '8px' }}>RECRUITER DASHBOARD</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-ghost" onClick={onHire}>Job Board</button>
          <button className="btn btn-ghost" onClick={onMakers}>Makers</button>
          <button className="btn btn-ghost" onClick={onBack}>Dashboard</button>
        </div>
      </header>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 24px', flex: 1, width: '100%' }}>
        {/* Recruiter Profile Section */}
        {!recruiterProfile || editing ? (
          <div style={{ background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusMd, padding: '32px', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '20px', fontFamily: t.fontHeading, marginBottom: '4px' }}>{recruiterProfile ? 'Edit Recruiter Profile' : 'Create Your Recruiter Profile'}</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, marginBottom: '24px' }}>{recruiterProfile ? 'Update your company information' : 'Tell makers about your company and what you\'re looking for'}</p>
            <form onSubmit={handleSaveProfile} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label htmlFor="rp-company" style={labelStyle}>Company Name *</label>
                <input id="rp-company" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Inc." required style={inputStyle} />
              </div>
              <div>
                <label htmlFor="rp-url" style={labelStyle}>Company Website</label>
                <input id="rp-url" type="text" value={companyUrl} onChange={e => setCompanyUrl(e.target.value)} placeholder="https://acme.com" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="rp-title" style={labelStyle}>Your Title</label>
                <input id="rp-title" type="text" value={roleTitle} onChange={e => setRoleTitle(e.target.value)} placeholder="Head of Engineering" style={inputStyle} />
              </div>
              <div>
                <label htmlFor="rp-bio" style={labelStyle}>About your company</label>
                <textarea id="rp-bio" value={bio} onChange={e => setBio(e.target.value)} placeholder="What does your company do? What kind of people do you want to hire?" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '10px 28px' }}>{saving ? 'Saving...' : recruiterProfile ? 'Save Changes' : 'Create Profile'}</button>
                {recruiterProfile && <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
              </div>
            </form>
          </div>
        ) : (
          <div style={{ background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusMd, padding: '24px', marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '20px', fontFamily: t.fontHeading, margin: 0 }}>{recruiterProfile.companyName}</h2>
                {recruiterProfile.companyUrl && <a href={ensureUrl(recruiterProfile.companyUrl)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: t.accent }}>website</a>}
              </div>
              {recruiterProfile.roleTitle && <div style={{ fontSize: '13px', color: t.textSecondary }}>{recruiterProfile.roleTitle}</div>}
              {recruiterProfile.bio && <p style={{ fontSize: '13px', color: t.textTertiary, marginTop: '8px', lineHeight: 1.5 }}>{recruiterProfile.bio}</p>}
            </div>
            <button className="btn btn-ghost" onClick={() => setEditing(true)} style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>Edit Profile</button>
          </div>
        )}

        {/* Only show postings if recruiter profile exists */}
        {recruiterProfile && (
          <>
            {/* Postings header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontFamily: t.fontHeading, margin: 0 }}>Your Job Postings ({postings.length})</h2>
              <button className="btn btn-primary" onClick={() => { resetPostingForm(); setShowPostingForm(true); }} style={{ padding: '8px 20px', fontSize: '13px' }}>
                + New Posting
              </button>
            </div>

            {/* Posting Form */}
            {showPostingForm && (
              <div style={{ background: t.surfaceBg, border: `1px solid ${t.accentBorder}`, borderRadius: t.radiusMd, padding: '28px', marginBottom: '20px' }}>
                <h3 style={{ fontSize: '16px', fontFamily: t.fontHeading, marginBottom: '20px' }}>{editingPosting ? 'Edit Job Posting' : 'New Job Posting'}</h3>
                <form onSubmit={handleSavePosting} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <label htmlFor="jp-title" style={labelStyle}>Job Title *</label>
                    <input id="jp-title" type="text" value={postTitle} onChange={e => setPostTitle(e.target.value)} placeholder="Senior Frontend Engineer" required style={inputStyle} />
                  </div>
                  <div>
                    <label htmlFor="jp-desc" style={labelStyle}>Description *</label>
                    <textarea id="jp-desc" value={postDescription} onChange={e => setPostDescription(e.target.value)} placeholder="What will this person do? What are you looking for?" rows={4} required style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label htmlFor="jp-project" style={labelStyle}>Project Name</label>
                      <input id="jp-project" type="text" value={postProjectName} onChange={e => setPostProjectName(e.target.value)} placeholder="What are you building?" style={inputStyle} />
                    </div>
                    <div>
                      <label htmlFor="jp-role" style={labelStyle}>Role Type</label>
                      <select id="jp-role" value={postRoleNeeded} onChange={e => setPostRoleNeeded(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                        <option value="">Select role...</option>
                        {jobRoles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="jp-projdesc" style={labelStyle}>Project Description</label>
                    <textarea id="jp-projdesc" value={postProjectDesc} onChange={e => setPostProjectDesc(e.target.value)} placeholder="More about the project..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label htmlFor="jp-domains" style={labelStyle}>Domains (comma-separated)</label>
                      <input id="jp-domains" type="text" value={postDomains} onChange={e => setPostDomains(e.target.value)} placeholder="React, TypeScript, AI" style={inputStyle} />
                    </div>
                    <div>
                      <label htmlFor="jp-comp" style={labelStyle}>Compensation</label>
                      <input id="jp-comp" type="text" value={postCompensation} onChange={e => setPostCompensation(e.target.value)} placeholder="$150-180k + equity" style={inputStyle} />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label htmlFor="jp-location" style={labelStyle}>Location</label>
                      <input id="jp-location" type="text" value={postLocation} onChange={e => setPostLocation(e.target.value)} placeholder="San Francisco, CA" style={inputStyle} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={labelStyle}>Remote?</span>
                      <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: t.text, cursor: 'pointer' }}>
                          <input type="radio" checked={postRemote} onChange={() => setPostRemote(true)} /> Yes
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: t.text, cursor: 'pointer' }}>
                          <input type="radio" checked={!postRemote} onChange={() => setPostRemote(false)} /> No
                        </label>
                      </div>
                    </div>
                  </div>
                  <div>
                    <span style={labelStyle}>Status</span>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      {['draft', 'open'].map(s => (
                        <button key={s} type="button" onClick={() => setPostStatus(s)} style={{
                          padding: '6px 16px', borderRadius: t.radiusSm, fontSize: '12px', fontWeight: '600', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em',
                          background: postStatus === s ? statusColors[s].bg : 'transparent',
                          color: postStatus === s ? statusColors[s].color : t.textFaint,
                          border: `1px solid ${postStatus === s ? statusColors[s].border : 'rgba(255,255,255,0.1)'}`
                        }}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '10px 28px' }}>{saving ? 'Saving...' : editingPosting ? 'Update Posting' : 'Create Posting'}</button>
                    <button type="button" className="btn btn-ghost" onClick={() => { setShowPostingForm(false); resetPostingForm(); }}>Cancel</button>
                  </div>
                </form>
              </div>
            )}

            {/* Applications view */}
            {viewingApplications && (
              <div style={{ background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusMd, padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontFamily: t.fontHeading, margin: 0 }}>
                    Applications for: {postings.find(p => p.id === viewingApplications)?.title || ''}
                  </h3>
                  <button className="btn btn-ghost" onClick={() => setViewingApplications(null)} style={{ fontSize: '12px' }}>Close</button>
                </div>
                {appsLoading ? (
                  <div style={{ color: t.textFaint, fontSize: '13px', padding: '20px 0' }}>Loading applications...</div>
                ) : applications.length === 0 ? (
                  <div style={{ color: t.textFaint, fontSize: '13px', padding: '20px 0' }}>No applications yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {applications.map(app => {
                      const sc = statusColors[app.status] || statusColors.pending;
                      return (
                        <div key={app.id} style={{ border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusSm, padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <span onClick={() => onViewProfile(app.applicantUsername)} style={{ fontSize: '15px', fontWeight: '500', color: t.text, cursor: 'pointer' }}
                                onMouseOver={e => e.target.style.color = t.accent} onMouseOut={e => e.target.style.color = t.text}>
                                {app.applicantName}
                              </span>
                              <span style={{ fontSize: '12px', color: t.textFaint, marginLeft: '8px' }}>@{app.applicantUsername}</span>
                              {app.applicantProjectCount > 0 && <span style={{ fontSize: '11px', color: t.accent, marginLeft: '8px' }}>{app.applicantProjectCount} projects</span>}
                            </div>
                            <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', fontWeight: '600', letterSpacing: '0.05em', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, textTransform: 'uppercase' }}>{app.status}</span>
                          </div>
                          {app.applicantBio && <p style={{ fontSize: '12px', color: t.textTertiary, marginBottom: '8px' }}>{app.applicantBio}</p>}
                          <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: t.radiusSm, padding: '12px', marginBottom: '10px' }}>
                            <p style={{ fontSize: '13px', color: t.textSecondary, lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{app.message}</p>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', color: t.textFaint }}>{new Date(app.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                            <div style={{ flex: 1 }} />
                            {app.status === 'pending' && (
                              <>
                                <button onClick={() => handleUpdateAppStatus(app.id, 'reviewed')} style={{ padding: '4px 12px', borderRadius: '8px', border: `1px solid ${statusColors.reviewed.border}`, background: statusColors.reviewed.bg, color: statusColors.reviewed.color, cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>Mark Reviewed</button>
                                <button onClick={() => handleUpdateAppStatus(app.id, 'accepted')} style={{ padding: '4px 12px', borderRadius: '8px', border: `1px solid ${statusColors.accepted.border}`, background: statusColors.accepted.bg, color: statusColors.accepted.color, cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>Accept</button>
                                <button onClick={() => handleUpdateAppStatus(app.id, 'rejected')} style={{ padding: '4px 12px', borderRadius: '8px', border: `1px solid ${statusColors.rejected.border}`, background: statusColors.rejected.bg, color: statusColors.rejected.color, cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>Reject</button>
                              </>
                            )}
                            {app.status === 'reviewed' && (
                              <>
                                <button onClick={() => handleUpdateAppStatus(app.id, 'accepted')} style={{ padding: '4px 12px', borderRadius: '8px', border: `1px solid ${statusColors.accepted.border}`, background: statusColors.accepted.bg, color: statusColors.accepted.color, cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>Accept</button>
                                <button onClick={() => handleUpdateAppStatus(app.id, 'rejected')} style={{ padding: '4px 12px', borderRadius: '8px', border: `1px solid ${statusColors.rejected.border}`, background: statusColors.rejected.bg, color: statusColors.rejected.color, cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>Reject</button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Postings list */}
            {postings.length === 0 && !showPostingForm && (
              <div style={{ textAlign: 'center', padding: '60px', color: t.textFaint, background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusMd }}>
                <div style={{ fontSize: '15px', marginBottom: '12px' }}>No job postings yet</div>
                <div style={{ fontSize: '13px' }}>Click "New Posting" to create your first job listing</div>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {postings.map(posting => {
                const sc = statusColors[posting.status] || statusColors.draft;
                return (
                  <div key={posting.id} style={{ background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusMd, padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px', fontWeight: '500', color: t.text }}>{posting.title}</span>
                          <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', fontWeight: '600', letterSpacing: '0.05em', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, textTransform: 'uppercase' }}>{posting.status}</span>
                        </div>
                        {posting.projectName && <div style={{ fontSize: '13px', color: t.textSecondary, marginTop: '2px' }}>Project: {posting.projectName}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => loadApplications(posting.id)} className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 10px' }}>Applications</button>
                        <button onClick={() => openEditPosting(posting)} className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 10px' }}>Edit</button>
                        <button onClick={() => handleToggleStatus(posting)} style={{ padding: '4px 10px', borderRadius: t.radiusSm, border: `1px solid ${posting.status === 'open' ? 'rgba(239,68,68,0.3)' : 'rgba(74,222,128,0.3)'}`, background: posting.status === 'open' ? 'rgba(239,68,68,0.1)' : 'rgba(74,222,128,0.1)', color: posting.status === 'open' ? t.error : t.success, cursor: 'pointer', fontSize: '11px', fontWeight: '500' }}>
                          {posting.status === 'open' ? 'Close' : 'Publish'}
                        </button>
                        <button onClick={() => handleDeletePosting(posting.id)} style={{ padding: '4px 10px', borderRadius: t.radiusSm, border: '1px solid rgba(239,68,68,0.2)', background: 'transparent', color: t.textFaint, cursor: 'pointer', fontSize: '11px' }}>Delete</button>
                      </div>
                    </div>
                    <p style={{ fontSize: '13px', color: t.textTertiary, lineHeight: 1.5, marginBottom: '10px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{posting.description}</p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                      {posting.roleNeeded && <span style={{ fontSize: '10px', color: t.accent, background: t.accentBgSubtle, border: `1px solid ${t.accentBorder}`, padding: '2px 8px', borderRadius: '8px', fontWeight: '600' }}>{(jobRoles.find(r => r.key === posting.roleNeeded) || {}).label || posting.roleNeeded}</span>}
                      {posting.remote && <span style={{ fontSize: '10px', color: t.cyan, background: 'rgba(34,211,238,0.08)', padding: '2px 8px', borderRadius: '8px' }}>Remote</span>}
                      {posting.location && <span style={{ fontSize: '10px', color: t.textFaint }}>{posting.location}</span>}
                      {posting.compensation && <span style={{ fontSize: '10px', color: t.purple }}>{posting.compensation}</span>}
                      {posting.domains?.length > 0 && posting.domains.map(d => <span key={d} style={{ fontSize: '10px', color: t.textFaint, background: t.surfaceBgHover, padding: '2px 6px', borderRadius: '6px' }}>{d}</span>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
};

// ============================================
// MEMO PAGE
// ============================================
const MemoPage = ({ onBack, onSignup, onMakers, onCrackedSquad: _onCrackedSquad }) => {
  useEffect(() => {
    document.title = 'Makers vs Takers — Makerly';
    return () => { document.title = 'Makerly — Show what you\'ve made'; };
  }, []);

  const paragraphs = [
    { text: 'There is a structural shift underway that most people are misreading.' },
    { text: 'The common narrative is that AI will divide people into those who use it well and those who don\'t. That framing is too shallow. It assumes the difference is technical. It is not. The real divide is behavioral.' },
    { text: 'We are entering a world where the cost of creation is collapsing. Writing, coding, designing, researching, editing, distributing — all of it is becoming near-instant. The constraint is no longer capability. The constraint is intent.' },
    { text: 'When creation becomes cheap, the question stops being "can you?" and becomes "will you?"' , highlight: true },
    { text: 'From that lens, two archetypes emerge. Makers and Takers.' },
    { heading: 'Makers' },
    { text: 'A Maker is someone who treats AI as leverage. They see tools as a way to compress time between idea and reality. They do not wait for clarity before acting. They act to generate clarity. They are comfortable producing imperfect outputs because they understand that iteration is the only path to quality. AI, in their hands, is not entertainment. It is infrastructure. It is a way to test ten directions instead of one, to build in days what used to take months, to operate at a level that previously required teams.' },
    { heading: 'Takers' },
    { text: 'A Taker, by contrast, treats AI as a source of consumption. They use the same systems, but the direction of flow is inverted. Instead of pushing ideas into the world, they pull stimulation from it. AI becomes a feed, a companion, a way to generate endless novelty without consequence. It creates the feeling of engagement without the burden of creation. The experience is smooth, personalized, and deeply satisfying in the short term. It is also non-compounding.' },
    { heading: 'The widening gap' },
    { text: 'Both archetypes have access to the same underlying intelligence. That is what makes this moment unique. In previous eras, differences in output could be explained by differences in access, education, or capital. That excuse is disappearing. The gap that forms now will be harder to rationalize, because it is driven by choice.' },
    { text: 'This is why the Maker\u2013Taker divide will widen faster than any previous split. AI amplifies direction, not intent. If someone is already inclined to build, they will build faster and with greater scope. If someone is inclined to consume, they will consume more deeply and more efficiently. The middle ground, where people oscillate without consequence, starts to collapse.' },
    { text: 'There is also a psychological component that makes this more severe than it appears. Takers will not experience their position as a loss. On the contrary, their environment will feel increasingly optimized. Content will be better. Interactions will be smoother. Friction will be minimized. From the inside, it will feel like progress. What will be missing is any durable sense of ownership or forward movement. Nothing compounds because nothing is put at risk.' },
    { text: 'Makers operate under a different feedback loop. Their work is exposed to reality. It can fail, be ignored, or break. But it can also improve, attract attention, and evolve into something larger. The key difference is that their actions leave traces. Over time, these traces accumulate into assets. Codebases, products, audiences, relationships, systems. These are things that persist beyond a single interaction. They create optionality.' },
    { text: 'The long-term consequence of this divergence is not just economic. It is existential. Makers retain a sense of authorship over their lives. They can point to things and say, "this exists because I made it." Takers increasingly interact with worlds that feel real but are entirely constructed by others. The experience is rich, but the agency is thin.', highlight: true },
    { heading: 'The bet' },
    { text: 'This is the bet behind Makerly.' },
    { text: 'We do not believe the future belongs to those who simply have access to AI. Access will be universal. We believe it belongs to those who choose to build with it, consistently, even when it is easier not to. The goal is not to create another surface for consumption. The goal is to create an environment where making is the default behavior, where output is visible, where people are surrounded by others who are also pushing things into existence.' },
    { text: 'Because in a world where everything can be generated, the only scarce thing left is the decision to generate something real.', highlight: true },
    { closing: true, text: 'When the cost of building goes to zero, what do you choose to do with your time?' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="desktop-header" style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <button onClick={onBack} style={{ fontSize: '14px', letterSpacing: '0.15em', color: t.accent, fontWeight: '600', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>MAKERLY</button>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-ghost" onClick={onMakers}>Makers</button>
          <button className="btn btn-ghost" onClick={onBack}>Back</button>
        </div>
      </header>

      <article className="memo-article" style={{ maxWidth: '640px', margin: '0 auto', padding: '80px 24px 60px', width: '100%' }}>
        {/* Title */}
        <div style={{ marginBottom: '60px' }}>
          <div style={{ fontSize: '12px', letterSpacing: '0.2em', color: t.accent, fontWeight: '500', marginBottom: '20px' }}>A MEMO FOR THE AI AGE</div>
          <h1 className="memo-title" style={{ fontSize: '48px', fontFamily: t.fontHeading, fontWeight: '500', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '0' }}>
            Makers vs Takers
          </h1>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {paragraphs.map((p, i) => {
            if (p.heading) {
              return (
                <h2 key={i} style={{
                  fontSize: '13px',
                  letterSpacing: '0.15em',
                  color: t.accent,
                  fontWeight: '500',
                  marginTop: '48px',
                  marginBottom: '20px',
                  textTransform: 'uppercase'
                }}>
                  {p.heading}
                </h2>
              );
            }
            if (p.closing) {
              return (
                <p key={i} style={{
                  fontSize: '22px',
                  fontFamily: t.fontHeading,
                  color: t.text,
                  lineHeight: 1.5,
                  marginTop: '48px',
                  marginBottom: '0',
                  fontStyle: 'italic'
                }}>
                  {p.text}
                </p>
              );
            }
            return (
              <p key={i} style={{
                fontSize: '17px',
                lineHeight: 1.75,
                color: p.highlight ? t.text : t.textSecondary,
                marginBottom: '24px',
                ...(p.highlight ? {
                  borderLeft: '2px solid rgba(251,191,36,0.4)',
                  paddingLeft: '20px',
                  marginLeft: '-22px'
                } : {})
              }}>
                {p.text}
              </p>
            );
          })}
        </div>

        {/* CTA */}
        <div style={{ marginTop: '60px', paddingTop: '40px', borderTop: `1px solid ${t.surfaceBorder}`, textAlign: 'center' }}>
          <p style={{ fontSize: '15px', color: t.textTertiary, marginBottom: '24px' }}>
            Makerly is where makers show what they've built.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={onSignup} style={{ padding: '14px 36px' }}>
              Start your maker profile
            </button>
            <button className="btn btn-ghost" onClick={onMakers} style={{ padding: '14px 36px' }}>
              Browse makers
            </button>
          </div>
        </div>
      </article>

      <SiteFooter />
    </div>
  );
};

// ============================================
// HIRE PAGE
// ============================================
const HirePage = ({ currentUser, onViewProfile, onMakers, onBack, onSignup, onRecruiters, showNotification }) => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [remoteFilter, setRemoteFilter] = useState('');
  const [selectedJob, setSelectedJob] = useState(null);
  const [applyMessage, setApplyMessage] = useState('');
  const [applying, setApplying] = useState(false);
  const [appliedJobs, setAppliedJobs] = useState(new Set());

  useEffect(() => {
    document.title = 'Job Board — Makerly';
    return () => { document.title = 'Makerly — Show what you\'ve made'; };
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const postings = await db.getPublicJobPostings();
        setJobs(postings);
        // Check which jobs the current user already applied to
        if (currentUser) {
          const myApps = await db.getMyApplications(currentUser.id);
          setAppliedJobs(new Set(myApps.map(a => a.jobId)));
        }
      } catch (err) {
        console.error('Failed to load job postings:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser]);

  const filtered = jobs.filter(j => {
    if (roleFilter && j.roleNeeded !== roleFilter) return false;
    if (remoteFilter === 'yes' && !j.remote) return false;
    if (remoteFilter === 'no' && j.remote) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (j.title || '').toLowerCase().includes(q) ||
           (j.description || '').toLowerCase().includes(q) ||
           (j.companyName || '').toLowerCase().includes(q) ||
           (j.projectName || '').toLowerCase().includes(q) ||
           (j.domains || []).some(d => d.toLowerCase().includes(q));
  });

  const handleApply = async (jobId) => {
    if (!applyMessage.trim()) return;
    setApplying(true);
    try {
      await db.applyToJob(jobId, currentUser.id, applyMessage.trim());
      setAppliedJobs(prev => new Set([...prev, jobId]));
      setApplyMessage('');
      setSelectedJob(null);
      showNotification('Application submitted!');
    } catch (err) {
      const msg = err?.message?.includes('unique') ? 'You already applied to this job' : 'Failed to submit application';
      showNotification(msg, 'error');
    } finally {
      setApplying(false);
    }
  };

  const formatRelative = (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header className="desktop-header" style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} style={{ fontSize: '14px', letterSpacing: '0.15em', color: t.accent, fontWeight: '600', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>MAKERLY</button>
          <span style={{ fontSize: '11px', letterSpacing: '0.1em', color: t.textFaint, fontWeight: '500', background: 'rgba(251,191,36,0.1)', border: `1px solid ${t.accentBorder}`, padding: '3px 8px', borderRadius: '8px' }}>JOB BOARD</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-ghost" onClick={onMakers}>Browse Makers</button>
          {onRecruiters && <button className="btn btn-ghost" style={{ color: t.accent }} onClick={onRecruiters}>Post a Job</button>}
          <button className="btn btn-ghost" onClick={onBack}>Back</button>
        </div>
      </header>

      {/* Hero */}
      <section className="desktop-content" style={{ padding: '60px 40px 50px', textAlign: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <h1 className="hero-title" style={{ fontSize: '44px', fontFamily: t.fontHeading, fontWeight: '500', letterSpacing: '-0.02em', maxWidth: '700px', lineHeight: 1.1, margin: '0 auto 20px' }}>
          Jobs from companies that<br />
          <span style={{ color: t.textTertiary }}>hire makers, not resumes.</span>
        </h1>
        <p style={{ fontSize: '16px', color: t.textSecondary, maxWidth: '500px', lineHeight: 1.6, margin: '0 auto 0' }}>
          Real projects from real companies. Apply with your maker profile — your work speaks for itself.
        </p>
      </section>

      {/* Filters + Job Listings */}
      <section style={{ maxWidth: '900px', margin: '0 auto', padding: '32px 24px', flex: 1, width: '100%' }}>
        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
          <label htmlFor="job-search" className="sr-only">Search jobs</label>
          <input id="job-search" type="text" placeholder="Search jobs, companies, domains..."
            value={filter} onChange={e => setFilter(e.target.value)}
            style={{ flex: 1, minWidth: '200px', padding: '10px 16px', background: t.surfaceBgHover, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, color: t.text, fontSize: '14px' }}
          />
          <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="Filter by role"
            style={{ padding: '10px 12px', background: t.surfaceBgHover, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, color: roleFilter ? t.text : t.textFaint, fontSize: '13px', cursor: 'pointer' }}>
            <option value="">All roles</option>
            {jobRoles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <select value={remoteFilter} onChange={e => setRemoteFilter(e.target.value)} aria-label="Remote filter"
            style={{ padding: '10px 12px', background: t.surfaceBgHover, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, color: remoteFilter ? t.text : t.textFaint, fontSize: '13px', cursor: 'pointer' }}>
            <option value="">Remote?</option>
            <option value="yes">Remote only</option>
            <option value="no">On-site only</option>
          </select>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: '60px', color: t.textFaint }}>Loading jobs...</div>}

        {!loading && filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ color: t.textFaint, fontSize: '15px', marginBottom: '16px' }}>
              {jobs.length === 0 ? 'No job postings yet' : 'No jobs match your filters'}
            </div>
            {jobs.length === 0 && (
              <div style={{ color: t.textTertiary, fontSize: '13px' }}>
                Are you hiring? <button onClick={onRecruiters} style={{ color: t.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Post a job</button>
              </div>
            )}
          </div>
        )}

        {/* Job Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(job => {
            const isSelected = selectedJob === job.id;
            const alreadyApplied = appliedJobs.has(job.id);
            return (
              <div key={job.id} style={{ background: t.surfaceBg, border: `1px solid ${isSelected ? t.accentBorder : t.surfaceBorder}`, borderRadius: t.radiusMd, padding: '24px', transition: 'all 0.15s' }}>
                {/* Job header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: '18px', fontFamily: t.fontHeading, margin: 0, color: t.text }}>{job.title}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                      <span style={{ fontSize: '14px', color: t.textSecondary, fontWeight: '500' }}>{job.companyName}</span>
                      {job.companyUrl && <a href={ensureUrl(job.companyUrl)} target="_blank" rel="noopener noreferrer" style={{ fontSize: '11px', color: t.accent }} onClick={e => e.stopPropagation()}>website</a>}
                    </div>
                  </div>
                  <span style={{ fontSize: '11px', color: t.textFaint, whiteSpace: 'nowrap' }}>{formatRelative(job.createdAt)}</span>
                </div>

                {/* Tags row */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
                  {job.roleNeeded && <span style={{ fontSize: '10px', fontWeight: '600', color: t.accent, background: 'rgba(251,191,36,0.1)', border: `1px solid ${t.accentBorder}`, padding: '2px 8px', borderRadius: '8px' }}>{(jobRoles.find(r => r.key === job.roleNeeded) || {}).label || job.roleNeeded}</span>}
                  {job.remote && <span style={{ fontSize: '10px', color: t.cyan, background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.15)', padding: '2px 8px', borderRadius: '8px' }}>Remote</span>}
                  {job.location && <span style={{ fontSize: '10px', color: t.textFaint, background: t.surfaceBgHover, padding: '2px 8px', borderRadius: '8px' }}>{job.location}</span>}
                  {job.compensation && <span style={{ fontSize: '10px', color: t.purple, background: 'rgba(167,139,250,0.08)', padding: '2px 8px', borderRadius: '8px' }}>{job.compensation}</span>}
                  {job.domains?.map(d => <span key={d} style={{ fontSize: '10px', color: t.textFaint, background: t.surfaceBgHover, padding: '2px 6px', borderRadius: '6px' }}>{d}</span>)}
                </div>

                {/* Description preview */}
                <p style={{ fontSize: '13px', color: t.textTertiary, lineHeight: 1.5, marginBottom: '12px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: isSelected ? 100 : 2, WebkitBoxOrient: 'vertical' }}>{job.description}</p>

                {/* Project info */}
                {job.projectName && (
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusSm, padding: '12px', marginBottom: '12px' }}>
                    <div style={{ fontSize: '12px', color: t.textFaint, marginBottom: '4px' }}>THE PROJECT</div>
                    <div style={{ fontSize: '14px', color: t.text, fontWeight: '500' }}>{job.projectName}</div>
                    {job.projectDescription && <p style={{ fontSize: '13px', color: t.textTertiary, lineHeight: 1.5, marginTop: '4px' }}>{job.projectDescription}</p>}
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${t.surfaceBorder}`, paddingTop: '12px' }}>
                  <span onClick={() => onViewProfile(job.recruiterUsername)} style={{ fontSize: '12px', color: t.textTertiary, cursor: 'pointer' }}
                    onMouseOver={e => e.target.style.color = t.accent} onMouseOut={e => e.target.style.color = t.textTertiary}>
                    Posted by {job.recruiterName}
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {!isSelected && (
                      <button onClick={() => setSelectedJob(job.id)} className="btn btn-ghost" style={{ fontSize: '12px', padding: '6px 14px' }}>Details</button>
                    )}
                    {isSelected && (
                      <button onClick={() => { setSelectedJob(null); setApplyMessage(''); }} className="btn btn-ghost" style={{ fontSize: '12px', padding: '6px 14px' }}>Collapse</button>
                    )}
                    {alreadyApplied ? (
                      <span style={{ fontSize: '12px', color: t.success, padding: '6px 14px', fontWeight: '500' }}>Applied</span>
                    ) : currentUser ? (
                      <button onClick={() => setSelectedJob(job.id)} className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 18px' }}>Apply</button>
                    ) : (
                      <button onClick={onSignup} className="btn btn-primary" style={{ fontSize: '12px', padding: '6px 18px' }}>Sign up to apply</button>
                    )}
                  </div>
                </div>

                {/* Apply form */}
                {isSelected && currentUser && !alreadyApplied && (
                  <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(251,191,36,0.04)', border: `1px solid ${t.accentBorder}`, borderRadius: t.radiusSm }}>
                    <div style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '8px', fontWeight: '500' }}>Apply to this position</div>
                    <p style={{ fontSize: '12px', color: t.textFaint, marginBottom: '12px' }}>Your maker profile (makerly.me/{currentUser.username}) will be shared with the recruiter.</p>
                    <label htmlFor={`apply-${job.id}`} className="sr-only">Application message</label>
                    <textarea id={`apply-${job.id}`} value={applyMessage} onChange={e => setApplyMessage(e.target.value)}
                      placeholder="Tell them why you're interested and what you'd bring..." rows={3}
                      style={{ width: '100%', padding: '10px 14px', background: t.surfaceBgHover, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, color: t.text, fontSize: '14px', resize: 'vertical', marginBottom: '12px' }}
                    />
                    <button onClick={() => handleApply(job.id)} className="btn btn-primary" disabled={applying || !applyMessage.trim()} style={{ padding: '8px 24px', fontSize: '13px' }}>
                      {applying ? 'Submitting...' : 'Submit Application'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Bottom CTA for recruiters */}
      <section className="section-padding" style={{ padding: '60px 40px', textAlign: 'center', borderTop: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '28px', fontFamily: t.fontHeading, marginBottom: '16px' }}>Hiring builders?</h2>
          <p style={{ fontSize: '15px', color: t.textSecondary, marginBottom: '28px' }}>Create your recruiter profile and post jobs. Makers apply with their portfolios — no resumes needed.</p>
          <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: '15px' }} onClick={onRecruiters}>Post a Job</button>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

// ============================================
// CRACKED SQUAD ADMIN TAB
// ============================================
const CrackedSquadAdminTab = ({ users, applications, onViewProfile, onAccept, onReject }) => {
  return (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
    <div style={{ background: t.surfaceBg, border: `1px solid ${t.surfaceBorder}`, borderRadius: t.radiusMd, overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <h2 style={{ fontSize: '16px', color: t.text, margin: 0 }}>Applications ({applications.length})</h2>
        <p style={{ fontSize: '12px', color: t.textFaint, marginTop: '4px' }}>To add/remove squad members, use checkboxes on the Users tab</p>
      </div>
      {applications.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center', color: t.textFaint }}>No applications yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {applications.map((app, i) => {
            const applicant = users.find(u => u.id === app.user_id);
            const sc = { pending: { bg: 'rgba(251,191,36,0.1)', color: t.accent, border: 'rgba(251,191,36,0.2)' }, accepted: { bg: 'rgba(74,222,128,0.1)', color: t.success, border: 'rgba(74,222,128,0.2)' }, rejected: { bg: 'rgba(239,68,68,0.1)', color: t.error, border: 'rgba(239,68,68,0.2)' } }[app.status] || { bg: 'rgba(251,191,36,0.1)', color: t.accent, border: 'rgba(251,191,36,0.2)' };
            return (
              <div key={app.id} style={{ padding: '20px', borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {applicant ? <span onClick={() => onViewProfile(applicant.username)} style={{ color: t.text, cursor: 'pointer', fontWeight: '500', fontSize: '14px' }}>{applicant.name || applicant.username}</span> : <span style={{ color: t.textTertiary, fontSize: '14px' }}>Unknown user</span>}
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '8px', fontWeight: '600', letterSpacing: '0.05em', background: sc.bg, color: sc.color, border: `1px solid ${sc.border}` }}>{app.status.toUpperCase()}</span>
                  </div>
                  <span style={{ fontSize: '11px', color: t.textFaint }}>{new Date(app.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ fontSize: '11px', color: t.textFaint, marginBottom: '4px', fontWeight: '500' }}>Biggest problem in their life:</div>
                  <div style={{ fontSize: '13px', color: t.textSecondary, lineHeight: 1.5, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>{app.biggest_problem}</div>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ fontSize: '11px', color: t.textFaint, marginBottom: '4px', fontWeight: '500' }}>What they think of their peers:</div>
                  <div style={{ fontSize: '13px', color: t.textSecondary, lineHeight: 1.5, padding: '8px 12px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>{app.peers_opinion}</div>
                </div>
                {app.status === 'pending' && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn" onClick={() => onAccept(app)} style={{ padding: '6px 16px', background: 'rgba(74,222,128,0.1)', color: t.success, border: '1px solid rgba(74,222,128,0.2)', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>Accept</button>
                    <button className="btn" onClick={() => onReject(app)} style={{ padding: '6px 16px', background: 'rgba(239,68,68,0.1)', color: t.error, border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  </div>
  );
};

// ============================================
// CRACKED SQUAD PAGE
// ============================================
const CrackedSquadPage = ({ currentUser, onBack, onSignup, onLogin, onViewProfile, showNotification }) => {
  const [showApply, setShowApply] = useState(false);
  const [biggestProblem, setBiggestProblem] = useState('');
  const [peersOpinion, setPeersOpinion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [existingApp, setExistingApp] = useState(null);
  const [, setAppChecked] = useState(false);
  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    document.title = 'Cracked Squad — Makerly';
    return () => { document.title = 'Maker Portfolio — The portfolio for people who make things'; };
  }, []);

  // Check if user already applied
  useEffect(() => {
    if (currentUser) {
      db.getCrackedSquadApplication(currentUser.id).then(app => {
        setExistingApp(app);
        setAppChecked(true);
      }).catch(() => setAppChecked(true));
    } else {
      setAppChecked(true);
    }
  }, [currentUser]);

  // Load cracked squad members
  useEffect(() => {
    db.getPublicMakers().then(makers => {
      setMembers(makers.filter(m => m.crackedSquad));
      setLoadingMembers(false);
    }).catch(() => setLoadingMembers(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!biggestProblem.trim() || !peersOpinion.trim()) return;
    setSubmitting(true);
    try {
      const bp = biggestProblem.trim();
      const po = peersOpinion.trim();
      await db.submitCrackedSquadApplication(currentUser.id, {
        biggestProblem: bp,
        peersOpinion: po
      });
      // Notify admin via email (fire-and-forget)
      fetch('/api/notify-cracked-squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantName: currentUser.name || '',
          applicantUsername: currentUser.username,
          biggestProblem: bp,
          peersOpinion: po
        })
      }).catch(() => {});
      setExistingApp({ status: 'pending' });
      setShowApply(false);
      showNotification('Application submitted');
    } catch (err) {
      showNotification(err.message || 'Failed to submit', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const isMember = currentUser?.crackedSquad;

  return (
    <div style={{ minHeight: '100vh', background: t.bg }}>
      {/* Header */}
      <header className="desktop-header" style={{ padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back</button>
        <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: t.textFaint }}>MAKERLY</span>
      </header>

      {/* Hero */}
      <section style={{ padding: '120px 40px 80px', textAlign: 'center', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', letterSpacing: '0.3em', color: t.error, fontWeight: '600', marginBottom: '24px' }}>BY INVITATION & APPLICATION ONLY</div>
          <h1 style={{ fontSize: '56px', fontFamily: t.fontHeading, lineHeight: 1.1, marginBottom: '24px', color: t.text }}>
            Cracked Squad
          </h1>
          <p style={{ fontSize: '20px', color: t.textTertiary, lineHeight: 1.6, marginBottom: '48px', maxWidth: '540px', margin: '0 auto 48px' }}>
            A small group of teenage builders who are unreasonably ambitious, unreasonably hardworking, and unreasonably good at making things people want.
          </p>
          <div style={{ width: '40px', height: '1px', background: t.textDim, margin: '0 auto' }} />
        </div>
      </section>

      {/* The filter */}
      <section className="section-padding" style={{ padding: '80px 40px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '28px', fontFamily: t.fontHeading, marginBottom: '40px', textAlign: 'center' }}>This is not for you if</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {[
              'You need someone to tell you what to work on.',
              'You think "networking" is a strategy.',
              'You optimize for credentials over output.',
              'You talk about ideas more than you build them.',
              'You want to be told you\'re special before you\'ve done anything.',
              'You think you deserve a seat at the table. You should be building the table.',
            ].map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <span style={{ color: t.error, fontSize: '14px', flexShrink: 0, marginTop: '2px' }}>✕</span>
                <span style={{ fontSize: '15px', color: t.textSecondary, lineHeight: 1.5 }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What it is */}
      <section className="section-padding" style={{ padding: '80px 40px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ fontSize: '28px', fontFamily: t.fontHeading, marginBottom: '40px', textAlign: 'center' }}>This is for you if</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {[
              'You\'ve shipped something real. Not a school project. Something people use.',
              'You think about problems all day. You can\'t help it.',
              'You don\'t wait for permission. You figure it out.',
              'You\'re 14–19 and already building things most adults can\'t.',
              'You want to be surrounded by people who make you feel slow.',
              'If you need to be convinced, this isn\'t for you.',
            ].map((line, i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <span style={{ color: t.success, fontSize: '14px', flexShrink: 0, marginTop: '2px' }}>→</span>
                <span style={{ fontSize: '15px', color: t.textSecondary, lineHeight: 1.5 }}>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Members */}
      {!loadingMembers && (
        <section className="section-padding" style={{ padding: '80px 40px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <h2 style={{ fontSize: '28px', fontFamily: t.fontHeading, marginBottom: '12px', textAlign: 'center' }}>The Squad</h2>
            <p style={{ fontSize: '14px', color: t.textFaint, textAlign: 'center', marginBottom: '40px' }}>
              {members.length > 0 ? `${members.length} builder${members.length !== 1 ? 's' : ''} who made the cut` : 'Applications open. First cohort forming now.'}
            </p>
            {members.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {members.map(m => (
                  <div
                    key={m.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${m.name || m.username}'s profile`}
                    onClick={() => onViewProfile(m.username)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewProfile(m.username); } }}
                    style={{
                      background: t.surfaceBg,
                      border: `1px solid ${t.surfaceBorder}`,
                      borderRadius: t.radiusMd,
                      padding: '20px',
                      cursor: 'pointer',
                      transition: 'all 0.15s'
                    }}
                    onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor = t.surfaceBorder; e.currentTarget.style.background = t.surfaceBg; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '16px', fontWeight: '500', color: t.text }}>{m.name || m.username}</span>
                          {m.todayMaking && (
                            <span className="ongoing-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.success, flexShrink: 0 }} />
                          )}
                        </div>
                        <div style={{ fontSize: '12px', color: t.textFaint, marginTop: '2px' }}>makerly.me/{m.username}</div>
                      </div>
                      {m.projectCount > 0 && (
                        <span style={{ fontSize: '13px', color: t.accent, fontWeight: '500', whiteSpace: 'nowrap' }}>
                          {m.projectCount} made
                        </span>
                      )}
                    </div>
                    {m.bio && (
                      <p style={{ color: t.textSecondary, fontSize: '13px', marginTop: '8px', lineHeight: '1.5', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.bio}
                      </p>
                    )}
                    {m.todayMaking && (
                      <div style={{ marginTop: '10px', padding: '6px 10px', background: 'rgba(74,222,128,0.06)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: '6px', fontSize: '12px', color: t.textSecondary }}>
                        <span style={{ color: t.success, fontWeight: '500' }}>Building now:</span> {m.todayMaking}
                      </div>
                    )}
                    {m.domains?.length > 0 && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                        {m.domains.slice(0, 4).map(d => (
                          <span key={d} style={{ fontSize: '11px', color: t.textFaint, background: t.surfaceBgHover, padding: '2px 8px', borderRadius: t.radiusSm }}>{d}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Apply CTA */}
      <section className="section-padding" style={{ padding: '100px 40px', textAlign: 'center' }}>
        <div style={{ maxWidth: '500px', margin: '0 auto' }}>
          {isMember ? (
            <div>
              <div style={{ fontSize: '14px', color: t.error, fontWeight: '600', letterSpacing: '0.1em', marginBottom: '12px' }}>CRACKED SQUAD</div>
              <h2 style={{ fontSize: '28px', fontFamily: t.fontHeading, marginBottom: '16px' }}>You're in.</h2>
              <p style={{ fontSize: '14px', color: t.textTertiary }}>Keep building. Keep shipping. That's all.</p>
            </div>
          ) : existingApp ? (
            <div>
              <h2 style={{ fontSize: '28px', fontFamily: t.fontHeading, marginBottom: '16px' }}>
                {existingApp.status === 'pending' ? 'Application received.' : existingApp.status === 'accepted' ? 'You\'re in.' : 'Not this time.'}
              </h2>
              <p style={{ fontSize: '14px', color: t.textTertiary }}>
                {existingApp.status === 'pending' ? 'We\'ll review it. No timeline. We take this seriously.' : existingApp.status === 'accepted' ? 'Welcome to Cracked Squad.' : 'Keep building. Apply again when you have more to show.'}
              </p>
            </div>
          ) : showApply && currentUser ? (
            <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
              <h2 style={{ fontSize: '28px', fontFamily: t.fontHeading, marginBottom: '8px', textAlign: 'center' }}>Apply</h2>
              <p style={{ fontSize: '12px', color: t.textFaint, textAlign: 'center', marginBottom: '32px' }}>
                Your answers will never be published anywhere. Ever.
              </p>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ fontSize: '14px', color: t.text, display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  What is the biggest problem in your life right now?
                </label>
                <textarea
                  className="input"
                  value={biggestProblem}
                  onChange={e => setBiggestProblem(e.target.value)}
                  rows={4}
                  required
                  style={{ resize: 'vertical', minHeight: '100px' }}
                  placeholder="Be honest."
                />
              </div>

              <div style={{ marginBottom: '32px' }}>
                <label style={{ fontSize: '14px', color: t.text, display: 'block', marginBottom: '8px', fontWeight: '500' }}>
                  What do you think of your peers? What do they do all day?
                </label>
                <textarea
                  className="input"
                  value={peersOpinion}
                  onChange={e => setPeersOpinion(e.target.value)}
                  rows={4}
                  required
                  style={{ resize: 'vertical', minHeight: '100px' }}
                  placeholder="Be honest."
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowApply(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting} style={{ padding: '14px 36px' }}>
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          ) : (
            <div>
              <h2 style={{ fontSize: '32px', fontFamily: t.fontHeading, marginBottom: '16px' }}>Think you belong here?</h2>
              <p style={{ fontSize: '15px', color: t.textTertiary, marginBottom: '32px' }}>
                Most people don't. That's the point.
              </p>
              {currentUser ? (
                <button className="btn btn-primary" onClick={() => setShowApply(true)} style={{ padding: '16px 48px', fontSize: '16px' }}>
                  Apply
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button className="btn btn-primary" onClick={onSignup} style={{ padding: '16px 36px' }}>
                    Create profile first
                  </button>
                  <button className="btn btn-secondary" onClick={onLogin} style={{ padding: '16px 36px' }}>
                    Log in
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <SiteFooter />
    </div>
  );
};

// ============================================
// ADMIN PANEL
// ============================================
const AdminPanel = ({ user: adminUser, onBack, showNotification, onViewProfile }) => {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [errorLogs, setErrorLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [activeTab, setActiveTab] = useState('users');
  const [csApplications, setCsApplications] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [userList, statsData, logs, apps] = await Promise.all([
          db.adminGetAllUsers(),
          db.adminGetStats(),
          db.adminGetErrorLogs(50),
          db.adminGetCrackedSquadApplications()
        ]);
        setUsers(userList);
        setStats(statsData);
        setErrorLogs(logs);
        setCsApplications(apps);
      } catch (err) {
        console.error('Admin load error:', err);
        showNotification('Failed to load admin data', 'error');
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = [...users].sort((a, b) => {
    let aVal = a[sortField], bVal = b[sortField];
    if (sortField === 'createdAt' || sortField === 'lastUpdateAt') {
      aVal = aVal ? new Date(aVal).getTime() : 0;
      bVal = bVal ? new Date(bVal).getTime() : 0;
    }
    if (typeof aVal === 'string') aVal = aVal.toLowerCase();
    if (typeof bVal === 'string') bVal = bVal.toLowerCase();
    if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  };

  const sortIcon = (field) => sortField === field ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const filteredSorted = sorted.filter(u => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (u.name || '').toLowerCase().includes(q) || (u.username || '').toLowerCase().includes(q);
  });

  const toggleSelectUser = (id) => {
    setSelectedUsers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedUsers.size === filteredSorted.length) setSelectedUsers(new Set());
    else setSelectedUsers(new Set(filteredSorted.map(u => u.id)));
  };

  const handleBulkCrackedSquad = async (addToSquad) => {
    const ids = [...selectedUsers];
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/admin-toggle-cracked-squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds: ids, addToSquad, adminId: adminUser.id })
      });
      if (!res.ok) throw new Error('Failed');
      setUsers(prev => prev.map(u => ids.includes(u.id) ? { ...u, crackedSquad: addToSquad } : u));
      setSelectedUsers(new Set());
      showNotification(`${ids.length} user${ids.length !== 1 ? 's' : ''} ${addToSquad ? 'added to' : 'removed from'} Cracked Squad${addToSquad ? ' — welcome emails sent' : ''}`);
    } catch { showNotification('Failed to update', 'error'); }
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const formatRelative = (d) => {
    if (!d) return '—';
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(d);
  };

  const profileCompleteness = (u) => {
    let score = 0, total = 5;
    if (u.name) score++;
    if (u.bio) score++;
    if (u.firstMake?.description) score++;
    if (u.domains?.length > 0) score++;
    if (u.socials && Object.values(u.socials).some(v => v)) score++;
    return Math.round((score / total) * 100);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <div style={{ color: t.textSecondary, fontSize: '14px' }}>Loading admin data...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontFamily: t.fontHeading, color: t.text, margin: 0 }}>Admin</h1>
          <p style={{ color: t.textFaint, fontSize: '13px', marginTop: '4px' }}>User management & analytics</p>
        </div>
        <button className="btn btn-ghost" onClick={onBack}>Back to Dashboard</button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'Total Users', value: stats.totalUsers, color: t.accent },
            { label: 'Total Projects', value: stats.totalProjects, color: t.purple },
            { label: 'Total Updates', value: stats.totalUpdates, color: t.success },
            { label: 'New Users (7d)', value: stats.newUsersThisWeek, color: t.cyan },
            { label: 'Updates (7d)', value: stats.updatesThisWeek, color: t.pink },
          ].map(card => (
            <div key={card.label} style={{
              background: t.surfaceBg,
              border: `1px solid ${t.surfaceBorder}`,
              borderRadius: t.radiusMd,
              padding: '20px'
            }}>
              <div style={{ fontSize: '12px', color: t.textFaint, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>{card.label}</div>
              <div style={{ fontSize: '32px', fontWeight: '600', color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: t.surfaceBg, borderRadius: '10px', padding: '4px', width: 'fit-content' }}>
        {[
          { key: 'users', label: `Users (${users.length})` },
          { key: 'crackedSquad', label: `Applications (${csApplications.length})` },
          { key: 'errors', label: `Errors (${errorLogs.length})` },
          { key: 'growth', label: 'Growth' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 20px',
              borderRadius: t.radiusSm,
              border: 'none',
              background: activeTab === tab.key ? 'rgba(255,255,255,0.1)' : 'transparent',
              color: activeTab === tab.key ? t.text : t.textFaint,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Users Table */}
      {activeTab === 'users' && <div style={{
        background: t.surfaceBg,
        border: `1px solid ${t.surfaceBorder}`,
        borderRadius: t.radiusMd,
        overflow: 'hidden'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.surfaceBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '16px', color: t.text, margin: 0 }}>All Users ({users.length})</h2>
          <input
            type="text"
            placeholder="Search users..."
            value={userSearch}
            onChange={e => { setUserSearch(e.target.value); setSelectedUsers(new Set()); }}
            style={{ padding: '6px 12px', background: t.surfaceBgHover, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, color: t.text, fontSize: '13px', width: '200px' }}
          />
        </div>

        {/* Bulk action bar */}
        {selectedUsers.size > 0 && (
          <div style={{ padding: '10px 20px', background: 'rgba(255,255,255,0.04)', borderBottom: `1px solid ${t.surfaceBorder}`, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: t.text, fontWeight: '500' }}>{selectedUsers.size} selected</span>
            <button className="btn" onClick={() => handleBulkCrackedSquad(true)} style={{ padding: '4px 12px', fontSize: '12px', background: 'rgba(239,68,68,0.15)', color: t.error, border: '1px solid rgba(239,68,68,0.3)', borderRadius: t.radiusSm, cursor: 'pointer', fontWeight: '500' }}>Add to Cracked Squad</button>
            <button className="btn" onClick={() => handleBulkCrackedSquad(false)} style={{ padding: '4px 12px', fontSize: '12px', background: 'transparent', color: t.textFaint, border: '1px solid rgba(255,255,255,0.1)', borderRadius: t.radiusSm, cursor: 'pointer' }}>Remove from Squad</button>
            <button onClick={() => setSelectedUsers(new Set())} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: t.textFaint, cursor: 'pointer', fontSize: '12px' }}>Clear</button>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${t.surfaceBorder}` }}>
                <th style={{ padding: '12px 16px', width: '32px' }}>
                  <input type="checkbox" checked={selectedUsers.size === filteredSorted.length && filteredSorted.length > 0} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                {[
                  { key: 'username', label: 'User' },
                  { key: 'projectCount', label: 'Projects' },
                  { key: 'updateCount', label: 'Updates' },
                  { key: 'createdAt', label: 'Joined' },
                  { key: 'lastUpdateAt', label: 'Last Active' },
                  { key: 'completeness', label: 'Profile %' },
                ].map(col => (
                  <th key={col.key}
                    onClick={() => col.key !== 'completeness' ? toggleSort(col.key) : null}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      color: t.textTertiary,
                      fontWeight: '500',
                      cursor: col.key !== 'completeness' ? 'pointer' : 'default',
                      whiteSpace: 'nowrap',
                      userSelect: 'none'
                    }}
                  >
                    {col.label}{sortIcon(col.key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredSorted.map(u => {
                const completeness = profileCompleteness(u);
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: selectedUsers.has(u.id) ? 'rgba(255,255,255,0.04)' : 'transparent' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => toggleSelectUser(u.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            onClick={() => onViewProfile(u.username)}
                            style={{ color: t.text, cursor: 'pointer', fontWeight: '500' }}
                            onMouseOver={e => e.target.style.textDecoration = 'underline'}
                            onMouseOut={e => e.target.style.textDecoration = 'none'}
                          >
                            {u.name || u.username}
                          </span>
                          {u.crackedSquad && (
                            <span style={{ fontSize: '9px', letterSpacing: '0.05em', fontWeight: '600', color: t.error, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', padding: '2px 6px', borderRadius: '8px', whiteSpace: 'nowrap' }}>CRACKED</span>
                          )}
                        </div>
                        <span style={{ color: t.textFaint, fontSize: '12px' }}>@{u.username}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: t.textSecondary }}>{u.projectCount}</td>
                    <td style={{ padding: '12px 16px', color: t.textSecondary }}>{u.updateCount}</td>
                    <td style={{ padding: '12px 16px', color: t.textSecondary, whiteSpace: 'nowrap' }}>{formatDate(u.createdAt)}</td>
                    <td style={{ padding: '12px 16px', color: t.textSecondary, whiteSpace: 'nowrap' }}>{formatRelative(u.lastUpdateAt)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{
                          width: '60px',
                          height: '6px',
                          background: 'rgba(255,255,255,0.06)',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${completeness}%`,
                            height: '100%',
                            background: completeness >= 80 ? t.success : completeness >= 40 ? t.accent : t.error,
                            borderRadius: '3px'
                          }} />
                        </div>
                        <span style={{ color: t.textTertiary, fontSize: '12px' }}>{completeness}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>}

      {/* Cracked Squad Tab */}
      {activeTab === 'crackedSquad' && (
        <CrackedSquadAdminTab
          users={sorted}
          applications={csApplications}
          onViewProfile={onViewProfile}
          onAccept={async (app) => {
            const applicant = users.find(u => u.id === app.user_id);
            try {
              await db.adminUpdateApplicationStatus(app.id, 'accepted');
              if (applicant) {
                await fetch('/api/admin-toggle-cracked-squad', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userIds: [applicant.id], addToSquad: true, adminId: adminUser.id })
                });
              }
              setCsApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'accepted' } : a));
              if (applicant) setUsers(prev => prev.map(u => u.id === applicant.id ? { ...u, crackedSquad: true } : u));
              showNotification(`${applicant?.name || 'User'} accepted — welcome email sent`);
            } catch { showNotification('Failed', 'error'); }
          }}
          onReject={async (app) => {
            try {
              await db.adminUpdateApplicationStatus(app.id, 'rejected');
              setCsApplications(prev => prev.map(a => a.id === app.id ? { ...a, status: 'rejected' } : a));
              showNotification('Rejected');
            } catch { showNotification('Failed', 'error'); }
          }}
        />
      )}

      {/* Error Logs */}
      {activeTab === 'errors' && (
        <div style={{
          background: t.surfaceBg,
          border: `1px solid ${t.surfaceBorder}`,
          borderRadius: t.radiusMd,
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.surfaceBorder}` }}>
            <h2 style={{ fontSize: '16px', color: t.text, margin: 0 }}>Error Logs</h2>
          </div>
          {errorLogs.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: t.textFaint }}>No errors logged yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {errorLogs.map((log, i) => {
                const userMatch = users.find(u => u.id === log.user_id);
                return (
                  <div key={log.id} style={{
                    padding: '16px 20px',
                    borderTop: i > 0 ? '1px solid rgba(255,255,255,0.04)' : 'none'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{
                          fontSize: '11px',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'rgba(239,68,68,0.15)',
                          color: t.error,
                          fontWeight: '500'
                        }}>
                          {log.action}
                        </span>
                        {userMatch && (
                          <span style={{ fontSize: '12px', color: t.textTertiary }}>@{userMatch.username}</span>
                        )}
                        {log.error_code && (
                          <span style={{ fontSize: '11px', color: t.textFaint }}>code: {log.error_code}</span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: t.textFaint }}>
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', color: t.textSecondary, marginBottom: '4px' }}>{log.error_message}</div>
                    {log.metadata && (
                      <details style={{ fontSize: '11px', color: t.textFaint }}>
                        <summary style={{ cursor: 'pointer' }}>metadata</summary>
                        <pre style={{ marginTop: '4px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', overflow: 'auto', maxHeight: '120px' }}>
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'growth' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Welcome Email Blast */}
          <div className="card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '16px', color: t.text, margin: '0 0 8px' }}>Welcome Email Blast</h2>
            <p style={{ fontSize: '13px', color: t.textFaint, margin: '0 0 20px', lineHeight: 1.5 }}>
              Send a welcome email to all {users.length} users with their shareable profile card and social share buttons. Each email includes their stats, domains, and one-click share to X, LinkedIn, and WhatsApp.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  try {
                    const res = await fetch('/api/welcome-blast', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ adminId: adminUser.id, dryRun: true }),
                    });
                    const data = await res.json();
                    track('welcome_blast_dry_run', { count: data.count });
                    showNotification(`Dry run: would send to ${data.count} users`, 'success');
                  } catch { showNotification('Dry run failed', 'error'); }
                }}
              >
                Dry Run
              </button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  if (!confirm(`Send welcome email to all ${users.length} users?`)) return;
                  showNotification('Sending welcome emails...', 'success');
                  try {
                    const res = await fetch('/api/welcome-blast', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ adminId: adminUser.id }),
                    });
                    const data = await res.json();
                    track('welcome_blast_sent', { sent: data.sent, failed: data.failed || 0 });
                    showNotification(`Sent ${data.sent} emails${data.failed ? `, ${data.failed} failed` : ''}`, data.failed ? 'error' : 'success');
                  } catch { showNotification('Failed to send emails', 'error'); }
                }}
              >
                Send to All Users
              </button>
            </div>
          </div>

          {/* Viral Loops Overview */}
          <div className="card" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '16px', color: t.text, margin: '0 0 16px' }}>Viral Loops</h2>
            {[
              { name: 'Welcome Email + Card', status: 'live', desc: 'Every user gets a shareable profile card with social share buttons' },
              { name: 'OG Image Cards', status: 'live', desc: 'Profile links render rich cards on X, LinkedIn, WhatsApp, Slack' },
              { name: 'Contact Form', status: 'live', desc: 'Visitors can message makers, driving profile traffic' },
              { name: '"Invite a maker" CTA', status: 'live', desc: 'Every welcome email has an invite link at the bottom' },
              { name: 'Referral credit', status: 'planned', desc: '"Invited by @username" on profiles' },
              { name: 'Milestone cards', status: 'planned', desc: 'Auto-generated celebration cards when makers hit milestones' },
              { name: 'Weekly Spotlight', status: 'planned', desc: 'Email featuring top makers, shareable by all users' },
            ].map(loop => (
              <div key={loop.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: `1px solid ${t.surfaceBorder}` }}>
                <span style={{
                  fontSize: '10px', fontWeight: '600', letterSpacing: '0.1em', padding: '3px 8px', borderRadius: '4px',
                  background: loop.status === 'live' ? 'rgba(34,197,94,0.15)' : 'rgba(251,191,36,0.15)',
                  color: loop.status === 'live' ? '#22c55e' : '#fbbf24',
                }}>{loop.status.toUpperCase()}</span>
                <div>
                  <div style={{ fontSize: '13px', color: t.text, fontWeight: '500' }}>{loop.name}</div>
                  <div style={{ fontSize: '12px', color: t.textFaint }}>{loop.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
