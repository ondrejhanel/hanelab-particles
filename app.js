import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { GPUComputationRenderer } from "three/addons/misc/GPUComputationRenderer.js";
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
  CLAMP_TO_EDGE,
  PRECISION_HIGH_P,
  PRECISION_MEDIUM_P,
  isHighpSupportedInVertexShader,
  isHighpSupportedInFragmentShader
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
const MAX_PARTICLES = 5000000;
const WORDMARK_DISPLAY_SCALE = 0.4;
const WORDMARK_DEPTH_OFFSET = -18;
const COUNT_STEP = 100;
const FLUID_TARGET_CELL_COUNT_DESKTOP = 72 * 40;
const FLUID_TARGET_CELL_COUNT_MOBILE = 64 * 128;
const FLUID_MIN_COLS = 24;
const FLUID_MAX_COLS = 160;
const FLUID_MIN_ROWS = 24;
const FLUID_MAX_ROWS = 160;
const MOBILE_FLUID_LOCK_GROWTH_THRESHOLD = 24;
const MOBILE_FLUID_LOCK_WIDTH_DELTA = 64;
const MOBILE_FLUID_LOCK_HEIGHT_DELTA = 160;
const TUNING_STORAGE_KEY = "hanelab-motion-tuning";
const FRICTION_MIN = 0.0001;
const FRICTION_MAX = 1;
const VISCOSITY_MIN = 0;
const VISCOSITY_MAX = 1;
const LEGACY_RADIUS_MIN = 1.31;
const LEGACY_RADIUS_MAX = 3;
const RADIUS_MIN = 0.01;
const RADIUS_MAX = 1;
const PARTICLE_COUNT_MIN = MIN_PARTICLES;
const PARTICLE_COUNT_MAX = MAX_PARTICLES;
const PARTICLE_SIZE_MIN = 1;
const PARTICLE_SIZE_MAX = 24;
const PARTICLE_OPACITY_MIN = 0;
const PARTICLE_OPACITY_MAX = 1;
const PARTICLE_OPACITY_RANDOMNESS_MIN = 0;
const PARTICLE_OPACITY_RANDOMNESS_MAX = 1;
const PARTICLE_SIZE_RANDOMNESS_MIN = 0;
const PARTICLE_SIZE_RANDOMNESS_MAX = 1;
const ACTIVITY_GAIN_MIN = 0.2;
const ACTIVITY_GAIN_MAX = 4;
const AMBIENT_FLOW_SPEED_MIN = 0;
const AMBIENT_FLOW_SPEED_MAX = 2.5;
const CURSOR_SPHERE_COLOR = 0x7afcf2;
const TEXT_COLLIDER_MARGIN = 10;
const TEXT_COLLIDER_FORCE = 0.24;
const TEXT_COLLIDER_DAMP = 0.12;
const EDGE_REPEL_START = 0.78;
const EDGE_REPEL_FORCE = 0.34;
const EDGE_REPEL_DAMP = 0.08;
const EDGE_REPEL_JITTER = 0.32;
const OUTER_SHELL_SCALE_XY = 1.2;
const OUTER_SHELL_SCALE_Z = 0.1;
const PARTICLE_HARD_BOUND_SCALE_XY = 1.45;
const PARTICLE_HARD_BOUND_SCALE_Z = 1.65;
const CURSOR_BOX_SCALE_X = 1.1;
const CURSOR_BOX_SCALE_Y = 0.82;
const CURSOR_BOX_SCALE_Z = 0.34;
const CURSOR_BOX_ROUNDNESS = 0.82;
const CURSOR_BOX_FIELD_MARGIN = 0.26;
const CURSOR_BOX_FIELD_FORCE = 0.048;
const PARTICLE_HIT_COOLDOWN = 0.22;
const PARTICLE_HIT_FLASH = 4.8;
const PARTICLE_HIT_FLASH_EXTRA = 1.6;
const PARTICLE_GLOW_BASE = 0.62;
const PARTICLE_GLOW_WAKE = 0.34;
const PARTICLE_GLOW_SPEED = 0.016;
const PARTICLE_HIT_FADE_TIME = 1.7;
const PARTICLE_COLOR_FADE_TIME = 3.0;
const PARTICLE_ACTIVITY_RISE_TIME = 0.28;
const PARTICLE_INTENSITY_MAX = 5.8;
const PARTICLE_GLOW_BOOST_MAX = 8.4;
const PARTICLE_COLOR_CHANNEL_MAX = 1.34;
const PARTICLE_VISUAL_SPEED_MAX = 24;
const PARTICLE_ACTIVITY_THRESHOLD = 0.028;
const PARTICLE_ACTIVITY_SCALE = 11.5;
const PARTICLE_ACTIVITY_MIX_GAIN = 0.95;
const PARTICLE_ACTIVITY_WAKE_GAIN = 1.1;
const PARTICLE_ACTIVITY_ASSIGN_THRESHOLD = 0.1;
const FLUID_IMPULSE_STRENGTH = 0.22;
const FLUID_COUPLING_BASE = 0.06;
const FLUID_COUPLING_WAKE = 0.2;
const FLUID_RELAX_BASE = 0.014;
const FLUID_RELAX_WAKE = 0.05;
const FLUID_JACOBI_STEPS_DESKTOP = 4;
const FLUID_JACOBI_STEPS_MOBILE = 24;
const MOBILE_FLUID_READBACK_SMOOTH_PASSES = 1;
const MOBILE_FLUID_BLUR_MIN = 0.12;
const MOBILE_FLUID_BLUR_MAX = 0.34;
const FLUID_MAX_VELOCITY = 36;
const FLUID_SAMPLE_SCALE = 0.22;
const FLUID_MIN_IMPULSE_PX = 12;
const FLUID_MIN_IMPULSE_CELLS = 1.2;
const FLUID_SHADER_PRECISION_HEADER = `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      precision highp int;
      #else
      precision mediump float;
      precision mediump int;
      #endif
`;
const DESKTOP_TUNING_VIEWPORT = Object.freeze({ shortSide: 1440, longSide: 3440 });
const MOBILE_TUNING_VIEWPORT = Object.freeze({ shortSide: 390, longSide: 844 });
const DEFAULT_MOTION_TUNING = Object.freeze({
  friction: 0.3504,
  viscosity: 0.35,
  radius: 0.25,
  showCursor: false,
  activityGain: 1.0,
  ambientFlowEnabled: true,
  ambientFlowSpeed: 0.30,
  particleCount: 500800,
  particleSize: 5.0,
  particleOpacity: 1.0,
  particleOpacityRandomness: 0.5,
  particleSizeRandomness: 0.5
});
const MOBILE_MOTION_TUNING = Object.freeze({
  friction: 0.3504,
  viscosity: 0.35,
  radius: 0.15,
  showCursor: false,
  activityGain: 1.0,
  ambientFlowEnabled: true,
  ambientFlowSpeed: 0.15,
  particleCount: 222100,
  particleSize: 3.7,
  particleOpacity: 1.0,
  particleOpacityRandomness: 0.5,
  particleSizeRandomness: 0.5
});

const container = document.getElementById("app");
if (!container) throw new Error("Missing #app container");
syncViewportHost();
const tuningUi = document.getElementById("tuning-ui");
const tuningPanel = document.getElementById("tuning-panel");
const tuningToggleButton = document.getElementById("tuning-toggle");
const tuningResetButton = document.getElementById("tuning-reset");
const frictionInput = document.getElementById("tuning-friction");
const frictionNumberInput = document.getElementById("tuning-friction-number");
const viscosityInput = document.getElementById("tuning-viscosity");
const viscosityNumberInput = document.getElementById("tuning-viscosity-number");
const radiusInput = document.getElementById("tuning-radius");
const radiusNumberInput = document.getElementById("tuning-radius-number");
const showCursorInput = document.getElementById("tuning-show-cursor");
const activityGainInput = document.getElementById("tuning-activity-gain");
const activityGainNumberInput = document.getElementById("tuning-activity-gain-number");
const ambientFlowEnabledInput = document.getElementById("tuning-ambient-flow-enabled");
const ambientFlowSpeedInput = document.getElementById("tuning-ambient-flow-speed");
const ambientFlowSpeedNumberInput = document.getElementById("tuning-ambient-flow-speed-number");
const particleCountInput = document.getElementById("tuning-particle-count");
const particleCountNumberInput = document.getElementById("tuning-particle-count-number");
const particleSizeInput = document.getElementById("tuning-particle-size");
const particleSizeNumberInput = document.getElementById("tuning-particle-size-number");
const particleOpacityInput = document.getElementById("tuning-particle-opacity");
const particleOpacityNumberInput = document.getElementById("tuning-particle-opacity-number");
const particleOpacityRandomnessInput = document.getElementById("tuning-particle-opacity-randomness");
const particleOpacityRandomnessNumberInput = document.getElementById("tuning-particle-opacity-randomness-number");
const particleSizeRandomnessInput = document.getElementById("tuning-particle-size-randomness");
const particleSizeRandomnessNumberInput = document.getElementById("tuning-particle-size-randomness-number");
let motionTuningUsesResponsiveDefaults = false;
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
renderer.setSize(1, 1, true);
container.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.63, 0.4, 0.18);
composer.addPass(renderPass);
composer.addPass(bloomPass);

const logoRig = new THREE.Group();
scene.add(logoRig);
const cursorSphere = createCursorSphere();
scene.add(cursorSphere);

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
let gpuParticleController = null;
let particleCount = 0;
let particleTargetCount = 0;
let particleResizeTimeout = 0;
let particlePositions = new Float32Array(0);
let particleVelocities = new Float32Array(0);
let particleSeeds = new Float32Array(0);
let particleTurbulence = new Float32Array(0);
let particleMass = new Float32Array(0);
let particleColorMix = new Float32Array(0);
let particleWake = new Float32Array(0);
let particleHitCooldown = new Float32Array(0);
let particleSizeVariance = new Float32Array(0);
let particleVisualState = new Uint8Array(0);
let particleAssignedColorBytes = new Uint8Array(0);
let particleAssignedIntensity = new Float32Array(0);
let particleAssignedLetter = new Int16Array(0);
let particleSpin = new Float32Array(0);
let fluidCols = 72;
let fluidRows = 40;
let fluidCellCount = fluidCols * fluidRows;
let fluidVelocityX = new Float32Array(fluidCellCount);
let fluidVelocityY = new Float32Array(fluidCellCount);
let fluidVelocityNextX = new Float32Array(fluidCellCount);
let fluidVelocityNextY = new Float32Array(fluidCellCount);
let fluidPressure = new Float32Array(fluidCellCount);
let fluidPressureNext = new Float32Array(fluidCellCount);
let fluidDivergence = new Float32Array(fluidCellCount);
let gpuFluid = null;
let particleFluidTexture = null;
let particleFluidTextureDirty = true;
const fluidSimulationMetrics = { width: 1, height: 1 };
const fluidViewportLock = { active: false, width: 1, height: 1, orientation: "" };
let positionAttr = null;
let sizeVarianceAttr = null;
let particleReferenceAttr = null;
let isMobileLayout = false;
let tuningPanelHidden = false;
let tuningPanelVisibilityCustomized = false;
let activePointerId = null;
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
  prevLocal: new THREE.Vector3(),
  local: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  screen: new THREE.Vector2(),
  rayOriginLocal: new THREE.Vector3(),
  rayDirLocal: new THREE.Vector3(0, 0, -1),
  speed: 0
};
const pointerViewport = {
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  centerOffsetX: 0
};
const pendingFluidImpulses = [];

const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpV4 = new THREE.Vector3();
const tmpCursorWorld = new THREE.Vector3();
const tmpFlowA = new THREE.Vector2();
const tmpFlowB = new THREE.Vector2();
const tmpFlowC = new THREE.Vector2();
const tmpFlowBounds = new THREE.Vector2();
const tmpBoundaryForce = new THREE.Vector3();
const tmpCursorHalfExtents = new THREE.Vector3();
const tmpCursorNormal = new THREE.Vector3();
const box = new THREE.Box3();
const clock = new THREE.Clock();
const cycleBaseColor = new THREE.Color();
const cycleInnerColor = new THREE.Color();
const wordmarkColliderMin = new THREE.Vector3();
const wordmarkColliderMax = new THREE.Vector3();
const letterPalette = Array.from({ length: LETTER_COUNT }, () => new THREE.Color());
const letterAccentPalette = Array.from({ length: LETTER_COUNT }, () => new THREE.Color());
let particleFluidTextureData = new Float32Array(fluidCellCount * 4);
cycleBaseColor.copy(TEAL);
cycleInnerColor.copy(TEAL_SOFT);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function mixNumber(from, to, alpha) {
  return from + (to - from) * alpha;
}

function packNormalizedByte(value) {
  return Math.round(clamp(value, 0, 1) * 255);
}

function clearParticleAssignedColor(index) {
  const o = index * 3;
  particleAssignedColorBytes[o] = 0;
  particleAssignedColorBytes[o + 1] = 0;
  particleAssignedColorBytes[o + 2] = 0;
}

function setParticleAssignedColor(index, color) {
  const o = index * 3;
  particleAssignedColorBytes[o] = packNormalizedByte(color.r);
  particleAssignedColorBytes[o + 1] = packNormalizedByte(color.g);
  particleAssignedColorBytes[o + 2] = packNormalizedByte(color.b);
}

function setParticleVisualState(index, mix, wake, emissionMix, speed) {
  const o = index * 4;
  particleVisualState[o] = packNormalizedByte(mix);
  particleVisualState[o + 1] = packNormalizedByte(wake);
  particleVisualState[o + 2] = packNormalizedByte(emissionMix);
  particleVisualState[o + 3] = packNormalizedByte(speed / PARTICLE_VISUAL_SPEED_MAX);
}

function getParticleTextureSize(count) {
  const width = Math.ceil(Math.sqrt(Math.max(count, 1)));
  const height = Math.ceil(count / width);
  return { width, height };
}

function roundToEven(value) {
  return Math.max(2, Math.round(value / 2) * 2);
}

function getFluidTargetCellCount() {
  return isMobileLayout ? FLUID_TARGET_CELL_COUNT_MOBILE : FLUID_TARGET_CELL_COUNT_DESKTOP;
}

function getFluidGridDimensionsForViewport(width, height) {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspect = safeWidth / safeHeight;
  const targetCellCount = getFluidTargetCellCount();
  const minCols = isMobileLayout ? 48 : FLUID_MIN_COLS;
  const minRows = isMobileLayout ? 96 : FLUID_MIN_ROWS;
  const targetCols = Math.sqrt(targetCellCount * aspect);
  const targetRows = targetCellCount / Math.max(targetCols, 1);

  return {
    cols: clamp(roundToEven(targetCols), minCols, FLUID_MAX_COLS),
    rows: clamp(roundToEven(targetRows), minRows, FLUID_MAX_ROWS)
  };
}

function setFluidGridDimensions(cols, rows) {
  fluidCols = cols;
  fluidRows = rows;
  fluidCellCount = fluidCols * fluidRows;
  fluidVelocityX = new Float32Array(fluidCellCount);
  fluidVelocityY = new Float32Array(fluidCellCount);
  fluidVelocityNextX = new Float32Array(fluidCellCount);
  fluidVelocityNextY = new Float32Array(fluidCellCount);
  fluidPressure = new Float32Array(fluidCellCount);
  fluidPressureNext = new Float32Array(fluidCellCount);
  fluidDivergence = new Float32Array(fluidCellCount);
  particleFluidTextureData = new Float32Array(fluidCellCount * 4);
  if (particleFluidTexture) {
    particleFluidTexture.dispose();
    particleFluidTexture = null;
  }
  particleFluidTextureDirty = true;
}

