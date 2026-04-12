# Frontend Spec — Ignoranza Artificiale

**Version:** 1.0  
**Date:** 2026-04-12  
**Author:** Frontend Engineer  
**Status:** Draft — Awaiting Phase 1 Approval

---

## 0. Guiding Principles

The UI aesthetic is **meme-corporate**: sterile, over-engineered, and self-serious — exactly like a Fortune 500 internal tool — while the content is deliberately absurd. Every design decision should maximize this ironic contrast.

- Typography: distinctive display font (Bricolage Grotesque) paired with a clean body font (DM Sans) and a serif accent (Playfair Display) for ironic contrast moments. Never generic stacks like Inter/system-ui.
- Color palette: near-monochrome base (zinc-950) with per-agent accent colors AND a system-wide brand red (`--accent-system: #dc2626`) that evokes bureaucratic stamps and fatal errors.
- Motion: austere but precise. Animations must look like they were documented in an internal changelog ("v2.3.1 — transition optimized"). No bounce. No spring physics. One well-orchestrated staggered reveal per session-entry point.
- Copy tone: formal Italian bureaucratic language. "La sua richiesta è stata presa in carico." Never casual.

---

## 1. Page Map

| Route | Page File | Type | Purpose |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Server Component (shell) + Client subtree | Landing / Agent Gateway. API key onboarding + Master Agent greeting. |
| `/chat` | `src/app/chat/page.tsx` | Client Component | Main chat interface with streaming responses and agent sidebar. |
| `/vergogna` | `src/app/vergogna/page.tsx` | Server Component | Hall of Shame gallery. Browsable grid of saved sessions. |
| `/vergogna/[slug]` | `src/app/vergogna/[slug]/page.tsx` | Server Component | Public transcript viewer for a single saved session. Shareable URL. |
| `/vergogna/[slug]/page.tsx` (upvote interaction) | — | Client island inside Server page | Upvote button only; rest is statically renderable. |

> **Note:** There is no dedicated `/agents` page. Agent metadata is surfaced inline in the chat sidebar and on transcript pages.

---

## 2. Directory Structure

```
src/
  app/
    layout.tsx                  # Root layout: fonts, global CSS, providers
    page.tsx                    # Landing page
    chat/
      page.tsx
    vergogna/
      page.tsx
      [slug]/
        page.tsx
  components/
    layout/
      AppShell.tsx              # Persistent navbar + optional sidebar wrapper
      Navbar.tsx
    gateway/
      MasterAgentGreeting.tsx   # Corporate Manager welcome message
    chat/
      ChatWindow.tsx            # Message list + input bar container
      MessageList.tsx           # Scrollable message history
      MessageBubble.tsx         # Single message (user or agent)
      AgentBadge.tsx            # Agent name + accent color chip
      StreamingIndicator.tsx    # Animated "thinking" state for the active agent
      ChatInputBar.tsx          # Textarea + send button
      SubmitToShameButton.tsx   # CTA at conversation end
    sidebar/
      AgentRoster.tsx           # List of all agents with toggle switches
      AgentCard.tsx             # Single agent: name, vibe, GitHub handle, toggle
    shame/
      ShameGallery.tsx          # Grid of ShameCard items
      ShameCard.tsx             # Preview card: title, date, upvotes, agent badge
      ShameTranscript.tsx       # Full conversation replay
      UpvoteButton.tsx          # Client island for upvoting
    ui/
      Button.tsx                # Shared button variants (primary, ghost, danger)
      Input.tsx                 # Shared text input
      Toggle.tsx                # On/off toggle switch
      Skeleton.tsx              # Generic skeleton loader block
      Badge.tsx                 # Generic colored badge/chip
      Modal.tsx                 # Accessible modal wrapper
  hooks/
    useChat.ts
    useAgents.ts
  lib/
    api.ts                      # Typed fetch wrappers for all backend endpoints
    constants.ts                # API base URL, localStorage keys, etc.
    utils.ts                    # cn() (clsx), date formatting, slug helpers
  types/
    index.ts                    # All shared TypeScript interfaces and enums
```

---

## 3. Shared TypeScript Interfaces

