// -----------------------------------------------------------------------------
// The pure functions of src/transit.js on the real TfL answers: statuses and
// levels, reasons, stop resolution, arrivals and filters.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFilters,
  cleanName,
  cleanReason,
  levelOf,
  parseArrivals,
  parseLineStatus,
  resolveStop,
} from '../src/transit.js';
import { FIXTURE_TIME, fixtureJson } from './helpers/world.js';

const statuses = new Map(fixtureJson('status-modes.json').map((line) => [line.id, line]));

test('levels: good, minor, severe, closed; night closure and unknown codes', () => {
  assert.deepEqual([10, 9, 6, 2, 20, 18, 99].map(levelOf), [0, 1, 2, 3, 0, 0, 1]);
});

test('a line status: the worst status valid now, its reason without the line prefix', () => {
  assert.deepEqual(parseLineStatus(statuses.get('victoria')), {
    id: 'victoria',
    name: 'Victoria',
    mode: 'tube',
    severity: 9,
    level: 1,
    severities: [9],
    reason: 'Minor delays due to train cancellations.',
  });
  assert.equal(parseLineStatus(statuses.get('tram')).level, 2);
  assert.match(parseLineStatus(statuses.get('tram')).reason, /^No service between Arena/);
  assert.equal(parseLineStatus(statuses.get('bakerloo')).level, 0);
  // Planned work announced for later (isNow: false): good service now.
  const bus = parseLineStatus(fixtureJson('status-bus-73.json')[0]);
  assert.deepEqual([bus.severity, bus.level, bus.reason], [10, 0, '']);
  // Two statuses at once: the worst leads, both are listed.
  const both = parseLineStatus({
    id: 'district',
    lineStatuses: [
      { statusSeverity: 9, reason: 'District Line: Minor delays.' },
      { statusSeverity: 5, reason: 'DISTRICT LINE: No service between A and B.' },
    ],
  });
  assert.deepEqual([both.severity, both.level, both.severities], [5, 2, [5, 9]]);
  assert.equal(both.reason, 'No service between A and B. Minor delays.');
});

test('names and reasons are cleaned', () => {
  assert.equal(cleanName('Oxford Circus Underground Station'), 'Oxford Circus');
  assert.equal(cleanName('Bank DLR Station'), 'Bank');
  assert.equal(cleanName('London Paddington Rail Station'), 'London Paddington');
  assert.equal(cleanName('Brixton Station'), 'Brixton Station');
  assert.equal(cleanReason('Oxford Street (PED)Route 73: From 25/10'), 'From 25/10');
  assert.equal(cleanReason('London Tramlink: No service'), 'No service');
});

test('stops: a station, a hub (TfL children only), a bus stop pair', () => {
  const oxford = resolveStop(fixtureJson('stoppoint-940GZZLUOXC.json'));
  assert.deepEqual(
    [oxford.name, oxford.points, oxford.lines.map((line) => line.id)],
    ['Oxford Circus', ['940GZZLUOXC'], ['bakerloo', 'central', 'victoria']],
  );
  const brixton = resolveStop(fixtureJson('stoppoint-HUBBRX.json'));
  assert.deepEqual([brixton.name, brixton.points], ['Brixton', ['940GZZLUBXN']]);
  const pair = resolveStop(fixtureJson('stoppoint-490G00015204.json'));
  assert.deepEqual(
    [pair.name, pair.points],
    ['Oxford Circus Station / John Lewis (Stop OF)', ['490015196OF']],
  );
  assert.equal(
    resolveStop({ id: 'X', stopType: 'NaptanRailStation', modes: ['national-rail'] }),
    null,
  );
});

test('arrivals: soonest first, duplicates merged, gone ones dropped, filters', () => {
  const elizabeth = fixtureJson('arrivals-910GPADTLL.json');
  // TfL lists some Elizabeth line trains twice.
  const parsed = parseArrivals(elizabeth, FIXTURE_TIME);
  assert.ok(parsed.length < elizabeth.length);
  const oxford = parseArrivals(fixtureJson('arrivals-940GZZLUOXC.json'), FIXTURE_TIME);
  assert.deepEqual(
    oxford.slice(0, 2).map((a) => [a.line, a.destination, a.platform, a.minutes]),
    [
      ['Bakerloo', 'Elephant & Castle', 'Southbound - Platform 3', 0],
      ['Central', 'West Ruislip', 'Westbound - Platform 1', 0],
    ],
  );
  assert.ok(oxford.every((a, i) => i === 0 || oxford[i - 1].expected <= a.expected));
  const later = parseArrivals(fixtureJson('arrivals-940GZZLUOXC.json'), FIXTURE_TIME + 10 * 60000);
  assert.ok(later.length < oxford.length);
  const north = applyFilters(oxford, { lines: ['victoria'], direction: 'northbound' });
  assert.ok(north.length > 0);
  assert.ok(north.every((a) => a.lineId === 'victoria' && /Northbound/.test(a.platform)));
  assert.deepEqual(
    applyFilters(oxford, { lines: [], direction: 'walthamstow' }).map((a) => a.lineId),
    north.map((a) => a.lineId),
  );
});
