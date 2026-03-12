import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const GPUIO_API = globalThis.GPUIO;
if (!GPUIO_API) throw new Error("Missing GPUIO global");
const {
  GPUComposer,
  GPUProgram,
  GPULayer,
  FLOAT,
  INT,
  LINEAR,
  NEAREST,
  CLAMP_TO_EDGE
} = GPUIO_API;

const FONT_URL = "./_Assets/Monoton-Regular.ttf";
const WORDMARK = "hanelab";
const LETTER_COUNT = WORDMARK.length;
const MOBILE_BREAKPOINT = 768;
const TEAL = new THREE.Color(0x29e3c6);
const TEAL_SOFT = new THREE.Color(0xa8fff2);
const BG_COLOR = 0x020707;
const REFERENCE_AREA = 1440 * 900;
const BASE_PARTICLES = 3000;
const MIN_PARTICLES = 1600;
const MAX_PARTICLES = 100000;
const WORDMARK_DISPLAY_SCALE = 0.4;
const WORDMARK_DEPTH_OFFSET = -18;
const COUNT_STEP = 100;
const FLUID_COLS = 72;
const FLUID_ROWS = 40;
const FLUID_CELL_COUNT = FLUID_COLS * FLUID_ROWS;
const TUNING_STORAGE_KEY = "hanelab-motion-tuning";
const FRICTION_MIN = 0.001;
const FRICTION_MAX = 1;
const LEGACY_RADIUS_MIN = 1.31;
const LEGACY_RADIUS_MAX = 3;
const RADIUS_MIN = 0.01;
const RADIUS_MAX = 1;
const PARTICLE_COUNT_MIN = MIN_PARTICLES;
const PARTICLE_COUNT_MAX = MAX_PARTICLES;
const PARTICLE_SIZE_MIN = 0.5;
const PARTICLE_SIZE_MAX = 2.5;
const PARTICLE_SIZE_RANDOMNESS_MIN = 0;
const PARTICLE_SIZE_RANDOMNESS_MAX = 1;
const CURSOR_SPHERE_COLOR = 0x7afcf2;
const TEXT_COLLIDER_MARGIN = 10;
const TEXT_COLLIDER_FORCE = 0.24;
const TEXT_COLLIDER_DAMP = 0.12;
const EDGE_REPEL_START = 0.78;
const EDGE_REPEL_FORCE = 0.34;
const EDGE_REPEL_DAMP = 0.08;
const EDGE_REPEL_JITTER = 0.32;
const CORNER_REPEL_START = 0.7;
const CORNER_REPEL_FORCE = 0.5;
const CORNER_REPEL_DAMP = 0.12;
const CORNER_REPEL_JITTER = 0.4;
const PARTICLE_HIT_COOLDOWN = 0.22;
const PARTICLE_HIT_FLASH = 4.8;
const PARTICLE_HIT_FLASH_EXTRA = 1.6;
const PARTICLE_GLOW_BASE = 0.62;
const PARTICLE_GLOW_WAKE = 0.34;
const PARTICLE_GLOW_SPEED = 0.016;
const PARTICLE_HIT_FADE_TIME = 1.7;
const PARTICLE_COLOR_FADE_TIME = 3.8;
const PARTICLE_INTENSITY_MAX = 4.6;
const PARTICLE_GLOW_BOOST_MAX = 3.4;
const PARTICLE_COLOR_CHANNEL_MAX = 1.14;
const FLUID_IMPULSE_STRENGTH = 0.22;
const FLUID_COUPLING_BASE = 0.06;
const FLUID_COUPLING_WAKE = 0.2;
const FLUID_RELAX_BASE = 0.014;
const FLUID_RELAX_WAKE = 0.05;
const FLUID_JACOBI_STEPS = 4;
const FLUID_MAX_VELOCITY = 36;
const FLUID_SAMPLE_SCALE = 0.22;
const FLUID_MIN_IMPULSE_PX = 12;

const container = document.getElementById("app");
if (!container) throw new Error("Missing #app container");
const frictionInput = document.getElementById("tuning-friction");
const frictionNumberInput = document.getElementById("tuning-friction-number");
const radiusInput = document.getElementById("tuning-radius");
const radiusNumberInput = document.getElementById("tuning-radius-number");
const particleCountInput = document.getElementById("tuning-particle-count");
const particleCountNumberInput = document.getElementById("tuning-particle-count-number");
const particleSizeInput = document.getElementById("tuning-particle-size");
const particleSizeNumberInput = document.getElementById("tuning-particle-size-number");
const particleSizeRandomnessInput = document.getElementById("tuning-particle-size-randomness");
const particleSizeRandomnessNumberInput = document.getElementById("tuning-particle-size-randomness-number");
const motionTuning = loadMotionTuning();

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG_COLOR);
scene.fog = new THREE.FogExp2(0x041111, 0.0017);

const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 4000);
camera.position.set(0, 0, 620);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: "high-performance"
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.96;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(1, 1, false);
container.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.63, 0.4, 0.18);
composer.addPass(renderPass);
composer.addPass(bloomPass);

const logoRig = new THREE.Group();
scene.add(logoRig);
const cursorSphere = createCursorSphere();
logoRig.add(cursorSphere);

const backgroundHalo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: createRadialTexture(256, "rgba(41, 227, 198, 0.7)", "rgba(41, 227, 198, 0)"),
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0.12
  })
);
backgroundHalo.position.set(0, 0, -120);
logoRig.add(backgroundHalo);

const ambientLight = new THREE.AmbientLight(0x4fd8c8, 0.32);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xbffff7, 0.8);
keyLight.position.set(-0.8, 1.2, 1.8);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x3effd4, 10, 1200, 1.8);
rimLight.position.set(0, 0, 220);
scene.add(rimLight);

let textMesh = null;
let textGeometry = null;
let textVisualGroup = null;
let letterEntries = [];
let letterColliders = [];
let particleSystem = null;
let particleMaterial = null;
let particleCount = 0;
let particleTargetCount = 0;
let particlePositions = new Float32Array(0);
let particleVelocities = new Float32Array(0);
let particleColors = new Float32Array(0);
let particleSeeds = new Float32Array(0);
let particleTurbulence = new Float32Array(0);
let particleMass = new Float32Array(0);
let particleColorMix = new Float32Array(0);
let particleWake = new Float32Array(0);
let particleHitCooldown = new Float32Array(0);
let particleSizeVariance = new Float32Array(0);
let particleAssignedColors = new Float32Array(0);
let particleAssignedIntensity = new Float32Array(0);
let particleAssignedLetter = new Int16Array(0);
let particleSpin = new Float32Array(0);
let fluidVelocityX = new Float32Array(FLUID_CELL_COUNT);
let fluidVelocityY = new Float32Array(FLUID_CELL_COUNT);
let fluidVelocityNextX = new Float32Array(FLUID_CELL_COUNT);
let fluidVelocityNextY = new Float32Array(FLUID_CELL_COUNT);
let fluidPressure = new Float32Array(FLUID_CELL_COUNT);
let fluidPressureNext = new Float32Array(FLUID_CELL_COUNT);
let fluidDivergence = new Float32Array(FLUID_CELL_COUNT);
let gpuFluid = null;
let positionAttr = null;
let colorAttr = null;
let sizeVarianceAttr = null;
let isMobileLayout = false;
let logoBounds = new THREE.Vector3(420, 180, 70);
let particleField = new THREE.Vector3(520, 220, 360);
let viewportBounds = new THREE.Vector2(520, 220);
let textReady = false;
let pulseTime = 0;

const particleSprite = createParticleSpriteTexture(64);
const raycaster = new THREE.Raycaster();
const pointerPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const pointerWorldHit = new THREE.Vector3();
const inverseLogoMatrix = new THREE.Matrix4();
const pointer = {
  active: false,
  ready: false,
  ndc: new THREE.Vector2(),
  ndcSmooth: new THREE.Vector2(),
  local: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  screen: new THREE.Vector2(),
  rayOriginLocal: new THREE.Vector3(),
  rayDirLocal: new THREE.Vector3(0, 0, -1),
  speed: 0
};
const pendingFluidImpulses = [];

const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpV4 = new THREE.Vector3();
const tmpFlowA = new THREE.Vector2();
const tmpFlowB = new THREE.Vector2();
const tmpFlowC = new THREE.Vector2();
const tmpBoundaryForce = new THREE.Vector3();
const box = new THREE.Box3();
const clock = new THREE.Clock();
const cycleBaseColor = new THREE.Color();
const cycleInnerColor = new THREE.Color();
const wordmarkColliderMin = new THREE.Vector3();
const wordmarkColliderMax = new THREE.Vector3();
const letterPalette = Array.from({ length: LETTER_COUNT }, () => new THREE.Color());
const letterAccentPalette = Array.from({ length: LETTER_COUNT }, () => new THREE.Color());
cycleBaseColor.copy(TEAL);
cycleInnerColor.copy(TEAL_SOFT);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hash(value) {
  const x = Math.sin(value * 127.1) * 43758.5453123;
  return x - Math.floor(x);
}

function randomSpread(range) {
  return (Math.random() - 0.5) * range;
}

function normalizedBoundaryProximity(value, bound, start) {
  return clamp((Math.abs(value) / Math.max(bound, 1) - start) / (1 - start), 0, 1);
}

