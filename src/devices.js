// -----------------------------------------------------------------------------
// The Gladys devices: one per followed line (its status, disruption level 0 to
// 3, disrupted yes/no, reason) and one per watched stop and set of filters
// (minutes to the next arrival and to the following one, line and destination
// of the next one, whether one of its lines is disrupted).
//
// Read-only, no polling: the service refreshes everything on its own timer
// (src/service.js), Gladys never polls (`should_poll: false`). Countdowns and
// texts keep no history: a value re-read every minute whose past means nothing
// would write thousands of rows a day per stop.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { createHash } from 'node:crypto';
import { MAX_LEVEL, fold } from './transit.js';
import { LEVEL_NAMES, NAMES, TEXT, lineLabel, say, severityName } from './messages.js';

export const LINE_TYPE = 'line';
export const STOP_TYPE = 'stop';
// Published when no arrival is announced (TfL predicts about 30 minutes ahead).
export const NO_ARRIVAL_MINUTES = 1440;
export const MAX_TEXT_STATE = 200;
export const LINE_FEATURES = ['status', 'level', 'disruption', 'reason'];
export const STOP_FEATURES = ['next', 'following', 'line', 'disruption'];

/** Shortens a text to `max` characters, with an ellipsis. */
export function clip(text, max) {
  const value = String(text ?? '');
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

const slug = (text) =>
  fold(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * The platform id of a watch: the stop id, then its filters
 * ("940GZZLUOXC", "940GZZLUOXC-victoria-to-southbound"). Two watches of the
 * same stop with other filters are two devices.
 */
export function watchKey(watch) {
  const parts = [
    ...(watch.lines ?? []).map(slug),
    ...(watch.direction ? ['to', slug(watch.direction)] : []),
  ].filter(Boolean);
  const key = [String(watch.id).toLowerCase(), ...parts].join('-');
  // Too long: cut, with a short hash of the whole so two keys never meet.
  return key.length <= 80
    ? key
    : `${key.slice(0, 71)}-${createHash('sha1').update(key).digest('hex').slice(0, 8)}`;
}

/** "Oxford Circus (Victoria · → Southbound)": the name of a watch. */
export function watchName(watch) {
  const filters = [
    ...(watch.lineNames?.length ? [watch.lineNames.join(', ')] : []),
    ...(watch.direction ? [`→ ${watch.direction}`] : []),
  ];
  return filters.length > 0 ? `${watch.name} (${filters.join(' · ')})` : watch.name;
}

const readOnly = { read_only: true, has_feedback: false };

const text = (name, externalId) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.TEXT,
  type: DEVICE_FEATURE_TYPES.TEXT.TEXT,
  // NOT NULL in the core, even for a text (422 on "Add to Gladys" without).
  min: 0,
  max: 0,
  ...readOnly,
  keep_history: false,
});

// input/binary: a yes/no the dashboard labels (light-sensor/binary has none).
const flag = (name, externalId) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.INPUT,
  type: DEVICE_FEATURE_TYPES.SENSOR.BINARY,
  min: 0,
  max: 1,
  ...readOnly,
  keep_history: true,
});

const countdown = (name, externalId) => ({
  name,
  external_id: externalId,
  category: DEVICE_FEATURE_CATEGORIES.DURATION,
  type: DEVICE_FEATURE_TYPES.DURATION.INTEGER,
  unit: DEVICE_FEATURE_UNITS.MINUTES,
  min: 0,
  max: NO_ARRIVAL_MINUTES,
  ...readOnly,
  keep_history: false,
});

/**
 * The device of a followed line.
 * @param {object} gladys
 * @param {{ id: string, name: string, mode: string }} line
 * @param {string} language
 */
export function buildLineDevice(gladys, line, language) {
  const ids = gladys.externalIds(LINE_TYPE, line.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: clip(`TfL · ${lineLabel(line, language)}`, 80),
    external_id: ids.device,
    should_poll: false,
    // What is needed to follow the line again when /data is lost.
    params: [
      { name: 'line_id', value: line.id },
      { name: 'line_name', value: line.name },
      { name: 'mode', value: line.mode ?? '' },
    ],
    features: [
      text(names.status, ids.feature('status')),
      {
        name: names.level,
        external_id: ids.feature('level'),
        category: DEVICE_FEATURE_CATEGORIES.RISK,
        type: DEVICE_FEATURE_TYPES.RISK.INTEGER,
        min: 0,
        max: MAX_LEVEL,
        ...readOnly,
        keep_history: true,
      },
      flag(names.disruption, ids.feature('disruption')),
      text(names.reason, ids.feature('reason')),
    ],
  };
}

