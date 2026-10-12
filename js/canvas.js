/* KSMS Comic v2 - canvas render core */
let canvas, ctx, fileLoader;

function renderCutToCanvas(targetCtx, cutIdx, w, h, isFocus) {
  const cut = cuts[cutIdx];
  targetCtx.save();
  targetCtx.fillStyle = state.filterPreset === 'ito' ? '#18181b' : '#fafaf9';
  targetCtx.fillRect(0, 0, w, h);
  targetCtx.beginPath(); targetCtx.rect(0, 0, w, h); targetCtx.clip();

  if (cut.image) {
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tCtx = tmp.getContext('2d');
    drawCoverImage(tCtx, cut.image, w, h);
    const imgData = tCtx.getImageData(0, 0, w, h);
    const out = applyActiveFilter(imgData, w, h, targetCtx);
    tCtx.putImageData(out, 0, 0);
    if (state.vignette) applyVignetteToCtx(tCtx, w, h);
    targetCtx.drawImage(tmp, 0, 0);
  } else {
    targetCtx.fillStyle = state.filterPreset === 'ito' ? '#09090b' : '#fffbeb';
    targetCtx.fillRect(0, 0, w, h);
    targetCtx.strokeStyle = state.filterPreset === 'ito' ? '#27272a' : '#fef3c7';
    targetCtx.lineWidth = 1.5;
    targetCtx.beginPath();
    targetCtx.moveTo(0, 0); targetCtx.lineTo(w, h);
    targetCtx.moveTo(w, 0); targetCtx.lineTo(0, h);
    targetCtx.stroke();
    targetCtx.font = `bold ${Math.max(12, Math.round(w * 0.08))}px '${state.filterPreset === 'ito' ? 'Noto Sans KR' : 'Jua'}'`;
    targetCtx.fillStyle = state.filterPreset === 'ito' ? '#52525b' : '#f59e0b';
    targetCtx.textAlign = 'center'; targetCtx.textBaseline = 'middle';
    targetCtx.fillText(`CUT ${cutIdx + 1}`, w / 2, h / 2);
  }

  // Layer 2: hand drawings (above photo, below stickers = layer 3)
  let dwList = cut.drawings || [];
  if (typeof liveStroke !== 'undefined' && liveStroke && cut.index === activeIndex && isFocus) {
    dwList = dwList.concat([liveStroke]);
  }
  paintCutDrawings(targetCtx, dwList, w, h);

  drawStickersToCtx(targetCtx, cut.stickers, w, h, isFocus);
  targetCtx.restore();
  drawCutBorder(targetCtx, 0, 0, w, h, state.borderWidth * (w / 640), state.borderStyle, cutIdx);
}

function renderMiniGridPreviews() {
  const n = getVisibleCount();
  const dims = getCutDims();
  const ratio = dims.h / dims.w;
  for (let i = 0; i < MAX_CUTS; i++) {
    const mc = document.getElementById(`mini-canvas-${i}`);
    const card = document.getElementById(`mini-card-${i}`);
    if (!mc || !card) continue;
    if (i >= n) { card.classList.add('hidden'); continue; }
    card.classList.remove('hidden');
    const mCtx = mc.getContext('2d');
    mc.width = 360; mc.height = Math.round(360 * ratio);
    mc.style.aspectRatio = `${dims.w} / ${dims.h}`;
    renderCutToCanvas(mCtx, i, mc.width, mc.height, false);
  }
}

/* Match workspace canvas + container to the real export cut ratio */
function updateWorkspaceAspect() {
  const dims = getCutDims();
  canvas.width = 640;
  canvas.height = Math.round(640 * dims.h / dims.w);
  const wrap = document.getElementById('workspace-container');
  if (wrap) wrap.style.aspectRatio = `${dims.w} / ${dims.h}`;
}

let renderQueued = false;

/* Coalesce rapid slider input into one paint per frame (Sobel is per-pixel) */
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; applyAllEffects(); });
}

function applyAllEffects() {
  renderCutToCanvas(ctx, activeIndex, canvas.width, canvas.height, true);
  const prompt = document.getElementById('upload-prompt');
  if (cuts[activeIndex].image) prompt.classList.add('hidden');
  else prompt.classList.remove('hidden');
  // skip minis mid-stroke (eraser re-renders often); they refresh on stroke end
  const midStroke = (typeof pen !== 'undefined' && pen.drawing);
  if (!midStroke) renderMiniGridPreviews();
  syncSelectedStickerControls();
  const rect = canvas.getBoundingClientRect();
  if (rect.width > 0) {
    scaleX = canvas.width / rect.width;
    scaleY = canvas.height / rect.height;
  }
}

