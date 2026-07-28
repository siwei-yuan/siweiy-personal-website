"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const nameVertexShader = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPulse;
  varying float vSeed;
  varying float vEnergy;
  varying float vLens;
  varying float vDisperse;
  varying float vGlow;

  void main() {
    vec3 p = position;
    vec2 normalizedText = vec2(p.x / 10.0, p.y / 3.0);
    vec2 delta = normalizedText - uPointer;
    float pointerDistance = length(delta);
    float influence = 1.0 - smoothstep(0.04, 0.62, pointerDistance);
    float broadInfluence = 1.0 - smoothstep(0.0, 1.12, pointerDistance);
    vec2 direction = normalize(delta + vec2(0.0001));
    vec2 tangent = vec2(-direction.y, direction.x);

    p.xy += direction * influence * (0.72 + aSeed * 0.3);
    p.xy += tangent * sin(aSeed * 31.0 + uTime * 0.22) * influence * 0.11;
    p.z += influence * (0.56 + aSeed * 0.24);
    p.z += sin(uTime * 0.48 + aSeed * 28.0) * (0.012 + broadInfluence * 0.045);

    // Every particle performs its own bounded random walk around its letter
    // anchor. A shared curl field gives nearby particles correlated motion,
    // so the cloud feels alive without ever losing the name as its attractor.
    vec2 seedDirection = normalize(vec2(
      sin(aSeed * 91.7 + 0.6),
      cos(aSeed * 73.1 - 0.4)
    ));
    float randomWalkX = sin(uTime * (0.31 + aSeed * 0.61) + aSeed * 97.0)
      + sin(uTime * (1.07 + aSeed * 0.27) + aSeed * 41.0) * 0.38;
    float randomWalkY = cos(uTime * (0.28 + aSeed * 0.57) + aSeed * 83.0)
      + sin(uTime * (0.93 + aSeed * 0.33) + aSeed * 59.0) * 0.36;
    vec2 localField = vec2(
      sin(position.y * 2.6 + uTime * 0.54 + sin(position.x * 0.72)),
      cos(position.x * 1.45 - uTime * 0.47 + sin(position.y * 1.8))
    );
    float driftEnergy = 0.5 + 0.5 * sin(uTime * 0.39 + aSeed * 17.0);
    p.xy += vec2(randomWalkX, randomWalkY) * (0.045 + aSeed * 0.04);
    p.xy += localField * (0.055 + driftEnergy * 0.045);
    p.xy += seedDirection * sin(uTime * 0.22 + aSeed * 23.0) * 0.035;
    p.z += (randomWalkX - randomWalkY) * 0.045 + localField.x * 0.065;

    // Only a small subset crosses the lens. Most of the word remains anchored;
    // selected particles skim the rim, while a rarer group falls toward the core.
    vec2 horizonSpace = position.xy / 1.46;
    float horizonRadius = length(horizonSpace);
    vec2 horizonDirection = normalize(horizonSpace + vec2(0.0001));
    vec2 horizonTangent = vec2(-horizonDirection.y, horizonDirection.x);
    float horizon = exp(-abs(horizonRadius - 1.0) * 7.5);
    float innerBand = exp(-abs(horizonRadius - 0.58) * 10.0);
    float interiorLens = 1.0 - smoothstep(0.16, 1.22, horizonRadius);
    float rimParticle = step(0.936, aSeed);
    float fallingParticle = step(0.986, aSeed);
    float lensPulse = 0.72 + sin(uTime * 0.44 + aSeed * 8.0) * 0.28;
    p.xy += horizonTangent * horizon * rimParticle * lensPulse * (0.28 + aSeed * 0.24);
    p.xy += horizonTangent * innerBand * fallingParticle * sin(uTime * 0.38 + aSeed * 29.0) * 0.24;
    p.xy -= horizonDirection * interiorLens * fallingParticle * (0.14 + lensPulse * 0.12);
    p.z += horizon * rimParticle * (0.22 + aSeed * 0.28) + innerBand * fallingParticle * 0.38;

    float ring = exp(-abs(pointerDistance - uPulse * 0.7) * 11.0) * uPulse;
    p.xy += direction * ring * 0.33;
    p.z += ring * 0.75;

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    float glowParticle = step(0.974, aSeed);
    gl_PointSize = (1.12 + aSeed * 0.86 + influence * 1.28 + ring * 1.62 + horizon * rimParticle * 0.5 + glowParticle * 2.4) * (24.0 / -viewPosition.z);

    vSeed = aSeed;
    vEnergy = influence + ring + horizon * rimParticle * 0.46 + innerBand * fallingParticle * 0.5;
    vLens = max(horizon * rimParticle, innerBand * fallingParticle);
    vDisperse = driftEnergy;
    vGlow = glowParticle;
  }
