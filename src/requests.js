// @ts-check
// Khidma — request lifecycle (in-memory demo store)
import { randomUUID } from 'node:crypto';

/**
 * @typedef {'SUBMITTED' | 'UNDER_REVIEW' | 'NEEDS_INFO' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN'} StatusValue
 * @typedef {{ status: StatusValue, at: string, note?: string }} HistoryEntry
 * @typedef {{
 *   id: string,
 *   referenceNumber: string,
 *   citizenId: string,
 *   serviceId: string,
 *   status: StatusValue,
 *   history: HistoryEntry[],
 *   reviewerId?: string,
 * }} RequestRecord
 * @typedef {Error & { code?: string, referenceNumber?: string, reviewerId?: string }} CodedError
 */

export const Status = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  NEEDS_INFO: 'NEEDS_INFO',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  WITHDRAWN: 'WITHDRAWN',
});

/** @type {Map<string, RequestRecord>} */
const requests = new Map();
/** @type {Map<number, number>} */
const yearCounters = new Map(); // year -> last sequence number used
/** @type {Map<string, string>} */
const byReference = new Map(); // referenceNumber -> request id

export function resetStore() {
  requests.clear();
  yearCounters.clear();
  byReference.clear();
}

const MAX_SEQUENCE = 999999;

/** @param {Date} now */
function nextReferenceNumber(now) {
  const year = now.getUTCFullYear();
  const next = (yearCounters.get(year) ?? 0) + 1;
  if (next > MAX_SEQUENCE) throw new Error(`Reference numbers exhausted for ${year}`);
  yearCounters.set(year, next);
  return `KH-${year}-${String(next).padStart(6, '0')}`;
}

/** @type {Set<StatusValue>} */
const OPEN_STATUSES = new Set([Status.SUBMITTED, Status.UNDER_REVIEW, Status.NEEDS_INFO]);

/**
 * @param {string} citizenId
 * @param {string} serviceId
 */
function findOpenRequest(citizenId, serviceId) {
  return listRequestsByCitizen(citizenId).find(
    (r) => r.serviceId === serviceId && OPEN_STATUSES.has(r.status),
  );
}

export const MAX_ACTIVE_REVIEWS = 5;

/** @param {string} reviewerId */
function countActiveReviews(reviewerId) {
  let count = 0;
  for (const r of requests.values()) {
    if (r.reviewerId === reviewerId && r.status === Status.UNDER_REVIEW) count++;
  }
  return count;
}

/**
 * @param {{ citizenId: string, serviceId: string }} input
 * @param {{ now?: Date }} [options]
 * @returns {RequestRecord}
 */
export function submitRequest({ citizenId, serviceId }, { now = new Date() } = {}) {
  if (!citizenId) throw new Error('citizenId is required');
  if (!serviceId) throw new Error('serviceId is required');
  const open = findOpenRequest(citizenId, serviceId);
  if (open) {
    /** @type {CodedError} */
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

/** @param {string} id */
export function getRequest(id) {
  const request = requests.get(id);
  if (!request) throw new Error(`Request ${id} not found`);
  return request;
}

/** @param {string} referenceNumber */
export function getRequestByReference(referenceNumber) {
  const key = String(referenceNumber ?? '').trim().toUpperCase();
  const id = byReference.get(key);
  if (!id) throw new Error(`Request ${referenceNumber} not found`);
  return getRequest(id);
}

/** @param {string} citizenId */
export function listRequestsByCitizen(citizenId) {
  return [...requests.values()].filter((r) => r.citizenId === citizenId);
}

/**
 * @param {RequestRecord} request
 * @param {StatusValue} to
 * @param {Date} [now]
 * @param {string} [note] saved on the history entry when given
 */
function transition(request, to, now = new Date(), note) {
  request.status = to;
  /** @type {HistoryEntry} */
  const entry = { status: to, at: now.toISOString() };
  if (note !== undefined) entry.note = note;
  request.history.push(entry);
  return request;
}

/**
 * The assigned reviewer sends a request back to the citizen for more
 * information. NEEDS_INFO frees the reviewer's slot but still counts as open,
 * so the citizen cannot submit a duplicate for the same service.
 * @param {string} id
 * @param {string} reviewerId
 * @param {string} note
 * @param {{ now?: Date }} [options]
 */
export function returnForInfo(id, reviewerId, note, { now = new Date() } = {}) {
  if (!reviewerId) throw new Error('reviewerId is required');
  if (typeof note !== 'string' || note.trim() === '') throw new Error('note is required');
  const request = getRequest(id);
  if (request.status !== Status.UNDER_REVIEW) {
    throw new Error(`Cannot return a request in ${request.status}`);
  }
  if (request.reviewerId !== reviewerId) {
    /** @type {CodedError} */
    const error = new Error(
      `Reviewer ${reviewerId} is not assigned to request ${request.referenceNumber}`,
    );
    error.code = 'NOT_ASSIGNED_REVIEWER';
    error.reviewerId = reviewerId;
    throw error;
  }
  return transition(request, Status.NEEDS_INFO, now, note);
}

/**
 * The owning citizen resubmits a request that was returned for more
 * information. The request goes back to SUBMITTED for any reviewer to pick up.
 * @param {string} id
 * @param {string} citizenId
 * @param {{ now?: Date }} [options]
 */
export function resubmitRequest(id, citizenId, { now = new Date() } = {}) {
  if (!citizenId) throw new Error('citizenId is required');
  const request = getRequest(id);
  if (request.citizenId !== citizenId) {
    /** @type {CodedError} */
    const error = new Error(
      `Citizen ${citizenId} does not own request ${request.referenceNumber}`,
    );
    error.code = 'NOT_REQUEST_OWNER';
    error.referenceNumber = request.referenceNumber;
    throw error;
  }
  if (request.status !== Status.NEEDS_INFO) {
    throw new Error(`Cannot resubmit a request in ${request.status}`);
  }
  delete request.reviewerId;
  return transition(request, Status.SUBMITTED, now);
}

/**
 * A citizen withdraws their own request before staff start the review.
 * WITHDRAWN is final: the request can no longer be reviewed or decided, and it
 * no longer counts as open for the duplicate guard.
 * @param {string} id
 * @param {string} citizenId
 * @param {{ now?: Date }} [options]
 */
export function withdrawRequest(id, citizenId, { now = new Date() } = {}) {
  if (!citizenId) throw new Error('citizenId is required');
  const request = getRequest(id);
  if (request.citizenId !== citizenId) {
    /** @type {CodedError} */
    const error = new Error(
      `Citizen ${citizenId} does not own request ${request.referenceNumber}`,
    );
    error.code = 'NOT_REQUEST_OWNER';
    error.referenceNumber = request.referenceNumber;
    throw error;
  }
  if (request.status !== Status.SUBMITTED) {
    throw new Error(`Cannot withdraw a request in ${request.status}`);
  }
  return transition(request, Status.WITHDRAWN, now);
}

/**
 * @param {string} id
 * @param {string} reviewerId
 */
export function startReview(id, reviewerId) {
  if (!reviewerId) throw new Error('reviewerId is required');
  const request = getRequest(id);
  if (request.status !== Status.SUBMITTED) {
    throw new Error(`Cannot start review from ${request.status}`);
  }
  if (countActiveReviews(reviewerId) >= MAX_ACTIVE_REVIEWS) {
    /** @type {CodedError} */
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

/**
 * @param {string} id
 * @param {string} decision
 */
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
