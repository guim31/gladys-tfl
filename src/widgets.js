// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+).
//
// - arrivals: the board of one watched stop — a status row per arrival
//   ("Victoria → Brixton" / "07:45 · 3 min · Platform 6"), green when its line
//   runs normally, orange when it is slightly disrupted, red when severely;
//   the heading is the stop, the caption the reason of a disruption (or the
//   legend).
// - line_status: every followed line — a status row each ("Victoria" / "Minor
//   delays"), coloured by level; the caption is the first reason.
//
// Budget of the core: 8 components, 2 texts, a status of 10 rows at most.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { clockTime } from './transit.js';
import { clip, statusText, watchName, watchedLines } from './devices.js';
import { TEXT, lineLabel, say } from './messages.js';

export const MAX_ROWS = 8;
export const MAX_LINE_ROWS = 10;
const MAX_LABEL = 40;
// A caption longer than this is cut by the core.
const MAX_CAPTION = 80;

const t = (language, key, params) => say(TEXT, language, key, params);

export function levelColor(level) {
  if (level >= 2) {
    return WIDGET_COLORS.DANGER;
  }
  return level === 1 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS;
}

/** "07:45 · 3 min · Platform 6": 40 characters at most. */
export function arrivalValue(arrival) {
  const base = `${clockTime(arrival.expected)} · ${arrival.minutes} min`;
  const platform = arrival.platform.replace(/^.*-\s*/, '');
  return clip(platform ? `${base} · ${platform}` : base, 40);
}

const ttlOf = (service) => Math.max(30, service.config.refreshSeconds);

async function arrivalsContent(service, { settings, language }) {
  const ttl = ttlOf(service);
  if (!settings?.stop) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'pickStop') }] };
  }
  const found = await service.boardOf(settings.stop);
  if (!found) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'gone') }] };
  }
  const { watch, arrivals } = found;
  const components = [{ type: 'text', variant: 'heading', text: clip(watchName(watch), 40) }];
  if (!arrivals) {
    components.push({ type: 'text', variant: 'body', text: t(language, 'loading') });
    return { ttl_seconds: ttl, components };
  }
  const reasons = watchedLines(watch)
    .map((id) => service.statuses.get(id))
    .filter((status) => status && status.level > 0)
    .map((status) => status.reason || `${status.name}: ${statusText(status, language)}`);
  components.push({
    type: 'text',
    variant: 'caption',
    text:
      reasons.length > 0
        ? clip(`⚠ ${[...new Set(reasons)].join(' · ')}`, MAX_CAPTION)
        : t(language, arrivals.length > 0 ? 'legend' : 'noArrival'),
  });
  if (arrivals.length === 0) {
    return { ttl_seconds: ttl, components };
  }
  components.push({
    type: 'status',
    items: arrivals.slice(0, MAX_ROWS).map((arrival) => ({
      label: clip(`${arrival.line} → ${arrival.destination}`, MAX_LABEL),
      value: arrivalValue(arrival),
      color: levelColor(service.statuses.get(arrival.lineId)?.level ?? 0),
    })),
  });
  return { ttl_seconds: ttl, components };
}

async function lineStatusContent(service, { language }) {
  const ttl = ttlOf(service);
  const lines = service.createdLines();
  if (lines.length === 0) {
    return { ttl_seconds: ttl, components: [{ type: 'text', text: t(language, 'noLines') }] };
  }
  if (lines.some((line) => !service.statuses.has(line.id))) {
    await service.freshen(service.lineDeviceId(lines[0]), 0);
  }
  const known = lines
    .map((line) => ({ line, status: service.statuses.get(line.id) }))
    .filter((entry) => entry.status)
    // The worst first, then by name.
    .sort((a, b) => b.status.level - a.status.level || a.line.name.localeCompare(b.line.name));
  const components = [{ type: 'text', variant: 'heading', text: t(language, 'linesHeading') }];
  if (known.length === 0) {
    components.push({ type: 'text', variant: 'body', text: t(language, 'loading') });
    return { ttl_seconds: ttl, components };
  }
  const disrupted = known.filter((entry) => entry.status.level > 0);
  components.push({
    type: 'text',
    variant: 'caption',
    text:
      disrupted.length > 0
        ? clip(
            `⚠ ${disrupted[0].status.reason || lineLabel(disrupted[0].line, language)}`,
            MAX_CAPTION,
          )
        : t(language, 'allGood'),
  });
  components.push({
    type: 'status',
    items: known.slice(0, MAX_LINE_ROWS).map(({ line, status }) => ({
      label: clip(lineLabel(line, language), MAX_LABEL),
      value: clip(statusText(status, language), 40),
      color: levelColor(status.level),
    })),
  });
  return { ttl_seconds: ttl, components };
}

export const WIDGETS = {
  arrivals: { get: arrivalsContent },
  line_status: { get: lineStatusContent },
};
