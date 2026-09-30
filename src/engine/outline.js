import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { NO_INK_LAYER } from './toon.js';

// Cartoon ink lines, drawn the way an animator would: along silhouettes
// (jumps in depth) and creases (jumps in surface normal).
//
// Pass 1 renders view-space normals + linear depth for ink-able objects.
// Pass 2 renders the lit colour image (MSAA).
// Pass 3 finds edges in pass 1 and inks them over pass 2.

const normalDepthMaterial = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: /* glsl */ `
    #include <common>
    varying vec3 vNormalV;
    varying float vDepth;
    void main() {
      #include <beginnormal_vertex>
      #include <defaultnormal_vertex>
      #include <begin_vertex>
      #include <project_vertex>
      vNormalV = normalize(transformedNormal);
      vDepth = -mvPosition.z;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vNormalV;
    varying float vDepth;
    void main() {
      vec3 n = normalize(vNormalV) * (gl_FrontFacing ? 1.0 : -1.0);
      gl_FragColor = vec4(n, vDepth);
    }
  `,
});

const compositeMaterial = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: null },
    tND: { value: null },
    texel: { value: new THREE.Vector2() },
    thickness: { value: 1.5 },
    ink: { value: new THREE.Color('#1c1714') },
    depthCut: { value: new THREE.Vector2(0.05, 0.14) },
    normalCut: { value: new THREE.Vector2(0.45, 0.9) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tColor;
    uniform sampler2D tND;
    uniform vec2 texel;
    uniform float thickness;
    uniform vec3 ink;
    uniform vec2 depthCut;
    uniform vec2 normalCut;
    varying vec2 vUv;

    // Inverse depth is linear across a plane in screen space, so its second
    // derivative is ~0 on flat surfaces even at grazing angles, and spikes at
    // silhouettes. That keeps floors clean while still inking every outline.
    float inv(vec4 s) { return s.a > 0.0 ? 1.0 / s.a : 0.0; }

    float normalDiff(vec4 a, vec4 b) {
      if (a.a <= 0.0 || b.a <= 0.0) return 0.0;
      return 1.0 - dot(a.xyz, b.xyz);
    }

    void main() {
      vec4 c = texture2D(tColor, vUv);
      vec2 dx = vec2(texel.x * thickness, 0.0);
      vec2 dy = vec2(0.0, texel.y * thickness);

      vec4 s0 = texture2D(tND, vUv);
      vec4 sl = texture2D(tND, vUv - dx);
      vec4 sr = texture2D(tND, vUv + dx);
      vec4 sd = texture2D(tND, vUv - dy);
      vec4 su = texture2D(tND, vUv + dy);
      vec4 s1 = texture2D(tND, vUv - dx - dy);
      vec4 s2 = texture2D(tND, vUv + dx + dy);
      vec4 s3 = texture2D(tND, vUv + dx - dy);
      vec4 s4 = texture2D(tND, vUv - dx + dy);

      float w0 = inv(s0);
      float lap = abs(inv(sl) + inv(sr) - 2.0 * w0)
                + abs(inv(sd) + inv(su) - 2.0 * w0)
                + 0.5 * abs(inv(s1) + inv(s2) - 2.0 * w0)
                + 0.5 * abs(inv(s3) + inv(s4) - 2.0 * w0);
      float wmax = max(w0, max(max(inv(sl), inv(sr)), max(inv(sd), inv(su))));
      float depthEdge = wmax > 0.0 ? smoothstep(depthCut.x, depthCut.y, lap / wmax) : 0.0;

      float nd = normalDiff(s0, sl) + normalDiff(s0, sr) + normalDiff(s0, sd) + normalDiff(s0, su);
      float normalEdge = smoothstep(normalCut.x, normalCut.y, nd);

      float edge = max(depthEdge, normalEdge);
      vec3 inkLinear = ink;
      gl_FragColor = vec4(mix(c.rgb, inkLinear, edge), mix(c.a, 1.0, edge));
      #include <colorspace_fragment>
    }
  `,
  depthTest: false,
  depthWrite: false,
});

export class InkRenderer {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;

    const common = { type: THREE.HalfFloatType, depthBuffer: true };
    this.nd = new THREE.WebGLRenderTarget(1, 1, { ...common, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.color = new THREE.WebGLRenderTarget(1, 1, { ...common, samples: 4 });
    this.quad = new FullScreenQuad(compositeMaterial);
    compositeMaterial.uniforms.tColor.value = this.color.texture;
    compositeMaterial.uniforms.tND.value = this.nd.texture;
    this.uniforms = compositeMaterial.uniforms;

    renderer.shadowMap.autoUpdate = false;
  }

  setSize(width, height, pixelRatio) {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.nd.setSize(w, h);
    this.color.setSize(w, h);
    this.uniforms.texel.value.set(1 / w, 1 / h);
    // Keep lines the same visual weight on retina and non-retina screens.
    this.uniforms.thickness.value = Math.max(1, 1.1 * pixelRatio);
  }

  render() {
    const { renderer, scene, camera } = this;
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();

    if (this.enabled) {
      const mask = camera.layers.mask;
      const bg = scene.background;
      camera.layers.set(0);
      scene.overrideMaterial = normalDepthMaterial;
      scene.background = null;
      renderer.shadowMap.needsUpdate = false;
      renderer.setRenderTarget(this.nd);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      scene.background = bg;
      camera.layers.mask = mask;
    }

    renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(this.enabled ? this.color : null);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.clear();
    renderer.render(scene, camera);

    if (this.enabled) {
      renderer.setRenderTarget(null);
      this.quad.render(renderer);
    }
  }
}

export function enableInkLayers(camera) {
  camera.layers.enable(0);
  camera.layers.enable(NO_INK_LAYER);
}
