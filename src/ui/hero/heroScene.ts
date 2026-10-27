/**
 * The hero in their world: one Kenney character standing on an endless quest path, in a small transparent
 * three.js scene that loads lazily with the Quests screen. Body shape is a blend of the model's morph targets
 * (muscle, fat, thin). Each completed quest is one stop on the path; when the stop moves on, the hero walks there
 * and cheers. Scenery is built in code from simple shapes in Kenney's chunky style (see world.ts for the layout).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HeroId } from '../../contract.ts';
import { along, CASTLE_EVERY, decorFor, STEP, stopAt, type Decor } from './world.ts';

export type Cheer = 'emote-yes' | 'jump';

export type HeroScene = {
  load(id: HeroId): Promise<void>;
  setBody(muscle: number, build: number): void;
  /** Move to stop `n`; walks there from the stop shown before when `walk` is true. */
  setNode(n: number, walk: boolean): void;
  play(clip: Cheer): void;
  dispose(): void;
};

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const WALK_SECONDS = 1.1; // per stop
const MAX_WALK = 3; // stops walked in one go; earlier ones are skipped

const COLOURS = {
  grass: '#7bc74d',
  path: '#e9c98f',
  stone: '#cfd5dd',
  gold: '#ffc800',
  trunk: '#8a5a3b',
  leaf: '#4caf50',
  leafDark: '#2e8b57',
  rock: '#9aa3ad',
  wall: '#d9dde3',
  roof: '#e5484d',
  petals: ['#ff6b8a', '#ffd23f', '#ffffff'],
};

