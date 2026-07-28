"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

const vertexShader = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uScroll;
  uniform float uPulse;
  uniform vec2 uPointer;
  uniform float uPointerActive;
  varying float vSeed;
  varying float vGlow;
  varying float vDepth;

  void main() {
    vec3 p = position;
    float slowTime = uTime * 0.14;

    p.y += sin(p.x * 0.72 + slowTime + aSeed * 8.0) * 0.055;
    p.z += cos(p.y * 0.9 - slowTime * 1.4 + aSeed * 5.0) * 0.07;

    float scrollWave = sin(p.x * 0.42 + aSeed * 12.0) * uScroll;
    p.y += scrollWave * 0.55;
    p.x += cos(p.z * 0.8 + aSeed * 9.0) * uScroll * 0.16;

    vec2 particleScreen = vec2(p.x / 8.5, p.y / 4.5);
    vec2 delta = particleScreen - uPointer;
    float distanceToPointer = length(delta);
    float influence = exp(-distanceToPointer * 5.5) * uPointerActive;
    vec2 direction = normalize(delta + vec2(0.0001));
    p.xy += direction * influence * (0.34 + uPulse * 0.5);
    p.z += influence * (0.7 + sin(uTime * 2.0 + aSeed * 10.0) * 0.2);

    float pulseRing = exp(-abs(distanceToPointer - uPulse * 0.55) * 9.0) * uPulse;
    p.z += pulseRing * 0.8;

    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = (1.45 + aSeed * 1.9 + influence * 2.2 + pulseRing * 2.8) * (7.0 / -mvPosition.z);

    vSeed = aSeed;
    vGlow = influence + pulseRing;
    vDepth = smoothstep(13.0, 2.0, -mvPosition.z);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;
  varying float vSeed;
  varying float vGlow;
  varying float vDepth;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float distanceFromCenter = length(uv);
    float particle = 1.0 - smoothstep(0.08, 0.5, distanceFromCenter);
    float hot = step(0.925, vSeed);
    vec3 cold = vec3(0.67, 0.72, 0.70);
    vec3 warning = vec3(0.94, 0.075, 0.055);
    vec3 color = mix(cold, warning, max(hot, vGlow * 0.78));
    float alpha = particle * (0.28 + hot * 0.48 + vGlow * 0.52) * vDepth;
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const sections = ["index", "experience", "projects", "contact"] as const;

export default function Home() {
  const mountRef = useRef<HTMLDivElement>(null);
  const shaderRef = useRef<THREE.ShaderMaterial | null>(null);
  const scrollRef = useRef(0);
  const pulseRef = useRef(0);
  const [activeSection, setActiveSection] = useState("index");
  const [signal, setSignal] = useState("PASSIVE");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x070808, 0.09);

    const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 40);
    camera.position.set(0, 0.15, 8.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x070808, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    mount.appendChild(renderer.domElement);

    const isCompact = window.innerWidth < 768;
    const count = isCompact ? 5200 : 9800;
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const seed = Math.random();
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.pow(Math.random(), 0.58) * 9.2;
      let x = Math.cos(angle) * radius;
      let z = Math.sin(angle) * radius * 0.52 - 0.8;
      let y =
        Math.sin(x * 0.76) * 0.22 +
        Math.cos(z * 1.5) * 0.12 -
        Math.abs(z) * 0.07 +
        (Math.random() - 0.5) * 0.14;

      // A narrow, impossible vertical structure interrupts the landscape.
      if (i < count * 0.115) {
        const side = Math.random() > 0.5 ? 1 : -1;
        x = side * (0.82 + Math.random() * 0.24) + (Math.random() - 0.5) * 0.08;
        y = (Math.random() - 0.42) * 6.4;
        z = (Math.random() - 0.5) * 0.38;
      }

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      seeds[i] = seed;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uScroll: { value: 0 },
        uPulse: { value: 0 },
        uPointer: { value: new THREE.Vector2(4, 4) },
        uPointerActive: { value: 0 },
      },
    });
    shaderRef.current = material;

    const points = new THREE.Points(geometry, material);
    points.rotation.x = -0.08;
    scene.add(points);

    const pointerTarget = new THREE.Vector2(4, 4);
    const pointerCurrent = new THREE.Vector2(4, 4);
    let pointerActiveTarget = 0;

    const onPointerMove = (event: PointerEvent) => {
      pointerTarget.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -((event.clientY / window.innerHeight) * 2 - 1),
      );
      pointerActiveTarget = 1;
    };

    const onPointerLeave = () => {
      pointerActiveTarget = 0;
      pointerTarget.set(4, 4);
    };

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("resize", resize);
    resize();

    const clock = new THREE.Clock();
    let frame = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      pointerCurrent.lerp(pointerTarget, reduceMotion ? 1 : 0.075);
      material.uniforms.uPointer.value.copy(pointerCurrent);
      material.uniforms.uPointerActive.value = THREE.MathUtils.lerp(
        material.uniforms.uPointerActive.value,
        pointerActiveTarget,
        0.08,
      );
      material.uniforms.uTime.value = reduceMotion ? 0 : elapsed;
      material.uniforms.uScroll.value = THREE.MathUtils.lerp(
        material.uniforms.uScroll.value,
        scrollRef.current,
        0.035,
      );
      pulseRef.current *= reduceMotion ? 0.75 : 0.94;
      material.uniforms.uPulse.value = pulseRef.current;

      if (!reduceMotion) {
        points.rotation.z = Math.sin(elapsed * 0.055) * 0.025;
        camera.position.x = Math.sin(elapsed * 0.075) * 0.12;
      }
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      shaderRef.current = null;
    };
  }, []);

  useEffect(() => {
    const updateScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const progress = max > 0 ? window.scrollY / max : 0;
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
      { rootMargin: "-30% 0px -45%", threshold: [0, 0.2, 0.55] },
    );

    sections.forEach((id) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });
    window.addEventListener("scroll", updateScroll, { passive: true });
    updateScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateScroll);
    };
  }, []);

  const activateSignal = useCallback(() => {
    pulseRef.current = 1;
    setSignal("ACQUIRED");
    window.setTimeout(() => setSignal("PASSIVE"), 1600);
  }, []);

  return (
    <div className="site-shell">
      <div ref={mountRef} className="particle-field" aria-hidden="true" />
      <div className="noise" aria-hidden="true" />
      <div className="scroll-meter" aria-hidden="true" />

      <header className="topbar">
        <a href="#index" className="brand" aria-label="Back to the top">
          YSW<span>/PORTFOLIO</span>
        </a>
        <nav className="primary-nav" aria-label="Main navigation">
          {sections.map((section, index) => (
            <a
              key={section}
              href={`#${section}`}
              className={activeSection === section ? "active" : ""}
            >
              <span>0{index + 1}</span>
              {section}
            </a>
          ))}
        </nav>
        <div className="signal-status" aria-live="polite">
          <i className={signal === "ACQUIRED" ? "live" : ""} />
          SIGNAL {signal}
        </div>
      </header>

      <main>
        <section id="index" className="hero section-panel" aria-labelledby="hero-name">
          <div className="hero-meta meta-top">
            <span>PORTER ID / YSW</span>
            <span>31.2304° N / 121.4737° E</span>
          </div>

          <div className="hero-center">
            <p className="eyebrow">Independent creator · systems · artifacts</p>
            <button
              id="hero-name"
              className="name-signal"
              type="button"
              onClick={activateSignal}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                event.currentTarget.style.setProperty(
                  "--name-x",
                  `${(event.clientX - rect.left) / rect.width - 0.5}`,
                );
                event.currentTarget.style.setProperty(
                  "--name-y",
                  `${(event.clientY - rect.top) / rect.height - 0.5}`,
                );
              }}
              aria-label="YSW — activate signal"
            >
              <span className="name-ghost" aria-hidden="true">YSW</span>
              <span className="name-main">YSW</span>
            </button>
            <p className="hero-note">
              A quiet index of things built, observed, and carried across difficult terrain.
            </p>
          </div>

          <div className="hero-meta meta-bottom">
            <span>ARCHIVE STATUS / OPEN</span>
            <a href="#experience">SCROLL TO DESCEND ↓</a>
          </div>
        </section>

        <section id="experience" className="content-section section-panel" aria-labelledby="experience-title">
          <div className="section-index">
            <span>01</span>
            <p>RECORDED HISTORY</p>
          </div>
          <div className="section-content">
            <p className="section-kicker">Experience / selected coordinates</p>
            <h2 id="experience-title">Work done at the edge of the known map.</h2>
            <div className="experience-list">
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

        <section id="projects" className="content-section section-panel projects-section" aria-labelledby="projects-title">
          <div className="section-index">
            <span>02</span>
            <p>FIELD OBJECTS</p>
          </div>
          <div className="section-content">
            <p className="section-kicker">Projects / recovered artifacts</p>
            <h2 id="projects-title">Signals worth leaving behind.</h2>
            <div className="project-grid">
              {["A", "B", "C"].map((letter, index) => (
                <article className="project-card" key={letter}>
                  <div className="project-visual" aria-hidden="true">
                    <span>{letter}</span>
                    <i />
                  </div>
                  <div className="project-copy">
                    <span>PROJECT / 00{index + 1}</span>
                    <h3>Untitled Artifact {letter}</h3>
                    <p>Case study placeholder · context, intervention, consequence.</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="contact" className="contact-section section-panel" aria-labelledby="contact-title">
          <div className="contact-frame">
            <p className="section-kicker">Contact / establish a strand</p>
            <h2 id="contact-title">If the signal reaches you, answer.</h2>
            <a className="contact-link" href="mailto:hello@your-domain.com">
              hello@your-domain.com <span>↗</span>
            </a>
            <div className="contact-meta">
              <span>AVAILABLE FOR CONVERSATIONS</span>
              <span>RESPONSE WINDOW / 48H</span>
              <span>SHANGHAI / UTC+8</span>
            </div>
          </div>
          <footer>
            <span>© {new Date().getFullYear()} YSW</span>
            <a href="#index">RETURN TO SURFACE ↑</a>
          </footer>
        </section>
      </main>
    </div>
  );
}
