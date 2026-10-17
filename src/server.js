// @ts-check
// Khidma — local HTTP shell over the request lifecycle module.
//
// The server owns no business rules. Every handler passes its input straight
// to src/requests.js and maps the result, or the thrown error, to an HTTP
// status and a JSON body. Handlers are pure functions (request in, status plus
// body out) so the node:http listener below is a thin adapter over them.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import {
  submitRequest,
  withdrawRequest,
  resubmitRequest,
  getRequest,
  getRequestByReference,
  listRequestsByCitizen,
} from './requests.js';

/**
 * @typedef {{ method: string, path: string, rawBody?: string }} ShellRequest
 * @typedef {{ status: number, body: unknown, headers?: Record<string, string> }} ShellResponse
 * @typedef {(params: Record<string, string>, body: any) => ShellResponse} RouteHandler
 * @typedef {{ method: string, pattern: RegExp, handle: RouteHandler }} Route
 * @typedef {import('./requests.js').CodedError} CodedError
 */

export const DEFAULT_PORT = 3000;
export const DEFAULT_HOST = '127.0.0.1';

// --- Error mapping -----------------------------------------------------------

/**
 * HTTP status per business-rule error code raised by src/requests.js.
 * An unknown future code falls back to 409.
 * @type {Record<string, number>}
 */
const CODE_STATUS = Object.freeze({
  DUPLICATE_REQUEST: 409,
  REVIEWER_AT_CAPACITY: 409,
  NOT_REQUEST_OWNER: 403,
  NOT_ASSIGNED_REVIEWER: 403,
});

/** Code used in the body when the module error carries none. */
const STATUS_CODE = Object.freeze({
  400: 'VALIDATION_ERROR',
  404: 'NOT_FOUND',
  409: 'INVALID_STATE',
  500: 'INTERNAL_ERROR',
});

/**
 * Map one thrown value to an HTTP response.
 *
 * | Thrown value                                   | Status |
 * |------------------------------------------------|--------|
 * | Error with a known `code`                      | table above |
 * | Error with an unknown `code`                   | 409 |
 * | Plain Error whose message ends in `not found`  | 404 |
 * | Plain Error whose message starts with `Cannot` | 409 |
 * | Any other plain Error                          | 400 |
 * | Anything else (TypeError, string, ...)         | 500 |
 *
 * "Plain" means constructed with `Error` itself. A TypeError or RangeError is
 * a bug in the shell, not a module rule, so it reports as 500.
 * @param {unknown} error
 * @returns {ShellResponse}
 */
export function errorResponse(error) {
  if (!(error instanceof Error) || error.constructor !== Error) {
    return { status: 500, body: { code: STATUS_CODE[500], message: 'Internal error' } };
  }
  const coded = /** @type {CodedError} */ (error);
  let status;
  if (typeof coded.code === 'string') {
    status = CODE_STATUS[coded.code] ?? 409;
  } else if (coded.message.endsWith('not found')) {
    status = 404;
  } else if (coded.message.startsWith('Cannot')) {
    status = 409;
  } else {
    status = 400;
  }
  /** @type {{ code: string, message: string, referenceNumber?: string, reviewerId?: string }} */
  const body = {
    code: coded.code ?? STATUS_CODE[/** @type {keyof typeof STATUS_CODE} */ (status)],
    message: coded.message,
  };
  if (coded.referenceNumber !== undefined) body.referenceNumber = coded.referenceNumber;
  if (coded.reviewerId !== undefined) body.reviewerId = coded.reviewerId;
  return { status, body };
}

// --- Routes ------------------------------------------------------------------

/**
 * Citizen-path routes. Reviewer routes (start review, return for info,
 * decide) belong to the next slice.
 * @type {Route[]}
 */
