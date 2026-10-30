# Repository setup for automated merges

Auto-merge only works if GitHub is configured to hold PRs until CI passes. These are
repo settings, so they can't live in code. Do them once:

1. **Settings → General → Pull Requests:** enable **Allow auto-merge** (and allow squash merging).
2. **Settings → Branches → add a rule for `main`:** require a pull request, and require the
   status check **`verify`** (the CI job) to pass. Without this, `--auto` merges immediately.
3. **Settings → Advanced Security:** enable **Dependabot alerts** and **Dependabot security
   updates** (security PRs are raised by Dependabot and covered by the auto-merge workflow).
4. **Secret `AUTOMERGE_TOKEN`** (Settings → Secrets → Actions): a fine-grained personal access
   token for this repo with *Contents* and *Pull requests* read/write. Needed because PRs opened
   by the default `GITHUB_TOKEN` (the weekly Metro-North schedule refresh) don't trigger CI,
   so the required check would never run and the PR would sit unmerged. Dependabot PRs don't need it.
5. **Settings → Actions → General:** allow GitHub Actions to create pull requests.
6. **Settings → General → Pull Requests:** enable **Automatically delete head branches**. The
   `delete-merged-branch` workflow is a backstop that does the same, so merged branches never linger.

## Merge policy
| PR | Auto-merges when |
| --- | --- |
| Any Dependabot PR (patch, minor, major, security) | The `verify` job passes (the merge job runs after it in `ci.yml`) |
| Metro-North schedule refresh | Its own test run passes |

A major bump that breaks lint, types, tests or the build fails `verify` and stays open for a
human; it is never merged. Because the merge step is chained after `verify`, this holds even
without the branch rule in step 2, but keep the rule so humans can't merge a red PR either.
