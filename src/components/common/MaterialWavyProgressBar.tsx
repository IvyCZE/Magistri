import React, { useRef, useState, useLayoutEffect, useId } from 'react';

interface MaterialWavyProgressBarProps {
  /** Progress float from 0.0 to 1.0 (or percentage 0 to 100) */
  progress: number;
  className?: string;
  height?: number;
  strokeWidth?: number;
  wavelength?: number;
  amplitude?: number;
  animated?: boolean;
  /** Whether the active progress is rendered as a sinusoidal wave or a straight bar */
  wavy?: boolean;
  colorClassName?: string;
  trackClassName?: string;
}

/**
 * MaterialWavyProgressBar
 * Authentic Android 16 / 17 (Material Design 3 Expressive) Wavy Progress Bar.
 * Features a smooth sinusoidal wave indicator that flows along the track with GPU-accelerated motion,
 * a soft background track with rounded caps, and a clean responsive layout.
 */
export const MaterialWavyProgressBar: React.FC<MaterialWavyProgressBarProps> = ({
  progress: rawProgress,
  className = '',
  height = 18,
  strokeWidth = 5,
  wavelength = 28,
  amplitude = 3.5,
  animated = true,
  wavy = true,
  colorClassName = 'text-m3-primary',
  trackClassName = 'text-m3-surface-container-highest',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number>(300);
  const rawId = useId();
  const clipId = `m3_wavy_clip_${rawId.replace(/[:]/g, '_')}`;
  const trackClipId = `m3_wavy_track_clip_${rawId.replace(/[:]/g, '_')}`;

  // Normalize progress between 0 and 1
  const progress = Math.max(0, Math.min(1, rawProgress > 1 ? rawProgress / 100 : rawProgress));

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setWidth(w);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const midY = height / 2;
  const halfW = wavelength / 2;
  const cp1X = wavelength * 0.125;
  const cp2X = wavelength * 0.375;
  const cp3X = wavelength * 0.625;
  const cp4X = wavelength * 0.875;
  const topY = midY - amplitude;
  const botY = midY + amplitude;

  // Generate cubic bezier cycles spanning past the width to allow seamless infinite CSS translation
  const cyclesCount = Math.ceil(width / wavelength) + 4;
  let wavePath = `M 0 ${midY}`;
  for (let i = 0; i < cyclesCount; i++) {
    const startX = i * wavelength;
    wavePath += ` C ${startX + cp1X} ${topY}, ${startX + cp2X} ${topY}, ${startX + halfW} ${midY} C ${startX + cp3X} ${botY}, ${startX + cp4X} ${botY}, ${startX + wavelength} ${midY}`;
  }

  // Active width in pixels for the clip rect
  const activeWidth = width * progress;

  // Inactive track bounds (only rendered on remaining uncompleted segment)
  const gap = progress > 0 ? 4 : 0;
  const trackClipX = progress > 0 ? activeWidth + gap : 0;
  const trackStartX = progress > 0 ? activeWidth + gap + strokeWidth / 2 : strokeWidth / 2;
  const trackEndX = Math.max(strokeWidth / 2, width - strokeWidth / 2);
  const showTrack = progress < 1 && trackStartX < trackEndX;

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden select-none pointer-events-none flex items-center ${className}`}
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes m3-wavy-slide {
          0% { transform: translateX(0px); }
          100% { transform: translateX(-${wavelength}px); }
        }
      `}</style>

      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
      >
        <defs>
          {/* Progress clip rect with smooth CSS transition */}
          <clipPath id={clipId}>
            <rect
              x="0"
              y="0"
              width={activeWidth}
              height={height}
              rx={strokeWidth / 2}
              style={{ transition: 'width 0.25s cubic-bezier(0.2, 0, 0, 1)' }}
            />
          </clipPath>

          {/* Track clip rect to ensure track never extends under the active wave */}
          <clipPath id={trackClipId}>
            <rect
              x={trackClipX}
              y="0"
              width={Math.max(0, width - trackClipX)}
              height={height}
              style={{
                transition: 'x 0.25s cubic-bezier(0.2, 0, 0, 1), width 0.25s cubic-bezier(0.2, 0, 0, 1)',
              }}
            />
          </clipPath>
        </defs>

        {/* 1. Background Resting Track (Only on the remaining uncompleted segment) */}
        {showTrack && (
          <g clipPath={`url(#${trackClipId})`}>
            <line
              x1={trackStartX}
              y1={midY}
              x2={trackEndX}
              y2={midY}
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              className={`${trackClassName} opacity-60 dark:opacity-40`}
            />
          </g>
        )}

        {/* 2. Active Indicator (Clipped to active progress width) */}
        {progress > 0 && (
          <g clipPath={`url(#${clipId})`}>
            {wavy && amplitude > 0 ? (
              <g
                style={
                  animated && progress < 1
                    ? { animation: `m3-wavy-slide 1.6s linear infinite` }
                    : undefined
                }
              >
                <path
                  d={wavePath}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={colorClassName}
                />
              </g>
            ) : (
              <line
                x1={strokeWidth / 2}
                y1={midY}
                x2={Math.max(strokeWidth / 2, width - strokeWidth / 2)}
                y2={midY}
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className={colorClassName}
              />
            )}
          </g>
        )}
      </svg>
    </div>
  );
};
