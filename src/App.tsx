import { useEffect, useReducer, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import { RoleClaimNotification } from './audio/RoleClaimNotification'
import { MimosaScene } from './components/MimosaScene'
import { getEnvironmentSceneCopy } from './domain/environmentScene'
import { translate, type Locale } from './i18n'
import { createInitialState, getCareEffect, getCueEffect, mimosaReducer, toPublicSnapshot } from './domain/mimosaMachine'
import { countParticipantCues, getStudyParticipants } from './domain/participantRoles'
import { bindSnapshotToSender, createEnvelope, type CareAction, type EnvironmentState, type ExperimentMarker, type MimosaEnvelope, type MomentRole, type ParticipantCue, type SilentMomentOutcome } from './domain/protocol'
import {
  electCoordinatorCandidate,
  isRoomSpeaking,
  pruneParticipantActivity,
  RECOVERY_SPEECH_CONFIRM_MS,
  remainingDelay,
  ROLE_CONFIRMATION_WINDOW_MS,
  ROOM_SILENCE_THRESHOLD_MS,
  type ParticipantActivity,
} from './domain/silenceCoordinator'
import { JaaSTransport } from './meeting/JaaSTransport'
import type { MeetingParticipant, MeetingTransport } from './meeting/MeetingTransport'
import type { SpeechSensorStatus } from './sensing/SpeechActivitySensor'
import { WebAudioSpeechActivitySensor } from './sensing/WebAudioSpeechActivitySensor'
import {
  clearStudyEvents,
  getOrCreateStudyIdentity,
  persistStudyEvents,
  readStudyEvents,
  type StudyEvent,
} from './research/studyLog'
import {
  assembleLogTransferChunks,
  createLogTransferChunks,
  type LogTransferChunk,
  type StudyLogBundle,
} from './research/observerLogTransfer'

const cueLabels: Record<ParticipantCue, { label: string; detail: string }> = {
  NEED_TIME: { label: '需要一点时间', detail: '我还在思考或组织语言' },
  CHECKING: { label: '正在确认', detail: '我在查资料或处理信息' },
  SOCIAL_PRESSURE: { label: '有社交压力', detail: '我不太好意思发言' },
}

const careLabels: Record<CareAction, { label: string; detail: string }> = {
  WAIT: { label: '不急，慢慢想', detail: '先留一点安静，不催着回答' },
  OPEN_TO_ALL: { label: '大家都可以补充', detail: '把问题轻轻交给在场的每个人' },
  REFRAME: { label: '换一种方式问', detail: '换个更容易接话的说法' },
  DEFER: { label: '稍后再回到', detail: '先收成一颗种子，之后再带回来' },
  RESOLVE: { label: '讨论已经恢复', detail: '确认大家已经重新接上话' },
}

const plantLabels = { neutral: '幼苗', growing: '慢慢长大', closing: '慢慢合起', paused: '停在此刻', open: '重新舒展', seed: '化作种子', resolved: '舒展如初' }

function getVisualPreview() {
  if (!import.meta.env.DEV) return null
  const params = new URLSearchParams(window.location.search)
  const scene = params.get('scene')
  if (!scene) return null
  const allowedEnvironments = new Set<EnvironmentState>(['sunlight', 'watering', 'cloudy'])
  const environments = scene.split(',').filter((value): value is EnvironmentState => allowedEnvironments.has(value as EnvironmentState))
  const requestedPlant = params.get('plant')
  const plant = requestedPlant && requestedPlant in plantLabels ? requestedPlant as keyof typeof plantLabels : 'open'
  return { environments, plant, breeze: params.get('breeze') === '1', active: params.get('active') === '1' }
}

function CueIcon({ cue }: { cue: ParticipantCue }) {
  return cue === 'NEED_TIME' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>
  ) : cue === 'CHECKING' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 4.5 4.5M8 10.5l1.7 1.7L13.5 8" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 18h10.8a4.2 4.2 0 0 0 .6-8.3A6.2 6.2 0 0 0 6.3 8.2 4.9 4.9 0 0 0 6.5 18Z" /></svg>
  )
}

function EnvironmentActionIcon({ environment }: { environment: 'sunlight' | 'watering' }) {
  return environment === 'sunlight' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.4 4.2 5.2 7 5.2 9.5A5.2 5.2 0 0 1 12 17.7a5.2 5.2 0 0 1-5.2-5.2C6.8 10 8.6 7.2 12 3Z" /><path d="M9.4 13.2c.5 1.2 1.4 1.8 2.7 1.8" /></svg>
  )
}

function CareIcon({ action }: { action: CareAction }) {
  if (action === 'WAIT') return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8M8 21h8M9 3v3.5c0 2 1.2 3.2 3 4.5-1.8 1.3-3 2.5-3 4.5V21M15 3v3.5c0 2-1.2 3.2-3 4.5 1.8 1.3 3 2.5 3 4.5V21" /></svg>
  if (action === 'OPEN_TO_ALL') return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" /><circle cx="5.5" cy="13" r="2.4" /><circle cx="18.5" cy="13" r="2.4" /><path d="M7 20c.4-3 2-4.5 5-4.5s4.6 1.5 5 4.5M2 20c.2-2.1 1.3-3.3 3.5-3.3M22 20c-.2-2.1-1.3-3.3-3.5-3.3" /></svg>
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20c-3.2-3-4.8-5.7-4.8-8.2A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 4.8 4.8C16.8 14.3 15.2 17 12 20Z" /><path d="M12 7V3M9 4.5 12 3l3 1.5" /></svg>
}

interface RoundNotice {
  outcome: SilentMomentOutcome
  question: string
}

interface SeedTransfer {
  stage: 'preparing' | 'flying' | 'arrived'
  style?: CSSProperties
}

// The plant starts folding as soon as its growth entrance has settled. The
// folding motion itself is deliberately slow, so there is no separate period
// in which a fully-grown plant appears frozen.
// The last bloom particles settle just before 3.8 s. Starting closure after
// that boundary prevents the entrance animation from being cut off midway.
const PLANT_CLOSE_START_DELAY_MS = 4_050
const DEFAULT_JAAS_APP_ID = 'vpaas-magic-cookie-4ea72651a0a245cfbec2305213bcdc29'
const RESPONSE_COUNT_MODE = (
  import.meta.env.VITE_RESPONSE_COUNT_MODE || 'exact'
) as 'exact' | 'coarse' | 'hidden'

