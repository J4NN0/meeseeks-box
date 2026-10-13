# Development

## Built version

Run `npm run serve` and open the URL it prints.

## Simulation

Add `?debug=true&sim=N` to the dev URL (e.g., `http://127.0.0.1:5199/?debug=true&sim=10`) to see simulated agents without running any sessions. Omit `N` for 16 agents, or choose a count up to 48. The simulation panel lets you change their statuses and watch them come and go. Add `&hideSim=true` to hide the panel while keeping the simulated agents visible. Simulation works only with `npm run dev` and does not affect real sessions.

URL controls such as `sim`, `hideSim`, `noink`, and `stress` only apply with `debug=true`. Without it, the app removes the query string and uses its normal settings.

## Releasing

The package is published to npm as `@j4nn0/meeseeks-box`. To release a new version, run this from an up-to-date `main` with no uncommitted changes:

```bash
npm run release          # patch: 0.1.0 → 0.1.1
npm run release minor    # minor: 0.1.0 → 0.2.0
npm run release major    # major: 0.1.0 → 1.0.0
```

The script (`scripts/release.sh`) bumps the version in `package.json`, commits and tags it, pushes, and creates the GitHub release. Publishing the release runs `.github/workflows/publish.yml`, which builds the app and publishes it to npm. The workflow stops without publishing if the release tag doesn't match the `package.json` version. A release marked as a pre-release is published under the `next` tag. Run `gh run watch` to follow the publish.

## Website

The site on GitHub Pages has a landing page (`site/`) and the office in demo mode under `demo/`, with pretend agents and no server. Every push to `main` deploys it through `.github/workflows/pages.yml`. To build it into `site-dist/` and try it locally, run:

```bash
npm run preview:site
```

Then open `http://127.0.0.1:5199/meeseeks-box/`. Run `npm run build:site` to build it without serving it.
