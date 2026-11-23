import React, { useEffect, useState } from 'react';
import { animateMorph, MaterialShapes, roundedPolygonToPath } from 'material-shapes-ts';

interface MaterialMorphingLoaderProps {
  size?: number;
  className?: string;
  duration?: number;
}

const MORPH_SEQUENCE = [
  MaterialShapes.Cookie4Sided,
  MaterialShapes.Flower,
  MaterialShapes.VerySunny,
  MaterialShapes.Clover4Leaf,
  MaterialShapes.Puffy,
  MaterialShapes.SoftBurst,
];

export const MaterialMorphingLoader: React.FC<MaterialMorphingLoaderProps> = ({
  size = 20,
  className = 'h-5 w-5 text-current',
  duration = 600,
}) => {
  const [pathData, setPathData] = useState<string>(() =>
    roundedPolygonToPath(MORPH_SEQUENCE[0]).toSvgPathData()
  );

  useEffect(() => {
    let cancelled = false;
    let animHandle: { cancel: () => void } | null = null;
    let index = 0;

    const step = () => {
      if (cancelled) return;
      const nextIndex = (index + 1) % MORPH_SEQUENCE.length;
      animHandle = animateMorph(MORPH_SEQUENCE[index], MORPH_SEQUENCE[nextIndex], {
        duration,
        easing: 'emphasized',
        onFrame: (d) => {
          if (!cancelled) setPathData(d);
        },
        onComplete: () => {
          if (!cancelled) {
            index = nextIndex;
            step();
          }
        },
      });
    };

    step();

    return () => {
      cancelled = true;
      if (animHandle) animHandle.cancel();
    };
  }, [duration]);

  return (
    <svg
      viewBox="0 0 1 1"
      width={size}
      height={size}
      className={`animate-spin ${className}`}
      style={{ animationDuration: '3.5s' }}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <path d={pathData} fill="currentColor" />
    </svg>
  );
};
