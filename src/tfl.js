// -----------------------------------------------------------------------------
// The TfL Unified API (https://api.tfl.gov.uk), open data, usable without a key:
// line statuses, line lookup, stop search, stop details and arrival
// predictions.
//
// The optional `app_key` (free, from https://api-portal.tfl.gov.uk) raises the
// quota to 500 requests a minute. It travels in the query string, so a URL is
// never logged nor put in an error message: errors name the host only.
// -----------------------------------------------------------------------------

export const API_URL = 'https://api.tfl.gov.uk';
const HOST = 'api.tfl.gov.uk';
const TIMEOUT_MS = 15000;

// The rail modes TfL reports a status for; `/Line/Mode/{modes}/Status` lists
// their lines, used to resolve a line typed by name ("Elizabeth line").
export const RAIL_MODES = ['tube', 'overground', 'dlr', 'elizabeth-line', 'tram'];
// The modes of the stop search: the rail modes and the buses.
export const SEARCH_MODES = [...RAIL_MODES, 'bus'];
// Line ids are lower case words, digits and dashes ("victoria", "73", "n29").
export const LINE_ID = /^[a-z0-9][a-z0-9-]{0,40}$/;
// Stop point ids (NaPTAN): "940GZZLUOXC", "490000031E", "HUBBRX", "910GPADTLL".
export const STOP_ID = /^[A-Z0-9]{4,20}$/;
// Line ids per status request: the API accepts a list, kept short.
const STATUS_BATCH = 20;

export class TflError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class Tfl {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch]
   * @param {() => string} [options.appKey] read at each request (config hot reload)
   */
  constructor({ fetch: fetchImpl = globalThis.fetch, appKey = () => '' } = {}) {
    this.fetch = fetchImpl;
    this.appKey = appKey;
  }

  /** GET `path`; null on a 404 when `allowMissing`. */
  async get(path, params = {}, { allowMissing = false } = {}) {
    const url = new URL(path, API_URL);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }
    const key = this.appKey();
    if (key) {
      url.searchParams.set('app_key', key);
    }
    let response;
    try {
      response = await this.fetch(url.toString(), {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new TflError(`${HOST}: ${err.name === 'TimeoutError' ? 'timeout' : 'unreachable'}`);
    }
    if (response.status === 404 && allowMissing) {
      return null;
    }
    if (!response.ok) {
      const hint = { 401: ' (app_key refused)', 403: ' (app_key refused)', 429: ' (quota)' };
      // TfL answers a wrong key with a 429 too, and says so in the body.
      if (response.status === 429 && key) {
        const body = await response.text().catch(() => '');
        if (/invalid app_key/i.test(body)) {
          hint[429] = ' (app_key refused)';
        }
      }
      throw new TflError(
        `${HOST}: HTTP ${response.status}${hint[response.status] ?? ''}`,
        response.status,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new TflError(`${HOST}: invalid JSON`);
    }
  }

  /**
   * The current status of lines, by id, in batches.
   * @param {string[]} ids
   * @returns {Promise<Map<string, object>>} line id → raw TfL line (with lineStatuses)
   */
  async lineStatuses(ids) {
    const valid = [...new Set(ids)].filter((id) => LINE_ID.test(id));
    const found = new Map();
    for (let index = 0; index < valid.length; index += STATUS_BATCH) {
      const batch = valid.slice(index, index + STATUS_BATCH);
      const body = await this.get(`/Line/${batch.join(',')}/Status`);
      for (const line of Array.isArray(body) ? body : []) {
        if (line?.id) {
          found.set(line.id, line);
        }
      }
    }
    return found;
  }

  /** The lines of the rail modes: [{ id, name, mode }]. */
  async railLines() {
    const body = await this.get(`/Line/Mode/${RAIL_MODES.join(',')}/Status`);
    return (Array.isArray(body) ? body : [])
      .filter((line) => line?.id)
      .map((line) => ({ id: line.id, name: line.name ?? line.id, mode: line.modeName ?? '' }));
  }

  /** One line by id (any mode, buses included), or null when unknown. */
  async line(id) {
    if (!LINE_ID.test(id)) {
      return null;
    }
    const body = await this.get(`/Line/${id}`, {}, { allowMissing: true });
    const line = Array.isArray(body) ? body[0] : null;
    return line?.id ? { id: line.id, name: line.name ?? line.id, mode: line.modeName ?? '' } : null;
  }

  /**
   * Stops matching a name: [{ id, name, modes, towards }].
   * @param {string} text
   * @param {number} size
   */
  async searchStops(text, size = 8) {
    const body = await this.get(`/StopPoint/Search/${encodeURIComponent(text)}`, {
      modes: SEARCH_MODES.join(','),
      maxResults: String(size),
    });
    return (body?.matches ?? [])
      .filter((match) => STOP_ID.test(match?.id ?? ''))
      .slice(0, size)
      .map((match) => ({
        id: match.id,
        name: String(match.name ?? match.id).trim(),
        modes: Array.isArray(match.modes) ? match.modes : [],
        towards: String(match.towards ?? '').trim(),
      }));
  }

  /** The details of a stop point (children and lines), or null when unknown. */
  async stopPoint(id) {
    if (!STOP_ID.test(id)) {
      return null;
    }
    return this.get(`/StopPoint/${id}`, {}, { allowMissing: true });
  }

  /** The arrival predictions of one stop point (raw list). */
  async arrivals(id) {
    if (!STOP_ID.test(id)) {
      return [];
    }
    const body = await this.get(`/StopPoint/${id}/Arrivals`, {}, { allowMissing: true });
    return Array.isArray(body) ? body : [];
  }
}
