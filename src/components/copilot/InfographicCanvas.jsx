import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// ---------------------------------------------------------------------------
// InfographicCanvas — renders a premium, professional corporate slide on HTML5 Canvas.
// Input:  data = { headline, findings[{label,value,trend,delta}], bullets[], recommendation }
// Output: a downloadable PNG via the exposed `download()` method.
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
      link.download = `cutebi-insight-${Date.now()}.png`;
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
      style={{ width: '100%', borderRadius: '12px', display: 'block', border: '1px solid #e2e8f0' }}
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

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 1) {
  const words = (text || '').toString().split(/\s+/);
  let line = '';
  let currentY = y;
  let linesDrawn = 0;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    
    if (testWidth > maxWidth && n > 0) {
      if (linesDrawn === maxLines - 1) {
        ctx.fillText(line.trim() + '…', x, currentY);
        return;
      } else {
        ctx.fillText(line, x, currentY);
        line = words[n] + ' ';
        currentY += lineHeight;
        linesDrawn++;
      }
    } else {
      line = testLine;
    }
  }
  if (linesDrawn < maxLines) {
    ctx.fillText(line, x, currentY);
  }
}

function trendColor(t) {
  if (t === 'up')   return '#059669'; // Corporate Green
  if (t === 'down') return '#dc2626'; // Corporate Red
  return '#64748b'; // Neutral Slate
}
function trendIcon(t) {
  if (t === 'up')   return '▲';
  if (t === 'down') return '▼';
  return '●';
}

// ---------------------------------------------------------------------------
// Main draw function (Corporate White Theme)
// ---------------------------------------------------------------------------
function drawInfographic(canvas, data) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // 1. Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // 2. Top accent bar
  ctx.fillStyle = '#0f172a'; // Navy blue
  ctx.fillRect(0, 0, W, 6);

  // 3. Header Area
  ctx.fillStyle = '#f8fafc';
  rr(ctx, 32, 32, W - 64, 88, 8); ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '600 11px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('EXECUTIVE INSIGHT SUMMARY', 54, 56);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 24px -apple-system, Inter, sans-serif';
  wrapText(ctx, data.headline || 'Analysis Summary', 54, 88, W - 120, 32, 1);

  // CuteBI Badge Top Right
  ctx.fillStyle = '#f1f5f9';
  rr(ctx, W - 100, 52, 54, 22, 11); ctx.fill();
  ctx.fillStyle = '#0284c7';
  ctx.font = 'bold 11px -apple-system, Inter, sans-serif';
  ctx.fillText('CuteBI', W - 88, 67);

  // 4. KPI Tiles (Dynamic Wrapping + Real Data)
  const findings = (data.findings || []).slice(0, 3);
  const tileW = Math.floor((W - 100) / 3);
  const tileX0 = 36;
  const tileY = 144;

  findings.forEach((f, i) => {
    const tx = tileX0 + i * (tileW + 14);
    
    // Tile Base
    ctx.fillStyle = '#ffffff';
    rr(ctx, tx, tileY, tileW, 140, 6); ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();
    
    // Top Color Bar
    const tc = trendColor(f.trend);
    ctx.fillStyle = tc;
    ctx.fillRect(tx, tileY, tileW, 4);

    // Trend Badge
    ctx.fillStyle = tc + '1A'; // 10% opacity
    rr(ctx, tx + 16, tileY + 20, Math.max(60, ctx.measureText(f.delta || '').width + 28), 24, 4); ctx.fill();
    ctx.fillStyle = tc;
    ctx.font = 'bold 12px -apple-system, Inter, sans-serif';
    ctx.fillText(trendIcon(f.trend) + ' ' + (f.delta || '—'), tx + 24, tileY + 36);

    // Value (allows very long strings to be truncated safely)
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 30px -apple-system, Inter, sans-serif';
    wrapText(ctx, f.value || '—', tx + 16, tileY + 84, tileW - 32, 34, 1);

    // Label (supports 2 lines for longer text)
    ctx.fillStyle = '#475569';
    ctx.font = '500 13px -apple-system, Inter, sans-serif';
    wrapText(ctx, f.label || '', tx + 16, tileY + 112, tileW - 32, 18, 2);
  });

  // 5. Key Findings
  const sectY = tileY + 164;
  ctx.fillStyle = '#f8fafc';
  rr(ctx, 36, sectY, W - 72, 116, 6); ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 11px -apple-system, Inter, sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('KEY FINDINGS', 56, sectY + 28);
  ctx.letterSpacing = '0px';

  const bullets = (data.bullets || []).slice(0, 3);
  bullets.forEach((b, i) => {
    const by = sectY + 54 + i * 26;
    // Blue dot
    ctx.fillStyle = '#0284c7'; // Corporate blue
    ctx.beginPath(); ctx.arc(56, by - 4, 3.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.font = '14px -apple-system, Inter, sans-serif';
    wrapText(ctx, b, 70, by, W - 140, 20, 1);
  });

  // 6. Strategic Recommendation Box
  const recY = sectY + 136;
  ctx.fillStyle = '#f0f9ff'; // Very light blue
  rr(ctx, 36, recY, W - 72, 54, 6); ctx.fill();
  ctx.strokeStyle = '#bae6fd'; // Light blue border
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 14px -apple-system, Inter, sans-serif';
  ctx.fillText('Strategic Action:', 56, recY + 32);
  
  ctx.fillStyle = '#0369a1'; // Deeper blue text
  ctx.font = '500 14px -apple-system, Inter, sans-serif';
  wrapText(ctx, data.recommendation || 'No recommendation.', 184, recY + 32, W - 240, 20, 1);

  // 7. Footer
  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 11px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'right';
  const now = new Date();
  ctx.fillText(
    `Generated by CuteBI AI · ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    W - 36, H - 18
  );
}
