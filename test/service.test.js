// -----------------------------------------------------------------------------
// The integration end to end, against the SDK's fake Gladys and the real TfL
// answers: configuration actions, discovered devices, states, scene triggers,
// widgets, scene actions, persistence, failures, logs, the app key.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { NO_ARRIVAL_MINUTES } from '../src/devices.js';
import { MAX_LINES, MAX_WATCHES, TRIGGERS } from '../src/service.js';
import {
  BRIXTON_HUB,
  BUS_PAIR,
  OXFORD_CIRCUS,
  action,
  captureLogs,
  create,
  createFetch,
  createWorld,
  discovered,
  lastState,
  setStatus,
} from './helpers/world.js';
import { stageEverything } from './helpers/scenario.js';

const fr = (message) => message.fr;

test('nothing followed: no request at all, the status says so', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await world.service.refresh();
  assert.equal(world.network.calls.length, 0);
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.match(fr(await action(world, 'status')), /Aucune ligne ni aucun arrêt suivi/);
});

test('follow a line: by name, by id, a bus route, unknown, duplicate', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(
    fr(await action(world, 'add_line', { line: 'victoria' })).split('\n')[0],
    'Victoria suivie.',
  );
  await action(world, 'add_line', { line: 'Elizabeth line' });
  await action(world, 'add_line', { line: 'Hammersmith & City line' });
  assert.match(fr(await action(world, 'add_line', { line: 'Bus 73' })), /^Bus 73 suivie/);
  assert.equal(
    fr(await action(world, 'add_line', { line: 'Nope' })),
    "TfL n'a aucune ligne « Nope ».",
  );
  assert.equal(
    fr(await action(world, 'add_line', { line: 'Victoria line' })),
    'Victoria est déjà suivie.',
  );
  assert.match(fr(await action(world, 'add_line', { line: ' ' })), /Saisissez un nom ou un numéro/);
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      ['TfL · Victoria', 'ext:test-integration:line:victoria'],
      ['TfL · Elizabeth line', 'ext:test-integration:line:elizabeth'],
      ['TfL · Hammersmith & City', 'ext:test-integration:line:hammersmith-city'],
      ['TfL · Bus 73', 'ext:test-integration:line:73'],
    ],
  );
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    ['État', 'Niveau de perturbation', 'Perturbation', 'Motif'],
  );
  const saved = JSON.parse(await readFile(join(world.dataDir, 'watch.json'), 'utf8'));
  assert.equal(saved.lines.length, 4);
  // Nothing is read before a device is created.
  await world.service.refresh();
  assert.equal(world.network.statusRequests().length, 0);
});

test('line states: minor delays, suspended, good service, planned work not yet started', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (const line of ['Victoria', 'Suffragette', 'Bakerloo', '73', 'Windrush']) {
    await action(world, 'add_line', { line });
  }
  const victoria = await create(world, 'Victoria');
  assert.equal(lastState(world, victoria, 'status'), 'Retards légers');
  assert.equal(lastState(world, victoria, 'level'), 1);
  assert.equal(lastState(world, victoria, 'disruption'), 1);
  assert.equal(lastState(world, victoria, 'reason'), 'Minor delays due to train cancellations.');
  const suffragette = await create(world, 'Suffragette');
  assert.equal(lastState(world, suffragette, 'status'), 'Interrompue');
  assert.equal(lastState(world, suffragette, 'level'), 3);
  assert.match(
    lastState(world, suffragette, 'reason'),
    /^No service due to a power supply failure/,
  );
  const windrush = await create(world, 'Windrush');
  assert.equal(lastState(world, windrush, 'level'), 2);
  const bakerloo = await create(world, 'Bakerloo');
  assert.equal(lastState(world, bakerloo, 'status'), 'Trafic normal');
  assert.equal(lastState(world, bakerloo, 'level'), 0);
  assert.equal(lastState(world, bakerloo, 'reason'), 'Aucune perturbation');
  // The 73 has a planned work announced for Sunday night: not a disruption now.
  const bus = await create(world, 'Bus 73');
  assert.equal(lastState(world, bus, 'level'), 0);
  assert.equal(lastState(world, bus, 'disruption'), 0);
  // One status request for every line, whatever their number.
  world.clock.advance(60000);
  const before = world.network.statusRequests().length;
  await world.service.refresh();
  assert.equal(world.network.statusRequests().length, before + 1);
  assert.ok(world.fake.widgetRefreshes.includes('line_status'));
});

