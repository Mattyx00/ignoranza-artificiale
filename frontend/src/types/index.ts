export interface Agent {
  slug: string
  name: string
  vibeLabel: string
  persona: string
  accentColor: string
  contributorHandle: string
  contributorName: string
  isEnabled: boolean
}

export type MessageRole = 'user' | 'agent' | 'system'

export interface ChatMessage {
  id: string
  role: MessageRole
  content: string
  agentSlug?: string
  agentName?: string
  timestamp: number
  isStreaming?: boolean
}

export interface ChatSession {
  messages: ChatMessage[]
  activeAgentSlug: string | null
}

export interface ShameEntry {
  id: string
  slug: string
  title: string
  createdAt: string
  upvoteCount: number
  agentSlugs: string[]
  preview: string
  isFeatured: boolean
}

export interface ShameTranscriptEntry {
  slug: string
  title: string
  createdAt: string
  upvoteCount: number
  isFeatured: boolean
  messages: ChatMessage[]
}

export interface ApiError {
  detail: {
    code: string
    message: string
    retry_after_seconds?: number | null
  }
}

export interface UpvoteResponse {
  slug: string
  upvoteCount: number
}

export interface SubmitShameResponse {
  slug: string
  publicUrl: string
}
