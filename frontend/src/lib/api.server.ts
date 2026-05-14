import 'server-only'

import type { Agent, ShameEntry, ShameTranscriptEntry } from '@/types'
import { API_INTERNAL_URL } from './constants'
import { v4 as uuidv4 } from 'uuid'

// Backend response shapes (snake_case)
interface AgentResponse {
  slug: string
  name: string
  vibe_label: string
  color_hex: string
  contributor_github: string
  contributor_name: string
  persona_summary: string
}

interface ShameEntryResponse {
  id: string
  slug: string
  title: string
  agent_slugs: string[]
  upvote_count: number
  is_featured: boolean
  preview: string
  created_at: string
}

interface TranscriptMessageResponse {
  id?: string
  role: 'user' | 'agent' | 'system'
  content: string
  agent_slug?: string
  agent_name?: string
  timestamp?: number
}

interface ShameTranscriptResponse {
  id: string
  slug: string
  title: string
  agent_slugs: string[]
  upvote_count: number
  is_featured: boolean
  transcript: TranscriptMessageResponse[]
  created_at: string
}

function mapAgent(raw: AgentResponse): Agent {
  return {
    slug: raw.slug,
    name: raw.name,
    vibeLabel: raw.vibe_label,
    persona: raw.persona_summary,
    accentColor: raw.color_hex,
    contributorHandle: raw.contributor_github,
    contributorName: raw.contributor_name,
    isEnabled: true,
  }
}

function mapShameEntry(raw: ShameEntryResponse): ShameEntry {
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    createdAt: raw.created_at,
    upvoteCount: raw.upvote_count,
    agentSlugs: raw.agent_slugs,
    preview: raw.preview,
    isFeatured: raw.is_featured,
  }
}

export async function fetchAgents(): Promise<Agent[]> {
  const url = `${API_INTERNAL_URL}/api/v1/agents`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 60 },
  })
  if (!res.ok) {
    throw new Error(`fetchAgents failed: ${res.status}`)
  }
  const data = await res.json() as { agents: AgentResponse[] }
  return data.agents.map(mapAgent)
}

export interface PaginationMeta {
  page: number
  page_size: number
  total_entries: number
  total_pages: number
}

export interface ShameEntriesResult {
  entries: ShameEntry[]
  pagination: PaginationMeta
}

interface ShameEntriesResponse {
  entries: ShameEntryResponse[]
  pagination: PaginationMeta
}

export async function fetchShameEntries(params?: {
  sort?: 'newest' | 'top'
  page?: number
  page_size?: number
}): Promise<ShameEntriesResult> {
  const searchParams = new URLSearchParams()
  if (params?.sort) searchParams.set('sort', params.sort)
  if (params?.page !== undefined) searchParams.set('page', String(params.page))
  if (params?.page_size !== undefined) searchParams.set('page_size', String(params.page_size))

  const query = searchParams.toString()
  const url = `${API_INTERNAL_URL}/api/v1/shame${query ? `?${query}` : ''}`

  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`fetchShameEntries failed: ${res.status}`)
  }
  const data = await res.json() as ShameEntriesResponse
  return {
    entries: data.entries.map(mapShameEntry),
    pagination: data.pagination,
  }
}

export async function fetchShameTranscript(slug: string): Promise<ShameTranscriptEntry> {
  const url = `${API_INTERNAL_URL}/api/v1/shame/${encodeURIComponent(slug)}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  if (res.status === 404) {
    throw new Error('NOT_FOUND')
  }
  if (!res.ok) {
    throw new Error(`fetchShameTranscript failed: ${res.status}`)
  }
  const data = await res.json() as ShameTranscriptResponse
  return {
    slug: data.slug,
    title: data.title,
    createdAt: data.created_at,
    upvoteCount: data.upvote_count,
    isFeatured: data.is_featured,
    messages: data.transcript.map((raw) => ({
      id: raw.id ?? uuidv4(),
      role: raw.role,
      content: raw.content,
      agentSlug: raw.agent_slug,
      agentName: raw.agent_name,
      timestamp: raw.timestamp ?? Date.now(),
      isStreaming: false,
    })),
  }
}
