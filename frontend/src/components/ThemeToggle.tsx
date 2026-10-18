import { useState } from 'react';
import { applyTheme, readTheme, saveTheme, type Theme } from '../lib/theme';

const SunIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 14.3A8.2 8.2 0 0 1 9.7 4 8.2 8.2 0 1 0 20 14.3Z" />
  </svg>
);

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => readTheme());
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  const label = theme === 'dark' ? '切换到明亮模式' : '切换到暗色模式';

  return (
    <button
      type="button"
      className={`icon-btn theme-toggle ${className}`.trim()}
      aria-label={label}
      title={label}
      aria-pressed={theme === 'light'}
      onClick={() => {
        setTheme(next);
        saveTheme(next);
        applyTheme(next);
      }}
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
