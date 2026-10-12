import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { Status, resetStore, submitRequest, startReview, decide, getRequest, getRequestByReference, listRequestsByCitizen, MAX_ACTIVE_REVIEWS } from '../src/requests.js';

beforeEach(() => resetStore());

test('a new request starts as SUBMITTED', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 'birth-certificate' });
  assert.equal(r.status, Status.SUBMITTED);
});

test('review moves SUBMITTED to UNDER_REVIEW', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 'birth-certificate' });
  startReview(r.id, reviewer);
  assert.equal(getRequest(r.id).status, Status.UNDER_REVIEW);
});

test('staff can approve a request under review', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 'birth-certificate' });
  startReview(r.id, reviewer);
  decide(r.id, Status.APPROVED);
  assert.equal(getRequest(r.id).status, Status.APPROVED);
});

test('cannot decide a request that is not under review', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 'birth-certificate' });
  assert.throws(() => decide(r.id, Status.APPROVED));
});

const c = { citizenId: 'c1', serviceId: 'birth-certificate' };
let nextCitizen = 0;
const fresh = () => ({ citizenId: `citizen-${++nextCitizen}`, serviceId: 'birth-certificate' });
const reviewer = 'reviewer-1';
const startMany = (n, reviewerId) =>
  Array.from({ length: n }, () => startReview(submitRequest(fresh()).id, reviewerId));
const y2026 = { now: new Date('2026-03-01T10:00:00Z') };
const y2027 = { now: new Date('2027-01-01T00:00:00Z') };

test('a new request gets a reference number in KH-YYYY-NNNNNN format', () => {
  const r = submitRequest(c, y2026);
  assert.equal(r.referenceNumber, 'KH-2026-000001');
  assert.match(r.referenceNumber, /^KH-\d{4}-\d{6}$/);
});

test('reference numbers increase by one within a year', () => {
  const refs = [1, 2, 3].map(() => submitRequest(fresh(), y2026).referenceNumber);
  assert.deepEqual(refs, ['KH-2026-000001', 'KH-2026-000002', 'KH-2026-000003']);
});

test('sequence restarts at 000001 in a new year', () => {
  submitRequest(fresh(), y2026);
  submitRequest(fresh(), y2026);
  assert.equal(submitRequest(fresh(), y2027).referenceNumber, 'KH-2027-000001');
  assert.equal(submitRequest(fresh(), y2026).referenceNumber, 'KH-2026-000003');
});

test('reference numbers are unique', () => {
  const refs = [];
  for (let i = 0; i < 50; i++) refs.push(submitRequest(fresh(), i % 2 ? y2026 : y2027).referenceNumber);
  assert.equal(new Set(refs).size, 50);
});

test('failed submission does not use a sequence number', () => {
  assert.throws(() => submitRequest({ serviceId: 'x' }, y2026));
  assert.equal(submitRequest(c, y2026).referenceNumber, 'KH-2026-000001');
});

test('staff can look up a request by reference number', () => {
  const r = submitRequest(c, y2026);
  assert.equal(getRequestByReference(r.referenceNumber).id, r.id);
  assert.equal(getRequestByReference(` ${r.referenceNumber.toLowerCase()} `).id, r.id);
});

test('lookup of an unknown reference number throws', () => {
  assert.throws(() => getRequestByReference('KH-2026-999999'), /not found/);
});

test('existing default call still assigns a current-year reference', () => {
  const r = submitRequest({ citizenId: 'c1', serviceId: 's' });
  assert.ok(r.referenceNumber.startsWith(`KH-${new Date().getUTCFullYear()}-`));
});

test('duplicate submit while SUBMITTED is rejected with the existing reference number', () => {
  const r = submitRequest(c, y2026);
  assert.throws(
    () => submitRequest(c, y2026),
    (e) => e.code === 'DUPLICATE_REQUEST' && e.message.includes(r.referenceNumber) && e.referenceNumber === r.referenceNumber,
  );
});

