# Findings
- Existing heartbeat checks local readyState and sends no request while OPEN.
- Unexpected close clears all subscription registrations and never reconnects.
- ROSLIB 1.x queues outbound messages while disconnected; guard sends after async library loading and bind them to the captured connection.
- ROSLIB Topic automatically re-subscribes when reusing a Ros. We will create a fresh Ros per attempt and restore registrations explicitly, preventing queued commands and stale callbacks from crossing connections.
- UI components resubscribe on connected=true. Keyed subscription callbacks must remain deduplicated.
- ImagePanel clears the selected camera on any disconnect; preserve it during automatic recovery using a narrowly scoped condition, preserving pre-existing edits.
- UX lookup: show recovery status and allow cancellation; do not show repeated blocking errors per retry.

- Regression tests also cover cancellation during import/handshake, delayed old events, repeated handshake failures, bounded retry intervals, cleanup of heartbeat/service handlers, discovery requests bound to their original session, debug subscription disposal, and keyed callback deduplication.
- Camera watcher observes both connected and reconnecting so cancelling recovery while already disconnected correctly clears selection for the next manual connection.
- Service calls now time out after 30 seconds by default, allow an explicit timeout override, and are cancelled on disconnect; they are never automatically retried.

## Follow-up audit findings
- Added a VM fixture that executes actual SFC lifecycle expressions with Vue reactivity and installed ROSLIB, excluding rendering and unrelated HTTP APIs. This caught issues transport-only tests missed.
- Reproduced camera selection changed while offline not being subscribed after reconnect; explicit reconciliation and a version guard now handle offline and out-of-order selections.
- Reproduced old Pinia discovery results/errors overwriting new metadata or clearing a newer loading indicator. Requests now carry versions invalidated by disconnect or target change.
- Reproduced navigation/queue state and active floor/marker cache being cleared on transient disconnection. Preserve during recovery, reset on explicit disconnection/cancellation, and update from fresh ROS messages.
- Reproduced orphan robot status subscriptions after offline unmount, and registrations surviving unsubscribe during an async load. Reserve ownership before awaiting; lifecycle owners now remove subscriptions regardless of transport state.
- Reproduced manual movement intervals and active PTZ scan sequences surviving disconnect. Cancel these operations, invalidate async continuations, and do not send old motion/continue commands after recovery. Interrupted PTZ capture requires user confirmation before continuing the task.
- Reproduced keepalive disappearing during long file transfers. Pausing heartbeat now pauses failure judgement while keeping actual probe traffic.
- Removed duplicate/delayed mount-time navigation subscriptions and the mount-time loop-mode reset. Known status subscriptions do not depend on topic discovery. Cancel delayed refresh and movement timers on disconnect/unmount.
- Added lifecycle checks for sequential navigation subscriptions after unmount and map subscription timers after renderer disposal.
- Focused lint exposed four pre-existing no-case-declarations errors in ThreeDPanel; wrapped the two affected marker-geometry cases in block scopes without changing behavior.
