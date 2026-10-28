/**
 * Small still portraits of a hero as its player customised it, for friend lists and profiles. One offscreen
 * three.js renderer draws them one at a time; each finished picture is kept as an image URL, so a list of
 * friends costs one render per distinct look. Loaded lazily with the screens that show portraits.
 */
import * as THREE from 'three';
import type { HeroId } from '../../contract.ts';
import { loadHeroModel, type Look } from './heroModel.ts';

const SIZE = 192; // px; shown at up to 96 CSS px on a 2x screen

let renderer: THREE.WebGLRenderer | undefined;
const done = new Map<string, Promise<string>>();
let queue: Promise<unknown> = Promise.resolve();

function setup(): THREE.WebGLRenderer {
  renderer ??= (() => {
    const r = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    r.setSize(SIZE, SIZE, false);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    return r;
  })();
  return renderer;
}

async function draw(hero: HeroId, look: Look): Promise<string> {
  const r = setup();
  const { gltf, model } = await loadHeroModel(hero, look);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b7c9a8', 2.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(1.5, 3, 3);
  scene.add(sun);

  // stand in the first frame of the idle animation, not the bind pose
  const idle = gltf.animations.find((c) => c.name === 'idle');
  if (idle) {
    const mixer = new THREE.AnimationMixer(model);
    mixer.clipAction(idle).play();
    mixer.update(0);
  }
  const box = new THREE.Box3().setFromObject(model);
  const height = box.max.y - box.min.y || 1;
  model.scale.setScalar(1.7 / height);
  model.position.y = (-box.min.y * 1.7) / height;
  model.rotation.y = -0.35;
  scene.add(model);

  // head and shoulders: Kenney's minis are about half head
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.position.set(0, 1.25, 2.6);
  camera.lookAt(0, 1.18, 0);
  r.render(scene, camera);
  const blob = await new Promise<Blob | null>((ok) => r.domElement.toBlob(ok, 'image/png'));

  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
  if (!blob) throw new Error('portrait failed');
  return URL.createObjectURL(blob);
}

/** An image URL of this hero's portrait; the same look is drawn only once. */
export function portrait(hero: HeroId, look: Look = {}): Promise<string> {
  const key = JSON.stringify([hero, look.head ?? null, look.colours ?? {}]);
  let p = done.get(key);
  if (!p) {
    // one at a time: the renderer has one canvas
    p = queue.then(() => draw(hero, look));
    queue = p.catch(() => undefined);
    p.catch(() => done.delete(key));
    done.set(key, p);
  }
  return p;
}
