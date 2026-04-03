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

  // 3. Header Area (Strategic Macro Verdict)
  ctx.fillStyle = '#f8fafc';
  rr(ctx, 32, 32, W - 64, 95, 8); ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.fillStyle = '#64748b';
  ctx.font = '600 11px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('STRATEGIC VERDICT', 54, 56);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 22px -apple-system, Inter, sans-serif';
  wrapText(ctx, data.strategic_macro_verdict || 'Analytical Summary', 54, 88, W - 120, 28, 2);

  // CuteBI Badge Top Right
  ctx.fillStyle = '#f1f5f9';
  rr(ctx, W - 100, 52, 54, 22, 11); ctx.fill();
  ctx.fillStyle = '#0284c7';
  ctx.font = 'bold 11px -apple-system, Inter, sans-serif';
  ctx.fillText('CuteBI', W - 88, 67);

  // 4. Micro Insight Cards (Middle Band)
  const insights = (data.micro_insights || []).slice(0, 3);
  const cardW = Math.floor((W - 104) / 3);
  const cardX0 = 40;
  const cardY = 150;

  insights.forEach((insight, i) => {
    const tx = cardX0 + i * (cardW + 12);
    
    // Card Base
    ctx.fillStyle = '#ffffff';
    rr(ctx, tx, cardY, cardW, 130, 6); ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.stroke();
    
    // Top Color Accent
    ctx.fillStyle = '#38bdf8'; // Sky blue
    ctx.fillRect(tx, cardY, cardW, 4);

    // Label
    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 10px -apple-system, Inter, sans-serif';
    ctx.fillText('MICRO INSIGHT ' + (i + 1), tx + 16, cardY + 24);

    // Content
    ctx.fillStyle = '#0f172a';
    ctx.font = '500 14px -apple-system, Inter, sans-serif';
    wrapText(ctx, insight || '—', tx + 16, cardY + 54, cardW - 32, 20, 4);
  });

  // 5. Meso Trend Findings (Bottom Block)
  const sectY = cardY + 154;
  ctx.fillStyle = '#f8fafc';
  rr(ctx, 40, sectY, W - 80, 140, 6); ctx.fill();
  ctx.strokeStyle = '#e2e8f0';
  ctx.stroke();

  ctx.fillStyle = '#475569';
  ctx.font = 'bold 11px -apple-system, Inter, sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('MESO-LEVEL SYSTEMIC PATTERNS', 60, sectY + 32);
  ctx.letterSpacing = '0px';

  const trends = (data.meso_trends || []).slice(0, 4);
  trends.forEach((t, i) => {
    const by = sectY + 60 + i * 26;
    // Blue dot
    ctx.fillStyle = '#0284c7'; 
    ctx.beginPath(); ctx.arc(60, by - 4, 3.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#334155';
    ctx.font = '14px -apple-system, Inter, sans-serif';
    wrapText(ctx, t, 74, by, W - 140, 20, 1);
  });

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
