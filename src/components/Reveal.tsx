"use client";

import { usePathname } from "next/navigation";
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

/**
 * One page-level fade, re-run on navigation. Deliberately the only motion on
 * most routes. Under prefers-reduced-motion the tween still runs so nothing is
 * left mid-fade, but with duration 0.
 */
export function Reveal({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      gsap.matchMedia().add({ reduceMotion: "(prefers-reduced-motion: reduce)" }, (context) => {
        const reduce = context.conditions?.reduceMotion ?? false;
        gsap.from(scope.current, {
          autoAlpha: 0,
          y: reduce ? 0 : 5,
          duration: reduce ? 0 : 0.28,
          ease: "power2.out",
        });
      });
    },
    { scope, dependencies: [pathname], revertOnUpdate: true },
  );

  return <div ref={scope}>{children}</div>;
}