Defined in `src/types/index.ts`. All component props and hook return values reference these.

```typescript
// ─── Agent ───────────────────────────────────────────────────────────────────

export interface Agent {
  slug: string;              // URL-safe identifier — primary key, matches API field
  name: string;
  vibeLabel: string;         // Short Italian vibe descriptor
  persona: string;           // Short Italian description shown in the UI
  accentColor: string;       // Hex color, e.g. "#4A90D9"
  contributorHandle: string; // GitHub username, e.g. "matteo-sacco" (= contributor_github)
  contributorName: string;   // Display name, e.g. "Matteo Sacco" (= contributor_name)
  isEnabled: boolean;        // Mutable in client state only; not persisted server-side
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "agent" | "system";

export interface ChatMessage {
  id: string;                  // client-generated uuid
  role: MessageRole;
  content: string;
  agentSlug?: string;          // populated when role === "agent" (matches API agent_slug)
  agentName?: string;          // denormalized for display without extra lookup
  timestamp: number;           // unix ms
  isStreaming?: boolean;       // true while SSE chunk stream is in progress
}

export interface ChatSession {
  messages: ChatMessage[];
  activeAgentSlug: string | null;
}

// ─── Hall of Shame ───────────────────────────────────────────────────────────

export interface ShameEntry {
  id: string;
  slug: string;
  title: string;
  createdAt: string;           // ISO 8601
  upvoteCount: number;         // matches API field upvote_count
  agentSlugs: string[];        // agents that participated (matches API field agent_slugs)
  preview: string;             // first ~200 chars of the first agent message (matches API field preview)
  isFeatured: boolean;         // editorial pin — featured card gets col-span-2 in gallery grid
}

export interface ShameTranscriptEntry {
  slug: string;
  title: string;
  createdAt: string;
  upvoteCount: number;
  isFeatured: boolean;
  messages: ChatMessage[];
}

// ─── API responses ───────────────────────────────────────────────────────────

export interface ApiError {
  detail: {
    code: string;
    message: string;
    retry_after_seconds?: number | null;
  };
}

// NOTE: Questa interfaccia rispecchia esattamente il `ErrorDetail` Pydantic schema del backend.
// Il campo `detail` è sempre un oggetto — mai una stringa.

export interface UpvoteResponse {
  slug: string;
  upvoteCount: number;         // matches API field upvote_count
}

export interface SubmitShameResponse {
  slug: string;
  publicUrl: string;
}
```

---

## 4. Component Inventory

### 4.1 `MasterAgentGreeting`

**File:** `src/components/gateway/MasterAgentGreeting.tsx`  
**Type:** Client Component

**Props:**
```typescript
interface MasterAgentGreetingProps {
  greeting: string;          // streamed text from the Master Agent
  isLoading: boolean;
}
```

**Responsibilities:**
- Displays the Corporate Manager's opening line after key confirmation.
- Shows `<StreamingIndicator>` while `isLoading` is true.
- Triggers a single non-interactive SSE call to `POST /api/v1/chat/stream` on mount with a fixed bootstrap message and a designated "master agent" slug, producing the opening greeting.
- Acts as transition into the `/chat` page (renders a "Inizia" `<Button>` once greeting completes).

> **Note for Phase 3/4:** The `GET /api/v1/agents/greeting` endpoint referenced in an earlier draft does **not exist** in the API contracts. The greeting must be implemented by calling `POST /api/v1/chat/stream` with a fixed opening prompt (e.g. `"Presentati all'utente come Corporate Manager."`) and the master agent slug.

**API calls:** `POST /api/v1/chat/stream`

---

### 4.3 `ChatWindow`

**File:** `src/components/chat/ChatWindow.tsx`  
**Type:** Client Component

**Props:**
```typescript
interface ChatWindowProps {
  session: ChatSession;
  onSendMessage: (text: string) => void;
  isStreaming: boolean;
  enabledAgentIds: string[];
}
```

**Responsibilities:**
- Composes `<MessageList>` and `<ChatInputBar>`.
- Disables `<ChatInputBar>` while `isStreaming` is true.
- Passes `enabledAgentIds` through to the hook that calls the backend (so the backend knows which agents are available for routing).
- Renders `<SubmitToShameButton>` when `session.messages.length >= 4` and `!isStreaming`.

