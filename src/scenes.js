// -----------------------------------------------------------------------------
// Scene actions (manifest `scene_actions`, Gladys 5.1+).
//
// - get_next_arrivals: the next arrivals of a watched stop, as numbers for a
//   "Continue only if" step and as a sentence ready for a message or a speaker
//   ("Victoria to Brixton at Oxford Circus: in 3 and 7 min").
// - get_line_status: the status of a followed line, its level and reason.
//
// A scene action does not receive the user's language: the sentences follow
// the `language` of the configuration. Outputs are numbers, never booleans:
// the core's "Continue only if" compares with ===, and its value field only
// produces numbers and strings (Gladys 5.2.0).
// -----------------------------------------------------------------------------

import { clockTime, fold } from './transit.js';
import { NO_ARRIVAL_MINUTES, clip, levelName, statusText } from './devices.js';
import { TEXT, lineLabel, say } from './messages.js';
import { SceneError } from './service.js';

// Line and destination groups in the sentence.
export const MAX_SENTENCE_GROUPS = 3;

/** The arrivals grouped by line and destination, soonest first. */
export function groupArrivals(arrivals) {
  const groups = new Map();
  for (const arrival of arrivals) {
    const key = `${arrival.lineId}|${arrival.destination}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(arrival);
  }
  return [...groups.values()];
}

export const SCENE_ACTIONS = {
  async get_next_arrivals(service, { fields }) {
    const language = service.config.language;
    const found = await service.boardOf(fields.stop);
    if (!found) {
      throw new SceneError(say(TEXT, language, 'gone'));
    }
    if (!found.arrivals) {
      throw new SceneError(say(TEXT, language, 'unavailable'));
    }
    const { watch } = found;
    const line = fold(fields.line);
    const arrivals = found.arrivals.filter(
      (arrival) => !line || fold(arrival.line) === line || fold(arrival.lineId) === line,
    );
    const groups = groupArrivals(arrivals);
    const first = groups[0];
    const disrupted = found.disrupted ? 1 : 0;
    if (!first) {
      return {
        sentence: say(TEXT, language, 'nothingAt', { stop: watch.name }),
        stop_name: watch.name,
        line: String(fields.line ?? '').trim(),
        destination: '',
        platform: '',
        minutes: NO_ARRIVAL_MINUTES,
        following_minutes: NO_ARRIVAL_MINUTES,
        expected_time: '',
        disrupted,
      };
    }
    const [next, following] = first;
    return {
      sentence: groups
        .slice(0, MAX_SENTENCE_GROUPS)
        .map((group) => service.sentence(watch, group, language))
        .join('. '),
      stop_name: watch.name,
      line: next.line,
      destination: next.destination,
      platform: next.platform,
      minutes: next.minutes,
      following_minutes: following ? following.minutes : NO_ARRIVAL_MINUTES,
      expected_time: clockTime(next.expected),
      disrupted,
    };
  },

  async get_line_status(service, { fields }) {
    const language = service.config.language;
    const found = await service.lineStatusOf(fields.line);
    if (!found) {
      throw new SceneError(say(TEXT, language, 'gone'));
    }
    if (!found.status) {
      throw new SceneError(say(TEXT, language, 'unavailable'));
    }
    const { line, status } = found;
    const name = lineLabel(line, language);
    const text = statusText(status, language);
    const reason = status.level > 0 ? status.reason : '';
    return {
      sentence: clip(
        `${say(TEXT, language, 'lineSentence', { line: name, status: text })}.${reason ? ` ${reason}` : ''}`,
        1000,
      ),
      line_name: name,
      status: text,
      level: status.level,
      level_name: levelName(status.level, language),
      disrupted: status.level > 0 ? 1 : 0,
      reason: clip(reason, 1000),
    };
  },
};
