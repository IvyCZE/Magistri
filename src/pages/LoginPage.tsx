import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useBackDismiss } from '../native/backDismiss';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Globe,
  Info,
  Loader2,
  Lock,
  MapPin,
  MessageSquarePlus,
  School,
  Search,
  User,
  X,
} from 'lucide-react';
import Matter from 'matter-js';
import { MaterialShapes, roundedPolygonToPath } from 'material-shapes-ts';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { bakalariApi, DEFAULT_MUNICIPALITIES, normalizeSchoolUrl } from '../api/client';
import type { Municipality, SchoolInfo } from '../types/bakalari';
import { FEEDBACK_FORM_URL, PRIVACY_POLICY_URL } from '../config/links';
import { MaterialMorphingLoader } from '../components/common/MaterialMorphingLoader';
import { LoginOptionsMenu } from '../components/login/LoginOptionsMenu';
import { clearLoginDraft } from '../utils/loginDraft';
import { APP_NAME } from '../config/app';
import { AppLogo } from '../components/common/AppLogo';
import { TestNotice } from '../components/common/TestNotice';
import { dismissTestNotice, useTestNoticeDismissed } from '../utils/testNotice';

const MAX_PHYSICS_ONES = 96;

const normalizeSearch = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('cs-CZ')
    .trim();

const formatSchoolDisplayName = (school: SchoolInfo): string => {
  const url = (school.schoolUrl || '').toLowerCase();
  const name = school.name || '';
  if (url.includes('7zskladno') && !name.includes('7.')) {
    return `${name} (7. ZŠ)`;
  }
  if (url.includes('10zskladno') && !name.includes('10.')) {
    return `${name} (10. ZŠ)`;
  }
  if (url.includes('6zskladno') && !name.includes('6.')) {
    return `${name} (6. ZŠ)`;
  }
  return name;
};

