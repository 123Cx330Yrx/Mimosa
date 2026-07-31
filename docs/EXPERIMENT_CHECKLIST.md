# Mimosa v14 functional acceptance checklist

Use at least four participant browser sessions plus one research-observer session in one JaaS room. Add a fifth or sixth participant once to verify dynamic membership. Give participant sessions microphone permission for automatic detection. The observer remains muted. Headphones reduce echo during multi-device tests.

Assign a unique room ID to this test group. Before the functional rounds, open one participant and one observer with `&lang=en` and verify that joining, role selection, responses, care actions, deferred questions, observer controls, and log export remain fully usable in English. Reuse neither the room ID nor the tabs for another simultaneous group.

## Dynamic membership and observer isolation

1. Open four `?study=1` sessions and one `?research=1` session.
2. Verify the Mimosa header reports four participants and one observer.
3. Add participant E and F; verify the count becomes six participants without replacing earlier members.
4. Verify E and F receive the current candidate or formal public state and can participate in subsequent role/response actions.
5. Confirm the observer receives no role, cue, or care-action controls and never becomes the silence coordinator.

## Automatic sensing

1. Join the same room and verify “本地感知：正在工作” in the experiment panel.
2. Speak for several seconds, then keep every microphone environment quiet.
3. At about eight seconds, every client should receive the private role-confirmation panel exactly once.
- Regression check: repeat with mixed microphone states after the last utterance (speaker mutes or stays unmuted; other members independently muted or unmuted). If no new speech is detected, the same panel must appear after about eight seconds in every case.
4. Leave the candidate unclaimed. At about twelve seconds it should disappear for every client and show a calm exit notice.
5. Repeat, then speak during role confirmation. The candidate should disappear immediately with the “讨论已经自然接上” notice.
6. Deny microphone permission in one browser. The room must remain usable and the manual simulation button must still work.

## Role confirmation

1. Trigger a candidate.
2. B selects `我可能会回应`; C selects `暂时不需要 Mimosa`.
3. A selects `我正在等待回应` and optionally adds a question summary.
4. The candidate timer must stop. The plant grows and must not disappear at the former twelve-second deadline.
5. As soon as growth settles, verify that the leaves begin a slow gradual closing movement without waiting for another no-response timer.
6. Verify that the plant overlay is transparent, leaves the Jitsi toolbar usable, and displays an assistant-style explanation in the selected language.
7. Attempt near-simultaneous waiting claims. Only one claim may win.
8. Confirm that dismissed choices remain local and are not counted.

## Formal response and recovery

1. B selects `正在确认`, then watering.
2. C selects `有社交压力`.
3. A sees two exact anonymous responses and category counts, without identities.
4. All clients see watering and clouds in the shared scene.
5. A applies each care action in separate rounds and all clients receive the same plant transition.
6. During a formal round, speak continuously for about two seconds. Only A should see the recovery-confirmation card.
7. Select `继续保留`; the round remains active.
8. Trigger the card again and select `结束本轮`; all clients return to the seedling state.

## Membership and state recovery

1. Start a candidate, close its original coordinator tab, and verify the remaining clients keep the same deadline and can still confirm a waiting member.
2. Join D during role confirmation. D should recover the candidate.
3. Join D during a formal round. D should recover the public plant/environment state but no private cue history.
4. Close the waiting member during a formal round. The remaining clients should safely end the round.
5. Defer a question, refresh the owner tab, rejoin the same room, and verify the editable seed remains.
6. From another current participant, edit the shared seed and select “认领并重新开始讨论”; verify the edited question starts a new round.
7. Defer it again, select “移出暂存区” from a different participant, cancel once, then confirm removal.
8. Verify the seed disappears on every online client and remains absent after refresh/rejoin.
9. Reconnect a client that previously cached the seed and verify its stale snapshot does not restore the removed question.

## Observer controls and centralized logs

1. Mark experiment start in the observer view and verify participant logs record the marker.
2. Trigger a candidate, then use “撤销本次误触发”; all participant views should clear the same moment.
3. Complete at least one formal round with responses from four or more participants.
4. From the observer view, request participant logs.
5. Verify the received count reaches the number of online study participants, excluding the observer.
6. Download the aggregate JSON and verify each participant has a distinct pseudonym/session and event sequence.
7. Close one participant before requesting logs; verify the count makes the missing log visible, then use that participant's local export as the documented fallback.

## Logging and accessibility

- Export the log and verify it contains anonymous identity, settings, candidate cancellation reasons, role and response timing events.
- Clear the log and confirm the event count resets.
- Test at 1440px, 1024px, 768px, and 375px widths.
- All action targets remain at least 44px high.
- Keyboard focus is visible and all controls are reachable.
- With reduced motion enabled, state meaning remains available through text.
