// -----------------------------------------------------------------------------
// Integration configuration: the defaults (they mirror the `default` values of
// the manifest `config_schema`, test/manifest.test.js checks it) and the
// normalization of what Gladys sends (strings from the form).
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Seconds between two reads. One minute is the floor: TfL predictions move by
// the minute, and its anonymous quota is shared by every user of the API.
export const REFRESH_INTERVALS = [60, 120];

export const DEFAULT_CONFIG = {
  language: 'fr',
  refresh_interval: '60',
  app_key: '',
};

/**
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 * @returns {{ language: string, refreshSeconds: number, appKey: string, keyRejected: boolean }}
 */
export function normalizeConfig(raw = {}) {
  const language = LANGUAGES.includes(raw?.language) ? raw.language : DEFAULT_CONFIG.language;
  const seconds = Number(raw?.refresh_interval ?? DEFAULT_CONFIG.refresh_interval);
  // A key is alphanumeric: anything else (spaces, a pasted label) is not sent.
  const key = String(raw?.app_key ?? '').trim();
  const valid = /^[A-Za-z0-9]{8,64}$/.test(key);
  return {
    language,
    refreshSeconds: REFRESH_INTERVALS.includes(seconds)
      ? seconds
      : Number(DEFAULT_CONFIG.refresh_interval),
    appKey: valid ? key : '',
    // Something was typed but is not a key: said in the status, never sent.
    keyRejected: key !== '' && !valid,
  };
}
