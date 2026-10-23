// -----------------------------------------------------------------------------
// The TfL service: the followed lines and watched stops (configuration
// actions, /data), their devices, the refresh timer (one status request for
// every line involved, one arrivals request per stop point), the states and
// the scene triggers.
//
// Triggers never fire at the first read after a start: what was already there
// when the integration started is not news. Their memories live in RAM only
// (a disruption or an arrival lives minutes to hours, and /data is often an
// SD card).
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  LINE_TYPE,
  STOP_TYPE,
  buildLineDevice,
  buildStopDevice,
  clip,
  lineStates,
  statusText,
  stopStates,
  watchKey,
  watchName,
  watchedLines,
} from './devices.js';
import { TEXT, lineLabel, modeName, say, sayAll } from './messages.js';
import { STOP_ID, Tfl } from './tfl.js';
import {
  aged,
  applyFilters,
  cleanName,
  clockTime,
  fold,
  parseArrivals,
  parseLineStatus,
  resolveStop,
} from './transit.js';

const logger = createLogger({ name: 'tfl' });

export const TRIGGERS = {
  SOON: 'arrival_soon',
  LINE: 'line_status_changed',
};
// Events of the line trigger (its `event` filter).
export const LINE_EVENTS = ['disrupted', 'worsened', 'improved', 'restored'];
// Options of the threshold filter of the arrival trigger (manifest
// `scene_triggers`). TfL predicts about 30 minutes ahead.
export const SOON_MINUTES = [1, 2, 3, 4, 5, 7, 10, 12, 15, 20];

export const MAX_WATCHES = 10;
export const MAX_LINES = 20;
const SEARCH_RESULTS = 8;
const LANGS = ['en', 'fr', 'de', 'es'];
// A value that does not change is published again this often, so that Gladys
// does not show it as stale ("no recent value" after 48 h).
const HEARTBEAT_MS = 6 * 3600 * 1000;
// Scene events sent per minute at most: the core refuses more than 300.
const EVENTS_PER_MINUTE = 200;

export class SceneError extends Error {}

