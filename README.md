# Khidma (demo starter)

A tiny slice of Khidma, the fictional government e-services portal.
A citizen submits a request; staff start a review; staff approve or reject it.

- Code: `src/requests.js` (in-memory store, no dependencies)
- Tests: `npm test` (Node's built-in test runner)
- Every request gets a reference number `KH-YYYY-NNNNNN` (sequence restarts each year). Look it up with `getRequestByReference`.
- A citizen cannot submit a second request for a service while one is still `SUBMITTED` or `UNDER_REVIEW`; the error includes the open request's reference number.
- A citizen can withdraw their own request with `withdrawRequest(id, citizenId)` while it is still `SUBMITTED`. `WITHDRAWN` is final and does not count as open.
- `startReview(id, reviewerId)` needs a reviewer id. A reviewer can have at most `MAX_ACTIVE_REVIEWS` (5) requests `UNDER_REVIEW` at once; a decision or a return for information frees a slot.
- The assigned reviewer can send a request back with `returnForInfo(id, reviewerId, note)`. The note is required and is saved in the history. `NEEDS_INFO` still counts as open. The owning citizen answers with `resubmitRequest(id, citizenId)`, which puts the request back in `SUBMITTED` for any reviewer.

Request statuses: `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` | `REJECTED`, or `SUBMITTED` → `WITHDRAWN`, or `UNDER_REVIEW` → `NEEDS_INFO` → `SUBMITTED`