`;

const nameFragmentShader = /* glsl */ `
  precision highp float;
  varying float vSeed;
  varying float vEnergy;
  varying float vLens;
  varying float vDisperse;
  varying float vGlow;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point);
    float circle = 1.0 - smoothstep(0.12, 0.5, radius);
    float softGlow = 1.0 - smoothstep(0.02, 0.5, radius);
    float redParticle = step(0.962, vSeed);
    vec3 bone = vec3(1.22, 1.28, 1.24);
    vec3 red = vec3(1.0, 0.09, 0.045);
    vec3 spectral = mix(vec3(0.14, 0.58, 0.72), vec3(1.0, 0.12, 0.055), step(0.5, vSeed));
    vec3 color = mix(bone, red, max(redParticle, vEnergy * 0.46));
    color = mix(color, spectral, vLens * 0.48);
    color += mix(vec3(0.34, 0.58, 0.52), vec3(1.0, 0.2, 0.08), step(0.54, vSeed)) * vGlow * 0.9;
    float alpha = circle * (0.72 + redParticle * 0.24 + vEnergy * 0.2 + vDisperse * 0.16);
    alpha += softGlow * vGlow * 0.56;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const navItems = ["experience", "projects", "contact"] as const;

function createNameGeometry(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 420;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const geometry = new THREE.BufferGeometry();
  if (!context) return geometry;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.textAlign = "left";
  context.textBaseline = "middle";

  let fontSize = 242;
  const fontFamily = '"Avenir Next Condensed", "DIN Condensed", "Arial Narrow", sans-serif';
  const letterSpacing = 14;
  const measureTrackedText = () => Array.from(label).reduce(
    (width, character) => width + context.measureText(character).width + letterSpacing,
    -letterSpacing,
  );
  context.font = `700 ${fontSize}px ${fontFamily}`;
  while (measureTrackedText() > canvas.width * 0.92 && fontSize > 120) {
    fontSize -= 4;
    context.font = `700 ${fontSize}px ${fontFamily}`;
  }
  let penX = (canvas.width - measureTrackedText()) / 2;
  for (const character of label) {
    context.fillText(character, penX, canvas.height / 2 + 8);
    penX += context.measureText(character).width + letterSpacing;
  }

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const positions: number[] = [];
  const seeds: number[] = [];
  const step = 5;

  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha > 96 && Math.random() > 0.07) {
        const jitter = step * 0.18;
        positions.push(
          ((x - canvas.width / 2 + (Math.random() - 0.5) * jitter) / canvas.width) * 20.0,
          (-(y - canvas.height / 2 + (Math.random() - 0.5) * jitter) / canvas.height) * 6.0,
          (Math.random() - 0.5) * 0.14,
        );
        seeds.push(Math.random());
      }
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export default function Home() {
  const sceneMountRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef(0);
  const pulseRef = useRef(0);
  const [activeSection, setActiveSection] = useState("experience");

  useEffect(() => {
    const mount = sceneMountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 16, 52);

    const compact = window.innerWidth < 760;
    const camera = new THREE.PerspectiveCamera(compact ? 55 : 44, 1, 0.1, 90);
    camera.position.set(0, 1.8, compact ? 20.4 : 17.2);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.72;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
    mount.appendChild(renderer.domElement);

    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      fog: false,
    });
    const groundGlowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - 0.5) * vec2(2.0, 4.4);
          float glow = exp(-dot(p, p) * 2.7);
          gl_FragColor = vec4(1.0, 0.025, 0.008, glow * 0.34);
        }
      `,
    });
    const haloMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPosition;
        void main() {
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vLocalPosition;
        uniform float uTime;
        void main() {
          float angle = atan(vLocalPosition.y, vLocalPosition.x);
          float facingLowerRight = max(0.0, cos(angle + 0.76));
          float shoulder = pow(facingLowerRight, 3.0);
          float whiteHot = pow(facingLowerRight, 14.0);
          float pulse = 0.92 + sin(uTime * 0.5) * 0.08;
          vec3 ember = vec3(1.0, 0.08, 0.035);
          vec3 white = vec3(1.0, 0.94, 0.88);
          vec3 color = mix(ember, white, whiteHot);
          float alpha = 0.075 + shoulder * 0.26 + whiteHot * 0.7 * pulse;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const haloGlowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vLocalPosition;
        void main() {
          vLocalPosition = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec3 vLocalPosition;
        uniform float uTime;
        void main() {
          float angle = atan(vLocalPosition.y, vLocalPosition.x);
          float focus = pow(max(0.0, cos(angle + 0.76)), 4.0);
          float pulse = 0.82 + sin(uTime * 0.42) * 0.18;
          gl_FragColor = vec4(1.0, 0.035, 0.012, (0.018 + focus * 0.17) * pulse);
        }
      `,
    });
    const eclipseMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float radius = length(p);
          if (radius > 1.0) discard;
          float angle = atan(p.y, p.x);
          float gravity = 0.09 / max(radius, 0.085);
          float foldedX = p.x + sin(p.y * 13.0 + uTime * 0.3) * gravity;
          float foldedY = p.y + sin(p.x * 9.0 - uTime * 0.22) * gravity * 0.65;
          float bandR = sin(foldedY * 38.0 + foldedX * 8.0 + uTime * 0.45);
          float bandG = sin(foldedY * 38.0 + foldedX * 8.0 + uTime * 0.45 + 0.9);
          float bandB = sin(foldedY * 38.0 + foldedX * 8.0 + uTime * 0.45 + 1.8);
          vec3 chroma = vec3(bandR, bandG, bandB) * 0.5 + 0.5;
          float caustic = pow(max(0.0, sin(angle * 5.0 + 5.0 / (radius + 0.16) - uTime * 0.35)), 7.0);
          float warpedBandRadius = radius + sin(angle * 3.0 - uTime * 0.28) * 0.022;
          float innerBand = exp(-abs(warpedBandRadius - 0.56) * 31.0);
          float bandBreak = 0.58 + 0.42 * sin(angle * 7.0 + uTime * 0.4);
          float interior = 1.0 - smoothstep(0.58, 0.98, radius);
          vec3 color = vec3(0.006, 0.009, 0.011);
          color += chroma * interior * 0.075;
          color += vec3(0.22, 0.06, 0.05) * caustic * interior * 0.18;
          color += mix(vec3(0.08, 0.32, 0.38), vec3(0.7, 0.035, 0.018), bandBreak) * innerBand * 0.34;
          float alpha = 0.82 + interior * 0.14;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });

    const architecture = new THREE.Group();
    const landscape = new THREE.Group();
    scene.add(architecture);
    scene.add(landscape);

    // Nothing remains in the world except a black receiving plane and its red spill.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 72), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -7.15, -10);
    ground.receiveShadow = !compact;
    landscape.add(ground);

    const groundGlow = new THREE.Mesh(new THREE.PlaneGeometry(18, 24), groundGlowMaterial);
    groundGlow.rotation.x = -Math.PI / 2;
    groundGlow.position.set(0, -7.12, -4.6);
    groundGlow.renderOrder = 8;
    landscape.add(groundGlow);

    // Keep the monolith optically smooth: broad facets catch light, while the
    // silhouette stays unnaturally clean and slightly wider toward the viewer.
    const pyramidMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x172326,
      roughness: 0.24,
      metalness: 0.68,
      clearcoat: 0.38,
      clearcoatRoughness: 0.2,
      flatShading: true,
    });
    const pyramidGeometry = new THREE.ConeGeometry(11.3, 17.2, 4, 1, false, Math.PI / 4);
    const pyramidPositions = pyramidGeometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < pyramidPositions.count; index += 1) {
      const originalY = pyramidPositions.getY(index);
      const topWeight = THREE.MathUtils.clamp((8.6 - originalY) / 17.2, 0, 1);
      pyramidPositions.setX(index, pyramidPositions.getX(index) * (1 + topWeight * 0.28));
      pyramidPositions.setZ(index, pyramidPositions.getZ(index) * (1 + topWeight * 0.11));
    }
    pyramidGeometry.computeVertexNormals();
    const pyramid = new THREE.Mesh(pyramidGeometry, pyramidMaterial);
    pyramid.position.set(0, 4.05, -6.15);
    pyramid.rotation.z = Math.PI;
    pyramid.rotation.y = 0.14;
    pyramid.rotation.x = -0.025;
    pyramid.castShadow = !compact;
    pyramid.receiveShadow = !compact;
    architecture.add(pyramid);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x9faaa6,
      transparent: true,
      opacity: 0.22,
    });
    const pyramidEdges = new THREE.LineSegments(new THREE.EdgesGeometry(pyramidGeometry, 20), edgeMaterial);
    pyramidEdges.position.copy(pyramid.position);
    pyramidEdges.rotation.copy(pyramid.rotation);
    architecture.add(pyramidEdges);

    // The eclipse is physically behind the monolith. The opaque pyramid writes
    // depth first, masking the upper arc while the lower half escapes its tip.
    const eclipseDisc = new THREE.Mesh(new THREE.CircleGeometry(2.28, 160), eclipseMaterial);
    eclipseDisc.position.set(0, -4.55, -6.82);
    eclipseDisc.renderOrder = 1;
    architecture.add(eclipseDisc);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.34, 0.032, 8, 192), haloMaterial);
    halo.position.set(0, -4.55, -6.7);
    halo.renderOrder = 2;
    architecture.add(halo);
    const haloGlow = new THREE.Mesh(new THREE.TorusGeometry(2.34, 0.24, 12, 192), haloGlowMaterial);
    haloGlow.position.set(0, -4.55, -6.76);
    haloGlow.renderOrder = 1;
    architecture.add(haloGlow);

    const lensHighlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xf7fff9,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const lensHighlight = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 16), lensHighlightMaterial);
    lensHighlight.position.set(1.68, -6.2, -6.58);
    lensHighlight.renderOrder = 3;
    architecture.add(lensHighlight);

    const redAtmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xff1b12,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const redAtmosphere = new THREE.Mesh(
      new THREE.ConeGeometry(4.8, 4.8, 48, 1, true),
      redAtmosphereMaterial,
    );
    redAtmosphere.position.set(0, -5.05, -5.45);
    architecture.add(redAtmosphere);

    const ambientLight = new THREE.HemisphereLight(0x6f7e79, 0x030505, 0.84);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xd5ded9, 2.15);
    keyLight.position.set(-8, 13, 8);
    keyLight.castShadow = !compact;
    keyLight.shadow.mapSize.set(1536, 1536);
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 17;
    keyLight.shadow.camera.bottom = -10;
    scene.add(keyLight);

    const coldFill = new THREE.DirectionalLight(0x718985, 0.68);
    coldFill.position.set(9, 3, -2);
    scene.add(coldFill);

    const frontFill = new THREE.DirectionalLight(0xc1cfca, 0.82);
    frontFill.position.set(2, 5, 12);
    scene.add(frontFill);

    const coldSurfaceLight = new THREE.SpotLight(0xc8dedf, 365, 45, Math.PI * 0.3, 0.82, 1.4);
    coldSurfaceLight.position.set(-9, 9.5, 10);
    coldSurfaceLight.target.position.set(0, 4.5, -6.1);
    scene.add(coldSurfaceLight, coldSurfaceLight.target);

    // The name is a sampled type silhouette: every visible mark is a particle.
    const nameGeometry = createNameGeometry("SIWEI YUAN");
    const nameMaterial = new THREE.ShaderMaterial({
      vertexShader: nameVertexShader,
      fragmentShader: nameFragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPointer: { value: new THREE.Vector2(3, 3) },
        uPulse: { value: 0 },
      },
    });
    const namePoints = new THREE.Points(nameGeometry, nameMaterial);
    namePoints.position.set(0, -3.0, 2.75);
    namePoints.scale.setScalar(compact ? 0.96 : 1.15);
    namePoints.renderOrder = 12;
    scene.add(namePoints);

    const targetPointer = new THREE.Vector2(0, 0);
    const currentPointer = new THREE.Vector2(0, 0);
    const restingNamePointer = new THREE.Vector2(3, 3);
    let pointerActive = false;
    const onPointerMove = (event: PointerEvent) => {
      pointerActive = true;
      targetPointer.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -((event.clientY / window.innerHeight) * 2 - 1),
      );
    };
    const onPointerDown = () => {
      pulseRef.current = 1;
    };
    const onPointerLeave = () => {
      pointerActive = false;
      targetPointer.set(0, 0);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize);
    resize();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startTime = performance.now();
    let animationFrame = 0;
    const animate = (timestamp: number) => {
      const elapsed = reduceMotion ? 0 : (timestamp - startTime) / 1000;
      currentPointer.lerp(targetPointer, reduceMotion ? 1 : 0.045);

      const baseZ = compact ? 20.4 : 17.2;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, currentPointer.x * 1.05, 0.045);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.8 + currentPointer.y * 0.58, 0.045);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, baseZ + scrollRef.current * 2.4, 0.03);
      camera.lookAt(currentPointer.x * -0.3, 1.15 + currentPointer.y * -0.18, -5.8);

      architecture.rotation.y = THREE.MathUtils.lerp(architecture.rotation.y, currentPointer.x * -0.042, 0.04);
      architecture.rotation.x = THREE.MathUtils.lerp(architecture.rotation.x, currentPointer.y * 0.012, 0.04);
      architecture.position.x = THREE.MathUtils.lerp(architecture.position.x, currentPointer.x * -0.28, 0.04);
      landscape.position.x = THREE.MathUtils.lerp(landscape.position.x, currentPointer.x * -0.09, 0.025);
      landscape.rotation.y = THREE.MathUtils.lerp(landscape.rotation.y, currentPointer.x * -0.008, 0.025);

      namePoints.rotation.y = THREE.MathUtils.lerp(namePoints.rotation.y, currentPointer.x * 0.035, 0.06);
      namePoints.rotation.x = THREE.MathUtils.lerp(namePoints.rotation.x, currentPointer.y * -0.018, 0.06);
      nameMaterial.uniforms.uTime.value = elapsed;
      nameMaterial.uniforms.uPointer.value.copy(pointerActive ? currentPointer : restingNamePointer);
      pulseRef.current *= reduceMotion ? 0.7 : 0.935;
      nameMaterial.uniforms.uPulse.value = pulseRef.current;

      eclipseMaterial.uniforms.uTime.value = elapsed;
      haloMaterial.uniforms.uTime.value = elapsed;
      haloGlowMaterial.uniforms.uTime.value = elapsed;
      lensHighlightMaterial.opacity = 0.76 + Math.sin(elapsed * 0.5) * 0.12;
      redAtmosphereMaterial.opacity = 0.021 + Math.sin(elapsed * 0.36) * 0.006;

      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", resize);
      nameGeometry.dispose();
      nameMaterial.dispose();
      architecture.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      landscape.traverse((object) => {
        if (object instanceof THREE.Mesh) object.geometry.dispose();
      });
      groundMaterial.dispose();
      groundGlowMaterial.dispose();
      haloMaterial.dispose();
      haloGlowMaterial.dispose();
      lensHighlightMaterial.dispose();
      eclipseMaterial.dispose();
      pyramidMaterial.dispose();
      pyramidEdges.geometry.dispose();
      edgeMaterial.dispose();
      redAtmosphereMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    const updateScroll = () => {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      const progress = maxScroll > 0 ? window.scrollY / maxScroll : 0;
      scrollRef.current = progress;
      document.documentElement.style.setProperty("--scroll-progress", `${progress}`);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-25% 0px -55%", threshold: [0, 0.25, 0.6] },
    );
    navItems.forEach((id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    window.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateScroll);
    };
  }, []);

  return (
    <div className="site-shell">
      <div ref={sceneMountRef} className="three-scene" aria-hidden="true" />
      <div className="atmosphere" aria-hidden="true" />
      <div className="film-grain" aria-hidden="true" />
      <div className="scroll-meter" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#index" aria-label="Back to Siwei Yuan home">
          <i /> SIWEI YUAN <span>/ ARCHIVE</span>
        </a>
        <nav aria-label="Main navigation">
          {navItems.map((item, index) => (
            <a key={item} href={`#${item}`} className={activeSection === item ? "active" : ""}>
              <span>0{index + 1}</span>{item}
            </a>
          ))}
        </nav>
        <p className="system-status"><i /> SCENE / LIVE</p>
      </header>

      <main>
        <section id="index" className="hero" aria-labelledby="hero-name">
          <h1 id="hero-name" className="sr-only">Siwei Yuan</h1>
          <div className="hero-frame" aria-hidden="true" />
          <div className="hero-label label-left">
            <span>SUBJECT / 001</span>
            <span>SIWEI YUAN</span>
          </div>
          <div className="hero-label label-right">
            <span>SHANGHAI</span>
            <span>UTC +08:00</span>
          </div>
          <div className="interaction-note">
            <i />
            <span>MOVE TO SHIFT THE HOUSE</span>
            <span>CLICK TO DISPERSE SIGNAL</span>
          </div>
          <a className="scroll-cue" href="#experience">
            <span>ENTER ARCHIVE</span>
            <i />
          </a>
        </section>

        <section id="experience" className="content-section" aria-labelledby="experience-title">
          <div className="section-rail">
            <span>01</span>
            <p>EXPERIENCE</p>
          </div>
          <div className="section-body">
            <p className="section-kicker">Recorded history / selected coordinates</p>
            <h2 id="experience-title">Work done at the edge of the known map.</h2>
            <div className="record-list">
              <article>
                <span>2024—NOW</span>
                <h3>Current Role</h3>
                <p>Role, company, and a concise line about the territory you own.</p>
                <em>DETAILS CLASSIFIED</em>
              </article>
              <article>
                <span>2021—2024</span>
                <h3>Previous Chapter</h3>
                <p>A meaningful result, the system behind it, and the people it served.</p>
                <em>ARCHIVE ENTRY 002</em>
              </article>
              <article>
                <span>2018—2021</span>
                <h3>Origin Point</h3>
                <p>The first signal: formative work, obsessions, and useful scars.</p>
                <em>ARCHIVE ENTRY 001</em>
              </article>
            </div>
          </div>
        </section>

        <section id="projects" className="content-section projects-section" aria-labelledby="projects-title">
          <div className="section-rail">
            <span>02</span>
            <p>PROJECTS</p>
          </div>
          <div className="section-body">
            <p className="section-kicker">Recovered artifacts / field objects</p>
            <h2 id="projects-title">Signals worth leaving behind.</h2>
            <div className="project-grid">
              {["A", "B", "C"].map((letter, index) => (
                <article key={letter}>
                  <div className="project-object" aria-hidden="true"><i /><b>{letter}</b></div>
                  <span>PROJECT / 00{index + 1}</span>
                  <h3>Untitled Artifact {letter}</h3>
                  <p>Case study placeholder · context, intervention, consequence.</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="contact-section" aria-labelledby="contact-title">
          <div className="contact-panel">
            <p className="section-kicker">Contact / establish a strand</p>
            <h2 id="contact-title">If the signal reaches you, answer.</h2>
            <a href="mailto:hello@your-domain.com">hello@your-domain.com <span>↗</span></a>
            <div>
              <span>AVAILABLE FOR CONVERSATIONS</span>
              <span>SHANGHAI / UTC+8</span>
            </div>
          </div>
          <footer>
            <span>© {new Date().getFullYear()} SIWEI YUAN</span>
            <a href="#index">RETURN TO SURFACE ↑</a>
          </footer>
        </section>
      </main>
    </div>
  );
}
