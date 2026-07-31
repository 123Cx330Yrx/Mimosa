# Research Observer Mode

## Decision

`?research=1` is a non-participating research observer, not a participant with extra controls. The observer joins the same JaaS room so that the researcher can watch and hear the session, but is excluded from Mimosa role confirmation, speech activity coordination, response counts, and interaction controls.

## Permission boundary

The observer may:

- view the current Mimosa phase, question, public environment and anonymous aggregate response counts;
- place start and end markers in every participant's local study log;
- cancel a clearly false-positive Mimosa candidate or active round;
- request local study logs and download one aggregated JSON file;
- inspect technical room status.

The observer may not:

- claim waiting/responding roles;
- send participant cues, environment actions or care actions;
- create an open question, resume a seed or end a valid round on behalf of participants;
- contribute speech activity to automatic silence detection;
- count as an eligible Mimosa participant or coordinator candidate.

## Protocol

Protocol v13 adds:

- `OBSERVER_HELLO`: identifies an endpoint as a non-participating observer;
- `OBSERVER_ROUND_SUMMARY`: sends anonymous cue totals to known observers;
- `EXPERIMENT_MARKER`: records a researcher start/end marker on every client;
- `OBSERVER_CANCEL_MOMENT`: clears a false-positive candidate or round;
- `STUDY_LOG_REQUEST`: asks participant clients for their current local log;
- `STUDY_LOG_RESPONSE_CHUNK`: transfers bounded chunks that the observer reassembles.

Log transfer is initiated explicitly by the researcher. The response contains the participant pseudonym, session identifier and locally recorded events, but no audio or transcript. Chunking keeps each Jitsi endpoint message small enough for the data channel.

## Data and failure handling

The observer maintains requested logs in memory. A new request replaces the previous collection. The dashboard shows expected participant count, received log count and incomplete transfers. Participants remain able to export locally as a fallback.

If the observer joins late, it broadcasts `OBSERVER_HELLO` and requests the current public snapshot. When participants join later, the observer sends the hello again. Observer departure removes the endpoint from the local exclusion set when the Jitsi participant list changes.

This is research-prototype authorization rather than cryptographic access control. The production experiment link must not expose `?research=1` to participants.
