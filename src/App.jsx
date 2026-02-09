import React, { useState, useEffect } from 'react';
import * as db from './lib/database';
import { fetchUserRepos, mapRepoToProject } from './lib/github';

// ============================================
// MAKER PORTFOLIO - Full Functional App
// ============================================

// Define stages and roles FIRST (used by multiple components)
const stages = [
  { key: 'idea', label: 'Idea', color: '#57534e' },
  { key: 'mvp', label: 'MVP', color: '#78716c' },
  { key: 'launch', label: 'Launch', color: '#a8a29e' },
  { key: 'believers', label: 'Believers', color: '#fbbf24' },
  { key: 'users', label: 'Users', color: '#fb923c' },
  { key: 'paying', label: 'Paying', color: '#f472b6' },
  { key: 'funded', label: 'Funded', color: '#a78bfa' },
  { key: 'revenue', label: 'Revenue', color: '#4ade80' },
  { key: 'acquired', label: 'Acquired', color: '#22d3ee' },
  { key: 'ipo', label: 'IPO', color: '#fff' },
];

const roles = [
  { key: 'solo', label: 'Solo', color: '#fbbf24' },
  { key: 'cofounder', label: 'Co-founder', color: '#f472b6' },
  { key: 'early_team', label: 'Early team', color: '#a78bfa' },
  { key: 'contributor', label: 'Contributor', color: '#22d3ee' },
];

