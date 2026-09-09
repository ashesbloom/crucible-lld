"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { LEVEL_VALUE, type LevelId } from "@/domain/rubric/Rubric";

gsap.registerPlugin(useGSAP);

/**
 * One criterion's level across attempts, as a small multiple.
 *
 * Six criteria on one chart would need six colours that a reader has to hold in
 * their head, and the levels are integers so the lines would overplot. Six small
 * panels each carry a single series, which means no legend, no colour coding of
 * identity, and the comparison the learner actually wants: is this one getting
 * better.
 *
 * The line is neutral. Colour is on the marker and encodes the level, and the
 * latest level is written out beside it, so the state is never colour alone.
 */

const LEVEL_NAME: Record<LevelId, string> = { L0: "Missing", L1: "Emerging", L2: "Solid", L3: "Strong" };

function colourFor(level: LevelId): string {
  if (level === "L0") return "var(--wide)";
  if (level === "L1") return "var(--modified)";
  return "var(--contained)";
}

export interface TrendPoint {
  label: string;
  level: LevelId | null;
  assessed: boolean;
}

export function CriterionTrend({ name, weight, points }: { name: string; weight: number; points: readonly TrendPoint[] }) {
  const width = 240;
  const height = 64;
  const padX = 12;
  const padY = 10;
  const scope = useRef<SVGSVGElement>(null);

  const usable = points.filter((p) => p.assessed && p.level);
  const latest = usable.at(-1);

  const x = (index: number) =>
    points.length <= 1 ? width / 2 : padX + (index * (width - padX * 2)) / (points.length - 1);
  const y = (level: LevelId) => height - padY - (LEVEL_VALUE[level] / 3) * (height - padY * 2);

  const path = points
    .map((point, index) => (point.assessed && point.level ? `${x(index)},${y(point.level)}` : null))
    .filter(Boolean)
    .join(" ");

  // The line draws left to right and the markers land on it. That is the shape
  // of the question ("is this getting better?"), so the motion is the reading
  // order rather than decoration.
  useGSAP(
    () => {
      gsap.matchMedia().add({ reduceMotion: "(prefers-reduced-motion: reduce)" }, (context) => {
        if (context.conditions?.reduceMotion) return;

        const line = scope.current?.querySelector("polyline");
        if (line) {
          const length = line.getTotalLength();
          gsap.fromTo(
            line,
            { strokeDasharray: length, strokeDashoffset: length },
            { strokeDashoffset: 0, duration: 0.45, ease: "none" },
          );
        }

        gsap.from(scope.current?.querySelectorAll("circle") ?? [], {
          attr: { r: 0 },
          duration: 0.2,
          delay: 0.15,
          stagger: 0.08,
          ease: "power2.out",
        });
      });
    },
    { scope, dependencies: [path] },
  );

  return (
    <figure className="panel" style={{ margin: 0, padding: "0.6rem 0.7rem" }}>
      <figcaption style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
        <span className="small" style={{ fontWeight: 600 }}>{name}</span>
        <span className="micro faint metric">{weight}%</span>
      </figcaption>

      {usable.length === 0 ? (
        <p className="micro faint" style={{ margin: "1.2rem 0" }}>Not assessed yet.</p>
      ) : (
        <>
          <svg
            ref={scope}
            viewBox={`0 0 ${width} ${height}`}
            width="100%"
            height={height}
            role="img"
            aria-label={`${name}: ${usable.map((p) => `${p.label} ${LEVEL_NAME[p.level!]}`).join(", ")}`}
            style={{ display: "block", marginTop: "0.3rem", overflow: "visible" }}
          >
            {/* Only the two anchors of the scale, drawn recessively. */}
            {(["L0", "L3"] as const).map((level) => (
              <line
                key={level}
                x1={padX} x2={width - padX}
                y1={y(level)} y2={y(level)}
                stroke="var(--ink-600)" strokeWidth="1"
              />
            ))}

            {path.split(" ").length > 1 && (
              <polyline points={path} fill="none" stroke="var(--chalk-faint)" strokeWidth="1.5" />
            )}

            {points.map((point, index) =>
              point.assessed && point.level ? (
                <circle
                  key={index}
                  cx={x(index)} cy={y(point.level)} r="4"
                  fill={colourFor(point.level)}
                  stroke="#fff" strokeWidth="1.5"
                >
                  <title>{`${point.label}: ${LEVEL_NAME[point.level]}`}</title>
                </circle>
              ) : null,
            )}
          </svg>

          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.2rem" }}>
            <span className="micro faint">missing → strong</span>
            <span className="micro">now {LEVEL_NAME[latest!.level!]}</span>
          </div>
        </>
      )}
    </figure>
  );
}
