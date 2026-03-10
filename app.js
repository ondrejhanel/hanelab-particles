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
const MAX_PARTICLES = 5000;
const COUNT_STEP = 100;

const container = document.getElementById("app");
if (!container) throw new Error("Missing #app container");

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
let particlePositions = new Float32Array(0);
let particleVelocities = new Float32Array(0);
let particleColors = new Float32Array(0);
let particleSeeds = new Float32Array(0);
let particleTurbulence = new Float32Array(0);
let particleMass = new Float32Array(0);
let particleColorMix = new Float32Array(0);
let particleWake = new Float32Array(0);
let particleAssignedColors = new Float32Array(0);
let particleSpin = new Float32Array(0);
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
  }
  if (particleMaterial) {
    particleMaterial.dispose();
  }
}

function buildParticles(count) {
  if (!textGeometry || !textMesh) return;

  disposeParticles();

  particleCount = count;
  particlePositions = new Float32Array(count * 3);
  particleVelocities = new Float32Array(count * 3);
  particleColors = new Float32Array(count * 3);
  particleSeeds = new Float32Array(count);
  particleTurbulence = new Float32Array(count);
  particleMass = new Float32Array(count);
  particleColorMix = new Float32Array(count);
  particleWake = new Float32Array(count);
  particleAssignedColors = new Float32Array(count * 3);
  particleSpin = new Float32Array(count);

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

  const geometry = new THREE.BufferGeometry();
  const sampler = new MeshSurfaceSampler(textMesh).build();
  const bounds = textGeometry.boundingBox?.getSize(new THREE.Vector3()) || new THREE.Vector3(600, 140, 40);
  const shellRadius = Math.max(bounds.x * 0.11, 28);
  const fieldX = particleField.x;
  const fieldY = particleField.y;
  const fieldZ = particleField.z;

  for (let i = 0; i < count; i++) {
    const o = i * 3;
    particleSeeds[i] = Math.random() * Math.PI * 2;
    particleTurbulence[i] = 0.75 + Math.random() * 1.1;
    particleMass[i] = 0.8 + Math.random() * 0.65;
    particleColorMix[i] = 0;
    particleWake[i] = 0;
    particleSpin[i] = Math.random() < 0.5 ? -1 : 1;
    particleAssignedColors[o] = -1;
    particleAssignedColors[o + 1] = -1;
    particleAssignedColors[o + 2] = -1;

    sampler.sample(tmpV1, tmpV2);
    tmpV2.normalize();

    if (Math.random() < 0.72) {
      tmpV3.set(hash(i + 19) - 0.5, hash(i + 41) - 0.5, hash(i + 83) - 0.5).normalize();
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

  positionAttr = new THREE.BufferAttribute(particlePositions, 3);
  colorAttr = new THREE.BufferAttribute(particleColors, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);

  particleSystem = new THREE.Points(geometry, particleMaterial);
  particleSystem.frustumCulled = false;
  particleSystem.renderOrder = 1;
  logoRig.add(particleSystem);
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

    const desiredCount = computeParticleCount(width, height);
    if (desiredCount !== particleCount) {
      buildParticles(desiredCount);
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
  const hitRadius = isMobileLayout ? 20 : 15;
  const hitRadiusSq = hitRadius * hitRadius;
  const rayOriginX = pointer.rayOriginLocal.x;
  const rayOriginY = pointer.rayOriginLocal.y;
  const rayOriginZ = pointer.rayOriginLocal.z;
  const rayDirX = pointer.rayDirLocal.x;
  const rayDirY = pointer.rayDirLocal.y;
  const rayDirZ = pointer.rayDirLocal.z;

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
            const falloff = 1 - distSq / hitRadiusSq;
            const nx = radialX / dist;
            const ny = radialY / dist;
            const nz = radialZ / dist;
            const swirlX = rayDirY * nz - rayDirZ * ny;
            const swirlY = rayDirZ * nx - rayDirX * nz;
            const swirlZ = rayDirX * ny - rayDirY * nx;
            const impulse = pointerEnergy * falloff * (1.15 / mass) * 0.026 * frame;
            const cursorPush = pointer.speed * falloff * (0.9 / mass) * 0.0011 * frame;

            vx += pointer.velocity.x * cursorPush * 12;
            vy += pointer.velocity.y * cursorPush * 12;
            vz += (Math.abs(pointer.velocity.x) + Math.abs(pointer.velocity.y)) * cursorPush * 0.9 * (hash(i + 97) - 0.5);

            vx += nx * impulse * 7 + swirlX * impulse * 4;
            vy += ny * impulse * 7 + swirlY * impulse * 4;
            vz += nz * impulse * 4 + swirlZ * impulse * 2.5;
            particleColorMix[i] = 1;
            particleWake[i] = 1;
            tmpV4.copy(letterPalette[Math.floor(hash(i + t * 100.0 + along) * LETTER_COUNT)]);
            particleAssignedColors[o] = tmpV4.x;
            particleAssignedColors[o + 1] = tmpV4.y;
            particleAssignedColors[o + 2] = tmpV4.z;
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

      particleWake[i] *= 0.965;
      let speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const swirlFactor = particleWake[i] * clamp(speed * 0.12 * turbulence, 0, 0.24) * frame;
      if (swirlFactor > 0.0001) {
        const spin = particleSpin[i];
        const swirlX = -vy * spin;
        const swirlY = vx * spin;
        const swirlZ = Math.sin(t * 1.7 + seed * 6.283) * speed * 0.35;
        vx += swirlX * swirlFactor;
        vy += swirlY * swirlFactor;
        vz += swirlZ * swirlFactor * 0.35;
      }

      speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      const drag = clamp(0.992 - speed * 0.0016 * frame - particleWake[i] * 0.02 * frame, 0.86, 0.996);
      vx *= drag;
      vy *= drag;
      vz *= drag;

      if (speed < 0.0025) {
        vx *= 0.65;
        vy *= 0.65;
        vz *= 0.65;
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
      const assigned = assignedR >= 0;
      const speedGlow = assigned
        ? clamp(1.06 + speed * 0.22, 1.06, 1.3)
        : clamp(0.68 + speed * 0.1, 0.68, 0.98);
      const whiteMix = assigned
        ? clamp(0.0 + speed * 0.015, 0.0, 0.03)
        : clamp(0.05 + speed * 0.05, 0.05, 0.14);
      const baseR = assignedR >= 0 ? assignedR : TEAL.r;
      const baseG = assignedG >= 0 ? assignedG : TEAL.g;
      const baseB = assignedB >= 0 ? assignedB : TEAL.b;
      if (assigned) {
        const pulse = 1 + Math.sin(pulseTime * 8 + seed * 9) * 0.04;
        particleColors[o] = Math.min(1, baseR * speedGlow * pulse * (1 - whiteMix) + whiteMix);
        particleColors[o + 1] = Math.min(1, baseG * speedGlow * pulse * (1 - whiteMix) + whiteMix);
        particleColors[o + 2] = Math.min(1, baseB * speedGlow * pulse * (1 - whiteMix) + whiteMix);
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

init().catch((error) => {
  console.error("[hanelab] Failed to initialize scene.", error);
});
