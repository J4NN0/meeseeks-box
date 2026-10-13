# Meeseeks Box

A cartoon 3D office for your Claude Code and Codex sessions. Running agents appear at desks, with their activity and status reflected in the scene. Click one to inspect its conversation and resume command. You can also summon a Claude Code agent from the box, choose a project folder, and give it a task.

![Overview of the Meeseeks Box office](docs/images/overview.png)

## The Virtual Office

<table>
  <tr>
    <td><strong>Walk around</strong><br><a href="docs/images/office.png"><img src="docs/images/office.png" width="300" alt="Agents at work in the office"></a></td>
    <td><strong>Join a meeting</strong><br><a href="docs/images/meeting.png"><img src="docs/images/meeting.png" width="300" alt="Agents around the meeting table"></a></td>
    <td><strong>Inspect a session</strong><br><a href="docs/images/session.png"><img src="docs/images/session.png" width="300" alt="Agent session activity panel"></a></td>
  </tr>
  <tr>
    <td><strong>Take the portal</strong><br><a href="docs/images/portal.png"><img src="docs/images/portal.png" width="300" alt="Green portal in the Miniverse"></a></td>
    <td><strong>Explore the microverse</strong><br><a href="docs/images/car_multiverse.png"><img src="docs/images/car_multiverse.png" width="300" alt="Flying car parked in the Microverse office"></a></td>
    <td><strong>Explore the collection</strong><br><a href="docs/images/collection.png"><img src="docs/images/collection.png" width="300" alt="Collection of objects on a wall and table"></a></td>
  </tr>
  <tr>
    <td><strong>Enjoy drinks and fruits</strong><br><a href="docs/images/coffee.png"><img src="docs/images/coffee.png" width="300" alt="Coffee machine filling a red mug"></a></td>
    <td><strong>Have a break</strong><br><a href="docs/images/drink.png"><img src="docs/images/drink.png" width="300" alt="Coffee mug overlooking agents at their desks"></a></td>
    <td><strong>Visit the arcade</strong><br><a href="docs/images/roy_arcade_machine.png"><img src="docs/images/roy_arcade_machine.png" width="300" alt="Roy arcade machine beside the fridge"></a></td>
  </tr>
</table>

## Quick Start

Requires Node.js 20.19+ (or 22.12+) on macOS or Linux.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite (normally `http://127.0.0.1:5199`). The office finds sessions in `~/.claude` and `~/.codex` automatically.

For a built version, run `npm run serve` and open the URL it prints.

To send prompts or answer permission requests for a Claude Code session started outside the box, start that session with `./bin/claude-box` instead of `claude`. It accepts the same arguments. Agents summoned from the box use this connection automatically.

## Debug

Add `?debug=true&sim=N` to the dev URL (e.g., `http://127.0.0.1:5199/?debug=true&sim=10`) to see simulated agents without running any sessions. Omit `N` for 16 agents, or choose a count up to 48. The simulation panel lets you change their statuses and watch them come and go. Add `&hideSim=true` to hide the panel while keeping the simulated agents visible. Simulation works only with `npm run dev` and does not affect real sessions.

URL controls such as `sim`, `hideSim`, `noink`, and `stress` only apply with `debug=true`. Without it, the app removes the query string and uses its normal settings.

## How it works

A local server reads Claude Code and Codex session files and serves their activity to a three.js scene. The server listens on `127.0.0.1` by default because the activity can include conversation excerpts. Summoning agents and sending prompts or permission decisions can affect your project files through Claude Code.

## Roadmap

- [ ] Interdimensional cable
- [ ] Arcade game
- [ ] Kitchen / common area
- [ ] Portal
- [ ] Meeseeks wardarobe

## License

[GPL-3.0](LICENSE)
