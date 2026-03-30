import { supabase, isSupabaseConfigured } from './supabase'

// Track whether the current user authenticated via Supabase or localStorage.
// Google OAuth users are stored in localStorage even when Supabase is configured,
// so CRUD functions must route based on auth mode, not just isSupabaseConfigured().
let _authMode = null // 'supabase' | 'local' | null
export function setAuthMode(mode) { _authMode = mode }
export function getAuthMode() { return _authMode }

// Use Supabase for CRUD operations only if configured AND user has a Supabase session
function useSupabase() {
  return isSupabaseConfigured() && _authMode === 'supabase'
}

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

// Helper to create profile on first authenticated access.
// The DB trigger `handle_new_user` fires on auth.users INSERT but may fail
// for OAuth users (no username in metadata → NOT NULL violation). This
// function acts as a safety net, creating the profile if the trigger missed it.
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

    // Use upsert to avoid race conditions (trigger may have partially succeeded)
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, username }, { onConflict: 'id' })

    if (error) {
      // If username collision, append random suffix
      if (error.code === '23505' && error.message?.includes('username')) {
        const fallback = `${username}_${Math.random().toString(36).slice(2, 6)}`
        await supabase
          .from('profiles')
          .upsert({ id: user.id, username: fallback }, { onConflict: 'id' })
      } else {
        throw error
      }
    }
  }
}

// Redirect to Google OAuth via Supabase (no popups — works reliably everywhere)
export async function signInWithGoogle() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Google sign-in requires Supabase.')
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        prompt: 'select_account'
      }
    }
  })

  if (error) throw error
  return data
}

// Migrate legacy localStorage Google OAuth data to Supabase.
// Called after a Supabase Google sign-in to check if this user had
// data stored in localStorage from the old custom Google OAuth flow.
export async function migrateLocalStorageData(supabaseUser) {
  if (!supabaseUser?.email) return false

  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')

  // Find legacy data by matching email or Google sub ID
  const googleSub = supabaseUser.user_metadata?.sub
  const legacyKey = googleSub ? `google_${googleSub}` : null
  let legacyUser = legacyKey ? users[legacyKey] : null

  // Also try matching by email across all localStorage users
  if (!legacyUser) {
    const emailKey = Object.keys(users).find(key => users[key].email === supabaseUser.email)
    if (emailKey) legacyUser = users[emailKey]
  }

  if (!legacyUser) return false // No legacy data to migrate

  console.log('Migrating localStorage data for', supabaseUser.email)

  try {
    // Migrate profile data (name, bio, socials, etc.)
    const profileFields = {}
    if (legacyUser.name) profileFields.name = legacyUser.name
    if (legacyUser.bio) profileFields.bio = legacyUser.bio
    if (legacyUser.firstMake?.description) {
      profileFields.first_make_description = legacyUser.firstMake.description
      profileFields.first_make_age = legacyUser.firstMake.age || ''
    }
    if (legacyUser.domains?.length > 0) profileFields.domains = legacyUser.domains
    if (legacyUser.todayMaking) profileFields.today_making = legacyUser.todayMaking
    if (legacyUser.socials) profileFields.socials = legacyUser.socials
    if (legacyUser.embedFeed?.type) profileFields.embed_feed = legacyUser.embedFeed

    if (Object.keys(profileFields).length > 0) {
      await supabase.from('profiles').update(profileFields).eq('id', supabaseUser.id)
    }

    // Migrate projects (skip any that already exist by matching GitHub URL or name)
    if (legacyUser.projects?.length > 0) {
      const { data: existingProjects } = await supabase
        .from('projects')
        .select('name, links')
        .eq('user_id', supabaseUser.id)

      const existingLinks = new Set((existingProjects || []).flatMap(p => p.links || []))
      const existingNames = new Set((existingProjects || []).map(p => p.name))

      for (const project of legacyUser.projects) {
        // Skip if any link already exists, or if same name already imported
        const hasOverlap = project.links?.some(l => existingLinks.has(l))
        if (hasOverlap || existingNames.has(project.name)) continue

        await supabase.from('projects').insert({
          user_id: supabaseUser.id,
          name: project.name,
          one_liner: project.oneLiner || null,
          role: project.role || 'solo',
          current_stage: project.currentStage || 'idea',
          start_date: project.startDate || null,
          end_date: project.endDate || null,
          ongoing: project.ongoing ?? true,
          domains: project.domains || [],
          links: project.links || [],
          outcome: project.outcome || null
        })
      }
    }

    // Migrate updates (skip if user already has updates — prevents re-migration duplication)
    const { data: existingUpdates } = await supabase
      .from('updates')
      .select('id')
      .eq('user_id', supabaseUser.id)
      .limit(1)

    if (!existingUpdates?.length) {
      const legacyUpdates = JSON.parse(localStorage.getItem('makerPortfolio_updates') || '{}')
      const userUpdates = legacyUpdates[legacyUser.id] || []
      if (userUpdates.length > 0) {
        for (const update of userUpdates) {
          await supabase.from('updates').insert({
            user_id: supabaseUser.id,
            content: update.content,
            created_at: update.created_at
          })
        }
      }
    }

    // Clean up localStorage after successful migration
    const updatedUsers = { ...users }
    // Remove all keys matching this user
    for (const key of Object.keys(updatedUsers)) {
      if (updatedUsers[key].email === supabaseUser.email) {
        delete updatedUsers[key]
      }
    }
    if (legacyKey && updatedUsers[legacyKey]) {
      delete updatedUsers[legacyKey]
    }
    localStorage.setItem('makerPortfolio_users', JSON.stringify(updatedUsers))
    localStorage.removeItem('makerPortfolio_currentUser')

    // Clean up legacy updates
    if (legacyUpdates[legacyUser.id]) {
      delete legacyUpdates[legacyUser.id]
      localStorage.setItem('makerPortfolio_updates', JSON.stringify(legacyUpdates))
    }

    console.log('Migration complete for', supabaseUser.email)
    return true
  } catch (error) {
    console.error('Migration failed (data preserved in localStorage):', error)
    // Don't delete localStorage data if migration failed
    return false
  }
}

