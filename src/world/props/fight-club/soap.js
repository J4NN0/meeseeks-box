import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mesh, ownToon, rng, toon } from '../../../engine/toon.js';
import { canvasTexture } from '../../screens.js';
import { roundedRect } from '../shapes.js';

// A bar of Paper Street soap (Fight Club): Tyler Durden's pink soap, made
// from liposuction fat and sold back to the department stores at twenty
// bucks a bar. The bar is the one made for the film's poster: chunky, pink
// clouded with yellow, FIGHT CLUB standing up off its top in the logo's
// leaning capitals. Beside it, slipped off, the kraft card band it's sold
// in, printed in black like the film's wrappers: Paper Street Soap Co., All
// Natural, Handmade, a frying pan, and Mixed Herb & Tea Tree Oil.
//
// Origin: the bottom middle, between the bar and its band. Faces +z.

const PINK = '#f0898a';
const KRAFT = '#a88762';
const PRINT = '#2b221b';
// The poster bar is 4 x 2.5 x 1.25 in (10.2 x 6.4 x 3.2 cm), with soft edges.
const BAR = { width: 0.1016, depth: 0.0635, height: 0.0317, corner: 0.007, bevel: 0.004 };
// The band is card 6.5 cm wide and 19 cm long: just once round the bar.
const BAND = { width: 0.065, card: 0.0008 };

export function createSoap() {
  const g = new THREE.Group();
  const soap = bar();
  soap.position.set(0.05, 0, 0.008);
  soap.rotation.y = -0.1;
  g.add(soap);
  // Set back a little so the bar doesn't hide it, its open end towards you.
  const sleeve = band();
  sleeve.position.set(-0.068, 0, -0.01);
  sleeve.rotation.y = 0.38;
  g.add(sleeve);
  return g;
}