test('line trigger: silent first read, then disrupted, worsened, improved, restored', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_line', { line: 'Bakerloo' });
  const bakerloo = await create(world, 'Bakerloo');
  const fired = () =>
    world.fake.sceneEvents
      .filter((event) => event.key === TRIGGERS.LINE)
      .map((event) => [event.data.event, event.data.level, event.data.previous_level]);
  await world.service.refresh();
  assert.deepEqual(fired(), []);
  setStatus(
    world.network,
    'bakerloo',
    9,
    'Bakerloo Line: Minor delays due to an earlier signal failure.',
  );
  await world.service.refresh();
  setStatus(world.network, 'bakerloo', 2, 'Bakerloo Line: Suspended.');
  await world.service.refresh();
  // The same level again: nothing.
  await world.service.refresh();
  setStatus(world.network, 'bakerloo', 6);
  await world.service.refresh();
  setStatus(world.network, 'bakerloo', 10);
  await world.service.refresh();
  assert.deepEqual(fired(), [
    ['disrupted', 1, 0],
    ['worsened', 3, 1],
    ['improved', 2, 3],
    ['restored', 0, 2],
  ]);
  const first = world.fake.sceneEvents.find((event) => event.key === TRIGGERS.LINE);
  assert.deepEqual(first.data, {
    line: bakerloo.external_id,
    line_name: 'Bakerloo',
    event: 'disrupted',
    status: 'Retards légers',
    level: 1,
    previous_level: 0,
    reason: 'Minor delays due to an earlier signal failure.',
  });
});

test('"Service closed" at night is no disruption', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_line', { line: 'Bakerloo' });
  const bakerloo = await create(world, 'Bakerloo');
  setStatus(world.network, 'bakerloo', 20);
  await world.service.refresh();
  assert.equal(lastState(world, bakerloo, 'status'), 'Service terminé');
  assert.equal(lastState(world, bakerloo, 'disruption'), 0);
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('search: by name, by identifier, nothing found, TfL down', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const byName = await action(world, 'search_stops', { query: 'Oxford Circus' });
  assert.match(fr(byName), /^8 arrêt\(s\) trouvé\(s\)/);
  assert.match(fr(byName), /• Oxford Circus · Métro \[940GZZLUOXC\]/);
  assert.match(
    byName.en,
    /• Oxford Circus Station \(→ Marble Arch Or Great Portland Street\) · Bus \[490000173RC\]/,
  );
  assert.match(byName.de, /Haltestelle hinzufügen/);
  const byId = await action(world, 'search_stops', { query: '940gzzluoxc' });
  assert.match(fr(byId), /1 arrêt\(s\) trouvé\(s\) :\n• Oxford Circus · Métro \[940GZZLUOXC\]/);
  assert.equal(
    fr(await action(world, 'search_stops', { query: 'Zzyzx' })),
    'Aucun arrêt ne correspond à « Zzyzx ».',
  );
  assert.match(fr(await action(world, 'search_stops', { query: ' ' })), /Saisissez/);
  world.network.fail = 503;
  assert.equal(
    fr(await action(world, 'search_stops', { query: 'Oxford Circus' })),
    'TfL est injoignable (api.tfl.gov.uk: HTTP 503). Réessayez dans un instant.',
  );
});