**API calls:** None directly. Delegates to `useChat`.

---

### 4.4 `MessageBubble`

**File:** `src/components/chat/MessageBubble.tsx`  
**Type:** Server-compatible (no hooks, no browser APIs)

**Props:**
```typescript
interface MessageBubbleProps {
  message: ChatMessage;
  agentAccentColor?: string; // injected from agent lookup when role === "agent"
}
```

**Responsibilities:**
- Renders user messages right-aligned, agent messages left-aligned.
- For agent messages: renders `<AgentBadge>` above the bubble, with `accentColor` applied as a left-border and badge background.
- Renders `<StreamingIndicator>` inline when `message.isStreaming === true`.
- Sanitizes `message.content` before rendering (no raw HTML injection). Usare la libreria `isomorphic-dompurify` (SSR-compatible) per sanitizzare il contenuto prima del rendering. NON usare `dangerouslySetInnerHTML` direttamente senza sanitizzazione preventiva.

**API calls:** None.

---

### 4.5 `AgentBadge`

**File:** `src/components/chat/AgentBadge.tsx`  
**Type:** Server-compatible

**Props:**
```typescript
interface AgentBadgeProps {
  agentName: string;
  accentColor: string;
  size?: "sm" | "md";
}
```

**Responsibilities:**
- Renders a small colored pill with the agent's name. Used in `MessageBubble` and `AgentCard`.

---

### 4.6 `AgentRoster`

**File:** `src/components/sidebar/AgentRoster.tsx`  
**Type:** Client Component

**Props:**
```typescript
interface AgentRosterProps {
  agents: Agent[];
  onToggleAgent: (agentId: string, enabled: boolean) => void;
}
```

**Responsibilities:**
- Renders a vertical list of `<AgentCard>` components in the chat sidebar.
- Owned by the parent page which holds the `agents` state (via `useAgents`).

**API calls:** None directly. Data fetched by parent via `useAgents`.

---

### 4.7 `AgentCard`

**File:** `src/components/sidebar/AgentCard.tsx`  
**Type:** Client Component

**Props:**
```typescript
interface AgentCardProps {
  agent: Agent;
  onToggle: (enabled: boolean) => void;
}
```

**Responsibilities:**
- Displays agent name, persona description, and accent color swatch.
- The agent's accent color manifests as `border-left: 3px solid var(--agent-accent)` on the card's left edge — not as a background fill. When disabled, transitions to `border-left: 3px solid var(--border)` in 150ms.
- Displays contributor name as the link text and GitHub handle in `font-mono` (not sans-serif) below it: `<a href="https://github.com/{contributorHandle}">{contributorName}</a>` with the handle rendered separately in muted mono. This reinforces the "technical identifier" tone.
- Renders a `<Toggle>` for enabling/disabling the agent.
- Disabled agents are visually desaturated (opacity-40, grayscale filter).

**API calls:** None.

---

### 4.8 `SubmitToShameButton`

**File:** `src/components/chat/SubmitToShameButton.tsx`  
**Type:** Client Component

**Props:**
```typescript
interface SubmitToShameButtonProps {
  sessionMessages: ChatMessage[];
  onSuccess: (slug: string) => void;
}
```

**Responsibilities:**
- On click: calls `POST /api/v1/shame` with the current message history.
- Shows loading state while request is in flight.
- On success: shows the public URL and a copy-to-clipboard button.
- Copy (Italian): "Invia alla Hall of Shame" / "Trasmissione in corso..." / "Archiviato con successo. La vergogna è ora pubblica."

**API calls:** `POST /api/v1/shame`

---

### 4.9 `ShameGallery`

**File:** `src/components/shame/ShameGallery.tsx`  
**Type:** Server Component (data fetched in the page)

**Props:**
```typescript
interface ShameGalleryProps {
  entries: ShameEntry[];
}
```

**Responsibilities:**
- Renders a responsive CSS grid of `<ShameCard>` items (3 columns on desktop, 1 on mobile).
- Shows empty state if `entries` is empty: "Nessuna vergogna catalogata. Per ora."

