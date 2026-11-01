# Contributing

1. `npm install`, then `HOPLINE_DEMO=1 npm run dev` to work without live feeds.
2. Before opening a PR run `npm run lint && npm run typecheck && npm test`.
3. Keep provider-specific knowledge inside `src/providers/<name>/`. The domain model,
   server and UI must stay operator-agnostic.
4. Add tests with a fixture for any normalization change. Upstream feeds are messy; tests
   are how we keep them honest.
5. Privacy is a feature: no accounts, cookies, ad trackers, or server-side storage of anything about
   a user. The only analytics is Vercel Web Analytics (anonymous, cookieless page views); do not add
   others. Location and saved trains stay in the browser.

## Adding a provider (operator, mode or region)

See "Extending Hopline" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Keep it scalable: load bundled data
lazily (`lazyStaticData`), never loop over a whole network per request (use `TrackIndex` and grids), and when you
replace a simple algorithm with a faster one, keep a test that checks it against the simple one. The rules are
under "Scaling" in the same document.

## Automated PRs

Dependabot (weekly) and the Metro-North schedule refresh open PRs that auto-merge once CI
passes. That includes major bumps: if one breaks CI it stays open for a human. One-time repo setup is in [docs/REPO_SETUP.md](docs/REPO_SETUP.md).

## Dependency security

`npm audit --omit=dev` must report nothing: that is what ships. `package.json` has an `overrides` block that pins patched versions of transitive dependencies (`minimatch`, `tmp`, `uuid`, `basic-ftp`, and `zod` and `glob` inside the Lighthouse and protobuf tooling); keep it, and drop an entry once the packages that needed it publish fixes. The one known remaining finding is `extract-zip` (inside `@lhci/cli`, our accessibility gate), which has no patched release and only unpacks a browser download we never use (we point Lighthouse at the installed Chrome), so its alerts are tooling-only.
