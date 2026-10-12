/* KSMS Comic v2 - UI wiring + init */
function switchTab(name) {
  ['filter', 'sticker'].forEach(n => {
    const panel = document.getElementById(`tab-${n}`);
    panel.classList.add('hidden');
    panel.classList.remove('flex');
    document.getElementById(`tab-btn-${n}`).className = 'flex-1 py-3 text-center border-b-2 border-transparent hover:text-stone-800 tab-btn text-xs font-bold text-stone-500 brand-font';
  });
  const show = document.getElementById(`tab-${name}`);
  show.classList.remove('hidden');
  show.classList.add('flex');
  document.getElementById(`tab-btn-${name}`).className = 'flex-1 py-3 text-center border-b-2 border-amber-500 text-amber-600 bg-amber-50/40 tab-btn text-xs font-bold brand-font';
}

function toggleModal(id) { document.getElementById(id).classList.toggle('hidden'); }

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  } else {
    if (document.exitFullscreen) document.exitFullscreen();
  }
}

function updateFilterParams() {
  state.edgeWeight = parseFloat(document.getElementById('input-edge-weight').value);
  state.contrast = parseFloat(document.getElementById('input-contrast').value);
  state.threshold = parseInt(document.getElementById('input-threshold').value);
  state.vignette = document.getElementById('input-vignette').checked;
  document.getElementById('val-edge-weight').innerText = state.edgeWeight.toFixed(1);
  document.getElementById('val-contrast').innerText = state.contrast.toFixed(1);
  document.getElementById('val-threshold').innerText = state.threshold;
  requestRender(); scheduleAutosave();
}

function changePreset(p) {
  if (state.filterPreset !== p) pushHistory();
  state.filterPreset = p;
  const on = 'px-2.5 py-1 rounded-lg text-[11px] font-bold tool-btn whitespace-nowrap bg-amber-500 text-white';
  const off = 'px-2.5 py-1 rounded-lg text-[11px] font-bold tool-btn whitespace-nowrap bg-white border border-stone-200 text-stone-600';
  const map = { 'ito': 'preset-ito', 'pencil-color': 'preset-color', 'pencil-mono': 'preset-mono' };
  Object.entries(map).forEach(([key, id]) => {
    document.getElementById(id).className = key === p ? on : off;
  });
  applyAllEffects(); scheduleAutosave();
}

function changeLayout(m) {
  if (state.layoutMode !== m) pushHistory();
  state.layoutMode = m;
  const on = 'px-2.5 py-1 rounded-lg text-[11px] font-bold tool-btn whitespace-nowrap shrink-0 bg-green-600 text-white';
  const off = 'px-2.5 py-1 rounded-lg text-[11px] font-bold tool-btn whitespace-nowrap shrink-0 bg-white border border-stone-200 text-stone-600';
  ['4cut', '6cut'].forEach(k => {
    document.getElementById('layout-' + k).className = k === m ? on : off;
  });
  if (activeIndex >= getVisibleCount()) activeIndex = 0;
  selectedSticker = null;
  if (isEditingMode) finishStickerEditing();
  rebuildCutTabs(); applyAllEffects(); scheduleAutosave();
}

function changeStyle(mode) {
  state.styleMode = mode;
  ['classic', 'screentone'].forEach(n => {
    const el = document.getElementById(`style-${n}`);
    el.className = n === mode
      ? 'py-2 px-3 bg-amber-100 border border-amber-400 rounded-xl text-left text-xs font-semibold text-amber-900 transition-all tool-btn'
      : 'py-2 px-3 bg-stone-100 border border-stone-200 hover:border-stone-300 rounded-xl text-left text-xs font-semibold text-stone-600 transition-all tool-btn';
  });
  applyAllEffects(); scheduleAutosave();
}

function updateBorderParams() {
  state.borderWidth = parseInt(document.getElementById('input-border-width').value);
  document.getElementById('val-border-width').innerText = state.borderWidth + 'px';
  requestRender(); scheduleAutosave();
}

