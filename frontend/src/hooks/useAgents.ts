'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Agent } from '@/types'
import { API_BASE_URL } from '@/lib/constants'
import { getSessionId } from '@/lib/utils'

export interface UseAgentsReturn {
  agents: Agent[]
  enabledAgentSlugs: string[]
  toggleAgent: (agentSlug: string, enabled: boolean) => void
  isLoading: boolean
  error: string | null
}

interface AgentResponse {
  slug: string
  name: string
  vibe_label: string
  color_hex: string
  contributor_github: string
  contributor_name: string
  contributor_linkedin?: string
  persona_summary: string
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
    contributorLinkedin: raw.contributor_linkedin,
    isEnabled: true,
  }
}

export function useAgents(): UseAgentsReturn {
  const [agents, setAgents] = useState<Agent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const sessionId = getSessionId()

    fetch(`${API_BASE_URL}/api/v1/agents`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Session-ID': sessionId,
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ agents: AgentResponse[] }>
      })
      .then((data) => {
        if (!cancelled) {
          setAgents(data.agents.map(mapAgent))
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Si è verificato un errore imprevisto.'
          setError(message)
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  const toggleAgent = useCallback((agentSlug: string, enabled: boolean) => {
    setAgents((prev) =>
      prev.map((a) => (a.slug === agentSlug ? { ...a, isEnabled: enabled } : a)),
    )
  }, [])

  const enabledAgentSlugs = agents.filter((a) => a.isEnabled).map((a) => a.slug)

  return { agents, enabledAgentSlugs, toggleAgent, isLoading, error }
}
