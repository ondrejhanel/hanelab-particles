import * as THREE from "three";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import { TTFLoader } from "three/addons/loaders/TTFLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { MeshSurfaceSampler } from "three/addons/math/MeshSurfaceSampler.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

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
const MAX_PARTICLES = 20000;
const COUNT_STEP = 100;
const FLUID_COLS = 54;
const FLUID_ROWS = 30;
const FLUID_CELL_COUNT = FLUID_COLS * FLUID_ROWS;
const TUNING_STORAGE_KEY = "hanelab-motion-tuning";
const FRICTION_MIN = 0.001;
const FRICTION_MAX = 1;
const RADIUS_MIN = 1.31;
const RADIUS_MAX = 3;
const PARTICLE_COUNT_MIN = MIN_PARTICLES;
const PARTICLE_COUNT_MAX = MAX_PARTICLES;

const container = document.getElementById("app");
if (!container) throw new Error("Missing #app container");
const frictionInput = document.getElementById("tuning-friction");
const frictionNumberInput = document.getElementById("tuning-friction-number");
const radiusInput = document.getElementById("tuning-radius");
const radiusNumberInput = document.getElementById("tuning-radius-number");
const particleCountInput = document.getElementById("tuning-particle-count");
const particleCountNumberInput = document.getElementById("tuning-particle-count-number");
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
let positionAttr = null;
let colorAttr = null;
let isMobileLayout = false;
let logoBounds = new THREE.Vector3(420, 180, 70);
let particleField = new THREE.Vector3(520, 220, 360);
let viewportBounds = new THREE.Vector2(520, 220);
let textReady = false;
let pulseTime = 0;

const particleSprite = createRadialTexture(64, "rgba(255,255,255,0.95)", "rgba(255,255,255,0)");
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
  rayOriginLocal: new THREE.Vector3(),
  rayDirLocal: new THREE.Vector3(0, 0, -1),
  speed: 0
};

const tmpV1 = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpV3 = new THREE.Vector3();
const tmpV4 = new THREE.Vector3();
const tmpFlowA = new THREE.Vector2();
const tmpFlowB = new THREE.Vector2();
const box = new THREE.Box3();
const clock = new THREE.Clock();
const cycleBaseColor = new THREE.Color();
const cycleInnerColor = new THREE.Color();
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

function normalizeParticleCount(value) {
  const snapped = Math.round(value / COUNT_STEP) * COUNT_STEP;
  return clamp(snapped, PARTICLE_COUNT_MIN, PARTICLE_COUNT_MAX);
}

