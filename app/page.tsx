"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const nameVertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aMotion;
  attribute float aSpeed;
  attribute float aSize;
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
    float particleSpeed = mix(0.16, 1.38, aSpeed);
    float particleRange = mix(0.012, 0.19, pow(aMotion, 1.7));
    float randomWalkX = sin(uTime * particleSpeed + aSeed * 97.0)
      + sin(uTime * particleSpeed * 2.73 + aSeed * 41.0) * 0.38;
    float randomWalkY = cos(uTime * particleSpeed * 0.87 + aSeed * 83.0)
      + sin(uTime * particleSpeed * 2.11 + aSeed * 59.0) * 0.36;
    vec2 localField = vec2(
      sin(position.y * 2.6 + uTime * 0.54 + sin(position.x * 0.72)),
      cos(position.x * 1.45 - uTime * 0.47 + sin(position.y * 1.8))
    );
    float driftEnergy = 0.5 + 0.5 * sin(uTime * 0.39 + aSeed * 17.0);
    p.xy += vec2(randomWalkX, randomWalkY) * particleRange;
    p.xy += localField * particleRange * (0.32 + driftEnergy * 0.38);
    p.xy += seedDirection * sin(uTime * particleSpeed * 0.7 + aSeed * 23.0) * particleRange * 0.28;
    p.z += ((randomWalkX - randomWalkY) * 0.38 + localField.x * 0.28) * particleRange;

    // Only a small subset crosses the lens. Most of the word remains anchored;
    // selected particles skim the rim, while a rarer group falls toward the core.
    vec2 horizonSpace = position.xy / 3.6;
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
    gl_PointSize = (0.82 + aSize * 1.05 + influence * 1.1 + ring * 1.48 + horizon * rimParticle * 0.44 + glowParticle * 2.5) * (24.0 / -viewPosition.z);

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
    vec3 bone = vec3(1.16, 1.22, 1.2);
    vec3 spectral = mix(vec3(0.18, 0.48, 0.58), vec3(0.66, 0.82, 0.88), step(0.52, vSeed));
    vec3 color = mix(bone, spectral, vLens * 0.42);
    color += vec3(1.28, 1.34, 1.3) * vGlow;
    float alpha = circle * (0.7 + vEnergy * 0.16 + vDisperse * 0.12);
    alpha += softGlow * vGlow * 0.62;
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
  const motions: number[] = [];
  const speeds: number[] = [];
  const sizes: number[] = [];

  // Random sampling removes the hidden grid completely. Natural clustering and
  // gaps become part of the silhouette instead of an artificial dot matrix.
  for (let attempt = 0; attempt < 32_000; attempt += 1) {
    const x = Math.floor(Math.random() * canvas.width);
    const y = Math.floor(Math.random() * canvas.height);
    const alpha = pixels[(y * canvas.width + x) * 4 + 3];
    if (alpha > 96) {
      positions.push(
        ((x - canvas.width / 2) / canvas.width) * 20.0,
        (-(y - canvas.height / 2) / canvas.height) * 6.0,
        (Math.random() - 0.5) * 0.3,
      );
      seeds.push(Math.random());
      motions.push(Math.random());
      speeds.push(Math.random());
      sizes.push(Math.pow(Math.random(), 1.35));
    }
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aMotion", new THREE.Float32BufferAttribute(motions, 1));
  geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speeds, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

export default function Home() {
  const sceneMountRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
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

    const haloMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
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
          float angle = atan(p.y, p.x);
          float radialDistortion = sin(angle * 3.0 + uTime * 0.16) * 0.0035
            + sin(angle * 11.0 - uTime * 0.21) * 0.0018;
          float warpedRadius = radius + radialDistortion;
          float core = exp(-abs(warpedRadius - 0.925) * 235.0);
          float closeGlow = exp(-abs(warpedRadius - 0.925) * 54.0);
          float farGlow = exp(-abs(warpedRadius - 0.925) * 17.0);
          float facingLowerRight = max(0.0, cos(angle + 0.76));
          float shoulder = pow(facingLowerRight, 3.4);
          float whiteHot = pow(facingLowerRight, 15.0);
          float pulse = 0.94 + sin(uTime * 0.43) * 0.06;
          vec3 ember = vec3(0.72, 0.018, 0.009);
          vec3 white = vec3(1.36, 1.31, 1.25);
          vec3 color = mix(ember, white, whiteHot);
          float baseLight = core * (0.025 + shoulder * 0.3 + whiteHot * 1.35);
          float bloom = closeGlow * (0.006 + shoulder * 0.16 + whiteHot * 0.48)
            + farGlow * whiteHot * 0.11;
          float alpha = (baseLight + bloom) * pulse;
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(color, alpha);
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
    scene.add(architecture);

    // A hand-built three-face monolith: one uninterrupted front plane faces
    // the viewer, while two widened side wings create the reverse perspective.
    const pyramidFrontMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x202b2e,
      roughness: 0.42,
      metalness: 0.68,
      clearcoat: 0.28,
      clearcoatRoughness: 0.28,
      flatShading: true,
    });
    const pyramidLeftMaterial = pyramidFrontMaterial.clone();
    pyramidLeftMaterial.color.setHex(0x293a3f);
    pyramidLeftMaterial.emissive.setHex(0x071014);
    pyramidLeftMaterial.emissiveIntensity = 0.24;
    const pyramidRightMaterial = pyramidFrontMaterial.clone();
    pyramidRightMaterial.color.setHex(0x231719);
    pyramidRightMaterial.emissive.setHex(0x290403);
    pyramidRightMaterial.emissiveIntensity = 0.17;

    const pyramidGeometry = new THREE.BufferGeometry();
    pyramidGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      // Broad uninterrupted front face.
      -10.1, 8.6, 0.55,   0, -8.6, 2.0,   10.1, 8.6, 0.55,
      // Reverse-perspective left wing.
      -13.25, 8.6, -0.85,  0, -8.6, 2.0,   -10.1, 8.6, 0.55,
      // Reverse-perspective right wing.
      10.1, 8.6, 0.55,    0, -8.6, 2.0,   13.25, 8.6, -0.85,
    ], 3));
    pyramidGeometry.addGroup(0, 3, 0);
    pyramidGeometry.addGroup(3, 3, 1);
    pyramidGeometry.addGroup(6, 3, 2);
    pyramidGeometry.computeVertexNormals();
    const pyramid = new THREE.Mesh(
      pyramidGeometry,
      [pyramidFrontMaterial, pyramidLeftMaterial, pyramidRightMaterial],
    );
    pyramid.position.set(0, 4.05, -6.15);
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

    const redEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xff3529,
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
    });
    const redEdgeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(10.1, 8.6, 0.55), new THREE.Vector3(13.25, 8.6, -0.85),
      new THREE.Vector3(13.25, 8.6, -0.85), new THREE.Vector3(0, -8.6, 2.0),
    ]);
    const pyramidRedEdges = new THREE.LineSegments(redEdgeGeometry, redEdgeMaterial);
    pyramidRedEdges.position.copy(pyramid.position);
    pyramidRedEdges.rotation.copy(pyramid.rotation);
    pyramidRedEdges.renderOrder = 2;
    architecture.add(pyramidRedEdges);

    // The eclipse is physically behind the monolith. The opaque pyramid writes
    // depth first, masking the upper arc while the lower half escapes its tip.
    const eclipseDisc = new THREE.Mesh(new THREE.CircleGeometry(6.32, 192), eclipseMaterial);
    eclipseDisc.position.set(0, 0.45, -8.62);
    eclipseDisc.renderOrder = 1;
    architecture.add(eclipseDisc);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(6.98, 224), haloMaterial);
    halo.position.set(0, 0.45, -8.5);
    halo.renderOrder = 2;
    architecture.add(halo);

    const ambientLight = new THREE.HemisphereLight(0x687773, 0x020303, 0.72);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x9eafb2, 1.45);
    keyLight.position.set(-8, 13, 8);
    keyLight.castShadow = !compact;
    keyLight.shadow.mapSize.set(1536, 1536);
    keyLight.shadow.camera.left = -16;
    keyLight.shadow.camera.right = 16;
    keyLight.shadow.camera.top = 17;
    keyLight.shadow.camera.bottom = -10;
    scene.add(keyLight);

    const coldFill = new THREE.DirectionalLight(0x738e96, 1.15);
    coldFill.position.set(-10, 4, 5);
    scene.add(coldFill);

    const frontFill = new THREE.DirectionalLight(0xaab8b5, 0.72);
    frontFill.position.set(2, 5, 12);
    scene.add(frontFill);

    const redFaceLight = new THREE.DirectionalLight(0xff2b20, 2.05);
    redFaceLight.position.set(10, 2.2, 7);
    redFaceLight.target.position.set(-1.4, 1.2, -6.15);
    scene.add(redFaceLight, redFaceLight.target);

    const coldSurfaceLight = new THREE.SpotLight(0xaec4ca, 180, 45, Math.PI * 0.42, 0.92, 1.5);
    coldSurfaceLight.position.set(-10, 8, 9);
    coldSurfaceLight.target.position.set(-4.5, 3.2, -6.1);
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
    namePoints.position.set(0, 1.05, 2.75);
    namePoints.scale.setScalar(compact ? 0.96 : 1.15);
    namePoints.renderOrder = 12;
    scene.add(namePoints);

    const targetPointer = new THREE.Vector2(0, 0);
    const currentPointer = new THREE.Vector2(0, 0);
    const restingNamePointer = new THREE.Vector2(3, 3);
    let pointerActive = false;
    const onPointerMove = (event: PointerEvent) => {
      pointerActive = true;
      if (cursorRef.current) {
        cursorRef.current.style.left = `${event.clientX}px`;
        cursorRef.current.style.top = `${event.clientY}px`;
        cursorRef.current.style.opacity = "1";
      }
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
      if (cursorRef.current) cursorRef.current.style.opacity = "0";
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
      namePoints.rotation.y = THREE.MathUtils.lerp(namePoints.rotation.y, currentPointer.x * 0.035, 0.06);
      namePoints.rotation.x = THREE.MathUtils.lerp(namePoints.rotation.x, currentPointer.y * -0.018, 0.06);
      nameMaterial.uniforms.uTime.value = elapsed;
      nameMaterial.uniforms.uPointer.value.copy(pointerActive ? currentPointer : restingNamePointer);
      pulseRef.current *= reduceMotion ? 0.7 : 0.935;
      nameMaterial.uniforms.uPulse.value = pulseRef.current;

      eclipseMaterial.uniforms.uTime.value = elapsed;
      haloMaterial.uniforms.uTime.value = elapsed;
      redFaceLight.intensity = 1.9 + Math.sin(elapsed * 0.29) * 0.17;

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
      haloMaterial.dispose();
      eclipseMaterial.dispose();
      pyramidFrontMaterial.dispose();
      pyramidLeftMaterial.dispose();
      pyramidRightMaterial.dispose();
      pyramidEdges.geometry.dispose();
      edgeMaterial.dispose();
      redEdgeGeometry.dispose();
      redEdgeMaterial.dispose();
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
      <div ref={cursorRef} className="cursor-singularity" aria-hidden="true"><span /></div>

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