test('duplicate submit while UNDER_REVIEW is rejected', () => {
  const r = submitRequest(c);
  startReview(r.id, reviewer);
  assert.throws(() => submitRequest(c), /already has an open request/);
});

test('a different service is allowed', () => {
  submitRequest(c);
  assert.doesNotThrow(() => submitRequest({ citizenId: 'c1', serviceId: 'passport' }));
  assert.equal(listRequestsByCitizen('c1').length, 2);
});

test('a different citizen can submit the same service', () => {
  submitRequest(c);
  assert.doesNotThrow(() => submitRequest({ citizenId: 'c2', serviceId: 'birth-certificate' }));
});

test('citizen can submit again after approval', () => {
  const r = submitRequest(c);
  startReview(r.id, reviewer);
  decide(r.id, Status.APPROVED);
  const again = submitRequest(c);
  assert.notEqual(again.id, r.id);
});

test('citizen can submit again after rejection', () => {
  const r = submitRequest(c);
  startReview(r.id, reviewer);
  decide(r.id, Status.REJECTED);
  const again = submitRequest(c);
  assert.notEqual(again.id, r.id);
});

test('rejected duplicate does not use a sequence number', () => {
  assert.equal(submitRequest(c, y2026).referenceNumber, 'KH-2026-000001');
  assert.throws(() => submitRequest(c, y2026));
  assert.equal(submitRequest(fresh(), y2026).referenceNumber, 'KH-2026-000002');
});

test('original request is unchanged after a rejected duplicate', () => {
  const r = submitRequest(c, y2026);
  assert.throws(() => submitRequest(c, y2026));
  assert.equal(getRequest(r.id).status, Status.SUBMITTED);
  assert.equal(listRequestsByCitizen('c1').length, 1);
});

test('starting a review without a reviewer id throws', () => {
  const r = submitRequest(fresh());
  assert.throws(() => startReview(r.id), /reviewerId is required/);
  assert.equal(getRequest(r.id).status, Status.SUBMITTED);
});

test('starting a review records the reviewer', () => {
  const r = submitRequest(fresh());
  startReview(r.id, reviewer);
  assert.equal(getRequest(r.id).reviewerId, reviewer);
});

test('a reviewer can hold up to the limit', () => {
  assert.equal(MAX_ACTIVE_REVIEWS, 5);
  const held = startMany(MAX_ACTIVE_REVIEWS, reviewer);
  assert.ok(held.every((r) => r.status === Status.UNDER_REVIEW));
});

test('starting one more than the limit is rejected', () => {
  startMany(MAX_ACTIVE_REVIEWS, reviewer);
  const r = submitRequest(fresh());
  assert.throws(
    () => startReview(r.id, reviewer),
    (e) => e.code === 'REVIEWER_AT_CAPACITY' && e.reviewerId === reviewer && e.message.includes(reviewer),
  );
  assert.equal(getRequest(r.id).status, Status.SUBMITTED);
  assert.equal(getRequest(r.id).reviewerId, undefined);
  assert.equal(getRequest(r.id).history.length, 1);
});

test('approving a request frees a slot', () => {
  const held = startMany(MAX_ACTIVE_REVIEWS, reviewer);
  decide(held[0].id, Status.APPROVED);
  const r = submitRequest(fresh());
  startReview(r.id, reviewer);
  assert.equal(getRequest(r.id).status, Status.UNDER_REVIEW);
});

test('rejecting a request frees a slot', () => {
  const held = startMany(MAX_ACTIVE_REVIEWS, reviewer);
  decide(held[0].id, Status.REJECTED);
  const r = submitRequest(fresh());
  startReview(r.id, reviewer);
  assert.equal(getRequest(r.id).status, Status.UNDER_REVIEW);
});

test("one reviewer's load does not block another", () => {
  startMany(MAX_ACTIVE_REVIEWS, reviewer);
  assert.doesNotThrow(() => startReview(submitRequest(fresh()).id, 'reviewer-2'));
});