function App() {
  const initialParams = new URLSearchParams(window.location.search)
  const accessMode = (() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('research') === '1') return 'research'
    if (params.get('study') === '1') return 'study'
    return 'participant'
  })() as 'participant' | 'study' | 'research'
  const showStudyPanel = accessMode === 'study' || accessMode === 'research'
  const showResearchControls = accessMode === 'research'
  const isObserver = accessMode === 'research'
  const [locale, setLocale] = useState<Locale>(() => initialParams.get('lang') === 'en' ? 'en' : 'zh')
  const localeRef = useRef(locale)
  const t = (source: string) => translate(locale, source)
  const [studyIdentity] = useState(() => getOrCreateStudyIdentity(sessionStorage))
  const [state, dispatch] = useReducer(mimosaReducer, createInitialState())
  const stateRef = useRef(state)
  const participantsRef = useRef<readonly MeetingParticipant[]>([])
  const transportRef = useRef<MeetingTransport | null>(null)
  const seenMessages = useRef(new Set<string>())
  const knownParticipantIds = useRef(new Set<string>())
  const confirmedWaitingMoments = useRef(new Set<string>())
  const notifiedWaitingMoments = useRef(new Set<string>())
  const roleClaimNotification = useRef<RoleClaimNotification | null>(null)
  const pendingWaitingClaimId = useRef<string | null>(null)
  const endingTimer = useRef<number | null>(null)
  const seedTransferTimer = useRef<number | null>(null)
  const seedTransferClearTimer = useRef<number | null>(null)
  const seedBankTargetRef = useRef<HTMLDivElement | null>(null)
  const noticeTimer = useRef<number | null>(null)
  const noResponseTimer = useRef<number | null>(null)
  const candidateTimer = useRef<number | null>(null)
  const candidateExitTimer = useRef<number | null>(null)
  const silenceTimer = useRef<number | null>(null)
  const recoveryTimer = useRef<number | null>(null)
  const speechSensorRef = useRef<WebAudioSpeechActivitySensor | null>(null)
  const participantActivity = useRef(new Map<string, ParticipantActivity>())
  const coordinatorClientKey = useRef(crypto.randomUUID())
  const participantClientKeys = useRef(new Map<string, string>())
  const observerIdsRef = useRef(new Set<string>())
  const observerLogChunksRef = useRef(new Map<string, Map<number, LogTransferChunk>>())
  const observerLogRequestIdRef = useRef<string | null>(null)
  const removedDeferredMomentIdsRef = useRef(new Set<string>())
  const hasObservedSpeech = useRef(false)
  const lastRoomActivityAt = useRef(0)
  const technicalCoordinatorIdRef = useRef<string | null>(null)
  const silenceDetectionEnabledRef = useRef(true)
  const lastLocalSpeaking = useRef<boolean | null>(null)
  const localAudioMutedRef = useRef(true)
  const formalMomentStartedAt = useRef(0)
  const [participants, setParticipants] = useState<readonly MeetingParticipant[]>([])
  const [observerIds, setObserverIds] = useState<ReadonlySet<string>>(() => new Set())
  const [observerLogs, setObserverLogs] = useState<Record<string, StudyLogBundle>>({})
  const [observerLogRequestId, setObserverLogRequestId] = useState<string | null>(null)
  const [observerCueCounts, setObserverCueCounts] = useState<Record<ParticipantCue, number>>({
    NEED_TIME: 0,
    CHECKING: 0,
    SOCIAL_PRESSURE: 0,
  })
  const [experimentMarker, setExperimentMarker] = useState<ExperimentMarker | null>(null)
  const [connection, setConnection] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [error, setError] = useState('')
  const [question, setQuestion] = useState(() => locale === 'en' ? 'What risks might this proposal involve?' : '大家觉得这个方案还有什么风险？')
  const [candidateQuestion, setCandidateQuestion] = useState('')
  const [appId] = useState(import.meta.env.VITE_JAAS_APP_ID || DEFAULT_JAAS_APP_ID)
  const [roomName, setRoomName] = useState(() => initialParams.get('room')?.trim() ?? '')
  const [displayName, setDisplayName] = useState(() => initialParams.get('name')?.trim() || (locale === 'en' ? (isObserver ? 'Research observer' : 'Participant A') : (isObserver ? '研究观察员' : '成员 A')))
  const [sentCue, setSentCue] = useState<ParticipantCue | null>(null)
  const [cueAcknowledged, setCueAcknowledged] = useState(false)
  const [pendingCue, setPendingCue] = useState<ParticipantCue | null>(null)
  const [ending, setEnding] = useState(false)
  const [lastCareAction, setLastCareAction] = useState<CareAction | null>(null)
  const [roundNotice, setRoundNotice] = useState<RoundNotice | null>(null)
  const [noticeDismissing, setNoticeDismissing] = useState(false)
  const [sceneReaction, setSceneReaction] = useState<{ id: string; environment: EnvironmentState } | null>(null)
  const [seedTransfer, setSeedTransfer] = useState<SeedTransfer | null>(null)
  const [studyEvents, setStudyEvents] = useState<StudyEvent[]>(() =>
    readStudyEvents(localStorage, studyIdentity.sessionId))
  const [deferredDrafts, setDeferredDrafts] = useState<Record<string, string>>({})
  const [pendingDeferredRemovalId, setPendingDeferredRemovalId] = useState<string | null>(null)
  const [silenceDetectionEnabled] = useState(true)
  const [sensorStatus, setSensorStatus] = useState<SpeechSensorStatus>('idle')
  const [, setSensorMessage] = useState('')
  const [localSpeechState, setLocalSpeechState] = useState<'waiting' | 'speaking' | 'quiet'>('waiting')
  const [localAudioMuted, setLocalAudioMuted] = useState(true)
  const [silenceSecondsLeft, setSilenceSecondsLeft] = useState<number | null>(null)
  const [, setTechnicalCoordinatorId] = useState<string | null>(null)
  const [recoverySuggested, setRecoverySuggested] = useState(false)
  const [candidateNotice, setCandidateNotice] = useState('')
  const [candidateExiting, setCandidateExiting] = useState(false)
  const [deferredStorageReady, setDeferredStorageReady] = useState(false)

  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => () => roleClaimNotification.current?.dispose(), [])
  useEffect(() => {
    localeRef.current = locale
    document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
    const url = new URL(window.location.href)
    if (locale === 'en') url.searchParams.set('lang', 'en')
    else url.searchParams.delete('lang')
    window.history.replaceState(null, '', url)
  }, [locale])
  useEffect(() => {
    setQuestion((current) => {
      if (locale === 'en' && current === '大家觉得这个方案还有什么风险？') return 'What risks might this proposal involve?'
      if (locale === 'zh' && current === 'What risks might this proposal involve?') return '大家觉得这个方案还有什么风险？'
      return current
    })
  }, [locale])
  const studyParticipants = getStudyParticipants(participants, observerIds)
  useEffect(() => {
    participantsRef.current = getStudyParticipants(participants, observerIds)
  }, [observerIds, participants])
  useEffect(() => { silenceDetectionEnabledRef.current = silenceDetectionEnabled }, [silenceDetectionEnabled])
  useEffect(() => {
    if (connection !== 'connected' || sensorStatus !== 'listening') {
      setSilenceSecondsLeft(null)
      return
    }
    const updateCountdown = () => {
      if (
        stateRef.current.activeMoment ||
        !hasObservedSpeech.current ||
        isRoomSpeaking(participantActivity.current, Date.now())
      ) {
        setSilenceSecondsLeft(null)
        return
      }
      const elapsed = Date.now() - lastRoomActivityAt.current
      setSilenceSecondsLeft(Math.ceil(Math.max(0, ROOM_SILENCE_THRESHOLD_MS - elapsed) / 1_000))
    }
    updateCountdown()
    const timer = window.setInterval(updateCountdown, 250)
    return () => window.clearInterval(timer)
  }, [connection, sensorStatus])
  useEffect(() => {
    if (!deferredStorageReady) return
    localStorage.setItem(
      `mimosa:deferred:${appId}:${roomName}`,
      JSON.stringify(state.deferredMoments),
    )
  }, [appId, deferredStorageReady, roomName, state.deferredMoments])
  useEffect(() => {
    persistStudyEvents(localStorage, studyIdentity.sessionId, studyEvents)
  }, [studyEvents, studyIdentity.sessionId])
  useEffect(() => {
    setSentCue(null)
    setCueAcknowledged(false)
    setPendingCue(null)
    setEnding(false)
    setLastCareAction(null)
    setSceneReaction(null)
    setRecoverySuggested(false)
    setObserverCueCounts({ NEED_TIME: 0, CHECKING: 0, SOCIAL_PRESSURE: 0 })
    pendingWaitingClaimId.current = null
  }, [state.activeMoment?.id])
  useEffect(() => () => {
    transportRef.current?.disconnect()
    if (endingTimer.current) window.clearTimeout(endingTimer.current)
    if (seedTransferTimer.current) window.clearTimeout(seedTransferTimer.current)
    if (seedTransferClearTimer.current) window.clearTimeout(seedTransferClearTimer.current)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    if (noResponseTimer.current) window.clearTimeout(noResponseTimer.current)
    if (candidateTimer.current) window.clearTimeout(candidateTimer.current)
    if (candidateExitTimer.current) window.clearTimeout(candidateExitTimer.current)
    if (silenceTimer.current) window.clearTimeout(silenceTimer.current)
    if (recoveryTimer.current) window.clearTimeout(recoveryTimer.current)
    speechSensorRef.current?.stop()
  }, [])

  function clearCandidateTimer() {
    if (candidateTimer.current) window.clearTimeout(candidateTimer.current)
    candidateTimer.current = null
  }

  function transitionCandidateOut(momentId: string, notice: string) {
    if (
      candidateExitTimer.current ||
      stateRef.current.activeMoment?.id !== momentId ||
      stateRef.current.activeMoment.phase !== 'ROLE_CONFIRMATION'
    ) return
    setCandidateExiting(true)
    candidateExitTimer.current = window.setTimeout(() => {
      candidateExitTimer.current = null
      dispatch({ type: 'MOMENT_CLEARED' })
      setCandidateExiting(false)
      setCandidateNotice(notice)
    }, 820)
  }

  function clearSilenceTimer() {
    if (silenceTimer.current) window.clearTimeout(silenceTimer.current)
    silenceTimer.current = null
  }

  function clearRecoveryTimer() {
    if (recoveryTimer.current) window.clearTimeout(recoveryTimer.current)
    recoveryTimer.current = null
  }

  function clearNoResponseTimer() {
    if (noResponseTimer.current) window.clearTimeout(noResponseTimer.current)
    noResponseTimer.current = null
  }

  function scheduleProgressiveClosure(momentId: string) {
    clearNoResponseTimer()
    noResponseTimer.current = window.setTimeout(() => {
      const current = stateRef.current
      const transport = transportRef.current
      if (
        !transport ||
        current.localRole !== 'waiting' ||
        current.activeMoment?.id !== momentId ||
        current.activeMoment.phase !== 'SENSITIVE_SILENCE'
      ) return

      dispatch({ type: 'PLANT_CLOSING_STARTED', momentId })
      transport.broadcast(buildEnvelope({ ...baseFields(momentId), type: 'PLANT_CLOSING_STARTED', payload: {} }))
      recordEvent('plant_closing_started', momentId, { afterMs: PLANT_CLOSE_START_DELAY_MS, mode: 'after-growth' })
      noResponseTimer.current = null
    }, PLANT_CLOSE_START_DELAY_MS)
  }

  function showRoundNotice(outcome: SilentMomentOutcome, noticeQuestion: string) {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    setNoticeDismissing(false)
    setRoundNotice({ outcome, question: noticeQuestion })
    noticeTimer.current = window.setTimeout(() => dismissRoundNotice(), 4_600)
  }

  function dismissRoundNotice() {
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    setNoticeDismissing(true)
    noticeTimer.current = window.setTimeout(() => {
      setRoundNotice(null)
      setNoticeDismissing(false)
    }, 460)
  }

  function recordEvent(type: string, momentId?: string, details?: Record<string, unknown>) {
    setStudyEvents((events) => [
      ...events,
      {
        sequence: events.length + 1,
        at: new Date().toISOString(),
        type,
        momentId,
        details: {
          ...details,
          participantCount: participantsRef.current.length,
          localRole: stateRef.current.localRole,
        },
      },
    ])
  }

  function buildEnvelope<T extends MimosaEnvelope>(message: Omit<T, 'app' | 'version' | 'messageId' | 'sentAt'>) {
    return createEnvelope<T>(message)
  }

  function baseFields(momentId: string) {
    const transport = transportRef.current
    return {
      roomId: `${appId}/${roomName}`,
      silentMomentId: momentId,
      senderId: transport?.getLocalParticipantId() ?? 'local',
    }
  }

  function broadcastReliably(message: MimosaEnvelope) {
    const transport = transportRef.current
    if (!transport) return
    transport.broadcast(message)
    window.setTimeout(() => transportRef.current?.broadcast(message), 450)
    window.setTimeout(() => transportRef.current?.broadcast(message), 1_250)
  }

  function sendReliably(participantId: string, message: MimosaEnvelope) {
    const transport = transportRef.current
    if (!transport) return
    transport.sendTo(participantId, message)
    window.setTimeout(() => transportRef.current?.sendTo(participantId, message), 450)
    window.setTimeout(() => transportRef.current?.sendTo(participantId, message), 1_250)
  }

  function setKnownObserver(participantId: string) {
    if (observerIdsRef.current.has(participantId)) return
    observerIdsRef.current = new Set(observerIdsRef.current).add(participantId)
    setObserverIds(new Set(observerIdsRef.current))
    participantsRef.current = getStudyParticipants(participantsRef.current, observerIdsRef.current)
    participantActivity.current.delete(participantId)
    participantClientKeys.current.delete(participantId)
    if (!isObserver) recomputeTechnicalCoordinator()
    recordEvent('observer_detected', stateRef.current.activeMoment?.id, { observerId: participantId })
  }

  function announceObserverIdentity(participantId?: string) {
    if (!isObserver) return
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    if (!transport || !localId) return
    const message = buildEnvelope({
      ...baseFields(''),
      type: 'OBSERVER_HELLO',
      payload: { observerSessionId: studyIdentity.sessionId },
    })
    if (participantId) sendReliably(participantId, message)
    else broadcastReliably(message)
  }

  function cueCountsFromState() {
    return countParticipantCues(stateRef.current.privateCues)
  }

  function sendObserverRoundSummary(
    momentId: string,
    cueCounts = cueCountsFromState(),
    targetObserverId?: string,
  ) {
    const transport = transportRef.current
    if (!transport || stateRef.current.localRole !== 'waiting') return
    const responseCount = Object.values(cueCounts).reduce((sum, count) => sum + count, 0)
    const recipients = targetObserverId ? [targetObserverId] : [...observerIdsRef.current]
    for (const observerId of recipients) {
      sendReliably(observerId, buildEnvelope({
        ...baseFields(momentId),
        type: 'OBSERVER_ROUND_SUMMARY',
        payload: { responseCount, cueCounts },
      }))
    }
  }

  function sendExperimentMarker(marker: ExperimentMarker) {
    if (!isObserver || !transportRef.current) return
    setExperimentMarker(marker)
    const message = buildEnvelope({
      ...baseFields(stateRef.current.activeMoment?.id ?? ''),
      type: 'EXPERIMENT_MARKER',
      payload: { marker },
    })
    broadcastReliably(message)
    recordEvent('researcher_experiment_marker', stateRef.current.activeMoment?.id, { marker })
  }

  function cancelFalsePositiveMoment() {
    if (!isObserver || !stateRef.current.activeMoment || !transportRef.current) return
    const momentId = stateRef.current.activeMoment.id
    broadcastReliably(buildEnvelope({
      ...baseFields(momentId),
      type: 'OBSERVER_CANCEL_MOMENT',
      payload: { reason: 'false-positive' },
    }))
    dispatch({ type: 'MOMENT_CLEARED' })
    clearCandidateTimer()
    clearNoResponseTimer()
    clearRecoveryTimer()
    setCandidateExiting(false)
    setCandidateNotice(locale === 'en' ? 'The researcher removed this false trigger from the study flow.' : '研究者已将这次误触发从实验流程中撤销。')
    recordEvent('researcher_cancelled_moment', momentId, { reason: 'false-positive' })
  }

  function requestParticipantLogs() {
    if (!isObserver || !transportRef.current) return
    const requestId = crypto.randomUUID()
    observerLogChunksRef.current.clear()
    observerLogRequestIdRef.current = requestId
    setObserverLogs({})
    setObserverLogRequestId(requestId)
    const message = buildEnvelope({
      ...baseFields(stateRef.current.activeMoment?.id ?? ''),
      type: 'STUDY_LOG_REQUEST',
      payload: { requestId },
    })
    for (const participant of studyParticipants) {
      if (participant.id !== transportRef.current.getLocalParticipantId()) {
        sendReliably(participant.id, message)
      }
    }
    recordEvent('researcher_requested_logs', stateRef.current.activeMoment?.id, {
      requestId,
      expectedParticipants: studyParticipants.length,
    })
  }

  function respondToLogRequest(requestId: string, requesterId: string) {
    if (isObserver || !transportRef.current) return
    const chunks = createLogTransferChunks(requestId, studyIdentity, studyEvents)
    for (const chunk of chunks) {
      transportRef.current.sendTo(requesterId, buildEnvelope({
        ...baseFields(stateRef.current.activeMoment?.id ?? ''),
        type: 'STUDY_LOG_RESPONSE_CHUNK',
        payload: chunk,
      }))
    }
    recordEvent('study_log_shared_with_researcher', stateRef.current.activeMoment?.id, {
      requestId,
      chunkCount: chunks.length,
    })
  }

  function receiveLogChunk(chunk: LogTransferChunk) {
    if (!isObserver || chunk.requestId !== observerLogRequestIdRef.current) return
    const transferKey = `${chunk.requestId}:${chunk.sessionId}`
    const transfer = observerLogChunksRef.current.get(transferKey) ?? new Map<number, LogTransferChunk>()
    transfer.set(chunk.chunkIndex, chunk)
    observerLogChunksRef.current.set(transferKey, transfer)
    if (transfer.size !== chunk.chunkCount) return
    const bundle = assembleLogTransferChunks([...transfer.values()])
    if (!bundle) return
    setObserverLogs((logs) => ({ ...logs, [bundle.identity.sessionId]: bundle }))
  }

  function downloadAggregatedLogs() {
    if (!isObserver || Object.keys(observerLogs).length === 0) return
    const payload = {
      exportedAt: new Date().toISOString(),
      roomId: `${appId}/${roomName}`,
      requestId: observerLogRequestId,
      participantCount: studyParticipants.length,
      logs: Object.values(observerLogs),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mimosa-${roomName}-aggregated-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    recordEvent('researcher_downloaded_aggregated_logs', stateRef.current.activeMoment?.id, {
      requestId: observerLogRequestId,
      receivedParticipants: Object.keys(observerLogs).length,
    })
  }

  function scheduleCandidateExpiry(momentId: string, expiresAt: string) {
    clearCandidateTimer()
    const delay = remainingDelay(expiresAt)
    candidateTimer.current = window.setTimeout(() => {
      const current = stateRef.current
      const localId = transportRef.current?.getLocalParticipantId()
      if (
        current.activeMoment?.id !== momentId ||
        current.activeMoment.phase !== 'ROLE_CONFIRMATION' ||
        current.activeMoment.waitingMemberId ||
        (current.activeMoment.coordinatorId !== localId &&
          technicalCoordinatorIdRef.current !== localId)
      ) return
      cancelSilenceCandidate('unclaimed')
    }, delay)
  }

  function recomputeTechnicalCoordinator() {
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    if (!transport || !localId) return null
    const candidates = [
      { endpointId: localId, clientKey: coordinatorClientKey.current },
      ...[...participantClientKeys.current].map(([endpointId, clientKey]) => ({
        endpointId,
        clientKey,
      })),
    ]
    const winner = electCoordinatorCandidate(candidates)
    const endpointId = winner?.endpointId ?? localId
    technicalCoordinatorIdRef.current = endpointId
    setTechnicalCoordinatorId(endpointId)
    return endpointId
  }

  function announceCoordinatorIdentity(participantId?: string) {
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    if (!transport || !localId) return
    const hello = buildEnvelope({
      ...baseFields(''),
      type: 'COORDINATOR_HELLO',
      payload: { clientKey: coordinatorClientKey.current },
    })
    if (participantId) sendReliably(participantId, hello)
    else broadcastReliably(hello)
  }

  function scheduleAutomaticSilenceCandidate() {
    if (isObserver) return
    clearSilenceTimer()
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    if (
      !transport ||
      !localId ||
      !silenceDetectionEnabledRef.current ||
      !hasObservedSpeech.current ||
      stateRef.current.activeMoment ||
      technicalCoordinatorIdRef.current !== localId ||
      isRoomSpeaking(participantActivity.current, Date.now())
    ) return

    const elapsed = Date.now() - lastRoomActivityAt.current
    const delay = Math.max(0, ROOM_SILENCE_THRESHOLD_MS - elapsed)
    silenceTimer.current = window.setTimeout(() => {
      if (
        stateRef.current.activeMoment ||
        isRoomSpeaking(participantActivity.current, Date.now()) ||
        technicalCoordinatorIdRef.current !== transportRef.current?.getLocalParticipantId()
      ) return
      createSilenceCandidate('automatic')
    }, delay)
  }

  function scheduleRecoverySuggestion(momentId: string) {
    const current = stateRef.current
    if (
      current.localRole !== 'waiting' ||
      current.activeMoment?.id !== momentId ||
      current.activeMoment.phase === 'ROLE_CONFIRMATION' ||
      Date.now() - formalMomentStartedAt.current < 3_000 ||
      recoveryTimer.current
    ) return
    recoveryTimer.current = window.setTimeout(() => {
      const latest = stateRef.current
      if (
        latest.localRole === 'waiting' &&
        latest.activeMoment?.id === momentId &&
        isRoomSpeaking(participantActivity.current, Date.now())
      ) {
        setRecoverySuggested(true)
        recordEvent('speech_recovery_suggested', momentId, {
          sustainedMs: RECOVERY_SPEECH_CONFIRM_MS,
        })
      }
      recoveryTimer.current = null
    }, RECOVERY_SPEECH_CONFIRM_MS)
  }

  function processSpeechActivity(
    participantId: string,
    speaking: boolean,
    observedAt: number,
    source: 'local-vad' | 'manual',
  ) {
    if (isObserver || observerIdsRef.current.has(participantId)) return
    participantActivity.current.set(participantId, { speaking, observedAt })
    if (speaking) {
      hasObservedSpeech.current = true
      lastRoomActivityAt.current = observedAt
      clearSilenceTimer()
      const moment = stateRef.current.activeMoment
      if (moment?.phase === 'ROLE_CONFIRMATION' &&
        technicalCoordinatorIdRef.current === transportRef.current?.getLocalParticipantId()) {
        cancelSilenceCandidate('speech-resumed')
      } else if (moment && moment.phase !== 'ROLE_CONFIRMATION') {
        scheduleRecoverySuggestion(moment.id)
      }
    } else if (!isRoomSpeaking(participantActivity.current, Date.now())) {
      clearRecoveryTimer()
      scheduleAutomaticSilenceCandidate()
    }
    if (source === 'manual') {
      recordEvent('manual_speech_activity', stateRef.current.activeMoment?.id, { speaking })
    }
  }

  async function startSpeechSensor() {
    if (isObserver) return
    speechSensorRef.current?.stop()
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    if (!transport || !localId || !silenceDetectionEnabledRef.current) return

    const sensor = new WebAudioSpeechActivitySensor()
    speechSensorRef.current = sensor
    sensor.onStatus((status, message) => {
      setSensorStatus(status)
      setSensorMessage(message ?? '')
      if (status === 'listening') recordEvent('speech_sensor_started', undefined, { mode: 'local-vad' })
      if (status === 'denied' || status === 'error' || status === 'unavailable') {
        recordEvent('speech_sensor_unavailable', undefined, { status })
      }
    })
    sensor.onActivity((sample) => {
      if (localAudioMutedRef.current) return
      const changed = lastLocalSpeaking.current !== sample.speaking
      lastLocalSpeaking.current = sample.speaking
      processSpeechActivity(localId, sample.speaking, sample.observedAt, 'local-vad')
      transport.broadcast(buildEnvelope({
        ...baseFields(''),
        type: 'SPEECH_ACTIVITY',
        payload: {
          speaking: sample.speaking,
          observedAt: new Date(sample.observedAt).toISOString(),
          source: 'local-vad',
        },
      }))
      if (changed) {
        recordEvent('local_speech_activity_changed', stateRef.current.activeMoment?.id, {
          speaking: sample.speaking,
        })
      }
    })
    sensor.onSignal((sample) => {
      if (localAudioMutedRef.current) {
        setLocalSpeechState('waiting')
        return
      }
      setLocalSpeechState(sample.speaking
        ? 'speaking'
        : (hasObservedSpeech.current ? 'quiet' : 'waiting'))
    })
    await sensor.start()
  }

  function stopSpeechSensor() {
    speechSensorRef.current?.stop()
    speechSensorRef.current = null
    lastLocalSpeaking.current = null
    setLocalSpeechState('waiting')
    setSilenceSecondsLeft(null)
    clearSilenceTimer()
  }

  function announceWaitingRole(momentId: string, claimId: string, proposedQuestion?: string) {
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    const current = stateRef.current
    const moment = current.activeMoment
    if (
      !transport ||
      !localId ||
      !moment ||
      moment.id !== momentId ||
      moment.phase !== 'ROLE_CONFIRMATION' ||
      moment.waitingMemberId
    ) return

    const resolvedQuestion = proposedQuestion?.trim() || moment.question || '刚才提出的问题'
    formalMomentStartedAt.current = Date.now()
    clearCandidateTimer()
    pendingWaitingClaimId.current = null
    dispatch({
      type: 'WAITING_ROLE_CONFIRMED',
      momentId,
      waitingMemberId: localId,
      question: resolvedQuestion,
      isLocalWaitingMember: true,
    })
    const confirmation = buildEnvelope({
      ...baseFields(momentId),
      type: 'WAITING_ROLE_CONFIRMED',
      payload: { claimId, question: resolvedQuestion },
    })
    broadcastReliably(confirmation)
    scheduleProgressiveClosure(momentId)
    recordEvent('waiting_role_announced', momentId, { claimId })
  }

  function notifyOtherMemberOfWaitingClaim(momentId: string, waitingMemberId: string) {
    if (isObserver || notifiedWaitingMoments.current.has(momentId)) return
    if (transportRef.current?.getLocalParticipantId() === waitingMemberId) return
    notifiedWaitingMoments.current.add(momentId)
    const played = roleClaimNotification.current?.play() ?? false
    recordEvent('waiting_role_notification_cued', momentId, {
      channel: 'audio-and-visual',
      audioPlayed: played,
    })
  }

  function acceptWaitingClaim(momentId: string, claimantId: string, claimId: string, proposedQuestion?: string) {
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    const moment = stateRef.current.activeMoment
    if (
      !transport ||
      !localId ||
      !moment ||
      moment.id !== momentId ||
      moment.coordinatorId !== localId ||
      moment.phase !== 'ROLE_CONFIRMATION' ||
      moment.waitingMemberId ||
      confirmedWaitingMoments.current.has(momentId)
    ) return

    confirmedWaitingMoments.current.add(momentId)
    const resolvedQuestion = proposedQuestion?.trim() || moment.question || '刚才提出的问题'
    const acceptance = buildEnvelope({
      ...baseFields(momentId),
      type: 'WAITING_ROLE_ACCEPTED',
      payload: { claimId, question: resolvedQuestion },
    })
    sendReliably(claimantId, acceptance)
    recordEvent('waiting_role_claim_accepted', momentId, { claimId })
  }

  function handleMessage(message: MimosaEnvelope, senderId: string) {
    if (seenMessages.current.has(message.messageId)) return
    seenMessages.current.add(message.messageId)
    const current = stateRef.current
    const transport = transportRef.current

    switch (message.type) {
      case 'OBSERVER_HELLO':
        setKnownObserver(senderId)
        if (current.localRole === 'waiting' && current.activeMoment) {
          sendObserverRoundSummary(current.activeMoment.id, cueCountsFromState(), senderId)
        }
        break
      case 'OBSERVER_ROUND_SUMMARY':
        if (isObserver) setObserverCueCounts(message.payload.cueCounts)
        break
      case 'EXPERIMENT_MARKER':
        if (observerIdsRef.current.has(senderId)) {
          setExperimentMarker(message.payload.marker)
          recordEvent(
            message.payload.marker === 'START' ? 'experiment_started' : 'experiment_ended',
            current.activeMoment?.id,
          )
        }
        break
      case 'OBSERVER_CANCEL_MOMENT':
        if (
          observerIdsRef.current.has(senderId) &&
          current.activeMoment?.id === message.silentMomentId
        ) {
          clearCandidateTimer()
          clearNoResponseTimer()
          clearRecoveryTimer()
          dispatch({ type: 'MOMENT_CLEARED' })
          setCandidateExiting(false)
          setCandidateNotice(locale === 'en' ? 'The researcher dismissed a false trigger. The discussion can continue as usual.' : '研究者已撤销一次误触发，讨论可以照常继续。')
          recordEvent('researcher_cancelled_moment_received', message.silentMomentId)
        }
        break
      case 'STUDY_LOG_REQUEST':
        if (observerIdsRef.current.has(senderId)) {
          respondToLogRequest(message.payload.requestId, senderId)
        }
        break
      case 'STUDY_LOG_RESPONSE_CHUNK':
        if (isObserver) {
          receiveLogChunk(message.payload)
        }
        break
      case 'COORDINATOR_HELLO': {
        if (isObserver || observerIdsRef.current.has(senderId)) break
        const previous = participantClientKeys.current.get(senderId)
        participantClientKeys.current.set(senderId, message.payload.clientKey)
        const coordinatorId = recomputeTechnicalCoordinator()
        if (previous !== message.payload.clientKey) {
          announceCoordinatorIdentity(senderId)
          if (coordinatorId === transport?.getLocalParticipantId() && !current.activeMoment) {
            scheduleAutomaticSilenceCandidate()
          }
        }
        break
      }
      case 'SPEECH_ACTIVITY': {
        if (isObserver || observerIdsRef.current.has(senderId)) break
        const observedAt = Date.parse(message.payload.observedAt)
        processSpeechActivity(
          senderId,
          message.payload.speaking,
          Number.isFinite(observedAt) ? observedAt : Date.now(),
          message.payload.source,
        )
        break
      }
      case 'SILENCE_CANDIDATE_CREATED':
        if (!current.activeMoment) {
          setCandidateExiting(false)
          dispatch({
            type: 'MOMENT_CANDIDATE_CREATED',
            id: message.silentMomentId,
            coordinatorId: senderId,
            question: message.payload.question,
            candidateExpiresAt: message.payload.expiresAt,
          })
          setCandidateNotice('')
          recordEvent('silence_candidate_received', message.silentMomentId, {
            detectedAt: message.payload.detectedAt,
            expiresAt: message.payload.expiresAt,
          })
        }
        break
      case 'SILENCE_CANDIDATE_CANCELLED':
        if (current.activeMoment?.id === message.silentMomentId && current.activeMoment.phase === 'ROLE_CONFIRMATION') {
          clearCandidateTimer()
          pendingWaitingClaimId.current = null
          if (message.payload.reason === 'unclaimed') {
            hasObservedSpeech.current = false
            setSilenceSecondsLeft(null)
            setLocalSpeechState('waiting')
          }
          transitionCandidateOut(
            message.silentMomentId,
            message.payload.reason === 'speech-resumed'
              ? (localeRef.current === 'en' ? 'The conversation has picked up again, so this check-in is stepping back.' : '讨论已经重新接上，这次提示先轻轻退场。')
              : (localeRef.current === 'en' ? 'No one claimed this moment, so the check-in has closed. It can return after the conversation begins again.' : '暂时没有人认领这个时刻，提示已收起；讨论重新开始后，它会再次留意。'),
          )
          recordEvent('silence_candidate_cancelled', message.silentMomentId, {
            reason: message.payload.reason,
          })
        }
        break
      case 'SILENCE_COORDINATOR_CHANGED':
        if (current.activeMoment?.id === message.silentMomentId &&
          current.activeMoment.phase === 'ROLE_CONFIRMATION') {
          dispatch({
            type: 'CANDIDATE_COORDINATOR_CHANGED',
            momentId: message.silentMomentId,
            coordinatorId: senderId,
            candidateExpiresAt: message.payload.expiresAt,
          })
          if (senderId === transport?.getLocalParticipantId()) {
            scheduleCandidateExpiry(message.silentMomentId, message.payload.expiresAt)
          }
          recordEvent('candidate_coordinator_changed', message.silentMomentId)
        }
        break
      case 'SILENT_MOMENT_CREATED':
        if (!current.activeMoment) {
          formalMomentStartedAt.current = Date.now()
          dispatch({
            type: 'MOMENT_CREATED',
            id: message.silentMomentId,
            question: message.payload.question,
            coordinatorId: senderId,
            waitingMemberId: senderId,
            trigger: 'manual',
            localRole: isObserver ? 'dismissed' : 'responding',
            resumedFrom: message.payload.resumedFrom,
          })
          recordEvent('silent_moment_received', message.silentMomentId, { resumed: Boolean(message.payload.resumedFrom) })
          notifyOtherMemberOfWaitingClaim(message.silentMomentId, senderId)
        }
        break
      case 'WAITING_ROLE_CLAIMED':
        if (isObserver) break
        acceptWaitingClaim(
          message.silentMomentId,
          senderId,
          message.payload.claimId,
          message.payload.question,
        )
        break
      case 'WAITING_ROLE_ACCEPTED':
        if (isObserver) break
        if (
          current.activeMoment?.id === message.silentMomentId &&
          current.activeMoment.phase === 'ROLE_CONFIRMATION' &&
          current.localRole === 'waiting' &&
          pendingWaitingClaimId.current === message.payload.claimId
        ) {
          announceWaitingRole(
            message.silentMomentId,
            message.payload.claimId,
            message.payload.question,
          )
        }
        break
      case 'WAITING_ROLE_CONFIRMED': {
        if (current.activeMoment?.id !== message.silentMomentId) return
        if (current.activeMoment.waitingMemberId && current.activeMoment.waitingMemberId !== senderId) return
        pendingWaitingClaimId.current = null
        clearCandidateTimer()
        formalMomentStartedAt.current = Date.now()
        confirmedWaitingMoments.current.add(message.silentMomentId)
        dispatch({
          type: 'WAITING_ROLE_CONFIRMED',
          momentId: message.silentMomentId,
          waitingMemberId: senderId,
          question: message.payload.question,
          isLocalWaitingMember: false,
        })
        if (isObserver) {
          dispatch({ type: 'LOCAL_MOMENT_ROLE_CHANGED', role: 'dismissed' })
        }
        recordEvent('waiting_role_received', message.silentMomentId, {
          claimId: message.payload.claimId,
          waitingEndpointBoundFrom: 'sender',
        })
        notifyOtherMemberOfWaitingClaim(message.silentMomentId, senderId)
        break
      }
      case 'PARTICIPANT_CUE': {
        if (current.localRole !== 'waiting' || current.activeMoment?.id !== message.silentMomentId) return
        clearNoResponseTimer()
        const effect = getCueEffect(message.payload.cue, message.payload.environment)
        setSceneReaction({ id: message.messageId, environment: effect.environment })
        dispatch({ type: 'PRIVATE_CUE_RECEIVED', momentId: message.silentMomentId, senderId, cue: message.payload.cue, environment: message.payload.environment })
        const updatedCues = { ...current.privateCues, [senderId]: message.payload.cue }
        const cueCounts = countParticipantCues(updatedCues)
        sendObserverRoundSummary(message.silentMomentId, cueCounts)
        recordEvent('private_cue_received', message.silentMomentId, { cue: message.payload.cue, environment: effect.environment })
        transport?.sendTo(senderId, buildEnvelope({
          ...baseFields(message.silentMomentId),
          type: 'PARTICIPANT_CUE_ACK',
          payload: { cue: message.payload.cue },
        }))
        transport?.broadcast(buildEnvelope({
          ...baseFields(message.silentMomentId),
          type: 'ENVIRONMENT_STATE',
          payload: { environment: effect.environment, publicCue: effect.feedback },
        }))
        break
      }
      case 'PARTICIPANT_CUE_ACK':
        if (current.localRole === 'responding' && current.activeMoment?.id === message.silentMomentId) {
          setCueAcknowledged(true)
          recordEvent('private_cue_acknowledged', message.silentMomentId, { cue: message.payload.cue })
        }
        break
      case 'ENVIRONMENT_STATE':
        if (current.activeMoment?.id !== message.silentMomentId) return
        clearNoResponseTimer()
        setSceneReaction({ id: message.messageId, environment: message.payload.environment })
        dispatch({ type: 'ENVIRONMENT_RECEIVED', momentId: message.silentMomentId, environment: message.payload.environment, feedback: message.payload.publicCue })
        recordEvent('environment_received', message.silentMomentId, { environment: message.payload.environment })
        break
      case 'CARE_ACTION':
        clearNoResponseTimer()
        dispatch({ type: 'CARE_ACTION_APPLIED', momentId: message.silentMomentId, action: message.payload.action })
        setLastCareAction(message.payload.action)
        recordEvent('care_action_received', message.silentMomentId, { action: message.payload.action })
        break
      case 'PLANT_CLOSING_STARTED':
        dispatch({ type: 'PLANT_CLOSING_STARTED', momentId: message.silentMomentId })
        recordEvent('plant_closing_received', message.silentMomentId)
        break
      case 'MOMENT_ENDED':
        clearRecoveryTimer()
        setRecoverySuggested(false)
        showRoundNotice(message.payload.outcome, message.payload.question)
        dispatch({
          type: 'MOMENT_ENDED',
          momentId: message.silentMomentId,
          question: message.payload.question,
          waitingMemberId: current.activeMoment?.waitingMemberId ?? senderId,
          outcome: message.payload.outcome,
        })
        recordEvent('silent_moment_ended', message.silentMomentId, { outcome: message.payload.outcome })
        break
      case 'STATE_REQUEST': {
        const localId = transport?.getLocalParticipantId()
        const canShare = current.localRole === 'waiting' ||
          (current.activeMoment?.phase === 'ROLE_CONFIRMATION' &&
            current.activeMoment.coordinatorId === localId)
        if (!canShare) return
        const snapshot = toPublicSnapshot(current)
        if (!snapshot) return
        transport?.sendTo(senderId, buildEnvelope({ ...baseFields(snapshot.id), type: 'STATE_SNAPSHOT', payload: snapshot }))
        break
      }
      case 'STATE_SNAPSHOT':
        if (!current.activeMoment) {
          const snapshot = bindSnapshotToSender(message.payload, senderId)
          if (snapshot.phase !== 'ROLE_CONFIRMATION') formalMomentStartedAt.current = Date.now()
          dispatch({
            type: 'SNAPSHOT_RECEIVED',
            snapshot,
            isLocalWaitingMember: !isObserver &&
              transport?.getLocalParticipantId() === snapshot.waitingMemberId,
          })
          if (isObserver) {
            dispatch({ type: 'LOCAL_MOMENT_ROLE_CHANGED', role: 'dismissed' })
          }
          recordEvent('public_snapshot_restored', message.silentMomentId)
          if (snapshot.phase === 'ROLE_CONFIRMATION' && snapshot.candidateExpiresAt) {
            const localId = transport?.getLocalParticipantId()
            const coordinatorPresent = participantsRef.current.some(
              (participant) => participant.id === snapshot.coordinatorId,
            )
            if (snapshot.coordinatorId === localId) {
              scheduleCandidateExpiry(snapshot.id, snapshot.candidateExpiresAt)
            } else if (
              !coordinatorPresent &&
              localId &&
              technicalCoordinatorIdRef.current === localId
            ) {
              dispatch({
                type: 'CANDIDATE_COORDINATOR_CHANGED',
                momentId: snapshot.id,
                coordinatorId: localId,
                candidateExpiresAt: snapshot.candidateExpiresAt,
              })
              broadcastReliably(buildEnvelope({
                ...baseFields(snapshot.id),
                type: 'SILENCE_COORDINATOR_CHANGED',
                payload: { expiresAt: snapshot.candidateExpiresAt },
              }))
              scheduleCandidateExpiry(snapshot.id, snapshot.candidateExpiresAt)
            }
          }
        }
        break
      case 'DEFERRED_STATE_REQUEST': {
        if (current.deferredMoments.length === 0) return
        transport?.sendTo(senderId, buildEnvelope({
          ...baseFields(''),
          type: 'DEFERRED_STATE_SNAPSHOT',
          payload: { moments: current.deferredMoments },
        }))
        break
      }
      case 'DEFERRED_STATE_SNAPSHOT': {
        const merged = [...current.deferredMoments]
        for (const moment of message.payload.moments) {
          if (removedDeferredMomentIdsRef.current.has(moment.id)) continue
          if (!merged.some((existing) => existing.id === moment.id)) merged.push(moment)
        }
        dispatch({ type: 'DEFERRED_MOMENTS_RESTORED', moments: merged })
        recordEvent('deferred_state_restored', undefined, { count: merged.length })
        break
      }
      case 'DEFERRED_MOMENT_REMOVED': {
        const momentId = message.payload.momentId
        removedDeferredMomentIdsRef.current.add(momentId)
        localStorage.setItem(
          `mimosa:deferred-removed:${appId}:${roomName}`,
          JSON.stringify([...removedDeferredMomentIdsRef.current]),
        )
        dispatch({ type: 'DEFERRED_MOMENT_REMOVED', momentId })
        setPendingDeferredRemovalId((currentId) =>
          currentId === momentId ? null : currentId,
        )
        recordEvent('deferred_question_removed_received', momentId)
        break
      }
    }
  }

  async function joinMeeting() {
    if (!appId.trim() || !roomName.trim()) {
      setError(locale === 'en' ? 'Please enter a room ID.' : '请输入本次实验的会议房间名。')
      return
    }
    const parentNode = document.querySelector<HTMLElement>('#jaas-meeting')
    if (!parentNode) return
    roleClaimNotification.current ??= new RoleClaimNotification()
    // Called synchronously from the Join button gesture. Browsers otherwise
    // block sounds that arrive later while this tab is in the background.
    void roleClaimNotification.current.unlock()
    setConnection('connecting')
    setError('')
    const resolvedDisplayName = displayName.trim() || (locale === 'en' ? (isObserver ? 'Research observer' : 'Mimosa participant') : (isObserver ? '研究观察员' : 'Mimosa 参与者'))
    const transport = new JaaSTransport({
      appId: appId.trim(),
      roomName: roomName.trim(),
      displayName: isObserver ? `${locale === 'en' ? 'Observer' : '观察员'} · ${resolvedDisplayName}` : resolvedDisplayName,
      parentNode,
    })
    transport.onMessage(handleMessage)
    transport.onLocalAudioMuteChanged((muted) => {
      localAudioMutedRef.current = muted
      setLocalAudioMuted(muted)
      if (isObserver) {
        stopSpeechSensor()
        return
      }
      if (!muted) {
        if (silenceDetectionEnabledRef.current) void startSpeechSensor()
        return
      }
      const localId = transport.getLocalParticipantId()
      if (!localId) {
        stopSpeechSensor()
        return
      }
      const observedAt = Date.now()
      // Stop the local VAD before publishing the muted participant as quiet.
      // stopSpeechSensor clears any pending silence timer; doing it afterwards
      // used to cancel the timer that processSpeechActivity had just scheduled.
      stopSpeechSensor()
      lastLocalSpeaking.current = false
      setLocalSpeechState('waiting')
      processSpeechActivity(localId, false, observedAt, 'local-vad')
      transport.broadcast(buildEnvelope({
        ...baseFields(''),
        type: 'SPEECH_ACTIVITY',
        payload: {
          speaking: false,
          observedAt: new Date(observedAt).toISOString(),
          source: 'local-vad',
        },
      }))
    })
    knownParticipantIds.current.clear()
    transport.onParticipantsChanged((nextParticipants) => {
      const added = nextParticipants.filter((participant) => !knownParticipantIds.current.has(participant.id))
      knownParticipantIds.current = new Set(nextParticipants.map((participant) => participant.id))
      const presentIds = new Set(nextParticipants.map((participant) => participant.id))
      observerIdsRef.current = new Set(
        [...observerIdsRef.current].filter((participantId) => presentIds.has(participantId)),
      )
      setObserverIds(new Set(observerIdsRef.current))
      const nextStudyParticipants = getStudyParticipants(nextParticipants, observerIdsRef.current)
      participantsRef.current = nextStudyParticipants
      setParticipants(nextParticipants)
      participantActivity.current = pruneParticipantActivity(
        participantActivity.current,
        nextStudyParticipants.map((participant) => participant.id),
      )
      participantClientKeys.current = new Map(
        [...participantClientKeys.current].filter(([endpointId]) => presentIds.has(endpointId)),
      )

      const localId = transport.getLocalParticipantId()
      if (isObserver) {
        if (localId) setKnownObserver(localId)
        for (const participant of added) {
          if (participant.id !== localId) announceObserverIdentity(participant.id)
        }
        return
      }
      const nextCoordinatorId = recomputeTechnicalCoordinator()
      for (const participant of added) {
        if (participant.id !== localId) announceCoordinatorIdentity(participant.id)
      }

      const current = stateRef.current
      const moment = current.activeMoment
      if (localId && moment?.phase === 'ROLE_CONFIRMATION') {
        const coordinatorStillPresent = nextParticipants.some(
          (participant) => participant.id === moment.coordinatorId,
        )
        if (!coordinatorStillPresent && nextCoordinatorId === localId) {
          const expiresAt = moment.candidateExpiresAt ??
            new Date(Date.now() + ROLE_CONFIRMATION_WINDOW_MS).toISOString()
          dispatch({
            type: 'CANDIDATE_COORDINATOR_CHANGED',
            momentId: moment.id,
            coordinatorId: localId,
            candidateExpiresAt: expiresAt,
          })
          broadcastReliably(buildEnvelope({
            ...baseFields(moment.id),
            type: 'SILENCE_COORDINATOR_CHANGED',
            payload: { expiresAt },
          }))
          scheduleCandidateExpiry(moment.id, expiresAt)
        }
      }
      if (
        localId &&
        moment?.waitingMemberId &&
        !nextParticipants.some((participant) => participant.id === moment.waitingMemberId) &&
        nextCoordinatorId === localId
      ) {
        recordEvent('waiting_member_left', moment.id)
        finishMoment('RESOLVED')
      }
      if (nextCoordinatorId === localId && !moment) scheduleAutomaticSilenceCandidate()

      const snapshot = (
        current.localRole === 'waiting' ||
        (current.activeMoment?.phase === 'ROLE_CONFIRMATION' &&
          current.activeMoment.coordinatorId === localId)
      )
        ? toPublicSnapshot(current)
        : null
      if (!snapshot || !localId) return
      for (const participant of added) {
        if (participant.id === localId) continue
        if (current.deferredMoments.length > 0) {
          transport.sendTo(participant.id, createEnvelope({
            roomId: `${appId.trim()}/${roomName.trim()}`,
            silentMomentId: '',
            senderId: localId,
            type: 'DEFERRED_STATE_SNAPSHOT',
            payload: { moments: current.deferredMoments },
          }))
        }
        const sendSnapshot = () => transport.sendTo(participant.id, createEnvelope({
            roomId: `${appId.trim()}/${roomName.trim()}`,
            silentMomentId: snapshot.id,
            senderId: localId,
            type: 'STATE_SNAPSHOT',
            payload: snapshot,
          }))
        sendSnapshot()
        window.setTimeout(sendSnapshot, 900)
        window.setTimeout(sendSnapshot, 2_200)
      }
    })
    transportRef.current = transport
    try {
      await transport.connect()
      setConnection('connected')
      recordEvent('meeting_connected')
      try {
        const removedStored = localStorage.getItem(
          `mimosa:deferred-removed:${appId.trim()}:${roomName.trim()}`,
        )
        const removedParsed = removedStored ? JSON.parse(removedStored) : []
        removedDeferredMomentIdsRef.current = new Set(
          Array.isArray(removedParsed)
            ? removedParsed.filter((value): value is string => typeof value === 'string')
            : [],
        )
        const stored = localStorage.getItem(`mimosa:deferred:${appId.trim()}:${roomName.trim()}`)
        const parsed = stored ? JSON.parse(stored) : []
        if (Array.isArray(parsed)) {
          dispatch({
            type: 'DEFERRED_MOMENTS_RESTORED',
            moments: parsed.filter(
              (moment) => !removedDeferredMomentIdsRef.current.has(moment?.id),
            ),
          })
        }
      } catch {
        recordEvent('deferred_storage_restore_failed')
      } finally {
        setDeferredStorageReady(true)
      }
      const joinedMuted = await transport.getLocalAudioMuted()
      localAudioMutedRef.current = joinedMuted
      setLocalAudioMuted(joinedMuted)
      if (isObserver) {
        const localId = transport.getLocalParticipantId()
        if (localId) setKnownObserver(localId)
        announceObserverIdentity()
        stopSpeechSensor()
      } else {
        recomputeTechnicalCoordinator()
        announceCoordinatorIdentity()
        if (silenceDetectionEnabledRef.current && !joinedMuted) void startSpeechSensor()
      }
      const requestSnapshot = () => {
        transport.broadcast(buildEnvelope({ ...baseFields(''), type: 'STATE_REQUEST', payload: {} }))
        transport.broadcast(buildEnvelope({ ...baseFields(''), type: 'DEFERRED_STATE_REQUEST', payload: {} }))
      }
      window.setTimeout(requestSnapshot, 700)
      window.setTimeout(requestSnapshot, 1_800)
      window.setTimeout(requestSnapshot, 3_500)
    } catch (caught) {
      transport.disconnect()
      transportRef.current = null
      setConnection('error')
      setError(caught instanceof Error ? caught.message : (locale === 'en' ? 'Unable to connect to the meeting.' : '会议连接失败'))
    }
  }

  function removeDeferredMoment(momentId: string) {
    removedDeferredMomentIdsRef.current.add(momentId)
    localStorage.setItem(
      `mimosa:deferred-removed:${appId}:${roomName}`,
      JSON.stringify([...removedDeferredMomentIdsRef.current]),
    )
    dispatch({ type: 'DEFERRED_MOMENT_REMOVED', momentId })
    setPendingDeferredRemovalId(null)
    setDeferredDrafts((drafts) => {
      const next = { ...drafts }
      delete next[momentId]
      return next
    })
    broadcastReliably(buildEnvelope({
      ...baseFields(momentId),
      type: 'DEFERRED_MOMENT_REMOVED',
      payload: { momentId },
    }))
    recordEvent('deferred_question_removed', momentId, {
      scope: 'shared-room',
    })
  }

  function createMoment(questionOverride?: string, resumedFrom?: string) {
    if (isObserver) return
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    const resolvedQuestion = (questionOverride ?? question).trim()
    if (!transport || !localId || !resolvedQuestion) return
    setRoundNotice(null)
    setNoticeDismissing(false)
    setSeedTransfer(null)
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current)
    if (seedTransferTimer.current) window.clearTimeout(seedTransferTimer.current)
    if (seedTransferClearTimer.current) window.clearTimeout(seedTransferClearTimer.current)
    const id = crypto.randomUUID()
    formalMomentStartedAt.current = Date.now()
    dispatch({
      type: 'MOMENT_CREATED',
      id,
      question: resolvedQuestion,
      coordinatorId: localId,
      waitingMemberId: localId,
      trigger: 'manual',
      localRole: 'waiting',
      resumedFrom,
    })
    if (resumedFrom) {
      setDeferredDrafts((drafts) => {
        const nextDrafts = { ...drafts }
        delete nextDrafts[resumedFrom]
        return nextDrafts
      })
    }
    transport.broadcast(buildEnvelope({
      ...baseFields(id),
      type: 'SILENT_MOMENT_CREATED',
      payload: {
        question: resolvedQuestion,
        resumedFrom,
        trigger: 'manual',
      },
    }))
    scheduleProgressiveClosure(id)
    recordEvent(resumedFrom ? 'deferred_question_resumed' : 'silent_moment_created', id, { resumedFrom })
  }

  function createSilenceCandidate(source: 'automatic' | 'manual' = 'manual') {
    if (isObserver) return
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    if (!transport || !localId || stateRef.current.activeMoment) return
    clearSilenceTimer()
    clearCandidateTimer()
    const id = crypto.randomUUID()
    const proposedQuestion = candidateQuestion.trim()
    const detectedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + ROLE_CONFIRMATION_WINDOW_MS).toISOString()
    confirmedWaitingMoments.current.delete(id)
    setCandidateNotice('')
    dispatch({
      type: 'MOMENT_CANDIDATE_CREATED',
      id,
      coordinatorId: localId,
      question: proposedQuestion || undefined,
      candidateExpiresAt: expiresAt,
    })
    transport.broadcast(buildEnvelope({
      ...baseFields(id),
      type: 'SILENCE_CANDIDATE_CREATED',
      payload: {
        ...(proposedQuestion ? { question: proposedQuestion } : {}),
        detectedAt,
        expiresAt,
      },
    }))
    scheduleCandidateExpiry(id, expiresAt)
    recordEvent('silence_candidate_created', id, {
      source,
      thresholdMs: source === 'automatic' ? ROOM_SILENCE_THRESHOLD_MS : undefined,
      roleWindowMs: ROLE_CONFIRMATION_WINDOW_MS,
    })
  }

  function cancelSilenceCandidate(
    reason: 'unclaimed' | 'speech-resumed' | 'coordinator-left',
  ) {
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    const moment = stateRef.current.activeMoment
    if (
      !transport ||
      !localId ||
      !moment ||
      moment.phase !== 'ROLE_CONFIRMATION' ||
      (moment.coordinatorId !== localId && technicalCoordinatorIdRef.current !== localId)
    ) return

    clearCandidateTimer()
    if (candidateExitTimer.current) return
    pendingWaitingClaimId.current = null
    const cancellation = buildEnvelope({
      ...baseFields(moment.id),
      type: 'SILENCE_CANDIDATE_CANCELLED',
      payload: { reason },
    })
    broadcastReliably(cancellation)
    if (reason === 'unclaimed') {
      hasObservedSpeech.current = false
      setSilenceSecondsLeft(null)
      setLocalSpeechState('waiting')
    }
    transitionCandidateOut(
      moment.id,
      reason === 'speech-resumed'
        ? (localeRef.current === 'en' ? 'The conversation has picked up again, so this check-in is stepping back.' : '讨论已经重新接上，这次提示先轻轻退场。')
        : (localeRef.current === 'en' ? 'No one claimed this moment, so the check-in has closed. It can return after the conversation begins again.' : '暂时没有人认领这个时刻，提示已收起；讨论重新开始后，它会再次留意。'),
    )
    recordEvent('silence_candidate_cancelled', moment.id, {
      source: 'technical-coordinator',
      reason,
    })
  }

  function chooseMomentRole(role: Exclude<MomentRole, 'unassigned'>) {
    if (isObserver) return
    const transport = transportRef.current
    const localId = transport?.getLocalParticipantId()
    const moment = stateRef.current.activeMoment
    if (!transport || !localId || !moment || moment.phase !== 'ROLE_CONFIRMATION') return

    if (role === 'waiting') {
      const claimId = crypto.randomUUID()
      pendingWaitingClaimId.current = claimId
      dispatch({ type: 'LOCAL_MOMENT_ROLE_CHANGED', role: 'waiting' })
      if (moment.coordinatorId === localId) {
        if (confirmedWaitingMoments.current.has(moment.id)) return
        confirmedWaitingMoments.current.add(moment.id)
        announceWaitingRole(moment.id, claimId, candidateQuestion)
      } else {
        const claim = buildEnvelope({
          ...baseFields(moment.id),
          type: 'WAITING_ROLE_CLAIMED',
          payload: {
            claimId,
            ...(candidateQuestion.trim() ? { question: candidateQuestion.trim() } : {}),
          },
        })
        sendReliably(moment.coordinatorId, claim)
        recordEvent('waiting_role_claim_sent', moment.id, { claimId })
      }
      return
    }

    dispatch({ type: 'LOCAL_MOMENT_ROLE_CHANGED', role })
    recordEvent('local_moment_role_selected', moment.id, { role })
  }

  function chooseCue(cue: ParticipantCue) {
    if (isObserver) return
    if (cue === 'SOCIAL_PRESSURE') {
      sendCue(cue, 'cloudy')
      return
    }
    setPendingCue(cue)
  }

  function sendCue(cue: ParticipantCue, environment: EnvironmentState) {
    if (isObserver) return
    const transport = transportRef.current
    const moment = state.activeMoment
    if (!transport || !moment || !moment.waitingMemberId || state.localRole !== 'responding' || sentCue) return
    transport.sendTo(moment.waitingMemberId, buildEnvelope({ ...baseFields(moment.id), type: 'PARTICIPANT_CUE', payload: { cue, environment } }))
    setSentCue(cue)
    setCueAcknowledged(false)
    setPendingCue(null)
    recordEvent('private_cue_sent', moment.id, { cue, environment })
  }

  function beginSeedTransfer() {
    if (seedTransferTimer.current) window.clearTimeout(seedTransferTimer.current)
    setSeedTransfer({ stage: 'preparing' })
    seedTransferTimer.current = window.setTimeout(() => {
      const source = document.querySelector<SVGGraphicsElement>('.mimosa-scene .seed')
      const target = seedBankTargetRef.current
      if (!source || !target) {
        setSeedTransfer({ stage: 'arrived' })
        return
      }
      const sourceRect = source.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const startX = sourceRect.left + sourceRect.width / 2
      const startY = sourceRect.top + sourceRect.height / 2
      const endX = targetRect.left + targetRect.width / 2
      const endY = targetRect.top + targetRect.height / 2
      const deltaX = endX - startX
      const deltaY = endY - startY
      const arcLift = Math.min(72, Math.abs(deltaX) * .12 + 28)
      setSeedTransfer({
        stage: 'flying',
        style: {
          left: `${startX - 8}px`,
          top: `${startY - 11}px`,
          '--seed-flight-x': `${deltaX}px`,
          '--seed-flight-y': `${deltaY}px`,
          '--seed-flight-mid-x': `${deltaX * .48}px`,
          '--seed-flight-mid-y': `${deltaY * .38 - arcLift}px`,
        } as CSSProperties,
      })
    }, 2_650)
  }

  function applyCare(action: CareAction) {
    if (isObserver) return
    const transport = transportRef.current
    const current = stateRef.current
    const moment = current.activeMoment
    if (!transport || !moment || current.localRole !== 'waiting') return
    clearNoResponseTimer()
    const effect = getCareEffect(action)
    setLastCareAction(action)
    setRecoverySuggested(false)
    clearRecoveryTimer()
    dispatch({ type: 'CARE_ACTION_APPLIED', momentId: moment.id, action })
    transport.broadcast(buildEnvelope({ ...baseFields(moment.id), type: 'CARE_ACTION', payload: { action, plant: effect.plant, feedback: effect.feedback } }))
    recordEvent('care_action_sent', moment.id, { action })
    if (action === 'DEFER' || action === 'RESOLVE') {
      setEnding(true)
      const outcome: SilentMomentOutcome = action === 'DEFER' ? 'DEFERRED' : 'RESOLVED'
      if (action === 'DEFER') beginSeedTransfer()
      const settleDuration = action === 'DEFER' ? 4_600 : 5_850
      endingTimer.current = window.setTimeout(() => finishMoment(outcome), settleDuration)
    }
  }

  function finishMoment(outcome: SilentMomentOutcome) {
    if (isObserver) return
    const transport = transportRef.current
    const moment = stateRef.current.activeMoment
    if (!transport || !moment || !moment.waitingMemberId) return
    clearNoResponseTimer()
    clearRecoveryTimer()
    setRecoverySuggested(false)
    const message = buildEnvelope({
      ...baseFields(moment.id),
      type: 'MOMENT_ENDED',
      payload: {
        outcome,
        question: moment.question,
      },
    })
    transport.broadcast(message)
    showRoundNotice(outcome, moment.question)
    dispatch({
      type: 'MOMENT_ENDED',
      momentId: moment.id,
      question: moment.question,
      waitingMemberId: moment.waitingMemberId,
      outcome,
    })
    recordEvent('silent_moment_ended', moment.id, { outcome })
    setEnding(false)
    if (outcome === 'DEFERRED') {
      setSeedTransfer({ stage: 'arrived' })
      if (seedTransferClearTimer.current) window.clearTimeout(seedTransferClearTimer.current)
      seedTransferClearTimer.current = window.setTimeout(() => setSeedTransfer(null), 1_250)
    }
  }

  function downloadStudyLog() {
    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      study: {
        ...studyIdentity,
        roomName,
        protocolVersion: 14,
        settings: {
          roomSilenceThresholdMs: ROOM_SILENCE_THRESHOLD_MS,
          roleConfirmationWindowMs: ROLE_CONFIRMATION_WINDOW_MS,
          plantCloseStartMs: PLANT_CLOSE_START_DELAY_MS,
          responseCountMode: RESPONSE_COUNT_MODE,
          sensingMode: silenceDetectionEnabled ? 'local-vad' : 'manual-fallback',
        },
      },
      events: studyEvents,
    }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `mimosa-${roomName}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function clearStudyLog() {
    clearStudyEvents(localStorage, studyIdentity.sessionId)
    setStudyEvents([])
  }

  const connected = connection === 'connected'
  const active = Boolean(state.activeMoment)
  const phase = state.activeMoment?.phase
  const roleConfirmation = phase === 'ROLE_CONFIRMATION'
  const plantActive = active && !roleConfirmation
  const settling = ending || phase === 'DEFERRED' || phase === 'RESOLVED'
  const phaseLabel = settling
    ? t('正在收束')
    : roleConfirmation
      ? t('等待角色认领')
    : phase === 'RELIEVED'
      ? t('正在缓和')
      : active
        ? t('等待回应')
        : t('尚未开始')
  const journeyStep = !plantActive ? 0 : phase === 'SENSITIVE_SILENCE' && state.environments.length === 0 ? 1 : phase === 'SENSITIVE_SILENCE' ? 2 : 3
  const visualPreview = getVisualPreview()
  const breezeActive = visualPreview?.breeze ?? false
  const localParticipantId = transportRef.current?.getLocalParticipantId() ?? null
  const deferredMoments = state.deferredMoments
  const privateCueCount = Object.keys(state.privateCues).length
  const localRoleLabel = isObserver
    ? t('研究观察')
    : !active
    ? t('普通成员')
    : state.localRole === 'waiting'
      ? t('正在等待回应')
      : state.localRole === 'responding'
        ? t('可能回应')
        : state.localRole === 'dismissed'
          ? t('本轮不参与')
          : t('尚未认领')

  return (
    <main className={`app-shell ${connected ? 'is-connected' : 'is-welcome'}`}>
      {seedTransfer?.stage === 'flying' && (
        <div
          className="seed-flight"
          style={seedTransfer.style}
          aria-hidden="true"
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) setSeedTransfer({ stage: 'arrived' })
          }}
        >
          <span />
          <i />
        </div>
      )}
      {seedTransfer && (
        <div ref={seedBankTargetRef} className={`seed-transfer-dock seed-transfer-dock--${seedTransfer.stage}`} aria-hidden="true">
          <i />
          <span>{t('种子暂存区')}</span>
        </div>
      )}
      <a className="skip-link" href="#meeting-main">{locale === 'en' ? 'Skip to meeting and interaction area' : '跳到会议与互动区'}</a>
      <header className="app-header">
        <div className="brand-lockup"><span className="brand-seed" aria-hidden="true" /><div><p className="product-name">Mimosa</p><p className="product-purpose">{t('让沉默成为彼此照顾的入口')}</p></div></div>
        <div className="header-status-group">
          <div className="language-switch" role="group" aria-label="Language">
            <button type="button" className={locale === 'zh' ? 'is-active' : ''} aria-pressed={locale === 'zh'} onClick={() => setLocale('zh')}>中文</button>
            <button type="button" className={locale === 'en' ? 'is-active' : ''} aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>EN</button>
          </div>
          {connected && <div className={`role-pill role-pill--${isObserver ? 'observer' : state.localRole}`}>{localRoleLabel}</div>}
          <div className={`connection-pill connection-pill--${connection}`} role="status" aria-live="polite"><span />{connection === 'connected' ? locale === 'en' ? `${studyParticipants.length} participants${observerIds.size > 0 ? ` · ${observerIds.size} observers` : ''}` : `${studyParticipants.length} 名参与者${observerIds.size > 0 ? ` · ${observerIds.size} 名观察员` : ''}` : connection === 'connecting' ? t('正在进入花园') : t('尚未加入')}</div>
        </div>
      </header>

      {!connected && (
        <section className="join-panel" aria-label={locale === 'en' ? 'Join meeting' : '加入会议'}>
          <div><h1>{t('先进入同一个会议房间')}</h1><p>{t('输入共同约定的房间名和显示名，即可进入会议。')}</p></div>
          <div className="join-fields join-fields--configured">
            <label className="join-field join-field--room">{t('房间名')}<input value={roomName} placeholder={locale === 'en' ? 'e.g. group-a-01' : '例如：group-a-01'} autoComplete="off" onChange={(event) => setRoomName(event.target.value)} /><small>{locale === 'en' ? 'Different IDs create separate rooms for concurrent study groups.' : '不同编号会进入彼此独立的会议，适合多组实验同时进行。'}</small></label>
            <label className="join-field join-field--name">{t('显示名')}<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
            <button className="primary-action join-action" type="button" onClick={joinMeeting} disabled={connection === 'connecting' || !roomName.trim()}>{connection === 'connecting' ? t('正在连接…') : t('进入会议')}</button>
          </div>
          {error && <p className="error-message" role="alert">{error}</p>}
        </section>
      )}

      <section className="meeting-layout" id="meeting-main" tabIndex={-1}>
        <div className="meeting-stage">
          <div id="jaas-meeting" className="meeting-surface"><div className="meeting-placeholder"><div className="placeholder-garden" aria-hidden="true"><span /><i /><i /></div><span>{t('共享会议花园')}</span><strong>{t('加入后，彼此的画面会在这里展开')}</strong><p>{t('幼苗会在右下角等候；进入沉默时刻后，它才生长为含羞草。')}</p></div></div>
          <MimosaScene environments={visualPreview?.environments ?? state.environments} plant={visualPreview?.plant ?? state.plant} active={visualPreview?.active ?? plantActive} resumed={Boolean(state.activeMoment?.resumedFrom)} reaction={sceneReaction} breeze={breezeActive} alive={visualPreview?.active ?? plantActive} locale={locale} />
        </div>

        <aside className={`interaction-rail interaction-rail--${state.localRole} ${active ? 'is-active' : ''} ${candidateExiting ? 'is-candidate-exiting' : ''} ${!connected ? 'is-disconnected' : ''}`} aria-label={locale === 'en' ? 'Mimosa interaction area' : 'Mimosa 互动区'}>
          {!connected && (
            <section className="rail-welcome">
              <div className="rail-welcome-mark" aria-hidden="true"><span /><i /><i /></div>
              <span className="eyebrow">{t('开始之前')}</span>
              <h2>{t('让每个人先进入同一个房间')}</h2>
              <p>{t('入会后，每轮沉默都由成员自己确认当下需要的位置。')}</p>
              <ol>
                <li><span>1</span><div><strong>{t('以普通成员进入')}</strong><small>{t('每轮角色都在沉默发生后由成员自己认领')}</small></div></li>
                <li><span>2</span><div><strong>{t('共同进入会议')}</strong><small>{t('音视频仍由 JaaS 提供')}</small></div></li>
                <li><span>3</span><div><strong>{t('让沉默被温和接住')}</strong><small>{t('每份回应都会轻轻落进同一座花园')}</small></div></li>
              </ol>
            </section>
          )}
          {isObserver && connected && (
            <section className="observer-dashboard">
              <div className="section-heading">
              <span className="eyebrow">{locale === 'en' ? 'Research observer · non-participating' : '研究观察端 · 不参与互动'}</span>
              <span className={`phase-dot ${active ? 'is-active' : ''}`}>{experimentMarker === 'START' ? (locale === 'en' ? 'Study in progress' : '实验进行中') : experimentMarker === 'END' ? (locale === 'en' ? 'Study ended' : '实验已结束') : (locale === 'en' ? 'Awaiting study marker' : '等待实验标记')}</span>
              </div>
              <h2>{active ? state.activeMoment?.question : (locale === 'en' ? 'No active Mimosa moment' : '当前没有进行中的 Mimosa 时刻')}</h2>
              <p>{locale === 'en' ? 'Observers are excluded from participant counts, role selection, and silence sensing.' : '观察员不计入参与人数、不参与角色认领，也不会影响沉默检测。'}</p>
              <dl className="observer-metrics">
                <div><dt>{locale === 'en' ? 'Participants' : '实验参与者'}</dt><dd>{studyParticipants.length}</dd></div>
                <div><dt>{locale === 'en' ? 'Anonymous responses' : '匿名回应'}</dt><dd>{Object.values(observerCueCounts).reduce((sum, count) => sum + count, 0)}</dd></div>
                <div><dt>{locale === 'en' ? 'Need time' : '需要时间'}</dt><dd>{observerCueCounts.NEED_TIME}</dd></div>
                <div><dt>{locale === 'en' ? 'Checking' : '正在确认'}</dt><dd>{observerCueCounts.CHECKING}</dd></div>
                <div><dt>{locale === 'en' ? 'Speaking difficulty' : '社交压力'}</dt><dd>{observerCueCounts.SOCIAL_PRESSURE}</dd></div>
              </dl>
              <div className="observer-actions">
                <button type="button" onClick={() => sendExperimentMarker('START')}>{locale === 'en' ? 'Mark study start' : '标记实验开始'}</button>
                <button type="button" onClick={() => sendExperimentMarker('END')}>{locale === 'en' ? 'Mark study end' : '标记实验结束'}</button>
                <button type="button" disabled={!active} onClick={cancelFalsePositiveMoment}>{locale === 'en' ? 'Dismiss false trigger' : '撤销本次误触发'}</button>
                <button type="button" onClick={requestParticipantLogs}>{locale === 'en' ? 'Collect participant logs' : '向参与者收集日志'}</button>
                <button type="button" disabled={Object.keys(observerLogs).length === 0} onClick={downloadAggregatedLogs}>
                  {locale === 'en' ? 'Download combined logs' : '下载汇总日志'}（{Object.keys(observerLogs).length}/{studyParticipants.length}）
                </button>
              </div>
            </section>
          )}
          {!isObserver && <section className={`moment-panel ${active ? 'is-active' : ''} ${roleConfirmation ? 'is-role-confirmation' : ''} ${settling ? 'is-ending' : ''}`}>
            <div className="section-heading"><span className="eyebrow">{t('当前沉默时刻')}</span><span className={`phase-dot ${active ? 'is-active' : ''} ${settling ? 'is-ending' : ''}`}>{phaseLabel}</span></div>
            {!active ? (
              <div className="moment-entry">
                <label className="question-field">{t('我正在等待回应的问题')}<textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={3} /></label>
                <button className="primary-action" type="button" onClick={() => createMoment()} disabled={!connected}>{t('标记为开放问题')}</button>
                {silenceDetectionEnabled && connected && (
                  <div className={`sensing-status sensing-status--${sensorStatus} sensing-status--${localSpeechState}`} role="status" aria-live="polite">
                    <span className="sensing-status__pulse" aria-hidden="true" />
                    <div>
                      <strong>
                        {sensorStatus === 'requesting'
                          ? t('正在等待麦克风权限')
                          : localAudioMuted
                              ? t('已闭麦 · 当前没有语音输入')
                            : sensorStatus !== 'listening'
                              ? t('自动感知尚未就绪')
                              : localSpeechState === 'speaking'
                              ? t('已检测到发言')
                              : silenceSecondsLeft !== null
                                ? t('房间暂时安静')
                                : t('等待下一次发言')}
                      </strong>
                    </div>
                    {sensorStatus !== 'listening' && sensorStatus !== 'requesting' && (
                      <button className="sensing-status__retry" type="button" onClick={() => void startSpeechSensor()}>
                        {t('重新启用')}
                      </button>
                    )}
                  </div>
                )}
                {candidateNotice && <p className="candidate-exit-notice" role="status">{candidateNotice}</p>}
              </div>
            ) : (
              <>
                <h1>{roleConfirmation ? t('这段沉默需要被接住吗？') : state.activeMoment?.question}</h1>
                {!roleConfirmation && state.publicFeedbacks.length > 0 && <ul className="feedback-list" role="status" aria-live="polite">{state.publicFeedbacks.map((feedback) => <li key={feedback}>{t(feedback)}</li>)}</ul>}
              </>
            )}
            {state.activeMoment?.resumedFrom && <p className="resumed-note"><span aria-hidden="true">◇</span>{t('这颗种子已被重新带回讨论')}</p>}
            {plantActive && (
              <ol className="moment-journey" aria-label={locale === 'en' ? 'Current interaction progress' : '本轮互动进度'}>
                {[state.activeMoment?.resumedFrom ? t('种子被带回') : t('问题被看见'), t('回应轻轻抵达'), t('提问者温柔接住')].map((label, index) => {
                  const step = index + 1
                  return <li key={label} className={step < journeyStep ? 'is-complete' : step === journeyStep ? 'is-current' : ''} aria-current={step === journeyStep ? 'step' : undefined}><span aria-hidden="true">{step < journeyStep ? '✓' : step}</span>{label}</li>
                })}
              </ol>
            )}
            <dl className="state-legend"><div><dt>{t('花园此刻')}</dt><dd>{getEnvironmentSceneCopy(state.environments, locale).label}</dd></div><div><dt>{t('叶片')}</dt><dd>{t(plantLabels[state.plant])}</dd></div></dl>
          </section>}

          {roundNotice && !active && (
            <section className={`round-outcome round-outcome--${roundNotice.outcome.toLowerCase()} ${noticeDismissing ? 'is-leaving' : ''}`} role="status" aria-live="polite">
              <span className="round-outcome-mark" aria-hidden="true">{roundNotice.outcome === 'DEFERRED' ? '◇' : '✓'}</span>
              <div><strong>{roundNotice.outcome === 'DEFERRED' ? t('问题已经化作种子') : t('这一轮已经温和收束')}</strong><p className="round-outcome-question">“{roundNotice.question}”</p><p>{roundNotice.outcome === 'DEFERRED' ? t('它已进入暂存区，可以编辑后再次带回讨论。') : t('讨论恢复流动，现在可以自然进入下一个问题。')}</p></div>
              <button type="button" aria-label={locale === 'en' ? 'Dismiss result' : '关闭本轮结果提示'} onClick={dismissRoundNotice}>×</button>
            </section>
          )}

          {!isObserver && roleConfirmation && (
            <section className="action-panel role-claim-panel">
              <span className="eyebrow">{t('私密确认 · 暂不推断角色')}</span>
              <h2>{t('选择最接近你此刻需要的位置')}</h2>
              <p className="role-claim-intro">{t('这份选择只用于建立本轮互动。“这次我先不参与”只会收起你自己的入口，不会结束其他成员的提示。')}</p>
              <label className="candidate-question-field">
                {t('如果你正在等回应，可以补一句问题摘要（可选）')}
                <input value={candidateQuestion} onChange={(event) => setCandidateQuestion(event.target.value)} placeholder={locale === 'en' ? 'e.g. What risks might this proposal involve?' : '例如：刚才的方案还有哪些风险？'} />
              </label>
              <div className="role-claim-grid">
                <button className={state.localRole === 'waiting' ? 'is-selected' : ''} type="button" disabled={state.localRole === 'waiting'} onClick={() => chooseMomentRole('waiting')}>
                  <strong>{t('我正在等待回应')}</strong><small>{t('由我接收匿名线索并照顾讨论节奏')}</small>
                </button>
                <button className={state.localRole === 'responding' ? 'is-selected' : ''} type="button" onClick={() => chooseMomentRole('responding')}>
                  <strong>{t('我可能会回应')}</strong><small>{t('等问题被认领后，再决定是否送出线索')}</small>
                </button>
                <button className={state.localRole === 'dismissed' ? 'is-selected' : ''} type="button" onClick={() => chooseMomentRole('dismissed')}>
                  <strong>{t('这次我先不参与')}</strong><small>{t('只收起我的入口，不影响其他成员继续选择')}</small>
                </button>
              </div>
              {state.localRole === 'waiting' && <p className="role-claim-status" role="status">{t('正在确认这次认领；确认后含羞草才会生长。')}</p>}
              {state.localRole === 'responding' && <p className="role-claim-status" role="status">{t('已选择“可能回应”，正在等待有人认领问题。')}</p>}
              {state.localRole === 'dismissed' && <p className="role-claim-status" role="status">{t('你的入口已暂时收起；其他成员仍可认领或回应。')}</p>}
              <p className="role-window-note">{t('若无人认领，提示会在约 12 秒后自然收起；有人重新开口时也会自动退场。')}</p>
            </section>
          )}

          {!isObserver && plantActive && state.localRole === 'unassigned' && (
            <section className="action-panel role-followup-panel">
              <span className="eyebrow">{t('问题已经被认领')}</span>
              <h2>{t('你可能会回应这次问题吗？')}</h2>
              <div className="role-followup-actions">
                <button type="button" onClick={() => dispatch({ type: 'LOCAL_MOMENT_ROLE_CHANGED', role: 'responding' })}>{t('我可能会回应')}</button>
                <button type="button" onClick={() => dispatch({ type: 'LOCAL_MOMENT_ROLE_CHANGED', role: 'dismissed' })}>{t('暂时不需要')}</button>
              </div>
            </section>
          )}

          {!isObserver && plantActive && state.localRole === 'dismissed' && (
            <section className="action-panel dismissed-panel">
              <span className="eyebrow">{t('本轮已安静收起')}</span>
              <p>{t('你仍然可以正常听和发言；如果改变主意，也可以重新加入轻量回应。')}</p>
              <button className="secondary-action" type="button" onClick={() => dispatch({ type: 'LOCAL_MOMENT_ROLE_CHANGED', role: 'responding' })}>{t('我想回应了')}</button>
            </section>
          )}

          {!isObserver && plantActive && state.localRole === 'responding' && (
            <section className="action-panel participant-panel">
              <span className="eyebrow">{t('匿名回应 · 照料花园')}</span><h2>{t('不用立刻开口，也可以让房间知道你仍在回应')}</h2>
              <div className="cue-grid">
                {(Object.keys(cueLabels) as ParticipantCue[]).map((cue) => <button key={cue} className={`cue-card cue-card--${cue.toLowerCase()} ${sentCue === cue || pendingCue === cue ? 'is-selected' : ''}`} type="button" aria-pressed={sentCue === cue || pendingCue === cue} disabled={!connected || !active || Boolean(sentCue)} onClick={() => chooseCue(cue)}><span className="cue-icon"><CueIcon cue={cue} /></span><strong>{t(cueLabels[cue].label)}</strong><small>{t(cueLabels[cue].detail)}</small></button>)}
              </div>
              {(pendingCue || sentCue) && (
                <div className={`participant-response-stage ${sentCue ? 'is-delivered' : 'is-choosing'}`}>
                  {pendingCue && pendingCue !== 'SOCIAL_PRESSURE' && !sentCue && (
                    <div className="environment-choice" role="group" aria-label={locale === 'en' ? 'Choose a way to care for the shared environment' : '选择一种照料方式'}>
                      <div><span className="eyebrow">{t('让这份回应轻轻抵达')}</span><p>{t('送去一点阳光，或为含羞草浇水。提问者只会看到回应，不会知道是谁。')}</p></div>
                      <button type="button" onClick={() => sendCue(pendingCue, 'sunlight')}><EnvironmentActionIcon environment="sunlight" /><span><strong>{t('洒下一点阳光')}</strong><small>{t('给等待多一点温度')}</small></span></button>
                      <button type="button" onClick={() => sendCue(pendingCue, 'watering')}><EnvironmentActionIcon environment="watering" /><span><strong>{t('轻轻浇水')}</strong><small>{t('让回应继续生长')}</small></span></button>
                      <button className="text-action" type="button" onClick={() => setPendingCue(null)}>{t('返回重选')}</button>
                    </div>
                  )}
                  {sentCue && <p className={`private-confirmation ${cueAcknowledged ? 'is-confirmed' : 'is-pending'}`} role="status" aria-live="polite" aria-busy={!cueAcknowledged}>{cueAcknowledged ? t('回应已送到。提问者不会看到你的名字。') : t('正在轻轻送出这份回应…')}</p>}
                </div>
              )}
            </section>
          )}

          {!isObserver && plantActive && state.localRole === 'waiting' && (
            <section className="action-panel questioner-panel">
              <span className="eyebrow">{t('关怀回应 · 接住此刻')}</span><h2>{t('选择一种推进方式，让叶片替你表达')}</h2>
              <div className="care-grid">{(['WAIT', 'OPEN_TO_ALL', 'DEFER'] as CareAction[]).map((action) => <button key={action} className={`care-card care-card--${action.toLowerCase()} ${lastCareAction === action ? 'is-selected' : ''}`} type="button" aria-pressed={lastCareAction === action} disabled={!connected || !active || ending} onClick={() => applyCare(action)}><span className="care-icon"><CareIcon action={action} /></span><span><strong>{t(careLabels[action].label)}</strong><small>{t(careLabels[action].detail)}</small></span></button>)}</div>
              {lastCareAction && active && <p className={`care-delivery ${ending ? 'is-settling' : ''}`} role="status" aria-live="polite">{ending ? t('含羞草正在完成这次回应…') : locale === 'en' ? `“${t(careLabels[lastCareAction].label)}” has reached the room.` : `“${careLabels[lastCareAction].label}”已经传到房间里。`}</p>}
              {privateCueCount > 0 && RESPONSE_COUNT_MODE !== 'hidden' && (
                <div className="private-summary">
                  <p>{RESPONSE_COUNT_MODE === 'exact' ? locale === 'en' ? `${privateCueCount} anonymous response${privateCueCount === 1 ? '' : 's'} received. Choices are summarized without names.` : `收到了 ${privateCueCount} 份匿名回应，只汇总选择，不显示姓名。` : locale === 'en' ? 'Anonymous responses have arrived; the exact count is hidden.' : '已有匿名回应抵达；系统暂不显示具体人数。'}</p>
                  {RESPONSE_COUNT_MODE === 'exact' && <>
                    <div><span>{t('需要一点时间')}</span><strong key={`need-${Object.values(state.privateCues).filter((cue) => cue === 'NEED_TIME').length}`}>{Object.values(state.privateCues).filter((cue) => cue === 'NEED_TIME').length}</strong></div>
                    <div><span>{t('正在确认')}</span><strong key={`check-${Object.values(state.privateCues).filter((cue) => cue === 'CHECKING').length}`}>{Object.values(state.privateCues).filter((cue) => cue === 'CHECKING').length}</strong></div>
                    <div><span>{t('有社交压力')}</span><strong key={`pressure-${Object.values(state.privateCues).filter((cue) => cue === 'SOCIAL_PRESSURE').length}`}>{Object.values(state.privateCues).filter((cue) => cue === 'SOCIAL_PRESSURE').length}</strong></div>
                  </>}
                </div>
              )}
              {recoverySuggested && (
                <div className="recovery-confirmation" role="status" aria-live="polite">
                  <div><span className="eyebrow">{t('讨论似乎重新接上了')}</span><strong>{t('要结束这一轮 Mimosa 吗？')}</strong><p>{t('系统只检测到持续的语音活动，是否真正恢复仍由你确认。')}</p></div>
                  <div>
                    <button type="button" onClick={() => applyCare('RESOLVE')}>{t('结束本轮')}</button>
                    <button type="button" onClick={() => {
                      setRecoverySuggested(false)
                      recordEvent('speech_recovery_suggestion_dismissed', state.activeMoment?.id)
                    }}>{t('继续保留')}</button>
                  </div>
                </div>
              )}
              <div className="round-completion">
                <span>{t('检测到讨论恢复时会先询问你，不会擅自结束')}</span>
                <button type="button" disabled={!connected || !active || ending} onClick={() => applyCare('RESOLVE')}>{t('讨论已经恢复，结束本轮')}</button>
              </div>
            </section>
          )}

          {(deferredMoments.length > 0 || seedTransfer) && (
            <section className={`deferred-panel seed-bank seed-bank--${seedTransfer?.stage ?? 'resting'}`}>
              <div className="seed-bank-heading">
                <div><span className="eyebrow">{t('种子暂存区')}</span><h2>{t('整理一下，再把问题带回讨论')}</h2></div>
                <span className="seed-bank-target" aria-hidden="true"><i /></span>
              </div>
              <p className="deferred-intro">{t('可以保留原问题，也可以把它改得更具体、更容易回应。')}</p>
              {seedTransfer && (
                <div className="seed-bank-progress" role="status" aria-live="polite">
                  {seedTransfer.stage === 'preparing'
                    ? t('正在把这个问题收成一颗种子…')
                    : seedTransfer.stage === 'flying'
                      ? t('种子正轻轻飞向暂存区…')
                      : t('种子已经收好，稍后可以再带回来。')}
                </div>
              )}
              {deferredMoments.map((moment) => {
                const draft = deferredDrafts[moment.id] ?? moment.question
                const isOwner = moment.ownerId === localParticipantId
                return <div className={`deferred-item ${isOwner ? 'is-owned' : 'is-shared'}`} key={moment.id}>
                  {isOwner ? (
                    <>
                      <label>{t('带回讨论的版本（可编辑）')}<textarea rows={2} value={draft} onChange={(event) => setDeferredDrafts((drafts) => ({ ...drafts, [moment.id]: event.target.value }))} /></label>
                      <button type="button" disabled={active || !draft.trim()} onClick={() => createMoment(draft, moment.id)}>{t('用编辑后的问题重新开始')}</button>
                    </>
                  ) : (
                    <>
                      <span className="eyebrow">{t('团队共同暂存')}</span>
                      <label>{t('由我接续并带回（可编辑）')}<textarea rows={2} value={draft} onChange={(event) => setDeferredDrafts((drafts) => ({ ...drafts, [moment.id]: event.target.value }))} /></label>
                      <button type="button" disabled={active || !draft.trim()} onClick={() => createMoment(draft, moment.id)}>{t('认领并重新开始讨论')}</button>
                      <small>{t('共享种子不会永久绑定已离开的临时身份；当前任一成员都可接续，或清理已失效的问题。')}</small>
                    </>
                  )}
                  <div className="deferred-remove">
                    {pendingDeferredRemovalId === moment.id ? (
                      <div className="deferred-remove-confirm" role="group" aria-label={locale === 'en' ? 'Confirm removing this question from saved seeds' : '确认移出暂存区'}>
                        <span>{t('确定不再保留这个问题吗？')}</span>
                        <div>
                          <button type="button" className="danger-subtle" onClick={() => removeDeferredMoment(moment.id)}>{t('确认移出')}</button>
                          <button type="button" onClick={() => setPendingDeferredRemovalId(null)}>{t('继续保留')}</button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" className="seed-remove-trigger" onClick={() => setPendingDeferredRemovalId(moment.id)}>{t('移出暂存区')}</button>
                    )}
                  </div>
                </div>
              })}
            </section>
          )}

          {showStudyPanel && <details className="research-panel">
            <summary>{showResearchControls ? (locale === 'en' ? 'Research log and connection status' : '研究记录与连接状态') : (locale === 'en' ? 'Study log' : '实验记录')}</summary>
            <dl>
              <div><dt>{locale === 'en' ? 'Events' : '事件数'}</dt><dd>{studyEvents.length}</dd></div>
              <div><dt>{locale === 'en' ? 'Pseudonymous ID' : '匿名编号'}</dt><dd>{studyIdentity.participantPseudonym}</dd></div>
              {showResearchControls && <>
                <div><dt>{locale === 'en' ? 'Observer' : '观察端'}</dt><dd>{locale === 'en' ? 'Non-participating' : '不参与交互'}</dd></div>
                <div><dt>{locale === 'en' ? 'Participants' : '实验参与者'}</dt><dd>{studyParticipants.length}</dd></div>
                <div><dt>{locale === 'en' ? 'Observers' : '观察员'}</dt><dd>{observerIds.size}</dd></div>
                <div><dt>{locale === 'en' ? 'Silence trigger' : '沉默触发'}</dt><dd>{locale === 'en' ? '8 seconds' : '8 秒'}</dd></div>
                <div><dt>{locale === 'en' ? 'Role-selection window' : '角色确认窗口'}</dt><dd>{locale === 'en' ? '12 seconds' : '12 秒'}</dd></div>
                <div><dt>{locale === 'en' ? 'Leaf movement' : '叶片合拢'}</dt><dd>{locale === 'en' ? 'Begins after growth' : '生长完成后立即缓慢开始'}</dd></div>
                <div><dt>{locale === 'en' ? 'Response count' : '回应人数'}</dt><dd>{RESPONSE_COUNT_MODE === 'exact' ? (locale === 'en' ? 'Exact anonymous summary' : '精确匿名汇总') : RESPONSE_COUNT_MODE === 'coarse' ? (locale === 'en' ? 'Coarse' : '粗粒度') : (locale === 'en' ? 'Hidden' : '隐藏')}</dd></div>
                <div><dt>{locale === 'en' ? 'Collected logs' : '集中日志'}</dt><dd>{Object.keys(observerLogs).length}/{studyParticipants.length}</dd></div>
                <div><dt>{locale === 'en' ? 'Protocol' : '协议'}</dt><dd>v14</dd></div>
              </>}
            </dl>
            <p className="sensor-privacy-note">{showResearchControls ? (locale === 'en' ? 'The observer remains muted and is excluded from silence sensing. Logs are requested through the room data channel and contain no audio, transcripts, or real names.' : '研究观察端保持闭麦，不参与自动沉默感知。日志通过房间数据通道按需收集，不包含音频、转写或真实姓名。') : (locale === 'en' ? 'Only pseudonymous interaction events are stored on this device—never audio, transcripts, or real names. Researchers can request logs at the end of the session; local export remains available as a fallback.' : '本页仅保存本机匿名交互事件，不包含音频、转写或真实姓名。研究者可以在实验结束后集中请求日志；本地导出保留为故障备用。')}</p>
            <div className="research-actions">
              <button type="button" onClick={downloadStudyLog} disabled={studyEvents.length === 0}>{locale === 'en' ? 'Export local event log' : '导出本地事件日志'}</button>
              {showResearchControls && <button type="button" onClick={clearStudyLog} disabled={studyEvents.length === 0}>{locale === 'en' ? 'Clear local event log' : '清空本地事件日志'}</button>}
            </div>
          </details>}
        </aside>
      </section>
    </main>
  )
}

export default App