test('add a stop: exact name, hub, bus stop pair, unknown, National Rail only, lines, duplicates', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ambiguous = await action(world, 'add_stop', { stop: 'Brixton Station' });
  assert.match(fr(ambiguous), /^Plusieurs arrêts correspondent/);
  assert.match(fr(ambiguous), /• Brixton Station \(→ Herne Hill\) · Bus \[490000031E\]/);
  assert.doesNotMatch(fr(ambiguous), /HUBBRX/);
  assert.match(
    fr(await action(world, 'add_stop', { stop: 'Zzyzx' })),
    /TfL ne connaît aucun arrêt « Zzyzx »/,
  );
  assert.match(
    fr(await action(world, 'add_stop', { stop: 'NOPE123' })),
    /TfL ne connaît aucun arrêt/,
  );
  const wrongLine = await action(world, 'add_stop', {
    stop: OXFORD_CIRCUS,
    lines: 'Victoria, Jubilee',
  });
  assert.equal(
    fr(wrongLine),
    'Ligne(s) absente(s) de cet arrêt : Jubilee. Lignes desservies : Bakerloo, Central, Victoria.',
  );
  assert.deepEqual(world.fake.discoveredDevices, []);

  // "Oxford Circus" names the Tube station only: the bus stops are "… Station".
  const added = await action(world, 'add_stop', {
    stop: 'Oxford Circus',
    lines: 'victoria line',
    direction: 'Southbound',
  });
  assert.equal(
    fr(added),
    "Oxford Circus (Victoria · → Southbound) ajouté.\nOuvrez l'onglet Découverte pour créer son appareil.",
  );
  // The Brixton hub: its Tube station only, National Rail has no TfL arrivals.
  assert.match(fr(await action(world, 'add_stop', { stop: 'Brixton' })), /^Brixton ajouté/);
  assert.match(
    fr(await action(world, 'add_stop', { stop: BUS_PAIR })),
    /^Oxford Circus Station \/ John Lewis \(Stop OF\) ajouté/,
  );
  assert.match(
    fr(
      await action(world, 'add_stop', {
        stop: OXFORD_CIRCUS,
        lines: 'Victoria',
        direction: 'Southbound',
      }),
    ),
    /déjà suivi avec ces filtres/,
  );
  assert.deepEqual(
    world.service.watches.map((watch) => [watch.id, watch.points, watch.served]),
    [
      ['940GZZLUOXC', ['940GZZLUOXC'], ['bakerloo', 'central', 'victoria']],
      ['HUBBRX', ['940GZZLUBXN'], ['victoria']],
      [
        '490G00015204',
        ['490015196OF'],
        ['7', '94', '98', '139', '390', 'n7', 'n98', 'n113', 'n207'],
      ],
    ],
  );
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => [d.name, d.external_id]),
    [
      [
        'TfL · Oxford Circus (Victoria · → Southbound)',
        'ext:test-integration:stop:940gzzluoxc-victoria-to-southbound',
      ],
      ['TfL · Brixton', 'ext:test-integration:stop:hubbrx'],
      [
        'TfL · Oxford Circus Station / John Lewis (Stop OF)',
        'ext:test-integration:stop:490g00015204',
      ],
    ],
  );
  assert.deepEqual(
    devices[0].features.map((f) => f.name),
    ['Prochain passage', 'Passage suivant', 'Ligne et destination', 'Perturbation'],
  );
  // Nothing is read before a device is created.
  await world.service.refresh();
  assert.equal(world.network.arrivalRequests().length, 0);
});

test('a hub without TfL arrivals is refused', async (t) => {
  const network = createFetch();
  const world = await createWorld({ network });
  t.after(() => world.app.stop());
  const fetch = network.fetch;
  // Brixton as if it only had its National Rail station.
  network.fetch = async (url) => {
    const response = await fetch(url);
    if (!url.includes('/StopPoint/HUBBRX')) {
      return response;
    }
    const body = await response.json();
    body.children = body.children.filter((child) => child.id === '910GBRIXTON');
    return new Response(JSON.stringify(body), { status: 200 });
  };
  world.service.tfl.fetch = network.fetch;
  assert.match(
    fr(await action(world, 'add_stop', { stop: BRIXTON_HUB })),
    /n'a pas de passages TfL/,
  );
});

test('at most MAX_WATCHES stops and MAX_LINES lines', async (t) => {
  const watches = Array.from({ length: MAX_WATCHES }, (_, i) => ({
    id: OXFORD_CIRCUS,
    name: 'Oxford Circus',
    points: [OXFORD_CIRCUS],
    lines: [],
    lineNames: [],
    served: [],
    direction: `D${i}`,
  }));
  const lines = Array.from({ length: MAX_LINES }, (_, i) => ({
    id: `l${i}`,
    name: `L${i}`,
    mode: 'bus',
  }));
  const world = await createWorld({ saved: { watches, lines } });
  t.after(() => world.app.stop());
  assert.match(fr(await action(world, 'add_stop', { stop: BRIXTON_HUB })), /déjà 10 arrêts/);
  assert.match(fr(await action(world, 'add_line', { line: 'Victoria' })), /déjà 20 lignes/);
});

