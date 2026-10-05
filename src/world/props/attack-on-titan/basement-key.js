import * as THREE from 'three';
import { mesh, toon } from '../../../engine/toon.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PEG, peg } from '../hanging.js';

// Eren's key (Attack on Titan): the key to the basement under Grisha
// Yeager's house in Shiganshina, which his father hangs round Eren's neck
// on a cord and which Eren keeps on him for five years until he finally
// opens that door. Modelled on the anime key and the licensed necklaces: a
// brass skeleton key a hand long, its bow a diamond with curved-in sides
// and a ball on each point, a turned collar, a plain round shaft and a bit
// of three teeth. Hung up by its black cord, looped over a peg and falling
// in a long loop to the key. As in the anime, the key has no ring: the cord
// runs straight through the hole in its bow.
//
// Origin: the middle of the key's back, on the board. Faces +z.

const BRASS = '#f0c048';
const MM = 0.001;
// The key, from the top of its bow to the tip of its shaft; the bow is
// 3.5cm across its side balls.
const LENGTH = 0.105;
const BALL = 0.0039;
const THICK = 0.0035;
// The bow's points from its middle: up, out to each side, and down; and
// the hole in it, as a share of that.
const BOW = { up: 0.015, side: 0.0134, down: 0.013, hole: 0.7 };
// Lying flat on the board, its middle this far off it (the collar's rings
// stand out furthest behind).
const FLAT = 0.004;
// The cord, and how wide its loop opens on the way up; the peg it hangs
// from, high enough over the key that the cord is about a 50cm necklace.
const CORD = { radius: 0.0012, wide: 0.016 };
const HANG = { y: 0.28, out: 0.026 };
// How far below the top point of the bow's hole the cord sits: where the
// hole's top point has opened out as wide as the cord.
const SEAT = 0.0037;

/** Height on the key `d` down from its top. */
const down = (d) => LENGTH / 2 - d;

export function createBasementKey() {
  const g = new THREE.Group();
  g.add(mesh(keyGeometry(), toon(BRASS)));
  // Enough segments to round the tight turn through the bow.
  g.add(mesh(new THREE.TubeGeometry(cordCurve(), 480, CORD.radius, 8, true), toon('#211b18')));
  g.add(peg(0, HANG.y, HANG.out));
  g.userData.hole = new THREE.Vector3(0, HANG.y, 0);
  return g;
}

/** The whole key in one piece: bow, balls, collar, shaft and bit. */
function keyGeometry() {
  const bowY = down(BALL + BOW.up);
  const parts = [slab(bowShape(), THICK).translate(0, bowY, FLAT)];
  for (const [x, y] of [[0, BOW.up], [-BOW.side, 0], [BOW.side, 0]]) {
    parts.push(new THREE.SphereGeometry(BALL, 12, 8).scale(1, 1, 0.85).translate(x, bowY + y, FLAT));
  }
  parts.push(new THREE.LatheGeometry(shaftProfile(), 16).translate(0, 0, FLAT));
  parts.push(slab(bitShape(), THICK * 0.8).translate(0, 0, FLAT));
  return mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

/** A flat shape `depth` thick with softened edges, centred front to back. */
function slab(shape, depth) {
  const bevel = 0.0004;
  const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * bevel, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1, curveSegments: 8 });
  return geo.translate(0, 0, bevel - depth / 2);
}

/** The bow: a diamond with curved-in sides, open in the middle. */
function bowShape() {
  const points = [[0, BOW.up], [BOW.side, 0], [0, -BOW.down], [-BOW.side, 0]];
  // Each side bends in towards the middle; the hole is the same, smaller.
  const loop = (path, size, pull) => {
    path.moveTo(points[0][0] * size, points[0][1] * size);
    for (let i = 0; i < 4; i++) {
      const [ax, ay] = points[i];
      const [bx, by] = points[(i + 1) % 4];
      path.quadraticCurveTo(((ax + bx) / 2) * pull, ((ay + by) / 2) * pull, bx * size, by * size);
    }
    return path;
  };
  const shape = loop(new THREE.Shape(), 1, 0.62);
  shape.holes.push(loop(new THREE.Path(), BOW.hole, 0.3));
  return shape;
}

/**
 * Down the collar and shaft as [radius, distance from the top] in mm: a
 * knob out of the bow's bottom point, two rings, then the plain shaft with
 * its tip rounded off. Starts just inside the bow so the two meet cleanly.
 */
