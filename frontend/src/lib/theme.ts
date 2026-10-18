export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'fitlog.theme';

export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f6ee' : '#0c0d0b');
}

export function saveTheme(theme: Theme) {
  window.localStorage.setItem(STORAGE_KEY, theme);
}
