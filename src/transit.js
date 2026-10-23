// -----------------------------------------------------------------------------
// From the raw TfL answers to what the integration works with: the status of a
// line (worst current status, level 0 to 3, reason), the stop points of a
// watched stop, its arrivals (minutes, line, destination, platform) and the
// filters of a watch. Pure functions: the clock is a parameter.
// -----------------------------------------------------------------------------

import { SEARCH_MODES } from './tfl.js';

// TfL statusSeverity codes (`/Line/Meta/Severity`) → disruption level:
// 0 good service, 1 minor disruption, 2 severe or partial, 3 suspended or
// closed. "Service Closed" (20) is the normal end of service at night: no
// disruption. An unknown code counts as minor.
export const GOOD_SERVICE = 10;
const LEVELS = {
  0: 1, // Special Service
  1: 3, // Closed
  2: 3, // Suspended
  3: 2, // Part Suspended
  4: 3, // Planned Closure
  5: 2, // Part Closure
  6: 2, // Severe Delays
  7: 1, // Reduced Service
  8: 2, // Bus Service (rail replacement)
  9: 1, // Minor Delays
  10: 0, // Good Service
  11: 2, // Part Closed
  12: 1, // Exit Only
  13: 1, // No Step Free Access
  14: 1, // Change of frequency
  15: 1, // Diverted
  16: 3, // Not Running
  17: 1, // Issues Reported
  18: 0, // No Issues
  19: 0, // Information
  20: 0, // Service Closed
};
export const MAX_LEVEL = 3;

export const levelOf = (severity) => LEVELS[severity] ?? 1;

/** Lower case, without accents nor apostrophes: "King's Cross" matches "kings cross". */
export function fold(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "Oxford Circus Underground Station" → "Oxford Circus". */
export function cleanName(text) {
  return (
    String(text ?? '')
      .replace(/\s+(Underground|DLR|Rail|Tram|Overground)\s+Station$/i, '')
      .replace(/\s+Tram Stop$/i, '')
      .replace(/\s+/g, ' ')
      .trim() || '?'
  );
}

/** A reason without the "VICTORIA LINE:" prefix TfL starts it with, on one line. */
export function cleanReason(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[^:]{2,60}(?:line|lines|Tramlink|DLR|Route \S+)\s*:\s*/i, '')
    .trim();
}

/**
 * The current status of a line from its raw TfL entry: the statuses valid now
 * (`isNow`, or without validity period), the worst first. A planned work
 * announced for later is not a disruption yet.
 * @returns {{ id: string, name: string, mode: string, severity: number, level: number,
 *   descriptions: number[], reason: string }}
 */
export function parseLineStatus(raw) {
  const current = (raw?.lineStatuses ?? []).filter((status) => {
    const periods = status?.validityPeriods ?? [];
    return periods.length === 0 || periods.some((period) => period?.isNow === true);
  });
  const statuses = current
    .map((status) => ({
      severity: Number(status.statusSeverity),
      level: levelOf(Number(status.statusSeverity)),
      reason: cleanReason(status.reason),
    }))
    .filter((status) => Number.isInteger(status.severity))
    .sort((a, b) => b.level - a.level || a.severity - b.severity);
  const worst = statuses[0] ?? { severity: GOOD_SERVICE, level: 0, reason: '' };
  return {
    id: raw?.id ?? '',
    name: raw?.name ?? raw?.id ?? '',
    mode: raw?.modeName ?? '',
    severity: worst.severity,
    level: worst.level,
    // Every distinct current status ("Part Closure" and "Minor Delays").
    severities: [...new Set(statuses.map((status) => status.severity))],
    reason: [...new Set(statuses.map((status) => status.reason).filter(Boolean))].join(' '),
  };
}

const POINT_TYPES = ['NaptanMetroStation', 'NaptanRailStation', 'NaptanPublicBusCoachTram'];
// Stop points read per watched stop at most: each is one request a refresh.
export const MAX_POINTS = 4;

const servesTfl = (node) => (node?.modes ?? []).some((mode) => SEARCH_MODES.includes(mode));

/**
 * A stop to watch from the details of a stop point: its name, the stop points
 * whose arrivals are read (a hub or a bus stop pair has none of its own: its
 * children are read), and the TfL lines it serves.
 * @returns {{ id: string, name: string, points: string[], lines: { id: string, name: string, mode: string }[] } | null}
 */