function rebuildCutTabs() {
  const n = getVisibleCount();
  updateWorkspaceAspect();
  const tabWrap = document.getElementById('cut-tabs');
  tabWrap.innerHTML = '';
  for (let i = 0; i < n; i++) {
    const b = document.createElement('button');
    b.id = `cut-tab-${i}`;
    b.textContent = `${i + 1}컷`;
    b.className = 'flex-1 py-2 text-center text-xs font-bold rounded-md transition-all brand-font tab-btn ' +
      (i === activeIndex ? 'bg-amber-500 text-white' : 'text-stone-500 hover:text-amber-600');
    b.onclick = () => switchActiveCut(i);
    tabWrap.appendChild(b);
  }
  // highlight mini cards
  for (let i = 0; i < MAX_CUTS; i++) {
    const card = document.getElementById(`mini-card-${i}`);
    const label = document.getElementById(`mini-label-${i}`);
    if (!card) continue;
    const on = (i === activeIndex && i < n);
    card.className = 'p-2.5 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] shadow-sm ' +
      (on ? 'bg-white border-amber-500' : 'bg-white border-amber-200');
    if (label) label.className = 'text-[11px] font-bold brand-font ' + (on ? 'text-amber-600' : 'text-stone-500');
  }
  const lbl = document.getElementById('sticker-title-label');
  if (lbl) lbl.innerText = `현재 [${activeIndex + 1}컷] 대사/말풍선`;
  const pt = document.getElementById('prompt-cut-title');
  if (pt) pt.innerText = `현재 ${activeIndex + 1}컷에 이미지가 등록되지 않았습니다`;
  const ti = document.getElementById('input-manga-title');
  if (ti) ti.placeholder = `${n}컷 만화 만들기`;
}

function switchActiveCut(idx) {
  if (idx >= getVisibleCount()) return;
  if (isEditingMode) finishStickerEditing();
  selectedSticker = null;
  activeIndex = idx;
  rebuildCutTabs();
  applyAllEffects();
}

function handleImageUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  pushHistory();
  const idx = activeIndex; // capture: user may switch cuts while loading
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      cuts[idx].image = img;
      cuts[idx].imageSrc = ev.target.result;
      applyAllEffects();
      scheduleAutosave();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function resetActiveCut() {
  pushHistory();
  cuts[activeIndex].image = null;
  cuts[activeIndex].imageSrc = null;
  cuts[activeIndex].drawings = [];
  cuts[activeIndex].redo = [];
  applyAllEffects(); scheduleAutosave();
}

function clearActiveCutStickers() {
  if (isEditingMode) finishStickerEditing();
  pushHistory();
  cuts[activeIndex].stickers = [];
  selectedSticker = null;
  applyAllEffects(); scheduleAutosave();
}

/* mouse + touch */
function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  const t = e.touches ? e.touches[0] : e;
  return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
}

let dragMoved = false;
let pendingTapSticker = null;
let pendingTapTime = 0;

function handleCanvasMouseDown(e) {
  if (typeof pen !== 'undefined' && pen.mode === 'draw') return;
  const c = getCanvasCoords(e);
  const found = findStickerAt(c.x / canvas.width, c.y / canvas.height);
  if (found) {
    if (isEditingMode && selectedSticker !== found) finishStickerEditing();
    // second tap on already-selected sticker (within 450ms, no drag) = edit (pads have no dblclick)
    if (!isEditingMode && selectedSticker === found && pendingTapSticker === found && (Date.now() - pendingTapTime) < 450) {
      pendingTapSticker = null;
      enterStickerEditMode(found);
      applyAllEffects();
      return;
    }
    selectedSticker = found;
    pendingTapSticker = found;
    pendingTapTime = Date.now();
    isDragging = true;
    dragMoved = false;
    beginHist();
    startDragX = c.x / canvas.width - found.relX;
    startDragY = c.y / canvas.height - found.relY;
    switchTab('sticker');
  } else {
    if (isEditingMode) finishStickerEditing();
    selectedSticker = null;
  }
  applyAllEffects();
}

function handleCanvasMouseMove(e) {
  if (!isDragging || !selectedSticker) return;
  const c = getCanvasCoords(e);
  selectedSticker.relX = c.x / canvas.width - startDragX;
  selectedSticker.relY = c.y / canvas.height - startDragY;
  dragMoved = true;
  applyAllEffects();
}

function handleCanvasMouseUp() {
  if (isDragging) {
    isDragging = false;
    if (dragMoved) commitHist(); else cancelHist();
    dragMoved = false;
    scheduleAutosave();
  }
}
