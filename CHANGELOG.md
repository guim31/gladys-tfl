# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-23

### Added

- Follow London lines from TfL open data (no account, optional free app key):
  any Tube line, the Overground lines, DLR, Elizabeth line, tram and bus
  routes. A device per line: status, disruption level 0 to 3, disrupted
  yes/no, reason.
- Watch stations and bus stops, optionally filtered by lines and direction. A
  device per stop: next and following arrival (minutes), line and destination
  of the next one, disruption of its lines.
- Configuration actions: follow a line, stop following it, find a stop, add a
  stop, remove a stop, show what is followed.
- Dashboard widgets "Next arrivals" and "TfL line status".
- Scene triggers: line status changed (disrupted, getting worse, getting
  better, back to good service) and time to leave (1 to 20 minutes).
- Scene actions "Get the next arrivals" and "Get a line status", with a
  sentence ready to send.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-tfl/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-tfl/releases/tag/v1.0.0
