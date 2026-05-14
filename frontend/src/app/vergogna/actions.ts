'use server'

import { fetchShameEntries } from '@/lib/api.server'
import type { ShameEntriesResult } from '@/lib/api.server'

export async function loadMoreShameEntries(
  page: number,
  pageSize: number,
): Promise<ShameEntriesResult> {
  return fetchShameEntries({ sort: 'newest', page, page_size: pageSize })
}
