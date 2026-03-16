"use client";

import { useEffect, useState } from 'react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'pb_install_prompt_dismissed';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function detectIOS() {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function detectSafari() {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  return /safari/i.test(ua) && !/crios|fxios|edgios|chrome|android/i.test(ua);
}

export default function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [isIOSPrompt, setIsIOSPrompt] = useState(false);

  useEffect(() => {
    const previouslyDismissed = localStorage.getItem(DISMISS_KEY) === '1';
    const standalone = isStandalone();
    const showIOSPrompt = detectIOS() && detectSafari() && !standalone;

    setDismissed(previouslyDismissed || standalone);
    setIsIOSPrompt(showIOSPrompt);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      if (standalone || previouslyDismissed) return;
      setInstallEvent(event as BeforeInstallPromptEvent);
      setDismissed(false);
    };

    const onInstalled = () => {
      setInstallEvent(null);
      setDismissed(true);
      localStorage.setItem(DISMISS_KEY, '1');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (dismissed || (!installEvent && !isIOSPrompt)) return null;

  async function handleInstall() {
    if (!installEvent) return;

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setDismissed(true);
      localStorage.setItem(DISMISS_KEY, '1');
    }
    setInstallEvent(null);
  }

  function closePrompt() {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, '1');
  }

  return (
    <div className="install-banner" role="status" aria-live="polite">
      <div className="install-copy">
        <div className="install-title">Install Project Board</div>
        <div className="install-text">
          {installEvent ? 'Add the app to your home screen for a full-screen mobile experience.' : 'In Safari, tap Share and choose Add to Home Screen.'}
        </div>
      </div>
      <div className="install-actions">
        {installEvent ? (
          <button type="button" className="btn-primary" onClick={handleInstall}>
            Install
          </button>
        ) : null}
        <button type="button" className="btn-secondary" onClick={closePrompt}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