function applyEdgeCornerRepulsion(px, py, pz, velocity, boundX, boundY, boundZ, seed, time, frame) {
  const signX = px < 0 ? -1 : 1;
  const signY = py < 0 ? -1 : 1;
  const signZ = pz < 0 ? -1 : 1;
  const nearX = normalizedBoundaryProximity(px, boundX, EDGE_REPEL_START);
  const nearY = normalizedBoundaryProximity(py, boundY, EDGE_REPEL_START);
  const nearZ = normalizedBoundaryProximity(pz, boundZ, EDGE_REPEL_START);
  const cornerX = normalizedBoundaryProximity(px, boundX, CORNER_REPEL_START);
  const cornerY = normalizedBoundaryProximity(py, boundY, CORNER_REPEL_START);
  const cornerZ = normalizedBoundaryProximity(pz, boundZ, CORNER_REPEL_START);

  let dampX = 1;
  let dampY = 1;
  let dampZ = 1;
  tmpBoundaryForce.set(0, 0, 0);

  const edgeXY = nearX * nearY;
  if (edgeXY > 0) {
    const force = EDGE_REPEL_FORCE * edgeXY * edgeXY * frame;
    const burst = Math.sin(seed * 17.3 + time * 4.6) * EDGE_REPEL_JITTER * edgeXY * frame;
    tmpBoundaryForce.x -= signX * force;
    tmpBoundaryForce.y -= signY * force;
    tmpBoundaryForce.z += burst;
    dampX -= edgeXY * EDGE_REPEL_DAMP;
    dampY -= edgeXY * EDGE_REPEL_DAMP;
  }

  const edgeXZ = nearX * nearZ;
  if (edgeXZ > 0) {
    const force = EDGE_REPEL_FORCE * edgeXZ * edgeXZ * frame;
    const burst = Math.sin(seed * 19.7 - time * 4.2) * EDGE_REPEL_JITTER * edgeXZ * frame;
    tmpBoundaryForce.x -= signX * force;
    tmpBoundaryForce.z -= signZ * force;
    tmpBoundaryForce.y += burst;
    dampX -= edgeXZ * EDGE_REPEL_DAMP;
    dampZ -= edgeXZ * EDGE_REPEL_DAMP;
  }

  const edgeYZ = nearY * nearZ;
  if (edgeYZ > 0) {
    const force = EDGE_REPEL_FORCE * edgeYZ * edgeYZ * frame;
    const burst = Math.sin(seed * 23.1 + time * 4.9) * EDGE_REPEL_JITTER * edgeYZ * frame;
    tmpBoundaryForce.y -= signY * force;
    tmpBoundaryForce.z -= signZ * force;
    tmpBoundaryForce.x += burst;
    dampY -= edgeYZ * EDGE_REPEL_DAMP;
    dampZ -= edgeYZ * EDGE_REPEL_DAMP;
  }

  const corner = cornerX * cornerY * cornerZ;
  if (corner > 0) {
    const force = CORNER_REPEL_FORCE * corner * corner * frame;
    const jitter = CORNER_REPEL_JITTER * corner * frame;
    tmpBoundaryForce.x -= signX * force;
    tmpBoundaryForce.y -= signY * force;
    tmpBoundaryForce.z -= signZ * force;
    tmpBoundaryForce.x += Math.sin(seed * 29.9 + time * 5.1) * jitter;
    tmpBoundaryForce.y += Math.cos(seed * 31.7 - time * 4.7) * jitter;
    tmpBoundaryForce.z += Math.sin(seed * 37.1 + time * 5.7) * jitter;
    dampX -= corner * CORNER_REPEL_DAMP;
    dampY -= corner * CORNER_REPEL_DAMP;
    dampZ -= corner * CORNER_REPEL_DAMP;
  }

  velocity.x = velocity.x * clamp(dampX, 0.72, 1) + tmpBoundaryForce.x;
  velocity.y = velocity.y * clamp(dampY, 0.72, 1) + tmpBoundaryForce.y;
  velocity.z = velocity.z * clamp(dampZ, 0.72, 1) + tmpBoundaryForce.z;
}

function applyWordmarkRepulsion(px, py, pz, velocity, frame) {
  if (letterColliders.length === 0) return false;
  if (
    px < wordmarkColliderMin.x - TEXT_COLLIDER_MARGIN ||
    px > wordmarkColliderMax.x + TEXT_COLLIDER_MARGIN ||
    py < wordmarkColliderMin.y - TEXT_COLLIDER_MARGIN ||
    py > wordmarkColliderMax.y + TEXT_COLLIDER_MARGIN ||
    pz < wordmarkColliderMin.z - TEXT_COLLIDER_MARGIN ||
    pz > wordmarkColliderMax.z + TEXT_COLLIDER_MARGIN
  ) {
    return false;
  }

  let touched = false;

  for (let i = 0; i < letterColliders.length; i++) {
    const collider = letterColliders[i];
    const dx = px - collider.centerX;
    const dy = py - collider.centerY;
    const dz = pz - collider.centerZ;
    const qx = Math.abs(dx) - collider.halfX;
    const qy = Math.abs(dy) - collider.halfY;
    const qz = Math.abs(dz) - collider.halfZ;
    const ox = Math.max(qx, 0);
    const oy = Math.max(qy, 0);
    const oz = Math.max(qz, 0);
    const outsideSq = ox * ox + oy * oy + oz * oz;
    const insideMax = Math.max(qx, Math.max(qy, qz));
    const signedDist = Math.sqrt(outsideSq) + Math.min(insideMax, 0);

    if (signedDist >= TEXT_COLLIDER_MARGIN) continue;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (outsideSq > 0.000001) {
      const outsideDist = Math.sqrt(outsideSq);
      nx = (dx < 0 ? -1 : 1) * ox / outsideDist;
      ny = (dy < 0 ? -1 : 1) * oy / outsideDist;
      nz = (dz < 0 ? -1 : 1) * oz / outsideDist;
    } else if (qx > qy && qx > qz) {
      nx = dx < 0 ? -1 : 1;
    } else if (qy > qz) {
      ny = dy < 0 ? -1 : 1;
    } else {
      nz = dz < 0 ? -1 : 1;
    }

    const surfaceNormalSpeed = velocity.x * nx + velocity.y * ny + velocity.z * nz;

    if (signedDist < 0) {
      const penetration = clamp(-signedDist / TEXT_COLLIDER_MARGIN, 0, 1);
      const force = (TEXT_COLLIDER_FORCE + penetration * 0.14) * frame;
      const inward = Math.max(-surfaceNormalSpeed, 0);
      const damp = clamp(1 - penetration * TEXT_COLLIDER_DAMP, 0.86, 1);
      velocity.x = velocity.x * (nx !== 0 ? damp : 1) + nx * (force + inward * 0.18);
      velocity.y = velocity.y * (ny !== 0 ? damp : 1) + ny * (force + inward * 0.18);
      velocity.z = velocity.z * (nz !== 0 ? damp : 1) + nz * (force + inward * 0.18);
      touched = true;
      continue;
    }

    if (surfaceNormalSpeed >= 0) continue;

    const falloff = 1 - clamp(signedDist / TEXT_COLLIDER_MARGIN, 0, 1);
    const redirect = Math.min(-surfaceNormalSpeed, 0.22) * falloff * (0.42 + TEXT_COLLIDER_DAMP);
    velocity.x += nx * redirect;
    velocity.y += ny * redirect;
    velocity.z += nz * redirect;
    touched = true;
  }

  return touched;
}

function normalizeParticleCount(value) {
  const snapped = Math.round(value / COUNT_STEP) * COUNT_STEP;
  return clamp(snapped, PARTICLE_COUNT_MIN, PARTICLE_COUNT_MAX);
}

function normalizeParticleSize(value) {
  return clamp(value, PARTICLE_SIZE_MIN, PARTICLE_SIZE_MAX);
}

function normalizeParticleSizeRandomness(value) {
  return clamp(value, PARTICLE_SIZE_RANDOMNESS_MIN, PARTICLE_SIZE_RANDOMNESS_MAX);
}

function getBaseParticleSize() {
  return isMobileLayout ? 12.8 : 9.8;
}

function getEffectiveFriction() {
  return clamp(
    motionTuning.friction * (0.5 + motionTuning.friction * 0.5),
    FRICTION_MIN * 0.5,
    FRICTION_MAX
  );
}

function updateParticleMaterialTuning() {
  if (!particleMaterial) return;
  particleMaterial.size = getBaseParticleSize();
  const sizeUniforms = particleMaterial.userData.sizeUniforms;
  if (!sizeUniforms) return;
  sizeUniforms.uParticleSizeScale.value = motionTuning.particleSize;
  sizeUniforms.uParticleSizeRandomness.value = motionTuning.particleSizeRandomness;
}

function getMaxCursorRadius() {
  return Math.max(0, Math.min(viewportBounds.x, viewportBounds.y, particleField.z) - 2);
}

