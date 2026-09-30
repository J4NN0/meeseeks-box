import * as THREE from 'three';
import { noInk } from '../engine/toon.js';
import { glowTexture } from './screens.js';

// Rick's green portal: a swirling disc with a wobbly, splashy rim.

export function createPortal(radius = 1) {
  const uniforms = { time: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float rim = 0.9 + 0.05 * sin(a * 7.0 + time * 2.3) + 0.03 * sin(a * 17.0 - time * 4.1) + 0.03 * noise(vec2(a * 3.0, time));
        if (r > rim) discard;
        float swirl = a * 2.0 + r * 9.0 - time * 2.4;
        float bands = smoothstep(0.35, 0.65, sin(swirl) * 0.5 + 0.5 + (noise(p * 4.0 + time * 0.5) - 0.5) * 0.6);
        vec3 deep = vec3(0.18, 0.55, 0.12);
        vec3 mid = vec3(0.45, 0.82, 0.22);
        vec3 core = vec3(0.92, 1.0, 0.62);
        vec3 col = mix(mid, deep, bands);
        col = mix(core, col, smoothstep(0.0, 0.55, r));
        float edge = smoothstep(rim - 0.12, rim - 0.02, r);
        col = mix(col, vec3(0.8, 1.0, 0.45), edge);
        float outer = smoothstep(rim - 0.025, rim, r);
        col = mix(col, vec3(0.1, 0.25, 0.08), outer);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });

  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), material);
  group.add(disc);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 3.4, radius * 3.4),
    new THREE.MeshBasicMaterial({ map: glowTexture('rgba(150, 255, 90, 0.55)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  halo.position.z = -0.01;
  group.add(halo);
  noInk(group);

  const light = new THREE.PointLight('#8dff5a', 6, 7, 1.6);
  light.position.z = 0.8;
  group.add(light);

  return {
    group,
    update(t) {
      uniforms.time.value = t;
      disc.scale.setScalar(1 + Math.sin(t * 3) * 0.015);
      light.intensity = 5 + Math.sin(t * 5) * 0.8;
    },
  };
}
