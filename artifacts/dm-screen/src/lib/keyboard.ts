import type { KeyboardEvent } from "react";

// True while an IME (CJK, etc.) composition session is active. The Enter press
// that *commits* a composition fires a keydown with `isComposing === true`
// (legacy engines report `keyCode === 229` instead); acting on that Enter would
// steal the keypress the user meant for the IME, finalizing the wrong thing.
// Gate every Enter-to-act handler on this so picking/adding only happens on a
// real Enter, not a composition-commit Enter.
export function isImeComposing(e: KeyboardEvent): boolean {
  return e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;
}
