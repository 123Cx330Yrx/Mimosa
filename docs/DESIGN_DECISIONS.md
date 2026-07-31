# Mimosa implementation decisions

## Proposal constraints

- The mimosa represents a shared, socially ambiguous silent moment rather than a specific participant.
- Responding members change the surrounding environment; the waiting member changes the plant or defers the question.
- Participant meanings remain `需要一点时间`, `正在确认`, and `有社交压力`.
- The waiting member sees exact anonymous category totals but never a participant-to-response mapping.
- A deferred question becomes a shared seed. Because Jitsi endpoint IDs are temporary across rejoin, any current room member may claim, edit, and resume it, or remove an obsolete seed after explicit confirmation; deletion is room-synchronized and logged.

## Confirmed implementation choices

- Roles are assigned per moment, never permanently before joining.
- Manual open-question marking assigns the initiator as the waiting member.
- Automatic detection observes only room speech activity. It does not classify question semantics or infer a questioner.
- Speech activity is calculated locally with Web Audio. Only boolean activity transitions and speaking heartbeats are shared; audio and levels stay local.
- Automatic detection requires a prior speaking turn, then eight seconds of room inactivity.
- A detected candidate opens a private role-confirmation window for approximately twelve seconds.
- An unclaimed candidate or renewed speech removes the prompt without requiring a host or global cancel control.
- The first confirmed waiting claim wins. Candidate expiry stops immediately after confirmation.
- Once the formal plant finishes growing, its leaves immediately begin a slow progressive closure. There is no second twelve-second no-response threshold inside the formal moment.
- `需要一点时间` and `正在确认` use progressive disclosure before sunlight or watering. `有社交压力` maps directly to clouds.
- Exact anonymous response counts are enabled. The interface never renders a sender-to-response mapping.
- Renewed speech does not automatically end a formal moment. After sustained activity, the waiting member receives a confirmation prompt and decides whether the discussion has recovered.
- `换一种方式问` remains in the protocol compatibility layer but is not presented in the current UI.
- Deferred questions and structured experiment events persist only in local browser storage.
- The complete participant and observer system is bilingual at runtime. `lang=en` and the in-page language switch control the same implementation; English is not a screenshot-only variant.
- The room ID is empty unless supplied through `room=`. Study coordinators assign a unique room ID per concurrent group. The JaaS App ID remains deployment configuration and is not a room identifier.
- The ecological scene uses a transparent overlay and a small assistant dialogue so it remains playful without unnecessarily obscuring meeting controls.

## Engineering boundaries

- JaaS supplies audio/video and endpoint messaging.
- A deterministic, invisible client election maintains shared timers; this is not a social role and has no special user-facing powers.
- The current sensor is replaceable. A future paid transcription or ASR adapter can add response-seeking-turn classification without changing the Mimosa interaction protocol.
- Public snapshots restore candidate and formal state for late joiners. Private cue history is never included.