/** "Minor delays", "Part closure + Minor delays". */
export function statusText(status, language) {
  return clip(
    (status.severities?.length ? status.severities : [status.severity])
      .map((severity) => severityName(severity, language))
      .join(' + '),
    MAX_TEXT_STATE,
  );
}

/**
 * The states of a followed line.
 * @param {object} gladys
 * @param {object} status from parseLineStatus
 * @param {string} language
 */
export function lineStates(gladys, status, language) {
  const ids = gladys.externalIds(LINE_TYPE, status.id);
  return [
    { device_feature_external_id: ids.feature('status'), text: statusText(status, language) },
    { device_feature_external_id: ids.feature('level'), state: status.level },
    { device_feature_external_id: ids.feature('disruption'), state: status.level > 0 ? 1 : 0 },
    {
      device_feature_external_id: ids.feature('reason'),
      // Never empty (an empty text is ignored by the core): the status itself
      // when TfL gives no reason.
      text:
        status.level === 0
          ? say(TEXT, language, 'noDisruption')
          : clip(status.reason || statusText(status, language), MAX_TEXT_STATE),
    },
  ];
}

/** The name of a level, "Minor disruption". */
export const levelName = (level, language) => (LEVEL_NAMES[language] ?? LEVEL_NAMES.en)[level];

/**
 * The device of a watched stop.
 * @param {object} gladys
 * @param {{ id: string, name: string, points: string[], lines: string[], lineNames: string[], direction: string }} watch
 * @param {string} language
 */
export function buildStopDevice(gladys, watch, language) {
  const ids = gladys.externalIds(STOP_TYPE, watchKey(watch));
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: clip(`TfL · ${watchName(watch)}`, 80),
    external_id: ids.device,
    should_poll: false,
    // What is needed to watch the stop again when /data is lost.
    params: [
      { name: 'stop_id', value: watch.id },
      { name: 'stop_name', value: watch.name },
      { name: 'points', value: (watch.points ?? []).join(',') },
      { name: 'lines', value: (watch.lines ?? []).join(',') },
      { name: 'line_names', value: (watch.lineNames ?? []).join(',') },
      { name: 'served', value: (watch.served ?? []).join(',') },
      { name: 'direction', value: watch.direction ?? '' },
    ],
    features: [
      countdown(names.next, ids.feature('next')),
      countdown(names.following, ids.feature('following')),
      text(names.line, ids.feature('line')),
      flag(names.disruption, ids.feature('disruption')),
    ],
  };
}

/** "Victoria → Walthamstow Central", or "No arrival announced". */
export function arrivalText(arrival, language) {
  return arrival
    ? clip(`${arrival.line} → ${arrival.destination}`, MAX_TEXT_STATE)
    : say(TEXT, language, 'noArrival');
}

/** The lines whose status counts for a watch: its filter, else every line it serves. */
export const watchedLines = (watch) => (watch.lines?.length ? watch.lines : (watch.served ?? []));

/**
 * The states of a watched stop.
 * @param {object} gladys
 * @param {object} watch
 * @param {object[]} arrivals the arrivals of the watch (applyFilters, aged)
 * @param {boolean} disrupted one of its lines is disrupted
 * @param {string} language
 */
export function stopStates(gladys, watch, arrivals, disrupted, language) {
  const ids = gladys.externalIds(STOP_TYPE, watchKey(watch));
  const [next, following] = arrivals;
  const minutes = (arrival) =>
    arrival ? Math.min(arrival.minutes, NO_ARRIVAL_MINUTES) : NO_ARRIVAL_MINUTES;
  return [
    { device_feature_external_id: ids.feature('next'), state: minutes(next) },
    { device_feature_external_id: ids.feature('following'), state: minutes(following) },
    { device_feature_external_id: ids.feature('line'), text: arrivalText(next, language) },
    { device_feature_external_id: ids.feature('disruption'), state: disrupted ? 1 : 0 },
  ];
}
