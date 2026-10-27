// Avatar d'un joueur (listes d'amis, joueurs en ligne) : tête et épaules dessinées à partir de son apparence,
// dans un médaillon. Sans apparence connue (ancien serveur), une initiale sur fond doré : jamais d'icône vide.
import { drawLook, FEET_Y, sanitizeLook, type Look } from '../art/characters';
import { LUXE } from '../art/brand';
import { font } from './UIKit';

export function drawAvatar(ctx: CanvasRenderingContext2D, look: Look | null | undefined, name: string, cx: number, cy: number, r: number, online?: boolean): void {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  const g = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
  g.addColorStop(0, '#16375e'); g.addColorStop(1, '#0a1a30');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  if (look) {
    // Cadrage tête + épaules (unités de l'image : tête vers y = 6–22, pieds à y = 46)
    const k = (r * 2) / 24;
    drawLook(ctx, sanitizeLook(look), 'idle', 'down', 0, cx, cy + (FEET_Y - 17) * k, k);
  } else {
    ctx.fillStyle = LUXE.champagne; ctx.font = font(r * 1.05, 900); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText((name.trim()[0] ?? '?').toUpperCase(), cx, cy + r * 0.05);
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(212,175,90,0.85)'; ctx.lineWidth = Math.max(1, r * 0.09);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  if (online !== undefined) {
    ctx.fillStyle = online ? '#59e3a7' : '#6b6670'; ctx.strokeStyle = '#0b0a0d'; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath(); ctx.arc(cx + r * 0.72, cy + r * 0.72, r * 0.26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
