# T2 Context

## Task
[T2](../tasks/T2.md): multi-stage production Dockerfile for `paylab-ui` serving the Next.js standalone output as a non-root user, with standalone enabled only through a build-time switch.

## Related PRD Acceptance Criteria
AC-8 and AC-9 (console part); AC-1 (existing UI build, start, dev and test commands unchanged).

## Relevant Prior Summaries
[T1](T1-summary.md): `pnpm prune` and other offline steps must reuse the pnpm cache mount; the registry is slow. The API image runs as `node` (uid 1000), and the credential volume is owned by that uid, which the console must read (wired in T3).

## Files Likely Affected
`paylab-ui/next.config.ts`, new `paylab-ui/Dockerfile.production`. The development Dockerfile and `.dockerignore` stay unchanged.

## Test-First Plan
- AC-1: without the switch, the default build is not standalone; UI tests, typecheck and lint pass.
- AC-8: the runtime contains `server.js` and `.next/static`, and has no `src`, pnpm or dev tooling.
- AC-8: the container answers the home route with a redirect status on 0.0.0.0:3000.
- AC-9: `id -u` is non-zero.

## Constraints
pnpm 10.28.1 with a frozen lockfile. No build arguments carrying secrets; the browser API URL uses the code default. Next 16.

## Risks
Static prerendering during the build could require `PAYLAB_API_KEY`. Cache writes under `.next` could fail as non-root.

## Definition of Done
The image builds, the checks pass, and the UI test/typecheck/lint results are recorded.
