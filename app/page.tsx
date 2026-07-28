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

    // Wrap the word around a very flat, horizontal ellipsoid. The centre bulges
    // toward the viewer while both ends curl back and taper into the equator.
    float signedHorizontal = clamp(position.x / 9.6, -0.985, 0.985);
    float horizontalEdge = abs(signedHorizontal);
    float surfaceAngle = signedHorizontal * 1.12;
    float surfaceProfile = pow(
      max(1.0 - horizontalEdge * horizontalEdge, 0.015),
      0.55
    );
    float centreMass = 1.0 - smoothstep(0.02, 1.0, horizontalEdge);
    float verticalEnvelope = mix(0.5, 1.32, surfaceProfile);
    float silhouetteBreath = 1.0
      + sin(uTime * 0.23 + position.x * 0.19) * (0.012 + centreMass * 0.028);
    float horizontalBreath = 0.08 + sin(uTime * 0.31 + horizontalEdge * 1.7) * 0.045;
    p.x = sin(surfaceAngle) / sin(1.12) * 9.6;
    p.x += sign(position.x) * horizontalEdge * horizontalBreath;
    p.y *= verticalEnvelope * silhouetteBreath;
    p.y += sin(position.x * 0.48 - uTime * 0.18) * (0.018 + centreMass * 0.04);
    p.z += (cos(surfaceAngle) - cos(1.12)) * 1.34;

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

