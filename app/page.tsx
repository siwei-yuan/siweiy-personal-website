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

  void main() {
    vec3 p = position;
    vec2 normalizedText = vec2(p.x / 6.4, p.y / 1.45);
    vec2 delta = normalizedText - uPointer;
    float pointerDistance = length(delta);
    float influence = exp(-pointerDistance * 5.8);
    vec2 direction = normalize(delta + vec2(0.0001));

    p.xy += direction * influence * (0.1 + aSeed * 0.065);
    p.z += influence * (0.32 + aSeed * 0.16);
    p.z += sin(uTime * 0.65 + aSeed * 28.0) * 0.015;

    float ring = exp(-abs(pointerDistance - uPulse * 0.7) * 11.0) * uPulse;
    p.xy += direction * ring * 0.33;
    p.z += ring * 0.75;

    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = (0.86 + aSeed * 0.9 + influence * 1.9 + ring * 1.8) * (21.0 / -viewPosition.z);

    vSeed = aSeed;
    vEnergy = influence + ring;
  }
`;

const nameFragmentShader = /* glsl */ `
  precision highp float;
  varying float vSeed;
  varying float vEnergy;

  void main() {
    vec2 point = gl_PointCoord - 0.5;
    float circle = 1.0 - smoothstep(0.12, 0.5, length(point));
    float redParticle = step(0.962, vSeed);
    vec3 bone = vec3(1.22, 1.28, 1.24);
    vec3 red = vec3(1.0, 0.09, 0.045);
    vec3 color = mix(bone, red, max(redParticle, vEnergy * 0.55));
    float alpha = circle * (0.72 + redParticle * 0.24 + vEnergy * 0.24);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

const navItems = ["experience", "projects", "contact"] as const;

function createConcreteTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const image = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = 118 + Math.random() * 56;
    image.data[i] = value;
    image.data[i + 1] = value + 2;
    image.data[i + 2] = value + 1;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNameGeometry(label: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1800;
  canvas.height = 420;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const geometry = new THREE.BufferGeometry();
  if (!context) return geometry;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";

  let fontSize = 242;
  context.font = `760 ${fontSize}px Arial, Helvetica, sans-serif`;
  while (context.measureText(label).width > canvas.width * 0.86 && fontSize > 120) {
    fontSize -= 4;
    context.font = `760 ${fontSize}px Arial, Helvetica, sans-serif`;
  }
  context.fillText(label, canvas.width / 2, canvas.height / 2 + 8);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const positions: number[] = [];
  const seeds: number[] = [];
  const step = 3;

  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const alpha = pixels[(y * canvas.width + x) * 4 + 3];
      if (alpha > 96 && Math.random() > 0.05) {
        const jitter = step * 0.12;
        positions.push(
          ((x - canvas.width / 2 + (Math.random() - 0.5) * jitter) / canvas.width) * 12.7,
          (-(y - canvas.height / 2 + (Math.random() - 0.5) * jitter) / canvas.height) * 2.95,
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
    scene.background = new THREE.Color(0x121617);
    scene.fog = new THREE.FogExp2(0x171b1b, 0.033);

    const compact = window.innerWidth < 760;
    const camera = new THREE.PerspectiveCamera(compact ? 54 : 44, 1, 0.1, 70);
    camera.position.set(0, 0.55, compact ? 18.2 : 15.3);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.68;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.55));
    mount.appendChild(renderer.domElement);

    const concreteTexture = createConcreteTexture();
    const concrete = new THREE.MeshStandardMaterial({
      color: 0x4a5050,
      roughness: 0.96,
      metalness: 0.02,
      map: concreteTexture ?? undefined,
      bumpMap: concreteTexture ?? undefined,
      bumpScale: 0.065,
    });
    const darkConcrete = concrete.clone();
    darkConcrete.color.setHex(0x272c2c);
    darkConcrete.roughness = 1;
    const floorMaterial = concrete.clone();
    floorMaterial.color.setHex(0x303636);
    floorMaterial.roughness = 0.8;
    const blackMaterial = new THREE.MeshStandardMaterial({
      color: 0x101313,
      roughness: 0.88,
      metalness: 0.16,
    });
    const redMaterial = new THREE.MeshStandardMaterial({
      color: 0x3a0503,
      emissive: 0xff160d,
      emissiveIntensity: 1.8,
      roughness: 0.5,
    });
    const portalMaterial = new THREE.MeshBasicMaterial({ color: 0x8c0b07 });
    const redHazeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff1b11,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const architecture = new THREE.Group();
    scene.add(architecture);
    const floatingBlocks: THREE.Mesh[] = [];

    const addBlock = (
      x: number,
      y: number,
      z: number,
      width: number,
      height: number,
      depth: number,
      material: THREE.Material = concrete,
      rotationY = 0,
    ) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z);
      mesh.rotation.y = rotationY;
      mesh.castShadow = !compact;
      mesh.receiveShadow = !compact;
      architecture.add(mesh);
      return mesh;
    };

    // A deep, inhabited brutalist hall rather than a flat backdrop.
    addBlock(0, 2.2, -13, 31, 17, 1.2, darkConcrete);
    addBlock(0, -3.65, -1, 30, 0.9, 28, floorMaterial);
    addBlock(-10.1, 1.3, -4.5, 3.4, 12, 12, darkConcrete, -0.08);
    addBlock(10.1, 1.3, -4.5, 3.4, 12, 12, darkConcrete, 0.08);

    // Monumental gateway framing the red anomaly.
    addBlock(-3.95, 0.9, -8.1, 1.35, 9.6, 1.5, concrete);
    addBlock(3.95, 0.9, -8.1, 1.35, 9.6, 1.5, concrete);
    addBlock(0, 5.35, -8.1, 9.25, 1.25, 1.5, concrete);
    addBlock(0, -3.25, -8.1, 9.25, 0.75, 2.4, blackMaterial);
    addBlock(0, 0.9, -8.72, 6.5, 7.7, 0.12, portalMaterial);

    // Suspended administrative volumes and a severe concrete balcony.
    addBlock(0, 2.45, -4.8, 12.8, 0.58, 4.5, concrete);
    addBlock(-5.7, 4.65, -5.2, 5.8, 2.45, 3.2, darkConcrete);
    addBlock(5.85, 4.15, -5.9, 5.2, 3.25, 3.4, darkConcrete);
    addBlock(-7.05, -0.45, -3.15, 2.2, 5.4, 3.4, concrete);
    addBlock(7.2, -0.7, -2.45, 2.55, 5.1, 3.8, concrete);

    // Repeated beams establish scale and perspective.
    for (let i = 0; i < 6; i += 1) {
      const z = 3.5 - i * 3.2;
      addBlock(-8.5, 5.65, z, 0.72, 1.05, 5.7, concrete, -0.02);
      addBlock(8.5, 5.65, z, 0.72, 1.05, 5.7, concrete, 0.02);
      addBlock(0, 6.2, z, 18, 0.62, 0.9, darkConcrete);
    }

    // A few impossible floating blocks break the architectural logic.
    const floatingData = [
      [-2.6, 4.8, -2.5, 1.2, 1.1, 1.5],
      [2.1, 5.6, -4.0, 1.65, 0.8, 1.1],
      [5.2, 2.4, -5.0, 0.85, 1.7, 0.9],
      [-4.9, 1.8, -6.0, 1.1, 0.75, 1.2],
      [0.2, 4.4, -6.7, 0.75, 1.3, 0.8],
    ];
    floatingData.forEach(([x, y, z, width, height, depth], index) => {
      const block = addBlock(x, y, z, width, height, depth, index === 1 ? redMaterial : concrete);
      block.rotation.set(index * 0.17, index * 0.28, index * -0.09);
      floatingBlocks.push(block);
    });

    // Thin emissive ceiling panels create the hard, institutional top light.
    const lightPanelMaterial = new THREE.MeshBasicMaterial({ color: 0xb9c7c5 });
    for (const x of [-5.7, -1.9, 1.9, 5.7]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.2), lightPanelMaterial);
      panel.position.set(x, 5.82, 1.4);
      panel.rotation.x = Math.PI / 2;
      architecture.add(panel);
    }

    const redHaze = new THREE.Mesh(new THREE.BoxGeometry(6.1, 7.1, 5.2), redHazeMaterial);
    redHaze.position.set(0, 0.8, -6.2);
    architecture.add(redHaze);

    const ambientLight = new THREE.HemisphereLight(0xb8cac8, 0x070909, 1.3);
    scene.add(ambientLight);

    const keyLight = new THREE.SpotLight(0xdde8e5, 900, 38, Math.PI * 0.28, 0.78, 1.45);
    keyLight.position.set(-5, 9.5, 7.5);
    keyLight.target.position.set(0, -1, -5);
    keyLight.castShadow = !compact;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight, keyLight.target);

    const redLight = new THREE.SpotLight(0xff2116, 680, 34, Math.PI * 0.32, 0.76, 1.2);
    redLight.position.set(0, 4.7, -6.4);
    redLight.target.position.set(0, -1.2, 1.5);
    redLight.castShadow = !compact;
    redLight.shadow.mapSize.set(1024, 1024);
    scene.add(redLight, redLight.target);

    const sideLight = new THREE.DirectionalLight(0x9aafad, 1.5);
    sideLight.position.set(7, 4, 8);
    scene.add(sideLight);

    // The name is a sampled type silhouette: every visible mark is a particle.
    const nameGeometry = createNameGeometry("Siwei Yuan");
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
    namePoints.position.set(0, 0.1, 2.25);
    namePoints.scale.setScalar(compact ? 0.72 : 1);
    namePoints.renderOrder = 12;
    scene.add(namePoints);

    const targetPointer = new THREE.Vector2(0, 0);
    const currentPointer = new THREE.Vector2(0, 0);
    const onPointerMove = (event: PointerEvent) => {
      targetPointer.set(
        (event.clientX / window.innerWidth) * 2 - 1,
        -((event.clientY / window.innerHeight) * 2 - 1),
      );
    };
    const onPointerDown = () => {
      pulseRef.current = 1;
    };
    const onPointerLeave = () => {
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

      const baseZ = compact ? 18.2 : 15.3;
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, currentPointer.x * 0.82, 0.045);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 0.55 + currentPointer.y * 0.48, 0.045);
      camera.position.z = THREE.MathUtils.lerp(camera.position.z, baseZ + scrollRef.current * 2.4, 0.03);
      camera.lookAt(currentPointer.x * -0.22, currentPointer.y * -0.12, -2.8);

      architecture.rotation.y = THREE.MathUtils.lerp(architecture.rotation.y, currentPointer.x * -0.032, 0.04);
      architecture.rotation.x = THREE.MathUtils.lerp(architecture.rotation.x, currentPointer.y * 0.014, 0.04);
      architecture.position.x = THREE.MathUtils.lerp(architecture.position.x, currentPointer.x * -0.22, 0.04);

      namePoints.rotation.y = THREE.MathUtils.lerp(namePoints.rotation.y, currentPointer.x * 0.035, 0.06);
      namePoints.rotation.x = THREE.MathUtils.lerp(namePoints.rotation.x, currentPointer.y * -0.018, 0.06);
      nameMaterial.uniforms.uTime.value = elapsed;
      nameMaterial.uniforms.uPointer.value.copy(currentPointer);
      pulseRef.current *= reduceMotion ? 0.7 : 0.935;
      nameMaterial.uniforms.uPulse.value = pulseRef.current;

      floatingBlocks.forEach((block, index) => {
        block.position.y += Math.sin(elapsed * 0.34 + index * 1.7) * 0.0009;
        block.rotation.y += reduceMotion ? 0 : 0.00025 * (index % 2 ? 1 : -1);
      });
      redHaze.material.opacity = 0.075 + Math.sin(elapsed * 0.52) * 0.018;

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
      concrete.dispose();
      darkConcrete.dispose();
      floorMaterial.dispose();
      blackMaterial.dispose();
      redMaterial.dispose();
      portalMaterial.dispose();
      redHazeMaterial.dispose();
      lightPanelMaterial.dispose();
      concreteTexture?.dispose();
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
