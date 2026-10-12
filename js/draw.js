/* KSMS Comic v2 - hand-draw layer (layer 2).
   Layers: 1 photo (filter) -> 2 drawing (this file) -> 3 stickers.
   Ported from KSMS Dice v1 draw tools: pen/highlighter/eraser,
   thin/normal/thick, 10 swatches, stroke-history undo/redo/clear.
   Strokes stored per cut in relative coords (resolution/aspect independent). */

const DRAW_SIZES = {
  thin:   { pen: 2, hi: 10, eraser: 14 },
  normal: { pen: 4, hi: 16, eraser: 28 },
  thick:  { pen: 8, hi: 26, eraser: 48 }
};
const DRAW_CAP = 100;

const pen = { mode: 'select', tool: 'pen', color: '#111111', size: 'normal', drawing: false };
let currentStroke = null;
let liveStroke = null; // in-progress eraser stroke, replayed during full renders

const DI_ON = 'w-8 h-8 flex items-center justify-center rounded-lg tool-btn shrink-0 bg-amber-500 text-white';
const DI_OFF = 'w-8 h-8 flex items-center justify-center rounded-lg tool-btn shrink-0 bg-white border border-stone-200 text-stone-600';

function drawWidth(st, w) {
  const b = DRAW_SIZES[st.size] || DRAW_SIZES.normal;
  const base = st.tool === 'eraser' ? b.eraser : st.tool === 'highlighter' ? b.hi : b.pen;
  return base * (w / 640);
}

function setupStrokeStyle(c, st, w) {
  if (st.tool === 'eraser') {
    c.globalCompositeOperation = 'destination-out';
    c.globalAlpha = 1;
    c.strokeStyle = 'rgba(0,0,0,1)';
  } else if (st.tool === 'highlighter') {
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 0.35;
    c.strokeStyle = st.color;
  } else {
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.strokeStyle = st.color;
  }
  c.lineWidth = drawWidth(st, w);
  c.lineCap = 'round';
  c.lineJoin = 'round';
}

function paintStrokeOn(c, st, w, h) {
  const pts = st.points;
  if (!pts || !pts.length) return;
  setupStrokeStyle(c, st, w);
  c.beginPath();
  c.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x * w, pts[i].y * h);
  if (pts.length === 1) c.lineTo(pts[0].x * w + 0.1, pts[0].y * h + 0.1);
  c.stroke();
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

function paintSegOn(c, st, w, h, a, b) {
  setupStrokeStyle(c, st, w);
  c.beginPath();
  c.moveTo(a.x * w, a.y * h);
  c.lineTo(b.x * w, b.y * h);
  c.stroke();
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
}

/* Replay onto target (isolated offscreen so eraser only eats ink, never photo) */
function paintCutDrawings(tCtx, drawings, w, h) {
  if (!drawings || !drawings.length) return;
  const off = document.createElement('canvas');
  off.width = Math.max(1, Math.round(w));
  off.height = Math.max(1, Math.round(h));
  const o = off.getContext('2d');
  let start = 0;
  for (let i = drawings.length - 1; i >= 0; i--) {
    if (drawings[i].clear) { start = i + 1; break; }
  }
  for (let i = start; i < drawings.length; i++) {
    if (drawings[i].clear) continue;
    paintStrokeOn(o, drawings[i], w, h);
  }
  tCtx.save();
  tCtx.globalAlpha = 1;
  tCtx.drawImage(off, 0, 0, w, h);
  tCtx.restore();
}

function pushDrawing(st) {
  const d = cuts[activeIndex].drawings;
  d.push(st);
  while (d.length > DRAW_CAP) d.shift();
}

function drawRelPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}

function onDrawPointerDown(e) {
  if (pen.mode !== 'draw') return;
  e.preventDefault();
  const p = drawRelPos(e);
  pen.drawing = true;
  beginHist();
  currentStroke = { tool: pen.tool, color: pen.color, size: pen.size, points: [p] };
  cuts[activeIndex].redo = [];
  if (pen.tool === 'eraser') {
    liveStroke = currentStroke;
    applyAllEffects();
  } else {
    paintStrokeOn(canvas.getContext('2d'), currentStroke, canvas.width, canvas.height);
  }
  try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
}

function onDrawPointerMove(e) {
  if (pen.mode !== 'draw' || !pen.drawing || !currentStroke) return;
  e.preventDefault();
  const p = drawRelPos(e);
  const pts = currentStroke.points;
  const prev = pts[pts.length - 1];
  pts.push(p);
  if (pen.tool === 'eraser') {
    applyAllEffects(); // full replay: eraser stays inside ink layer
  } else {
    paintSegOn(canvas.getContext('2d'), currentStroke, canvas.width, canvas.height, prev, p);
  }
}

