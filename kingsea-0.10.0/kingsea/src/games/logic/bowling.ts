// Bowling : feuille de match à 10 frames (règles standard, 10e frame avec bonus).

/** Score cumulé de chaque frame ; null si pas encore calculable (bonus en attente). */
export function scoreFrames(rolls: number[]): Array<number | null> {
  const out: Array<number | null> = [];
  let i = 0, total = 0;
  for (let f = 0; f < 10; f++) {
    if (i >= rolls.length) { out.push(null); continue; }
    if (rolls[i] === 10) { // strike
      if (i + 2 < rolls.length) { total += 10 + rolls[i + 1] + rolls[i + 2]; out.push(total); } else out.push(null);
      i += 1;
    } else if (i + 1 < rolls.length) {
      const two = rolls[i] + rolls[i + 1];
      if (two === 10) { if (i + 2 < rolls.length) { total += 10 + rolls[i + 2]; out.push(total); } else out.push(null); }
      else { total += two; out.push(total); }
      i += 2;
    } else { out.push(null); i += 1; }
  }
  return out;
}

/** Position dans la partie : frame (0-9), lancer dans la frame, quilles debout attendues. */
export function gameState(rolls: number[]): { frame: number; roll: number; standing: number; over: boolean } {
  let i = 0;
  for (let f = 0; f < 9; f++) {
    if (i >= rolls.length) return { frame: f, roll: 0, standing: 10, over: false };
    if (rolls[i] === 10) { i += 1; continue; }
    if (i + 1 >= rolls.length) return { frame: f, roll: 1, standing: 10 - rolls[i], over: false };
    i += 2;
  }
  // 10e frame
  const t = rolls.slice(i);
  if (t.length === 0) return { frame: 9, roll: 0, standing: 10, over: false };
  if (t.length === 1) return { frame: 9, roll: 1, standing: t[0] === 10 ? 10 : 10 - t[0], over: false };
  if (t.length === 2) {
    const bonus = t[0] === 10 || t[0] + t[1] === 10;
    if (!bonus) return { frame: 9, roll: 2, standing: 0, over: true };
    const standing = t[0] === 10 ? (t[1] === 10 ? 10 : 10 - t[1]) : 10;
    return { frame: 9, roll: 2, standing, over: false };
  }
  return { frame: 9, roll: 3, standing: 0, over: true };
}

export function totalScore(rolls: number[]): number {
  const f = scoreFrames(rolls);
  for (let k = f.length - 1; k >= 0; k--) if (f[k] !== null) return f[k]!;
  return 0;
}

/** Symboles de la feuille : X strike, / spare, - zéro. */
export function frameMarks(rolls: number[]): string[][] {
  const marks: string[][] = [];
  let i = 0;
  for (let f = 0; f < 10 && i < rolls.length; f++) {
    if (f < 9) {
      if (rolls[i] === 10) { marks.push(['', 'X']); i += 1; continue; }
      const a = rolls[i], b = rolls[i + 1];
      marks.push([a === 0 ? '-' : String(a), b === undefined ? '' : a + b === 10 ? '/' : b === 0 ? '-' : String(b)]);
      i += 2;
    } else {
      const t = rolls.slice(i, i + 3), m: string[] = [];
      t.forEach((v, k) => {
        const prev = t[k - 1];
        if (v === 10 && (k === 0 || prev === 10 || (k === 2 && t[0] + t[1] === 10 && t[0] !== 10))) m.push('X');
        else if (k > 0 && prev !== 10 && prev + v === 10 && !(k === 2 && t[0] + t[1] === 10 && t[0] !== 10)) m.push('/');
        else m.push(v === 0 ? '-' : String(v));
      });
      marks.push(m);
      i += 3;
    }
  }
  return marks;
}
