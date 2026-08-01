import { useId, type SVGProps } from "react";

type DrawInstrumentIconProps = SVGProps<SVGSVGElement>;
type PencilIconProps = DrawInstrumentIconProps & {
  graphiteColor?: string;
};

function withAlpha(hexOrColor: string, alpha: string) {
  if (/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(hexOrColor)) {
    const normalized =
      hexOrColor.length === 4
        ? `#${hexOrColor[1]}${hexOrColor[1]}${hexOrColor[2]}${hexOrColor[2]}${hexOrColor[3]}${hexOrColor[3]}`
        : hexOrColor;
    return `${normalized}${alpha}`;
  }

  return hexOrColor;
}

/** A self-contained vertical pencil so each toolbar instance keeps isolated SVG defs. */
export function PencilIcon({ className, graphiteColor = "#0C1426", ...props }: PencilIconProps) {
  const prefix = `pencil-${useId().replace(/:/g, "")}`;
  const barrelBottom = 380;
  const collarTop = 365;
  const totalHeight = 392;

  return (
    <svg
      viewBox={`0 0 101 ${totalHeight}`}
      fill="none"
      overflow="visible"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id={`${prefix}-graphite`} x1="35" y1="0" x2="66" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor={withAlpha(graphiteColor, "FF")} />
          <stop offset="0.5" stopColor={withAlpha(graphiteColor, "B8")} />
          <stop offset="1" stopColor={withAlpha(graphiteColor, "D9")} />
        </linearGradient>
        <linearGradient id={`${prefix}-wood`} x1="50" y1="34" x2="50" y2="113" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F5D2AF" />
          <stop offset="1" stopColor="#C9956C" />
        </linearGradient>
        <linearGradient id={`${prefix}-barrel`} x1="0" y1="105" x2="101" y2={totalHeight} gradientUnits="userSpaceOnUse">
          <stop stopColor="#222A43" />
          <stop offset="0.48" stopColor="#505C7B" />
          <stop offset="1" stopColor="#1A2238" />
        </linearGradient>
        <linearGradient id={`${prefix}-sheen`} x1="42" y1="105" x2="73" y2={totalHeight} gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.32" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.04" />
        </linearGradient>
        <clipPath id={`${prefix}-upper-clip`}><path d={`M0 114C0 107 3 105 6 105C10 105 12 110 17 110C23 110 25 105 31 105C37 105 39 110 45 110C51 110 53 105 59 105C65 105 67 110 73 110C79 110 81 105 87 105C93 105 101 108 101 113V${barrelBottom - 8}C101 ${barrelBottom - 4} 98 ${barrelBottom - 1} 94 ${barrelBottom - 1}H7C3 ${barrelBottom - 1} 0 ${barrelBottom - 4} 0 ${barrelBottom - 8}V114Z`} /></clipPath>
        <filter id={`${prefix}-soft-shadow`} x="-20%" y="-8%" width="140%" height="120%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="7" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.2" />
        </filter>
      </defs>

      <g filter={`url(#${prefix}-soft-shadow)`}>
        {/* Graphite tip */}
        <path d="M35 34C38 14 43 0 50 0C58 0 63 14 66 34Z" fill={`url(#${prefix}-graphite)`} />
        {/* Exposed wood */}
        <path d="M35 34L0 110C8 105 12 110 17 110C23 110 25 105 31 105C37 105 39 110 45 110C51 110 53 105 59 105C65 105 67 110 73 110C79 110 81 105 87 105C92 105 97 107 101 113L66 34Z" fill={`url(#${prefix}-wood)`} />
        {/* Upper barrel */}
        <path d={`M0 110C0 107 3 105 6 105C10 105 12 110 17 110C23 110 25 105 31 105C37 105 39 110 45 110C51 110 53 105 59 105C65 105 67 110 73 110C79 110 81 105 87 105C93 105 101 108 101 113V${barrelBottom - 8}C101 ${barrelBottom - 4} 98 ${barrelBottom - 1} 94 ${barrelBottom - 1}H7C3 ${barrelBottom - 1} 0 ${barrelBottom - 4} 0 ${barrelBottom - 8}Z`} fill={`url(#${prefix}-barrel)`} />
        {/* Dark facet and center sheen */}
        <path d={`M0 114L14 109V${barrelBottom - 1}H0Z`} fill="#10182E" opacity="0.72" clipPath={`url(#${prefix}-upper-clip)`} />
        <rect x="42" y="107" width="31" height={barrelBottom - 107} fill={`url(#${prefix}-sheen)`} clipPath={`url(#${prefix}-upper-clip)`} />
        {/* Collar and finished base */}
        <path d={`M0 ${collarTop + 7}C0 ${collarTop + 3} 3 ${collarTop} 7 ${collarTop}H94C98 ${collarTop} 101 ${collarTop + 3} 101 ${collarTop + 7}V${totalHeight}H0Z`} fill={`url(#${prefix}-barrel)`} />
        <rect y={collarTop + 9} width="101" height="4" fill="#0C152A" opacity="0.55" />
        <rect y={totalHeight - 6} width="101" height="3" fill="#65708A" opacity="0.24" />
      </g>
    </svg>
  );
}

