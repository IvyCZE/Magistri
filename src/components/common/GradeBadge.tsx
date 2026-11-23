import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

interface GradeBadgeProps {
  mark: string;
  weight?: number;
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showWeight?: boolean;
  className?: string;
}

export const GradeBadge: React.FC<GradeBadgeProps> = ({
  mark,
  weight,
  size = 'md',
  showWeight = true,
  className = '',
}) => {
  const { t } = useSettingsStore();

  // Determine color scheme based on grade value
  const cleanMark = mark.trim();
  const firstChar = cleanMark.charAt(0);
  
  let bgClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  let badgeColor = 'bg-emerald-500 text-white';

  if (firstChar === '1') {
    bgClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    badgeColor = 'bg-emerald-600 dark:bg-emerald-500 text-white';
  } else if (firstChar === '2') {
    bgClass = 'bg-sky-500/15 text-sky-600 dark:text-sky-400';
    badgeColor = 'bg-sky-600 dark:bg-sky-500 text-white';
  } else if (firstChar === '3') {
    bgClass = 'bg-amber-500/15 text-amber-600 dark:text-amber-400';
    badgeColor = 'bg-amber-600 dark:bg-amber-500 text-white';
  } else if (firstChar === '4') {
    bgClass = 'bg-orange-500/15 text-orange-600 dark:text-orange-400';
    badgeColor = 'bg-orange-600 dark:bg-orange-500 text-white';
  } else if (firstChar === '5') {
    bgClass = 'bg-rose-500/15 text-rose-600 dark:text-rose-400';
    badgeColor = 'bg-rose-600 dark:bg-rose-500 text-white';
  } else {
    bgClass = 'bg-m3-surface-container-high text-m3-on-surface';
    badgeColor = 'bg-m3-primary text-m3-on-primary';
  }

  const sizeClasses = {
    sm: 'w-8 h-8 text-sm font-bold rounded-full',
    md: 'w-11 h-11 text-base font-extrabold rounded-full',
    lg: 'w-14 h-14 text-xl font-black rounded-full',
    hero: 'w-20 h-20 text-3xl font-black rounded-full',
  };

  return (
    <div className={`relative inline-flex items-center justify-center shrink-0 leading-none ${bgClass} ${sizeClasses[size]} ${className} shadow-sm font-display`}>
      <span className="leading-none select-none flex items-center justify-center">{cleanMark}</span>
      {showWeight && weight !== undefined && (
        <span className={`absolute -bottom-1 -right-1 px-1.5 py-0.2 text-[9px] font-bold rounded-full shadow-xs ${badgeColor}`}>
          {t('weightAbbrev', { weight })}
        </span>
      )}
    </div>
  );
};
