import type { Metadata } from 'next'
import { fetchShameEntries } from '@/lib/api.server'
import type { ShameEntriesResult } from '@/lib/api.server'
import type { ShameEntry } from '@/types'
import ShameGallery from '@/components/shame/ShameGallery'
import { SHAME_PAGE_SIZE } from '@/lib/constants'
import Navbar from '@/components/layout/Navbar'

export const metadata: Metadata = {
  title: 'Hall of Shame — Ignoranza Artificiale™',
  description: 'Archivio Pubblico delle Disfunzioni Artificiali.',
}

const EMPTY_RESULT: ShameEntriesResult = {
  entries: [] as ShameEntry[],
  pagination: { page: 1, page_size: 0, total_entries: 0, total_pages: 1 },
}

export default async function VergognaPage() {
  const [topResult, latestResult] = await Promise.all([
    fetchShameEntries({ sort: 'top', page: 1, page_size: 3 }).catch(() => EMPTY_RESULT),
    fetchShameEntries({ sort: 'newest', page: 1, page_size: SHAME_PAGE_SIZE }).catch(
      () => EMPTY_RESULT,
    ),
  ])

  return (
    <div className="min-h-screen bg-[--background]">
      <Navbar />

      <div className="pt-12">
        <div className="px-4 sm:px-8 py-8 sm:py-10 border-b border-[--border]">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[--text-muted] mb-2">
            Hall of Shame
          </p>
          <h1 className="font-serif text-xl sm:text-2xl font-normal text-[--text-primary]">
            Archivio Pubblico delle Disfunzioni Artificiali
          </h1>
        </div>

        <div className="px-0">
          <ShameGallery
            topEntries={topResult.entries}
            latestEntries={latestResult.entries}
            latestPagination={latestResult.pagination}
          />
        </div>
      </div>
    </div>
  )
}
