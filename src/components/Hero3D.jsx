// Animated 3D centrepiece for the client planning guide.
// corporate → a set banquet table · social → a mirrored disco ball · wedding/mitzvah → interlocking rings.
// Loaded lazily (only on the client guide); pauses off-screen; static for reduced-motion users.
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const EMBER = 0xE2B979; // warm candlelight
const STEEL = 0x8FB4CC;
const NAVY = 0x0B2536;
const CREAM = 0xF4EFE6;
const GOLD = 0xE9B872;

export function sceneFor(eventType) {
  if (eventType === 'wedding' || eventType === 'mitzvah') return 'rings';
  if (eventType === 'social') return 'disco';
  return 'table';
}

function buildTable(group) {
  const cloth = new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.75 });
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 64), cloth);
  group.add(top);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(1.51, 1.62, 0.75, 64, 1, true), new THREE.MeshStandardMaterial({ color: CREAM, roughness: 0.85, side: THREE.DoubleSide }));
  skirt.position.y = -0.41;
  group.add(skirt);

  const plateMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.05 });
  const rimMat = new THREE.MeshStandardMaterial({ color: EMBER, roughness: 0.35, metalness: 0.6 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.9, thickness: 0.05, transparent: true, opacity: 0.55 });
  const chairMat = new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.45, metalness: 0.2 });
  const legMat = new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.9 });
  const seats = 8;
  for (let i = 0; i < seats; i++) {
    const a = (i / seats) * Math.PI * 2;
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 40), plateMat);
    plate.position.set(Math.cos(a) * 1.12, 0.05, Math.sin(a) * 1.12);
    group.add(plate);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(plate.position).setY(0.062);
    group.add(rim);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.2, 20), glassMat);
    glass.position.set(Math.cos(a + 0.28) * 0.9, 0.14, Math.sin(a + 0.28) * 0.9);
    group.add(glass);

    const chair = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.46), chairMat);
    seat.position.y = -0.3;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.62, 0.06), chairMat);
    back.position.set(0, 0.0, 0.22);
    chair.add(seat, back);
    for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 8), legMat);
      leg.position.set(x, -0.57, z);
      chair.add(leg);
    }
    chair.position.set(Math.cos(a) * 1.95, 0, Math.sin(a) * 1.95);
    chair.lookAt(0, 0, 0);
    chair.rotateY(Math.PI);
    group.add(chair);
  }

  // Centrepiece: florals and three candles with glowing flames.
  const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), new THREE.MeshStandardMaterial({ color: 0xF2CFA8, roughness: 0.6, flatShading: true }));
  bloom.position.y = 0.24;
  group.add(bloom);
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const h = 0.32 + i * 0.08;
    const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, h, 20), new THREE.MeshStandardMaterial({ color: 0xFFF8EC, roughness: 0.4 }));
    candle.position.set(Math.cos(a) * 0.42, h / 2 + 0.04, Math.sin(a) * 0.42);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), new THREE.MeshBasicMaterial({ color: 0xFFC27A }));
    flame.scale.y = 1.6;
    flame.position.set(candle.position.x, h + 0.09, candle.position.z);
    const glow = new THREE.PointLight(EMBER, 0.6, 1.6);
    glow.position.copy(flame.position);
    group.add(candle, flame, glow);
    flames.push(flame);
  }
  group.position.y = -0.1;
  group.rotation.x = 0.05;
  return (t) => flames.forEach((f, i) => { f.scale.y = 1.5 + Math.sin(t * 9 + i * 2) * 0.18; });
}

function buildDisco(group) {
  const ball = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 4),
    new THREE.MeshStandardMaterial({ color: 0xDCE6EF, metalness: 1, roughness: 0.12, flatShading: true }),
  );
  group.add(ball);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.14, 24), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 }));
  cap.position.y = 1.18;
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2, 6), new THREE.MeshStandardMaterial({ color: 0x8EA2B5 }));
  wire.position.y = 2.2;
  group.add(cap, wire);
  group.position.y = 0.05;
  return (t) => { ball.rotation.y = t * 0.5; };
}

function buildRings(group) {
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.16 });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.11, 48, 160), gold);
  const r2 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.11, 48, 160), gold);
  r1.position.x = -0.42;
  r2.position.x = 0.42;
  r2.rotation.y = Math.PI / 2.4;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.2, 0), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0, transmission: 0.95, thickness: 0.4, ior: 2.4 }));
  gem.position.set(-0.42, 0.98, 0);
  gem.scale.y = 1.3;
  group.add(r1, r2, gem);
  return (t) => { gem.rotation.y = t * 1.2; };
}

function buildSparkles(scene, kind) {
  const count = kind === 'disco' ? 220 : 120;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const palette = [new THREE.Color(EMBER), new THREE.Color(STEEL), new THREE.Color(0xFFFFFF), new THREE.Color(0xF2CFA8)];
  for (let i = 0; i < count; i++) {
    const r = 2 + Math.random() * 1.6;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = (Math.random() - 0.4) * 3.4;
    pos[i * 3 + 2] = Math.sin(a) * r;
    const c = palette[i % palette.length];
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: kind === 'disco' ? 0.07 : 0.045, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(pts);
  return (t, dt) => {
    pts.rotation.y = -t * 0.06;
    const p = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      p[i * 3 + 1] += dt * (0.12 + (i % 5) * 0.03);
      if (p[i * 3 + 1] > 2.2) p[i * 3 + 1] = -1.6;
    }
    geo.attributes.position.needsUpdate = true;
  };
}

export default function Hero3D({ kind = 'table' }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return undefined; // no WebGL: the hero simply shows without the 3D piece
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(kind === 'table' ? 34 : 32, 1, 0.1, 100);
    if (kind === 'table') { camera.position.set(0, 3.6, 7.6); camera.lookAt(0, -0.2, 0); }
    else { camera.position.set(0, 0.6, 6.4); camera.lookAt(0, 0.1, 0); }

    scene.add(new THREE.HemisphereLight(0xE4ECF3, 0x0A1724, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 5, 4);
    scene.add(key);
    const emberLight = new THREE.PointLight(EMBER, 28, 14);
    emberLight.position.set(-2.6, 1.6, 2.2);
    const steelLight = new THREE.PointLight(STEEL, 24, 14);
    steelLight.position.set(2.6, 0.4, -1.8);
    scene.add(emberLight, steelLight);

    const group = new THREE.Group();
    scene.add(group);
    const tickObject = kind === 'rings' ? buildRings(group) : kind === 'disco' ? buildDisco(group) : buildTable(group);
    const tickSparkles = buildSparkles(scene, kind);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
    io.observe(el);

    const clock = new THREE.Clock();
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) { clock.getDelta(); return; }
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      group.rotation.y += dt * (kind === 'table' ? 0.25 : 0.35);
      group.position.y += Math.sin(t * 1.2) * 0.0008;
      emberLight.position.x = Math.cos(t * 0.6) * 2.8;
      emberLight.position.z = Math.sin(t * 0.6) * 2.8;
      tickObject(t);
      tickSparkles(t, dt);
      renderer.render(scene, camera);
    };
    if (reduced) {
      group.rotation.y = 0.6;
      tickObject(0);
      renderer.render(scene, camera);
    } else frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
      });
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [kind]);

  return <div className="hero3d" ref={ref} aria-hidden="true" />;
}
