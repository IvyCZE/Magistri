import React from 'react';

interface SubjectBadgeProps {
  abbrev?: string;
  name?: string;
  className?: string;
}

/**
 * Returns dynamic font size and tracking classes based on text length
 * to ensure abbreviations of 1 to 6+ characters fit cleanly inside the 48px box.
 */
export function getSubjectBadgeFontClass(text: string): string {
  const len = text.trim().length;
  if (len <= 2) return 'text-base font-black';
  if (len === 3) return 'text-sm font-black';
  if (len === 4) return 'text-xs font-black tracking-tight';
  if (len === 5) return 'text-[10px] font-black tracking-tighter leading-none';
  return 'text-[9px] font-extrabold tracking-tighter leading-none';
}

/**
 * Formats the badge text, falling back to uppercase slice of name if abbrev is missing.
 */
export function formatSubjectBadgeText(abbrev?: string, name?: string): string {
  if (abbrev && abbrev.trim()) return abbrev.trim();
  if (name && name.trim()) {
    const trimmed = name.trim();
    if (trimmed.length <= 5) return trimmed;
    return trimmed.slice(0, 4).toUpperCase();
  }
  return 'PŘ';
}

export const SubjectBadge: React.FC<SubjectBadgeProps> = ({ abbrev, name, className = '' }) => {
  const badgeText = formatSubjectBadgeText(abbrev, name);
  const fontClass = getSubjectBadgeFontClass(badgeText);

  return (
    <div
      className={`w-12 h-12 rounded-m3-xl bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center font-display shrink-0 shadow-2xs px-1 text-center select-none overflow-hidden ${fontClass} ${className}`}
      title={name || abbrev}
    >
      <span className="truncate max-w-full leading-none">{badgeText}</span>
    </div>
  );
};
