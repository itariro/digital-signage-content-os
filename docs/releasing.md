# Releasing a kiosk build

This runbook covers a stable release and a prerelease. The release workflow
does the checks and publishing mechanics. A maintainer decides when to run it
and when to publish the draft.

## Before you start

- You need write access to the repository. Only users with write access can
  run the Release workflow.
- The workflow runs from `main`. Merge the release PR first.
- If the repository protects `v*` tags, `GITHUB_TOKEN` cannot create them. Add
  a fine-grained token with contents write as `RELEASE_TOKEN`, then set
  `GH_TOKEN` to `${{ secrets.RELEASE_TOKEN }}` at the job level and pass
  `token: ${{ secrets.RELEASE_TOKEN }}` to `actions/checkout`. The default
  workflow uses `github.token`.

## 1. Open the release PR

1. Create a branch.
2. Set `package.json` `version` to the release version without `v`, for
   example `0.9.0` or `0.9.0-rc.1`.
3. Add a `## Release notes` section to the PR body. Everything until the next
   `##` heading becomes the top of the GitHub release.
4. Title the PR `chore(release): vX.Y.Z`.
5. Get it reviewed and merge it.

Example body:

```markdown
## Release notes

### Highlights

- Frames can now ...

### Upgrade notes

- ...
```

The section is required. The workflow fails if it is missing or empty.

## 2. Run a dry run

1. Open Actions, then Release, then Run workflow.
2. Choose `main`.
3. Enter the version without `v`, the release PR number, and set `dry_run` to
   true.
4. Run it.

The job installs dependencies, runs the type check, the full test suite, the
production build, packages the archive, and smoke-installs it into a temporary
directory. The summary shows the tag, asset, SHA-256, and the notes. No tag or
release is created.

## 3. Run the release

Run the same workflow with `dry_run` false.

The job:

1. Repeats every check.
2. Creates the annotated tag `vX.Y.Z` at the tested commit. If the tag already
   points at that commit, it continues.
3. Creates a draft GitHub release with the archive and the reviewed notes
   followed by GitHub's generated pull request list.
4. Prints the draft URL in the job summary.

The job refuses to touch a published release, a tag on another commit, or a
release that is not a draft.

## 4. Review and publish

Open the draft from the job summary.

- Check the notes, the title, and the asset.
- For a stable release, keep "Set as the latest release" checked when you
  publish. That makes `/releases/latest` return this version.
- For a prerelease, GitHub keeps it out of `/releases/latest`. Do not publish
  it as a normal release.

Publishing is the only step that makes the release visible to frames.

## Prereleases

Use a semver suffix such as `0.9.0-rc.1`. The workflow marks the GitHub release
as a prerelease. Frames on stable do not see it.

To test it on a frame:

```bash
sudo kiosk update apply --version 0.9.0-rc.1 --yes
```

A frame on `0.9.0-rc.1` is offered `0.9.0` after the final release is
published.

## Reruns and recovery

Rerun the workflow with the same version and PR if it fails before the draft is
published. The tag guard accepts the same commit, and the draft is updated in
place.

If the tag points at the wrong commit, or the draft is wrong and unpublished:

```bash
gh release delete vX.Y.Z --yes
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
```

Then fix the cause and rerun. Never delete a published release or move a
published tag. Fix forward with a new patch release.

## What the workflow does not do

- It does not bump `package.json`. The release PR does that.
- It does not publish the draft. A maintainer publishes it.
- It does not update `INSTALLER_VERSION` or the sync `apiVersion`. Those have
  their own version spaces.
