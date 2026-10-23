# Transport for London for Gladys Assistant

A [Gladys Assistant](https://gladysassistant.com) external integration for **London**: the status
of your lines and the next arrivals at your stops (Tube, London Overground, DLR, Elizabeth line,
trams and buses), in real time, from the [TfL Unified API](https://api.tfl.gov.uk). No account
needed; a free TfL app key is optional.

> **Developed without daily use in London: feedback welcome.** The integration is built and
> tested on real TfL answers (recorded on a Friday night with several lines disrupted) and its
> container was run against the live API; it has not yet run in a Gladys installation. Please
> report what works and what does not in the [issues](https://github.com/guim31/gladys-tfl/issues)
> or on the Gladys forum.

## What it does

- **A device per followed line** (any Tube line, the six Overground lines, DLR, Elizabeth line,
  tram, any bus route): status in words, disruption level 0 to 3, disrupted yes/no, reason.
- **A device per watched stop** (station or bus stop), optionally filtered by lines and direction:
  next and following arrival (minutes), line and destination of the next one, and whether one of
  its lines is disrupted.
- **Dashboard widgets**: _Next arrivals_ (the board of a stop) and _TfL line status_.
- **Scene triggers**: _Line status changed_ (disrupted, getting worse, getting better, back to
  good service) and _Time to leave_ (1 to 20 minutes before an arrival).
- **Scene actions**: _Get the next arrivals_ and _Get a line status_, with sentences ready to send.
- Texts in English, French, German and Spanish. TfL's reasons stay in English, as published.

The user documentation is in [`docs/en.md`](docs/en.md) ([fr](docs/fr.md), [de](docs/de.md),
[es](docs/es.md)).

## Requirements

- Gladys Assistant 5.1.0 or later, with internet access.
- Optional: a free app key from the [TfL API portal](https://api-portal.tfl.gov.uk).

## Installation

1. In Gladys, open **Integrations → Install from GitHub**.
2. Paste `https://github.com/guim31/gladys-tfl` and install.
3. In the integration's **Configuration** tab, use **Follow a line**, or **Find a stop** then
   **Add a stop**, and create the devices in the **Discover** tab.

## How it works

Every minute (or two), for the created devices only, the integration reads the status of every
line involved in one request (`/Line/{ids}/Status`), then the arrivals of each stop point
(`/StopPoint/{id}/Arrivals`). Stops are found with `/StopPoint/Search`; a hub (Brixton, Stratford…)
is read through its TfL stations. Only `/data/watch.json` is written: the followed lines and
watched stops. The app key is sent to TfL only and never logged.

## Limits

- No delay nor cancellation per train: TfL publishes predicted times only (about 30 minutes ahead).
- National Rail services at shared stations are not covered.
- Feature names are set when the device is created.
- Up to 20 lines and 10 stops; with many stops, use a free app key.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the SDK's fake Gladys and real TfL answers recorded in `test/fixtures/tfl`;
they never touch the network. See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- Data: Powered by TfL Open Data. Contains OS data © Crown copyright and database rights. See the
  [TfL transport data terms](https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service).
- Cover: the TfL roundel from
  [Wikimedia Commons](<https://commons.wikimedia.org/wiki/File:TfL_roundel_(no_text).svg>) (public
  domain), shown in white on the TfL blue.
- Inspired by the Home Assistant
  [London Underground](https://www.home-assistant.io/integrations/london_underground/) integration
  (Apache 2.0) and by the `gladys-entur` and `gladys-ttc` integrations.

Not affiliated with Transport for London. The roundel is a trademark of Transport for London.

## License

Apache-2.0
