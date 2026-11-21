import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Transform and opacity animations run on the UI thread on phones; the web has no native driver. */
export const native = Platform.OS !== 'web';

/** True when the phone asks for less motion: effects then switch to simple fades or nothing. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => alive && setReduced(Boolean(value)))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (value) => setReduced(Boolean(value)));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return reduced;
}
