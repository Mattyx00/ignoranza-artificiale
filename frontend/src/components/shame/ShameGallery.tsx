import type { ShameEntry } from '@/types'
import type { PaginationMeta } from '@/lib/api.server'
import Podium from './Podium'
import InfiniteShameList from './InfiniteShameList'

export interface ShameGalleryProps {
  topEntries: ShameEntry[]
  latestEntries: ShameEntry[]
  latestPagination: PaginationMeta
}

export default function ShameGallery({
  topEntries,
  latestEntries,
  latestPagination,
}: ShameGalleryProps) {
  const isEmpty = topEntries.length === 0 && latestEntries.length === 0

  if (isEmpty) {
    return (
      <div className="py-24 text-center">
        <p className="font-mono text-xs text-[--text-muted] tracking-[0.15em] uppercase">
          Nessuna disfunzione catalogata. Per ora.
        </p>
      </div>
    )
  }

  const podiumEntries = topEntries.slice(0, 3)
  const podiumIds = podiumEntries.map((e) => e.id)

  return (
    <div>
      <Podium entries={podiumEntries} />

      <div className="px-4 sm:px-8 py-6 border-b border-[--border] flex items-baseline justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-[--text-muted] mb-1">
            Archivio completo
          </p>
          <h2 className="font-serif text-lg text-[--text-primary]">
            Tutte le disfunzioni
          </h2>
        </div>
        <span className="font-mono text-[11px] text-[--text-muted] tabular-nums">
          {latestPagination.total_entries}{' '}
          {latestPagination.total_entries === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      <InfiniteShameList
        initialEntries={latestEntries}
        initialPage={latestPagination.page}
        initialTotalPages={latestPagination.total_pages}
        totalEntries={latestPagination.total_entries}
        excludeIds={podiumIds}
        startRank={4}
      />
    </div>
  )
}
