"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync, preload } from "react-dom";
import * as THREE from "three";
import {
  dossierSections,
  getPosterTitleDensity,
  projectScreenshotUrls,
  type PosterEntry,
} from "./content";

const SCROLL_RAIL_TICKS = Array.from({ length: 21 });

const nameVertexShader = /* glsl */ `
  attribute float aSeed;
  attribute float aMotion;
  attribute float aSpeed;
  attribute float aSize;
  attribute vec3 aFinalPosition;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uPulse;
  uniform float uExit;
  uniform float uFinale;
  uniform float uAspect;
  varying float vSeed;
  varying float vEnergy;
  varying float vLens;
  varying float vDisperse;
  varying float vGlow;
  varying float vFlare;
  varying float vEdge;
  varying float vCursorRed;

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

    // At the final section, the dispersed name returns as three compact social
    // marks. Each point keeps a tiny independent drift so the icons remain
    // living constellations rather than becoming static raster art.
    float finale = uFinale * uFinale * (3.0 - 2.0 * uFinale);
    vec3 finaleTarget = aFinalPosition;
    finaleTarget.xy += vec2(
      sin(uTime * (0.34 + aSpeed * 0.4) + aSeed * 101.0),
      cos(uTime * (0.29 + aSpeed * 0.35) + aSeed * 79.0)
    ) * (0.012 + aMotion * 0.032);
    finaleTarget.z += sin(uTime * 0.41 + aSeed * 61.0) * 0.025;
    p = mix(p, finaleTarget, finale);

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    vec4 clipPosition = projectionMatrix * viewPosition;
    gl_Position = clipPosition;
    // Compare in projected screen space, not an estimated world-space ratio.
    // Correcting X by the viewport aspect keeps the field circular in pixels.
    vec2 screenPosition = clipPosition.xy / max(clipPosition.w, 0.0001);
    vec2 colorDelta = screenPosition - uPointer;
    colorDelta.x *= uAspect;
    float colorDistance = length(colorDelta);
    float colorField = 1.0 - smoothstep(0.04, 0.42, colorDistance);
    float redVariation = fract(sin(aSeed * 613.73) * 1847.31);
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
    vCursorRed = colorField * mix(0.42, 1.0, smoothstep(0.16, 0.72, redVariation));
  }
`;

