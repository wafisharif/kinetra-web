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

/* Mobile nav toggle and nav dropdowns now live in nav.js, shared by every
   page (see that file for why this moved out of main.js). */

/* ---------------------------------------------------------------------- */
/* Hero headline word cycle                                                */
/* ---------------------------------------------------------------------- */
(function heroCycle() {
  const el = document.getElementById('heroCycle');
  if (!el) return;
  const words = ['recovery', 'progress', 'strength', 'consistency', 'form', 'mobility'];
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

// Small color helpers so drawPose's glow can be tinted to whatever brand
// color a given demo passes in (blue for the clinical demos, teal for the
// calm 2-Minute Reset one) instead of a second hardcoded color living
// alongside the first.
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgba(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function lighten(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  return { r: mix(r), g: mix(g), b: mix(b) };
}

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
  let breath = 0; // 0..1, only set by 'reset' below; drives the breathing-ring overlay

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
    case 'reset': {
      // A slow, calm loop for the 2-Minute Reset demo -- deliberately not
      // one of the six clinical tasks above. `period` is set to exactly
      // 10s by the caller (4s inhale + 6s exhale, matching the app's real
      // Deep Breathing step), so `p` here doubles as the breath phase.
      breath = p < 0.4 ? easeInOut(p / 0.4) : easeInOut(1 - (p - 0.4) / 0.6);
      torsoLean = 0.08 - 0.03 * breath + 0.05 * Math.sin(2 * Math.PI * p);
      hipShift.y = -0.05 * breath;
      shoulderAngle = 0.15 + 0.4 * Math.sin(2 * Math.PI * p);
      elbowBend = 0.3 + 0.08 * Math.sin(2 * Math.PI * p + 1);
      hipFlex = 0.03;
      kneeFlex = 0.06;
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

  return {
    hip, shoulder, neckTop, head, elbow, wrist, knee, ankle, headR: SEG.headR,
    // raw joint-angle inputs, in radians -- surfaced so the interactive
    // layer below can show a real reading (e.g. "Knee flexion: 92°")
    // instead of a made-up number.
    angles: { torsoLean, hipFlex, kneeFlex, shoulderAngle, elbowBend },
    // 0..1, only meaningful for 'reset' -- see the breathing-ring overlay.
    breath,
  };
}

/* ---------------------------------------------------------------------- */
/* Interactive layer — cursor-reactive joints, ripples, live angle readout */
/* Shared by the hero demo and the task-coverage demo: move your cursor    */
/* near a joint and it lights up; click one to read its tracked angle,     */
/* the same way the real app reports a joint-angle score.                 */
/* ---------------------------------------------------------------------- */
const REDUCE_MOTION = typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const JOINT_READOUT_NAMES = {
  shoulder: 'Shoulder angle',
  elbow: 'Elbow bend',
  wrist: 'Wrist tracked',
  hip: 'Hip flexion',
  knee: 'Knee flexion',
  ankle: 'Ankle tracked',
  head: 'Head tracked',
};

function angleForJoint(name, angles) {
  const toDeg = (r) => Math.round((r * 180) / Math.PI);
  switch (name) {
    case 'hip': return toDeg(angles.hipFlex) + '°';
    case 'knee': return toDeg(angles.kneeFlex) + '°';
    case 'shoulder': return toDeg(angles.shoulderAngle) + '°';
    case 'elbow': return toDeg(angles.elbowBend) + '°';
    default: return '✓';
  }
}

function createPoseInteraction(canvas) {
  const state = {
    pointer: { x: 0, y: 0, active: false },
    ripples: [],
    readout: null, // { x, y, text, life }
    joints: {}, // last frame's screen-space joint positions, by name
  };

  function toLocal(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  canvas.addEventListener('mousemove', (e) => {
    const p = toLocal(e.clientX, e.clientY);
    state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true;
  });
  canvas.addEventListener('mouseleave', () => { state.pointer.active = false; });
  canvas.addEventListener('touchmove', (e) => {
    if (!e.touches || !e.touches[0]) return;
    const p = toLocal(e.touches[0].clientX, e.touches[0].clientY);
    state.pointer.x = p.x; state.pointer.y = p.y; state.pointer.active = true;
  }, { passive: true });
  canvas.addEventListener('touchend', () => { state.pointer.active = false; });

  canvas.addEventListener('click', (e) => {
    const p = toLocal(e.clientX, e.clientY);
    state.ripples.push({ x: p.x, y: p.y, r: 4, maxR: 140, life: 1 });

    let nearestName = null;
    let nearestD = Infinity;
    for (const name in state.joints) {
      const j = state.joints[name];
      const d = Math.hypot(j.x - p.x, j.y - p.y);
      if (d < nearestD) { nearestD = d; nearestName = name; }
    }
    if (nearestName && nearestD < 70 && state.joints[nearestName].angles) {
      const label = JOINT_READOUT_NAMES[nearestName] || 'Tracked';
      const val = angleForJoint(nearestName, state.joints[nearestName].angles);
      state.readout = { x: p.x, y: p.y, text: label + ': ' + val, life: 1 };
    }
  });

  return state;
}

function updateInteraction(state, dt) {
  state.ripples = state.ripples.filter((r) => r.life > 0);
  state.ripples.forEach((r) => {
    r.r += (r.maxR - r.r) * 0.09 + 26 * dt;
    r.life -= dt * 1.1;
  });
  if (state.readout) {
    state.readout.life -= dt * 0.6;
    if (state.readout.life <= 0) state.readout = null;
  }
}

function drawInteractionOverlay(ctx, state) {
  state.ripples.forEach((r) => {
    ctx.strokeStyle = 'rgba(142,198,247,' + Math.max(r.life, 0) * 0.6 + ')';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.stroke();
  });

  if (state.readout) {
    const ro = state.readout;
    ctx.globalAlpha = Math.min(ro.life, 1);
    ctx.font = "600 13px 'JetBrains Mono', monospace";
    const padX = 10, padY = 7;
    const tw = ctx.measureText(ro.text).width;
    const bx = ro.x + 14, by = ro.y - 14 - 26;
    ctx.fillStyle = 'rgba(10,12,16,0.88)';
    const r = 8;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + tw + padX * 2, by, bx + tw + padX * 2, by + 28, r);
    ctx.arcTo(bx + tw + padX * 2, by + 28, bx, by + 28, r);
    ctx.arcTo(bx, by + 28, bx, by, r);
    ctx.arcTo(bx, by, bx + tw + padX * 2, by, r);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8ec6f7';
    ctx.fillText(ro.text, bx + padX, by + 18);
    ctx.globalAlpha = 1;
  }
}

/**
 * Ambient breathing rings for the 2-Minute Reset demo: two concentric rings
 * centered on the chest that expand and brighten through the 4s inhale and
 * ease back on the 6s exhale, always playing so the widget never looks
 * static. `boosted` (the visitor's cursor is over the canvas) widens and
 * brightens them further -- the "hover and it ripples" moment, tied to a
 * real breath rhythm instead of a random shimmer.
 */
function drawBreathRings(ctx, center, breath, boosted, unit) {
  const boost = boosted ? 1 : 0;
  const rings = [
    { rBase: 0.55, rAmp: 0.35, op: 0.24 },
    { rBase: 0.85, rAmp: 0.45, op: 0.14 },
  ];
  rings.forEach((ring) => {
    const r = (ring.rBase + ring.rAmp * breath) * unit * (1 + boost * 0.16);
    const alpha = (ring.op + boost * 0.18) * (0.45 + 0.55 * breath);
    ctx.beginPath();
    ctx.strokeStyle = rgba('#7fe0c8', alpha);
    ctx.lineWidth = 1.4;
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.stroke();
  });
}

/**
 * Draw a pose onto a canvas 2D context. `unit` is pixels per abstract unit.
 * `origin` is the canvas-space anchor for the hip.
 */
function drawPose(ctx, pose, origin, unit, opts) {
  const brand = (opts && opts.brand) || '#8ec6f7';
  const brandDeep = (opts && opts.brandDeep) || '#3f90e0';
  const interaction = opts && opts.interaction;
  const toPx = (pt) => ({ x: origin.x + pt.x * unit, y: origin.y + pt.y * unit });

  let hip = toPx(pose.hip);
  let shoulder = toPx(pose.shoulder);
  let neckTop = toPx(pose.neckTop);
  let head = toPx(pose.head);
  let elbow = toPx(pose.elbow);
  let wrist = toPx(pose.wrist);
  let knee = toPx(pose.knee);
  let ankle = toPx(pose.ankle);
  const headR = pose.headR * unit;

  // Cursor-reactive spring displacement: a joint near the pointer nudges
  // away from it and glows brighter, then the base render below still
  // draws it in its nudged spot. Purely visual -- it never feeds back
  // into the walk-cycle math above.
  const near = {};
  if (interaction && interaction.pointer.active && !REDUCE_MOTION) {
    const radius = unit * 0.5;
    const pointer = interaction.pointer;
    // neckTop and head are deliberately NOT in this generic set: the head
    // circle sits at a fixed, rigid offset from neckTop (see computePose's
    // `head = extendAngle(neckTop, SEG.headR, ...)`), so perturbing them as
    // two independent points -- each nudged by its own distance-to-pointer --
    // let them drift apart by different amounts and visibly pop the head off
    // the end of the neck bone when the cursor passed near it. They're
    // handled as one rigid unit right after this loop instead.
    const named = { hip, shoulder, elbow, wrist, knee, ankle };
    for (const name in named) {
      const j = named[name];
      const d = Math.hypot(j.x - pointer.x, j.y - pointer.y);
      if (d < radius && d > 0.001) {
        const f = 1 - d / radius;
        const ang = Math.atan2(j.y - pointer.y, j.x - pointer.x);
        j.x += Math.cos(ang) * f * unit * 0.09;
        j.y += Math.sin(ang) * f * unit * 0.09;
        near[name] = f;
      }
    }

    // Head + top-of-neck as a single rigid unit: one distance check (from
    // the head, since that's the big, obvious hover target), one shared
    // displacement vector applied to both points so the head never
    // separates from the neck bone it's attached to.
    const headD = Math.hypot(head.x - pointer.x, head.y - pointer.y);
    if (headD < radius && headD > 0.001) {
      const f = 1 - headD / radius;
      const ang = Math.atan2(head.y - pointer.y, head.x - pointer.x);
      const dx = Math.cos(ang) * f * unit * 0.09;
      const dy = Math.sin(ang) * f * unit * 0.09;
      head.x += dx; head.y += dy;
      neckTop.x += dx; neckTop.y += dy;
      near.head = f;
    }
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // glow
  ctx.save();
  ctx.shadowColor = rgba(brand, 0.55);
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
  const jointList = { shoulder, elbow, wrist, hip, knee, ankle };
  for (const name in jointList) {
    const j = jointList[name];
    const f = near[name] || 0;
    if (f > 0) {
      const glowR = Math.max(6, unit * 0.09) * (1 + f * 2.2);
      const rg = ctx.createRadialGradient(j.x, j.y, 0, j.x, j.y, glowR);
      const hot = lighten(brand, 0.45);
      rg.addColorStop(0, `rgba(${hot.r}, ${hot.g}, ${hot.b}, ${0.55 * f})`);
      rg.addColorStop(1, rgba(brand, 0));
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(j.x, j.y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = f > 0 ? '#ffffff' : '#f6f8fb';
    ctx.beginPath();
    ctx.arc(j.x, j.y, Math.max(2.4, unit * 0.045) * (1 + f * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  // record screen-space positions (+ the frame's raw angles) so the
  // interaction layer's click handler can hit-test against real joints.
  if (interaction) {
    interaction.joints = {
      shoulder: { x: shoulder.x, y: shoulder.y, angles: pose.angles },
      elbow: { x: elbow.x, y: elbow.y, angles: pose.angles },
      wrist: { x: wrist.x, y: wrist.y, angles: pose.angles },
      hip: { x: hip.x, y: hip.y, angles: pose.angles },
      knee: { x: knee.x, y: knee.y, angles: pose.angles },
      ankle: { x: ankle.x, y: ankle.y, angles: pose.angles },
    };
  }
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
  const interaction = createPoseInteraction(canvas);
  let lastTs = null;

  function frame(ts) {
    const dt = lastTs == null ? 0 : Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    const task = getTask();
    const t = (ts / 1000) % period;
    const p = t / period;
    const { cx, groundY } = drawBackdrop(ctx, w, h, t);
    const unit = h * 0.34;
    const pose = computePose(task, p);
    const origin = { x: cx, y: groundY - (SEG.thigh + SEG.shank) * unit };
    drawPose(ctx, pose, origin, unit, { interaction });
    updateInteraction(interaction, dt);
    drawInteractionOverlay(ctx, interaction);
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
      desc: 'Scores a controlled raise to shoulder height and back down. It\'s the same pattern used to check for early rotator-cuff or shoulder impingement limits.',
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
      desc: 'Combines a chair rise, a short walk, a turn, and a return to seated. It\'s one of the most-used composite mobility screens in clinical practice.',
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
    const interaction = createPoseInteraction(canvas);
    let lastTs = null;
    function frame(ts) {
      const dt = lastTs == null ? 0 : Math.min((ts - lastTs) / 1000, 0.05);
      lastTs = ts;
      const period = currentPeriod;
      const t = (ts / 1000) % period;
      const p = t / period;
      const { cx, groundY } = drawBackdrop(ctx, w, h, t);
      const unit = h * 0.32;
      const pose = computePose(currentTask, p);
      const origin = { x: cx, y: groundY - (SEG.thigh + SEG.shank) * unit };
      drawPose(ctx, pose, origin, unit, { interaction });
      updateInteraction(interaction, dt);
      drawInteractionOverlay(ctx, interaction);
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

/* ---------------------------------------------------------------------- */
/* 2-Minute Reset demo -- a calm, always-breathing loop. Hovering (or a     */
/* finger on mobile) widens and brightens the breathing rings; clicking a  */
/* joint still shows a real tracked angle, same as every other demo here.  */
/* ---------------------------------------------------------------------- */
(function resetDemo() {
  const canvas = document.getElementById('resetCanvas');
  if (!canvas) return;
  const label = document.getElementById('resetBreathLabel');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const interaction = createPoseInteraction(canvas);
  const period = 10; // 4s inhale + 6s exhale -- the app's real Deep Breathing step
  let lastTs = null;
  let lastLabel = '';

  function frame(ts) {
    const dt = lastTs == null ? 0 : Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    const t = (ts / 1000) % period;
    const p = t / period;

    const { cx, groundY } = drawBackdrop(ctx, w, h, t);
    const unit = h * 0.32;
    const pose = computePose('reset', p);
    const origin = { x: cx, y: groundY - (SEG.thigh + SEG.shank) * unit };
    const chestPx = { x: origin.x + pose.shoulder.x * unit, y: origin.y + pose.shoulder.y * unit };
    const boosted = interaction.pointer.active && !REDUCE_MOTION;

    drawBreathRings(ctx, chestPx, pose.breath, boosted, unit);
    drawPose(ctx, pose, origin, unit, { interaction, brand: '#7fe0c8', brandDeep: '#2f9c80' });
    updateInteraction(interaction, dt);
    drawInteractionOverlay(ctx, interaction);

    if (label) {
      const nextLabel = p < 0.4 ? 'Breathe in…' : 'Breathe out…';
      if (nextLabel !== lastLabel) {
        label.textContent = nextLabel;
        lastLabel = nextLabel;
      }
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