function ensureParticleFluidTexture() {
  if (
    particleFluidTexture &&
    particleFluidTexture.image?.width === fluidCols &&
    particleFluidTexture.image?.height === fluidRows &&
    particleFluidTexture.image?.data === particleFluidTextureData
  ) {
    return particleFluidTexture;
  }
  if (particleFluidTexture) {
    particleFluidTexture.dispose();
  }
  particleFluidTexture = new THREE.DataTexture(
    particleFluidTextureData,
    fluidCols,
    fluidRows,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  particleFluidTexture.wrapS = THREE.ClampToEdgeWrapping;
  particleFluidTexture.wrapT = THREE.ClampToEdgeWrapping;
  particleFluidTexture.minFilter = THREE.NearestFilter;
  particleFluidTexture.magFilter = THREE.NearestFilter;
  particleFluidTexture.needsUpdate = true;
  return particleFluidTexture;
}

function markParticleFluidTextureDirty() {
  particleFluidTextureDirty = true;
}

function syncParticleFluidTexture() {
  const texture = ensureParticleFluidTexture();
  if (!particleFluidTextureDirty) return texture;

  for (let i = 0; i < fluidCellCount; i++) {
    const o = i * 4;
    particleFluidTextureData[o] = fluidVelocityX[i];
    particleFluidTextureData[o + 1] = fluidVelocityY[i];
    particleFluidTextureData[o + 2] = 0;
    particleFluidTextureData[o + 3] = 1;
  }

  texture.needsUpdate = true;
  particleFluidTextureDirty = false;
  return texture;
}

function smoothMobileFluidReadbackField() {
  if (!isMobileLayout || fluidCellCount <= 0) return;

  for (let pass = 0; pass < MOBILE_FLUID_READBACK_SMOOTH_PASSES; pass++) {
    for (let y = 0; y < fluidRows; y++) {
      const rowOffset = y * fluidCols;
      for (let x = 0; x < fluidCols; x++) {
        const center = rowOffset + x;
        const left = rowOffset + Math.max(x - 1, 0);
        const right = rowOffset + Math.min(x + 1, fluidCols - 1);
        fluidVelocityNextX[center] =
          (fluidVelocityX[left] + fluidVelocityX[center] * 2 + fluidVelocityX[right]) * 0.25;
        fluidVelocityNextY[center] =
          (fluidVelocityY[left] + fluidVelocityY[center] * 2 + fluidVelocityY[right]) * 0.25;
      }
    }

    for (let y = 0; y < fluidRows; y++) {
      const rowOffset = y * fluidCols;
      const upOffset = Math.max(y - 1, 0) * fluidCols;
      const downOffset = Math.min(y + 1, fluidRows - 1) * fluidCols;
      for (let x = 0; x < fluidCols; x++) {
        const center = rowOffset + x;
        const up = upOffset + x;
        const down = downOffset + x;
        fluidVelocityX[center] =
          (fluidVelocityNextX[up] + fluidVelocityNextX[center] * 2 + fluidVelocityNextX[down]) * 0.25;
        fluidVelocityY[center] =
          (fluidVelocityNextY[up] + fluidVelocityNextY[center] * 2 + fluidVelocityNextY[down]) * 0.25;
      }
    }
  }
}

function makeLetterColorLookupGLSL(uniformName) {
  const cases = [];
  for (let i = 0; i < LETTER_COUNT; i++) {
    cases.push(`if (index < ${i + 0.5}) return ${uniformName}[${i}];`);
  }
  return `
vec3 sampleLetterColor(const float index) {
  ${cases.join("\n  ")}
  return ${uniformName}[${Math.max(LETTER_COUNT - 1, 0)}];
}
`;
}

function makeClosestLetterIndexGLSL() {
  return `
float getClosestLetterIndex(const vec3 position) {
  float bestIndex = 0.0;
  float bestScore = 1e20;
  for (int i = 0; i < ${LETTER_COUNT}; i++) {
    vec3 halfExtents = max(uLetterHalfExtents[i].xyz, vec3(0.0001));
    vec3 delta = (position - uLetterCenters[i].xyz) / halfExtents;
    float score = dot(delta, delta);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = float(i);
    }
  }
  return bestIndex;
}
`;
}

function makeNearestLetterColorGLSL() {
  return `
vec3 sampleNearestLetterColor(const vec3 position) {
  float bestScore = 1e20;
  vec3 bestColor = uLetterColors[0];
  for (int i = 0; i < ${LETTER_COUNT}; i++) {
    vec3 halfExtents = max(uLetterHalfExtents[i].xyz, vec3(0.0001));
    vec3 delta = (position - uLetterCenters[i].xyz) / halfExtents;
    float score = dot(delta, delta);
    if (score < bestScore) {
      bestScore = score;
      bestColor = uLetterColors[i];
    }
  }
  return bestColor;
}
`;
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

function getCursorHalfExtents(hitRadius, target) {
  target.set(
    Math.max(hitRadius * CURSOR_BOX_SCALE_X, 0.001),
    Math.max(hitRadius * CURSOR_BOX_SCALE_Y, 0.001),
    Math.max(hitRadius * CURSOR_BOX_SCALE_Z, 0.001)
  );
  return target;
}

function sampleRoundedBoxField(px, py, pz, halfExtents, normalTarget) {
  const roundRadius = Math.min(
    halfExtents.x,
    halfExtents.y,
    halfExtents.z
  ) * CURSOR_BOX_ROUNDNESS;
  const coreX = Math.max(halfExtents.x - roundRadius, 0.0001);
  const coreY = Math.max(halfExtents.y - roundRadius, 0.0001);
  const coreZ = Math.max(halfExtents.z - roundRadius, 0.0001);
  const ax = Math.abs(px);
  const ay = Math.abs(py);
  const az = Math.abs(pz);
  const qx = ax - coreX;
  const qy = ay - coreY;
  const qz = az - coreZ;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  const outsideSq = ox * ox + oy * oy + oz * oz;
  const outsideDist = Math.sqrt(outsideSq);
  const insideMax = Math.min(Math.max(qx, Math.max(qy, qz)), 0);

  if (outsideSq > 0.000001) {
    const clampedX = clamp(px, -coreX, coreX);
    const clampedY = clamp(py, -coreY, coreY);
    const clampedZ = clamp(pz, -coreZ, coreZ);
    normalTarget.set(px - clampedX, py - clampedY, pz - clampedZ).normalize();
  } else if (qx >= qy && qx >= qz) {
    normalTarget.set(px < 0 ? -1 : 1, 0, 0);
  } else if (qy >= qz) {
    normalTarget.set(0, py < 0 ? -1 : 1, 0);
  } else {
    normalTarget.set(0, 0, pz < 0 ? -1 : 1);
  }

  return outsideDist + insideMax - roundRadius;
}

function applyEdgeCornerRepulsion(px, py, pz, velocity, boundX, boundY, boundZ, seed, time, frame) {
  const signX = px < 0 ? -1 : 1;
  const signY = py < 0 ? -1 : 1;
  const signZ = pz < 0 ? -1 : 1;
  const nearX = normalizedBoundaryProximity(px, boundX, EDGE_REPEL_START);
  const nearY = normalizedBoundaryProximity(py, boundY, EDGE_REPEL_START);
  const nearZ = normalizedBoundaryProximity(pz, boundZ, EDGE_REPEL_START);

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

function getClosestLetterIndex(px, py, pz) {
  if (letterColliders.length === 0) return 0;

  let bestIndex = 0;
  let bestScore = Infinity;

  for (let i = 0; i < letterColliders.length; i++) {
    const collider = letterColliders[i];
    const dx = (px - collider.centerX) / Math.max(collider.halfX, 1);
    const dy = (py - collider.centerY) / Math.max(collider.halfY, 1);
    const dz = (pz - collider.centerZ) / Math.max(collider.halfZ, 1);
    const score = dx * dx + dy * dy + dz * dz;

    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function normalizeParticleCount(value) {
  const snapped = Math.round(value / COUNT_STEP) * COUNT_STEP;
  return clamp(snapped, PARTICLE_COUNT_MIN, PARTICLE_COUNT_MAX);
}

function normalizeParticleSize(value) {
  return clamp(value, PARTICLE_SIZE_MIN, PARTICLE_SIZE_MAX);
}

function normalizeParticleOpacity(value) {
  return clamp(value, PARTICLE_OPACITY_MIN, PARTICLE_OPACITY_MAX);
}

function normalizeActivityGain(value) {
  return clamp(value, ACTIVITY_GAIN_MIN, ACTIVITY_GAIN_MAX);
}

function normalizeAmbientFlowSpeed(value) {
  return clamp(value, AMBIENT_FLOW_SPEED_MIN, AMBIENT_FLOW_SPEED_MAX);
}

function getEffectiveAmbientFlowStrength() {
  if (isMobileLayout) return 0;
  return motionTuning.ambientFlowEnabled !== false ? motionTuning.ambientFlowSpeed : 0;
}

function getEffectiveFluidInteractionMix() {
  return 1;
}

function getEffectiveMobileSwipeMix() {
  return 0;
}

function getFluidJacobiSteps() {
  return isMobileLayout ? FLUID_JACOBI_STEPS_MOBILE : FLUID_JACOBI_STEPS_DESKTOP;
}

function normalizeViscosity(value) {
  return clamp(value, VISCOSITY_MIN, VISCOSITY_MAX);
}

function normalizeParticleSizeRandomness(value) {
  return clamp(value, PARTICLE_SIZE_RANDOMNESS_MIN, PARTICLE_SIZE_RANDOMNESS_MAX);
}

function normalizeParticleOpacityRandomness(value) {
  return clamp(value, PARTICLE_OPACITY_RANDOMNESS_MIN, PARTICLE_OPACITY_RANDOMNESS_MAX);
}

function getVisualViewportMetrics() {
  const visualViewport = window.visualViewport;
  return {
    width: Math.max(
      1,
      Math.floor(
        visualViewport?.width ||
        document.documentElement.clientWidth ||
        window.innerWidth ||
        1
      )
    ),
    height: Math.max(
      1,
      Math.floor(
        visualViewport?.height ||
        document.documentElement.clientHeight ||
        window.innerHeight ||
        1
      )
    )
  };
}

function syncViewportHost() {
  const visualViewport = window.visualViewport;
  const metrics = getVisualViewportMetrics();
  const offsetLeft = Math.max(0, visualViewport?.offsetLeft || 0);
  const offsetTop = Math.max(0, visualViewport?.offsetTop || 0);
  container.style.left = `${offsetLeft}px`;
  container.style.top = `${offsetTop}px`;
  container.style.width = `${metrics.width}px`;
  container.style.height = `${metrics.height}px`;
  return metrics;
}

function getViewportDimensions() {
  const synced = syncViewportHost();
  const rect = container.getBoundingClientRect();
  return {
    width: Math.max(1, Math.floor(synced.width || rect.width || window.innerWidth || 1)),
    height: Math.max(1, Math.floor(synced.height || rect.height || window.innerHeight || 1))
  };
}

function getResponsiveDefaultBlend(width, height) {
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  const shortBlend = clamp(
    (shortSide - MOBILE_TUNING_VIEWPORT.shortSide) /
      Math.max(DESKTOP_TUNING_VIEWPORT.shortSide - MOBILE_TUNING_VIEWPORT.shortSide, 1),
    0,
    1
  );
  const longBlend = clamp(
    (longSide - MOBILE_TUNING_VIEWPORT.longSide) /
      Math.max(DESKTOP_TUNING_VIEWPORT.longSide - MOBILE_TUNING_VIEWPORT.longSide, 1),
    0,
    1
  );
  return smoothstep01(shortBlend * 0.72 + longBlend * 0.28);
}

function getResponsiveDefaultMotionTuning(width, height) {
  const desktopMix = getResponsiveDefaultBlend(width, height);
  return {
    friction: clamp(
      mixNumber(MOBILE_MOTION_TUNING.friction, DEFAULT_MOTION_TUNING.friction, desktopMix),
      FRICTION_MIN,
      FRICTION_MAX
    ),
    viscosity: normalizeViscosity(
      mixNumber(MOBILE_MOTION_TUNING.viscosity, DEFAULT_MOTION_TUNING.viscosity, desktopMix)
    ),
    radius: clamp(
      mixNumber(MOBILE_MOTION_TUNING.radius, DEFAULT_MOTION_TUNING.radius, desktopMix),
      RADIUS_MIN,
      RADIUS_MAX
    ),
    showCursor: desktopMix >= 0.5 ? DEFAULT_MOTION_TUNING.showCursor : MOBILE_MOTION_TUNING.showCursor,
    activityGain: normalizeActivityGain(
      mixNumber(MOBILE_MOTION_TUNING.activityGain, DEFAULT_MOTION_TUNING.activityGain, desktopMix)
    ),
    ambientFlowEnabled: desktopMix >= 0.5
      ? DEFAULT_MOTION_TUNING.ambientFlowEnabled
      : MOBILE_MOTION_TUNING.ambientFlowEnabled,
    ambientFlowSpeed: normalizeAmbientFlowSpeed(
      mixNumber(MOBILE_MOTION_TUNING.ambientFlowSpeed, DEFAULT_MOTION_TUNING.ambientFlowSpeed, desktopMix)
    ),
    particleCount: normalizeParticleCount(
      mixNumber(MOBILE_MOTION_TUNING.particleCount, DEFAULT_MOTION_TUNING.particleCount, desktopMix)
    ),
    particleSize: normalizeParticleSize(
      mixNumber(MOBILE_MOTION_TUNING.particleSize, DEFAULT_MOTION_TUNING.particleSize, desktopMix)
    ),
    particleOpacity: normalizeParticleOpacity(
      mixNumber(MOBILE_MOTION_TUNING.particleOpacity, DEFAULT_MOTION_TUNING.particleOpacity, desktopMix)
    ),
    particleOpacityRandomness: normalizeParticleOpacityRandomness(
      mixNumber(
        MOBILE_MOTION_TUNING.particleOpacityRandomness,
        DEFAULT_MOTION_TUNING.particleOpacityRandomness,
        desktopMix
      )
    ),
    particleSizeRandomness: normalizeParticleSizeRandomness(
      mixNumber(
        MOBILE_MOTION_TUNING.particleSizeRandomness,
        DEFAULT_MOTION_TUNING.particleSizeRandomness,
        desktopMix
      )
    )
  };
}

function getCurrentDefaultMotionTuning() {
  const { width, height } = getViewportDimensions();
  return getResponsiveDefaultMotionTuning(width, height);
}

function getFluidFieldBounds(target) {
  const shellBounds = getParticleSoftBounds(tmpV4);
  target.set(shellBounds.x, shellBounds.y);
  return target;
}

function isTuningUiTarget(target) {
  return target instanceof Element && (
    !!target.closest("#tuning-ui")
  );
}

function syncTuningPanelVisibility() {
  if (tuningUi) {
    tuningUi.dataset.panelHidden = tuningPanelHidden ? "true" : "false";
  }
  if (tuningPanel) {
    tuningPanel.hidden = tuningPanelHidden;
  }
  if (tuningToggleButton) {
    tuningToggleButton.textContent = tuningPanelHidden ? "Show Controls" : "Hide Controls";
    tuningToggleButton.setAttribute("aria-expanded", tuningPanelHidden ? "false" : "true");
  }
}

function setTuningPanelHidden(hidden, { user = false } = {}) {
  const nextHidden = !!hidden;
  if (user) {
    tuningPanelVisibilityCustomized = true;
  }
  if (tuningPanelHidden === nextHidden) {
    syncTuningPanelVisibility();
    return;
  }
  tuningPanelHidden = nextHidden;
  syncTuningPanelVisibility();
  stopPointerInteraction();
}

function applyMotionTuningPreset(preset, { save = false, stopPointer = false, resizeDelayMs = 0 } = {}) {
  if (!preset) return false;
  const next = {
    friction: clamp(preset.friction, FRICTION_MIN, FRICTION_MAX),
    viscosity: normalizeViscosity(preset.viscosity),
    radius: clamp(preset.radius, RADIUS_MIN, RADIUS_MAX),
    showCursor: preset.showCursor !== false,
    activityGain: normalizeActivityGain(preset.activityGain),
    ambientFlowEnabled: preset.ambientFlowEnabled !== false,
    ambientFlowSpeed: normalizeAmbientFlowSpeed(preset.ambientFlowSpeed),
    particleCount: normalizeParticleCount(preset.particleCount),
    particleSize: normalizeParticleSize(preset.particleSize),
    particleOpacity: normalizeParticleOpacity(preset.particleOpacity),
    particleOpacityRandomness: normalizeParticleOpacityRandomness(preset.particleOpacityRandomness),
    particleSizeRandomness: normalizeParticleSizeRandomness(preset.particleSizeRandomness)
  };

  let changed = false;
  let resizeNeeded = false;
  let materialChanged = false;
  let fluidChanged = false;

  if (Math.abs(motionTuning.friction - next.friction) > 0.000001) {
    motionTuning.friction = next.friction;
    changed = true;
  }
  if (Math.abs(motionTuning.viscosity - next.viscosity) > 0.000001) {
    motionTuning.viscosity = next.viscosity;
    changed = true;
    fluidChanged = true;
  }
  if (Math.abs(motionTuning.radius - next.radius) > 0.000001) {
    motionTuning.radius = next.radius;
    changed = true;
  }
  if ((motionTuning.showCursor !== false) !== next.showCursor) {
    motionTuning.showCursor = next.showCursor;
    changed = true;
  }
  if (Math.abs(motionTuning.activityGain - next.activityGain) > 0.000001) {
    motionTuning.activityGain = next.activityGain;
    changed = true;
  }
  if ((motionTuning.ambientFlowEnabled !== false) !== next.ambientFlowEnabled) {
    motionTuning.ambientFlowEnabled = next.ambientFlowEnabled;
    changed = true;
  }
  if (Math.abs(motionTuning.ambientFlowSpeed - next.ambientFlowSpeed) > 0.000001) {
    motionTuning.ambientFlowSpeed = next.ambientFlowSpeed;
    changed = true;
  }
  if (motionTuning.particleCount !== next.particleCount || particleTargetCount !== next.particleCount) {
    motionTuning.particleCount = next.particleCount;
    particleTargetCount = next.particleCount;
    changed = true;
    resizeNeeded = next.particleCount !== particleCount;
  }
  if (Math.abs(motionTuning.particleSize - next.particleSize) > 0.000001) {
    motionTuning.particleSize = next.particleSize;
    changed = true;
    materialChanged = true;
  }
  if (Math.abs(motionTuning.particleOpacity - next.particleOpacity) > 0.000001) {
    motionTuning.particleOpacity = next.particleOpacity;
    changed = true;
    materialChanged = true;
  }
  if (Math.abs(motionTuning.particleOpacityRandomness - next.particleOpacityRandomness) > 0.000001) {
    motionTuning.particleOpacityRandomness = next.particleOpacityRandomness;
    changed = true;
    materialChanged = true;
  }
  if (Math.abs(motionTuning.particleSizeRandomness - next.particleSizeRandomness) > 0.000001) {
    motionTuning.particleSizeRandomness = next.particleSizeRandomness;
    changed = true;
    materialChanged = true;
  }

  if (!changed) return false;

  syncTuningPanel();
  syncTuningPanelVisibility();
  if (fluidChanged) {
    gpuFluid?.updateDimensions();
  }
  if (materialChanged || resizeNeeded) {
    updateParticleMaterialTuning();
  }
  if (stopPointer) {
    stopPointerInteraction();
  }
  if (resizeNeeded && particleCount > 0) {
    scheduleParticleResize(resizeDelayMs);
  }
  if (save) {
    saveMotionTuning();
  }
  return true;
}

function getLegacyBaseParticleSize() {
  return isMobileLayout ? 12.8 : 9.8;
}

function getEffectiveFriction() {
  return clamp(
    motionTuning.friction * (0.5 + motionTuning.friction * 0.5),
    FRICTION_MIN * 0.5,
    FRICTION_MAX
  );
}

function getEffectiveFluidDecay() {
  const shapedViscosity = motionTuning.viscosity * (0.35 + motionTuning.viscosity * 0.65);
  return clamp(0.995 - shapedViscosity * 0.055, 0.94, 0.995);
}

function getEffectiveMobileFluidBlurStrength() {
  if (!isMobileLayout) return 0;
  const shapedViscosity = motionTuning.viscosity * (0.5 + motionTuning.viscosity * 0.5);
  return clamp(
    MOBILE_FLUID_BLUR_MIN + shapedViscosity * (MOBILE_FLUID_BLUR_MAX - MOBILE_FLUID_BLUR_MIN),
    0,
    MOBILE_FLUID_BLUR_MAX
  );
}

function updateParticleMaterialTuning() {
  if (!particleMaterial) return;
  const sizeUniforms = particleMaterial.userData.sizeUniforms;
  if (!sizeUniforms) return;
  const visualDensity = getParticleVisualDensity(
    particleCount || particleTargetCount || BASE_PARTICLES,
    motionTuning.particleSize
  );
  sizeUniforms.uParticleSizeScale.value = motionTuning.particleSize;
  sizeUniforms.uParticleSizeRandomness.value = motionTuning.particleSizeRandomness;
  sizeUniforms.uParticleOpacity.value = motionTuning.particleOpacity;
  sizeUniforms.uParticleOpacityRandomness.value = motionTuning.particleOpacityRandomness;
  sizeUniforms.uViewportScale.value = renderer.domElement.height * 0.5;
  sizeUniforms.uParticleDensitySize.value = visualDensity.size;
  sizeUniforms.uParticleDensityAlpha.value = visualDensity.alpha;
  sizeUniforms.uParticleDensityGlow.value = visualDensity.glow;
  sizeUniforms.uParticleDensityWhite.value = visualDensity.white;
}

function getParticleSoftBounds(target) {
  target.set(
    viewportBounds.x * OUTER_SHELL_SCALE_XY,
    viewportBounds.y * OUTER_SHELL_SCALE_XY,
    particleField.z
  );
  return target;
}

function getParticleHardBounds(target) {
  return target.set(
    viewportBounds.x * OUTER_SHELL_SCALE_XY * PARTICLE_HARD_BOUND_SCALE_XY,
    viewportBounds.y * OUTER_SHELL_SCALE_XY * PARTICLE_HARD_BOUND_SCALE_XY,
    particleField.z * PARTICLE_HARD_BOUND_SCALE_Z
  );
}

function getMaxCursorRadius() {
  return Math.max(0, Math.min(viewportBounds.x, viewportBounds.y) - 2);
}

function getParticleVisualDensity(count, particleSize) {
  const referenceCount = 80000;
  const referenceSize = 5.8;
  const relativeCoverage = Math.max(
    (Math.max(count, 1) * Math.max(particleSize, 1) * Math.max(particleSize, 1)) /
      (referenceCount * referenceSize * referenceSize),
    1
  );
  return {
    size: clamp(Math.pow(1 / relativeCoverage, 0.12), 0.72, 1),
    alpha: clamp(Math.pow(1 / relativeCoverage, 0.78), 0.05, 1),
    glow: clamp(Math.pow(1 / relativeCoverage, 0.52), 0.18, 1),
    white: clamp(Math.pow(1 / relativeCoverage, 0.92), 0.02, 1)
  };
}

function loadMotionTuning() {
  const defaults = getCurrentDefaultMotionTuning();
  try {
    const raw = window.localStorage.getItem(TUNING_STORAGE_KEY);
    if (!raw) {
      motionTuningUsesResponsiveDefaults = true;
      return { ...defaults };
    }
    const parsed = JSON.parse(raw);
    const parsedFriction = Number(parsed.friction);
    const parsedViscosity = Number(parsed.viscosity);
    const parsedRadius = Number(parsed.radius);
    const parsedShowCursor = parsed.showCursor;
    const parsedActivityGain = Number(parsed.activityGain);
    const parsedAmbientFlowEnabled = parsed.ambientFlowEnabled;
    const parsedAmbientFlowSpeed = Number(parsed.ambientFlowSpeed);
    const parsedParticleCount = parsed.particleCount == null ? null : Number(parsed.particleCount);
    const parsedParticleSize = Number(parsed.particleSize);
    const parsedParticleOpacity = Number(parsed.particleOpacity);
    const parsedParticleOpacityRandomness = Number(parsed.particleOpacityRandomness);
    const parsedParticleSizeRandomness = Number(parsed.particleSizeRandomness);
    motionTuningUsesResponsiveDefaults = parsed.responsiveDefaults === true;
    const normalizedRadius = Number.isFinite(parsedRadius)
      ? parsedRadius > 1
        ? (parsedRadius - LEGACY_RADIUS_MIN) / Math.max(LEGACY_RADIUS_MAX - LEGACY_RADIUS_MIN, 0.001)
        : parsedRadius
      : NaN;
    return {
      friction: Number.isFinite(parsedFriction)
        ? clamp(parsedFriction, FRICTION_MIN, FRICTION_MAX)
        : defaults.friction,
      viscosity: Number.isFinite(parsedViscosity)
        ? normalizeViscosity(parsedViscosity)
        : defaults.viscosity,
      radius: Number.isFinite(normalizedRadius)
        ? clamp(normalizedRadius < RADIUS_MIN ? defaults.radius : normalizedRadius, RADIUS_MIN, RADIUS_MAX)
        : defaults.radius,
      showCursor: typeof parsedShowCursor === "boolean"
        ? parsedShowCursor
        : defaults.showCursor,
      activityGain: Number.isFinite(parsedActivityGain)
        ? normalizeActivityGain(parsedActivityGain)
        : defaults.activityGain,
      ambientFlowEnabled: typeof parsedAmbientFlowEnabled === "boolean"
        ? parsedAmbientFlowEnabled
        : defaults.ambientFlowEnabled,
      ambientFlowSpeed: Number.isFinite(parsedAmbientFlowSpeed)
        ? normalizeAmbientFlowSpeed(parsedAmbientFlowSpeed)
        : defaults.ambientFlowSpeed,
      particleCount: parsedParticleCount != null && Number.isFinite(parsedParticleCount)
        ? normalizeParticleCount(parsedParticleCount)
        : defaults.particleCount,
      particleSize: Number.isFinite(parsedParticleSize)
        ? normalizeParticleSize(
          parsedParticleSize <= 2.5
            ? getLegacyBaseParticleSize() * parsedParticleSize
            : parsedParticleSize
        )
        : defaults.particleSize,
      particleOpacity: Number.isFinite(parsedParticleOpacity)
        ? normalizeParticleOpacity(parsedParticleOpacity)
        : defaults.particleOpacity,
      particleOpacityRandomness: Number.isFinite(parsedParticleOpacityRandomness)
        ? normalizeParticleOpacityRandomness(parsedParticleOpacityRandomness)
        : defaults.particleOpacityRandomness,
      particleSizeRandomness: Number.isFinite(parsedParticleSizeRandomness)
        ? normalizeParticleSizeRandomness(parsedParticleSizeRandomness)
        : defaults.particleSizeRandomness
    };
  } catch {
    motionTuningUsesResponsiveDefaults = true;
    return { ...defaults };
  }
}

function saveMotionTuning() {
  try {
    window.localStorage.setItem(TUNING_STORAGE_KEY, JSON.stringify({
      ...motionTuning,
      responsiveDefaults: motionTuningUsesResponsiveDefaults
    }));
  } catch {
    // Ignore storage failures; runtime tuning still works for the session.
  }
}

function scheduleParticleResize(delayMs = 0) {
  if (particleResizeTimeout) {
    window.clearTimeout(particleResizeTimeout);
    particleResizeTimeout = 0;
  }
  const runResize = () => {
    particleResizeTimeout = 0;
    if (!textReady || !particleTargetCount || particleTargetCount === particleCount) return;
    resizeParticleSystem(particleTargetCount);
    syncTuningPanel();
  };
  if (delayMs <= 0) {
    runResize();
    return;
  }
  particleResizeTimeout = window.setTimeout(runResize, delayMs);
}

function syncTuningPanel() {
  const displayParticleCount = motionTuning.particleCount ?? (particleTargetCount || particleCount || BASE_PARTICLES);
  const ambientDisabled = isMobileLayout;
  const ambientDisplayEnabled = !ambientDisabled && motionTuning.ambientFlowEnabled !== false;
  const ambientDisplaySpeed = ambientDisabled ? 0 : motionTuning.ambientFlowSpeed;
  if (frictionInput) frictionInput.value = motionTuning.friction.toFixed(4);
  if (frictionNumberInput) frictionNumberInput.value = (motionTuning.friction * 100).toFixed(2);
  if (viscosityInput) viscosityInput.value = motionTuning.viscosity.toFixed(3);
  if (viscosityNumberInput) viscosityNumberInput.value = (motionTuning.viscosity * 100).toFixed(0);
  if (radiusInput) radiusInput.value = motionTuning.radius.toFixed(3);
  if (radiusNumberInput) radiusNumberInput.value = (motionTuning.radius * 100).toFixed(0);
  if (showCursorInput) showCursorInput.checked = motionTuning.showCursor !== false;
  if (activityGainInput) activityGainInput.value = motionTuning.activityGain.toFixed(2);
  if (activityGainNumberInput) activityGainNumberInput.value = (motionTuning.activityGain * 100).toFixed(0);
  if (ambientFlowEnabledInput) {
    ambientFlowEnabledInput.checked = ambientDisplayEnabled;
    ambientFlowEnabledInput.disabled = ambientDisabled;
    ambientFlowEnabledInput.title = ambientDisabled ? "Ambient flow is temporarily disabled on mobile for debugging." : "";
  }
  if (ambientFlowSpeedInput) {
    ambientFlowSpeedInput.value = ambientDisplaySpeed.toFixed(2);
    ambientFlowSpeedInput.disabled = ambientDisabled;
    ambientFlowSpeedInput.title = ambientDisabled ? "Ambient flow is temporarily disabled on mobile for debugging." : "";
  }
  if (ambientFlowSpeedNumberInput) {
    ambientFlowSpeedNumberInput.value = (ambientDisplaySpeed * 100).toFixed(1);
    ambientFlowSpeedNumberInput.disabled = ambientDisabled;
    ambientFlowSpeedNumberInput.title = ambientDisabled ? "Ambient flow is temporarily disabled on mobile for debugging." : "";
  }
  if (particleCountInput) particleCountInput.value = String(displayParticleCount);
  if (particleCountNumberInput) particleCountNumberInput.value = String(displayParticleCount);
  if (particleSizeInput) particleSizeInput.value = motionTuning.particleSize.toFixed(1);
  if (particleSizeNumberInput) particleSizeNumberInput.value = motionTuning.particleSize.toFixed(1);
  if (particleOpacityInput) particleOpacityInput.value = motionTuning.particleOpacity.toFixed(2);
  if (particleOpacityNumberInput) {
    particleOpacityNumberInput.value = (motionTuning.particleOpacity * 100).toFixed(0);
  }
  if (particleOpacityRandomnessInput) {
    particleOpacityRandomnessInput.value = motionTuning.particleOpacityRandomness.toFixed(2);
  }
  if (particleOpacityRandomnessNumberInput) {
    particleOpacityRandomnessNumberInput.value = (motionTuning.particleOpacityRandomness * 100).toFixed(0);
  }
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
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.friction = clamp(value, FRICTION_MIN, FRICTION_MAX);
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyViscosity = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.viscosity = normalizeViscosity(value);
    syncTuningPanel();
    gpuFluid?.updateDimensions();
    saveMotionTuning();
  };

  const applyRadius = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.radius = clamp(value, RADIUS_MIN, RADIUS_MAX);
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyShowCursor = (value) => {
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.showCursor = value !== false;
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyActivityGain = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.activityGain = normalizeActivityGain(value);
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyAmbientFlowEnabled = (value) => {
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.ambientFlowEnabled = value !== false;
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyAmbientFlowSpeed = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.ambientFlowSpeed = normalizeAmbientFlowSpeed(value);
    syncTuningPanel();
    saveMotionTuning();
  };

  const applyParticleCount = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.particleCount = normalizeParticleCount(value);
    particleTargetCount = motionTuning.particleCount;
    syncTuningPanel();
    saveMotionTuning();
    scheduleParticleResize(50);
  };

  const applyParticleSize = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.particleSize = normalizeParticleSize(value);
    syncTuningPanel();
    updateParticleMaterialTuning();
    saveMotionTuning();
  };

  const applyParticleOpacity = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.particleOpacity = normalizeParticleOpacity(value);
    syncTuningPanel();
    updateParticleMaterialTuning();
    saveMotionTuning();
  };

  const applyParticleOpacityRandomness = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.particleOpacityRandomness = normalizeParticleOpacityRandomness(value);
    syncTuningPanel();
    updateParticleMaterialTuning();
    saveMotionTuning();
  };

  const applyParticleSizeRandomness = (value) => {
    if (!Number.isFinite(value)) return;
    motionTuningUsesResponsiveDefaults = false;
    motionTuning.particleSizeRandomness = normalizeParticleSizeRandomness(value);
    syncTuningPanel();
    updateParticleMaterialTuning();
    saveMotionTuning();
  };

  const applyDefaults = () => {
    motionTuningUsesResponsiveDefaults = true;
    applyMotionTuningPreset(getCurrentDefaultMotionTuning(), {
      save: true,
      stopPointer: true,
      resizeDelayMs: 0
    });
  };

  syncTuningPanel();

  frictionInput?.addEventListener("input", () => {
    applyFriction(Number(frictionInput.value));
  });

  viscosityInput?.addEventListener("input", () => {
    applyViscosity(Number(viscosityInput.value));
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

  viscosityNumberInput?.addEventListener("input", () => {
    applyViscosity(Number(viscosityNumberInput.value) / 100);
  });

  viscosityNumberInput?.addEventListener("change", () => {
    applyViscosity(Number(viscosityNumberInput.value) / 100);
  });

  radiusNumberInput?.addEventListener("input", () => {
    applyRadius(Number(radiusNumberInput.value) / 100);
  });

  radiusNumberInput?.addEventListener("change", () => {
    applyRadius(Number(radiusNumberInput.value) / 100);
  });

  showCursorInput?.addEventListener("change", () => {
    applyShowCursor(showCursorInput.checked);
  });

  activityGainInput?.addEventListener("input", () => {
    applyActivityGain(Number(activityGainInput.value));
  });

  activityGainNumberInput?.addEventListener("input", () => {
    applyActivityGain(Number(activityGainNumberInput.value) / 100);
  });

  activityGainNumberInput?.addEventListener("change", () => {
    applyActivityGain(Number(activityGainNumberInput.value) / 100);
  });

  ambientFlowEnabledInput?.addEventListener("change", () => {
    applyAmbientFlowEnabled(ambientFlowEnabledInput.checked);
  });

  ambientFlowSpeedInput?.addEventListener("input", () => {
    applyAmbientFlowSpeed(Number(ambientFlowSpeedInput.value));
  });

  ambientFlowSpeedNumberInput?.addEventListener("input", () => {
    applyAmbientFlowSpeed(Number(ambientFlowSpeedNumberInput.value) / 100);
  });

  ambientFlowSpeedNumberInput?.addEventListener("change", () => {
    applyAmbientFlowSpeed(Number(ambientFlowSpeedNumberInput.value) / 100);
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
    applyParticleSize(Number(particleSizeNumberInput.value));
  });

  particleSizeNumberInput?.addEventListener("change", () => {
    applyParticleSize(Number(particleSizeNumberInput.value));
  });

  particleOpacityInput?.addEventListener("input", () => {
    applyParticleOpacity(Number(particleOpacityInput.value));
  });

  particleOpacityNumberInput?.addEventListener("input", () => {
    applyParticleOpacity(Number(particleOpacityNumberInput.value) / 100);
  });

  particleOpacityNumberInput?.addEventListener("change", () => {
    applyParticleOpacity(Number(particleOpacityNumberInput.value) / 100);
  });

  particleOpacityRandomnessInput?.addEventListener("input", () => {
    applyParticleOpacityRandomness(Number(particleOpacityRandomnessInput.value));
  });

  particleOpacityRandomnessNumberInput?.addEventListener("input", () => {
    applyParticleOpacityRandomness(Number(particleOpacityRandomnessNumberInput.value) / 100);
  });

  particleOpacityRandomnessNumberInput?.addEventListener("change", () => {
    applyParticleOpacityRandomness(Number(particleOpacityRandomnessNumberInput.value) / 100);
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

  tuningResetButton?.addEventListener("click", () => {
    applyDefaults();
  });

  tuningToggleButton?.addEventListener("click", () => {
    setTuningPanelHidden(!tuningPanelHidden, { user: true });
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
  const radius = sizePx * 0.49;

  const shadow = ctx.createRadialGradient(
    center,
    center,
    sizePx * 0.02,
    center,
    center,
    radius
  );
  shadow.addColorStop(0, "rgba(255,255,255,1)");
  shadow.addColorStop(0.68, "rgba(255,255,255,1)");
  shadow.addColorStop(0.78, "rgba(255,255,255,0.98)");
  shadow.addColorStop(0.84, "rgba(255,255,255,0.2)");
  shadow.addColorStop(0.88, "rgba(255,255,255,0)");
  shadow.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.arc(center, center, radius, 0, Math.PI * 2);
  ctx.fill();

  const halo = ctx.createRadialGradient(
    center,
    center,
    sizePx * 0.18,
    center,
    center,
    sizePx * 0.5
  );
  halo.addColorStop(0, "rgba(255,255,255,0)");
  halo.addColorStop(0.78, "rgba(255,255,255,0)");
  halo.addColorStop(0.88, "rgba(255,255,255,0.06)");
  halo.addColorStop(0.96, "rgba(255,255,255,0.18)");
  halo.addColorStop(0.995, "rgba(255,255,255,0.02)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(center, center, sizePx * 0.5, 0, Math.PI * 2);
  ctx.fill();

  const highlight = ctx.createRadialGradient(
    center - sizePx * 0.12,
    center - sizePx * 0.14,
    0,
    center - sizePx * 0.12,
    center - sizePx * 0.14,
    sizePx * 0.24
  );
  highlight.addColorStop(0, "rgba(255,255,255,0.2)");
  highlight.addColorStop(0.28, "rgba(255,255,255,0.04)");
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

function buildParticleSimulationCommonGLSL() {
  return `
uniform sampler2D uParticleBaseTexture;
uniform sampler2D uFluidTexture;
uniform float uParticleCount;
uniform float uTime;
uniform float uDeltaTime;
uniform float uFrameScale;
uniform float uEffectiveFriction;
uniform float uActivityGain;
uniform float uAmbientFlowStrength;
uniform float uAmbientMobileMix;
uniform float uFluidInteractionMix;
uniform float uMobileSwipeMix;
uniform float uPointerActive;
uniform float uPointerEnergy;
uniform float uHitRadius;
uniform vec3 uPointerPosition;
uniform vec3 uPointerPreviousPosition;
uniform vec3 uPointerVelocity;
uniform vec3 uOuterBounds;
uniform vec2 uFluidBounds;
uniform vec2 uFluidResolution;

float hash11(const float value) {
  return fract(sin(value * 127.1) * 43758.5453123);
}

float normalizedBoundaryProximity(const float value, const float bound, const float start) {
  return clamp((abs(value) / max(bound, 1.0) - start) / (1.0 - start), 0.0, 1.0);
}

vec2 particleUv() {
  return gl_FragCoord.xy / resolution.xy;
}

float particleIndex() {
  vec2 coord = gl_FragCoord.xy - vec2(0.5);
  return coord.y * resolution.x + coord.x;
}

vec2 fluidUvForWorld(const vec2 world) {
  return clamp((world + uFluidBounds) / (uFluidBounds * 2.0), 0.0, 1.0);
}

vec2 sampleFluidTextureLinear(const vec2 uv) {
  vec2 resolutionSafe = max(uFluidResolution, vec2(1.0));
  vec2 grid = clamp(uv, 0.0, 1.0) * resolutionSafe - 0.5;
  vec2 base = floor(grid);
  vec2 fracPart = fract(grid);
  vec2 maxBase = max(resolutionSafe - 1.0, vec2(0.0));

  vec2 baseClamped = clamp(base, vec2(0.0), maxBase);
  vec2 next = clamp(baseClamped + 1.0, vec2(0.0), maxBase);

  vec2 uv00 = (baseClamped + vec2(0.5)) / resolutionSafe;
  vec2 uv10 = vec2(next.x + 0.5, baseClamped.y + 0.5) / resolutionSafe;
  vec2 uv01 = vec2(baseClamped.x + 0.5, next.y + 0.5) / resolutionSafe;
  vec2 uv11 = (next + vec2(0.5)) / resolutionSafe;

  vec2 s00 = texture2D(uFluidTexture, uv00).xy;
  vec2 s10 = texture2D(uFluidTexture, uv10).xy;
  vec2 s01 = texture2D(uFluidTexture, uv01).xy;
  vec2 s11 = texture2D(uFluidTexture, uv11).xy;
  vec2 sx0 = mix(s00, s10, fracPart.x);
  vec2 sx1 = mix(s01, s11, fracPart.x);
  return mix(sx0, sx1, fracPart.y);
}

vec2 sampleFluidField(const vec3 position, const float seed) {
  if (uFluidInteractionMix <= 0.0001) {
    return vec2(0.0);
  }
  float sampleOffsetX =
    sin(seed * 11.7 + position.z * 0.006 + uTime * 0.14) * 4.8 +
    sin(seed * 23.1 - position.y * 0.012 - uTime * 0.48) * 2.2;
  float sampleOffsetY =
    cos(seed * 13.1 + position.z * 0.005 - uTime * 0.11) * 4.8 +
    cos(seed * 19.7 + position.x * 0.014 + uTime * 0.41) * 2.2;

  vec2 flowA = sampleFluidTextureLinear(fluidUvForWorld(vec2(position.x + sampleOffsetX, position.y + sampleOffsetY)));
  vec2 flowB = sampleFluidTextureLinear(fluidUvForWorld(vec2(position.x - sampleOffsetY * 0.45, position.y + sampleOffsetX * 0.45)));
  return mix(flowA, flowB, 0.35) * uFluidInteractionMix;
}

vec2 sampleAmbientVortex(const vec2 domain, const vec2 center, const float spin, const float radius) {
  vec2 delta = domain - center;
  float falloff = exp(-dot(delta, delta) / max(radius, 0.0001));
  vec2 tangent = vec2(-delta.y, delta.x);
  float radiusMag = sqrt(dot(delta, delta) + radius * 0.45);
  return tangent * (spin * falloff / max(radiusMag, 0.0001));
}

vec3 sampleMobileAmbientFlow(const vec3 position, const float seed, const float turbulence) {
  float gain = clamp(uAmbientFlowStrength / ${AMBIENT_FLOW_SPEED_MAX.toFixed(6)}, 0.0, 1.0) * uAmbientMobileMix;
  if (gain <= 0.0001) {
    return vec3(0.0);
  }

  vec2 bounds = max(uFluidBounds, vec2(1.0));
  vec2 domain = position.xy / bounds;
  float phase = uTime * mix(0.045, 0.18, sqrt(gain));

  vec2 flow = vec2(0.0);
  flow += sampleAmbientVortex(
    domain,
    vec2(sin(phase * 0.73) * 0.58, cos(phase * 0.91) * 0.44),
    1.0,
    0.26
  );
  flow += sampleAmbientVortex(
    domain,
    vec2(cos(phase * 0.41 + 1.7) * 0.52, sin(phase * 0.63 + 0.8) * 0.36),
    -0.92,
    0.31
  );
  flow += sampleAmbientVortex(
    domain,
    vec2(sin(phase * 0.29 - 0.9) * 0.28, cos(phase * 0.38 + 2.4) * 0.62),
    0.74,
    0.42
  );

  vec2 driftDir = normalize(vec2(1.0, -0.12 + sin(seed * 6.1) * 0.05));
  float streamMask = exp(-dot(domain * vec2(0.68, 0.46), domain));
  flow += driftDir * streamMask * 0.34;

  float amplitude = mix(0.0012, 0.0115, pow(gain, 1.15));
  flow *= amplitude * mix(0.82, 1.08, clamp(turbulence - 0.75, 0.0, 1.0) * 0.5);

  float depth = (
    sin(seed * 13.7 + uTime * 0.61 + domain.x * 2.3) +
    cos(seed * 7.1 - uTime * 0.47 + domain.y * 1.9)
  ) * 0.5;

  return vec3(flow, depth * amplitude * 0.22);
}

void applyEdgeRepulsion(const vec3 position, const float seed, inout vec3 velocity) {
  float signX = position.x < 0.0 ? -1.0 : 1.0;
  float signY = position.y < 0.0 ? -1.0 : 1.0;
  float signZ = position.z < 0.0 ? -1.0 : 1.0;
  float nearX = normalizedBoundaryProximity(position.x, uOuterBounds.x, ${EDGE_REPEL_START.toFixed(6)});
  float nearY = normalizedBoundaryProximity(position.y, uOuterBounds.y, ${EDGE_REPEL_START.toFixed(6)});
  float nearZ = normalizedBoundaryProximity(position.z, uOuterBounds.z, ${EDGE_REPEL_START.toFixed(6)});

  vec3 boundaryForce = vec3(0.0);
  float dampX = 1.0;
  float dampY = 1.0;
  float dampZ = 1.0;

  if (nearX > 0.0) {
    float force = ${EDGE_REPEL_FORCE.toFixed(6)} * nearX * nearX * uFrameScale;
    float jitter = ${EDGE_REPEL_JITTER.toFixed(6)} * nearX * uFrameScale;
    boundaryForce.x -= signX * force;
    boundaryForce.y += sin(seed * 19.7 + uTime * 3.3) * jitter * 0.4;
    boundaryForce.z += cos(seed * 27.1 - uTime * 2.9) * jitter * 0.25;
    dampX -= nearX * ${EDGE_REPEL_DAMP.toFixed(6)};
  }
  if (nearY > 0.0) {
    float force = ${EDGE_REPEL_FORCE.toFixed(6)} * nearY * nearY * uFrameScale;
    float jitter = ${EDGE_REPEL_JITTER.toFixed(6)} * nearY * uFrameScale;
    boundaryForce.y -= signY * force;
    boundaryForce.x += cos(seed * 23.3 + uTime * 3.7) * jitter * 0.4;
    boundaryForce.z += sin(seed * 31.9 - uTime * 2.5) * jitter * 0.25;
    dampY -= nearY * ${EDGE_REPEL_DAMP.toFixed(6)};
  }
  if (nearZ > 0.0) {
    float force = ${EDGE_REPEL_FORCE.toFixed(6)} * nearZ * nearZ * uFrameScale * 0.6;
    float jitter = ${EDGE_REPEL_JITTER.toFixed(6)} * nearZ * uFrameScale * 0.5;
    boundaryForce.z -= signZ * force;
    boundaryForce.x += sin(seed * 17.1 - uTime * 2.8) * jitter * 0.35;
    boundaryForce.y += cos(seed * 13.9 + uTime * 3.1) * jitter * 0.35;
    dampZ -= nearZ * ${EDGE_REPEL_DAMP.toFixed(6)};
  }

  float edgeXY = nearX * nearY;
  float edgeXZ = nearX * nearZ;
  float edgeYZ = nearY * nearZ;
  if (edgeXY > 0.0) {
    boundaryForce.x -= signX * ${EDGE_REPEL_FORCE.toFixed(6)} * edgeXY * edgeXY * uFrameScale * 0.55;
    boundaryForce.y -= signY * ${EDGE_REPEL_FORCE.toFixed(6)} * edgeXY * edgeXY * uFrameScale * 0.55;
    dampX -= edgeXY * ${EDGE_REPEL_DAMP.toFixed(6)};
    dampY -= edgeXY * ${EDGE_REPEL_DAMP.toFixed(6)};
  }
  if (edgeXZ > 0.0) {
    boundaryForce.x -= signX * ${EDGE_REPEL_FORCE.toFixed(6)} * edgeXZ * edgeXZ * uFrameScale * 0.4;
    boundaryForce.z -= signZ * ${EDGE_REPEL_FORCE.toFixed(6)} * edgeXZ * edgeXZ * uFrameScale * 0.4;
    dampX -= edgeXZ * ${EDGE_REPEL_DAMP.toFixed(6)};
    dampZ -= edgeXZ * ${EDGE_REPEL_DAMP.toFixed(6)};
  }
  if (edgeYZ > 0.0) {
    boundaryForce.y -= signY * ${EDGE_REPEL_FORCE.toFixed(6)} * edgeYZ * edgeYZ * uFrameScale * 0.4;
    boundaryForce.z -= signZ * ${EDGE_REPEL_FORCE.toFixed(6)} * edgeYZ * edgeYZ * uFrameScale * 0.4;
    dampY -= edgeYZ * ${EDGE_REPEL_DAMP.toFixed(6)};
    dampZ -= edgeYZ * ${EDGE_REPEL_DAMP.toFixed(6)};
  }

  velocity.x = velocity.x * clamp(dampX, 0.72, 1.0) + boundaryForce.x;
  velocity.y = velocity.y * clamp(dampY, 0.72, 1.0) + boundaryForce.y;
  velocity.z = velocity.z * clamp(dampZ, 0.72, 1.0) + boundaryForce.z;
}

void simulateVelocity(
  const vec3 position,
  const vec3 velocityIn,
  const float seed,
  const float turbulence,
  const float mass,
  const float spin,
  const float colorMix,
  const float wake,
  out vec3 nextVelocity,
  out float hitFalloff
) {
  vec3 velocity = velocityIn;
  vec2 flow = sampleFluidField(position, seed);
  float hitInfluence = max(colorMix, clamp(wake, 0.0, 1.0));
  float fluidCoupling = (${FLUID_COUPLING_BASE.toFixed(6)} + hitInfluence * ${FLUID_COUPLING_WAKE.toFixed(6)}) * uFrameScale / max(mass, 0.0001);
  float fluidRelax = clamp((${FLUID_RELAX_BASE.toFixed(6)} + hitInfluence * ${FLUID_RELAX_WAKE.toFixed(6)}) * uFrameScale / max(mass, 0.0001), 0.0, 0.12);
  velocity.x += flow.x * fluidCoupling;
  velocity.y += flow.y * fluidCoupling;
  velocity.x += (flow.x - velocity.x) * fluidRelax;
  velocity.y += (flow.y - velocity.y) * fluidRelax;

  vec3 ambientFlow = sampleMobileAmbientFlow(position, seed, turbulence);
  if (length(ambientFlow) > 0.00001) {
    float ambientCoupling = mix(0.7, 1.35, wake) * uFrameScale / max(mass, 0.0001);
    velocity += ambientFlow * ambientCoupling;
  }

  hitFalloff = 0.0;
  if (uPointerActive > 0.5 && uPointerEnergy > 0.0001 && uHitRadius > 0.001) {
    vec3 hit = position - uPointerPosition;
    if (uMobileSwipeMix > 0.5) {
      vec2 segment = uPointerPosition.xy - uPointerPreviousPosition.xy;
      float segmentLen = length(segment);
      vec2 swipeVec = segmentLen > 0.0001 ? segment : uPointerVelocity.xy;
      float swipeSpeed = length(swipeVec);
      if (swipeSpeed > 0.0001) {
        vec2 swipeDir = swipeVec / swipeSpeed;
        vec2 segmentStart = uPointerPreviousPosition.xy - swipeDir * (uHitRadius * 0.35);
        vec2 segmentEnd = uPointerPosition.xy + swipeDir * (uHitRadius * 0.22);
        vec2 segmentVec = segmentEnd - segmentStart;
        float segmentLenSq = max(dot(segmentVec, segmentVec), 0.0001);
        float projectedT = clamp(dot(position.xy - segmentStart, segmentVec) / segmentLenSq, 0.0, 1.0);
        vec2 nearest = segmentStart + segmentVec * projectedT;
        vec2 delta = position.xy - nearest;
        float swipeRadius = uHitRadius * 2.35;
        float distSq = dot(delta, delta);
        float swipeRadiusSq = swipeRadius * swipeRadius;
        if (distSq < swipeRadiusSq) {
          vec2 perpendicular = vec2(-swipeDir.y, swipeDir.x);
          float lateral = dot(delta, perpendicular);
          float distNorm = sqrt(distSq) / max(swipeRadius, 0.0001);
          float coreFalloff = clamp(1.0 - distNorm, 0.0, 1.0);
          float swipeFalloff = coreFalloff * coreFalloff * (3.0 - 2.0 * coreFalloff);
          float trailBias = mix(0.65, 1.15, projectedT);
          float sweepForce =
            (uPointerEnergy * 0.16 + swipeSpeed * 0.74) *
            swipeFalloff *
            trailBias *
            uFrameScale;
          velocity.xy += swipeDir * sweepForce;
          velocity.xy -= delta * swipeFalloff * 0.038 * uFrameScale;
          velocity.xy -= perpendicular * lateral * swipeFalloff * 0.012 * uFrameScale;
          velocity.z += (sin(seed * 21.7 + uTime * 4.2) * 0.02 - hit.z * 0.01) * sweepForce;
          hitFalloff = swipeFalloff * clamp(swipeSpeed * 0.95, 0.0, 1.0);
        }
      }
    } else {
      float hitDistSq = dot(hit, hit);
      float hitRadiusSq = uHitRadius * uHitRadius;
      if (hitDistSq < hitRadiusSq) {
        float dist = sqrt(hitDistSq);
        vec3 normal = dist > 0.0001
          ? hit / dist
          : normalize(vec3(hash11(seed * 3.1) - 0.5, hash11(seed * 7.7) - 0.5, hash11(seed * 11.9) - 0.5));
        hitFalloff = pow(1.0 - hitDistSq / hitRadiusSq, 2.0);
        float depthLift = uPointerEnergy * hitFalloff * 0.16 * uFrameScale;
        velocity.x += normal.x * depthLift * 0.14;
        velocity.y += normal.y * depthLift * 0.14;
        velocity.z += normal.z * depthLift * 0.18 + (hash11(seed * 97.0) - 0.5) * depthLift * 0.08;
      }
    }
  }

  vec3 hardBounds = vec3(
    uOuterBounds.xy * ${PARTICLE_HARD_BOUND_SCALE_XY.toFixed(6)},
    uOuterBounds.z * ${PARTICLE_HARD_BOUND_SCALE_Z.toFixed(6)}
  );

  if (position.x < -hardBounds.x || position.x > hardBounds.x) {
    velocity.x += (position.x < -hardBounds.x ? -hardBounds.x - position.x : hardBounds.x - position.x) * 0.09 * uFrameScale;
    velocity.x *= 0.82;
  }
  if (position.y < -hardBounds.y || position.y > hardBounds.y) {
    velocity.y += (position.y < -hardBounds.y ? -hardBounds.y - position.y : hardBounds.y - position.y) * 0.09 * uFrameScale;
    velocity.y *= 0.82;
  }
  if (position.z < -hardBounds.z || position.z > hardBounds.z) {
    velocity.z += (position.z < -hardBounds.z ? -hardBounds.z - position.z : hardBounds.z - position.z) * 0.035 * uFrameScale;
    velocity.z *= 0.84;
  }

  float speed = length(velocity);
  float planarSpeed = length(velocity.xy);
  float eddy = wake * clamp(planarSpeed * 0.016 * turbulence, 0.0, 0.085) * uFrameScale;
  if (eddy > 0.0001) {
    float prevVx = velocity.x;
    float prevVy = velocity.y;
    velocity.z += sin(uTime * 1.55 + seed * 6.283) * eddy * 0.42;
    velocity.x += -prevVy * spin * eddy * 0.08;
    velocity.y += prevVx * spin * eddy * 0.08;
  }

  speed = length(velocity);
  float dragBase = 0.994 - uEffectiveFriction * 0.018;
  float dragMin = 0.968 - uEffectiveFriction * 0.036;
  float dragMax = 0.998 - uEffectiveFriction * 0.004;
  float drag = clamp(dragBase - speed * 0.00045 * uFrameScale - wake * 0.0026 * uFrameScale, dragMin, dragMax);
  velocity.x *= drag;
  velocity.y *= drag;
  velocity.z *= clamp(drag - 0.008, 0.9, 0.988);

  if (speed < 0.0025) {
    velocity.x *= 0.8;
    velocity.y *= 0.8;
    velocity.z *= 0.72;
  }

  nextVelocity = velocity;
}
`;
}

function buildParticleVelocityShader() {
  return `
${buildParticleSimulationCommonGLSL()}
void main() {
  vec2 uv = particleUv();
  if (particleIndex() >= uParticleCount) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec4 positionData = texture2D(textureParticlePosition, uv);
  vec4 velocityData = texture2D(textureParticleVelocity, uv);
  vec4 visualData = texture2D(textureParticleVisual, uv);
  vec4 baseData = texture2D(uParticleBaseTexture, uv);

  vec3 nextVelocity;
  float hitFalloff;
  simulateVelocity(
    positionData.xyz,
    velocityData.xyz,
    baseData.x,
    baseData.y,
    baseData.z,
    baseData.w * 2.0 - 1.0,
    visualData.x,
    visualData.y,
    nextVelocity,
    hitFalloff
  );
  gl_FragColor = vec4(nextVelocity, 1.0);
}
`;
}

function buildParticlePositionShader() {
  return `
${buildParticleSimulationCommonGLSL()}
void main() {
  vec2 uv = particleUv();
  if (particleIndex() >= uParticleCount) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec4 positionData = texture2D(textureParticlePosition, uv);
  vec4 velocityData = texture2D(textureParticleVelocity, uv);
  vec4 visualData = texture2D(textureParticleVisual, uv);
  vec4 baseData = texture2D(uParticleBaseTexture, uv);

  vec3 nextVelocity;
  float hitFalloff;
  simulateVelocity(
    positionData.xyz,
    velocityData.xyz,
    baseData.x,
    baseData.y,
    baseData.z,
    baseData.w * 2.0 - 1.0,
    visualData.x,
    visualData.y,
    nextVelocity,
    hitFalloff
  );
  gl_FragColor = vec4(positionData.xyz + nextVelocity * uFrameScale, 0.0);
}
`;
}

function buildParticleVisualShader() {
  return `
${buildParticleSimulationCommonGLSL()}
void main() {
  vec2 uv = particleUv();
  if (particleIndex() >= uParticleCount) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec4 positionData = texture2D(textureParticlePosition, uv);
  vec4 velocityData = texture2D(textureParticleVelocity, uv);
  vec4 visualData = texture2D(textureParticleVisual, uv);
  vec4 baseData = texture2D(uParticleBaseTexture, uv);

  vec3 nextVelocity;
  float hitFalloff;
  simulateVelocity(
    positionData.xyz,
    velocityData.xyz,
    baseData.x,
    baseData.y,
    baseData.z,
    baseData.w * 2.0 - 1.0,
    visualData.x,
    visualData.y,
    nextVelocity,
    hitFalloff
  );

  vec3 deltaVelocity = nextVelocity - velocityData.xyz;
  float prevSpeed = length(velocityData.xyz);
  float nextSpeed = length(nextVelocity);
  float speedDelta = abs(nextSpeed - prevSpeed);
  float directionalDelta = length(deltaVelocity);
  float kineticSignal = max(speedDelta * 1.35, directionalDelta * 0.58);
  float deltaActivity = clamp(
    (kineticSignal - ${PARTICLE_ACTIVITY_THRESHOLD.toFixed(6)}) * ${PARTICLE_ACTIVITY_SCALE.toFixed(6)},
    0.0,
    1.0
  );
  float speedActivity = clamp(
    (nextSpeed - 0.140000) * 1.650000,
    0.0,
    1.0
  );
  float sustainedActivity = speedActivity * speedActivity * (3.0 - 2.0 * speedActivity);
  float rawActivityStrength = max(deltaActivity * 0.72, sustainedActivity);
  float gainedActivity = clamp(rawActivityStrength * uActivityGain, 0.0, 1.0);
  float gatedActivity = clamp((gainedActivity - 0.08) / 0.92, 0.0, 1.0);
  gatedActivity = gatedActivity * gatedActivity * (3.0 - 2.0 * gatedActivity);
  float activityStrength = pow(gatedActivity, 2.35);

  float wake = clamp(pow(activityStrength, 0.92) * ${PARTICLE_ACTIVITY_WAKE_GAIN.toFixed(6)}, 0.0, 1.0);
  float colorMix = clamp(pow(activityStrength, 0.78) * ${PARTICLE_ACTIVITY_MIX_GAIN.toFixed(6)}, 0.0, 1.0);
  float intensity = clamp(
    pow(activityStrength, 1.32) * (${PARTICLE_INTENSITY_MAX.toFixed(6)} * 0.22),
    0.0,
    ${PARTICLE_INTENSITY_MAX.toFixed(6)}
  );
  float assignedLetter = floor(
    hash11(baseData.x * 97.0 + baseData.y * 53.0 + baseData.z * 19.0) * float(${LETTER_COUNT})
  );

  gl_FragColor = vec4(colorMix, wake, intensity, assignedLetter);
}
`;
}

function createGpuParticleController(count) {
  const { width, height } = getParticleTextureSize(count);
  const gpuCompute = new GPUComputationRenderer(width, height, renderer);
  const positionTexture = gpuCompute.createTexture();
  const velocityTexture = gpuCompute.createTexture();
  const visualTexture = gpuCompute.createTexture();
  const baseTexture = gpuCompute.createTexture();
  const positionData = positionTexture.image.data;
  const velocityData = velocityTexture.image.data;
  const visualData = visualTexture.image.data;
  const baseData = baseTexture.image.data;

  for (let i = 0; i < width * height; i++) {
    const o4 = i * 4;
    const o3 = i * 3;
    if (i < count) {
      positionData[o4] = particlePositions[o3];
      positionData[o4 + 1] = particlePositions[o3 + 1];
      positionData[o4 + 2] = particlePositions[o3 + 2];
      positionData[o4 + 3] = 0;

      velocityData[o4] = particleVelocities[o3];
      velocityData[o4 + 1] = particleVelocities[o3 + 1];
      velocityData[o4 + 2] = particleVelocities[o3 + 2];
      velocityData[o4 + 3] = 1;

      visualData[o4] = 0;
      visualData[o4 + 1] = 0;
      visualData[o4 + 2] = 0;
      visualData[o4 + 3] = -1;

      baseData[o4] = particleSeeds[i];
      baseData[o4 + 1] = particleTurbulence[i];
      baseData[o4 + 2] = particleMass[i];
      baseData[o4 + 3] = particleSpin[i] > 0 ? 1 : 0;
    } else {
      positionData[o4] = 0;
      positionData[o4 + 1] = 0;
      positionData[o4 + 2] = 999999;
      positionData[o4 + 3] = 0;
      velocityData[o4] = 0;
      velocityData[o4 + 1] = 0;
      velocityData[o4 + 2] = 0;
      velocityData[o4 + 3] = 0;
      visualData[o4] = 0;
      visualData[o4 + 1] = 0;
      visualData[o4 + 2] = 0;
      visualData[o4 + 3] = -1;
      baseData[o4] = 0;
      baseData[o4 + 1] = 1;
      baseData[o4 + 2] = 1;
      baseData[o4 + 3] = 1;
    }
  }

  baseTexture.needsUpdate = true;
  baseTexture.minFilter = THREE.NearestFilter;
  baseTexture.magFilter = THREE.NearestFilter;

  const velocityVariable = gpuCompute.addVariable("textureParticleVelocity", buildParticleVelocityShader(), velocityTexture);
  const positionVariable = gpuCompute.addVariable("textureParticlePosition", buildParticlePositionShader(), positionTexture);
  const visualVariable = gpuCompute.addVariable("textureParticleVisual", buildParticleVisualShader(), visualTexture);

  gpuCompute.setVariableDependencies(velocityVariable, [positionVariable, velocityVariable, visualVariable]);
  gpuCompute.setVariableDependencies(positionVariable, [positionVariable, velocityVariable, visualVariable]);
  gpuCompute.setVariableDependencies(visualVariable, [positionVariable, velocityVariable, visualVariable]);

  const allVariables = [velocityVariable, positionVariable, visualVariable];

  for (const variable of allVariables) {
    const uniforms = variable.material.uniforms;
    uniforms.uParticleBaseTexture = { value: baseTexture };
    uniforms.uFluidTexture = { value: syncParticleFluidTexture() };
    uniforms.uParticleCount = { value: count };
    uniforms.uTime = { value: 0 };
    uniforms.uDeltaTime = { value: 0.016 };
    uniforms.uFrameScale = { value: 1 };
    uniforms.uEffectiveFriction = { value: getEffectiveFriction() };
    uniforms.uActivityGain = { value: motionTuning.activityGain };
    uniforms.uAmbientFlowStrength = { value: getEffectiveAmbientFlowStrength() };
    uniforms.uAmbientMobileMix = { value: 0 };
    uniforms.uFluidInteractionMix = { value: getEffectiveFluidInteractionMix() };
    uniforms.uMobileSwipeMix = { value: getEffectiveMobileSwipeMix() };
    uniforms.uPointerActive = { value: 0 };
    uniforms.uPointerEnergy = { value: 0 };
    uniforms.uHitRadius = { value: 0 };
    uniforms.uPointerPosition = { value: new THREE.Vector3() };
    uniforms.uPointerPreviousPosition = { value: new THREE.Vector3() };
    uniforms.uPointerVelocity = { value: new THREE.Vector3() };
    uniforms.uOuterBounds = { value: new THREE.Vector3() };
    uniforms.uFluidBounds = { value: new THREE.Vector2() };
    uniforms.uFluidResolution = { value: new THREE.Vector2(fluidCols, fluidRows) };
  }
  const error = gpuCompute.init();
  if (error) {
    throw new Error(typeof error === "string" ? error : "GPU particle init failed");
  }

  function updateSimulationUniforms(dt, frameScale, time, pointerPosition, pointerEnergy, pointerActive, hitRadius) {
    const outerBounds = getParticleSoftBounds(tmpV4);
    const fluidBounds = getFluidFieldBounds(tmpFlowBounds);
    const effectivePointerActive = isMobileLayout ? 0 : pointerActive ? 1 : 0;
    const effectivePointerEnergy = isMobileLayout ? 0 : pointerEnergy;

    for (const variable of allVariables) {
      const uniforms = variable.material.uniforms;
      uniforms.uFluidTexture.value = syncParticleFluidTexture();
      uniforms.uTime.value = time;
      uniforms.uDeltaTime.value = dt;
      uniforms.uFrameScale.value = frameScale;
      uniforms.uEffectiveFriction.value = getEffectiveFriction();
      uniforms.uActivityGain.value = motionTuning.activityGain;
      uniforms.uAmbientFlowStrength.value = getEffectiveAmbientFlowStrength();
      uniforms.uAmbientMobileMix.value = 0;
      uniforms.uFluidInteractionMix.value = getEffectiveFluidInteractionMix();
      uniforms.uMobileSwipeMix.value = getEffectiveMobileSwipeMix();
      uniforms.uPointerActive.value = effectivePointerActive;
      uniforms.uPointerEnergy.value = effectivePointerEnergy;
      uniforms.uHitRadius.value = hitRadius;
      uniforms.uPointerPosition.value.copy(pointerPosition);
      uniforms.uPointerPreviousPosition.value.copy(pointer.prevLocal);
      uniforms.uPointerVelocity.value.copy(pointer.velocity);
      uniforms.uOuterBounds.value.copy(outerBounds);
      uniforms.uFluidBounds.value.copy(fluidBounds);
      uniforms.uFluidResolution.value.set(fluidCols, fluidRows);
    }

    if (particleMaterial) {
      particleMaterial.uniforms.uPositionTexture.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
      particleMaterial.uniforms.uVelocityTexture.value = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;
      particleMaterial.uniforms.uVisualTexture.value = gpuCompute.getCurrentRenderTarget(visualVariable).texture;
      particleMaterial.uniforms.uBaseTexture.value = baseTexture;
    }

  }

  return {
    width,
    height,
    step(dt, frameScale, time, pointerPosition, pointerEnergy, pointerActive, hitRadius) {
      updateSimulationUniforms(dt, frameScale, time, pointerPosition, pointerEnergy, pointerActive, hitRadius);
      gpuCompute.compute();
      if (particleMaterial) {
        particleMaterial.uniforms.uPositionTexture.value = gpuCompute.getCurrentRenderTarget(positionVariable).texture;
        particleMaterial.uniforms.uVelocityTexture.value = gpuCompute.getCurrentRenderTarget(velocityVariable).texture;
        particleMaterial.uniforms.uVisualTexture.value = gpuCompute.getCurrentRenderTarget(visualVariable).texture;
      }
    },
    getPositionTexture() {
      return gpuCompute.getCurrentRenderTarget(positionVariable).texture;
    },
    getVelocityTexture() {
      return gpuCompute.getCurrentRenderTarget(velocityVariable).texture;
    },
    getVisualTexture() {
      return gpuCompute.getCurrentRenderTarget(visualVariable).texture;
    },
    getBaseTexture() {
      return baseTexture;
    },
    dispose() {
      gpuCompute.dispose();
    }
  };
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
    logoBounds.x * 0.9 * OUTER_SHELL_SCALE_XY,
    logoBounds.y * 1.8 * OUTER_SHELL_SCALE_XY,
    Math.max(logoBounds.z * 2.4, 150) * OUTER_SHELL_SCALE_Z
  );
}

function disposeParticles() {
  if (gpuParticleController) {
    gpuParticleController.dispose();
    gpuParticleController = null;
  }
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
  sizeVarianceAttr = null;
  particleReferenceAttr = null;
  particleCount = 0;
  particleTargetCount = 0;
}

function ensureParticleMaterial() {
  if (particleMaterial) return;
  particleMaterial = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    uniforms: {
      uPositionTexture: { value: null },
      uVelocityTexture: { value: null },
      uVisualTexture: { value: null },
      uBaseTexture: { value: null },
      uParticleMap: { value: particleSprite },
      uParticleSizeScale: { value: motionTuning.particleSize },
      uParticleSizeRandomness: { value: motionTuning.particleSizeRandomness },
      uParticleOpacity: { value: motionTuning.particleOpacity },
      uParticleOpacityRandomness: { value: motionTuning.particleOpacityRandomness },
      uParticlePulseTime: { value: pulseTime },
      uViewportScale: { value: 1 },
      uParticleDensitySize: { value: 1 },
      uParticleDensityAlpha: { value: 1 },
      uParticleDensityGlow: { value: 1 },
      uParticleDensityWhite: { value: 1 },
      uLetterColors: { value: Array.from({ length: LETTER_COUNT }, () => new THREE.Color().copy(TEAL)) }
    },
    vertexShader: `
      uniform sampler2D uPositionTexture;
      uniform sampler2D uVelocityTexture;
      uniform sampler2D uVisualTexture;
      uniform sampler2D uBaseTexture;
      uniform float uParticleSizeScale;
      uniform float uParticleSizeRandomness;
      uniform float uParticlePulseTime;
      uniform float uViewportScale;
      uniform float uParticleDensitySize;
      uniform float uParticleDensityGlow;
      uniform float uParticleDensityWhite;
      uniform vec3 uLetterColors[${LETTER_COUNT}];

      attribute vec2 aParticleUv;
      attribute float aSizeVariance;

      varying vec3 vParticleColor;
      varying float vOpacitySeed;

      ${makeLetterColorLookupGLSL("uLetterColors")}

      void main() {
        vec4 positionData = texture2D(uPositionTexture, aParticleUv);
        vec4 velocityData = texture2D(uVelocityTexture, aParticleUv);
        vec4 visualData = texture2D(uVisualTexture, aParticleUv);
        vec4 baseData = texture2D(uBaseTexture, aParticleUv);

        float speed = length(velocityData.xyz);
        float colorMix = visualData.x;
        float wake = visualData.y;
        float emissionMix = clamp(visualData.z / ${PARTICLE_INTENSITY_MAX.toFixed(6)}, 0.0, 1.0);
        float assignedLetter = visualData.w;
        float glowTarget = ${PARTICLE_GLOW_BASE.toFixed(6)} +
          wake * ${PARTICLE_GLOW_WAKE.toFixed(6)} +
          clamp(speed * ${PARTICLE_GLOW_SPEED.toFixed(6)}, 0.0, 0.38);
        float normalSpeedGlow = clamp(0.44 + speed * 0.026, 0.44, 0.52);
        float flashSpeedGlow = clamp(1.1 + speed * 0.16, 1.1, 1.34);
        float glowCompression = mix(
          1.0,
          uParticleDensityGlow,
          clamp(emissionMix * 1.35 + wake * 0.35, 0.0, 1.0)
        );
        float speedGlow = mix(normalSpeedGlow, flashSpeedGlow, emissionMix) * glowCompression;
        float normalWhiteMix = clamp(0.008 + speed * 0.003, 0.008, 0.016);
        float flashWhiteMix = clamp(speed * 0.004, 0.0, 0.012);
        float whiteCompression = mix(
          1.0,
          uParticleDensityWhite,
          clamp(emissionMix * 1.55 + wake * 0.25, 0.0, 1.0)
        );
        float whiteMix = mix(normalWhiteMix, flashWhiteMix, emissionMix) * whiteCompression * 0.16;
        float inheritedMix = colorMix * step(-0.5, assignedLetter);
        vec3 inheritedColor = sampleLetterColor(max(assignedLetter, 0.0));
        vec3 baseColor = mix(vec3(${TEAL.r.toFixed(6)}, ${TEAL.g.toFixed(6)}, ${TEAL.b.toFixed(6)}), inheritedColor, inheritedMix);
        float glowBoost = clamp(
          1.0 + emissionMix * (${PARTICLE_GLOW_BOOST_MAX.toFixed(6)} - 1.0) * glowCompression * 0.48,
          1.0,
          ${PARTICLE_GLOW_BOOST_MAX.toFixed(6)}
        );
        float pulse = 1.0 + sin(uParticlePulseTime * 8.0 + baseData.x * 9.0) * (0.02 + emissionMix * 0.03);
        float glowEnergy = glowTarget * speedGlow * glowBoost * pulse;
        float basePeak = max(max(baseColor.r, baseColor.g), max(baseColor.b, 0.0001));
        float glowCeiling = max(${PARTICLE_COLOR_CHANNEL_MAX.toFixed(6)} - whiteMix, 0.0);
        float huePreservingEnergy = min(glowEnergy, glowCeiling / basePeak);
        vParticleColor = clamp(baseColor * huePreservingEnergy + whiteMix, 0.0, ${PARTICLE_COLOR_CHANNEL_MAX.toFixed(6)});
        vOpacitySeed = fract(baseData.x * 17.173 + baseData.y * 5.731 + baseData.z * 3.947);

        vec4 mvPosition = modelViewMatrix * vec4(positionData.xyz, 1.0);
        gl_Position = projectionMatrix * mvPosition;

        float sizeJitter = (aSizeVariance * 2.0 - 1.0) * uParticleSizeRandomness;
        gl_PointSize = uParticleSizeScale * max(0.22, 1.0 + sizeJitter);
        gl_PointSize *= uParticleDensitySize;
        gl_PointSize *= uViewportScale / max(-mvPosition.z, 0.0001);
      }
    `,
    fragmentShader: `
      uniform sampler2D uParticleMap;
      uniform float uParticleDensityAlpha;
      uniform float uParticleOpacity;
      uniform float uParticleOpacityRandomness;
      varying vec3 vParticleColor;
      varying float vOpacitySeed;

      void main() {
        vec2 spriteUv = gl_PointCoord * 2.0 - 1.0;
        float spriteRadius = length(spriteUv);
        if (spriteRadius > 1.0) discard;

        vec4 sprite = texture2D(uParticleMap, gl_PointCoord);
        float radialMask = 1.0 - smoothstep(0.76, 1.0, spriteRadius);
        float opacityRandom = mix(1.0, mix(0.12, 1.0, vOpacitySeed), uParticleOpacityRandomness);
        float opacityControl = clamp(uParticleOpacity, 0.0, 1.0);
        float densityAdjustedAlpha = mix(uParticleDensityAlpha, 1.0, opacityControl);
        vec4 color = vec4(vParticleColor, 1.0);
        color.rgb *= sprite.rgb * radialMask;
        color.a = sprite.a * radialMask * densityAdjustedAlpha * opacityControl * opacityRandom;
        if (color.a < 0.035) discard;
        gl_FragColor = color;
      }
    `
  });
  particleMaterial.userData.sizeUniforms = {
    uParticleSizeScale: particleMaterial.uniforms.uParticleSizeScale,
    uParticleSizeRandomness: particleMaterial.uniforms.uParticleSizeRandomness,
    uParticleOpacity: particleMaterial.uniforms.uParticleOpacity,
    uParticleOpacityRandomness: particleMaterial.uniforms.uParticleOpacityRandomness,
    uParticlePulseTime: particleMaterial.uniforms.uParticlePulseTime,
    uViewportScale: particleMaterial.uniforms.uViewportScale,
    uParticleDensitySize: particleMaterial.uniforms.uParticleDensitySize,
    uParticleDensityAlpha: particleMaterial.uniforms.uParticleDensityAlpha,
    uParticleDensityGlow: particleMaterial.uniforms.uParticleDensityGlow,
    uParticleDensityWhite: particleMaterial.uniforms.uParticleDensityWhite
  };
  particleMaterial.toneMapped = false;
  updateParticleMaterialTuning();
}

function rebuildParticleGeometry() {
  const geometry = new THREE.BufferGeometry();
  positionAttr = new THREE.BufferAttribute(new Float32Array(particleCount * 3), 3);
  const referenceUvs = new Float32Array(particleCount * 2);
  sizeVarianceAttr = new THREE.BufferAttribute(particleSizeVariance, 1);

  if (!gpuParticleController) {
    throw new Error("Missing GPU particle controller");
  }

  for (let i = 0; i < particleCount; i++) {
    const o = i * 2;
    const x = (i % gpuParticleController.width) + 0.5;
    const y = Math.floor(i / gpuParticleController.width) + 0.5;
    referenceUvs[o] = x / gpuParticleController.width;
    referenceUvs[o + 1] = y / gpuParticleController.height;
  }

  particleReferenceAttr = new THREE.BufferAttribute(referenceUvs, 2);
  positionAttr.setUsage(THREE.StaticDrawUsage);
  particleReferenceAttr.setUsage(THREE.StaticDrawUsage);
  sizeVarianceAttr.setUsage(THREE.StaticDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("aParticleUv", particleReferenceAttr);
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

function spawnParticleAt(index) {
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
  clearParticleAssignedColor(index);
  setParticleVisualState(index, 0, 0, 0, 0);

  const shellBounds = getParticleHardBounds(tmpV4);
  const shellBoundX = shellBounds.x * 0.985;
  const shellBoundY = shellBounds.y * 0.985;
  const shellBoundZ = shellBounds.z * 0.985;
  const shellSizeX = shellBoundX * 2;
  const shellSizeY = shellBoundY * 2;
  const shellSizeZ = shellBoundZ * 2;
  const shellVolume = Math.max(shellSizeX * shellSizeY * shellSizeZ, 1);
  const gridScale = Math.cbrt(Math.max(particleCount, 1) / shellVolume);
  const cellsX = Math.max(1, Math.ceil(shellSizeX * gridScale));
  const cellsY = Math.max(1, Math.ceil(shellSizeY * gridScale));
  const cellsZ = Math.max(1, Math.ceil(shellSizeZ * gridScale));
  const cellsPerLayer = cellsX * cellsY;
  const cellX = index % cellsX;
  const cellY = Math.floor(index / cellsX) % cellsY;
  const cellZ = Math.floor(index / cellsPerLayer) % cellsZ;

  tmpV1.set(
    -shellBoundX + ((cellX + hash(index * 1.13 + 17.0)) / cellsX) * shellSizeX,
    -shellBoundY + ((cellY + hash(index * 1.37 + 29.0)) / cellsY) * shellSizeY,
    -shellBoundZ + ((cellZ + hash(index * 1.61 + 43.0)) / cellsZ) * shellSizeZ
  );

  particlePositions[o] = tmpV1.x;
  particlePositions[o + 1] = tmpV1.y;
  particlePositions[o + 2] = tmpV1.z;

  particleVelocities[o] = 0;
  particleVelocities[o + 1] = 0;
  particleVelocities[o + 2] = 0;
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
    clearParticleAssignedColor(i);
    setParticleVisualState(i, 0, 0, 0, 0);

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
  particleSeeds = new Float32Array(count);
  particleTurbulence = new Float32Array(count);
  particleMass = new Float32Array(count);
  particleColorMix = new Float32Array(count);
  particleWake = new Float32Array(count);
  particleHitCooldown = new Float32Array(count);
  particleSizeVariance = new Float32Array(count);
  particleVisualState = new Uint8Array(count * 4);
  particleAssignedColorBytes = new Uint8Array(count * 3);
  particleAssignedIntensity = new Float32Array(count);
  particleAssignedLetter = new Int16Array(count);
  particleSpin = new Float32Array(count);

  ensureParticleMaterial();

  for (let i = 0; i < count; i++) {
    spawnParticleAt(i);
  }

  gpuParticleController = createGpuParticleController(count);
  particleMaterial.uniforms.uPositionTexture.value = gpuParticleController.getPositionTexture();
  particleMaterial.uniforms.uVelocityTexture.value = gpuParticleController.getVelocityTexture();
  particleMaterial.uniforms.uVisualTexture.value = gpuParticleController.getVisualTexture();
  particleMaterial.uniforms.uBaseTexture.value = gpuParticleController.getBaseTexture();
  rebuildParticleGeometry();
}

function resizeParticleSystem(nextCount) {
  if (!textGeometry || !textMesh) return;
  const targetCount = normalizeParticleCount(nextCount);
  if (targetCount === particleCount) return;
  buildParticles(targetCount);
}

function sampleFluidArrays(gridX, gridY, fieldX, fieldY, target) {
  const x = clamp(gridX, 0, fluidCols - 1);
  const y = clamp(gridY, 0, fluidRows - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, fluidCols - 1);
  const y1 = Math.min(y0 + 1, fluidRows - 1);
  const tx = x - x0;
  const ty = y - y0;

  const i00 = y0 * fluidCols + x0;
  const i10 = y0 * fluidCols + x1;
  const i01 = y1 * fluidCols + x0;
  const i11 = y1 * fluidCols + x1;

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
  const fluidBounds = getFluidFieldBounds(tmpFlowBounds);
  const boundX = Math.max(fluidBounds.x, 1);
  const boundY = Math.max(fluidBounds.y, 1);
  target.set(
    ((clamp(worldX, -boundX, boundX) + boundX) / (boundX * 2)) * (fluidCols - 1),
    ((clamp(worldY, -boundY, boundY) + boundY) / (boundY * 2)) * (fluidRows - 1)
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

function resetFluidViewportLock() {
  fluidViewportLock.active = false;
  fluidViewportLock.width = 1;
  fluidViewportLock.height = 1;
  fluidViewportLock.orientation = "";
}

function syncFluidSimulationMetrics(width, height) {
  const nextWidth = Math.max(1, Math.round(width || 1));
  const nextHeight = Math.max(1, Math.round(height || 1));

  if (!isMobileLayout) {
    resetFluidViewportLock();
    fluidSimulationMetrics.width = nextWidth;
    fluidSimulationMetrics.height = nextHeight;
    return fluidSimulationMetrics;
  }

  const orientation = nextWidth >= nextHeight ? "landscape" : "portrait";
  const lockNeedsUpdate =
    !fluidViewportLock.active ||
    fluidViewportLock.orientation !== orientation ||
    nextWidth > fluidViewportLock.width + MOBILE_FLUID_LOCK_GROWTH_THRESHOLD ||
    nextHeight > fluidViewportLock.height + MOBILE_FLUID_LOCK_GROWTH_THRESHOLD ||
    Math.abs(nextWidth - fluidViewportLock.width) > MOBILE_FLUID_LOCK_WIDTH_DELTA ||
    Math.abs(nextHeight - fluidViewportLock.height) > MOBILE_FLUID_LOCK_HEIGHT_DELTA;

  if (lockNeedsUpdate) {
    fluidViewportLock.active = true;
    fluidViewportLock.width = nextWidth;
    fluidViewportLock.height = nextHeight;
    fluidViewportLock.orientation = orientation;
  }

  fluidSimulationMetrics.width = fluidViewportLock.width;
  fluidSimulationMetrics.height = fluidViewportLock.height;
  return fluidSimulationMetrics;
}

function getFluidSimulationMetrics() {
  if (fluidSimulationMetrics.width <= 1 && fluidSimulationMetrics.height <= 1) {
    const baseMetrics = getFluidCanvasMetrics();
    return syncFluidSimulationMetrics(baseMetrics.width, baseMetrics.height);
  }
  return fluidSimulationMetrics;
}

function getFluidLayerMetrics() {
  return {
    width: Math.max(1, fluidCols),
    height: Math.max(1, fluidRows)
  };
}

function mapLocalPointToFluidScreen(localX, localY, target) {
  const { width, height } = getFluidLayerMetrics();
  const fluidBounds = getFluidFieldBounds(tmpFlowBounds);
  target.set(
    ((clamp(localX, -fluidBounds.x, fluidBounds.x) + fluidBounds.x) / Math.max(fluidBounds.x * 2, 1)) * width,
    ((clamp(localY, -fluidBounds.y, fluidBounds.y) + fluidBounds.y) / Math.max(fluidBounds.y * 2, 1)) * height
  );
  return target;
}

function getFluidImpulseThickness() {
  const { width, height } = getFluidLayerMetrics();
  const fluidBounds = getFluidFieldBounds(tmpFlowBounds);
  const hitRadius = getMaxCursorRadius() * motionTuning.radius;
  const scaleX = width / Math.max(fluidBounds.x * 2, 1);
  const scaleY = height / Math.max(fluidBounds.y * 2, 1);
  return Math.max(FLUID_MIN_IMPULSE_CELLS, hitRadius * (scaleX + scaleY) * 0.5);
}

function createGPUFluidController() {
  const cols = fluidCols;
  const rows = fluidRows;
  const cellCount = cols * rows;
  const preferredPrecision =
    typeof isHighpSupportedInVertexShader === "function" &&
    typeof isHighpSupportedInFragmentShader === "function" &&
    isHighpSupportedInVertexShader() &&
    isHighpSupportedInFragmentShader()
      ? PRECISION_HIGH_P
      : PRECISION_MEDIUM_P;
  const useDetachedComposer = isMobileLayout;
  let fluidComposerCanvas = null;
  let gpuComposer;

  if (useDetachedComposer) {
    fluidComposerCanvas = document.createElement("canvas");
    fluidComposerCanvas.width = Math.max(cols, 1);
    fluidComposerCanvas.height = Math.max(rows, 1);
    fluidComposerCanvas.setAttribute("aria-hidden", "true");
    fluidComposerCanvas.tabIndex = -1;
    fluidComposerCanvas.style.position = "fixed";
    fluidComposerCanvas.style.left = "-10000px";
    fluidComposerCanvas.style.top = "-10000px";
    fluidComposerCanvas.style.width = "1px";
    fluidComposerCanvas.style.height = "1px";
    fluidComposerCanvas.style.opacity = "0";
    fluidComposerCanvas.style.pointerEvents = "none";
    fluidComposerCanvas.style.zIndex = "-1";
    document.body.appendChild(fluidComposerCanvas);

    const contextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false
    };
    const detachedContext =
      fluidComposerCanvas.getContext("webgl2", contextAttributes) ||
      fluidComposerCanvas.getContext("webgl", contextAttributes) ||
      fluidComposerCanvas.getContext("experimental-webgl2", contextAttributes) ||
      fluidComposerCanvas.getContext("experimental-webgl", contextAttributes);
    if (!detachedContext) {
      throw new Error("Unable to initialize detached mobile fluid context.");
    }
    gpuComposer = new GPUComposer({
      canvas: fluidComposerCanvas,
      context: detachedContext,
      floatPrecision: preferredPrecision,
      intPrecision: preferredPrecision
    });
    gpuComposer.resize([cols, rows]);
  } else {
    gpuComposer = GPUComposer.initWithThreeRenderer(renderer, {
      floatPrecision: preferredPrecision,
      intPrecision: preferredPrecision
    });
    gpuComposer.undoThreeState();
  }
  const supportsAsyncReadback = gpuComposer.isWebGL2 && typeof GPULayer.prototype.getValuesAsync === "function";
  let readbackPromise = null;
  let readbackFrameCounter = 0;
  let readbackGeneration = 0;

  const velocityState = new GPULayer(gpuComposer, {
    name: "velocity",
    dimensions: [cols, rows],
    type: FLOAT,
    filter: isMobileLayout ? NEAREST : LINEAR,
    numComponents: 2,
    wrapX: CLAMP_TO_EDGE,
    wrapY: CLAMP_TO_EDGE,
    numBuffers: 2
  });
  const divergenceState = new GPULayer(gpuComposer, {
    name: "divergence",
    dimensions: [cols, rows],
    type: FLOAT,
    filter: NEAREST,
    numComponents: 1,
    wrapX: CLAMP_TO_EDGE,
    wrapY: CLAMP_TO_EDGE
  });
  const pressureState = new GPULayer(gpuComposer, {
    name: "pressure",
    dimensions: [cols, rows],
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
      ${FLUID_SHADER_PRECISION_HEADER}
      in vec2 v_uv;

      uniform sampler2D u_state;
      uniform sampler2D u_velocity;
      uniform vec2 u_dimensions;
      uniform float u_decay;

      out vec2 out_state;

      vec2 sampleLinear(const sampler2D samplerTex, const vec2 uv) {
        vec2 resolutionSafe = max(u_dimensions, vec2(1.0));
        vec2 grid = clamp(uv, 0.0, 1.0) * resolutionSafe - 0.5;
        vec2 base = floor(grid);
        vec2 fracPart = fract(grid);
        vec2 maxBase = max(resolutionSafe - 1.0, vec2(0.0));
        vec2 baseClamped = clamp(base, vec2(0.0), maxBase);
        vec2 next = clamp(baseClamped + 1.0, vec2(0.0), maxBase);

        vec2 uv00 = (baseClamped + vec2(0.5)) / resolutionSafe;
        vec2 uv10 = vec2(next.x + 0.5, baseClamped.y + 0.5) / resolutionSafe;
        vec2 uv01 = vec2(baseClamped.x + 0.5, next.y + 0.5) / resolutionSafe;
        vec2 uv11 = (next + vec2(0.5)) / resolutionSafe;

        vec2 s00 = texture(samplerTex, uv00).xy;
        vec2 s10 = texture(samplerTex, uv10).xy;
        vec2 s01 = texture(samplerTex, uv01).xy;
        vec2 s11 = texture(samplerTex, uv11).xy;
        vec2 sx0 = mix(s00, s10, fracPart.x);
        vec2 sx1 = mix(s01, s11, fracPart.x);
        return mix(sx0, sx1, fracPart.y);
      }

      void main() {
        vec2 advectedUv = v_uv - sampleLinear(u_velocity, v_uv) / u_dimensions;
        vec2 advected = sampleLinear(u_state, advectedUv);
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
      ${FLUID_SHADER_PRECISION_HEADER}
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
      { name: "u_pxSize", value: [1 / cols, 1 / rows], type: FLOAT }
    ]
  });
  const jacobi = new GPUProgram(gpuComposer, {
    name: "jacobi",
    fragmentShader: `
      ${FLUID_SHADER_PRECISION_HEADER}
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
      { name: "u_pxSize", value: [1 / cols, 1 / rows], type: FLOAT },
      { name: "u_previousState", value: 0, type: INT },
      { name: "u_divergence", value: 1, type: INT }
    ]
  });
  const gradientSubtraction = new GPUProgram(gpuComposer, {
    name: "gradientSubtraction",
    fragmentShader: `
      ${FLUID_SHADER_PRECISION_HEADER}
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
      { name: "u_pxSize", value: [1 / cols, 1 / rows], type: FLOAT },
      { name: "u_scalarField", value: 0, type: INT },
      { name: "u_vectorField", value: 1, type: INT }
    ]
  });
  const velocityBlur = new GPUProgram(gpuComposer, {
    name: "velocityBlur",
    fragmentShader: `
      ${FLUID_SHADER_PRECISION_HEADER}
      in vec2 v_uv;

      uniform sampler2D u_velocity;
      uniform vec2 u_pxSize;
      uniform float u_strength;

      out vec2 out_velocity;

      void main() {
        vec2 center = texture(u_velocity, v_uv).xy;
        vec2 north = texture(u_velocity, v_uv + vec2(0.0, u_pxSize.y)).xy;
        vec2 south = texture(u_velocity, v_uv - vec2(0.0, u_pxSize.y)).xy;
        vec2 east = texture(u_velocity, v_uv + vec2(u_pxSize.x, 0.0)).xy;
        vec2 west = texture(u_velocity, v_uv - vec2(u_pxSize.x, 0.0)).xy;
        vec2 blurred = center * 0.4 + (north + south + east + west) * 0.15;
        out_velocity = mix(center, blurred, clamp(u_strength, 0.0, 1.0));
      }`,
    uniforms: [
      { name: "u_velocity", value: 0, type: INT },
      { name: "u_pxSize", value: [1 / cols, 1 / rows], type: FLOAT },
      { name: "u_strength", value: 0, type: FLOAT }
    ]
  });
  const touch = new GPUProgram(gpuComposer, {
    name: "touch",
    fragmentShader: `
      ${FLUID_SHADER_PRECISION_HEADER}
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
  const ambientFlow = new GPUProgram(gpuComposer, {
    name: "ambientFlow",
    fragmentShader: `
      ${FLUID_SHADER_PRECISION_HEADER}
      in vec2 v_uv;

      uniform sampler2D u_velocity;
      uniform float u_time;
      uniform float u_strength;

      out vec2 out_velocity;

      void main() {
        vec2 uv = v_uv * 2.0 - 1.0;
        vec2 velocity = texture(u_velocity, v_uv).xy;
        float strength = clamp(u_strength, 0.0, ${AMBIENT_FLOW_SPEED_MAX.toFixed(6)});

        if (strength <= 0.0001) {
          out_velocity = velocity;
          return;
        }

        float gain = strength / ${AMBIENT_FLOW_SPEED_MAX.toFixed(6)};
        float phase = u_time * mix(0.05, 0.55, gain);

        float dPsiDy =
          sin(uv.x * 2.1 + phase * 0.73) *
          cos(uv.y * 1.45 - phase * 0.41) * 1.45 +
          0.42 *
          sin(uv.x * 4.0 - phase * 0.28 + 1.3) *
          cos(uv.y * 3.15 + phase * 0.49 - 0.8) * 3.15 +
          0.18 *
          sin((uv.x + uv.y) * 2.3 + phase * 0.22) *
          (-sin((uv.x - uv.y) * 1.7 - phase * 0.31)) * (-1.7) +
          0.18 *
          cos((uv.x + uv.y) * 2.3 + phase * 0.22) * 2.3 *
          cos((uv.x - uv.y) * 1.7 - phase * 0.31);

        float dPsiDx =
          cos(uv.x * 2.1 + phase * 0.73) * 2.1 *
          sin(uv.y * 1.45 - phase * 0.41) +
          0.42 *
          cos(uv.x * 4.0 - phase * 0.28 + 1.3) * 4.0 *
          sin(uv.y * 3.15 + phase * 0.49 - 0.8) +
          0.18 *
          cos((uv.x + uv.y) * 2.3 + phase * 0.22) * 2.3 *
          cos((uv.x - uv.y) * 1.7 - phase * 0.31) +
          0.18 *
          sin((uv.x + uv.y) * 2.3 + phase * 0.22) *
          (-sin((uv.x - uv.y) * 1.7 - phase * 0.31)) * 1.7;

        vec2 force = vec2(dPsiDy, -dPsiDx);
        float amplitude = mix(0.0025, 0.0320, sqrt(gain)) * gain;
        force *= amplitude;
        velocity += force;

        float velocityMag = length(velocity);
        out_velocity = velocityMag > 0.00001
          ? velocity / velocityMag * min(velocityMag, ${FLUID_MAX_VELOCITY.toFixed(1)})
          : vec2(0.0);
      }`,
    uniforms: [
      { name: "u_velocity", value: 0, type: INT },
      { name: "u_time", value: 0, type: FLOAT },
      { name: "u_strength", value: 0, type: FLOAT }
    ]
  });

  function updateDimensions() {
    const { width, height } = getFluidLayerMetrics();
    advection.setUniform("u_dimensions", [width, height]);
    advection.setUniform("u_decay", getEffectiveFluidDecay());
  }

  function applyReadback(values) {
    const { width, height } = getFluidLayerMetrics();
    const fluidBounds = getFluidFieldBounds(tmpFlowBounds);
    const scaleX = (fluidBounds.x * 2) / width * FLUID_SAMPLE_SCALE;
    const scaleY = (fluidBounds.y * 2) / height * FLUID_SAMPLE_SCALE;

    for (let i = 0; i < cellCount; i++) {
      const offset = i * 2;
      fluidVelocityX[i] = values[offset] * scaleX;
      fluidVelocityY[i] = values[offset + 1] * scaleY;
    }
    smoothMobileFluidReadbackField();
    markParticleFluidTextureDirty();
  }

  function requestReadback(force = false) {
    if (readbackPromise) return;

    const interval = isMobileLayout ? 1 : particleCount >= 90000 ? 3 : particleCount >= 60000 ? 2 : 1;
    if (!force) {
      readbackFrameCounter += 1;
      if (readbackFrameCounter < interval) {
        return;
      }
    }
    readbackFrameCounter = 0;

    if (supportsAsyncReadback && !isMobileLayout) {
      const generation = readbackGeneration;
      readbackPromise = velocityState.getValuesAsync()
        .then((values) => {
          if (generation !== readbackGeneration) return;
          applyReadback(values);
        })
        .catch(() => {
          if (generation !== readbackGeneration) return;
          applyReadback(velocityState.getValues());
        })
        .finally(() => {
          if (generation === readbackGeneration) {
            readbackPromise = null;
          }
        });
      return;
    }

    applyReadback(velocityState.getValues());
  }

  function clear() {
    if (!useDetachedComposer) {
      gpuComposer.undoThreeState();
    }
    velocityState.clear(true);
    divergenceState.clear();
    pressureState.clear(true);
    readbackGeneration += 1;
    readbackPromise = null;
    readbackFrameCounter = 0;
    fluidVelocityX.fill(0);
    fluidVelocityY.fill(0);
    markParticleFluidTextureDirty();
    if (!useDetachedComposer) {
      gpuComposer.resetThreeState();
    }
  }

  function step(time) {
    if (!useDetachedComposer) {
      gpuComposer.undoThreeState();
    }
    updateDimensions();
    const hadPendingImpulses = pendingFluidImpulses.length > 0;

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
        useOutputScale: true,
        position1: impulse.position1,
        position2: impulse.position2,
        thickness: impulse.thickness,
        endCaps: true
      });
    }

    const ambientStrength = getEffectiveAmbientFlowStrength();
    if (!isMobileLayout) {
      ambientFlow.setUniform("u_time", time);
      ambientFlow.setUniform("u_strength", ambientStrength);
      gpuComposer.step({
        program: ambientFlow,
        input: velocityState,
        output: velocityState
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
    const jacobiSteps = getFluidJacobiSteps();
    for (let i = 0; i < jacobiSteps; i++) {
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

    const mobileBlurStrength = getEffectiveMobileFluidBlurStrength();
    if (mobileBlurStrength > 0.0001) {
      velocityBlur.setUniform("u_strength", mobileBlurStrength);
      gpuComposer.step({
        program: velocityBlur,
        input: velocityState,
        output: velocityState
      });
    }

    requestReadback(hadPendingImpulses);
    if (!useDetachedComposer) {
      gpuComposer.resetThreeState();
    }
  }

  function dispose() {
    velocityState.dispose();
    divergenceState.dispose();
    pressureState.dispose();
    advection.dispose();
    divergence2D.dispose();
    jacobi.dispose();
    gradientSubtraction.dispose();
    velocityBlur.dispose();
    touch.dispose();
    ambientFlow.dispose();
    gpuComposer.dispose();
    if (fluidComposerCanvas?.parentNode) {
      fluidComposerCanvas.parentNode.removeChild(fluidComposerCanvas);
    }
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
  markParticleFluidTextureDirty();
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

function stepFluidField(time) {
  if (!gpuFluid) return;
  gpuFluid.step(time);
}

function updateFluidSimulationSize() {
  const { width, height } = getFluidSimulationMetrics();
  const nextGrid = getFluidGridDimensionsForViewport(width, height);
  const gridChanged = nextGrid.cols !== fluidCols || nextGrid.rows !== fluidRows;

  if (gridChanged) {
    setFluidGridDimensions(nextGrid.cols, nextGrid.rows);
    if (gpuFluid) {
      gpuFluid.dispose();
      gpuFluid = createGPUFluidController();
    }
    return;
  }

  if (!gpuFluid) return;
  gpuFluid.updateDimensions();
  clearFluidField();
}

function updatePointerProjection(updateMotion) {
  if (!pointer.active && !pointer.ready) return;

  logoRig.updateMatrixWorld(true);
  tmpV3.set(0, 0, 1).transformDirection(logoRig.matrixWorld).normalize();
  tmpV4.set(0, 0, 0).applyMatrix4(logoRig.matrixWorld);
  pointerPlane.setFromNormalAndCoplanarPoint(tmpV3, tmpV4);
  raycaster.setFromCamera(pointer.ndc, camera);
  inverseLogoMatrix.copy(logoRig.matrixWorld).invert();

  pointer.rayOriginLocal.copy(raycaster.ray.origin).applyMatrix4(inverseLogoMatrix);
  pointer.rayDirLocal.copy(raycaster.ray.direction).transformDirection(inverseLogoMatrix).normalize();

  if (!raycaster.ray.intersectPlane(pointerPlane, pointerWorldHit)) return;
  tmpV1.copy(pointerWorldHit).applyMatrix4(inverseLogoMatrix);
  tmpV1.z = 0;

  if (updateMotion) {
    if (pointer.ready) {
      pointer.prevLocal.copy(pointer.local);
      tmpV2.copy(tmpV1).sub(pointer.local);
      pointer.velocity.lerp(tmpV2, 0.58);
    } else {
      pointer.prevLocal.copy(tmpV1);
      pointer.velocity.set(0, 0, 0);
    }
  } else if (!pointer.ready) {
    pointer.prevLocal.copy(tmpV1);
  }

  pointer.local.copy(tmpV1);
  pointer.ready = true;
}

function getConstrainedPointerLocal(hitRadius, target) {
  const shellBounds = getParticleSoftBounds(tmpV2);
  target.set(
    clamp(
      pointer.local.x,
      -Math.max(shellBounds.x - hitRadius, 0),
      Math.max(shellBounds.x - hitRadius, 0)
    ),
    clamp(
      pointer.local.y,
      -Math.max(shellBounds.y - hitRadius, 0),
      Math.max(shellBounds.y - hitRadius, 0)
    ),
    clamp(
      pointer.local.z,
      -Math.max(shellBounds.z - hitRadius, 0),
      Math.max(shellBounds.z - hitRadius, 0)
    )
  );
  return target;
}

function updateViewport() {
  syncViewportHost();
  const { width, height } = getViewportDimensions();

  isMobileLayout = width < MOBILE_BREAKPOINT;

  if (!tuningPanelVisibilityCustomized) {
    setTuningPanelHidden(isMobileLayout);
  } else {
    syncTuningPanelVisibility();
  }

  if (motionTuningUsesResponsiveDefaults) {
    const responsiveDefaultsChanged = applyMotionTuningPreset(
      getResponsiveDefaultMotionTuning(width, height),
      { resizeDelayMs: 0 }
    );
    if (responsiveDefaultsChanged) {
      saveMotionTuning();
    }
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height, true);
  composer.setSize(width, height);
  bloomPass.setSize(width, height);
  syncFluidSimulationMetrics(width, height);
  updateFluidSimulationSize();

  camera.aspect = width / height;
  camera.fov = isMobileLayout ? 37 : 33;
  camera.position.z = isMobileLayout ? 720 : 620;
  camera.updateProjectionMatrix();

  bloomPass.strength = isMobileLayout ? 0.58 : 0.76;
  bloomPass.radius = isMobileLayout ? 0.36 : 0.44;
  bloomPass.threshold = isMobileLayout ? 0.12 : 0.08;

  pointerViewport.left = 0;
  pointerViewport.top = 0;
  pointerViewport.width = width;
  pointerViewport.height = height;
  pointerViewport.centerOffsetX = 0;

  if (textReady) {
    const distance = camera.position.z;
    const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * distance;
    const visibleWidth = visibleHeight * camera.aspect;
    const targetWidth = visibleWidth * (isMobileLayout ? 0.82 : 0.69);
    const targetHeight = visibleHeight * (isMobileLayout ? 0.23 : 0.21);
    const scale = Math.min(
      targetWidth / Math.max(logoBounds.x, 1),
      targetHeight / Math.max(logoBounds.y, 1)
    );
    logoRig.scale.setScalar(scale);
    logoRig.position.x = 0;
    rimLight.position.x = logoRig.position.x;
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
      scheduleParticleResize(0);
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
  const hitRadius = getMaxCursorRadius() * motionTuning.radius;
  const constrainedPointerLocal = getConstrainedPointerLocal(hitRadius, tmpV1);
  const pointerLocalX = constrainedPointerLocal.x;
  const pointerLocalY = constrainedPointerLocal.y;
  const pointerLocalZ = constrainedPointerLocal.z;

  cursorSphere.visible = motionTuning.showCursor !== false && pointer.active && pointer.ready && hitRadius > 0.001;

  stepFluidField(t);

  const particleUniforms = particleMaterial?.userData.sizeUniforms;
  if (particleUniforms?.uParticlePulseTime) {
    particleUniforms.uParticlePulseTime.value = pulseTime;
  }

  if (particleMaterial?.uniforms?.uLetterColors) {
    for (let i = 0; i < LETTER_COUNT; i++) {
      particleMaterial.uniforms.uLetterColors.value[i].copy(letterPalette[i]);
    }
  }

  if (gpuParticleController && particleMaterial) {
    tmpV1.set(pointerLocalX, pointerLocalY, pointerLocalZ);
    gpuParticleController.step(
      dt,
      frame,
      t,
      tmpV1,
      pointerEnergy,
      pointer.active && pointer.ready,
      hitRadius
    );
  }

  const targetRotY = Math.sin(t * 0.28) * 0.06 + pointer.ndcSmooth.x * 0.16;
  const targetRotX = Math.cos(t * 0.22) * 0.03 - pointer.ndcSmooth.y * 0.09;
  logoRig.rotation.y += (targetRotY - logoRig.rotation.y) * 0.05;
  logoRig.rotation.x += (targetRotX - logoRig.rotation.x) * 0.05;
  logoRig.position.y += (Math.sin(t * 0.48) * 5 - logoRig.position.y) * 0.035;
  backgroundHalo.material.rotation += 0.00035;

  if (pointer.active) {
    updatePointerProjection(false);
  }

  if (cursorSphere.visible) {
    logoRig.updateMatrixWorld(true);
    tmpCursorWorld.set(pointerLocalX, pointerLocalY, pointerLocalZ).applyMatrix4(logoRig.matrixWorld);
    cursorSphere.position.copy(tmpCursorWorld);
    cursorSphere.scale.setScalar(hitRadius * logoRig.scale.x);
  }

  composer.render();
}

async function init() {
  syncViewportHost();
  if (motionTuningUsesResponsiveDefaults) {
    applyMotionTuningPreset(getCurrentDefaultMotionTuning(), {
      resizeDelayMs: 0
    });
  }
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
  if (activePointerId != null) {
    try {
      if (renderer.domElement.hasPointerCapture?.(activePointerId)) {
        renderer.domElement.releasePointerCapture(activePointerId);
      }
    } catch {
      // Ignore capture release failures; the interaction state reset is sufficient.
    }
  }
  activePointerId = null;
  pointer.active = false;
  pointer.ready = false;
  pointer.speed = 0;
  pointer.prevLocal.copy(pointer.local);
  pointer.velocity.set(0, 0, 0);
  cursorSphere.visible = false;
}

function updatePointerFromEvent(event) {
  if (!(event.target instanceof Element)) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const insideCanvas = localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height;
  if (!insideCanvas) {
    stopPointerInteraction();
    return;
  }

  if (isTuningUiTarget(event.target)) {
    stopPointerInteraction();
    return;
  }

  const hadPointer = pointer.active && pointer.ready;
  pointer.active = true;
  pointer.ndc.set(
    (localX / Math.max(rect.width, 1)) * 2 - 1,
    -(((localY / Math.max(rect.height, 1)) * 2) - 1)
  );
  updatePointerProjection(true);

  const hitRadius = getMaxCursorRadius() * motionTuning.radius;
  getConstrainedPointerLocal(hitRadius, tmpV1);
  mapLocalPointToFluidScreen(tmpV1.x, tmpV1.y, tmpFlowC);
  if (hadPointer) {
    queueFluidImpulse([pointer.screen.x, pointer.screen.y], [tmpFlowC.x, tmpFlowC.y]);
  }
  pointer.screen.copy(tmpFlowC);
}

function handlePointerDown(event) {
  if (event.isPrimary === false) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (!(event.target instanceof Element)) return;
  if (isTuningUiTarget(event.target)) {
    stopPointerInteraction();
    return;
  }
  if (event.pointerType !== "mouse") {
    activePointerId = event.pointerId;
    if (event.cancelable) {
      event.preventDefault();
    }
    try {
      renderer.domElement.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is a best-effort improvement for touch continuity.
    }
  }
  updatePointerFromEvent(event);
}

function handlePointerMove(event) {
  if (event.isPrimary === false) return;
  if (event.pointerType !== "mouse") {
    if (activePointerId == null || event.pointerId !== activePointerId) return;
    if (event.cancelable) {
      event.preventDefault();
    }
  }
  updatePointerFromEvent(event);
}

function handlePointerEnd(event) {
  if (event.pointerType !== "mouse" && activePointerId != null && event.pointerId !== activePointerId) {
    return;
  }
  stopPointerInteraction();
}

window.addEventListener("pointerdown", handlePointerDown, { passive: false });
window.addEventListener("pointermove", handlePointerMove, { passive: false });
window.addEventListener("pointerup", handlePointerEnd);
window.addEventListener("pointercancel", handlePointerEnd);
window.addEventListener("blur", stopPointerInteraction);

let resizeRaf = 0;
let viewportSettleRaf = 0;
const viewportSettleTimeouts = [];

function runViewportUpdate() {
  updateViewport();
  updatePointerProjection(false);
}

function scheduleViewportUpdate() {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(runViewportUpdate);
}

function cancelInitialViewportSettle() {
  if (viewportSettleRaf) {
    cancelAnimationFrame(viewportSettleRaf);
    viewportSettleRaf = 0;
  }
  while (viewportSettleTimeouts.length > 0) {
    window.clearTimeout(viewportSettleTimeouts.pop());
  }
}

function scheduleInitialViewportSettle() {
  cancelInitialViewportSettle();

  const delays = [0, 80, 180, 320, 520, 900];
  for (const delay of delays) {
    const timeoutId = window.setTimeout(() => {
      scheduleViewportUpdate();
    }, delay);
    viewportSettleTimeouts.push(timeoutId);
  }

  let previousKey = "";
  let stableTicks = 0;

  const settleStep = () => {
    const metrics = getVisualViewportMetrics();
    const visualViewport = window.visualViewport;
    const key = [
      metrics.width,
      metrics.height,
      Math.round((visualViewport?.offsetLeft || 0) * 10),
      Math.round((visualViewport?.offsetTop || 0) * 10)
    ].join(":");

    if (key === previousKey) {
      stableTicks += 1;
    } else {
      previousKey = key;
      stableTicks = 0;
      scheduleViewportUpdate();
    }

    if (stableTicks < 4) {
      viewportSettleRaf = requestAnimationFrame(settleStep);
    } else {
      viewportSettleRaf = 0;
    }
  };

  viewportSettleRaf = requestAnimationFrame(settleStep);
}

window.addEventListener("resize", scheduleViewportUpdate);
window.addEventListener("orientationchange", scheduleViewportUpdate);
window.addEventListener("load", scheduleInitialViewportSettle);
window.addEventListener("pageshow", scheduleInitialViewportSettle);
window.visualViewport?.addEventListener("resize", scheduleViewportUpdate);
window.visualViewport?.addEventListener("scroll", scheduleViewportUpdate);
if (typeof ResizeObserver !== "undefined") {
  const ro = new ResizeObserver(scheduleViewportUpdate);
  ro.observe(container);
}

setupTuningPanel();
scheduleInitialViewportSettle();

init().catch((error) => {
  console.error("[hanelab] Failed to initialize scene.", error);
});
