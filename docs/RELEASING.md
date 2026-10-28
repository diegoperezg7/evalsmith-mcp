# Releasing

One version tag releases everything: the npm package, the MCP Registry entry, the GitHub
release and the GitHub Action. The action runs `dist/action/index.js` straight from the tagged
commit, so the bundle in that commit is what users get. Users reference the major tag (`@v0`),
which is moved to every release that keeps the action's inputs and outputs compatible; full
version tags (`v0.2.0`) never move and can be pinned instead.

## 1. Prepare the release commit on `main`

1. Set the version everywhere:

   ```bash
   npm version 0.2.0 --no-git-tag-version   # package.json, package-lock.json, server.json, src/shared/version.ts
   node scripts/check-versions.mjs
   ```

2. Move the `Unreleased` entries in `CHANGELOG.md` under the new version and date, and add its
   compare link.
3. Rebuild and check:

   ```bash
   npm ci
   npx playwright install chromium
   npm run check
   npm run build:action
   npm run docs:screenshots                 # only if the HTML report changed
   git status --short dist/action           # must be empty once committed
   ```

4. Commit and push to `main`, then wait for `ci` and `action-selftest` to pass on that commit.

## 2. Tag

```bash
git switch main && git pull --ff-only
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0

# Move the major tag to the same commit
git tag -fa v0 -m "v0" v0.2.0^{}
git push origin v0 --force
```

The `v0.2.0` tag starts [`release.yml`](../.github/workflows/release.yml), which checks the
versions, publishes to npm with provenance and to the MCP Registry, and creates the GitHub
release with the `CHANGELOG.md` section as notes. Its filter only matches full versions, so
moving `v0` does not publish again.

Only the major tag is ever force-pushed. While the package is `0.x`, a minor release may still
break the CLI or the MCP tools, but `v0` is only moved when the action's inputs, outputs and
verdict rules stay compatible. A release that breaks the action is not tagged `v0`; it waits for
`v1`.

## 3. Publish the action to the Marketplace

1. On GitHub, open the release that `release.yml` created and choose **Edit**.
2. Tick **Publish this Action to the GitHub Marketplace**. The first time, accept the
   Marketplace agreement (two-factor authentication is required) and pick the categories, for
   example Testing and Continuous integration. GitHub validates `action.yml` here: it must be
   the only action metadata file at the repository root, its `name` (`evalsmith RAG and agent
evals`) must be unique in the Marketplace, and the description must stay under 125
   characters.
3. Update the release.

Later releases are listed in the Marketplace automatically once the first one is published.

## 4. Verify

- `npm view evalsmith-mcp version` shows the new version.
- The Marketplace listing shows the name, description and branding from `action.yml`.
- A workflow in another repository with `uses: diegoperezg7/evalsmith-mcp@v0` runs, writes the
  job summary and sets the outputs.
