import type { StudyEvent, StudyIdentity } from './studyLog'

export const LOG_TRANSFER_CHUNK_SIZE = 5_500

export interface StudyLogBundle {
  identity: StudyIdentity
  generatedAt: string
  events: readonly StudyEvent[]
}

export interface LogTransferChunk {
  requestId: string
  participantPseudonym: string
  sessionId: string
  chunkIndex: number
  chunkCount: number
  data: string
  generatedAt: string
}

export function createLogTransferChunks(
  requestId: string,
  identity: StudyIdentity,
  events: readonly StudyEvent[],
  generatedAt = new Date().toISOString(),
): LogTransferChunk[] {
  const serialized = JSON.stringify({
    identity,
    generatedAt,
    events,
  } satisfies StudyLogBundle)
  const parts = serialized.match(new RegExp(`.{1,${LOG_TRANSFER_CHUNK_SIZE}}`, 'gs')) ?? ['']
  return parts.map((data, chunkIndex) => ({
    requestId,
    participantPseudonym: identity.participantPseudonym,
    sessionId: identity.sessionId,
    chunkIndex,
    chunkCount: parts.length,
    data,
    generatedAt,
  }))
}

export function assembleLogTransferChunks(chunks: readonly LogTransferChunk[]) {
  if (chunks.length === 0) return null
  const first = chunks[0]
  if (
    chunks.some((chunk) =>
      chunk.requestId !== first.requestId ||
      chunk.sessionId !== first.sessionId ||
      chunk.chunkCount !== first.chunkCount ||
      chunk.chunkIndex < 0 ||
      chunk.chunkIndex >= first.chunkCount) ||
    new Set(chunks.map((chunk) => chunk.chunkIndex)).size !== first.chunkCount
  ) return null

  const serialized = [...chunks]
    .sort((a, b) => a.chunkIndex - b.chunkIndex)
    .map((chunk) => chunk.data)
    .join('')
  try {
    const parsed = JSON.parse(serialized) as Partial<StudyLogBundle>
    if (
      !parsed.identity?.sessionId ||
      !parsed.identity.participantPseudonym ||
      !Array.isArray(parsed.events) ||
      typeof parsed.generatedAt !== 'string'
    ) return null
    return parsed as StudyLogBundle
  } catch {
    return null
  }
}
