import { createPhysicsWorld } from './physics.js';
import { createRenderer } from './renderer.js';
import { createSparklineChart } from './charts.js';

function $(selector) { return document.querySelector(selector); }

const canvas = $('#sim-canvas');
const ctx = canvas.getContext('2d');

const ui = {
  btnPlay: $('#btn-play'),
  btnPause: $('#btn-pause'),
  btnStep: $('#btn-step'),
  btnReset: $('#btn-reset'),
  btnClearTrace: $('#btn-clear-trace'),
  scenario: $('#scenario'),
  mass: $('#mass'), massVal: $('#mass-val'),
  v0: $('#v0'), v0Val: $('#v0-val'),
  angle: $('#angle'), angleVal: $('#angle-val'),
  gravity: $('#gravity'), gravityVal: $('#gravity-val'),
  drag: $('#drag'), dragVal: $('#drag-val'),
  springK: $('#spring-k'), springKVal: $('#spring-k-val'),
  dampingB: $('#damping-b'), dampingBVal: $('#damping-b-val'),
  uniformU: $('#uniform-u'), uniformUVal: $('#uniform-u-val'),
  uaU0: $('#ua-u0'), uaU0Val: $('#ua-u0-val'),
  uaAx: $('#ua-ax'), uaAxVal: $('#ua-ax-val'),
  colM1: $('#col-m1'), colM1Val: $('#col-m1-val'),
  colM2: $('#col-m2'), colM2Val: $('#col-m2-val'),
  colV1: $('#col-v1'), colV1Val: $('#col-v1-val'),
  colV2: $('#col-v2'), colV2Val: $('#col-v2-val'),
  colE: $('#col-e'), colEVal: $('#col-e-val'),
  levF1: $('#lev-f1'), levF1Val: $('#lev-f1-val'),
  levD1: $('#lev-d1'), levD1Val: $('#lev-d1-val'),
  levF2: $('#lev-f2'), levF2Val: $('#lev-f2-val'),
  levD2: $('#lev-d2'), levD2Val: $('#lev-d2-val'),
  fcompF1: $('#fcomp-f1'), fcompF1Val: $('#fcomp-f1-val'),
  fcompA1: $('#fcomp-a1'), fcompA1Val: $('#fcomp-a1-val'),
  fcompF2: $('#fcomp-f2'), fcompF2Val: $('#fcomp-f2-val'),
  fcompA2: $('#fcomp-a2'), fcompA2Val: $('#fcomp-a2-val'),
  timeScale: $('#time-scale'), timeScaleVal: $('#time-scale-val'),
  showVel: $('#show-vel'),
  showAcc: $('#show-acc'),
  showTrace: $('#show-trace'),
  showGrid: $('#show-grid'),
  stat: {
    t: $('#stat-t'), pos: $('#stat-pos'), vel: $('#stat-vel'),
    acc: $('#stat-acc'), mag: $('#stat-mag'), ek: $('#stat-ek'), ep: $('#stat-ep'), em: $('#stat-em'), p: $('#stat-p')
  }
};

const state = {
  isPlaying: false,
  lastTimestampMs: null,
  timeScale: 1,
  worldToCanvas: null, // set by renderer
};

const physics = createPhysicsWorld();
const renderer = createRenderer(canvas);

const speedChart = createSparklineChart($('#chart-speed'), { lineColor: '#4db6ff' });
const accChart = createSparklineChart($('#chart-acc'), { lineColor: '#ff9d42' });