const App = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentView, setCurrentView] = useState('landing'); // landing, login, signup, dashboard, profile, editProfile, publicProfile
  const [viewingProfile, setViewingProfile] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [notification, setNotification] = useState(null);

  // Load user on mount and listen for auth changes
  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await db.getCurrentUser();
        if (user) {
          // Load projects for the user
          const projects = await db.getProjectsByUserId(user.id);
          setCurrentUser({ ...user, projects });
          setCurrentView('dashboard');
        }
      } catch (error) {
        console.error('Error loading user:', error);
      }
    };

    loadUser();

    // Listen for auth state changes (Supabase)
    const { data: { subscription } } = db.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const profile = await db.getProfile(session.user.id);
        const projects = await db.getProjectsByUserId(session.user.id);
        setCurrentUser({ ...session.user, ...profile, projects });
        setCurrentView('dashboard');
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setCurrentView('landing');
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleLogout = async () => {
    try {
      await db.signOut();
      setCurrentUser(null);
      setCurrentView('landing');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const viewPublicProfile = async (username) => {
    try {
      const user = await db.getProfileByUsername(username);
      if (user) {
        setViewingProfile(user);
        setCurrentView('publicProfile');
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      showNotification('Profile not found', 'error');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0c0a09', color: '#e7e5e4', fontFamily: "'IBM Plex Mono', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input, textarea, button, select { font-family: inherit; }
        input:focus, textarea:focus, select:focus { outline: none; }
        a { color: inherit; text-decoration: none; }

        .btn { padding: 12px 24px; border-radius: 8px; border: none; cursor: pointer; font-weight: 500; transition: all 0.15s; font-size: 14px; }
        .btn-primary { background: #fbbf24; color: #0c0a09; }
        .btn-primary:hover { background: #f59e0b; }
        .btn-secondary { background: rgba(255,255,255,0.08); color: #e7e5e4; border: 1px solid rgba(255,255,255,0.15); }
        .btn-secondary:hover { background: rgba(255,255,255,0.12); }
        .btn-ghost { background: transparent; color: #a8a29e; }
        .btn-ghost:hover { color: #e7e5e4; }

        .input { width: 100%; padding: 14px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: #e7e5e4; font-size: 14px; }
        .input:focus { border-color: #fbbf24; background: rgba(255,255,255,0.08); }
        .input::placeholder { color: #57534e; }

        .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }

        .tag { padding: 4px 12px; border-radius: 16px; font-size: 11px; font-weight: 500; }

        .notification { position: fixed; top: 20px; right: 20px; padding: 16px 24px; border-radius: 8px; z-index: 1000; animation: slideIn 0.2s ease; }
        .notification.success { background: #166534; color: #4ade80; }
        .notification.error { background: #7f1d1d; color: #fca5a5; }

        @keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 100; animation: fadeIn 0.15s ease; }
        .modal { background: #1c1917; border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 32px; max-width: 480px; width: 90%; animation: slideIn 0.2s ease; }

        .social-btn { display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; cursor: pointer; transition: all 0.15s; width: 100%; }
        .social-btn:hover { background: rgba(255,255,255,0.1); }

        .stage-dot { width: 10px; height: 10px; border-radius: 50%; transition: all 0.2s; }
        .stage-dot.active { width: 14px; height: 14px; }

        .project-card { transition: all 0.15s; cursor: pointer; }
        .project-card:hover { background: rgba(255,255,255,0.04); }

        .ongoing-pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      {showShareModal && (
        <ShareModal
          username={currentUser?.username}
          onClose={() => setShowShareModal(false)}
          showNotification={showNotification}
        />
      )}

      {currentView === 'landing' && (
        <LandingPage
          onLogin={() => setCurrentView('login')}
          onSignup={() => setCurrentView('signup')}
        />
      )}

      {currentView === 'login' && (
        <AuthPage
          mode="login"
          onSwitch={() => setCurrentView('signup')}
          onBack={() => setCurrentView('landing')}
          onSuccess={(user) => { setCurrentUser(user); setCurrentView('dashboard'); }}
          showNotification={showNotification}
        />
      )}

      {currentView === 'signup' && (
        <AuthPage
          mode="signup"
          onSwitch={() => setCurrentView('login')}
          onBack={() => setCurrentView('landing')}
          onSuccess={(user) => { setCurrentUser(user); setCurrentView('dashboard'); }}
          showNotification={showNotification}
        />
      )}

      {currentView === 'dashboard' && currentUser && (
        <Dashboard
          user={currentUser}
          setUser={setCurrentUser}
          onEditProfile={() => setCurrentView('editProfile')}
          onViewProfile={() => setCurrentView('profile')}
          onLogout={handleLogout}
          onShare={() => setShowShareModal(true)}
          showNotification={showNotification}
        />
      )}

      {currentView === 'profile' && currentUser && (
        <ProfileView
          user={currentUser}
          isOwner={true}
          onBack={() => setCurrentView('dashboard')}
          onEdit={() => setCurrentView('editProfile')}
          onShare={() => setShowShareModal(true)}
        />
      )}

      {currentView === 'editProfile' && currentUser && (
        <EditProfile
          user={currentUser}
          setUser={setCurrentUser}
          onBack={() => setCurrentView('dashboard')}
          showNotification={showNotification}
        />
      )}

      {currentView === 'publicProfile' && viewingProfile && (
        <ProfileView
          user={viewingProfile}
          isOwner={false}
          onBack={() => { setViewingProfile(null); setCurrentView(currentUser ? 'dashboard' : 'landing'); }}
        />
      )}
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

const LandingPage = ({ onLogin, onSignup }) => {
  const sampleRoleBreakdown = roles.map(role => ({
    ...role,
    count: sampleMaker.projects.filter(p => p.role === role.key).length,
    percentage: Math.round((sampleMaker.projects.filter(p => p.role === role.key).length / sampleMaker.projects.length) * 100)
  })).filter(r => r.count > 0);

  const sampleStats = [
    { label: "Things made", value: sampleMaker.projects.length, color: '#e7e5e4' },
    { label: "Reached users", value: sampleMaker.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 4).length, color: '#fb923c' },
    { label: "Reached paying", value: sampleMaker.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 5).length, color: '#f472b6' },
    { label: "Acquisitions", value: sampleMaker.projects.filter(p => p.currentStage === 'acquired').length, color: '#22d3ee' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '14px', letterSpacing: '0.15em', color: '#fbbf24', fontWeight: '600' }}>MAKER.PROFILE</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn btn-ghost" onClick={onLogin}>Log in</button>
          <button className="btn btn-primary" onClick={onSignup}>Sign up</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: '80px 40px', textAlign: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h1 style={{ fontSize: '56px', fontFamily: "'Newsreader', Georgia, serif", fontWeight: '500', marginBottom: '24px', letterSpacing: '-0.02em', maxWidth: '700px', lineHeight: 1.1, margin: '0 auto 24px' }}>
          The portfolio for people who make things
        </h1>
        <p style={{ fontSize: '18px', color: '#a8a29e', maxWidth: '500px', lineHeight: 1.6, marginBottom: '48px', margin: '0 auto 48px' }}>
          Not a resume. Not a LinkedIn. A living record of everything you've built — from Lego sets to IPOs.
        </p>
        <button className="btn btn-primary" style={{ padding: '16px 48px', fontSize: '16px' }} onClick={onSignup}>
          Start your maker profile
        </button>

        {/* Inspiration Credit */}
        <div style={{ marginTop: '32px', padding: '12px 24px', background: 'linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(251,191,36,0.05) 100%)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '8px', display: 'inline-block' }}>
          <span style={{ fontSize: '13px', color: '#a8a29e' }}>Inspired by </span>
          <a href="/startup-maze.html" style={{ fontSize: '13px', color: '#fbbf24', textDecoration: 'none', fontWeight: '500' }}>
            The Startup Maze
          </a>
          <span style={{ fontSize: '13px', color: '#a8a29e' }}> — Balaji Srinivasan's framework for founder navigation</span>
        </div>

        <div style={{ marginTop: '48px', display: 'flex', gap: '48px', color: '#57534e', fontSize: '13px', justifyContent: 'center' }}>
          <div><span style={{ color: '#fbbf24', fontSize: '24px', fontWeight: '600' }}>10</span><br/>stages tracked</div>
          <div><span style={{ color: '#fbbf24', fontSize: '24px', fontWeight: '600' }}>∞</span><br/>types of makes</div>
          <div><span style={{ color: '#fbbf24', fontSize: '24px', fontWeight: '600' }}>0</span><br/>bullshit</div>
        </div>
      </section>

      {/* Sample Profile */}
      <section style={{ padding: '80px 40px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <span style={{ fontSize: '11px', letterSpacing: '0.15em', color: '#fbbf24', fontWeight: '500' }}>EXAMPLE PROFILE</span>
          <h2 style={{ fontSize: '32px', fontFamily: "'Newsreader', Georgia, serif", marginTop: '12px' }}>See what a maker profile looks like</h2>
        </div>

        {/* Sample Profile Card */}
        <div style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '20px', padding: '40px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: '48px' }}>
            {/* Left: Profile Info */}
            <div>
              {/* Making Today */}
              <div style={{ marginBottom: '20px', padding: '10px 14px', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <span className="ongoing-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80' }} />
                <span style={{ fontSize: '12px', color: '#4ade80', fontWeight: '500' }}>MAKING: </span>
                <span style={{ color: '#a8a29e', fontSize: '13px' }}>{sampleMaker.todayMaking}</span>
              </div>

              <h3 style={{ fontSize: '36px', fontFamily: "'Newsreader', Georgia, serif", marginBottom: '8px' }}>{sampleMaker.name}</h3>
              <p style={{ color: '#78716c', fontSize: '13px', marginBottom: '16px' }}>maker.profile/{sampleMaker.username}</p>
              <p style={{ fontSize: '16px', color: '#a8a29e', marginBottom: '24px', lineHeight: 1.5 }}>{sampleMaker.bio}</p>

              {/* First Make */}
              <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(251,191,36,0.03) 100%)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: '10px', padding: '16px 20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: '6px', fontWeight: '500' }}>FIRST MAKE · AGE {sampleMaker.firstMake.age}</div>
                <p style={{ fontSize: '14px', fontFamily: "'Newsreader', Georgia, serif", lineHeight: 1.5, color: '#e7e5e4' }}>"{sampleMaker.firstMake.description}"</p>
              </div>

              {/* Domains */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {sampleMaker.domains.map(d => (
                  <span key={d} className="tag" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: '11px' }}>{d}</span>
                ))}
              </div>

              {/* Socials */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <span style={{ color: '#78716c', fontSize: '12px' }}>𝕏 Twitter</span>
                <span style={{ color: '#78716c', fontSize: '12px' }}>◐ GitHub</span>
              </div>
            </div>

            {/* Right: Stats */}
            <div>
              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '16px 20px', marginBottom: '12px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#57534e', marginBottom: '12px' }}>OUTCOMES</div>
                {sampleStats.map(stat => (
                  <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: '#78716c', fontSize: '12px' }}>{stat.label}</span>
                    <span style={{ fontSize: '16px', fontWeight: '600', color: stat.color }}>{stat.value}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '16px 20px' }}>
                <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#57534e', marginBottom: '12px' }}>ROLE BREAKDOWN</div>
                <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' }}>
                  {sampleRoleBreakdown.map(r => (
                    <div key={r.key} style={{ width: `${r.percentage}%`, background: r.color }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {sampleRoleBreakdown.map(r => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: r.color }} />
                      <span style={{ color: '#a8a29e' }}>{r.label}</span>
                      <span style={{ color: '#57534e' }}>{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Projects List */}
          <div style={{ marginTop: '32px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '24px' }}>
            <div style={{ fontSize: '10px', letterSpacing: '0.1em', color: '#57534e', marginBottom: '16px' }}>
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
                          {project.ongoing && <span className="ongoing-pulse" style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4ade80' }} />}
                          <span className="tag" style={{ background: `${role?.color}20`, color: role?.color, fontSize: '10px', padding: '2px 8px' }}>{role?.label}</span>
                        </div>
                        <p style={{ color: '#78716c', fontSize: '12px' }}>{project.oneLiner}</p>
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

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '24px 40px', marginTop: 'auto', textAlign: 'center', fontSize: '12px', color: '#57534e' }}>
        Made by <a href="https://twitter.com/Pareen" target="_blank" rel="noopener noreferrer" style={{ color: '#fbbf24', textDecoration: 'none' }}>Pareen</a>.
        Feedback, suggestions, or collab requests → <a href="https://twitter.com/messages/compose?recipient_id=Pareen" target="_blank" rel="noopener noreferrer" style={{ color: '#a8a29e', textDecoration: 'underline' }}>Twitter DM</a>
      </footer>
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
        showNotification('Account created!');
        onSuccess({ ...user, username, projects: [] });
      } else {
        const user = await db.signIn(email, password);
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <button className="btn btn-ghost" onClick={onBack} style={{ marginBottom: '32px' }}>← Back</button>

        <h1 style={{ fontSize: '32px', fontFamily: "'Newsreader', Georgia, serif", marginBottom: '8px' }}>
          {mode === 'login' ? 'Welcome back' : 'Create your profile'}
        </h1>
        <p style={{ color: '#78716c', marginBottom: '32px' }}>
          {mode === 'login' ? 'Log in to your maker profile' : 'Start tracking what you make'}
        </p>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Username</label>
              <input
                className="input"
                type="text"
                placeholder="priya"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                required
              />
              <div style={{ fontSize: '11px', color: '#57534e', marginTop: '4px' }}>maker.profile/{username || 'yourname'}</div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Email</label>
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
            <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Password</label>
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

        <p style={{ textAlign: 'center', marginTop: '24px', color: '#78716c', fontSize: '14px' }}>
          {mode === 'login' ? "Don't have an account? " : "Already have an account? "}
          <button onClick={onSwitch} style={{ color: '#fbbf24', background: 'none', border: 'none', cursor: 'pointer' }}>
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  );
};

// ============================================
// DASHBOARD
// ============================================
const Dashboard = ({ user, setUser, onEditProfile, onViewProfile, onLogout, onShare, showNotification }) => {
  const [todayMaking, setTodayMaking] = useState(user.todayMaking || '');
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [showGitHubImport, setShowGitHubImport] = useState(false);

  const updateUser = async (updates) => {
    try {
      await db.updateProfile(user.id, { ...user, ...updates });
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
    } catch (error) {
      console.error('Error updating user:', error);
      showNotification('Error updating profile', 'error');
    }
  };

  const saveTodayMaking = async () => {
    await updateUser({ todayMaking });
    showNotification('Updated!');
  };

  const saveProject = async (project) => {
    try {
      if (editingProject) {
        await db.updateProject(project.id, project);
        const updatedProjects = user.projects.map(p => p.id === project.id ? project : p);
        setUser({ ...user, projects: updatedProjects });
        showNotification('Project updated!');
      } else {
        const newProject = await db.createProject(user.id, project);
        setUser({ ...user, projects: [...user.projects, newProject] });
        showNotification('Project added!');
      }
      setShowProjectModal(false);
      setEditingProject(null);
    } catch (error) {
      console.error('Error saving project:', error);
      showNotification('Error saving project', 'error');
    }
  };

  const deleteProject = async (projectId) => {
    if (confirm('Delete this project?')) {
      try {
        await db.deleteProject(projectId);
        setUser({ ...user, projects: user.projects.filter(p => p.id !== projectId) });
        showNotification('Project deleted');
      } catch (error) {
        console.error('Error deleting project:', error);
        showNotification('Error deleting project', 'error');
      }
    }
  };

  const importGitHubProjects = async (projects) => {
    const createdProjects = [];
    for (const project of projects) {
      const { _github, ...projectData } = project;
      const newProject = await db.createProject(user.id, projectData);
      createdProjects.push(newProject);
    }
    setUser({ ...user, projects: [...user.projects, ...createdProjects] });
    return createdProjects; // Return for review flow
  };

  const handleGitHubImportClose = () => {
    setShowGitHubImport(false);
    // Refresh projects in case they were updated during review
    db.getProjectsByUserId(user.id).then(projects => {
      setUser(u => ({ ...u, projects }));
    });
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '14px', letterSpacing: '0.15em', color: '#fbbf24', fontWeight: '600' }}>MAKER.PROFILE</div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={onShare} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>↗</span> Share Profile
          </button>
          <button className="btn btn-secondary" onClick={onViewProfile}>View Profile</button>
          <button className="btn btn-ghost" onClick={onLogout}>Log out</button>
        </div>
      </header>

      <div style={{ padding: '40px', maxWidth: '1000px', margin: '0 auto' }}>
        {/* Welcome */}
        <div style={{ marginBottom: '48px' }}>
          <h1 style={{ fontSize: '32px', fontFamily: "'Newsreader', Georgia, serif", marginBottom: '8px' }}>
            Hey{user.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p style={{ color: '#78716c' }}>What are you making today?</p>
        </div>

        {/* Today's Making */}
        <div className="card" style={{ padding: '24px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              className="input"
              placeholder="Working on the landing page for my new app..."
              value={todayMaking}
              onChange={(e) => setTodayMaking(e.target.value)}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={saveTodayMaking}>Update</button>
          </div>
          {user.todayMaking && (
            <div style={{ marginTop: '12px', fontSize: '12px', color: '#57534e' }}>
              This shows on your public profile
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '16px', marginBottom: '48px' }}>
          <button className="btn btn-secondary" onClick={onEditProfile}>Edit Profile</button>
          <button className="btn btn-primary" onClick={() => { setEditingProject(null); setShowProjectModal(true); }}>+ Add Project</button>
          <button className="btn btn-secondary" onClick={() => setShowGitHubImport(true)}>Import from GitHub</button>
        </div>

        {/* Projects */}
        <div>
          <h2 style={{ fontSize: '12px', letterSpacing: '0.1em', color: '#57534e', marginBottom: '16px' }}>YOUR PROJECTS ({user.projects.length})</h2>

          {user.projects.length === 0 ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center' }}>
              <p style={{ color: '#78716c', marginBottom: '16px' }}>No projects yet. Add your first make!</p>
              <button className="btn btn-primary" onClick={() => setShowProjectModal(true)}>+ Add Project</button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {user.projects.map(project => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onEdit={() => { setEditingProject(project); setShowProjectModal(true); }}
                  onDelete={() => deleteProject(project.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showProjectModal && (
        <ProjectModal
          project={editingProject}
          onSave={saveProject}
          onClose={() => { setShowProjectModal(false); setEditingProject(null); }}
        />
      )}

      {showGitHubImport && (
        <GitHubImportModal
          onImport={importGitHubProjects}
          onClose={handleGitHubImportClose}
          showNotification={showNotification}
        />
      )}
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
    <div className="card project-card" style={{ padding: '20px 24px' }} onClick={onEdit}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{project.name}</h3>
            {project.ongoing && (
              <span className="ongoing-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80' }} />
            )}
            <span className="tag" style={{ background: `${role?.color}20`, color: role?.color }}>{role?.label}</span>
          </div>
          <p style={{ color: '#78716c', fontSize: '14px', marginBottom: '12px' }}>{project.oneLiner}</p>

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
            style={{ padding: '4px 8px', color: '#ef4444' }}
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
const ProjectModal = ({ project, onSave, onClose }) => {
  const [formData, setFormData] = useState(project || {
    name: '',
    oneLiner: '',
    role: 'solo',
    currentStage: 'idea',
    startDate: new Date().toISOString().split('T')[0],
    endDate: '',
    ongoing: true,
    stageData: {},
    domains: [],
    links: [],
    outcome: ''
  });

  const [newDomain, setNewDomain] = useState('');
  const [newLink, setNewLink] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const addDomain = () => {
    if (newDomain && !formData.domains.includes(newDomain)) {
      setFormData({ ...formData, domains: [...formData.domains, newDomain] });
      setNewDomain('');
    }
  };

  const addLink = () => {
    if (newLink && !formData.links.includes(newLink)) {
      setFormData({ ...formData, links: [...formData.links, newLink] });
      setNewLink('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', maxHeight: '90vh', overflow: 'auto' }}>
        <h2 style={{ fontSize: '24px', fontFamily: "'Newsreader', Georgia, serif", marginBottom: '24px' }}>
          {project ? 'Edit Project' : 'Add New Project'}
        </h2>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Project Name *</label>
            <input
              className="input"
              placeholder="My Awesome Project"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>One-liner *</label>
            <input
              className="input"
              placeholder="A tool that does something cool"
              value={formData.oneLiner}
              onChange={(e) => setFormData({ ...formData, oneLiner: e.target.value })}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Your Role</label>
              <select
                className="input"
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              >
                {roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Current Stage</label>
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
              <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Start Date</label>
              <input
                className="input"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>End Date</label>
              <input
                className="input"
                type="date"
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
                <span style={{ fontSize: '14px', color: '#a8a29e' }}>Ongoing</span>
              </label>
            </div>
          </div>

          {/* Domains */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Domains/Tags</label>
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
                <span key={d} className="tag" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', cursor: 'pointer' }}
                  onClick={() => setFormData({ ...formData, domains: formData.domains.filter(x => x !== d) })}>
                  {d} ×
                </span>
              ))}
            </div>
          </div>

          {/* Links */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Links</label>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {formData.links.map(l => (
                <div key={l} style={{ fontSize: '13px', color: '#a8a29e', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{l}</span>
                  <button type="button" style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setFormData({ ...formData, links: formData.links.filter(x => x !== l) })}>×</button>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Outcome (optional)</label>
            <input
              className="input"
              placeholder="e.g. Acquired by X, 10k users, shut down"
              value={formData.outcome}
              onChange={(e) => setFormData({ ...formData, outcome: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save Project</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// GITHUB IMPORT MODAL
// ============================================
const GitHubImportModal = ({ onImport, onClose, showNotification }) => {
  const [username, setUsername] = useState('');
  const [repos, setRepos] = useState([]);
  const [selectedRepos, setSelectedRepos] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState('input'); // input | select | review

  // Review step state
  const [importedProjects, setImportedProjects] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewData, setReviewData] = useState(null);

  const handleFetch = async () => {
    if (!username.trim()) return;
    setLoading(true);
    try {
      const fetchedRepos = await fetchUserRepos(username.trim());
      const mappedRepos = fetchedRepos.map(mapRepoToProject);
      setRepos(mappedRepos);
      setSelectedRepos(new Set());
      setStep('select');
    } catch (error) {
      showNotification(error.message, 'error');
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
    setSelectedRepos(new Set(repos.map((_, i) => i)));
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
      setImportedProjects(projects);
      setReviewIndex(0);
      setReviewData({ ...projects[0] });
      setStep('review');
    } catch (error) {
      showNotification('Failed to import projects', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleReviewSave = async () => {
    // Update current project with review data
    try {
      await db.updateProject(importedProjects[reviewIndex].id, reviewData);
      importedProjects[reviewIndex] = { ...importedProjects[reviewIndex], ...reviewData };
    } catch (error) {
      showNotification('Failed to save changes', 'error');
    }
    moveToNext();
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', maxHeight: '80vh', overflow: 'auto' }}>
        <h2 style={{ fontSize: '24px', fontFamily: "'Newsreader', Georgia, serif", marginBottom: '8px' }}>
          {step === 'review' ? `Review Projects (${reviewIndex + 1} of ${importedProjects.length})` : 'Import from GitHub'}
        </h2>
        <p style={{ color: '#78716c', marginBottom: '24px' }}>
          {step === 'input' && 'Enter a GitHub username to fetch repositories'}
          {step === 'select' && `Select repositories to import (${selectedRepos.size} selected)`}
          {step === 'review' && 'Add details to your imported projects'}
        </p>

        {step === 'input' && (
          <>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
              <input
                className="input"
                placeholder="GitHub username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
                style={{ flex: 1 }}
              />
              <button className="btn btn-primary" onClick={handleFetch} disabled={loading}>
                {loading ? 'Loading...' : 'Fetch Repos'}
              </button>
            </div>
            <button className="btn btn-ghost" onClick={onClose} style={{ width: '100%' }}>Cancel</button>
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
              {repos.map((repo, index) => (
                <div
                  key={index}
                  onClick={() => toggleRepo(index)}
                  style={{
                    padding: '12px 16px',
                    background: selectedRepos.has(index) ? 'rgba(251, 191, 36, 0.1)' : 'rgba(255,255,255,0.03)',
                    border: selectedRepos.has(index) ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: '500' }}>{repo.name}</span>
                        {repo._github.isFork && <span className="tag" style={{ fontSize: '10px' }}>fork</span>}
                        {repo._github.isArchived && <span className="tag" style={{ fontSize: '10px' }}>archived</span>}
                      </div>
                      <div style={{ fontSize: '13px', color: '#78716c' }}>{repo.oneLiner}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: '#57534e' }}>
                      {repo._github.language && <span>{repo._github.language}</span>}
                      <span>★ {repo._github.stars}</span>
                    </div>
                  </div>
                </div>
              ))}
              {repos.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px', color: '#57534e' }}>
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
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
              <div style={{ fontWeight: '500', fontSize: '16px', marginBottom: '4px' }}>{reviewData.name}</div>
              <div style={{ fontSize: '13px', color: '#78716c' }}>{reviewData.oneLiner}</div>
            </div>

            {/* Editable fields */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Role</label>
                <select
                  className="input"
                  value={reviewData.role}
                  onChange={(e) => setReviewData({ ...reviewData, role: e.target.value })}
                >
                  {roles.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Stage</label>
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
                <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Start Date</label>
                <input
                  className="input"
                  type="date"
                  value={reviewData.startDate || ''}
                  onChange={(e) => setReviewData({ ...reviewData, startDate: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>End Date</label>
                <input
                  className="input"
                  type="date"
                  value={reviewData.endDate || ''}
                  onChange={(e) => setReviewData({ ...reviewData, endDate: e.target.value, ongoing: false })}
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
                  <span style={{ fontSize: '14px', color: '#a8a29e' }}>Ongoing</span>
                </label>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#78716c', marginBottom: '8px' }}>Outcome</label>
              <input
                className="input"
                placeholder="e.g. 1000 users, acquired, shut down, still active"
                value={reviewData.outcome || ''}
                onChange={(e) => setReviewData({ ...reviewData, outcome: e.target.value })}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-ghost" onClick={handleReviewSkip} style={{ flex: 1 }}>Skip</button>
              <button className="btn btn-primary" onClick={handleReviewSave} style={{ flex: 1 }}>
                {reviewIndex < importedProjects.length - 1 ? 'Save & Next →' : 'Finish'}
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
// EDIT PROFILE
// ============================================
const EditProfile = ({ user, setUser, onBack, showNotification }) => {
  const [formData, setFormData] = useState({ ...user });
  const [newDomain, setNewDomain] = useState('');

  const handleSave = async () => {
    try {
      await db.updateProfile(user.id, formData);
      setUser({ ...user, ...formData });
      showNotification('Profile saved!');
      onBack();
    } catch (error) {
      console.error('Error saving profile:', error);
      showNotification('Error saving profile', 'error');
    }
  };

  const addDomain = () => {
    if (newDomain && !formData.domains.includes(newDomain)) {
      setFormData({ ...formData, domains: [...formData.domains, newDomain] });
      setNewDomain('');
    }
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <header style={{ padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button className="btn btn-ghost" onClick={onBack}>← Back to Dashboard</button>
        <button className="btn btn-primary" onClick={handleSave}>Save Changes</button>
      </header>

      <div style={{ padding: '40px', maxWidth: '700px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '32px', fontFamily: "'Newsreader', Georgia, serif", marginBottom: '32px' }}>Edit Profile</h1>

        {/* Basic Info */}
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', color: '#78716c', marginBottom: '20px' }}>BASIC INFO</h2>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#57534e', marginBottom: '8px' }}>Name</label>
            <input
              className="input"
              placeholder="Your name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#57534e', marginBottom: '8px' }}>Username</label>
            <input className="input" value={formData.username} disabled style={{ opacity: 0.6 }} />
            <div style={{ fontSize: '11px', color: '#57534e', marginTop: '4px' }}>maker.profile/{formData.username}</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#57534e', marginBottom: '8px' }}>Bio</label>
            <textarea
              className="input"
              placeholder="I make things that..."
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>
        </div>

        {/* First Make */}
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', color: '#78716c', marginBottom: '20px' }}>FIRST MAKE</h2>
          <p style={{ fontSize: '13px', color: '#57534e', marginBottom: '16px' }}>
            What do you remember as your first make? A Lego set? A school project? A treehouse?
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#57534e', marginBottom: '8px' }}>What was it?</label>
            <textarea
              className="input"
              placeholder="A marble run out of cardboard tubes and tape. Spent three weeks on it."
              value={formData.firstMake?.description || ''}
              onChange={(e) => setFormData({ ...formData, firstMake: { ...formData.firstMake, description: e.target.value } })}
              rows={2}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', color: '#57534e', marginBottom: '8px' }}>How old were you?</label>
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
          <h2 style={{ fontSize: '14px', color: '#78716c', marginBottom: '20px' }}>DOMAINS</h2>
          <p style={{ fontSize: '13px', color: '#57534e', marginBottom: '16px' }}>
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
              <span key={d} className="tag" style={{ background: 'rgba(251,191,36,0.1)', color: '#fbbf24', cursor: 'pointer' }}
                onClick={() => setFormData({ ...formData, domains: formData.domains.filter(x => x !== d) })}>
                {d} ×
              </span>
            ))}
          </div>
        </div>

        {/* Social Links */}
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', color: '#78716c', marginBottom: '20px' }}>SOCIAL & PROOF OF WORK</h2>

          {[
            { key: 'twitter', label: 'Twitter/X', placeholder: 'https://twitter.com/yourhandle' },
            { key: 'github', label: 'GitHub', placeholder: 'https://github.com/yourusername' },
            { key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/yourprofile' },
            { key: 'substack', label: 'Substack', placeholder: 'https://yourname.substack.com' },
            { key: 'website', label: 'Personal Website', placeholder: 'https://yoursite.com' },
          ].map(({ key, label, placeholder }) => (
            <div key={key} style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#57534e', marginBottom: '8px' }}>{label}</label>
              <input
                className="input"
                placeholder={placeholder}
                value={formData.socials?.[key] || ''}
                onChange={(e) => setFormData({ ...formData, socials: { ...formData.socials, [key]: e.target.value } })}
              />
            </div>
          ))}
        </div>

        {/* Embed Feed */}
        <div className="card" style={{ padding: '24px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '14px', color: '#78716c', marginBottom: '20px' }}>EMBED FEED</h2>
          <p style={{ fontSize: '13px', color: '#57534e', marginBottom: '16px' }}>
            Show your latest tweets or Substack posts on your profile.
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '12px', color: '#57534e', marginBottom: '8px' }}>Feed Type</label>
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
              <label style={{ display: 'block', fontSize: '12px', color: '#57534e', marginBottom: '8px' }}>
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

        <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%' }}>Save Changes</button>
      </div>
    </div>
  );
};

// ============================================
// PROFILE VIEW (Public)
// ============================================
const ProfileView = ({ user, isOwner, onBack, onEdit, onShare }) => {
  const roleBreakdown = roles.map(role => ({
    ...role,
    count: user.projects.filter(p => p.role === role.key).length,
    percentage: user.projects.length > 0 ? Math.round((user.projects.filter(p => p.role === role.key).length / user.projects.length) * 100) : 0
  })).filter(r => r.count > 0);

  const stats = [
    { label: "Things made", value: user.projects.length, color: '#e7e5e4' },
    { label: "Reached users", value: user.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 4).length, color: '#fb923c' },
    { label: "Reached paying", value: user.projects.filter(p => stages.findIndex(s => s.key === p.currentStage) >= 5).length, color: '#f472b6' },
    { label: "Acquisitions", value: user.projects.filter(p => p.currentStage === 'acquired').length, color: '#22d3ee' },
  ].filter(s => s.value > 0 || s.label === 'Things made');

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{ padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button className="btn btn-ghost" onClick={onBack}>← Back</button>
          <span style={{ fontSize: '14px', letterSpacing: '0.1em', color: '#57534e' }}>maker.profile/{user.username}</span>
        </div>
        {isOwner && (
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" onClick={onShare} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>↗</span> Share
            </button>
            <button className="btn btn-secondary" onClick={onEdit}>Edit</button>
          </div>
        )}
      </header>

      <div style={{ padding: '60px 40px', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Profile Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '60px', marginBottom: '60px' }}>
          <div>
            {/* Today Making */}
            {user.todayMaking && (
              <div style={{ marginBottom: '24px', padding: '12px 16px', background: 'rgba(74, 222, 128, 0.1)', border: '1px solid rgba(74, 222, 128, 0.2)', borderRadius: '8px' }}>
                <span style={{ fontSize: '11px', color: '#4ade80', fontWeight: '500' }}>MAKING TODAY: </span>
                <span style={{ color: '#a8a29e' }}>{user.todayMaking}</span>
              </div>
            )}

            <h1 style={{ fontSize: '48px', fontFamily: "'Newsreader', Georgia, serif", marginBottom: '12px' }}>
              {user.name || user.username}
            </h1>
            {user.bio && <p style={{ fontSize: '18px', color: '#a8a29e', marginBottom: '32px', lineHeight: 1.5 }}>{user.bio}</p>}

            {/* First Make */}
            {user.firstMake?.description && (
              <div style={{ background: 'linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(251,191,36,0.02) 100%)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: '12px', padding: '20px 24px', marginBottom: '24px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: '#fbbf24', marginBottom: '8px', fontWeight: '500' }}>FIRST MAKE {user.firstMake.age && `· AGE ${user.firstMake.age}`}</div>
                <p style={{ fontSize: '16px', fontFamily: "'Newsreader', Georgia, serif", lineHeight: 1.5 }}>"{user.firstMake.description}"</p>
              </div>
            )}

            {/* Domains */}
            {user.domains?.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '24px' }}>
                {user.domains.map(d => (
                  <span key={d} className="tag" style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }}>{d}</span>
                ))}
              </div>
            )}

            {/* Social Links */}
            {Object.values(user.socials || {}).some(v => v) && (
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {user.socials?.twitter && (
                  <a href={user.socials.twitter} target="_blank" rel="noopener" style={{ color: '#a8a29e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>𝕏</span> Twitter
                  </a>
                )}
                {user.socials?.github && (
                  <a href={user.socials.github} target="_blank" rel="noopener" style={{ color: '#a8a29e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>◐</span> GitHub
                  </a>
                )}
                {user.socials?.linkedin && (
                  <a href={user.socials.linkedin} target="_blank" rel="noopener" style={{ color: '#a8a29e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>in</span> LinkedIn
                  </a>
                )}
                {user.socials?.substack && (
                  <a href={user.socials.substack} target="_blank" rel="noopener" style={{ color: '#a8a29e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>◉</span> Substack
                  </a>
                )}
                {user.socials?.website && (
                  <a href={user.socials.website} target="_blank" rel="noopener" style={{ color: '#a8a29e', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>↗</span> Website
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Stats */}
          <div>
            <div className="card" style={{ padding: '20px 24px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: '#57534e', marginBottom: '16px' }}>OUTCOMES</div>
              {stats.map(stat => (
                <div key={stat.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ color: '#78716c', fontSize: '13px' }}>{stat.label}</span>
                  <span style={{ fontSize: '18px', fontWeight: '600', color: stat.color }}>{stat.value}</span>
                </div>
              ))}
            </div>

            {roleBreakdown.length > 0 && (
              <div className="card" style={{ padding: '20px 24px' }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: '#57534e', marginBottom: '16px' }}>ROLE BREAKDOWN</div>
                <div style={{ display: 'flex', height: '6px', borderRadius: '3px', overflow: 'hidden', marginBottom: '12px' }}>
                  {roleBreakdown.map(r => (
                    <div key={r.key} style={{ width: `${r.percentage}%`, background: r.color }} />
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                  {roleBreakdown.map(r => (
                    <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: r.color }} />
                      <span style={{ color: '#a8a29e' }}>{r.label}</span>
                      <span style={{ color: '#57534e' }}>{r.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Embed Feed */}
        {user.embedFeed?.type && user.embedFeed?.url && (
          <div className="card" style={{ padding: '24px', marginBottom: '48px' }}>
            <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: '#57534e', marginBottom: '16px' }}>
              {user.embedFeed.type === 'twitter' ? 'LATEST TWEETS' : 'LATEST POSTS'}
            </div>
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '24px', textAlign: 'center', color: '#57534e' }}>
              {user.embedFeed.type === 'twitter' ? (
                <div>
                  <p style={{ marginBottom: '12px' }}>Twitter embed for {user.embedFeed.url}</p>
                  <a href={`https://twitter.com/${user.embedFeed.url.replace('@', '')}`} target="_blank" rel="noopener" className="btn btn-secondary">
                    View on Twitter ↗
                  </a>
                </div>
              ) : (
                <div>
                  <p style={{ marginBottom: '12px' }}>Substack feed from {user.embedFeed.url}</p>
                  <a href={user.embedFeed.url} target="_blank" rel="noopener" className="btn btn-secondary">
                    View on Substack ↗
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Projects */}
        <div>
          <div style={{ fontSize: '11px', letterSpacing: '0.1em', color: '#57534e', marginBottom: '16px' }}>
            PROJECTS ({user.projects.length})
          </div>

          {user.projects.length === 0 ? (
            <div className="card" style={{ padding: '48px', textAlign: 'center', color: '#57534e' }}>
              No projects yet
            </div>
          ) : (
            <div className="card" style={{ overflow: 'hidden' }}>
              {user.projects.map((project, idx) => {
                const stageIndex = stages.findIndex(s => s.key === project.currentStage);
                const stage = stages[stageIndex];
                const role = roles.find(r => r.key === project.role);

                return (
                  <div key={project.id} style={{ padding: '20px 24px', borderBottom: idx < user.projects.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <h3 style={{ fontSize: '16px', fontWeight: '500' }}>{project.name}</h3>
                          {project.ongoing && <span className="ongoing-pulse" style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#4ade80' }} />}
                          <span className="tag" style={{ background: `${role?.color}20`, color: role?.color }}>{role?.label}</span>
                        </div>
                        <p style={{ color: '#78716c', fontSize: '14px' }}>{project.oneLiner}</p>
                      </div>
                      <span className="tag" style={{ background: `${stage?.color}20`, color: stage?.color }}>{stage?.label}</span>
                    </div>

                    {/* Stage dots */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      {stages.map((s, i) => (
                        <React.Fragment key={s.key}>
                          <div style={{
                            width: i === stageIndex ? '12px' : '8px',
                            height: i === stageIndex ? '12px' : '8px',
                            borderRadius: '50%',
                            background: i <= stageIndex ? s.color : 'rgba(255,255,255,0.08)',
                            boxShadow: i === stageIndex ? `0 0 8px ${s.color}50` : 'none'
                          }} />
                          {i < stages.length - 1 && <div style={{ width: '6px', height: '2px', background: i < stageIndex ? stages[i + 1].color : 'rgba(255,255,255,0.06)' }} />}
                        </React.Fragment>
                      ))}
                    </div>

                    {/* Project links */}
                    {project.links?.length > 0 && (
                      <div style={{ marginTop: '12px', display: 'flex', gap: '16px' }}>
                        {project.links.map(link => (
                          <a key={link} href={link} target="_blank" rel="noopener" style={{ color: '#fbbf24', fontSize: '13px' }}>↗ {new URL(link).hostname}</a>
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

      {/* Footer */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '24px 40px', marginTop: '60px', textAlign: 'center', fontSize: '12px', color: '#57534e' }}>
        Built with MAKER.PROFILE
      </footer>
    </div>
  );
};

// ============================================
// SHARE MODAL
// ============================================
const ShareModal = ({ username, onClose, showNotification }) => {
  const profileUrl = `maker.profile/${username}`;

  const copyLink = () => {
    navigator.clipboard.writeText(`https://${profileUrl}`);
    showNotification('Link copied!');
  };

  const shareOptions = [
    { name: 'Copy Link', icon: '🔗', action: copyLink },
    { name: 'Twitter / X', icon: '𝕏', action: () => window.open(`https://twitter.com/intent/tweet?text=Check out my maker profile&url=https://${profileUrl}`, '_blank') },
    { name: 'LinkedIn', icon: 'in', action: () => window.open(`https://www.linkedin.com/sharing/share-offsite/?url=https://${profileUrl}`, '_blank') },
    { name: 'Facebook', icon: 'f', action: () => window.open(`https://www.facebook.com/sharer/sharer.php?u=https://${profileUrl}`, '_blank') },
    { name: 'WhatsApp', icon: '💬', action: () => window.open(`https://wa.me/?text=Check out my maker profile: https://${profileUrl}`, '_blank') },
    { name: 'Email', icon: '✉', action: () => window.open(`mailto:?subject=Check out my maker profile&body=https://${profileUrl}`, '_blank') },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: '24px', fontFamily: "'Newsreader', Georgia, serif", marginBottom: '8px' }}>Share your profile</h2>
        <p style={{ color: '#78716c', marginBottom: '24px' }}>Let people see what you've built</p>

        {/* URL Preview */}
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', padding: '12px 16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#a8a29e', fontSize: '14px' }}>https://{profileUrl}</span>
          <button className="btn btn-primary" onClick={copyLink} style={{ padding: '8px 16px' }}>Copy</button>
        </div>

        {/* Share Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {shareOptions.map(option => (
            <button key={option.name} className="social-btn" onClick={option.action}>
              <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{option.icon}</span>
              <span style={{ color: '#e7e5e4' }}>{option.name}</span>
            </button>
          ))}
        </div>

        <button className="btn btn-ghost" onClick={onClose} style={{ width: '100%', marginTop: '24px' }}>Close</button>
      </div>
    </div>
  );
};

export default App;
