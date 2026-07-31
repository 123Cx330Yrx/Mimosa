# Mimosa bilingual research prototype

Mimosa is an experiment-facing, bilingual online-meeting system for lightweight and compassionate repair of socially ambiguous silence. JaaS/Jitsi supplies the embedded audio/video room; Mimosa owns role confirmation, private response cues, shared ecological feedback, care actions, deferred questions, and pseudonymous event logging.

## Run locally

```powershell
npm.cmd install
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. The deployed JaaS App ID is supplied by the build configuration and is not entered by study participants. Each group enters its assigned room ID and display name. Different room IDs create isolated meetings and allow concurrent study sessions.

## Language and access links

The entire runtime interface is available in Chinese and English. Language can be switched before or during a meeting and is also encoded in the URL.

```text
Chinese participant: https://mimosa-srtp.com/?study=1&room=G01-task1
English participant: https://mimosa-srtp.com/?study=1&room=G01-task1&lang=en
Chinese observer:    https://mimosa-srtp.com/?research=1&room=G01-task1
English observer:    https://mimosa-srtp.com/?research=1&room=G01-task1&lang=en
```

Omit `room=` when participants should type the assigned room ID themselves. Do not reuse a room ID for two simultaneous groups.

## Verification

```powershell
npm.cmd run test
npm.cmd run lint
npm.cmd run build
```

## Implemented experiment path

1. Any member can manually mark an open question and become the temporary waiting member.
2. After at least one utterance has ended, a privacy-preserving speech-activity sensor can create a candidate after eight seconds of room silence. It does not infer who asked a question or interpret speech content.
3. Members privately claim a temporary role. The candidate expires after twelve seconds if nobody claims the waiting role.
4. Once a waiting member is confirmed, a seedling grows into a mimosa. After the growth settles, its leaves immediately begin a slow, gradual closing motion instead of waiting for a second inactivity threshold.
5. Responding members privately choose `NEED_TIME`, `CHECKING`, or `SOCIAL_PRESSURE`, then express the response through sunlight, watering, or clouds where appropriate.
6. Only the waiting member receives the exact anonymous cue counts. The room sees a coordinated shared environment without participant identities.
7. The waiting member chooses a care action that changes the plant or stores the question as an editable seed.
8. Sustained renewed speech asks the waiting member to confirm recovery instead of ending the round automatically.
9. Late participants recover the public candidate or confirmed state. Private cues are deliberately absent.
10. Participant membership is dynamic; the interaction is not capped at four people.
11. A `?research=1` observer joins the same room without participating in sensing or interaction and can request all online participant logs as one aggregate JSON file.

## Interface principles

- The Mimosa scene is a transparent overlay so it does not obscure the embedded meeting UI.
- A small assistant-style dialogue bubble explains the plant's current movement in natural Chinese or English.
- The active plant has subtle organic motion while remaining calm and non-demanding.
- The seedling remains visible outside a silent moment; the full mimosa appears only after a waiting member is established.
- Exact response counts are anonymous: the waiting member sees totals, never identities.

## Architecture

- `src/i18n.ts`: Chinese-to-English runtime copy map and locale helpers.
- `src/domain/protocol.ts`: typed wire protocol.
- `src/domain/mimosaMachine.ts`: deterministic state reducer and public/private translations.
- `src/meeting/JaaSTransport.ts`: JaaS IFrame API adapter and targeted data messages.
- `src/sensing/WebAudioSpeechActivitySensor.ts`: local, audio-free speech activity classification.
- `src/domain/silenceCoordinator.ts`: shared timing and invisible coordinator helpers.
- `src/research/studyLog.ts`: pseudonymous durable local event log.
- `src/research/observerLogTransfer.ts`: chunked participant-to-observer log transfer.
- `src/components/MimosaScene.tsx`: bilingual, state-driven ecological scene.
- `src/App.tsx`: experiment shell and message orchestration.

The earlier Jitsi technical spike remains separate under `../spike`; it is evidence and a fallback, not a dependency of this app. Implementation choices that go beyond the proposal are recorded in [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md). Use [`docs/EXPERIMENT_CHECKLIST.md`](docs/EXPERIMENT_CHECKLIST.md) for multi-participant and observer acceptance testing.

## License

Mimosa is released under the [MIT License](LICENSE).