---

### 4.10 `ShameCard`

**File:** `src/components/shame/ShameCard.tsx`  
**Type:** Server-compatible

**Props:**
```typescript
interface ShameCardProps {
  entry: ShameEntry;
}
```

**Responsibilities:**
- Renders title (in `font-serif` / Playfair Display for ironic gravitas), date (formatted in Italian locale in `font-mono`), upvote count, and agent badge(s).
- Wraps in `<Link href={/vergogna/${entry.slug}}>`.
- Shows truncated `entry.preview`.
- If `entry.isFeatured` is true, the card takes `col-span-2` in the gallery grid and renders an extended preview. This is the single "grid-breaking element" that disrupts the regular grid rhythm without requiring a complex asymmetric layout.

> **Note:** `isFeatured` must be added to the `ShameEntry` interface and propagated from the `ShameEntryCard` API response (see backend contract update request below).

---

### 4.11 `UpvoteButton`

**File:** `src/components/shame/UpvoteButton.tsx`  
**Type:** Client Component (`"use client"`)

**Props:**
```typescript
interface UpvoteButtonProps {
  slug: string;
  initialCount: number;
}
```

**Responsibilities:**
- Renders current upvote count with an arrow-up icon.
- On click: calls `POST /api/v1/shame/{slug}/upvote` and optimistically increments the displayed count.
- Prevents double-voting via `localStorage` key `voted:{slug}`.
- Copy (Italian): "Vota questa vergogna"

**API calls:** `POST /api/v1/shame/{slug}/upvote`

---

### 4.12 `StreamingIndicator`

**File:** `src/components/chat/StreamingIndicator.tsx`  
**Type:** Server-compatible (pure CSS animation)

**Props:**
```typescript
interface StreamingIndicatorProps {
  agentName?: string;
  accentColor?: string;
}
```

**Responsibilities:**
- Three-dot animation. **Do NOT use `animate-pulse`** — its sinusoidal opacity easing looks like a consumer loading spinner. Use a `@keyframes blink` that steps between `opacity: 1` and `opacity: 0.15` with `animation-timing-function: step-end`, `duration: 800ms`. The three dots have staggered `animation-delay: 0ms / 120ms / 240ms`. The result is a sequential terminal-style cursor — it reads as "serial processing", not consumer UX.
- Optionally shows `"{NomeAgente} sta formulando una risposta inadeguata..."` below the dots, rendered in `font-mono` to reinforce the "system log" tone.
- Color inherits from `accentColor` prop.

---

## 5. Custom Hooks

### 5.1 `useAgents`

**File:** `src/hooks/useAgents.ts`

```typescript
interface UseAgentsReturn {
  agents: Agent[];
  enabledAgentSlugs: string[];
  toggleAgent: (agentSlug: string, enabled: boolean) => void;
  isLoading: boolean;
  error: string | null;
}

export function useAgents(): UseAgentsReturn;
```

**Behavior:**
- On mount: fetches `GET /api/v1/agents` once. Populates `agents` with `isEnabled: true` for all by default.
- `toggleAgent` performs a local state mutation only — the enabled/disabled state is frontend-only and is passed to `useChat` to influence routing.
- `enabledAgentSlugs` is derived: `agents.filter(a => a.isEnabled).map(a => a.slug)`.

---

### 5.3 `useChat` (primary hook)

**File:** `src/hooks/useChat.ts`

```typescript
interface UseChatOptions {
  enabledAgentSlugs: string[];
}

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeAgentSlug: string | null;
  activeAgentName: string | null;
  error: string | null;
  sendMessage: (text: string) => Promise<void>;
  resetSession: () => void;
}

export function useChat(options: UseChatOptions): UseChatReturn;
```

**Parameters:**
- `enabledAgentIds`: array of agent IDs currently enabled in the sidebar. Sent in the request body so the backend router only considers these agents.