function initUI() {
  const bindRange = (inputEl, outputEl, fmt = (v)=>v) => {
    const commit = () => { outputEl.textContent = fmt(Number(inputEl.value)); };
    inputEl.addEventListener('input', commit);
    commit();
  };

  bindRange(ui.mass, ui.massVal, (v)=>v.toFixed(1));
  bindRange(ui.v0, ui.v0Val, (v)=>v.toFixed(0));
  bindRange(ui.angle, ui.angleVal, (v)=>v.toFixed(0));
  bindRange(ui.gravity, ui.gravityVal, (v)=>v.toFixed(1));
  bindRange(ui.drag, ui.dragVal, (v)=>v.toFixed(3));
  bindRange(ui.springK, ui.springKVal, (v)=>v.toFixed(0));
  bindRange(ui.dampingB, ui.dampingBVal, (v)=>v.toFixed(1));
  bindRange(ui.uniformU, ui.uniformUVal, (v)=>v.toFixed(1));
  bindRange(ui.uaU0, ui.uaU0Val, (v)=>v.toFixed(1));
  bindRange(ui.uaAx, ui.uaAxVal, (v)=>v.toFixed(1));
  bindRange(ui.colM1, ui.colM1Val, (v)=>v.toFixed(1));
  bindRange(ui.colM2, ui.colM2Val, (v)=>v.toFixed(1));
  bindRange(ui.colV1, ui.colV1Val, (v)=>v.toFixed(1));
  bindRange(ui.colV2, ui.colV2Val, (v)=>v.toFixed(1));
  bindRange(ui.colE, ui.colEVal, (v)=>v.toFixed(2));
  bindRange(ui.levF1, ui.levF1Val, (v)=>v.toFixed(0));
  bindRange(ui.levD1, ui.levD1Val, (v)=>v.toFixed(1));
  bindRange(ui.levF2, ui.levF2Val, (v)=>v.toFixed(0));
  bindRange(ui.levD2, ui.levD2Val, (v)=>v.toFixed(1));
  bindRange(ui.fcompF1, ui.fcompF1Val, (v)=>v.toFixed(0));
  bindRange(ui.fcompA1, ui.fcompA1Val, (v)=>v.toFixed(0));
  bindRange(ui.fcompF2, ui.fcompF2Val, (v)=>v.toFixed(0));
  bindRange(ui.fcompA2, ui.fcompA2Val, (v)=>v.toFixed(0));
  bindRange(ui.timeScale, ui.timeScaleVal, (v)=>v.toFixed(1) + '×');

  ui.scenario.addEventListener('change', () => {
    updateScopeVisibility();
    resetSimulation();
  });

  [ui.mass, ui.v0, ui.angle, ui.gravity, ui.drag, ui.springK, ui.dampingB,
   ui.uniformU, ui.uaU0, ui.uaAx,
   ui.colM1, ui.colM2, ui.colV1, ui.colV2, ui.colE,
   ui.levF1, ui.levD1, ui.levF2, ui.levD2,
   ui.fcompF1, ui.fcompA1, ui.fcompF2, ui.fcompA2].forEach(el => {
    el && el.addEventListener('change', () => { resetSimulation(); });
  });

  ui.timeScale.addEventListener('input', () => {
    state.timeScale = Number(ui.timeScale.value);
  });

  ui.btnPlay.addEventListener('click', () => { state.isPlaying = true; });
  ui.btnPause.addEventListener('click', () => { state.isPlaying = false; });
  ui.btnStep.addEventListener('click', () => { stepOnce(); });
  ui.btnReset.addEventListener('click', () => { resetSimulation(); });
  ui.btnClearTrace.addEventListener('click', () => { physics.clearTrace(); });

  [ui.showVel, ui.showAcc, ui.showTrace, ui.showGrid].forEach(el => {
    el && el.addEventListener('change', () => {});
  });

  updateScopeVisibility();
}

function updateScopeVisibility() {
  const scenario = ui.scenario.value;
  document.querySelectorAll('[data-scope]')
    .forEach(el => {
      const scope = el.getAttribute('data-scope');
      el.style.display = (scope === scenario) ? 'grid' : 'none';
    });
}