/** "victoria, Elizabeth line; 73" → ["victoria", "Elizabeth line", "73"]. */
export function splitList(text) {
  return [
    ...new Set(
      String(text ?? '')
        .split(/[,;]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

/** "940gzzluoxc" → "940GZZLUOXC" when the text is a stop point id, else null. */
export function parseStopId(text) {
  const value = String(text ?? '')
    .trim()
    .toUpperCase();
  return STOP_ID.test(value) && (/\d/.test(value) || value.startsWith('HUB')) ? value : null;
}

/** A line matches a typed name: its id, its name, "Victoria line", "Bus 73". */
const lineMatches = (line, text) => {
  const wanted = fold(text);
  return [line.id, line.name, `${line.name} line`, `bus ${line.name}`].some(
    (candidate) => fold(candidate) === wanted,
  );
};

const each = (fn) => Object.fromEntries(LANGS.map((lang) => [lang, fn(lang)]));

export class TflService {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the fake one)
   * @param {object} options.store Store (src/store.js)
   * @param {typeof fetch} [options.fetch]
   * @param {() => number} [options.now]
   * @param {boolean} [options.timers] false in the tests: refresh by hand
   */
  constructor({ gladys, store, fetch, now = Date.now, timers = true }) {
    this.gladys = gladys;
    this.store = store;
    this.config = { language: 'fr', refreshSeconds: 60, appKey: '' };
    this.tfl = new Tfl({ fetch, appKey: () => this.config.appKey });
    this.now = now;
    this.timers = timers;
    this.lines = [];
    this.watches = [];
    this.removed = [];
    // line id → parsed status (src/transit.js)
    this.statuses = new Map();
    // watchKey → { arrivals, at }
    this.boards = new Map();
    // line id → level of the previous read (RAM): the line trigger compares.
    this.levels = new Map();
    // watchKey → Map(arrival key → Set of thresholds handled), RAM only.
    this.soonDone = new Map();
    this.refreshedAt = 0;
    this.lastError = null;
    this.inflight = null;
    this.timer = null;
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    this.lines = Array.isArray(saved.lines) ? saved.lines.filter((line) => line?.id) : [];
    this.watches = Array.isArray(saved.watches)
      ? saved.watches.filter((watch) => watch?.id && Array.isArray(watch.points))
      : [];
    this.removed = Array.isArray(saved.removed) ? saved.removed : [];
    await this.restoreFromDevices();
    await this.publishDiscovered();
    await this.gladys.setConnectionStatus(true).catch(() => {});
    this.startTimer();
    await this.refresh();
  }

  async resync(config) {
    await this.reconfigure(config, { force: true });
  }

  async reconfigure(config, { force = false } = {}) {
    const previous = this.config;
    this.config = config;
    if (previous.refreshSeconds !== config.refreshSeconds) {
      this.startTimer();
    }
    if (force || previous.language !== config.language || previous.appKey !== config.appKey) {
      // The device names follow the language; the feature names stay as they
      // were created (frozen by the core).
      await this.publishDiscovered();
      await this.refresh({ republish: true });
    }
  }

  startTimer() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.timers) {
      this.timer = setInterval(() => {
        this.refresh().catch((err) => logger.error('Refresh failed', err));
      }, this.config.refreshSeconds * 1000);
      this.timer.unref?.();
    }
  }

  async stop() {
    clearInterval(this.timer);
    this.timer = null;
    await this.inflight?.catch(() => {});
    await this.store.flush();
  }

  save() {
    return this.store.save({ lines: this.lines, watches: this.watches, removed: this.removed });
  }

  // --- Devices ----------------------------------------------------------------

  lineDeviceId(line) {
    return this.gladys.externalIds(LINE_TYPE, line.id).device;
  }

  stopDeviceId(watch) {
    return this.gladys.externalIds(STOP_TYPE, watchKey(watch)).device;
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  lineOfDevice(externalId) {
    return this.lines.find((line) => this.lineDeviceId(line) === externalId) ?? null;
  }

  watchOfDevice(externalId) {
    return this.watches.find((watch) => this.stopDeviceId(watch) === externalId) ?? null;
  }

  createdLines() {
    return this.lines.filter((line) => this.isCreated(this.lineDeviceId(line)));
  }

  createdWatches() {
    return this.watches.filter((watch) => this.isCreated(this.stopDeviceId(watch)));
  }

  /** The lines and stops of the devices created in Gladys but missing from /data. */
  async restoreFromDevices() {
    let devices;
    try {
      devices = await this.gladys.getDevices();
    } catch (err) {
      logger.warn(`Cannot read the devices of the integration: ${err.message}`);
      return;
    }
    const param = (device, name) => device.params?.find((p) => p.name === name)?.value ?? '';
    const list = (device, name) => String(param(device, name)).split(',').filter(Boolean);
    let changed = false;
    for (const device of devices ?? []) {
      const lineId = param(device, 'line_id');
      if (lineId) {
        const line = {
          id: lineId,
          name: param(device, 'line_name') || lineId,
          mode: param(device, 'mode'),
        };
        if (
          !this.removed.includes(`line:${line.id}`) &&
          !this.lines.some((l) => l.id === line.id)
        ) {
          this.lines.push(line);
          changed = true;
        }
        continue;
      }
      const stopId = param(device, 'stop_id');
      if (!stopId || list(device, 'points').length === 0) {
        continue;
      }
      const watch = {
        id: stopId,
        name: param(device, 'stop_name') || stopId,
        points: list(device, 'points'),
        lines: list(device, 'lines'),
        lineNames: list(device, 'line_names'),
        served: list(device, 'served'),
        direction: param(device, 'direction'),
      };
      const key = watchKey(watch);
      // A stop removed by the user keeps its device until deleted: not restored.
      if (!this.removed.includes(`stop:${key}`) && !this.watches.some((w) => watchKey(w) === key)) {
        this.watches.push(watch);
        changed = true;
      }
    }
    if (changed) {
      logger.info(
        `${this.lines.length} line(s) and ${this.watches.length} stop(s) restored from the Gladys devices`,
      );
      await this.save();
    }
  }

  async publishDiscovered() {
    const language = this.config.language;
    try {
      await this.gladys.publishDiscoveredDevices([
        ...this.lines.map((line) => buildLineDevice(this.gladys, line, language)),
        ...this.watches.map((watch) => buildStopDevice(this.gladys, watch, language)),
      ]);
    } catch (err) {
      logger.warn(`Cannot publish the discovered devices: ${err.message}`);
    }
  }

  async onDeviceCreated(device) {
    const line = this.lineOfDevice(device?.external_id);
    const watch = this.watchOfDevice(device?.external_id);
    if (!line && !watch) {
      return;
    }
    // A state published before the device existed was dropped by the core:
    // everything again, then the widgets showing it.
    await this.refresh({ republish: true });
    this.gladys.requestWidgetRefresh?.(line ? 'line_status' : 'arrivals');
  }

  // --- Refresh ----------------------------------------------------------------

  /** Polling fallback: Gladys does not poll these devices, but if it did. */
  async poll() {
    if (this.now() - this.refreshedAt >= (this.config.refreshSeconds * 1000) / 2) {
      await this.refresh();
    }
  }

  refresh(options = {}) {
    if (this.inflight) {
      // A read in progress may predate a device just created: read again after it.
      return this.inflight.then(() => this.refresh(options));
    }
    this.inflight = this.doRefresh(options).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  async read(lines, watches) {
    const lineIds = new Set([
      ...lines.map((line) => line.id),
      ...watches.flatMap((watch) => watchedLines(watch)),
    ]);
    const statuses = lineIds.size > 0 ? await this.tfl.lineStatuses([...lineIds]) : new Map();
    const points = new Map();
    for (const point of new Set(watches.flatMap((watch) => watch.points))) {
      points.set(point, await this.tfl.arrivals(point));
    }
    return { statuses, points };
  }

  async doRefresh({ republish = false } = {}) {
    const lines = this.createdLines();
    const watches = this.createdWatches();
    if (lines.length === 0 && watches.length === 0) {
      return;
    }
    let result;
    try {
      result = await this.read(lines, watches);
    } catch (err) {
      if (!this.lastError) {
        logger.warn(`Cannot read TfL: ${err.message}`);
        await this.gladys
          .setConnectionStatus(false, sayAll(TEXT, 'serviceDown', { error: err.message }))
          .catch(() => {});
      } else {
        logger.debug(`Cannot read TfL: ${err.message}`);
      }
      this.lastError = err.message;
      // The countdowns go on from the last expected times.
      await this.publishAll();
      return;
    }
    if (this.lastError) {
      logger.info('TfL reachable again');
      this.lastError = null;
      await this.gladys.setConnectionStatus(true).catch(() => {});
    }
    const now = this.now();
    this.refreshedAt = now;
    for (const [id, raw] of result.statuses) {
      this.statuses.set(id, { ...parseLineStatus(raw), at: now });
    }
    const events = lines.flatMap((line) => this.detectLine(line));
    for (const watch of watches) {
      const raw = watch.points.flatMap((point) => result.points.get(point) ?? []);
      const arrivals = applyFilters(parseArrivals(raw, now), watch);
      this.boards.set(watchKey(watch), { arrivals, at: now });
      events.push(...this.detectSoon(watch, arrivals));
    }
    await this.publishAll({ force: republish });
    for (const { key, data } of events) {
      await this.fire(key, data);
    }
  }

  /** Whether a line the watch depends on is disrupted. */
  disrupted(watch) {
    return watchedLines(watch).some((id) => (this.statuses.get(id)?.level ?? 0) > 0);
  }

  async publishAll({ force = false } = {}) {
    const language = this.config.language;
    const states = [];
    for (const line of this.createdLines()) {
      const status = this.statuses.get(line.id);
      if (status) {
        states.push(...lineStates(this.gladys, status, language));
      }
    }
    for (const watch of this.createdWatches()) {
      const board = this.boards.get(watchKey(watch));
      if (board) {
        states.push(
          ...stopStates(
            this.gladys,
            watch,
            aged(board.arrivals, this.now()),
            this.disrupted(watch),
            language,
          ),
        );
      }
    }
    if (states.length === 0) {
      return;
    }
    if (force) {
      this.gladys.forgetPublishedStates?.();
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: HEARTBEAT_MS });
      if (this.publishFailed) {
        this.publishFailed = false;
        logger.info('States published again');
      }
    } catch (err) {
      // Gladys restarting: said once, the next refresh sends them again.
      if (!this.publishFailed) {
        logger.warn(`Cannot publish ${states.length} state(s): ${err.message}`);
      }
      this.publishFailed = true;
    }
  }

  // --- Scene triggers ----------------------------------------------------------

  /** The line trigger: a change of disruption level since the previous read. */
  detectLine(line) {
    const status = this.statuses.get(line.id);
    if (!status) {
      return [];
    }
    const previous = this.levels.get(line.id);
    this.levels.set(line.id, status.level);
    if (previous === undefined || previous === status.level) {
      return [];
    }
    let event;
    if (previous === 0) {
      event = 'disrupted';
    } else if (status.level === 0) {
      event = 'restored';
    } else {
      event = status.level > previous ? 'worsened' : 'improved';
    }
    const language = this.config.language;
    return [
      {
        key: TRIGGERS.LINE,
        data: {
          line: this.lineDeviceId(line),
          line_name: lineLabel(line, language),
          event,
          status: statusText(status, language),
          level: status.level,
          previous_level: previous,
          reason: clip(status.reason, 1000),
        },
      },
    ];
  }

  /** The arrival trigger: each threshold once per arrival, when the countdown reaches it. */
  detectSoon(watch, arrivals) {
    const key = watchKey(watch);
    const deviceId = this.stopDeviceId(watch);
    const firstRead = !this.soonDone.has(key);
    const previous = this.soonDone.get(key) ?? new Map();
    const current = new Map();
    const events = [];
    // A threshold crossed long before this read (TfL down, a 2-minute
    // interval) is too late to announce: marked, not fired.
    const slack = Math.ceil(this.config.refreshSeconds / 60);
    for (const arrival of arrivals) {
      const handled = previous.get(arrival.key);
      if (!handled) {
        // First seen (or first read): the thresholds already passed are not news.
        current.set(
          arrival.key,
          new Set(SOON_MINUTES.filter((minutes) => arrival.minutes <= minutes)),
        );
        continue;
      }
      for (const threshold of SOON_MINUTES) {
        if (arrival.minutes <= threshold && !handled.has(threshold)) {
          handled.add(threshold);
          if (!firstRead && arrival.minutes >= threshold - slack) {
            events.push({
              key: TRIGGERS.SOON,
              data: {
                stop: deviceId,
                stop_name: watch.name,
                line: arrival.line,
                destination: arrival.destination,
                platform: arrival.platform,
                minutes: arrival.minutes,
                expected_time: clockTime(arrival.expected),
                threshold: String(threshold),
              },
            });
          }
        }
      }
      current.set(arrival.key, handled);
    }
    // An arrival gone from the predictions has passed: forgotten.
    this.soonDone.set(key, current);
    return events;
  }

  async fire(key, data) {
    const minute = Math.floor(this.now() / 60000);
    if (this.eventMinute !== minute) {
      this.eventMinute = minute;
      this.eventCount = 0;
    }
    this.eventCount += 1;
    if (this.eventCount > EVENTS_PER_MINUTE) {
      logger.debug(`Too many scene events this minute, ${key} dropped`);
      return;
    }
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.fireFailed = false;
    } catch (err) {
      // A 429 or Gladys restarting: said once per streak.
      if (!this.fireFailed) {
        logger.warn(`Cannot fire the ${key} trigger: ${err.message}`);
      }
      this.fireFailed = true;
    }
  }

  // --- Readings for the widgets and the scene actions -------------------------

  /** Reads again when the device is created and its data older than two intervals. */
  async freshen(externalId, at) {
    if (
      this.isCreated(externalId) &&
      (!at || this.now() - at > this.config.refreshSeconds * 2000)
    ) {
      await this.refresh();
    }
  }

  /** The watch and arrivals of a stop device, or null when it is not watched. */
  async boardOf(externalId) {
    const watch = this.watchOfDevice(externalId);
    if (!watch) {
      return null;
    }
    await this.freshen(externalId, this.boards.get(watchKey(watch))?.at);
    const board = this.boards.get(watchKey(watch));
    return {
      watch,
      arrivals: board ? aged(board.arrivals, this.now()) : null,
      disrupted: this.disrupted(watch),
    };
  }

  /** The line and status of a line device, or null when it is not followed. */
  async lineStatusOf(externalId) {
    const line = this.lineOfDevice(externalId);
    if (!line) {
      return null;
    }
    await this.freshen(externalId, this.statuses.get(line.id)?.at);
    return { line, status: this.statuses.get(line.id) ?? null };
  }

  // --- Configuration actions -------------------------------------------------

  /** Answers an expected failure with a message in every language. */
  fail(key, params) {
    const err = new Error(key);
    err.messages = sayAll(TEXT, key, params);
    return err;
  }

  async call(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.messages) {
        throw err;
      }
      throw this.fail('serviceDown', { error: err.message });
    }
  }

  /** "• Brixton Station (→ Herne Hill) · Bus [490000031E]". */
  stopLine(stop, language) {
    const towards = stop.towards ? ` (→ ${stop.towards})` : '';
    const modes = stop.modes.map((mode) => modeName(mode, language)).join(', ');
    return `• ${cleanName(stop.name)}${towards}${modes ? ` · ${modes}` : ''} [${stop.id}]`;
  }

  async searchStops({ query } = {}) {
    const text = String(query ?? '').trim();
    if (!text) {
      return sayAll(TEXT, 'searchNeedText');
    }
    const direct = parseStopId(text);
    const stops = direct
      ? await this.call(async () => {
          const details = await this.tfl.stopPoint(direct);
          return details?.id
            ? [
                {
                  id: details.id,
                  name: details.commonName,
                  modes: details.modes ?? [],
                  towards: '',
                },
              ]
            : [];
        })
      : await this.call(() => this.tfl.searchStops(text, SEARCH_RESULTS));
    if (stops.length === 0) {
      return sayAll(TEXT, 'searchNone', { query: text });
    }
    return each(
      (lang) =>
        `${say(TEXT, lang, 'searchFound', { count: stops.length })}\n${stops
          .map((stop) => this.stopLine(stop, lang))
          .join('\n')}\n${say(TEXT, lang, 'searchHint')}`,
    );
  }

  async addStop({ stop: query, lines: lineText, direction } = {}) {
    const text = String(query ?? '').trim();
    let id = parseStopId(text);
    if (!id) {
      if (!text) {
        return sayAll(TEXT, 'searchNeedText');
      }
      const found = await this.call(() => this.tfl.searchStops(text, SEARCH_RESULTS));
      const exact = found.filter((stop) => fold(cleanName(stop.name)) === fold(text));
      const candidates = exact.length > 0 ? exact : found;
      if (candidates.length === 0) {
        throw this.fail('addUnknown', { query: text });
      }
      if (candidates.length > 1) {
        return each(
          (lang) =>
            `${say(TEXT, lang, 'addAmbiguous')}\n${candidates
              .map((stop) => this.stopLine(stop, lang))
              .join('\n')}`,
        );
      }
      id = candidates[0].id;
    }
    const details = await this.call(() => this.tfl.stopPoint(id));
    if (!details) {
      throw this.fail('addUnknown', { query: text });
    }
    const stop = resolveStop(details);
    if (!stop) {
      throw this.fail('addNoArrivals', { query: cleanName(details.commonName ?? text) });
    }
    const wanted = splitList(lineText);
    const missing = wanted.filter((item) => !stop.lines.some((line) => lineMatches(line, item)));
    if (missing.length > 0) {
      throw this.fail('addUnknownLines', {
        lines: missing.join(', '),
        available: clip(stop.lines.map((line) => line.name).join(', '), 120),
      });
    }
    const chosen = stop.lines
      .filter((line) => wanted.some((item) => lineMatches(line, item)))
      .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const watch = {
      id: stop.id,
      name: stop.name,
      points: stop.points,
      lines: chosen.map((line) => line.id),
      lineNames: chosen.map((line) => line.name),
      served: stop.lines.map((line) => line.id),
      direction: clip(String(direction ?? '').trim(), 40),
    };
    const key = watchKey(watch);
    if (this.watches.some((known) => watchKey(known) === key)) {
      return sayAll(TEXT, 'alreadyWatched', { name: watchName(watch) });
    }
    if (this.watches.length >= MAX_WATCHES) {
      throw this.fail('tooMany', { max: MAX_WATCHES });
    }
    this.watches.push(watch);
    this.removed = this.removed.filter((removed) => removed !== `stop:${key}`);
    await this.save();
    await this.publishDiscovered();
    logger.info(`Stop added: ${watchName(watch)} (${stop.id})`);
    return sayAll(TEXT, 'added', { name: watchName(watch) });
  }

  async removeStop({ name } = {}) {
    const text = fold(name);
    const id = parseStopId(name);
    const matches = this.watches.filter(
      (watch) =>
        fold(watchName(watch)) === text || watchKey(watch) === text || (id && watch.id === id),
    );
    const found = matches.length > 0 ? matches : this.watches.filter((w) => fold(w.name) === text);
    if (found.length === 0) {
      throw this.fail('removeUnknown', { query: String(name ?? '').trim() });
    }
    if (found.length > 1) {
      throw this.fail('removeAmbiguous');
    }
    const [watch] = found;
    const key = watchKey(watch);
    this.watches = this.watches.filter((known) => known !== watch);
    this.boards.delete(key);
    this.soonDone.delete(key);
    if (!this.removed.includes(`stop:${key}`)) {
      this.removed.push(`stop:${key}`);
    }
    await this.save();
    await this.publishDiscovered();
    logger.info(`Stop removed: ${watchName(watch)}`);
    return sayAll(TEXT, 'removed', { name: watchName(watch) });
  }

  async addLine({ line: query } = {}) {
    const text = String(query ?? '').trim();
    if (!text) {
      return sayAll(TEXT, 'lineNeedText');
    }
    const rail = await this.call(() => this.tfl.railLines());
    let line = rail.find((known) => lineMatches(known, text));
    if (!line) {
      // Not a rail line: a bus route ("73", "N29") or another mode, by id.
      const id = fold(text).replace(/^bus /, '').replace(/\s+/g, '-');
      line = await this.call(() => this.tfl.line(id));
    }
    if (!line) {
      throw this.fail('lineUnknown', { query: text });
    }
    if (this.lines.some((known) => known.id === line.id)) {
      return each((lang) => say(TEXT, lang, 'lineAlready', { name: lineLabel(line, lang) }));
    }
    if (this.lines.length >= MAX_LINES) {
      throw this.fail('tooManyLines', { max: MAX_LINES });
    }
    this.lines.push(line);
    this.removed = this.removed.filter((removed) => removed !== `line:${line.id}`);
    await this.save();
    await this.publishDiscovered();
    logger.info(`Line followed: ${lineLabel(line, 'en')} (${line.id})`);
    return each((lang) => say(TEXT, lang, 'lineAdded', { name: lineLabel(line, lang) }));
  }

  async removeLine({ line: query } = {}) {
    const text = String(query ?? '').trim();
    const line = this.lines.find(
      (known) =>
        lineMatches(known, text) ||
        LANGS.some((lang) => fold(lineLabel(known, lang)) === fold(text)),
    );
    if (!line) {
      throw this.fail('lineNotFollowed', { query: text });
    }
    this.lines = this.lines.filter((known) => known !== line);
    this.levels.delete(line.id);
    if (!this.removed.includes(`line:${line.id}`)) {
      this.removed.push(`line:${line.id}`);
    }
    await this.save();
    await this.publishDiscovered();
    logger.info(`Line no longer followed: ${lineLabel(line, 'en')}`);
    return each((lang) => say(TEXT, lang, 'lineRemoved', { name: lineLabel(line, lang) }));
  }

  status() {
    return each((lang) => {
      if (this.lines.length === 0 && this.watches.length === 0) {
        return say(TEXT, lang, 'statusNone');
      }
      const created = (externalId) =>
        say(TEXT, lang, this.isCreated(externalId) ? 'statusCreated' : 'statusNotCreated');
      const out = [];
      if (this.lines.length > 0) {
        out.push(say(TEXT, lang, 'statusLines', { count: this.lines.length }));
        for (const line of this.lines) {
          const status = this.statuses.get(line.id);
          const now = status ? ` · ${statusText(status, lang)}` : '';
          out.push(`• ${lineLabel(line, lang)}${now} — ${created(this.lineDeviceId(line))}`);
        }
      }
      if (this.watches.length > 0) {
        out.push(say(TEXT, lang, 'statusStops', { count: this.watches.length }));
        for (const watch of this.watches) {
          out.push(`• ${watchName(watch)} [${watch.id}] — ${created(this.stopDeviceId(watch))}`);
        }
      }
      out.push(
        this.refreshedAt
          ? say(TEXT, lang, 'statusRefreshed', {
              age: Math.round((this.now() - this.refreshedAt) / 1000),
            })
          : say(TEXT, lang, 'statusNeverRefreshed'),
      );
      if (this.lastError) {
        out.push(say(TEXT, lang, 'statusError', { error: this.lastError }));
      }
      out.push(say(TEXT, lang, this.config.appKey ? 'statusKey' : 'statusNoKey'));
      return out.join('\n');
    });
  }

  /** "Victoria to Brixton at Oxford Circus: in 3 and 7 min". */
  sentence(watch, group, language) {
    const [first, second] = group;
    let when;
    if (!second) {
      when = first.minutes === 0 ? say(TEXT, language, 'now') : say(TEXT, language, 'in', first);
    } else {
      when =
        first.minutes === 0
          ? say(TEXT, language, 'nowThen', { second: second.minutes })
          : say(TEXT, language, 'inTwo', { first: first.minutes, second: second.minutes });
    }
    const line = first.mode === 'bus' ? `${modeName('bus', language)} ${first.line}` : first.line;
    return say(TEXT, language, 'sentence', {
      line,
      destination: first.destination,
      stop: watch.name,
      when,
    });
  }
}
