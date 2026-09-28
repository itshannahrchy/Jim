// Hand-drawn style fuzzy monsters, built entirely from inline SVG.
// Fluffiness comes from shape: a scalloped outline of overlapping circles,
// curved fur strokes inside each bump, curly belly tufts, a darker offset copy
// as a soft edge, and a gentle wobble filter.

import type { CSSProperties } from "react";

type Palette = { body: string; dark: string; light: string };

type FuzzyProps = {
  id: string;
  palette: Palette;
  shape?: "round" | "bean";
  mouth?: "grin" | "tongue" | "small";
  antenna?: boolean;
  seed?: number;
  arms?: boolean;
  className?: string;
  style?: CSSProperties;
  title?: string;
};

const INK = "#1F1B16";

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const f = (n: number) => Math.round(n * 10) / 10;

export function Fuzzy({
  id,
  palette,
  shape = "round",
  mouth = "grin",
  antenna = false,
  seed = 7,
  arms = true,
  className,
  style,
  title,
}: FuzzyProps) {
  const rand = rng(seed);
  const cx = 100;
  const cy = 118;
  const rx = shape === "bean" ? 56 : 70;
  const ry = shape === "bean" ? 74 : 64;
  const N = shape === "bean" ? 20 : 22;

  const bumps = Array.from({ length: N }, (_, i) => {
    const t = (i / N) * Math.PI * 2 + (rand() - 0.5) * 0.16;
    const r = 15 + rand() * 9;
    return { t, r, x: cx + (rx - 5) * Math.cos(t), y: cy + (ry - 5) * Math.sin(t) };
  });

  const arc = (x: number, y: number, r: number, a0: number, a1: number) =>
    `M${f(x + r * Math.cos(a0))} ${f(y + r * Math.sin(a0))}A${f(r)} ${f(r)} 0 0 1 ${f(x + r * Math.cos(a1))} ${f(y + r * Math.sin(a1))}`;

  // Fur strokes following the curve of each outer bump.
  const furOuter = bumps.map((b) => arc(b.x, b.y, b.r * 0.62, b.t - 0.6, b.t + 0.6)).join("");

  // Inner fur swirls scattered across the body (kept away from the face).
  const inner: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const d = 0.35 + rand() * 0.45;
    const x = cx + rx * d * Math.cos(a);
    const y = cy + ry * d * Math.sin(a);
    if (y < cy + 4 && Math.abs(x - cx) < rx * 0.75) continue; // face zone
    const r = 5 + rand() * 4;
    inner.push(arc(x, y, r, a - 0.2, a + 2.4));
  }

  // Rows of little curly tufts on the belly.
  const tufts: string[] = [];
  const rows = shape === "bean" ? [cy + 22, cy + 38, cy + 54] : [cy + 26, cy + 42];
  rows.forEach((y, ri) => {
    const span = rx * (0.62 - ri * 0.12);
    const count = shape === "bean" ? 4 - (ri > 1 ? 1 : 0) : 6 - ri;
    for (let k = 0; k < count; k++) {
      const x = cx - span + ((2 * span) / Math.max(1, count - 1)) * k + (rand() - 0.5) * 4;
      const r = 4 + rand() * 1.5;
      tufts.push(`M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 1 ${f(r)} ${f(r)}`);
    }
  });

  // Light highlight arcs on the upper-left bumps.
  const highlights = bumps
    .filter((b) => {
      const a = ((b.t % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return a > Math.PI * 1.08 && a < Math.PI * 1.62;
    })
    .map((b) => arc(b.x, b.y, b.r * 0.78, b.t - 0.5, b.t + 0.35))
    .join("");

  const silhouette = (
    <>
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
      {bumps.map((b, i) => (
        <circle key={i} cx={f(b.x)} cy={f(b.y)} r={f(b.r)} />
      ))}
    </>
  );

  // Face
  const eyeY = cy - (shape === "bean" ? 20 : 16);
  const eL = { x: cx - (shape === "bean" ? 20 : 25), y: eyeY, r: shape === "bean" ? 13 : 17 };
  const eR = { x: cx + (shape === "bean" ? 17 : 23), y: eyeY + 1, r: shape === "bean" ? 11 : 12.5 };
  const eye = (e: { x: number; y: number; r: number }, k: string) => (
    <g key={k}>
      <circle cx={e.x} cy={e.y} r={e.r} fill="#FFFDF7" />
      <circle cx={e.x + e.r * 0.12} cy={e.y + e.r * 0.34} r={e.r * 0.46} fill={INK} />
    </g>
  );
  const smileY = cy + (shape === "bean" ? 6 : 10);
  const smileW = mouth === "grin" ? 40 : 20;
  const smileD = mouth === "grin" ? 30 : 16;
  const smile = `M${cx - smileW} ${smileY - 4}Q${cx} ${smileY + smileD} ${cx + smileW} ${smileY - 8}`;

  const legY = cy + ry - 14;
  const filterId = `${id}-wobble`;

  return (
    <svg
      viewBox="0 0 200 230"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed={seed} />
          <feDisplacementMap in="SourceGraphic" scale="3.2" />
        </filter>
      </defs>

      <ellipse cx={cx} cy={cy + ry + 28} rx={rx * 0.9} ry={7} fill="#E6DAC3" opacity="0.9" />

      <g filter={`url(#${filterId})`}>
        {/* legs and feet */}
        {[-1, 1].map((s) => (
          <g key={s}>
            <rect x={cx + s * 22 - 6} y={legY} width={12} height={28} rx={5} fill={palette.dark} />
            <ellipse cx={cx + s * 24} cy={legY + 28} rx={15} ry={7.5} fill={palette.body} stroke={palette.dark} strokeWidth={3} />
          </g>
        ))}

        {/* arms hanging at the sides */}
        {arms &&
          [-1, 1].map((s) => (
            <ellipse
              key={s}
              cx={cx + s * (rx + 12)}
              cy={cy + 34}
              rx={8.5}
              ry={17}
              transform={`rotate(${s * -12} ${cx + s * (rx + 12)} ${cy + 34})`}
              fill={palette.body}
              stroke={palette.dark}
              strokeWidth={3}
            />
          ))}

        {antenna && (
          <g>
            <path d={`M${cx + 6} ${cy - ry + 2}Q${cx + 4} ${cy - ry - 14} ${cx + 12} ${cy - ry - 26}`} stroke={INK} strokeWidth={3.5} fill="none" strokeLinecap="round" />
            <circle cx={cx + 12} cy={cy - ry - 28} r={6.5} fill="#FFC94A" />
          </g>
        )}

        {/* soft thick edge: darker copy offset down-right */}
        <g fill={palette.dark} transform="translate(5 6)">{silhouette}</g>
        <g fill={palette.body}>{silhouette}</g>

        <path d={furOuter} stroke={palette.dark} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        <path d={inner.join("")} stroke={palette.dark} strokeWidth={2.2} fill="none" strokeLinecap="round" opacity={0.8} />
        <path d={tufts.join("")} stroke={palette.dark} strokeWidth={2.3} fill="none" strokeLinecap="round" />
        <path d={highlights} stroke={palette.light} strokeWidth={3.2} fill="none" strokeLinecap="round" />

        {eye(eL, "l")}
        {eye(eR, "r")}
        {mouth === "tongue" && (
          <path
            d={`M${cx + 2} ${smileY + 9}q2 12 9 10q6 -2 1 -12z`}
            fill="#F27A8A"
            stroke={INK}
            strokeWidth={1.5}
          />
        )}
        <path d={smile} stroke={INK} strokeWidth={mouth === "grin" ? 7 : 5} fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export const MORRIS_PALETTE: Palette = { body: "#F5A00F", dark: "#D9820A", light: "#FFC94A" };
export const MINT_PALETTE: Palette = { body: "#6FCFB4", dark: "#4FAE93", light: "#A8EBD8" };
export const LAVENDER_PALETTE: Palette = { body: "#A58BEF", dark: "#8468D6", light: "#CDBDF8" };

type CharacterProps = { id?: string; className?: string; style?: CSSProperties; title?: string };

export function Morris({ id = "morris", ...rest }: CharacterProps) {
  return <Fuzzy id={id} palette={MORRIS_PALETTE} seed={7} mouth="grin" {...rest} />;
}

export function MintFriend({ id = "mint", ...rest }: CharacterProps) {
  return <Fuzzy id={id} palette={MINT_PALETTE} seed={21} mouth="tongue" {...rest} />;
}

export function LavenderFriend({ id = "lavender", ...rest }: CharacterProps) {
  return <Fuzzy id={id} palette={LAVENDER_PALETTE} seed={42} shape="bean" mouth="small" antenna {...rest} />;
}

// ───────────────────────── aerial hoop ─────────────────────────

export function Hoop({ className }: { className?: string }) {
  const cx = 170;
  const cy = 205;
  const r = 148;
  const pt = (deg: number, rad: number) => {
    const a = (deg * Math.PI) / 180;
    return `${f(cx + rad * Math.cos(a))} ${f(cy + rad * Math.sin(a))}`;
  };
  // Coral tape-wrap stripes on the lower right of the ring.
  const tape = [38, 44, 50].map((d) => `M${pt(d - 3, r - 10)}L${pt(d + 3, r + 10)}`).join("");
  return (
    <svg viewBox="0 0 340 370" className={className} aria-hidden>
      <defs>
        <filter id="hoop-wobble" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="5" />
          <feDisplacementMap in="SourceGraphic" scale="4" />
        </filter>
      </defs>
      <g filter="url(#hoop-wobble)">
        <path d={`M170 0C168 18 172 34 170 ${cy - r - 4}`} stroke="#8A5A2B" strokeWidth={5} fill="none" strokeLinecap="round" />
        {/* faint offset pencil outline */}
        <circle cx={cx + 4} cy={cy + 3} r={r + 9} stroke="#C4A57C" strokeWidth={1.3} fill="none" opacity={0.55} />
        <circle cx={cx} cy={cy} r={r} stroke="#D9820A" strokeWidth={15} fill="none" />
        <circle cx={cx} cy={cy} r={r} stroke="#F5A00F" strokeWidth={11} fill="none" />
        <circle
          cx={cx}
          cy={cy}
          r={r + 2}
          stroke="#FFC94A"
          strokeWidth={3.2}
          fill="none"
          strokeDasharray="120 30 60 40 200 50"
          strokeLinecap="round"
        />
        <path d={tape} stroke="#E5533A" strokeWidth={4.5} strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ───────────────────────── doodles ─────────────────────────

type DoodleKind = "sparkle" | "plus" | "ring" | "squiggle";

export function Doodle({
  kind,
  color,
  size = 28,
  style,
  className,
}: {
  kind: DoodleKind;
  color: string;
  size?: number;
  style?: CSSProperties;
  className?: string;
}) {
  const common = { width: size, height: size, viewBox: "0 0 40 40", style, className, "aria-hidden": true } as const;
  switch (kind) {
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M20 2C21.5 13 24 17.5 38 20C24 22.5 21.5 27 20 38C18.5 27 16 22.5 2 20C16 17.5 18.5 13 20 2Z" fill={color} />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M20 6L20.6 34M6 19.5L34 20.4" stroke={color} strokeWidth={5} strokeLinecap="round" />
        </svg>
      );
    case "ring":
      return (
        <svg {...common}>
          <path d="M20 6C29 5.5 34.5 12 34 20.5C33.5 29 27 34.5 19 34C11 33.5 5.5 27.5 6 19.5C6.5 12 11.5 6.5 21 6.8" stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round" />
        </svg>
      );
    case "squiggle":
      return (
        <svg {...common} viewBox="0 0 80 30" width={size * 2} height={size * 0.75}>
          <path d="M4 18C10 8 16 8 22 16S34 25 40 15S52 6 58 15S70 24 76 13" stroke={color} strokeWidth={4.5} fill="none" strokeLinecap="round" />
        </svg>
      );
  }
}
