// Icônes vectorielles des émotes (bulles au-dessus des personnages, menu des émotes) : dessinées au canevas,
// identiques sur tous les appareils (pas de dépendance aux polices d'émojis du téléphone).
const GOLD = '#e5b54a', NAVY = '#0e2a4a', RED = '#e2445c', TEAL = '#1fc7c1', SKIN = '#f1c7a1', INK = '#1a1208';

function hand(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rot = 0): void {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  ctx.fillStyle = SKIN; ctx.strokeStyle = INK; ctx.lineWidth = s * 0.06;
  ctx.beginPath(); ctx.roundRect(-s * 0.28, -s * 0.05, s * 0.56, s * 0.5, s * 0.14); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.roundRect(-s * 0.27 + i * s * 0.14, -s * 0.42 + Math.abs(i - 1.5) * s * 0.05, s * 0.12, s * 0.42, s * 0.06); ctx.fill(); ctx.stroke(); }
  ctx.restore();
}
function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, c = RED): void {
  ctx.fillStyle = c; ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 0.6, y - s * 0.05, x - s * 0.3, y - s * 0.5, x, y - s * 0.18);
  ctx.bezierCurveTo(x + s * 0.3, y - s * 0.5, x + s * 0.6, y - s * 0.05, x, y + s * 0.35);
  ctx.fill();
}
function face(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, mouth: 'open' | 'smile' | 'o' | 'flat' | 'down', eyes: 'dot' | 'closed' | 'wide' = 'dot'): void {
  ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(x, y, s * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = s * 0.06; ctx.stroke();
  ctx.fillStyle = INK;
  for (const dx of [-0.15, 0.15]) {
    if (eyes === 'closed') { ctx.beginPath(); ctx.arc(x + dx * s, y - s * 0.08, s * 0.07, Math.PI, 0); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x + dx * s, y - s * 0.08, s * (eyes === 'wide' ? 0.075 : 0.05), 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.beginPath();
  if (mouth === 'open') { ctx.arc(x, y + s * 0.08, s * 0.17, 0, Math.PI); ctx.fill(); }
  else if (mouth === 'smile') { ctx.arc(x, y + s * 0.05, s * 0.17, 0.2, Math.PI - 0.2); ctx.stroke(); }
  else if (mouth === 'o') { ctx.ellipse(x, y + s * 0.17, s * 0.07, s * 0.1, 0, 0, Math.PI * 2); ctx.fill(); }
  else if (mouth === 'down') { ctx.arc(x, y + s * 0.28, s * 0.14, Math.PI + 0.3, -0.3); ctx.stroke(); }
  else { ctx.moveTo(x - s * 0.13, y + s * 0.17); ctx.lineTo(x + s * 0.13, y + s * 0.17); ctx.stroke(); }
}

/** Dessine l'icône de l'émote `id` centrée en (x, y), dans un carré de côté `s`. */
export function drawEmoteIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, s: number): void {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (id) {
    case 'wave': hand(ctx, x, y + s * 0.05, s * 0.8, -0.3); ctx.strokeStyle = TEAL; ctx.lineWidth = s * 0.06; for (const r of [0.38, 0.5]) { ctx.beginPath(); ctx.arc(x - s * 0.05, y, s * r, -2.6, -2); ctx.stroke(); } break;
    case 'heart': heart(ctx, x, y + s * 0.05, s * 0.9); break;
    case 'bow': face(ctx, x, y + s * 0.08, s * 0.85, 'smile', 'closed'); ctx.strokeStyle = GOLD; ctx.lineWidth = s * 0.07; ctx.beginPath(); ctx.moveTo(x - s * 0.4, y - s * 0.36); ctx.quadraticCurveTo(x, y - s * 0.52, x + s * 0.4, y - s * 0.36); ctx.stroke(); break;
    case 'salute': case 'captain':
      ctx.fillStyle = id === 'captain' ? '#ffffff' : NAVY; ctx.beginPath(); ctx.ellipse(x, y + s * 0.02, s * 0.42, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = id === 'captain' ? NAVY : '#ffffff'; ctx.beginPath(); ctx.roundRect(x - s * 0.3, y - s * 0.3, s * 0.6, s * 0.3, s * 0.12); ctx.fill();
      ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(x, y - s * 0.15, s * 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = INK; ctx.fillRect(x - s * 0.34, y + s * 0.12, s * 0.68, s * 0.05); break;
    case 'laugh': face(ctx, x, y, s, 'open', 'closed'); ctx.fillStyle = TEAL; ctx.beginPath(); ctx.ellipse(x - s * 0.36, y + s * 0.02, s * 0.06, s * 0.1, 0, 0, Math.PI * 2); ctx.fill(); break;
    case 'surprise': face(ctx, x, y, s, 'o', 'wide'); ctx.fillStyle = GOLD; ctx.font = `900 ${Math.round(s * 0.4)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x + s * 0.4, y - s * 0.3); break;
    case 'shrug': face(ctx, x, y, s * 0.9, 'flat'); ctx.strokeStyle = INK; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(x - s * 0.48, y + s * 0.1); ctx.lineTo(x - s * 0.38, y - s * 0.1); ctx.moveTo(x + s * 0.48, y + s * 0.1); ctx.lineTo(x + s * 0.38, y - s * 0.1); ctx.stroke(); break;
    case 'think': face(ctx, x - s * 0.06, y + s * 0.04, s * 0.85, 'flat'); ctx.fillStyle = '#ffffff'; for (const [dx, dy, r] of [[0.3, -0.32, 0.06], [0.4, -0.42, 0.08]]) { ctx.beginPath(); ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = s * 0.03; ctx.stroke(); } break;
    case 'clap': hand(ctx, x - s * 0.12, y + s * 0.05, s * 0.6, 0.35); hand(ctx, x + s * 0.12, y + s * 0.05, s * 0.6, -0.35); ctx.strokeStyle = GOLD; ctx.lineWidth = s * 0.05; for (const a of [-1.2, -1.57, -1.9]) { ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.36, y - s * 0.1 + Math.sin(a) * s * 0.36); ctx.lineTo(x + Math.cos(a) * s * 0.48, y - s * 0.1 + Math.sin(a) * s * 0.48); ctx.stroke(); } break;
    case 'thumbs':
      ctx.fillStyle = SKIN; ctx.strokeStyle = INK; ctx.lineWidth = s * 0.05;
      ctx.beginPath(); ctx.roundRect(x - s * 0.28, y - s * 0.05, s * 0.5, s * 0.42, s * 0.1); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x - s * 0.1, y - s * 0.45, s * 0.16, s * 0.44, s * 0.08); ctx.fill(); ctx.stroke(); break;
    case 'cheer': ctx.fillStyle = GOLD; ctx.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.2 : s * 0.46, a = -Math.PI / 2 + (i * Math.PI) / 5; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.closePath(); ctx.fill(); break;
    case 'jackpot': ctx.fillStyle = GOLD; ctx.beginPath(); ctx.roundRect(x - s * 0.44, y - s * 0.3, s * 0.88, s * 0.6, s * 0.1); ctx.fill(); ctx.fillStyle = '#ffffff'; ctx.font = `900 ${Math.round(s * 0.34)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('777', x, y + s * 0.02); break;
    case 'facepalm': face(ctx, x, y, s, 'down', 'closed'); hand(ctx, x + s * 0.1, y - s * 0.06, s * 0.5, 0.2); break;
    case 'sigh': face(ctx, x - s * 0.08, y, s * 0.85, 'flat', 'closed'); ctx.strokeStyle = TEAL; ctx.lineWidth = s * 0.05; ctx.beginPath(); ctx.moveTo(x + s * 0.25, y + s * 0.15); ctx.quadraticCurveTo(x + s * 0.4, y, x + s * 0.48, y + s * 0.12); ctx.stroke(); break;
    case 'dance': ctx.fillStyle = '#7b4dff'; ctx.beginPath(); ctx.ellipse(x - s * 0.18, y + s * 0.28, s * 0.13, s * 0.1, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - s * 0.08, y - s * 0.4, s * 0.06, s * 0.68); ctx.beginPath(); ctx.moveTo(x - s * 0.02, y - s * 0.4); ctx.quadraticCurveTo(x + s * 0.35, y - s * 0.3, x + s * 0.25, y - s * 0.05); ctx.lineWidth = s * 0.06; ctx.strokeStyle = '#7b4dff'; ctx.stroke(); break;
    case 'stretch': face(ctx, x, y + s * 0.12, s * 0.7, 'open', 'closed'); ctx.strokeStyle = INK; ctx.lineWidth = s * 0.06; ctx.beginPath(); ctx.moveTo(x - s * 0.2, y - s * 0.12); ctx.lineTo(x - s * 0.34, y - s * 0.46); ctx.moveTo(x + s * 0.2, y - s * 0.12); ctx.lineTo(x + s * 0.34, y - s * 0.46); ctx.stroke(); break;
    case 'spyglass': ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5); ctx.fillStyle = GOLD; ctx.fillRect(-s * 0.45, -s * 0.09, s * 0.36, s * 0.18); ctx.fillStyle = '#8a5a2a'; ctx.fillRect(-s * 0.09, -s * 0.12, s * 0.3, s * 0.24); ctx.fillStyle = GOLD; ctx.fillRect(s * 0.21, -s * 0.15, s * 0.22, s * 0.3); ctx.restore(); break;
    case 'swell': ctx.strokeStyle = TEAL; ctx.lineWidth = s * 0.09; for (const dy of [-0.12, 0.14]) { ctx.beginPath(); for (let i = 0; i <= 12; i++) { const px = x - s * 0.45 + (i / 12) * s * 0.9; ctx.lineTo(px, y + dy * s + Math.sin(i / 12 * Math.PI * 2) * s * 0.09); } ctx.stroke(); } break;
    default: face(ctx, x, y, s, 'smile');
  }
  ctx.restore();
}