function loadMotionTuning() {
  const defaults = {
    friction: 0.5,
    radius: 0.2,
    particleCount: null,
    particleSize: 1,
    particleSizeRandomness: 0.35
  };
  try {
    const raw = window.localStorage.getItem(TUNING_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const parsedFriction = Number(parsed.friction);
    const parsedRadius = Number(parsed.radius);
    const parsedParticleCount = parsed.particleCount == null ? null : Number(parsed.particleCount);
    const parsedParticleSize = Number(parsed.particleSize);
    const parsedParticleSizeRandomness = Number(parsed.particleSizeRandomness);
    const normalizedRadius = Number.isFinite(parsedRadius)
      ? parsedRadius > 1
        ? (parsedRadius - LEGACY_RADIUS_MIN) / Math.max(LEGACY_RADIUS_MAX - LEGACY_RADIUS_MIN, 0.001)
        : parsedRadius
      : NaN;
    return {
      friction: Number.isFinite(parsedFriction)
        ? clamp(parsedFriction, FRICTION_MIN, FRICTION_MAX)
        : defaults.friction,
      radius: Number.isFinite(normalizedRadius)
        ? clamp(normalizedRadius < RADIUS_MIN ? defaults.radius : normalizedRadius, RADIUS_MIN, RADIUS_MAX)
        : defaults.radius,
      particleCount: parsedParticleCount != null && Number.isFinite(parsedParticleCount)
        ? normalizeParticleCount(parsedParticleCount)
        : defaults.particleCount,
      particleSize: Number.isFinite(parsedParticleSize)
        ? normalizeParticleSize(parsedParticleSize)
        : defaults.particleSize,
      particleSizeRandomness: Number.isFinite(parsedParticleSizeRandomness)
        ? normalizeParticleSizeRandomness(parsedParticleSizeRandomness)
        : defaults.particleSizeRandomness
    };
  } catch {
    return defaults;
  }
}

function saveMotionTuning() {
  try {
    window.localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify(motionTuning));
  } catch {
    // Ignore storage failures; runtime tuning still works for the session.
  }
}

function syncTuningPanel() {
  const displayParticleCount = motionTuning.particleCount ?? (particleTargetCount || particleCount || BASE_PARTICLES);
  if (frictionInput) frictionInput.value = motionTuning.friction.toFixed(3);
  if (frictionNumberInput) frictionNumberInput.value = (motionTuning.friction * 100).toFixed(1);
  if (radiusInput) radiusInput.value = motionTuning.radius.toFixed(3);
  if (radiusNumberInput) radiusNumberInput.value = (motionTuning.radius * 100).toFixed(0);
  if (particleCountInput) particleCountInput.value = String(displayParticleCount);
  if (particleCountNumberInput) particleCountNumberInput.value = String(displayParticleCount);
  if (particleSizeInput) particleSizeInput.value = motionTuning.particleSize.toFixed(2);
  if (particleSizeNumberInput) particleSizeNumberInput.value = (motionTuning.particleSize * 100).toFixed(0);
  if (particleSizeRandomnessInput) {
    particleSizeRandomnessInput.value = motionTuning.particleSizeRandomness.toFixed(2);
  }
  if (particleSizeRandomnessNumberInput) {
    particleSizeRandomnessNumberInput.value = (motionTuning.particleSizeRandomness * 100).toFixed(0);
  }
}

function setupTuningPanel() {
  const applyFriction = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuning.friction = clamp(value, FRICTION_MIN, FRICTION_MAX);
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyRadius = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuning.radius = clamp(value, RADIUS_MIN, RADIUS_MAX);
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyParticleCount = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuning.particleCount = normalizeParticleCount(value);
    particleTargetCount = motionTuning.particleCount;
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyParticleSize = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuning.particleSize = normalizeParticleSize(value);
    syncTuningPanel();
    updateParticleMaterialTuning();
    saveMotionTuning();
  };

  const applyParticleSizeRandomness = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuning.particleSizeRandomness = normalizeParticleSizeRandomness(value);
    syncTuningPanel();
    updateParticleMaterialTuning();
    saveMotionTuning();
  };

  syncTuningPanel();

  frictionInput?.addEventListener("input", () => {
    applyFriction(Number(frictionInput.value));
  });

  radiusInput?.addEventListener("input", () => {
    applyRadius(Number(radiusInput.value));
  });

  frictionNumberInput?.addEventListener("input", () => {
    applyFriction(Number(frictionNumberInput.value) / 100);
  });

  frictionNumberInput?.addEventListener("change", () => {
    applyFriction(Number(frictionNumberInput.value) / 100);
  });

  radiusNumberInput?.addEventListener("input", () => {
    applyRadius(Number(radiusNumberInput.value) / 100);
  });

  radiusNumberInput?.addEventListener("change", () => {
    applyRadius(Number(radiusNumberInput.value) / 100);
  });

  particleCountInput?.addEventListener("input", () => {
    applyParticleCount(Number(particleCountInput.value));
  });

  particleCountNumberInput?.addEventListener("input", () => {
    applyParticleCount(Number(particleCountNumberInput.value));
  });

  particleCountNumberInput?.addEventListener("change", () => {
    applyParticleCount(Number(particleCountNumberInput.value));
  });

  particleSizeInput?.addEventListener("input", () => {
    applyParticleSize(Number(particleSizeInput.value));
  });

  particleSizeNumberInput?.addEventListener("input", () => {
    applyParticleSize(Number(particleSizeNumberInput.value) / 100);
  });

  particleSizeNumberInput?.addEventListener("change", () => {
    applyParticleSize(Number(particleSizeNumberInput.value) / 100);
  });

  particleSizeRandomnessInput?.addEventListener("input", () => {
    applyParticleSizeRandomness(Number(particleSizeRandomnessInput.value));
  });

  particleSizeRandomnessNumberInput?.addEventListener("input", () => {
    applyParticleSizeRandomness(Number(particleSizeRandomnessNumberInput.value) / 100);
  });

  particleSizeRandomnessNumberInput?.addEventListener("change", () => {
    applyParticleSizeRandomness(Number(particleSizeRandomnessNumberInput.value) / 100);
  });
}

function createCursorSphere() {
  const sphereGeometry = new THREE.SphereGeometry(1, 18, 14);
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    sphereGeometry,
    new THREE.MeshBasicMaterial({
      color: CURSOR_SPHERE_COLOR,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide
    })
  );
  glow.scale.setScalar(1.04);
  glow.renderOrder = 2;
  group.add(glow);

  const wire = new THREE.LineSegments(
    new THREE.WireframeGeometry(sphereGeometry),
    new THREE.LineBasicMaterial({
      color: CURSOR_SPHERE_COLOR,
      transparent: true,
      opacity: 0.86,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false
    })
  );
  wire.renderOrder = 4;
  group.add(wire);

  group.visible = false;
  return group;
}

