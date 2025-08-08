export function createPhysicsWorld() {
  const tracePoints = [];
  const state = {
    position: { x: 0, y: 0 }, // meters, y upwards
    velocity: { x: 0, y: 0 },
    acceleration: { x: 0, y: 0 },
    massKg: 1,
    scenario: 'projectile',
    forces: { total: {x:0,y:0}, gravity: {x:0,y:0}, drag: {x:0,y:0}, spring: {x:0,y:0} },
    time: 0,
    springY: 1.8, // fixed vertical position for spring scene
    groundY: 0,   // y=0 is ground line
    collision: {
      m1: 2, m2: 3,
      v1: 5, v2: -3,
      e: 1,
      x1: 3, x2: 7,
      done: false,
    },
    lever: {
      f1: 20, d1: 1.5,
      f2: 20, d2: 1.5,
    },
    forceComp: {
      f1: 30, a1: 0,
      f2: 20, a2: 90,
    }
  };

  function reset(params) {
    state.massKg = params.massKg ?? 1;
    state.scenario = params.scenario ?? 'projectile';
    state.time = 0;
    tracePoints.length = 0;

    if (state.scenario === 'projectile') {
      const angleRad = (params.angleDeg ?? 45) * Math.PI / 180;
      const v0 = params.v0 ?? 20;
      // 全部按中心计算：初始中心在地面 y=0
      state.position = { x: 0, y: 0 };
      state.velocity = { x: v0 * Math.cos(angleRad), y: v0 * Math.sin(angleRad) };
    } else if (state.scenario === 'freefall') {
      state.position = { x: 6, y: 6 };
      state.velocity = { x: 0, y: 0 };
    } else if (state.scenario === 'spring') {
      // horizontal oscillator around x=5
      state.position = { x: 5.0 + 1.0, y: state.springY };
      state.velocity = { x: 0, y: 0 };
    } else if (state.scenario === 'uniform') {
      state.position = { x: 1, y: 1 };
      state.velocity = { x: params.uniformU ?? 5, y: 0 };
    } else if (state.scenario === 'uniform-accel') {
      state.position = { x: 1, y: 1 };
      state.velocity = { x: params.uaU0 ?? 0, y: 0 };
      state.acceleration = { x: params.uaAx ?? 2, y: 0 };
    } else if (state.scenario === 'collision-1d') {
      state.collision = {
        m1: params.colM1 ?? 2,
        m2: params.colM2 ?? 3,
        v1: params.colV1 ?? 5,
        v2: params.colV2 ?? -3,
        e: params.colE ?? 1,
        x1: 2,
        x2: 8,
        done: false,
      };
      state.position = { x: 0, y: 0 }; // unused main particle
      state.velocity = { x: 0, y: 0 };
    } else if (state.scenario === 'lever') {
      state.lever = {
        f1: params.levF1 ?? 20,
        d1: params.levD1 ?? 1.5,
        f2: params.levF2 ?? 20,
        d2: params.levD2 ?? 1.5,
      };
      state.position = { x: 0, y: 0 }; // unused main particle
      state.velocity = { x: 0, y: 0 };
    } else if (state.scenario === 'force') {
      state.forceComp = {
        f1: params.fcompF1 ?? 30,
        a1: params.fcompA1 ?? 0,
        f2: params.fcompF2 ?? 20,
        a2: params.fcompA2 ?? 90,
      };
      state.position = { x: 3, y: 2 };
      state.velocity = { x: 0, y: 0 };
    }
    state.acceleration = { x: 0, y: 0 };
  }

  function clearTrace() { tracePoints.length = 0; }

  function computeForces(params) {
    const g = params.g ?? 9.8;
    const dragC = params.dragC ?? 0;
    const springK = params.springK ?? 50;
    const dampingB = params.dampingB ?? 0.5;

    const gravity = (state.scenario === 'spring' || state.scenario === 'uniform' || state.scenario === 'uniform-accel' || state.scenario === 'collision-1d' || state.scenario === 'lever')
      ? { x: 0, y: 0 }
      : { x: 0, y: -state.massKg * g };
    // Air drag only in projectile scenario
    let drag = { x: 0, y: 0 };
    if (state.scenario === 'projectile') {
      drag = { x: -dragC * state.velocity.x, y: -dragC * state.velocity.y };
    } else if (state.scenario === 'spring') {
      drag = { x: -dragC * state.velocity.x, y: 0 };
    }

    let spring = { x: 0, y: 0 };
    if (state.scenario === 'spring') {
      const equilibriumX = 5.0; // meters
      const displacementX = state.position.x - equilibriumX;
      const velX = state.velocity.x;
      spring = { x: -springK * displacementX - dampingB * velX, y: 0 };
    }

    // External uniform acceleration along x
    let ext = { x: 0, y: 0 };
    if (state.scenario === 'uniform-accel') {
      const ax = params.uaAx ?? 0;
      ext.x = state.massKg * ax;
    }

    const total = { x: gravity.x + drag.x + spring.x + ext.x, y: gravity.y + drag.y + spring.y + ext.y };
    return { total, gravity, drag, spring };
  }

  function integrate(dt, params) {
    // Non-integrated scenes
    if (state.scenario === 'collision-1d') {
      // advance positions until collision; then apply 1D impact with restitution e
      const c = state.collision;
      if (!c.done) {
        c.x1 += c.v1 * dt;
        c.x2 += c.v2 * dt;
        if (c.x1 >= c.x2) {
          // collision instant: compute post velocities
          const m1 = c.m1, m2 = c.m2, u1 = c.v1, u2 = c.v2, e = c.e;
          const v1 = (m1*u1 + m2*u2 - m2*e*(u1 - u2)) / (m1 + m2);
          const v2 = v1 + e*(u1 - u2);
          c.v1 = v1; c.v2 = v2;
          // separate slightly to avoid overlap
          c.x1 = (c.x1 + c.x2) / 2 - 0.01;
          c.x2 = c.x1 + 0.02;
          c.done = true;
        }
      } else {
        c.x1 += c.v1 * dt;
        c.x2 += c.v2 * dt;
      }
      // record a reference point into trace to keep charting consistent
      tracePoints.push({ x: c.x1, y: 1 });
      if (tracePoints.length > 2000) tracePoints.shift();
      state.time += dt;
      state.forces.total = {x:0,y:0};
      state.acceleration = {x:0,y:0};
      return snapshot();
    }
    if (state.scenario === 'lever') {
      state.time += dt;
      // static; push trace noop
      if (tracePoints.length > 800) tracePoints.shift();
      return snapshot();
    }
    if (state.scenario === 'force') {
      state.time += dt;
      // static visualization only
      if (tracePoints.length > 800) tracePoints.shift();
      return snapshot();
    }
    if ((state.scenario === 'projectile' || state.scenario === 'freefall') && state.position.y <= state.groundY && state.time > 0) {
      return null; // no further motion
    }

    const { total, gravity, drag, spring } = computeForces(params);
    const ax = total.x / state.massKg;
    const ay = total.y / state.massKg;
    state.acceleration.x = ax;
    state.acceleration.y = ay;

    // Semi-implicit Euler for stability
    state.velocity.x += ax * dt;
    state.velocity.y += ay * dt;
    state.position.x += state.velocity.x * dt;
    state.position.y += state.velocity.y * dt;
    state.time += dt;

    // Clamp to ground
    if ((state.scenario === 'projectile' || state.scenario === 'freefall') && state.position.y < state.groundY) {
      state.position.y = state.groundY;
      state.velocity.y = 0;
    }

    // Save trace
    tracePoints.push({ x: state.position.x, y: state.position.y });
    if (tracePoints.length > 2000) tracePoints.shift();

    state.forces.total = total;
    state.forces.gravity = gravity;
    state.forces.drag = drag;
    state.forces.spring = spring;

    return snapshot();
  }

  function snapshot() {
    return {
      time: state.time,
      position: { ...state.position },
      velocity: { ...state.velocity },
      acceleration: { ...state.acceleration },
      massKg: state.massKg,
      scenario: state.scenario,
      forces: {
        total: { ...state.forces.total },
        gravity: { ...state.forces.gravity },
        drag: { ...state.forces.drag },
        spring: { ...state.forces.spring },
      },
      trace: tracePoints.slice(),
      groundY: state.groundY,
      springY: state.springY,
      collision: { ...state.collision },
      lever: { ...state.lever },
      forceComp: { ...state.forceComp },
    };
  }

  return {
    reset,
    clearTrace,
    step: (dt, params) => integrate(dt, params),
    getSnapshot: () => snapshot(),
  };
}


