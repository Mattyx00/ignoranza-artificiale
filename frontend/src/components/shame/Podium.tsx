import Link from 'next/link'
import type { ShameEntry } from '@/types'
import AgentBadge from '@/components/chat/AgentBadge'
import { formatItalianDate } from '@/lib/utils'
import { ArrowUp, Crown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PodiumProps {
  entries: ShameEntry[]
}

interface Medal {
  label: string
  color: string
  ring: string
  glow: string
  heightClass: string
  rankSize: string
  titleSize: string
  showCrown: boolean
}

const MEDALS: Record<1 | 2 | 3, Medal> = {
  1: {
    label: 'ORO',
    color: '#d4a85a',
    ring: 'rgba(212, 168, 90, 0.45)',
    glow: 'rgba(212, 168, 90, 0.12)',
    heightClass: 'md:min-h-[420px]',
    rankSize: 'text-6xl md:text-7xl',
    titleSize: 'text-lg md:text-xl',
    showCrown: true,
  },
  2: {
    label: 'ARGENTO',
    color: '#c0c0c8',
    ring: 'rgba(192, 192, 200, 0.35)',
    glow: 'rgba(192, 192, 200, 0.08)',
    heightClass: 'md:min-h-[340px]',
    rankSize: 'text-5xl md:text-6xl',
    titleSize: 'text-base md:text-lg',
    showCrown: false,
  },
  3: {
    label: 'BRONZO',
    color: '#b87340',
    ring: 'rgba(184, 115, 64, 0.35)',
    glow: 'rgba(184, 115, 64, 0.08)',
    heightClass: 'md:min-h-[280px]',
    rankSize: 'text-5xl md:text-6xl',
    titleSize: 'text-base md:text-lg',
    showCrown: false,
  },
}

function PodiumStep({ rank, entry }: { rank: 1 | 2 | 3; entry: ShameEntry }) {
  const medal = MEDALS[rank]

  return (
    <Link
      href={`/vergogna/${entry.slug}`}
      className={cn(
        'group relative flex flex-col bg-[--surface] border rounded-sm overflow-hidden',
        'transition-all duration-200 hover:-translate-y-1',
        medal.heightClass,
      )}
      style={{
        borderColor: medal.ring,
        boxShadow: `0 0 0 1px ${medal.ring}, 0 20px 40px -20px ${medal.glow}`,
      }}
    >
      {/* Top stripe */}
      <div className="h-1 w-full" style={{ backgroundColor: medal.color }} />

      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div className="flex items-baseline gap-2">
          <span
            className={cn('font-serif font-bold leading-none select-none', medal.rankSize)}
            style={{ color: medal.color }}
          >
            {rank}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-[0.2em]"
            style={{ color: medal.color }}
          >
            {medal.label}
          </span>
        </div>
        {medal.showCrown && (
          <Crown size={20} style={{ color: medal.color }} className="shrink-0" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-5 pb-5">
        <h3
          className={cn(
            'font-serif font-normal text-[--text-primary] leading-snug mb-3',
            'group-hover:text-white transition-colors duration-150',
            medal.titleSize,
          )}
        >
          {entry.title}
        </h3>

        <p
          className={cn(
            'font-body text-[--text-muted] text-xs leading-relaxed flex-1',
            rank === 1 ? 'line-clamp-5' : 'line-clamp-3',
          )}
        >
          {entry.preview}
        </p>

        <div className="mt-4 pt-4 border-t border-[--border] flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {entry.agentSlugs.slice(0, 2).map((slug) => (
              <AgentBadge
                key={slug}
                agentName={slug}
                accentColor={medal.color}
                size="sm"
              />
            ))}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-[10px] text-[--text-muted] hidden sm:inline">
              {formatItalianDate(entry.createdAt)}
            </span>
            <span
              className="flex items-center gap-1 font-mono text-[11px] font-semibold"
              style={{ color: medal.color }}
            >
              <ArrowUp size={12} strokeWidth={2.5} />
              {entry.upvoteCount}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

export default function Podium({ entries }: PodiumProps) {
  if (entries.length === 0) return null

  const first = entries[0]
  const second = entries[1]
  const third = entries[2]

  return (
    <section
      aria-label="Top 3 Vergogna"
      className="px-4 sm:px-8 py-10 md:py-14 border-b border-[--border]"
    >
      <div className="mb-8 md:mb-10">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[--text-muted] mb-1.5">
          Podio della vergogna
        </p>
        <h2 className="font-serif text-lg md:text-xl text-[--text-primary]">
          I tre capolavori d&apos;ignoranza più votati di sempre
        </h2>
      </div>

      {/* Desktop: 2 - 1 - 3 layout, items-end so they sit on a baseline */}
      <div className="hidden md:grid grid-cols-3 gap-5 items-end max-w-6xl mx-auto">
        {second && <PodiumStep rank={2} entry={second} />}
        {first && <PodiumStep rank={1} entry={first} />}
        {third && <PodiumStep rank={3} entry={third} />}
      </div>

      {/* Mobile: stacked in natural order 1, 2, 3 */}
      <div className="md:hidden flex flex-col gap-4">
        {first && <PodiumStep rank={1} entry={first} />}
        {second && <PodiumStep rank={2} entry={second} />}
        {third && <PodiumStep rank={3} entry={third} />}
      </div>
    </section>
  )
}
