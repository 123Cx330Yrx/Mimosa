import type {
  CareAction,
  EnvironmentState,
  MomentPhase,
  MomentRole,
  MomentTrigger,
  ParticipantCue,
  PlantState,
  PublicMomentSnapshot,
  SilentMomentOutcome,
} from './protocol'

export interface ActiveMoment {
  id: string
  question: string
  coordinatorId: string
  waitingMemberId?: string
  trigger: MomentTrigger
  resumedFrom?: string
  candidateExpiresAt?: string
  phase: MomentPhase
}

export interface DeferredMoment {
  id: string
  question: string
  ownerId: string
}

export interface MimosaState {
  localRole: MomentRole
  activeMoment: ActiveMoment | null
  environments: EnvironmentState[]
  plant: PlantState
  publicFeedbacks: string[]
  privateCues: Record<string, ParticipantCue>
  deferredMoments: DeferredMoment[]
}

export type MimosaEvent =
  | {
      type: 'MOMENT_CANDIDATE_CREATED'
      id: string
      coordinatorId: string
      question?: string
      candidateExpiresAt?: string
    }
  | {
      type: 'MOMENT_CREATED'
      id: string
      question: string
      coordinatorId: string
      waitingMemberId: string
      trigger: 'manual'
      localRole: MomentRole
      resumedFrom?: string
    }
  | { type: 'LOCAL_MOMENT_ROLE_CHANGED'; role: MomentRole }
  | {
      type: 'CANDIDATE_COORDINATOR_CHANGED'
      momentId: string
      coordinatorId: string
      candidateExpiresAt: string
    }
  | {
      type: 'WAITING_ROLE_CONFIRMED'
      momentId: string
      waitingMemberId: string
      question: string
      isLocalWaitingMember: boolean
    }
  | {
      type: 'PRIVATE_CUE_RECEIVED'
      momentId: string
      senderId: string
      cue: ParticipantCue
      environment: EnvironmentState
    }
  | {
      type: 'ENVIRONMENT_RECEIVED'
      momentId: string
      environment: EnvironmentState
      feedback: string
    }
  | { type: 'PLANT_CLOSING_STARTED'; momentId: string }
  | { type: 'CARE_ACTION_APPLIED'; momentId: string; action: CareAction }
  | {
      type: 'SNAPSHOT_RECEIVED'
      snapshot: PublicMomentSnapshot
      isLocalWaitingMember: boolean
    }
  | {
      type: 'MOMENT_ENDED'
      momentId: string
      question: string
      waitingMemberId: string
      outcome: SilentMomentOutcome
    }
  | { type: 'DEFERRED_MOMENTS_RESTORED'; moments: DeferredMoment[] }
  | { type: 'DEFERRED_MOMENT_REMOVED'; momentId: string }
  | { type: 'MOMENT_CLEARED' }

const cueFeedback: Record<ParticipantCue, string> = {
  NEED_TIME: '有人还在整理想法，可以再等一会儿。',
  CHECKING: '有人正在确认这个问题。',
  SOCIAL_PRESSURE: '可能有人还在斟酌如何开口。',
}

const careEffects: Record<CareAction, { plant: PlantState; phase: MomentPhase; feedback: string }> = {
  WAIT: { plant: 'open', phase: 'RELIEVED', feedback: '这个问题可以慢一点回答。' },
  OPEN_TO_ALL: { plant: 'open', phase: 'RELIEVED', feedback: '大家都可以接着补充。' },
  REFRAME: { plant: 'paused', phase: 'RELIEVED', feedback: '这个问题会换一种说法。' },
  DEFER: { plant: 'seed', phase: 'DEFERRED', feedback: '先把问题放在这里，稍后再回来。' },
  RESOLVE: { plant: 'resolved', phase: 'RESOLVED', feedback: '讨论又接上了。' },
}

export function createInitialState(): MimosaState {
  return {
    localRole: 'unassigned',
    activeMoment: null,
    environments: [],
    plant: 'neutral',
    publicFeedbacks: [],
    privateCues: {},
    deferredMoments: [],
  }
}

function addUnique<T>(items: T[], item: T) {
  return items.includes(item) ? items : [...items, item]
}

function isCurrentMoment(state: MimosaState, momentId: string) {
  return state.activeMoment?.id === momentId
}