const ROUTES = [
  {
    method: 'POST',
    pattern: /^\/requests$/,
    handle: (_params, body) => ({ status: 201, body: submitRequest(body) }),
  },
  {
    method: 'GET',
    pattern: /^\/requests\/by-reference\/(?<referenceNumber>[^/]+)$/,
    handle: (params) => ({ status: 200, body: getRequestByReference(params.referenceNumber) }),
  },
  {
    method: 'GET',
    pattern: /^\/requests\/(?<id>[^/]+)$/,
    handle: (params) => ({ status: 200, body: getRequest(params.id) }),
  },
  {
    method: 'POST',
    pattern: /^\/requests\/(?<id>[^/]+)\/withdraw$/,
    handle: (params, body) => ({ status: 200, body: withdrawRequest(params.id, body.citizenId) }),
  },
  {
    method: 'POST',
    pattern: /^\/requests\/(?<id>[^/]+)\/resubmit$/,
    handle: (params, body) => ({ status: 200, body: resubmitRequest(params.id, body.citizenId) }),
  },
  {
    method: 'GET',
    pattern: /^\/citizens\/(?<citizenId>[^/]+)\/requests$/,
    handle: (params) => ({ status: 200, body: listRequestsByCitizen(params.citizenId) }),
  },
];

/**
 * Parse the request body. An empty body is an empty object so handlers can
 * destructure it. Malformed JSON is a server-raised 400.
 * @param {string | undefined} rawBody
 * @returns {{ ok: true, body: any } | { ok: false, response: ShellResponse }}
 */
function parseBody(rawBody) {
  if (rawBody === undefined || rawBody.trim() === '') return { ok: true, body: {} };
  try {
    return { ok: true, body: JSON.parse(rawBody) ?? {} };
  } catch {
    return {
      ok: false,
      response: { status: 400, body: { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON' } },
    };
  }
}

/**
 * Route one request to its handler. Pure: no I/O, no shared state beyond the
 * module store that src/requests.js owns.
 * @param {ShellRequest} request
 * @returns {ShellResponse}
 */
export function handleRequest({ method, path, rawBody }) {
  const pathname = path.split('?')[0];
  /** @type {string[]} */
  const allowed = [];
  for (const route of ROUTES) {
    const match = route.pattern.exec(pathname);
    if (!match) continue;
    if (route.method !== method) {
      allowed.push(route.method);
      continue;
    }
    const parsed = parseBody(rawBody);
    if (!parsed.ok) return parsed.response;
    try {
      return route.handle(decodeParams(match.groups ?? {}), parsed.body);
    } catch (error) {
      return errorResponse(error);
    }
  }
  if (allowed.length > 0) {
    return {
      status: 405,
      headers: { Allow: allowed.join(', ') },
      body: { code: 'METHOD_NOT_ALLOWED', message: `${method} is not allowed on ${pathname}` },
    };
  }
  return { status: 404, body: { code: 'NOT_FOUND', message: `No route for ${method} ${pathname}` } };
}

/**
 * @param {Record<string, string>} groups
 * @returns {Record<string, string>}
 */
function decodeParams(groups) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, value] of Object.entries(groups)) out[key] = decodeURIComponent(value);
  return out;
}

// --- node:http adapter -------------------------------------------------------

/**
 * @param {http.IncomingMessage} req
 * @returns {Promise<string>}
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    /** @type {Buffer[]} */
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse} res
 */
async function listener(req, res) {
  /** @type {ShellResponse} */
  let response;
  try {
    const rawBody = await readBody(req);
    response = handleRequest({ method: req.method ?? 'GET', path: req.url ?? '/', rawBody });
  } catch (error) {
    response = errorResponse(error);
  }
  res.writeHead(response.status, { 'Content-Type': 'application/json', ...(response.headers ?? {}) });
  res.end(JSON.stringify(response.body));
}

/**
 * Start the server. Binds to loopback by default so only this machine can
 * reach the demo. Port 0 asks the OS for a free port.
 * @param {{ port?: number, host?: string }} [options]
 * @returns {Promise<http.Server>}
 */
export function startServer({ port = DEFAULT_PORT, host = DEFAULT_HOST } = {}) {
  const server = http.createServer(listener);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  startServer({ port }).then((server) => {
    const address = /** @type {import('node:net').AddressInfo} */ (server.address());
    console.log(`Khidma demo server listening on http://${address.address}:${address.port}`);
    console.log('Fictional demo. In-memory store. No sign-in. State resets on restart.');
  });
}