test('stop states: next arrivals, line and destination, disruption of its lines', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS, lines: 'Victoria' });
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS, lines: 'Bakerloo' });
  await action(world, 'add_stop', { stop: BUS_PAIR });
  const victoria = await create(world, 'Oxford Circus (Victoria)');
  assert.equal(lastState(world, victoria, 'next'), 0);
  assert.equal(lastState(world, victoria, 'following'), 2);
  assert.equal(lastState(world, victoria, 'line'), 'Victoria → Walthamstow Central');
  // Minor delays on the Victoria line that night.
  assert.equal(lastState(world, victoria, 'disruption'), 1);
  const bakerloo = await create(world, 'Oxford Circus (Bakerloo)');
  assert.equal(lastState(world, bakerloo, 'line'), 'Bakerloo → Elephant & Castle');
  assert.equal(lastState(world, bakerloo, 'disruption'), 0);
  const bus = await create(world, 'John Lewis');
  assert.equal(lastState(world, bus, 'line'), '139 → Waterloo Station');
  // The same stop point is read once for the two Oxford Circus watches.
  world.clock.advance(60000);
  const before = world.network.arrivalRequests().length;
  await world.service.refresh();
  assert.equal(world.network.arrivalRequests().length, before + 2);
  assert.ok(world.fake.widgetRefreshes.includes('arrivals'));
});

test('no arrival announced: countdowns at their maximum', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS });
  world.network.arrivals[OXFORD_CIRCUS] = [];
  const stop = await create(world, 'Oxford Circus');
  assert.equal(lastState(world, stop, 'next'), NO_ARRIVAL_MINUTES);
  assert.equal(lastState(world, stop, 'following'), NO_ARRIVAL_MINUTES);
  assert.equal(lastState(world, stop, 'line'), 'Aucun passage annoncé');
});

test('triggers: silent first read, then once per arrival and threshold', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { line, stop, events } = await stageEverything(world);
  const lineEvents = events.filter((event) => event.key === TRIGGERS.LINE);
  assert.deepEqual(
    lineEvents.map((event) => event.data.event),
    ['worsened'],
  );
  assert.equal(lineEvents[0].data.line, line.external_id);
  assert.equal(lineEvents[0].data.reason, 'Severe delays due to a signal failure.');
  const soon = events.filter((event) => event.key === TRIGGERS.SOON);
  assert.ok(soon.length > 0);
  for (const event of soon) {
    assert.equal(event.data.stop, stop.external_id);
    assert.equal(event.data.stop_name, 'Oxford Circus');
    assert.ok(Number(event.data.threshold) >= event.data.minutes);
    assert.ok(Number(event.data.threshold) - event.data.minutes <= 1);
  }
  const first = soon.find((event) => event.data.line === 'Central' && event.data.threshold === '2');
  assert.deepEqual(first?.data && Object.keys(first.data).sort(), [
    'destination',
    'expected_time',
    'line',
    'minutes',
    'platform',
    'stop',
    'stop_name',
    'threshold',
  ]);
  // The same read again: no threshold twice.
  const count = world.fake.sceneEvents.length;
  await world.service.refresh();
  assert.equal(world.fake.sceneEvents.length, count);
});

test('the container reads TfL on its own timer, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const world = await createWorld({ timers: true, config: { refresh_interval: '120' } });
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS });
  await create(world, 'Oxford Circus');
  const before = world.network.arrivalRequests().length;
  t.mock.timers.tick(120000);
  await world.service.inflight;
  t.mock.timers.tick(120000);
  await world.service.inflight;
  assert.equal(world.network.arrivalRequests().length, before + 2);
  // A poll right after a read does not read again.
  await world.fake.poll(discovered(world, 'Oxford Circus'));
  assert.equal(world.network.arrivalRequests().length, before + 2);
});

test('TfL down: one warning and the connection status, then back', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_line', { line: 'Victoria' });
  await create(world, 'Victoria');
  const logs = captureLogs(t);
  world.network.fail = new Error('connect ETIMEDOUT');
  await world.service.refresh();
  await world.service.refresh();
  assert.equal(logs.filter((line) => line.level === 'warn').length, 1);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /TfL est injoignable/);
  assert.match(
    fr(await action(world, 'status')),
    /Dernière erreur : api\.tfl\.gov\.uk: unreachable/,
  );
  world.network.fail = null;
  await world.service.refresh();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.ok(logs.some((line) => line.level === 'info' && /TfL reachable again/.test(line.text)));
});

test('TfL down: the countdowns go on from the last expected times', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: BUS_PAIR });
  const bus = await create(world, 'John Lewis');
  assert.equal(lastState(world, bus, 'next'), 13);
  world.network.fail = 500;
  world.clock.advance(5 * 60000);
  await world.service.refresh();
  assert.equal(lastState(world, bus, 'next'), 8);
});