const nameFragmentShader = /* glsl */ `
  precision highp float;
  uniform float uFade;
  uniform float uExit;
  uniform float uFinale;
  varying float vSeed;
  varying float vEnergy;
  varying float vLens;
  varying float vDisperse;
  varying float vGlow;
  varying float vFlare;
  varying float vEdge;
  varying float vCursorRed;

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
    float redMix = smoothstep(0.08, 0.62, vCursorRed);
    vec3 cursorRed = vec3(1.72, 0.035, 0.018) * (0.92 + vGlow * 0.18);
    color = mix(color, cursorRed, redMix * 0.94);
    float alpha = circle * (0.84 + vEnergy * 0.17 + vDisperse * 0.14);
    alpha += circle * vEdge * 0.1;
    alpha += softGlow * vGlow * 0.76;
    alpha += softGlow * vFlare * 1.05;
    float finale = uFinale * uFinale * (3.0 - 2.0 * uFinale);
    float visibility = mix(max(1.0 - uExit, 0.0), 1.0, finale);
    alpha *= uFade * visibility;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

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
  const finalPositions: number[] = [];

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

  // Build a second mask for the three closing social marks. The canonical DOM
  // icons remain the interactive layer; these targets make the original name
  // particles physically return and gather around the same three positions.
  canvas.width = 1500;
  canvas.height = 360;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 20;
  context.lineCap = "round";
  context.lineJoin = "round";
  const socialCenters = [300, 750, 1200];
  const socialY = canvas.height / 2;

  // LinkedIn: compact outlined tile and its familiar lowercase mark.
  context.strokeRect(socialCenters[0] - 66, socialY - 66, 132, 132);
  context.font = '800 92px Arial, sans-serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("in", socialCenters[0] + 4, socialY + 9);

  // GitHub: a minimal cat-head silhouette, backed by the canonical DOM icon.
  context.beginPath();
  context.arc(socialCenters[1], socialY + 10, 55, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(socialCenters[1] - 48, socialY - 22);
  context.lineTo(socialCenters[1] - 63, socialY - 70);
  context.lineTo(socialCenters[1] - 16, socialY - 48);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(socialCenters[1] + 48, socialY - 22);
  context.lineTo(socialCenters[1] + 63, socialY - 70);
  context.lineTo(socialCenters[1] + 16, socialY - 48);
  context.closePath();
  context.fill();

  // X: two complete crossing strokes. Both diagonals must run through the
  // centre; a half-stroke reads as a Y once sampled into particles.
  context.beginPath();
  context.moveTo(socialCenters[2] - 56, socialY - 64);
  context.lineTo(socialCenters[2] + 56, socialY + 64);
  context.moveTo(socialCenters[2] + 56, socialY - 64);
  context.lineTo(socialCenters[2] - 56, socialY + 64);
  context.stroke();

  const socialPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const particleCount = positions.length / 3;
  for (let particle = 0; particle < particleCount; particle += 1) {
    const group = particle % socialCenters.length;
    let x = socialCenters[group];
    let y = socialY;
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const candidateX = Math.floor(socialCenters[group] - 86 + Math.random() * 172);
      const candidateY = Math.floor(socialY - 86 + Math.random() * 172);
      if (socialPixels[(candidateY * canvas.width + candidateX) * 4 + 3] > 96) {
        x = candidateX;
        y = candidateY;
        break;
      }
    }
    finalPositions.push(
      ((x - canvas.width / 2) / canvas.width) * 10.5,
      (-(y - canvas.height / 2) / canvas.height) * 2.7,
      (Math.random() - 0.5) * 0.18,
    );
  }

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.Float32BufferAttribute(seeds, 1));
  geometry.setAttribute("aMotion", new THREE.Float32BufferAttribute(motions, 1));
  geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speeds, 1));
  geometry.setAttribute("aSize", new THREE.Float32BufferAttribute(sizes, 1));
  geometry.setAttribute("aFinalPosition", new THREE.Float32BufferAttribute(finalPositions, 3));
  geometry.computeBoundingSphere();
  return geometry;
}

export default function Home() {
  projectScreenshotUrls.forEach((src) => preload(src, { as: "image" }));

  const sceneMountRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorLightRef = useRef<HTMLDivElement>(null);
  const scrollRailRef = useRef<HTMLDivElement>(null);
  const scrollTickRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const posterDialogRef = useRef<HTMLElement>(null);
  const posterSourceRef = useRef<HTMLButtonElement | null>(null);
  const posterCloseTimerRef = useRef<number | null>(null);
  const posterClosingRef = useRef(false);
  const posterBoundsRef = useRef(new WeakMap<HTMLElement, DOMRect>());
  const posterMotionFramesRef = useRef(new Map<HTMLElement, number>());
  const pulseRef = useRef(0);
  const [activePoster, setActivePoster] = useState<PosterEntry | null>(null);
  const [isPosterReady, setIsPosterReady] = useState(false);
  const [isPosterClosing, setIsPosterClosing] = useState(false);

  useEffect(() => {
    const decodedImages = projectScreenshotUrls.map((src) => {
      const image = new Image();
      image.decoding = "async";
      image.src = src;
      void image.decode?.().catch(() => undefined);
      return image;
    });

    return () => {
      decodedImages.forEach((image) => image.removeAttribute("src"));
    };
  }, []);

  useEffect(() => () => {
    posterMotionFramesRef.current.forEach((frame) => window.cancelAnimationFrame(frame));
    posterMotionFramesRef.current.clear();
  }, []);

  useEffect(() => {
    const rail = scrollRailRef.current;
    if (!rail) return;

    const modal = activePoster
      ? document.querySelector<HTMLElement>(".poster-modal")
      : null;

    let animationFrame = 0;

    const updateRail = () => {
      const position = modal ? modal.scrollTop : window.scrollY;
      const scrollHeight = modal
        ? modal.scrollHeight
        : document.documentElement.scrollHeight;
      const viewportHeight = modal ? modal.clientHeight : window.innerHeight;
      const maximum = Math.max(scrollHeight - viewportHeight, 0);
      const normalizedProgress = maximum > 0
        ? Math.min(Math.max(position / maximum, 0), 1)
        : 0;
      const progress = position <= 1
        ? 0
        : maximum - position <= 1
          ? 1
          : normalizedProgress;
      const ticks = scrollTickRefs.current;
      const finalTick = Math.max(ticks.length - 1, 0);
      const activeTick = progress * finalTick;
      const maximumWidth = rail.clientWidth;
      const restingWidth = Math.min(7, maximumWidth * .3);

      ticks.forEach((tick, index) => {
        if (!tick) return;
        const distance = Math.abs(index - activeTick);
        const intensity = Math.exp(-Math.pow(distance / 2.35, 2));
        const width = restingWidth + (maximumWidth - restingWidth) * intensity;
        const opacity = .16 + intensity * .79;
        const tone = Math.round(170 + intensity * 72);

        tick.style.setProperty("--tick-width", `${width.toFixed(2)}px`);
        tick.style.setProperty("--tick-opacity", opacity.toFixed(3));
        tick.style.setProperty("--tick-color", `rgb(${tone} ${Math.min(tone + 6, 248)} ${Math.min(tone + 4, 246)})`);
        tick.style.setProperty(
          "--tick-glow",
          intensity > .72 ? `0 0 ${Math.round(4 + intensity * 7)}px rgba(225, 236, 234, ${(intensity * .2).toFixed(3)})` : "none",
        );
      });

      rail.classList.toggle("is-static", maximum <= 1);
    };

    const scheduleRailUpdate = () => {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        updateRail();
      });
    };

    if (modal) modal.addEventListener("scroll", scheduleRailUpdate, { passive: true });
    else window.addEventListener("scroll", scheduleRailUpdate, { passive: true });
    window.addEventListener("resize", scheduleRailUpdate);

    const resizeObserver = new ResizeObserver(scheduleRailUpdate);
    resizeObserver.observe(modal ?? document.documentElement);
    const inspection = modal?.querySelector<HTMLElement>(".poster-inspection");
    if (inspection) resizeObserver.observe(inspection);

    scheduleRailUpdate();

    return () => {
      if (modal) modal.removeEventListener("scroll", scheduleRailUpdate);
      else window.removeEventListener("scroll", scheduleRailUpdate);
      window.removeEventListener("resize", scheduleRailUpdate);
      resizeObserver.disconnect();
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [activePoster, isPosterReady]);

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

  const preparePosterHover = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const interactionRoot = event.currentTarget;
    const poster = interactionRoot.matches(".poster-card, .poster-focus-card")
      ? interactionRoot
      : interactionRoot.querySelector<HTMLElement>(".poster-card, .poster-focus-card");
    if (!poster) return;
    const anchor = interactionRoot.matches(".poster-anchor")
      ? interactionRoot
      : poster.closest<HTMLElement>(".poster-anchor");
    posterBoundsRef.current.set(interactionRoot, interactionRoot.getBoundingClientRect());
    poster.dataset.pointerLit = "true";
    if (anchor) anchor.dataset.posterActive = "true";
  };

  const handlePosterMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const interactionRoot = event.currentTarget;
    const poster = interactionRoot.matches(".poster-card, .poster-focus-card")
      ? interactionRoot
      : interactionRoot.querySelector<HTMLElement>(".poster-card, .poster-focus-card");
    if (!poster) return;
    const anchor = interactionRoot.matches(".poster-anchor")
      ? interactionRoot
      : poster.closest<HTMLElement>(".poster-anchor");
    if (poster.dataset.pointerLit !== "true") preparePosterHover(event);

    const clientX = event.clientX;
    const clientY = event.clientY;
    const pendingFrame = posterMotionFramesRef.current.get(interactionRoot);
    if (pendingFrame) window.cancelAnimationFrame(pendingFrame);

    const frame = window.requestAnimationFrame(() => {
      posterMotionFramesRef.current.delete(interactionRoot);
      const bounds = posterBoundsRef.current.get(interactionRoot)
        ?? interactionRoot.getBoundingClientRect();
      const horizontal = Math.min(Math.max((clientX - bounds.left) / bounds.width - 0.5, -0.5), 0.5);
      const vertical = Math.min(Math.max((clientY - bounds.top) / bounds.height - 0.5, -0.5), 0.5);
      poster.style.setProperty("--poster-follow-x", `${horizontal * 10}px`);
      poster.style.setProperty("--poster-follow-y", `${vertical * 7}px`);
      poster.style.setProperty("--poster-tilt-x", `${vertical * -3.2}deg`);
      poster.style.setProperty("--poster-tilt-y", `${horizontal * 3.8}deg`);
      poster.style.setProperty("--poster-light-x", `${(horizontal + 0.5) * 100}%`);
      poster.style.setProperty("--poster-light-y", `${(vertical + 0.5) * 100}%`);
      if (anchor) {
        anchor.style.setProperty("--poster-shadow-x", `${7 - horizontal * 25}px`);
        anchor.style.setProperty("--poster-shadow-y", `${8 - vertical * 20}px`);
      }
    });
    posterMotionFramesRef.current.set(interactionRoot, frame);
  };

  const resetPosterPose = (event: ReactPointerEvent<HTMLElement>) => {
    const interactionRoot = event.currentTarget;
    const pendingFrame = posterMotionFramesRef.current.get(interactionRoot);
    if (pendingFrame) window.cancelAnimationFrame(pendingFrame);
    posterMotionFramesRef.current.delete(interactionRoot);
    posterBoundsRef.current.delete(interactionRoot);
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

    const glassMaterial = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      uniforms: {
        uTime: { value: 0 },
        uFade: { value: 1 },
        uLayerMode: { value: 0 },
        uLayerPhase: { value: 0 },
        uLayerIntensity: { value: 1 },
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
        uniform float uTime;
        uniform float uFade;
        uniform float uLayerMode;
        uniform float uLayerPhase;
        uniform float uLayerIntensity;

        #define PI 3.14159265359
        #define TAU 6.28318530718

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise21(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
            mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
            f.y
          );
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          for (int i = 0; i < 4; i++) {
            value += noise21(p) * amplitude;
            p = mat2(1.72, 1.18, -1.18, 1.72) * p + 0.17;
            amplitude *= 0.5;
          }
          return value;
        }

        mat2 rotate2(float angle) {
          float c = cos(angle);
          float s = sin(angle);
          return mat2(c, -s, s, c);
        }

        float sdEquilateralTriangle(vec2 p) {
          const float k = 1.73205080757;
          p.x = abs(p.x) - 1.0;
          p.y = p.y + 1.0 / k;
          if (p.x + k * p.y > 0.0) {
            p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
          }
          p.x -= clamp(p.x, -2.0, 0.0);
          return -length(p) * sign(p.y);
        }

        float triangleDistance(vec2 p, vec2 size, float rotation) {
          p = rotate2(rotation) * p;
          vec2 normalized = p / size;
          return sdEquilateralTriangle(normalized) * min(size.x, size.y);
        }

        float crystalBladeDistance(
          vec2 p,
          vec2 size,
          float rotation,
          float skew,
          float taper
        ) {
          p = rotate2(rotation) * p;
          float normalizedY = p.y / max(size.y, 0.0001);
          float widthProfile = mix(
            taper,
            1.0,
            smoothstep(-1.0, 0.72, normalizedY)
          );
          float crookedCentre = skew * size.x
            * (normalizedY * 0.42 + sign(normalizedY) * normalizedY * normalizedY * 0.34);
          float sideDistance = abs(p.x - crookedCentre) - size.x * widthProfile;
          float capDistance = (abs(normalizedY) - 1.0) * size.y;
          return max(sideDistance, capDistance);
        }

        void main() {
          vec2 p = (vUv - 0.5) * 2.0;
          float radius = length(p);
          float angle = atan(p.y, p.x);
          float middleLayer = step(0.5, uLayerMode) * (1.0 - step(1.5, uLayerMode));
          float outerLayer = step(1.5, uLayerMode);
          float innerLayer = 1.0 - middleLayer - outerLayer;
          // The layer meshes use different world-space radii. Compensate for
          // that here so the visible shard sizes follow one predictable scale:
          // 0.46x overall, then a fixed 1.2x increase from layer to layer.
          float layerGeometryCompensation = innerLayer
            + middleLayer * (9.6 / 12.8)
            + outerLayer * (9.6 / 17.0);
          float layerSizeRatio = innerLayer + middleLayer * 1.2 + outerLayer * 1.44;
          float layerShardScale = 0.46 * layerGeometryCompensation * layerSizeRatio;
          float outerLane = clamp(middleLayer + outerLayer, 0.0, 1.0);
          float layerTime = uTime * (1.0 + middleLayer * 0.46 - outerLayer * 0.28) + uLayerPhase;
          float drift = sin(uTime * 0.09) * 0.045;
          float segmentCount = mix(16.0, 22.0, middleLayer);
          segmentCount = mix(segmentCount, 12.0, outerLayer);
          float span = TAU / segmentCount;
          float wrappedAngle = mod(angle + PI + drift, TAU);
          float segmentId = floor(wrappedAngle / span);
          float mirrorId = min(segmentId, segmentCount - 1.0 - segmentId);
          float localAngle = mod(wrappedAngle + span * 0.5, span) - span * 0.5;
          float phase = layerTime * 0.43 + mirrorId * 1.73;
          float phaseB = layerTime * 0.31 - mirrorId * 1.11;
          float localTangent = localAngle * radius;
          float coarse = fbm(vec2(mirrorId * 0.71, radius * 9.0) + vec2(uTime * 0.025, -uTime * 0.018));
          float fine = fbm(vec2(localTangent * 21.0, radius * 25.0) + vec2(-uTime * 0.035, uTime * 0.021));

          // A slow, legible kaleidoscope cycle: fragments breathe apart, gather
          // into a shared petal, then fold through one another before splitting.
          float morphClock = layerTime * 0.58;
          float cycle = 0.5 + 0.5 * sin(morphClock);
          float gather = smoothstep(0.36, 0.82, cycle);
          gather = gather * gather * (3.0 - 2.0 * gather);
          float release = smoothstep(0.18, 0.72, 0.5 + 0.5 * sin(morphClock + 2.15));
          float ringBreath = 0.44 + 1.42 * (0.5 + 0.5 * sin(morphClock - 0.72));
          float separation = mix(1.68, 0.08, gather);
          float sharedRadius = 0.842 + sin(morphClock * 0.73 + mirrorId * 0.27) * 0.022;
          float animatedRadius = radius
            + sin(morphClock - 0.82) * 0.078
            + sin(morphClock * 2.0 + mirrorId * 0.13) * 0.018;

          float radialDistortion = sin(angle * 3.0 + uTime * 0.16) * 0.0035
            + sin(angle * 11.0 - uTime * 0.21) * 0.0018;
          float ringRadius = 0.735 - radialDistortion;
          float ringDistance = radius + radialDistortion - 0.735;
          float closeGlow = exp(-pow(ringDistance / 0.036, 2.0));
          float farGlow = exp(-pow(ringDistance / 0.096, 2.0));

          float foldA = 0.5 + 0.5 * sin(phase * 0.72);
          float shardATarget = mix(
            0.718 + sin(phase) * 0.054,
            0.78 + sin(phase) * 0.036,
            outerLane
          );
          vec2 shardA = vec2(
            localTangent + (-0.105 + sin(phaseB) * 0.038) * separation,
            animatedRadius - mix(shardATarget, sharedRadius, gather * 0.9)
          );
          shardA.x += shardA.y * sin(phase * 0.61) * (1.15 + release * 0.9);
          shardA.x = mix(shardA.x, abs(shardA.x) - 0.026, foldA * (0.72 + release * 0.2));
          shardA.y += abs(shardA.x) * foldA * (0.34 + release * 0.42);
          float pulseA = ringBreath * (0.82 + 0.34 * sin(phase * 0.83));
          vec2 sizeA = vec2(
            (0.072 + foldA * 0.052) * pulseA,
            (0.104 + (1.0 - foldA) * 0.078) * mix(pulseA, 1.42 - pulseA * 0.24, gather)
          );
          sizeA *= layerShardScale;
          float rotationA = sin(phase * 0.48) * (0.9 + release * 0.72) + gather * 0.48;
          float triangleA = triangleDistance(
            shardA,
            sizeA,
            rotationA
          );
          float bladeRotationA = mix(
            rotationA * 0.34 + sin(phaseB * 0.37) * 0.12,
            sin(phaseB * 0.37) * 0.18
              + sin(layerTime * 0.21 + mirrorId * 0.67) * 0.09,
            outerLayer
          );
          float bladeA = crystalBladeDistance(
            shardA,
            sizeA * vec2(0.72, 1.18),
            bladeRotationA,
            sin(phase * 0.29) * 0.72,
            0.16 + foldA * 0.12
          );
          float dA = mix(triangleA, bladeA, (1.0 - middleLayer) * 0.9);

          float foldB = 0.5 + 0.5 * cos(phaseB * 0.81 + 1.2);
          float shardBTarget = mix(
            0.858 + cos(phaseB * 0.64) * 0.058,
            0.845 + cos(phaseB * 0.64) * 0.04,
            outerLane
          );
          vec2 shardB = vec2(
            localTangent + sin(phase * 0.77) * 0.045 * separation,
            animatedRadius - mix(shardBTarget, sharedRadius, gather * 0.96)
          );
          shardB.x -= shardB.y * cos(phaseB * 0.54) * (0.82 + release * 0.96);
          shardB.y = mix(shardB.y, abs(shardB.y) - 0.018, foldB * (0.62 + release * 0.26));
          float pulseB = (0.72 + ringBreath * 0.68) * (0.8 + 0.38 * cos(phaseB * 0.71));
          vec2 sizeB = vec2(
            (0.055 + foldB * 0.043) * pulseB,
            (0.076 + (1.0 - foldB) * 0.071) * mix(pulseB, 1.34, gather)
          );
          sizeB *= layerShardScale;
          float rotationB = 1.05
            + sin(phaseB * 0.55) * (0.72 + release * 0.88)
            - gather * 0.34;
          float triangleB = triangleDistance(
            shardB,
            sizeB,
            rotationB
          );
          float bladeRotationB = mix(
            rotationB * 0.28 - 0.2 + cos(phase * 0.31) * 0.13,
            cos(phase * 0.31) * 0.2
              + sin(layerTime * 0.17 - mirrorId * 0.54) * 0.08,
            outerLayer
          );
          float bladeB = crystalBladeDistance(
            shardB,
            sizeB * vec2(0.68, 1.24),
            bladeRotationB,
            cos(phaseB * 0.33) * 0.78,
            0.12 + foldB * 0.16
          );
          float dB = mix(triangleB, bladeB, (1.0 - middleLayer) * 0.92);

          float foldC = 0.5 + 0.5 * sin(phase * 0.63 + 2.4);
          float shardCTarget = mix(
            0.982 + sin(phase * 0.52 + 1.0) * 0.047,
            0.91 + sin(phase * 0.52 + 1.0) * 0.034,
            outerLane
          );
          vec2 shardC = vec2(
            localTangent + (0.112 + cos(phaseB * 0.69) * 0.041) * separation,
            animatedRadius - mix(shardCTarget, sharedRadius, gather * 0.88)
          );
          shardC.x = mix(shardC.x, -abs(shardC.x) + 0.018, foldC * (0.48 + release * 0.34));
          shardC.x += shardC.y * sin(phaseB * 0.77) * (0.95 + release * 1.08);
          float pulseC = (0.66 + ringBreath * 0.74) * (0.81 + 0.36 * sin(phase * 0.59 + 1.7));
          vec2 sizeC = vec2(
            (0.043 + (1.0 - foldC) * 0.044) * pulseC,
            (0.064 + foldC * 0.068) * mix(pulseC, 1.28, gather)
          );
          sizeC *= layerShardScale;
          float rotationC = -0.82
            + cos(phase * 0.49) * (0.95 + release * 0.82)
            + gather * 0.42;
          float triangleC = triangleDistance(
            shardC,
            sizeC,
            rotationC
          );
          float bladeRotationC = mix(
            rotationC * 0.31 + 0.17 + sin(phaseB * 0.28) * 0.14,
            sin(phaseB * 0.28) * 0.22
              + cos(layerTime * 0.19 + mirrorId * 0.49) * 0.1,
            outerLayer
          );
          float bladeC = crystalBladeDistance(
            shardC,
            sizeC * vec2(0.64, 1.3),
            bladeRotationC,
            sin(phase * 0.36 + 1.4) * 0.82,
            0.1 + foldC * 0.18
          );
          float dC = mix(triangleC, bladeC, (1.0 - middleLayer) * 0.94);

          // During the gather phase a larger mirrored petal grows out of the
          // overlapping shards, making the combination/recomposition readable.
          vec2 compositeShard = vec2(
            localTangent + sin(morphClock * 0.81 + mirrorId * 0.31) * 0.012,
            animatedRadius - sharedRadius
          );
          compositeShard.x += compositeShard.y * sin(morphClock * 0.67) * 0.78;
          vec2 compositeSize = vec2(
            mix(0.055, 0.224, gather),
            mix(0.072, 0.318, gather) * (0.84 + 0.2 * sin(morphClock * 0.91))
          );
          compositeSize *= layerShardScale;
          float compositeRotation = sin(morphClock * 0.53 + mirrorId * 0.11) * 0.62;
          float triangleComposite = triangleDistance(
            compositeShard,
            compositeSize,
            compositeRotation
          );
          float bladeCompositeRotation = mix(
            compositeRotation * 0.38,
            sin(layerTime * 0.16 + mirrorId * 0.58) * 0.12,
            outerLayer
          );
          float bladeComposite = crystalBladeDistance(
            compositeShard,
            compositeSize * vec2(0.72, 1.14),
            bladeCompositeRotation,
            sin(morphClock * 0.44 + mirrorId) * 0.54,
            0.2
          );
          float dComposite = mix(
            triangleComposite,
            bladeComposite,
            (1.0 - middleLayer) * 0.72
          );

          float individualWeight = mix(1.0, 0.34, gather);
          float fillA = (1.0 - smoothstep(-0.006, 0.009, dA)) * individualWeight;
          float fillB = (1.0 - smoothstep(-0.005, 0.008, dB)) * individualWeight;
          float fillC = (1.0 - smoothstep(-0.004, 0.007, dC)) * individualWeight;
          float fillComposite = (1.0 - smoothstep(-0.006, 0.01, dComposite)) * gather;
          float edgeA = exp(-abs(dA) / 0.0055) * individualWeight;
          float edgeB = exp(-abs(dB) / 0.005) * individualWeight;
          float edgeC = exp(-abs(dC) / 0.0045) * individualWeight;
          float edgeComposite = exp(-abs(dComposite) / 0.0058) * gather * (0.82 + gather * 0.52);
          float shardFill = max(fillComposite, max(fillA, max(fillB, fillC)));
          float fracture = mix(0.68, 1.0, fine) * (0.82 + coarse * 0.18);
          float outerShardZone = smoothstep(0.705, 0.77, radius);
          shardFill *= fracture * outerShardZone;

          float broadFlowA = pow(0.5 + 0.5 * sin(shardA.x * 54.0 + shardA.y * 31.0 - uTime * 0.73 + mirrorId), 4.0);
          float broadFlowB = pow(0.5 + 0.5 * sin(shardB.x * 61.0 - shardB.y * 28.0 - uTime * 0.62 + mirrorId * 0.73), 4.0);
          float broadFlowC = pow(0.5 + 0.5 * sin(shardC.x * 49.0 + shardC.y * 35.0 - uTime * 0.79 - mirrorId * 0.61), 4.0);
          float needleFlowA = pow(0.5 + 0.5 * sin(shardA.x * 103.0 - shardA.y * 66.0 - uTime * 1.51 + mirrorId * 1.37), 14.0);
          float needleFlowB = pow(0.5 + 0.5 * sin(shardB.x * 117.0 + shardB.y * 59.0 - uTime * 1.34 - mirrorId * 0.91), 14.0);
          float needleFlowC = pow(0.5 + 0.5 * sin(shardC.x * 96.0 - shardC.y * 71.0 - uTime * 1.67 + mirrorId * 0.54), 14.0);
          float flowA = clamp(broadFlowA * 0.42 + needleFlowA, 0.0, 1.0);
          float flowB = clamp(broadFlowB * 0.42 + needleFlowB, 0.0, 1.0);
          float flowC = clamp(broadFlowC * 0.42 + needleFlowC, 0.0, 1.0);
          float flowComposite = pow(
            0.5 + 0.5 * sin(compositeShard.x * 72.0 - compositeShard.y * 39.0 - uTime * 1.08),
            7.0
          );
          vec2 lightDirection = normalize(vec2(cos(-0.76), sin(-0.76)));
          vec2 radialDirection = normalize(p + vec2(0.0001));
          vec2 tangentDirection = vec2(-radialDirection.y, radialDirection.x);
          vec2 localLight = normalize(vec2(
            dot(lightDirection, tangentDirection),
            dot(lightDirection, radialDirection)
          ));
          float incidenceA = 0.16 + 0.84 * pow(abs(dot(normalize(shardA + vec2(0.0001)), localLight)), 2.4);
          float incidenceB = 0.16 + 0.84 * pow(abs(dot(normalize(shardB + vec2(0.0001)), localLight)), 2.4);
          float incidenceC = 0.16 + 0.84 * pow(abs(dot(normalize(shardC + vec2(0.0001)), localLight)), 2.4);
          float incidenceComposite = 0.16 + 0.84 * pow(abs(dot(normalize(compositeShard + vec2(0.0001)), localLight)), 2.4);
          float faintEdges = max(
            edgeComposite * incidenceComposite,
            max(edgeA * incidenceA, max(edgeB * incidenceB, edgeC * incidenceC))
          ) * fracture * outerShardZone;
          float flowingEdges = max(
            edgeComposite * flowComposite * incidenceComposite,
            max(edgeA * flowA * incidenceA, max(edgeB * flowB * incidenceB, edgeC * flowC * incidenceC))
          ) * fracture * outerShardZone;
          float sweepAngle = angle
            - layerTime * (0.26 + innerLayer * 0.08 + outerLayer * 0.13);
          float broadSweep = 0.5 + 0.5 * cos(sweepAngle);
          float rotatingHighlight = pow(broadSweep, 10.0);
          float counterGlint = pow(
            0.5 + 0.5 * cos(angle * 3.0 + layerTime * 0.41 + uLayerPhase),
            16.0
          );
          float rotatingShade = 0.2
            + smoothstep(0.02, 0.86, broadSweep) * 0.68
            + rotatingHighlight * (0.82 + outerLayer * 0.72)
            + counterGlint * (0.18 + outerLayer * 0.2);
          float blueLightField = mix(1.0, rotatingShade, 1.0 - middleLayer);
          faintEdges *= blueLightField;
          flowingEdges *= mix(1.0, 0.42 + blueLightField * 0.88, 1.0 - middleLayer);
          float shardBloom = exp(-abs(min(dComposite, min(dA, min(dB, dC)))) / 0.026) * flowingEdges;

          float internalA = pow(0.5 + 0.5 * sin(shardA.x * 38.0 - shardA.y * 72.0 + uTime * 0.82 + mirrorId), 9.0) * fillA;
          float internalB = pow(0.5 + 0.5 * sin(shardB.x * 44.0 + shardB.y * 65.0 - uTime * 0.69 - mirrorId * 0.7), 9.0) * fillB;
          float internalC = pow(0.5 + 0.5 * sin(shardC.x * 35.0 - shardC.y * 81.0 + uTime * 0.94 + mirrorId * 0.43), 9.0) * fillC;
          float internalComposite = pow(
            0.5 + 0.5 * sin(compositeShard.x * 31.0 + compositeShard.y * 58.0 - uTime * 0.61),
            7.0
          ) * fillComposite;
          float internalCaustics = max(internalComposite, max(internalA, max(internalB, internalC)))
            * fracture
            * outerShardZone;

          float angularLight = cos(angle + 0.76) * 0.5 + 0.5;
          float pulse = 0.88 + sin(uTime * 0.33) * 0.12;
          vec3 deepBlue = vec3(0.035, 0.075, 0.13);
          vec3 electricBlue = vec3(0.16, 0.36, 0.52);
          vec3 cyan = vec3(0.34, 0.58, 0.68);
          vec3 violet = vec3(0.31, 0.2, 0.4);
          vec3 white = vec3(1.55, 1.7, 1.72);
          float refractedRadius = radius
            + (fine - 0.5) * 0.046
            + sin(localTangent * 24.0 + phase * 0.63) * 0.021
            + sin(localTangent * 57.0 - phaseB * 0.42) * 0.008;
          float refractR = exp(-pow((refractedRadius - ringRadius - 0.018) / 0.013, 2.0));
          float refractG = exp(-pow((refractedRadius - ringRadius) / 0.012, 2.0));
          float refractB = exp(-pow((refractedRadius - ringRadius + 0.025) / 0.015, 2.0));
          float refractGhost = exp(-pow((refractedRadius - ringRadius
            + sin(phase * 0.77 + localTangent * 19.0) * 0.035) / 0.024, 2.0));
          vec3 refractedLight = vec3(
            refractR * 0.72 + refractGhost * 0.14,
            refractG * 0.86 + refractGhost * 0.2,
            refractB * 1.28 + refractGhost * 0.36
          )
            * shardFill
            * (0.34 + pow(angularLight, 2.2) * 1.06);

          vec3 spectral = mix(deepBlue, electricBlue, coarse);
          spectral = mix(spectral, violet, smoothstep(0.68, 0.95, fine) * 0.28);
          spectral = mix(spectral, cyan, flowingEdges * 0.72);
          spectral += vec3(0.15, 0.008, 0.006) * pow(angularLight, 10.0) * 0.42;
          vec3 redSpectrum = mix(vec3(0.22, 0.002, 0.004), vec3(1.18, 0.035, 0.018), coarse);
          redSpectrum = mix(redSpectrum, vec3(1.42, 0.16, 0.07), flowingEdges * 0.66);
          spectral = mix(spectral, redSpectrum, middleLayer * 0.94);
          spectral = mix(spectral, vec3(0.22, 0.38, 0.52), outerLayer * 0.5);
          float sourceFacing = 0.3 + pow(angularLight, 4.5) * 0.7;
          vec3 darkGlass = mix(vec3(0.0015, 0.003, 0.005), vec3(0.006, 0.013, 0.022), coarse);
          vec3 internalSpectrum = mix(
            electricBlue,
            mix(cyan, violet, 0.5 + 0.5 * sin(phaseB + uTime * 0.23)),
            fine
          );
          internalSpectrum = mix(internalSpectrum, redSpectrum, middleLayer * 0.92);
          refractedLight = mix(
            refractedLight,
            refractedLight * vec3(1.34, 0.12, 0.055),
            middleLayer * 0.86
          );
          float crystallineDepth = shardFill
            * (1.0 - middleLayer)
            * (0.18 + coarse * 0.32 + internalCaustics * 0.24)
            * (0.38 + blueLightField * 0.74);
          float internalVein = pow(
            0.5 + 0.5 * sin(
              localTangent * 27.0 - animatedRadius * 43.0
              + layerTime * 0.38 + mirrorId * 0.63
            ),
            6.0
          ) * shardFill * (1.0 - middleLayer);
          vec3 grayBlueTransmission = mix(
            vec3(0.018, 0.042, 0.06),
            vec3(0.13, 0.23, 0.31),
            coarse
          );
          vec3 color = darkGlass * shardFill;
          color += grayBlueTransmission
            * crystallineDepth
            * (0.74 + innerLayer * 0.4 + outerLayer * 1.08);
          color += mix(electricBlue, cyan, 0.46)
            * internalVein
            * (0.055 + innerLayer * 0.035 + outerLayer * 0.1)
            * (0.42 + blueLightField * 0.86);
          refractedLight *= mix(1.0, 0.34 + blueLightField, 1.0 - middleLayer);
          color += refractedLight * 0.6;
          color += internalSpectrum * internalCaustics * (0.28 + angularLight * 0.3);
          color += spectral * closeGlow * shardFill * (0.07 + angularLight * 0.16);
          color += spectral * faintEdges * (0.84 + gather * 0.24);
          color += mix(spectral, white, flowingEdges * 0.34) * flowingEdges * sourceFacing * 1.3;
          color += mix(spectral, white, 0.28)
            * rotatingHighlight
            * faintEdges
            * (innerLayer * 0.2 + outerLayer * 0.46);

          float glassOpacity = shardFill
            * (0.13 + coarse * 0.06)
            * (1.0 + innerLayer * 0.28 + outerLayer * 0.78);
          float edgeOpacity = faintEdges * (0.78 + gather * 0.22) + flowingEdges * sourceFacing * 1.16;
          float refractionOpacity = max(refractR, max(refractG, refractB)) * shardFill * 0.46
            + refractGhost * shardFill * 0.16;
          float internalOpacity = internalCaustics * (0.17 + angularLight * 0.2);
          float bloom = shardBloom * 0.18
            + closeGlow * flowingEdges * 0.09
            + farGlow * flowingEdges * 0.03;
          float outerFeather = 1.0 - smoothstep(0.985, 1.0, radius);
          float innerBand = smoothstep(0.47, 0.53, radius)
            * (1.0 - smoothstep(0.92, 0.975, radius));
          float middleBand = smoothstep(0.69, 0.735, radius)
            * (1.0 - smoothstep(0.91, 0.965, radius));
          float outerBand = smoothstep(0.69, 0.735, radius)
            * (1.0 - smoothstep(0.93, 0.98, radius));
          float outerBoundary = outerLayer
            * exp(-pow((radius - 0.942) / 0.034, 2.0))
            * max(faintEdges * 0.72, flowingEdges)
            * outerBand;
          color += mix(spectral, white, 0.34) * outerBoundary * 0.76;
          edgeOpacity += outerBoundary * 1.02;
          // Keep the outer ring sparse without switching complete angular
          // segments on/off. The previous step/floor mask caused both visible
          // seams and a periodic jump when the active segment advanced.
          float sparseDrift = morphClock * 0.075 + uLayerPhase * 0.18;
          float sparseWaveA = 0.5 + 0.5 * cos(angle * 2.0 - sparseDrift);
          float sparseWaveB = 0.5 + 0.5 * cos(angle * 3.0 + sparseDrift * 0.63 + 1.7);
          float sparseField = clamp(sparseWaveA * 0.78 + sparseWaveB * 0.22, 0.0, 1.0);
          float sparseSegment = mix(
            0.12,
            1.0,
            smoothstep(0.16, 0.86, sparseField)
          );
          float layerMask = mix(innerBand, middleBand, middleLayer);
          layerMask = mix(layerMask, outerBand * sparseSegment, outerLayer);
          float alpha = (glassOpacity + edgeOpacity + refractionOpacity + internalOpacity + bloom)
            * pulse
            * outerFeather
            * layerMask
            * uLayerIntensity
            * uFade;
          alpha *= smoothstep(0.43, 0.52, radius);
          gl_FragColor = vec4(color, alpha);
        }
      `,
    });
    glassMaterial.uniforms.uLayerIntensity.value = 1.2;
    const redGlassMaterial = glassMaterial.clone();
    redGlassMaterial.uniforms.uLayerMode.value = 1;
    redGlassMaterial.uniforms.uLayerPhase.value = 1.85;
    redGlassMaterial.uniforms.uLayerIntensity.value = 0.9;
    const outerGlassMaterial = glassMaterial.clone();
    outerGlassMaterial.uniforms.uLayerMode.value = 2;
    outerGlassMaterial.uniforms.uLayerPhase.value = 4.1;
    outerGlassMaterial.uniforms.uLayerIntensity.value = 1.14;
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
      0x071019,
      0x6a8fa8,
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
      0x789eb6,
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
    const glassHalo = new THREE.Mesh(new THREE.CircleGeometry(9.6, 224), glassMaterial);
    glassHalo.position.set(0, 0.45, -8.44);
    glassHalo.renderOrder = 5;
    monument.add(glassHalo);
    const redGlassHalo = new THREE.Mesh(new THREE.CircleGeometry(12.8, 224), redGlassMaterial);
    redGlassHalo.position.set(0, 0.45, -8.46);
    redGlassHalo.renderOrder = 4;
    monument.add(redGlassHalo);
    const outerGlassHalo = new THREE.Mesh(new THREE.CircleGeometry(17.0, 224), outerGlassMaterial);
    outerGlassHalo.position.set(0, 0.45, -8.48);
    outerGlassHalo.renderOrder = 3;
    monument.add(outerGlassHalo);

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
        uFinale: { value: 0 },
        uAspect: { value: 1 },
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
        const pointerTarget = event.target instanceof Element ? event.target : null;
        const isInteractive = Boolean(pointerTarget?.closest(
          "a, button, [role='button'], [role='link'], [data-clickable='true']",
        ));
        cursorRef.current.classList.toggle("is-interactive", isInteractive);
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
      cursorRef.current?.classList.remove("is-interactive");
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
      nameMaterial.uniforms.uAspect.value = width / Math.max(height, 1);
    };
    window.addEventListener("resize", resize);
    resize();

    const finaleSection = document.querySelector<HTMLElement>(".social-finale");
    const socialLinks = Array.from(
      document.querySelectorAll<HTMLElement>(".social-link"),
    );
    const socialHitTargets = [-3.15, 0, 3.15].map(
      (x) => new THREE.Vector3(x, 0, 0),
    );
    const projectedSocialTarget = new THREE.Vector3();
    let targetFinale = 0;
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
      if (finaleSection) {
        const rect = finaleSection.getBoundingClientRect();
        const travel = Math.max(finaleSection.offsetHeight - viewportHeight, 1);
        targetFinale = THREE.MathUtils.clamp(-rect.top / travel, 0, 1);
        finaleSection.style.setProperty("--finale-progress", targetFinale.toFixed(4));
        finaleSection.classList.toggle("is-social-active", targetFinale > 0.68);
      }
    };
    window.addEventListener("scroll", updateScrollStory, { passive: true });
    updateScrollStory();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startTime = performance.now();
    const currentLookAt = new THREE.Vector3(0, 1.15, -5.8);
    const idleCameraTarget = new THREE.Vector3();
    const idleLookAtTarget = new THREE.Vector3();
    let currentScroll = targetScroll;
    let currentFinale = targetFinale;
    let animationFrame = 0;
    const animate = (timestamp: number) => {
      const elapsed = reduceMotion ? 0 : (timestamp - startTime) / 1000;
      currentPointer.lerp(targetPointer, reduceMotion ? 1 : 0.045);
      currentScroll = THREE.MathUtils.lerp(currentScroll, targetScroll, reduceMotion ? 1 : 0.075);
      currentFinale = THREE.MathUtils.lerp(currentFinale, targetFinale, reduceMotion ? 1 : 0.065);
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

      namePoints.rotation.y = THREE.MathUtils.lerp(
        namePoints.rotation.y,
        currentPointer.x * 0.035 * (1 - currentFinale),
        0.06,
      );
      namePoints.rotation.x = THREE.MathUtils.lerp(
        namePoints.rotation.x,
        currentPointer.y * -0.018 * (1 - currentFinale),
        0.06,
      );
      nameMaterial.uniforms.uTime.value = elapsed;
      nameMaterial.uniforms.uPointer.value.copy(pointerActive ? currentPointer : restingNamePointer);
      pulseRef.current *= reduceMotion ? 0.7 : 0.935;
      nameMaterial.uniforms.uPulse.value = pulseRef.current;
      nameMaterial.uniforms.uExit.value = collapse;
      nameMaterial.uniforms.uFinale.value = currentFinale;
      nameMaterial.uniforms.uFade.value = 1;

      // The particle icons live in projected 3D space, so their screen centres
      // are not the same as three evenly-spaced CSS columns. Keep each link's
      // hit area locked to the actual particle target after camera parallax.
      if (currentFinale > 0.45) {
        camera.updateMatrixWorld();
        namePoints.updateMatrixWorld();
        socialHitTargets.forEach((target, index) => {
          const link = socialLinks[index];
          if (!link) return;
          projectedSocialTarget.copy(target);
          namePoints.localToWorld(projectedSocialTarget);
          projectedSocialTarget.project(camera);
          link.style.left = `${(projectedSocialTarget.x * 0.5 + 0.5) * 100}%`;
          link.style.top = `${(-projectedSocialTarget.y * 0.5 + 0.5) * 100}%`;
        });
      }

      eclipseMaterial.uniforms.uTime.value = elapsed;
      haloMaterial.uniforms.uTime.value = elapsed;
      glassMaterial.uniforms.uTime.value = elapsed;
      redGlassMaterial.uniforms.uTime.value = elapsed;
      outerGlassMaterial.uniforms.uTime.value = elapsed;
      eclipseMaterial.uniforms.uFade.value = 1;
      haloMaterial.uniforms.uFade.value = 1;
      glassMaterial.uniforms.uFade.value = 1;
      redGlassMaterial.uniforms.uFade.value = 1;
      outerGlassMaterial.uniforms.uFade.value = 1;
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
      glassMaterial.dispose();
      redGlassMaterial.dispose();
      outerGlassMaterial.dispose();
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
      <div ref={scrollRailRef} className="scroll-rail" aria-hidden="true">
        <div className="scroll-rail-track">
          {SCROLL_RAIL_TICKS.map((_, index) => (
            <span
              key={index}
              ref={(node) => { scrollTickRefs.current[index] = node; }}
            />
          ))}
        </div>
      </div>

      <main className="scroll-story">
        <section className="hero-spacer" aria-labelledby="site-title">
          <h1 id="site-title" className="sr-only">Siwei Yuan</h1>
          <a className="scroll-cue" href="#chronology" aria-label="Scroll to timeline" />
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
                <div
                  className={`records-list${section.id === "chronology" ? " is-expanded" : ""}${section.entries.length === 4 ? " is-quartet" : ""}`}
                >
                  {section.entries.map((entry) => (
                    <div
                      className="poster-anchor"
                      key={entry.title}
                      onPointerEnter={preparePosterHover}
                      onPointerMove={handlePosterMove}
                      onPointerLeave={resetPosterPose}
                    >
                      {entry.articleHref ? (
                        <a
                          className="poster-card blog-poster-card"
                          data-title-density={getPosterTitleDensity(entry.title)}
                          href={entry.articleHref}
                          aria-label={`Read ${entry.title}`}
                        >
                          <span>{entry.marker}</span>
                          <h3>{entry.title}</h3>
                          <p>{entry.detail}</p>
                          <small>{entry.readTime}</small>
                        </a>
                      ) : (
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
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ))}

        <section className="social-finale" aria-label="Social profiles">
          <div className="social-finale-sticky">
            <nav className="social-links" aria-label="Elsewhere">
              <a
                className="social-link"
                data-network="linkedin"
                href="https://www.linkedin.com/in/siwei-yuan/"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
              ><span>LinkedIn</span></a>
              <a
                className="social-link"
                data-network="github"
                href="https://github.com/siwei-yuan"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
              ><span>GitHub</span></a>
              <a
                className="social-link"
                data-network="x"
                href="https://x.com/ysw_Jerry"
                target="_blank"
                rel="noreferrer"
                aria-label="X"
              ><span>X</span></a>
            </nav>
            <p className="design-credit">
              The website design is inspired by Control, the game by Remedy. And yes, it&apos;s one of my favorites.
            </p>
          </div>
        </section>
      </main>

      {activePoster && (
        <div
          className={`poster-modal${isPosterReady ? " is-ready" : ""}${isPosterClosing ? " is-closing" : ""}`}
          onClick={closeActivePoster}
        >
          <div className="poster-inspection">
            <div
              className="poster-focus-shell"
              onPointerEnter={preparePosterHover}
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
                  {(activePoster.period || activePoster.employment || activePoster.location) && (
                    <dl>
                      {activePoster.period && <><dt>Period</dt><dd>{activePoster.period}</dd></>}
                      {activePoster.employment && <><dt>Type</dt><dd>{activePoster.employment}</dd></>}
                      {activePoster.location && <><dt>Location</dt><dd>{activePoster.location}</dd></>}
                    </dl>
                  )}
                  <section>
                    <span>Notes / Details</span>
                    <p>{activePoster.summary}</p>
                    {activePoster.highlights && (
                      <ul>
                        {activePoster.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
                      </ul>
                    )}
                  </section>
                  {activePoster.screenshot && (
                    <figure
                      className="detail-project-shot"
                      data-orientation={activePoster.screenshotOrientation ?? "landscape"}
                    >
                      <div
                        role="img"
                        aria-label={activePoster.screenshotAlt ?? `${activePoster.title} product screenshot`}
                        style={{ backgroundImage: `url("${activePoster.screenshot}")` }}
                      />
                      <figcaption>Image</figcaption>
                    </figure>
                  )}
                  {activePoster.href && (
                    <a
                      className="detail-project-link"
                      href={activePoster.href}
                      target="_blank"
                      rel="noreferrer"
                    >View repository</a>
                  )}
                </div>
              </aside>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
