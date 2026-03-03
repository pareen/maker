import { supabase, isSupabaseConfigured, _savedHash } from './supabase'

// ============================================
// AUTH FUNCTIONS
// ============================================

export async function signUp(email, password, username) {
  if (!isSupabaseConfigured()) {
    return signUpLocal(email, password, username)
  }

  // Check username uniqueness before creating the auth user
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (existingProfile) {
    throw new Error('Username already taken')
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  })

  if (error) throw error

  // Supabase returns a fake user with empty identities for duplicate emails
  // (instead of an error, to prevent email enumeration)
  if (!data.user || data.user.identities?.length === 0) {
    throw new Error('An account with this email already exists')
  }

  return data.user
}

export async function signIn(email, password) {
  if (!isSupabaseConfigured()) {
    return signInLocal(email, password)
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) throw error

  // Ensure profile exists (creates on first login)
  if (data.user) {
    await ensureProfileExists(data.user)
  }

  return data.user
}

// Helper to create profile on first authenticated access
async function ensureProfileExists(user) {
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()

  if (!existingProfile) {
    const username = user.user_metadata?.username ||
                     user.email?.split('@')[0] ||
                     `user_${user.id.slice(0, 8)}`
    await supabase
      .from('profiles')
      .insert({ id: user.id, username })
  }
}

// Redirect to Google OAuth (no popups — works reliably everywhere)
export function signInWithGoogle() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  if (!clientId) {
    throw new Error('VITE_GOOGLE_CLIENT_ID is not set')
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: window.location.origin,
    response_type: 'token',
    scope: 'openid email profile',
    prompt: 'select_account',
    state: 'google_oauth'
  })

  window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

// Called on page load to complete Google OAuth redirect flow.
// Uses _savedHash (captured before Supabase's createClient can consume it)
// and checks for state=google_oauth to distinguish Google from Supabase redirects.
export async function handleGoogleOAuthRedirect() {
  const hash = _savedHash
  if (!hash || !hash.includes('access_token')) return null

  const params = new URLSearchParams(hash.substring(1))

  // Only handle redirects we initiated (state=google_oauth).
  // Supabase OAuth redirects won't have this — let Supabase handle those.
  if (params.get('state') !== 'google_oauth') return null

  const accessToken = params.get('access_token')
  if (!accessToken) return null

  // This is our Google redirect — clear the hash so Supabase doesn't also try to process it
  window.history.replaceState(null, '', window.location.pathname)

  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!res.ok) return null

  const userInfo = await res.json()
  if (!userInfo.sub) return null

  const googleUser = {
    id: userInfo.sub,
    email: userInfo.email || '',
    name: userInfo.name || '',
    picture: userInfo.picture || ''
  }

  return signInWithGoogleLocal(googleUser)
}

function signInWithGoogleLocal(googleUser) {
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const googleKey = `google_${googleUser.id}`

  if (users[googleKey]) {
    // Existing user — update name/picture from Google in case they changed
    users[googleKey].name = users[googleKey].name || googleUser.name
    users[googleKey].picture = googleUser.picture
    localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
    localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[googleKey]))
    return users[googleKey]
  }

  // New user
  const username = googleUser.email
    ? googleUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')
    : `user_${googleUser.id.slice(-8)}`
  const newUser = {
    id: googleUser.id,
    email: googleUser.email,
    username,
    name: googleUser.name,
    picture: googleUser.picture,
    bio: '',
    firstMake: { description: '', age: '' },
    domains: [],
    socials: { twitter: '', github: '', linkedin: '', substack: '', website: '' },
    embedFeed: { type: null, url: '' },
    projects: [],
    todayMaking: '',
    createdAt: new Date().toISOString()
  }

  users[googleKey] = newUser
  localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
  localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(newUser))
  return newUser
}

export async function signOut() {
  if (!isSupabaseConfigured()) {
    return signOutLocal()
  }

  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  if (!isSupabaseConfigured()) {
    return getCurrentUserLocal()
  }

  // Use getSession() instead of getUser() so expired access tokens
  // are auto-refreshed via the refresh token before returning.
  // getUser() makes a server call with the raw access token and
  // returns null when that token has expired.
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const user = session.user

  // Ensure profile exists (handles OAuth first login)
  await ensureProfileExists(user)

  const profile = await getProfile(user.id)
  return { ...user, ...profile }
}

export function onAuthStateChange(callback) {
  if (!isSupabaseConfigured()) {
    return { data: { subscription: { unsubscribe: () => {} } } }
  }

  return supabase.auth.onAuthStateChange(callback)
}

// ============================================
// PROFILE FUNCTIONS
// ============================================

export async function getProfile(userId) {
  if (!isSupabaseConfigured()) {
    return getProfileLocal(userId)
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error && error.code !== 'PGRST116') throw error
  return data ? profileFromDb(data) : data
}

