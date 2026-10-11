import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Status, resetStore, submitRequest, startReview, decide, getRequest } from '../src/requests.js';

beforeEach(() => resetStore());

test('a new request starts as SUBMITTED', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 'birth-certificate' });
  assert.equal(r.status, Status.SUBMITTED);
});

test('review moves SUBMITTED to UNDER_REVIEW', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 'birth-certificate' });
  startReview(r.id);
  assert.equal(getRequest(r.id).status, Status.UNDER_REVIEW);
});

test('staff can approve a request under review', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 'birth-certificate' });
  startReview(r.id);
  decide(r.id, Status.APPROVED);
  assert.equal(getRequest(r.id).status, Status.APPROVED);
});

test('cannot decide a request that is not under review', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 'birth-certificate' });
  assert.throws(() => decide(r.id, Status.APPROVED));
});
