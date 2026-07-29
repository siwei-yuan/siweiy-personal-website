"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import * as THREE from "three";

const nameVertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aMotion;
  attribute float aSpeed;
  attribute float aSize;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPulse;
  uniform float uExit;
  varying float vSeed;
  varying float vEnergy;
  varying float vLens;
  varying float vDisperse;
  varying float vGlow;
  varying float vFlare;
  varying float vEdge;

  void main() {
    vec3 p = position;

    vec3 exitDirection = normalize(vec3(
      sin(aSeed * 81.7 + 0.4),
      cos(aSeed * 67.3 - 0.8),
      sin(aSeed * 43.9 + 1.7)
    ));
    p += exitDirection * uExit * (1.4 + aSeed * 8.2);
    p.y += (aSeed - 0.5) * uExit * uExit * 4.2;

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
    float glowParticle = step(0.925, aSeed);
    float glowPulse = glowParticle * (0.38 + 0.62 * (0.5 + 0.5 * sin(
      uTime * (0.72 + aSpeed * 1.25) + aSeed * 113.0
    )));
    float flareParticle = step(0.982, aSeed);
    float flarePulse = flareParticle * (0.62 + 0.38 * (0.5 + 0.5 * sin(
      uTime * (1.1 + aSpeed * 1.4) + aSeed * 151.0
    )));
    gl_PointSize = (0.94 + aSize * 1.16 + influence * 1.1 + ring * 1.48 + horizon * rimParticle * 0.44 + glowParticle * 2.25) * (24.0 / -viewPosition.z);

    vSeed = aSeed;
    vEnergy = influence + ring + horizon * rimParticle * 0.46 + innerBand * fallingParticle * 0.5;
    vLens = max(horizon * rimParticle, innerBand * fallingParticle);
    vDisperse = driftEnergy;
    vGlow = glowPulse;
    vFlare = flarePulse;
    vEdge = smoothstep(0.52, 0.98, horizontalEdge);
  }
