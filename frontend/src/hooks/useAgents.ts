import type { Agent } from '@/types'

export interface UseAgentsReturn {
  agents: Agent[]
  isLoading: boolean
  error: string | null
  activeAgent: Agent | null
  setActiveAgentSlug: (slug: string) => void
}

export function useAgents(): UseAgentsReturn {
  throw new Error('not implemented')
}
