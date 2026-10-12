# Meeseeks

A cartoon 3D office where your running agent sessions show up as agents working at their desks.

Each new session pops out of the box as a little character. It walks to a desk, its monitor shows what the session is doing, and when the session ends it vanishes with a *poof*.

## Quick start

Requires Node 20.19+ (or 22.12+) on macOS or Linux.

```bash
npm install
npm run dev
```

For a production build, use `npm run serve`.

### Simulating agents

To try the office with lots of agents without running any, open the dev server with `?sim` (16 pretend agents), or `?sim=N` to start with N (0 to 48), e.g. `http://127.0.0.1:5199/?sim=30`. A panel in the corner adds and removes agents, sets them all working, waiting, napping or stressed (or a mix), sends the nappers for a coffee, and with **Live changes** has them come, go and switch status on their own. The box adds a pretend agent too. Nothing reaches your real sessions, and it only works in `npm run dev`.

## What you'll see

- **Typing**: the session is working.
- **Waving at you**: it's waiting for your input.
- **Snoring**: idle for a while.
- **"Existence is pain!"**: the current turn has been running for a long time.
- **Mini mascots by the desk**: subagents at work.

Click an agent to see its details, recent activity and a button that copies the resume command.

## How it works

A small local server reads the session files Claude Code and Codex already write (`~/.claude` and `~/.codex`) and the page polls it every couple of seconds. It only reads, never writes, and listens on `127.0.0.1` only, since the data includes snippets of your transcripts.

Everything in the scene is procedural three.js: no models or textures.

## License

[GPL-3.0](LICENSE)
