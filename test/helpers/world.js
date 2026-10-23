// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake `fetch` answering like
// the TfL Unified API from the real responses of test/fixtures/tfl (captured
// on 2026-10-23 around 23:10 UTC, a Friday night with several lines disrupted;
// the stop point details are trimmed to the fields the code reads), a manual
// clock, a temporary /data, and the integration wired on top through
// registerHandlers. Nothing touches the network.
// -----------------------------------------------------------------------------

import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { API_URL } from '../../src/tfl.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/London';

const fixturePath = (name) => new URL(`../fixtures/tfl/${name}`, import.meta.url);
export const fixtureJson = (name) => JSON.parse(readFileSync(fixturePath(name), 'utf8'));

// 2026-10-24 00:09:22 in London: when arrivals-940GZZLUOXC.json was captured.
export const FIXTURE_TIME = Date.parse('2026-10-23T23:09:22Z');

export const OXFORD_CIRCUS = '940GZZLUOXC'; // Bakerloo, Central, Victoria
export const BRIXTON_HUB = 'HUBBRX'; // Victoria (Tube) and Southeastern (National Rail)
export const BUS_PAIR = '490G00015204'; // Oxford Circus Station / John Lewis, buses

const SEARCHES = {
  'oxford circus': 'search-oxford.json',
  brixton: 'search-brixton.json',
  'brixton station': 'search-brixton.json',
};

/** Every line status of the fixtures, by id (a copy the test may change). */
export function recordedStatuses() {
  const lines = [...fixtureJson('status-modes.json'), ...fixtureJson('status-bus-73.json')];
  return new Map(lines.map((line) => [line.id, line]));
}

/** Sets the status of a line, valid now: `severity` and its `reason`. */
export function setStatus(network, id, severity, reason = '') {
  const line = network.statuses.get(id);
  line.lineStatuses = [
    {
      statusSeverity: severity,
      statusSeverityDescription: String(severity),
      reason,
      validityPeriods: severity === 10 ? [] : [{ isNow: true }],
    },
  ];
}

/**
 * A fake `fetch` answering like TfL. `statuses` and `arrivals` hold what the
 * status and arrival requests return (change them to stage a disruption);
 * `fail` makes every request fail with an Error or an HTTP status. Every call
 * is recorded in `calls`.
 */
export function createFetch() {
  const arrivals = {};
  for (const id of ['940GZZLUOXC', '940GZZLUBXN', '490000031E', '490015196OF', '910GPADTLL']) {
    arrivals[id] = fixtureJson(`arrivals-${id}.json`);
  }
  const network = { statuses: recordedStatuses(), arrivals, calls: [], fail: null };
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  const notFound = () => json(fixtureJson('stoppoint-unknown.json'), 404);
  network.fetch = async (url) => {
    network.calls.push({ url });
    if (network.fail instanceof Error) {
      throw network.fail;
    }
    if (typeof network.fail === 'number') {
      return new Response('error', { status: network.fail });
    }
    const { pathname } = new URL(url);
    let match;
    if (/^\/Line\/Mode\/[^/]+\/Status$/.test(pathname)) {
      return json(fixtureJson('status-modes.json'));
    }
    if ((match = pathname.match(/^\/Line\/([^/]+)\/Status$/))) {
      const ids = decodeURIComponent(match[1]).split(',');
      return json(ids.map((id) => network.statuses.get(id)).filter(Boolean));
    }
    if ((match = pathname.match(/^\/Line\/([^/]+)$/))) {
      const line = network.statuses.get(decodeURIComponent(match[1]));
      return line ? json([{ ...line, lineStatuses: [] }]) : notFound();
    }
    if ((match = pathname.match(/^\/StopPoint\/Search\/(.+)$/))) {
      const query = decodeURIComponent(match[1]).toLowerCase();
      return json(fixtureJson(SEARCHES[query] ?? 'search-none.json'));
    }
    if ((match = pathname.match(/^\/StopPoint\/([^/]+)\/Arrivals$/))) {
      return json(structuredClone(network.arrivals[match[1]] ?? []));
    }
    if ((match = pathname.match(/^\/StopPoint\/([^/]+)$/))) {
      const name = `stoppoint-${match[1]}.json`;
      return existsSync(fixturePath(name)) ? json(fixtureJson(name)) : notFound();
    }
    return new Response('not found', { status: 404 });
  };
  network.requests = (pattern) =>
    network.calls.filter((call) => pattern.test(new URL(call.url).pathname));
  network.arrivalRequests = () => network.requests(/\/Arrivals$/);
  network.statusRequests = () => network.requests(/^\/Line\/(?!Mode)[^/]+\/Status$/);
  return network;
}

export { API_URL };

/** A manual clock. */
export function createClock(start = FIXTURE_TIME) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {object} [options.network] from createFetch
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.saved] content of /data/watch.json before the start
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers]
 */
export async function createWorld({
  config = {},
  network = createFetch(),
  devices = [],
  saved,
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-tfl-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  if (saved) {
    await store.save(saved);
    await store.flush();
  }
  const app = registerHandlers(gladys, {
    store,
    fetch: network.fetch,
    timers,
    now: clock.now,
    dataDir,
  });
  const world = {
    gladys,
    fake: gladys.fake,
    app,
    service: app.service,
    network,
    clock,
    store,
    dataDir,
  };
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return world;
}

/** Run a configuration action; resolves with its message (multi-language). */
export async function action(world, key, fields = {}) {
  const ack = await world.fake.action(key, fields);
  if (!ack.success) {
    throw new Error(`action ${key} failed: ${ack.error}`);
  }
  return ack.data.message;
}

/** The discovered device whose name contains `name`. */
export function discovered(world, name) {
  const device = world.fake.discoveredDevices.find((d) => d.name.includes(name));
  if (!device) {
    throw new Error(`no discovered device named ${name}`);
  }
  return device;
}

/** "Add to Gladys" on the discovered device named `name`; resolves with it. */
export async function create(world, name) {
  const device = discovered(world, name);
  await world.fake.deviceCreated(device);
  return device;
}

/** The last state published on a feature of a device. */
export const lastState = (world, device, key) =>
  world.fake.lastState(`${device.external_id}:${key}`);

/** Captures the log lines of the integration at `level` and above. */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
