/**
 * The hero as a real 3D model, built in code with three.js. The torso is one lathed surface whose profile
 * follows muscle and build, so the body changes shape smoothly instead of swapping parts; everything else is
 * rounded geometry lit like a vinyl toy. Feet stand on y = 0; the hero is about 3 units tall.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HAIR_COLOURS, OUTFIT_COLOURS, SKINS, type Body, type Look } from './look.ts';

const SHORTS = '#2f3e75';
const SHOE = '#f4f6f8';
const INK = '#1c1c24';

type Mats = Record<
  | 'skin'
  | 'cloth'
  | 'hair'
  | 'shorts'
  | 'shoe'
  | 'sole'
  | 'ink'
  | 'white'
  | 'metal'
  | 'gold'
  | 'blush',
  THREE.Material
>;

function materials(look: Look, body: Body): Mats {
  const pale = body.build < 0 ? (body.build <= -2 ? 0.38 : 0.2) : 0;
  const skin = new THREE.Color(SKINS[look.skin] ?? SKINS[1]).lerp(new THREE.Color('#a7adb5'), pale);
  const std = (
    color: THREE.ColorRepresentation,
    roughness: number,
    extra: Partial<THREE.MeshPhysicalMaterialParameters> = {},
  ) => new THREE.MeshPhysicalMaterial({ color, roughness, ...extra });
  return {
    skin: std(skin, 0.5, { sheen: 0.4, sheenColor: new THREE.Color('#ffb3a0'), clearcoat: 0.15 }),
    cloth: std(OUTFIT_COLOURS[look.outfitColour] ?? OUTFIT_COLOURS[0], 0.75, { sheen: 0.6 }),
    hair: std(HAIR_COLOURS[look.hairColour] ?? HAIR_COLOURS[0], 0.45, { clearcoat: 0.3 }),
    shorts: std(SHORTS, 0.8, { sheen: 0.5 }),
    shoe: std(SHOE, 0.45, { clearcoat: 0.4 }),
    sole: std('#c5ccd6', 0.6),
    ink: std(INK, 0.12, { clearcoat: 1 }),
    white: std('#ffffff', 0.2),
    metal: std('#cfd6e0', 0.25, { metalness: 1 }),
    gold: std('#ffc400', 0.3, { metalness: 1 }),
    blush: new THREE.MeshStandardMaterial({
      color: '#ff8a80',
      roughness: 0.8,
      transparent: true,
      opacity: 0.45,
    }),
  };
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const sphere = (r: number, w = 48, h = 32) => new THREE.SphereGeometry(r, w, h);

/** A smooth surface of revolution through the given (radius, height) points. */
function lathe(points: [number, number][], segments = 64) {
  const curve = new THREE.CatmullRomCurve3(points.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  const pts = curve.getPoints(48).map((p) => new THREE.Vector2(Math.max(p.x, 0.001), p.y));
  return new THREE.LatheGeometry(pts, segments);
}

export function buildHero(look: Look, body: Body): THREE.Group {
  const m = THREE.MathUtils.clamp(Math.round(body.muscle), 0, 4);
  const b = THREE.MathUtils.clamp(Math.round(body.build), -2, 2);
  const mat = materials(look, { muscle: m, build: b });
  const hero = new THREE.Group();

  const thin = b < 0 ? -b : 0;
  const fat = b > 0 ? b : 0;
  const shoulder = 0.42 + m * 0.055 + fat * 0.03 - thin * 0.04;
  const chest = 0.4 + m * 0.045 + fat * 0.05 - thin * 0.03;
  const waist = 0.34 - m * 0.012 + fat * 0.09 - thin * 0.03;
  const bellyR = waist + fat * 0.1;
  const hip = 0.35 + fat * 0.05 - thin * 0.02;
  const armR = 0.105 + m * 0.022 + fat * 0.025 - thin * 0.018;
  const legR = 0.13 + (m >= 2 ? 0.02 : 0) + fat * 0.035 - thin * 0.025;
  const slump = b <= -2 ? -0.08 : 0;
  const depth = 0.78 + fat * 0.06; // torso front-to-back squash

  // ----- legs and shoes
  for (const s of [-1, 1]) {
    const x = s * Math.max(hip * 0.48, 0.15);
    const legMat = look.outfit === 'track' ? mat.cloth : mat.skin;
    hero.add(mesh(new THREE.CapsuleGeometry(legR, 0.5, 12, 32), legMat, x, 0.5, 0));
    const shoe = mesh(
      new RoundedBoxGeometry(legR * 2 + 0.12, 0.2, 0.5, 6, 0.09),
      mat.shoe,
      x,
      0.12,
      0.07,
    );
    hero.add(shoe);
    hero.add(
      mesh(new RoundedBoxGeometry(legR * 2 + 0.14, 0.07, 0.52, 4, 0.03), mat.sole, x, 0.035, 0.07),
    );
    hero.add(
      mesh(new RoundedBoxGeometry(legR * 2 + 0.13, 0.04, 0.3, 2, 0.02), mat.cloth, x, 0.17, 0.08),
    );
  }

  // ----- hips (shorts or track trousers) and torso, one smooth profile each
  const shorts = mesh(
    lathe([
      [0.001, 0.62],
      [hip * 0.9, 0.62],
      [hip + 0.02, 0.72],
      [waist + 0.03, 0.92],
      [0.001, 0.94],
    ]),
    look.outfit === 'track' ? mat.cloth : mat.shorts,
  );
  shorts.scale.z = depth;
  hero.add(shorts);

  const torso = mesh(
    lathe([
      [0.001, 0.86],
      [waist, 0.88],
      [bellyR, 1.05],
      [chest, 1.3],
      [shoulder, 1.45],
      [shoulder * 0.55, 1.6],
      [0.001, 1.63],
    ]),
    look.outfit === 'armor' ? mat.metal : mat.cloth,
  );
  torso.scale.z = depth;
  hero.add(torso);
  if (look.outfit === 'tank') {
    // a scoop neckline shows skin at the chest
    const neckline = mesh(sphere(0.2), mat.skin, 0, 1.55, shoulder * depth * 0.62);
    neckline.scale.set(1.1, 0.7, 0.5);
    hero.add(neckline);
  }
  if (look.outfit === 'track') {
    hero.add(
      mesh(
        new THREE.CylinderGeometry(0.012, 0.012, 0.66, 8),
        mat.white,
        0,
        1.22,
        (bellyR + 0.01) * depth,
      ),
    );
  }

  // ----- arms: shoulder ball, upper arm with bicep, forearm, hand
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * (shoulder - 0.02), 1.43, 0);
    arm.rotation.z = s * (0.18 + fat * 0.12 + m * 0.04);
    const sleeveMat =
      look.outfit === 'tank' ? null : look.outfit === 'armor' ? mat.metal : mat.cloth;
    arm.add(mesh(sphere(armR * 1.25), sleeveMat ?? mat.skin, 0, 0, 0));
    arm.add(
      mesh(
        new THREE.CapsuleGeometry(armR, 0.62, 12, 32),
        look.outfit === 'track' ? mat.cloth : mat.skin,
        0,
        -0.38,
        0,
      ),
    );
    if (m >= 2) {
      const bicep = mesh(
        sphere(armR * (1.05 + m * 0.06)),
        look.outfit === 'track' ? mat.cloth : mat.skin,
        0,
        -0.22,
        armR * 0.25,
      );
      bicep.scale.set(1, 1.35, 1);
      arm.add(bicep);
    }
    if (sleeveMat && look.outfit !== 'track') {
      arm.add(mesh(new THREE.CapsuleGeometry(armR * 1.22, 0.12, 8, 32), sleeveMat, 0, -0.1, 0));
    }
    arm.add(mesh(sphere(armR * 1.18), mat.skin, 0, -0.78, 0.02));
    hero.add(arm);
  }
  if (look.outfit === 'armor') {
    for (const s of [-1, 1]) {
      const pad = mesh(
        new THREE.SphereGeometry(armR * 2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        mat.metal,
        s * (shoulder + 0.02),
        1.47,
        0,
      );
      pad.scale.set(1.1, 0.7, 1);
      hero.add(pad);
      hero.add(mesh(sphere(0.03), mat.gold, s * (shoulder + 0.02), 1.52 + armR * 0.6, armR * 1.2));
    }
  }

  // ----- neck and head
  hero.add(mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.28, 24), mat.skin, 0, 1.68 + slump, 0));
  const head = new THREE.Group();
  head.position.set(0, 2.28 + slump, 0);
  head.rotation.x = b <= -2 ? 0.12 : 0;
  hero.add(head);
  const skull = mesh(sphere(0.62, 64, 48), mat.skin);
  skull.scale.set(1.04 + fat * 0.04, 0.95, 0.95);
  head.add(skull);
  if (b === 2) {
    for (const s of [-1, 1]) head.add(mesh(sphere(0.2), mat.skin, s * 0.36, -0.28, 0.32));
  }
  for (const s of [-1, 1]) {
    const ear = mesh(sphere(0.14), mat.skin, s * 0.64, -0.04, 0);
    ear.scale.set(0.55, 1, 0.8);
    head.add(ear);
  }

  // face: glossy eyes with highlights, brows, nose, smile or a tired flat mouth
  const tired = b < 0;
  for (const s of [-1, 1]) {
    const eye = mesh(sphere(0.085), mat.ink, s * 0.21, 0.02, 0.56);
    eye.scale.set(1, tired ? 0.9 : 1.25, 0.55);
    head.add(eye);
    head.add(mesh(sphere(0.026), mat.white, s * 0.21 + 0.03, 0.07, 0.6));
    if (tired) {
      const lid = mesh(
        new THREE.SphereGeometry(0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        mat.skin,
        s * 0.21,
        0.03,
        0.555,
      );
      lid.scale.set(1.05, 0.9, 0.6);
      head.add(lid);
    }
    const brow = mesh(
      new THREE.CapsuleGeometry(0.022, 0.1, 4, 12),
      mat.hair,
      s * 0.21,
      0.2 + (tired ? -0.02 : 0),
      0.55,
    );
    brow.rotation.z = Math.PI / 2 + s * (tired ? -0.25 : 0.12);
    head.add(brow);
    if (!tired) {
      const blush = mesh(sphere(0.09), mat.blush, s * 0.36, -0.13, 0.48);
      blush.scale.set(1.2 + fat * 0.2, 0.7, 0.4);
      head.add(blush);
    }
  }
  head.add(mesh(sphere(0.055), mat.skin, 0, -0.08, 0.6));
  if (tired) {
    const flat = mesh(new THREE.CapsuleGeometry(0.018, 0.12, 4, 12), mat.ink, 0, -0.24, 0.56);
    flat.rotation.z = Math.PI / 2;
    head.add(flat);
  } else {
    const smile = mesh(
      new THREE.TorusGeometry(0.085, 0.02, 12, 32, Math.PI),
      mat.ink,
      0,
      -0.2,
      0.56,
    );
    smile.rotation.z = Math.PI;
    head.add(smile);
  }

  if (look.headgear !== 'helmet') addHair(head, look.hair, mat, look.headgear === 'cap');
  addHeadgear(head, look.headgear, mat);

  return hero;
}

