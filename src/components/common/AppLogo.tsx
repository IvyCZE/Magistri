import React from 'react';
import logo from '../../config/logo.json';

interface AppLogoProps {
  className?: string;
}

/** The logo drawn in the current Material colours, so it follows the accent and the wallpaper palette. */
export const AppLogo: React.FC<AppLogoProps> = ({ className = 'h-9 w-9' }) => (
  <svg
    viewBox={`0 0 ${logo.viewBox} ${logo.viewBox}`}
    className={`shrink-0 ${className}`}
    aria-hidden="true"
    focusable="false"
  >
    <circle cx={logo.viewBox / 2} cy={logo.viewBox / 2} r={logo.circleRadius} style={{ fill: 'var(--m3-primary-container)' }} />
    <path d={logo.decorationPath} style={{ fill: 'var(--m3-primary)' }} />
    <path d={logo.glyphPath} style={{ fill: 'var(--m3-on-primary)' }} />
  </svg>
);

interface AppIconPreviewProps {
  /** `classic` is the original logo, without the coloured shape behind the letter. */
  variant: 'default' | 'classic';
  className?: string;
}

/** The launcher icon in its real colours (they do not follow the theme), cropped like an adaptive icon. */
export const AppIconPreview: React.FC<AppIconPreviewProps> = ({ variant, className = 'h-14 w-14 shrink-0 rounded-2xl' }) => {
  const pad = logo.viewBox * 0.25;
  const size = logo.viewBox + pad * 2;
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${size} ${size}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x={-pad} y={-pad} width={size} height={size} fill={logo.background} />
      {variant === 'default' && <path d={logo.decorationPath} fill={logo.decoration} />}
      <path d={logo.glyphPath} fill={logo.glyph} />
    </svg>
  );
};
