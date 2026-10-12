# Khidma (demo starter)

A tiny slice of Khidma, the fictional government e-services portal.
A citizen submits a request; staff start a review; staff approve or reject it.

- Code: `src/requests.js` (in-memory store, no dependencies)
- Tests: `npm test` (Node's built-in test runner)
- Every request gets a reference number `KH-YYYY-NNNNNN` (sequence restarts each year). Look it up with `getRequestByReference`.
- A citizen cannot submit a second request for a service while one is still `SUBMITTED` or `UNDER_REVIEW`; the error includes the open request's reference number.
- `startReview(id, reviewerId)` needs a reviewer id. A reviewer can have at most `MAX_ACTIVE_REVIEWS` (5) requests `UNDER_REVIEW` at once; a decision frees a slot.

Request statuses: `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` | `REJECTED`
