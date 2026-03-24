import { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function usePWA() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [swReg, setSwReg] = useState<ServiceWorkerRegistration | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Enregistrement du Service Worker
    let cleanupSW: (() => void) | undefined;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        setSwReg(reg);

        if (reg.waiting) {
          setIsUpdating(true);
        }

        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              setIsUpdating(true);
            }
          });
        });
      }).catch(console.error);

      const onControllerChange = () => {
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      cleanupSW = () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      };
    }

    // Détecter si déjà installé
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Capturer le prompt d'installation
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => setIsInstalled(true);

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onAppInstalled);
      cleanupSW?.();
    };
  }, []);

  useEffect(() => {
    if (!swReg || !isUpdating) return;
    const waiting = swReg.waiting;
    if (!waiting) return;
    waiting.postMessage({ type: 'SKIP_WAITING' });
  }, [swReg, isUpdating]);

  const install = async () => {
    if (!installPrompt) return;
    setIsInstalling(true);
    try {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === 'accepted') setIsInstalled(true);
    } finally {
      setIsInstalling(false);
      setInstallPrompt(null);
    }
  };

  return { canInstall: !!installPrompt && !isInstalled, isInstalled, isInstalling, install };
}
