# Repository setup for automated merges

Auto-merge only works if GitHub is configured to hold PRs until CI passes. These are
repo settings, so they can't live in code. Do them once:

1. **Settings → General → Pull Requests:** enable **Allow auto-merge** (and allow squash merging).
2. **Branch protection:** Settings → Rules → Rulesets → New ruleset → **Import a ruleset**, and
   choose [`.github/rulesets/main.json`](../.github/rulesets/main.json). It protects the default
   branch:
   - changes only via pull request, squash merge only (one commit per PR, linear history);
   - the `verify` and `lighthouse` CI checks must pass, so `--auto` waits for CI instead of merging immediately;
   - no force-pushes or deletion of `main`;
   - 0 required approvals (solo-friendly); repository admins can bypass on a PR, never by direct push.
   Raise `required_approving_review_count` in the file if you add collaborators.
3. **Settings → Advanced Security:** enable **Dependabot alerts** and **Dependabot security
   updates** (security PRs are raised by Dependabot and covered by the auto-merge workflow).
4. **Secret `AUTOMERGE_TOKEN`** (Settings → Secrets → Actions): a fine-grained personal access
   token for this repo with *Contents* and *Pull requests* read/write. Needed because PRs opened
   by the default `GITHUB_TOKEN` (the weekly Metro-North schedule refresh) don't trigger CI,
   so the required check would never run and the PR would sit unmerged. Dependabot PRs don't need it.
5. **Optional secret `WMATA_API_KEY`:** lets the weekly schedule refresh include Washington Metrorail and Metrobus (their downloads need the key). Without it those two are skipped and keep their old data.
6. **Settings → Actions → General:** allow GitHub Actions to create pull requests.
7. **Settings → General → Pull Requests:** enable **Automatically delete head branches**. The
   `delete-merged-branch` workflow is a backstop that does the same, so merged branches never linger.

## Published schedule data (optional, for scale)
`publish-data.yml` packs every agency's schedule and publishes it to GitHub Pages. To use it: **Settings → Pages → Source:
GitHub Actions**, run the workflow once, then set `HOPLINE_DATA_URL` in the hosting environment to the Pages address
(for example `https://<owner>.github.io/<repo>`). Until it is set the server reads the copy bundled at build time, so nothing
changes; if the host is unreachable it falls back to that copy too.

## Merge policy
| PR | Auto-merges when |
| --- | --- |
| Any Dependabot PR (patch, minor, major, security) | The `verify` and `lighthouse` jobs pass (the merge job runs after them in `ci.yml`) |
| Weekly schedule refresh (every bundled timetable) | Its own test run passes |

A major bump that breaks lint, types, tests or the build fails `verify` and stays open for a
human; it is never merged. Because the merge step is chained after `verify`, this holds even
without the branch rule in step 2, but keep the rule so humans can't merge a red PR either.
