"use client";

import { useEffect, useRef } from "react";

const RAIL_TICKS = Array.from({ length: 21 });

export function ArticleExperience({ headingIds }: { headingIds: readonly string[] }) {
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorLightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const railTicks = Array.from(document.querySelectorAll<HTMLElement>(".article-rail-tick"));
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(".article-toc a"));
    const headings = headingIds
      .map((id) => document.getElementById(id))
      .filter((heading): heading is HTMLElement => Boolean(heading));
    let activeCoralLink: HTMLElement | null = null;

    const onPointerMove = (event: PointerEvent) => {
      const cursor = cursorRef.current;
      const light = cursorLightRef.current;
      const target = event.target instanceof Element ? event.target : null;
      const coralLink = target?.closest<HTMLElement>(".article-coral-link") ?? null;

      if (activeCoralLink && activeCoralLink !== coralLink) {
        activeCoralLink.removeAttribute("data-pointer-active");
      }
      activeCoralLink = coralLink;
      if (coralLink) {
        const rect = coralLink.getBoundingClientRect();
        const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
        const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
        coralLink.style.setProperty("--coral-pointer-x", `${x}px`);
        coralLink.style.setProperty("--coral-pointer-y", `${y}px`);
        coralLink.style.setProperty(
          "--coral-pointer-origin",
          `${(x / Math.max(rect.width, 1)) * 100}%`,
        );
        coralLink.setAttribute("data-pointer-active", "");
      }

      if (cursor) {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
        cursor.style.opacity = "1";
        cursor.classList.toggle("is-interactive", Boolean(target?.closest("a, button")));
      }
      if (light) {
        light.style.left = `${event.clientX}px`;
        light.style.top = `${event.clientY}px`;
        light.style.opacity = "1";
      }
    };

    const onPointerLeave = () => {
      if (cursorRef.current) cursorRef.current.style.opacity = "0";
      cursorRef.current?.classList.remove("is-interactive");
      if (cursorLightRef.current) cursorLightRef.current.style.opacity = "0";
      activeCoralLink?.removeAttribute("data-pointer-active");
      activeCoralLink = null;
    };

    let frame = 0;
    const update = () => {
      frame = 0;
      const maximum = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
      const progress = Math.min(Math.max(window.scrollY / maximum, 0), 1);
      root.style.setProperty("--article-progress", progress.toFixed(4));

      railTicks.forEach((tick, index) => {
        const position = index / Math.max(railTicks.length - 1, 1);
        const distance = Math.abs(position - progress);
        const intensity = Math.max(0, 1 - distance * 7.5);
        tick.style.setProperty("--rail-intensity", intensity.toFixed(3));
      });

      let current = headings[0]?.id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= window.innerHeight * .34) current = heading.id;
      }
      links.forEach((link) => link.toggleAttribute("data-active", link.hash === `#${current}`));
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      if (frame) window.cancelAnimationFrame(frame);
      root.style.removeProperty("--article-progress");
    };
  }, [headingIds]);

  return (
    <>
      <div ref={cursorLightRef} className="cursor-light-field article-cursor-light" aria-hidden="true" />
      <div ref={cursorRef} className="cursor-singularity article-cursor" aria-hidden="true"><span /></div>
      <div className="article-progress" aria-hidden="true"><span /></div>
      <div className="article-scroll-rail" aria-hidden="true">
        {RAIL_TICKS.map((_, index) => <span className="article-rail-tick" key={index} />)}
      </div>
    </>
  );
}
