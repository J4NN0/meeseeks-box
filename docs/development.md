# Development

## Built version

Run `npm run serve` and open the URL it prints.

## Simulation

Add `?debug=true&sim=N` to the dev URL (e.g., `http://127.0.0.1:5199/?debug=true&sim=10`) to see simulated agents without running any sessions. Omit `N` for 16 agents, or choose a count up to 48. The simulation panel lets you change their statuses and watch them come and go. Add `&hideSim=true` to hide the panel while keeping the simulated agents visible. Simulation works only with `npm run dev` and does not affect real sessions.

URL controls such as `sim`, `hideSim`, `noink`, and `stress` only apply with `debug=true`. Without it, the app removes the query string and uses its normal settings.