/** The bar: a rounded slab, its top painted with the raised logo. */
function bar() {
  const { width: W, depth: D, height: H, corner, bevel } = BAR;
  const geo = new THREE.ExtrudeGeometry(roundedRect(W - bevel * 2, D - bevel * 2, corner), { depth: H - bevel * 2, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  // Map the logo straight down onto the top, the right way up from the
  // front. Only the flat top (the extrusion's caps) wears it.
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, 0.5 + pos.getX(i) / W, 0.5 - pos.getZ(i) / D);
  return mesh(geo, [ownToon('#ffffff', { map: barTop() }), toon(PINK)]);
}

/** The band, empty: a card tube open at both ends, its label on top. */
function band() {
  const { width: L, card: t } = BAND;
  const D = BAR.depth + t * 2 + 0.001;
  const H = BAR.height + t * 2 + 0.001;
  const g = new THREE.Group();
  const kraft = toon(KRAFT);
  // A box's top face (+y, its third) takes the label, far edge at the top.
  const top = mesh(cutEnds(new THREE.BoxGeometry(L, t, D), 0, 1, 0), [kraft, kraft, ownToon('#ffffff', { map: label(L, D) }), kraft, kraft, kraft]);
  top.position.y = H - t / 2;
  g.add(top);
  // The floor's ends are left alone: you see them face on, as a clean edge.
  const walls = mergeGeometries([
    new THREE.BoxGeometry(L, t, D).translate(0, t / 2, 0),
    cutEnds(new THREE.BoxGeometry(L, H - t * 2, t), 0, 0, 1).translate(0, H / 2, D / 2 - t / 2),
    cutEnds(new THREE.BoxGeometry(L, H - t * 2, t), 0, 0, -1).translate(0, H / 2, -D / 2 + t / 2),
  ]);
  g.add(mesh(walls, kraft));
  return g;
}

/**
 * Shades a card box's cut ends (its ±x faces, the first eight corners) like
 * its outside face: lit as edges thinner than a pixel, they fray the ink line.
 */
function cutEnds(geo, x, y, z) {
  const normal = geo.attributes.normal;
  for (let i = 0; i < 8; i++) normal.setXYZ(i, x, y, z);
  return geo;
}

/**
 * The top of the bar, its whole footprint: paler clouds in the soap, and
 * FIGHT over CLUB, heavy and condensed. Toon shading flattens raised letters,
 * so their sides are painted on, showing below each letter as you look down
 * from the front.
 */
function barTop() {
  const W = 1000;
  const H = 600;
  const { ctx, texture } = canvasTexture(W, H);
  ctx.fillStyle = PINK;
  ctx.fillRect(0, 0, W, H);
  // Soft yellow clouds in it, like the poster bar's swirled resin.
  const r = rng(1999);
  for (let i = 0; i < 5; i++) {
    const x = r() * W;
    const y = r() * H;
    const cloud = ctx.createRadialGradient(x, y, 0, x, y, 80 + r() * 120);
    cloud.addColorStop(0, 'rgba(255, 222, 130, 0.35)');
    cloud.addColorStop(1, 'rgba(255, 222, 130, 0)');
    ctx.fillStyle = cloud;
    ctx.fillRect(0, 0, W, H);
  }
  // The two words fill the middle of the top, CLUB a touch bigger, as on the
  // poster bar; each is sized to its width, then they're stacked by height,
  // close enough to lock together.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const words = [{ text: 'FIGHT', width: 520 }, { text: 'CLUB', width: 540 }];
  for (const w of words) {
    ctx.font = w.font = fitFont(ctx, w.text, w.width);
    w.tall = ctx.measureText(w.text).actualBoundingBoxAscent;
  }
  // How far each letter's side shows below it, in pixels (about 1.4 mm).
  const relief = 14;
  const gap = 6;
  words[0].y = (H - words[0].tall - gap - words[1].tall - relief) / 2 + words[0].tall;
  words[1].y = words[0].y + gap + words[1].tall;
  // Leaning forward like the film's logo (about 14°), about the middle, which
  // sets FIGHT off to the right of CLUB; `down` drops it for the sides.
  const lean = (down) => ctx.setTransform(1, 0, -0.25, 1, 0.25 * (H / 2), down);
  ctx.fillStyle = '#bd5559';
  for (const w of words) {
    ctx.font = w.font;
    for (let d = 1; d <= relief; d++) {
      lean(d);
      ctx.fillText(w.text, W / 2, w.y);
    }
  }
  lean(0);
  ctx.fillStyle = '#ffb4ad';
  for (const w of words) {
    ctx.font = w.font;
    ctx.fillText(w.text, W / 2, w.y);
  }
  ctx.resetTransform();
  texture.needsUpdate = true;
  return texture;
}

/** The poster logo's heavy, narrow capitals, sized so `word` is `width` wide. */
function fitFont(ctx, word, width) {
  const family = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif';
  ctx.font = `200px ${family}`;
  return `${Math.round((200 * width) / ctx.measureText(word).width)}px ${family}`;
}

/** The band's printed face, for an `width` by `depth` top, like the film's brown wrapper. */
function label(width, depth) {
  const W = 520;
  const H = Math.round((W * depth) / width);
  const { ctx, texture } = canvasTexture(W, H);
  ctx.fillStyle = KRAFT;
  ctx.fillRect(0, 0, W, H);
  // Flecks of fibre in the card.
  const r = rng(1996);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(60, 40, 20, 0.22)' : 'rgba(230, 210, 180, 0.25)';
    ctx.fillRect(r() * W, r() * H, 1 + r() * 4, 1 + r() * 1.5);
  }
  ctx.fillStyle = PRINT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const top = (H - 290) / 2;
  const serif = '"Iowan Old Style", Palatino, "Book Antiqua", Georgia, serif';
  ctx.font = `600 52px ${serif}`;
  ctx.fillText('Paper Street Soap Co.', W / 2, top + 44, W - 50);
  ctx.font = `italic 600 19px ${serif}`;
  ctx.textAlign = 'left';
  ctx.fillText('All Natural', 38, top + 82);
  ctx.textAlign = 'right';
  ctx.fillText('Handmade', W - 38, top + 82);
  pan(ctx, W / 2, top + 128);
  ctx.fillStyle = PRINT;
  ctx.font = `500 16px ${serif}`;
  ctx.textAlign = 'left';
  ctx.fillText('6.1 oz.', 42, top + 208);
  ctx.fillText('170g Net Wt.', 42, top + 228);
  ctx.textAlign = 'right';
  ctx.fillText('Earth Safe', W - 42, top + 208);
  ctx.fillText('Cruelty Free', W - 42, top + 228);
  // The variety, in spaced capitals.
  ctx.textAlign = 'center';
  ctx.font = `600 21px ${serif}`;
  ctx.letterSpacing = '4px';
  ctx.fillText('MIXED HERB & TEA TREE OIL', W / 2, top + 280, W - 40);
  texture.needsUpdate = true;
  return texture;
}

/** The old cast-iron frying pan engraving, seen from above, handle down. */
function pan(ctx, x, y) {
  const R = 40;
  ctx.fillStyle = PRINT;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  // The worn inside, a shade lighter, and the rim catching the light.
  ctx.fillStyle = '#5a4634';
  ctx.beginPath();
  ctx.arc(x - 2, y - 2, R * 0.74, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PRINT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, R * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  // The handle, tapering out to a rounded end with its hanging hole.
  ctx.fillStyle = PRINT;
  ctx.beginPath();
  ctx.moveTo(x - 9, y + R - 4);
  ctx.lineTo(x + 9, y + R - 4);
  ctx.lineTo(x + 11, y + R + 62);
  ctx.arc(x, y + R + 62, 11, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = KRAFT;
  ctx.beginPath();
  ctx.arc(x, y + R + 62, 4, 0, Math.PI * 2);
  ctx.fill();
}
