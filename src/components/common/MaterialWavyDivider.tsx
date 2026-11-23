import React from 'react';

interface MaterialWavyDividerProps {
  className?: string;
  height?: number;
  strokeWidth?: number;
  wavelength?: number;
}

/**
 * MaterialWavyDivider
 * Android / Material 3 Expressive squiggly / sinusoidal divider line.
 * Uses a seamless repeating SVG pattern with currentColor stroke.
 */
export const MaterialWavyDivider: React.FC<MaterialWavyDividerProps> = ({
  className = 'text-neutral-400 dark:text-neutral-500',
  height = 10,
  strokeWidth = 2,
  wavelength = 24,
}) => {
  const id = React.useId();
  const safeId = id.replace(/[:]/g, '_');
  const midY = height / 2;
  const halfW = wavelength / 2;
  const cp1X = wavelength * 0.125;
  const cp2X = wavelength * 0.375;
  const cp3X = wavelength * 0.625;
  const cp4X = wavelength * 0.875;
  const amp = (height - strokeWidth - 1) / 2;
  const topY = midY - amp;
  const botY = midY + amp;

  const pathData = `M 0 ${midY} C ${cp1X} ${topY}, ${cp2X} ${topY}, ${halfW} ${midY} C ${cp3X} ${botY}, ${cp4X} ${botY}, ${wavelength} ${midY}`;

  return (
    <div className={`w-full overflow-hidden flex items-center justify-center select-none pointer-events-none py-0.5 ${className}`}>
      <svg
        className={`w-full ${className}`}
        style={{ height: `${height}px` }}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern
            id={safeId}
            x="0"
            y="0"
            width={wavelength}
            height={height}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={pathData}
              fill="none"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${safeId})`} />
      </svg>
    </div>
  );
};

export default MaterialWavyDivider;