function changeBorderStyle(s) {
  state.borderStyle = s;
  ['solid', 'dashed', 'double', 'rough'].forEach(n => {
    const el = document.getElementById(`bstyle-${n}`);
    el.className = n === s
      ? 'py-2 px-2 bg-amber-100 border border-amber-400 rounded-lg text-center text-xs text-amber-900 font-semibold transition-all tool-btn'
      : 'py-2 px-2 bg-stone-50 border border-stone-200 hover:border-stone-300 rounded-lg text-center text-xs text-stone-600 transition-all tool-btn';
  });
  applyAllEffects(); scheduleAutosave();
}

/* sticker panel */
function checkTextArea() {
  const ta = document.getElementById('custom-sticker-text');
  const btnT = document.getElementById('btn-add-text');
  const btnB = document.getElementById('btn-add-bubble');
  const val = ta.value;
  if (isEditingMode) {
    if (selectedSticker) {
      if (selectedSticker.type === 'speech-bubble' || val.trim().length > 0) {
        selectedSticker.text = val;
        applyAllEffects();
      }
    }
    return;
  }
  btnT.disabled = !(val.trim().length > 0);
  btnB.disabled = !(val.length > 0);
}
function handleStickerTextInput() { checkTextArea(); scheduleAutosave(); }

function enterStickerEditMode(st) {
  pushHistory();
  isEditingMode = true; selectedSticker = st;
  document.getElementById('custom-sticker-text').value = st.text;
  document.getElementById('bubble-creator-container').classList.add('border-green-500');
  document.getElementById('action-buttons-container').classList.add('hidden');
  document.getElementById('btn-edit-done').classList.remove('hidden');
  document.getElementById('btn-edit-text').classList.remove('hidden');
  switchTab('sticker');
  applyAllEffects();
}
function finishStickerEditing() {
  isEditingMode = false;
  document.getElementById('custom-sticker-text').value = '';
  document.getElementById('bubble-creator-container').classList.remove('border-green-500');
  document.getElementById('action-buttons-container').classList.remove('hidden');
  document.getElementById('btn-edit-done').classList.add('hidden');
  document.getElementById('btn-edit-text').classList.add('hidden');
  checkTextArea(); applyAllEffects(); scheduleAutosave();
}
function editSelectedFromPanel() {
  if (selectedSticker) enterStickerEditMode(selectedSticker);
}
function deleteActiveSticker() {
  if (!selectedSticker) return;
  if (isEditingMode) finishStickerEditing();
  const list = cuts[activeIndex].stickers;
  const i = list.indexOf(selectedSticker);
  if (i > -1) { pushHistory(); list.splice(i, 1); }
  selectedSticker = null;
  applyAllEffects(); scheduleAutosave();
}

function updateSelectedStickerProperty(prop, value) {
  if (!selectedSticker) return;
  const st = selectedSticker;
  if (prop === 'size') { st.relSize = parseInt(value) / canvas.width; }
  else if (prop === 'rotation') { st.rotation = parseInt(value) * Math.PI / 180; }
  else if (prop === 'tailAngle') { st.tailAngle = parseInt(value); }
  else if (prop === 'tailLength') { st.tailLength = parseFloat(value); }
  else if (prop === 'tailType') { st.tailType = value; }
  else if (prop === 'shape') { st.shape = value; }
  else if (prop === 'fill') { st.fill = value; if (value === '#000000') st.textColor = '#ffffff'; }
  else if (prop === 'textColor') { st.textColor = value; }
  else if (prop === 'fontFamily') { st.fontFamily = value; }
  requestRender(); scheduleAutosave();
}

