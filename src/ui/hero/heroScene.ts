/**
 * The 3D hero: one Kenney character in a small transparent three.js scene. Loads lazily with the Quests screen.
 * Body shape is a blend of the model's morph targets (muscle, fat, thin); idle loops, cheers play once.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { HeroId } from '../../contract.ts';

export type Cheer = 'emote-yes' | 'jump';

export type HeroScene = {
  load(id: HeroId): Promise<void>;
  setBody(muscle: number, build: number): void;
  play(clip: Cheer): void;
  dispose(): void;
};

const reducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function createHeroScene(canvas: HTMLCanvasElement): HeroScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#c9d3de', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 2.4);
  key.position.set(2, 4, 3);
  scene.add(key);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 1.2, 5.8);
  camera.lookAt(0, 1.0, 0);

  const clock = new THREE.Clock();
  let model: THREE.Object3D | undefined;
  let mixer: THREE.AnimationMixer | undefined;
  let idle: THREE.AnimationAction | undefined;
  let clips: THREE.AnimationClip[] = [];
  let body = { muscle: 0, build: 0 };
  let frame = 0;
  let visible = true;

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function draw() {
    mixer?.update(clock.getDelta());
    renderer.render(scene, camera);
  }

  function loop() {
    cancelAnimationFrame(frame);
    if (!visible || document.hidden || reducedMotion()) {
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
    model?.traverse((o) => {
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

  return {
    async load(id) {
      const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}hero/${id}.glb`);
      if (model) scene.remove(model);
      model = gltf.scene;
      // stand the character on y = 0, about 2 units tall, turned a little towards the light
      const box = new THREE.Box3().setFromObject(model);
      const height = box.max.y - box.min.y || 1;
      model.scale.setScalar(2 / height);
      model.position.y = (-box.min.y * 2) / height;
      model.rotation.y = -0.35;
      scene.add(model);
      clips = gltf.animations;
      mixer = new THREE.AnimationMixer(model);
      mixer.addEventListener('finished', () => {
        if (idle) idle.reset().fadeIn(0.25).play();
      });
      const clip = THREE.AnimationClip.findByName(clips, 'idle');
      idle = clip ? mixer.clipAction(clip) : undefined;
      idle?.play();
      applyBody();
      resize();
      clock.getDelta();
      loop();
    },
    setBody(muscle, build) {
      body = { muscle, build };
      applyBody();
      if (reducedMotion() || document.hidden) draw();
    },
    play(name) {
      if (!mixer || reducedMotion()) return;
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (!clip) return;
      const action = mixer.clipAction(clip);
      action.reset().setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
      idle?.fadeOut(0.2);
      action.fadeIn(0.2).play();
    },
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
