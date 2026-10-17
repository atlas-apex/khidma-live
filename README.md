# Khidma (demo starter)

A tiny slice of Khidma, the fictional government e-services portal.
A citizen submits a request; staff start a review; staff approve or reject it.

- Code: `src/requests.js` (in-memory store, no dependencies)
- Tests: `npm test` (Node's built-in test runner)
- Server: `src/server.js` (JSON routes over the module, Node's built-in `http`)
- Every request gets a reference number `KH-YYYY-NNNNNN` (sequence restarts each year). Look it up with `getRequestByReference`.
- A citizen cannot submit a second request for a service while one is still `SUBMITTED` or `UNDER_REVIEW`; the error includes the open request's reference number.
- A citizen can withdraw their own request with `withdrawRequest(id, citizenId)` while it is still `SUBMITTED`. `WITHDRAWN` is final and does not count as open.
- `startReview(id, reviewerId)` needs a reviewer id. A reviewer can have at most `MAX_ACTIVE_REVIEWS` (5) requests `UNDER_REVIEW` at once; a decision or a return for information frees a slot.
- The assigned reviewer can send a request back with `returnForInfo(id, reviewerId, note)`. The note is required and is saved in the history. `NEEDS_INFO` still counts as open. The owning citizen answers with `resubmitRequest(id, citizenId)`, which puts the request back in `SUBMITTED` for any reviewer.

Request statuses: `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` | `REJECTED`, or `SUBMITTED` → `WITHDRAWN`, or `UNDER_REVIEW` → `NEEDS_INFO` → `SUBMITTED`

## Run it locally

```bash
npm install   # dev tooling only; the server has no runtime dependencies
npm start     # http://127.0.0.1:3000
```

The server binds to `127.0.0.1` only. Set `PORT` to use another port. The store is in memory and resets when the process stops.

Citizen routes:

| Route | Calls |
|-------|-------|
| `POST /requests` with `{ "citizenId", "serviceId" }` | `submitRequest` |
| `POST /requests/:id/withdraw` with `{ "citizenId" }` | `withdrawRequest` |
| `POST /requests/:id/resubmit` with `{ "citizenId" }` | `resubmitRequest` |
| `GET /requests/:id` | `getRequest` |
| `GET /requests/by-reference/:referenceNumber` | `getRequestByReference` |
| `GET /citizens/:citizenId/requests` | `listRequestsByCitizen` |

Errors return JSON with `code` and `message`, plus `referenceNumber` or `reviewerId` when the module error carries one. Business-rule codes keep their status: `DUPLICATE_REQUEST` and `REVIEWER_AT_CAPACITY` are 409, `NOT_REQUEST_OWNER` and `NOT_ASSIGNED_REVIEWER` are 403. A not-found error is 404, a state error (`Cannot ...`) is 409, and any other validation error is 400.

```bash
curl -s -X POST http://127.0.0.1:3000/requests \
  -H 'Content-Type: application/json' \
  -d '{"citizenId":"c1","serviceId":"birth-certificate"}'
```

Reviewer routes (start review, return for info, decide) are not served yet.
