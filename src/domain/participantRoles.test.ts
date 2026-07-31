import { describe, expect, it } from 'vitest'
import { countParticipantCues, getStudyParticipants } from './participantRoles'

describe('getStudyParticipants', () => {
  it('supports an arbitrary number of participants and excludes observers', () => {
    const participants = Array.from({ length: 9 }, (_, index) => ({
      id: `member-${index + 1}`,
      displayName: `成员 ${index + 1}`,
    }))

    expect(getStudyParticipants(participants, new Set(['member-9']))).toHaveLength(8)
    expect(getStudyParticipants(participants, new Set())).toHaveLength(9)
  })

  it('counts responses from more than four members without truncation', () => {
    expect(countParticipantCues({
      p1: 'NEED_TIME',
      p2: 'CHECKING',
      p3: 'SOCIAL_PRESSURE',
      p4: 'CHECKING',
      p5: 'NEED_TIME',
      p6: 'CHECKING',
    })).toEqual({
      NEED_TIME: 2,
      CHECKING: 3,
      SOCIAL_PRESSURE: 1,
    })
  })
})
