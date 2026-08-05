import type { StudyLogBundle } from './studyLog'

export type { StudyLogBundle } from './studyLog'

export const LOG_TRANSFER_CHUNK_SIZE = 5_500

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
  bundle: StudyLogBundle,
): LogTransferChunk[] {
  const serialized = JSON.stringify(bundle)
  const parts = serialized.match(new RegExp(`.{1,${LOG_TRANSFER_CHUNK_SIZE}}`, 'gs')) ?? ['']
  return parts.map((data, chunkIndex) => ({
    requestId,
    participantPseudonym: bundle.identity.participantPseudonym,
    sessionId: bundle.identity.sessionId,
    chunkIndex,
    chunkCount: parts.length,
    data,
    generatedAt: bundle.generatedAt,
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
      !parsed.study ||
      !parsed.snapshot ||
      !Array.isArray(parsed.events) ||
      typeof parsed.generatedAt !== 'string'
    ) return null
    return parsed as StudyLogBundle
  } catch {
    return null
  }
}
