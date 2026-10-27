// Décor sous-marin des écrans de démarrage : lumière de surface qui ondule, rais de lumière, motifs de caustiques,
// poissons et raie manta en silhouette, méduse, fond de sable avec coraux, coquillages et un bénitier qui
// s'entrouvre sur une perle. Tout est dessiné (aucune image), allégé avec « Effets réduits ».

const FISH = Array.from({ length: 9 }, (_, i) => ({ y: 0.25 + ((i * 37) % 50) / 100, sp: 0.025 + ((i * 13) % 7) / 300, s: 0.6 + ((i * 7) % 5) / 8, off: (i * 0.137) % 1, dir: i % 3 === 0 ? -1 : 1 }));
const BUBBLES = Array.from({ length: 34 }, (_, i) => ({ x: ((i * 53) % 100) / 100, sp: 0.04 + ((i * 17) % 9) / 140, r: 1.5 + (i % 4), off: ((i * 29) % 100) / 100 }));

export function drawDeepSea(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, lowFx = false): void {
  // Profondeur : du turquoise de surface au bleu nuit
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0f6aa6'); g.addColorStop(0.3, '#0a3f73'); g.addColorStop(0.75, '#061a36'); g.addColorStop(1, '#030a18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Surface vue d'en dessous : bande lumineuse ondulante
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const sg = ctx.createLinearGradient(0, 0, 0, h * 0.14);
  sg.addColorStop(0, 'rgba(160,240,255,0.35)'); sg.addColorStop(1, 'rgba(160,240,255,0)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let x = 0; x <= w + 12; x += 12) ctx.lineTo(x, h * 0.06 + Math.sin(x / 70 + t * 1.1) * 6 + Math.sin(x / 23 - t * 1.7) * 2);
  ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
  // Rais de lumière qui oscillent
  if (!lowFx) {
    for (let i = 0; i < 6; i++) {
      const x = w * (0.05 + i * 0.18) + Math.sin(t * 0.25 + i * 1.7) * w * 0.05;
      const rg = ctx.createLinearGradient(0, 0, 0, h * 0.85);
      rg.addColorStop(0, `rgba(140,230,255,${0.09 + 0.04 * Math.sin(t * 0.7 + i)})`); rg.addColorStop(1, 'rgba(140,230,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.moveTo(x - 18, 0); ctx.lineTo(x + 26, 0); ctx.lineTo(x + 150, h * 0.85); ctx.lineTo(x - 70, h * 0.85); ctx.fill();
    }
  }
  ctx.restore();

  // Poissons en silhouette (bancs lointains) et raie manta
  ctx.save();
  for (const f of FISH) {
    const k = (f.off + t * f.sp) % 1, x = f.dir > 0 ? -60 + k * (w + 120) : w + 60 - k * (w + 120);
    const y = h * f.y + Math.sin(t * 1.3 + f.off * 10) * 8, s = f.s * Math.min(1.4, w / 600) * 10;
    ctx.fillStyle = 'rgba(4,20,40,0.55)';
    ctx.beginPath(); ctx.ellipse(x, y, s * 1.6, s * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - f.dir * s * 1.4, y); ctx.lineTo(x - f.dir * s * 2.4, y - s * 0.7); ctx.lineTo(x - f.dir * s * 2.4, y + s * 0.7); ctx.closePath(); ctx.fill();
  }
  if (!lowFx) {
    const k = (t * 0.018) % 1, mx = -200 + k * (w + 400), my = h * 0.36 + Math.sin(t * 0.4) * 20, ms = Math.min(1.3, w / 700) * 55, flap = Math.sin(t * 1.6) * 0.25;
    ctx.fillStyle = 'rgba(3,15,30,0.5)';
    ctx.beginPath(); ctx.moveTo(mx + ms * 0.9, my);
    ctx.quadraticCurveTo(mx, my - ms * (0.9 + flap), mx - ms * 0.6, my - ms * 0.15);
    ctx.lineTo(mx - ms * 1.5, my + ms * 0.05);
    ctx.lineTo(mx - ms * 0.6, my + ms * 0.15);
    ctx.quadraticCurveTo(mx, my + ms * (0.9 + flap), mx + ms * 0.9, my);
    ctx.fill();
    // Méduse lumineuse
    const jx = w * 0.82 + Math.sin(t * 0.3) * 20, jy = h * 0.55 - ((t * 12) % (h * 0.4)), jr = Math.min(28, w * 0.04);
    const pulse = 1 + Math.sin(t * 2.4) * 0.12;
    const jg = ctx.createRadialGradient(jx, jy, 2, jx, jy, jr * 2.2);
    jg.addColorStop(0, 'rgba(255,170,230,0.35)'); jg.addColorStop(1, 'rgba(255,170,230,0)');
    ctx.fillStyle = jg; ctx.beginPath(); ctx.arc(jx, jy, jr * 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,190,240,0.55)'; ctx.beginPath(); ctx.ellipse(jx, jy, jr * pulse, jr * 0.7 / pulse, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(255,190,240,0.4)'; ctx.lineWidth = 1.2;
    for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(jx + i * jr * 0.3, jy); ctx.quadraticCurveTo(jx + i * jr * 0.35 + Math.sin(t * 3 + i) * 6, jy + jr, jx + i * jr * 0.3, jy + jr * 1.8); ctx.stroke(); }
  }
  ctx.restore();

  // Fond marin : dunes de sable, coraux, algues, coquillages, bénitier et sa perle
  const fy = h * 0.86;
  ctx.fillStyle = '#0d2a3a';
  ctx.beginPath(); ctx.moveTo(0, h);
  for (let x = 0; x <= w + 20; x += 20) ctx.lineTo(x, fy + Math.sin(x / 140) * 10 + Math.sin(x / 47) * 4);
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  const sand = ctx.createLinearGradient(0, fy, 0, h);
  sand.addColorStop(0, 'rgba(201,170,110,0.35)'); sand.addColorStop(1, 'rgba(120,95,60,0.2)');
  ctx.fillStyle = sand; ctx.fill();
  const u = Math.min(1.6, Math.max(0.7, w / 600));
  // Algues qui ondulent
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = w * (0.04 + i * 0.12), base = fy + 6, hh = (40 + (i % 3) * 25) * u;
    ctx.strokeStyle = i % 2 ? 'rgba(47,174,107,0.65)' : 'rgba(31,140,110,0.6)'; ctx.lineWidth = 4 * u;
    ctx.beginPath(); ctx.moveTo(x, base);
    for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(t * 1.2 + i + k * 0.6) * (k * 2.2), base - (hh * k) / 6);
    ctx.stroke();
  }
  // Coraux branchus (rose, corail, violet)
  const coral = (x: number, s: number, c: string) => {
    ctx.strokeStyle = c; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
    const branch = (x0: number, y0: number, len: number, a: number, d: number) => {
      const x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      if (d > 0) { branch(x1, y1, len * 0.7, a - 0.45, d - 1); branch(x1, y1, len * 0.7, a + 0.4, d - 1); }
    };
    branch(x, fy + 8, 22 * s, -Math.PI / 2, 3);
  };
  coral(w * 0.16, u, 'rgba(255,111,145,0.85)');
  coral(w * 0.71, u * 0.8, 'rgba(255,150,90,0.8)');
  coral(w * 0.9, u * 0.9, 'rgba(195,139,255,0.75)');
  // Coquillages
  for (const [x, s, c] of [[0.3, 1, '#f6dfc9'], [0.58, 0.8, '#ffc6a8'], [0.95, 0.7, '#efdcae']] as const) {
    const cx = w * x, cy = fy + 14, r = 9 * s * u;
    ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(140,90,60,0.5)'; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { const a = Math.PI + (k / 5) * Math.PI; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
  }
  // Bénitier qui s'entrouvre sur une perle lumineuse
  const bx = w * 0.45, by = fy + 10, br = 22 * u, open = 0.25 + 0.2 * (0.5 + 0.5 * Math.sin(t * 0.8));
  ctx.fillStyle = '#c9b6e4';
  ctx.beginPath(); ctx.ellipse(bx, by, br, br * 0.45, 0, 0, Math.PI); ctx.fill();
  const pg = ctx.createRadialGradient(bx - br * 0.08, by - br * 0.15, 1, bx, by - br * 0.05, br * 0.32);
  pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.6, '#f4ecff'); pg.addColorStop(1, '#bfaee0');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(bx, by - br * 0.1, 1, bx, by - br * 0.1, br * 1.6);
  halo.addColorStop(0, `rgba(255,245,220,${0.25 + open * 0.4})`); halo.addColorStop(1, 'rgba(255,245,220,0)');
  ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(bx, by - br * 0.1, br * 1.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(bx, by - br * 0.12, br * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9c8f0';
  ctx.beginPath(); ctx.ellipse(bx, by - br * 0.05, br, br * 0.45, 0, Math.PI + open * 0.9, Math.PI * 2 - open * 0.9, true); ctx.fill();

  // Bulles qui remontent
  ctx.strokeStyle = 'rgba(210,248,255,0.5)'; ctx.lineWidth = 1.2;
  const n = lowFx ? 10 : BUBBLES.length;
  for (let i = 0; i < n; i++) {
    const b = BUBBLES[i], k = (b.off + t * b.sp) % 1;
    const x = w * b.x + Math.sin(t * 2 + i) * 6, y = h - k * h * 1.05;
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.stroke();
  }
  // Vignette douce
  const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.3, w / 2, h * 0.5, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}
