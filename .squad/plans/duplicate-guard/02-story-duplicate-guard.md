# Story 02 — Duplicate guard (Story: KH-106)

## Prerequisites

- Story 01 completed: [../reference-number/01-story-reference-number.md](../reference-number/01-story-reference-number.md). Every request has a **`referenceNumber`**, and this story puts it in the error message. Story 01 is in the working tree today (`src/requests.js`, `test/requests.test.js`, `README.md`), and `npm test` passes (12 tests, 0 failures).

---

## Story Goal

A citizen cannot submit the same request twice while the first one is still being handled.

1. If the citizen already has an **open** request (status `SUBMITTED` or `UNDER_REVIEW`) for the **same `serviceId`**, `submitRequest` throws. The error message includes the existing request's **reference number**.
2. A request for a **different service** is allowed.
3. When the open request gets a decision (`APPROVED` or `REJECTED`), the citizen can submit for that service again.

**Not in scope:** any HTTP/UI layer, persistence, staff overrides, cancelling or withdrawing a request, case-insensitive matching of `serviceId`.

---

## Context — Read These Files First

1. `src/requests.js` — the whole module (87 lines). Note:
   - `Status` (lines 4–9). Open statuses are `SUBMITTED` and `UNDER_REVIEW`. Closed statuses are `APPROVED` and `REJECTED`.
   - `submitRequest({ citizenId, serviceId }, { now })` (lines 31–45). Validation is on lines 32–33, and `nextReferenceNumber(now)` runs on line 36. The guard goes **between** them, so a rejected duplicate does not burn a sequence number. Story 01 uses the same rule for failed submissions.
   - `listRequestsByCitizen(citizenId)` (lines 60–62). Reuse it to find the citizen's requests. It is a hoisted function declaration, so you can call it from `submitRequest` even though it is defined later.
   - `decide(id, decision)` (lines 78–87) moves a request to `APPROVED`/`REJECTED` through `transition` (lines 64–68). This story does not change these functions. Once the status changes, the guard stops matching that request.
2. `test/requests.test.js` — 12 tests (lines 1–76). Note:
   - The shared fixture `const c = { citizenId: 'c1', serviceId: 'birth-certificate' };` (line 30) is reused for **many submissions in one test** at lines 41, 46–49 and 54. **These tests will fail once the guard exists**, because every call after the first is a duplicate. Task 3 fixes them.
   - Lines 7–28 and 59–75 submit at most one request per citizen+service per test, so the guard does not affect them.
3. `.squad/plans/reference-number/01-story-reference-number.md` — the precedent for this area. It covers the "validate before consuming a sequence number" rule (Edge Cases) and the test style.
4. `README.md` — 10 lines. Add one bullet after the reference-number bullet (line 8).
5. `tickets/KH-106.md` — the original ticket (same text as the intake).

---

## Product rules (from story)

| Situation | Today | After this story |
|---|---|---|
| Same citizen, same service, earlier request `SUBMITTED` | second request created | **throws**, message has the existing reference number |
| Same citizen, same service, earlier request `UNDER_REVIEW` | second request created | **throws**, message has the existing reference number |
| Same citizen, same service, earlier request `APPROVED`/`REJECTED` | second request created | second request created (unchanged) |
| Same citizen, different service | created | created (unchanged) |
| Different citizen, same service | created | created (unchanged) |

---

## Implementation tasks

### 1 — Add the open-request lookup

**File: `src/requests.js`**

Below `MAX_SEQUENCE` / `nextReferenceNumber` (after line 29), add:

```js
const OPEN_STATUSES = new Set([Status.SUBMITTED, Status.UNDER_REVIEW]);

function findOpenRequest(citizenId, serviceId) {
  return listRequestsByCitizen(citizenId).find(
    (r) => r.serviceId === serviceId && OPEN_STATUSES.has(r.status),
  );
}
```

- Keep it **private** (not exported). The public behaviour is the error from `submitRequest`.
- Match `serviceId` **exactly** (strict `===`). Requests store `serviceId` exactly as given.