export function createHeroScene(canvas: HTMLCanvasElement): HeroScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const haze =
    getComputedStyle(document.documentElement).getPropertyValue('--blue-soft').trim() || '#e6f2fe';
  scene.fog = new THREE.Fog(haze, 9, 20);
  scene.add(new THREE.HemisphereLight('#ffffff', '#b7c9a8', 2.0));
  const sun = new THREE.DirectionalLight('#ffffff', 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 25 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
  const mat = (color: string) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
  const M = {
    grass: mat(COLOURS.grass),
    path: mat(COLOURS.path),
    stone: mat(COLOURS.stone),
    gold: mat(COLOURS.gold),
    trunk: mat(COLOURS.trunk),
    leaf: mat(COLOURS.leaf),
    leafDark: mat(COLOURS.leafDark),
    rock: mat(COLOURS.rock),
    wall: mat(COLOURS.wall),
    roof: mat(COLOURS.roof),
    petals: COLOURS.petals.map(mat),
  };
  const G = {
    tile: new THREE.CylinderGeometry(0.32, 0.36, 0.06, 7),
    stop: new THREE.CylinderGeometry(0.6, 0.68, 0.16, 10),
    trunk: new THREE.CylinderGeometry(0.1, 0.13, 0.7, 6),
    canopy: new THREE.IcosahedronGeometry(0.62, 0),
    cone: new THREE.ConeGeometry(0.55, 0.9, 7),
    rock: new THREE.DodecahedronGeometry(0.38, 0),
    bush: new THREE.IcosahedronGeometry(0.34, 0),
    petal: new THREE.BoxGeometry(0.1, 0.1, 0.1),
    tower: new THREE.BoxGeometry(0.9, 1.6, 0.9),
    roof: new THREE.ConeGeometry(0.75, 0.8, 4),
    flag: new THREE.BoxGeometry(0.36, 0.22, 0.03),
    pole: new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5),
  };

  const clock = new THREE.Clock();
  const world = new THREE.Group();
  scene.add(world);
  let built = { from: 0, to: -1, gold: -1 };
  let ground: THREE.Mesh | undefined;
  let hero: THREE.Group | undefined;
  let mixer: THREE.AnimationMixer | undefined;
  let actions: Record<string, THREE.AnimationAction> = {};
  let body = { muscle: 0, build: 0 };
  let node = 0;
  let walk: { from: number; to: number; t: number } | null = null;
  let frame = 0;
  let visible = true;
  const focus = new THREE.Vector3();

  function place<T extends THREE.Object3D>(obj: T, x: number, y: number, z: number): T {
    obj.position.set(x, y, z);
    obj.castShadow = true;
    obj.receiveShadow = true;
    return obj;
  }

  function decor(d: Decor) {
    const g = new THREE.Group();
    g.position.set(d.x, 0, d.z);
    g.rotation.y = d.turn;
    g.scale.setScalar(d.scale);
    if (d.kind === 'tree') {
      g.add(place(new THREE.Mesh(G.trunk, M.trunk), 0, 0.35, 0));
      g.add(place(new THREE.Mesh(G.canopy, M.leaf), 0, 1.05, 0));
    } else if (d.kind === 'pine') {
      g.add(place(new THREE.Mesh(G.trunk, M.trunk), 0, 0.3, 0));
      g.add(place(new THREE.Mesh(G.cone, M.leafDark), 0, 0.85, 0));
      const top = place(new THREE.Mesh(G.cone, M.leafDark), 0, 1.35, 0);
      top.scale.setScalar(0.75);
      g.add(top);
    } else if (d.kind === 'rock') {
      const rock = place(new THREE.Mesh(G.rock, M.rock), 0, 0.18, 0);
      rock.scale.set(1.2, 0.7, 1);
      g.add(rock);
    } else if (d.kind === 'bush') {
      g.add(place(new THREE.Mesh(G.bush, M.leaf), 0, 0.22, 0));
    } else {
      M.petals.forEach((m, k) =>
        g.add(place(new THREE.Mesh(G.petal, m), (k - 1) * 0.22, 0.06, (k % 2) * 0.18)),
      );
    }
    return g;
  }

  function castle(i: number) {
    const p = stopAt(i);
    const side = p.x > 0 ? -1 : 1; // on the roomier side of the path
    const g = new THREE.Group();
    g.position.set(p.x + side * 1.9, 0, p.z - 0.4);
    g.add(place(new THREE.Mesh(G.tower, M.wall), 0, 0.8, 0));
    const roof = place(new THREE.Mesh(G.roof, M.roof), 0, 2.0, 0);
    roof.rotation.y = Math.PI / 4;
    g.add(roof);
    g.add(place(new THREE.Mesh(G.pole, M.trunk), 0, 2.7, 0));
    g.add(place(new THREE.Mesh(G.flag, M.roof), 0.18, 2.9, 0));
    return g;
  }

  /** (Re)build the stretch of world around stop n; stops before `gold` are drawn gold. */
  function build(n: number, gold: number) {
    const from = Math.max(0, n - 4);
    const to = n + 12;
    if (from === built.from && to === built.to && gold === built.gold) return;
    ground?.geometry.dispose(); // everything else shares the geometries in G
    world.clear();
    built = { from, to, gold };
    ground = new THREE.Mesh(new THREE.PlaneGeometry(22, (to - from + 10) * STEP), M.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -((from + to) / 2) * STEP);
    ground.receiveShadow = true;
    world.add(ground);
    for (let i = from; i < to; i++) {
      for (let s = 1; s < 4; s++) {
        const q = along(i, s / 4);
        const tile = place(new THREE.Mesh(G.tile, M.path), q.x, 0.03, q.z);
        tile.rotation.y = i * 1.7 + s;
        world.add(tile);
      }
      const p = stopAt(i);
      world.add(place(new THREE.Mesh(G.stop, i < gold ? M.gold : M.stone), p.x, 0.08, p.z));
      if (i > 0 && i % CASTLE_EVERY === 0) world.add(castle(i));
      for (const d of decorFor(i)) world.add(decor(d));
    }
  }

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function heroAt(): THREE.Vector3 {
    if (walk) {
      const i = Math.floor(walk.t);
      const p = along(walk.from + i, walk.t - i);
      return new THREE.Vector3(p.x, 0.16, p.z);
    }
    const p = stopAt(node);
    return new THREE.Vector3(p.x, 0.16, p.z);
  }

  function crossTo(name: string) {
    const next = actions[name];
    if (!next) return;
    for (const a of Object.values(actions)) if (a !== next && a.isRunning()) a.fadeOut(0.2);
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.2).play();
  }

  function cheer(name: Cheer) {
    const a = actions[name];
    if (!a || reducedMotion()) return;
    actions.idle?.fadeOut(0.2);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = false;
    a.fadeIn(0.2).play();
  }

  function update(dt: number) {
    mixer?.update(dt);
    if (walk) {
      walk.t += dt / WALK_SECONDS;
      if (walk.t >= walk.to - walk.from) {
        walk = null;
        crossTo('idle');
        cheer('emote-yes');
      }
    }
    const at = heroAt();
    if (hero) {
      hero.position.copy(at);
      // face along the path while walking, turn towards the camera when standing
      let yaw = 0.35;
      if (walk) {
        const i = Math.floor(walk.t);
        const ahead = along(walk.from + i, Math.min(walk.t - i + 0.1, 1));
        yaw = Math.atan2(ahead.x - at.x, ahead.z - at.z);
      }
      const diff = Math.atan2(Math.sin(yaw - hero.rotation.y), Math.cos(yaw - hero.rotation.y));
      hero.rotation.y += diff * Math.min(1, dt * 8);
    }
    // the camera trails behind and above, looking a little up the path
    focus.lerp(at, Math.min(1, dt * 4));
    camera.position.set(focus.x + 2.8, focus.y + 3.8, focus.z + 7.2);
    camera.lookAt(focus.x - 0.3, focus.y + 0.7, focus.z - 2.4);
    sun.position.set(focus.x + 3, 7, focus.z + 4);
    sun.target.position.copy(focus);
  }

  function draw() {
    update(Math.min(clock.getDelta(), 0.1));
    renderer.render(scene, camera);
  }

  function loop() {
    cancelAnimationFrame(frame);
    if (!visible || document.hidden || reducedMotion()) {
      if (walk) walk.t = walk.to - walk.from; // skip to the end of any walk
      draw(); // one still frame
      return;
    }
    const tick = () => {
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  function applyBody() {
    hero?.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const dict = mesh.morphTargetDictionary;
      const infl = mesh.morphTargetInfluences;
      if (!dict || !infl) return;
      const set = (name: string, v: number) => {
        const i = dict[name];
        if (i !== undefined) infl[i] = v;
      };
      set('muscle', Math.min(Math.max(body.muscle, 0), 4) / 4);
      set('fat', Math.max(body.build, 0) / 2);
      set('thin', Math.max(-body.build, 0) / 2);
    });
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const io = new IntersectionObserver(([e]) => {
    visible = e?.isIntersecting ?? true;
    loop();
  });
  io.observe(canvas);
  const onVisibility = () => loop();
  document.addEventListener('visibilitychange', onVisibility);
  build(0, 0);

  return {
    async load(id) {
      const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}hero/${id}.glb`);
      if (hero) scene.remove(hero);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const height = box.max.y - box.min.y || 1;
      model.scale.setScalar(1.7 / height);
      model.position.y = (-box.min.y * 1.7) / height; // feet on the ground
      model.traverse((o) => {
        o.castShadow = true;
      });
      hero = new THREE.Group();
      hero.add(model);
      scene.add(hero);
      mixer = new THREE.AnimationMixer(model);
      actions = Object.fromEntries(gltf.animations.map((c) => [c.name, mixer!.clipAction(c)]));
      mixer.addEventListener('finished', () => crossTo(walk ? 'walk' : 'idle'));
      crossTo(walk ? 'walk' : 'idle');
      applyBody();
      resize();
      focus.copy(heroAt());
      clock.getDelta();
      loop();
    },
    setBody(muscle, build) {
      body = { muscle, build };
      applyBody();
      if (reducedMotion() || document.hidden) draw();
    },
    setNode(n, animate) {
      const target = Math.max(0, n);
      if (animate && target > node && !reducedMotion()) {
        const from = Math.max(node, target - MAX_WALK);
        node = target;
        walk = { from, to: target, t: 0 };
        build(from, target);
        crossTo('walk');
      } else {
        node = target;
        walk = null;
        build(target, target);
        focus.copy(heroAt());
      }
      loop();
    },
    play: cheer,
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : mesh.material
            ? [mesh.material]
            : [];
        for (const m of mats) m.dispose();
      });
      renderer.dispose();
    },
  };
}
