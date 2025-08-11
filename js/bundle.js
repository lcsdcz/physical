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

  // physics.js - 重新设计的物理引擎
  function createPhysicsWorld() {
    const state = {
      scenario: 'projectile',
      time: 0,
      groundY: 0,
      springY: 1.8,
      gravity: 9.8,
      dragCoeff: 0.02,
      springK: 50,
      dampingB: 0.5,
      // 统一的物体管理
      objects: [], // 所有物理对象的数组
      selectedId: null,
      // 专门场景的数据
      collision: { m1:2, m2:3, v1:5, v2:-3, e:1, x1:3, x2:7, done:false },
      lever: { f1:20, d1:1.5, f2:20, d2:1.5 },
      forceComp: { f1:30, a1:0, f2:20, a2:90 },
    };
    // 创建物理对象的工厂函数
    function createObject(type, params, motionType = null) {
      const id = Math.random().toString(36).slice(2, 8);
      const obj = {
        id,
        type, // 'ball', 'main' 等
        motionType: motionType || state.scenario, // 独立的运动类型
        x: 0, y: 0,
        vx: 0, vy: 0,
        ax: 0, ay: 0,
        mass: params.massKg || 1,
        radius: 0.15, // 物理半径(米)
        color: type === 'main' ? '#e7ecf6' : '#4db6ff',
        trace: [],
        params: { ...params },
        // 独立的物理参数
        gravity: params.g || 9.8,
        dragCoeff: params.dragC || 0.02,
        springK: params.springK || 50,
        dampingB: params.dampingB || 0.5,
        springCenter: 5.0, // 弹簧平衡位置
        isActive: true // 是否参与物理计算
      };
      
      // 根据运动类型设置初始状态
      setInitialState(obj, params);
      
      return obj;
    }
    
    // 设置对象的初始状态
    function setInitialState(obj, params) {
      switch (obj.motionType) {
        case 'projectile':
          const angleRad = (params.angleDeg || 45) * Math.PI / 180;
          const v0 = params.v0 || 20;
          obj.x = 0; obj.y = 0;
          obj.vx = v0 * Math.cos(angleRad);
          obj.vy = v0 * Math.sin(angleRad);
          break;
        case 'freefall':
          obj.x = 6; obj.y = 6;
          obj.vx = 0; obj.vy = 0;
          break;
        case 'spring':
          obj.x = obj.springCenter + 1; 
          obj.y = state.springY;
          obj.vx = 0; obj.vy = 0;
          break;
        case 'uniform':
          obj.x = 1; obj.y = 1;
          obj.vx = params.uniformU || 5; 
          obj.vy = 0;
          break;
        case 'uniform-accel':
          obj.x = 1; obj.y = 1;
          obj.vx = params.uaU0 || 0; 
          obj.vy = 0;
          break;
        case 'static':
          obj.vx = 0; obj.vy = 0;
          break;
        default:
          obj.x = 0; obj.y = 0;
          obj.vx = 0; obj.vy = 0;
      }
    }

    function reset(params) {
      state.scenario = params.scenario || 'projectile';
      state.time = 0;
      state.gravity = params.g || 9.8;
      state.dragCoeff = params.dragC || 0.02;
      state.springK = params.springK || 50;
      state.dampingB = params.dampingB || 0.5;
      
      // 清空所有对象（保持选中的除外）
      state.objects = [];
      state.selectedId = null;
      
      // 创建主要演示对象
      if (['projectile', 'freefall', 'spring', 'uniform', 'uniform-accel'].includes(state.scenario)) {
        const mainObj = createObject('main', params);
        mainObj.color = '#e7ecf6';
        state.objects.push(mainObj);
      }
      
      // 设置场景特定数据
      if (state.scenario === 'collision-1d') {
        state.collision = {
          m1: params.colM1 || 2, m2: params.colM2 || 3,
          v1: params.colV1 || 5, v2: params.colV2 || -3,
          e: params.colE || 1, x1: 2, x2: 8, done: false
        };
      } else if (state.scenario === 'lever') {
        state.lever = {
          f1: params.levF1 || 20, d1: params.levD1 || 1.5,
          f2: params.levF2 || 20, d2: params.levD2 || 1.5
        };
      } else if (state.scenario === 'force') {
        state.forceComp = {
          f1: params.fcompF1 || 30, a1: params.fcompA1 || 0,
          f2: params.fcompF2 || 20, a2: params.fcompA2 || 90
        };
      }
    }
    // 清除轨迹
    function clearTrace() { 
      state.objects.forEach(obj => obj.trace = []);
    }
    
    // 计算单个对象的受力（基于对象的独立运动类型）
    function computeForces(obj) {
      const forces = { gravity: {x:0,y:0}, drag: {x:0,y:0}, spring: {x:0,y:0}, external: {x:0,y:0} };
      
      if (!obj.isActive) return { total: forces.gravity, ...forces };
      
      // 根据对象的运动类型计算力
      switch (obj.motionType) {
        case 'projectile':
          // 重力 + 空气阻力
          forces.gravity = { x: 0, y: -obj.mass * obj.gravity };
          forces.drag = { x: -obj.dragCoeff * obj.vx, y: -obj.dragCoeff * obj.vy };
          break;
          
        case 'freefall':
          // 只有重力
          forces.gravity = { x: 0, y: -obj.mass * obj.gravity };
          break;
          
        case 'spring':
          // 弹力 + 阻尼
          const displacement = obj.x - obj.springCenter;
          forces.spring = { 
            x: -obj.springK * displacement - obj.dampingB * obj.vx, 
            y: 0 
          };
          forces.drag = { x: -obj.dragCoeff * obj.vx, y: 0 };
          break;
          
        case 'uniform':
          // 匀速运动，无外力
          break;
          
        case 'uniform-accel':
          // 恒定加速度
          const accel = obj.params.uaAx || 2;
          forces.external = { x: obj.mass * accel, y: 0 };
          break;
          
        case 'static':
          // 静止，无力
          break;
          
        default:
          // 自由运动，无外力
          break;
      }
      
      // 计算总力
      const total = {
        x: forces.gravity.x + forces.drag.x + forces.spring.x + forces.external.x,
        y: forces.gravity.y + forces.drag.y + forces.spring.y + forces.external.y
      };
      
      return { total, ...forces };
    }
    // 物理积分 - 更新所有对象
    function integrate(dt, params) {
      state.time += dt;
      
      // 特殊场景处理
      if (state.scenario === 'collision-1d') {
        return handleCollisionScenario(dt);
      }
      if (state.scenario === 'lever' || state.scenario === 'force') {
        return snapshot();
      }
      
      // 更新所有物理对象
      state.objects.forEach(obj => {
        if (obj.type === 'ball' || obj.type === 'main') {
          updateObject(obj, dt);
        }
      });
      
      return snapshot();
    }
    
    // 更新单个物体
    function updateObject(obj, dt) {
      if (!obj.isActive) return;
      
      const forces = computeForces(obj);
      
      // 计算加速度
      obj.ax = forces.total.x / obj.mass;
      obj.ay = forces.total.y / obj.mass;
      
      // 特殊运动类型处理
      if (obj.motionType === 'uniform') {
        // 匀速运动：速度不变
        obj.ax = 0; obj.ay = 0;
      } else if (obj.motionType === 'static') {
        // 静止：位置和速度不变
        obj.ax = 0; obj.ay = 0;
        obj.vx = 0; obj.vy = 0;
        obj.forces = forces;
        return;
      }
      
      // 欧拉积分
      obj.vx += obj.ax * dt;
      obj.vy += obj.ay * dt;
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      
      // 根据运动类型应用边界条件
      applyBoundaryConditions(obj);
      
      // 记录轨迹
      obj.trace.push({ x: obj.x, y: obj.y });
      if (obj.trace.length > 1000) obj.trace.shift();
      
      // 存储力信息用于显示
      obj.forces = forces;
    }
    
    // 应用边界条件
    function applyBoundaryConditions(obj) {
      switch (obj.motionType) {
        case 'projectile':
        case 'freefall':
          // 地面碰撞
          if (obj.y < state.groundY) {
            obj.y = state.groundY;
            obj.vy = Math.max(0, obj.vy); // 防止穿透地面
          }
          break;
          
        case 'spring':
          // 约束在弹簧水平线上
          obj.y = state.springY;
          break;
          
        case 'uniform':
        case 'uniform-accel':
          // 可以自由移动，但可选择添加边界
          break;
      }
    }
    
    // 处理碰撞场景
    function handleCollisionScenario(dt) {
      const c = state.collision;
      if (!c.done) {
        c.x1 += c.v1 * dt;
        c.x2 += c.v2 * dt;
        if (c.x1 >= c.x2) {
          // 碰撞计算
          const m1 = c.m1, m2 = c.m2, u1 = c.v1, u2 = c.v2, e = c.e;
          c.v1 = (m1*u1 + m2*u2 - m2*e*(u1 - u2)) / (m1 + m2);
          c.v2 = c.v1 + e*(u1 - u2);
          c.x1 = (c.x1 + c.x2) / 2 - 0.01;
          c.x2 = c.x1 + 0.02;
          c.done = true;
        }
      } else {
        c.x1 += c.v1 * dt;
        c.x2 += c.v2 * dt;
      }
      return snapshot();
    }
    // 对象管理函数
    function addObject(x, y, params, motionType = null) {
      const obj = createObject('ball', params, motionType);
      obj.x = x;
      obj.y = y;
      obj.color = '#4db6ff';
      state.objects.push(obj);
      return obj.id;
    }
    
    function removeObject(id) {
      state.objects = state.objects.filter(obj => obj.id !== id);
      if (state.selectedId === id) state.selectedId = null;
    }
    
    function clearObjects() {
      state.objects = state.objects.filter(obj => obj.type === 'main');
      state.selectedId = null;
    }
    
    function selectObject(id) {
      state.selectedId = id;
    }
    
    function getSelectedObject() {
      return state.objects.find(obj => obj.id === state.selectedId);
    }
    
    function updateObjectParams(id, newParams) {
      const obj = state.objects.find(o => o.id === id);
      if (obj) {
        obj.params = { ...newParams };
        obj.mass = newParams.massKg || 1;
        
        // 更新运动类型
        if (newParams.motionType && newParams.motionType !== obj.motionType) {
          obj.motionType = newParams.motionType;
          // 重置初始状态（可选）
          if (newParams.resetState) {
            setInitialState(obj, newParams);
          }
        }
        
        // 更新独立的物理参数
        if (newParams.gravity !== undefined) obj.gravity = newParams.gravity;
        if (newParams.dragCoeff !== undefined) obj.dragCoeff = newParams.dragCoeff;
        if (newParams.springK !== undefined) obj.springK = newParams.springK;
        if (newParams.dampingB !== undefined) obj.dampingB = newParams.dampingB;
        if (newParams.springCenter !== undefined) obj.springCenter = newParams.springCenter;
        if (newParams.isActive !== undefined) obj.isActive = newParams.isActive;
      }
    }
    
    // 生成快照用于渲染和图表
    function snapshot() {
      const mainObj = state.objects.find(obj => obj.type === 'main');
      
      return {
        time: state.time,
        scenario: state.scenario,
        groundY: state.groundY,
        springY: state.springY,
        // 主对象数据（兼容原有接口）
        position: mainObj ? { x: mainObj.x, y: mainObj.y } : { x: 0, y: 0 },
        velocity: mainObj ? { x: mainObj.vx, y: mainObj.vy } : { x: 0, y: 0 },
        acceleration: mainObj ? { x: mainObj.ax, y: mainObj.ay } : { x: 0, y: 0 },
        forces: mainObj?.forces || { total: {x:0,y:0}, gravity: {x:0,y:0}, drag: {x:0,y:0}, spring: {x:0,y:0} },
        trace: mainObj?.trace || [],
        massKg: mainObj?.mass || 1,
        // 所有对象
        objects: state.objects.slice(),
        selectedId: state.selectedId,
        // 特殊场景数据
        collision: { ...state.collision },
        lever: { ...state.lever },
        forceComp: { ...state.forceComp },
      };
    }
    
    return { 
      reset, 
      clearTrace, 
      step: integrate, 
      getSnapshot: snapshot,
      addObject,
      removeObject, 
      clearObjects, 
      selectObject, 
      getSelectedObject, 
      updateObjectParams 
    };
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
    // 绘制物理对象
    function drawObjects(ctx, objects, selectedId) {
      if (!objects || objects.length === 0) return;
      
      ctx.save();
      for (const obj of objects) {
        const pos = worldToCanvas({ x: obj.x, y: obj.y });
        const isSelected = obj.id === selectedId;
        
        // 绘制对象
        ctx.fillStyle = isSelected ? '#ff9d42' : obj.color;
        ctx.beginPath();
        const radius = obj.type === 'main' ? 8 : 6;
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // 绘制选中标记
        if (isSelected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, radius + 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        
        // 绘制ID标签（可选）
        if (obj.type === 'ball') {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.font = '10px system-ui';
          ctx.fillText(obj.id.slice(0, 3), pos.x + 10, pos.y - 10);
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
      else { 
        // 绘制所有物理对象
        drawObjects(ctx, snapshot.objects, snapshot.selectedId);
        
        // 绘制轨迹
        if (params.showTrace) {
          snapshot.objects.forEach(obj => {
            if (obj.trace && obj.trace.length > 1) {
              const color = obj.id === snapshot.selectedId ? 'rgba(255, 157, 66, 0.9)' : 'rgba(93, 205, 255, 0.6)';
              drawTrace(ctx, obj.trace, color);
            }
          });
        }
        
        // 绘制选中对象的矢量
        const selectedObj = snapshot.objects.find(obj => obj.id === snapshot.selectedId) || 
                           snapshot.objects.find(obj => obj.type === 'main');
        
        if (selectedObj && selectedObj.forces) {
          const pos = { x: selectedObj.x, y: selectedObj.y };
          drawArrow(ctx, pos, selectedObj.forces.gravity, 'rgba(109,240,156,0.9)', forceScale);
          drawArrow(ctx, pos, selectedObj.forces.spring, '#b496ff', forceScale);
          drawArrow(ctx, pos, selectedObj.forces.drag, '#ff6b96', forceScale);
          if (params.showVel) drawArrow(ctx, pos, { x: selectedObj.vx, y: selectedObj.vy }, '#4db6ff', velScale);
          if (params.showAcc) drawArrow(ctx, pos, { x: selectedObj.ax, y: selectedObj.ay }, '#ff9d42', accScale);
        }
      }
    }
    function panByPixels(dx, dy){ camera.x -= dx / pixelsPerMeter; camera.y += dy / pixelsPerMeter; }
    function zoomAt(factor, centerPx){ const before = canvasToWorld(centerPx.x, centerPx.y); pixelsPerMeter = Math.max(5, Math.min(2000, pixelsPerMeter * factor)); const after = canvasToWorld(centerPx.x, centerPx.y); camera.x += (before.x - after.x); camera.y += (before.y - after.y); }
    function resetView(){ camera.x = 0; camera.y = 0; pixelsPerMeter = 70; }
    return { draw, panByPixels, zoomAt, toWorld: canvasToWorld, worldToCanvas, __reset: resetView };
  }

  // main.js
  function $(selector){ return document.querySelector(selector); }
  const canvas=$('#sim-canvas'); const ctx=canvas.getContext('2d');
  const selectionInfo = document.getElementById('selection-info');
  let isPlacingBall = false;
  let hasMoved = false;
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
    if (btnAddBall) btnAddBall.addEventListener('click', ()=>{
      isPlacingBall = true;
      if (selectionInfo) { 
        selectionInfo.style.display='block'; 
        selectionInfo.textContent='点击画布任意位置放置新小球'; 
      }
      canvas.style.cursor = 'crosshair';
      btnAddBall.style.backgroundColor = '#ff6b6b';
      btnAddBall.textContent = '点击画布放置...';
    });
    if (btnClearBalls) btnClearBalls.addEventListener('click', ()=>{ physics.clearObjects(); hideBallEditPanel(); });
    if (btnApplyBallParams) btnApplyBallParams.addEventListener('click', ()=>{ applyBallParams(); });
    
    // 重置运动按钮
    const btnResetBallMotion = document.getElementById('btn-reset-ball-motion');
    if (btnResetBallMotion) btnResetBallMotion.addEventListener('click', ()=>{
      const selectedObj = physics.getSelectedObject();
      if (selectedObj) {
        const motionTypeEl = document.getElementById('ball-motion-type');
        const motionType = motionTypeEl ? motionTypeEl.value : selectedObj.motionType;
        const params = collectParams();
        physics.updateObjectParams(selectedObj.id, { ...params, motionType, resetState: true });
        showBallEditPanel(selectedObj.id); // 刷新面板
      }
    });
    
    // 运动类型选择器变化时更新参数组显示
    const motionTypeEl = document.getElementById('ball-motion-type');
    if (motionTypeEl) motionTypeEl.addEventListener('change', ()=>{
      updatePhysicsGroupsVisibility(motionTypeEl.value);
    });
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
      // 使用渲染器的转换函数获取正确坐标
      const toWorld = renderer.toWorld || ((x,y) => ({ x:(x-40)/70, y: (canvas.height-40-y)/70 }));
      
      if (snap.scenario === 'collision-1d') {
        // 碰撞场景使用特殊布局
        const y = canvas.height/2; 
        const p1 = renderer.worldToCanvas ? renderer.worldToCanvas({x:snap.collision.x1, y:0}) : {x: 40 + snap.collision.x1 * 70, y: y};
        const p2 = renderer.worldToCanvas ? renderer.worldToCanvas({x:snap.collision.x2, y:0}) : {x: 40 + snap.collision.x2 * 70, y: y};
        if (Math.hypot(px - p1.x, py - p1.y) <= radiusPx) return {type:'c1'};
        if (Math.hypot(px - p2.x, py - p2.y) <= radiusPx) return {type:'c2'};
        return null;
      } else if (snap.scenario === 'lever' || snap.scenario === 'force') {
        return null;
      } else {
        // 检查主球
        const mainPos = renderer.worldToCanvas ? renderer.worldToCanvas(snap.position) : {x: 40 + snap.position.x * 70, y: canvas.height - 40 - snap.position.y * 70};
        if (Math.hypot(px - mainPos.x, py - mainPos.y) <= radiusPx) return {type:'main'};
        
        // 检查所有物理对象
        if (snap.objects && snap.objects.length > 0) {
          for (const obj of snap.objects) {
            const objPos = renderer.worldToCanvas({x: obj.x, y: obj.y});
            const distance = Math.hypot(px - objPos.x, py - objPos.y);
            // console.log(`Object ${obj.id}: pos(${obj.x}, ${obj.y}) -> screen(${objPos.x}, ${objPos.y}), click(${px}, ${py}), distance=${distance}, radiusPx=${radiusPx}`);
            if (distance <= radiusPx) return {type:'object', id: obj.id};
          }
        }
        return null;
      }
    }
    canvas.addEventListener('mousemove', (ev)=>{
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width; const sy = canvas.height / rect.height;
      const px = (ev.clientX - rect.left) * sx; const py = (ev.clientY - rect.top) * sy;
      const snap = physics.getSnapshot(); const hit = hitTest(px, py, snap);
      canvas.style.cursor = hit ? 'pointer' : 'default';
    });
    canvas.addEventListener('click', (ev)=>{
      // 如果刚刚进行了平移，不处理点击
      if (hasMoved) {
        return;
      }
      
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width; const sy = canvas.height / rect.height;
      const px = (ev.clientX - rect.left) * sx; const py = (ev.clientY - rect.top) * sy;
      const snap = physics.getSnapshot();
      // console.log('Click event - px:', px, 'py:', py, 'objects count:', snap.objects ? snap.objects.length : 0);
      if (isPlacingBall) {
        const w = renderer.toWorld(px, py);
        const params = collectParams();
        const id = physics.addObject(w.x, w.y, params);
        physics.selectObject(id);
        
        setTimeout(() => {
          const snapNow = physics.getSnapshot();
          showSelectionInfo(snapNow, {type:'object', id});
          showBallEditPanel(id);
        }, 50);
        
        isPlacingBall = false; 
        canvas.style.cursor='default';
        const btnAddBall = document.getElementById('btn-add-ball');
        if (btnAddBall) {
          btnAddBall.style.backgroundColor = '';
          btnAddBall.textContent = '添加小球（点击画布放置）';
        }
        return;
      }
      const hit = hitTest(px, py, snap);
      // console.log('Hit test result:', hit);
      if (hit) {
        if (hit.type === 'object') {
          physics.selectObject(hit.id);
          showSelectionInfo(snap, hit);
          showBallEditPanel(hit.id);
        } else {
          physics.selectObject(null);
          showSelectionInfo(snap, hit);
          hideBallEditPanel();
        }
      } else {
        physics.selectObject(null);
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
    } else if (hit.type === 'object') {
      const obj = snap.objects.find(o => o.id === hit.id);
      if (obj) {
        selectionInfo.textContent = `${obj.type === 'main' ? '主对象' : '小球'} ${obj.id.slice(0,4)}\n位置 (x,y): (${obj.x.toFixed(2)}, ${obj.y.toFixed(2)}) m\n速度 (vx,vy): (${obj.vx.toFixed(2)}, ${obj.vy.toFixed(2)}) m/s\n质量 m: ${obj.mass.toFixed(2)} kg`;
        // 同步编辑面板输入
        const bx=document.getElementById('ball-x'), by=document.getElementById('ball-y');
        const bvx=document.getElementById('ball-vx'), bvy=document.getElementById('ball-vy');
        const massEl=document.getElementById('ball-mass'), massNumEl=document.getElementById('ball-mass-num'), massValEl=document.getElementById('ball-mass-val');
        if (bx) bx.value = obj.x.toFixed(2);
        if (by) by.value = obj.y.toFixed(2);
        if (bvx) bvx.value = obj.vx.toFixed(2);
        if (bvy) bvy.value = obj.vy.toFixed(2);
        if (massEl) massEl.value = obj.mass;
        if (massNumEl) massNumEl.value = obj.mass;
        if (massValEl) massValEl.textContent = Number(obj.mass).toFixed(1);
      }
    } else {
      selectionInfo.textContent = `位置 (x,y): (${snap.position.x.toFixed(2)}, ${snap.position.y.toFixed(2)}) m\n速度 (vx,vy): (${snap.velocity.x.toFixed(2)}, ${snap.velocity.y.toFixed(2)}) m/s\n加速度 (ax,ay): (${snap.acceleration.x.toFixed(2)}, ${snap.acceleration.y.toFixed(2)}) m/s²`;
    }
  }
  function hideSelectionInfo(){ if (selectionInfo) selectionInfo.style.display='none'; }
  
  function showBallEditPanel(ballId) {
    const panel = document.getElementById('ball-edit-panel');
    if (!panel) return;
    
    const obj = physics.getSelectedObject();
    if (!obj) return;
    
    // 确保params存在
    if (!obj.params) {
      obj.params = { massKg: obj.mass, v0: 20, angleDeg: 45 };
    }
    
    // 更新运动类型选择器
    const motionTypeEl = document.getElementById('ball-motion-type');
    if (motionTypeEl) {
      motionTypeEl.value = obj.motionType || 'projectile';
    }
    
    const scenario = obj.motionType || collectParams().scenario;
    
    // 根据场景显示不同的参数
    const posRow = panel.querySelector('.row[data-param="pos"]');
    const velRow = panel.querySelector('.row[data-param="vel"]');
    const massRow = panel.querySelector('.row[data-param="mass"]');
    const v0Row = panel.querySelector('.row[data-param="v0"]');
    const angleRow = panel.querySelector('.row[data-param="angle"]');
    
    // 位置和速度始终显示
    if (posRow) posRow.style.display = 'block';
    if (velRow) velRow.style.display = 'block';
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
      massEl.value = obj.params.massKg || obj.mass;
      massValEl.textContent = (obj.params.massKg || obj.mass).toFixed(1);
      massNumEl.value = obj.params.massKg || obj.mass;
    }
    // 同步位置/速度
    const bx=document.getElementById('ball-x'); const by=document.getElementById('ball-y');
    const bvx=document.getElementById('ball-vx'); const bvy=document.getElementById('ball-vy');
    if (bx) bx.value = (obj.x||0).toFixed(2);
    if (by) by.value = (obj.y||0).toFixed(2);
    if (bvx) bvx.value = (obj.vx||0).toFixed(2);
    if (bvy) bvy.value = (obj.vy||0).toFixed(2);
    
    if (v0El && v0ValEl && v0NumEl) {
      const v0 = obj.params.v0 || 20;
      v0El.value = v0;
      v0ValEl.textContent = v0.toFixed(0);
      v0NumEl.value = v0;
    }
    
    if (angleEl && angleValEl && angleNumEl) {
      const angle = obj.params.angleDeg || 45;
      angleEl.value = angle;
      angleValEl.textContent = angle.toFixed(0);
      angleNumEl.value = angle;
    }
    
    // 更新独立的物理参数
    const gravityEl = document.getElementById('ball-gravity');
    const dragEl = document.getElementById('ball-drag');
    const springKEl = document.getElementById('ball-spring-k');
    const dampingEl = document.getElementById('ball-damping');
    const accelEl = document.getElementById('ball-accel');
    
    if (gravityEl) gravityEl.value = obj.gravity || 9.8;
    if (dragEl) dragEl.value = obj.dragCoeff || 0.02;
    if (springKEl) springKEl.value = obj.springK || 50;
    if (dampingEl) dampingEl.value = obj.dampingB || 0.5;
    if (accelEl) accelEl.value = obj.params.uaAx || 2;
    
    // 根据运动类型显示相关的物理参数
    updatePhysicsGroupsVisibility(scenario);
    
    panel.style.display = 'block';
  }
  
  // 根据运动类型显示/隐藏物理参数组
  function updatePhysicsGroupsVisibility(motionType) {
    const groups = document.querySelectorAll('.physics-group');
    groups.forEach(group => {
      const supportedMotions = group.getAttribute('data-motion');
      if (supportedMotions) {
        const isVisible = supportedMotions.split(',').includes(motionType);
        group.classList.toggle('active', isVisible);
      }
    });
  }
  
  function hideBallEditPanel() {
    const panel = document.getElementById('ball-edit-panel');
    if (panel) panel.style.display = 'none';
  }
  
  function applyBallParams() {
    const selectedObj = physics.getSelectedObject();
    if (!selectedObj) return;
    
    const massEl = document.getElementById('ball-mass');
    const v0El = document.getElementById('ball-v0');
    const angleEl = document.getElementById('ball-angle');
    const bx = document.getElementById('ball-x');
    const by = document.getElementById('ball-y');
    const bvx = document.getElementById('ball-vx');
    const bvy = document.getElementById('ball-vy');
    
    if (!massEl) return;
    
    const motionTypeEl = document.getElementById('ball-motion-type');
    const gravityEl = document.getElementById('ball-gravity');
    const dragEl = document.getElementById('ball-drag');
    const springKEl = document.getElementById('ball-spring-k');
    const dampingEl = document.getElementById('ball-damping');
    const accelEl = document.getElementById('ball-accel');
    
    const newParams = {
      massKg: Number(massEl.value),
      motionType: motionTypeEl ? motionTypeEl.value : selectedObj.motionType,
      resetState: false
    };
    
    // 独立的物理参数
    if (gravityEl) newParams.gravity = Number(gravityEl.value);
    if (dragEl) newParams.dragCoeff = Number(dragEl.value);
    if (springKEl) newParams.springK = Number(springKEl.value);
    if (dampingEl) newParams.dampingB = Number(dampingEl.value);
    if (accelEl) newParams.uaAx = Number(accelEl.value);
    
    // 运动类型相关参数
    if (newParams.motionType === 'projectile' && v0El && angleEl) {
      newParams.v0 = Number(v0El.value);
      newParams.angleDeg = Number(angleEl.value);
    }
    
    physics.updateObjectParams(selectedObj.id, newParams);
    
    // 覆盖位置与速度（直接修改所选对象的当前状态）
    if (bx) selectedObj.x = Number(bx.value);
    if (by) selectedObj.y = Number(by.value);
    if (bvx) selectedObj.vx = Number(bvx.value);
    if (bvy) selectedObj.vy = Number(bvy.value);
    
    // 更新物理参数组的显示
    updatePhysicsGroupsVisibility(newParams.motionType);
    
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

    // 绑定位置/速度输入实时写回选中小球
    const bx = document.getElementById('ball-x');
    const by = document.getElementById('ball-y');
    const bvx = document.getElementById('ball-vx');
    const bvy = document.getElementById('ball-vy');
    const onNum = () => {
      const obj = physics.getSelectedObject && physics.getSelectedObject();
      if (!obj) return;
      if (bx) obj.x = Number(bx.value);
      if (by) obj.y = Number(by.value);
      if (bvx) obj.vx = Number(bvx.value);
      if (bvy) obj.vy = Number(bvy.value);
    };
    [bx,by,bvx,bvy].forEach(el=>{ if(el){ el.addEventListener('input', onNum); el.addEventListener('change', onNum); } });
    
    // 绑定物理参数实时更新
    const physicsParams = ['ball-gravity', 'ball-drag', 'ball-spring-k', 'ball-damping', 'ball-accel'];
    physicsParams.forEach(paramId => {
      const el = document.getElementById(paramId);
      if (el) {
        el.addEventListener('input', () => {
          const obj = physics.getSelectedObject();
          if (!obj) return;
          
          const value = Number(el.value);
          switch (paramId) {
            case 'ball-gravity': obj.gravity = value; break;
            case 'ball-drag': obj.dragCoeff = value; break;
            case 'ball-spring-k': obj.springK = value; break;
            case 'ball-damping': obj.dampingB = value; break;
            case 'ball-accel': 
              obj.params.uaAx = value;
              break;
          }
        });
      }
    });
  }
  function bindPanZoom(){
    let isPanning = false; let last = {x:0,y:0};
    canvas.addEventListener('mousedown', (e)=>{ 
      isPanning = true; hasMoved = false; 
      last = {x:e.clientX, y:e.clientY}; 
    });
    window.addEventListener('mouseup', ()=>{ 
      isPanning = false; 
      // 短暂延迟后重置 hasMoved，以免干扰即将到来的 click 事件
      setTimeout(() => { hasMoved = false; }, 10);
    });
    window.addEventListener('mousemove', (e)=>{ 
      if (!isPanning) return; 
      const dx = e.clientX - last.x; const dy = e.clientY - last.y; 
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved = true;
      last = {x:e.clientX, y:e.clientY}; 
      renderer.panByPixels(dx, dy); 
    });
    canvas.addEventListener('wheel', (e)=>{ 
      e.preventDefault(); 
      const factor = e.deltaY < 0 ? 1.1 : 0.9; 
      const rect = canvas.getBoundingClientRect();
      const sx = canvas.width / rect.width; const sy = canvas.height / rect.height;
      const center = { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
      renderer.zoomAt(factor, center); 
    }, { passive:false });
    const btnResetView = document.getElementById('btn-view-reset');
    if (btnResetView) btnResetView.addEventListener('click', ()=>{ renderer.zoomAt(1, {x:canvas.width/2, y:canvas.height/2}); renderer.panByPixels(0,0); renderer.__reset && renderer.__reset(); });
  }
  function updateScopeVisibility(){ const scenario=ui.scenario.value; document.querySelectorAll('[data-scope]').forEach(el=>{ const scope=el.getAttribute('data-scope'); el.style.display=(scope===scenario)?'grid':'none'; }); }
  function collectParams(){ return { scenario:ui.scenario.value, massKg:Number(ui.mass.value), g:Number(ui.gravity.value), dragC:Number(ui.drag.value), v0:Number(ui.v0.value), angleDeg:Number(ui.angle.value), springK:Number(ui.springK.value), dampingB:Number(ui.dampingB.value), uniformU: ui.uniformU?Number(ui.uniformU.value):0, uaU0: ui.uaU0?Number(ui.uaU0.value):0, uaAx: ui.uaAx?Number(ui.uaAx.value):0, colM1: ui.colM1?Number(ui.colM1.value):2, colM2: ui.colM2?Number(ui.colM2.value):3, colV1: ui.colV1?Number(ui.colV1.value):5, colV2: ui.colV2?Number(ui.colV2.value):-3, colE: ui.colE?Number(ui.colE.value):1, levF1: ui.levF1?Number(ui.levF1.value):20, levD1: ui.levD1?Number(ui.levD1.value):1.5, levF2: ui.levF2?Number(ui.levF2.value):20, levD2: ui.levD2?Number(ui.levD2.value):1.5, fcompF1: ui.fcompF1?Number(ui.fcompF1.value):30, fcompA1: ui.fcompA1?Number(ui.fcompA1.value):0, fcompF2: ui.fcompF2?Number(ui.fcompF2.value):20, fcompA2: ui.fcompA2?Number(ui.fcompA2.value):90, showVel:ui.showVel.checked, showAcc:ui.showAcc.checked, showTrace:ui.showTrace.checked, showGrid:ui.showGrid.checked }; }
  function resetSimulation(){ const params=collectParams(); physics.reset(params); speedChart.reset(); accChart.reset(); state.lastTimestampMs=null; state.isPlaying=false; drawFrame(0); }
  function stepOnce(){ const dt=1/60; const params=collectParams(); const snap=physics.step(dt,params); pushCharts(snap); drawFrame(dt); }
  function pushCharts(snap){
    if(!snap) return;
    // 优先使用选中对象，否则使用主对象
    const target = (snap.objects && snap.selectedId)
      ? snap.objects.find(o=>o.id===snap.selectedId)
      : null;
    const posV = target ? {vx:target.vx, vy:target.vy} : snap.velocity;
    const accV = target ? {ax:target.ax, ay:target.ay} : snap.acceleration;
    const speed=Math.hypot(posV.vx ?? 0, posV.vy ?? 0);
    const accMag=Math.hypot(accV.ax ?? 0, accV.ay ?? 0);
    speedChart.push(speed);
    accChart.push(accMag);
  }
  function loop(timestampMs){ if(state.lastTimestampMs==null) state.lastTimestampMs=timestampMs; const rawDt=Math.min(0.05,(timestampMs-state.lastTimestampMs)/1000); state.lastTimestampMs=timestampMs; const params=collectParams(); const dt=rawDt*state.timeScale; if(state.isPlaying){ const snap=physics.step(dt,params); pushCharts(snap); drawFrame(dt);} else { drawFrame(0);} requestAnimationFrame(loop); }
  function drawFrame(dt){ const params=collectParams(); const snap=physics.getSnapshot(); renderer.draw(ctx, snap, params); updateStats(snap, params); }
  function updateStats(snap, params){
    const stat=ui.stat; if(!stat||!stat.t) return;
    // 选中对象优先
    const target = (snap.objects && snap.selectedId)
      ? snap.objects.find(o=>o.id===snap.selectedId)
      : null;
    const pos = target ? {x:target.x, y:target.y} : snap.position;
    const vel = target ? {x:target.vx, y:target.vy} : snap.velocity;
    const acc = target ? {x:target.ax, y:target.ay} : snap.acceleration;
    const mass = target ? (target.mass ?? 1) : (snap.massKg ?? 1);

    stat.t.textContent=snap.time.toFixed(2);
    stat.pos.textContent=`(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`;
    stat.vel.textContent=`(${vel.x.toFixed(2)}, ${vel.y.toFixed(2)})`;
    stat.acc.textContent=`(${acc.x.toFixed(2)}, ${acc.y.toFixed(2)})`;
    const vmag=Math.hypot(vel.x, vel.y);
    const amag=Math.hypot(acc.x, acc.y);
    stat.mag.textContent=`${vmag.toFixed(2)} / ${amag.toFixed(2)}`;
    const g = target ? (target.gravity ?? params.g ?? 9.8) : (params.g ?? 9.8);
    const Ep=((target ? target.motionType : snap.scenario)==='projectile' || (target ? target.motionType : snap.scenario)==='freefall') ? (mass*g*(pos.y - snap.groundY)) : 0;
    const Ek=0.5*mass*vmag*vmag;
    const Em=Ek+Ep;
    stat.ek.textContent=Ek.toFixed(2);
    stat.ep.textContent=Ep.toFixed(2);
    stat.em.textContent=Em.toFixed(2);
    if(stat.p && snap.scenario==='collision-1d'){ const c=snap.collision; const p=c.m1*c.v1 + c.m2*c.v2; stat.p.textContent=p.toFixed(2); }
  }
  // start
  initUI(); resetSimulation(); requestAnimationFrame(loop);
})();


