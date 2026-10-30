# Contributing

1. `npm install`, then `HOPLINE_DEMO=1 npm run dev` to work without live feeds.
2. Before opening a PR run `npm run lint && npm run typecheck && npm test`.
3. Keep provider-specific knowledge inside `src/providers/<name>/`. The domain model,
   server and UI must stay operator-agnostic.
4. Add tests with a fixture for any normalization change. Upstream feeds are messy; tests
   are how we keep them honest.
5. Privacy is a feature: do not add analytics, trackers, or server-side storage of anything
   about a user. Location and saved trains stay in the browser.

## Adding a provider (operator, mode or region)

See "Extending Hopline" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Automated PRs

Dependabot (weekly) and the Metro-North schedule refresh open PRs that auto-merge once CI
passes. That includes major bumps: if one breaks CI it stays open for a human. One-time repo setup is in [docs/REPO_SETUP.md](docs/REPO_SETUP.md).
