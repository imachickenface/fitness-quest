/**
 * Loading one hero model as the player customised it: another character's head and recoloured palette cells.
 * Shared by the hero's world (heroScene.ts) and the small portraits of friends (portrait.ts).
 */
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HeroId } from '../../contract.ts';
import { remapUVs } from './palette.ts';

export type Look = { head?: HeroId; colours?: Record<string, number> };

export type HeroModel = {
  gltf: GLTF;
  model: THREE.Group;
  /** meshes with UVs; each keeps its original UVs in `userData.uv0` for recolouring */
  skinned: THREE.Mesh[];
};

const url = (h: HeroId) => `${import.meta.env.BASE_URL}hero/${h}.glb`;

/** Swap the body's head mesh for another character's, bound to this body's skeleton (same bone names). */
function swapHead(body: THREE.Object3D, other: THREE.Object3D) {
  let mine: THREE.SkinnedMesh | undefined;
  let theirs: THREE.SkinnedMesh | undefined;
  body.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name.startsWith('head'))
      mine = o as THREE.SkinnedMesh;
  });
  other.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name.startsWith('head'))
      theirs = o as THREE.SkinnedMesh;
  });
  if (!mine || !theirs) return;
  const byName = new Map(mine.skeleton.bones.map((b) => [b.name, b]));
  const bones = theirs.skeleton.bones.map((b) => byName.get(b.name) ?? b);
  const head = new THREE.SkinnedMesh(theirs.geometry, theirs.material);
  head.name = theirs.name;
  head.bind(new THREE.Skeleton(bones, theirs.skeleton.boneInverses), mine.bindMatrix);
  mine.parent?.add(head);
  mine.parent?.remove(mine);
}

/** Recolour: move every remapped cell's UVs to the new cell (see palette.ts). */
export function recolour(skinned: THREE.Mesh[], colours: Record<string, number>) {
  const map: Record<number, number> = {};
  for (const [from, to] of Object.entries(colours)) map[Number(from)] = to;
  for (const mesh of skinned) {
    const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute;
    remapUVs(mesh.userData.uv0 as Float32Array, uv.array as Float32Array, map);
    uv.needsUpdate = true;
  }
}

export async function loadHeroModel(id: HeroId, look: Look = {}): Promise<HeroModel> {
  const loader = new GLTFLoader();
  const [gltf, headGltf] = await Promise.all([
    loader.loadAsync(url(id)),
    look.head && look.head !== id ? loader.loadAsync(url(look.head)) : Promise.resolve(undefined),
  ]);
  const model = gltf.scene;
  if (headGltf) swapHead(model, headGltf.scene);
  const skinned: THREE.Mesh[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const uv = mesh.isMesh ? mesh.geometry.getAttribute('uv') : undefined;
    if (uv) {
      mesh.userData.uv0 = Float32Array.from(uv.array as ArrayLike<number>);
      skinned.push(mesh);
    }
  });
  recolour(skinned, look.colours ?? {});
  return { gltf, model, skinned };
}
