import { useState } from 'react';
import heroDesktop from '../assets/hero-desktop.jpg';
import heroMobile from '../assets/hero-mobile.jpg';

/**
 * Full-width hero backdrop: a South Indian Kalyana Mandapam photograph.
 *
 *  - Desktop (>= 1024px): hero-desktop.jpg — web-optimised copy of src/assets/madapam1.png (stage on the right, open
 *    floor on the left where the headline sits).
 *  - Mobile / tablet: hero-mobile.jpg — web-optimised, centre-cropped copy of src/assets/madapam2.png (symmetric
 *    mandapam, so the stage stays visible in a tall, narrow crop).
 *  The original PNGs are untouched; the JPEGs are ~10x smaller for phones.
 *
 * If the photo cannot be loaded, the temporary SVG illustration below is shown instead.
 * Readability overlays live in the page, so they apply to either backdrop.
 */
export default function HeroScene({ className = '' }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <HeroIllustration className={className} />;
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={heroDesktop} />
      <img
        src={heroMobile}
        alt=""
        decoding="async"
        fetchPriority="high"
        onError={() => setFailed(true)}
        className={`${className} object-cover object-[50%_45%] lg:object-[68%_55%]`}
      />
    </picture>
  );
}

const GARLAND = ['#F59E0B', '#DC2626', '#FBBF24', '#FDE68A', '#EA580C', '#F59E0B'];

// y of the arch between the two pillars at a given x (quadratic curve P0=(760,210) C=(1000,40) P2=(1240,210))
const archY = (x: number) => { const t = (x - 760) / 480; return 210 - 340 * t * (1 - t); };

function strings() {
  const out: { x: number; y: number; r: number; c: string }[] = [];
  for (let i = 0; i < 25; i++) {
    const x = 772 + i * 19.5;
    const len = 50 + ((i * 53) % 6) * 34;
    for (let y = archY(x) + 8, k = 0; y < archY(x) + len; y += 14, k++) out.push({ x, y, r: 6.2, c: GARLAND[(i + k) % GARLAND.length] });
  }
  return out;
}
function swag(y0: number, sag: number, from = 770, to = 1230) {
  const out: { x: number; y: number; r: number; c: string }[] = [];
  const n = 38;
  for (let k = 0; k <= n; k++) {
    const t = k / n; const x = from + (to - from) * t; const y = y0 + sag * 4 * t * (1 - t);
    out.push({ x, y, r: 7.5, c: GARLAND[k % GARLAND.length] });
  }
  return out;
}
function archBeads() {
  const out: { x: number; y: number }[] = [];
  for (let x = 764; x <= 1236; x += 12) out.push({ x, y: archY(x) - 14 });
  return out;
}
function Lamp({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <ellipse cx="0" cy="250" rx="46" ry="46" fill="url(#flameGlow)" />
      <path d="M0 232 C-9 246 -8 258 0 262 C8 258 9 246 0 232Z" fill="#FFB020" />
      <path d="M0 242 C-4 249 -4 255 0 258 C4 255 4 249 0 242Z" fill="#FFF3C4" />
      <rect x="-22" y="262" width="44" height="7" rx="3" fill="url(#brass)" />
      <rect x="-5" y="269" width="10" height="150" fill="url(#brass)" />
      <ellipse cx="0" cy="300" rx="17" ry="6" fill="url(#brass)" />
      <ellipse cx="0" cy="350" rx="21" ry="7" fill="url(#brass)" />
      <ellipse cx="0" cy="400" rx="26" ry="8" fill="url(#brass)" />
      <path d="M-44 560 L-30 430 L30 430 L44 560Z" fill="url(#brass)" />
      <ellipse cx="0" cy="430" rx="30" ry="9" fill="#F2C75C" />
    </g>
  );
}

