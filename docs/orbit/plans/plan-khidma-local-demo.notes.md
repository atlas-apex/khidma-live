# Notes for plan-khidma-local-demo (current: revision 1)

These notes sit beside the Plan record because the ORBIT v0.1 Plan schema has no fields for constraints, assumptions, proof, or revision history. The Plan record stays valid ORBIT.

## Interview

- 2026-10-16, q1-outcome: Demo-ready for stakeholders. Someone who is not a developer can run a local server and click through the layout to understand what Khidma does, without reading code or tests.
- 2026-10-16, q2-intent: Anyone can see what Khidma does by running one command and clicking through the citizen and reviewer screens. The screens drive the real lifecycle module, never a mock, so what they show is what the code does.
- 2026-10-16, q3-outcomes: Two outcomes. o1 Local server: one command starts an HTTP server that exposes the request lifecycle over JSON routes, with the in-memory store. o2 Screens: a citizen screen and a reviewer screen in the browser that call those routes and show every status, with a basic consistent layout.
- 2026-10-16, q4-acceptance: Accepted the ten drafted criteria as written. Five for o1, five for o2.
- 2026-10-16, q5-constraints: C1 no framework dependencies. C2 the in-memory store stays. C3 thin shell, no new rules. The operator did not record a no-auth constraint.
- 2026-10-16, q6-save: Saved with both of Naqid's fixes. ac1-6 adds the reviewer queue and active-count exports. ac1-7 adds the loopback bind and the demo banner.

## Constraints

- **C1. No framework dependencies.** The server uses Node's built-in `http` module. The screens use plain HTML, CSS, and JavaScript. No Express, no React, no bundler. This matches the zero-dependency convention and the KH ticket rule.
- **C2. The in-memory store stays.** This Plan adds no persistence. The DynamoDB decision in AgDR-0002 is a separate initiative. State resets when the server restarts.
- **C3. Thin shell, no new rules.** Server and screens own no business rules. Any new rule goes into `src/requests.js` with a KH ticket and tests, never into a route or a screen.

## Assumptions

Recorded from the Naqid challenge of revision 1.

- Identity is a typed-in citizen or reviewer ID. There is no sign-in. Anyone at the screen can act as any citizen or reviewer. ac1-7 makes this visible.
- `decide(id, decision)` does not check the assigned reviewer. Any reviewer can approve or reject a request another reviewer holds. The demo will show this. It is a known limitation of the module, not a shell bug. A follow-up KH ticket may close it.
- One process serves every viewer. Two people on the same server see each other's requests. That is the hand-off story the demo tells. The store resets on restart.
- The person running the demo needs Node 20 or later, npm, and a terminal. This is a real bar for a non-developer. The README states it.
- Uncoded module errors (not found, validation, state) map to one 4xx status by a stated rule in the server. Coded business-rule errors keep their code. An unexpected error returns 500.
- The screens are a disposable demo shell. They are not the seed of the React production UI from the company stack.
- Route handlers are written as pure functions, request in and status plus body out, so they can map to Lambda handlers later. This is a preference, not a criterion.
- Delivery is sliced vertically. The citizen path (routes plus citizen screen) ships before the reviewer path, so no merged state is undemoable.

## Proof

- ac1-1: `npm start` from a fresh clone after `npm install`. The README names the command and the port.
- ac1-2: A route test file exercises each of the nine routes with one success case.
- ac1-3: Route tests assert the HTTP status, `code`, and `message` for `DUPLICATE_REQUEST`, `REVIEWER_AT_CAPACITY`, `NOT_REQUEST_OWNER`, `NOT_ASSIGNED_REVIEWER`, one validation error, one state error, and one not-found error.
- ac1-4: Code review confirms the server module imports `src/requests.js` and contains no status, ownership, or count comparison of its own.
- ac1-5: `npm test` output shows the 41 existing tests plus the route tests, all passing.
- ac1-6: Unit tests for the two new exports in `test/requests.test.js`. The reviewer screen calls them through routes only.
- ac1-7: `npm start` output names `127.0.0.1`. A screenshot of each screen shows the banner.
- ac2-1: A browser walk-through on the citizen screen: submit, withdraw, resubmit after a return, with the request list updating.
- ac2-2: A browser walk-through on the reviewer screen: start review, return with a note, approve, reject, with the load indicator changing.
- ac2-3: One screenshot showing all six statuses with distinct markers and a history that includes a return note.
- ac2-4: A browser walk-through that triggers a duplicate submit and a wrong-owner withdraw, each shown on screen with its message.
- ac2-5: Screenshots of both screens at a 400px wide viewport with no horizontal scroll.

## Order

o1 first, because the screens call its routes. Then o2. Within the build, the citizen path ships before the reviewer path.

## Challenges

- 2026-10-16, revision 1: Naqid verdict proceed-with-changes. Two serious findings, both accepted: the reviewer-screen data gap against C3 (now ac1-6) and the open bind and identity assumptions after dropping C4 (now ac1-7). The remaining findings are recorded under Assumptions.

## Revision history

- **Revision 1** set two outcomes: a local server with JSON routes, and a citizen screen plus a reviewer screen. Twelve criteria after the challenge.
