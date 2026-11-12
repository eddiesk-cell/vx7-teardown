// Studio: pale grey cyclorama, soft key light with VSM shadow, GTAO kept off the floor, a touch of bloom for the plasma.
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {GTAOPass} from 'three/addons/postprocessing/GTAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass} from 'three/addons/postprocessing/Pass.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {buildMech} from './mech.js';

const V3 = THREE.Vector3;
export const BG = '#d9dadd';

// the floor rolls back under the mech by uOff metres (a treadmill: the mech stays put, its travel moves the 1 m grid)
const GROUND_FRAG = /* glsl */ `uniform vec3 uG; uniform vec3 uBg; uniform vec3 uC; uniform float uOff; varying vec3 vW;
  void main(){ float d = length(vW.xz - uC.xz); vec2 f = vW.xz + vec2(0.0, uOff);
    float n = fract(sin(dot(floor(f * 60.0), vec2(12.9898, 78.233))) * 43758.5453);
    vec2 q = abs(fract(f) - 0.5); float line = smoothstep(0.475, 0.497, max(q.x, q.y));
    vec3 col = uG * (0.99 + 0.02 * n) * (1.0 - 0.075 * line); gl_FragColor = vec4(mix(col, uBg, smoothstep(4.0, 15.0, d)), 1.0); }`;

export function createStage({canvas}) {
  const renderer = new THREE.WebGLRenderer({canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.1, 80);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, {type: THREE.HalfFloatType, samples: 4}));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 4, 4);
  gtao.output = GTAOPass.OUTPUT.Default;
  gtao.blendIntensity = 0.75;
  gtao.updateGtaoMaterial({radius: 0.12, distanceExponent: 1.4, thickness: 0.8, scale: 1.0, samples: 16, distanceFallOff: 1.0, screenSpaceRadius: false});
  gtao.updatePdMaterial({lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16});
  class Toggle extends Pass {
    constructor(fn) {
      super();
      this.needsSwap = false;
      this.fn = fn;
    }
    render() {
      this.fn();
    }
  }
  let floorOn = true;
  const floorVis = (v) => () => {
    ground.visible = v && floorOn;
    shade.visible = v && floorOn;
    mech.fx.visible = v;
  };
  composer.addPass(new Toggle(floorVis(false)));
  composer.addPass(gtao);
  composer.addPass(new Toggle(floorVis(true)));
  const bloom = new UnrealBloomPass(new THREE.Vector2(800, 450), 0.18, 0.4, 1.2);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  {
    const env = new THREE.Scene();
    env.background = new THREE.Color('#cfd1d6');
    const box = (w, h, pos, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({color: new THREE.Color(1, 1, 1).multiplyScalar(k), side: THREE.DoubleSide}));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    box(12, 12, new V3(0, 14, 2), 2.2);
    box(3, 14, new V3(-12, 4, 6), 2.6);
    box(3, 14, new V3(12, 4, -4), 1.8);
    box(18, 2, new V3(0, 2, 14), 1.4);
    const g = new THREE.Mesh(new THREE.CircleGeometry(40, 32), new THREE.MeshBasicMaterial({color: '#c4c6cb', side: THREE.DoubleSide}));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -2;
    env.add(g);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.02).texture;
    scene.environmentIntensity = 0.65;
    pm.dispose();
  }
  const SUN = new V3(-0.4, 0.85, 0.5).normalize();
  const sun = new THREE.DirectionalLight('#fff8ee', 1.5);
  sun.castShadow = true;
  const EXT = 3.4;
  Object.assign(sun.shadow.camera, {left: -EXT, right: EXT, top: EXT, bottom: -EXT, near: 0.5, far: 24});
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.radius = 9;
  sun.shadow.blurSamples = 20;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9cbd0', 0.45));

  const groundMat = new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: GROUND_FRAG,
    uniforms: {uG: {value: new THREE.Color('#dedfe2')}, uBg: {value: new THREE.Color(BG)}, uC: {value: new V3()}, uOff: {value: 0}},
    toneMapped: false,
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const shade = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({color: '#4a4d55', opacity: 0.32, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8}));
  shade.rotation.x = -Math.PI / 2;
  shade.receiveShadow = true;
  scene.add(shade);

  const mech = buildMech();
  scene.add(mech.root);

  const size = {w: 1600, h: 900};
  const resize = (w, h, pr) => {
    size.w = w;
    size.h = h;
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(pr);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const frame = (cam) => {
    const {tx, ty, tz, az, el, d} = cam;
    camera.position.set(tx + d * Math.cos(el) * Math.sin(az), ty + d * Math.sin(el), tz + d * Math.cos(el) * Math.cos(az));
    camera.lookAt(tx, ty, tz);
    camera.setViewOffset(size.w, size.h, -(cam.sx ?? 0), -(cam.sy ?? 0), size.w, size.h);
    camera.updateMatrixWorld();
    groundMat.uniforms.uC.value.set(tx, 0, tz);
    sun.target.position.set(0, 1.6 + (cam.lift ?? 0), 0);
    sun.position.copy(sun.target.position).addScaledVector(SUN, 10);
    sun.target.updateMatrixWorld();
    composer.render();
  };
  const pv = new V3();
  const project = (v) => {
    pv.copy(v).project(camera);
    return pv.z > 1 ? null : [(pv.x * 0.5 + 0.5) * size.w, (-pv.y * 0.5 + 0.5) * size.h];
  };
  const setQuality = ({samples, ao, shadow}) => {
    if (samples !== undefined)
      for (const t of [composer.renderTarget1, composer.renderTarget2]) {
        t.samples = samples;
        t.dispose();
      }
    if (ao !== undefined) gtao.enabled = ao;
    if (shadow !== undefined) {
      sun.shadow.mapSize.set(shadow, shadow);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  };
  const setFloor = (v) => {
    ground.visible = v;
    shade.visible = v;
    floorOn = v;
  };
  const setTravel = (m) => (groundMat.uniforms.uOff.value = m % 1000);
  return {renderer, scene, camera, composer, gtao, bloom, sun, mech, resize, frame, project, size, setQuality, setFloor, setTravel};
}