function HeroIllustration({ className = '' }: { className?: string }) {
  const leafs = [
    [1390, 90, 120, 34, 30], [1330, 40, 90, 26, -20], [1410, 220, 110, 30, 70], [1380, 420, 130, 36, 100],
    [690, 540, 120, 32, -30], [640, 500, 100, 28, 25], [1250, 560, 120, 34, 20], [1330, 520, 110, 30, -35],
  ];
  return (
    <svg className={className} viewBox="0 0 1440 560" preserveAspectRatio="xMaxYMid slice" aria-hidden focusable="false">
      <defs>
        <linearGradient id="hsBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3A230D" /><stop offset="0.55" stopColor="#7A4A14" /><stop offset="1" stopColor="#2E1C0B" />
        </linearGradient>
        <radialGradient id="hsGlow" cx="0.5" cy="0.45" r="0.55">
          <stop offset="0" stopColor="#FFD27A" stopOpacity="0.95" /><stop offset="0.5" stopColor="#F0A83A" stopOpacity="0.45" /><stop offset="1" stopColor="#F0A83A" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="flameGlow"><stop offset="0" stopColor="#FFD27A" stopOpacity="0.9" /><stop offset="1" stopColor="#FFD27A" stopOpacity="0" /></radialGradient>
        <linearGradient id="brass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8A5A12" /><stop offset="0.45" stopColor="#F2C75C" /><stop offset="1" stopColor="#9A6A1A" />
        </linearGradient>
        <linearGradient id="carpet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7F1D1D" /><stop offset="1" stopColor="#B91C1C" /></linearGradient>
        <filter id="hsBlur"><feGaussianBlur stdDeviation="16" /></filter>
        <filter id="hsSoft"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>

      <rect width="1440" height="560" fill="url(#hsBg)" />
      <ellipse cx="1000" cy="270" rx="520" ry="300" fill="url(#hsGlow)" />

      {/* bokeh lights */}
      <g filter="url(#hsBlur)" opacity="0.8">
        {[[620, 90, 34], [700, 170, 26], [1350, 150, 40], [1400, 330, 30], [880, 60, 24], [1120, 70, 28], [560, 300, 30], [1290, 470, 36]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#FFD27A" />
        ))}
      </g>

      {/* back wall pillars + inner arch */}
      <rect x="744" y="200" width="38" height="360" fill="#5C3A12" />
      <rect x="1218" y="200" width="38" height="360" fill="#5C3A12" />
      <rect x="744" y="200" width="6" height="360" fill="#F2C75C" opacity="0.7" />
      <rect x="1250" y="200" width="6" height="360" fill="#F2C75C" opacity="0.7" />
      <path d="M782 560 L782 230 Q1000 90 1218 230 L1218 560Z" fill="#E8A63C" opacity="0.28" />
      <path d="M760 560 L760 210 Q1000 40 1240 210" fill="none" stroke="#F2C75C" strokeWidth="9" strokeLinecap="round" />
      <path d="M782 560 L782 232 Q1000 92 1218 232" fill="none" stroke="#F2C75C" strokeWidth="3" opacity="0.8" />
      {archBeads().map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.2" fill="#FFE29A" />)}

      {/* red carpet */}
      <polygon points="930,560 1070,560 1022,372 978,372" fill="url(#carpet)" />
      <polygon points="930,560 940,560 982,372 978,372" fill="#F2C75C" opacity="0.7" />
      <polygon points="1060,560 1070,560 1022,372 1018,372" fill="#F2C75C" opacity="0.7" />

      {/* garlands */}
      <g filter="url(#hsSoft)" opacity="0.35">{strings().map((p, i) => <circle key={i} cx={p.x + 2} cy={p.y + 3} r={p.r} fill="#000" />)}</g>
      {strings().map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={p.c} />)}
      {[[330, 70], [400, 40]].flatMap(([y, sag]) => swag(y, sag)).map((p, i) => <circle key={`s${i}`} cx={p.x} cy={p.y} r={p.r} fill={p.c} />)}

      <Lamp x={690} />
      <Lamp x={1310} />

      {/* foliage */}
      {leafs.map(([cx, cy, rx, ry, rot], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${rot} ${cx} ${cy})`} fill={i % 2 ? '#14532D' : '#166534'} opacity="0.9" />
      ))}
    </svg>
  );
}
