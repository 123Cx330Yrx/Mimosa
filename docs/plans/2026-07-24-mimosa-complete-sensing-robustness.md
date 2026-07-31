# Mimosa Complete Sensing and Robustness Implementation Plan

**Goal:** Complete the experiment-ready Mimosa interaction from room silence
detection to role confirmation, compassionate response, recovery confirmation,
multi-user recovery, and structured study logging.

**Architecture:** Keep JaaS/Jitsi as the meeting transport. Add a replaceable
speech-activity sensing layer that detects only local speech activity and sends
boolean activity signals through the existing Mimosa data channel. An invisible,
deterministically elected technical coordinator aggregates those signals and is
the only client allowed to create or cancel a silence candidate. No audio samples
leave a participant's browser. Semantic open-question detection remains an
optional future adapter because the current JaaS IFrame API does not expose
room-level transcripts without a paid transcription setup.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Web Audio API, JaaS/Jitsi
IFrame API endpoint messages.

---

## Task 1: Extend the protocol and pure state machine

**Files:**
- Modify: `src/domain/protocol.ts`
- Modify: `src/domain/mimosaMachine.ts`
- Modify: `src/domain/mimosaMachine.test.ts`
- Modify: `src/domain/mimosaMulticlient.test.ts`

1. Add room speech-activity, detector-state, candidate-cancellation reason, and
   recovery-suggestion message payloads.
2. Add candidate creation time and recovery state to the pure domain model.
3. Ensure candidate cancellation is idempotent and cannot clear a confirmed
   formal moment.
4. Add tests for 12-second unclaimed cancellation, speech-resumed cancellation,
   first-waiting-claim wins, and late duplicate messages.

## Task 2: Add a privacy-preserving local speech activity sensor

**Files:**
- Create: `src/sensing/SpeechActivitySensor.ts`
- Create: `src/sensing/WebAudioSpeechActivitySensor.ts`
- Create: `src/sensing/speechActivity.test.ts`

1. Define a small sensor interface with start, stop, state-change subscription,
   calibration status, and error reporting.
2. Use `getUserMedia({audio:true})` and an `AnalyserNode` locally. Compute RMS and
   adaptive noise floor; emit only speaking/not-speaking transitions and
   periodic speaking heartbeats.
3. Stop all tracks and audio nodes on leave/unmount.
4. Add a visible opt-in toggle and privacy explanation; fall back to manual
   simulation when permission is unavailable.

## Task 3: Aggregate room activity and trigger candidates

**Files:**
- Create: `src/domain/silenceCoordinator.ts`
- Create: `src/domain/silenceCoordinator.test.ts`
- Modify: `src/App.tsx`

1. Elect the lowest current participant endpoint ID as an invisible technical
   coordinator. This is an implementation role, not a facilitator.
2. Broadcast local activity state and heartbeat messages.
3. Track the last active timestamp for all current participants.
4. After at least one speaking turn, create one candidate after 8 seconds of
   room inactivity.
5. Start a 12-second role-confirmation window. If nobody claims waiting, cancel
   with reason `unclaimed`. If speech resumes first, cancel with reason
   `speech-resumed`.
6. Remove the ordinary user-facing global cancel button. Keep manual simulation
   as a labeled experiment fallback.

## Task 4: Detect conversational recovery without forcing closure

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/domain/protocol.ts`

1. During a formal moment, watch aggregated room speech activity.
2. When sustained activity resumes after the moment has been active, show the
   waiting member a lightweight confirmation card:
   “讨论似乎重新接上了，要结束本轮吗？”
3. Do not end automatically. The waiting member can confirm, dismiss the
   suggestion, or continue using the existing care actions.
4. Correct the current misleading automatic-ending copy.

## Task 5: Multi-user membership, reconnect, and state recovery

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/domain/protocol.ts`
- Modify: `src/domain/mimosaMulticlient.test.ts`

1. Prune speech activity for participants who leave.
2. Re-elect the technical coordinator on every membership update.
3. If the candidate coordinator leaves, the new coordinator continues the
   remaining candidate window rather than requiring a human intervention.
4. If the waiting member leaves during a formal moment, end the round safely
   with a visible neutral notice.
5. Extend snapshots to restore active state for late joiners and add a candidate
   snapshot path where safe.
6. Persist deferred questions locally per room.

## Task 6: Experiment configuration and durable event logging

**Files:**
- Create: `src/research/studyLog.ts`
- Create: `src/research/studyLog.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

1. Generate and persist a study session ID and participant pseudonym.
2. Log structured timing metadata for sensing start/error, activity transitions,
   candidate creation/cancellation, role claim, cue, care action, recovery
   suggestion, confirmation, leave, reconnect, and round outcome.
3. Persist logs to local storage during the session and include protocol,
   thresholds, participant count, and sensing mode in export metadata.
4. Add clear/export controls inside the collapsed experiment panel.

## Task 7: End-to-end polish and verification

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `docs/CURRENT_IMPLEMENTED_FLOW.zh-CN.md`
- Modify: `docs/DESIGN_DECISIONS.md`
- Modify: `docs/EXPERIMENT_CHECKLIST.md`
- Modify: `README.md`

1. Add calm fade-out copy for the 12-second unclaimed path and speech-resumed
   candidate path.
2. Show sensing state without exposing audio levels or identities.
3. Preserve the existing playful plant/environment animation and exact anonymous
   aggregate counts.
4. Run unit tests, lint, TypeScript production build, and a three-/four-client
   manual acceptance checklist.
5. Document known limitation: current V1 detects room speech activity, not
   semantic question intent; paid JaaS transcription can be added through the
   adapter later.