**Return values:**
- `messages`: full conversation history, including the currently-streaming agent message.
- `isStreaming`: true from the moment `sendMessage` is called until the SSE stream closes.
- `activeAgentId` / `activeAgentName`: the agent currently writing (extracted from SSE metadata event — see below).
- `error`: non-null if the fetch or stream fails. Reset to null on next `sendMessage`.
- `sendMessage(text)`: appends a user message, opens the SSE stream, accumulates chunks.
- `resetSession()`: clears `messages` and session state.

**SSE Streaming Flow:**

1. User calls `sendMessage(text)`.
2. Hook appends `{ role: "user", content: text }` to `messages`.
3. Hook appends a placeholder agent message `{ role: "agent", content: "", isStreaming: true }`.
4. Hook opens a streaming request to `POST /api/v1/chat/stream`:
   - Uses `fetch` with `ReadableStream` (not `EventSource`, since POST with body is required).
   - Request body:
     ```json
     {
       "message": "user text",
       "conversation_history": [ ...previous messages ],
       "agent_slug": null
     }
     ```
   - Request headers:
     ```
     Content-Type: application/json
     X-Session-ID: <UUID from localStorage>
     ```
5. Reads the stream with `response.body.getReader()` and `TextDecoder`.
6. Parses each SSE line:
   - `event: agent_selected` + `data: { "agent": { "slug": "...", "name": "...", ... } }` → sets `activeAgentSlug` / `activeAgentName` and updates the placeholder message's `agentSlug`/`agentName`.
   - `event: token` + `data: { "delta": "..." }` → appends `delta` content to the placeholder message.
   - `event: done` → sets `isStreaming: false`, marks placeholder `isStreaming: false`.
   - `event: error` + `data: { "detail": "..." }` → sets `error`, sets `isStreaming: false`.

   > **ATTENZIONE:** il nome dell'evento è `token` (non `chunk`) e il campo del testo è `delta` (non `content`). Usare il naming errato causerà la rottura dello streaming senza errori visibili.
7. If the fetch itself fails (network error, 4xx/5xx before stream starts): sets `error`, removes placeholder message, sets `isStreaming: false`.

---

## 6. State Management

### 6.1 Rule: no global store

The application uses no Redux, no Zustand, no Jotai. State is either component-local or passed via React Context for genuinely cross-cutting concerns.

### 6.2 State ownership map

| State | Owner | Mechanism |
|---|---|---|
| Agents list + enabled flags | `useAgents` hook, owned by `/chat/page.tsx` | `useState` |
| Chat message history | `useChat` hook, owned by `/chat/page.tsx` | `useState` |
| Active streaming agent | `useChat` hook (internal) | `useState` |
| Upvote per slug (voted status) | `UpvoteButton` component | `localStorage` per slug |
| Hall of Shame entries | `/vergogna/page.tsx` | Server-fetched, no client state |
| Single transcript | `/vergogna/[slug]/page.tsx` | Server-fetched, no client state |

### 6.3 Context (if needed)

A single `AppContext` may be introduced **only** if prop-drilling the agent list becomes a problem across more than two component layers. It is not required at spec time.

---

## 7. API Client Layer

**File:** `src/lib/api.ts`

All backend calls go through typed wrapper functions. No raw `fetch` calls in components.

```typescript
// Base URL read from env: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"

export async function fetchAgents(): Promise<Agent[]>;
// GET /api/v1/agents

export async function fetchShameEntries(): Promise<ShameEntry[]>;
// GET /api/v1/shame

export async function fetchShameTranscript(slug: string): Promise<ShameTranscriptEntry>;
// GET /api/v1/shame/{slug}

export async function submitToShame(messages: ChatMessage[]): Promise<SubmitShameResponse>;
// POST /api/v1/shame

export async function upvoteShame(slug: string): Promise<UpvoteResponse>;
// POST /api/v1/shame/{slug}/upvote
```

SSE streaming is handled directly in `useChat` via `fetch` + `ReadableStream` and is NOT wrapped in `api.ts` (streaming responses require direct stream access).

**File:** `src/lib/constants.ts`

```typescript
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const LOCALSTORAGE_SESSION_ID = "session_id";
export const LOCALSTORAGE_VOTED_PREFIX = "voted:"; // + slug
export const MIN_MESSAGES_FOR_SHAME = 4;
```

---

## 8. Page-Level Specs

