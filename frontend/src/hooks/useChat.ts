'use client'

import { useState, useCallback, useRef } from 'react'
import type { ChatMessage } from '@/types'
import { API_BASE_URL } from '@/lib/constants'
import { getSessionId, generateConversationId } from '@/lib/utils'
import { v4 as uuidv4 } from 'uuid'

export interface UseChatOptions {
  enabledAgentSlugs: string[]
}

export interface UseChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  activeAgentSlug: string | null
  activeAgentName: string | null
  error: string | null
  conversationId: string
  sendMessage: (text: string) => Promise<void>
  resetSession: () => void
}

interface SSEAgentSelectedEvent {
  event: 'agent_selected'
  data: {
    slug: string
    name: string
    color_hex: string
    vibe_label: string
  }
}

interface SSETokenEvent {
  event: 'token'
  data: {
    delta: string
  }
}

interface SSEDoneEvent {
  event: 'done'
  data: {
    conversation_id: string
    total_tokens: number
  }
}

interface SSEErrorEvent {
  event: 'error'
  data: {
    code: string
    message: string
  }
}

type SSEEvent = SSEAgentSelectedEvent | SSETokenEvent | SSEDoneEvent | SSEErrorEvent

function parseSSELine(line: string): SSEEvent | null {
  if (!line.startsWith('data:')) return null
  const raw = line.slice(5).trim()
  if (!raw || raw === '[DONE]') return null
  try {
    return JSON.parse(raw) as SSEEvent
  } catch {
    return null
  }
}

export function useChat(options: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [activeAgentSlug, setActiveAgentSlug] = useState<string | null>(null)
  const [activeAgentName, setActiveAgentName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const conversationIdRef = useRef<string>(generateConversationId())
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = useCallback(
    async (text: string) => {
      if (isStreaming) return
      if (!text.trim()) return

      setError(null)

      const userMessage: ChatMessage = {
        id: uuidv4(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      }

      const placeholderId = uuidv4()
      const placeholder: ChatMessage = {
        id: placeholderId,
        role: 'agent',
        content: '',
        timestamp: Date.now(),
        isStreaming: true,
      }

      setMessages((prev) => [...prev, userMessage, placeholder])
      setIsStreaming(true)

      const sessionId = getSessionId()

      // Build conversation history from current messages (excluding the new placeholder)
      const historySnapshot = [...messages, userMessage]
      const conversationHistory = historySnapshot.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : m.role,
        content: m.content,
      }))

      abortControllerRef.current = new AbortController()

      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/chat/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-ID': sessionId,
          },
          body: JSON.stringify({
            message: text.trim(),
            // FIXME: agent_slug is always null — determine intent (forced single-agent selection?) before implementing
            agent_slug: null,
            enabled_agent_slugs: options.enabledAgentSlugs,
            conversation_history: conversationHistory,
          }),
          signal: abortControllerRef.current.signal,
        })

        if (!res.ok) {
          // Pre-stream error — remove placeholder
          setMessages((prev) => prev.filter((m) => m.id !== placeholderId))
          setIsStreaming(false)

          let errorMessage = 'Si è verificato un errore imprevisto. Il sistema è costernato.'
          try {
            const errData = await res.json() as { detail: { code: string; message: string; retry_after_seconds?: number } }
            if (errData.detail?.code === 'RATE_LIMIT_EXCEEDED') {
              errorMessage = 'La sua frequenza di utilizzo supera i parametri consentiti.'
            } else if (errData.detail?.message) {
              errorMessage = errData.detail.message
            }
          } catch {
            // ignore parse error
          }
          setError(errorMessage)
          return
        }

        if (!res.body) {
          setMessages((prev) => prev.filter((m) => m.id !== placeholderId))
          setIsStreaming(false)
          setError('Il flusso di risposta non è disponibile.')
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue

            const parsed = parseSSELine(trimmed)
            if (!parsed) continue

            if (parsed.event === 'agent_selected') {
              const agentData = parsed.data
              setActiveAgentSlug(agentData.slug)
              setActiveAgentName(agentData.name)
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId
                    ? { ...m, agentSlug: agentData.slug, agentName: agentData.name }
                    : m,
                ),
              )
            } else if (parsed.event === 'token') {
              const delta = parsed.data.delta
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId ? { ...m, content: m.content + delta } : m,
                ),
              )
            } else if (parsed.event === 'done') {
              // Use accumulated content — backend does not resend full_message in done event.
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === placeholderId ? { ...m, isStreaming: false } : m,
                ),
              )
              setIsStreaming(false)
            } else if (parsed.event === 'error') {
              setMessages((prev) => prev.filter((m) => m.id !== placeholderId))
              setIsStreaming(false)
              setError(parsed.data.message || 'Si è verificato un errore imprevisto. Il sistema è costernato.')
            }
          }
        }

        // Ensure streaming is marked done if stream ended without 'done' event
        setIsStreaming(false)
        setMessages((prev) =>
          prev.map((m) => (m.id === placeholderId ? { ...m, isStreaming: false } : m)),
        )
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled — clean up placeholder
          setMessages((prev) => prev.filter((m) => m.id !== placeholderId))
          setIsStreaming(false)
          return
        }
        setMessages((prev) => prev.filter((m) => m.id !== placeholderId))
        setIsStreaming(false)
        setError('Si è verificato un errore imprevisto. Il sistema è costernato.')
      }
    },
    [isStreaming, messages, options.enabledAgentSlugs],
  )

  const resetSession = useCallback(() => {
    abortControllerRef.current?.abort()
    setMessages([])
    setIsStreaming(false)
    setActiveAgentSlug(null)
    setActiveAgentName(null)
    setError(null)
    conversationIdRef.current = generateConversationId()
  }, [])

  return {
    messages,
    isStreaming,
    activeAgentSlug,
    activeAgentName,
    error,
    conversationId: conversationIdRef.current,
    sendMessage,
    resetSession,
  }
}
