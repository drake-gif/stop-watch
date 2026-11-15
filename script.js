const PERIMETER = 100; // matches pathLength on the rectangle

const $ = (id) => document.getElementById(id);
const timeEl = $('time');
const statusEl = $('status');
const sweep = $('sweep');
const toggleBtn = $('toggle');
const lapBtn = $('lap');
const resetBtn = $('reset');
const lapsEl = $('laps');
const setupEl = $('setup');
const hoursInput = $('hours');
const minutesInput = $('minutes');
const secondsInput = $('seconds');
const timeInputs = [hoursInput, minutesInput, secondsInput];
const hintEl = $('hint');
const tabSw = $('tab-sw');
const tabTm = $('tab-tm');

// Each mode keeps its own state, so switching tabs never loses progress.
const sw = { running: false, start: 0, before: 0, lastLap: 0, count: 0 };
const tm = { running: false, start: 0, before: 0, duration: 0, done: false };
let mode = 'sw';
let audioCtx = null;

const pad = (n, l = 2) => String(n).padStart(l, '0');

function format(ms, roundUp = false, millis = false) {
  const total = roundUp ? Math.ceil(ms / 1000) : Math.floor(ms / 1000);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  let base = pad(m) + ':' + pad(s);
  if (millis) base += '.' + pad(Math.floor(ms / 10) % 100);
  return h > 0 ? h + ':' + base : base;
}

const elapsed = (s) => (s.running ? s.before + (performance.now() - s.start) : s.before);
const started = (s) => s.running || s.before > 0;
const part = (input) => Math.max(0, parseInt(input.value, 10) || 0);
const typedMs = () => (part(hoursInput) * 3600 + part(minutesInput) * 60 + part(secondsInput)) * 1000;

/* ---------- Alarm ---------- */
function beep() {
  if (!audioCtx) return;
  for (let i = 0; i < 3; i++) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const t = audioCtx.currentTime + i * 0.35;
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

/* ---------- Drawing ---------- */
function render() {
  let ms, offset;
  if (mode === 'sw') {
    ms = elapsed(sw);
    offset = PERIMETER * (1 - (ms % 60000) / 60000);
  } else if (started(tm)) {
    ms = Math.max(0, tm.duration - elapsed(tm));
    offset = -PERIMETER * (1 - ms / tm.duration); // used time turns grey clockwise from the top centre
  } else {
    ms = typedMs();
    offset = 0;
  }
  timeEl.textContent = format(ms, mode === 'tm', mode === 'sw');
  timeEl.classList.toggle('done', mode === 'tm' && tm.done);
  sweep.style.strokeDashoffset = offset;
}

function updateUI() {
  const s = mode === 'sw' ? sw : tm;

  toggleBtn.textContent = tm.done && mode === 'tm' ? 'Done' : s.running ? 'Pause' : s.before > 0 ? 'Resume' : 'Start';
  toggleBtn.disabled = mode === 'tm' && tm.done;
  resetBtn.disabled = !started(s);

  setupEl.hidden = mode !== 'tm';
  timeInputs.forEach((input) => { input.disabled = started(tm); });
  lapBtn.hidden = mode !== 'sw';
  lapsEl.hidden = mode !== 'sw';
  lapBtn.disabled = !sw.running;
  hintEl.textContent = mode === 'sw'
    ? 'Keyboard: Space start/pause · L lap · R reset'
    : 'Keyboard: Space start/pause · R reset';

  if (mode === 'sw') {
    statusEl.textContent = sw.running ? 'Running' : sw.before > 0 ? 'Paused' : 'Ready';
  } else {
    statusEl.textContent = tm.done ? "Time's up" : tm.running ? 'Counting down' : tm.before > 0 ? 'Paused' : 'Ready';
  }
  render();
}

function loop() {
  if (tm.running && elapsed(tm) >= tm.duration) {
    tm.running = false;
    tm.before = tm.duration;
    tm.done = true;
    beep();
    updateUI();
  }
  if (sw.running || tm.running) render();
  requestAnimationFrame(loop);
}

/* ---------- Actions ---------- */
function toggle() {
  const s = mode === 'sw' ? sw : tm;
  if (s.running) {
    s.before = elapsed(s);
    s.running = false;
  } else {
    if (mode === 'tm' && !started(tm)) {
      const ms = typedMs();
      if (ms <= 0) {
        statusEl.textContent = 'Enter a time above 0';
        minutesInput.focus();
        return;
      }
      tm.duration = ms;
      tm.done = false;
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    }
    s.start = performance.now();
    s.running = true;
  }
  updateUI();
}

function reset() {
  if (mode === 'sw') {
    Object.assign(sw, { running: false, before: 0, lastLap: 0, count: 0 });
    lapsEl.innerHTML = '';
  } else {
    Object.assign(tm, { running: false, before: 0, done: false });
  }
  updateUI();
}

function lap() {
  if (mode !== 'sw' || !sw.running) return;
  const total = elapsed(sw);
  sw.count++;
  const li = document.createElement('li');
  li.innerHTML = '<span>' + sw.count + '</span><span>' + format(total - sw.lastLap, false, true) + '</span><span>' + format(total, false, true) + '</span>';
  lapsEl.prepend(li);
  sw.lastLap = total;
}

function setMode(next) {
  mode = next;
  tabSw.setAttribute('aria-selected', String(next === 'sw'));
  tabTm.setAttribute('aria-selected', String(next === 'tm'));
  updateUI();
}

/* ---------- Events ---------- */
toggleBtn.addEventListener('click', toggle);
resetBtn.addEventListener('click', reset);
lapBtn.addEventListener('click', lap);
tabSw.addEventListener('click', () => setMode('sw'));
tabTm.addEventListener('click', () => setMode('tm'));
timeInputs.forEach((input) => input.addEventListener('input', render));

document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT') {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); toggle(); }
    return;
  }
  if (tag === 'BUTTON' && e.code === 'Space') return; // focused button handles it
  if (e.code === 'Space') { e.preventDefault(); if (!toggleBtn.disabled) toggle(); }
  else if (e.key === 'l' || e.key === 'L') lap();
  else if ((e.key === 'r' || e.key === 'R') && !resetBtn.disabled) reset();
});

updateUI();
requestAnimationFrame(loop);
