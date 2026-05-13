/**
 * Runtime proxy for all /api/v1/* requests.
 *
 * Next.js rewrites are resolved at build time (standalone output), so they
 * cannot pick up runtime env vars like API_INTERNAL_URL when running inside
 * Docker. This route handler runs at request time, reads the env var fresh on
 * every call, and correctly forwards to http://backend:8000 in Docker or
 * http://localhost:8000 in local dev — without any rebuild required.
 *
 * Streaming responses (SSE for LLM output) are forwarded transparently by
 * piping the response body directly.
 *
 * Security:
 * - Only an explicit allowlist of headers is forwarded to the backend.
 *   Cookie, authorization, x-forwarded-*, x-real-ip, host, referer and origin
 *   are intentionally excluded to prevent header injection / IP spoofing.
 * - Path segments are validated to block path traversal attempts
 *   (e.g. "..", "%2e%2e", "%2f", "%5c") before any upstream request is made.
 */

import { type NextRequest } from 'next/server'

const BACKEND = process.env.API_INTERNAL_URL ?? 'http://localhost:8000'

/**
 * Allowlist of request headers that are safe to forward to the backend.
 * All keys must be lowercase.
 */
const ALLOWED_REQUEST_HEADERS = new Set([
  'content-type',
  'accept',
  'accept-encoding',
  'accept-language',
  'user-agent',
  'x-session-id', // custom app header used for rate-limiting
])

/**
 * Headers that must not be forwarded from the upstream response (hop-by-hop).
 */
const HOP_BY_HOP_RESPONSE = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

/**
 * Builds a safe header set to forward to the backend by applying the allowlist.
 */
function buildRequestHeaders(source: Headers): Headers {
  const out = new Headers()
  source.forEach((value, key) => {
    if (ALLOWED_REQUEST_HEADERS.has(key.toLowerCase())) {
      out.set(key, value)
    }
  })
  return out
}

/**
 * Strips hop-by-hop headers from the upstream response before returning it
 * to the client.
 */
function buildResponseHeaders(source: Headers): Headers {
  const out = new Headers()
  source.forEach((value, key) => {
    if (!HOP_BY_HOP_RESPONSE.has(key.toLowerCase())) {
      out.set(key, value)
    }
  })
  return out
}

/**
 * Validates that none of the path segments contain traversal sequences.
 * Returns false if any segment is empty or contains "..", "/", "\",
 * "%2e" (encoded dot), "%2f" (encoded slash), or "%5c" (encoded backslash).
 */
function validatePathSegments(segments: string[]): boolean {
  if (segments.length === 0) return false
  const dangerous = /(\.\.|\/|\\|%2e|%2f|%5c)/i
  for (const segment of segments) {
    if (segment === '' || dangerous.test(segment)) {
      return false
    }
  }
  return true
}

async function proxy(req: NextRequest, path: string[]): Promise<Response> {
  if (!validatePathSegments(path)) {
    return new Response('Bad Request', { status: 400 })
  }

  const segment = path.join('/')
  const target = new URL(`${BACKEND}/api/v1/${segment}`)
  // Forward query string
  req.nextUrl.searchParams.forEach((v, k) => target.searchParams.set(k, v))

  const upstreamRes = await fetch(target, {
    method: req.method,
    headers: buildRequestHeaders(req.headers),
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
    // Required for streaming request bodies (e.g. POST with ReadableStream)
    // @ts-expect-error — Node 18+ fetch supports this flag
    duplex: 'half',
  })

  // Stream the response body back; works for both JSON and SSE
  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: buildResponseHeaders(upstreamRes.headers),
  })
}

type RouteContext = { params: Promise<{ path: string[] }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { path } = await ctx.params
  return proxy(req, path)
}

// Disable body parsing — we stream the raw body to the backend
export const dynamic = 'force-dynamic'
