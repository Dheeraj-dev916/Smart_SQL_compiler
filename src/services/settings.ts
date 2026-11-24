import { readJson, writeJson } from './storage';

export interface Settings {
  theme: 'dark' | 'light';
  fontSize: number;
  wrap: boolean;
  animate: boolean;
}
export interface Profile {
  studentName: string;
  university: string;
  department: string;
  supervisor: string;
  academicYear: string;
}

export const SETTINGS_KEY = 'ssc.settings';
export const PROFILE_KEY = 'ssc.profile';
export const DRAFT_KEY = 'ssc.draft';

export const DEFAULT_SETTINGS: Settings = { theme: 'dark', fontSize: 14, wrap: false, animate: true };
export const EMPTY_PROFILE: Profile = { studentName: '', university: '', department: '', supervisor: '', academicYear: '' };

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(SETTINGS_KEY, {}) });
export const saveSettings = (s: Settings) => writeJson(SETTINGS_KEY, s);
export const loadProfile = (): Profile => ({ ...EMPTY_PROFILE, ...readJson<Partial<Profile>>(PROFILE_KEY, {}) });
export const saveProfile = (p: Profile) => writeJson(PROFILE_KEY, p);

export function applyTheme(theme: Settings['theme']) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}
