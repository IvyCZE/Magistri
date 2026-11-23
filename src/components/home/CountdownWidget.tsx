import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Coffee, CheckCircle2, Timer } from 'lucide-react';
import { useDataStore } from '../../stores/dataStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { MaterialWavyProgressBar } from '../common/MaterialWavyProgressBar';
import { getAppDate, getAppLanguage } from '../../utils/dateUtils';
import { computeCountdown } from '../../domain/countdown';

export const CountdownWidget: React.FC = () => {
  const { actualTimetable, permanentTimetable } = useDataStore();
  const { countdownMode, countdownHideDecimals, setActiveScreen, t } = useSettingsStore();

  // Fast tick (100ms) only for fractional percentages so hundredths animate fluidly; otherwise 500ms
  const isDecimal =
    (countdownMode === 'lesson_percent' || countdownMode === 'day_percent') &&
    !countdownHideDecimals;

  const [now, setNow] = useState<Date>(() => getAppDate());

  useEffect(() => {
    const intervalMs = isDecimal ? 100 : 500;
    const timer = setInterval(() => {
      setNow(getAppDate());
    }, intervalMs);
    return () => clearInterval(timer);
  }, [isDecimal]);

  const countdownData = useMemo(() => {
    const result = computeCountdown({
      now,
      actual: actualTimetable,
      permanent: permanentTimetable,
      mode: countdownMode,
      hideDecimals: countdownHideDecimals,
      lang: getAppLanguage(),
    });
    return {
      state: result.state,
      label: result.labelKey === 'holiday' ? (result.holidayLabel ?? '') : t(result.labelKey),
      counterValue: result.counterValue,
      progress: result.progress,
    };
  }, [now, actualTimetable, permanentTimetable, countdownMode, countdownHideDecimals, t]);

  // Icon corresponding to current state
  const StatusIcon = () => {
    const cls = 'w-5 h-5 text-m3-primary shrink-0';
    if (countdownData.state === 'school_over') {
      return <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />;
    }
    if (countdownData.state === 'break') {
      return <Coffee className={cls} />;
    }
    if (countdownData.state === 'weekend_or_free') {
      return <Timer className={cls} />;
    }
    return <Clock className={cls} />;
  };

  const isSchoolOver =
    countdownData.state === 'school_over' ||
    countdownData.state === 'weekend_or_free';

  const isAnimated = !isSchoolOver;
  const isWavy = !isSchoolOver;

  return (
    <div
      onClick={() => setActiveScreen('timetable')}
      className="w-full py-1 px-1 flex flex-col gap-2.5 cursor-pointer select-none transition-opacity hover:opacity-85 group"
    >
      {/* Row 1: Icon + short label on left, huge bold counter on right */}
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="flex items-center gap-2 min-w-0 pb-1 sm:pb-2 md:pb-3">
          <StatusIcon />
          <span className="text-sm sm:text-base md:text-lg font-bold font-display text-m3-primary tracking-wide leading-none truncate">
            {countdownData.label}
          </span>
        </div>

        <span className="text-[3.25rem] sm:text-7xl md:text-8xl font-black font-display tracking-tight text-m3-on-surface tabular-nums shrink-0 leading-none">
          {countdownData.counterValue}
        </span>
      </div>

      {/* Row 2: Wavy progress bar */}
      <div className="w-full pt-1 sm:pt-1.5">
        <MaterialWavyProgressBar
          progress={countdownData.progress}
          height={20}
          strokeWidth={5.5}
          wavelength={30}
          amplitude={4}
          animated={isAnimated}
          wavy={isWavy}
        />
      </div>
    </div>
  );
};

export default CountdownWidget;