export async function signOut() {
  // Always clear localStorage (Google-authed users use it even with Supabase configured)
  signOutLocal()
  // Clear persisted GitHub token so it doesn't linger after logout
  localStorage.removeItem('makerPortfolio_githubToken')

  if (!isSupabaseConfigured()) return

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
  if (!session?.user) {
    // No Supabase session — check localStorage for Google-authed users
    return getCurrentUserLocal()
  }

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
  if (!useSupabase()) {
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
  // Public profile lookup: check both Supabase and localStorage.
  // The viewed user might be stored in either backend.
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (data && !error) {
      const profile = profileFromDb(data)
      const projects = await getProjectsByUserId(data.id)
      const updates = await getUpdatesByUserId(data.id)
      return { ...profile, projects, updates }
    }
  }

  // Fall back to localStorage (covers Google OAuth users and no-Supabase setups)
  return getProfileByUsernameLocal(username)
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
  if (!useSupabase()) {
    return updateProfileLocal(userId, updates)
  }

  // Only send fields that are actually present in the updates object.
  // Sending undefined fields would null them out in the database.
  const row = {}
  if (updates.name !== undefined) row.name = updates.name
  if (updates.bio !== undefined) row.bio = updates.bio
  if (updates.firstMake !== undefined) {
    row.first_make_description = updates.firstMake?.description
    row.first_make_age = updates.firstMake?.age
  }
  if (updates.domains !== undefined) row.domains = updates.domains
  if (updates.todayMaking !== undefined) row.today_making = updates.todayMaking
  if (updates.socials !== undefined) row.socials = updates.socials
  if (updates.embedFeed !== undefined) row.embed_feed = updates.embedFeed

  if (Object.keys(row).length === 0) return // nothing to update

  const { data, error } = await supabase
    .from('profiles')
    .update(row)
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
  if (!useSupabase()) {
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
  if (!useSupabase()) {
    return createProjectLocal(userId, project)
  }

  // Deduplicate: if this project has a GitHub URL, check if user already has it
  const githubUrl = project.githubUrl || project.links?.find(l => l.match(/^https?:\/\/github\.com\//i))
  if (githubUrl) {
    const { data: existing } = await supabase
      .from('projects')
      .select('id')
      .eq('user_id', userId)
      .contains('links', [githubUrl])
      .limit(1)

    if (existing?.length > 0) {
      // Already imported — return the existing project instead of creating a duplicate
      const { data: full } = await supabase
        .from('projects')
        .select('*')
        .eq('id', existing[0].id)
        .single()
      return projectFromDb(full)
    }
  }

  const row = {
    user_id: userId,
    name: project.name,
    one_liner: project.oneLiner || null,
    role: project.role || 'solo',
    current_stage: project.currentStage || 'idea',
    start_date: project.startDate || null,
    end_date: project.endDate || null,
    ongoing: project.ongoing ?? true,
    domains: project.domains || [],
    links: project.links || [],
    outcome: project.outcome || null
  }

  const { data, error } = await supabase
    .from('projects')
    .insert(row)
    .select()
    .single()

  if (error) throw error
  return projectFromDb(data)
}

export async function updateProject(projectId, updates) {
  if (!useSupabase()) {
    return updateProjectLocal(projectId, updates)
  }

  const row = {
    name: updates.name,
    one_liner: updates.oneLiner || null,
    role: updates.role || 'solo',
    current_stage: updates.currentStage || 'idea',
    start_date: updates.startDate || null,
    end_date: updates.endDate || null,
    ongoing: updates.ongoing ?? true,
    domains: updates.domains || [],
    links: updates.links || [],
    outcome: updates.outcome || null
  }

  const { data, error } = await supabase
    .from('projects')
    .update(row)
    .eq('id', projectId)
    .select()
    .single()

  if (error) throw error
  return projectFromDb(data)
}

export async function deleteProject(projectId) {
  if (!useSupabase()) {
    return deleteProjectLocal(projectId)
  }

  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)

  if (error) throw error
}

// ============================================
// UPDATE FUNCTIONS (timeline / feed)
// ============================================

export async function getUpdatesByUserId(userId) {
  if (!useSupabase()) {
    return getUpdatesByUserIdLocal(userId)
  }

  const { data, error } = await supabase
    .from('updates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function createUpdate(userId, content) {
  if (!useSupabase()) {
    return createUpdateLocal(userId, content)
  }

  const { data, error } = await supabase
    .from('updates')
    .insert({ user_id: userId, content })
    .select()
    .single()

  if (error) throw error

  // Also update today_making on the profile so the latest update shows there
  await supabase
    .from('profiles')
    .update({ today_making: content })
    .eq('id', userId)

  return data
}

export async function deleteUpdate(updateId, userId) {
  if (!useSupabase()) {
    return deleteUpdateLocal(updateId, userId)
  }

  const { error } = await supabase
    .from('updates')
    .delete()
    .eq('id', updateId)

  if (error) throw error

  // Update todayMaking to the next most recent update (or clear it)
  if (userId) {
    const { data: latest } = await supabase
      .from('updates')
      .select('content')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)

    await supabase
      .from('profiles')
      .update({ today_making: latest?.[0]?.content || '' })
      .eq('id', userId)
  }
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
  const userKey = Object.keys(users).find(key => users[key].id === userId)

  if (!userKey) {
    throw new Error('User not found in local storage. Please log out and log back in.')
  }

  // Only merge profile fields — never overwrite projects, id, email, etc.
  const profileFields = ['name', 'bio', 'firstMake', 'domains', 'todayMaking', 'socials', 'embedFeed']
  for (const field of profileFields) {
    if (field in updates) {
      users[userKey][field] = updates[field]
    }
  }
  localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
  localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userKey]))
  return users[userKey]
}