export async function getProfileByUsername(username) {
  if (!isSupabaseConfigured()) {
    return getProfileByUsernameLocal(username)
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()

  if (error) throw error

  // Also fetch projects
  const profile = profileFromDb(data)
  const projects = await getProjectsByUserId(data.id)
  return { ...profile, projects }
}

// Convert DB snake_case profile to app camelCase format
function profileFromDb(dbProfile) {
  return {
    id: dbProfile.id,
    username: dbProfile.username,
    name: dbProfile.name,
    bio: dbProfile.bio,
    firstMake: {
      description: dbProfile.first_make_description || '',
      age: dbProfile.first_make_age || ''
    },
    domains: dbProfile.domains || [],
    todayMaking: dbProfile.today_making || '',
    socials: dbProfile.socials || { twitter: '', github: '', linkedin: '', substack: '', website: '' },
    embedFeed: dbProfile.embed_feed || { type: null, url: '' }
  }
}

export async function updateProfile(userId, updates) {
  if (!isSupabaseConfigured()) {
    return updateProfileLocal(userId, updates)
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({
      name: updates.name,
      bio: updates.bio,
      first_make_description: updates.firstMake?.description,
      first_make_age: updates.firstMake?.age,
      domains: updates.domains,
      today_making: updates.todayMaking,
      socials: updates.socials,
      embed_feed: updates.embedFeed
    })
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================
// PROJECT FUNCTIONS
// ============================================

export async function getProjectsByUserId(userId) {
  if (!isSupabaseConfigured()) {
    return getProjectsByUserIdLocal(userId)
  }

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data.map(projectFromDb)
}

export async function createProject(userId, project) {
  if (!isSupabaseConfigured()) {
    return createProjectLocal(userId, project)
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({
      user_id: userId,
      name: project.name,
      one_liner: project.oneLiner,
      role: project.role,
      current_stage: project.currentStage,
      start_date: project.startDate || null,
      end_date: project.endDate || null,
      ongoing: project.ongoing,
      domains: project.domains,
      links: project.links,
      outcome: project.outcome
    })
    .select()
    .single()

  if (error) throw error
  return projectFromDb(data)
}

export async function updateProject(projectId, updates) {
  if (!isSupabaseConfigured()) {
    return updateProjectLocal(projectId, updates)
  }

  const { data, error } = await supabase
    .from('projects')
    .update({
      name: updates.name,
      one_liner: updates.oneLiner,
      role: updates.role,
      current_stage: updates.currentStage,
      start_date: updates.startDate || null,
      end_date: updates.endDate || null,
      ongoing: updates.ongoing,
      domains: updates.domains,
      links: updates.links,
      outcome: updates.outcome
    })
    .eq('id', projectId)
    .select()
    .single()

  if (error) throw error
  return projectFromDb(data)
}

export async function deleteProject(projectId) {
  if (!isSupabaseConfigured()) {
    return deleteProjectLocal(projectId)
  }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) throw error
}

// Helper to convert DB format to app format
function projectFromDb(dbProject) {
  return {
    id: dbProject.id,
    name: dbProject.name,
    oneLiner: dbProject.one_liner,
    role: dbProject.role,
    currentStage: dbProject.current_stage,
    startDate: dbProject.start_date,
    endDate: dbProject.end_date,
    ongoing: dbProject.ongoing,
    domains: dbProject.domains || [],
    links: dbProject.links || [],
    outcome: dbProject.outcome
  }
}

// ============================================
// LOCAL STORAGE FALLBACK FUNCTIONS
// ============================================

function signUpLocal(email, password, username) {
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')

  if (users[email]) {
    throw new Error('Email already exists')
  }
  if (Object.values(users).some(u => u.username === username)) {
    throw new Error('Username already taken')
  }

  const newUser = {
    id: Date.now().toString(),
    email,
    password,
    username,
    name: '',
    bio: '',
    firstMake: { description: '', age: '' },
    domains: [],
    socials: { twitter: '', github: '', linkedin: '', substack: '', website: '' },
    embedFeed: { type: null, url: '' },
    projects: [],
    todayMaking: '',
    createdAt: new Date().toISOString()
  }

  users[email] = newUser
  localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
  localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(newUser))

  return newUser
}

function signInLocal(email, password) {
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const user = users[email]

  if (!user || user.password !== password) {
    throw new Error('Invalid email or password')
  }

  localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(user))
  return user
}

function signOutLocal() {
  localStorage.removeItem('makerPortfolio_currentUser')
}

function getCurrentUserLocal() {
  const saved = localStorage.getItem('makerPortfolio_currentUser')
  return saved ? JSON.parse(saved) : null
}

function getProfileLocal(userId) {
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  return Object.values(users).find(u => u.id === userId)
}

function getProfileByUsernameLocal(username) {
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  return Object.values(users).find(u => u.username === username)
}

function updateProfileLocal(userId, updates) {
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const userEmail = Object.keys(users).find(email => users[email].id === userId)

  if (userEmail) {
    users[userEmail] = { ...users[userEmail], ...updates }
    localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
    localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userEmail]))
    return users[userEmail]
  }
  return null
}

function getProjectsByUserIdLocal(userId) {
  const user = getProfileLocal(userId)
  return user?.projects || []
}

function createProjectLocal(userId, project) {
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const userEmail = Object.keys(users).find(email => users[email].id === userId)

  if (userEmail) {
    const newProject = { ...project, id: Date.now().toString() }
    users[userEmail].projects = [...(users[userEmail].projects || []), newProject]
    localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
    localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userEmail]))
    return newProject
  }
  return null
}

function updateProjectLocal(projectId, updates) {
  const currentUser = JSON.parse(localStorage.getItem('makerPortfolio_currentUser'))
  if (!currentUser) return null

  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const userEmail = currentUser.email

  if (users[userEmail]) {
    users[userEmail].projects = users[userEmail].projects.map(p =>
      p.id === projectId ? { ...p, ...updates } : p
    )
    localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
    localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userEmail]))
    return updates
  }
  return null
}

function deleteProjectLocal(projectId) {
  const currentUser = JSON.parse(localStorage.getItem('makerPortfolio_currentUser'))
  if (!currentUser) return

  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const userEmail = currentUser.email

  if (users[userEmail]) {
    users[userEmail].projects = users[userEmail].projects.filter(p => p.id !== projectId)
    localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
    localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userEmail]))
  }
}
