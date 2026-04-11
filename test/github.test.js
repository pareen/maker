import { describe, it, expect } from 'vitest'
import { mapRepoToProject } from '../src/lib/github.js'

describe('mapRepoToProject', () => {
  const baseRepo = {
    name: 'my-project',
    description: 'A cool project',
    language: 'JavaScript',
    html_url: 'https://github.com/user/my-project',
    homepage: 'https://my-project.com',
    topics: ['react', 'web'],
    created_at: '2024-06-15T10:00:00Z',
    pushed_at: '2025-01-01T10:00:00Z',
    stargazers_count: 42,
    forks_count: 5,
    fork: false,
    archived: false,
  }

  it('maps basic repo fields correctly', () => {
    const project = mapRepoToProject(baseRepo)
    expect(project.name).toBe('my-project')
    expect(project.oneLiner).toBe('A cool project')
    expect(project.role).toBe('solo')
    expect(project.startDate).toBe('2024-06')
    expect(project.ongoing).toBe(true)
    expect(project.githubUrl).toBe('https://github.com/user/my-project')
  })

  it('includes both github url and homepage in links', () => {
    const project = mapRepoToProject(baseRepo)
    expect(project.links).toEqual([
      'https://github.com/user/my-project',
      'https://my-project.com',
    ])
  })

  it('adds language to domains if not in topics', () => {
    const project = mapRepoToProject(baseRepo)
    expect(project.domains).toContain('react')
    expect(project.domains).toContain('web')
    expect(project.domains).toContain('javascript')
  })

  it('does not duplicate language if already in topics', () => {
    const repo = { ...baseRepo, language: 'React', topics: ['react'] }
    const project = mapRepoToProject(repo)
    const reactCount = project.domains.filter(d => d === 'react').length
    expect(reactCount).toBe(1)
  })

  it('uses fallback oneLiner when description is null', () => {
    const repo = { ...baseRepo, description: null, language: 'Rust' }
    const project = mapRepoToProject(repo)
    expect(project.oneLiner).toBe('A Rust project')
  })

  it('uses generic fallback when both description and language are null', () => {
    const repo = { ...baseRepo, description: null, language: null }
    const project = mapRepoToProject(repo)
    expect(project.oneLiner).toBe('A code project')
  })

  it('sets ongoing=false for archived repos', () => {
    const repo = { ...baseRepo, archived: true }
    const project = mapRepoToProject(repo)
    expect(project.ongoing).toBe(false)
  })

  it('infers stage=idea for 0-star repos', () => {
    const repo = { ...baseRepo, stargazers_count: 0, homepage: null }
    const project = mapRepoToProject(repo)
    expect(project.currentStage).toBe('idea')
  })

  it('infers stage=mvp for repos with a few stars', () => {
    const repo = { ...baseRepo, stargazers_count: 5, homepage: null }
    const project = mapRepoToProject(repo)
    expect(project.currentStage).toBe('mvp')
  })

  it('infers stage=launch for repos with 10+ stars', () => {
    const repo = { ...baseRepo, stargazers_count: 15 }
    const project = mapRepoToProject(repo)
    expect(project.currentStage).toBe('launch')
  })

  it('infers stage=launch for repos with a homepage', () => {
    const repo = { ...baseRepo, stargazers_count: 3, homepage: 'https://example.com' }
    const project = mapRepoToProject(repo)
    expect(project.currentStage).toBe('launch')
  })

  it('infers stage=believers for 100+ stars', () => {
    const repo = { ...baseRepo, stargazers_count: 150 }
    const project = mapRepoToProject(repo)
    expect(project.currentStage).toBe('believers')
  })

  it('infers stage=users for 500+ stars', () => {
    const repo = { ...baseRepo, stargazers_count: 600 }
    const project = mapRepoToProject(repo)
    expect(project.currentStage).toBe('users')
  })

  it('infers stage=users for archived repos with 100+ stars', () => {
    const repo = { ...baseRepo, archived: true, stargazers_count: 200 }
    const project = mapRepoToProject(repo)
    expect(project.currentStage).toBe('users')
  })

  it('infers stage=launch for archived repos with few stars', () => {
    const repo = { ...baseRepo, archived: true, stargazers_count: 5 }
    const project = mapRepoToProject(repo)
    expect(project.currentStage).toBe('launch')
  })
})