const navItems = ["experience", "projects", "blogs", "contact"] as const;

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
    camera.layers.enable(1);
    camera.layers.enable(2);

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
          float ringDistance = warpedRadius - 0.735;
          float angularLight = cos(angle + 0.76) * 0.5 + 0.5;
          float shoulder = pow(angularLight, 7.5);
          float whiteHot = pow(angularLight, 30.0);
          float core = exp(-pow(ringDistance / 0.0038, 2.0));
          float closeGlow = exp(-pow(ringDistance / 0.021, 2.0));
          float farGlow = exp(-pow(ringDistance / 0.059, 2.0));
          float scatterGlow = exp(-pow(ringDistance / 0.118, 2.0));

          vec2 hotDirection = normalize(vec2(cos(-0.76), sin(-0.76)));
          vec2 hotTangent = vec2(-hotDirection.y, hotDirection.x);
          vec2 hotOffset = p - hotDirection * 0.735;
          float hotRadial = dot(hotOffset, hotDirection);
          float hotAlongRing = dot(hotOffset, hotTangent);
          float ovalCore = exp(-(
            pow(hotRadial / 0.026, 2.0) + pow(hotAlongRing / 0.105, 2.0)
          ));
          float ovalBloom = exp(-(
            pow(hotRadial / 0.082, 2.0) + pow(hotAlongRing / 0.205, 2.0)
          ));
          float pulse = 0.94 + sin(uTime * 0.43) * 0.06;
          vec3 dimLine = vec3(0.66, 0.63, 0.6);
          vec3 ember = vec3(0.78, 0.022, 0.01);
          vec3 white = vec3(1.46, 1.4, 1.32);
          vec3 color = mix(dimLine, ember, shoulder);
          color = mix(color, white, max(whiteHot, ovalCore));
          float baseLight = core * (0.12 + shoulder * 0.36 + whiteHot * 0.72);
          float bloom = closeGlow * (0.014 + shoulder * 0.19 + whiteHot * 0.31)
            + farGlow * (shoulder * 0.072 + whiteHot * 0.12)
            + scatterGlow * (shoulder * 0.014 + whiteHot * 0.055)
            + ovalCore * 0.68 + ovalBloom * 0.16;
          float outerFeather = 1.0 - smoothstep(0.93, 0.995, radius);
          float alpha = (baseLight + bloom) * pulse * outerFeather;
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
          float gravity = 0.122 / max(radius, 0.085);
          float foldedX = p.x + sin(p.y * 13.0 + uTime * 0.3) * gravity;
          float foldedY = p.y + sin(p.x * 9.0 - uTime * 0.22) * gravity * 0.65;
          float bandR = sin(foldedY * 38.0 + foldedX * 8.0 + uTime * 0.45);
          float bandG = sin(foldedY * 38.0 + foldedX * 8.0 + uTime * 0.45 + 0.9);
          float bandB = sin(foldedY * 38.0 + foldedX * 8.0 + uTime * 0.45 + 1.8);
          vec3 chroma = vec3(bandR, bandG, bandB) * 0.5 + 0.5;
          float caustic = pow(max(0.0, sin(angle * 5.0 + 5.0 / (radius + 0.16) - uTime * 0.35)), 7.0);
          float warpedBandRadius = radius + sin(angle * 3.0 - uTime * 0.28) * 0.032;
          float innerBand = exp(-abs(warpedBandRadius - 0.56) * 31.0);
          float bandBreak = 0.58 + 0.42 * sin(angle * 7.0 + uTime * 0.4);
          float interior = 1.0 - smoothstep(0.58, 0.98, radius);
          vec3 color = vec3(0.006, 0.009, 0.011);
          color += chroma * interior * 0.105;
          color += vec3(0.22, 0.06, 0.05) * caustic * interior * 0.25;
          color += mix(vec3(0.08, 0.32, 0.38), vec3(0.7, 0.035, 0.018), bandBreak) * innerBand * 0.43;
          float alpha = 0.82 + interior * 0.14;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });

    const architecture = new THREE.Group();
    scene.add(architecture);

    const backgroundBoardMaterial = new THREE.ShaderMaterial({
      depthWrite: true,
      toneMapped: false,
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
          float centreLift = 1.0 - smoothstep(0.0, 0.72, distance(vUv, vec2(0.5, 0.48)));
          float lowerShade = smoothstep(0.0, 0.46, vUv.y);
          float centralJoint = exp(-pow((vUv.x - 0.5) / 0.0024, 2.0));
          vec3 color = mix(vec3(0.022, 0.025, 0.025), vec3(0.078, 0.086, 0.086), centreLift);
          color *= mix(0.7, 1.0, lowerShade);
          color += vec3(0.018, 0.021, 0.021) * centralJoint * 0.24;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const backgroundBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(34, 22),
      backgroundBoardMaterial,
    );
    backgroundBoard.position.set(0, 1.6, -9.35);
    architecture.add(backgroundBoard);

    const floorMaterial = new THREE.ShaderMaterial({
      depthWrite: true,
      toneMapped: false,
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
          vec2 lightOffset = vUv - vec2(0.638, 0.812);
          float redPool = exp(-(
            pow(lightOffset.x / 0.075, 2.0) + pow(lightOffset.y / 0.115, 2.0)
          ));
          float sourceCore = exp(-(
            pow(lightOffset.x / 0.026, 2.0) + pow(lightOffset.y / 0.046, 2.0)
          ));
          float floorDepth = mix(0.52, 1.0, smoothstep(0.12, 0.92, vUv.y));
          vec3 floorColor = vec3(0.032, 0.035, 0.035) * floorDepth;
          floorColor += vec3(0.19, 0.006, 0.003) * redPool;
          floorColor += vec3(0.34, 0.012, 0.006) * sourceCore;
          gl_FragColor = vec4(floorColor, 1.0);
        }
      `,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(34, 24), floorMaterial);
    floor.position.set(0, -4.95, -1.0);
    floor.rotation.x = -Math.PI / 2;
    architecture.add(floor);

    // A hand-built three-face monolith: one uninterrupted front plane faces
    // the viewer, while two widened side wings create the reverse perspective.
    const frontVertices = [-10.1, 8.6, 0.55, 0, -8.6, 2.0, 10.1, 8.6, 0.55];
    const leftVertices = [-13.25, 8.6, -0.85, 0, -8.6, 2.0, -10.1, 8.6, 0.55];
    const rightVertices = [10.1, 8.6, 0.55, 0, -8.6, 2.0, 13.25, 8.6, -0.85];
    const makeFaceGeometry = (vertices: number[], colors: number[]) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      const colorValues = colors.flatMap((color) => new THREE.Color(color).toArray());
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colorValues, 3));
      geometry.computeVertexNormals();
      return geometry;
    };
    const frontGeometry = makeFaceGeometry(frontVertices, [0x111719, 0x030404, 0x100b0c]);
    const leftGeometry = makeFaceGeometry(leftVertices, [0x71868b, 0x020404, 0x071012]);
    const rightGeometry = makeFaceGeometry(rightVertices, [0x0b0202, 0x040202, 0x73110d]);
    // Face-owned colour fields prevent a light intended for one side from
    // leaking onto the front plane. The front receives only a dim ambient tint.
    const pyramidFrontMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    const makePointLitFaceMaterial = (
      baseColor: number,
      lightColor: number,
      lightPosition: THREE.Vector2,
      radius: number,
      strength: number,
    ) => new THREE.ShaderMaterial({
      uniforms: {
        uBaseColor: { value: new THREE.Color(baseColor) },
        uLightColor: { value: new THREE.Color(lightColor) },
        uLightPosition: { value: lightPosition },
        uRadius: { value: radius },
        uStrength: { value: strength },
      },
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
        uniform vec3 uBaseColor;
        uniform vec3 uLightColor;
        uniform vec2 uLightPosition;
        uniform float uRadius;
        uniform float uStrength;
        void main() {
          float lightDistance = distance(vLocalPosition.xy, uLightPosition);
          float localFalloff = exp(-pow(lightDistance / uRadius, 2.0));
          float sourceCore = exp(-pow(lightDistance / (uRadius * 0.28), 2.0));
          float lowerFog = smoothstep(-8.2, -1.6, vLocalPosition.y);
          float surfaceVariation = 0.97
            + sin(vLocalPosition.x * 3.1 + vLocalPosition.y * 1.7) * 0.018;
          vec3 color = uBaseColor
            + uLightColor * (localFalloff * 0.24 + sourceCore * 0.18) * uStrength;
          color *= mix(0.38, 1.0, lowerFog) * surfaceVariation;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const pyramidLeftMaterial = makePointLitFaceMaterial(
      0x081012,
      0x82979b,
      new THREE.Vector2(-8.55, 3.15),
      2.32,
      1.66,
    );
    const pyramidRightMaterial = makePointLitFaceMaterial(
      0x120403,
      0xb51a14,
      new THREE.Vector2(8.8, 3.1),
      3.55,
      0.62,
    );
    const pyramidGeometry = new THREE.BufferGeometry();
    pyramidGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([...frontVertices, ...leftVertices, ...rightVertices], 3),
    );
    pyramidGeometry.computeVertexNormals();
    const pyramid = new THREE.Group();
    pyramid.position.set(0, 4.05, -6.15);
    const pyramidFront = new THREE.Mesh(frontGeometry, pyramidFrontMaterial);
    const pyramidLeft = new THREE.Mesh(leftGeometry, pyramidLeftMaterial);
    const pyramidRight = new THREE.Mesh(rightGeometry, pyramidRightMaterial);
    pyramidFront.layers.set(0);
    pyramidLeft.layers.set(1);
    pyramidRight.layers.set(2);
    for (const face of [pyramidFront, pyramidLeft, pyramidRight]) {
      face.castShadow = !compact;
      face.receiveShadow = !compact;
      pyramid.add(face);
    }

    const seamMaterials: THREE.ShaderMaterial[] = [];
    const makeSeamMaterial = (color: number, opacity: number) => new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
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
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() {
          float endFade = smoothstep(0.02, 0.18, vUv.y)
            * (1.0 - smoothstep(0.82, 0.98, vUv.y));
          float illuminatedSection = exp(-pow((vUv.y - 0.58) / 0.245, 2.0));
          float alpha = uOpacity * endFade * (0.055 + illuminatedSection * 0.945);
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
    });
    const addGlowingSeam = (start: THREE.Vector3, end: THREE.Vector3, color: number) => {
      const direction = end.clone().sub(start);
      const midpoint = start.clone().add(end).multiplyScalar(0.5);
      const orientation = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.clone().normalize(),
      );
      const coreMaterial = makeSeamMaterial(color, 0.31);
      const glowMaterial = makeSeamMaterial(color, 0.068);
      seamMaterials.push(coreMaterial, glowMaterial);
      for (const [radius, material] of [[0.014, coreMaterial], [0.065, glowMaterial]] as const) {
        const seam = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, direction.length(), 8, 1, true),
          material,
        );
        seam.position.copy(midpoint);
        seam.position.z += 0.045;
        seam.quaternion.copy(orientation);
        seam.renderOrder = 4;
        pyramid.add(seam);
      }
    };
    addGlowingSeam(
      new THREE.Vector3(-10.1, 8.6, 0.55),
      new THREE.Vector3(0, -8.6, 2.0),
      0x91b5bc,
    );
    addGlowingSeam(
      new THREE.Vector3(10.1, 8.6, 0.55),
      new THREE.Vector3(0, -8.6, 2.0),
      0xff3027,
    );
    architecture.add(pyramid);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x9faaa6,
      transparent: true,
      opacity: 0.055,
    });
    const pyramidEdges = new THREE.LineSegments(new THREE.EdgesGeometry(pyramidGeometry, 20), edgeMaterial);
    pyramidEdges.position.copy(pyramid.position);
    pyramidEdges.rotation.copy(pyramid.rotation);
    architecture.add(pyramidEdges);

    const redEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xff3529,
      transparent: true,
      opacity: 0.045,
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
    const halo = new THREE.Mesh(new THREE.CircleGeometry(8.8, 224), haloMaterial);
    halo.position.set(0, 0.45, -8.5);
    halo.renderOrder = 2;
    architecture.add(halo);

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
      backgroundBoardMaterial.dispose();
      floorMaterial.dispose();
      pyramidFrontMaterial.dispose();
      pyramidLeftMaterial.dispose();
      pyramidRightMaterial.dispose();
      pyramidGeometry.dispose();
      pyramidEdges.geometry.dispose();
      edgeMaterial.dispose();
      redEdgeGeometry.dispose();
      redEdgeMaterial.dispose();
      seamMaterials.forEach((material) => material.dispose());
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
        <nav aria-label="Main navigation">
          {navItems.map((item) => (
            <a key={item} href={`#${item}`} className={activeSection === item ? "active" : ""}>
              {item}
            </a>
          ))}
        </nav>
      </header>

      <main>
        <section id="index" className="hero" aria-labelledby="hero-name">
          <h1 id="hero-name" className="sr-only">Siwei Yuan</h1>
        </section>

        <section id="experience" className="content-section" aria-labelledby="experience-title">
          <div className="section-rail">
            <span>01</span>
            <p>EXPERIENCE</p>
          </div>
          <div className="section-body">
            <p className="section-kicker">Personnel record / controlled access</p>
            <h2 id="experience-title">Experience</h2>
            <div className="record-list">
              <article>
                <span>2024—NOW</span>
                <h3>Current Role</h3>
                <p>Company / title / the system or territory under your control.</p>
                <em>ACTIVE</em>
              </article>
              <article>
                <span>2021—2024</span>
                <h3>Previous Chapter</h3>
                <p>Company / title / one concrete intervention and its consequence.</p>
                <em>SEALED / 02</em>
              </article>
              <article>
                <span>2018—2021</span>
                <h3>Origin Point</h3>
                <p>Company / title / the formative work that established the trajectory.</p>
                <em>SEALED / 01</em>
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
            <p className="section-kicker">Case files / selected operations</p>
            <h2 id="projects-title">Projects</h2>
            <div className="project-grid">
              {["A", "B", "C"].map((letter, index) => (
                <article key={letter}>
                  <b className="project-number">0{index + 1}</b>
                  <span>CASE / {letter}</span>
                  <h3>Untitled Artifact {letter}</h3>
                  <p>Context / intervention / measurable consequence.</p>
                  <em>FILE OPEN ↗</em>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="blogs" className="content-section" aria-labelledby="blogs-title">
          <div className="section-rail">
            <span>03</span>
            <p>BLOGS</p>
          </div>
          <div className="section-body">
            <p className="section-kicker">Field notes / public transmission</p>
            <h2 id="blogs-title">Blogs</h2>
            <div className="record-list">
              <article>
                <span>COMING SOON</span>
                <h3>First Transmission</h3>
                <p>Systems / design / technology / unfamiliar territory.</p>
                <em>DRAFT / 01</em>
              </article>
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
