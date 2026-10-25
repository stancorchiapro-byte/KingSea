// Calcul du joystick virtuel (pur, testé dans tests/joystick.test.ts).

export interface Stick { x: number; y: number; mag: number }

/**
 * dx, dy : décalage du doigt par rapport au centre (px). radius : course maximale.
 * La zone morte évite les déplacements involontaires ; au-delà, la sortie est remise à l'échelle 0..1.
 */
export function computeStick(dx: number, dy: number, radius: number, deadzone = 0.14): Stick {
  const len = Math.hypot(dx, dy);
  if (len === 0 || radius <= 0) return { x: 0, y: 0, mag: 0 };
  const raw = Math.min(1, len / radius);
  if (raw < deadzone) return { x: 0, y: 0, mag: 0 };
  const mag = (raw - deadzone) / (1 - deadzone);
  return { x: (dx / len) * mag, y: (dy / len) * mag, mag };
}

/** Position du knob affiché (bornée au rayon). */
export function knobOffset(dx: number, dy: number, radius: number): { x: number; y: number } {
  const len = Math.hypot(dx, dy);
  if (len <= radius) return { x: dx, y: dy };
  return { x: (dx / len) * radius, y: (dy / len) * radius };
}
