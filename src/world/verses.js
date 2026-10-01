import { PALETTE } from '../engine/toon.js';

// The garage and the universes nested in its car battery ("The Ricks Must Be
// Crazy"). Every level is the same office, told apart by its walls, its
// neon sign and the space outside.

const GARAGE = {
  name: 'Garage',
  wall: PALETTE.wall,
  wallDark: PALETTE.wallDark,
  wallTrim: PALETTE.wallTrim,
  sky: '#fff8ea',
  sign: { title: 'MEESEEKS BOX', sub: '✦ existence is pain · we are hiring ✦', glow: ['#ff4fa3', '#ff79b8'], core: '#ffe3f1' },
  neon: '#ff5fa2',
};

const NESTED = [
  {
    name: 'Microverse',
    wall: '#c4bbdc',
    wallDark: '#a397c2',
    wallTrim: '#77699a',
    sky: '#f1ecff',
    sign: { title: 'MICROVERSE', sub: '✦ this office powers the car ✦', glow: ['#6dff4a', '#b6ff8a'], core: '#f0ffe3' },
    neon: '#97ce4c',
  },
  {
    name: 'Miniverse',
    wall: '#e2c5aa',
    wallDark: '#c7a283',
    wallTrim: '#977257',
    sky: '#fff0e0',
    sign: { title: 'MINIVERSE', sub: '✦ a battery inside a battery ✦', glow: ['#ff9a2e', '#ffc27a'], core: '#fff1de' },
    neon: '#ffa53d',
  },
  {
    name: 'Teenyverse',
    wall: '#a9d2de',
    wallDark: '#85b3c1',
    wallTrim: '#5c8a98',
    sky: '#eaf8ff',
    sign: { title: 'TEENYVERSE', sub: "✦ it's batteries all the way down ✦", glow: ['#35c8ff', '#8ee3ff'], core: '#e6f9ff' },
    neon: '#4fd2ff',
  },
];

/** Theme and name for a level: 0 is the garage, then deeper and deeper. */
export function verse(level) {
  if (level <= 0) return { ...GARAGE, level: 0 };
  const base = NESTED[(level - 1) % NESTED.length];
  // Past the Teenyverse the show ran out of names.
  const name = level <= NESTED.length ? base.name : `Teenyverse ${level - NESTED.length + 1}`;
  const title = level <= NESTED.length ? base.sign.title : name.toUpperCase();
  return { ...base, name, sign: { ...base.sign, title }, level };
}