### 2 — Guard in `submitRequest`

**File: `src/requests.js`** (lines 31–45)

Insert the guard right after the two validation lines (32–33) and **before** the request object is built (line 34):

```js
export function submitRequest({ citizenId, serviceId }, { now = new Date() } = {}) {
  if (!citizenId) throw new Error('citizenId is required');
  if (!serviceId) throw new Error('serviceId is required');
  const open = findOpenRequest(citizenId, serviceId);
  if (open) {
    const error = new Error(
      `Citizen ${citizenId} already has an open request ${open.referenceNumber} for ${serviceId}`,
    );
    error.code = 'DUPLICATE_REQUEST';
    error.referenceNumber = open.referenceNumber;
    throw error;
  }
  const request = {
    // ... unchanged (lines 34–41)
  };
  // ... unchanged (lines 42–44)
}
```

- **Order matters:** validation first, then the guard, then `nextReferenceNumber`. A rejected duplicate must **not** move `yearCounters`.
- `code` and `referenceNumber` on the error let a future caller (HTTP layer) handle it without parsing the message. The message alone covers the "clear error" rule.
- Do **not** change `decide`, `startReview` or `transition`.

### 3 — Make the existing reference-number tests use distinct citizens

**File: `test/requests.test.js`**

The tests at lines 40–43, 45–50 and 52–56 submit `c` (same citizen + service) several times. With the guard, every call after the first throws. These tests are about numbering, not duplicates, so give each submission its own citizen. **Do not** change what they assert.

Add a helper under the fixture on line 30:

```js
const c = { citizenId: 'c1', serviceId: 'birth-certificate' };
let nextCitizen = 0;
const fresh = () => ({ citizenId: `citizen-${++nextCitizen}`, serviceId: 'birth-certificate' });
```

Then replace `c` with `fresh()` **only** at:
- line 41: `[1, 2, 3].map(() => submitRequest(fresh(), y2026).referenceNumber)`
- lines 46–49: all four `submitRequest(c, …)` calls become `submitRequest(fresh(), …)`
- line 54: `refs.push(submitRequest(fresh(), i % 2 ? y2026 : y2027).referenceNumber)`

Leave lines 35, 60 and 64 (single submit per test) using `c`. The `nextCitizen` counter is never reset. That is fine, since it only needs to produce unique ids.

### 4 — README note

**File: `README.md`** — add one bullet after line 8:

```md
- A citizen cannot submit a second request for a service while one is still `SUBMITTED` or `UNDER_REVIEW`; the error includes the open request's reference number.
```

---

## Edge Cases & Failure Modes

- **Duplicate while `SUBMITTED`** — throws `DUPLICATE_REQUEST`; message contains e.g. `KH-2026-000001`. Enforced in `submitRequest` (task 2) via `OPEN_STATUSES` (task 1).
- **Duplicate while `UNDER_REVIEW`** — same as above. `UNDER_REVIEW` is in `OPEN_STATUSES`.
- **After `APPROVED` or `REJECTED`** — `findOpenRequest` skips the closed request; the new submit succeeds and gets the next sequence number. Both decisions must be tested.
- **Several closed requests plus one open** for the same service — `find` still returns the open one; throw. (Not reachable once the guard exists, since only one can be open at a time, but the code is correct either way.)
- **Different service, same citizen** — `serviceId` does not match; allowed.
- **Same service, different citizen** — `listRequestsByCitizen` only returns the citizen's own requests; allowed.
- **Rejected duplicate and sequence numbers** — the guard runs before `nextReferenceNumber`, so no number is consumed. The next accepted request gets the next unused number. Tested in Test Plan item 7.
- **Missing `citizenId`/`serviceId`** — the existing validation (lines 32–33) throws first, and the guard never runs.
- **`serviceId` case/whitespace** (`'Birth-Certificate'` vs `'birth-certificate'`) — treated as different services. Exact match is a deliberate choice, and normalisation is out of scope.
- **Concurrency** — `submitRequest` is synchronous on one thread, so check-then-insert cannot interleave. No lock needed.
- **Performance** — `listRequestsByCitizen` scans the whole store (O(n)). That is fine for the in-memory demo. A per-citizen index is out of scope.
- **`resetStore()`** — clears `requests`, so no open requests remain. No extra state was added, so `resetStore` needs no change.

