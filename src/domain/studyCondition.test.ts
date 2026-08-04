import { describe, expect, it } from 'vitest'
import { conditionMeetingRoomName, conditionRoomId, parseStudyCondition } from './studyCondition'

describe('study condition routing', () => {
  it('uses Mimosa unless baseline is requested explicitly', () => {
    expect(parseStudyCondition('')).toBe('mimosa')
    expect(parseStudyCondition('?condition=mimosa')).toBe('mimosa')
    expect(parseStudyCondition('?condition=anything-else')).toBe('mimosa')
  })

  it('recognizes the baseline condition', () => {
    expect(parseStudyCondition('?room=group-a&condition=baseline')).toBe('baseline')
  })

  it('isolates study messages while preserving the meeting room name', () => {
    expect(conditionRoomId('app', 'group-a', 'baseline')).toBe('app/group-a#baseline')
    expect(conditionRoomId('app', 'group-a', 'mimosa')).toBe('app/group-a#mimosa')
  })

  it('isolates the underlying meeting rooms by condition', () => {
    expect(conditionMeetingRoomName('group-a', 'baseline')).toBe('group-a-baseline')
    expect(conditionMeetingRoomName('group-a', 'mimosa')).toBe('group-a-mimosa')
  })
})
