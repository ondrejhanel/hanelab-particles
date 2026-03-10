import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const PARTICLE_COUNT = 5000;
const MOBILE_BREAKPOINT = 768;

const container = document.getElementById("app");
if (!container) {
  throw new Error("Missing #app container");
}

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
camera.position.z = 10;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(1, 1, false);
renderer.setClearColor(0x000000, 1);
container.appendChild(renderer.domElement);

const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(PARTICLE_COUNT * 3);
const targets = new Float32Array(PARTICLE_COUNT * 3);
const baseTargets = new Float32Array(PARTICLE_COUNT * 3);
const seeds = new Float32Array(PARTICLE_COUNT);
const depthSeeds = new Float32Array(PARTICLE_COUNT);

for (let i = 0; i < PARTICLE_COUNT; i++) {
  const o = i * 3;
  positions[o] = (Math.random() - 0.5) * 420;
  positions[o + 1] = (Math.random() - 0.5) * 220;
  positions[o + 2] = (Math.random() - 0.5) * 8;
  seeds[i] = Math.random() * Math.PI * 2;
  depthSeeds[i] = Math.random() * 2 - 1;
}

geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

const material = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 2.0,
  sizeAttenuation: false
});

const points = new THREE.Points(geometry, material);
points.frustumCulled = false;
scene.add(points);

function seededShuffle(indices) {
  let s = 123456789;
  const rand = () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967295;
  };
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = indices[i];
    indices[i] = indices[j];
    indices[j] = t;
  }
}

function buildCanonicalCloud(lines) {
  const canvas = document.createElement("canvas");
  canvas.width = lines.length > 1 ? 1200 : 1800;
  canvas.height = lines.length > 1 ? 760 : 420;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    return {
      anchors: new Float32Array(PARTICLE_COUNT * 2),
      bounds: { minX: -0.5, maxX: 0.5, minY: -0.2, maxY: 0.2 }
    };
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  let fontSize = lines.length > 1 ? 280 : 260;
  const maxWidth = canvas.width * 0.88;
  const maxHeight = canvas.height * (lines.length > 1 ? 0.72 : 0.4);

  for (; fontSize > 30; fontSize -= 2) {
    ctx.font = `700 ${fontSize}px Arial`;
    const lineHeight = Math.floor(fontSize * 1.08);
    const blockHeight = lineHeight * lines.length;
    let widest = 0;
    for (const line of lines) {
      widest = Math.max(widest, ctx.measureText(line).width);
    }
    if (widest <= maxWidth && blockHeight <= maxHeight) {
      break;
    }
  }

  ctx.font = `700 ${fontSize}px Arial`;
  const lineHeight = Math.floor(fontSize * 1.08);
  const blockHeight = lineHeight * lines.length;
  const startY = canvas.height / 2 - (blockHeight - lineHeight) / 2;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], canvas.width / 2, startY + i * lineHeight);
  }

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const candidates = [];
  const step = 2;

  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const idx = (y * canvas.width + x) * 4;
      const a = data[idx + 3];
      if (a < 16) continue;
      candidates.push({
        // Keep both axes in the same unit (pixels) so responsive scaling
        // preserves glyph aspect ratio across viewports.
        x: x - canvas.width * 0.5,
        y: canvas.height * 0.5 - y
      });
    }
  }

  if (candidates.length === 0) {
    candidates.push({ x: 0, y: 0 });
  }

  const order = Array.from({ length: candidates.length }, (_, i) => i);
  seededShuffle(order);

  const anchors = new Float32Array(PARTICLE_COUNT * 2);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const idx = order[i % order.length];
    const p = candidates[idx];
    anchors[i * 2] = p.x;
    anchors[i * 2 + 1] = p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  return { anchors, bounds: { minX, maxX, minY, maxY } };
}

const clouds = {
  desktop: buildCanonicalCloud(["HELLO WORLD"]),
  mobile: buildCanonicalCloud(["HELLO", "WORLD"])
};

let isMobileLayout = false;
let hasInitializedLayout = false;
let repulseRadiusSq = 6400;

