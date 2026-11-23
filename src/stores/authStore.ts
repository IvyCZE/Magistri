import { create } from 'zustand';
import { UserProfile, SchoolInfo } from '../types/bakalari';
import { bakalariApi, normalizeSchoolUrl } from '../api/client';
import { MOCK_USER } from '../api/mockData';
import { useDataStore } from './dataStore';
import { checkInternet } from './connectionFacts';

import { isClassLikeName, getSavedStudentName } from '../utils/userUtils';
export { isClassLikeName, getSavedStudentName };

interface AuthState {
  isAuthenticated: boolean;
  isMockMode: boolean;
  isLoading: boolean;
  error: string | null;
  user: UserProfile | null;
  currentSchool: SchoolInfo | null;
  corsProxyUrl: string;
  
  setCorsProxyUrl: (url: string) => void;
  updateUserName: (name: string) => void;
  login: (schoolUrl: string, username: string, password: string, schoolName?: string) => Promise<boolean>;
  loginDemo: () => void;
  logout: () => void;
  initAuth: () => Promise<void>;
  clearError: () => void;
}

const DEFAULT_SCHOOL: SchoolInfo = {
  id: 'GYBON_HK',
  name: 'Gymnázium Boženy Němcové',
  schoolUrl: 'https://gybon.bakalari.cz',
};