function shaftProfile() {
  const profile = [
    [0, 30.5], [1.2, 31.2], [1.6, 32.8], [2.5, 34.3], [3.3, 36], [2.4, 37.8], [2.1, 38.5],
    [3.9, 39.2], [3.9, 40.6], [2.8, 41.2], [2.8, 41.9], [3.6, 42.3], [3.6, 43.4],
    [3.2, 43.8], [3.2, 103.6], [2.7, 104.6], [1.5, 105], [0, 105],
  ];
  // The lathe wants them bottom up.
  return profile.reverse().map(([r, d]) => new THREE.Vector2(r * MM, down(d * MM)));
}

/**
 * The bit, off the right of the shaft above its tip, in mm out from the
 * axis and down from the top: a block on the shaft, a slot, then a bar
 * with three teeth, the middle one shorter.
 */
function bitShape() {
  const at = (x, d) => [x * MM, down(d * MM)];
  const s = new THREE.Shape();
  const tooth = (d0, d1, x) => {
    const r = 1.3;
    s.lineTo(...at(x - r, d0));
    s.quadraticCurveTo(...at(x, d0), ...at(x, d0 + r));
    s.lineTo(...at(x, d1 - r));
    s.quadraticCurveTo(...at(x, d1), ...at(x - r, d1));
  };
  s.moveTo(...at(2, 77.5));
  s.lineTo(...at(8.2, 77.5));
  s.lineTo(...at(8.2, 75));
  tooth(75, 79.5, 19.6);
  s.lineTo(...at(11, 79.5));
  s.lineTo(...at(11, 83.3));
  tooth(83.3, 87.7, 18.2);
  s.lineTo(...at(11, 87.7));
  s.lineTo(...at(11, 91.5));
  tooth(91.5, 96, 19.6);
  s.lineTo(...at(8.2, 96));
  s.lineTo(...at(8.2, 93.5));
  s.lineTo(...at(2, 93.5));
  const slot = new THREE.Path();
  slot.moveTo(...at(7, 80.5));
  slot.lineTo(...at(8.6, 80.5));
  slot.lineTo(...at(8.6, 90.5));
  slot.lineTo(...at(7, 90.5));
  s.holes.push(slot);
  return s;
}

/**
 * The cord as one closed loop, from where it runs through the top of the
 * bow's hole. Out the back, it goes up behind the bow and right of the top
 * ball, then over the top of the peg. It comes back down the left, in front
 * of the bow. A leather cord is stiff enough that the two sides bow apart a
 * little instead of pulling straight.
 */
function cordCurve() {
  const bowY = down(BALL + BOW.up);
  const seat = bowY + BOW.hole * BOW.up - SEAT;
  const ballY = bowY + BOW.up;
  const low = LENGTH / 2;
  const rise = HANG.y - low;
  const top = HANG.out - 0.007;
  const round = PEG.radius + CORD.radius;
  // Just clear of the top ball at first, then out and back in to the peg.
  const clear = BALL + 0.0006;
  const half = (t) => clear * (1 - t) + round * t + CORD.wide * Math.sin(Math.PI * t ** 0.9);
  // One side, from the face of the bow it leaves by (`face`) to lying on the
  // board behind or on the bow in front (`z0`). It rounds the hole's edge,
  // runs up against the bow and round the ball, then straight back to the
  // peg's tip, seen from the side.
  const side = (face, z0) => {
    const bend = z0 - face;
    const pts = [];
    for (const a of [0, 45, 90]) {
      const r = (a * Math.PI) / 180;
      pts.push([0.0004 * (a / 90), seat + Math.abs(bend) * (1 - Math.cos(r)), face + bend * Math.sin(r)]);
    }
    pts.push([0.0012, seat + 0.0035, z0], [0.0036, ballY - 0.0012, z0], [clear, ballY + 0.0012, z0]);
    for (const t of [0.06, 0.16, 0.3, 0.46, 0.62, 0.77, 0.89, 0.96]) pts.push([half(t), low + t * rise, z0 + (top - z0) * t]);
    return pts;
  };
  const pts = [new THREE.Vector3(0, seat, FLAT)];
  for (const [x, y, z] of side(FLAT - THICK / 2, CORD.radius)) pts.push(new THREE.Vector3(x, y, z));
  for (const a of [15, 50, 90, 130, 165]) {
    const r = (a * Math.PI) / 180;
    pts.push(new THREE.Vector3(round * Math.cos(r), HANG.y + round * Math.sin(r), top));
  }
  for (const [x, y, z] of side(FLAT + THICK / 2, FLAT + THICK / 2 + CORD.radius).reverse()) pts.push(new THREE.Vector3(-x, y, z));
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}
