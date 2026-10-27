import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildHero } from './hero3d.ts';
import { DEFAULT_LOOK, type Look } from './look.ts';

const W = 1500;
const H = 1150;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
document.body.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#ffffff');
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;

const key = new THREE.DirectionalLight('#ffffff', 2.2);
key.position.set(-4, 9, 8);
key.castShadow = true;
key.shadow.mapSize.set(4096, 4096);
key.shadow.camera.left = -12;
key.shadow.camera.right = 12;
key.shadow.camera.top = 12;
key.shadow.camera.bottom = -12;
key.shadow.radius = 8;
key.shadow.blurSamples = 16;
key.shadow.bias = -0.0005;
scene.add(key);
scene.add(new THREE.HemisphereLight('#ffffff', '#dfe6ee', 0.6));

const looks: Look[] = [
  { skin: 1, hair: 'short', hairColour: 1, outfit: 'track', outfitColour: 1, headgear: 'cap' },
  { skin: 2, hair: 'short', hairColour: 0, outfit: 'armor', outfitColour: 0, headgear: 'helmet' },
  { skin: 4, hair: 'bun', hairColour: 5, outfit: 'tank', outfitColour: 2, headgear: 'none' },
  { skin: 0, hair: 'long', hairColour: 3, outfit: 'tee', outfitColour: 3, headgear: 'headband' },
  { skin: 3, hair: 'spiky', hairColour: 4, outfit: 'tee', outfitColour: 4, headgear: 'crown' },
];

const rows: { look: Look; muscle: number; build: number }[][] = [
  [0, 1, 2, 3, 4].map((muscle) => ({ look: DEFAULT_LOOK, muscle, build: 0 })),
  [-2, -1, 0, 1, 2].map((build) => ({ look: DEFAULT_LOOK, muscle: 1, build })),
  looks.map((look) => ({ look, muscle: 2, build: 0 })),
];
const groups = rows.map(() => new THREE.Group());
groups.forEach((g) => scene.add(g));
rows.forEach((row, r) =>
  row.forEach(({ look, muscle, build }, i) => {
    const hero = buildHero(look, { muscle, build });
    hero.position.set((i - 2) * 2.3, -r * 3.9, -r * 0.01);
    hero.rotation.y = -0.18;
    groups[r]!.add(hero);
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.ShadowMaterial({ opacity: 0.18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(hero.position.x, hero.position.y + 0.001, 0);
    floor.receiveShadow = true;
    groups[r]!.add(floor);
  }),
);

// one eye-level camera per row, each drawn into its own band of the canvas
const camera = new THREE.PerspectiveCamera(24, W / (H / 3), 0.1, 100);
renderer.setScissorTest(true);
rows.forEach((_, r) => {
  const y = -r * 3.9;
  groups.forEach((g, i) => (g.visible = i === r));
  camera.position.set(0, y + 1.55, 8.4);
  camera.lookAt(0, y + 1.5, 0);
  const top = r * (H / 3);
  renderer.setViewport(0, H - top - H / 3, W, H / 3);
  renderer.setScissor(0, H - top - H / 3, W, H / 3);
  renderer.render(scene, camera);
});
document.title = 'ready';
