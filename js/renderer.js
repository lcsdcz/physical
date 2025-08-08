export function createRenderer(canvas) {
  const marginPx = 40;
  const pixelsPerMeter = 70; // scale

  function worldToCanvas(p) {
    const x = marginPx + p.x * pixelsPerMeter;
    const y = canvas.height - marginPx - p.y * pixelsPerMeter;
    return { x, y };
  }

  function drawGrid(ctx, showGrid) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showGrid) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(142,160,192,0.15)';
    ctx.lineWidth = 1;
    const step = pixelsPerMeter;
    for (let x = marginPx; x <= canvas.width - marginPx; x += step) {
      ctx.beginPath(); ctx.moveTo(x, marginPx); ctx.lineTo(x, canvas.height - marginPx); ctx.stroke();
      const meter = Math.round((x - marginPx) / step);
      if (meter % 1 === 0) {
        ctx.fillStyle = 'rgba(200,220,255,0.5)';
        ctx.font = '11px system-ui';
        ctx.fillText(String(meter), x + 2, canvas.height - marginPx + 14);
      }
    }
    for (let y = marginPx; y <= canvas.height - marginPx; y += step) {
      ctx.beginPath(); ctx.moveTo(marginPx, y); ctx.lineTo(canvas.width - marginPx, y); ctx.stroke();
      const meter = Math.round((canvas.height - marginPx - y) / step);
      if (meter % 1 === 0) {
        ctx.fillStyle = 'rgba(200,220,255,0.5)';
        ctx.font = '11px system-ui';
        ctx.fillText(String(meter), marginPx - 16, y - 2);
      }
    }
    // axis labels
    ctx.fillStyle = 'rgba(200,220,255,0.7)';
    ctx.font = '12px system-ui';
    ctx.fillText('x (m)', canvas.width - marginPx - 30, canvas.height - marginPx + 24);
    ctx.fillText('y (m)', marginPx - 24, marginPx - 6);
    ctx.restore();
  }

  function drawGround(ctx, groundY) {
    const p0 = worldToCanvas({ x: 0, y: groundY });
    const p1 = worldToCanvas({ x: (canvas.width - 2*marginPx)/pixelsPerMeter, y: groundY });
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawSpringScene(ctx, springY) {
    // draw a spring-like zigzag from left to mass y
    const y = worldToCanvas({x:0,y:springY}).y;
    const left = marginPx, right = canvas.width - marginPx;
    ctx.save();
    ctx.strokeStyle = 'rgba(180,150,255,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const coils = 10, amp = 8;
    for (let i=0;i<=coils;i++) {
      const x = left + (right-left) * (i/coils);
      const dy = (i%2===0? -amp : amp);
      ctx.lineTo(x, y + dy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawTrace(ctx, trace, color) {
    if (!trace || trace.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const p0 = worldToCanvas(trace[0]);
    ctx.moveTo(p0.x, p0.y);
    for (let i=1;i<trace.length;i++) {
      const p = worldToCanvas(trace[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawArrow(ctx, from, vec, color, scale=1, label=null) {
    const start = worldToCanvas(from);
    const scaled = { x: vec.x * scale, y: vec.y * scale };
    const end = worldToCanvas({ x: from.x + scaled.x, y: from.y + scaled.y });
    const dx = end.x - start.x, dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    // arrow head
    const angle = Math.atan2(dy, dx);
    const ah = Math.min(10, 0.2 * len), aw = ah * 0.7;
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - ah * Math.cos(angle - Math.PI/6), end.y - ah * Math.sin(angle - Math.PI/6));
    ctx.lineTo(end.x - ah * Math.cos(angle + Math.PI/6), end.y - ah * Math.sin(angle + Math.PI/6));
    ctx.closePath(); ctx.fill();
    if (label) {
      ctx.font = '12px system-ui';
      ctx.fillText(label, end.x + 4, end.y - 4);
    }
    ctx.restore();
  }

  function drawMass(ctx, position) {
    const p = worldToCanvas(position); // 以中心绘制
    ctx.save();
    ctx.fillStyle = '#e7ecf6';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawExtraBalls(ctx, balls, selectedBallId) {
    if (!balls || balls.length===0) return;
    ctx.save();
    for (const b of balls) {
      const p = worldToCanvas({x:b.x, y:b.y});
      ctx.fillStyle = b.id === selectedBallId ? '#ff9d42' : '#9ed1ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fill();
      if (b.id === selectedBallId) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.stroke();
      }
    }
    ctx.restore();
  }

  function draw(ctx, snapshot, params) {
    drawGrid(ctx, params.showGrid);

    if (snapshot.scenario === 'projectile' || snapshot.scenario === 'freefall') {
      drawGround(ctx, snapshot.groundY);
    } else if (snapshot.scenario === 'spring') {
      drawSpringScene(ctx, snapshot.springY);
    } else if (snapshot.scenario === 'force') {
      // show a cross at the origin point for force composition
      const p = worldToCanvas({x:3,y:2});
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath(); ctx.moveTo(p.x-6,p.y); ctx.lineTo(p.x+6,p.y); ctx.moveTo(p.x,p.y-6); ctx.lineTo(p.x,p.y+6); ctx.stroke();
      ctx.restore();
    } else if (snapshot.scenario === 'lever') {
      // draw lever beam centered at mid x
      const cx = canvas.width / 2;
      const y = canvas.height / 2;
      const beamLen = 2.8 * 70; // meters * ppm
      const left = cx - beamLen/2, right = cx + beamLen/2;
      // beam
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
      // fulcrum
      ctx.fillStyle = 'rgba(180,150,255,0.7)';
      ctx.beginPath(); ctx.moveTo(cx-12, y+14); ctx.lineTo(cx+12, y+14); ctx.lineTo(cx, y-6); ctx.closePath(); ctx.fill();
      // forces arrows
      const ppm = 70;
      const x1 = cx - snapshot.lever.d1 * ppm;
      const x2 = cx + snapshot.lever.d2 * ppm;
      drawArrowPx(ctx, {x:x1,y:y}, {x:0,y: -snapshot.lever.f1}, '#4db6ff', 0.8, 'F1');
      drawArrowPx(ctx, {x:x2,y:y}, {x:0,y: -snapshot.lever.f2}, '#ff9d42', 0.8, 'F2');
      // torque text
      ctx.fillStyle = 'rgba(200,220,255,0.9)';
      ctx.font = '12px system-ui';
      const tau1 = snapshot.lever.f1 * snapshot.lever.d1;
      const tau2 = snapshot.lever.f2 * snapshot.lever.d2;
      ctx.fillText(`τ1 = F1·d1 = ${tau1.toFixed(2)} N·m`, left+8, y-40);
      ctx.fillText(`τ2 = F2·d2 = ${tau2.toFixed(2)} N·m`, left+8, y-24);
      const eq = Math.abs(tau1 - tau2) < 1e-2 ? '平衡' : (tau1>tau2? '逆时针' : '顺时针');
      ctx.fillText(`状态：${eq}`, left+8, y-8);
      ctx.restore();
    }

    if ((snapshot.scenario !== 'lever' && snapshot.scenario !== 'force') && params.showTrace) {
      drawTrace(ctx, snapshot.trace, 'rgba(93,205,255,0.9)');
    }

    // Vectors scaling for visibility
    const velScale = 0.2;
    const accScale = 0.05;
    const forceScale = 0.02; // as vector in N to meters representation

    if (snapshot.scenario === 'collision-1d') {
      drawCollision(ctx, snapshot);
    } else if (snapshot.scenario === 'force') {
      drawForceComposition(ctx, snapshot);
    } else if (snapshot.scenario === 'lever') {
      // no mass dot
    } else {
      // Forces
      drawArrow(ctx, snapshot.position, snapshot.forces.gravity, 'rgba(109,240,156,0.9)', forceScale);
      drawArrow(ctx, snapshot.position, snapshot.forces.spring, '#b496ff', forceScale);
      drawArrow(ctx, snapshot.position, snapshot.forces.drag, '#ff6b96', forceScale);
      // Kinematics vectors
      if (params.showVel) drawArrow(ctx, snapshot.position, snapshot.velocity, '#4db6ff', velScale);
      if (params.showAcc) drawArrow(ctx, snapshot.position, snapshot.acceleration, '#ff9d42', accScale);
    drawMass(ctx, snapshot.position);
    // 绘制额外小球
    if (snapshot.balls && snapshot.balls.length > 0) {
      drawExtraBalls(ctx, snapshot.balls, snapshot.selectedBallId);
    }
    }
  }

  function drawArrowPx(ctx, fromPx, vec, color, scale=1, label=null) {
    const dx = vec.x * scale, dy = vec.y * scale;
    const end = { x: fromPx.x + dx, y: fromPx.y + dy };
    const len = Math.hypot(dx, dy);
    if (len < 2) return;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(fromPx.x, fromPx.y); ctx.lineTo(end.x, end.y); ctx.stroke();
    const angle = Math.atan2(dy, dx);
    const ah = Math.min(10, 0.2 * len);
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - ah * Math.cos(angle - Math.PI/6), end.y - ah * Math.sin(angle - Math.PI/6));
    ctx.lineTo(end.x - ah * Math.cos(angle + Math.PI/6), end.y - ah * Math.sin(angle + Math.PI/6));
    ctx.closePath(); ctx.fill();
    if (label) { ctx.font = '12px system-ui'; ctx.fillText(label, end.x + 4, end.y - 4); }
    ctx.restore();
  }

  function drawCollision(ctx, snapshot) {
    const c = snapshot.collision;
    const y = canvas.height/2;
    const ppm = 70;
    const x1 = marginPx + c.x1 * ppm;
    const x2 = marginPx + c.x2 * ppm;
    ctx.save();
    ctx.fillStyle = '#4db6ff';
    ctx.beginPath(); ctx.arc(x1, y, 10, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff9d42';
    ctx.beginPath(); ctx.arc(x2, y, 10, 0, Math.PI*2); ctx.fill();
    // velocities arrows
    drawArrowPx(ctx, {x:x1,y:y}, {x:c.v1*ppm*0.2,y:0}, '#4db6ff', 1, 'v1');
    drawArrowPx(ctx, {x:x2,y:y}, {x:c.v2*ppm*0.2,y:0}, '#ff9d42', 1, 'v2');
    // info
    ctx.fillStyle = 'rgba(200,220,255,0.9)';
    ctx.font = '12px system-ui';
    ctx.fillText(`m1=${c.m1.toFixed(2)}kg  m2=${c.m2.toFixed(2)}kg  e=${c.e.toFixed(2)}`, marginPx+6, y-36);
    ctx.fillText(`v1=${c.v1.toFixed(2)} m/s  v2=${c.v2.toFixed(2)} m/s`, marginPx+6, y-20);
    ctx.restore();
  }

  function drawForceComposition(ctx, snapshot) {
    const origin = { x: 3, y: 2 };
    const p0 = worldToCanvas(origin);
    const deg2rad = (d)=>d*Math.PI/180;
    const { f1, a1, f2, a2 } = snapshot.forceComp;
    const v1 = { x: f1 * Math.cos(deg2rad(a1)), y: f1 * Math.sin(deg2rad(a1)) };
    const v2 = { x: f2 * Math.cos(deg2rad(a2)), y: f2 * Math.sin(deg2rad(a2)) };
    const r = { x: v1.x + v2.x, y: v1.y + v2.y };
    // scale Newton to meters for drawing
    const s = 0.03;
    drawArrow(ctx, origin, v1, '#4db6ff', s, 'F1');
    drawArrow(ctx, origin, v2, '#ff9d42', s, 'F2');
    drawArrow(ctx, origin, r, '#6df09c', s, 'R');
    // components grid labels
    ctx.save();
    ctx.fillStyle = 'rgba(200,220,255,0.9)';
    ctx.font = '12px system-ui';
    ctx.fillText(`R = (${r.x.toFixed(2)}, ${r.y.toFixed(2)}) N`, p0.x + 8, p0.y - 12);
    ctx.restore();
  }

  return { draw };
}