function collectParams() {
  return {
    scenario: ui.scenario.value,
    massKg: Number(ui.mass.value),
    g: Number(ui.gravity.value),
    dragC: Number(ui.drag.value),
    v0: Number(ui.v0.value),
    angleDeg: Number(ui.angle.value),
    springK: Number(ui.springK.value),
    dampingB: Number(ui.dampingB.value),
    uniformU: ui.uniformU ? Number(ui.uniformU.value) : 0,
    uaU0: ui.uaU0 ? Number(ui.uaU0.value) : 0,
    uaAx: ui.uaAx ? Number(ui.uaAx.value) : 0,
    colM1: ui.colM1 ? Number(ui.colM1.value) : 2,
    colM2: ui.colM2 ? Number(ui.colM2.value) : 3,
    colV1: ui.colV1 ? Number(ui.colV1.value) : 5,
    colV2: ui.colV2 ? Number(ui.colV2.value) : -3,
    colE: ui.colE ? Number(ui.colE.value) : 1,
    levF1: ui.levF1 ? Number(ui.levF1.value) : 20,
    levD1: ui.levD1 ? Number(ui.levD1.value) : 1.5,
    levF2: ui.levF2 ? Number(ui.levF2.value) : 20,
    levD2: ui.levD2 ? Number(ui.levD2.value) : 1.5,
    fcompF1: ui.fcompF1 ? Number(ui.fcompF1.value) : 30,
    fcompA1: ui.fcompA1 ? Number(ui.fcompA1.value) : 0,
    fcompF2: ui.fcompF2 ? Number(ui.fcompF2.value) : 20,
    fcompA2: ui.fcompA2 ? Number(ui.fcompA2.value) : 90,
    showVel: ui.showVel.checked,
    showAcc: ui.showAcc.checked,
    showTrace: ui.showTrace.checked,
    showGrid: ui.showGrid.checked,
  };
}

function resetSimulation() {
  const params = collectParams();
  physics.reset(params);
  speedChart.reset();
  accChart.reset();
  state.lastTimestampMs = null;
  state.isPlaying = false;
  drawFrame(0);
}

function stepOnce() {
  const dt = 1/60;
  const params = collectParams();
  const simStep = physics.step(dt, params);
  pushCharts(simStep);
  drawFrame(dt);
}

function pushCharts(simStep) {
  if (!simStep) return;
  const speed = Math.hypot(simStep.velocity.x, simStep.velocity.y);
  const accMag = Math.hypot(simStep.acceleration.x, simStep.acceleration.y);
  speedChart.push(speed);
  accChart.push(accMag);
}

function loop(timestampMs) {
  if (state.lastTimestampMs == null) state.lastTimestampMs = timestampMs;
  const rawDt = Math.min(0.05, (timestampMs - state.lastTimestampMs) / 1000);
  state.lastTimestampMs = timestampMs;

  const params = collectParams();
  const dt = rawDt * state.timeScale;

  if (state.isPlaying) {
    const simStep = physics.step(dt, params);
    pushCharts(simStep);
    drawFrame(dt);
  } else {
    drawFrame(0);
  }

  requestAnimationFrame(loop);
}

function drawFrame(dt) {
  const params = collectParams();
  const snap = physics.getSnapshot();
  renderer.draw(ctx, snap, params);
  updateStats(snap, params);
}

function updateStats(snap, params) {
  if (!ui.stat || !ui.stat.t) return;
  ui.stat.t.textContent = snap.time.toFixed(2);
  ui.stat.pos.textContent = `(${snap.position.x.toFixed(2)}, ${snap.position.y.toFixed(2)})`;
  ui.stat.vel.textContent = `(${snap.velocity.x.toFixed(2)}, ${snap.velocity.y.toFixed(2)})`;
  ui.stat.acc.textContent = `(${snap.acceleration.x.toFixed(2)}, ${snap.acceleration.y.toFixed(2)})`;
  const vmag = Math.hypot(snap.velocity.x, snap.velocity.y);
  const amag = Math.hypot(snap.acceleration.x, snap.acceleration.y);
  ui.stat.mag.textContent = `${vmag.toFixed(2)} / ${amag.toFixed(2)}`;
  const Ek = 0.5 * (snap.massKg ?? 1) * vmag * vmag;
  const g = params.g ?? 9.8;
  const Ep = (snap.scenario==='projectile'||snap.scenario==='freefall') ? (snap.massKg*g*(snap.position.y - snap.groundY)) : 0;
  const Em = Ek + Ep;
  ui.stat.ek.textContent = Ek.toFixed(2);
  ui.stat.ep.textContent = Ep.toFixed(2);
  ui.stat.em.textContent = Em.toFixed(2);
  if (ui.stat.p && snap.scenario==='collision-1d') {
    const c = snap.collision;
    const p = c.m1*c.v1 + c.m2*c.v2;
    ui.stat.p.textContent = p.toFixed(2);
  }
}

initUI();
resetSimulation();
requestAnimationFrame(loop);


