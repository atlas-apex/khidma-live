# Story 01 — Reference number for every request (Story: KH-101)

## Prerequisites

- None. This is the first planned story in the repo. `npm test` passes on `main` today (4 tests, 0 failures).

---

## Story Goal

When a citizen submits a request, they get a reference number they can quote later. Staff can find the request by that number.

1. Every new request gets a **`referenceNumber`** in the format **`KH-YYYY-NNNNNN`** (year of submission + 6-digit zero-padded sequence, e.g. `KH-2026-000042`).
2. The sequence restarts at `000001` for each calendar year.
3. Reference numbers are unique and never reused while the store lives.
4. Staff can look up a request with a new function **`getRequestByReference(referenceNumber)`**.

**Not in scope:** persistence (the store stays in-memory), any UI or HTTP layer, changing the existing UUID `id` (it stays the primary key), backfilling old requests (the store starts empty).

---

## Context — Read These Files First

1. `src/requests.js` — the whole module (64 lines). Note:
   - module-level store `const requests = new Map();` (line 11) keyed by UUID `id`;
   - `resetStore()` (lines 13–15) — test helper that clears the store;
   - `submitRequest({ citizenId, serviceId })` (lines 17–29) — builds the request object (lines 20–26) and timestamps with `new Date().toISOString()` (UTC);
   - `getRequest(id)` (lines 31–35) — lookup pattern and error message style `` `Request ${id} not found` `` to copy.
2. `test/requests.test.js` — existing tests (lines 1–28). Note the `node:test` + `node:assert/strict` imports (lines 1–3), `beforeEach(() => resetStore())` (line 5), and one-`test()`-per-behaviour style. New tests go in this same file.
3. `package.json` — `"type": "module"`, test script is `node --test`, Node `>=20`, **no dependencies**. Keep it that way.
4. `README.md` — short project description; one line to add about reference numbers.
5. `tickets/KH-101.md` — the original ticket (same text as the intake).

---

## Implementation tasks

### 1 — Add year counters and a reference index

**File: `src/requests.js`**

Below `const requests = new Map();` (line 11) add two maps:

```js
const requests = new Map();
const yearCounters = new Map(); // year -> last sequence number used
const byReference = new Map(); // referenceNumber -> request id
```

Update `resetStore()` (lines 13–15) to clear all three:

```js
export function resetStore() {
  requests.clear();
  yearCounters.clear();
  byReference.clear();
}
```

### 2 — Generate the reference number

**File: `src/requests.js`**

Add a private helper above `submitRequest`:

```js
const MAX_SEQUENCE = 999999;

function nextReferenceNumber(now) {
  const year = now.getUTCFullYear();
  const next = (yearCounters.get(year) ?? 0) + 1;
  if (next > MAX_SEQUENCE) throw new Error(`Reference numbers exhausted for ${year}`);
  yearCounters.set(year, next);
  return `KH-${year}-${String(next).padStart(6, '0')}`;
}
```

- Use **UTC** year (`getUTCFullYear`) to match the UTC timestamps already written by `toISOString()` on line 25.
- The counter only moves forward. **Do not** decrement it anywhere, so numbers are never reused.

### 3 — Assign it in `submitRequest`

**File: `src/requests.js`** (lines 17–29)

Add an optional second argument `{ now }` so tests can control the year. Existing callers pass one argument and keep working (**backward compatible**).

```js
export function submitRequest({ citizenId, serviceId }, { now = new Date() } = {}) {
  if (!citizenId) throw new Error('citizenId is required');
  if (!serviceId) throw new Error('serviceId is required');
  const request = {
    id: randomUUID(),
    referenceNumber: nextReferenceNumber(now),
    citizenId,
    serviceId,
    status: Status.SUBMITTED,
    history: [{ status: Status.SUBMITTED, at: now.toISOString() }],
  };
  requests.set(request.id, request);
  byReference.set(request.referenceNumber, request.id);
  return request;
}
```

- Validation stays **before** `nextReferenceNumber` so a rejected submission does not burn a sequence number.
- The history timestamp now uses the same `now`, so year in reference and submission time always agree.

### 4 — Lookup by reference number

**File: `src/requests.js`** — add after `getRequest` (after line 35):

```js
export function getRequestByReference(referenceNumber) {
  const key = String(referenceNumber ?? '').trim().toUpperCase();
  const id = byReference.get(key);
  if (!id) throw new Error(`Request ${referenceNumber} not found`);
  return getRequest(id);
}
```