function addHair(head: THREE.Group, style: Look['hair'], mat: Mats, underCap = false) {
  const cap = (theta: number, r = 0.655) => {
    const c = mesh(
      new THREE.SphereGeometry(r, 64, 32, 0, Math.PI * 2, 0, theta),
      mat.hair,
      0,
      0.02,
      -0.02,
    );
    c.scale.set(1.04, 0.96, 0.98);
    c.rotation.x = -0.42; // tilted back: high over the forehead, low at the nape
    head.add(c);
    return c;
  };
  if (style === 'buzz') {
    cap(1.05, 0.635);
    return;
  }
  cap(style === 'long' ? 1.6 : 1.38);
  // a swept fringe of overlapping soft lobes
  // a swept fringe: two broad, flat swoops
  const fringe: number[][] =
    style === 'spiky' || underCap
      ? []
      : [
          [-0.16, 0.36, 0.4, 0.3, 1.55],
          [0.26, 0.33, 0.38, 0.24, 1.45],
        ];
  for (const [x, y, z, r, w] of fringe) {
    const lobe = mesh(sphere(r!, 64, 32), mat.hair, x, y, z);
    lobe.scale.set(w!, 0.5, 0.72);
    lobe.rotation.z = -0.28;
    head.add(lobe);
  }
  if (style === 'spiky') {
    const spikes: [number, number, number, number][] = [
      [0, 0.62, 0.1, 0],
      [-0.28, 0.55, 0.12, 0.45],
      [0.28, 0.55, 0.12, -0.45],
      [-0.14, 0.58, 0.32, 0.25],
      [0.14, 0.58, 0.32, -0.25],
      [0, 0.5, -0.3, 0],
    ];
    for (const [x, y, z, rot] of spikes) {
      const spike = mesh(new THREE.ConeGeometry(0.13, 0.36, 24), mat.hair, x, y, z);
      spike.rotation.set(z > 0.2 ? 0.5 : z < 0 ? -0.5 : 0, 0, rot);
      head.add(spike);
    }
  }
  if (style === 'bun') head.add(mesh(sphere(0.2), mat.hair, 0, 0.72, -0.08));
  if (style === 'long') {
    const back = mesh(new THREE.CapsuleGeometry(0.5, 0.6, 16, 32), mat.hair, 0, -0.45, -0.22);
    back.scale.set(1.15, 1, 0.55);
    head.add(back);
  }
}

