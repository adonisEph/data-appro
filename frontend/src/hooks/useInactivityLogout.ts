import { useEffect, useRef } from 'react';

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const LAST_ACTIVITY_KEY = 'appro_last_activity';
export const SAVED_EMAIL_KEY   = 'appro_saved_email';
export const AUTO_LOGOUT_KEY   = 'appro_auto_logout';

const ACTIVITY_EVENTS = [
  'mousemove', 'mousedown', 'keydown',
  'touchstart', 'touchmove', 'scroll', 'click',
] as const;

/**
 * Déclenche onTimeout après INACTIVITY_TIMEOUT_MS d'inactivité.
 * Fonctionne sur web, PWA Android et iOS (via visibilitychange).
 */
export function useInactivityLogout(isLoggedIn: boolean, onTimeout: () => void) {
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

  useEffect(() => {
    if (!isLoggedIn) return;

    let timer: ReturnType<typeof setTimeout>;

    const stampActivity = () => {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    };

    const resetTimer = () => {
      stampActivity();
      clearTimeout(timer);
      timer = setTimeout(() => onTimeoutRef.current(), INACTIVITY_TIMEOUT_MS);
    };

    // Quand l'app repasse au premier plan (PWA / onglet redevenu visible)
    const handleVisibilityChange = () => {
      if (document.hidden) return;
      const last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || Date.now());
      if (Date.now() - last >= INACTIVITY_TIMEOUT_MS) {
        clearTimeout(timer);
        onTimeoutRef.current();
      } else {
        resetTimer();
      }
    };

    ACTIVITY_EVENTS.forEach(ev =>
      document.addEventListener(ev, resetTimer, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);

    resetTimer(); // démarre le compteur

    return () => {
      clearTimeout(timer);
      ACTIVITY_EVENTS.forEach(ev =>
        document.removeEventListener(ev, resetTimer)
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
    };
  }, [isLoggedIn]);
}
