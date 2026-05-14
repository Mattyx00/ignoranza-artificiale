import Link from 'next/link'
import type { ShameEntry } from '@/types'
import AgentBadge from '@/components/chat/AgentBadge'
import { formatItalianDate } from '@/lib/utils'
import { ArrowUp } from 'lucide-react'

export interface ShameListRowProps {
  entry: ShameEntry
  rank: number
}

export default function ShameListRow({ entry, rank }: ShameListRowProps) {
  return (
    <Link
      href={`/vergogna/${entry.slug}`}
      className="group grid grid-cols-[auto_1fr_auto] gap-4 sm:gap-6 items-start px-4 sm:px-8 py-5 border-b border-[--border] hover:bg-[--surface] transition-colors duration-150"
    >
      {/* Rank */}
      <div className="font-mono text-xs text-[--text-muted] tracking-[0.1em] pt-1 w-8 sm:w-10 text-right tabular-nums">
        #{String(rank).padStart(2, '0')}
      </div>

      {/* Main content */}
      <div className="min-w-0">
        <h3 className="font-serif text-base sm:text-lg text-[--text-primary] leading-snug group-hover:text-white transition-colors duration-150 mb-1.5">
          {entry.title}
        </h3>
        <p className="font-body text-xs text-[--text-muted] leading-relaxed line-clamp-2 mb-3">
          {entry.preview}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {entry.agentSlugs.map((slug) => (
            <AgentBadge
              key={slug}
              agentName={slug}
              accentColor="#71717a"
              size="sm"
            />
          ))}
          <span className="font-mono text-[10px] text-[--text-muted] tracking-wide sm:hidden">
            {formatItalianDate(entry.createdAt)}
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-col items-end gap-2 shrink-0 pt-1">
        <span className="flex items-center gap-1 font-mono text-xs text-[--text-primary] tabular-nums">
          <ArrowUp size={12} strokeWidth={2.5} className="text-[--text-muted] group-hover:text-[--accent-system] transition-colors duration-150" />
          {entry.upvoteCount}
        </span>
        <span className="font-mono text-[10px] text-[--text-muted] tracking-wide whitespace-nowrap hidden sm:inline">
          {formatItalianDate(entry.createdAt)}
        </span>
      </div>
    </Link>
  )
}
