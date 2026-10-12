# Story 03 — Reviewer load limit (Story: KH-103)

## Prerequisites

- Story 01 completed: [../reference-number/01-story-reference-number.md](../reference-number/01-story-reference-number.md).
- Story 02 completed: [../duplicate-guard/02-story-duplicate-guard.md](../duplicate-guard/02-story-duplicate-guard.md). The duplicate guard means one citizen cannot have two open requests for the same service. To create 6 open requests in one test, use the **`fresh()`** helper from Story 02 (one new citizen per request).
- Stories 01 and 02 are in the working tree today (`src/requests.js`, `test/requests.test.js`, `README.md`), and `npm test` passes (**20 tests**, 0 failures).

---

## Story Goal

One reviewer cannot have too many requests on their desk at once.

1. `startReview` now needs a **reviewer id**: `startReview(id, reviewerId)`. Without it, it throws.
2. The request remembers who is reviewing it (`request.reviewerId`).
3. A reviewer can have at most **5** requests in `UNDER_REVIEW` at the same time. Starting a 6th throws a clear error, and the request stays `SUBMITTED`.
4. When one of the reviewer's requests gets a decision (`APPROVED` or `REJECTED`), it no longer counts, so they can start another.
5. The limit is one exported constant, **`MAX_ACTIVE_REVIEWS`**, so it is easy to change later.

**Not in scope:** reassigning a review to another reviewer, checking that `decide` is called by the same reviewer, per-reviewer limits, any HTTP/UI layer, persistence, validating that the reviewer id belongs to real staff.

---

## Context — Read These Files First

1. `src/requests.js` — the whole module (104 lines). Note:
   - `Status` (lines 4–9).
   - `const OPEN_STATUSES = …` and `findOpenRequest` (lines 31–37) — the Story 02 pattern: a private module constant plus a private lookup helper. Follow the same style for the reviewer count.
   - `submitRequest` (lines 39–62) — the error with `error.code = 'DUPLICATE_REQUEST'` (lines 44–49) is the pattern for the new error.
   - `transition(request, to)` (lines 81–85) — sets status and pushes a history entry. Do **not** change it.
   - `startReview(id)` (lines 87–93) — the function this story changes.
   - `decide(id, decision)` (lines 95–104) — moves a request out of `UNDER_REVIEW`. Do **not** change it. Once the status changes, the request stops counting toward the limit.
2. `test/requests.test.js` — 20 tests (lines 1–132). Note:
   - Line 3: the import. Add `MAX_ACTIVE_REVIEWS`.
   - `startReview(r.id)` is called **5 times**: lines 14, 20, 90, 107, 115. All five must pass a reviewer id after this story (task 3).
   - `fresh()` helper (lines 31–32) — use it to create many requests without hitting the duplicate guard.
3. `.squad/plans/duplicate-guard/02-story-duplicate-guard.md` — precedent for the error shape (`message` + `code` + extra field) and for "check before changing state".
4. `README.md` — 12 lines. Add one bullet after line 10.
5. `tickets/KH-103.md` — the original ticket (same text as the intake).

---

## Product rules (from story)

| Situation | Today | After this story |
|---|---|---|
| `startReview(id)` with no reviewer id | moves to `UNDER_REVIEW` | **throws** `reviewerId is required`; request stays `SUBMITTED` |
| Reviewer has 0–4 requests `UNDER_REVIEW` | — | review starts; `request.reviewerId` is set |
| Reviewer has 5 requests `UNDER_REVIEW` | — | **throws** `REVIEWER_AT_CAPACITY`; request stays `SUBMITTED` |
| One of those 5 gets `APPROVED`/`REJECTED` | — | reviewer can start another review |
| Another reviewer, with fewer than 5 | — | not affected by the first reviewer's load |

---

## Implementation tasks

### 1 — Add the limit constant and the count helper

**File: `src/requests.js`**

Right after `findOpenRequest` (after line 37), add:

```js
export const MAX_ACTIVE_REVIEWS = 5;

function countActiveReviews(reviewerId) {
  let count = 0;
  for (const r of requests.values()) {
    if (r.reviewerId === reviewerId && r.status === Status.UNDER_REVIEW) count++;
  }
  return count;
}
```