// --- PHYSICS ANIMATION COMPONENT (SCREEN 1) ---
const FallingOnes: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<SVGSVGElement[]>([]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let stopSimulation = () => {};
    let resizeTimer = 0;
    let fontLoadTimer = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    let hasStarted = false;
    let isDisposed = false;

    const setup = () => {
      stopSimulation();

      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width < 1 || height < 1) return;

      lastWidth = width;
      lastHeight = height;

      const elements = elementsRef.current;
      elements.forEach((element) => {
        element.style.display = 'none';
        element.style.opacity = '0';
        element.style.transform = 'translate3d(0, -120px, 0)';
        element.style.transformOrigin = 'center';
      });

      const fontSize = Math.max(148, Math.min(240, width * 0.17));
      const font = `900 ${fontSize}px "Roboto Slab", Rockwell, "Noto Serif", serif`;
      const measurementContext = document.createElement('canvas').getContext('2d');
      if (measurementContext) measurementContext.font = font;
      const glyphMetrics = measurementContext?.measureText('1');
      const glyphLeft = glyphMetrics?.actualBoundingBoxLeft ?? 0;
      const glyphRight = glyphMetrics?.actualBoundingBoxRight ?? fontSize * 0.56;
      const glyphAscent = glyphMetrics?.actualBoundingBoxAscent ?? fontSize * 0.76;
      const glyphDescent = glyphMetrics?.actualBoundingBoxDescent ?? fontSize * 0.04;
      const glyphPadding = Math.max(1, fontSize * 0.012);
      const bodyWidth = Math.ceil(glyphLeft + glyphRight + glyphPadding * 2);
      const bodyHeight = Math.ceil(glyphAscent + glyphDescent + glyphPadding * 2);
      const countLimit = width < 600 ? 58 : MAX_PHYSICS_ONES;
      const count = Math.min(
        countLimit,
        Math.max(20, Math.ceil((width * height * 0.95) / (bodyWidth * bodyHeight))),
      );
      const activeElements = elements.slice(0, count);

      activeElements.forEach((element) => {
        const text = element.querySelector('text');
        element.style.display = 'block';
        element.style.width = `${bodyWidth}px`;
        element.style.height = `${bodyHeight}px`;
        element.setAttribute('viewBox', `0 0 ${bodyWidth} ${bodyHeight}`);
        if (text) {
          text.setAttribute('x', `${glyphLeft + glyphPadding}`);
          text.setAttribute('y', `${glyphAscent + glyphPadding}`);
          text.setAttribute('font-size', `${fontSize}`);
        }
      });

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const columns = Math.max(1, Math.floor(width / bodyWidth));
        activeElements.forEach((element, index) => {
          const column = index % columns;
          const row = Math.floor(index / columns);
          const x = column * (width / columns) + (width / columns - bodyWidth) / 2;
          const y = height - bodyHeight * (row + 1);
          element.style.opacity = y >= -bodyHeight ? '0.78' : '0';
          element.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${((index % 5) - 2) * 0.04}rad)`;
        });
        stopSimulation = () => {
          activeElements.forEach((element) => {
            element.style.opacity = '0';
          });
        };
        return;
      }

      const engine = Matter.Engine.create({ enableSleeping: true });
      engine.positionIterations = 12;
      engine.velocityIterations = 8;
      engine.constraintIterations = 2;
      engine.gravity.y = 1.28;
      engine.gravity.scale = 0.001;

      const wallSize = 120;
      const wallOptions: Matter.IBodyDefinition = {
        isStatic: true,
        friction: 0.8,
        restitution: 0,
      };
      const ground = Matter.Bodies.rectangle(
        width / 2,
        height + wallSize / 2,
        width + wallSize * 2,
        wallSize,
        wallOptions,
      );
      const leftWall = Matter.Bodies.rectangle(
        -wallSize / 2,
        height / 2,
        wallSize,
        height * 3,
        wallOptions,
      );
      const rightWall = Matter.Bodies.rectangle(
        width + wallSize / 2,
        height / 2,
        wallSize,
        height * 3,
        wallOptions,
      );
      Matter.Composite.add(engine.world, [ground, leftWall, rightWall]);

      const bodies: Matter.Body[] = [];
      const bodyElements: SVGSVGElement[] = [];
      const spawnTimers: number[] = [];
      const spawnDelay = Math.max(12, Math.min(24, 1800 / count));
      let animationFrameId = 0;
      let isStopped = false;
      let settledFrames = 0;
      let lastFrame = performance.now();
      const startedAt = lastFrame;

      const update = (now: number) => {
        if (isStopped) return;
        const delta = Math.min(1000 / 60, Math.max(1000 / 240, now - lastFrame));
        lastFrame = now;
        Matter.Engine.update(engine, delta);

        bodies.forEach((body, index) => {
          const element = bodyElements[index];
          if (!element) return;
          element.style.transform = `translate3d(${body.position.x - bodyWidth / 2}px, ${body.position.y - bodyHeight / 2}px, 0) rotate(${body.angle}rad)`;
          // Reveal elements only when they are close to entering the screen to avoid top overlap bugs
          if (body.position.y > -bodyHeight * 1.5) element.style.opacity = '1';
        });

        const allSpawned = bodies.length === count;
        const isSettled = allSpawned && bodies.every((body) => body.isSleeping || body.speed < 0.075);
        settledFrames = isSettled ? settledFrames + 1 : 0;
        if (settledFrames > 55 || now - startedAt > 14000) return;
        animationFrameId = requestAnimationFrame(update);
      };

      activeElements.forEach((element, index) => {
        const timer = window.setTimeout(() => {
          if (isStopped) return;
          const horizontalRange = Math.max(0, width - bodyWidth);
          const x = bodyWidth / 2 + (((index * 0.61803398875) % 1) * horizontalRange);
          const y = -bodyHeight * (1.2 + Math.random() * 1.5);
          const body = Matter.Bodies.rectangle(x, y, bodyWidth, bodyHeight, {
            angle: (Math.random() - 0.5) * 0.55,
            density: 0.0022,
            friction: 0.2,
            frictionAir: 0.004,
            frictionStatic: 0.4,
            restitution: 0.1,
            slop: 0.01,
            sleepThreshold: 75,
          });
          Matter.Body.setVelocity(body, {
            x: (Math.random() - 0.5) * 1.15,
            y: 1.2 + Math.random() * 1.8,
          });
          Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.055);
          bodies.push(body);
          bodyElements.push(element);
          Matter.Composite.add(engine.world, body);
        }, index * spawnDelay);
        spawnTimers.push(timer);
      });

      animationFrameId = requestAnimationFrame(update);

      stopSimulation = () => {
        isStopped = true;
        spawnTimers.forEach((timer) => window.clearTimeout(timer));
        cancelAnimationFrame(animationFrameId);
        Matter.Engine.clear(engine);
        activeElements.forEach((element) => {
          element.style.opacity = '0';
        });
      };
    };

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (Math.abs(width - lastWidth) < 8 && Math.abs(height - lastHeight) < 8) return;
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(setup, 160);
    });

    const start = () => {
      if (hasStarted || isDisposed) return;
      hasStarted = true;
      window.clearTimeout(fontLoadTimer);
      setup();
      resizeObserver.observe(container);
    };

    fontLoadTimer = window.setTimeout(start, 750);
    if (document.fonts) {
      document.fonts.load('900 148px "Roboto Slab"').then(start).catch(start);
    } else {
      start();
    }

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      window.clearTimeout(fontLoadTimer);
      window.clearTimeout(resizeTimer);
      stopSimulation();
    };
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {Array.from({ length: MAX_PHYSICS_ONES }).map((_, index) => (
        <svg
          key={index}
          ref={(element) => {
            if (element) elementsRef.current[index] = element;
          }}
          data-physics-one
          className="login-physics-one"
          focusable="false"
        >
          <text>1</text>
        </svg>
      ))}
    </div>
  );
};

// --- M3 SHAPES COMPONENTS ---
const LOGIN_SHAPE_PATHS = {
  Burst: roundedPolygonToPath(MaterialShapes.Burst).toSvgPathData(),
  Clover4Leaf: roundedPolygonToPath(MaterialShapes.Clover4Leaf).toSvgPathData(),
  Cookie4Sided: roundedPolygonToPath(MaterialShapes.Cookie4Sided).toSvgPathData(),
  Cookie9Sided: roundedPolygonToPath(MaterialShapes.Cookie9Sided).toSvgPathData(),
  Diamond: roundedPolygonToPath(MaterialShapes.Diamond).toSvgPathData(),
  Flower: roundedPolygonToPath(MaterialShapes.Flower).toSvgPathData(),
  Puffy: roundedPolygonToPath(MaterialShapes.Puffy).toSvgPathData(),
  SoftBoom: roundedPolygonToPath(MaterialShapes.SoftBoom).toSvgPathData(),
  SoftBurst: roundedPolygonToPath(MaterialShapes.SoftBurst).toSvgPathData(),
  Triangle: roundedPolygonToPath(MaterialShapes.Triangle).toSvgPathData(),
  VerySunny: roundedPolygonToPath(MaterialShapes.VerySunny).toSvgPathData(),
};

type LoginShapeName = keyof typeof LOGIN_SHAPE_PATHS;

interface MaterialShapeGraphicProps {
  shape: LoginShapeName;
  className: string;
  delay?: number;
  startRotation?: number;
  restRotation?: number;
  fromX?: string;
  fromY?: string;
  opacity?: number;
}

const MaterialShapeGraphic: React.FC<MaterialShapeGraphicProps> = ({
  shape,
  className,
  delay = 0,
  startRotation = -110,
  restRotation = 0,
  fromX = '0px',
  fromY = '18px',
  opacity = 1,
}) => (
  <svg
    viewBox="0 0 1 1"
    preserveAspectRatio="xMidYMid meet"
    className={`login-material-shape ${className}`}
    style={{
      '--login-shape-delay': `${delay}ms`,
      '--login-shape-start-rotation': `${startRotation}deg`,
      '--login-shape-rest-rotation': `${restRotation}deg`,
      '--login-shape-from-x': fromX,
      '--login-shape-from-y': fromY,
      '--login-shape-opacity': opacity,
    } as React.CSSProperties}
    aria-hidden="true"
    focusable="false"
  >
    <path d={LOGIN_SHAPE_PATHS[shape]} fill="currentColor" />
  </svg>
);

interface LegacyShapeProps {
  className?: string;
  delay?: string;
  opacity?: number;
  restRotation?: number;
}

const FourSidedCookie: React.FC<LegacyShapeProps> = ({ className = '', delay = '0s', opacity, restRotation }) => (
  <MaterialShapeGraphic shape="Cookie4Sided" className={className} delay={Number.parseFloat(delay) * 1000} opacity={opacity} restRotation={restRotation} />
);

const Triangle: React.FC<LegacyShapeProps> = ({ className = '', delay = '0s', opacity, restRotation }) => (
  <MaterialShapeGraphic shape="Triangle" className={className} delay={Number.parseFloat(delay) * 1000} opacity={opacity} restRotation={restRotation} />
);

const Star: React.FC<LegacyShapeProps> = ({ className = '', delay = '0s', opacity }) => (
  <MaterialShapeGraphic shape="VerySunny" className={className} delay={Number.parseFloat(delay) * 1000} opacity={opacity} />
);

const LoginVisual: React.FC<{ variant: 'school' | 'account'; collapsed?: boolean }> = ({ variant, collapsed }) => {
  const isSchool = variant === 'school';

  return (
    <div className={`login-visual-stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-m3-surface-container-low transition-all duration-300 ${collapsed ? 'collapsed' : ''}`} aria-hidden="true">
      {isSchool ? (
        <>
          {/* Shapes Background */}
          <Star className="absolute -right-12 -top-12 h-56 w-56 text-m3-tertiary-container" delay="0s" opacity={0.8} />
          <FourSidedCookie className="absolute -left-9 top-[22%] h-36 w-36 text-m3-secondary-container" delay="0.06s" opacity={0.9} restRotation={20} />
          <Triangle className="absolute bottom-[7%] right-[8%] h-28 w-28 text-m3-primary" delay="0.12s" opacity={0.2} restRotation={-35} />
          <MaterialShapeGraphic
            shape="SoftBurst"
            className="absolute -bottom-10 left-[13%] h-40 w-40 text-m3-tertiary"
            delay={165}
            startRotation={145}
            restRotation={-8}
            fromX="-18px"
            opacity={0.2}
          />
        </>
      ) : (
        <>
          {/* Different Shapes Background */}
          <MaterialShapeGraphic
            shape="Flower"
            className="absolute -left-12 -top-12 h-56 w-56 text-m3-primary-container"
            delay={0}
            startRotation={135}
            restRotation={-12}
            fromX="-22px"
            opacity={0.9}
          />
          <MaterialShapeGraphic
            shape="Clover4Leaf"
            className="absolute -right-6 top-[17%] h-36 w-36 text-m3-tertiary-container"
            delay={60}
            startRotation={-160}
            restRotation={12}
            fromX="18px"
            opacity={0.9}
          />
          <MaterialShapeGraphic
            shape="SoftBoom"
            className="absolute -bottom-12 right-[9%] h-44 w-44 text-m3-secondary"
            delay={125}
            startRotation={170}
            restRotation={-5}
            fromY="28px"
            opacity={0.2}
          />
          <MaterialShapeGraphic
            shape="Diamond"
            className="absolute bottom-[9%] left-[10%] h-28 w-28 text-m3-primary"
            delay={170}
            startRotation={-130}
            restRotation={8}
            fromX="-14px"
            opacity={0.2}
          />
          <MaterialShapeGraphic
            shape="Puffy"
            className="absolute right-[32%] top-[3%] h-24 w-24 text-m3-secondary-container"
            delay={95}
            startRotation={120}
            restRotation={-10}
          />
        </>
      )}

      <div className="login-emblem relative z-10 h-36 w-36 sm:h-40 sm:w-40">
        <MaterialShapeGraphic
          shape="Cookie9Sided"
          className="absolute inset-0 h-full w-full text-m3-primary-container drop-shadow-lg"
          delay={35}
          startRotation={isSchool ? -125 : 135}
          restRotation={isSchool ? -4 : 5}
          fromY="24px"
        />
        {isSchool ? (
          <Building2 className="login-emblem-icon absolute inset-0 m-auto h-16 w-16 text-m3-on-primary-container sm:h-18 sm:w-18" strokeWidth={2.35} />
        ) : (
          <User className="login-emblem-icon absolute inset-0 m-auto h-16 w-16 text-m3-on-primary-container sm:h-18 sm:w-18" strokeWidth={2.5} />
        )}
      </div>
    </div>
  );
};

interface TeacherDialogProps {
  onClose: () => void;
}

const TeacherDialog: React.FC<TeacherDialogProps> = ({ onClose }) => {
  const { t } = useSettingsStore();
  useBackDismiss(true, onClose);

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5" role="presentation">
      <button
        type="button"
        className="login-dialog-backdrop absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-label={t('close')}
      />
      <div
        className="login-dialog relative z-10 flex w-full max-w-sm flex-col items-center rounded-[2rem] bg-m3-surface-container-high p-6 text-center text-m3-on-surface shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="teacher-dialog-title"
        aria-describedby="teacher-dialog-description"
      >
        <button
          type="button"
          onClick={onClose}
          className="m3-pressable absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-m3-on-surface-variant hover:bg-m3-surface-container-highest"
          aria-label={t('close')}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="relative mb-5 h-20 w-20">
          <MaterialShapeGraphic
            shape="Flower"
            className="absolute inset-0 h-full w-full text-m3-tertiary-container"
            delay={0}
            startRotation={-135}
            restRotation={-6}
          />
          <Info className="login-emblem-icon absolute inset-0 m-auto h-9 w-9 text-m3-on-tertiary-container" strokeWidth={2.6} />
        </div>
        <h2 id="teacher-dialog-title" className="font-display text-2xl font-black tracking-tight">
          {t('forTeachersNotYet')}
        </h2>
        <p id="teacher-dialog-description" className="mt-3 text-sm font-medium leading-6 text-m3-on-surface-variant">
          {t('teacherNoticeDesc')}
        </p>
        <button
          type="button"
          onClick={onClose}
          autoFocus
          className="m3-pressable mt-6 min-h-12 w-full rounded-full bg-m3-primary px-6 font-display text-sm font-extrabold text-m3-on-primary shadow-m3-1"
        >
          {t('iUnderstand')}
        </button>
      </div>
    </div>
  );
};

// --- MAIN LOGIN PAGE ---
interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { login, loginDemo, isLoading, error, clearError } = useAuthStore();
  const { setActiveScreen, t } = useSettingsStore();
  const noticeDismissed = useTestNoticeDismissed();

  const [step, setStep] = useState<1 | 2 | 3>(() => {
    try {
      const saved = sessionStorage.getItem('login_draft_step');
      if (saved === '3' && sessionStorage.getItem('login_draft_school')) return 3;
    } catch {}
    return 1;
  });
  const [transitionDirection, setTransitionDirection] = useState<'forward' | 'back'>('forward');
  const [showTeacherModal, setShowTeacherModal] = useState(false);

  // State for Step 2
  const [citySearch, setCitySearch] = useState(() => {
    try { return sessionStorage.getItem('login_draft_city_search') || ''; } catch { return ''; }
  });
  const [isCityFocused, setIsCityFocused] = useState(false);
  const [selectedMunicipality, setSelectedMunicipality] = useState(() => {
    try { return sessionStorage.getItem('login_draft_municipality') || ''; } catch { return ''; }
  });
  const [cityActiveIndex, setCityActiveIndex] = useState(-1);
  const [schoolSearch, setSchoolSearch] = useState(() => {
    try { return sessionStorage.getItem('login_draft_school_search') || ''; } catch { return ''; }
  });
  const [isSchoolFocused, setIsSchoolFocused] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<SchoolInfo | null>(() => {
    try {
      const raw = sessionStorage.getItem('login_draft_school');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [schoolActiveIndex, setSchoolActiveIndex] = useState(-1);
  const [municipalities, setMunicipalities] = useState<Municipality[]>(DEFAULT_MUNICIPALITIES);
  const [schoolList, setSchoolList] = useState<SchoolInfo[]>([]);
  const [isLoadingMunicipalities, setIsLoadingMunicipalities] = useState(true);
  const [isLoadingSchools, setIsLoadingSchools] = useState(false);
  const [schoolDirectoryError, setSchoolDirectoryError] = useState('');

  // State for Step 3
  const [usernameInput, setUsernameInput] = useState(() => {
    try { return sessionStorage.getItem('login_draft_username') || ''; } catch { return ''; }
  });
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isCredsFocused, setIsCredsFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // State for Direct URL mode
  const [isDirectUrl, setIsDirectUrl] = useState(() => {
    try { return sessionStorage.getItem('login_draft_is_direct') === 'true'; } catch { return false; }
  });
  const [directUrlInput, setDirectUrlInput] = useState(() => {
    try { return sessionStorage.getItem('login_draft_direct_url') || ''; } catch { return ''; }
  });
  const [isDirectUrlFocused, setIsDirectUrlFocused] = useState(false);

  const selectionAreaRef = useRef<HTMLDivElement>(null);
  const schoolInputRef = useRef<HTMLInputElement>(null);
  const directUrlInputRef = useRef<HTMLInputElement>(null);
  const schoolRequestRef = useRef(0);

  // Auto-save form progress to sessionStorage so switching apps (e.g. password manager) never loses input
  useEffect(() => {
    try {
      sessionStorage.setItem('login_draft_step', String(step));
      sessionStorage.setItem('login_draft_username', usernameInput);
      sessionStorage.setItem('login_draft_city_search', citySearch);
      sessionStorage.setItem('login_draft_municipality', selectedMunicipality);
      sessionStorage.setItem('login_draft_school_search', schoolSearch);
      sessionStorage.setItem('login_draft_is_direct', String(isDirectUrl));
      sessionStorage.setItem('login_draft_direct_url', directUrlInput);
      if (selectedSchool) {
        sessionStorage.setItem('login_draft_school', JSON.stringify(selectedSchool));
      } else {
        sessionStorage.removeItem('login_draft_school');
      }
    } catch {}
  }, [step, usernameInput, citySearch, selectedMunicipality, schoolSearch, isDirectUrl, directUrlInput, selectedSchool]);

  useEffect(() => {
    const htmlOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    setIsLoadingMunicipalities(true);
    bakalariApi.searchMunicipalities().then((data) => {
      if (!isActive) return;
      const validMunicipalities = data.filter((municipality) => municipality.name?.trim());
      if (validMunicipalities.length > 0) setMunicipalities(validMunicipalities);
      setIsLoadingMunicipalities(false);
    });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!selectionAreaRef.current?.contains(event.target as Node)) {
        setIsCityFocused(false);
        setIsSchoolFocused(false);
      }
      if (!directUrlInputRef.current?.contains(event.target as Node)) {
        setIsDirectUrlFocused(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const step2ContainerRef = useRef<HTMLElement | null>(null);
  const formPanelRef = useRef<HTMLDivElement | null>(null);
  const step3ContainerRef = useRef<HTMLElement | null>(null);

  const scrollToContainerTop = () => {
    if (step2ContainerRef.current) {
      step2ContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (formPanelRef.current) {
      formPanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (typeof window !== 'undefined' && window.scrollY !== 0) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Keep bottom container anchored at top so "Výběr školy" and inputs stay fully visible
  useEffect(() => {
    if (isSchoolFocused || isCityFocused || isDirectUrlFocused) {
      const timer1 = setTimeout(scrollToContainerTop, 50);
      const timer2 = setTimeout(scrollToContainerTop, 220);
      return () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
      };
    }
  }, [isSchoolFocused, isCityFocused, isDirectUrlFocused]);

  // Handle mobile visualViewport resize when virtual keyboard opens or closes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportResize = () => {
      if (isSchoolFocused || isCityFocused || isDirectUrlFocused) {
        scrollToContainerTop();
      }
    };

    window.visualViewport.addEventListener('resize', handleViewportResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleViewportResize);
    };
  }, [isSchoolFocused, isCityFocused, isDirectUrlFocused]);

  useEffect(() => {
    if (isCredsFocused && step3ContainerRef.current) {
      const timer = setTimeout(() => {
        step3ContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isCredsFocused]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showTeacherModal) {
        setShowTeacherModal(false);
      } else {
        setIsCityFocused(false);
        setIsSchoolFocused(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showTeacherModal]);

  const filteredMunicipalities = useMemo(() => {
    const query = normalizeSearch(citySearch);
    return municipalities
      .filter((municipality) => !query || normalizeSearch(municipality.name).includes(query))
      .sort((a, b) => {
        const aStarts = normalizeSearch(a.name).startsWith(query);
        const bStarts = normalizeSearch(b.name).startsWith(query);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.name.localeCompare(b.name, 'cs');
      })
      .slice(0, 40);
  }, [citySearch, municipalities]);

  const filteredSchools = useMemo(() => {
    const query = normalizeSearch(schoolSearch);
    const queryCompact = query.replace(/[.\s\-_/]/g, '');
    return schoolList
      .filter((school) => {
        if (!query) return true;
        const displayName = formatSchoolDisplayName(school);
        const normName = normalizeSearch(displayName);
        const normUrl = normalizeSearch(school.schoolUrl || '');
        const compactName = normName.replace(/[.\s\-_/]/g, '');
        const compactUrl = normUrl.replace(/[.\s\-_/]/g, '');

        return (
          normName.includes(query) ||
          normUrl.includes(query) ||
          (queryCompact.length >= 1 && (compactName.includes(queryCompact) || compactUrl.includes(queryCompact)))
        );
      })
      .sort((a, b) => {
        const aName = formatSchoolDisplayName(a);
        const bName = formatSchoolDisplayName(b);
        const aStarts = normalizeSearch(aName).startsWith(query);
        const bStarts = normalizeSearch(bName).startsWith(query);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return aName.localeCompare(bName, 'cs');
      });
  }, [schoolList, schoolSearch]);

  useEffect(() => setCityActiveIndex(-1), [citySearch]);
  useEffect(() => setSchoolActiveIndex(-1), [schoolSearch]);

  const goToStep = (nextStep: 1 | 2 | 3) => {
    (document.activeElement as HTMLElement)?.blur();
    setTransitionDirection(nextStep > step ? 'forward' : 'back');
    setIsCityFocused(false);
    setIsSchoolFocused(false);
    setIsDirectUrlFocused(false);
    setIsCredsFocused(false);
    clearError();
    if (step2ContainerRef.current) {
      step2ContainerRef.current.scrollTop = 0;
    }
    if (step3ContainerRef.current) {
      step3ContainerRef.current.scrollTop = 0;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
    setStep(nextStep);
  };

  const handleDirectUrlSubmit = (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    const raw = directUrlInput.trim();
    if (!raw) return;
    const cleanUrl = normalizeSchoolUrl(raw);
    let host = '';
    try {
      host = new URL(cleanUrl).hostname;
    } catch {
      host = cleanUrl;
    }
    const school: SchoolInfo = {
      id: 'DIRECT_' + host,
      name: host || cleanUrl,
      schoolUrl: cleanUrl,
    };
    setSelectedSchool(school);
    setSchoolSearch(formatSchoolDisplayName(school));
    goToStep(3);
  };

  const switchToDirectUrl = () => {
    (document.activeElement as HTMLElement)?.blur();
    if (selectedSchool?.schoolUrl && !directUrlInput) {
      setDirectUrlInput(selectedSchool.schoolUrl);
    }
    setIsDirectUrl(true);
    setIsCityFocused(false);
    setIsSchoolFocused(false);
    setIsDirectUrlFocused(false);
    window.setTimeout(() => {
      scrollToContainerTop();
    }, 60);
  };

  const switchToSearch = () => {
    (document.activeElement as HTMLElement)?.blur();
    setIsDirectUrl(false);
    setIsDirectUrlFocused(false);
    setIsCityFocused(false);
    setIsSchoolFocused(false);
    window.setTimeout(() => {
      scrollToContainerTop();
    }, 60);
  };

  const handleCityChange = (value: string) => {
    setCitySearch(value);
    setIsCityFocused(true);
    setIsSchoolFocused(false);
    if (value !== selectedMunicipality) {
      schoolRequestRef.current += 1;
      setSelectedMunicipality('');
      setSchoolSearch('');
      setSelectedSchool(null);
      setSchoolList([]);
      setSchoolDirectoryError('');
      setIsLoadingSchools(false);
    }
  };

  const handleSelectMunicipality = async (cityName: string) => {
    const requestId = schoolRequestRef.current + 1;
    schoolRequestRef.current = requestId;
    setCitySearch(cityName);
    setIsCityFocused(false);
    setSelectedMunicipality(cityName);
    setSchoolSearch('');
    setSelectedSchool(null);
    setSchoolList([]);
    setSchoolDirectoryError('');
    setIsLoadingSchools(true);
    setIsSchoolFocused(true);
    window.setTimeout(() => {
      schoolInputRef.current?.focus({ preventScroll: true });
      scrollToContainerTop();
    }, 80);

    try {
      const schools = await bakalariApi.getSchoolsByMunicipality(cityName);
      if (schoolRequestRef.current !== requestId) return;
      setSchoolList(schools.filter((school) => school.name && school.schoolUrl));
    } catch {
      if (schoolRequestRef.current !== requestId) return;
      setSchoolList([]);
      setSchoolDirectoryError(t('schoolDirectoryError'));
    } finally {
      if (schoolRequestRef.current === requestId) setIsLoadingSchools(false);
    }
  };

  const handleSchoolChange = (value: string) => {
    setSchoolSearch(value);
    setIsSchoolFocused(true);
    setIsCityFocused(false);
    if (selectedSchool && value !== formatSchoolDisplayName(selectedSchool) && value !== selectedSchool.name) {
      setSelectedSchool(null);
    }
  };

  const handleSelectSchool = (school: SchoolInfo) => {
    setSchoolSearch(formatSchoolDisplayName(school));
    setSelectedSchool(school);
    setIsSchoolFocused(false);
  };

  const handleCityKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsCityFocused(true);
      setCityActiveIndex((index) => Math.min(index + 1, filteredMunicipalities.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCityActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && isCityFocused && filteredMunicipalities.length > 0) {
      event.preventDefault();
      void handleSelectMunicipality(filteredMunicipalities[Math.max(cityActiveIndex, 0)].name);
    }
  };

  const handleSchoolKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsSchoolFocused(true);
      setSchoolActiveIndex((index) => Math.min(index + 1, filteredSchools.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSchoolActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && isSchoolFocused && filteredSchools.length > 0) {
      event.preventDefault();
      handleSelectSchool(filteredSchools[Math.max(schoolActiveIndex, 0)]);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || isLoading || !selectedSchool) return;

    setIsSubmitting(true);
    clearError();

    try {
      const success = await login(selectedSchool.schoolUrl, usernameInput, passwordInput, selectedSchool.name);
      if (success) {
        clearLoginDraft();
        if (onSuccess) {
          onSuccess();
        } else {
          setActiveScreen('home');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="login-root fixed inset-0 z-[100] h-screen overflow-hidden bg-m3-surface text-m3-on-surface">
      <LoginOptionsMenu
        onDemo={() => {
          clearLoginDraft();
          loginDemo();
          if (onSuccess) onSuccess();
          else setActiveScreen('home');
        }}
      />

      {/* --- STEP 1 --- */}
      {step === 1 && (
        <section className={`login-step login-step-${transitionDirection} login-welcome-step flex h-full flex-col`} aria-labelledby="login-welcome-title">
          <div className="login-ones-stage relative min-h-0 flex-[1.2] overflow-hidden bg-m3-primary-container">
            <FallingOnes />
            <div className="login-ones-shade pointer-events-none absolute inset-0" />
          </div>

          <div className="login-welcome-panel relative z-10 -mt-10 flex shrink-0 flex-col items-center rounded-t-[3rem] bg-m3-surface px-5 pb-5 pt-8 shadow-[0_-12px_42px_rgba(0,0,0,0.08)] sm:px-8 sm:pt-10">
            {/* Beta test notice, floating above the panel */}
            {!noticeDismissed && (
              <TestNotice
                onDismiss={dismissTestNotice}
                className="absolute inset-x-4 bottom-full mx-auto mb-2 max-w-md bg-m3-surface shadow-m3-2 sm:inset-x-6 [&_a]:bg-m3-surface-container-high"
              />
            )}

            <div className="login-welcome-title-slot flex h-20 shrink-0 items-center justify-center">
              <div className="flex items-center gap-3 sm:gap-4">
                <AppLogo className="h-12 w-12 sm:h-14 sm:w-14" />
                <h1 id="login-welcome-title" className="font-display text-5xl font-black tracking-[-0.04em] text-m3-on-surface sm:text-6xl">
                  {APP_NAME}
                </h1>
              </div>
            </div>

            <p className="mb-5 mt-1 max-w-xs text-center text-sm font-semibold leading-snug text-m3-on-surface-variant sm:mb-6">
              {t('loginTagline')}
            </p>

            <div className="login-welcome-actions flex w-full max-w-md shrink-0 flex-col items-center gap-2.5">
              <button
                type="button"
                onClick={() => goToStep(2)}
                className="login-primary-entry m3-pressable group flex min-h-16 w-full items-center justify-between rounded-[1.75rem] bg-m3-primary px-5 font-display text-base font-black text-m3-on-primary shadow-m3-2 sm:text-lg"
              >
                <span className="flex-1 text-center">{t('loginStudentParent')}</span>
                <span className="login-entry-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-transform duration-300 group-hover:translate-x-0.5">
                  <ArrowRight className="h-5 w-5" strokeWidth={2.6} />
                </span>
              </button>

              <button
                type="button"
                onClick={() => setShowTeacherModal(true)}
                className="m3-pressable rounded-full px-4 py-2 text-sm font-bold text-m3-on-surface-variant underline decoration-2 underline-offset-4 hover:text-m3-primary"
              >
                {t('loginAsTeacher')}
              </button>
            </div>

            <p className="mt-4 max-w-md text-center text-xs font-bold leading-snug text-m3-on-surface-variant">
              <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4 hover:text-m3-primary">
                {t('privacyPolicy')}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>
            </p>
          </div>
        </section>
      )}

      {/* --- STEP 2 --- */}
      {step === 2 && (
        <section
          ref={step2ContainerRef}
          className={`login-step login-step-${transitionDirection} login-form-step flex h-full min-h-full flex-col overflow-y-auto overscroll-contain`}
          aria-labelledby="school-step-title"
        >
          {/* Top visual half */}
          <LoginVisual variant="school" collapsed={isCityFocused || isSchoolFocused || isDirectUrlFocused} />

          {/* Bottom form half */}
          <div
            ref={formPanelRef}
            className={`login-form-panel relative z-10 flex flex-1 flex-col rounded-t-[3rem] bg-m3-surface px-5 pt-5 shadow-[0_-12px_42px_rgba(0,0,0,0.08)] sm:px-8 sm:pt-6 transition-all duration-300 ${(isCityFocused || isSchoolFocused || isDirectUrlFocused) ? 'input-active mt-0 pb-44 sm:pb-24' : '-mt-10 pb-5'}`}
          >
            <div className="mx-auto flex w-full max-w-md flex-col">
              <header className="relative flex min-h-[3.75rem] shrink-0 items-start justify-center px-14 text-center">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    if (isDirectUrl) {
                      switchToSearch();
                    } else {
                      goToStep(1);
                    }
                  }}
                  className="m3-pressable absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full bg-m3-surface-container text-m3-on-surface-variant hover:bg-m3-surface-container-high hover:text-m3-on-surface"
                  aria-label={isDirectUrl ? t('searchByCity') : t('backToStart')}
                >
                  <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
                </button>
                <div>
                  <h1 id="school-step-title" className="font-display text-2xl font-black tracking-tight sm:text-[1.7rem]">
                    {isDirectUrl ? t('enterSchoolUrlTitle') : t('schoolSelection')}
                  </h1>
                  {!isDirectUrl && (
                    <p className="mt-0.5 text-xs font-semibold text-m3-on-surface-variant">
                      {t('cityFirstThenSchool')}
                    </p>
                  )}
                </div>
                <span className="absolute right-0 top-1 rounded-full bg-m3-secondary-container px-3 py-1.5 font-display text-xs font-black text-m3-on-secondary-container">
                  1 / 2
                </span>
              </header>

              {isDirectUrl ? (
                <form onSubmit={handleDirectUrlSubmit} className="mt-2 flex flex-col gap-3.5">
                  <div className="relative z-20">
                    <label htmlFor="login-direct-url" className="mb-1.5 block pl-1 text-xs font-extrabold text-m3-on-surface-variant">
                      {t('enterSchoolUrlSubtext')}
                    </label>
                    <div className={`flex min-h-14 items-center rounded-[1.15rem] bg-m3-surface-container px-4 transition-all ${isDirectUrlFocused ? 'ring-2 ring-m3-primary' : ''}`}>
                      <Globe className="mr-3 h-5 w-5 shrink-0 text-m3-primary" strokeWidth={2.4} />
                      <input
                        ref={directUrlInputRef}
                        id="login-direct-url"
                        type="url"
                        value={directUrlInput}
                        onChange={(event) => setDirectUrlInput(event.target.value)}
                        onFocus={() => setIsDirectUrlFocused(true)}
                        onBlur={() => setIsDirectUrlFocused(false)}
                        placeholder="https://skola.bakalari.cz"
                        autoComplete="url"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        className="min-w-0 flex-1 bg-transparent text-base font-bold text-m3-on-surface outline-none placeholder:font-semibold placeholder:text-m3-on-surface-variant placeholder:opacity-60"
                      />
                      {directUrlInput.trim().length > 3 && (
                        <Check className="h-5 w-5 shrink-0 text-m3-primary" strokeWidth={3} aria-hidden="true" />
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center justify-between px-1">
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={switchToSearch}
                        className="m3-pressable inline-flex items-center gap-1.5 text-xs font-bold text-m3-primary hover:underline"
                      >
                        <Search className="h-3.5 w-3.5" />
                        <span>{t('switchToSearchBtn')}</span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={!directUrlInput.trim()}
                    className="m3-pressable mt-3 flex min-h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-m3-primary px-6 font-display text-base font-black text-m3-on-primary shadow-m3-2 disabled:cursor-not-allowed disabled:bg-m3-surface-container-highest disabled:text-m3-on-surface-variant disabled:shadow-none"
                  >
                    <span>{t('continue')}</span>
                    <ArrowRight className="h-5 w-5" strokeWidth={2.6} />
                  </button>
                </form>
              ) : (
                <>
                  <div ref={selectionAreaRef} className="mt-2 flex flex-col gap-3.5">
                    {/* City Input */}
                    <div className="relative z-30">
                      <label htmlFor="login-city" className="mb-1.5 block pl-1 text-xs font-extrabold text-m3-on-surface-variant">
                        {t('city')}
                      </label>
                      <div className={`flex min-h-14 items-center rounded-[1.15rem] bg-m3-surface-container px-4 transition-shadow ${isCityFocused ? 'ring-2 ring-m3-primary' : ''}`}>
                        <MapPin className="mr-3 h-5 w-5 shrink-0 text-m3-primary" strokeWidth={2.4} />
                        <input
                          id="login-city"
                          type="search"
                          role="combobox"
                          value={citySearch}
                          onChange={(event) => handleCityChange(event.target.value)}
                          onFocus={() => {
                            setIsCityFocused(true);
                            setIsSchoolFocused(false);
                          }}
                          onKeyDown={handleCityKeyDown}
                          placeholder={t('startTypingCity')}
                          autoComplete="off"
                          spellCheck={false}
                          aria-expanded={isCityFocused}
                          aria-controls="login-city-options"
                          aria-autocomplete="list"
                          aria-activedescendant={cityActiveIndex >= 0 ? `login-city-option-${cityActiveIndex}` : undefined}
                          className="min-w-0 flex-1 bg-transparent text-base font-bold text-m3-on-surface outline-none placeholder:font-semibold placeholder:text-m3-on-surface-variant placeholder:opacity-60 [&::-webkit-search-cancel-button]:hidden"
                        />
                        {isLoadingMunicipalities ? (
                          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-m3-primary" aria-label={t('loadingCities')} />
                        ) : selectedMunicipality && citySearch === selectedMunicipality ? (
                          <Check className="h-5 w-5 shrink-0 text-m3-primary" strokeWidth={3} aria-hidden="true" />
                        ) : (
                          <Search className="h-5 w-5 shrink-0 text-m3-on-surface-variant opacity-70" aria-hidden="true" />
                        )}
                      </div>

                      {isCityFocused && (
                        <div id="login-city-options" className="login-dropdown absolute left-0 right-0 top-full mt-2 overflow-y-auto touch-pan-y overscroll-contain rounded-[1.35rem] bg-m3-surface-container-high p-1.5 shadow-2xl ring-1 ring-m3-outline-variant" role="listbox">
                          {filteredMunicipalities.length > 0 ? (
                            filteredMunicipalities.map((municipality, index) => (
                              <button
                                id={`login-city-option-${index}`}
                                key={municipality.name}
                                type="button"
                                role="option"
                                aria-selected={selectedMunicipality === municipality.name}
                                onMouseEnter={() => setCityActiveIndex(index)}
                                onClick={() => void handleSelectMunicipality(municipality.name)}
                                className={`m3-pressable flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left ${index === cityActiveIndex ? 'bg-m3-primary-container text-m3-on-primary-container' : 'text-m3-on-surface hover:bg-m3-surface-container-highest'}`}
                              >
                                <span className="truncate text-sm font-extrabold">{municipality.name}</span>
                                <span className="ml-3 shrink-0 rounded-full bg-m3-surface px-2 py-0.5 text-[10px] font-black text-m3-on-surface-variant">
                                  {municipality.schoolCount}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-4 py-5 text-center text-sm font-semibold text-m3-on-surface-variant">{t('noCityFound')}</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* School Input */}
                    <div className="relative z-20">
                      <label htmlFor="login-school" className="mb-1.5 block pl-1 text-xs font-extrabold text-m3-on-surface-variant">
                        {t('school')}
                      </label>
                      <div className={`flex min-h-14 items-center rounded-[1.15rem] bg-m3-surface-container px-4 transition-all ${isSchoolFocused ? 'ring-2 ring-m3-primary' : ''} ${!selectedMunicipality ? 'opacity-50' : ''}`}>
                        <School className="mr-3 h-5 w-5 shrink-0 text-m3-primary" strokeWidth={2.4} />
                        <input
                          ref={schoolInputRef}
                          id="login-school"
                          type="search"
                          role="combobox"
                          value={schoolSearch}
                          onChange={(event) => handleSchoolChange(event.target.value)}
                          onFocus={() => {
                            if (!selectedMunicipality) return;
                            setIsSchoolFocused(true);
                            setIsCityFocused(false);
                          }}
                          onKeyDown={handleSchoolKeyDown}
                          disabled={!selectedMunicipality}
                          placeholder={selectedMunicipality ? t('startTypingSchool') : t('selectCityFirst')}
                          autoComplete="off"
                          spellCheck={false}
                          aria-expanded={isSchoolFocused && Boolean(selectedMunicipality)}
                          aria-controls="login-school-options"
                          aria-autocomplete="list"
                          aria-activedescendant={schoolActiveIndex >= 0 ? `login-school-option-${schoolActiveIndex}` : undefined}
                          className="min-w-0 flex-1 bg-transparent text-base font-bold text-m3-on-surface outline-none placeholder:font-semibold placeholder:text-m3-on-surface-variant placeholder:opacity-60 disabled:cursor-not-allowed [&::-webkit-search-cancel-button]:hidden"
                        />
                        {isLoadingSchools ? (
                          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-m3-primary" aria-label={t('loadingSchools')} />
                        ) : selectedSchool && (schoolSearch === formatSchoolDisplayName(selectedSchool) || schoolSearch === selectedSchool.name) ? (
                          <Check className="h-5 w-5 shrink-0 text-m3-primary" strokeWidth={3} aria-hidden="true" />
                        ) : (
                          <Search className="h-5 w-5 shrink-0 text-m3-on-surface-variant opacity-70" aria-hidden="true" />
                        )}
                      </div>

                      {isSchoolFocused && selectedMunicipality && (
                        <div id="login-school-options" className="login-dropdown absolute left-0 right-0 top-full mt-2 overflow-y-auto touch-pan-y overscroll-contain rounded-[1.35rem] bg-m3-surface-container-high p-1.5 shadow-2xl ring-1 ring-m3-outline-variant" role="listbox">
                          {isLoadingSchools ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-5 text-sm font-bold text-m3-on-surface-variant">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>{t('loadingSchoolsDots')}</span>
                            </div>
                          ) : schoolDirectoryError ? (
                            <p className="px-4 py-5 text-center text-sm font-semibold text-m3-error">{schoolDirectoryError}</p>
                          ) : filteredSchools.length > 0 ? (
                            filteredSchools.map((school, index) => (
                              <button
                                id={`login-school-option-${index}`}
                                key={school.id || school.schoolUrl}
                                type="button"
                                role="option"
                                aria-selected={selectedSchool?.schoolUrl === school.schoolUrl}
                                onMouseEnter={() => setSchoolActiveIndex(index)}
                                onClick={() => handleSelectSchool(school)}
                                className={`m3-pressable flex w-full items-start gap-3 rounded-2xl px-3.5 py-2.5 text-left ${index === schoolActiveIndex ? 'bg-m3-primary-container text-m3-on-primary-container' : 'text-m3-on-surface hover:bg-m3-surface-container-highest'}`}
                              >
                                <School className="mt-0.5 h-4 w-4 shrink-0" />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-extrabold">{formatSchoolDisplayName(school)}</span>
                                  <span className="mt-0.5 block truncate text-[10px] font-semibold opacity-70">{school.schoolUrl}</span>
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="px-4 py-5 text-center text-sm font-semibold text-m3-on-surface-variant">
                              {schoolSearch ? t('noSchoolMatch') : t('noSchoolInCity')}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Option to switch to direct URL mode (replaces previously rendered raw URL) */}
                      <div className="mt-2.5 flex items-center justify-between px-1">
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={switchToDirectUrl}
                          className="m3-pressable inline-flex items-center gap-1.5 text-xs font-bold text-m3-primary hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          <span>{t('switchToDirectUrlBtn')}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => goToStep(3)}
                    disabled={!selectedSchool}
                    className="m3-pressable mt-3 flex min-h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-m3-primary px-6 font-display text-base font-black text-m3-on-primary shadow-m3-2 disabled:cursor-not-allowed disabled:bg-m3-surface-container-highest disabled:text-m3-on-surface-variant disabled:shadow-none"
                  >
                    <span>{t('continue')}</span>
                    <ArrowRight className="h-5 w-5" strokeWidth={2.6} />
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* --- STEP 3 --- */}
      {step === 3 && (
        <section
          ref={step3ContainerRef}
          className={`login-step login-step-${transitionDirection} login-form-step flex h-full min-h-full flex-col overflow-y-auto overscroll-contain`}
          aria-labelledby="credentials-step-title"
        >
          {/* Top visual half */}
          <LoginVisual variant="account" collapsed={isCredsFocused} />

          {/* Bottom form half */}
          <div className={`login-form-panel relative z-10 flex flex-1 flex-col rounded-t-[3rem] bg-m3-surface px-5 pt-5 shadow-[0_-12px_42px_rgba(0,0,0,0.08)] sm:px-8 sm:pt-6 transition-all duration-300 ${isCredsFocused ? 'input-active mt-0 pb-36 sm:pb-24' : '-mt-10 pb-5'}`}>
            <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-md flex-col" autoComplete="on">
              <header className="relative flex min-h-[3.75rem] shrink-0 items-start justify-center px-14 text-center">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    goToStep(2);
                  }}
                  className="m3-pressable absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full bg-m3-surface-container text-m3-on-surface-variant hover:bg-m3-surface-container-high hover:text-m3-on-surface"
                  aria-label={t('backToSchoolSelection')}
                >
                  <ArrowLeft className="h-5 w-5" strokeWidth={2.5} />
                </button>
                <div className="min-w-0">
                  <h1 id="credentials-step-title" className="font-display text-2xl font-black tracking-tight sm:text-[1.7rem]">
                    {t('loginStepTitle')}
                  </h1>
                  <p className="mt-0.5 max-w-52 truncate text-xs font-semibold text-m3-on-surface-variant sm:max-w-64" title={selectedSchool ? formatSchoolDisplayName(selectedSchool) : ''}>
                    {selectedSchool ? formatSchoolDisplayName(selectedSchool) : ''}
                  </p>
                </div>
                <span className="absolute right-0 top-1 rounded-full bg-m3-secondary-container px-3 py-1.5 font-display text-xs font-black text-m3-on-secondary-container">
                  2 / 2
                </span>
              </header>

              <div className="mt-2 flex flex-col gap-3.5">
                {/* Username */}
                <div className="relative">
                  <label htmlFor="login-username" className="mb-1.5 block pl-1 text-xs font-extrabold text-m3-on-surface-variant">
                    {t('username')}
                  </label>
                  <div className="flex min-h-14 items-center rounded-[1.15rem] bg-m3-surface-container px-4 transition-all focus-within:ring-2 focus-within:ring-m3-primary">
                    <User className="mr-3 h-5 w-5 shrink-0 text-m3-primary" strokeWidth={2.4} />
                    <input
                      id="login-username"
                      type="text"
                      value={usernameInput}
                      onChange={(event) => {
                        setUsernameInput(event.target.value);
                        if (error) clearError();
                      }}
                      onFocus={() => setIsCredsFocused(true)}
                      onBlur={() => setIsCredsFocused(false)}
                      placeholder={t('usernamePlaceholder')}
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent text-base font-bold text-m3-on-surface outline-none placeholder:font-semibold placeholder:text-m3-on-surface-variant placeholder:opacity-60"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="relative">
                  <label htmlFor="login-password" className="mb-1.5 block pl-1 text-xs font-extrabold text-m3-on-surface-variant">
                    {t('password')}
                  </label>
                  <div className="flex min-h-14 items-center rounded-[1.15rem] bg-m3-surface-container px-4 transition-all focus-within:ring-2 focus-within:ring-m3-primary">
                    <Lock className="mr-3 h-5 w-5 shrink-0 text-m3-primary" strokeWidth={2.4} />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={(event) => {
                        setPasswordInput(event.target.value);
                        if (error) clearError();
                      }}
                      onFocus={() => setIsCredsFocused(true)}
                      onBlur={() => setIsCredsFocused(false)}
                      placeholder={t('passwordPlaceholder')}
                      required
                      autoComplete="current-password"
                      className="min-w-0 flex-1 bg-transparent text-base font-bold text-m3-on-surface outline-none placeholder:font-semibold placeholder:text-m3-on-surface-variant placeholder:opacity-60"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setShowPassword((visible) => !visible)}
                      className="m3-pressable -mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-m3-on-surface-variant hover:bg-m3-surface-container-highest hover:text-m3-on-surface"
                      aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
              </div>

              <div className="shrink-0 pt-3" aria-live="polite">
                {error && (
                  <div className="login-error flex flex-col gap-2 rounded-[1.15rem] bg-m3-error-container p-4 text-m3-on-error-container shadow-xs" role="alert">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-m3-error" />
                      <span className="text-sm font-bold leading-5">{error}</span>
                    </div>
                    <div className="flex justify-end pt-1">
                      <a
                        href={FEEDBACK_FORM_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-black underline hover:opacity-80 transition-opacity"
                      >
                        <span>Nahlásit chybu do formuláře</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading || isSubmitting || !usernameInput.trim() || !passwordInput}
                className="m3-pressable flex min-h-14 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-m3-primary px-6 font-display text-base font-black text-m3-on-primary shadow-m3-2 disabled:cursor-not-allowed disabled:bg-m3-surface-container-highest disabled:text-m3-on-surface-variant disabled:shadow-none"
              >
                {isLoading || isSubmitting ? (
                  <>
                    <MaterialMorphingLoader size={20} className="h-5 w-5 text-m3-on-primary" />
                    <span>{t('loggingIn')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('continue')}</span>
                    <CheckCircle2 className="h-5 w-5" strokeWidth={2.5} />
                  </>
                )}
              </button>
              <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 text-center text-xs font-bold text-m3-on-surface-variant underline underline-offset-4 hover:text-m3-primary">
                {t('privacyPolicy')}
                <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </a>
            </form>
          </div>
        </section>
      )}

      {/* --- TEACHER MODAL --- */}
      {showTeacherModal && <TeacherDialog onClose={() => setShowTeacherModal(false)} />}
    </div>
  );
};
