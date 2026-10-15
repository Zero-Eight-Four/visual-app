# ROS connection stability

## Scope
Implement authorized browser connection hardening; do not change live frp or restart production services. Preserve existing ImagePanel edits.

## Phases
1. [complete] Inspect connection lifecycle, ROSLIB behavior and UI consumers.
2. [complete] Add deterministic regression harness for lost sockets, silent stalls, recovery and command rejection.
3. [complete] Implement connection lifecycle, heartbeats, recovery, subscription restoration and UI feedback.
4. [complete] Run regression tests, type check/build, focused lint and inspect final diff.

## Constraints / errors
- Host process/service access is blocked; no live robot or current frp logs are available.
- Existing user change: src/components/panels/ImagePanel.vue.
- Initial file search referenced absent src/config; use actual source paths.

- Regression harness initially loaded ROSLIB Node transport; corrected it to inject a fake WebSocket into the installed Ros constructor while keeping real Topic, Service and SocketAdapter behavior.
- Added cleanup for late error events after expanded tests exposed EventEmitter2 unhandled errors.
- Focused lint found a pre-existing @ts-ignore; replaced it with documented @ts-expect-error.

## Final validation
- npm run test:connection: 23/23 passed using installed ROSLIB and a simulated WebSocket with deterministic clock.
- npm run build: passed (Vue TypeScript check and Vite production build).
- Focused ESLint on changed sources and test harness: passed with --quiet (existing any/style warnings remain outside the error gate).
- git diff --check: passed.
- No temporary debug instrumentation remains.
- Production deployment and live robot/frp soak test were not performed: sandbox cannot access host services.

## Follow-up audit (user requested)
1. [complete] Exercise actual Vue watchers and Pinia store through loss/recovery, not only transport tests.
2. [complete] Repair reproduced component lifecycle/state issues and extend regression coverage.
3. [complete] Re-run tests, full build and focused lint; record runtime limits.

## Follow-up final verification
- 38/38 tests passed, including actual Vue lifecycle/Pinia cases, fresh ROS state after recovery, 50 consecutive reconnections, and uninterrupted/interrupted PTZ scans.
- Full Vue type check and production build passed; latest dist generated.
- Focused ESLint (errors gate) across all modified sources and regression tests passed.
- git diff --check passed; no temporary debug instrumentation added.
- Reproduction command: npm run test:connection. The added cases failed on the previous implementation before the corresponding changes.
- Live robot/frp validation and deployment were not performed in this restricted environment.
