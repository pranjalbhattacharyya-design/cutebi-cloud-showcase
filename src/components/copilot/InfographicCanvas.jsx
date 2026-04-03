import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// ---------------------------------------------------------------------------
// InfographicCanvas — renders a premium, professional corporate slide on HTML5 Canvas.
// Input:  data = { headline, findings[{label,value,trend,delta}], bullets[], recommendation }
// Output: a downloadable PNG via the exposed `download()` method.
// ---------------------------------------------------------------------------

const W = 900;
const H = 520;

const MAHINDRA_RED     = '#E31837';
const MAHINDRA_CHARCOAL = '#212121';
const MAHINDRA_SLATE    = '#757575';
const MAHINDRA_SUCCESS  = '#2E7D32';

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

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = (text || '').toString().split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

function trendColor(t) {
  if (t === 'green')   return MAHINDRA_SUCCESS;
  if (t === 'red')     return MAHINDRA_RED;
  return MAHINDRA_SLATE;
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
  ctx.fillStyle = MAHINDRA_RED;
  ctx.fillRect(0, 0, W, 8);

  // 3. Header Area (Strategic Macro Verdict)
  ctx.fillStyle = '#f9f9f9';
  rr(ctx, 32, 32, W - 64, 95, 2); ctx.fill(); // Sharp corners
  ctx.strokeStyle = '#eeeeee';
  ctx.stroke();

  ctx.fillStyle = MAHINDRA_SLATE;
  ctx.font = '900 11px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('EXECUTIVE STRATEGIC VERDICT', 54, 58);

  ctx.fillStyle = MAHINDRA_CHARCOAL;
  ctx.font = 'bold 24px -apple-system, Inter, sans-serif';
  wrapText(ctx, data.strategic_macro_verdict || 'Analytical Summary', 54, 90, W - 120, 30);

  // Branding Top Right
  ctx.fillStyle = MAHINDRA_RED;
  ctx.font = '900 14px Arial black, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('Mahindra', W - 54, 60);

  // 4. Billboard KPI Tiles (Middle Band)
  const insights = (data.micro_insights || []).slice(0, 3);
  const cardW = Math.floor((W - 104) / 3);
  const cardX0 = 40;
  const cardY = 150;

  insights.forEach((insight, i) => {
    const tx = cardX0 + i * (cardW + 12);
    
    // Apply Elevation Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 5;

    // Card Base (Sharp Corners)
    ctx.fillStyle = '#ffffff';
    rr(ctx, tx, cardY, cardW, 140, 2); ctx.fill();
    ctx.strokeStyle = '#f0f0f0';
    ctx.stroke();
    
    // Reset Shadow for text/labels
    ctx.shadowColor = 'transparent';

    // Accent Bar
    ctx.fillStyle = trendColor(insight.trend_color);
    ctx.fillRect(tx, cardY, cardW, 4);

    // Label
    ctx.fillStyle = MAHINDRA_SLATE;
    ctx.font = 'bold 11px -apple-system, Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(insight.label?.toUpperCase() || 'INSIGHT', tx + 20, cardY + 30);

    // Value (Authoritative Billboard Typography)
    ctx.fillStyle = MAHINDRA_CHARCOAL;
    ctx.font = '900 48px Arial black, Inter, sans-serif';
    ctx.fillText(insight.value || '—', tx + 20, cardY + 85);

    // Trend Indicator
    ctx.fillStyle = trendColor(insight.trend_color);
    ctx.font = 'bold 14px -apple-system, Inter, sans-serif';
    ctx.fillText(insight.trend || '', tx + 20, cardY + 115);
  });

  // 5. Meso Trend Findings (Bottom Block)
  const sectY = cardY + 165;
  ctx.fillStyle = '#f9f9f9';
  rr(ctx, 40, sectY, W - 80, 140, 2); ctx.fill();
  ctx.strokeStyle = '#eeeeee';
  ctx.stroke();

  // BUG FIX: Reset alignment for Meso Trends
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = MAHINDRA_RED;
  ctx.font = '900 11px -apple-system, Inter, sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('MESO-LEVEL SYSTEMIC PATTERNS', 64, sectY + 24);
  ctx.letterSpacing = '0px';

  const trends = (data.meso_trends || []).slice(0, 4);
  trends.forEach((t, i) => {
    const by = sectY + 55 + i * 26;
    // Sharp Square Bullet
    ctx.fillStyle = MAHINDRA_RED; 
    ctx.fillRect(64, by + 4, 6, 6);

    ctx.fillStyle = MAHINDRA_CHARCOAL;
    ctx.font = '500 14px -apple-system, Inter, sans-serif';
    wrapText(ctx, t, 85, by, W - 150, 20);
  });

  // 7. Footer
  ctx.fillStyle = MAHINDRA_SLATE;
  ctx.font = '500 11px -apple-system, Inter, sans-serif';
  ctx.textAlign = 'right';
  const now = new Date();
  ctx.fillText(
    `Mahindra Corporate AI Insight · ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    W - 40, H - 18
  );
}