const getSavedSchool = (): SchoolInfo => {
  try {
    const raw = localStorage.getItem('bakalari_school_info');
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_SCHOOL;
};

const getSavedUser = (): UserProfile | null => {
  try {
    const raw = localStorage.getItem('bakalari_user_profile');
    let user: UserProfile | null = null;
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed) {
        user = { ...parsed };
        // Recover a class code previously saved in the name field.
        if (user.name && isClassLikeName(user.name)) {
          if (!user.className || user.className === 'Třída') {
            user.className = user.name.trim();
          }
          user.name = '';
        }
        if (user.className === 'Třída') {
          user.className = '';
        }
      }
    }

    const recoveredName = getSavedStudentName();
    if (!user && (recoveredName || bakalariApi.getTokens())) {
      user = {
        id: bakalariApi.getTokens()?.userId || 'student',
        name: recoveredName,
        userType: 'student',
        className: '',
        schoolName: getSavedSchool().name || 'Škola',
        schoolUrl: bakalariApi.getTokens()?.schoolUrl || '',
      };
    } else if (user && !user.name && recoveredName) {
      user.name = recoveredName;
    }
    return user;
  } catch {}
  return null;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  isAuthenticated: Boolean(bakalariApi.getTokens() || bakalariApi.getIsMockMode()),
  isMockMode: bakalariApi.getIsMockMode(),
  isLoading: false,
  error: null,
  user: bakalariApi.getIsMockMode() ? MOCK_USER : getSavedUser(),
  currentSchool: getSavedSchool(),
  corsProxyUrl: bakalariApi.getCorsProxy(),

  setCorsProxyUrl: (url: string) => {
    bakalariApi.setCorsProxy(url);
    set({ corsProxyUrl: url });
  },

  updateUserName: (name: string) => {
    const clean = name.trim();
    if (!clean || isClassLikeName(clean)) return;
    localStorage.setItem('b_user_display_name', clean);
    const currentUser = get().user;
    if (currentUser) {
      const updated = { ...currentUser, name: clean };
      localStorage.setItem('bakalari_user_profile', JSON.stringify(updated));
      set({ user: updated });
    } else {
      const savedSchool = getSavedSchool();
      const newUser: UserProfile = {
        id: bakalariApi.getTokens()?.userId || 'student',
        name: clean,
        userType: 'student',
        className: '',
        schoolName: savedSchool.name || 'Škola',
        schoolUrl: bakalariApi.getTokens()?.schoolUrl || '',
      };
      localStorage.setItem('bakalari_user_profile', JSON.stringify(newUser));
      set({ user: newUser });
    }
  },

  loginDemo: () => {
    bakalariApi.setMockMode(true);
    const demoSchool: SchoolInfo = {
      id: 'GYBON_HK',
      name: 'Gymnázium Boženy Němcové',
      schoolUrl: 'https://gybon.bakalari.cz',
    };
    localStorage.setItem('bakalari_school_info', JSON.stringify(demoSchool));
    set({
      isAuthenticated: true,
      isMockMode: true,
      error: null,
      user: MOCK_USER,
      currentSchool: demoSchool,
    });
    // Trigger immediate store refresh
    useDataStore.getState().fetchAllData(false);
  },

  login: async (schoolUrl, username, password, schoolName) => {
    set({ isLoading: true, error: null });
    const cleanUrl = normalizeSchoolUrl(schoolUrl);

    try {
      if (username.toLowerCase() === 'demo' || username.toLowerCase() === 'student') {
        get().loginDemo();
        set({ isLoading: false });
        return true;
      }

      await bakalariApi.login(cleanUrl, username, password);
      const profile = await bakalariApi.getUserProfile();
      
      const schoolInfo: SchoolInfo = {
        id: 'REAL_' + Date.now(),
        name: schoolName || profile.schoolName || 'Moje škola',
        schoolUrl: cleanUrl,
      };
      localStorage.setItem('bakalari_school_info', JSON.stringify(schoolInfo));
      if (profile && profile.name && !isClassLikeName(profile.name)) {
        localStorage.setItem('bakalari_user_profile', JSON.stringify(profile));
        localStorage.setItem('b_user_display_name', profile.name);
      }

      // Signing in from the demo: the store still holds the demo data and its cache stamps, which
      // would show up as the real account's data and stop the metadata and permanent timetable
      // (subjects, teachers) from being downloaded. Start from an empty store instead.
      if (get().isMockMode) useDataStore.getState().clearCache();

      set({
        isAuthenticated: true,
        isMockMode: false,
        isLoading: false,
        user: profile,
        currentSchool: schoolInfo,
      });

      // Synchronize data in background with real API
      void useDataStore.getState().fetchAllData(false);
      return true;
    } catch (err: any) {
      // A JSON error from the token response would quote the tokens, so log the type only.
      console.error('Login error:', err instanceof Error ? err.name : 'unknown error');
      set({
        isLoading: false,
        error: err.message || 'Chyba při přihlašování. Zkontrolujte údaje.',
      });
      return false;
    }
  },

  logout: () => {
    bakalariApi.setTokens(null);
    bakalariApi.setMockMode(false);
    localStorage.removeItem('bakalari_tokens');
    localStorage.removeItem('b_user_id');
    localStorage.removeItem('bakalari_mock_mode');
    localStorage.removeItem('bakalari_school_info');
    localStorage.removeItem('bakalari_user_profile');
    useDataStore.getState().clearCache();
    set({
      isAuthenticated: false,
      isMockMode: false,
      user: null,
      error: null,
    });
  },


  clearError: () => set({ error: null }),

  initAuth: async () => {
    // Check if opened with ?demo=true, ?demo=1, or #demo (link from separate landing page)
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const isDemoRequested =
      urlParams?.get('demo') === 'true' ||
      urlParams?.get('demo') === '1' ||
      (typeof window !== 'undefined' && window.location.hash === '#demo');

    if (isDemoRequested) {
      get().loginDemo();
      return;
    }

    const tokens = bakalariApi.getTokens();
    const isMock = bakalariApi.getIsMockMode();
    const savedSchool = getSavedSchool();

    if (tokens && !isMock && tokens.accessToken === 'mock-access-token-demo') {
      // Broken state from an old bug: fake tokens stored as a "real" login.
      // Clear them and require a fresh login.
      bakalariApi.clearStaleAuth();
      localStorage.removeItem('bakalari_user_profile');
      set({
        isAuthenticated: false,
        isMockMode: false,
        user: null,
        currentSchool: savedSchool,
      });
      return;
    }

    if (tokens && !isMock) {
      const cachedUser = getSavedUser();
      if (cachedUser) {
        set({
          isAuthenticated: true,
          isMockMode: false,
          user: cachedUser,
          currentSchool: savedSchool,
        });
      }

      try {
        const profile = await bakalariApi.getUserProfile();
        // Only overwrite cached profile if profile.name is clean and not a class code
        if (profile && (!profile.name || !isClassLikeName(profile.name))) {
          if (!profile.name && cachedUser?.name) {
            profile.name = cachedUser.name;
          }
          localStorage.setItem('bakalari_user_profile', JSON.stringify(profile));
          if (profile.name) {
            localStorage.setItem('b_user_display_name', profile.name);
          }
          set({
            isAuthenticated: true,
            isMockMode: false,
            user: profile,
            currentSchool: savedSchool,
          });
        }
      } catch (err) {
        console.warn('Init auth getUserProfile error:', err);
        if (!get().user && cachedUser) {
          set({
            isAuthenticated: true,
            isMockMode: false,
            user: cachedUser,
            currentSchool: savedSchool,
          });
        }
        // A refused sign-in and a missing connection have their own status; only a real outage is flagged here.
        if (!bakalariApi.isSessionExpired() && (await checkInternet())) {
          useDataStore.getState().setServerDown(true, 'Bakaláři mají výpadek serveru.');
        }
      }
    } else if (isMock) {
      set({
        isAuthenticated: true,
        isMockMode: true,
        user: MOCK_USER,
        currentSchool: savedSchool,
      });
    } else {
      // Unauthenticated user: direct to login screen
      set({
        isAuthenticated: false,
        isMockMode: false,
        user: null,
        currentSchool: savedSchool,
      });
    }
  },
}));
