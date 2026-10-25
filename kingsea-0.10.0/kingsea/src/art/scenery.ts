// Décor du menu : crépuscule en mer, le paquebot KingSea illuminé qui croise à l'horizon.
// Entièrement vectoriel ; « Effets réduits » supprime étoiles scintillantes et reflets animés.

const stars = Array.from({ length: 60 }, (_, i) => ({ x: (i * 0.6180339) % 1, y: ((i * 0.381966) % 1) * 0.5, r: 0.6 + ((i * 7) % 5) / 5, p: i * 1.3 }));

/** Silhouette du paquebot, longueur L (px), ligne de flottaison en (0,0), proue vers la droite. */
export function drawShip(ctx: CanvasRenderingContext2D, L: number, t: number): void {
  const u = L / 100;
  ctx.save();
  ctx.scale(u, u);
  // Coque
  ctx.fillStyle = '#0a1f3a';
  ctx.beginPath(); ctx.moveTo(-50, -10); ctx.lineTo(44, -10); ctx.quadraticCurveTo(52, -10, 54, -16); ctx.lineTo(50, 0); ctx.lineTo(-46, 0); ctx.lineTo(-50, -10); ctx.fill();
  ctx.fillStyle = '#e5b54a'; ctx.fillRect(-48, -10.5, 94, 1);
  // Ponts superposés
  const decks: Array<[number, number, number]> = [[-44, 40, -16], [-38, 32, -21], [-30, 22, -26], [-20, 10, -30]];
  for (const [x0, x1, y] of decks) { ctx.fillStyle = '#f4efe6'; ctx.fillRect(x0, y, x1 - x0, y === -16 ? 6 : 5); }
  // Cheminée KS
  ctx.fillStyle = '#0b5ea8'; ctx.beginPath(); ctx.moveTo(-14, -30); ctx.lineTo(-12, -38); ctx.lineTo(-4, -38); ctx.lineTo(-3, -30); ctx.fill();
  ctx.fillStyle = '#e5b54a'; ctx.fillRect(-13.4, -36, 9.6, 1.2);
  // Fumée légère
  ctx.fillStyle = 'rgba(220,230,240,0.18)';
  for (let i = 0; i < 4; i++) { const k = (t * 0.25 + i / 4) % 1; ctx.beginPath(); ctx.arc(-8 - k * 18, -40 - k * 10, 1.5 + k * 4, 0, Math.PI * 2); ctx.fill(); }
  // Hublots et fenêtres allumés
  for (const [x0, x1, y] of decks) for (let x = x0 + 2; x < x1 - 1; x += 2.6) {
    const on = Math.sin(x * 12.9 + y * 7.1) > -0.4;
    ctx.fillStyle = on ? (Math.sin(x * 3.3 + y) > 0.6 ? '#6ff3ff' : '#ffe29a') : 'rgba(80,100,130,0.6)';
    ctx.fillRect(x, y + 1.6, 1.3, 1.6);
  }
  for (let x = -44; x < 44; x += 3.2) { ctx.fillStyle = 'rgba(255,226,154,0.85)'; ctx.beginPath(); ctx.arc(x, -6, 0.6, 0, Math.PI * 2); ctx.fill(); }
  // Mât et guirlande lumineuse
  ctx.strokeStyle = '#c9ccd3'; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(30, -21); ctx.lineTo(30, -36); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,226,154,0.5)'; ctx.beginPath(); ctx.moveTo(-44, -16); ctx.quadraticCurveTo(-6, -40, 30, -36); ctx.quadraticCurveTo(40, -28, 46, -16); ctx.stroke();
  ctx.restore();
}

