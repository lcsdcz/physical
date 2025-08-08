"use strict";
(function(){
  // charts.js
  function createSparklineChart(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    const maxPoints = 300;
    const values = [];
    const times = [];
    let totalT = 0;
    const lineColor = options.lineColor || '#4db6ff';
    const yLabel = options.yLabel || '';
    const xLabel = options.xLabel || 't (s)';
    function reset() { values.length = 0; times.length = 0; totalT = 0; draw(); }
    function push(v, dt = 1/60) {
      totalT += dt; values.push(v); times.push(totalT);
      while (values.length > maxPoints) { values.shift(); times.shift(); }
      draw();
    }
    function drawAxes(lo, hi, t0, t1) {
      // frame
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
      ctx.fillStyle = 'rgba(200,220,255,0.7)';
      ctx.font = '11px system-ui';
      const range = hi - lo;
      const tRange = Math.max(1e-6, t1 - t0);
      // y ticks: min, mid, max
      const yTicks = [lo, (lo+hi)/2, hi];
      yTicks.forEach((tv)=>{
        const y = canvas.height - 4 - ((tv - lo)/range) * (canvas.height - 24);
        ctx.fillText(tv.toFixed(2), 6, y);
      });
      // x ticks: start, mid, end
      const xTicks = [t0, t0 + tRange/2, t1];
      xTicks.forEach((tv)=>{
        const x = ((tv - t0)/tRange) * (canvas.width - 40) + 28;
        ctx.fillText(tv.toFixed(1), x, canvas.height - 6);
      });
      if (yLabel) ctx.fillText(yLabel, 6, 12);
      ctx.fillText(xLabel, canvas.width - 46, canvas.height - 6);
    }
    function draw() {
      ctx.clearRect(0,0,canvas.width,canvas.height);
      if (values.length < 2) { drawAxes(0,1,0,1); return; }
      const minV = Math.min(...values), maxV = Math.max(...values);
      const pad = (maxV - minV) * 0.1 + 1e-6; const lo = minV - pad, hi = maxV + pad; const range = hi - lo;
      const t0 = times[0], t1 = times[times.length-1]; const tRange = Math.max(1e-6, t1 - t0);
      drawAxes(lo, hi, t0, t1);
      ctx.strokeStyle = lineColor; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i=0;i<values.length;i++) {
        const x = ((times[i] - t0)/tRange) * (canvas.width - 40) + 28;
        const y = canvas.height - 4 - ((values[i] - lo) / range) * (canvas.height - 24);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    return { push, reset };
  }

  // physics.js
  function createPhysicsWorld() {
    const tracePoints = [];
    const state = {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
      massKg: 1,
      scenario: 'projectile',
      forces: { total: {x:0,y:0}, gravity: {x:0,y:0}, drag: {x:0,y:0}, spring: {x:0,y:0} },
      time: 0,
      springY: 1.8,
      groundY: 0,
      collision: { m1:2, m2:3, v1:5, v2:-3, e:1, x1:3, x2:7, done:false },
      lever: { f1:20, d1:1.5, f2:20, d2:1.5 },
      forceComp: { f1:30, a1:0, f2:20, a2:90 },
      balls: [], // extra balls for multi-objects moving in same scene
      selectedBallId: null,
    };
    function reset(params) {
      state.massKg = params.massKg ?? 1; state.scenario = params.scenario ?? 'projectile'; state.time = 0; tracePoints.length = 0;
      // Keep existing extra balls when switching params within same scene; clear when scene changes drastically? Here keep unless explicit clear
      if (state.scenario === 'projectile') {
        const angleRad = (params.angleDeg ?? 45) * Math.PI / 180; const v0 = params.v0 ?? 20;
        // 全部按中心计算：初始中心位于地面 y=0
        state.position = { x: 0, y: 0 }; state.velocity = { x: v0 * Math.cos(angleRad), y: v0 * Math.sin(angleRad) };
      } else if (state.scenario === 'freefall') {
        state.position = { x: 6, y: 6 }; state.velocity = { x: 0, y: 0 };
      } else if (state.scenario === 'spring') {
        state.position = { x: 5.0 + 1.0, y: state.springY }; state.velocity = { x: 0, y: 0 };
      } else if (state.scenario === 'uniform') {
        state.position = { x: 1, y: 1 }; state.velocity = { x: params.uniformU ?? 5, y: 0 };
      } else if (state.scenario === 'uniform-accel') {
        state.position = { x: 1, y: 1 }; state.velocity = { x: params.uaU0 ?? 0, y: 0 }; state.acceleration = { x: params.uaAx ?? 2, y: 0 };
      } else if (state.scenario === 'collision-1d') {
        state.collision = { m1: params.colM1 ?? 2, m2: params.colM2 ?? 3, v1: params.colV1 ?? 5, v2: params.colV2 ?? -3, e: params.colE ?? 1, x1:2, x2:8, done:false };
        state.position = { x: 0, y: 0 }; state.velocity = { x: 0, y: 0 };
      } else if (state.scenario === 'lever') {
        state.lever = { f1: params.levF1 ?? 20, d1: params.levD1 ?? 1.5, f2: params.levF2 ?? 20, d2: params.levD2 ?? 1.5 };
        state.position = { x: 0, y: 0 }; state.velocity = { x: 0, y: 0 };
      } else if (state.scenario === 'force') {
        state.forceComp = { f1: params.fcompF1 ?? 30, a1: params.fcompA1 ?? 0, f2: params.fcompF2 ?? 20, a2: params.fcompA2 ?? 90 };
        state.position = { x: 3, y: 2 }; state.velocity = { x: 0, y: 0 };
      }
      state.acceleration = state.acceleration || { x: 0, y: 0 };
    }
    function clearTrace() { tracePoints.length = 0; }
    function computeForces(params) {
      const g = params.g ?? 9.8; const dragC = params.dragC ?? 0; const springK = params.springK ?? 50; const dampingB = params.dampingB ?? 0.5;
      const gravity = (['spring','uniform','uniform-accel','collision-1d','lever','force'].includes(state.scenario)) ? {x:0,y:0} : { x: 0, y: -state.massKg * g };
      let drag = { x: 0, y: 0 };
      if (state.scenario === 'projectile') { drag = { x: -dragC * state.velocity.x, y: -dragC * state.velocity.y }; }
      else if (state.scenario === 'spring') { drag = { x: -dragC * state.velocity.x, y: 0 }; }
      let spring = { x: 0, y: 0 };
      if (state.scenario === 'spring') {
        const equilibriumX = 5.0; const displacementX = state.position.x - equilibriumX; const velX = state.velocity.x; spring = { x: -springK * displacementX - dampingB * velX, y: 0 };
      }
      let ext = { x: 0, y: 0 };
      if (state.scenario === 'uniform-accel') { const ax = params.uaAx ?? 0; ext.x = state.massKg * ax; }
      const total = { x: gravity.x + drag.x + spring.x + ext.x, y: gravity.y + drag.y + spring.y + ext.y };
      return { total, gravity, drag, spring };
    }
    function integrate(dt, params) {
      if (state.scenario === 'collision-1d') {
        const c = state.collision; if (!c.done) { c.x1 += c.v1 * dt; c.x2 += c.v2 * dt; if (c.x1 >= c.x2) { const m1=c.m1,m2=c.m2,u1=c.v1,u2=c.v2,e=c.e; const v1=(m1*u1+m2*u2-m2*e*(u1-u2))/(m1+m2); const v2=v1+e*(u1-u2); c.v1=v1; c.v2=v2; c.x1=(c.x1+c.x2)/2-0.01; c.x2=c.x1+0.02; c.done=true; } } else { c.x1 += c.v1 * dt; c.x2 += c.v2 * dt; }
        tracePoints.push({ x: c.x1, y: 1 }); if (tracePoints.length > 2000) tracePoints.shift(); state.time += dt; state.forces.total = {x:0,y:0}; state.acceleration = {x:0,y:0}; return snapshot();
      }
      if (state.scenario === 'lever' || state.scenario === 'force') { state.time += dt; if (tracePoints.length > 800) tracePoints.shift(); return snapshot(); }
      if ((state.scenario === 'projectile' || state.scenario === 'freefall') && state.position.y <= state.groundY && state.time > 0) { return null; }
      const { total, gravity, drag, spring } = computeForces(params);
      const ax = total.x / state.massKg, ay = total.y / state.massKg; state.acceleration.x = ax; state.acceleration.y = ay;
      state.velocity.x += ax * dt; state.velocity.y += ay * dt; state.position.x += state.velocity.x * dt; state.position.y += state.velocity.y * dt; state.time += dt;
      if ((state.scenario === 'projectile' || state.scenario === 'freefall') && state.position.y < state.groundY) { state.position.y = state.groundY; state.velocity.y = 0; }
      tracePoints.push({ x: state.position.x, y: state.position.y }); if (tracePoints.length > 2000) tracePoints.shift();
      state.forces.total = total; state.forces.gravity = gravity; state.forces.drag = drag; state.forces.spring = spring; return snapshot();
    }
    function stepBalls(dt, params){
      // apply same field forces to extra balls for projectile/freefall/spring where meaningful
      const g = params.g ?? 9.8; const dragC = params.dragC ?? 0; const springK = params.springK ?? 50; const dampingB = params.dampingB ?? 0.5;
      for (const b of state.balls) {
        if (state.scenario === 'projectile' || state.scenario === 'freefall') {
          const gravity = {x:0, y: (state.scenario==='projectile') ? -b.m*g : -b.m*g};
          const drag = (state.scenario==='projectile') ? {x: -dragC*b.vx, y: -dragC*b.vy} : {x:0,y:0};
          const ax = (gravity.x+drag.x)/b.m; const ay = (gravity.y+drag.y)/b.m;
          b.vx += ax*dt; b.vy += ay*dt; b.x += b.vx*dt; b.y += b.vy*dt;
          if (b.y < state.groundY) { b.y = state.groundY; b.vy = 0; }
        } else if (state.scenario === 'spring') {
          const equilibriumX = 5.0; const displacementX = b.x - equilibriumX; const forceX = -springK*displacementX - dampingB*b.vx;
          const ax = forceX / b.m; b.vx += ax*dt; b.x += b.vx*dt; b.y = state.springY;
        } else if (state.scenario === 'uniform') {
          b.x += b.vx*dt; b.y += b.vy*dt;
        } else if (state.scenario === 'uniform-accel') {
          b.vx += (params.uaAx ?? 0)*dt; b.x += b.vx*dt; b.y += b.vy*dt;
        }
      }
    }
    function snapshot() {
      return { time: state.time, position: { ...state.position }, velocity: { ...state.velocity }, acceleration: { ...state.acceleration }, massKg: state.massKg, scenario: state.scenario,
        forces:{ total:{...state.forces.total}, gravity:{...state.forces.gravity}, drag:{...state.forces.drag}, spring:{...state.forces.spring} }, trace: tracePoints.slice(), groundY: state.groundY, springY: state.springY, collision:{...state.collision}, lever:{...state.lever}, forceComp:{...state.forceComp}, balls: state.balls.slice(), selectedBallId: state.selectedBallId };
    }
    function addBallFromParams(params){
      // Use current scene and params to create a ball and push into list
      const id = Math.random().toString(36).slice(2,8);
      let x=0,y=0,vx=0,vy=0,m=params.massKg ?? 1;
      if (state.scenario==='projectile') {
        const rad=(params.angleDeg??45)*Math.PI/180; const v0=params.v0??20; x=0;y=0; vx=v0*Math.cos(rad); vy=v0*Math.sin(rad);
      } else if (state.scenario==='freefall') { x=6;y=6; vx=0;vy=0; }
      else if (state.scenario==='spring') { x=5+1; y=state.springY; vx=0;vy=0; }
      else if (state.scenario==='uniform') { x=1; y=1; vx=params.uniformU??5; vy=0; }
      else if (state.scenario==='uniform-accel') { x=1; y=1; vx=params.uaU0??0; vy=0; }
      state.balls.push({ id, x, y, vx, vy, m, params: {...params} });
      return id;
    }
    function clearBalls(){ state.balls = []; state.selectedBallId = null; }
    function selectBall(id){ state.selectedBallId = id; }
    function getSelectedBall(){ return state.balls.find(b => b.id === state.selectedBallId); }
    function updateBallParams(id, newParams){
      const ball = state.balls.find(b => b.id === id);
      if (ball) {
        ball.params = {...newParams};
        // 重新计算初始状态
        if (state.scenario==='projectile') {
          const rad=(newParams.angleDeg??45)*Math.PI/180; const v0=newParams.v0??20;
          ball.x=0; ball.y=0; ball.vx=v0*Math.cos(rad); ball.vy=v0*Math.sin(rad); ball.m=newParams.massKg??1;
        } else if (state.scenario==='freefall') { ball.x=6; ball.y=6; ball.vx=0; ball.vy=0; ball.m=newParams.massKg??1; }
        else if (state.scenario==='spring') { ball.x=5+1; ball.y=state.springY; ball.vx=0; ball.vy=0; ball.m=newParams.massKg??1; }
        else if (state.scenario==='uniform') { ball.x=1; ball.y=1; ball.vx=newParams.uniformU??5; ball.vy=0; ball.m=newParams.massKg??1; }
        else if (state.scenario==='uniform-accel') { ball.x=1; ball.y=1; ball.vx=newParams.uaU0??0; ball.vy=0; ball.m=newParams.massKg??1; }
      }
    }
    const origStep = (dt,params)=>integrate(dt,params);
    function stepProxy(dt, params){ const snap = origStep(dt, params); stepBalls(dt, params); return snap; }
    return { reset, clearTrace, step:stepProxy, getSnapshot:()=>snapshot(), addBallFromParams, clearBalls, selectBall, getSelectedBall, updateBallParams };
  }

  // renderer.js
  function createRenderer(canvas) {
    const marginPx = 40; let pixelsPerMeter = 70; const camera = { x: 0, y: 0 };
    function worldToCanvas(p) { const x = marginPx + (p.x - camera.x) * pixelsPerMeter; const y = canvas.height - marginPx - (p.y - camera.y) * pixelsPerMeter; return { x, y }; }
    function canvasToWorld(px, py) { const x = camera.x + (px - marginPx) / pixelsPerMeter; const y = camera.y + (canvas.height - marginPx - py) / pixelsPerMeter; return { x, y }; }
    function drawGrid(ctx, showGrid) {
      ctx.clearRect(0,0,canvas.width,canvas.height); if (!showGrid) return; ctx.save(); ctx.strokeStyle='rgba(142,160,192,0.15)'; ctx.lineWidth=1;
      const xMin = camera.x, xMax = camera.x + (canvas.width - 2*marginPx) / pixelsPerMeter;
      const yMin = camera.y, yMax = camera.y + (canvas.height - 2*marginPx) / pixelsPerMeter;
      const xi0 = Math.floor(xMin), xi1 = Math.ceil(xMax);
      for (let xm = xi0; xm <= xi1; xm++) {
        const p0 = worldToCanvas({x:xm, y:yMin}); const p1 = worldToCanvas({x:xm, y:yMax});
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        ctx.fillStyle = 'rgba(200,220,255,0.5)'; ctx.font = '11px system-ui';
        ctx.fillText(String(xm), p0.x + 2, canvas.height - marginPx + 14);
      }
      const yi0 = Math.floor(yMin), yi1 = Math.ceil(yMax);
      for (let ym = yi0; ym <= yi1; ym++) {
        const p0 = worldToCanvas({x:xMin, y:ym}); const p1 = worldToCanvas({x:xMax, y:ym});
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        ctx.fillStyle = 'rgba(200,220,255,0.5)'; ctx.font = '11px system-ui';
        ctx.fillText(String(ym), marginPx - 18, p0.y - 2);
      }
      ctx.fillStyle='rgba(200,220,255,0.7)'; ctx.font='12px system-ui';
      ctx.fillText('x (m)', canvas.width - marginPx - 30, canvas.height - marginPx + 24);
      ctx.fillText('y (m)', marginPx - 24, marginPx - 6);
      ctx.restore(); }
    function drawGround(ctx, groundY) { const p0 = worldToCanvas({x:camera.x, y:groundY}); const p1 = worldToCanvas({x:camera.x + (canvas.width-2*marginPx)/pixelsPerMeter,y:groundY}); ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(p0.x,p0.y); ctx.lineTo(p1.x,p1.y); ctx.stroke(); ctx.restore(); }
    function drawSpringScene(ctx, springY) { const y = worldToCanvas({x:0,y:springY}).y; const left=marginPx, right=canvas.width-marginPx; ctx.save(); ctx.strokeStyle='rgba(180,150,255,0.8)'; ctx.lineWidth=2; ctx.beginPath(); const coils=10, amp=8; for(let i=0;i<=coils;i++){ const x=left+(right-left)*(i/coils); const dy=(i%2===0?-amp:amp); ctx.lineTo(x,y+dy);} ctx.stroke(); ctx.restore(); }
    function drawTrace(ctx, trace, color) { if(!trace||trace.length<2)return; ctx.save(); ctx.strokeStyle=color; ctx.lineWidth=1.5; ctx.beginPath(); const p0=worldToCanvas(trace[0]); ctx.moveTo(p0.x,p0.y); for(let i=1;i<trace.length;i++){ const p=worldToCanvas(trace[i]); ctx.lineTo(p.x,p.y);} ctx.stroke(); ctx.restore(); }
    function drawArrow(ctx, from, vec, color, scale=1, label=null) { const start=worldToCanvas(from); const scaled={x:vec.x*scale,y:vec.y*scale}; const end=worldToCanvas({x:from.x+scaled.x,y:from.y+scaled.y}); const dx=end.x-start.x, dy=end.y-start.y; const len=Math.hypot(dx,dy); if(len<2)return; ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(start.x,start.y); ctx.lineTo(end.x,end.y); ctx.stroke(); const angle=Math.atan2(dy,dx); const ah=Math.min(10,0.2*len); ctx.beginPath(); ctx.moveTo(end.x,end.y); ctx.lineTo(end.x-ah*Math.cos(angle-Math.PI/6), end.y-ah*Math.sin(angle-Math.PI/6)); ctx.lineTo(end.x-ah*Math.cos(angle+Math.PI/6), end.y-ah*Math.sin(angle+Math.PI/6)); ctx.closePath(); ctx.fill(); if(label){ ctx.font='12px system-ui'; ctx.fillText(label, end.x+4, end.y-4);} ctx.restore(); }
    function drawMass(ctx, position) { const p=worldToCanvas(position); ctx.save(); ctx.fillStyle='#e7ecf6'; ctx.beginPath(); ctx.arc(p.x,p.y,8,0,Math.PI*2); ctx.fill(); ctx.restore(); }
    function drawExtraBalls(ctx, balls, selectedBallId) {
      if (!balls || balls.length===0) return;
      console.log('Drawing extra balls:', balls.length, 'selected:', selectedBallId);
      ctx.save();
      for (const b of balls) {
        const p = worldToCanvas({x:b.x, y:b.y});
        console.log('Ball', b.id, 'at world pos', b.x, b.y, 'canvas pos', p.x, p.y);
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
    function drawArrowPx(ctx, fromPx, vec, color, scale=1, label=null) { const dx=vec.x*scale, dy=vec.y*scale; const end={x:fromPx.x+dx,y:fromPx.y+dy}; const len=Math.hypot(dx,dy); if(len<2)return; ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(fromPx.x,fromPx.y); ctx.lineTo(end.x,end.y); ctx.stroke(); const angle=Math.atan2(dy,dx); const ah=Math.min(10,0.2*len); ctx.beginPath(); ctx.moveTo(end.x,end.y); ctx.lineTo(end.x-ah*Math.cos(angle-Math.PI/6), end.y-ah*Math.sin(angle-Math.PI/6)); ctx.lineTo(end.x-ah*Math.cos(angle+Math.PI/6), end.y-ah*Math.sin(angle+Math.PI/6)); ctx.closePath(); ctx.fill(); if(label){ ctx.font='12px system-ui'; ctx.fillText(label, end.x+4, end.y-4);} ctx.restore(); }
    function drawCollision(ctx, snapshot) { const c=snapshot.collision; const py=worldToCanvas({x:0,y:0}).y; const p1=worldToCanvas({x:c.x1,y:0}); const p2=worldToCanvas({x:c.x2,y:0}); ctx.save(); ctx.fillStyle='#4db6ff'; ctx.beginPath(); ctx.arc(p1.x,py,10,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#ff9d42'; ctx.beginPath(); ctx.arc(p2.x,py,10,0,Math.PI*2); ctx.fill(); drawArrowPx(ctx,{x:p1.x,y:py},{x:c.v1*pixelsPerMeter*0.2,y:0},'#4db6ff',1,'v1'); drawArrowPx(ctx,{x:p2.x,y:py},{x:c.v2*pixelsPerMeter*0.2,y:0},'#ff9d42',1,'v2'); ctx.fillStyle='rgba(200,220,255,0.9)'; ctx.font='12px system-ui'; ctx.fillText(`m1=${c.m1.toFixed(2)}kg  m2=${c.m2.toFixed(2)}kg  e=${c.e.toFixed(2)}`, marginPx+6, py-36); ctx.fillText(`v1=${c.v1.toFixed(2)} m/s  v2=${c.v2.toFixed(2)} m/s`, marginPx+6, py-20); ctx.restore(); }
    function drawForceComposition(ctx, snapshot) { const origin={x:3,y:2}; const p0=worldToCanvas(origin); const deg2rad=(d)=>d*Math.PI/180; const {f1,a1,f2,a2}=snapshot.forceComp; const v1={x:f1*Math.cos(deg2rad(a1)), y:f1*Math.sin(deg2rad(a1))}; const v2={x:f2*Math.cos(deg2rad(a2)), y:f2*Math.sin(deg2rad(a2))}; const r={x:v1.x+v2.x, y:v1.y+v2.y}; const s=0.03; drawArrow(ctx, origin, v1, '#4db6ff', s, 'F1'); drawArrow(ctx, origin, v2, '#ff9d42', s, 'F2'); drawArrow(ctx, origin, r, '#6df09c', s, 'R'); ctx.save(); ctx.fillStyle='rgba(200,220,255,0.9)'; ctx.font='12px system-ui'; ctx.fillText(`R = (${r.x.toFixed(2)}, ${r.y.toFixed(2)}) N`, p0.x + 8, p0.y - 12); ctx.restore(); }
    function draw(ctx, snapshot, params) {
      drawGrid(ctx, params.showGrid);
      if (snapshot.scenario==='projectile'||snapshot.scenario==='freefall') { drawGround(ctx, snapshot.groundY); }
      else if (snapshot.scenario==='spring') { drawSpringScene(ctx, snapshot.springY); }
      else if (snapshot.scenario==='force') { const p=worldToCanvas({x:3,y:2}); ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.moveTo(p.x-6,p.y); ctx.lineTo(p.x+6,p.y); ctx.moveTo(p.x,p.y-6); ctx.lineTo(p.x,p.y+6); ctx.stroke(); ctx.restore(); }
      else if (snapshot.scenario==='lever') { const cx=canvas.width/2; const y=canvas.height/2; const beamLen=2.8*70; const left=cx-beamLen/2, right=cx+beamLen/2; ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.7)'; ctx.lineWidth=6; ctx.beginPath(); ctx.moveTo(left,y); ctx.lineTo(right,y); ctx.stroke(); ctx.fillStyle='rgba(180,150,255,0.7)'; ctx.beginPath(); ctx.moveTo(cx-12,y+14); ctx.lineTo(cx+12,y+14); ctx.lineTo(cx,y-6); ctx.closePath(); ctx.fill(); const ppm=70; const x1=cx - snapshot.lever.d1 * ppm; const x2=cx + snapshot.lever.d2 * ppm; drawArrowPx(ctx,{x:x1,y:y},{x:0,y:-snapshot.lever.f1},'#4db6ff',0.8,'F1'); drawArrowPx(ctx,{x:x2,y:y},{x:0,y:-snapshot.lever.f2},'#ff9d42',0.8,'F2'); ctx.fillStyle='rgba(200,220,255,0.9)'; ctx.font='12px system-ui'; const tau1=snapshot.lever.f1*snapshot.lever.d1; const tau2=snapshot.lever.f2*snapshot.lever.d2; ctx.fillText(`τ1 = F1·d1 = ${tau1.toFixed(2)} N·m`, left+8, y-40); ctx.fillText(`τ2 = F2·d2 = ${tau2.toFixed(2)} N·m`, left+8, y-24); const eq=Math.abs(tau1-tau2)<1e-2?'平衡':(tau1>tau2?'逆时针':'顺时针'); ctx.fillText(`状态：${eq}`, left+8, y-8); ctx.restore(); }
      if ((snapshot.scenario!=='lever' && snapshot.scenario!=='force') && params.showTrace) { drawTrace(ctx, snapshot.trace, 'rgba(93,205,255,0.9)'); }
      const velScale=0.2, accScale=0.05, forceScale=0.02;
      if (snapshot.scenario==='collision-1d') { drawCollision(ctx, snapshot); }
      else if (snapshot.scenario==='force') { drawForceComposition(ctx, snapshot); }
      else if (snapshot.scenario==='lever') { /* no dot */ }
      else { drawArrow(ctx, snapshot.position, snapshot.forces.gravity, 'rgba(109,240,156,0.9)', forceScale); drawArrow(ctx, snapshot.position, snapshot.forces.spring, '#b496ff', forceScale); drawArrow(ctx, snapshot.position, snapshot.forces.drag, '#ff6b96', forceScale); if (params.showVel) drawArrow(ctx, snapshot.position, snapshot.velocity, '#4db6ff', velScale); if (params.showAcc) drawArrow(ctx, snapshot.position, snapshot.acceleration, '#ff9d42', accScale); drawMass(ctx, snapshot.position); }
    }
    // 绘制额外小球
    if (snapshot.balls && snapshot.balls.length > 0) {
      drawExtraBalls(ctx, snapshot.balls, snapshot.selectedBallId);
    }

    function panByPixels(dx, dy){ camera.x -= dx / pixelsPerMeter; camera.y += dy / pixelsPerMeter; }
    function zoomAt(factor, centerPx){ const before = canvasToWorld(centerPx.x, centerPx.y); pixelsPerMeter = Math.max(5, Math.min(2000, pixelsPerMeter * factor)); const after = canvasToWorld(centerPx.x, centerPx.y); camera.x += (before.x - after.x); camera.y += (before.y - after.y); }
    function resetView(){ camera.x = 0; camera.y = 0; pixelsPerMeter = 70; }
    return { draw, panByPixels, zoomAt, toWorld: canvasToWorld, __reset: resetView };
  }

  // main.js
  function $(selector){ return document.querySelector(selector); }
  const canvas=$('#sim-canvas'); const ctx=canvas.getContext('2d');
  const selectionInfo = document.getElementById('selection-info');
  const ui={ btnPlay:$('#btn-play'), btnPause:$('#btn-pause'), btnStep:$('#btn-step'), btnReset:$('#btn-reset'), btnClearTrace:$('#btn-clear-trace'), scenario:$('#scenario'), mass:$('#mass'), massVal:$('#mass-val'), v0:$('#v0'), v0Val:$('#v0-val'), angle:$('#angle'), angleVal:$('#angle-val'), gravity:$('#gravity'), gravityVal:$('#gravity-val'), drag:$('#drag'), dragVal:$('#drag-val'), springK:$('#spring-k'), springKVal:$('#spring-k-val'), dampingB:$('#damping-b'), dampingBVal:$('#damping-b-val'), uniformU:$('#uniform-u'), uniformUVal:$('#uniform-u-val'), uaU0:$('#ua-u0'), uaU0Val:$('#ua-u0-val'), uaAx:$('#ua-ax'), uaAxVal:$('#ua-ax-val'), colM1:$('#col-m1'), colM1Val:$('#col-m1-val'), colM2:$('#col-m2'), colM2Val:$('#col-m2-val'), colV1:$('#col-v1'), colV1Val:$('#col-v1-val'), colV2:$('#col-v2'), colV2Val:$('#col-v2-val'), colE:$('#col-e'), colEVal:$('#col-e-val'), levF1:$('#lev-f1'), levF1Val:$('#lev-f1-val'), levD1:$('#lev-d1'), levD1Val:$('#lev-d1-val'), levF2:$('#lev-f2'), levF2Val:$('#lev-f2-val'), levD2:$('#lev-d2'), levD2Val:$('#lev-d2-val'), fcompF1:$('#fcomp-f1'), fcompF1Val:$('#fcomp-f1-val'), fcompA1:$('#fcomp-a1'), fcompA1Val:$('#fcomp-a1-val'), fcompF2:$('#fcomp-f2'), fcompF2Val:$('#fcomp-f2-val'), fcompA2:$('#fcomp-a2'), fcompA2Val:$('#fcomp-a2-val'), timeScale:$('#time-scale'), timeScaleVal:$('#time-scale-val'), showVel:$('#show-vel'), showAcc:$('#show-acc'), showTrace:$('#show-trace'), showGrid:$('#show-grid'), stat:{ t:$('#stat-t'), pos:$('#stat-pos'), vel:$('#stat-vel'), acc:$('#stat-acc'), mag:$('#stat-mag'), ek:$('#stat-ek'), ep:$('#stat-ep'), em:$('#stat-em'), p:$('#stat-p') } };
  const state={ isPlaying:false, lastTimestampMs:null, timeScale:1 };
  const physics=createPhysicsWorld(); const renderer=createRenderer(canvas);
  const speedChart=createSparklineChart($('#chart-speed'),{lineColor:'#4db6ff', yLabel:'|v| (m/s)'}); const accChart=createSparklineChart($('#chart-acc'),{lineColor:'#ff9d42', yLabel:'|a| (m/s²)'});
  function initUI(){
    const bindRange=(inputEl,outputEl,fmt=(v)=>v)=>{ if(!inputEl||!outputEl) return; const commit=()=>{ outputEl.textContent=fmt(Number(inputEl.value)); }; inputEl.addEventListener('input',commit); commit(); };
    bindRange(ui.mass,ui.massVal,(v)=>v.toFixed(1)); bindRange(ui.v0,ui.v0Val,(v)=>v.toFixed(0)); bindRange(ui.angle,ui.angleVal,(v)=>v.toFixed(0)); bindRange(ui.gravity,ui.gravityVal,(v)=>v.toFixed(1)); bindRange(ui.drag,ui.dragVal,(v)=>v.toFixed(3)); bindRange(ui.springK,ui.springKVal,(v)=>v.toFixed(0)); bindRange(ui.dampingB,ui.dampingBVal,(v)=>v.toFixed(1)); bindRange(ui.uniformU,ui.uniformUVal,(v)=>v.toFixed(1)); bindRange(ui.uaU0,ui.uaU0Val,(v)=>v.toFixed(1)); bindRange(ui.uaAx,ui.uaAxVal,(v)=>v.toFixed(1)); bindRange(ui.colM1,ui.colM1Val,(v)=>v.toFixed(1)); bindRange(ui.colM2,ui.colM2Val,(v)=>v.toFixed(1)); bindRange(ui.colV1,ui.colV1Val,(v)=>v.toFixed(1)); bindRange(ui.colV2,ui.colV2Val,(v)=>v.toFixed(1)); bindRange(ui.colE,ui.colEVal,(v)=>v.toFixed(2)); bindRange(ui.levF1,ui.levF1Val,(v)=>v.toFixed(0)); bindRange(ui.levD1,ui.levD1Val,(v)=>v.toFixed(1)); bindRange(ui.levF2,ui.levF2Val,(v)=>v.toFixed(0)); bindRange(ui.levD2,ui.levD2Val,(v)=>v.toFixed(1)); bindRange(ui.fcompF1,ui.fcompF1Val,(v)=>v.toFixed(0)); bindRange(ui.fcompA1,ui.fcompA1Val,(v)=>v.toFixed(0)); bindRange(ui.fcompF2,ui.fcompF2Val,(v)=>v.toFixed(0)); bindRange(ui.fcompA2,ui.fcompA2Val,(v)=>v.toFixed(0)); bindRange(ui.timeScale,ui.timeScaleVal,(v)=>v.toFixed(1)+'×');
    ui.scenario.addEventListener('change',()=>{ updateScopeVisibility(); resetSimulation(); hideBallEditPanel(); });
    [ui.mass,ui.v0,ui.angle,ui.gravity,ui.drag,ui.springK,ui.dampingB, ui.uniformU,ui.uaU0,ui.uaAx, ui.colM1,ui.colM2,ui.colV1,ui.colV2,ui.colE, ui.levF1,ui.levD1,ui.levF2,ui.levD2, ui.fcompF1,ui.fcompA1,ui.fcompF2,ui.fcompA2].forEach(el=>{ el&&el.addEventListener('change',()=>{ resetSimulation(); }); });
    ui.timeScale.addEventListener('input',()=>{ state.timeScale=Number(ui.timeScale.value); });
    ui.btnPlay.addEventListener('click',()=>{ state.isPlaying=true; }); ui.btnPause.addEventListener('click',()=>{ state.isPlaying=false; }); ui.btnStep.addEventListener('click',()=>{ stepOnce(); }); ui.btnReset.addEventListener('click',()=>{ resetSimulation(); }); ui.btnClearTrace.addEventListener('click',()=>{ physics.clearTrace(); });
    const btnAddBall = document.getElementById('btn-add-ball');
    const btnClearBalls = document.getElementById('btn-clear-balls');
    const btnApplyBallParams = document.getElementById('btn-apply-ball-params');
    console.log('Button elements found:', { btnAddBall: !!btnAddBall, btnClearBalls: !!btnClearBalls, btnApplyBallParams: !!btnApplyBallParams });
    if (btnAddBall) btnAddBall.addEventListener('click', ()=>{ 
      console.log('Add ball button clicked!');
      const params = collectParams();
      console.log('Collected params:', params);
      const id = physics.addBallFromParams(params); 
      console.log('Added ball with id:', id);
      const snap = physics.getSnapshot();
      console.log('Current balls:', snap.balls);
      console.log('Total balls count:', snap.balls.length);
    });
    if (btnClearBalls) btnClearBalls.addEventListener('click', ()=>{ physics.clearBalls(); hideBallEditPanel(); });
    if (btnApplyBallParams) btnApplyBallParams.addEventListener('click', ()=>{ applyBallParams(); });
    [ui.showVel,ui.showAcc,ui.showTrace,ui.showGrid].forEach(el=>{ el&&el.addEventListener('change',()=>{}); });
    updateScopeVisibility();
    bindNumberInputs();
    bindBallEditInputs();
    bindCanvasSelection();
    bindPanZoom();
  }
  function bindNumberInputs(){
    const pairs = [
      ['mass','mass-num'], ['v0','v0-num'], ['angle','angle-num'], ['spring-k','spring-k-num'], ['damping-b','damping-b-num'],
      ['uniform-u','uniform-u-num'], ['ua-u0','ua-u0-num'], ['ua-ax','ua-ax-num'],
      ['col-m1','col-m1-num'], ['col-m2','col-m2-num'], ['col-v1','col-v1-num'], ['col-v2','col-v2-num'], ['col-e','col-e-num'],
      ['lev-f1','lev-f1-num'], ['lev-d1','lev-d1-num'], ['lev-f2','lev-f2-num'], ['lev-d2','lev-d2-num']
    ];
    // 环境参数与时间倍率
    pairs.push(['gravity','gravity-num']);
    pairs.push(['drag','drag-num']);
    pairs.push(['time-scale','time-scale-num']);
    for (const [rangeId, numId] of pairs) {
      const r = document.getElementById(rangeId); const n = document.getElementById(numId);
      if (!r || !n) continue;
      const sync = (from, to) => { to.value = from.value; };
      r.addEventListener('input', ()=>{ sync(r,n); });
      n.addEventListener('input', ()=>{ sync(n,r); });
      n.addEventListener('change', ()=>{ if (rangeId==='time-scale') { state.timeScale = Number(n.value); } else { resetSimulation(); } });
    }
  }
  function bindCanvasSelection(){
    function hitTest(px, py, snap){
      const radiusPx = 18;
      if (snap.scenario === 'collision-1d') {
        const y = canvas.height/2; const x1 = marginPx + snap.collision.x1 * ppm; const x2 = marginPx + snap.collision.x2 * ppm;
        if (Math.hypot(px - x1, py - y) <= radiusPx) return {type:'c1'};
        if (Math.hypot(px - x2, py - y) <= radiusPx) return {type:'c2'};
        return null;
      } else if (snap.scenario === 'lever' || snap.scenario === 'force') {
        return null;
      } else {
        // 使用renderer的坐标转换函数
        const mainPos = renderer.toWorld(px, py);
        const mainDist = Math.hypot(mainPos.x - snap.position.x, mainPos.y - snap.position.y);
        if (mainDist * 70 <= radiusPx) return {type:'main'};
        
        // 检查额外小球
        if (snap.balls && snap.balls.length > 0) {
          for (const ball of snap.balls) {
            const ballDist = Math.hypot(mainPos.x - ball.x, mainPos.y - ball.y);
            if (ballDist * 70 <= radiusPx) return {type:'ball', id: ball.id};
          }
        }
        return null;
      }
    }
    canvas.addEventListener('mousemove', (ev)=>{
      const rect = canvas.getBoundingClientRect(); const px = ev.clientX - rect.left; const py = ev.clientY - rect.top;
      const snap = physics.getSnapshot(); const hit = hitTest(px, py, snap);
      canvas.style.cursor = hit ? 'pointer' : 'default';
    });
    canvas.addEventListener('click', (ev)=>{
      const rect = canvas.getBoundingClientRect(); const px = ev.clientX - rect.left; const py = ev.clientY - rect.top;
      const snap = physics.getSnapshot(); const hit = hitTest(px, py, snap);
      if (hit) {
        if (hit.type === 'ball') {
          physics.selectBall(hit.id);
          showSelectionInfo(snap, hit);
          showBallEditPanel(hit.id);
        } else {
          physics.selectBall(null);
          showSelectionInfo(snap, hit);
          hideBallEditPanel();
        }
      } else {
        physics.selectBall(null);
        hideSelectionInfo();
        hideBallEditPanel();
      }
    });
  }
  function showSelectionInfo(snap, hit){
    if (!selectionInfo) return;
    selectionInfo.style.display = 'block';
    if (hit.type === 'c1' || hit.type === 'c2') {
      const c = snap.collision; const label = hit.type==='c1' ? '球1' : '球2';
      const v = hit.type==='c1' ? c.v1 : c.v2; const x = hit.type==='c1' ? c.x1 : c.x2; const m = hit.type==='c1' ? c.m1 : c.m2;
      selectionInfo.textContent = `${label}\n位置 x: ${x.toFixed(2)} m\n速度 v: ${v.toFixed(2)} m/s\n质量 m: ${m.toFixed(2)} kg`;
    } else if (hit.type === 'ball') {
      const ball = snap.balls.find(b => b.id === hit.id);
      if (ball) {
        selectionInfo.textContent = `小球 ${ball.id.slice(0,4)}\n位置 (x,y): (${ball.x.toFixed(2)}, ${ball.y.toFixed(2)}) m\n速度 (vx,vy): (${ball.vx.toFixed(2)}, ${ball.vy.toFixed(2)}) m/s\n质量 m: ${ball.m.toFixed(2)} kg`;
      }
    } else {
      selectionInfo.textContent = `位置 (x,y): (${snap.position.x.toFixed(2)}, ${snap.position.y.toFixed(2)}) m\n速度 (vx,vy): (${snap.velocity.x.toFixed(2)}, ${snap.velocity.y.toFixed(2)}) m/s\n加速度 (ax,ay): (${snap.acceleration.x.toFixed(2)}, ${snap.acceleration.y.toFixed(2)}) m/s²`;
    }
  }
  function hideSelectionInfo(){ if (selectionInfo) selectionInfo.style.display='none'; }
  
  function showBallEditPanel(ballId) {
    const panel = document.getElementById('ball-edit-panel');
    if (!panel) return;
    
    const ball = physics.getSelectedBall();
    if (!ball) return;
    
    // 确保ball.params存在
    if (!ball.params) {
      ball.params = { massKg: ball.m, v0: 20, angleDeg: 45 };
    }
    
    const scenario = collectParams().scenario;
    
    // 根据场景显示不同的参数
    const massRow = panel.querySelector('.row[data-param="mass"]');
    const v0Row = panel.querySelector('.row[data-param="v0"]');
    const angleRow = panel.querySelector('.row[data-param="angle"]');
    
    if (massRow) massRow.style.display = 'block';
    if (v0Row) v0Row.style.display = scenario === 'projectile' ? 'block' : 'none';
    if (angleRow) angleRow.style.display = scenario === 'projectile' ? 'block' : 'none';
    
    // 设置当前参数值
    const massEl = document.getElementById('ball-mass');
    const massValEl = document.getElementById('ball-mass-val');
    const massNumEl = document.getElementById('ball-mass-num');
    const v0El = document.getElementById('ball-v0');
    const v0ValEl = document.getElementById('ball-v0-val');
    const v0NumEl = document.getElementById('ball-v0-num');
    const angleEl = document.getElementById('ball-angle');
    const angleValEl = document.getElementById('ball-angle-val');
    const angleNumEl = document.getElementById('ball-angle-num');
    
    if (massEl && massValEl && massNumEl) {
      massEl.value = ball.params.massKg || 1;
      massValEl.textContent = (ball.params.massKg || 1).toFixed(1);
      massNumEl.value = ball.params.massKg || 1;
    }
    
    if (v0El && v0ValEl && v0NumEl) {
      const v0 = ball.params.v0 || 20;
      v0El.value = v0;
      v0ValEl.textContent = v0.toFixed(0);
      v0NumEl.value = v0;
    }
    
    if (angleEl && angleValEl && angleNumEl) {
      const angle = ball.params.angleDeg || 45;
      angleEl.value = angle;
      angleValEl.textContent = angle.toFixed(0);
      angleNumEl.value = angle;
    }
    
    panel.style.display = 'block';
  }
  
  function hideBallEditPanel() {
    const panel = document.getElementById('ball-edit-panel');
    if (panel) panel.style.display = 'none';
  }
  
  function applyBallParams() {
    const selectedBall = physics.getSelectedBall();
    if (!selectedBall) return;
    
    const massEl = document.getElementById('ball-mass');
    const v0El = document.getElementById('ball-v0');
    const angleEl = document.getElementById('ball-angle');
    
    if (!massEl) return;
    
    const scenario = collectParams().scenario;
    const newParams = {
      massKg: Number(massEl.value),
      // 保持其他参数不变
      g: collectParams().g,
      dragC: collectParams().dragC,
      scenario: scenario
    };
    
    // 只在抛体运动场景下添加v0和angle参数
    if (scenario === 'projectile' && v0El && angleEl) {
      newParams.v0 = Number(v0El.value);
      newParams.angleDeg = Number(angleEl.value);
    }
    
    physics.updateBallParams(selectedBall.id, newParams);
    
    // 更新显示
    const snap = physics.getSnapshot();
    updateStats(snap, collectParams());
  }
  
  function bindBallEditInputs() {
    const pairs = [
      ['ball-mass', 'ball-mass-val', 'ball-mass-num'],
      ['ball-v0', 'ball-v0-val', 'ball-v0-num'],
      ['ball-angle', 'ball-angle-val', 'ball-angle-num']
    ];
    
    for (const [rangeId, valId, numId] of pairs) {
      const r = document.getElementById(rangeId);
      const v = document.getElementById(valId);
      const n = document.getElementById(numId);
      
      if (!r || !v || !n) continue;
      
      const sync = (from, to) => { to.value = from.value; };
      const updateVal = () => { v.textContent = Number(r.value).toFixed(r.step === '0.1' ? 1 : 0); };
      
      r.addEventListener('input', () => { sync(r, n); updateVal(); });
      n.addEventListener('input', () => { sync(n, r); updateVal(); });
    }
  }
  function bindPanZoom(){
    let isPanning = false; let last = {x:0,y:0};
    canvas.addEventListener('mousedown', (e)=>{ isPanning = true; last = {x:e.clientX, y:e.clientY}; });
    window.addEventListener('mouseup', ()=>{ isPanning = false; });
    window.addEventListener('mousemove', (e)=>{ if (!isPanning) return; const dx = e.clientX - last.x; const dy = e.clientY - last.y; last = {x:e.clientX, y:e.clientY}; renderer.panByPixels(dx, dy); });
    canvas.addEventListener('wheel', (e)=>{ e.preventDefault(); const factor = e.deltaY < 0 ? 1.1 : 0.9; const rect = canvas.getBoundingClientRect(); const center = { x: e.clientX - rect.left, y: e.clientY - rect.top }; renderer.zoomAt(factor, center); }, { passive:false });
    const btnResetView = document.getElementById('btn-view-reset');
    if (btnResetView) btnResetView.addEventListener('click', ()=>{ renderer.zoomAt(1, {x:canvas.width/2, y:canvas.height/2}); renderer.panByPixels(0,0); renderer.__reset && renderer.__reset(); });
  }
  function updateScopeVisibility(){ const scenario=ui.scenario.value; document.querySelectorAll('[data-scope]').forEach(el=>{ const scope=el.getAttribute('data-scope'); el.style.display=(scope===scenario)?'grid':'none'; }); }
  function collectParams(){ return { scenario:ui.scenario.value, massKg:Number(ui.mass.value), g:Number(ui.gravity.value), dragC:Number(ui.drag.value), v0:Number(ui.v0.value), angleDeg:Number(ui.angle.value), springK:Number(ui.springK.value), dampingB:Number(ui.dampingB.value), uniformU: ui.uniformU?Number(ui.uniformU.value):0, uaU0: ui.uaU0?Number(ui.uaU0.value):0, uaAx: ui.uaAx?Number(ui.uaAx.value):0, colM1: ui.colM1?Number(ui.colM1.value):2, colM2: ui.colM2?Number(ui.colM2.value):3, colV1: ui.colV1?Number(ui.colV1.value):5, colV2: ui.colV2?Number(ui.colV2.value):-3, colE: ui.colE?Number(ui.colE.value):1, levF1: ui.levF1?Number(ui.levF1.value):20, levD1: ui.levD1?Number(ui.levD1.value):1.5, levF2: ui.levF2?Number(ui.levF2.value):20, levD2: ui.levD2?Number(ui.levD2.value):1.5, fcompF1: ui.fcompF1?Number(ui.fcompF1.value):30, fcompA1: ui.fcompA1?Number(ui.fcompA1.value):0, fcompF2: ui.fcompF2?Number(ui.fcompF2.value):20, fcompA2: ui.fcompA2?Number(ui.fcompA2.value):90, showVel:ui.showVel.checked, showAcc:ui.showAcc.checked, showTrace:ui.showTrace.checked, showGrid:ui.showGrid.checked }; }
  function resetSimulation(){ const params=collectParams(); physics.reset(params); speedChart.reset(); accChart.reset(); state.lastTimestampMs=null; state.isPlaying=false; drawFrame(0); }
  function stepOnce(){ const dt=1/60; const params=collectParams(); const simStep=physics.step(dt,params); pushCharts(simStep); drawFrame(dt); }
  function pushCharts(simStep){ if(!simStep) return; const speed=Math.hypot(simStep.velocity.x, simStep.velocity.y); const accMag=Math.hypot(simStep.acceleration.x, simStep.acceleration.y); speedChart.push(speed); accChart.push(accMag); }
  function loop(timestampMs){ if(state.lastTimestampMs==null) state.lastTimestampMs=timestampMs; const rawDt=Math.min(0.05,(timestampMs-state.lastTimestampMs)/1000); state.lastTimestampMs=timestampMs; const params=collectParams(); const dt=rawDt*state.timeScale; if(state.isPlaying){ const simStep=physics.step(dt,params); pushCharts(simStep); drawFrame(dt);} else { drawFrame(0);} requestAnimationFrame(loop); }
  function drawFrame(dt){ const params=collectParams(); const snap=physics.getSnapshot(); renderer.draw(ctx, snap, params); updateStats(snap, params); }
  function updateStats(snap, params){ const stat=ui.stat; if(!stat||!stat.t) return; stat.t.textContent=snap.time.toFixed(2); stat.pos.textContent=`(${snap.position.x.toFixed(2)}, ${snap.position.y.toFixed(2)})`; stat.vel.textContent=`(${snap.velocity.x.toFixed(2)}, ${snap.velocity.y.toFixed(2)})`; stat.acc.textContent=`(${snap.acceleration.x.toFixed(2)}, ${snap.acceleration.y.toFixed(2)})`; const vmag=Math.hypot(snap.velocity.x, snap.velocity.y); const amag=Math.hypot(snap.acceleration.x, snap.acceleration.y); stat.mag.textContent=`${vmag.toFixed(2)} / ${amag.toFixed(2)}`; const Ek=0.5*(snap.massKg??1)*vmag*vmag; const g=params.g??9.8; const Ep=(snap.scenario==='projectile'||snap.scenario==='freefall') ? (snap.massKg*g*(snap.position.y - snap.groundY)) : 0; const Em=Ek+Ep; stat.ek.textContent=Ek.toFixed(2); stat.ep.textContent=Ep.toFixed(2); stat.em.textContent=Em.toFixed(2); if(stat.p && snap.scenario==='collision-1d'){ const c=snap.collision; const p=c.m1*c.v1 + c.m2*c.v2; stat.p.textContent=p.toFixed(2); } }
  // start
  console.log('Physics simulation starting...');
  initUI(); 
  console.log('UI initialized');
  resetSimulation(); 
  console.log('Simulation reset');
  requestAnimationFrame(loop);
  console.log('Animation loop started');
})();