### 8.1 Landing Page — `/`

**File:** `src/app/page.tsx`  
**Type:** Server Component shell with Client subtree

**Layout:**
- Full-viewport. NOT vertically centered — deliberate off-center positioning evokes a misconfigured internal tool.
- Logo/wordmark top-left: "IGNORANZA ARTIFICIALE™" in `font-mono` tight uppercase caps.
- Hero tagline "Il sistema è operativo. Siamo spiacenti." positioned at `top: 35vh` (above optical center), rendered in `font-serif` (Playfair Display) for ironic gravitas contrast with the mono UI.
- "Accedi alla piattaforma" button positioned at `top: 55vh`.
- Renders `<MasterAgentGreeting>` directly on load — no key gate.

**Motion on page load:** AgentCard-style staggered reveal applies only to the `<MasterAgentGreeting>` component words — not the whole page.

**Data fetched:** None at server level. All client-driven.

---

### 8.2 Chat Page — `/chat`

**File:** `src/app/chat/page.tsx`  
**Type:** Client Component (`"use client"`)

**Layout:** Two-column:
- Left sidebar (`width: 22vw; min-width: 260px; max-width: 320px`): `<AgentRoster>` with the list of agents + toggles. The sidebar has `border-right: 1px solid var(--border)` with no rounding — sharp industrial edge. The non-standard `vw`-based width intentionally avoids standard 8px grid alignment.
- Main area: asymmetric padding (`padding-left: 2rem; padding-right: 4rem`) so chat content is not centered — subtle but perceptible.
- Top bar: active agent indicator (`<AgentBadge>` + "In elaborazione...") visible only while streaming.

**Hooks used:** `useChat`, `useAgents`

---

### 8.3 Hall of Shame Gallery — `/vergogna`

**File:** `src/app/vergogna/page.tsx`  
**Type:** Server Component

**Data fetching:** Calls `fetchShameEntries()` directly in the server component (no `useEffect`).

**Layout:**
- Header: "HALL OF SHAME — Archivio Pubblico delle Disfunzioni Artificiali"
- `<ShameGallery entries={entries} />`
- No pagination in v1; all entries returned by the API (backend must cap at a reasonable limit).

---

### 8.4 Transcript Page — `/vergogna/[slug]`

**File:** `src/app/vergogna/[slug]/page.tsx`  
**Type:** Server Component with one Client island (`<UpvoteButton>`)

**Data fetching:** In Next.js 15+, `params` is a `Promise` and must be awaited before use:
```tsx
// /vergogna/[slug]/page.tsx
type Props = { params: Promise<{ slug: string }> }

export default async function Page({ params }: Props) {
  const { slug } = await params
  const entry = await fetchShameTranscript(slug)
  if (!entry) notFound()
  // ...
}
```
Returns 404 page if slug not found (use `notFound()` from `next/navigation`). Same pattern applies to `generateMetadata`.

**Layout:**
- Transcript title + date + agent badges across the top.
- `<ShameTranscript messages={...} />` renders the full message list (reuses `<MessageBubble>`).
- `<UpvoteButton slug={slug} initialCount={upvotes} />` fixed bottom-right.
- Share URL: `window.location.href` copy button (Client island).

**SEO:** Export `generateMetadata` to set `<title>` and `<meta description>` from transcript title and excerpt.

---

## 9. UI/UX Notes

### 9.1 Color Palette

| Token | Value | Usage |
|---|---|---|
| `--background` | `#09090b` (zinc-950) | Page background |
| `--surface` | `#18181b` (zinc-900) | Cards, sidebar, bubbles |
| `--border` | `#27272a` (zinc-800) | All borders |
| `--text-primary` | `#fafafa` (zinc-50) | Body copy |
| `--text-muted` | `#71717a` (zinc-500) | Timestamps, labels |
| `--accent-system` | `#dc2626` (red-600) | System brand color: primary CTAs, focus rings, logo mark. Evokes bureaucratic stamps, rejection notices, fatal errors. |
| `--accent-system-subtle` | `#450a0a` (red-950) | Hover background on danger buttons, error borders, "FEATURED" badge in gallery. |
| `--agent-accent` | Injected per agent | Agent badge bg, bubble border-left |

