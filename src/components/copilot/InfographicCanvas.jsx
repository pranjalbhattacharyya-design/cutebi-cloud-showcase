import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// ---------------------------------------------------------------------------
// InfographicCanvas — renders a premium executive summary slide on HTML5 Canvas.
// Input:  data = { headline, findings[{label,value,trend,delta}], bullets[], recommendation }
// Output: a downloadable PNG via the exposed `download()` method.
// Cost:   ₹0 — no Imagen API call needed.
// ---------------------------------------------------------------------------

const W = 900;
const H = 520;

const InfographicCanvas = forwardRef(function InfographicCanvas({ data }, ref) {
  const canvasRef = useRef(null);

  useImperativeHandle(ref, () => ({
    download() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = 'cutebi-insight.png';
      link.href = canvas.toDataURL('image/png');
      link.click();
    },
  }));

  useEffect(() => {
    if (canvasRef.current && data) drawInfographic(canvasRef.current, data);
  }, [data]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      style={{ width: '100%', borderRadius: '12px', display: 'block' }}
    />
  );
});

export default InfographicCanvas;

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);      ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);      ctx.quadraticCurveTo(x,     y + h, x, y + h - r);
  ctx.lineTo(x, y + r);          ctx.quadraticCurveTo(x,     y,     x + r, y);
  ctx.closePath();
}

function trunc(s = '', max = 80) {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function trendColor(t) {
  if (t === 'up')   return '#10b981';
  if (t === 'down') return '#f43f5e';
  return '#94a3b8';
}
function trendIcon(t) {
  if (t === 'up')   return '▲';
  if (t === 'down') return '▼';
  return '●';
}

// ---------------------------------------------------------------------------
// Main draw function
// ---------------------------------------------------------------------------
function drawInfographic(canvas, data) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // ── Background ────────────────────────────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b0f1e');
  bg.addColorStop(1, '#131929');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let x = 20; x < W; x += 36)
    for (let y = 20; y < H; y += 36) {
      ctx.beginPath(); ctx.arc(x, y, 1.2, 0, Math.PI * 2); ctx.fill();
    }

  // ── Left accent stripe ────────────────────────────────────────────────────
  const stripe = ctx.createLinearGradient(0, 0, 0, H);
  stripe.addColorStop(0,   '#7c3aed');
  stripe.addColorStop(0.5, '#db2777');
  stripe.addColorStop(1,   '#f59e0b');
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, 5, H);

  // ── Header panel ─────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  rr(ctx, 18, 18, W - 36, 86, 10); ctx.fill();

  // CuteBI badge
  const badgeGrad = ctx.createLinearGradient(32, 34, 110, 34);
  badgeGrad.addColorStop(0, '#7c3aed');
  badgeGrad.addColorStop(1, '#db2777');
  ctx.fillStyle = badgeGrad;
  rr(ctx, 32, 33, 88, 22, 5); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('✦  CuteBI AI', 40, 48);

  // Label
  ctx.fillStyle = 'rgba(148,163,184,0.7)';
  ctx.font = '11px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('EXECUTIVE INSIGHT SUMMARY', W - 32, 48);

  // Headline
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 24px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(trunc(data.headline || 'AI Insight Summary', 72), 32, 88);

  // ── KPI Tiles ─────────────────────────────────────────────────────────────
  const findings = (data.findings || []).slice(0, 3);
  const tileW    = Math.floor((W - 50) / 3) - 8;
  const tileX0   = 18;
  const tileY    = 122;

  findings.forEach((f, i) => {
    const tx = tileX0 + i * (tileW + 9);
    const tc = trendColor(f.trend);

    // Tile bg
    ctx.fillStyle = 'rgba(255,255,255,0.055)';
    rr(ctx, tx, tileY, tileW, 118, 8); ctx.fill();

    // Top accent filled line
    ctx.fillStyle = tc;
    ctx.fillRect(tx + 12, tileY + 10, 28, 3);

    // Trend badge
    ctx.fillStyle = tc + '22';
    rr(ctx, tx + 12, tileY + 20, 64, 20, 4); ctx.fill();
    ctx.fillStyle = tc;
    ctx.font = 'bold 11px -apple-system, Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(trendIcon(f.trend) + ' ' + trunc(f.delta || '—', 8), tx + 18, tileY + 34);

    // Value
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 26px -apple-system, Inter, sans-serif';
    ctx.fillText(trunc(f.value || '—', 12), tx + 12, tileY + 76);

    // Label
    ctx.fillStyle = '#64748b';
    ctx.font = '12px -apple-system, Inter, sans-serif';
    ctx.fillText(trunc(f.label || '', 22), tx + 12, tileY + 100);
  });

  // ── Key Findings ─────────────────────────────────────────────────────────
  const sectY = tileY + 130;
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  rr(ctx, 18, sectY, W - 36, 130, 8); ctx.fill();

  ctx.fillStyle = 'rgba(148,163,184,0.6)';
  ctx.font = 'bold 10px -apple-system, Inter, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.textAlign = 'left';
  ctx.fillText('KEY FINDINGS', 32, sectY + 22);
  ctx.letterSpacing = '0px';

  const bullets = (data.bullets || []).slice(0, 3);
  bullets.forEach((b, i) => {
    const by = sectY + 46 + i * 28;
    // Bullet dot
    const dotGrad = ctx.createRadialGradient(36, by - 3, 0, 36, by - 3, 5);
    dotGrad.addColorStop(0, '#a855f7');
    dotGrad.addColorStop(1, '#7c3aed');
    ctx.fillStyle = dotGrad;
    ctx.beginPath(); ctx.arc(36, by - 3, 4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '13px -apple-system, Inter, sans-serif';
    ctx.fillText(trunc(b, 102), 50, by);
  });

  // ── Recommendation ────────────────────────────────────────────────────────
  const recY = sectY + 140;
  const recGrad = ctx.createLinearGradient(18, recY, W - 18, recY);
  recGrad.addColorStop(0, 'rgba(124,58,237,0.35)');
  recGrad.addColorStop(1, 'rgba(219,39,119,0.22)');
  ctx.fillStyle = recGrad;
  rr(ctx, 18, recY, W - 36, 52, 8); ctx.fill();

  // Thin top border
  ctx.strokeStyle = 'rgba(168,85,247,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(18 + 8, recY); ctx.lineTo(W - 18 - 8, recY); ctx.stroke();

  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 13px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('⚡ ' + trunc(data.recommendation || 'No recommendation.', 105), 32, recY + 22);

  ctx.fillStyle = 'rgba(148,163,184,0.4)';
  ctx.font = '11px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Strategic Action', 32, recY + 40);

  // ── Footer ────────────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  const now = new Date();
  ctx.fillText(
    `Generated by CuteBI AI · ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    W - 22, H - 10
  );
}
