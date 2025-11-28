# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0 — 2025-11-28
- Initial release of `bird`, a CLI for posting tweets and replies via the Twitter/X GraphQL API.
- Supports posting tweets, replying to existing tweets by ID or URL, and reading tweet details.
- Credential resolution priority: CLI flags, environment variables (`AUTH_TOKEN`, `CT0`, fallbacks `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`), then macOS Chrome cookies.
- Includes credential check command and human-friendly output for tweet metadata.
- Bundled TypeScript sources, Vitest coverage, and Biome lint/format configuration.