function onDrawPointerUp() {
  if (pen.mode !== 'draw' || !pen.drawing) return;
  if (currentStroke && currentStroke.points.length > 0) pushDrawing(currentStroke);
  currentStroke = null;
  liveStroke = null;
  pen.drawing = false;
  commitHist();
  applyAllEffects();
  scheduleAutosave();
  updateDrawHistoryButtons();
}

function drawUndo() {
  const c = cuts[activeIndex];
  if (c.drawings.length) {
    c.redo.push(c.drawings.pop());
    applyAllEffects(); scheduleAutosave(); updateDrawHistoryButtons();
  }
}

function drawRedo() {
  const c = cuts[activeIndex];
  if (c.redo.length) {
    c.drawings.push(c.redo.pop());
    applyAllEffects(); scheduleAutosave(); updateDrawHistoryButtons();
  }
}

function drawClear() {
  pushHistory();
  pushDrawing({ clear: true });
  cuts[activeIndex].redo = [];
  applyAllEffects(); scheduleAutosave(); updateDrawHistoryButtons();
}

function updateDrawHistoryButtons() {
  const u = document.getElementById('d-undo');
  const r = document.getElementById('d-redo');
  const c = cuts[activeIndex];
  if (u) u.classList.toggle('opacity-40', c.drawings.length === 0);
  if (r) r.classList.toggle('opacity-40', c.redo.length === 0);
}

function setPenMode(m) {
  pen.mode = m;
  if (pen.mode === 'draw' && isEditingMode) finishStickerEditing();
  selectedSticker = null;
  applyAllEffects();
  refreshDrawToolbar();
}

function refreshDrawToolbar() {
  const inSelect = pen.mode === 'select';
  const dim = inSelect ? ' opacity-40' : '';
  document.querySelectorAll('[data-pmode]').forEach(b => {
    b.className = (b.dataset.pmode === pen.mode ? DI_ON : DI_OFF);
  });
  document.querySelectorAll('[data-dtool]').forEach(b => {
    b.className = (b.dataset.dtool === pen.tool ? DI_ON : DI_OFF) + dim;
  });
  document.querySelectorAll('[data-dsize]').forEach(b => {
    b.className = (b.dataset.dsize === pen.size ? DI_ON : DI_OFF) + dim;
  });
  document.querySelectorAll('[data-dcolor]').forEach(b => {
    const on = b.dataset.dcolor.toLowerCase() === String(pen.color).toLowerCase();
    b.className = 'w-6 h-6 rounded-full border-2 shrink-0 ' + (on ? 'border-amber-500 shadow' : 'border-stone-200') + dim;
  });
  updateDrawHistoryButtons();
}

/* Blank white paper as layer-1 base, so users can draw from scratch */
function setWhitePaper() {
  pushHistory();
  const idx = activeIndex; // capture: user may switch cuts while loading
  const dims = getCutDims();
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = Math.round(640 * dims.h / dims.w);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  const url = c.toDataURL('image/png');
  const img = new Image();
  img.onload = () => {
    cuts[idx].image = img;
    cuts[idx].imageSrc = url;
    applyAllEffects();
    scheduleAutosave();
  };
  img.src = url;
}

function initDrawTools() {
  canvas.addEventListener('pointerdown', onDrawPointerDown);
  canvas.addEventListener('pointermove', onDrawPointerMove);
  canvas.addEventListener('pointerup', onDrawPointerUp);
  canvas.addEventListener('pointercancel', onDrawPointerUp);
  document.querySelectorAll('[data-pmode]').forEach(b => {
    b.addEventListener('click', () => setPenMode(b.dataset.pmode));
  });
  document.querySelectorAll('[data-dtool]').forEach(b => {
    b.addEventListener('click', () => { pen.tool = b.dataset.dtool; setPenMode('draw'); });
  });
  document.querySelectorAll('[data-dsize]').forEach(b => {
    b.addEventListener('click', () => { pen.size = b.dataset.dsize; refreshDrawToolbar(); });
  });
  document.querySelectorAll('[data-dcolor]').forEach(b => {
    b.addEventListener('click', () => { pen.color = b.dataset.dcolor; refreshDrawToolbar(); });
  });
  const u = document.getElementById('d-undo');
  const r = document.getElementById('d-redo');
  const cl = document.getElementById('d-clear');
  if (u) u.addEventListener('click', drawUndo);
  if (r) r.addEventListener('click', drawRedo);
  if (cl) cl.addEventListener('click', drawClear);
  refreshDrawToolbar();
}