Agent accent colors (examples, finalized by backend agent spec):
- Corporate Manager: `#3b82f6` (blue-500) — cold, authoritative
- The Bureaucrat: `#a855f7` (purple-500) — ominous
- The Nihilist: `#6b7280` (gray-500) — appropriately gray
- The Conspiracy Theorist: `#f59e0b` (amber-500) — paranoid yellow
- The Boomer: `#22c55e` (green-500) — inexplicably cheerful

### 9.2 Typography

> **Critical:** Do NOT use Inter, system-ui, Roboto, or Arial. These are "AI slop" aesthetics explicitly forbidden by the `frontend-design` skill. The project needs fonts that look expensive and slightly wrong — like a Fortune 500 tool that cost €2M to build.

```
font-display:  "Bricolage Grotesque", sans-serif
               → Headings, UI labels, navigation. Variable font, geometric-quirky,
                 evokes an early-2000s internal tool still running in production.
                 Available on Google Fonts.

font-body:     "DM Sans", sans-serif
               → Chat messages, body copy, form fields. Readable and neutral
                 without being boring. Available on Google Fonts.

font-mono:     "JetBrains Mono", ui-monospace, monospace
               → API key input, slugs, metadata, GitHub handles, StreamingIndicator text.
                 Unchanged.

font-serif:    "Playfair Display", serif
               → Used exclusively for: landing page tagline, ShameCard titles,
                 Hall of Shame page subtitle. The serif in an otherwise rigidly
                 sans context creates the required ironic contrast — "bureaucratic
                 gravitas meets corporate absurdity".
                 Available on Google Fonts.
```

Load via `next/font/google` with `display: 'swap'` and appropriate subset preloading.

All headings (Bricolage Grotesque): `font-weight: 600`, `letter-spacing: -0.02em`.  
UI labels and badges: `text-transform: uppercase`, `letter-spacing: 0.08em`, `font-size: 0.625rem` (10 px).  
GitHub handles and technical metadata: always `font-mono`.

### 9.3 Italian Copy Tone

Copy must be bureaucratic, impersonal, and passive-voice wherever possible. Examples:

| Context | Copy |
|---|---|
| API key prompt | "Si prega di fornire la propria chiave di autenticazione OpenRouter per accedere al sistema." |
| Loading state | "Elaborazione in corso. Si prega di attendere." |
| Agent thinking | "{NomeAgente} sta formulando una risposta inadeguata..." |
| Submit to shame | "Invia alla Hall of Shame" |
| Submit success | "La sessione è stata archiviata con successo. La vergogna è ora di dominio pubblico." |
| Gallery empty | "Nessuna disfunzione catalogata. Per ora." |
| Error generic | "Si è verificato un errore imprevisto. Il sistema è costernato." |
| Chat input placeholder | "Inserisca la sua richiesta. Verrà gestita con la massima incompetenza." |
| Rate limit (server key) | "La sua frequenza di utilizzo supera i parametri consentiti. Si prega di fornire una chiave API personale o di attendere il ripristino della quota." |
| Agent disabled (sidebar) | "Agente temporaneamente sospeso per motivi amministrativi." |

**`SubmitToShameButton` success state:** On success, the button does not merely change its text — it transforms into a "receipt" element: `background: var(--surface)`, `border: 1px solid var(--border)`, two lines in `font-mono` (session title + public URL), plus a "Copia URL" button on the right. Appears with a `200ms translateY` transition. Simulates a receipt printed by a bureaucratic system.

**Hall of Shame page header typography:** Two-line layout with inverted hierarchy — line 1: "HALL OF SHAME" in `font-mono` uppercase `text-xs` `letter-spacing: 0.15em` color `--text-muted`; line 2: "Archivio Pubblico delle Disfunzioni Artificiali" in `font-serif` `text-2xl` `font-weight: 400`. The small technical label above the large serif subtitle is unexpected and reinforces the irony.

### 9.4 Responsiveness

