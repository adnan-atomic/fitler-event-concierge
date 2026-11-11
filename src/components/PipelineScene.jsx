// Live 3D view of the pipeline: a miniature of Fitler Club's event spaces, with each
// event shown as a glowing orb that arcs into its suggested space (colour = stage).
// Loaded lazily; pauses off-screen; static for reduced-motion users.
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

const ROOMS = [
  { id: 'hall', name: 'Main Event Hall', x: -1.2, z: -0.75, w: 2.2, d: 1.45, h: 0.62 },
  { id: 'gallery', name: 'Gallery', x: 0.78, z: -0.9, w: 1.3, d: 1.15, h: 0.36 },
  { id: 'boardroom', name: 'Boardroom', x: 1.98, z: -0.9, w: 0.75, d: 1.15, h: 0.3 },
  { id: 'screening', name: 'Screening Room', x: -1.75, z: 0.88, w: 1.1, d: 1.0, h: 0.5 },
  { id: 'pdr', name: 'Private Dining', x: -0.33, z: 0.88, w: 1.25, d: 1.0, h: 0.42 },
  { id: 'lounge', name: 'Lounge & Bar', x: 1.38, z: 0.88, w: 1.75, d: 1.0, h: 0.34 },
];

const STAGE_COLOR = {
  inquiry: 0xEE8434, replied: 0xEE8434,
  concierge_sent: 0x7AAED6, intake_complete: 0x7AAED6, in_review: 0x7AAED6,
  guide_shared: 0x5FC49A,
};

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default function PipelineScene({ events = [] }) {
  const ref = useRef(null);
  const key = events.map((e) => `${e.id}:${e.status}:${e.space || ''}`).join('|');

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      return undefined;
    }
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.className = 'scene-labels';
    el.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 4.6, 6.3);
    camera.lookAt(0, 0.1, 0);
    scene.add(new THREE.HemisphereLight(0xE4ECF3, 0x06121E, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(3, 6, 4);
    scene.add(key);
    const emberLight = new THREE.PointLight(0xEE8434, 14, 10);
    emberLight.position.set(-3, 2, 2);
    scene.add(emberLight);

    const world = new THREE.Group();
    scene.add(world);

    // Platform with an ember outline and a faint grid.
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 3.7), new THREE.MeshStandardMaterial({ color: 0x0F2030, roughness: 0.6, metalness: 0.2 }));
    base.position.y = -0.06;
    world.add(base);
    const baseEdge = new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry), new THREE.LineBasicMaterial({ color: 0xEE8434, transparent: true, opacity: 0.55 }));
    baseEdge.position.copy(base.position);
    world.add(baseEdge);
    const grid = new THREE.GridHelper(5.2, 26, 0x2C4761, 0x1E3347);
    grid.position.y = 0.002;
    grid.scale.z = 3.5 / 5.2;
    world.add(grid);

    // Rooms: translucent glass blocks with glowing edges and a lit roof.
    const rooms = {};
    for (const r of ROOMS) {
      const geo = new THREE.BoxGeometry(r.w - 0.12, r.h, r.d - 0.12);
      const box = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x1B4A73, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55, clearcoat: 0.6 }));
      box.position.set(r.x, r.h / 2, r.z);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x7AAED6, transparent: true, opacity: 0.75 }));
      edges.position.copy(box.position);
      const roofMat = new THREE.MeshBasicMaterial({ color: 0x7AAED6, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 0.14, r.d - 0.14), roofMat);
      roof.rotation.x = -Math.PI / 2;
      roof.position.set(r.x, r.h + 0.004, r.z);
      world.add(box, edges, roof);
      const div = document.createElement('div');
      div.className = 'room-label';
      div.textContent = r.name;
      const label = new CSS2DObject(div);
      label.position.set(r.x, r.h + 0.22, r.z);
      world.add(label);
      // Light beam that flares when an event lands in the room.
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xEE8434, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.22, 1.1, 20, 1, true), beamMat);
      beam.position.set(r.x, r.h + 0.55, r.z);
      world.add(beam);
      rooms[r.id] = { ...r, roofMat, beamMat, edgeMat: edges.material, pulse: 0 };
    }

    // One orb per event (or a few ambient ones when the pipeline is empty).
    const glow = glowTexture();
    const real = events.slice(0, 14);
    const stages = ['inquiry', 'concierge_sent', 'guide_shared'];
    const ambient = Array.from({ length: Math.max(0, 9 - real.length) }, (_, i) => ({ id: `a${i}`, status: stages[i % 3], space: ROOMS[(i * 2 + 1) % ROOMS.length].id, ambient: true }));
    const list = [...real, ...ambient];
    const orbs = list.map((ev, i) => {
      const color = new THREE.Color(STAGE_COLOR[ev.status] || 0xEE8434);
      const core = new THREE.Mesh(new THREE.SphereGeometry(ev.ambient ? 0.05 : 0.075, 16, 16), new THREE.MeshBasicMaterial({ color }));
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.scale.setScalar(ev.ambient ? 0.42 : 0.62);
      core.add(halo);
      const trailN = 18;
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(trailN * 3), 3));
      const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending }));
      world.add(core, trail);
      const room = rooms[ev.space] || rooms[ROOMS[i % ROOMS.length].id];
      return { core, halo, trail, trailN, history: [], room, home: room, ambient: !!ev.ambient, color, phase: i / list.length + Math.random() * 0.12, curve: null, cycle: -1 };
    });

    const newCurve = (o) => {
      if (o.ambient) o.room = rooms[ROOMS[Math.floor(Math.random() * ROOMS.length)].id];
      const a = Math.random() * Math.PI * 2;
      const start = new THREE.Vector3(Math.cos(a) * 3.6, 1.0 + Math.random() * 0.6, Math.sin(a) * 2.6);
      const end = new THREE.Vector3(o.room.x, o.room.h + 0.07, o.room.z);
      const mid = start.clone().lerp(end, 0.5);
      mid.y = 1.8 + Math.random() * 0.45;
      o.curve = new THREE.QuadraticBezierCurve3(start, mid, end);
      o.history = [];
    };

    // Ambient dust.
    const dustN = 140;
    const dustPos = new Float32Array(dustN * 3);
    for (let i = 0; i < dustN; i++) dustPos.set([(Math.random() - 0.5) * 8, Math.random() * 3.2, (Math.random() - 0.5) * 6], i * 3);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.035, color: 0xC3D3E0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(dust);

    const resize = () => {
      const w = el.clientWidth || 1;
      const h = el.clientHeight || 1;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      labels.setSize(w, h);
      camera.aspect = w / h;
      camera.position.z = w / h < 1.1 ? 8.6 : 6.3;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(el);

    const CYCLE = 4.2; // seconds per orb journey (flight + rest)
    const FLIGHT = 0.62; // fraction of the cycle spent flying
    const clock = new THREE.Clock();
    let raf = 0;
    const step = (t, dt) => {
      world.rotation.y = Math.sin(t * 0.18) * 0.32;
      emberLight.position.x = Math.cos(t * 0.5) * 3;
      for (const o of orbs) {
        const local = t / CYCLE + o.phase;
        const cycle = Math.floor(local);
        const u = local - cycle;
        if (cycle !== o.cycle) { o.cycle = cycle; newCurve(o); }
        if (u < FLIGHT) {
          const p = o.curve.getPoint(THREE.MathUtils.smootherstep(u / FLIGHT, 0, 1));
          o.core.position.copy(p);
          o.core.visible = true;
          o.halo.material.opacity = 1;
          o.history.unshift(p.clone());
          if (o.history.length > o.trailN) o.history.pop();
          if (u / FLIGHT > 0.97 && o.room.pulse < 0.9) { o.room.pulse = 1; o.room.roofMat.color.copy(o.color); o.room.beamMat.color.copy(o.color); }
        } else {
          const fade = 1 - (u - FLIGHT) / (1 - FLIGHT);
          o.halo.material.opacity = Math.max(0, fade * 0.8);
          o.core.visible = fade > 0.15;
          o.history.shift();
        }
        const arr = o.trail.geometry.attributes.position.array;
        for (let i = 0; i < o.trailN; i++) {
          const p = o.history[Math.min(i, o.history.length - 1)] || o.core.position;
          arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
        }
        o.trail.geometry.attributes.position.needsUpdate = true;
        o.trail.visible = o.history.length > 1;
      }
      for (const r of Object.values(rooms)) {
        r.pulse = Math.max(0, r.pulse - dt * 0.9);
        r.roofMat.opacity = 0.08 + r.pulse * 0.6;
        r.beamMat.opacity = r.pulse * r.pulse * 0.32;
        r.edgeMat.opacity = 0.6 + r.pulse * 0.4;
      }
      dust.rotation.y = t * 0.02;
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!visible) { clock.getDelta(); return; }
      const dt = Math.min(clock.getDelta(), 0.05);
      step(clock.elapsedTime, dt);
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    if (reduced) {
      step(CYCLE * 0.4, 0.016);
      renderer.render(scene, camera);
      labels.render(scene, camera);
    } else frame();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m?.dispose?.());
      });
      glow.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    };
  }, [key]);

  return <div className="pipeline3d" ref={ref} aria-hidden="true" />;
}
