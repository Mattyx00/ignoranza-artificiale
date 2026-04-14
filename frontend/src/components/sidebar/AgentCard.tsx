'use client'

import type { Agent } from '@/types'
import Toggle from '@/components/ui/Toggle'
import { cn } from '@/lib/utils'

export interface AgentCardProps {
  agent: Agent
  onToggle: (enabled: boolean) => void
}

export default function AgentCard({ agent, onToggle }: AgentCardProps) {
  return (
    <div
      className={cn(
        'px-3 py-3 transition-all duration-150',
        'hover:bg-[--surface] cursor-default',
        !agent.isEnabled && 'opacity-40 grayscale',
      )}
      style={{
        borderLeft: `3px solid ${agent.isEnabled ? agent.accentColor : 'var(--border)'}`,
        transition: 'border-color 150ms ease, opacity 150ms ease',
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="font-display text-xs font-semibold text-[--text-primary] truncate">
            {agent.name}
          </span>
          <span
            className="text-[9px] font-mono uppercase tracking-[0.08em]"
            style={{ color: agent.accentColor }}
          >
            {agent.vibeLabel}
          </span>
        </div>
        <Toggle
          pressed={agent.isEnabled}
          onPressedChange={onToggle}
          aria-label={`${agent.isEnabled ? 'Disabilita' : 'Abilita'} ${agent.name}`}
        />
      </div>

      <p className="mt-2 text-[10px] font-body text-[--text-muted] leading-relaxed line-clamp-2">
        {agent.persona}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[10px] text-[--text-primary]">
          {agent.contributorName}
        </span>
        {agent.contributorHandle && (
          <a
            href={`https://github.com/${agent.contributorHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`GitHub di ${agent.contributorName}`}
            className="text-[--text-muted] hover:text-[--text-primary] transition-colors flex-shrink-0"
            tabIndex={agent.isEnabled ? 0 : -1}
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        )}
        {agent.contributorLinkedin && (
          <a
            href={`https://linkedin.com/in/${agent.contributorLinkedin}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`LinkedIn di ${agent.contributorName}`}
            className="text-[--text-muted] hover:text-[--text-primary] transition-colors flex-shrink-0"
            tabIndex={agent.isEnabled ? 0 : -1}
            onClick={(e) => e.stopPropagation()}
          >
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M20.447 20.452H16.89v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a1.98 1.98 0 0 1-1.98-1.98c0-1.093.887-1.98 1.98-1.98s1.98.887 1.98 1.98a1.98 1.98 0 0 1-1.98 1.98zm1.979 13.019H3.358V9h3.958v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
            </svg>
          </a>
        )}
      </div>
    </div>
  )
}