- Mobile-first Tailwind breakpoints.
- On mobile (`< lg`): sidebar collapses into a bottom drawer toggled by a hamburger/roster icon.
- Chat bubbles: `max-width: 80%` on desktop, `100%` on mobile.
- Hall of Shame: 1 column on `sm`, 2 on `md`, 3 on `lg`.

### 9.5 Accessibility

- All interactive elements have visible focus rings (`outline-2 outline-offset-2`).
- Color is never the sole indicator of agent identity (always paired with name text).
- `aria-live="polite"` on the streaming message bubble to announce content updates to screen readers.
- `<UpvoteButton>` must have `aria-label="Vota questa vergogna"` and `aria-pressed` state.

---

## 10. Environment Variables (Frontend)

> **Important:** `NEXT_PUBLIC_*` variables are baked into the JS bundle at **build time**. They cannot be changed at runtime. The browser cannot resolve Docker-internal hostnames like `backend` — only the Next.js Node.js process (Server Components, Route Handlers) can use those names.

Two separate variables are therefore required:

| Variable | Used by | Value (dev) | Value (Docker prod) |
|---|---|---|---|
| `API_INTERNAL_URL` | Server Components, Route Handlers (server-side only) | `http://localhost:8000` | `http://backend:8000` |
| `NEXT_PUBLIC_API_URL` | Client Components, hooks (`useChat`, `useApiKey`, etc.) | `http://localhost:8000` | `http://localhost:8000` or public domain |

Defined in `.env.local` (not committed):

```
API_INTERNAL_URL=http://localhost:8000
NEXT_PUBLIC_API_URL=http://localhost:8000
```

In production (Docker), set via `docker-compose.yml` environment:

```
API_INTERNAL_URL=http://backend:8000
NEXT_PUBLIC_API_URL=http://localhost:8000   # or the public-facing domain
```

> Note: `NEXT_PUBLIC_API_URL` must be the URL reachable by the **user's browser**, not the Docker network.

The `next.config.ts` must also include `output: 'standalone'` for Docker:

```ts
// next.config.ts
const nextConfig = {
  output: 'standalone',
}
export default nextConfig
```

---

## 10.1 Security Headers

`next.config.ts` deve includere una funzione `headers()` che applica HTTP security headers a tutte le route (`source: '/(.*)'`).

**Headers obbligatori:**

| Header | Valore |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Content-Security-Policy` | Vedi nota sotto |

**Content-Security-Policy:** La CSP deve essere definita come requisito di Phase 5, quando i domini effettivi di deployment sono noti. Deve essere una policy restrittiva che consenta esclusivamente:
- Google Fonts per il caricamento dei font (`fonts.googleapis.com`, `fonts.gstatic.com`).
- Il proprio backend per le chiamate API (valore di `NEXT_PUBLIC_API_URL`).

La CSP **NON deve** contenere `unsafe-inline` o `unsafe-eval`.

**Struttura di riferimento in `next.config.ts`:**

```ts
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ]
}
```

> **Nota:** La voce `Content-Security-Policy` viene aggiunta all'array `headers` in Phase 5, una volta stabiliti i domini definitivi. Non definire una CSP permissiva come placeholder — è preferibile assente che errata.

---

## 11. Package Dependencies (anticipated)

| Package | Purpose |
|---|---|
| `next` (14+) | Framework |
| `react`, `react-dom` | UI runtime |
| `typescript` | Type checking |
| `tailwindcss`, `postcss`, `autoprefixer` | Styling |
| `clsx`, `tailwind-merge` | Conditional classnames (`cn()` utility) |
| `@radix-ui/react-toggle` | Accessible toggle primitive |
| `@radix-ui/react-dialog` | Accessible modal primitive (for `<Modal>`) |
| `lucide-react` | Icon set (arrows, copy, loader, etc.) |
| `date-fns` | Italian date formatting (`it` locale) |
| `isomorphic-dompurify` | XSS prevention — sanitize LLM-generated HTML content before rendering |

No UI framework (MUI, Chakra, shadcn). All components are hand-written with Tailwind.

> **Note on shadcn/ui:** Individual Radix primitives are used directly to keep the bundle minimal and maintain full visual control. shadcn pre-built components are NOT used.

---

*End of Frontend Spec v1.0*
