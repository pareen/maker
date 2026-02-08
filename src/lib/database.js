import { supabase, isSupabaseConfigured } from './supabase'

// ============================================
// AUTH FUNCTIONS
// ============================================

export async function signUp(email, password, username) {
  if (!isSupabaseConfigured()) {
    return signUpLocal(email, password, username)
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  })

  if (error) throw error
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
  return data.user
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

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
  return data
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
  const projects = await getProjectsByUserId(data.id)
  return { ...data, projects }
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
      start_date: project.startDate,
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
      start_date: updates.startDate,
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