export function drawMenuBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, lowFx = false): void {
  const horizon = h * 0.58;
  // Ciel du crépuscule
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#071a36'); sky.addColorStop(0.55, '#1d2f6b'); sky.addColorStop(0.82, '#7b4d8f'); sky.addColorStop(1, '#f2a65e');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, w, horizon + 1);
  // Étoiles
  for (const s of stars) {
    const a = lowFx ? 0.6 : 0.35 + 0.35 * Math.sin(t * 1.5 + s.p);
    ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(s.x * w, s.y * horizon, s.r, 0, Math.PI * 2); ctx.fill();
  }
  // Lune
  const mx = w * 0.82, my = horizon * 0.28, mr = Math.min(w, h) * 0.05;
  const mg = ctx.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 3);
  mg.addColorStop(0, 'rgba(255,240,210,0.35)'); mg.addColorStop(1, 'rgba(255,240,210,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, mr * 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff3d6'; ctx.beginPath(); ctx.arc(mx, my, mr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(29,47,107,0.25)'; ctx.beginPath(); ctx.arc(mx + mr * 0.35, my - mr * 0.2, mr * 0.85, 0, Math.PI * 2); ctx.fill();
  // Soleil couchant sous l'horizon
  const sg = ctx.createRadialGradient(w * 0.3, horizon, 4, w * 0.3, horizon, h * 0.35);
  sg.addColorStop(0, 'rgba(255,200,120,0.55)'); sg.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, horizon - h * 0.35, w, h * 0.35);
  // Mer
  const sea = ctx.createLinearGradient(0, horizon, 0, h);
  sea.addColorStop(0, '#2c4d86'); sea.addColorStop(0.25, '#0b3d73'); sea.addColorStop(1, '#030e1e');
  ctx.fillStyle = sea; ctx.fillRect(0, horizon, w, h - horizon);
  // Reflet du soleil et de la lune sur l'eau
  for (let i = 0; i < (lowFx ? 10 : 26); i++) {
    const y = horizon + 3 + i * i * 0.55, k = i / 26;
    const sway = lowFx ? 0 : Math.sin(t * 1.4 + i * 0.9) * (6 + i);
    ctx.fillStyle = `rgba(255,200,130,${0.45 * (1 - k)})`; ctx.fillRect(w * 0.3 - (12 + i * 3) + sway, y, (24 + i * 6) * (0.6 + 0.4 * Math.sin(i * 2.1 + t)), 1.5);
    ctx.fillStyle = `rgba(255,243,214,${0.3 * (1 - k)})`; ctx.fillRect(mx - (4 + i * 1.5) - sway * 0.5, y, (8 + i * 3), 1.2);
  }
  // Paquebot qui croise lentement
  const L = Math.min(w * 0.42, h * 0.75);
  const sx = ((t * 6 + w * 0.62) % (w + L * 1.2)) - L * 0.6;
  ctx.save(); ctx.translate(sx, horizon + 2); drawShip(ctx, L, t); ctx.restore();
  // Reflet du navire
  ctx.save(); ctx.globalAlpha = 0.18; ctx.translate(sx, horizon + 4); ctx.scale(1, -0.5); drawShip(ctx, L, t); ctx.restore();
  // Vagues au premier plan
  for (let k = 0; k < 3; k++) {
    const y0 = h * (0.78 + k * 0.08);
    ctx.fillStyle = `rgba(${8 + k * 4},${50 + k * 10},${100 + k * 10},${0.55 + k * 0.15})`;
    ctx.beginPath(); ctx.moveTo(0, h);
    for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, y0 + Math.sin(x / (90 - k * 15) + t * (0.8 + k * 0.4) + k) * (6 + k * 2));
    ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    if (!lowFx) {
      ctx.strokeStyle = `rgba(160,230,255,${0.12 + k * 0.05})`; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let x = 0; x <= w + 16; x += 16) ctx.lineTo(x, y0 + Math.sin(x / (90 - k * 15) + t * (0.8 + k * 0.4) + k) * (6 + k * 2));
      ctx.stroke();
    }
  }
  // Mouettes
  if (!lowFx) {
    ctx.strokeStyle = 'rgba(20,25,45,0.7)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const gx = ((t * (18 + i * 6) + i * 300) % (w + 80)) - 40, gy = horizon * (0.35 + i * 0.12) + Math.sin(t * 0.8 + i) * 10, fl = Math.sin(t * 6 + i) * 3;
      ctx.beginPath(); ctx.moveTo(gx - 8, gy - fl); ctx.quadraticCurveTo(gx - 4, gy - 4, gx, gy); ctx.quadraticCurveTo(gx + 4, gy - 4, gx + 8, gy - fl); ctx.stroke();
    }
  }
}