test('the app key goes to TfL, never to the logs nor the errors', async (t) => {
  const key = 'abcdef0123456789abcdef0123456789';
  const world = await createWorld({ config: { app_key: key } });
  t.after(() => world.app.stop());
  const logs = captureLogs(t, 'debug');
  await action(world, 'add_line', { line: 'Victoria' });
  await create(world, 'Victoria');
  assert.ok(
    world.network.calls.every((call) => new URL(call.url).searchParams.get('app_key') === key),
  );
  world.network.fail = 429;
  await world.service.refresh();
  assert.match(world.service.lastError, /HTTP 429 \(quota\)/);
  assert.match(fr(await action(world, 'status')), /Clé TfL : renseignée/);
  assert.ok(logs.length > 0);
  assert.ok(
    logs.every((line) => !line.text.includes(key)),
    'no key in the logs',
  );
  assert.ok(!JSON.stringify(world.fake.connectionStatus).includes(key));
  // A malformed key is not sent at all.
  await world.fake.configUpdated({ app_key: 'not a key!' });
  world.network.fail = null;
  world.clock.advance(60000);
  await world.service.refresh();
  assert.equal(new URL(world.network.calls.at(-1).url).searchParams.get('app_key'), null);
});

test('a normal read writes nothing at info level', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_line', { line: 'Victoria' });
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS });
  await create(world, 'Victoria');
  await create(world, 'Oxford Circus');
  const logs = captureLogs(t);
  world.clock.advance(60000);
  await world.service.refresh();
  assert.deepEqual(logs, []);
});

test('/data lost: the lines and stops come back from the Gladys devices', async (t) => {
  const first = await createWorld();
  await action(first, 'add_line', { line: 'Victoria' });
  await action(first, 'add_stop', { stop: OXFORD_CIRCUS, lines: 'Central', direction: 'West' });
  const devices = first.fake.discoveredDevices.map((device) => ({ ...device }));
  await first.app.stop();
  const world = await createWorld({ devices });
  t.after(() => world.app.stop());
  assert.deepEqual(world.service.lines, [{ id: 'victoria', name: 'Victoria', mode: 'tube' }]);
  assert.deepEqual(world.service.watches, first.service.watches);
  // Both read at the start, as created devices.
  const stop = devices[1];
  assert.equal(lastState(world, stop, 'line'), 'Central → West Ruislip');
});

test('remove a stop and a line; they do not come back at the restart, even with their device', async (t) => {
  const world = await createWorld();
  await action(world, 'add_line', { line: 'Victoria' });
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS, lines: 'Victoria' });
  await action(world, 'add_stop', { stop: BRIXTON_HUB });
  assert.match(fr(await action(world, 'remove_stop', { name: 'Nowhere' })), /Aucun arrêt suivi/);
  assert.match(
    fr(await action(world, 'remove_stop', { name: 'oxford circus (victoria)' })),
    /^Oxford Circus \(Victoria\) retiré/,
  );
  assert.match(fr(await action(world, 'remove_stop', { name: 'hubbrx' })), /^Brixton retiré/);
  assert.match(fr(await action(world, 'remove_line', { line: 'Jubilee' })), /Aucune ligne suivie/);
  assert.match(
    fr(await action(world, 'remove_line', { line: 'victoria line' })),
    /^Victoria n'est plus suivie/,
  );
  assert.deepEqual(world.fake.discoveredDevices, []);
  const devices = [
    {
      name: 'TfL · Victoria',
      external_id: 'ext:test-integration:line:victoria',
      params: [{ name: 'line_id', value: 'victoria' }],
    },
  ];
  await world.app.stop();
  const again = await createWorld({ devices, dataDir: world.dataDir });
  t.after(() => again.app.stop());
  assert.deepEqual(again.service.lines, []);
});

test('the status lists the lines, the stops and their devices', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_line', { line: 'Victoria' });
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS });
  await create(world, 'Victoria');
  assert.equal(
    fr(await action(world, 'status')),
    [
      '1 ligne(s) suivie(s) :',
      '• Victoria · Retards légers — appareil créé',
      '1 arrêt(s) suivi(s) :',
      '• Oxford Circus [940GZZLUOXC] — appareil pas encore créé (onglet Découverte)',
      'Dernière lecture il y a 0 s.',
      'Clé TfL : aucune (quota anonyme).',
    ].join('\n'),
  );
});

