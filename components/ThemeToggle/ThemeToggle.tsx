"use client";
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'pb_theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    // initialize theme from localStorage or prefers-color-scheme
    const saved = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } else {
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      const initial = prefersLight ? 'light' : 'dark';
      setTheme(initial);
      document.documentElement.setAttribute('data-theme', initial);
    }
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button aria-label="Toggle theme" title="Toggle theme" onClick={toggle} className="btn-icon" style={{padding:6}}>
      {theme === 'dark' ? '🌞' : '🌙'}
    </button>
  );
}
