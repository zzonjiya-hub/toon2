/* KSMS Comic v2 - project save/load (localStorage + JSON file) */
const LS_KEY = 'ksms-comic-v2-autosave';
let autosaveTimer = null;
let applying = false;
let applyQueued = null;

function serializeProject() {
  return {
    app: 'ksms-comic-v2', version: 1, savedAt: new Date().toISOString(),
    state: { ...state },
    title: document.getElementById('input-manga-title').value,
    author: document.getElementById('input-manga-author').value,
    cuts: cuts.map(c => ({
      imageSrc: c.imageSrc,
      stickers: c.stickers.map(s => ({ ...s, _rx: undefined, _ry: undefined })),
      drawings: c.drawings || []
    }))
  };
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(serializeProject()));
      const el = document.getElementById('autosave-status');
      if (el) el.textContent = '자동저장됨 ' + new Date().toLocaleTimeString();
    } catch (e) { /* quota exceeded: images too large */ }
  }, 800);
}

function loadImageAsync(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function applyProjectData(data, resetHist = false) {
  if (!data || !data.cuts) return;
  if (applying) { applyQueued = { data, resetHist }; return; } // latest-wins queue
  if (resetHist) clearHistory();
  suppressHist = true;
  applying = true;
  try {
  Object.assign(state, data.state || {});
  if (document.getElementById('input-manga-title')) document.getElementById('input-manga-title').value = data.title || '';
  if (document.getElementById('input-manga-author')) document.getElementById('input-manga-author').value = data.author || '';
  if (isEditingMode) finishStickerEditing();
  selectedSticker = null;
  if (data.state && data.state.layoutMode === '4cut' && activeIndex >= 4) activeIndex = 0;
  for (let i = 0; i < MAX_CUTS; i++) {
    const saved = data.cuts[i];
    cuts[i].stickers = (saved && saved.stickers) ? saved.stickers : [];
    cuts[i].drawings = (saved && saved.drawings) ? saved.drawings : [];
    cuts[i].redo = [];
    cuts[i].imageSrc = (saved && saved.imageSrc) || null;
    cuts[i].image = await loadImageAsync(cuts[i].imageSrc);
  }
  syncAllControlsFromState();
  rebuildCutTabs();
  applyAllEffects();
  } finally {
    suppressHist = false;
    applying = false;
    if (applyQueued) {
      const q = applyQueued;
      applyQueued = null;
      await applyProjectData(q.data, q.resetHist);
    }
  }
}

async function restoreAutosave() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    await applyProjectData(JSON.parse(raw));
    return true;
  } catch (e) { return false; }
}

function exportProjectJSON() {
  const blob = new Blob([JSON.stringify(serializeProject())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const t = (document.getElementById('input-manga-title').value.trim() || 'ksms-comic').replace(/[^a-zA-Z0-9가-힣]/g, '_');
  a.download = `${t}_프로젝트.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importProjectJSON(file) {
  const r = new FileReader();
  r.onload = async (ev) => {
    try { await applyProjectData(JSON.parse(ev.target.result), true); updateHistoryButtons(); scheduleAutosave(); }
    catch (e) { alert('프로젝트 파일을 읽지 못했습니다.'); }
  };
  r.readAsText(file);
}

function clearSavedProject() {
  if (!confirm('자동저장된 작업을 모두 지울까요?')) return;
  localStorage.removeItem(LS_KEY);
  location.reload();
}