function getProjectsByUserIdLocal(userId) {
  const user = getProfileLocal(userId)
  return user?.projects || []
}

function createProjectLocal(userId, project) {
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const userKey = Object.keys(users).find(key => users[key].id === userId)

  if (!userKey) {
    throw new Error('User not found in local storage. Please log out and log back in.')
  }

  // Dedup: check for overlapping GitHub URLs in existing projects
  const githubUrl = project.githubUrl || project.links?.find(l => l.match(/^https?:\/\/github\.com\//i))
  if (githubUrl) {
    const existing = (users[userKey].projects || []).find(p =>
      p.links?.includes(githubUrl)
    )
    if (existing) return existing
  }

  const newProject = { ...project, id: Date.now().toString() }
  users[userKey].projects = [...(users[userKey].projects || []), newProject]
  localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
  localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userKey]))
  return newProject
}

function updateProjectLocal(projectId, updates) {
  const currentUser = JSON.parse(localStorage.getItem('makerPortfolio_currentUser'))
  if (!currentUser) return null

  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const userKey = Object.keys(users).find(key => users[key].id === currentUser.id)

  if (userKey && users[userKey]) {
    users[userKey].projects = users[userKey].projects.map(p =>
      p.id === projectId ? { ...p, ...updates } : p
    )
    localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
    localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userKey]))
    return updates
  }
  return null
}

function deleteProjectLocal(projectId) {
  const currentUser = JSON.parse(localStorage.getItem('makerPortfolio_currentUser'))
  if (!currentUser) return

  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const userKey = Object.keys(users).find(key => users[key].id === currentUser.id)

  if (userKey && users[userKey]) {
    users[userKey].projects = users[userKey].projects.filter(p => p.id !== projectId)
    localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
    localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userKey]))
  }
}

function getUpdatesByUserIdLocal(userId) {
  const updates = JSON.parse(localStorage.getItem('makerPortfolio_updates') || '{}')
  return (updates[userId] || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

function createUpdateLocal(userId, content) {
  const updates = JSON.parse(localStorage.getItem('makerPortfolio_updates') || '{}')
  const newUpdate = { id: Date.now().toString(), user_id: userId, content, created_at: new Date().toISOString() }
  updates[userId] = [newUpdate, ...(updates[userId] || [])]
  localStorage.setItem('makerPortfolio_updates', JSON.stringify(updates))

  // Also update todayMaking on the user profile
  const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
  const userKey = Object.keys(users).find(key => users[key].id === userId)
  if (userKey) {
    users[userKey].todayMaking = content
    localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
    localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userKey]))
  }

  return newUpdate
}

function deleteUpdateLocal(updateId, userId) {
  const updates = JSON.parse(localStorage.getItem('makerPortfolio_updates') || '{}')
  for (const uid of Object.keys(updates)) {
    updates[uid] = updates[uid].filter(u => u.id !== updateId)
  }
  localStorage.setItem('makerPortfolio_updates', JSON.stringify(updates))

  // Update todayMaking to the next most recent update
  if (userId) {
    const remaining = (updates[userId] || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const users = JSON.parse(localStorage.getItem('makerPortfolio_users') || '{}')
    const userKey = Object.keys(users).find(key => users[key].id === userId)
    if (userKey) {
      users[userKey].todayMaking = remaining[0]?.content || ''
      localStorage.setItem('makerPortfolio_users', JSON.stringify(users))
      localStorage.setItem('makerPortfolio_currentUser', JSON.stringify(users[userKey]))
    }
  }
}
