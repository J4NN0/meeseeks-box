import { T } from '../walls.js';

// The floor plan of the Smiths' living room, next door to the garage. Room
// coordinates: the garage runs x -8..8, z -6..6, and the living room joins
// its right wall at the back, where the car is parked.

/** Inside the walls. */
export const LIVING_ROOM = { minX: 8.3, maxX: 14.8, minZ: -6, maxZ: 0.6 };

// Walls are T thick; the one to the garage stands on x = minX - T / 2.
export { T };

/**
 * Through the arch behind the couch, the spare room, empty for now: the
 * corner between the living room and the front of the garage.
 */
export const SPARE_ROOM = { minX: LIVING_ROOM.minX, maxX: LIVING_ROOM.maxX, minZ: LIVING_ROOM.maxZ + T, maxZ: 6 };

/** The door through from the garage, between the car and the ping-pong table. */
export const DOOR = { z: -1.0, width: 0.95, height: 2.1 };

/**
 * The overview is a cut-away, like the garage: the wall between the two
 * rooms is cut down to the top of the garage's dado, so it doesn't hide the
 * car. Walking in puts the rest of it back.
 */
export const DADO = 1.05;

// Colours from the show.
export const COLORS = {
  wall: '#efe2ae',
  trim: '#f7f3e3',
  carpet: '#d3ae86',
  ceiling: '#efe4c6',
  beam: '#6b4a30',
  spare: '#a9cc7c',
  floorboards: '#c49a6c',
};
