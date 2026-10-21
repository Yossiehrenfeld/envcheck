# envcheck

[![CI](https://github.com/Yossiehrenfeld/envcheck/actions/workflows/ci.yml/badge.svg)](https://github.com/Yossiehrenfeld/envcheck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Make sure every variable in `.env.example` is actually set in `.env` (or `.env.production`, or
whatever you deploy with) — and fail CI when one is missing, instead of finding out in production.
Zero dependencies.

```
$ envcheck
✗ .env
  missing   STRIPE_WEBHOOK_SECRET
  empty     DATABASE_URL
  extra (ok) LEGACY_FLAG
$ echo $?
1
```

## Install

Not on npm yet — install straight from GitHub (npm builds it on install):

```sh
npm install --save-dev github:Yossiehrenfeld/envcheck
```

Or clone and build it yourself:

```sh
git clone https://github.com/Yossiehrenfeld/envcheck && cd envcheck
npm install && npm run build && npm link   # puts `envcheck` on your PATH
```

Requires Node 18+.

## Usage

```
envcheck [env files...] [options]

  -e, --example <file>   The contract file (default: .env.example)
      --env <file>       An env file to check (repeatable; default: .env)
      --optional A,B     Keys allowed to be missing or empty
      --allow-empty      Do not fail on empty values
      --fail-on-extra    Fail when the env has keys the example lacks
      --fix              Append missing keys (as KEY=) to the env file,
                         copying the example's comment above each as a hint
      --json             Machine-readable output
  -q, --quiet            Only print failures
```

Exit codes: `0` all good · `1` problems found · `2` usage or file error.

Check several environments at once:

```sh
envcheck .env.staging .env.production --optional SENTRY_DSN
```

As a CI step:

```yaml
- run: npx envcheck --env .env.ci --fail-on-extra
```

As a pre-commit hook (`package.json`):

```json
{ "scripts": { "precommit": "envcheck -q" } }
```

## Library

```ts
import { parseEnv, compare, readEnvFile } from "envcheck";

const result = compare(readEnvFile(".env.example"), readEnvFile(".env"), { optional: ["LOG_LEVEL"] });
// { missing: [], empty: [], extra: [], duplicates: [], ok: true }

parseEnv('export API_KEY="abc" # comment');
// { entries: [{ key: "API_KEY", value: "abc", line: 1 }], duplicates: [] }
```

## What it understands

- `KEY=value`, `export KEY=value`, single and double quotes (with `\n` escapes in double quotes), `# comments`, trailing ` # comments` on unquoted values, blank lines.
- Duplicate keys are reported (last one wins, same as dotenv).
- Values are never printed, so the output is safe for CI logs.

## Development

```sh
npm install
npm run build   # the CLI tests run against dist/
npm test
```

## License

MIT © Yosef Ehrenfeld