function syncSelectedStickerControls() {
  const panel = document.getElementById('selected-sticker-controls');
  if (!selectedSticker) { panel.classList.add('hidden'); return; }
  panel.classList.remove('hidden');
  const st = selectedSticker;
  const isBubble = st.type === 'speech-bubble';
  document.getElementById('bubble-tail-control-group').classList.toggle('hidden', !isBubble);
  document.getElementById('bubble-style-control-group').classList.toggle('hidden', !isBubble);
  const shapeGroup = document.getElementById('bubble-shape-control-group');
  if (shapeGroup) shapeGroup.classList.add('hidden');
  document.getElementById('bubble-color-control-group').classList.toggle('hidden', !isBubble);
  document.getElementById('text-font-control-group').classList.toggle('hidden', isBubble);

  const sz = Math.round(st.relSize * canvas.width);
  document.getElementById('input-selected-size').value = sz;
  document.getElementById('val-selected-size').innerText = sz + 'px';
  const rot = Math.round((st.rotation || 0) * 180 / Math.PI);
  document.getElementById('input-selected-rot').value = rot;
  document.getElementById('val-selected-rot').innerText = rot + '°';
  if (isBubble) {
    const ta = st.tailAngle !== undefined ? st.tailAngle : 225;
    document.getElementById('input-selected-tail').value = ta;
    document.getElementById('val-selected-tail').innerText = ta + '°';
    const tlSlider = document.getElementById('input-tail-length');
    const tlVal = document.getElementById('val-tail-length');
    const tlLabel = document.getElementById('label-tail-length');
    const tl = st.tailLength || 1.55;
    tlSlider.min = 1.1; tlSlider.max = 2.2; tlSlider.step = 0.05; tlSlider.value = tl;
    tlVal.innerText = tl.toFixed(2) + 'x';
    if (tlLabel) tlLabel.innerText = (st.tailType === 'dots') ? '점 간격' : '꼬리 길이';
    // tail buttons
    ['sharp', 'dots', 'none'].forEach(t => {
      const el = document.getElementById('tail-' + t);
      if (el) el.className = 'py-1 px-1 text-[10px] rounded-lg text-center transition-all tool-btn ' +
        ((st.tailType || 'sharp') === t ? 'bg-amber-100 border border-amber-400 text-amber-900 font-bold' : 'bg-white border border-stone-200 text-stone-600');
    });
  }
}

function syncAllControlsFromState() {
  document.getElementById('input-edge-weight').value = state.edgeWeight;
  document.getElementById('input-contrast').value = state.contrast;
  document.getElementById('input-threshold').value = state.threshold;
  document.getElementById('input-vignette').checked = state.vignette;
  document.getElementById('input-border-width').value = state.borderWidth;
  changePreset(state.filterPreset);
  changeLayout(state.layoutMode);
  changeStyle(state.styleMode);
  changeBorderStyle(state.borderStyle);
  updateFilterParams();
  updateBorderParams();
}

/* double-click (desktop) edit */
function handleCanvasDblClick(e) {
  if (typeof pen !== 'undefined' && pen.mode === 'draw') return;
  const c = getCanvasCoords(e);
  const found = findStickerAt(c.x / canvas.width, c.y / canvas.height);
  if (found) enterStickerEditMode(found);
}

function onTitleAuthorInput() { applyAllEffects(); scheduleAutosave(); }

window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('main-canvas');
  ctx = canvas.getContext('2d');
  canvas.width = 640; canvas.height = 480;
  fileLoader = document.getElementById('image-loader');
  fileLoader.addEventListener('change', handleImageUpload);
  canvas.addEventListener('mousedown', handleCanvasMouseDown);
  canvas.addEventListener('mousemove', handleCanvasMouseMove);
  window.addEventListener('mouseup', handleCanvasMouseUp);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); handleCanvasMouseDown(e); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); handleCanvasMouseMove(e); }, { passive: false });
  window.addEventListener('touchend', handleCanvasMouseUp);
  canvas.addEventListener('dblclick', handleCanvasDblClick);
  initDrawTools();
  document.getElementById('project-file').addEventListener('change', (e) => {
    if (e.target.files[0]) importProjectJSON(e.target.files[0]);
    e.target.value = '';
  });
  const go = () => { rebuildCutTabs(); syncAllControlsFromState(); checkTextArea(); updateHistoryButtons(); };
  if (document.fonts && document.fonts.ready) {
    restoreAutosave().then((ok) => { go(); if (!ok) applyAllEffects(); });
    document.fonts.ready.then(() => applyAllEffects());
  } else {
    restoreAutosave().then(() => go());
    setTimeout(applyAllEffects, 800);
  }
});
