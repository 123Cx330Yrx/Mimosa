export type StudyCondition = 'mimosa' | 'baseline'

export function parseStudyCondition(search: string): StudyCondition {
  return new URLSearchParams(search).get('condition') === 'baseline'
    ? 'baseline'
    : 'mimosa'
}

export function conditionRoomId(
  appId: string,
  roomName: string,
  condition: StudyCondition,
) {
  return `${appId}/${roomName}#${condition}`
}

export function conditionMeetingRoomName(
  roomName: string,
  condition: StudyCondition,
) {
  return `${roomName}-${condition}`
}