---

## Test Plan

All unit tests go in `test/requests.test.js`, in the style of lines 34–75 (one `test()` per behaviour, `node:assert/strict`). The import on line 3 already has everything needed (`Status`, `submitRequest`, `startReview`, `decide`).

**Modify** (task 3): `reference numbers increase by one within a year`, `sequence restarts at 000001 in a new year` and `reference numbers are unique` now use `fresh()`. Their assertions do not change.

**Add** at the end of the file:

1. **`duplicate submit while SUBMITTED is rejected with the existing reference number`** — `const r = submitRequest(c, y2026);` then `assert.throws(() => submitRequest(c, y2026), (e) => e.code === 'DUPLICATE_REQUEST' && e.message.includes(r.referenceNumber) && e.referenceNumber === r.referenceNumber);`.
2. **`duplicate submit while UNDER_REVIEW is rejected`** — submit, `startReview(r.id)`, then `assert.throws(() => submitRequest(c), /already has an open request/)`.
3. **`a different service is allowed`** — submit `c`, then `submitRequest({ citizenId: 'c1', serviceId: 'passport' })` does not throw and `listRequestsByCitizen('c1').length === 2` (add `listRequestsByCitizen` to the line 3 import).
4. **`a different citizen can submit the same service`** — submit `c`, then `{ citizenId: 'c2', serviceId: 'birth-certificate' }` succeeds.
5. **`citizen can submit again after approval`** — submit, `startReview`, `decide(r.id, Status.APPROVED)`, submit `c` again. It succeeds with a different `id`.
6. **`citizen can submit again after rejection`** — same as 5 with `Status.REJECTED`.
7. **`rejected duplicate does not use a sequence number`** — `submitRequest(c, y2026)` gives `KH-2026-000001`. A duplicate throws. Then `submitRequest(fresh(), y2026).referenceNumber === 'KH-2026-000002'`.
8. **`original request is unchanged after a rejected duplicate`** — after a rejected duplicate, `getRequest(r.id).status === Status.SUBMITTED` and `listRequestsByCitizen('c1').length === 1`.

Existing tests at lines 7–28, 34–38 and 58–75 stay unchanged and must still pass.

---

## Verification Steps

1. **Tests pass:** from the repo root, run `npm test`. All green: 12 existing + 8 new = **20**.
2. **No new dependencies:** `git diff package.json` shows no change.
3. **Regression:** in `git diff test/requests.test.js`, the only changes to existing tests are `c` → `fresh()` in the three numbering tests and the `listRequestsByCitizen` import. No assertion changes.
4. **Order check:** in `src/requests.js`, the `findOpenRequest` call in `submitRequest` comes after the two validation `throw`s and before `nextReferenceNumber(now)`.

---

## Done Criteria

- [ ] A second submit for the same citizen and service throws while the first is `SUBMITTED`.
- [ ] Same while the first is `UNDER_REVIEW`.
- [ ] The error message includes the existing request's reference number (also on `error.referenceNumber`, with `error.code === 'DUPLICATE_REQUEST'`).
- [ ] A different service for the same citizen is allowed.
- [ ] After `APPROVED` or `REJECTED`, the citizen can submit for that service again.
- [ ] A rejected duplicate does not use a reference sequence number.
- [ ] Tests cover each rule; `npm test` passes (20 tests).
- [ ] No new dependencies in `package.json`.
- [ ] `README.md` mentions the duplicate guard.

**STOP HERE. Report to the user and wait for confirmation before proceeding to the next story.**
