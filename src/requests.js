// Khidma — request lifecycle (in-memory demo store)
import { randomUUID } from 'node:crypto';

export const Status = Object.freeze({
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
});

const requests = new Map();

export function resetStore() {
  requests.clear();
}

export function submitRequest({ citizenId, serviceId }) {
  if (!citizenId) throw new Error('citizenId is required');
  if (!serviceId) throw new Error('serviceId is required');
  const request = {
    id: randomUUID(),
    citizenId,
    serviceId,
    status: Status.SUBMITTED,
    history: [{ status: Status.SUBMITTED, at: new Date().toISOString() }],
  };
  requests.set(request.id, request);
  return request;
}

export function getRequest(id) {
  const request = requests.get(id);
  if (!request) throw new Error(`Request ${id} not found`);
  return request;
}

export function listRequestsByCitizen(citizenId) {
  return [...requests.values()].filter((r) => r.citizenId === citizenId);
}

function transition(request, to) {
  request.status = to;
  request.history.push({ status: to, at: new Date().toISOString() });
  return request;
}

export function startReview(id) {
  const request = getRequest(id);
  if (request.status !== Status.SUBMITTED) {
    throw new Error(`Cannot start review from ${request.status}`);
  }
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