export function mimosaReducer(state: MimosaState, event: MimosaEvent): MimosaState {
  switch (event.type) {
    case 'MOMENT_CANDIDATE_CREATED':
      return {
        ...state,
        localRole: 'unassigned',
        activeMoment: {
          id: event.id,
          question: event.question?.trim() || '刚才提出的问题',
          coordinatorId: event.coordinatorId,
          trigger: 'silence-detected',
          phase: 'ROLE_CONFIRMATION',
          candidateExpiresAt: event.candidateExpiresAt,
        },
        environments: [],
        plant: 'neutral',
        publicFeedbacks: [],
        privateCues: {},
      }
    case 'MOMENT_CREATED':
      return {
        ...state,
        localRole: event.localRole,
        activeMoment: {
          id: event.id,
          question: event.question,
          coordinatorId: event.coordinatorId,
          waitingMemberId: event.waitingMemberId,
          trigger: event.trigger,
          resumedFrom: event.resumedFrom,
          phase: 'SENSITIVE_SILENCE',
        },
        environments: [],
        plant: 'growing',
        publicFeedbacks: [],
        privateCues: {},
        deferredMoments: event.resumedFrom
          ? state.deferredMoments.filter((moment) => moment.id !== event.resumedFrom)
          : state.deferredMoments,
      }
    case 'LOCAL_MOMENT_ROLE_CHANGED':
      return { ...state, localRole: event.role }
    case 'CANDIDATE_COORDINATOR_CHANGED':
      return isCurrentMoment(state, event.momentId) &&
        state.activeMoment?.phase === 'ROLE_CONFIRMATION'
        ? {
            ...state,
            activeMoment: {
              ...state.activeMoment,
              coordinatorId: event.coordinatorId,
              candidateExpiresAt: event.candidateExpiresAt,
            },
          }
        : state
    case 'WAITING_ROLE_CONFIRMED': {
      if (!isCurrentMoment(state, event.momentId)) return state
      return {
        ...state,
        localRole: event.isLocalWaitingMember
          ? 'waiting'
          : state.localRole === 'dismissed'
            ? 'dismissed'
            : state.localRole === 'waiting'
              ? 'responding'
              : state.localRole,
        activeMoment: state.activeMoment
          ? {
              ...state.activeMoment,
              waitingMemberId: event.waitingMemberId,
              question: event.question,
              phase: 'SENSITIVE_SILENCE',
              candidateExpiresAt: undefined,
            }
          : null,
        plant: 'growing',
      }
    }
    case 'PRIVATE_CUE_RECEIVED': {
      if (state.localRole !== 'waiting' || !isCurrentMoment(state, event.momentId)) return state
      return {
        ...state,
        environments: addUnique(
          state.environments,
          event.cue === 'SOCIAL_PRESSURE' ? 'cloudy' : event.environment,
        ),
        publicFeedbacks: addUnique(state.publicFeedbacks, cueFeedback[event.cue]),
        privateCues: { ...state.privateCues, [event.senderId]: event.cue },
      }
    }
    case 'ENVIRONMENT_RECEIVED':
      return isCurrentMoment(state, event.momentId)
        ? {
            ...state,
            environments: addUnique(state.environments, event.environment),
            publicFeedbacks: addUnique(state.publicFeedbacks, event.feedback),
          }
        : state
    case 'PLANT_CLOSING_STARTED':
      return isCurrentMoment(state, event.momentId) &&
        state.activeMoment?.phase === 'SENSITIVE_SILENCE'
        ? { ...state, plant: 'closing' }
        : state
    case 'CARE_ACTION_APPLIED': {
      if (!isCurrentMoment(state, event.momentId)) return state
      const effect = careEffects[event.action]
      return {
        ...state,
        activeMoment: state.activeMoment
          ? { ...state.activeMoment, phase: effect.phase }
          : null,
        plant: effect.plant,
        environments: event.action === 'OPEN_TO_ALL'
          ? state.environments.filter((environment) => environment !== 'cloudy')
          : state.environments,
        publicFeedbacks: [effect.feedback],
      }
    }
    case 'SNAPSHOT_RECEIVED':
      return {
        ...state,
        localRole: event.snapshot.phase === 'ROLE_CONFIRMATION'
          ? 'unassigned'
          : event.isLocalWaitingMember
            ? 'waiting'
            : 'responding',
        activeMoment: {
          id: event.snapshot.id,
          question: event.snapshot.question,
          coordinatorId: event.snapshot.coordinatorId,
          waitingMemberId: event.snapshot.waitingMemberId,
          trigger: event.snapshot.trigger,
          resumedFrom: event.snapshot.resumedFrom,
          candidateExpiresAt: event.snapshot.candidateExpiresAt,
          phase: event.snapshot.phase,
        },
        environments: event.snapshot.environments,
        plant: event.snapshot.plant,
        publicFeedbacks: event.snapshot.publicFeedbacks,
        privateCues: {},
      }
    case 'DEFERRED_MOMENTS_RESTORED':
      return {
        ...state,
        deferredMoments: event.moments.reduce(
          (moments, moment) => moments.some((existing) => existing.id === moment.id)
            ? moments
            : [...moments, moment],
          state.deferredMoments,
        ),
      }
    case 'DEFERRED_MOMENT_REMOVED':
      return {
        ...state,
        deferredMoments: state.deferredMoments.filter(
          (moment) => moment.id !== event.momentId,
        ),
      }
    case 'MOMENT_ENDED': {
      if (!isCurrentMoment(state, event.momentId)) return state
      const deferredMoments =
        event.outcome === 'DEFERRED' &&
        !state.deferredMoments.some((moment) => moment.id === event.momentId)
          ? [
              ...state.deferredMoments,
              {
                id: event.momentId,
                question: event.question,
                ownerId: event.waitingMemberId,
              },
            ]
          : state.deferredMoments
      return {
        ...state,
        localRole: 'unassigned',
        activeMoment: null,
        environments: [],
        plant: 'neutral',
        publicFeedbacks: [
          event.outcome === 'DEFERRED'
            ? '这个问题被轻轻收好了。'
            : '讨论又接上了。',
        ],
        privateCues: {},
        deferredMoments,
      }
    }
    case 'MOMENT_CLEARED':
      return {
        ...createInitialState(),
        deferredMoments: state.deferredMoments,
      }
  }
}

export function toPublicSnapshot(state: MimosaState): PublicMomentSnapshot | null {
  if (!state.activeMoment) return null
  const { resumedFrom, waitingMemberId, ...moment } = state.activeMoment
  return {
    ...moment,
    ...(waitingMemberId ? { waitingMemberId } : {}),
    ...(resumedFrom ? { resumedFrom } : {}),
    environments: state.environments,
    plant: state.plant,
    publicFeedbacks: state.publicFeedbacks,
  }
}

export function getCueEffect(cue: ParticipantCue, environment: EnvironmentState) {
  return {
    environment: cue === 'SOCIAL_PRESSURE' ? 'cloudy' : environment,
    feedback: cueFeedback[cue],
  }
}

export function getCareEffect(action: CareAction) {
  return careEffects[action]
}
