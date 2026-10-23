// -----------------------------------------------------------------------------
// A scenario staging every trigger on the real Friday-night data: the first
// read is silent, then, a minute later, the Victoria line goes from minor to
// severe delays and the trains approaching Oxford Circus cross the "time to
// leave" thresholds.
// -----------------------------------------------------------------------------

import { OXFORD_CIRCUS, action, create, setStatus } from './world.js';

/** Resolves with the scene events fired after the first read. */
export async function stageEverything(world) {
  await action(world, 'add_line', { line: 'Victoria' });
  await action(world, 'add_stop', { stop: OXFORD_CIRCUS });
  const line = await create(world, 'Victoria');
  const stop = await create(world, 'Oxford Circus');
  const before = world.fake.sceneEvents.length;
  setStatus(world.network, 'victoria', 6, 'Victoria Line: Severe delays due to a signal failure.');
  world.clock.advance(60000);
  await world.service.refresh();
  return { line, stop, events: world.fake.sceneEvents.slice(before) };
}
