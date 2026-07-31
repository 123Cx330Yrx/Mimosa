import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  mimosaReducer,
  toPublicSnapshot,
} from './mimosaMachine'
import { bindSnapshotToSender } from './protocol'

const activeWaitingMember = mimosaReducer(createInitialState(), {
  type: 'MOMENT_CREATED',
  id: 'moment-1',
  question: '这个方案还有什么风险？',
  coordinatorId: 'member-a',
  waitingMemberId: 'member-a',
  trigger: 'manual',
  localRole: 'waiting',
})

describe('mimosa state machine', () => {
  it('keeps an unclaimed candidate restorable without inventing a waiting member', () => {
    const candidate = mimosaReducer(createInitialState(), {
      type: 'MOMENT_CANDIDATE_CREATED',
      id: 'candidate-1',
      coordinatorId: 'endpoint-a',
      candidateExpiresAt: '2026-07-24T00:00:12.000Z',
    })
    expect(toPublicSnapshot(candidate)).toMatchObject({
      id: 'candidate-1',
      phase: 'ROLE_CONFIRMATION',
      candidateExpiresAt: '2026-07-24T00:00:12.000Z',
    })
    expect(toPublicSnapshot(candidate)?.waitingMemberId).toBeUndefined()
  })

  it('allows a new technical coordinator to take over during role confirmation', () => {
    const candidate = mimosaReducer(createInitialState(), {
      type: 'MOMENT_CANDIDATE_CREATED',
      id: 'candidate-1',
      coordinatorId: 'endpoint-a',
    })
    const transferred = mimosaReducer(candidate, {
      type: 'CANDIDATE_COORDINATOR_CHANGED',
      momentId: 'candidate-1',
      coordinatorId: 'endpoint-b',
      candidateExpiresAt: '2026-07-24T00:00:12.000Z',
    })
    expect(transferred.activeMoment?.coordinatorId).toBe('endpoint-b')
  })

  it('creates an unassigned role-confirmation moment without growing the plant', () => {
    const candidate = mimosaReducer(createInitialState(), {
      type: 'MOMENT_CANDIDATE_CREATED',
      id: 'moment-1',
      coordinatorId: 'detector-a',
    })

    expect(candidate.localRole).toBe('unassigned')
    expect(candidate.activeMoment).toMatchObject({
      coordinatorId: 'detector-a',
      trigger: 'silence-detected',
      phase: 'ROLE_CONFIRMATION',
    })
    expect(candidate.activeMoment?.waitingMemberId).toBeUndefined()
    expect(candidate.plant).toBe('neutral')
  })

  it('keeps responding and dismissed role choices local until a waiting member is confirmed', () => {
    const candidate = mimosaReducer(createInitialState(), {
      type: 'MOMENT_CANDIDATE_CREATED',
      id: 'moment-1',
      coordinatorId: 'detector-a',
    })
    const responding = mimosaReducer(candidate, {
      type: 'LOCAL_MOMENT_ROLE_CHANGED',
      role: 'responding',
    })
    const confirmed = mimosaReducer(responding, {
      type: 'WAITING_ROLE_CONFIRMED',
      momentId: 'moment-1',
      waitingMemberId: 'member-b',
      question: '这个方案还有什么风险？',
      isLocalWaitingMember: false,
    })

    expect(confirmed.localRole).toBe('responding')
    expect(confirmed.activeMoment?.waitingMemberId).toBe('member-b')
    expect(confirmed.activeMoment?.phase).toBe('SENSITIVE_SILENCE')
    expect(confirmed.plant).toBe('growing')
  })

  it('assigns the confirmed waiting member the waiting role', () => {
    const candidate = mimosaReducer(createInitialState(), {
      type: 'MOMENT_CANDIDATE_CREATED',
      id: 'moment-1',
      coordinatorId: 'detector-a',
    })
    const confirmed = mimosaReducer(candidate, {
      type: 'WAITING_ROLE_CONFIRMED',
      momentId: 'moment-1',
      waitingMemberId: 'member-b',
      question: '这个方案还有什么风险？',
      isLocalWaitingMember: true,
    })

    expect(confirmed.localRole).toBe('waiting')
  })

  it('translates a private participant cue only on the waiting-member client', () => {
    const waitingState = mimosaReducer(activeWaitingMember, {
      type: 'PRIVATE_CUE_RECEIVED',
      momentId: 'moment-1',
      senderId: 'member-b',
      cue: 'NEED_TIME',
      environment: 'sunlight',
    })
    const respondingState = mimosaReducer(
      { ...activeWaitingMember, localRole: 'responding' },
      {
        type: 'PRIVATE_CUE_RECEIVED',
        momentId: 'moment-1',
        senderId: 'member-b',
        cue: 'NEED_TIME',
        environment: 'sunlight',
      },
    )

    expect(waitingState.environments).toEqual(['sunlight'])
    expect(waitingState.privateCues).toEqual({ 'member-b': 'NEED_TIME' })
    expect(respondingState.environments).toEqual([])
    expect(respondingState.privateCues).toEqual({})
  })

  it('never includes private cues in a public recovery snapshot', () => {
    const withPrivateCue = mimosaReducer(activeWaitingMember, {
      type: 'PRIVATE_CUE_RECEIVED',
      momentId: 'moment-1',
      senderId: 'member-b',
      cue: 'CHECKING',
      environment: 'watering',
    })

    expect(toPublicSnapshot(withPrivateCue)).toEqual({
      id: 'moment-1',
      question: '这个方案还有什么风险？',
      coordinatorId: 'member-a',
      waitingMemberId: 'member-a',
      trigger: 'manual',
      phase: 'SENSITIVE_SILENCE',
      environments: ['watering'],
      plant: 'growing',
      publicFeedbacks: ['有人正在确认这个问题。'],
    })
  })

  it('starts its gradual closing after growth even when care cues are present', () => {
    const closing = mimosaReducer(activeWaitingMember, {
      type: 'PLANT_CLOSING_STARTED',
      momentId: 'moment-1',
    })
    expect(closing.plant).toBe('closing')

    const answered = mimosaReducer(activeWaitingMember, {
      type: 'ENVIRONMENT_RECEIVED',
      momentId: 'moment-1',
      environment: 'sunlight',
      feedback: '已有回应。',
    })
    const closingWithEnvironment = mimosaReducer(answered, {
      type: 'PLANT_CLOSING_STARTED',
      momentId: 'moment-1',
    })
    expect(closingWithEnvironment.plant).toBe('closing')
    expect(closingWithEnvironment.environments).toEqual(['sunlight'])
  })

  it('keeps watering visible when a later participant adds clouds', () => {
    const watered = mimosaReducer(activeWaitingMember, {
      type: 'PRIVATE_CUE_RECEIVED',
      momentId: 'moment-1',
      senderId: 'member-b',
      cue: 'CHECKING',
      environment: 'watering',
    })
    const wateredAndCloudy = mimosaReducer(watered, {
      type: 'PRIVATE_CUE_RECEIVED',
      momentId: 'moment-1',
      senderId: 'member-c',
      cue: 'SOCIAL_PRESSURE',
      environment: 'cloudy',
    })

    expect(wateredAndCloudy.environments).toEqual(['watering', 'cloudy'])
  })

  it('lets open-to-all clear clouds without erasing watering', () => {
    const watered = mimosaReducer(activeWaitingMember, {
      type: 'PRIVATE_CUE_RECEIVED',
      momentId: 'moment-1',
      senderId: 'member-b',
      cue: 'CHECKING',
      environment: 'watering',
    })
    const withWeather = mimosaReducer(watered, {
      type: 'PRIVATE_CUE_RECEIVED',
      momentId: 'moment-1',
      senderId: 'member-c',
      cue: 'SOCIAL_PRESSURE',
      environment: 'cloudy',
    })
    const next = mimosaReducer(withWeather, {
      type: 'CARE_ACTION_APPLIED',
      momentId: 'moment-1',
      action: 'OPEN_TO_ALL',
    })

    expect(next.environments).toEqual(['watering'])
    expect(next.plant).toBe('open')
  })

  it('restores only the public state for a late participant', () => {
    const incomingSnapshot = {
      id: 'moment-1',
      question: '这个方案还有什么风险？',
      coordinatorId: 'coordinator-seen-remotely',
      waitingMemberId: 'waiting-id-from-a-view',
      trigger: 'manual' as const,
      phase: 'RELIEVED' as const,
      environments: ['sunlight', 'watering'] as const,
      plant: 'open' as const,
      publicFeedbacks: ['这个问题可以慢一点回答。'],
    }
    const restored = mimosaReducer(createInitialState(), {
      type: 'SNAPSHOT_RECEIVED',
      snapshot: bindSnapshotToSender(
        {
          ...incomingSnapshot,
          environments: [...incomingSnapshot.environments],
        },
        'waiting-id-seen-by-late-participant',
      ),
      isLocalWaitingMember: false,
    })

    expect(restored.activeMoment?.waitingMemberId).toBe(
      'waiting-id-seen-by-late-participant',
    )
    expect(restored.localRole).toBe('responding')
    expect(restored.privateCues).toEqual({})
  })

  it('ignores stale events from another silent moment', () => {
    const next = mimosaReducer(activeWaitingMember, {
      type: 'ENVIRONMENT_RECEIVED',
      momentId: 'old-moment',
      environment: 'watering',
      feedback: 'stale',
    })
    expect(next).toBe(activeWaitingMember)
  })

  it('stores a deferred question for the waiting member and resets the local role', () => {
    const deferred = mimosaReducer(activeWaitingMember, {
      type: 'MOMENT_ENDED',
      momentId: 'moment-1',
      question: '这个方案还有什么风险？',
      waitingMemberId: 'member-a',
      outcome: 'DEFERRED',
    })

    expect(deferred.localRole).toBe('unassigned')
    expect(deferred.deferredMoments).toEqual([
      {
        id: 'moment-1',
        question: '这个方案还有什么风险？',
        ownerId: 'member-a',
      },
    ])
  })

  it('removes a deferred question from the shared seed bank', () => {
    const state = {
      ...createInitialState(),
      deferredMoments: [
        { id: 'seed-1', question: '旧问题', ownerId: 'member-a' },
        { id: 'seed-2', question: '保留的问题', ownerId: 'member-b' },
      ],
    }
    const next = mimosaReducer(state, {
      type: 'DEFERRED_MOMENT_REMOVED',
      momentId: 'seed-1',
    })
    expect(next.deferredMoments).toEqual([
      { id: 'seed-2', question: '保留的问题', ownerId: 'member-b' },
    ])
  })
})