function applyLayoutTargets(width, height) {
  const cloud = isMobileLayout ? clouds.mobile : clouds.desktop;
  const { minX, maxX, minY, maxY } = cloud.bounds;
  const cloudW = Math.max(0.0001, maxX - minX);
  const cloudH = Math.max(0.0001, maxY - minY);
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;

  const targetWidth = width * (isMobileLayout ? 0.84 : 0.88);
  const targetHeight = height * (isMobileLayout ? 0.50 : 0.28);
  const scale = Math.min(targetWidth / cloudW, targetHeight / cloudH);
  const zScale = isMobileLayout ? 4.2 : 6.2;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const o = i * 3;
    const ax = cloud.anchors[i * 2];
    const ay = cloud.anchors[i * 2 + 1];
    baseTargets[o] = (ax - centerX) * scale;
    baseTargets[o + 1] = (ay - centerY) * scale;
    baseTargets[o + 2] = depthSeeds[i] * zScale;
  }
}

function updateViewport() {
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || window.innerWidth));
  const height = Math.max(1, Math.floor(rect.height || window.innerHeight));

  isMobileLayout = width < MOBILE_BREAKPOINT;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);

  camera.left = -width / 2;
  camera.right = width / 2;
  camera.top = height / 2;
  camera.bottom = -height / 2;
  camera.updateProjectionMatrix();

  material.size = isMobileLayout ? 2.1 : 1.8;
  applyLayoutTargets(width, height);

  if (!hasInitializedLayout) {
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o = i * 3;
      positions[o] = baseTargets[o] + (Math.random() - 0.5) * width * 0.12;
      positions[o + 1] = baseTargets[o + 1] + (Math.random() - 0.5) * height * 0.08;
      positions[o + 2] = baseTargets[o + 2] + (Math.random() - 0.5) * 1.5;
    }
    geometry.attributes.position.needsUpdate = true;
    hasInitializedLayout = true;
  }

  const repulseRadius = Math.min(width, height) * (isMobileLayout ? 0.17 : 0.12);
  repulseRadiusSq = repulseRadius * repulseRadius;
}

const pointer = { active: false, x: 0, y: 0 };

renderer.domElement.addEventListener("pointermove", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.active = true;
  pointer.x = event.clientX - rect.left - rect.width / 2;
  pointer.y = rect.height / 2 - (event.clientY - rect.top);
});

renderer.domElement.addEventListener("pointerleave", () => {
  pointer.active = false;
});

let resizeRaf = 0;
function scheduleViewportUpdate() {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(updateViewport);
}

window.addEventListener("resize", scheduleViewportUpdate);
window.addEventListener("orientationchange", scheduleViewportUpdate);
if (typeof ResizeObserver !== "undefined") {
  const ro = new ResizeObserver(scheduleViewportUpdate);
  ro.observe(container);
}

updateViewport();
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(scheduleViewportUpdate).catch(() => {});
}

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  const arr = geometry.attributes.position.array;
  const jitter = isMobileLayout ? 0.22 : 0.26;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const o = i * 3;
    const seed = seeds[i];

    targets[o] = baseTargets[o] + Math.sin(t * 0.85 + seed) * jitter;
    targets[o + 1] = baseTargets[o + 1] + Math.cos(t * 0.95 + seed * 1.3) * jitter;
    targets[o + 2] = baseTargets[o + 2] + Math.sin(t * 1.1 + seed * 0.7) * 0.2;

    if (pointer.active) {
      const dx = arr[o] - pointer.x;
      const dy = arr[o + 1] - pointer.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < repulseRadiusSq) {
        const strength = (repulseRadiusSq - d2) / repulseRadiusSq;
        targets[o] += dx * strength * 0.2;
        targets[o + 1] += dy * strength * 0.2;
      }
    }

    arr[o] += (targets[o] - arr[o]) * 0.1;
    arr[o + 1] += (targets[o + 1] - arr[o + 1]) * 0.1;
    arr[o + 2] += (targets[o + 2] - arr[o + 2]) * 0.1;
  }

  geometry.attributes.position.needsUpdate = true;
  renderer.render(scene, camera);
}

animate();
