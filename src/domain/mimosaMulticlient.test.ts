import { describe, expect, it } from 'vitest'
import { createInitialState, getCueEffect, mimosaReducer } from './mimosaMachine'
import type { EnvironmentState, MomentRole, ParticipantCue } from './protocol'

const momentId = 'moment-four-clients'
const question = '大家觉得这个方案还有什么风险？'

function candidate(coordinatorId = 'endpoint-a') {
  return mimosaReducer(createInitialState(), {
    type: 'MOMENT_CANDIDATE_CREATED',
    id: momentId,
    coordinatorId,
  })
}

function chooseRole(state: ReturnType<typeof candidate>, role: MomentRole) {
  return mimosaReducer(state, { type: 'LOCAL_MOMENT_ROLE_CHANGED', role })
}

function bindWaitingSender(
  state: ReturnType<typeof candidate>,
  waitingEndpointSeenByThisClient: string,
  isLocalWaitingMember: boolean,
) {
  return mimosaReducer(state, {
    type: 'WAITING_ROLE_CONFIRMED',
    momentId,
    waitingMemberId: waitingEndpointSeenByThisClient,
    question,
    isLocalWaitingMember,
  })
}

function broadcastEnvironment(
  state: ReturnType<typeof candidate>,
  cue: ParticipantCue,
  environment: EnvironmentState,
) {
  const effect = getCueEffect(cue, environment)
  return mimosaReducer(state, {
    type: 'ENVIRONMENT_RECEIVED',
    momentId,
    environment: effect.environment,
    feedback: effect.feedback,
  })
}

describe('four-client role negotiation and feedback flow', () => {
  it('keeps A waiting while B, C, and D independently choose their roles', () => {
    const a = chooseRole(candidate(), 'waiting')
    const b = chooseRole(candidate(), 'responding')
    const c = chooseRole(candidate(), 'dismissed')
    const d = chooseRole(candidate(), 'responding')

    const confirmedA = bindWaitingSender(a, 'endpoint-a-local', true)
    const confirmedB = bindWaitingSender(b, 'endpoint-a-seen-by-b', false)
    const confirmedC = bindWaitingSender(c, 'endpoint-a-seen-by-c', false)
    const confirmedD = bindWaitingSender(d, 'endpoint-a-seen-by-d', false)

    expect(confirmedA.localRole).toBe('waiting')
    expect(confirmedB.localRole).toBe('responding')
    expect(confirmedC.localRole).toBe('dismissed')
    expect(confirmedD.localRole).toBe('responding')
    expect(confirmedA.activeMoment?.phase).toBe('SENSITIVE_SILENCE')
    expect(confirmedB.activeMoment?.waitingMemberId).toBe('endpoint-a-seen-by-b')
    expect(confirmedC.activeMoment?.waitingMemberId).toBe('endpoint-a-seen-by-c')
    expect(confirmedD.activeMoment?.waitingMemberId).toBe('endpoint-a-seen-by-d')
  })

  it('lets B become the sole waiting member after the other three chose responding', () => {
    const respondingA = chooseRole(candidate(), 'responding')
    const waitingB = chooseRole(candidate(), 'waiting')
    const respondingC = chooseRole(candidate(), 'responding')
    const respondingD = chooseRole(candidate(), 'responding')

    const confirmedA = bindWaitingSender(respondingA, 'endpoint-b-seen-by-a', false)
    const confirmedB = bindWaitingSender(waitingB, 'endpoint-b-local', true)
    const confirmedC = bindWaitingSender(respondingC, 'endpoint-b-seen-by-c', false)
    const confirmedD = bindWaitingSender(respondingD, 'endpoint-b-seen-by-d', false)

    expect([confirmedA.localRole, confirmedB.localRole, confirmedC.localRole, confirmedD.localRole]).toEqual([
      'responding',
      'waiting',
      'responding',
      'responding',
    ])
  })

  it('demotes a losing simultaneous waiting claimant to responding', () => {
    const losingClaimant = chooseRole(candidate(), 'waiting')
    const afterOtherMemberWins = bindWaitingSender(
      losingClaimant,
      'winning-endpoint-seen-locally',
      false,
    )

    expect(afterOtherMemberWins.localRole).toBe('responding')
    expect(afterOtherMemberWins.activeMoment?.waitingMemberId).toBe(
      'winning-endpoint-seen-locally',
    )
  })

  it('keeps private response details only on the waiting client while syncing the environment', () => {
    const waitingA = bindWaitingSender(chooseRole(candidate(), 'waiting'), 'a-local', true)
    const respondingB = bindWaitingSender(chooseRole(candidate(), 'responding'), 'a-seen-by-b', false)
    const dismissedC = bindWaitingSender(chooseRole(candidate(), 'dismissed'), 'a-seen-by-c', false)
    const respondingD = bindWaitingSender(chooseRole(candidate(), 'responding'), 'a-seen-by-d', false)

    const aWithPrivateCue = mimosaReducer(waitingA, {
      type: 'PRIVATE_CUE_RECEIVED',
      momentId,
      senderId: 'b-seen-by-a',
      cue: 'NEED_TIME',
      environment: 'sunlight',
    })
    const bWithPublicEnvironment = broadcastEnvironment(respondingB, 'NEED_TIME', 'sunlight')
    const cWithPublicEnvironment = broadcastEnvironment(dismissedC, 'NEED_TIME', 'sunlight')
    const dWithPublicEnvironment = broadcastEnvironment(respondingD, 'NEED_TIME', 'sunlight')

    expect(aWithPrivateCue.privateCues).toEqual({ 'b-seen-by-a': 'NEED_TIME' })
    expect(bWithPublicEnvironment.privateCues).toEqual({})
    expect(cWithPublicEnvironment.privateCues).toEqual({})
    expect(dWithPublicEnvironment.privateCues).toEqual({})
    expect(aWithPrivateCue.environments).toEqual(['sunlight'])
    expect(bWithPublicEnvironment.environments).toEqual(['sunlight'])
    expect(cWithPublicEnvironment.environments).toEqual(['sunlight'])
    expect(dWithPublicEnvironment.environments).toEqual(['sunlight'])
  })

  it('applies the waiting member care action to all clients without changing their roles', () => {
    const a = bindWaitingSender(chooseRole(candidate(), 'waiting'), 'a-local', true)
    const b = bindWaitingSender(chooseRole(candidate(), 'responding'), 'a-seen-by-b', false)
    const c = bindWaitingSender(chooseRole(candidate(), 'dismissed'), 'a-seen-by-c', false)
    const d = bindWaitingSender(chooseRole(candidate(), 'responding'), 'a-seen-by-d', false)

    const nextStates = [a, b, c, d].map((state) => mimosaReducer(state, {
      type: 'CARE_ACTION_APPLIED',
      momentId,
      action: 'WAIT',
    }))

    expect(nextStates.map((state) => state.localRole)).toEqual([
      'waiting',
      'responding',
      'dismissed',
      'responding',
    ])
    expect(nextStates.every((state) => state.plant === 'open')).toBe(true)
    expect(nextStates.every((state) => state.activeMoment?.phase === 'RELIEVED')).toBe(true)
  })
})
