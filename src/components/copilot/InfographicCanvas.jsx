import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// ---------------------------------------------------------------------------
// InfographicCanvas — renders a premium, professional corporate slide on HTML5 Canvas.
// Input:  data = { headline, findings[{label,value,trend,delta}], bullets[], recommendation }
// Output: a downloadable PNG via the exposed `download()` method.
// ---------------------------------------------------------------------------

const W = 900;

const theme = {
  accent: '#304571',    // Vihaan Indigo
  secondary: '#76C8D5', // Vihaan Teal
  charcoal: '#111827',  // Primary Text
  slate: '#4B5563',     // Muted Text
  surface: '#FFFFFF',
  background: '#F0F4F8',
  successGreen: '#059669',
  failureRed: '#DF1B3F'
};

const InfographicCanvas = forwardRef(function InfographicCanvas({ data, fontScale = 1.0 }, ref) {
  const canvasRef = useRef(null);

  useImperativeHandle(ref, () => ({
    download() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const link = document.createElement('a');
      link.download = `mvantage-insight-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    },
  }));

  // Dynamic Height calculation
  const trendsCount = data?.meso_trends?.length || 0;
  const calculatedH = Math.min(1080, 480 + (trendsCount * 30));

  useEffect(() => {
    if (canvasRef.current && data) {
      drawInfographic(canvasRef.current, data, calculatedH, fontScale);
    }
  }, [data, calculatedH, fontScale]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={calculatedH}
      style={{ width: '100%', borderRadius: '8px', display: 'block', border: `1px solid ${theme.secondary}22`, background: theme.background }}
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

/** Auto-shrinks font size to fit within maxWidth */
function fitText(ctx, text, maxWidth, initialSize) {
  let size = initialSize;
  ctx.font = `bold ${size}px 'Inter', system-ui, sans-serif`;
  while (ctx.measureText(text).width > maxWidth && size > 12) {
    size -= 2;
    ctx.font = `bold ${size}px 'Inter', system-ui, sans-serif`;
  }
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

function trendColor(t, value) {
  if (value?.includes('0%') || t === 'red') return theme.failureRed;
  if (t === 'green') return theme.successGreen;
  return theme.slate;
}

// ---------------------------------------------------------------------------
// Main draw function
// ---------------------------------------------------------------------------
function drawInfographic(canvas, data, H, fontScale) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // Scaling logic
  const baseScale = fontScale;
  const kpiScale = Math.min(fontScale, 1.1);

  // 1. Background
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, W, H);

  // 2. Top accent bar
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, W, 6);

  // 3. Header: MACRO — STRATEGIC VERDICT
  ctx.fillStyle = theme.slate;
  ctx.font = `900 ${10 * baseScale}px 'Inter', sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('MACRO — STRATEGIC VERDICT', 32, 35);

  ctx.fillStyle = theme.surface;
  rr(ctx, 32, 50, W - 64, 100, 8); ctx.fill(); // Vihaan radius: 8px
  ctx.strokeStyle = '#e2e8f0'; ctx.stroke();

  ctx.fillStyle = theme.charcoal;
  ctx.font = `bold ${24 * baseScale}px 'Inter', sans-serif`;
  wrapText(ctx, data.strategic_macro_verdict || 'Analytical Summary', 54, 105, W - 120, 32 * baseScale);

  // Branding Top Right
  ctx.fillStyle = theme.accent;
  ctx.font = `900 ${16 * baseScale}px 'Inter', sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('EXECUTIVE INSIGHT', W - 48, 35);

  // 4. MICRO — GRAIN-LEVEL INSIGHTS
  ctx.fillStyle = theme.slate;
  ctx.font = `900 ${10 * baseScale}px 'Inter', sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('MICRO — GRAIN-LEVEL INSIGHTS', 32, 175);

  const insights = (data.micro_insights || []).slice(0, 3);
  const cardW = Math.floor((W - 90) / 3);
  const cardX0 = 32;
  const cardY = 195;

  insights.forEach((insight, i) => {
    const tx = cardX0 + i * (cardW + 12);
    
    // Elevation Shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 4;

    // Card Base (Vihaan corners)
    ctx.fillStyle = theme.surface;
    rr(ctx, tx, cardY, cardW, 140, 8); ctx.fill();
    ctx.strokeStyle = '#f1f5f9'; ctx.stroke();
    
    // Reset Shadow
    ctx.shadowColor = 'transparent';

    // Accent Bar
    ctx.fillStyle = trendColor(insight.trend_color, insight.value);
    ctx.fillRect(tx, cardY, cardW, 4);

    // Label
    ctx.fillStyle = theme.slate;
    ctx.font = `bold ${11 * baseScale}px 'Inter', sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(insight.label?.toUpperCase() || 'INSIGHT', tx + 20, cardY + 30);

    // Value (fitText auto-scaling + tabular-nums)
    ctx.fillStyle = theme.charcoal;
    // We append tabular-nums as a trick in some environments, but primarily we ensure font order
    ctx.font = `bold ${48 * kpiScale}px 'Inter', tabular-nums, sans-serif`;
    fitText(ctx, insight.value || '0', cardW - 40, 48 * kpiScale); 
    ctx.fillText(insight.value || '0', tx + 20, cardY + 85);

    // Trend Indicator
    ctx.fillStyle = trendColor(insight.trend_color, insight.value);
    ctx.font = `bold ${13 * baseScale}px 'Inter', sans-serif`;
    ctx.fillText(insight.trend || '', tx + 20, cardY + 115);
  });

  // 5. MESO — SYSTEMIC PATTERNS
  const sectY = cardY + 175;
  ctx.fillStyle = theme.slate;
  ctx.font = `900 ${10 * baseScale}px 'Inter', sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('MESO — SYSTEMIC PATTERNS', 32, sectY);

  const trendsHeight = Math.max(120, (data.meso_trends?.length || 1) * 35 * baseScale);
  ctx.fillStyle = theme.surface;
  rr(ctx, 32, sectY + 15, W - 64, trendsHeight, 8); ctx.fill();
  ctx.strokeStyle = '#f1f5f9'; ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const trends = (data.meso_trends || []).slice(0, 6);
  trends.forEach((t, i) => {
    const by = sectY + 45 + i * 35 * baseScale;
    // Vihaan Accent Circle
    ctx.fillStyle = theme.secondary; 
    ctx.beginPath();
    ctx.arc(60, by + 10, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = theme.charcoal;
    ctx.font = `${500 * baseScale} 14px 'Inter', sans-serif`;
    wrapText(ctx, t, 78, by, W - 140, 20 * baseScale);
  });

  // 6. Footer
  ctx.fillStyle = theme.slate;
  ctx.font = `500 ${11 * baseScale}px 'Inter', sans-serif`;
  ctx.textAlign = 'right';
  const now = new Date();
  ctx.fillText(
    `M-Vantage AI Executive Insight · ${now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
    W - 32, H - 20
  );
}
