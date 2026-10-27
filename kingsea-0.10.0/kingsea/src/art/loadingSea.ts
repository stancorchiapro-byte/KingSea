// Fond de l'écran de chargement (refonte) : vue coupée à la ligne de flottaison. Au-dessus, le paquebot KingSea
// glisse sur une mer de crépuscule (ciel dégradé, soleil couchant, étoiles, hublots allumés, fumée de cheminée) ;
// au-dessous, la coque plonge dans le bleu (rais de lumière, bulles, bancs de poissons, méduses, fond sableux).
// Les couches fixes sont pré-rendues une fois par taille d'écran ; seules les parties vivantes sont redessinées.
import { makeCanvas, type AnyCanvas } from './canvas';

let cache: { key: string; sky: AnyCanvas; deep: AnyCanvas } | null = null;
let shipCache: { w: number; c: AnyCanvas } | null = null;

/** Hauteur relative de la ligne de flottaison (0 = haut de l'écran). */
export const WATERLINE = 0.56;

function shipSprite(w: number): AnyCanvas {
  // Paquebot vu de profil, proue vers la droite : coque marine à liseré doré, quatre ponts blancs, cheminée KS
  const h = w * 0.36, c = makeCanvas(Math.ceil(w), Math.ceil(h)), g = c.ctx;
  const hullTop = h * 0.56, deck = (i: number) => hullTop - (i + 1) * h * 0.1;
  // Coque (partie émergée), étrave relevée
  g.fillStyle = '#0c1d36';
  g.beginPath(); g.moveTo(w * 0.02, hullTop); g.lineTo(w * 0.97, hullTop - h * 0.04); g.quadraticCurveTo(w * 1.0, hullTop + h * 0.1, w * 0.9, h); g.lineTo(w * 0.07, h); g.quadraticCurveTo(w * 0.02, h * 0.8, w * 0.02, hullTop); g.fill();
  const lg = g.createLinearGradient(0, hullTop, 0, h); lg.addColorStop(0, 'rgba(255,255,255,0.10)'); lg.addColorStop(1, 'rgba(0,0,0,0.2)');
  g.fillStyle = lg; g.fill();
  g.fillStyle = '#e5b54a'; g.fillRect(w * 0.03, hullTop + h * 0.035, w * 0.93, Math.max(1.5, h * 0.012));
  g.fillStyle = '#9a1b2f'; g.fillRect(w * 0.06, h * 0.93, w * 0.83, h * 0.07); // œuvres vives (antifouling)
  // Superstructures étagées
  for (let i = 0; i < 4; i++) {
    const x0 = w * (0.12 + i * 0.05), x1 = w * (0.86 - i * 0.07), y = deck(i);
    g.fillStyle = i % 2 ? '#f2eee4' : '#ffffff';
    g.beginPath(); g.moveTo(x0, y + h * 0.1); g.lineTo(x0 + h * 0.03, y); g.lineTo(x1 - h * 0.05, y); g.lineTo(x1, y + h * 0.1); g.closePath(); g.fill();
    g.fillStyle = '#c9cfd8'; g.fillRect(x0 + h * 0.02, y + h * 0.085, x1 - x0 - h * 0.04, h * 0.012);
  }
  // Passerelle et vitrage du pont supérieur
  g.fillStyle = '#123a5a'; g.fillRect(w * 0.62, deck(3) + h * 0.025, w * 0.08, h * 0.035);
  // Cheminée KS (marine, bande dorée, sommet noir)
  const fx = w * 0.42, fw = w * 0.07, fy = deck(3) - h * 0.2;
  g.fillStyle = '#0e2a4a'; g.beginPath(); g.moveTo(fx, deck(3)); g.lineTo(fx + fw * 0.1, fy); g.lineTo(fx + fw * 1.05, fy); g.lineTo(fx + fw, deck(3)); g.closePath(); g.fill();
  g.fillStyle = '#e5b54a'; g.fillRect(fx + fw * 0.06, fy + h * 0.07, fw * 0.97, h * 0.035);
  g.fillStyle = '#111'; g.fillRect(fx + fw * 0.1, fy, fw * 0.95, h * 0.03);
  g.fillStyle = '#e5b54a'; g.font = `900 ${Math.round(h * 0.07)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('KS', fx + fw * 0.55, fy + h * 0.15);
  // Mâts, câbles de pavois
  g.strokeStyle = '#d8dde4'; g.lineWidth = Math.max(1, w * 0.002);
  g.beginPath(); g.moveTo(w * 0.7, deck(3)); g.lineTo(w * 0.71, deck(3) - h * 0.2); g.moveTo(w * 0.71, deck(3) - h * 0.2); g.lineTo(w * 0.95, hullTop - h * 0.05); g.moveTo(w * 0.71, deck(3) - h * 0.2); g.lineTo(w * 0.42, fy); g.stroke();
  // Canots de sauvetage
  g.fillStyle = '#ff8a3d';
  for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(w * (0.2 + i * 0.09), deck(0) + h * 0.03, w * 0.022, h * 0.018, 0, 0, Math.PI * 2); g.fill(); }
  // Nom sur la coque
  g.fillStyle = 'rgba(229,181,74,0.9)'; g.font = `800 ${Math.round(h * 0.06)}px system-ui, sans-serif`; g.textAlign = 'left';
  g.fillText('KINGSEA', w * 0.78, hullTop + h * 0.13);
  return c.canvas;
}

function build(w: number, h: number): NonNullable<typeof cache> {
  const wl = h * WATERLINE;
  // Ciel de crépuscule : indigo → mauve → or
  const sky = makeCanvas(Math.ceil(w), Math.ceil(wl + 4)), s = sky.ctx;
  const sg = s.createLinearGradient(0, 0, 0, wl);
  sg.addColorStop(0, '#0a1430'); sg.addColorStop(0.45, '#2a2552'); sg.addColorStop(0.78, '#a1506b'); sg.addColorStop(1, '#f2a65a');
  s.fillStyle = sg; s.fillRect(0, 0, w, wl + 4);
  // Soleil couchant (à gauche) et halo
  const sx = w * 0.22, sy = wl * 0.97, sr = Math.min(w, h) * 0.09;
  const halo = s.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr * 5);
  halo.addColorStop(0, 'rgba(255,214,140,0.65)'); halo.addColorStop(1, 'rgba(255,214,140,0)');
  s.fillStyle = halo; s.fillRect(0, 0, w, wl + 4);
  s.fillStyle = '#ffd98c'; s.beginPath(); s.arc(sx, sy, sr, Math.PI, 0); s.fill();
  // Étoiles (haut du ciel)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 90; i++) { const y = rnd() * wl * 0.5; s.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6 * (1 - y / (wl * 0.5))})`; s.fillRect(rnd() * w, y, 1.2, 1.2); }
  // Nuages étirés, éclairés par en dessous
  for (let i = 0; i < 6; i++) {
    const cx = rnd() * w, cy = wl * (0.35 + rnd() * 0.4), cw = w * (0.15 + rnd() * 0.2);
    const cg = s.createLinearGradient(0, cy - 6, 0, cy + 6); cg.addColorStop(0, 'rgba(70,50,90,0.0)'); cg.addColorStop(1, 'rgba(255,170,120,0.35)');
    s.fillStyle = cg; s.beginPath(); s.ellipse(cx, cy, cw, Math.max(3, h * 0.008), 0, 0, Math.PI * 2); s.fill();
  }
  // Profondeurs : bleu turquoise → abysses, fond sableux
  const deep = makeCanvas(Math.ceil(w), Math.ceil(h - wl + 2)), d = deep.ctx, dh = h - wl;
  const dg = d.createLinearGradient(0, 0, 0, dh);
  dg.addColorStop(0, '#0e6d8f'); dg.addColorStop(0.35, '#0a4a72'); dg.addColorStop(0.8, '#06223f'); dg.addColorStop(1, '#041628');
  d.fillStyle = dg; d.fillRect(0, 0, w, dh + 2);
  d.fillStyle = '#1b2a33';
  d.beginPath(); d.moveTo(0, dh); for (let x = 0; x <= w; x += 20) d.lineTo(x, dh - dh * 0.06 - Math.sin(x / 90) * dh * 0.025 - Math.sin(x / 31) * 3); d.lineTo(w, dh); d.closePath(); d.fill();
  // Coraux et algues du fond
  for (let i = 0; i < 14; i++) {
    const x = rnd() * w, base = dh - dh * 0.05, hh = dh * (0.05 + rnd() * 0.08);
    d.strokeStyle = i % 3 ? 'rgba(31,199,193,0.35)' : 'rgba(255,111,145,0.35)'; d.lineWidth = 2;
    d.beginPath(); d.moveTo(x, base); d.quadraticCurveTo(x + 8, base - hh / 2, x - 3, base - hh); d.stroke();
  }
  return { key: `${Math.round(w)}x${Math.round(h)}`, sky: sky.canvas, deep: deep.canvas };
}