- Trim and upper-case the input, since staff type in numbers read out over the phone (`" kh-2026-000001 "` must work).
- Same error style as `getRequest`.

### 5 — README note

**File: `README.md`** — add one bullet after the `Tests:` line:

```md
- Every request gets a reference number `KH-YYYY-NNNNNN` (sequence restarts each year). Look it up with `getRequestByReference`.
```

---

## Edge Cases & Failure Modes

- **Invalid submission** (missing `citizenId`/`serviceId`) — throws before `nextReferenceNumber` runs; no sequence number is consumed. Enforced by order of statements in `submitRequest` (task 3).
- **Year rollover** — first request with `now` in a new UTC year gets `-000001`; the previous year's counter is untouched. Enforced by the per-year key in `yearCounters` (task 2).
- **Back-dated `now`** (e.g. a 2025 request after 2026 ones) — continues the 2025 counter; no collision with 2026 numbers. Enforced by per-year key.
- **Timezone edge** — a request at 2026-12-31 23:30 local time east of UTC may already be 2027 in UTC, or vice versa. Year is UTC by design (task 2); this matches the `history[].at` timestamps.
- **More than 999,999 requests in a year** — throws `Reference numbers exhausted for <year>`; no malformed 7-digit number is produced (task 2).
- **Lookup with lower case / spaces** — normalised by `trim().toUpperCase()` (task 4).
- **Lookup with `null`/`undefined`/unknown number** — throws `Request <value> not found` (task 4).
- **`resetStore()`** — clears counters too, so numbering restarts at `000001`. This is a test-only helper; "never reused" applies within a live store, not across resets. Store is in-memory, so a process restart also restarts numbering — accepted for this demo, persistence is out of scope.
- **Concurrency** — Node runs `submitRequest` synchronously on one thread; read-increment-write in `nextReferenceNumber` cannot interleave. No locking needed.

---

## Test Plan

All unit tests, added to `test/requests.test.js`, following the existing style (lines 7–28). Add `getRequestByReference` to the import on line 3.

1. **`a new request gets a reference number in KH-YYYY-NNNNNN format`** — submit with `{ now: new Date('2026-03-01T10:00:00Z') }`; assert `r.referenceNumber === 'KH-2026-000001'` and matches `/^KH-\d{4}-\d{6}$/`.
2. **`reference numbers increase by one within a year`** — submit 3 requests in 2026; assert `-000001`, `-000002`, `-000003`.
3. **`sequence restarts at 000001 in a new year`** — two requests in 2026, then one with `now` = `2027-01-01T00:00:00Z`; assert it is `KH-2027-000001`. Then one more in 2026 gives `KH-2026-000003`.
4. **`reference numbers are unique`** — submit 50 requests (mixing two years); assert `new Set(refs).size === 50`.
5. **`failed submission does not use a sequence number`** — `assert.throws(() => submitRequest({ serviceId: 'x' }, { now }))`, then a valid submit gets `-000001`.
6. **`staff can look up a request by reference number`** — submit, then `getRequestByReference(r.referenceNumber).id === r.id`; also works with `` ` ${ref.toLowerCase()} ` ``.
7. **`lookup of an unknown reference number throws`** — `assert.throws(() => getRequestByReference('KH-2026-999999'), /not found/)`.
8. **`existing default call still assigns a current-year reference`** — `submitRequest({ citizenId: 'c1', serviceId: 's' })` with no second arg; assert it starts with `` `KH-${new Date().getUTCFullYear()}-` ``.

Existing tests 1–4 (lines 7–28) stay unchanged and must still pass.

---

## Verification Steps

1. **Tests pass:** from the repo root run `npm test` — all tests green (4 existing + 8 new = 12).
2. **No new dependencies:** `git diff package.json` shows no change.
3. **Regression:** existing tests in `test/requests.test.js` lines 7–28 are unmodified (`git diff test/requests.test.js` shows only added lines plus the import change on line 3).

---

## Done Criteria

- [ ] `submitRequest` returns a `referenceNumber` in format `KH-YYYY-NNNNNN`.
- [ ] Sequence restarts at `000001` each calendar (UTC) year.
- [ ] Reference numbers are unique and never reused within a store.
- [ ] `getRequestByReference` is exported and finds a request by its number.
- [ ] Tests cover format, yearly reset, uniqueness and lookup.
- [ ] `npm test` passes; no new dependencies in `package.json`.
- [ ] `README.md` mentions reference numbers.
- [ ] `00-overview.md` lists this story.

**STOP HERE. Report to the user and wait for confirmation before proceeding to the next story.**