`;

const nameFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uFade;
  uniform float uExit;
  varying float vSeed;
  varying float vEnergy;
  varying float vLens;
  varying float vDisperse;
  varying float vGlow;
  varying float vFlare;
  varying float vEdge;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float radius = length(point);
    float circle = 1.0 - smoothstep(0.12, 0.5, radius);
    float softGlow = 1.0 - smoothstep(0.02, 0.5, radius);
    vec3 bone = vec3(1.32, 1.4, 1.38);
    vec3 spectral = mix(vec3(0.24, 0.58, 0.68), vec3(0.76, 0.94, 1.0), step(0.52, vSeed));
    vec3 color = mix(bone, spectral, vLens * 0.42);
    float tonalVariation = mix(0.82, 1.18, fract(sin(vSeed * 437.13) * 1731.87));
    color *= tonalVariation;
    color *= 1.0 + vEdge * 0.18;
    color += vec3(1.36, 1.44, 1.42) * vGlow;
    color += vec3(2.05, 2.16, 2.14) * vFlare;
    float alpha = circle * (0.84 + vEnergy * 0.17 + vDisperse * 0.14);
    alpha += circle * vEdge * 0.1;
    alpha += softGlow * vGlow * 0.76;
    alpha += softGlow * vFlare * 1.05;
    alpha *= uFade * (1.0 - uExit);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

type PosterEntry = {
  marker: string;
  title: string;
  detail: string;
  company?: string;
  period?: string;
  employment?: string;
  location?: string;
  summary?: string;
  highlights?: readonly string[];
  source?: string;
};

type DossierSection = {
  id: string;
  label: string;
  entries: readonly PosterEntry[];
};

function getPosterTitleDensity(title: string) {
  const longestWord = Math.max(...title.split(/\s+/).map((word) => word.length));
  if (longestWord >= 11 || title.length >= 32) return "compressed";
  if (title.length >= 22) return "compact";
  return "standard";
}

const dossierSections: readonly DossierSection[] = [
  {
    id: "chronology",
    label: "Chronology",
    entries: [
      {
        marker: "MAY 2026—NOW",
        title: "Member of Technical Staff",
        detail: "Paperboy · Full-time",
        company: "Paperboy",
        period: "May 2026 — Present · 3 mos",
        employment: "Full-time",
        summary: "Building AI agents, platforms, and more...",
        source: "LinkedIn profile",
      },
      {
        marker: "JUL 2023—MAY 2026",
        title: "Software Development Engineer",
        detail: "Amazon Web Services · Full-time",
        company: "Amazon Web Services (AWS)",
        period: "Jul 2023 — May 2026 · 2 yrs 11 mos",
        employment: "Full-time",
        location: "Seattle, Washington, United States · On-site",
        summary: "Worked on:",
        highlights: [
          "Windows on Graviton",
          "KDNET extensibility module for Elastic Network Adapters",
          "AWS Volume Shadow Copy Services (VSS)",
          "Windows driver for Elastic Fabric Adapters",
          "Windows experience on AWS",
        ],
        source: "LinkedIn profile",
      },
      {
        marker: "JUN—SEP 2022",
        title: "Software Development Engineer Intern",
        detail: "Amazon Web Services · Internship",
        company: "Amazon Web Services (AWS)",
        period: "Jun 2022 — Sep 2022 · 4 mos",
        employment: "Internship",
        location: "Seattle, Washington, United States · On-site",
        source: "LinkedIn profile",
      },
      {
        marker: "JAN—SEP 2021",
        title: "Software Engineer Intern",
        detail: "Dell EMC · Internship",
        company: "Dell EMC",
        period: "Jan 2021 — Sep 2021 · 9 mos",
        employment: "Internship",
        location: "Shanghai, China",
        source: "LinkedIn profile",
      },
      {
        marker: "JUN—SEP 2020",
        title: "Product Manager Intern",
        detail: "Signify · Internship",
        company: "Signify",
        period: "Jun 2020 — Sep 2020 · 4 mos",
        employment: "Internship",
        location: "Shanghai, China",
        source: "LinkedIn profile",
      },
      {
        marker: "2019—2023",
        title: "UCLA",
        detail: "GPA 3.97/4.00 · Summa Cum Laude · Bruin Space",
        company: "University of California, Los Angeles",
        period: "2019 — 2023",
        employment: "Education",
        source: "LinkedIn profile",
      },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    entries: [
      { marker: "CASE / A", title: "Untitled Artifact A", detail: "Context · intervention · measurable consequence." },
      { marker: "CASE / B", title: "Untitled Artifact B", detail: "System · failure mode · recovered signal." },
      { marker: "CASE / C", title: "Untitled Artifact C", detail: "Prototype · deployment · observed effect." },
    ],
  },
  {
    id: "blogs",
    label: "Blogs",
    entries: [
      { marker: "NOTE / 01", title: "First Transmission", detail: "Systems · design · technology · unfamiliar territory." },
      { marker: "NOTE / 02", title: "Field Note", detail: "A record of something that should not have worked." },
      { marker: "NOTE / 03", title: "Observation", detail: "Methods for looking directly at strange systems." },
    ],
  },
];
type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void | Promise<void>) => {
    finished: Promise<void>;
  };
};

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
  for (let attempt = 0; attempt < 38_000; attempt += 1) {
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
  const cursorLightRef = useRef<HTMLDivElement>(null);
  const posterDialogRef = useRef<HTMLElement>(null);
  const posterSourceRef = useRef<HTMLButtonElement | null>(null);
  const posterCloseTimerRef = useRef<number | null>(null);
  const posterClosingRef = useRef(false);
  const pulseRef = useRef(0);
  const [activePoster, setActivePoster] = useState<PosterEntry | null>(null);
  const [isPosterReady, setIsPosterReady] = useState(false);
  const [isPosterClosing, setIsPosterClosing] = useState(false);

  const openPoster = async (entry: PosterEntry, source: HTMLButtonElement) => {
    if (activePoster || posterClosingRef.current) return;
    if (posterCloseTimerRef.current !== null) window.clearTimeout(posterCloseTimerRef.current);
    posterSourceRef.current = source;
    posterClosingRef.current = false;
    const transitionDocument = document as ViewTransitionDocument;

    if (!transitionDocument.startViewTransition) {
      setIsPosterClosing(false);
      setActivePoster(entry);
      window.requestAnimationFrame(() => setIsPosterReady(true));
      return;
    }

    // The clicked card is the old shared element. During the same DOM update,
    // its identity is handed to the inspection card instead of duplicating it.
    source.style.viewTransitionName = "poster-object";
    const transition = transitionDocument.startViewTransition(() => {
      source.style.viewTransitionName = "";
      flushSync(() => {
        setIsPosterReady(false);
        setIsPosterClosing(false);
        setActivePoster(entry);
      });
    });

    try {
      await transition.finished;
    } catch {
      // A superseded browser transition still leaves the DOM in its new state.
    } finally {
      source.style.viewTransitionName = "";
      if (posterSourceRef.current === source && !posterClosingRef.current) {
        setIsPosterReady(true);
      }
    }
  };

  const closeActivePoster = useCallback(async () => {
    if (!activePoster || posterClosingRef.current) return;
    posterClosingRef.current = true;
    setIsPosterClosing(true);

    const hasDetailSheet = Boolean(activePoster.summary || activePoster.highlights?.length);
    if (hasDetailSheet && isPosterReady) {
      await new Promise<void>((resolve) => {
        posterCloseTimerRef.current = window.setTimeout(() => {
          posterCloseTimerRef.current = null;
          resolve();
        }, 330);
      });
    }

    const source = posterSourceRef.current;
    const transitionDocument = document as ViewTransitionDocument;
    if (!source || !transitionDocument.startViewTransition) {
      setActivePoster(null);
      setIsPosterReady(false);
      setIsPosterClosing(false);
      posterClosingRef.current = false;
      return;
    }

    const transition = transitionDocument.startViewTransition(() => {
      flushSync(() => {
        setActivePoster(null);
        setIsPosterReady(false);
      });
      source.style.viewTransitionName = "poster-object";
    });

    try {
      await transition.finished;
    } catch {
      // A skipped transition should still complete the close state cleanly.
    } finally {
      source.style.viewTransitionName = "";
      setIsPosterClosing(false);
      posterClosingRef.current = false;
    }
  }, [activePoster, isPosterReady]);

  const handlePosterMove = (event: ReactPointerEvent<HTMLElement>) => {
    const interactionRoot = event.currentTarget;
    const poster = interactionRoot.matches(".poster-card, .poster-focus-card")
      ? interactionRoot
      : interactionRoot.querySelector<HTMLElement>(".poster-card, .poster-focus-card");
    if (!poster) return;
    const bounds = interactionRoot.getBoundingClientRect();
    const horizontal = (event.clientX - bounds.left) / bounds.width - 0.5;
    const vertical = (event.clientY - bounds.top) / bounds.height - 0.5;
    const anchor = interactionRoot.matches(".poster-anchor")
      ? interactionRoot
      : poster.closest<HTMLElement>(".poster-anchor");
    poster.style.setProperty("--poster-follow-x", `${horizontal * 10}px`);
    poster.style.setProperty("--poster-follow-y", `${vertical * 7}px`);
    poster.style.setProperty("--poster-tilt-x", `${vertical * -3.2}deg`);
    poster.style.setProperty("--poster-tilt-y", `${horizontal * 3.8}deg`);
    poster.style.setProperty("--poster-light-x", `${(horizontal + 0.5) * 100}%`);
    poster.style.setProperty("--poster-light-y", `${(vertical + 0.5) * 100}%`);
    poster.dataset.pointerLit = "true";
    if (anchor) {
      anchor.dataset.posterActive = "true";
      anchor.style.setProperty("--poster-shadow-x", `${7 - horizontal * 25}px`);
      anchor.style.setProperty("--poster-shadow-y", `${8 - vertical * 20}px`);
    }
  };

  const resetPosterPose = (event: ReactPointerEvent<HTMLElement>) => {
    const interactionRoot = event.currentTarget;
    const poster = interactionRoot.matches(".poster-card, .poster-focus-card")
      ? interactionRoot
      : interactionRoot.querySelector<HTMLElement>(".poster-card, .poster-focus-card");
    if (!poster) return;
    const anchor = interactionRoot.matches(".poster-anchor")
      ? interactionRoot
      : poster.closest<HTMLElement>(".poster-anchor");
    poster.style.setProperty("--poster-follow-x", "0px");
    poster.style.setProperty("--poster-follow-y", "0px");
    poster.style.setProperty("--poster-tilt-x", "0deg");
    poster.style.setProperty("--poster-tilt-y", "0deg");
    poster.style.setProperty("--poster-light-x", "50%");
    poster.style.setProperty("--poster-light-y", "42%");
    delete poster.dataset.pointerLit;
    if (anchor) {
      delete anchor.dataset.posterActive;
      anchor.style.setProperty("--poster-shadow-x", "7px");
      anchor.style.setProperty("--poster-shadow-y", "8px");
    }
  };

  useEffect(() => {
    if (!activePoster) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeActivePoster();
    };
    const focusFrame = window.requestAnimationFrame(() => posterDialogRef.current?.focus());
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [activePoster, closeActivePoster]);

  useEffect(() => () => {
    if (posterCloseTimerRef.current !== null) window.clearTimeout(posterCloseTimerRef.current);
  }, []);

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
    renderer.toneMappingExposure = 0.98;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
    mount.appendChild(renderer.domElement);

    const haloMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
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
        uniform float uFade;
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
          float alpha = (baseLight + bloom) * pulse * outerFeather * uFade;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    const eclipseMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 } },
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
        uniform float uFade;
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
          float alpha = (0.82 + interior * 0.14) * uFade;
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });

    const architecture = new THREE.Group();
    scene.add(architecture);
    const monument = new THREE.Group();
    architecture.add(monument);

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
          vec3 color = mix(vec3(0.011, 0.013, 0.013), vec3(0.043, 0.05, 0.051), centreLift);
          color *= mix(0.86, 1.0, lowerShade);
          color += vec3(0.009, 0.012, 0.012) * centralJoint * 0.12;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const backgroundBoard = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      backgroundBoardMaterial,
    );
    backgroundBoard.position.set(0, 1.6, -9.35);
    architecture.add(backgroundBoard);

    // A hand-built three-face monolith: one uninterrupted front plane faces
    // the viewer, while two widened side wings create the reverse perspective.
    const frontVertices = [-11.0, 8.6, 0.55, 0, -8.6, 2.0, 11.0, 8.6, 0.55];
    const leftVertices = [-14.35, 8.6, -0.85, 0, -8.6, 2.0, -11.0, 8.6, 0.55];
    const rightVertices = [11.0, 8.6, 0.55, 0, -8.6, 2.0, 14.35, 8.6, -0.85];
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
    // Each side owns its light field, preserving the reverse-perspective form.
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
        uBounceColor: { value: new THREE.Color(0xdce8e6) },
        uBouncePosition: { value: new THREE.Vector2(0, 0) },
        uBounceRadius: { value: 1 },
        uBounceStrength: { value: 0 },
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
        uniform vec3 uBounceColor;
        uniform vec2 uBouncePosition;
        uniform float uBounceRadius;
        uniform float uBounceStrength;
        void main() {
          float lightDistance = distance(vLocalPosition.xy, uLightPosition);
          float localFalloff = exp(-pow(lightDistance / uRadius, 2.0));
          float sourceCore = exp(-pow(lightDistance / (uRadius * 0.28), 2.0));
          float lowerFog = smoothstep(-8.2, -1.6, vLocalPosition.y);
          float surfaceVariation = 0.97
            + sin(vLocalPosition.x * 3.1 + vLocalPosition.y * 1.7) * 0.018;
          vec3 color = uBaseColor
            + uLightColor * (localFalloff * 0.24 + sourceCore * 0.18) * uStrength;
          color *= mix(0.49, 1.11, lowerFog) * surfaceVariation;
          vec2 bounceOffset = vLocalPosition.xy - uBouncePosition;
          float reflectedLight = exp(-dot(bounceOffset, bounceOffset) / pow(uBounceRadius, 2.0));
          color += uBounceColor * reflectedLight * uBounceStrength;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const pyramidLeftMaterial = makePointLitFaceMaterial(
      0x081012,
      0x8fa8ad,
      new THREE.Vector2(-8.75, 3.35),
      2.5,
      1.92,
    );
    const pyramidFrontMaterial = makePointLitFaceMaterial(
      0x070a0b,
      0x8ca4a8,
      new THREE.Vector2(-4.8, 5.8),
      8.8,
      0.22,
    );
    const pyramidRightMaterial = makePointLitFaceMaterial(
      0x140504,
      0xc31d16,
      new THREE.Vector2(8.65, 2.9),
      4.15,
      0.84,
    );
    pyramidRightMaterial.uniforms.uBouncePosition.value.set(4.85, -3.95);
    pyramidRightMaterial.uniforms.uBounceRadius.value = 1.55;
    pyramidRightMaterial.uniforms.uBounceStrength.value = 0.064;
    const pyramidGeometry = new THREE.BufferGeometry();
    pyramidGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute([...frontVertices, ...leftVertices, ...rightVertices], 3),
    );
    pyramidGeometry.computeVertexNormals();
    const pyramid = new THREE.Group();
    pyramid.position.set(0, 4.4, -6.15);
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
      coreMaterial.userData.baseOpacity = 0.31;
      glowMaterial.userData.baseOpacity = 0.068;
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
      new THREE.Vector3(-11.0, 8.6, 0.55),
      new THREE.Vector3(0, -8.6, 2.0),
      0x91b5bc,
    );
    addGlowingSeam(
      new THREE.Vector3(11.0, 8.6, 0.55),
      new THREE.Vector3(0, -8.6, 2.0),
      0xff3027,
    );
    monument.add(pyramid);

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x9faaa6,
      transparent: true,
      opacity: 0.055,
    });
    const pyramidEdges = new THREE.LineSegments(new THREE.EdgesGeometry(pyramidGeometry, 20), edgeMaterial);
    pyramid.add(pyramidEdges);

    const redEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xff3529,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
    });
    const redEdgeGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(11.0, 8.6, 0.55), new THREE.Vector3(14.35, 8.6, -0.85),
      new THREE.Vector3(14.35, 8.6, -0.85), new THREE.Vector3(0, -8.6, 2.0),
    ]);
    const pyramidRedEdges = new THREE.LineSegments(redEdgeGeometry, redEdgeMaterial);
    pyramidRedEdges.renderOrder = 2;
    pyramid.add(pyramidRedEdges);

    // The eclipse is physically behind the monolith. The opaque pyramid writes
    // depth first, masking the upper arc while the lower half escapes its tip.
    const eclipseDisc = new THREE.Mesh(new THREE.CircleGeometry(6.9, 192), eclipseMaterial);
    eclipseDisc.position.set(0, 0.45, -8.62);
    eclipseDisc.renderOrder = 1;
    monument.add(eclipseDisc);
    const halo = new THREE.Mesh(new THREE.CircleGeometry(9.6, 224), haloMaterial);
    halo.position.set(0, 0.45, -8.5);
    halo.renderOrder = 2;
    monument.add(halo);

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
        uFade: { value: 1 },
        uExit: { value: 0 },
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
      if (cursorLightRef.current) {
        cursorLightRef.current.style.left = `${event.clientX}px`;
        cursorLightRef.current.style.top = `${event.clientY}px`;
        cursorLightRef.current.style.opacity = "1";
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
      if (cursorLightRef.current) cursorLightRef.current.style.opacity = "0";
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

    let targetScroll = window.scrollY;
    const updateScrollStory = () => {
      targetScroll = window.scrollY;
      const viewportHeight = Math.max(window.innerHeight, 1);
      document.documentElement.classList.toggle("has-left-hero", targetScroll > viewportHeight * 0.12);
      document.querySelectorAll<HTMLElement>(".dossier-section").forEach((section) => {
        const rect = section.getBoundingClientRect();
        const travel = Math.max(section.offsetHeight - viewportHeight, 1);
        const progress = THREE.MathUtils.clamp(-rect.top / travel, 0, 1);
        const titleVisible = rect.top <= 0 && rect.bottom > 0;
        const titleExit = THREE.MathUtils.clamp((progress - 0.34) / 0.38, 0, 1);
        const recordProgress = THREE.MathUtils.clamp((progress - 0.38) / 0.34, 0, 1);
        section.style.setProperty("--title-exit", titleExit.toFixed(4));
        section.style.setProperty("--records-progress", recordProgress.toFixed(4));
        section.classList.toggle(
          "is-title-visible",
          titleVisible,
        );
      });
    };
    window.addEventListener("scroll", updateScrollStory, { passive: true });
    updateScrollStory();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startTime = performance.now();
    const currentLookAt = new THREE.Vector3(0, 1.15, -5.8);
    const idleCameraTarget = new THREE.Vector3();
    const idleLookAtTarget = new THREE.Vector3();
    let currentScroll = targetScroll;
    let animationFrame = 0;
    const animate = (timestamp: number) => {
      const elapsed = reduceMotion ? 0 : (timestamp - startTime) / 1000;
      currentPointer.lerp(targetPointer, reduceMotion ? 1 : 0.045);
      currentScroll = THREE.MathUtils.lerp(currentScroll, targetScroll, reduceMotion ? 1 : 0.075);
      const rawCollapse = THREE.MathUtils.clamp(
        (currentScroll / Math.max(window.innerHeight, 1) - 0.06) / 0.78,
        0,
        1,
      );
      const collapse = rawCollapse * rawCollapse * (3 - 2 * rawCollapse);
      const pointerWeight = 1 - collapse * 0.82;
      const baseZ = compact ? 20.4 : 17.2;
      idleCameraTarget.set(
        currentPointer.x * 1.05,
        1.8 + currentPointer.y * 0.58,
        baseZ,
      );
      idleLookAtTarget.set(
        currentPointer.x * -0.3,
        1.15 + currentPointer.y * -0.18,
        -5.8,
      );

      architecture.rotation.y = THREE.MathUtils.lerp(
        architecture.rotation.y,
        currentPointer.x * -0.042 * pointerWeight,
        0.04,
      );
      architecture.rotation.x = THREE.MathUtils.lerp(
        architecture.rotation.x,
        currentPointer.y * 0.012 * pointerWeight,
        0.04,
      );
      architecture.position.x = THREE.MathUtils.lerp(
        architecture.position.x,
        currentPointer.x * -0.28 * pointerWeight,
        0.04,
      );
      const monumentScale = THREE.MathUtils.lerp(1, compact ? 0.18 : 0.16, collapse);
      monument.scale.setScalar(monumentScale);
      monument.position.y = THREE.MathUtils.lerp(0, compact ? 11.7 : 11.2, collapse);
      monument.position.z = THREE.MathUtils.lerp(0, -4.4, collapse);

      camera.position.lerp(idleCameraTarget, reduceMotion ? 1 : 0.055);
      currentLookAt.lerp(idleLookAtTarget, reduceMotion ? 1 : 0.055);
      camera.lookAt(currentLookAt);

      namePoints.rotation.y = THREE.MathUtils.lerp(namePoints.rotation.y, currentPointer.x * 0.035, 0.06);
      namePoints.rotation.x = THREE.MathUtils.lerp(namePoints.rotation.x, currentPointer.y * -0.018, 0.06);
      nameMaterial.uniforms.uTime.value = elapsed;
      nameMaterial.uniforms.uPointer.value.copy(pointerActive ? currentPointer : restingNamePointer);
      pulseRef.current *= reduceMotion ? 0.7 : 0.935;
      nameMaterial.uniforms.uPulse.value = pulseRef.current;
      nameMaterial.uniforms.uExit.value = collapse;
      nameMaterial.uniforms.uFade.value = 1;

      eclipseMaterial.uniforms.uTime.value = elapsed;
      haloMaterial.uniforms.uTime.value = elapsed;
      eclipseMaterial.uniforms.uFade.value = 1;
      haloMaterial.uniforms.uFade.value = 1;
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", updateScrollStory);
      document.documentElement.classList.remove("has-left-hero");
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

  return (
    <div className={`site-shell${activePoster ? " poster-is-open" : ""}`}>
      <div ref={sceneMountRef} className="three-scene" aria-hidden="true" />
      <div className="atmosphere" aria-hidden="true" />
      <div ref={cursorLightRef} className="cursor-light-field" aria-hidden="true" />
      <div className="film-grain" aria-hidden="true" />
      <div ref={cursorRef} className="cursor-singularity" aria-hidden="true"><span /></div>

      <main className="scroll-story">
        <section className="hero-spacer" aria-labelledby="site-title">
          <h1 id="site-title" className="sr-only">Siwei Yuan</h1>
          <a className="scroll-cue" href="#chronology" aria-label="Scroll to chronology" />
        </section>

        {dossierSections.map((section) => (
          <section
            key={section.id}
            id={section.id}
            className="dossier-section"
            data-section={section.id}
          >
            <div className="dossier-sticky">
              <header className="section-title-position">
                <div className="section-title-hit">
                  <h2 aria-label={section.label}>
                    {Array.from(section.label).map((character, index) => (
                      <span key={`${character}-${index}`} aria-hidden="true">{character}</span>
                    ))}
                  </h2>
                </div>
              </header>

              <div className="dossier-records">
                <div className={`records-list${section.entries.length > 3 ? " is-expanded" : ""}`}>
                  {section.entries.map((entry) => (
                    <div
                      className="poster-anchor"
                      key={entry.title}
                      onPointerMove={handlePosterMove}
                      onPointerLeave={resetPosterPose}
                    >
                      <button
                        type="button"
                        className={`poster-card${activePoster === entry ? " is-poster-source" : ""}`}
                        data-title-density={getPosterTitleDensity(entry.title)}
                        aria-label={`Open ${entry.title} poster`}
                        onClick={(event) => openPoster(entry, event.currentTarget)}
                      >
                        <span>{entry.marker}</span>
                        <h3>{entry.title}</h3>
                        <p>{entry.detail}</p>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ))}
      </main>

      {activePoster && (
        <div
          className={`poster-modal${isPosterReady ? " is-ready" : ""}${isPosterClosing ? " is-closing" : ""}`}
          onClick={closeActivePoster}
        >
          <div className="poster-inspection">
            <div
              className="poster-focus-shell"
              onPointerMove={handlePosterMove}
              onPointerLeave={resetPosterPose}
              onClick={(event) => event.stopPropagation()}
            >
              <article
                ref={posterDialogRef}
                className="poster-focus-card"
                data-title-density={getPosterTitleDensity(activePoster.title)}
                role="dialog"
                aria-modal="true"
                aria-labelledby="poster-focus-title"
                tabIndex={-1}
              >
                <span>{activePoster.marker}</span>
                <h3 id="poster-focus-title">{activePoster.title}</h3>
                <p>{activePoster.detail}</p>
              </article>
            </div>

            {(activePoster.summary || activePoster.highlights?.length) && (
              <aside
                className="poster-detail-sheet"
                aria-label={`${activePoster.title} details`}
                aria-hidden={!isPosterReady}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="detail-sheet-body">
                  <p className="detail-company">{activePoster.company ?? "Selected record"}</p>
                  <h4>{activePoster.title}</h4>
                  <dl>
                    {activePoster.period && <><dt>Period</dt><dd>{activePoster.period}</dd></>}
                    {activePoster.employment && <><dt>Type</dt><dd>{activePoster.employment}</dd></>}
                    {activePoster.location && <><dt>Location</dt><dd>{activePoster.location}</dd></>}
                  </dl>
                  <section>
                    <span>Notes / Details</span>
                    <p>{activePoster.summary}</p>
                    {activePoster.highlights && (
                      <ul>
                        {activePoster.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                      </ul>
                    )}
                  </section>
                </div>
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
