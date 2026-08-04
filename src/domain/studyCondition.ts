export type StudyCondition = 'mimosa' | 'baseline'

export function parseStudyCondition(search: string): StudyCondition {
  return new URLSearchParams(search).get('condition') === 'baseline'
    ? 'baseline'
    : 'mimosa'
}

export function conditionMeetingRoomName(
  roomName: string,
  condition: StudyCondition,
) {
  return `${roomName}-${condition}`
}
