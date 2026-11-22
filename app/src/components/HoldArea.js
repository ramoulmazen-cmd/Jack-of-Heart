import { useEffect, useRef } from 'react';
import { Platform, Pressable, View } from 'react-native';

// No panning, zooming or scrolling may start on something you're holding.
const WEB_HOLD_STYLE = { touchAction: 'none', cursor: 'pointer' };

/**
 * Something you hold: it shows while your finger is down and hides when it lifts (your role, a
 * card, the lifeline's bar, closing the room).
 *
 * In the app, React Native's Pressable does this well. In a phone browser it doesn't:
 * react-native-web ends a press when the phone fires its own long press (about half a second in,
 * the "contextmenu" event on Android), or on a text selection or a scroll, so a held card turned
 * back over almost at once. On the web the hold is tracked with the browser's own pointer events
 * instead, captured to this element: nothing but lifting the finger ends it.
 */
export function HoldArea(props) {
  return Platform.OS === 'web' ? <WebHoldArea {...props} /> : <NativeHoldArea {...props} />;
}

function NativeHoldArea({ onHoldStart, onHoldEnd, disabled = false, style, children, ...rest }) {
  return (
    <Pressable onPressIn={onHoldStart} onPressOut={onHoldEnd} disabled={disabled} style={style} {...rest}>
      {children}
    </Pressable>
  );
}

function WebHoldArea({ onHoldStart, onHoldEnd, disabled = false, style, children, ...rest }) {
  const ref = useRef(null);
  const start = useRef(onHoldStart);
  const end = useRef(onHoldEnd);
  start.current = onHoldStart;
  end.current = onHoldEnd;

  useEffect(() => {
    const el = ref.current;
    if (!el || disabled || typeof el.addEventListener !== 'function') return undefined;
    let pointer = null;
    const down = (event) => {
      if (pointer !== null) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      pointer = event.pointerId;
      try {
        el.setPointerCapture(event.pointerId); // keep this pointer even if the finger slides off
      } catch {
        // Old browsers: the hold still works while the finger stays on the element.
      }
      if (event.cancelable) event.preventDefault(); // no selection, no focus ring
      start.current?.();
    };
    const up = (event) => {
      if (pointer === null || event.pointerId !== pointer) return;
      pointer = null;
      end.current?.();
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
      if (pointer !== null) {
        pointer = null;
        end.current?.();
      }
    };
  }, [disabled]);

  return (
    <View ref={ref} style={[style, WEB_HOLD_STYLE]} aria-disabled={disabled || undefined} {...rest}>
      {children}
    </View>
  );
}
