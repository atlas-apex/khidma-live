import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Status, resetStore, submitRequest, startReview, returnForInfo, withdrawRequest } from '../src/requests.js';
import { handleRequest, errorResponse, startServer } from '../src/server.js';

beforeEach(() => resetStore());

const c1 = { citizenId: 'c1', serviceId: 'birth-certificate' };
const json = (value) => JSON.stringify(value);
const post = (path, body) => handleRequest({ method: 'POST', path, rawBody: json(body) });
const get = (path) => handleRequest({ method: 'GET', path });

// --- One test per route ------------------------------------------------------

test('POST /requests submits a request and returns 201', () => {
  const res = post('/requests', c1);
  assert.equal(res.status, 201);
  assert.equal(res.body.status, Status.SUBMITTED);
  assert.match(res.body.referenceNumber, /^KH-\d{4}-\d{6}$/);
});

test('POST /requests/:id/withdraw withdraws the citizen\'s own request', () => {
  const r = submitRequest(c1);
  const res = post(`/requests/${r.id}/withdraw`, { citizenId: 'c1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, Status.WITHDRAWN);
});

test('POST /requests/:id/resubmit puts a NEEDS_INFO request back in SUBMITTED', () => {
  const r = submitRequest(c1);
  startReview(r.id, 'reviewer-1');
  returnForInfo(r.id, 'reviewer-1', 'Attach a copy of your ID');
  const res = post(`/requests/${r.id}/resubmit`, { citizenId: 'c1' });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, Status.SUBMITTED);
});

test('GET /requests/:id returns the request', () => {
  const r = submitRequest(c1);
  const res = get(`/requests/${r.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, r.id);
});

test('GET /requests/by-reference/:ref returns the request', () => {
  const r = submitRequest(c1);
  const res = get(`/requests/by-reference/${r.referenceNumber}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.id, r.id);
});

test('GET /citizens/:citizenId/requests lists that citizen\'s requests', () => {
  submitRequest(c1);
  submitRequest({ citizenId: 'c1', serviceId: 'passport' });
  submitRequest({ citizenId: 'c2', serviceId: 'passport' });
  const res = get('/citizens/c1/requests');
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.ok(res.body.every((r) => r.citizenId === 'c1'));
});

// --- One test per error family -----------------------------------------------

test('DUPLICATE_REQUEST returns 409 with code, message, and referenceNumber', () => {
  const first = submitRequest(c1);
  const res = post('/requests', c1);
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'DUPLICATE_REQUEST');
  assert.equal(res.body.referenceNumber, first.referenceNumber);
  assert.match(res.body.message, /already has an open request/);
});

test('NOT_REQUEST_OWNER returns 403 with code, message, and referenceNumber', () => {
  const r = submitRequest(c1);
  const res = post(`/requests/${r.id}/withdraw`, { citizenId: 'someone-else' });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, 'NOT_REQUEST_OWNER');
  assert.equal(res.body.referenceNumber, r.referenceNumber);
});

test('REVIEWER_AT_CAPACITY and NOT_ASSIGNED_REVIEWER map to 409 and 403 with reviewerId', () => {
  const capacity = Object.assign(new Error('Reviewer r1 already has 5 requests under review'), {
    code: 'REVIEWER_AT_CAPACITY',
    reviewerId: 'r1',
  });
  const notAssigned = Object.assign(new Error('Reviewer r2 is not assigned to request KH-2026-000001'), {
    code: 'NOT_ASSIGNED_REVIEWER',
    reviewerId: 'r2',
  });
  assert.deepEqual(errorResponse(capacity), {
    status: 409,
    body: { code: 'REVIEWER_AT_CAPACITY', message: capacity.message, reviewerId: 'r1' },
  });
  assert.deepEqual(errorResponse(notAssigned), {
    status: 403,
    body: { code: 'NOT_ASSIGNED_REVIEWER', message: notAssigned.message, reviewerId: 'r2' },
  });
});

test('an unknown future error code returns 409 and keeps the code', () => {
  const res = errorResponse(Object.assign(new Error('Some new rule'), { code: 'FUTURE_RULE' }));
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'FUTURE_RULE');
});

test('a validation error from the module returns 400', () => {
  const res = post('/requests', {});
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'VALIDATION_ERROR');
  assert.equal(res.body.message, 'citizenId is required');
});

test('a state error from the module returns 409', () => {
  const r = submitRequest(c1);
  withdrawRequest(r.id, 'c1');
  const res = post(`/requests/${r.id}/withdraw`, { citizenId: 'c1' });
  assert.equal(res.status, 409);
  assert.equal(res.body.code, 'INVALID_STATE');
  assert.equal(res.body.message, 'Cannot withdraw a request in WITHDRAWN');
});

test('a not-found error from the module returns 404', () => {
  const res = get('/requests/no-such-id');
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
  assert.equal(res.body.message, 'Request no-such-id not found');
});

test('anything that is not a plain Error returns 500 without leaking the message', () => {
  assert.equal(errorResponse(new TypeError('cannot read properties of undefined')).status, 500);
  assert.equal(errorResponse('a string').status, 500);
  assert.deepEqual(errorResponse(new TypeError('secret')).body, {
    code: 'INTERNAL_ERROR',
    message: 'Internal error',
  });
});

test('malformed JSON returns 400 before the module is called', () => {
  const res = handleRequest({ method: 'POST', path: '/requests', rawBody: '{not json' });
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'MALFORMED_JSON');
});

test('a path segment that is not valid URL encoding returns 400', () => {
  const res = get('/requests/%E0%A4%A');
  assert.equal(res.status, 400);
  assert.equal(res.body.code, 'MALFORMED_PATH');
});

test('an unknown route returns 404', () => {
  const res = get('/nothing/here');
  assert.equal(res.status, 404);
  assert.equal(res.body.code, 'NOT_FOUND');
});

test('a wrong method returns 405 with an Allow header', () => {
  const res = handleRequest({ method: 'DELETE', path: '/requests' });
  assert.equal(res.status, 405);
  assert.equal(res.body.code, 'METHOD_NOT_ALLOWED');
  assert.equal(res.headers.Allow, 'POST');
});

// --- One socket round trip ---------------------------------------------------

test('startServer binds to 127.0.0.1 and serves one round trip', async () => {
  const server = await startServer({ port: 0 });
  after(() => server.close());
  const { address, port } = server.address();
  assert.equal(address, '127.0.0.1');
  const res = await fetch(`http://127.0.0.1:${port}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: json(c1),
  });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('content-type'), 'application/json');
  const body = await res.json();
  assert.equal(body.status, Status.SUBMITTED);
  await new Promise((resolve) => server.close(resolve));
});