function addHeadgear(head: THREE.Group, gear: Look['headgear'], mat: Mats) {
  if (gear === 'cap') {
    const dome = mesh(
      new THREE.SphereGeometry(0.675, 64, 32, 0, Math.PI * 2, 0, 1.2),
      mat.cloth,
      0,
      0.03,
      0,
    );
    dome.scale.set(1.04, 0.95, 0.98);
    head.add(dome);
    const brim = mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.05, 48, 1, false, -Math.PI / 2, Math.PI),
      mat.cloth,
      0,
      0.27,
      0.42,
    );
    brim.scale.set(1, 1, 0.9);
    brim.rotation.x = 0.18;
    head.add(brim);
    head.add(mesh(sphere(0.06), mat.cloth, 0, 0.67, 0));
  }
  if (gear === 'headband') {
    const band = mesh(new THREE.TorusGeometry(0.62, 0.06, 16, 64), mat.cloth, 0, 0.22, 0);
    band.rotation.x = Math.PI / 2;
    band.scale.set(1.05, 0.98, 1);
    head.add(band);
  }
  if (gear === 'crown') {
    const ring = mesh(
      new THREE.CylinderGeometry(0.34, 0.36, 0.16, 48, 1, true),
      mat.gold,
      0,
      0.66,
      0,
    );
    head.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      head.add(
        mesh(
          new THREE.ConeGeometry(0.07, 0.2, 16),
          mat.gold,
          Math.sin(a) * 0.34,
          0.82,
          Math.cos(a) * 0.34,
        ),
      );
    }
  }
  if (gear === 'helmet') {
    const shell = mesh(sphere(0.73, 64, 48), mat.metal);
    shell.scale.set(1.02, 1, 1);
    head.add(shell);
    const visor = mesh(new RoundedBoxGeometry(0.9, 0.13, 0.3, 4, 0.06), mat.ink, 0, 0.04, 0.6);
    head.add(visor);
    for (const s of [-1, 1]) head.add(mesh(sphere(0.035), mat.white, s * 0.21, 0.05, 0.75));
    head.add(mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), mat.metal, 0, 0.2, 0.68));
    const plume = mesh(
      sphere(0.22),
      new THREE.MeshPhysicalMaterial({ color: '#e5484d', roughness: 0.8, sheen: 1 }),
      0,
      0.85,
      -0.1,
    );
    plume.scale.set(0.5, 1.2, 1.4);
    plume.rotation.x = -0.4;
    head.add(plume);
  }
}
