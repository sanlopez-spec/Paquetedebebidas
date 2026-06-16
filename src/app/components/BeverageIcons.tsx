import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base: IconProps = {
  viewBox: "0 0 64 70",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.5,
  strokeLinejoin: "round",
  strokeLinecap: "round",
};

export function IconDestilados(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M30 4 H34 V6 H30 Z" />
      <path d="M28 6 H36 V11 H28 Z" />
      <path d="M29 11 V25 L24 28 V58 a4 4 0 0 0 4 4 H36 a4 4 0 0 0 4 -4 V28 L35 25 V11" />
      <rect x="27" y="42" width="10" height="12" rx="1.5" />
    </svg>
  );
}

export function IconVinos(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M30 4 H34 V8 H30 Z" />
      <path d="M30 8 V21 C30 25 24 26 24 32 V58 a4.5 4.5 0 0 0 4.5 4.5 H35.5 a4.5 4.5 0 0 0 4.5 -4.5 V32 C40 26 34 25 34 21 V8" />
      <rect x="27" y="42" width="10" height="13" rx="1.5" />
    </svg>
  );
}

export function IconEspumantes(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <g transform="rotate(20 32 37)">
        <path d="M29 5 a3 3 0 0 1 6 0 V9 H29 Z" />
        <path d="M30 9 V13 M34 9 V13 M30 11 H34" />
        <path d="M28.5 13 H35.5 V16 H28.5 Z" />
        <path d="M30 16 V19 C30 22 23 24 23 31 V58 a4 4 0 0 0 4 4 H37 a4 4 0 0 0 4 -4 V31 C41 24 34 22 34 19 V16" />
        <circle cx="31" cy="32" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="28" cy="38" r="1" fill="currentColor" stroke="none" />
        <circle cx="33" cy="42" r="1.1" fill="currentColor" stroke="none" />
        <circle cx="36" cy="37" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="30" cy="48" r="0.9" fill="currentColor" stroke="none" />
        <circle cx="34" cy="52" r="1" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
}

export function IconCervezas(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M29.5 6 H34.5 V8.5 H29.5 Z" />
      <path d="M28.5 8.5 q1.5 1.5 3 0 q1.5 1.5 3 0" />
      <path d="M30 9 V24 C30 27 26 28 26 32 V58 a4 4 0 0 0 4 4 H34 a4 4 0 0 0 4 -4 V32 C38 28 34 27 34 24 V9" />
      <rect x="27" y="41" width="10" height="12" rx="1" />
    </svg>
  );
}

export function IconMixers(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M24 16 H40" />
      <path d="M25 16 L28 58 a2 2 0 0 0 2 2 H34 a2 2 0 0 0 2 -2 L39 16" />
      <path d="M37 7 L31 38" />
      <circle cx="37.5" cy="6.5" r="1.5" />
      <circle cx="30" cy="30" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="34" cy="35" r="1" fill="currentColor" stroke="none" />
      <circle cx="30" cy="44" r="1" fill="currentColor" stroke="none" />
      <circle cx="34" cy="50" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconGaseosas(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M28 5 H36 V10 H28 Z" />
      <path d="M30 5 V10 M32 5 V10 M34 5 V10" />
      <path d="M30 12 L24 19 C24 23 22 25 24 29 V37 C22 41 24 43 24 47 V58 a4 4 0 0 0 4 4 H36 a4 4 0 0 0 4 -4 V47 C40 43 42 41 40 37 V29 C42 25 40 23 40 19 L34 12" />
      <path d="M24 29 H40 M24 47 H40" />
    </svg>
  );
}

export const beverageIcons = {
  destilados: IconDestilados,
  vinos:      IconVinos,
  espumantes: IconEspumantes,
  cervezas:   IconCervezas,
  mixers:     IconMixers,
  gaseosas:   IconGaseosas,
} as const;

export type BeverageIconKey = keyof typeof beverageIcons;
