// Khidma — request lifecycle (in-memory demo store)
import { randomUUID } from 'node:crypto';

export const Status = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const requests = new Map();
const yearCounters = new Map(); // year -> last sequence number used
const byReference = new Map(); // referenceNumber -> request id

export function resetStore() {
  requests.clear();
  yearCounters.clear();
  byReference.clear();
}

const MAX_SEQUENCE = 999999;

function nextReferenceNumber(now) {
  const year = now.getUTCFullYear();
  const next = (yearCounters.get(year) ?? 0) + 1;
  if (next > MAX_SEQUENCE) throw new Error(`Reference numbers exhausted for ${year}`);
  yearCounters.set(year, next);
  return `KH-${year}-${String(next).padStart(6, '0')}`;
}

const OPEN_STATUSES = new Set([Status.SUBMITTED, Status.UNDER_REVIEW]);

function findOpenRequest(citizenId, serviceId) {
  return listRequestsByCitizen(citizenId).find(
    (r) => r.serviceId === serviceId && OPEN_STATUSES.has(r.status),
  );
}

export const MAX_ACTIVE_REVIEWS = 5;

function countActiveReviews(reviewerId) {
  let count = 0;
  for (const r of requests.values()) {
    if (r.reviewerId === reviewerId && r.status === Status.UNDER_REVIEW) count++;
  }
  return count;
}

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

export function getRequest(id) {
  const request = requests.get(id);
  if (!request) throw new Error(`Request ${id} not found`);
  return request;
}

export function getRequestByReference(referenceNumber) {
  const key = String(referenceNumber ?? '').trim().toUpperCase();
  const id = byReference.get(key);
  if (!id) throw new Error(`Request ${referenceNumber} not found`);
  return getRequest(id);
}

export function listRequestsByCitizen(citizenId) {
  return [...requests.values()].filter((r) => r.citizenId === citizenId);
}

function transition(request, to) {
  request.status = to;
  request.history.push({ status: to, at: new Date().toISOString() });
  return request;
}

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

export function decide(id, decision) {
  const request = getRequest(id);
  if (request.status !== Status.UNDER_REVIEW) {
    throw new Error(`Cannot decide a request in ${request.status}`);
  }
  if (decision !== Status.APPROVED && decision !== Status.REJECTED) {
    throw new Error('decision must be APPROVED or REJECTED');
  }
  return transition(request, decision);
}
