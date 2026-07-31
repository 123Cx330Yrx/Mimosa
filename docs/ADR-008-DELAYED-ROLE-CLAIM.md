# ADR-008: Delayed role claim for ambiguous silence

## Status

Accepted for implementation on 2026-07-24.

## Context

The current prototype asks each person to join as either a `questioner` or a
`participant`. A silent moment therefore begins with the questioner already
known. The latest design review requires a semi-automatic path that detects
only a potentially supportable silence. The system must not infer who asked a
question or who should answer it.

The manual open-question path remains useful and may directly establish the
person who marks the question as the member waiting for a response.

## Decision

1. Meeting members join without a persistent interaction role.
2. A manual open-question trigger creates an active moment and assigns its
   initiator the temporary `waiting` role.
3. A semi-automatic trigger creates a role-confirmation moment without a
   waiting member and without growing the mimosa.
4. Every member privately receives the same choices:
   - `waiting`: I am waiting for a response to this question.
   - `responding`: I may respond to this question.
   - `dismissed`: Mimosa is not needed for me right now.
5. The first `waiting` claim accepted by the moment coordinator establishes
   the waiting member. The coordinator routes this claim but is not treated as
   the questioner.
6. Once the waiting role is confirmed, the shared mimosa grows and the
   existing participant-cue → environment → care-action flow begins.
7. Exact anonymous response totals remain visible by default. Count rendering
   is isolated behind a configuration value so it can later become coarse or
   hidden without changing the protocol.

## Architecture

```text
IDLE
  ├─ manual open question
  │    └─ SENSITIVE_SILENCE (initiator = waiting)
  └─ silence detected
       └─ ROLE_CONFIRMATION
            ├─ one member claims waiting
            │    └─ SENSITIVE_SILENCE
            ├─ members privately choose responding/dismissed
            └─ no waiting claim
                 └─ expires after 12 seconds or renewed speech

SENSITIVE_SILENCE
  ├─ responder cue → shared environment
  ├─ waiting-member care action → plant transition
  ├─ DEFERRED
  └─ RESOLVED
```

## Privacy boundary

- A `responding` or `dismissed` selection remains local and is not broadcast.
- A `waiting` claim is accepted by the coordinator, after which the claimant
  announces itself. Every client binds the waiting channel from the observed
  message sender rather than from a participant ID copied across clients.
- Participant identities remain available to the transport layer, as they
  already are in JaaS, but are not rendered beside cue meanings or counts.
- Exact counts are a current presentation choice, not a protocol requirement.

## Failure handling

- Concurrent waiting claims: the coordinator accepts the first claim it
  processes; only the accepted claimant may announce the waiting role.
- Candidate moments expire after twelve seconds without a waiting claim and
  close immediately if speech resumes.
- Stale role claims are ignored by silent-moment ID.
- If the coordinator leaves before a waiting claim, the deterministically
  elected remaining client takes over the original deadline.
- Late joiners can recover role-confirmation candidates and confirmed public
  moments. Private cue history is never included.

## Consequences

- The pre-join role selector is removed.
- `questionerId` becomes `waitingMemberId`; `coordinatorId` is tracked
  separately.
- The existing JaaS transport and targeted participant-cue path remain valid.
- Automatic silence sensing can be replaced or improved later as long as it
  emits the same role-confirmation event.
