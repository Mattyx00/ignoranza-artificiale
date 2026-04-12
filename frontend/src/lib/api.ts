import type {
  Agent,
  ChatMessage,
  ShameEntry,
  ShameTranscriptEntry,
  SubmitShameResponse,
  UpvoteResponse,
} from '@/types'

export async function fetchAgents(): Promise<Agent[]> {
  throw new Error('not implemented')
}

export async function fetchShameEntries(): Promise<ShameEntry[]> {
  throw new Error('not implemented')
}

export async function fetchShameTranscript(slug: string): Promise<ShameTranscriptEntry> {
  throw new Error('not implemented')
}

export async function submitToShame(
  messages: ChatMessage[],
  sessionId: string,
): Promise<SubmitShameResponse> {
  throw new Error('not implemented')
}

export async function upvoteShameEntry(slug: string): Promise<UpvoteResponse> {
  throw new Error('not implemented')
}

export function streamChat(
  prompt: string,
  agentSlug: string,
  sessionId: string,
): EventSource {
  throw new Error('not implemented')
}