function createRadialTexture(sizePx, innerColor, outerColor) {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  const gradient = ctx.createRadialGradient(
    sizePx * 0.5,
    sizePx * 0.5,
    sizePx * 0.06,
    sizePx * 0.5,
    sizePx * 0.5,
    sizePx * 0.5
  );
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.35, innerColor);
  gradient.addColorStop(1, outerColor);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, sizePx, sizePx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createParticleSpriteTexture(sizePx) {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context");

  ctx.clearRect(0, 0, sizePx, sizePx);
  const center = sizePx * 0.5;
  const radius = sizePx * 0.46;

  const shadow = ctx.createRadialGradient(
    center,
    center,
    sizePx * 0.06,
    center,
    center,
    radius
  );
  shadow.addColorStop(0, "rgba(255,255,255,1)");
  shadow.addColorStop(0.2, "rgba(255,255,255,0.98)");
  shadow.addColorStop(0.55, "rgba(255,255,255,0.72)");
  shadow.addColorStop(0.82, "rgba(255,255,255,0.18)");
  shadow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  const highlight = ctx.createRadialGradient(
    center - sizePx * 0.12,
    center - sizePx * 0.14,
    0,
    center - sizePx * 0.12,
    center - sizePx * 0.14,
    sizePx * 0.24
  );
  highlight.addColorStop(0, "rgba(255,255,255,0.92)");
  highlight.addColorStop(0.45, "rgba(255,255,255,0.34)");
  highlight.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = highlight;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function computeParticleCount(width, height) {
  const areaScale = Math.pow((width * height) / REFERENCE_AREA, 0.86);
  const raw = BASE_PARTICLES * areaScale;
  const snapped = Math.round(raw / COUNT_STEP) * COUNT_STEP;
  return clamp(snapped, MIN_PARTICLES, MAX_PARTICLES);
}

function loadFont(url) {
  return new Promise((resolve, reject) => {
    const ttfLoader = new TTFLoader();
    const fontLoader = new FontLoader();
    ttfLoader.load(
      url,
      (json) => resolve(fontLoader.parse(json)),
      undefined,
      (error) => reject(error || new Error(`Failed to load font: ${url}`))
    );
  });
}

function createTextMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uHueOffset: { value: 0 }
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform float uHueOffset;

      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      vec3 hsl2rgb(vec3 hsl) {
        vec3 rgb = clamp(abs(mod(hsl.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
        return (rgb - 0.5) * c + hsl.z;
      }

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 lightDir = normalize(vec3(-0.45, 0.75, 0.55));
        float hue = fract(0.47 + uHueOffset + uTime * 0.018 + sin(uTime * 0.11 + uHueOffset * 6.0) * 0.015);
        float innerHue = fract(hue + 0.045);
        vec3 baseColor = hsl2rgb(vec3(hue, 0.92, 0.52));
        vec3 innerColor = hsl2rgb(vec3(innerHue, 0.96, 0.76));

        float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.35);
        float facing = pow(max(dot(normal, viewDir), 0.0), 1.45);
        float diffuse = max(dot(normal, lightDir), 0.0);
        float scan = sin(vWorldPosition.y * 0.04 + uTime * 1.2) * 0.02;
        float shimmer = sin(vWorldPosition.x * 0.024 - uTime * 0.8) * 0.018;

        vec3 base = mix(baseColor * 0.1, innerColor * 0.8, facing * 0.18);
        vec3 lit = base * (0.34 + diffuse * 0.22 + scan * 0.65 + shimmer * 0.65);
        vec3 glow = baseColor * (0.135 + fresnel * 0.51 + facing * 0.045);
        vec3 highlight = innerColor * (facing * 0.052 + fresnel * 0.026);

        gl_FragColor = vec4(lit + glow + highlight, 0.98);
      }
    `
  });
}

function buildText(font) {
  const letterSpacing = 8;
  const letterDefs = [];
  let totalWidth = 0;

  for (let i = 0; i < WORDMARK.length; i++) {
    const geometry = new TextGeometry(WORDMARK[i], {
      font,
      size: 132,
      depth: 44,
      curveSegments: 18,
      bevelEnabled: true,
      bevelThickness: 10,
      bevelSize: 5,
      bevelOffset: 0,
      bevelSegments: 8
    });

    geometry.computeBoundingBox();
    geometry.computeVertexNormals();
    geometry.rotateX(-0.04);
    geometry.scale(1.03, 1.0, 1.0);
    geometry.computeBoundingBox();

    const bounds = geometry.boundingBox;
    if (!bounds) continue;
    const width = bounds.max.x - bounds.min.x;
    geometry.translate(
      -bounds.min.x,
      -(bounds.min.y + bounds.max.y) * 0.5,
      -(bounds.min.z + bounds.max.z) * 0.5
    );
    geometry.computeBoundingBox();

    letterDefs.push({ geometry, width });
    totalWidth += width;
    if (i < WORDMARK.length - 1) totalWidth += letterSpacing;
  }

  const mergedGeometries = [];
  textVisualGroup = new THREE.Group();
  textVisualGroup.scale.setScalar(WORDMARK_DISPLAY_SCALE);
  textVisualGroup.position.z = WORDMARK_DEPTH_OFFSET;
  letterEntries = [];
  letterColliders = [];
  wordmarkColliderMin.set(Infinity, Infinity, Infinity);
  wordmarkColliderMax.set(-Infinity, -Infinity, -Infinity);

  let cursorX = -totalWidth * 0.5;
  for (let i = 0; i < letterDefs.length; i++) {
    const { geometry, width } = letterDefs[i];
    const hueOffset = i * 0.115;
    const material = createTextMaterial();
    material.uniforms.uHueOffset.value = hueOffset;

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.x = cursorX;
    mesh.renderOrder = 3;
    textVisualGroup.add(mesh);

    const glow = new THREE.Mesh(
      geometry.clone(),
      new THREE.MeshBasicMaterial({
        color: TEAL,
        transparent: true,
        opacity: 0.083,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.BackSide
      })
    );
    glow.position.x = cursorX;
    glow.scale.setScalar(1.028);
    glow.renderOrder = 2;
    textVisualGroup.add(glow);

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 8),
      new THREE.LineBasicMaterial({
        color: TEAL_SOFT,
        transparent: true,
        opacity: 0.46,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false
      })
    );
    edges.position.x = cursorX;
    edges.renderOrder = 5;
    textVisualGroup.add(edges);

    letterEntries.push({ mesh, material, glow, edges });

    if (geometry.boundingBox) {
      const centerX = (cursorX + (geometry.boundingBox.min.x + geometry.boundingBox.max.x) * 0.5) * WORDMARK_DISPLAY_SCALE;
      const centerY = ((geometry.boundingBox.min.y + geometry.boundingBox.max.y) * 0.5) * WORDMARK_DISPLAY_SCALE;
      const centerZ = ((geometry.boundingBox.min.z + geometry.boundingBox.max.z) * 0.5) * WORDMARK_DISPLAY_SCALE + WORDMARK_DEPTH_OFFSET;
      const halfX = (geometry.boundingBox.max.x - geometry.boundingBox.min.x) * 0.5 * WORDMARK_DISPLAY_SCALE + 6;
      const halfY = (geometry.boundingBox.max.y - geometry.boundingBox.min.y) * 0.5 * WORDMARK_DISPLAY_SCALE + 5;
      const halfZ = (geometry.boundingBox.max.z - geometry.boundingBox.min.z) * 0.5 * WORDMARK_DISPLAY_SCALE + 8;
      letterColliders.push({ centerX, centerY, centerZ, halfX, halfY, halfZ });
      wordmarkColliderMin.x = Math.min(wordmarkColliderMin.x, centerX - halfX);
      wordmarkColliderMin.y = Math.min(wordmarkColliderMin.y, centerY - halfY);
      wordmarkColliderMin.z = Math.min(wordmarkColliderMin.z, centerZ - halfZ);
      wordmarkColliderMax.x = Math.max(wordmarkColliderMax.x, centerX + halfX);
      wordmarkColliderMax.y = Math.max(wordmarkColliderMax.y, centerY + halfY);
      wordmarkColliderMax.z = Math.max(wordmarkColliderMax.z, centerZ + halfZ);
    }

    const mergeClone = geometry.clone();
    mergeClone.translate(cursorX, 0, 0);
    mergedGeometries.push(mergeClone);

    cursorX += width + letterSpacing;
  }

  logoRig.add(textVisualGroup);

  const mergedGeometry = mergeGeometries(mergedGeometries, false);
  if (!mergedGeometry) throw new Error("Failed to merge letter geometries");
  mergedGeometry.computeBoundingBox();
  textGeometry = mergedGeometry;
  textMesh = new THREE.Mesh(mergedGeometry, new THREE.MeshBasicMaterial({ visible: false }));

  box.copy(mergedGeometry.boundingBox);
  box.getSize(logoBounds);
  backgroundHalo.scale.set(logoBounds.x * 1.5, logoBounds.y * 1.25, 1);
  particleField.set(
    logoBounds.x * 0.9,
    logoBounds.y * 1.8,
    Math.max(logoBounds.z * 2.4, 150)
  );
}

function disposeParticles() {
  if (particleSystem) {
    logoRig.remove(particleSystem);
    particleSystem.geometry.dispose();
    particleSystem = null;
  }
  if (particleMaterial) {
    particleMaterial.dispose();
    particleMaterial = null;
  }
  positionAttr = null;
  colorAttr = null;
  sizeVarianceAttr = null;
  particleCount = 0;
  particleTargetCount = 0;
}

function ensureParticleMaterial() {
  if (particleMaterial) return;
  particleMaterial = new THREE.PointsMaterial({
    map: particleSprite,
    color: 0xffffff,
    transparent: true,
    opacity: 0.76,
    alphaTest: 0.06,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
    vertexColors: true,
    size: getBaseParticleSize()
  });
  particleMaterial.customProgramCacheKey = () => "hanelab-particle-size-v1";
  particleMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uParticleSizeScale = { value: motionTuning.particleSize };
    shader.uniforms.uParticleSizeRandomness = { value: motionTuning.particleSizeRandomness };
    particleMaterial.userData.sizeUniforms = {
      uParticleSizeScale: shader.uniforms.uParticleSizeScale,
      uParticleSizeRandomness: shader.uniforms.uParticleSizeRandomness
    };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aSizeVariance;\nuniform float uParticleSizeScale;\nuniform float uParticleSizeRandomness;"
      )
      .replace(
        "gl_PointSize = size;",
        "float sizeJitter = (aSizeVariance * 2.0 - 1.0) * uParticleSizeRandomness;\n\tgl_PointSize = size * uParticleSizeScale * max(0.22, 1.0 + sizeJitter);"
      );
  };
  particleMaterial.toneMapped = false;
  updateParticleMaterialTuning();
  particleMaterial.depthTest = true;
}

function rebuildParticleGeometry() {
  const geometry = new THREE.BufferGeometry();
  positionAttr = new THREE.BufferAttribute(particlePositions, 3);
  colorAttr = new THREE.BufferAttribute(particleColors, 3);
  sizeVarianceAttr = new THREE.BufferAttribute(particleSizeVariance, 1);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  sizeVarianceAttr.setUsage(THREE.StaticDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setAttribute("aSizeVariance", sizeVarianceAttr);

  if (particleSystem) {
    particleSystem.geometry.dispose();
    particleSystem.geometry = geometry;
    return;
  }

  particleSystem = new THREE.Points(geometry, particleMaterial);
  particleSystem.frustumCulled = false;
  particleSystem.renderOrder = 1;
  logoRig.add(particleSystem);
}

function spawnParticleAt(index, sampler, shellRadius, fieldX, fieldY, fieldZ) {
  const o = index * 3;
  particleSeeds[index] = Math.random() * Math.PI * 2;
  particleTurbulence[index] = 0.75 + Math.random() * 1.1;
  particleMass[index] = 0.8 + Math.random() * 0.65;
  particleColorMix[index] = 0;
  particleWake[index] = 0;
  particleHitCooldown[index] = 0;
  particleSizeVariance[index] = Math.random();
  particleAssignedIntensity[index] = 0;
  particleAssignedLetter[index] = -1;
  particleSpin[index] = Math.random() < 0.5 ? -1 : 1;
  particleAssignedColors[o] = -1;
  particleAssignedColors[o + 1] = -1;
  particleAssignedColors[o + 2] = -1;

  sampler.sample(tmpV1, tmpV2);
  tmpV2.normalize();

  const spreadX = Math.max(viewportBounds.x * 2.1, fieldX * 1.25);
  const spreadY = Math.max(viewportBounds.y * 2.1, fieldY * 1.2);

  if (Math.random() < 0.26) {
    tmpV3.set(hash(index + 19) - 0.5, hash(index + 41) - 0.5, hash(index + 83) - 0.5).normalize();
    tmpV3.crossVectors(tmpV3, tmpV2).normalize();
    tmpV4.crossVectors(tmpV2, tmpV3).normalize();

    const lift = shellRadius + Math.random() * 48;
    const tangentJitter = randomSpread(48);
    const bitangentJitter = randomSpread(48);

    tmpV1
      .addScaledVector(tmpV2, lift)
      .addScaledVector(tmpV3, tangentJitter)
      .addScaledVector(tmpV4, bitangentJitter);
  } else {
    tmpV1.set(
      randomSpread(spreadX),
      randomSpread(spreadY),
      randomSpread(fieldZ * 0.85)
    );
  }

  particlePositions[o] = tmpV1.x;
  particlePositions[o + 1] = tmpV1.y;
  particlePositions[o + 2] = tmpV1.z;

  particleVelocities[o] = 0;
  particleVelocities[o + 1] = 0;
  particleVelocities[o + 2] = 0;

  const whiteMix = 0.08 + Math.random() * 0.14;
  particleColors[o] = TEAL.r * (1 - whiteMix) + whiteMix;
  particleColors[o + 1] = TEAL.g * (1 - whiteMix) + whiteMix;
  particleColors[o + 2] = TEAL.b * (1 - whiteMix) + whiteMix;
}

function resetParticleInteractionState(count, resetVelocity = false) {
  clearFluidField();

  for (let i = 0; i < count; i++) {
    const o = i * 3;
    particleColorMix[i] = 0;
    particleWake[i] = 0;
    particleHitCooldown[i] = 0;
    particleAssignedIntensity[i] = 0;
    particleAssignedLetter[i] = -1;
    particleAssignedColors[o] = -1;
    particleAssignedColors[o + 1] = -1;
    particleAssignedColors[o + 2] = -1;

    if (resetVelocity) {
      particleVelocities[o] = 0;
      particleVelocities[o + 1] = 0;
      particleVelocities[o + 2] = 0;
    }
  }
}

function buildParticles(count) {
  if (!textGeometry || !textMesh) return;

  disposeParticles();
  clearFluidField();

  particleCount = count;
  particleTargetCount = count;
  particlePositions = new Float32Array(count * 3);
  particleVelocities = new Float32Array(count * 3);
  particleColors = new Float32Array(count * 3);
  particleSeeds = new Float32Array(count);
  particleTurbulence = new Float32Array(count);
  particleMass = new Float32Array(count);
  particleColorMix = new Float32Array(count);
  particleWake = new Float32Array(count);
  particleHitCooldown = new Float32Array(count);
  particleSizeVariance = new Float32Array(count);
  particleAssignedColors = new Float32Array(count * 3);
  particleAssignedIntensity = new Float32Array(count);
  particleAssignedLetter = new Int16Array(count);
  particleSpin = new Float32Array(count);

  ensureParticleMaterial();

  const sampler = new MeshSurfaceSampler(textMesh).build();
  const bounds = textGeometry.boundingBox?.getSize(new THREE.Vector3()) || new THREE.Vector3(600, 140, 40);
  const shellRadius = Math.max(bounds.x * 0.11, 28);
  const fieldX = particleField.x;
  const fieldY = particleField.y;
  const fieldZ = particleField.z;

  for (let i = 0; i < count; i++) {
    spawnParticleAt(i, sampler, shellRadius, fieldX, fieldY, fieldZ);
  }

  rebuildParticleGeometry();
}

function resizeParticleSystem(nextCount) {
  if (!textGeometry || !textMesh) return;
  const targetCount = normalizeParticleCount(nextCount);
  if (targetCount === particleCount) return;
  if (!particleSystem || particleCount === 0) {
    buildParticles(targetCount);
    return;
  }

  const copyCount = Math.min(particleCount, targetCount);
  const nextPositions = new Float32Array(targetCount * 3);
  const nextVelocities = new Float32Array(targetCount * 3);
  const nextColors = new Float32Array(targetCount * 3);
  const nextSeeds = new Float32Array(targetCount);
  const nextTurbulence = new Float32Array(targetCount);
  const nextMass = new Float32Array(targetCount);
  const nextColorMix = new Float32Array(targetCount);
  const nextWake = new Float32Array(targetCount);
  const nextHitCooldown = new Float32Array(targetCount);
  const nextSizeVariance = new Float32Array(targetCount);
  const nextAssignedColors = new Float32Array(targetCount * 3);
  const nextAssignedIntensity = new Float32Array(targetCount);
  const nextAssignedLetter = new Int16Array(targetCount);
  const nextSpin = new Float32Array(targetCount);

  nextPositions.set(particlePositions.subarray(0, copyCount * 3));
  nextVelocities.set(particleVelocities.subarray(0, copyCount * 3));
  nextColors.set(particleColors.subarray(0, copyCount * 3));
  nextSeeds.set(particleSeeds.subarray(0, copyCount));
  nextTurbulence.set(particleTurbulence.subarray(0, copyCount));
  nextMass.set(particleMass.subarray(0, copyCount));
  nextColorMix.set(particleColorMix.subarray(0, copyCount));
  nextWake.set(particleWake.subarray(0, copyCount));
  nextHitCooldown.set(particleHitCooldown.subarray(0, copyCount));
  nextSizeVariance.set(particleSizeVariance.subarray(0, copyCount));
  nextAssignedColors.set(particleAssignedColors.subarray(0, copyCount * 3));
  nextAssignedIntensity.set(particleAssignedIntensity.subarray(0, copyCount));
  nextAssignedLetter.set(particleAssignedLetter.subarray(0, copyCount));
  nextSpin.set(particleSpin.subarray(0, copyCount));

  particlePositions = nextPositions;
  particleVelocities = nextVelocities;
  particleColors = nextColors;
  particleSeeds = nextSeeds;
  particleTurbulence = nextTurbulence;
  particleMass = nextMass;
  particleColorMix = nextColorMix;
  particleWake = nextWake;
  particleHitCooldown = nextHitCooldown;
  particleSizeVariance = nextSizeVariance;
  particleAssignedColors = nextAssignedColors;
  particleAssignedIntensity = nextAssignedIntensity;
  particleAssignedLetter = nextAssignedLetter;
  particleSpin = nextSpin;

  if (targetCount > copyCount) {
    const sampler = new MeshSurfaceSampler(textMesh).build();
    const bounds = textGeometry.boundingBox?.getSize(new THREE.Vector3()) || new THREE.Vector3(600, 140, 40);
    const shellRadius = Math.max(bounds.x * 0.11, 28);
    const fieldX = particleField.x;
    const fieldY = particleField.y;
    const fieldZ = particleField.z;

    for (let i = copyCount; i < targetCount; i++) {
      spawnParticleAt(i, sampler, shellRadius, fieldX, fieldY, fieldZ);
    }
  }

  resetParticleInteractionState(targetCount, true);
  particleCount = targetCount;
  rebuildParticleGeometry();
}

function sampleFluidArrays(gridX, gridY, fieldX, fieldY, target) {
  const x = clamp(gridX, 0, FLUID_COLS - 1);
  const y = clamp(gridY, 0, FLUID_ROWS - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, FLUID_COLS - 1);
  const y1 = Math.min(y0 + 1, FLUID_ROWS - 1);
  const tx = x - x0;
  const ty = y - y0;

  const i00 = y0 * FLUID_COLS + x0;
  const i10 = y0 * FLUID_COLS + x1;
  const i01 = y1 * FLUID_COLS + x0;
  const i11 = y1 * FLUID_COLS + x1;

  const vx0 = fieldX[i00] + (fieldX[i10] - fieldX[i00]) * tx;
  const vx1 = fieldX[i01] + (fieldX[i11] - fieldX[i01]) * tx;
  const vy0 = fieldY[i00] + (fieldY[i10] - fieldY[i00]) * tx;
  const vy1 = fieldY[i01] + (fieldY[i11] - fieldY[i01]) * tx;

  target.set(
    vx0 + (vx1 - vx0) * ty,
    vy0 + (vy1 - vy0) * ty
  );
  return target;
}

function toFluidGridPosition(worldX, worldY, target) {
  const boundX = Math.max(viewportBounds.x, 1);
  const boundY = Math.max(viewportBounds.y, 1);
  target.set(
    ((clamp(worldX, -boundX, boundX) + boundX) / (boundX * 2)) * (FLUID_COLS - 1),
    ((clamp(worldY, -boundY, boundY) + boundY) / (boundY * 2)) * (FLUID_ROWS - 1)
  );
  return target;
}

function sampleFluidVelocity(worldX, worldY, target) {
  toFluidGridPosition(worldX, worldY, tmpFlowB);
  return sampleFluidArrays(tmpFlowB.x, tmpFlowB.y, fluidVelocityX, fluidVelocityY, target);
}

function getFluidCanvasMetrics() {
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    width: Math.max(1, rect.width || renderer.domElement.clientWidth || 1),
    height: Math.max(1, rect.height || renderer.domElement.clientHeight || 1)
  };
}

function getFluidImpulseThickness() {
  const { width, height } = getFluidCanvasMetrics();
  const hitRadius = getMaxCursorRadius() * motionTuning.radius;
  const scaleX = width / Math.max(viewportBounds.x * 2, 1);
  const scaleY = height / Math.max(viewportBounds.y * 2, 1);
  return Math.max(FLUID_MIN_IMPULSE_PX, hitRadius * (scaleX + scaleY) * 0.5);
}

function createGPUFluidController() {
  const gpuComposer = GPUComposer.initWithThreeRenderer(renderer);
  gpuComposer.undoThreeState();

  const velocityState = new GPULayer(gpuComposer, {
    name: "velocity",
    dimensions: [FLUID_COLS, FLUID_ROWS],
    type: FLOAT,
    filter: LINEAR,
    numComponents: 2,
    wrapX: CLAMP_TO_EDGE,
    wrapY: CLAMP_TO_EDGE,
    numBuffers: 2
  });
  const divergenceState = new GPULayer(gpuComposer, {
    name: "divergence",
    dimensions: [FLUID_COLS, FLUID_ROWS],
    type: FLOAT,
    filter: NEAREST,
    numComponents: 1,
    wrapX: CLAMP_TO_EDGE,
    wrapY: CLAMP_TO_EDGE
  });
  const pressureState = new GPULayer(gpuComposer, {
    name: "pressure",
    dimensions: [FLUID_COLS, FLUID_ROWS],
    type: FLOAT,
    filter: NEAREST,
    numComponents: 1,
    wrapX: CLAMP_TO_EDGE,
    wrapY: CLAMP_TO_EDGE,
    numBuffers: 2
  });

  const advection = new GPUProgram(gpuComposer, {
    name: "advection",
    fragmentShader: `
      in vec2 v_uv;

      uniform sampler2D u_state;
      uniform sampler2D u_velocity;
      uniform vec2 u_dimensions;
      uniform float u_decay;

      out vec2 out_state;

      void main() {
        vec2 advected = texture(u_state, v_uv - texture(u_velocity, v_uv).xy / u_dimensions).xy;
        out_state = advected * u_decay;
      }`,
    uniforms: [
      { name: "u_state", value: 0, type: INT },
      { name: "u_velocity", value: 1, type: INT },
      { name: "u_dimensions", value: [1, 1], type: FLOAT },
      { name: "u_decay", value: 0.985, type: FLOAT }
    ]
  });
  const divergence2D = new GPUProgram(gpuComposer, {
    name: "divergence2D",
    fragmentShader: `
      in vec2 v_uv;

      uniform sampler2D u_vectorField;
      uniform vec2 u_pxSize;

      out float out_divergence;

      void main() {
        float n = texture(u_vectorField, v_uv + vec2(0.0, u_pxSize.y)).y;
        float s = texture(u_vectorField, v_uv - vec2(0.0, u_pxSize.y)).y;
        float e = texture(u_vectorField, v_uv + vec2(u_pxSize.x, 0.0)).x;
        float w = texture(u_vectorField, v_uv - vec2(u_pxSize.x, 0.0)).x;
        out_divergence = 0.5 * (e - w + n - s);
      }`,
    uniforms: [
      { name: "u_vectorField", value: 0, type: INT },
      { name: "u_pxSize", value: [1 / FLUID_COLS, 1 / FLUID_ROWS], type: FLOAT }
    ]
  });
  const jacobi = new GPUProgram(gpuComposer, {
    name: "jacobi",
    fragmentShader: `
      in vec2 v_uv;

      uniform float u_alpha;
      uniform float u_beta;
      uniform vec2 u_pxSize;
      uniform sampler2D u_previousState;
      uniform sampler2D u_divergence;

      out float out_pressure;

      void main() {
        float n = texture(u_previousState, v_uv + vec2(0.0, u_pxSize.y)).x;
        float s = texture(u_previousState, v_uv - vec2(0.0, u_pxSize.y)).x;
        float e = texture(u_previousState, v_uv + vec2(u_pxSize.x, 0.0)).x;
        float w = texture(u_previousState, v_uv - vec2(u_pxSize.x, 0.0)).x;
        float d = texture(u_divergence, v_uv).x;
        out_pressure = (n + s + e + w - d) * 0.25;
      }`,
    uniforms: [
      { name: "u_alpha", value: -1, type: FLOAT },
      { name: "u_beta", value: 0.25, type: FLOAT },
      { name: "u_pxSize", value: [1 / FLUID_COLS, 1 / FLUID_ROWS], type: FLOAT },
      { name: "u_previousState", value: 0, type: INT },
      { name: "u_divergence", value: 1, type: INT }
    ]
  });
  const gradientSubtraction = new GPUProgram(gpuComposer, {
    name: "gradientSubtraction",
    fragmentShader: `
      in vec2 v_uv;

      uniform vec2 u_pxSize;
      uniform sampler2D u_scalarField;
      uniform sampler2D u_vectorField;

      out vec2 out_result;

      void main() {
        float n = texture(u_scalarField, v_uv + vec2(0.0, u_pxSize.y)).x;
        float s = texture(u_scalarField, v_uv - vec2(0.0, u_pxSize.y)).x;
        float e = texture(u_scalarField, v_uv + vec2(u_pxSize.x, 0.0)).x;
        float w = texture(u_scalarField, v_uv - vec2(u_pxSize.x, 0.0)).x;
        out_result = texture(u_vectorField, v_uv).xy - 0.5 * vec2(e - w, n - s);
      }`,
    uniforms: [
      { name: "u_pxSize", value: [1 / FLUID_COLS, 1 / FLUID_ROWS], type: FLOAT },
      { name: "u_scalarField", value: 0, type: INT },
      { name: "u_vectorField", value: 1, type: INT }
    ]
  });
  const touch = new GPUProgram(gpuComposer, {
    name: "touch",
    fragmentShader: `
      in vec2 v_uv;
      in vec2 v_uv_local;

      uniform sampler2D u_velocity;
      uniform vec2 u_vector;

      out vec2 out_velocity;

      void main() {
        vec2 radialVec = v_uv_local * 2.0 - 1.0;
        float radiusSq = dot(radialVec, radialVec);
        float falloff = max(0.0, 1.0 - radiusSq);
        vec2 velocity = texture(u_velocity, v_uv).xy + falloff * u_vector;
        float velocityMag = length(velocity);
        out_velocity = velocityMag > 0.00001
          ? velocity / velocityMag * min(velocityMag, ${FLUID_MAX_VELOCITY.toFixed(1)})
          : vec2(0.0);
      }`,
    uniforms: [
      { name: "u_velocity", value: 0, type: INT },
      { name: "u_vector", value: [0, 0], type: FLOAT }
    ]
  });

  function updateDimensions() {
    const { width, height } = getFluidCanvasMetrics();
    const effectiveFriction = getEffectiveFriction();
    advection.setUniform("u_dimensions", [width, height]);
    advection.setUniform("u_decay", Math.max(0.9, 0.988 - effectiveFriction * 0.03));
  }

  function syncReadback() {
    const values = velocityState.getValues();
    const { width, height } = getFluidCanvasMetrics();
    const scaleX = (viewportBounds.x * 2) / width * FLUID_SAMPLE_SCALE;
    const scaleY = (viewportBounds.y * 2) / height * FLUID_SAMPLE_SCALE;

    for (let i = 0; i < FLUID_CELL_COUNT; i++) {
      const offset = i * 2;
      fluidVelocityX[i] = values[offset] * scaleX;
      fluidVelocityY[i] = values[offset + 1] * scaleY;
    }
  }

  function clear() {
    gpuComposer.undoThreeState();
    velocityState.clear(true);
    divergenceState.clear();
    pressureState.clear(true);
    fluidVelocityX.fill(0);
    fluidVelocityY.fill(0);
    gpuComposer.resetThreeState();
  }

  function step() {
    gpuComposer.undoThreeState();
    updateDimensions();

    while (pendingFluidImpulses.length > 0) {
      const impulse = pendingFluidImpulses.shift();
      if (!impulse) break;
      touch.setUniform("u_vector", [
        impulse.vector[0] * FLUID_IMPULSE_STRENGTH,
        impulse.vector[1] * FLUID_IMPULSE_STRENGTH
      ]);
      gpuComposer.stepSegment({
        program: touch,
        input: velocityState,
        output: velocityState,
        position1: impulse.position1,
        position2: impulse.position2,
        thickness: impulse.thickness,
        endCaps: true
      });
    }

    gpuComposer.step({
      program: advection,
      input: [velocityState, velocityState],
      output: velocityState
    });
    gpuComposer.step({
      program: divergence2D,
      input: velocityState,
      output: divergenceState
    });
    for (let i = 0; i < FLUID_JACOBI_STEPS; i++) {
      gpuComposer.step({
        program: jacobi,
        input: [pressureState, divergenceState],
        output: pressureState
      });
    }
    gpuComposer.step({
      program: gradientSubtraction,
      input: [pressureState, velocityState],
      output: velocityState
    });

    syncReadback();
    gpuComposer.resetThreeState();
  }

  function dispose() {
    velocityState.dispose();
    divergenceState.dispose();
    pressureState.dispose();
    advection.dispose();
    divergence2D.dispose();
    jacobi.dispose();
    gradientSubtraction.dispose();
    touch.dispose();
    gpuComposer.dispose();
  }

  updateDimensions();
  clear();

  return {
    clear,
    dispose,
    step,
    updateDimensions
  };
}

function clearFluidField() {
  pendingFluidImpulses.length = 0;
  if (gpuFluid) {
    gpuFluid.clear();
    return;
  }
  fluidVelocityX.fill(0);
  fluidVelocityY.fill(0);
}

function queueFluidImpulse(position1, position2) {
  const dx = position2[0] - position1[0];
  const dy = position2[1] - position1[1];
  if (dx * dx + dy * dy < 0.0001) return;
  pendingFluidImpulses.push({
    position1,
    position2,
    vector: [dx, dy],
    thickness: getFluidImpulseThickness()
  });
}

function stepFluidField() {
  if (!gpuFluid) return;
  gpuFluid.step();
}

function updateFluidSimulationSize() {
  if (!gpuFluid) return;
  gpuFluid.updateDimensions();
  clearFluidField();
}

function updatePointerProjection(updateMotion) {
  if (!pointer.active && !pointer.ready) return;

  raycaster.setFromCamera(pointer.ndc, camera);
  logoRig.updateMatrixWorld(true);
  inverseLogoMatrix.copy(logoRig.matrixWorld).invert();

  pointer.rayOriginLocal.copy(raycaster.ray.origin).applyMatrix4(inverseLogoMatrix);
  pointer.rayDirLocal.copy(raycaster.ray.direction).transformDirection(inverseLogoMatrix).normalize();

  if (!raycaster.ray.intersectPlane(pointerPlane, pointerWorldHit)) return;
  tmpV1.copy(pointerWorldHit).applyMatrix4(inverseLogoMatrix);

  if (updateMotion) {
    if (pointer.ready) {
      tmpV2.copy(tmpV1).sub(pointer.local);
      pointer.velocity.lerp(tmpV2, 0.58);
    } else {
      pointer.velocity.set(0, 0, 0);
    }
  }

  pointer.local.copy(tmpV1);
  pointer.ready = true;
}

function updateViewport() {
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width || window.innerWidth));
  const height = Math.max(1, Math.floor(rect.height || window.innerHeight));

  isMobileLayout = width < MOBILE_BREAKPOINT;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
  updateFluidSimulationSize();

  camera.aspect = width / height;
  camera.fov = isMobileLayout ? 37 : 33;
  camera.position.z = isMobileLayout ? 720 : 620;
  camera.updateProjectionMatrix();

  bloomPass.strength = isMobileLayout ? 0.58 : 0.76;
  bloomPass.radius = isMobileLayout ? 0.36 : 0.44;
  bloomPass.threshold = isMobileLayout ? 0.12 : 0.08;

  if (textReady) {
    const distance = camera.position.z;
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
    const visibleWidth = visibleHeight * camera.aspect;
    const targetWidth = visibleWidth * (isMobileLayout ? 0.82 : 0.67);
    const targetHeight = visibleHeight * (isMobileLayout ? 0.23 : 0.21);
    const scale = Math.min(
      targetWidth / Math.max(logoBounds.x, 1),
      targetHeight / Math.max(logoBounds.y, 1)
    );
    logoRig.scale.setScalar(scale);
    viewportBounds.set(
      (visibleWidth * 0.5) / Math.max(scale, 0.0001) * 0.96,
      (visibleHeight * 0.5) / Math.max(scale, 0.0001) * 0.92
    );

    backgroundHalo.scale.set(logoBounds.x * 1.5, logoBounds.y * 1.25, 1);
    if (particleMaterial) {
      updateParticleMaterialTuning();
    }

    const desiredCount = motionTuning.particleCount ?? computeParticleCount(width, height);
    if (!particleSystem || particleCount === 0) {
      buildParticles(desiredCount);
      syncTuningPanel();
    } else if (desiredCount !== particleTargetCount) {
      particleTargetCount = desiredCount;
      syncTuningPanel();
    }
  }
}

function getLetterColor(index, time, target) {
  const hue = (0.47 + index * 0.115 + time * 0.018 + Math.sin(time * 0.11 + index * 0.6) * 0.015) % 1;
  target.setHSL(hue, 0.92, 0.52);
  return target;
}

function updateLetterPalette(time) {
  for (let i = 0; i < LETTER_COUNT; i++) {
    getLetterColor(i, time, letterPalette[i]);
    letterAccentPalette[i].copy(letterPalette[i]).offsetHSL(0.045, 0.04, 0.22);
  }
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.033);
  const frame = dt * 60;
  const t = clock.elapsedTime;
  pulseTime += dt;

  if (pointer.active) {
    updatePointerProjection(false);
  }

  if (textReady && particleTargetCount > 0 && particleTargetCount !== particleCount) {
    const delta = particleTargetCount - particleCount;
    const step = Math.sign(delta) * Math.min(Math.abs(delta), COUNT_STEP * 2);
    resizeParticleSystem(particleCount + step);
  }

  pointer.ndcSmooth.lerp(pointer.ndc, pointer.active ? 0.12 : 0.08);
  pointer.velocity.multiplyScalar(pointer.active ? 0.84 : 0.78);
  pointer.speed = pointer.velocity.length();

  if (letterEntries.length > 0) {
    updateLetterPalette(t);
    cycleBaseColor.copy(letterPalette[Math.floor(LETTER_COUNT * 0.5)]);
    cycleInnerColor.copy(letterPalette[(Math.floor(LETTER_COUNT * 0.5) + 1) % LETTER_COUNT]);
    for (let i = 0; i < letterEntries.length; i++) {
      const entry = letterEntries[i];
      entry.material.uniforms.uTime.value = t;
      entry.glow.material.color.copy(letterPalette[i]);
      entry.edges.material.color.copy(letterAccentPalette[i]);
    }
    backgroundHalo.material.color.copy(cycleBaseColor);
    rimLight.color.copy(cycleBaseColor);
  }

  const pointerEnergy = clamp(pointer.speed * 0.075, 0, 8.5);
  const boundX = viewportBounds.x;
  const boundY = viewportBounds.y;
  const boundZ = particleField.z;
  const hitRadius = getMaxCursorRadius() * motionTuning.radius;
  const hitRadiusSq = hitRadius * hitRadius;
  const pointerLocalX = clamp(pointer.local.x, -Math.max(boundX - hitRadius, 0), Math.max(boundX - hitRadius, 0));
  const pointerLocalY = clamp(pointer.local.y, -Math.max(boundY - hitRadius, 0), Math.max(boundY - hitRadius, 0));
  const pointerLocalZ = clamp(pointer.local.z, -Math.max(boundZ - hitRadius, 0), Math.max(boundZ - hitRadius, 0));

  cursorSphere.visible = pointer.active && pointer.ready && hitRadius > 0.001;
  if (cursorSphere.visible) {
    cursorSphere.position.set(pointerLocalX, pointerLocalY, pointerLocalZ);
    cursorSphere.scale.setScalar(hitRadius);
  }

  stepFluidField();

  if (particleSystem && positionAttr && colorAttr) {
    for (let i = 0; i < particleCount; i++) {
      const o = i * 3;
      const seed = particleSeeds[i];
      const turbulence = particleTurbulence[i];
      const mass = particleMass[i];
      particleHitCooldown[i] = Math.max(0, particleHitCooldown[i] - dt);

      const px = particlePositions[o];
      const py = particlePositions[o + 1];
      const pz = particlePositions[o + 2];

      let vx = particleVelocities[o];
      let vy = particleVelocities[o + 1];
      let vz = particleVelocities[o + 2];

      const sampleOffsetX =
        Math.sin(seed * 11.7 + pz * 0.006 + t * 0.14) * 4.8 +
        Math.sin(seed * 23.1 - py * 0.012 - t * 0.48) * 2.2;
      const sampleOffsetY =
        Math.cos(seed * 13.1 + pz * 0.005 - t * 0.11) * 4.8 +
        Math.cos(seed * 19.7 + px * 0.014 + t * 0.41) * 2.2;
      sampleFluidVelocity(px + sampleOffsetX, py + sampleOffsetY, tmpFlowA);
      sampleFluidVelocity(px - sampleOffsetY * 0.45, py + sampleOffsetX * 0.45, tmpFlowB);
      tmpFlowA.lerp(tmpFlowB, 0.35);
      const hitInfluence = Math.max(particleColorMix[i], clamp(particleWake[i], 0, 1));
      const fluidCoupling = (
        FLUID_COUPLING_BASE +
        hitInfluence * FLUID_COUPLING_WAKE
      ) * frame / mass;
      const fluidRelax = clamp(
        (
          FLUID_RELAX_BASE +
          hitInfluence * FLUID_RELAX_WAKE
        ) * frame / mass,
        0,
        0.12
      );
      vx += tmpFlowA.x * fluidCoupling;
      vy += tmpFlowA.y * fluidCoupling;
      vx += (tmpFlowA.x - vx) * fluidRelax;
      vy += (tmpFlowA.y - vy) * fluidRelax;

      if (pointer.active && pointer.ready && pointerEnergy > 0.0001 && hitRadius > 0.001) {
        const hitX = px - pointerLocalX;
        const hitY = py - pointerLocalY;
        const hitZ = pz - pointerLocalZ;
        const hitDistSq = hitX * hitX + hitY * hitY + hitZ * hitZ;

        if (hitDistSq < hitRadiusSq) {
          const dist = Math.sqrt(hitDistSq) || 1;
          const falloff = Math.pow(1 - hitDistSq / hitRadiusSq, 2);
          const nx = hitX / dist;
          const ny = hitY / dist;
          const nz = hitZ / dist;
          const depthLift = pointerEnergy * falloff * 0.16 * frame;

          vx += nx * depthLift * 0.14;
          vy += ny * depthLift * 0.14;
          vz += nz * depthLift * 0.18 + (hash(i + 97) - 0.5) * depthLift * 0.08;
          particleColorMix[i] = 1;
          particleWake[i] = Math.max(particleWake[i], 1);

          if (particleAssignedLetter[i] < 0) {
            const randomLetterIndex = Math.floor(Math.random() * letterEntries.length);
            const hitColor = letterEntries[randomLetterIndex].glow.material.color;
            particleAssignedLetter[i] = randomLetterIndex;
            particleAssignedColors[o] = hitColor.r;
            particleAssignedColors[o + 1] = hitColor.g;
            particleAssignedColors[o + 2] = hitColor.b;
          }

          if (particleHitCooldown[i] <= 0) {
            particleHitCooldown[i] = PARTICLE_HIT_COOLDOWN;
            particleAssignedIntensity[i] = Math.max(
              particleAssignedIntensity[i],
              PARTICLE_HIT_FLASH + falloff * PARTICLE_HIT_FLASH_EXTRA + pointerEnergy * 0.12
            );
            particleAssignedIntensity[i] = Math.min(particleAssignedIntensity[i], PARTICLE_INTENSITY_MAX);
          }
        }
      }

      tmpV1.set(vx, vy, vz);
      applyEdgeCornerRepulsion(px, py, pz, tmpV1, boundX, boundY, boundZ, seed, t, frame);
      vx = tmpV1.x;
      vy = tmpV1.y;
      vz = tmpV1.z;
      if (px < -boundX || px > boundX) {
        vx += (px < -boundX ? -boundX - px : boundX - px) * 0.09 * frame;
        vx *= 0.82;
      }
      if (py < -boundY || py > boundY) {
        vy += (py < -boundY ? -boundY - py : boundY - py) * 0.09 * frame;
        vy *= 0.82;
      }
      if (pz < -boundZ || pz > boundZ) {
        vz += (pz < -boundZ ? -boundZ - pz : boundZ - pz) * 0.035 * frame;
        vz *= 0.84;
      }

      particleWake[i] *= 0.956;
      const hitFadeAlpha = 1 - Math.exp(-dt / PARTICLE_HIT_FADE_TIME);
      particleColorMix[i] = Math.max(0, particleColorMix[i] - dt / PARTICLE_COLOR_FADE_TIME);
      let speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const planarSpeed = Math.sqrt(vx * vx + vy * vy);
      const eddy = particleWake[i] * clamp(planarSpeed * 0.016 * turbulence, 0, 0.085) * frame;
      if (eddy > 0.0001) {
        const spin = particleSpin[i];
        const prevVx = vx;
        const prevVy = vy;
        vz += Math.sin(t * 1.55 + seed * 6.283) * eddy * 0.42;
        vx += -prevVy * spin * eddy * 0.08;
        vy += prevVx * spin * eddy * 0.08;
      }

      speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const effectiveFriction = getEffectiveFriction();
      const dragBase = 0.994 - effectiveFriction * 0.018;
      const dragMin = 0.968 - effectiveFriction * 0.036;
      const dragMax = 0.998 - effectiveFriction * 0.004;
      const drag = clamp(
        dragBase - speed * 0.00045 * frame - particleWake[i] * 0.0026 * frame,
        dragMin,
        dragMax
      );
      vx *= drag;
      vy *= drag;
      vz *= clamp(drag - 0.008, 0.9, 0.988);

      if (speed < 0.0025) {
        vx *= 0.8;
        vy *= 0.8;
        vz *= 0.72;
      }

      particlePositions[o] = px + vx * frame;
      particlePositions[o + 1] = py + vy * frame;
      particlePositions[o + 2] = pz + vz * frame;
      particleVelocities[o] = vx;
      particleVelocities[o + 1] = vy;
      particleVelocities[o + 2] = vz;

      const assignedR = particleAssignedColors[o];
      const assignedG = particleAssignedColors[o + 1];
      const assignedB = particleAssignedColors[o + 2];
      const hasAssignedColor = assignedR >= 0 && assignedG >= 0 && assignedB >= 0;
      const glowTarget = PARTICLE_GLOW_BASE +
        particleWake[i] * PARTICLE_GLOW_WAKE +
        clamp(speed * PARTICLE_GLOW_SPEED, 0, 0.38);
      particleAssignedIntensity[i] += (0 - particleAssignedIntensity[i]) * hitFadeAlpha;
      particleAssignedIntensity[i] = clamp(particleAssignedIntensity[i], 0, PARTICLE_INTENSITY_MAX);
      const emissionMix = clamp(particleAssignedIntensity[i] / PARTICLE_INTENSITY_MAX, 0, 1);

      if (
        hasAssignedColor &&
        particleColorMix[i] <= 0.0001 &&
        emissionMix <= 0.002 &&
        particleWake[i] <= 0.01
      ) {
        particleAssignedLetter[i] = -1;
        particleAssignedColors[o] = -1;
        particleAssignedColors[o + 1] = -1;
        particleAssignedColors[o + 2] = -1;
      }

      const inheritedMix = hasAssignedColor ? particleColorMix[i] : 0;
      const normalSpeedGlow = clamp(0.44 + speed * 0.026, 0.44, 0.52);
      const flashSpeedGlow = clamp(1.1 + speed * 0.16, 1.1, 1.34);
      const speedGlow = normalSpeedGlow + (flashSpeedGlow - normalSpeedGlow) * emissionMix;
      const normalWhiteMix = clamp(0.008 + speed * 0.003, 0.008, 0.016);
      const flashWhiteMix = clamp(speed * 0.004, 0.0, 0.012);
      const whiteMix = normalWhiteMix + (flashWhiteMix - normalWhiteMix) * emissionMix;
      const inheritedR = assignedR >= 0 ? assignedR : TEAL.r;
      const inheritedG = assignedG >= 0 ? assignedG : TEAL.g;
      const inheritedB = assignedB >= 0 ? assignedB : TEAL.b;
      const baseR = TEAL.r + (inheritedR - TEAL.r) * inheritedMix;
      const baseG = TEAL.g + (inheritedG - TEAL.g) * inheritedMix;
      const baseB = TEAL.b + (inheritedB - TEAL.b) * inheritedMix;
      const glowBoost = clamp(
        1 + emissionMix * (PARTICLE_GLOW_BOOST_MAX - 1),
        1,
        PARTICLE_GLOW_BOOST_MAX
      );
      const pulse = 1 + Math.sin(pulseTime * 8 + seed * 9) * (0.02 + emissionMix * 0.03);
      particleColors[o] = clamp(baseR * glowTarget * speedGlow * glowBoost * pulse + whiteMix, 0, PARTICLE_COLOR_CHANNEL_MAX);
      particleColors[o + 1] = clamp(baseG * glowTarget * speedGlow * glowBoost * pulse + whiteMix, 0, PARTICLE_COLOR_CHANNEL_MAX);
      particleColors[o + 2] = clamp(baseB * glowTarget * speedGlow * glowBoost * pulse + whiteMix, 0, PARTICLE_COLOR_CHANNEL_MAX);
    }

    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  const targetRotY = Math.sin(t * 0.28) * 0.06 + pointer.ndcSmooth.x * 0.16;
  const targetRotX = Math.cos(t * 0.22) * 0.03 - pointer.ndcSmooth.y * 0.09;
  logoRig.rotation.y += (targetRotY - logoRig.rotation.y) * 0.05;
  logoRig.rotation.x += (targetRotX - logoRig.rotation.x) * 0.05;
  logoRig.position.y += (Math.sin(t * 0.48) * 5 - logoRig.position.y) * 0.035;
  backgroundHalo.material.rotation += 0.00035;

  composer.render();
}

async function init() {
  const font = await loadFont(FONT_URL);
  buildText(font);
  textReady = true;
  updateViewport();
  if (gpuFluid) {
    gpuFluid.dispose();
  }
  gpuFluid = createGPUFluidController();
  clearFluidField();
  animate();
}

function stopPointerInteraction() {
  pointer.active = false;
  pointer.ready = false;
  pointer.speed = 0;
  pointer.velocity.set(0, 0, 0);
  cursorSphere.visible = false;
}

renderer.domElement.addEventListener("pointermove", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  const screenX = event.clientX - rect.left;
  const screenY = rect.height - (event.clientY - rect.top);

  if (pointer.active) {
    queueFluidImpulse([pointer.screen.x, pointer.screen.y], [screenX, screenY]);
  }

  pointer.screen.set(screenX, screenY);
  pointer.active = true;
  pointer.ndc.set(
    (screenX / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  );
  updatePointerProjection(true);
});

renderer.domElement.addEventListener("pointerleave", stopPointerInteraction);
renderer.domElement.addEventListener("pointerout", stopPointerInteraction);
renderer.domElement.addEventListener("pointerup", stopPointerInteraction);
renderer.domElement.addEventListener("pointercancel", stopPointerInteraction);

let resizeRaf = 0;
function scheduleViewportUpdate() {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    updateViewport();
    updatePointerProjection(false);
  });
}

window.addEventListener("resize", scheduleViewportUpdate);
window.addEventListener("orientationchange", scheduleViewportUpdate);
if (typeof ResizeObserver !== "undefined") {
  const ro = new ResizeObserver(scheduleViewportUpdate);
  ro.observe(container);
}

setupTuningPanel();

init().catch((error) => {
  console.error("[hanelab] Failed to initialize scene.", error);
});
