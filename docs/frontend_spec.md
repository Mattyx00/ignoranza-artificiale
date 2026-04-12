# Frontend Spec — Ignoranza Artificiale

**Version:** 1.0  
**Date:** 2026-04-12  
**Author:** Frontend Engineer  
**Status:** Draft — Awaiting Phase 1 Approval

---

## 0. Guiding Principles

The UI aesthetic is **meme-corporate**: sterile, over-engineered, and self-serious — exactly like a Fortune 500 internal tool — while the content is deliberately absurd. Every design decision should maximize this ironic contrast.

- Typography: system-ui sans-serif stack, tight letter-spacing on headings, all-caps labels.
- Color palette: near-monochrome base (white/zinc-950) with one loud accent per agent (injected via CSS custom property `--agent-accent`).
- Motion: minimal. Skeleton loaders, not spinners. One subtle fade-in transition (150 ms). No bounce animations.
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
      ApiKeyGate.tsx            # Full-screen key input modal/overlay
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
    useApiKey.ts
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
  id: string;
  name: string;
  persona: string;           // Short Italian description shown in the UI
  accentColor: string;       // Hex or Tailwind color token, e.g. "#ef4444"
  contributorHandle: string; // GitHub username, e.g. "matteosacco"
  isEnabled: boolean;        // Mutable in client state only; not persisted server-side
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export type MessageRole = "user" | "agent" | "system";

export interface ChatMessage {
  id: string;                // client-generated uuid
  role: MessageRole;
  content: string;
  agentId?: string;          // populated when role === "agent"
  agentName?: string;        // denormalized for display without extra lookup
  timestamp: number;         // unix ms
  isStreaming?: boolean;     // true while SSE chunk stream is in progress
}

export interface ChatSession {
  messages: ChatMessage[];
  activeAgentId: string | null;
}

// ─── Hall of Shame ───────────────────────────────────────────────────────────

export interface ShameEntry {
  id: string;
  slug: string;
  title: string;
  createdAt: string;         // ISO 8601
  upvotes: number;
  agentIds: string[];        // agents that participated
  excerpt: string;           // first ~200 chars of the conversation
}

export interface ShameTranscriptEntry {
  slug: string;
  title: string;
  createdAt: string;
  upvotes: number;
  messages: ChatMessage[];
}

// ─── API responses ───────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  code?: string;
}

export interface UpvoteResponse {
  slug: string;
  upvotes: number;
}

export interface SubmitShameResponse {
  slug: string;
  publicUrl: string;
}
```

---

## 4. Component Inventory

### 4.1 `ApiKeyGate`

**File:** `src/components/gateway/ApiKeyGate.tsx`  
**Type:** Client Component (`"use client"`)

**Props:**
```typescript
interface ApiKeyGateProps {
  onKeyConfirmed: (key: string) => void;
}
```

**Responsibilities:**
- Renders a full-viewport overlay if no API key is found in localStorage.
- Contains a single `<Input>` for the OpenRouter API key + a confirm `<Button>`.
- On submit: validates key is non-empty, stores it via `useApiKey`, calls `onKeyConfirmed`.
- Copy (Italian): "Inserisca la sua chiave API OpenRouter per procedere. La chiave verrà conservata localmente sul suo dispositivo."
- Does NOT call any backend endpoint. The key is passed as a header by `useChat`.

**API calls:** None.

---

### 4.2 `MasterAgentGreeting`

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
- Triggers a single non-interactive SSE call to `GET /api/v1/agents/greeting` on mount (via `useChat` or a one-shot fetch).
- Acts as transition into the `/chat` page (renders a "Inizia" `<Button>` once greeting completes).

**API calls:** `GET /api/v1/agents/greeting`

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
- Sanitizes `message.content` before rendering (no raw HTML injection).

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
- Displays contributor GitHub handle as a link: `https://github.com/{contributorHandle}`.
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
- Renders title, date (formatted in Italian locale), upvote count, and agent badge(s).
- Wraps in `<Link href={/vergogna/${entry.slug}}>`.
- Shows truncated `entry.excerpt`.

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
- Three-dot pulsing animation (CSS `animate-pulse` staggered).
- Optionally shows "NomeAgente sta elaborando..." below the dots.
- Color inherits from `accentColor` prop.

---

## 5. Custom Hooks

### 5.1 `useApiKey`

**File:** `src/hooks/useApiKey.ts`

```typescript
interface UseApiKeyReturn {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  hasKey: boolean;
}

export function useApiKey(): UseApiKeyReturn;
```

**Behavior:**
- Reads from `localStorage.getItem("openrouter_api_key")` on mount (inside `useEffect` to avoid SSR mismatch).
- `setApiKey` writes to localStorage and updates React state synchronously.
- `clearApiKey` removes the key from both localStorage and state.
- `hasKey` is a derived boolean: `apiKey !== null && apiKey.length > 0`.

---

### 5.2 `useAgents`

**File:** `src/hooks/useAgents.ts`

```typescript
interface UseAgentsReturn {
  agents: Agent[];
  enabledAgentIds: string[];
  toggleAgent: (agentId: string, enabled: boolean) => void;
  isLoading: boolean;
  error: string | null;
}

export function useAgents(): UseAgentsReturn;
```

**Behavior:**
- On mount: fetches `GET /api/v1/agents` once. Populates `agents` with `isEnabled: true` for all by default.
- `toggleAgent` performs a local state mutation only — the enabled/disabled state is frontend-only and is passed to `useChat` to influence routing.
- `enabledAgentIds` is derived: `agents.filter(a => a.isEnabled).map(a => a.id)`.

---

### 5.3 `useChat` (primary hook)

**File:** `src/hooks/useChat.ts`

