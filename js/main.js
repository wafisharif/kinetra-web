// ============================================================================
// Kinetra site — interactions + illustrative pose-animation demos.
// The skeleton renders are stylized procedural animations (sine-driven joint
// angles), not real motion-capture or a MuJoCo/MyoSuite simulation — they
// exist to communicate the app's pose-tracking concept visually.
// ============================================================================

document.getElementById('year').textContent = new Date().getFullYear();

/* ---------------------------------------------------------------------- */
/* Reveal-on-scroll                                                        */
/* ---------------------------------------------------------------------- */
(function revealOnScroll() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  // CSS only hides .reveal elements when <html> has .js-reveal (added by
  // the inline head script), so this only needs to handle the reveal
  // itself — visibility is already safe by default either way.
  if (!('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  items.forEach((el) => io.observe(el));

  // Safety net: force-reveal anything still hidden after 4s (covers any
  // edge case where an observer never fires for a given element).
  setTimeout(() => {
    items.forEach((el) => el.classList.add('is-visible'));
  }, 4000);
})();

/* ---------------------------------------------------------------------- */
/* Mobile nav toggle                                                       */
/* ---------------------------------------------------------------------- */
(function mobileNav() {
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (!toggle || !links) return;
  toggle.addEventListener('click', () => {
    const open = links.style.display === 'flex';
    links.style.cssText = open
      ? ''
      : 'display:flex;position:absolute;top:64px;left:0;right:0;flex-direction:column;background:#0a0b0d;padding:20px 24px;border-bottom:1px solid rgba(255,255,255,.1);gap:18px;';
  });
})();

/* ---------------------------------------------------------------------- */
/* Hero headline word cycle                                                */
/* ---------------------------------------------------------------------- */
(function heroCycle() {
  const el = document.getElementById('heroCycle');
  if (!el) return;
  const words = ['recovery', 'progress', 'strength', 'consistency', 'form'];
  let i = 0;
  setInterval(() => {
    i = (i + 1) % words.length;
    el.style.opacity = 0;
    setTimeout(() => {
      el.textContent = words[i];
      el.style.opacity = 1;
    }, 260);
  }, 2600);
  el.style.transition = 'opacity .26s ease';
})();

/* ---------------------------------------------------------------------- */
/* Pose renderer — shared by the hero panel and the task-coverage demo     */
/* ---------------------------------------------------------------------- */

function extendAngle(base, length, angleRad) {
  return {
    x: base.x + length * Math.sin(angleRad),
    y: base.y + length * Math.cos(angleRad),
  };
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return (1 - Math.cos(Math.PI * t)) / 2; }

// Segment lengths, in abstract units (scaled to canvas at draw time).
const SEG = {
  torso: 0.5,
  neck: 0.1,
  headR: 0.115,
  upperArm: 0.27,
  forearm: 0.24,
  thigh: 0.42,
  shank: 0.4,
};

/**
 * Compute a full-body pose (all joints, in abstract units, origin at hip)
 * for a given task and a phase 0..1 through that task's motion cycle.
 */
function computePose(task, p) {
  let hipShift = { x: 0, y: 0 }; // offset applied to hip (bob / sway)
  let torsoLean = 0; // radians, + leans forward
  let hipFlex = 0; // + = thigh swings forward
  let kneeFlex = 0; // additional forward bend at the knee
  let shoulderAngle = 0.18; // resting arm, slightly forward of vertical-down
  let elbowBend = 0.35; // slight natural elbow bend at rest

  switch (task) {
    case 'sit-to-stand': {
      const s = easeInOut((Math.cos(2 * Math.PI * p) + 1) / 2); // 0 sit -> 1 stand -> 0 sit
      hipShift.y = lerp(0.34, 0, s);
      torsoLean = lerp(0.55, 0.04, s);
      hipFlex = lerp(0.95, 0.02, s);
      kneeFlex = lerp(1.25, 0.03, s);
      shoulderAngle = lerp(-0.55, 0.18, s);
      elbowBend = lerp(0.15, 0.35, s);
      break;
    }
    case 'reach': {
      const s = easeInOut((Math.sin(2 * Math.PI * p - Math.PI / 2) + 1) / 2);
      torsoLean = lerp(0.02, 0.16, s);
      shoulderAngle = lerp(0.15, -2.85, s); // sweeps up overhead
      elbowBend = lerp(0.3, 0.05, s);
      hipFlex = 0.05;
      kneeFlex = 0.08;
      break;
    }
    case 'arm-raise': {
      const s = easeInOut((Math.sin(2 * Math.PI * p - Math.PI / 2) + 1) / 2);
      shoulderAngle = lerp(0.15, -1.62, s); // lateral raise to shoulder height
      elbowBend = 0.12;
      hipFlex = 0.03;
      kneeFlex = 0.06;
      break;
    }
    case 'gait': {
      const w = 2 * Math.PI * p;
      hipFlex = 0.55 * Math.sin(w);
      kneeFlex = 0.5 + 0.5 * Math.sin(w - 1.1);
      if (kneeFlex < 0) kneeFlex = 0;
      shoulderAngle = -0.5 * Math.sin(w); // opposite-arm swing
      elbowBend = 0.5 + 0.25 * Math.sin(w);
      hipShift.y = 0.05 * Math.abs(Math.sin(w));
      torsoLean = 0.05;
      break;
    }
    case 'balance': {
      const wob = Math.sin(2 * Math.PI * p * 0.6) * 0.05 + Math.sin(2 * Math.PI * p * 1.7) * 0.02;
      torsoLean = 0.05 + wob;
      hipFlex = 0.02;
      kneeFlex = 0.15 + wob * 0.6;
      shoulderAngle = 0.5 + wob * 2;
      elbowBend = 0.2;
      hipShift.x = wob * 0.6;
      break;
    }
    case 'tug': {
      // Blend: 0-0.35 sit->stand, 0.35-0.75 walk, 0.75-1 turn+stand->sit
      if (p < 0.35) {
        const s = easeInOut(p / 0.35);
        hipShift.y = lerp(0.34, 0, s);
        torsoLean = lerp(0.55, 0.04, s);
        hipFlex = lerp(0.95, 0.05, s);
        kneeFlex = lerp(1.25, 0.08, s);
        shoulderAngle = lerp(-0.55, -0.4 * s, s);
        elbowBend = 0.3;
      } else if (p < 0.75) {
        const w = 2 * Math.PI * ((p - 0.35) / 0.4) * 3;
        hipFlex = 0.5 * Math.sin(w);
        kneeFlex = Math.max(0, 0.5 + 0.5 * Math.sin(w - 1.1));
        shoulderAngle = -0.5 * Math.sin(w);
        elbowBend = 0.5 + 0.25 * Math.sin(w);
        hipShift.y = 0.05 * Math.abs(Math.sin(w));
        torsoLean = 0.05;
      } else {
        const s = easeInOut((p - 0.75) / 0.25);
        hipShift.y = lerp(0, 0.1, s < 0.5 ? 0 : (s - 0.5) * 2);
        torsoLean = lerp(0.04, 0.3, s);
        hipFlex = lerp(0.05, 0.5, s);
        kneeFlex = lerp(0.08, 0.7, s);
        shoulderAngle = 0.1;
      }
      break;
    }
    default:
      break;
  }

  const hip = { x: hipShift.x, y: hipShift.y };
  const shoulder = extendAngle(hip, SEG.torso, Math.PI - torsoLean);
  const neckTop = extendAngle(shoulder, SEG.neck, Math.PI - torsoLean);
  const head = extendAngle(neckTop, SEG.headR, Math.PI - torsoLean);
  const elbow = extendAngle(shoulder, SEG.upperArm, shoulderAngle);
  const wrist = extendAngle(elbow, SEG.forearm, shoulderAngle - elbowBend);
  const knee = extendAngle(hip, SEG.thigh, hipFlex);
  const ankle = extendAngle(knee, SEG.shank, hipFlex - kneeFlex);

  return { hip, shoulder, neckTop, head, elbow, wrist, knee, ankle, headR: SEG.headR };
}

/**
 * Draw a pose onto a canvas 2D context. `unit` is pixels per abstract unit.
 * `origin` is the canvas-space anchor for the hip.
 */
function drawPose(ctx, pose, origin, unit, opts) {
  const brand = (opts && opts.brand) || '#8ec6f7';
  const brandDeep = (opts && opts.brandDeep) || '#3f90e0';
  const toPx = (pt) => ({ x: origin.x + pt.x * unit, y: origin.y + pt.y * unit });

  const hip = toPx(pose.hip);
  const shoulder = toPx(pose.shoulder);
  const neckTop = toPx(pose.neckTop);
  const head = toPx(pose.head);
  const elbow = toPx(pose.elbow);
  const wrist = toPx(pose.wrist);
  const knee = toPx(pose.knee);
  const ankle = toPx(pose.ankle);
  const headR = pose.headR * unit;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // glow
  ctx.save();
  ctx.shadowColor = 'rgba(142,198,247,0.55)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = brand;
  ctx.lineWidth = Math.max(3, unit * 0.055);

  const bones = [
    [shoulder, hip],
    [shoulder, neckTop],
    [shoulder, elbow],
    [elbow, wrist],
    [hip, knee],
    [knee, ankle],
  ];
  bones.forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });

  // head
  ctx.beginPath();
  ctx.fillStyle = brandDeep;
  ctx.arc(head.x, head.y, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // joints
  ctx.fillStyle = '#f6f8fb';
  [shoulder, elbow, wrist, hip, knee, ankle].forEach((j) => {
    ctx.beginPath();
    ctx.arc(j.x, j.y, Math.max(2.4, unit * 0.045), 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBackdrop(ctx, w, h, t) {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h * 0.52;
  ctx.save();
  ctx.strokeStyle = 'rgba(142,198,247,0.14)';
  ctx.lineWidth = 1;
  [0.9, 0.65, 0.42].forEach((f, i) => {
    ctx.beginPath();
    ctx.setLineDash(i === 1 ? [4, 6] : []);
    ctx.arc(cx, cy, Math.min(w, h) * f * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([3, 7]);
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, h);
  ctx.moveTo(0, cy);
  ctx.lineTo(w, cy);
  ctx.stroke();
  ctx.setLineDash([]);

  // ground line
  const groundY = h * 0.86;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(w * 0.12, groundY);
  ctx.lineTo(w * 0.88, groundY);
  ctx.stroke();
  ctx.restore();
  return { cx, groundY };
}

function startPoseLoop(canvas, getTask, period) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  function frame(ts) {
    const task = getTask();
    const t = (ts / 1000) % period;
    const p = t / period;
    const { cx, groundY } = drawBackdrop(ctx, w, h, t);
    const unit = h * 0.34;
    const pose = computePose(task, p);
    const origin = { x: cx, y: groundY - (SEG.thigh + SEG.shank) * unit };
    drawPose(ctx, pose, origin, unit, {});
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------------------- */
/* Hero demo panel                                                         */
/* ---------------------------------------------------------------------- */
(function heroDemo() {
  const canvas = document.getElementById('heroCanvas');
  if (!canvas) return;
  const label = document.getElementById('heroTaskLabel');
  const mRep = document.getElementById('mRep');
  const mSmooth = document.getElementById('mSmooth');
  const mSym = document.getElementById('mSym');

  const cycle = [
    { task: 'gait', name: 'Gait', smooth: 92, sym: 96 },
    { task: 'sit-to-stand', name: 'Sit-to-Stand', smooth: 88, sym: 94 },
    { task: 'reach', name: 'Reach', smooth: 90, sym: 89 },
    { task: 'balance', name: 'Balance', smooth: 85, sym: 97 },
  ];
  let idx = 0;
  let reps = 0;
  let current = cycle[0].task;

  startPoseLoop(canvas, () => current, 2.6);

  function tick() {
    const c = cycle[idx];
    current = c.task;
    label.textContent = c.name;
    mSmooth.textContent = c.smooth + '%';
    mSym.textContent = c.sym + '%';
    reps = 0;
    mRep.textContent = reps;
    const repTimer = setInterval(() => {
      reps += 1;
      mRep.textContent = reps;
    }, 1300);
    setTimeout(() => clearInterval(repTimer), 5200);
    idx = (idx + 1) % cycle.length;
  }
  tick();
  setInterval(tick, 5400);
})();

/* ---------------------------------------------------------------------- */
/* Task coverage tabs + demo                                               */
/* ---------------------------------------------------------------------- */
(function taskCoverage() {
  const tabs = document.querySelectorAll('.task-tab');
  const canvas = document.getElementById('taskCanvas');
  if (!tabs.length || !canvas) return;

  const COPY = {
    'sit-to-stand': {
      eyebrow: 'SIT-TO-STAND',
      title: 'Chair-rise strength & control',
      desc: 'Tracks hip and knee extension across each rise, flagging asymmetric weight-bearing and rushed, uncontrolled descents.',
      points: ['Rep count & tempo per rise', 'Left/right knee-extension symmetry', 'Descent-control smoothness score'],
      period: 3.2,
    },
    reach: {
      eyebrow: 'REACH',
      title: 'Overhead & functional reach',
      desc: 'Measures how far and how smoothly an arm extends overhead or forward, the movement clinicians use to gauge shoulder mobility.',
      points: ['Peak reach angle per side', 'Smoothness across the full extension', 'Session-over-session range tracking'],
      period: 2.6,
    },
    'arm-raise': {
      eyebrow: 'ARM RAISE',
      title: 'Lateral raise range of motion',
      desc: 'Scores a controlled raise to shoulder height and back down — the same pattern used to check for early rotator-cuff or shoulder impingement limits.',
      points: ['Range of motion vs. your calibrated baseline', 'Left/right comparison', 'Control on the way back down'],
      period: 2.4,
    },
    gait: {
      eyebrow: 'GAIT',
      title: 'Walking pattern analysis',
      desc: 'Analyzes stride pattern and joint timing while walking, surfacing asymmetries that are easy to miss by eye.',
      points: ['Step rhythm & cadence', 'Left/right stride symmetry', 'Joint-angle consistency over distance'],
      period: 1.6,
    },
    balance: {
      eyebrow: 'BALANCE',
      title: 'Single-leg stability',
      desc: 'Tracks postural sway while holding a single-leg stance, a standard proxy for fall risk and proprioceptive control.',
      points: ['Hold duration', 'Sway magnitude over time', 'Stability trend across sessions'],
      period: 4.5,
    },
    tug: {
      eyebrow: 'TIMED UP & GO',
      title: 'Sit, walk, turn, sit',
      desc: 'Combines a chair rise, a short walk, a turn, and a return to seated — one of the most-used composite mobility screens in clinical practice.',
      points: ['Full-sequence timing', 'Transition smoothness between phases', 'Turn stability'],
      period: 5.5,
    },
  };

  const eyebrowEl = document.getElementById('taskEyebrow');
  const titleEl = document.getElementById('taskTitle');
  const descEl = document.getElementById('taskDesc');
  const pointsEl = document.getElementById('taskPoints');
  const checkSvg = (t) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>${t}`;

  let currentTask = 'sit-to-stand';
  let currentPeriod = COPY['sit-to-stand'].period;

  // Uses its own rAF loop (rather than startPoseLoop) so the animation
  // period can change live as the visitor switches tabs.
  (function customLoop() {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    function frame(ts) {
      const period = currentPeriod;
      const t = (ts / 1000) % period;
      const p = t / period;
      const { cx, groundY } = drawBackdrop(ctx, w, h, t);
      const unit = h * 0.32;
      const pose = computePose(currentTask, p);
      const origin = { x: cx, y: groundY - (SEG.thigh + SEG.shank) * unit };
      drawPose(ctx, pose, origin, unit, {});
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })();

  function setTask(task) {
    currentTask = task;
    currentPeriod = COPY[task].period;
    const c = COPY[task];
    eyebrowEl.textContent = c.eyebrow;
    titleEl.textContent = c.title;
    descEl.textContent = c.desc;
    pointsEl.innerHTML = c.points.map((pt) => `<li>${checkSvg(pt)}</li>`).join('');
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      setTask(tab.dataset.task);
    });
  });
})();
