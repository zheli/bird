# bird 🐦 — fast X CLI for tweeting, replying, and reading

`bird` is a fast X CLI for tweeting, replying, and reading. It uses either GraphQL cookies or the Sweetistics API.

## Install

```bash
npm install -g @steipete/bird
# or
pnpm add -g @steipete/bird
```

## Quickstart

```bash
# Show the logged-in account
bird whoami

# Discover command help
bird help whoami

# Read a tweet (URL or ID)
bird read https://x.com/user/status/1234567890123456789
bird 1234567890123456789 --json

# Thread + replies
bird thread https://x.com/user/status/1234567890123456789
bird replies 1234567890123456789

# Search + mentions
bird search "from:steipete" -n 5
bird mentions -n 5
bird mentions --user @steipete -n 5

# Refresh GraphQL query IDs cache (no rebuild)
bird query-ids --fresh
```

## Commands

- `bird tweet "<text>"` — post a new tweet.
- `bird reply <tweet-id-or-url> "<text>"` — reply to a tweet using its ID or URL.
- `bird help [command]` — show help (or help for a subcommand).
- `bird query-ids [--fresh] [--json]` — inspect or refresh cached GraphQL query IDs.
- `bird read <tweet-id-or-url> [--json]` — fetch tweet content as text or JSON.
- `bird <tweet-id-or-url> [--json]` — shorthand for `read` when only a URL or ID is provided.
- `bird replies <tweet-id-or-url> [--json]` — list replies to a tweet.
- `bird thread <tweet-id-or-url> [--json]` — show the full conversation thread.
- `bird search "<query>" [-n count] [--json]` — search for tweets matching a query.
- `bird mentions [-n count] [--user @handle] [--json]` — find tweets mentioning a user (defaults to the authenticated user).
- `bird whoami` — print which Twitter account your cookies belong to.
- `bird check` — show which credentials are available and where they were sourced from.

## Engines

- `--engine auto` (default) — use GraphQL first; if a Sweetistics API key is available, fall back on errors.
- `--engine graphql` — use Twitter/X GraphQL with cookies (Chrome/Firefox/env/flags).
- `--engine sweetistics` — use Sweetistics API key (no browser cookies needed).

Global options:
- `--timeout <ms>`: abort requests after the given timeout (milliseconds).
- `--plain`: stable output (no emoji, no color).
- `--no-emoji`: disable emoji output.
- `--no-color`: disable ANSI colors (or set `NO_COLOR=1`).

## Authentication (GraphQL)

`bird` resolves credentials in this order:

1. CLI flags: `--auth-token`, `--ct0`
2. Environment variables: `AUTH_TOKEN`, `CT0` (fallback: `TWITTER_AUTH_TOKEN`, `TWITTER_CT0`)
3. Browser cookies (macOS): Firefox or Chrome profiles

Browser cookie sources:
- Firefox (default): `~/Library/Application Support/Firefox/Profiles/<profile>/cookies.sqlite`
- Chrome: `~/Library/Application Support/Google/Chrome/<Profile>/Cookies`

## Config (JSON5)

Config precedence: CLI flags > env vars > project config > global config.

- Global: `~/.config/bird/config.json5`
- Project: `./.birdrc.json5`

Example `~/.config/bird/config.json5`:

```json5
{
  engine: "auto",
  firefoxProfile: "default-release",
  sweetisticsApiKey: "sweet-...",
  allowFirefox: true,
  allowChrome: false,
  timeoutMs: 20000
}
```

Environment shortcuts:
- `SWEETISTICS_API_KEY`, `SWEETISTICS_BASE_URL`
- `BIRD_ENGINE`, `BIRD_TIMEOUT_MS`

## Output

- `--json` prints raw tweet objects for read/replies/thread/search/mentions.
- `read` returns full text for Notes and Articles when present.
- Use `--plain` for stable, script-friendly output (no emoji, no color).

## Query IDs (GraphQL)

X rotates GraphQL query IDs frequently. `bird` caches refreshed IDs on disk and retries automatically on 404s.

Refresh on demand:

```bash
bird query-ids --fresh
```

Exit codes:
- `0`: success
- `1`: runtime error (network/auth/etc)
- `2`: invalid usage/validation (e.g. bad `--user` handle)

## Version

`bird --version` prints `package.json` version plus current git sha when available, e.g. `0.2.0 (3df7969b)`.

## Media uploads (Sweetistics only)

- Attach media with `--media` (repeatable) and optional `--alt` per item.
- Up to 4 images, or 1 video (no mixing). Supported: jpg, jpeg, png, webp, gif, mp4, mov.

Example:

```bash
bird --engine sweetistics tweet "hi" --media img.png --alt "desc"
```

## Development

```bash
cd ~/Projects/bird
pnpm install
pnpm run build       # dist/ + bun binary
pnpm run build:dist  # dist/ only
pnpm run build:binary

pnpm run dev tweet "Test"
pnpm run dev -- --plain check
pnpm test
pnpm run lint
```

## Notes

- GraphQL uses internal X endpoints and can be rate limited (429).
- Query IDs rotate; refresh them with `pnpm run graphql:update`.