- **Export** `MAX_ACTIVE_REVIEWS` so tests (and later callers) use the same number. Changing the limit later is a one-line edit here.
- Keep `countActiveReviews` **private**.
- Count only `UNDER_REVIEW`. `APPROVED`/`REJECTED` requests keep their `reviewerId` but do not count.

### 2 — Change `startReview`

**File: `src/requests.js`** (lines 87–93)

Replace the function with:

```js
export function startReview(id, reviewerId) {
  if (!reviewerId) throw new Error('reviewerId is required');
  const request = getRequest(id);
  if (request.status !== Status.SUBMITTED) {
    throw new Error(`Cannot start review from ${request.status}`);
  }
  if (countActiveReviews(reviewerId) >= MAX_ACTIVE_REVIEWS) {
    const error = new Error(
      `Reviewer ${reviewerId} already has ${MAX_ACTIVE_REVIEWS} requests under review`,
    );
    error.code = 'REVIEWER_AT_CAPACITY';
    error.reviewerId = reviewerId;
    throw error;
  }
  request.reviewerId = reviewerId;
  return transition(request, Status.UNDER_REVIEW);
}
```

- **Order matters:** reviewer id check → load request → status check → limit check → set `reviewerId` → `transition`. Every `throw` happens **before** any change to the request, so a failed call leaves it exactly as it was (status `SUBMITTED`, no `reviewerId`).
- The message uses `MAX_ACTIVE_REVIEWS`, not a hard-coded `5`.
- Do **not** change `decide`, `transition` or `submitRequest`.
- `submitRequest` (line 51–58) does **not** add a `reviewerId` field. It appears only after `startReview`. Do not add `reviewerId: null` there.

### 3 — Update the existing `startReview` calls in tests

**File: `test/requests.test.js`**

Add a reviewer fixture under `fresh` (after line 32):

```js
const reviewer = 'reviewer-1';
```

Then change `startReview(r.id)` to `startReview(r.id, reviewer)` at lines **14, 20, 90, 107, 115**. Nothing else in these tests changes.

`const reviewer` is defined on line 33, below the tests at lines 12–23. That is fine: the test bodies run after the whole module is loaded, so the binding is ready.

Add `MAX_ACTIVE_REVIEWS` to the import on line 3.

### 4 — README note

**File: `README.md`** — add one bullet after line 10:

```md
- `startReview(id, reviewerId)` needs a reviewer id. A reviewer can have at most `MAX_ACTIVE_REVIEWS` (5) requests `UNDER_REVIEW` at once; a decision frees a slot.
```

---

## Edge Cases & Failure Modes

- **No reviewer id** (`undefined`, `null`, `''`) — throws `reviewerId is required` before anything else (task 2, first line). Request unchanged.
- **Unknown request id** — `getRequest` throws `not found` (lines 64–68), same as today. Reviewer id is checked first, so a call with both missing reports the reviewer id.
- **Request not `SUBMITTED`** — throws `Cannot start review from …`, same as today. This runs **before** the limit check, so a full reviewer calling on an already-reviewed request gets the status error, not the capacity error.
- **6th review** — `countActiveReviews` returns 5, `5 >= 5`, throws `REVIEWER_AT_CAPACITY`. The request stays `SUBMITTED`, has no `reviewerId`, and its `history` is unchanged (no new entry).
- **Slot freed by a decision** — `decide` sets the status to `APPROVED`/`REJECTED`, so `countActiveReviews` stops counting it. Both decisions must free a slot (Test Plan items 5 and 6).
- **Another reviewer** — counted separately by `reviewerId ===`. A full `reviewer-1` does not block `reviewer-2`.
- **Reviewer id case/whitespace** (`'Reviewer-1'` vs `'reviewer-1'`) — treated as different reviewers. Exact match on purpose; normalisation is out of scope.
- **Limit changed later** — only `MAX_ACTIVE_REVIEWS` changes. The tests loop up to `MAX_ACTIVE_REVIEWS`, so they keep working for any value ≥ 1.
- **Concurrency** — `startReview` is synchronous on one thread, so count-then-transition cannot interleave. No lock needed.
- **Performance** — `countActiveReviews` scans the whole store (O(n)), same as `listRequestsByCitizen`. Fine for the in-memory demo.
- **`resetStore()`** (lines 15–19) — clears `requests`, so all counts go to 0. No new store was added, so `resetStore` needs no change.
- **Breaking API change** — any caller of `startReview(id)` without a reviewer id now throws. The only callers in the repo are the 5 test lines in task 3 (confirmed by `grep -rn startReview src test`).