export function resolveStop(details) {
  if (!details?.id) {
    return null;
  }
  const nodes = POINT_TYPES.includes(details.stopType)
    ? [details]
    : (details.children ?? []).filter((child) => POINT_TYPES.includes(child?.stopType));
  const points = nodes.filter(servesTfl).slice(0, MAX_POINTS);
  if (points.length === 0) {
    return null;
  }
  const lines = new Map();
  for (const node of points) {
    const names = new Map((node.lines ?? []).map((line) => [line.id, line.name]));
    for (const group of node.lineModeGroups ?? []) {
      if (!SEARCH_MODES.includes(group.modeName)) {
        continue;
      }
      for (const id of group.lineIdentifier ?? []) {
        if (!lines.has(id)) {
          lines.set(id, { id, name: names.get(id) ?? id, mode: group.modeName });
        }
      }
    }
  }
  const letter = points.length === 1 && points[0].indicator ? ` (${points[0].indicator})` : '';
  return {
    id: details.id,
    name: `${cleanName(details.commonName)}${letter}`,
    points: points.map((point) => point.id),
    lines: [...lines.values()].sort((a, b) =>
      a.name.localeCompare(b.name, 'en', { numeric: true }),
    ),
  };
}

/**
 * One arrival per prediction, soonest first; the ones already gone (an answer
 * a minute old) dropped, the duplicates TfL sometimes sends merged.
 * @param {object[]} raw predictions of `/StopPoint/{id}/Arrivals`
 * @param {number} now ms
 */
export function parseArrivals(raw, now) {
  const arrivals = new Map();
  for (const prediction of raw ?? []) {
    const expected = Date.parse(prediction?.expectedArrival);
    if (!Number.isFinite(expected) || expected < now - 60000 || !prediction.lineId) {
      continue;
    }
    const destination = cleanName(prediction.destinationName || prediction.towards);
    const platform = String(prediction.platformName ?? '').trim();
    // The vehicle makes a journey; the DLR has none: the prediction id then.
    const vehicle = String(prediction.vehicleId ?? '').trim() || String(prediction.id ?? '');
    const key = `${prediction.lineId}|${vehicle}|${prediction.naptanId ?? ''}|${destination}`;
    if (arrivals.has(key)) {
      continue;
    }
    arrivals.set(key, {
      key,
      lineId: String(prediction.lineId),
      line: String(prediction.lineName ?? prediction.lineId).trim(),
      mode: String(prediction.modeName ?? ''),
      destination,
      towards: String(prediction.towards ?? '').trim(),
      platform: platform === 'null' ? '' : platform,
      expected,
      minutes: Math.max(0, Math.floor((expected - now) / 60000)),
    });
  }
  return [...arrivals.values()].sort((a, b) => a.expected - b.expected);
}

/**
 * The arrivals a watch keeps: its lines, and its direction, a part of the
 * destination, of "towards" or of the platform ("Southbound", "Brixton").
 * @param {object[]} arrivals from parseArrivals
 * @param {{ lines?: string[], direction?: string }} watch
 */
export function applyFilters(arrivals, watch) {
  const lines = new Set(watch.lines ?? []);
  const direction = fold(watch.direction);
  return arrivals.filter(
    (arrival) =>
      (lines.size === 0 || lines.has(arrival.lineId)) &&
      (!direction ||
        [arrival.destination, arrival.towards, arrival.platform].some((text) =>
          fold(text).includes(direction),
        )),
  );
}

/** The arrivals of an earlier read, as of `now`: minutes counted again, the gone ones dropped. */
export const aged = (arrivals, now) =>
  arrivals
    .filter((arrival) => arrival.expected >= now - 60000)
    .map((arrival) => ({
      ...arrival,
      minutes: Math.max(0, Math.floor((arrival.expected - now) / 60000)),
    }));

const clockFormat = new Map();

/** "07:45" in the time zone of the container (TZ, set by Gladys). */
export function clockTime(ms) {
  const zone = process.env.TZ || undefined;
  if (!clockFormat.has(zone)) {
    clockFormat.set(
      zone,
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: zone,
      }),
    );
  }
  return clockFormat.get(zone).format(new Date(ms));
}