```typescript
interface UseChatOptions {
  enabledAgentIds: string[];
}

interface UseChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeAgentId: string | null;
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
       "history": [ ...previous messages ],
       "enabled_agent_ids": ["agent-1", "agent-2"]
     }
     ```
   - Request headers:
     ```
     Content-Type: application/json
     X-OpenRouter-Key: <value from useApiKey>
     ```
5. Reads the stream with `response.body.getReader()` and `TextDecoder`.
6. Parses each SSE line:
   - `event: agent_selected` + `data: { "agent_id": "...", "agent_name": "..." }` → sets `activeAgentId` / `activeAgentName` and updates the placeholder message's `agentId`/`agentName`.
   - `event: chunk` + `data: { "content": "..." }` → appends content to the placeholder message.
   - `event: done` → sets `isStreaming: false`, marks placeholder `isStreaming: false`.
   - `event: error` + `data: { "detail": "..." }` → sets `error`, sets `isStreaming: false`.
7. If the fetch itself fails (network error, 4xx/5xx before stream starts): sets `error`, removes placeholder message, sets `isStreaming: false`.

**API Key handling:**
- `useApiKey` is called internally. If `hasKey` is false when `sendMessage` is invoked, the function throws/returns early and sets `error` to `"Chiave API non configurata. Ricaricare la pagina."`.

---

## 6. State Management

### 6.1 Rule: no global store

The application uses no Redux, no Zustand, no Jotai. State is either component-local or passed via React Context for genuinely cross-cutting concerns.

### 6.2 State ownership map

| State | Owner | Mechanism |
|---|---|---|
| OpenRouter API key | `useApiKey` hook | `localStorage` + `useState` |
| Agents list + enabled flags | `useAgents` hook, owned by `/chat/page.tsx` | `useState` |
| Chat message history | `useChat` hook, owned by `/chat/page.tsx` | `useState` |
| Active streaming agent | `useChat` hook (internal) | `useState` |
| Upvote per slug (voted status) | `UpvoteButton` component | `localStorage` per slug |
| Hall of Shame entries | `/vergogna/page.tsx` | Server-fetched, no client state |
| Single transcript | `/vergogna/[slug]/page.tsx` | Server-fetched, no client state |

### 6.3 Context (if needed)

A single `AppContext` may be introduced **only** if prop-drilling the API key or agent list becomes a problem across more than two component layers. It is not required at spec time.

```typescript
// src/app/providers.tsx (optional, to be created only if needed)
interface AppContextValue {
  apiKey: string | null;
  hasKey: boolean;
}
```

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
export const LOCALSTORAGE_API_KEY = "openrouter_api_key";
export const LOCALSTORAGE_VOTED_PREFIX = "voted:"; // + slug
export const MIN_MESSAGES_FOR_SHAME = 4;
```

---

## 8. Page-Level Specs

### 8.1 Landing Page — `/`

**File:** `src/app/page.tsx`  
**Type:** Server Component shell with Client subtree

**Layout:**
- Full-viewport centered layout.
- Logo/wordmark top-left: "IGNORANZA ARTIFICIALE™" in tight monospace caps.
- Hero area: "Il sistema è operativo. Siamo spiacenti." in large serif (ironic contrast).
- `<ApiKeyGate>` renders as an overlay when key is absent; otherwise renders `<MasterAgentGreeting>`.
- A single "Accedi alla piattaforma" button navigates to `/chat` after greeting is complete.

**Data fetched:** None at server level. All client-driven.

---

### 8.2 Chat Page — `/chat`

**File:** `src/app/chat/page.tsx`  
**Type:** Client Component (`"use client"`)

**Layout:** Two-column:
- Left sidebar (280 px): `<AgentRoster>` with the list of agents + toggles.
- Main area: `<ChatWindow>` with message list, input bar, and shame button.
- Top bar: active agent indicator (`<AgentBadge>` + "In elaborazione...") visible only while streaming.

**Hooks used:** `useChat`, `useAgents`, `useApiKey`

**Guard:** If `!hasKey`, redirect to `/` (use `next/navigation` `redirect()`).

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

**Data fetching:** `fetchShameTranscript(params.slug)` in the server component. Returns 404 page if slug not found (use `notFound()` from `next/navigation`).

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
| `--accent-default` | `#ffffff` | Default CTA button, links |
| `--agent-accent` | Injected per agent | Agent badge bg, bubble border-left |

Agent accent colors (examples, finalized by backend agent spec):
- Corporate Manager: `#3b82f6` (blue-500) — cold, authoritative
- The Bureaucrat: `#a855f7` (purple-500) — ominous
- The Nihilist: `#6b7280` (gray-500) — appropriately gray
- The Conspiracy Theorist: `#f59e0b` (amber-500) — paranoid yellow
- The Boomer: `#22c55e` (green-500) — inexplicably cheerful

### 9.2 Typography

```
font-family: "Inter var", ui-sans-serif, system-ui, sans-serif
font-mono: "JetBrains Mono", ui-monospace, monospace   (used for API key input, slugs)
```

All headings: `font-weight: 600`, `letter-spacing: -0.02em`.  
UI labels and badges: `text-transform: uppercase`, `letter-spacing: 0.08em`, `font-size: 0.625rem` (10 px).

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

Defined in `.env.local` (not committed):

```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

In production (Docker):

```
NEXT_PUBLIC_API_URL=http://backend:8000
```

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

No UI framework (MUI, Chakra, shadcn). All components are hand-written with Tailwind.

> **Note on shadcn/ui:** Individual Radix primitives are used directly to keep the bundle minimal and maintain full visual control. shadcn pre-built components are NOT used.

---

*End of Frontend Spec v1.0*