---

## Test Plan

All unit tests go in `test/requests.test.js`, in the style of lines 80–132 (one `test()` per behaviour, `node:assert/strict`). Add this helper next to `reviewer` (task 3) so the new tests stay short:

```js
const startMany = (n, reviewerId) =>
  Array.from({ length: n }, () => startReview(submitRequest(fresh()).id, reviewerId));
```

**Modify** (task 3): the 5 existing `startReview(r.id)` calls get `reviewer`. No assertion changes.

**Add** at the end of the file:

1. **`starting a review without a reviewer id throws`** — submit `fresh()`, `assert.throws(() => startReview(r.id), /reviewerId is required/)`, then `getRequest(r.id).status === Status.SUBMITTED`.
2. **`starting a review records the reviewer`** — submit, `startReview(r.id, reviewer)`, then `getRequest(r.id).reviewerId === reviewer`.
3. **`a reviewer can hold up to the limit`** — `assert.equal(MAX_ACTIVE_REVIEWS, 5)`; `startMany(MAX_ACTIVE_REVIEWS, reviewer)` does not throw and every returned request is `UNDER_REVIEW`.
4. **`starting one more than the limit is rejected`** — `startMany(MAX_ACTIVE_REVIEWS, reviewer)`, submit one more `r`, then `assert.throws(() => startReview(r.id, reviewer), (e) => e.code === 'REVIEWER_AT_CAPACITY' && e.reviewerId === reviewer && e.message.includes(reviewer))`. Then assert `getRequest(r.id).status === Status.SUBMITTED`, `getRequest(r.id).reviewerId === undefined` and `getRequest(r.id).history.length === 1`.
5. **`approving a request frees a slot`** — `const held = startMany(MAX_ACTIVE_REVIEWS, reviewer)`, `decide(held[0].id, Status.APPROVED)`, then a new request's `startReview(…, reviewer)` succeeds and is `UNDER_REVIEW`.
6. **`rejecting a request frees a slot`** — same as 5 with `Status.REJECTED`.
7. **`one reviewer's load does not block another`** — `startMany(MAX_ACTIVE_REVIEWS, reviewer)`, then `startReview(submitRequest(fresh()).id, 'reviewer-2')` does not throw.

Existing tests stay green.

---

## Verification Steps

1. **Tests pass:** from the repo root, run `npm test`. All green: 20 existing + 7 new = **27**.
2. **No new dependencies:** `git diff package.json` shows no change.
3. **No old calls left:** `grep -rn "startReview(r.id)" test` returns nothing; `grep -rn startReview src test` shows only the new signature and calls with a reviewer id.
4. **Regression:** in `git diff test/requests.test.js`, the only changes to existing tests are the added `reviewer` argument and the line 3 import.
5. **Order check:** in `src/requests.js`, `request.reviewerId = reviewerId` comes **after** all `throw`s in `startReview` and right before `transition`.
6. **Limit is one place:** `grep -nw 5 src/requests.js` shows the number `5` only in `MAX_ACTIVE_REVIEWS = 5` (not in the error message or the check).

---

## Done Criteria

- [ ] `startReview(id, reviewerId)` needs a reviewer id; without it, it throws and the request stays `SUBMITTED`.
- [ ] The request stores `reviewerId` once the review starts.
- [ ] A reviewer can have at most 5 requests `UNDER_REVIEW` at once.
- [ ] The 6th start throws a clear error (`error.code === 'REVIEWER_AT_CAPACITY'`, message names the reviewer and the limit) and leaves the request unchanged.
- [ ] After one of the reviewer's requests is `APPROVED` or `REJECTED`, they can start another.
- [ ] The limit is the single exported constant `MAX_ACTIVE_REVIEWS`.
- [ ] Tests cover the limit and freeing a slot; existing `startReview` calls updated; `npm test` passes (27 tests).
- [ ] No new dependencies in `package.json`.
- [ ] `README.md` mentions the reviewer limit.

**STOP HERE. Report to the user and wait for confirmation before proceeding to the next story.**
