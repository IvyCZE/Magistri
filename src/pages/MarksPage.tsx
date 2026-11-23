import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Pencil,
  Undo2,
  Calculator,
  User,
  Layers,
  Clock,
  RotateCcw,
  Award,
} from 'lucide-react';
import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { GradeBadge } from '../components/common/GradeBadge';
import { formatCzechDate } from '../utils/dateUtils';
import { formatClassRankText } from '../utils/textUtils';
import { groupRadius, STANDALONE_RADIUS } from '../utils/groupRadius';
import { applyOverride, canHaveMinus, isMarkEdited, markTextOfValue, predictorValue, simulateAverages } from '../domain/markSimulation';
import { newestMarksFirst } from '../domain/markOrder';
import { MarkEditMenu } from '../components/marks/MarkEditMenu';

type MarksTab = 'recent' | 'subjects' | 'predict';

export const MarksPage: React.FC = () => {
  const {
    subjectsMarks,
    getRecentMarks,
    simulations,
    addSimulatedMark,
    removeSimulatedMark,
    clearSimulations,
    markOverrides,
    setMarkOverride,
  } = useDataStore();
  const { t } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<MarksTab>('subjects');
  const [expandedSubjectId, setExpandedSubjectId] = useState<string | null>(null);
  // Hover feedback is React-managed (not CSS :hover) so the highlight can be
  // cleared on click/tap: browsers keep :hover "stuck" until the mouse moves,
  // which made the subject card stay highlighted after expanding/collapsing.
  const [hoveredSubjectId, setHoveredSubjectId] = useState<string | null>(null);

  // Predictor state
  const [selectedPredictSubjectId, setSelectedPredictSubjectId] = useState<string>(
    subjectsMarks[0]?.subjectId || 'MAT'
  );
  const [newSimGrade, setNewSimGrade] = useState<number>(1);
  const [newSimMinus, setNewSimMinus] = useState(false);
  const canSimMinus = canHaveMinus(newSimGrade);
  const newSimValue = predictorValue(newSimGrade, newSimMinus);
  const [newSimWeight, setNewSimWeight] = useState<number>(10);
  const [newSimCaption, setNewSimCaption] = useState<string>('');
  const [simFormOpen, setSimFormOpen] = useState(true);
  const [editing, setEditing] = useState<{ markId: string; anchor: DOMRect } | null>(null);

  const recentMarks = getRecentMarks(30);

  // Helper to calculate simulated average
  const getSubjectSimulationData = (subjectId: string) => {
    const subject = subjectsMarks.find((s) => s.subjectId === subjectId);
    if (!subject) return { originalAvg: 0, newAvg: 0, simCount: 0, simList: [] as typeof simulations[string] };

    const simList = simulations[subjectId] || [];
    const { originalAvg, newAvg } = simulateAverages(subject.marks, markOverrides, simList, subject.average);

    return {
      originalAvg: parseFloat(originalAvg.toFixed(2)),
      newAvg: parseFloat(newAvg.toFixed(2)),
      simCount: simList.length,
      simList,
    };
  };

  const handleAddSimulated = () => {
    addSimulatedMark(
      selectedPredictSubjectId,
      newSimValue,
      newSimWeight,
      newSimCaption || t('examDefaultCaption')
    );
  };

  const selectedPredictSubject = subjectsMarks.find(
    (s) => s.subjectId === selectedPredictSubjectId
  );
  const simData = getSubjectSimulationData(selectedPredictSubjectId);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 py-5 flex flex-col gap-5">
      {/* Page Header */}
      <div className="px-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-m3-on-surface">
          {t('marks')}
        </h1>
      </div>

      {/* Segmented Pill Tabs (Material 3 Expressive) */}
      <div className="flex items-center p-1.5 rounded-full bg-m3-surface-container gap-1 self-start max-w-full overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('subjects')}
          className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold font-display transition-all m3-pressable shrink-0 ${
            activeTab === 'subjects'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          {t('tabSubjects')}
        </button>

        <button
          onClick={() => setActiveTab('recent')}
          className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold font-display transition-all m3-pressable shrink-0 ${
            activeTab === 'recent'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          {t('tabRecent')}
        </button>

        <button
          onClick={() => setActiveTab('predict')}
          className={`px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm font-bold font-display transition-all m3-pressable shrink-0 ${
            activeTab === 'predict'
              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
              : 'text-m3-on-surface-variant hover:text-m3-on-surface'
          }`}
        >
          <span>{t('tabPredict')}</span>
        </button>
      </div>

      {/* TAB 1: SUBJECTS VIEW */}
      {activeTab === 'subjects' && (
        <div className="flex flex-col gap-1.5">
          {subjectsMarks.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-2 rounded-m3-2xl bg-m3-surface-container text-m3-on-surface-variant">
              <Award className="w-10 h-10 text-m3-on-surface-variant/40" />
              <span className="text-sm font-bold font-display text-m3-on-surface">{t('noMarksYet')}</span>
            </div>
          )}
          {subjectsMarks.map((subj, subjIndex) => {
            const isExpanded = expandedSubjectId === subj.subjectId;
            return (
              <div
                key={subj.subjectId}
                onMouseEnter={() => setHoveredSubjectId(subj.subjectId)}
                onMouseLeave={() =>
                  setHoveredSubjectId((c) => (c === subj.subjectId ? null : c))
                }
                className={`${isExpanded ? STANDALONE_RADIUS : groupRadius(subjIndex, subjectsMarks.length)} transition-all overflow-hidden shadow-xs ${
                  isExpanded || hoveredSubjectId === subj.subjectId
                    ? 'bg-m3-surface-container-high'
                    : 'bg-m3-surface-container'
                }`}
              >
                {/* Subject Summary Card Header */}
                <div
                  onClick={() => {
                    setExpandedSubjectId(isExpanded ? null : subj.subjectId);
                    // Clear the hover feedback right away: the press/click is
                    // over, so the highlight must not linger on the card.
                    setHoveredSubjectId(null);
                  }}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer m3-pressable"
                >
                  <div className="flex items-center gap-3.5 min-w-0 flex-1">
                    <div className="w-12 h-12 rounded-m3-xl bg-m3-surface-container-highest flex items-center justify-center text-sm font-black font-display text-m3-primary shrink-0">
                      {subj.subjectAbbrev}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-base sm:text-lg font-bold font-display text-m3-on-surface truncate">
                        {subj.subjectName}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-m3-on-surface-variant mt-0.5 whitespace-nowrap min-w-0">
                        <span className="truncate min-w-0">{subj.teacherName}</span>
                        <span className="shrink-0">•</span>
                        <span className="shrink-0 font-medium whitespace-nowrap">{t('marksCount', { count: subj.marks.length })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Average Value & Toggle Button */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-lg sm:text-xl font-black font-display text-m3-on-surface">
                      {subj.averageText}
                    </span>

                    <div className="w-9 h-9 rounded-full bg-m3-surface-container-high flex items-center justify-center text-m3-on-surface-variant">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5" />
                      ) : (
                        <ChevronDown className="w-5 h-5" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Details: Marks List */}
                {isExpanded && (
                  <div className="px-4 pb-4 sm:px-5 sm:pb-5 flex flex-col gap-2.5 bg-m3-surface-container-low animate-in fade-in duration-200">
                    {subj.marks.length === 0 ? (
                      <span className="text-xs text-m3-on-surface-variant py-2 italic">
                        {t('noMarksRecorded')}
                      </span>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2.5">
                        {newestMarksFirst(subj.marks).map((m, markIndex) => (
                          <div
                            key={m.id}
                            className={`p-3 ${groupRadius(markIndex, subj.marks.length, 1, 2)} bg-m3-surface-container-high flex items-center gap-3`}
                          >
                            <GradeBadge mark={m.markText} showWeight={false} size="md" />

                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <div className="flex items-center justify-between text-xs gap-2">
                                <span className="font-bold text-m3-on-surface font-display truncate">
                                  {m.caption || m.theme || t('noTestDescription')}
                                </span>
                                <span className="text-[10px] text-m3-on-surface-variant shrink-0 font-medium">
                                  {formatCzechDate(m.markDate, 'short')}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 text-[10px] text-m3-on-surface-variant/80 mt-0.5">
                                {m.weight !== undefined && (
                                  <span className="font-bold text-m3-primary">
                                    {t('markWeightLabel', { weight: m.weight })}
                                  </span>
                                )}
                                {m.weight !== undefined && m.teacherName && <span>•</span>}
                                {m.teacherName && (
                                  <span className="truncate">
                                    {m.teacherName}
                                  </span>
                                )}
                              </div>

                              {m.classRankText && (
                                <div className="text-[10px] text-m3-on-surface font-medium mt-1">
                                  {formatClassRankText(m.classRankText)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 2: RECENT CHRONOLOGICAL VIEW */}
      {activeTab === 'recent' && (
        <div className="flex flex-col gap-1.5">
          {recentMarks.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-2 rounded-m3-2xl bg-m3-surface-container text-m3-on-surface-variant">
              <Award className="w-10 h-10 text-m3-on-surface-variant/40" />
              <span className="text-sm font-bold font-display text-m3-on-surface">{t('noMarksYet')}</span>
            </div>
          )}
          {recentMarks.map((m, recentIndex) => (
            <div
              key={m.id}
              className={`p-4 ${groupRadius(recentIndex, recentMarks.length)} bg-m3-surface-container flex items-center justify-between gap-3 shadow-xs hover:bg-m3-surface-container-high transition-all`}
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <GradeBadge mark={m.markText} showWeight={false} size="lg" />

                <div className="min-w-0 flex-1 flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-extrabold font-display px-2 py-0.5 rounded-full bg-m3-primary-container text-m3-on-primary-container">
                      {m.subjectAbbrev}
                    </span>
                    <span className="text-xs font-semibold text-m3-on-surface-variant truncate">
                      {m.subjectName}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-m3-on-surface mt-1 truncate">
                    {m.caption || m.theme || t('noTestDescription')}
                  </p>

                  <div className="flex items-center gap-2.5 text-xs text-m3-on-surface-variant mt-1">
                    {m.weight !== undefined && (
                      <span className="font-bold text-m3-primary font-display">
                        {t('markWeightLabel', { weight: m.weight })}
                      </span>
                    )}
                    {m.weight !== undefined && m.teacherName && <span>•</span>}
                    {m.teacherName && (
                      <span className="flex items-center gap-1 truncate">
                        <User className="w-3 h-3" />
                        {m.teacherName}
                      </span>
                    )}
                  </div>

                  {m.classRankText && (
                    <div className="text-xs text-m3-on-surface font-medium mt-1 sm:hidden">
                      {formatClassRankText(m.classRankText)}
                    </div>
                  )}
                </div>
              </div>

              {/* Date & class rank in the Top Right of the Cell */}
              <div className="flex flex-col items-end shrink-0 self-start pt-0.5 text-right">
                <span className="text-xs text-m3-on-surface-variant font-medium">
                  {formatCzechDate(m.markDate, 'short')}
                </span>
                {m.classRankText && (
                  <span className="hidden sm:inline text-xs text-m3-on-surface font-medium mt-1 whitespace-nowrap">
                    {formatClassRankText(m.classRankText)}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: GRADE PREDICTOR ("WHAT-IF") SIMULATOR */}
      {activeTab === 'predict' && (
        <div className="flex flex-col gap-5">
          {/* Subject Selector Chips */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-m3-primary uppercase tracking-wider font-display">
              {t('selectSubjectToPredict')}
            </label>
            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
              {subjectsMarks.map((subj) => (
                <button
                  key={subj.subjectId}
                  onClick={() => {
                    setSelectedPredictSubjectId(subj.subjectId);
                    setEditing(null);
                  }}
                  className={`px-3.5 py-2 rounded-m3-xl text-xs font-bold font-display transition-all shrink-0 m3-pressable flex items-center gap-2 ${
                    selectedPredictSubjectId === subj.subjectId
                      ? 'bg-m3-primary-container text-m3-on-primary-container shadow-xs'
                      : 'bg-m3-surface-container text-m3-on-surface hover:bg-m3-surface-container-high'
                  }`}
                >
                  <span>{subj.subjectAbbrev}</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-m3-surface/40 text-[10px]">
                    {subj.averageText}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Predictor Dashboard */}
          <div className="flex flex-col gap-5">
            {/* Subject Title */}
            <div className="px-1">
              <h3 className="text-xl sm:text-2xl font-black font-display text-m3-on-surface">
                {selectedPredictSubject?.subjectName}
              </h3>
            </div>

            {/* Stats Comparison - Numbers stay centered in their columns, labels left-aligned, difference right-aligned to new average */}
            <div className="grid grid-cols-2 gap-4 w-full py-1">
              {/* Original Average Column */}
              <div className="flex justify-center">
                <div className="inline-flex flex-col items-start text-left">
                  <span className="text-xs sm:text-sm font-bold text-m3-on-surface-variant font-display tracking-wide">
                    {t('originalAverage')}
                  </span>
                  <span className="text-5xl sm:text-6xl md:text-7xl font-black font-display text-m3-on-surface tracking-tight mt-1">
                    {simData.originalAvg}
                  </span>
                </div>
              </div>

              {/* Simulated Average Column */}
              <div className="flex justify-center">
                <div className="inline-flex flex-col items-start text-left">
                  <span className="text-xs sm:text-sm font-bold text-m3-primary font-display tracking-wide">
                    {t('simulatedAverage')}
                  </span>
                  <span className="text-5xl sm:text-6xl md:text-7xl font-black font-display text-m3-primary tracking-tight mt-1">
                    {simData.newAvg}
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated mark form: connected segments, can be folded to its header */}
            <div className="flex flex-col gap-1.5">
              {/* 1. Header: Simulované známky + fold button */}
              <div
                className={`p-4 sm:px-5 sm:py-3.5 ${
                  simFormOpen ? 'rounded-t-m3-2xl rounded-b-m3-sm' : STANDALONE_RADIUS
                } bg-m3-surface-container flex items-center justify-between gap-3 shadow-xs transition-all`}
              >
                <span className="text-xs font-bold text-m3-primary uppercase tracking-wider font-display">
                  {t('simulatedMarks')}: {simData.simCount}
                </span>
                <button
                  type="button"
                  onClick={() => setSimFormOpen((open) => !open)}
                  aria-expanded={simFormOpen}
                  aria-label={simFormOpen ? t('collapseSection') : t('expandSection')}
                  title={simFormOpen ? t('collapseSection') : t('expandSection')}
                  className="w-9 h-9 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shadow-xs m3-pressable shrink-0"
                >
                  {simFormOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
              </div>

              {/* 2, 3, 4. Grid for Známka, Váha, Popis známky + Přidat */}
              {simFormOpen && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
                  {/* 2. Známka (Grade picker) with the chosen mark shown next to the label, like the weight */}
                  <div className="p-4 rounded-m3-sm sm:rounded-tl-m3-sm sm:rounded-tr-m3-sm sm:rounded-bl-m3-2xl sm:rounded-br-m3-sm bg-m3-surface-container flex flex-col gap-1.5 shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                        {t('markValue')}:
                      </label>
                      <span className="text-xs font-black font-display px-2 py-0.5 rounded-full bg-m3-primary-container text-m3-on-primary-container shadow-xs">
                        {markTextOfValue(newSimValue)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setNewSimGrade(g)}
                          aria-pressed={newSimGrade === g}
                          className={`flex-1 py-2 rounded-m3-lg font-black font-display text-sm transition-all m3-pressable ${
                            newSimGrade === g
                              ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                              : 'bg-m3-surface-container-high text-m3-on-surface hover:bg-m3-surface-container-highest'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                      <span aria-hidden="true" className="w-px self-stretch my-1 bg-m3-on-surface-variant/30 shrink-0" />
                      <button
                        type="button"
                        disabled={!canSimMinus}
                        onClick={() => setNewSimMinus((on) => !on)}
                        aria-pressed={newSimMinus && canSimMinus}
                        className={`w-10 py-2 rounded-m3-lg font-black font-display text-sm transition-all m3-pressable shrink-0 disabled:opacity-40 ${
                          newSimMinus && canSimMinus
                            ? 'bg-m3-primary text-m3-on-primary shadow-xs'
                            : 'bg-m3-surface-container-high text-m3-on-surface hover:bg-m3-surface-container-highest'
                        }`}
                      >
                        −
                      </button>
                    </div>
                  </div>

                  {/* 3. Váha (Weight slider) */}
                  <div className="p-4 rounded-m3-sm bg-m3-surface-container flex flex-col justify-between gap-1.5 shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                        {t('markWeight')}:
                      </label>
                      <span className="text-xs font-black font-display px-2 py-0.5 rounded-full bg-m3-primary-container text-m3-on-primary-container shadow-xs">
                        {newSimWeight}
                      </span>
                    </div>
                    <div className="flex items-center gap-2.5 pt-2 pb-1">
                      <span className="text-[11px] font-bold text-m3-on-surface-variant/70 font-display">1</span>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={newSimWeight}
                        onChange={(e) => setNewSimWeight(parseInt(e.target.value, 10))}
                        style={{
                          background: `linear-gradient(to right, var(--m3-primary) ${((newSimWeight - 1) / 9) * 100}%, var(--m3-surface-container-highest) ${((newSimWeight - 1) / 9) * 100}%)`,
                        }}
                        className="m3-slider flex-1"
                      />
                      <span className="text-[11px] font-bold text-m3-on-surface-variant/70 font-display">10</span>
                    </div>
                  </div>

                  {/* 4. Popis známky (Caption / Topic) with the add button next to it */}
                  <div className="p-4 rounded-t-m3-sm rounded-b-m3-2xl sm:rounded-tl-m3-sm sm:rounded-tr-m3-sm sm:rounded-bl-m3-sm sm:rounded-br-m3-2xl bg-m3-surface-container flex flex-col gap-1.5 shadow-xs">
                    <label className="text-xs font-bold text-m3-on-surface-variant font-display">
                      {t('markCaption')}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={newSimCaption}
                        onChange={(e) => setNewSimCaption(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleAddSimulated();
                        }}
                        placeholder={t('markCaptionPlaceholder')}
                        className="flex-1 min-w-0 w-0 px-3 py-2 rounded-m3-lg bg-m3-surface-container-high text-m3-on-surface text-xs font-medium focus:outline-none focus:ring-2 focus:ring-m3-primary/50"
                      />
                      <button
                        type="button"
                        onClick={handleAddSimulated}
                        className="px-3.5 py-2 rounded-m3-lg bg-m3-primary hover:bg-m3-primary/90 text-m3-on-primary font-bold text-xs font-display flex items-center gap-1.5 shadow-sm m3-pressable shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t('addGrade')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Every mark of the subject: simulated ones first, then the recorded ones */}
            {(() => {
              const realMarks = selectedPredictSubject?.marks || [];
              const total = simData.simList.length + realMarks.length;
              const hasChanges =
                simData.simList.length > 0 || realMarks.some((m) => markOverrides[m.id]);
              const roundButton =
                'w-9 h-9 rounded-full bg-m3-primary-container text-m3-on-primary-container flex items-center justify-center shadow-xs m3-pressable shrink-0';

              if (total === 0) {
                return (
                  <span className="text-xs text-m3-on-surface-variant py-2 px-1 italic">
                    {t('noMarksRecorded')}
                  </span>
                );
              }

              return (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold text-m3-on-surface font-display">
                      {t('allMarksTitle')}:
                    </span>
                    {hasChanges && (
                      <button
                        onClick={() => {
                          setEditing(null);
                          clearSimulations(selectedPredictSubjectId);
                        }}
                        className="text-xs font-bold text-rose-500 hover:underline flex items-center gap-1 m3-pressable"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t('clearSimulations')}</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {simData.simList.map((sim, index) => (
                      <div
                        key={sim.id}
                        className={`p-3 ${groupRadius(index, total, 1, 2)} bg-m3-surface-container flex items-center justify-between gap-3 shadow-xs`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <GradeBadge mark={markTextOfValue(sim.markValue)} showWeight={false} size="md" />
                          <div className="min-w-0 flex flex-col justify-center">
                            <span className="text-xs font-bold text-m3-on-surface truncate leading-snug">
                              {sim.caption}
                            </span>
                            <span className="text-[10px] text-m3-primary font-bold leading-tight -mt-0.5">
                              {t('markWeightLabel', { weight: sim.weight })}
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => removeSimulatedMark(selectedPredictSubjectId, sim.id)}
                          className={roundButton}
                          aria-label={t('deleteMark')}
                          title={t('deleteMark')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}

                    {realMarks.map((m, realIndex) => {
                      const override = markOverrides[m.id];
                      const deleted = !!override?.deleted;
                      const edited = isMarkEdited(m, override);
                      const shown = applyOverride(m, override);
                      const title = m.caption || m.theme || t('noTestDescription');
                      const openEditor = (el: HTMLElement) =>
                        setEditing({ markId: m.id, anchor: el.getBoundingClientRect() });

                      return (
                        <div
                          key={m.id}
                          className={`p-3 ${groupRadius(simData.simList.length + realIndex, total, 1, 2)} bg-m3-surface-container flex items-center justify-between gap-3 shadow-xs`}
                        >
                          <div
                            onClick={edited ? (e) => openEditor(e.currentTarget) : undefined}
                            className={`flex items-center gap-3 min-w-0 flex-1 ${edited ? 'cursor-pointer' : ''}`}
                          >
                            <GradeBadge
                              mark={shown.markText}
                              showWeight={false}
                              size="md"
                              className={deleted ? 'line-through opacity-70' : ''}
                            />
                            <div className="min-w-0 flex flex-col justify-center">
                              <span className="text-xs font-bold text-m3-on-surface truncate leading-snug">
                                <span className={deleted ? 'line-through' : ''}>{title}</span>
                                {deleted && <span> - {t('markDeletedSuffix')}</span>}
                                {edited && <span> - {t('markEditedSuffix')}</span>}
                              </span>
                              <span className="text-[10px] text-m3-on-surface-variant font-medium leading-tight flex items-center gap-1.5">
                                <span className="font-bold text-m3-primary">
                                  {t('markWeightLabel', { weight: shown.weight })}
                                </span>
                                <span>•</span>
                                <span>{formatCzechDate(m.markDate, 'short')}</span>
                              </span>
                            </div>
                          </div>

                          {deleted || edited ? (
                            <button
                              onClick={() => {
                                if (editing?.markId === m.id) setEditing(null);
                                setMarkOverride(m.id, null);
                              }}
                              className={roundButton}
                              aria-label={t('undoMarkChange')}
                              title={t('undoMarkChange')}
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={(e) => openEditor(e.currentTarget)}
                              className="w-9 h-9 rounded-full flex items-center justify-center text-m3-on-surface-variant hover:text-m3-primary transition-colors m3-pressable shrink-0"
                              aria-label={t('editMark')}
                              title={t('editMark')}
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
          {editing && (() => {
            const target = selectedPredictSubject?.marks.find((m) => m.id === editing.markId);
            if (!target) return null;
            return (
              <MarkEditMenu
                mark={target}
                override={markOverrides[target.id]}
                anchor={editing.anchor}
                onSave={(next) => {
                  setMarkOverride(target.id, next);
                  setEditing(null);
                }}
                onDelete={() => {
                  setMarkOverride(target.id, { deleted: true });
                  setEditing(null);
                }}
                onClose={() => setEditing(null)}
              />
            );
          })()}
        </div>
      )}
    </div>
  );
};
