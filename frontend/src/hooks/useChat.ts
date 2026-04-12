import type { ChatSession } from '@/types'

export interface UseChatReturn {
  session: ChatSession
  isStreaming: boolean
  sendMessage: (prompt: string) => Promise<void>
  resetSession: () => void
}

export function useChat(agentSlug: string | null): UseChatReturn {
  throw new Error('not implemented')
}