test('the arrivals widget: board coloured by line status, disruption caption', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS });
  const stop = await create(world, 'Oxford Circus');
  const ack = await world.fake.widgetGet('arrivals', {
    settings: { stop: stop.external_id },
    language: 'fr',
  });
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content), []);
  const [heading, caption, status] = content.components;
  assert.equal(heading.text, 'Oxford Circus');
  assert.match(caption.text, /^⚠ Minor delays due to train cancellations\./);
  assert.equal(status.items.length, 8);
  assert.deepEqual(status.items[0], {
    label: 'Bakerloo → Elephant & Castle',
    value: '00:09 · 0 min · Platform 3',
    color: 'success',
  });
  const victoria = status.items.find((item) => item.label.startsWith('Victoria'));
  assert.equal(victoria.color, 'warning');
  // No stop chosen, an unknown stop.
  const empty = await world.fake.widgetGet('arrivals', { settings: {}, language: 'de' });
  assert.match(empty.data.content.components[0].text, /Wähle eine Haltestelle/);
  const gone = await world.fake.widgetGet('arrivals', {
    settings: { stop: 'ext:x:stop:y' },
    language: 'es',
  });
  assert.match(gone.data.content.components[0].text, /ya no se sigue/);
});

test('the line status widget: worst first, coloured, first reason', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const empty = await world.fake.widgetGet('line_status', { language: 'en' });
  assert.match(empty.data.content.components[0].text, /Follow a line/);
  for (const line of ['Bakerloo', 'Victoria', 'Suffragette']) {
    await action(world, 'add_line', { line });
    await create(world, line);
  }
  const ack = await world.fake.widgetGet('line_status', { language: 'en' });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const [heading, caption, status] = ack.data.content.components;
  assert.equal(heading.text, 'TfL line status');
  assert.match(caption.text, /^⚠ No service due to a power supply failure/);
  assert.deepEqual(status.items, [
    { label: 'Suffragette', value: 'Suspended', color: 'danger' },
    { label: 'Victoria', value: 'Minor delays', color: 'warning' },
    { label: 'Bakerloo', value: 'Good service', color: 'success' },
  ]);
});

test('the scene actions: sentences, line filter, nothing found, unknown device', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS });
  await action(world, 'add_line', { line: 'Suffragette' });
  await action(world, 'add_line', { line: 'Bakerloo' });
  const stop = await create(world, 'Oxford Circus');
  const suffragette = await create(world, 'Suffragette');
  const bakerloo = await create(world, 'Bakerloo');
  const all = await world.fake.sceneAction('get_next_arrivals', { stop: stop.external_id });
  assert.equal(all.success, true);
  assert.match(
    all.data.outputs.sentence,
    /^Bakerloo vers Elephant & Castle à Oxford Circus : maintenant/,
  );
  const victoria = await world.fake.sceneAction('get_next_arrivals', {
    stop: stop.external_id,
    line: 'victoria',
  });
  assert.equal(victoria.data.outputs.line, 'Victoria');
  assert.equal(victoria.data.outputs.disrupted, 1);
  const none = await world.fake.sceneAction('get_next_arrivals', {
    stop: stop.external_id,
    line: 'Jubilee',
  });
  assert.equal(none.data.outputs.sentence, 'Aucun passage annoncé à Oxford Circus.');
  assert.equal(none.data.outputs.minutes, NO_ARRIVAL_MINUTES);
  const status = await world.fake.sceneAction('get_line_status', { line: suffragette.external_id });
  assert.equal(status.data.outputs.level, 3);
  assert.equal(status.data.outputs.level_name, 'Interrompue ou fermée');
  assert.match(status.data.outputs.sentence, /^Suffragette : Interrompue\. No service due to/);
  const good = await world.fake.sceneAction('get_line_status', { line: bakerloo.external_id });
  assert.equal(good.data.outputs.sentence, 'Bakerloo : Trafic normal.');
  assert.equal(good.data.outputs.reason, '');
  const unknown = await world.fake.sceneAction('get_line_status', { line: 'ext:x:line:y' });
  assert.equal(unknown.success, false);
  assert.match(unknown.error, /n'est plus suivi/);
});

test('a language change renames the devices, not their features', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await action(world, 'add_line', { line: '73' });
  await world.fake.configUpdated({ language: 'es' });
  assert.equal(world.fake.discoveredDevices[0].name, 'TfL · Autobús 73');
});
