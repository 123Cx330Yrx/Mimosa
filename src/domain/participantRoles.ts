import type { MeetingParticipant } from '../meeting/MeetingTransport'
import type { ParticipantCue } from './protocol'

export function getStudyParticipants(
  participants: readonly MeetingParticipant[],
  observerIds: ReadonlySet<string>,
) {
  return participants.filter((participant) => !observerIds.has(participant.id))
}

export function countParticipantCues(cues: Readonly<Record<string, ParticipantCue>>) {
  return {
    NEED_TIME: Object.values(cues).filter((cue) => cue === 'NEED_TIME').length,
    CHECKING: Object.values(cues).filter((cue) => cue === 'CHECKING').length,
    SOCIAL_PRESSURE: Object.values(cues).filter((cue) => cue === 'SOCIAL_PRESSURE').length,
  } satisfies Record<ParticipantCue, number>
}
