'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ShameEntry } from '@/types'
import ShameListRow from './ShameListRow'
import { loadMoreShameEntries } from '@/app/vergogna/actions'
import { SHAME_PAGE_SIZE } from '@/lib/constants'

export interface InfiniteShameListProps {
  initialEntries: ShameEntry[]
  initialPage: number
  initialTotalPages: number
  totalEntries: number
  excludeIds: string[]
  startRank: number
}

export default function InfiniteShameList({
  initialEntries,
  initialPage,
  initialTotalPages,
  totalEntries,
  excludeIds,
  startRank,
}: InfiniteShameListProps) {
  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds])

  const [entries, setEntries] = useState<ShameEntry[]>(() =>
    initialEntries.filter((e) => !excludeSet.has(e.id)),
  )
  const [page, setPage] = useState(initialPage)
  const [totalPages, setTotalPages] = useState(initialTotalPages)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasMore = page < totalPages
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    setError(null)
    try {
      const nextPage = page + 1
      const result = await loadMoreShameEntries(nextPage, SHAME_PAGE_SIZE)
      const filtered = result.entries.filter((e) => !excludeSet.has(e.id))
      setEntries((prev) => {
        const seen = new Set(prev.map((e) => e.id))
        return [...prev, ...filtered.filter((e) => !seen.has(e.id))]
      })
      setPage(result.pagination.page)
      setTotalPages(result.pagination.total_pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore di rete')
    } finally {
      setLoading(false)
    }
  }, [loading, hasMore, page, excludeSet])

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const node = sentinelRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadMore()
        }
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(node)
    return () => observer.unobserve(node)
  }, [hasMore, loadMore])

  if (entries.length === 0 && !loading) {
    return (
      <div className="px-4 sm:px-8 py-12">
        <p className="font-mono text-xs text-[--text-muted] tracking-[0.1em] uppercase">
          Solo il podio per ora.
        </p>
      </div>
    )
  }

  return (
    <>
      <section aria-label="Archivio completo">
        {entries.map((entry, i) => (
          <ShameListRow key={entry.id} entry={entry} rank={i + startRank} />
        ))}
      </section>

      {/* Sentinel + status row */}
      <div
        ref={sentinelRef}
        className="px-4 sm:px-8 py-10 flex flex-col items-center justify-center gap-2 border-b border-[--border]"
      >
        {loading && (
          <div className="flex items-center gap-2">
            <span className="blink-dot-1 w-1.5 h-1.5 rounded-full bg-[--text-muted]" />
            <span className="blink-dot-2 w-1.5 h-1.5 rounded-full bg-[--text-muted]" />
            <span className="blink-dot-3 w-1.5 h-1.5 rounded-full bg-[--text-muted]" />
            <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[--text-muted]">
              Cataloga vergogna…
            </span>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center gap-2">
            <p className="font-mono text-[11px] text-[--accent-system] tracking-wide">
              {error}
            </p>
            <button
              onClick={loadMore}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-[--text-muted] hover:text-[--text-primary] underline underline-offset-4 decoration-[--border] transition-colors"
            >
              Riprova
            </button>
          </div>
        )}

        {!loading && !error && !hasMore && entries.length > 0 && (
          <div className="flex flex-col items-center gap-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-[--text-muted]">
              — Fine archivio —
            </span>
            <span className="font-mono text-[10px] text-[--text-muted] opacity-60 tabular-nums">
              {totalEntries} {totalEntries === 1 ? 'disfunzione catalogata' : 'disfunzioni catalogate'}
            </span>
          </div>
        )}

        {!loading && !error && hasMore && (
          <button
            onClick={loadMore}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-[--text-muted] hover:text-[--text-primary] transition-colors"
          >
            Carica altri ↓
          </button>
        )}
      </div>
    </>
  )
}
