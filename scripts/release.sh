#!/bin/sh
# Cuts a release: bumps the version in package.json, commits and tags it,
# pushes, and creates the GitHub release, which runs the publish workflow
# (.github/workflows/publish.yml) to put it on npm.
#
# Usage: npm run release [patch|minor|major|<version>]   (default: patch)
set -eu

bump=${1:-patch}
fail() { echo "release: $1" >&2; exit 1; }

command -v gh >/dev/null || fail "needs the GitHub CLI (gh): https://cli.github.com"
gh auth status >/dev/null 2>&1 || fail "log in to GitHub first: gh auth login"
[ "$(git branch --show-current)" = main ] || fail "switch to main first"
[ -z "$(git status --porcelain)" ] || fail "commit or stash your changes first"
git pull --ff-only

tag=$(npm version "$bump" -m "Release v%s")
git push --follow-tags
gh release create "$tag" --generate-notes --verify-tag
echo "Released $tag. The publish to npm takes a minute or two: gh run watch"
