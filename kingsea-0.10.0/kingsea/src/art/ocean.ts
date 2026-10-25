// Arrière-plan océanique animé (écran de chargement, menu) : dégradé de profondeur, vagues, bulles.

const bubbles = Array.from({ length: 28 }, (_, i) => ({ x: (i * 0.618) % 1, speed: 0.03 + ((i * 37) % 10) / 160, r: 2 + ((i * 13) % 6), phase: i * 1.7 }));

export function drawOceanBackground(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, lowFx = false): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0e5c9e'); g.addColorStop(0.35, '#0a3d73'); g.addColorStop(1, '#030e1e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  // Rais de lumière
  if (!lowFx) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const x = w * (0.1 + i * 0.22) + Math.sin(t * 0.3 + i) * w * 0.04;
      const rg = ctx.createLinearGradient(0, 0, 0, h * 0.8);
      rg.addColorStop(0, 'rgba(120,220,255,0.10)'); rg.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath(); ctx.moveTo(x - 20, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 120, h * 0.8); ctx.lineTo(x - 60, h * 0.8); ctx.fill();
    }
    ctx.restore();
  }

  // Vagues de surface
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = `rgba(${40 + k * 10},${170 - k * 30},${210 - k * 20},${0.16 + k * 0.05})`;
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let x = 0; x <= w + 10; x += 10) ctx.lineTo(x, 14 + k * 12 + Math.sin(x / (60 + k * 20) + t * (0.9 + k * 0.3)) * (6 + k * 2));
    ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
  }

  // Bulles
  ctx.strokeStyle = 'rgba(200,245,255,0.45)'; ctx.lineWidth = 1.2;
  const n = lowFx ? 10 : bubbles.length;
  for (let i = 0; i < n; i++) {
    const b = bubbles[i];
    const y = h - (((t * b.speed + b.phase * 0.1) % 1) * (h + 40)) + 20;
    const x = b.x * w + Math.sin(t * 1.2 + b.phase) * 12;
    ctx.beginPath(); ctx.arc(x, y, b.r, 0, Math.PI * 2); ctx.stroke();
  }
}