function loadMotionTuning() {
  const defaults = { friction: 0.5, radius: RADIUS_MIN, particleCount: null };
  try {
    const raw = window.localStorage.getItem(TUNING_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const parsedParticleCount = parsed.particleCount == null ? null : Number(parsed.particleCount);
    return {
      friction: clamp(Number(parsed.friction) || defaults.friction, FRICTION_MIN, FRICTION_MAX),
      radius: clamp(Number(parsed.radius) || defaults.radius, RADIUS_MIN, RADIUS_MAX),
      particleCount: parsedParticleCount != null && Number.isFinite(parsedParticleCount)
        ? normalizeParticleCount(parsedParticleCount)
        : defaults.particleCount
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
  if (radiusInput) radiusInput.value = motionTuning.radius.toFixed(2);
  if (radiusNumberInput) radiusNumberInput.value = (motionTuning.radius * 100).toFixed(0);
  if (particleCountInput) particleCountInput.value = String(displayParticleCount);
  if (particleCountNumberInput) particleCountNumberInput.value = String(displayParticleCount);
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
  letterEntries = [];

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
    Math.max(logoBounds.z * 5.4, 380)
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
  particleCount = 0;
  particleTargetCount = 0;
}

function ensureParticleMaterial() {
  if (particleMaterial) return;
  particleMaterial = new THREE.PointsMaterial({
    map: particleSprite,
    color: 0xffffff,
    transparent: true,
    opacity: 0.98,
    alphaTest: 0.22,
    blending: THREE.NormalBlending,
    depthWrite: false,
    sizeAttenuation: true,
    vertexColors: true,
    size: isMobileLayout ? 12.8 : 9.8
  });
}

function rebuildParticleGeometry() {
  const geometry = new THREE.BufferGeometry();
  positionAttr = new THREE.BufferAttribute(particlePositions, 3);
  colorAttr = new THREE.BufferAttribute(particleColors, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);

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
  particleAssignedIntensity[index] = 1;
  particleAssignedLetter[index] = -1;
  particleSpin[index] = Math.random() < 0.5 ? -1 : 1;
  particleAssignedColors[o] = -1;
  particleAssignedColors[o + 1] = -1;
  particleAssignedColors[o + 2] = -1;

  sampler.sample(tmpV1, tmpV2);
  tmpV2.normalize();

  if (Math.random() < 0.72) {
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
      randomSpread(fieldX * 1.6),
      randomSpread(fieldY * 1.7),
      randomSpread(fieldZ * 1.2)
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

function buildParticles(count) {
  if (!textGeometry || !textMesh) return;

  disposeParticles();
  fluidVelocityX.fill(0);
  fluidVelocityY.fill(0);
  fluidVelocityNextX.fill(0);
  fluidVelocityNextY.fill(0);
  fluidPressure.fill(0);
  fluidPressureNext.fill(0);
  fluidDivergence.fill(0);

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

function injectFluidImpulse(worldX, worldY, velocityX, velocityY, radius, strength) {
  const speed = Math.hypot(velocityX, velocityY);
  if (speed < 0.001) return;

  const boundX = Math.max(viewportBounds.x, 1);
  const boundY = Math.max(viewportBounds.y, 1);
  const spanX = boundX * 2;
  const spanY = boundY * 2;
  const cellSizeX = spanX / Math.max(FLUID_COLS - 1, 1);
  const cellSizeY = spanY / Math.max(FLUID_ROWS - 1, 1);
  const radiusSq = radius * radius;
  const impulseX = velocityX * strength;
  const impulseY = velocityY * strength;
  const dirX = velocityX / speed;
  const dirY = velocityY / speed;

  toFluidGridPosition(worldX, worldY, tmpFlowA);
  const minX = Math.max(0, Math.floor(tmpFlowA.x - radius / cellSizeX) - 1);
  const maxX = Math.min(FLUID_COLS - 1, Math.ceil(tmpFlowA.x + radius / cellSizeX) + 1);
  const minY = Math.max(0, Math.floor(tmpFlowA.y - radius / cellSizeY) - 1);
  const maxY = Math.min(FLUID_ROWS - 1, Math.ceil(tmpFlowA.y + radius / cellSizeY) + 1);

  for (let y = minY; y <= maxY; y++) {
    const worldCellY = -boundY + (y / Math.max(FLUID_ROWS - 1, 1)) * spanY;
    for (let x = minX; x <= maxX; x++) {
      const worldCellX = -boundX + (x / Math.max(FLUID_COLS - 1, 1)) * spanX;
      const dx = worldCellX - worldX;
      const dy = worldCellY - worldY;
      const distSq = dx * dx + dy * dy;
      if (distSq > radiusSq) continue;

      const falloff = Math.pow(1 - distSq / radiusSq, 2);
      const dist = Math.sqrt(distSq) + 0.0001;
      const tangentX = -dy / dist;
      const tangentY = dx / dist;
      const cross = dirX * (dy / dist) - dirY * (dx / dist);
      const curl = cross * speed * strength * 0.46 * falloff;
      const index = y * FLUID_COLS + x;

      fluidVelocityX[index] += impulseX * falloff + tangentX * curl;
      fluidVelocityY[index] += impulseY * falloff + tangentY * curl;
    }
  }
}

function stepFluidField(frame) {
  const boundX = Math.max(viewportBounds.x, 1);
  const boundY = Math.max(viewportBounds.y, 1);
  const advectScaleX = ((FLUID_COLS - 1) / (boundX * 2)) * 0.82;
  const advectScaleY = ((FLUID_ROWS - 1) / (boundY * 2)) * 0.82;
  const viscosity = 0.16;
  const damping = Math.pow(0.988 - motionTuning.friction * 0.032, frame);
  const edgeDamping = 0.88;
  const swirlStrength = 0.08;
  const pressureIterations = 7;
  const projectionStrength = 0.92;

  for (let y = 0; y < FLUID_ROWS; y++) {
    const upY = Math.max(y - 1, 0);
    const downY = Math.min(y + 1, FLUID_ROWS - 1);
    for (let x = 0; x < FLUID_COLS; x++) {
      const leftX = Math.max(x - 1, 0);
      const rightX = Math.min(x + 1, FLUID_COLS - 1);
      const index = y * FLUID_COLS + x;
      const leftIndex = y * FLUID_COLS + leftX;
      const rightIndex = y * FLUID_COLS + rightX;
      const upIndex = upY * FLUID_COLS + x;
      const downIndex = downY * FLUID_COLS + x;

      const vx = fluidVelocityX[index];
      const vy = fluidVelocityY[index];

      sampleFluidArrays(
        x - vx * advectScaleX * frame * 0.88,
        y - vy * advectScaleY * frame * 0.88,
        fluidVelocityX,
        fluidVelocityY,
        tmpFlowA
      );

      const avgX = (
        fluidVelocityX[leftIndex] +
        fluidVelocityX[rightIndex] +
        fluidVelocityX[upIndex] +
        fluidVelocityX[downIndex]
      ) * 0.25;
      const avgY = (
        fluidVelocityY[leftIndex] +
        fluidVelocityY[rightIndex] +
        fluidVelocityY[upIndex] +
        fluidVelocityY[downIndex]
      ) * 0.25;

      let nextX = tmpFlowA.x + (avgX - tmpFlowA.x) * viscosity;
      let nextY = tmpFlowA.y + (avgY - tmpFlowA.y) * viscosity;

      nextX += (fluidVelocityY[downIndex] - fluidVelocityY[upIndex]) * swirlStrength * frame;
      nextY += (fluidVelocityX[leftIndex] - fluidVelocityX[rightIndex]) * swirlStrength * frame;

      if (x === 0 || x === FLUID_COLS - 1 || y === 0 || y === FLUID_ROWS - 1) {
        nextX *= edgeDamping;
        nextY *= edgeDamping;
      }

      nextX *= damping;
      nextY *= damping;

      fluidVelocityNextX[index] = Math.abs(nextX) < 0.00008 ? 0 : nextX;
      fluidVelocityNextY[index] = Math.abs(nextY) < 0.00008 ? 0 : nextY;
    }
  }

  fluidPressure.fill(0);
  for (let y = 0; y < FLUID_ROWS; y++) {
    const upY = Math.max(y - 1, 0);
    const downY = Math.min(y + 1, FLUID_ROWS - 1);
    for (let x = 0; x < FLUID_COLS; x++) {
      const leftX = Math.max(x - 1, 0);
      const rightX = Math.min(x + 1, FLUID_COLS - 1);
      const index = y * FLUID_COLS + x;
      const leftIndex = y * FLUID_COLS + leftX;
      const rightIndex = y * FLUID_COLS + rightX;
      const upIndex = upY * FLUID_COLS + x;
      const downIndex = downY * FLUID_COLS + x;

      fluidDivergence[index] = 0.5 * (
        fluidVelocityNextX[rightIndex] -
        fluidVelocityNextX[leftIndex] +
        fluidVelocityNextY[downIndex] -
        fluidVelocityNextY[upIndex]
      );
    }
  }

  for (let iteration = 0; iteration < pressureIterations; iteration++) {
    for (let y = 0; y < FLUID_ROWS; y++) {
      const upY = Math.max(y - 1, 0);
      const downY = Math.min(y + 1, FLUID_ROWS - 1);
      for (let x = 0; x < FLUID_COLS; x++) {
        const leftX = Math.max(x - 1, 0);
        const rightX = Math.min(x + 1, FLUID_COLS - 1);
        const index = y * FLUID_COLS + x;
        const leftIndex = y * FLUID_COLS + leftX;
        const rightIndex = y * FLUID_COLS + rightX;
        const upIndex = upY * FLUID_COLS + x;
        const downIndex = downY * FLUID_COLS + x;

        fluidPressureNext[index] = (
          fluidPressure[leftIndex] +
          fluidPressure[rightIndex] +
          fluidPressure[upIndex] +
          fluidPressure[downIndex] -
          fluidDivergence[index]
        ) * 0.25;
      }
    }
    [fluidPressure, fluidPressureNext] = [fluidPressureNext, fluidPressure];
  }

  for (let y = 0; y < FLUID_ROWS; y++) {
    const upY = Math.max(y - 1, 0);
    const downY = Math.min(y + 1, FLUID_ROWS - 1);
    for (let x = 0; x < FLUID_COLS; x++) {
      const leftX = Math.max(x - 1, 0);
      const rightX = Math.min(x + 1, FLUID_COLS - 1);
      const index = y * FLUID_COLS + x;
      const leftIndex = y * FLUID_COLS + leftX;
      const rightIndex = y * FLUID_COLS + rightX;
      const upIndex = upY * FLUID_COLS + x;
      const downIndex = downY * FLUID_COLS + x;

      fluidVelocityNextX[index] -= (fluidPressure[rightIndex] - fluidPressure[leftIndex]) * 0.5 * projectionStrength;
      fluidVelocityNextY[index] -= (fluidPressure[downIndex] - fluidPressure[upIndex]) * 0.5 * projectionStrength;
    }
  }

  [fluidVelocityX, fluidVelocityNextX] = [fluidVelocityNextX, fluidVelocityX];
  [fluidVelocityY, fluidVelocityNextY] = [fluidVelocityNextY, fluidVelocityY];
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

  camera.aspect = width / height;
  camera.fov = isMobileLayout ? 37 : 33;
  camera.position.z = isMobileLayout ? 720 : 620;
  camera.updateProjectionMatrix();

  bloomPass.strength = isMobileLayout ? 0.48 : 0.63;
  bloomPass.radius = isMobileLayout ? 0.32 : 0.4;

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
      particleMaterial.size = isMobileLayout ? 12.8 : 9.8;
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
  const hitRadius = (isMobileLayout ? 17 : 11.5) * motionTuning.radius;
  const hitRadiusSq = hitRadius * hitRadius;
  const rayOriginX = pointer.rayOriginLocal.x;
  const rayOriginY = pointer.rayOriginLocal.y;
  const rayOriginZ = pointer.rayOriginLocal.z;
  const rayDirX = pointer.rayDirLocal.x;
  const rayDirY = pointer.rayDirLocal.y;
  const rayDirZ = pointer.rayDirLocal.z;

  if (pointer.active && pointer.ready && pointerEnergy > 0.0001) {
    injectFluidImpulse(
      pointer.local.x,
      pointer.local.y,
      pointer.velocity.x,
      pointer.velocity.y,
      hitRadius * 0.92,
      0.72 * frame
    );
  }
  stepFluidField(frame);

  if (particleSystem && positionAttr && colorAttr) {
    for (let i = 0; i < particleCount; i++) {
      const o = i * 3;
      const seed = particleSeeds[i];
      const turbulence = particleTurbulence[i];
      const mass = particleMass[i];

      const px = particlePositions[o];
      const py = particlePositions[o + 1];
      const pz = particlePositions[o + 2];

      let vx = particleVelocities[o];
      let vy = particleVelocities[o + 1];
      let vz = particleVelocities[o + 2];

      const sampleOffsetX = Math.sin(seed * 11.7 + pz * 0.006 + t * 0.14) * 6;
      const sampleOffsetY = Math.cos(seed * 13.1 + pz * 0.005 - t * 0.11) * 6;
      sampleFluidVelocity(px + sampleOffsetX, py + sampleOffsetY, tmpFlowA);
      const fluidCoupling = (0.31 + particleWake[i] * 0.15) * frame / mass;
      const fluidRelax = clamp((0.075 + particleWake[i] * 0.03) * frame / mass, 0, 0.19);
      vx += tmpFlowA.x * fluidCoupling;
      vy += tmpFlowA.y * fluidCoupling;
      vx += (tmpFlowA.x - vx) * fluidRelax;
      vy += (tmpFlowA.y - vy) * fluidRelax;

      if (pointer.active && pointer.ready && pointerEnergy > 0.0001) {
        const toParticleX = px - rayOriginX;
        const toParticleY = py - rayOriginY;
        const toParticleZ = pz - rayOriginZ;
        const along = toParticleX * rayDirX + toParticleY * rayDirY + toParticleZ * rayDirZ;

        if (along > 0) {
          const closestX = rayOriginX + rayDirX * along;
          const closestY = rayOriginY + rayDirY * along;
          const closestZ = rayOriginZ + rayDirZ * along;
          const radialX = px - closestX;
          const radialY = py - closestY;
          const radialZ = pz - closestZ;
          const distSq = radialX * radialX + radialY * radialY + radialZ * radialZ;

          if (distSq < hitRadiusSq) {
            const dist = Math.sqrt(distSq) || 1;
            const falloff = Math.pow(1 - distSq / hitRadiusSq, 2);
            const nx = radialX / dist;
            const ny = radialY / dist;
            const nz = radialZ / dist;
            const depthLift = pointerEnergy * falloff * 0.16 * frame;

            vx += nx * depthLift * 0.12;
            vy += ny * depthLift * 0.12;
            vz += nz * depthLift * 0.46 + (hash(i + 97) - 0.5) * depthLift * 0.22;
            particleColorMix[i] = 1;
            particleWake[i] = 1;
            const randomLetterIndex = Math.floor(Math.random() * letterEntries.length);
            tmpV4.copy(letterEntries[randomLetterIndex].glow.material.color);
            particleAssignedLetter[i] = randomLetterIndex;
            particleAssignedColors[o] = tmpV4.x;
            particleAssignedColors[o + 1] = tmpV4.y;
            particleAssignedColors[o + 2] = tmpV4.z;
            particleAssignedIntensity[i] = 1.7;
            particleColors[o] = tmpV4.x;
            particleColors[o + 1] = tmpV4.y;
            particleColors[o + 2] = tmpV4.z;
          }
        }
      }

      const boundX = viewportBounds.x;
      const boundY = viewportBounds.y;
      const boundZ = particleField.z;
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
      const dragBase = 0.994 - motionTuning.friction * 0.018;
      const dragMin = 0.968 - motionTuning.friction * 0.036;
      const dragMax = 0.998 - motionTuning.friction * 0.004;
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
      const assignedLetter = particleAssignedLetter[i];
      const assigned = assignedLetter >= 0;
      const speedGlow = assigned
        ? clamp(1.18 + speed * 0.28, 1.18, 1.42)
        : clamp(0.68 + speed * 0.1, 0.68, 0.98);
      const whiteMix = assigned
        ? clamp(0.0 + speed * 0.01, 0.0, 0.02)
        : clamp(0.05 + speed * 0.05, 0.05, 0.14);
      const sourceColor = assigned ? letterPalette[assignedLetter] : null;
      const baseR = assigned ? sourceColor.r : (assignedR >= 0 ? assignedR : TEAL.r);
      const baseG = assigned ? sourceColor.g : (assignedG >= 0 ? assignedG : TEAL.g);
      const baseB = assigned ? sourceColor.b : (assignedB >= 0 ? assignedB : TEAL.b);
      if (assigned) {
        const intensity = particleAssignedIntensity[i];
        const pulse = 1 + Math.sin(pulseTime * 8 + seed * 9) * 0.04;
        particleColors[o] = Math.min(1, baseR * intensity * speedGlow * pulse + whiteMix);
        particleColors[o + 1] = Math.min(1, baseG * intensity * speedGlow * pulse + whiteMix);
        particleColors[o + 2] = Math.min(1, baseB * intensity * speedGlow * pulse + whiteMix);
      } else {
        particleColors[o] = baseR * speedGlow * (1 - whiteMix) + whiteMix;
        particleColors[o + 1] = baseG * speedGlow * (1 - whiteMix) + whiteMix;
        particleColors[o + 2] = baseB * speedGlow * (1 - whiteMix) + whiteMix;
      }
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
  animate();
}

renderer.domElement.addEventListener("pointermove", (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.active = true;
  pointer.ndc.set(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -(((event.clientY - rect.top) / rect.height) * 2 - 1)
  );
  updatePointerProjection(true);
});

renderer.domElement.addEventListener("pointerleave", () => {
  pointer.active = false;
});

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