/** Place du paquebot : centre horizontal et largeur (px). */
export function shipLayout(w: number, h: number): { cx: number; width: number } {
  const wl = h * WATERLINE;
  // Le navire ne dépasse jamais 45 % du ciel en hauteur ; en paysage il vogue à droite (logo à gauche)
  const width = Math.min(720, w * (w > h * 1.2 ? 0.5 : 0.82), (wl * 0.45) / 0.36 / 0.86);
  return { cx: w > h * 1.2 ? w * 0.68 : w * 0.5, width };
}

/** Dessine le fond complet. `t` : temps (s). */
export function drawLoadingSea(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, lowFx: boolean): void {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  if (cache?.key !== key) cache = build(w, h);
  const lay = shipLayout(w, h);
  if (!shipCache || Math.abs(shipCache.w - lay.width) > 1) shipCache = { w: lay.width, c: shipSprite(lay.width) };
  const C = { ...cache, ship: shipCache.c }, wl = h * WATERLINE;
  ctx.drawImage(C.sky as CanvasImageSource, 0, 0, w, wl + 4);
  ctx.drawImage(C.deep as CanvasImageSource, 0, wl, w, h - wl + 2);
  // Rais de lumière qui ondulent sous la surface
  if (!lowFx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = w * (0.1 + i * 0.17) + Math.sin(t * 0.4 + i) * 30, wd = w * 0.05;
      const rg = ctx.createLinearGradient(0, wl, 0, wl + (h - wl) * 0.8);
      rg.addColorStop(0, `rgba(160,235,255,${0.08 + 0.04 * Math.sin(t + i * 2)})`); rg.addColorStop(1, 'rgba(160,235,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.moveTo(x - wd * 0.4, wl); ctx.lineTo(x + wd * 0.4, wl); ctx.lineTo(x + wd * 1.6, wl + (h - wl) * 0.8); ctx.lineTo(x - wd * 0.2, wl + (h - wl) * 0.8); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // Paquebot : il avance lentement (léger roulis), coque immergée visible sous l'eau
  const S = C.ship as HTMLCanvasElement, sw = S.width, sh = S.height;
  const sx = lay.cx - sw * 0.5 + Math.sin(t * 0.15) * w * 0.02, bob = Math.sin(t * 1.1) * 1.5;
  const sy = wl - sh * 0.86 + bob;
  ctx.save();
  ctx.translate(sx + sw / 2, wl); ctx.rotate(Math.sin(t * 0.9) * 0.006); ctx.translate(-(sx + sw / 2), -wl);
  // Partie immergée (sous la ligne de flottaison) : assombrie et teintée de bleu
  ctx.save(); ctx.beginPath(); ctx.rect(0, wl, w, h - wl); ctx.clip();
  // Coque vue à travers l'eau : estompée (pas de rectangle de teinte, seule la coque apparaît)
  ctx.globalAlpha = 0.38; ctx.drawImage(S as CanvasImageSource, sx, sy); ctx.globalAlpha = 1;
  // Hélice et gouvernail
  ctx.fillStyle = 'rgba(200,170,90,0.7)';
  const px = sx + sw * 0.1, py = sy + sh * 0.97;
  for (let i = 0; i < 3; i++) { const a = t * 6 + (i * Math.PI * 2) / 3; ctx.beginPath(); ctx.ellipse(px + Math.cos(a) * 5, py + Math.sin(a) * 9, 3, 7, a, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // Partie émergée
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, wl); ctx.clip();
  ctx.drawImage(S as CanvasImageSource, sx, sy);
  // Hublots et baies allumés (scintillent doucement)
  const rows = [0.52, 0.42, 0.32, 0.22];
  rows.forEach((ry, r) => {
    const n = 16 - r * 3, x0 = sx + sw * (0.15 + r * 0.05), x1 = sx + sw * (0.82 - r * 0.07);
    for (let i = 0; i < n; i++) {
      const on = Math.sin(i * 12.9 + r * 7 + Math.floor(t * 0.5 + i * 0.13)) > -0.6;
      ctx.fillStyle = on ? `rgba(255,214,140,${0.75 + 0.25 * Math.sin(t * 2 + i)})` : 'rgba(40,60,90,0.8)';
      ctx.fillRect(x0 + ((x1 - x0) * (i + 0.5)) / n - 1.5, sy + sh * ry, 3, 2.4);
    }
  });
  // Fumée de la cheminée
  if (!lowFx) for (let i = 0; i < 7; i++) {
    const k = ((t * 0.18 + i / 7) % 1), fx = sx + sw * 0.455 - k * sw * 0.35, fy = sy + sh * 0.02 - k * sh * 0.5;
    ctx.fillStyle = `rgba(230,225,235,${0.28 * (1 - k)})`; ctx.beginPath(); ctx.arc(fx, fy, 4 + k * 22, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.restore();
  // Surface : reflets dorés du couchant, vaguelettes, écume à l'étrave et sillage
  ctx.save();
  ctx.fillStyle = 'rgba(255,214,140,0.35)';
  for (let i = 0; i < 26; i++) {
    const x = w * 0.22 + Math.sin(i * 3.1) * w * 0.12 + Math.sin(t * 0.8 + i) * 6, y = wl - 2 + (i % 5);
    ctx.fillRect(x, y, 10 + (i % 4) * 6, 1.2);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, wl + Math.sin(x / 26 + t * 2) * 1.6 + Math.sin(x / 9 - t * 3) * 0.6);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 10; i++) { const k = (t * 0.6 + i / 10) % 1; ctx.fillRect(sx + sw * 0.05 - k * w * 0.3, wl - 1 + Math.sin(i * 7) * 2, 14 * (1 - k) + 2, 1.4); }
  ctx.beginPath(); ctx.ellipse(sx + sw * 0.96, wl, 10 + Math.sin(t * 3) * 2, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Vie sous-marine : bulles, banc de poissons, méduses
  if (!lowFx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(220,250,255,0.5)'; ctx.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      const k = (t * (0.08 + (i % 5) * 0.02) + i * 0.137) % 1;
      const x = (i * 97.3) % w + Math.sin(t * 1.5 + i) * 6, y = h - k * (h - wl - 6);
      ctx.beginPath(); ctx.arc(x, y, 1.5 + (i % 3), 0, Math.PI * 2); ctx.stroke();
    }
    for (let j = 0; j < 2; j++) {
      const cx = ((t * (18 + j * 7) + j * w * 0.5) % (w + 200)) - 100, cy = wl + (h - wl) * (0.45 + j * 0.2);
      ctx.fillStyle = j ? 'rgba(255,190,90,0.55)' : 'rgba(170,230,255,0.45)';
      for (let i = 0; i < 9; i++) {
        const fx = cx - (i % 3) * 14 - Math.floor(i / 3) * 6, fy = cy + Math.floor(i / 3) * 9 + Math.sin(t * 3 + i) * 2;
        ctx.beginPath(); ctx.ellipse(fx, fy, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(fx - 4, fy); ctx.lineTo(fx - 8, fy - 2.5); ctx.lineTo(fx - 8, fy + 2.5); ctx.closePath(); ctx.fill();
      }
    }
    for (let m = 0; m < 3; m++) {
      const mx = w * (0.15 + m * 0.35) + Math.sin(t * 0.3 + m) * 20, my = wl + (h - wl) * (0.55 + 0.15 * Math.sin(t * 0.5 + m * 2));
      ctx.fillStyle = 'rgba(255,170,220,0.32)';
      ctx.beginPath(); ctx.arc(mx, my, 11, Math.PI, 0); ctx.quadraticCurveTo(mx, my + 4, mx - 11, my); ctx.fill();
      ctx.strokeStyle = 'rgba(255,170,220,0.3)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(mx - 7 + k * 4.5, my + 1); ctx.quadraticCurveTo(mx - 7 + k * 4.5 + Math.sin(t * 2 + k) * 4, my + 12, mx - 7 + k * 4.5, my + 22); ctx.stroke(); }
    }
    ctx.restore();
  }
  // Vignette douce
  const vg = ctx.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
}
