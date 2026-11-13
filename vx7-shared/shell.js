// The outer shell: one painted mesh made from the reference turnaround (tools/shell: Hunyuan3D shape + paint, local),
// cut offline by tools/shell/split.py at the joints into one piece per body segment, and each piece along its panel
// seams into its plates. Here every plate rides its joint node, lifts off its surface on EXPLODE and pulls out on a click.
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import ARMOR from './assets/vx7-armor.glb';

const V3 = THREE.Vector3;

// piece id -> joint node, isolate tags, name, explode direction (world; default: away from the body's middle)
function pieces(N) {
  const P = {
    pelvis: {node: N.pelvis, tags: ['hip'], name: 'PELVIS ARMOR', out: [0, -0.3, 1]},
    torso: {node: N.chest, tags: ['torso'], name: 'CHEST ARMOR', out: [0, 0.25, 1]},
    head: {node: N.head, tags: ['head'], name: 'HELMET', out: [0, 1, 0.3]},
  };
  for (const s of ['L', 'R']) {
    const arm = ['arm' + s, s === 'R' ? 'blade' : 'shield'];
    const leg = ['leg' + s];
    Object.assign(P, {
      ['upper' + s]: {node: N['sh' + s], tags: [...arm, 'shoulder', 'shoulder' + s], name: s + ' SHOULDER ARMOR'},
      ['fore' + s]: {node: N['el' + s], tags: arm, name: s + ' FOREARM ARMOR'},
      ['hand' + s]: {node: N['wrist' + s], tags: arm, name: s === 'L' ? 'L CLAW HAND' : 'R GAUNTLET'},
      ['thigh' + s]: {node: N['thigh' + s], tags: [...leg, 'hip'], name: s + ' THIGH ARMOR'},
      ['shin' + s]: {node: N['knee' + s], tags: [...leg, 'knee'], name: s + ' SHIN ARMOR'},
      ['meta' + s]: {node: N['hock' + s], tags: [...leg, 'foot'], name: s + ' ANKLE ARMOR'},
      ['foot' + s]: {node: N['foot' + s], tags: [...leg, 'foot'], name: s + ' CLAW FOOT'},
    });
  }
  return P;
}

// a material per piece (so each can ghost on its own); back faces read as the dark inside of a hollow shell
const panelMat = (map) => {
  const m = new THREE.MeshStandardMaterial({map, roughness: 0.6, metalness: 0.08, envMapIntensity: 0.55, side: THREE.DoubleSide, shadowSide: THREE.BackSide, transparent: true});
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n\tif (!gl_FrontFacing) diffuseColor.rgb = vec3(0.09, 0.095, 0.105);');
  };
  m.customProgramCacheKey = () => 'vx7-shell';
  return m;
};

export function loadShell(C) {
  const {N, mkPart, pickables} = C;
  const bytes = Uint8Array.from(atob(ARMOR), (c) => c.charCodeAt(0));
  return new Promise((ok, fail) => new GLTFLoader().parse(bytes.buffer, '', ok, fail)).then((gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const meta = pieces(N);
    const srcs = [];
    gltf.scene.traverse((o) => o.isMesh && srcs.push(o));
    const v = new V3();
    return srcs.map((src, j) => {
      const s = meta[src.userData.piece];
      // positions: dequantize to world rest metres, then into the joint node's frame (as floats: they leave [-1, 1])
      const M = s.node.matrixWorld.clone().invert().multiply(src.matrixWorld);
      // normals are stored as world directions (split.py), so they only turn into the node's frame
      const q = s.node.getWorldQuaternion(new THREE.Quaternion()).invert();
      const pa = src.geometry.attributes.position;
      const na = src.geometry.attributes.normal;
      const pos = new Float32Array(pa.count * 3);
      const nrm = new Float32Array(pa.count * 3);
      const cen = new V3();
      const lift = new V3(); // the plate's mean normal: it comes off its surface
      for (let i = 0; i < pa.count; i++) {
        cen.add(v.fromBufferAttribute(pa, i).applyMatrix4(src.matrixWorld));
        lift.add(v.fromBufferAttribute(na, i));
        v.fromBufferAttribute(pa, i).applyMatrix4(M).toArray(pos, i * 3);
        v.fromBufferAttribute(na, i).applyQuaternion(q).normalize().toArray(nrm, i * 3);
      }
      cen.multiplyScalar(1 / pa.count);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('uv', src.geometry.attributes.uv);
      const away = new V3(...(s.out || [cen.x * 2.5, Math.max(-0.1, (cen.y - 2.2) * 0.4), 0.35])).normalize();
      const dir = lift.normalize().add(away.multiplyScalar(0.6)).normalize();
      dir.y = Math.max(dir.y, -0.15); // never into the floor
      const p = mkPart(s.node, src.name, `${s.name} · ${src.userData.plate}`, 'armor', {tags: s.tags, out: dir.applyQuaternion(q).toArray(), dist: 0.7 + 0.3 * ((j * 7919) % 97) / 97, stage: 1});
      const m = panelMat(src.material.map);
      p.mats.push({m, base: 1, e0: 0});
      const mesh = new THREE.Mesh(geo, m);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.part = p;
      p.group.add(mesh);
      pickables.push(mesh);
      return p;
    });
  });
}
