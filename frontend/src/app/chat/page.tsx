'use client'

import { useState } from 'react'
import { useChat } from '@/hooks/useChat'
import { useAgents } from '@/hooks/useAgents'
import AgentRoster from '@/components/sidebar/AgentRoster'
import ChatWindow from '@/components/chat/ChatWindow'
import AgentBadge from '@/components/chat/AgentBadge'
import Navbar from '@/components/layout/Navbar'
import Button from '@/components/ui/Button'
import { Menu, X } from 'lucide-react'

export default function ChatPage() {
  const { agents, enabledAgentSlugs, toggleAgent, isLoading: agentsLoading } = useAgents()
  const { messages, isStreaming, activeAgentSlug, activeAgentName, error, conversationId, sendMessage, resetSession } =
    useChat({ enabledAgentSlugs })
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [_shameSlug, setShameSlug] = useState<string | null>(null)

  const activeAgent = agents.find((a) => a.slug === activeAgentSlug)

  const session = {
    messages,
    activeAgentSlug,
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[--background] overflow-hidden">
      <Navbar />

      {/* Content area under navbar */}
      <div className="flex flex-1 overflow-hidden pt-12">
        {/* Desktop sidebar */}
        <aside
          className="hidden lg:flex flex-col shrink-0 border-r border-[--border] overflow-y-auto bg-[--background]"
          style={{ width: 'clamp(260px, 22vw, 320px)' }}
        >
          <AgentRoster
            agents={agents}
            onToggleAgent={toggleAgent}
            isLoading={agentsLoading}
          />
        </aside>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top bar */}
          <div className="shrink-0 h-10 border-b border-[--border] flex items-center justify-between gap-2 px-3 sm:px-4">
            {/* Mobile: drawer button */}
            <button
              className="lg:hidden flex items-center gap-2 px-2 py-1.5 -ml-1 text-[--text-muted] hover:text-[--text-primary] transition-colors shrink-0 min-h-[44px]"
              onClick={() => setMobileDrawerOpen(true)}
              aria-label="Apri pannello agenti"
            >
              <Menu size={20} />
              <span className="font-mono text-xs uppercase tracking-[0.06em]">
                Agenti
                {enabledAgentSlugs.length > 0 && (
                  <span className="ml-1 text-[--accent-red]">({enabledAgentSlugs.length})</span>
                )}
              </span>
            </button>

            {/* Active agent or status — hidden on very small screens when streaming to avoid overflow */}
            <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
              {isStreaming && activeAgentName && activeAgent ? (
                <>
                  <AgentBadge
                    agentName={activeAgentName}
                    accentColor={activeAgent.accentColor}
                    size="sm"
                  />
                  <span className="font-mono text-[10px] text-[--text-muted] truncate hidden sm:inline">
                    In elaborazione...
                  </span>
                </>
              ) : (
                <span className="font-mono text-[10px] text-[--text-muted] uppercase tracking-[0.06em] truncate hidden sm:inline">
                  Chat — Interfaccia Standard
                </span>
              )}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={resetSession}
              className="text-[10px] font-mono shrink-0 whitespace-nowrap"
              aria-label="Nuova sessione"
            >
              <span className="hidden sm:inline">Nuova sessione</span>
              <span className="sm:hidden">Reset</span>
            </Button>
          </div>

          {/* Error banner */}
          {error && (
            <div className="shrink-0 bg-[--accent-system-subtle] border-b border-[--accent-system] px-4 py-2">
              <p className="font-mono text-[10px] text-[--accent-system]">{error}</p>
            </div>
          )}

          {/* Chat window */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ChatWindow
              session={session}
              agents={agents}
              onSendMessage={sendMessage}
              isStreaming={isStreaming}
              conversationId={conversationId}
              onShameSuccess={(slug) => setShameSlug(slug)}
            />
          </div>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileDrawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-zinc-950/80"
            onClick={() => setMobileDrawerOpen(false)}
            aria-hidden="true"
          />
          {/* Drawer */}
          <div className="absolute bottom-0 left-0 right-0 bg-[--surface] border-t border-[--border] max-h-[70vh] overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[--border]">
              <span className="font-mono text-xs uppercase tracking-[0.08em] text-[--text-muted]">
                Agenti
              </span>
              <button
                onClick={() => setMobileDrawerOpen(false)}
                className="text-[--text-muted] hover:text-[--text-primary]"
                aria-label="Chiudi pannello agenti"
              >
                <X size={16} />
              </button>
            </div>
            <AgentRoster
              agents={agents}
              onToggleAgent={(agentId, enabled) => {
                toggleAgent(agentId, enabled)
              }}
              isLoading={agentsLoading}
            />
          </div>
        </div>
      )}
    </div>
  )
}
