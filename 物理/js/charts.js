export function createSparklineChart(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  const maxPoints = 300;
  const values = [];
  const lineColor = options.lineColor || '#4db6ff';

  function reset() {
    values.length = 0;
    draw();
  }

  function push(v) {
    values.push(v);
    if (values.length > maxPoints) values.shift();
    draw();
  }

  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // frame
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);

    if (values.length < 2) return;
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const pad = (maxV - minV) * 0.1 + 1e-6;
    const lo = minV - pad, hi = maxV + pad;
    const range = hi - lo;

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i=0;i<values.length;i++) {
      const x = (i / (maxPoints - 1)) * (canvas.width - 8) + 4;
      const y = canvas.height - 4 - ((values[i] - lo) / range) * (canvas.height - 8);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  return { push, reset };
}