/** The lower pencil assembly is flipped inside the SVG, leaving the eraser head at the top. */
export function EraserIcon({ className, ...props }: DrawInstrumentIconProps) {
  const prefix = `eraser-${useId().replace(/:/g, "")}`;
  const barrelHeight = 310;
  const totalHeight = 380;

  return (
    <svg
      viewBox={`0 0 101 ${totalHeight}`}
      fill="none"
      overflow="visible"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <defs>
        <linearGradient id={`${prefix}-lower-barrel`} x1="0" y1="0" x2="101" y2={barrelHeight} gradientUnits="userSpaceOnUse">
          <stop stopColor="#222A43" />
          <stop offset="0.48" stopColor="#505C7B" />
          <stop offset="1" stopColor="#1A2238" />
        </linearGradient>
        <linearGradient id={`${prefix}-sheen`} x1="42" y1="0" x2="73" y2={barrelHeight} gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFFFF" stopOpacity="0.32" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id={`${prefix}-eraser`} x1="0" y1={barrelHeight} x2="101" y2={totalHeight} gradientUnits="userSpaceOnUse">
          <stop stopColor="#B8BBC8" />
          <stop offset="0.52" stopColor="#E5E7EE" />
          <stop offset="1" stopColor="#989CAA" />
        </linearGradient>
        <filter id={`${prefix}-soft-shadow`} x="-20%" y="-12%" width="140%" height="124%" colorInterpolationFilters="sRGB">
          <feDropShadow dx="0" dy="6" stdDeviation="5" floodColor="#0F172A" floodOpacity="0.2" />
        </filter>
      </defs>

      <g transform={`translate(101 ${totalHeight}) rotate(180)`} filter={`url(#${prefix}-soft-shadow)`}>
        {/* Lower barrel */}
        <rect width="101" height={barrelHeight} fill={`url(#${prefix}-lower-barrel)`} />
        <rect x="42" width="31" height={barrelHeight} fill={`url(#${prefix}-sheen)`} opacity="0.7" />
        <rect width="14" height={barrelHeight} fill="#0C152C" opacity="0.72" />
        {/* Eraser head */}
        <path d={`M0 ${barrelHeight}H101V314C101 348 79 ${totalHeight} 50.5 ${totalHeight}C22 ${totalHeight} 0 348 0 314Z`} fill={`url(#${prefix}-eraser)`} />
        {/* Eraser highlight */}
        <path d={`M42 ${barrelHeight + 1}H73V330C68 346 60 359 50 366C45 358 42 344 42 326Z`} fill="#FFFFFF" opacity="0.1" />
        {/* Seams and a finished collar */}
        <rect y={barrelHeight - 4} width="101" height="5" fill="#15213D" opacity="0.2" />
        <rect y="0" width="101" height="4" fill="#0C152A" opacity="0.55" />
      </g>
    </svg>
  );
}
