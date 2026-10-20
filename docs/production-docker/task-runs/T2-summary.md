# T2 Summary

## Status
Completed. AC-8 and AC-9 (console part) and the UI share of AC-1 are validated.

## What Changed
Next.js standalone output is enabled only when `NEXT_OUTPUT=standalone` is set; the production Dockerfile's build stage sets it, so `pnpm build`/`pnpm start`, development and Playwright keep their current behavior. The production Dockerfile installs with a frozen lockfile and pinned pnpm 10.28.1, builds, and copies only the standalone server and `.next/static` into a clean Node runtime that runs `node server.js` on `0.0.0.0:3000` as `node` (uid 1000). Only `.next/cache` is writable for that user.

## Files Changed
`paylab-ui/next.config.ts`, `paylab-ui/Dockerfile.production` (new), this run record and the plan index. The development Dockerfile and `.dockerignore` are unchanged.

## Tests Added or Updated
A throwaway check script (session scratchpad) verified:
- the runtime runs as a non-root uid;
- `server.js` and static assets are present;
- `src`, `.env`, pnpm, the `next` CLI binary, TypeScript, vitest and Biome are absent;
- the home route answers 307 on the container address.

## Commands Run
- `docker build -f Dockerfile.production -t paylab-ui-prod:t2 .`
- The T2 check script (all PASS)
- In the development UI image with the new `next.config.ts` and `src` mounted: `pnpm typecheck`, `pnpm lint`, `pnpm test`, then `NODE_ENV=production pnpm build`, checking that no `.next/standalone` was produced.

## Validation Result
All checks pass. Image: 414 MB (102 MB compressed). UI: 58 test files and 467 tests pass; typecheck passes; lint passes with the four existing reduced-motion CSS warnings. The build needs no API key: the routes that read data are dynamic. `/`, `/benchmarks`, `/benchmarks/trends` and `/system-health` are prerendered.

## Decisions Made
- The switch is an environment variable rather than always-on standalone, to keep `next start` unchanged.
- No build arguments; the browser API address is the code default.

## Follow-up Needed
None.

## Context for Next Task
The image builds with `docker build -f paylab-ui/Dockerfile.production`. At runtime the server needs `PAYLAB_API_KEY` exported from the credential volume and `PAYLAB_INTERNAL_API_URL=http://api:3333`. The `/` route returns 307 without following redirects, which suits a healthcheck. `sh` is available in the image for the startup wrapper.
