/* KSMS Comic v2 - project save/load (localStorage + JSON file) */
const LS_KEY = 'ksms-comic-v2-autosave';
const NUDGE_KEY = 'ksms-comic-v2-backup-nudge';
const NUDGE_SIZE = Math.round(3.5 * 1024 * 1024); // ~3.5MB: warn once, suggest export backup
let autosaveTimer = null;
let storageFull = false;
let storageWarned = '';
let applying = false;
let applyQueued = null;

function serializeProject(photoMode = 'full') {
  return {
    app: 'ksms-comic-v2', version: 1, savedAt: new Date().toISOString(),
    state: { ...state },
    title: document.getElementById('input-manga-title').value,
    author: document.getElementById('input-manga-author').value,
    cuts: cuts.map(c => ({
      imageSrc: photoMode === 'dropped' ? null
        : photoMode === 'shrunk' ? shrinkPhoto(c, 960, 0.72)
        : c.imageSrc,
      stickers: c.stickers.map(s => ({ ...s, _rx: undefined, _ry: undefined })),
      drawings: c.drawings || []
    }))
  };
}

/* downscale a cut photo for storage (memory images already loaded) */
function shrinkPhoto(cut, maxDim, quality) {
  if (!cut.imageSrc) return null;
  const img = cut.image;
  if (!img || !img.naturalWidth) return cut.imageSrc;
  if (Math.max(img.naturalWidth, img.naturalHeight) <= maxDim) return cut.imageSrc;
  try {
    const s = maxDim / Math.max(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    const x = c.getContext('2d');
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, c.width, c.height); // JPEG has no alpha
    x.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  } catch (e) {
    return cut.imageSrc;
  }
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    // tiered save: full -> smaller photos -> photos dropped (work always kept)
    const tiers = [
      { mode: 'full', warn: '' },
      { mode: 'shrunk', warn: '저장 공간이 부족해 사진 해상도를 낮춰 저장했습니다. 말풍선·그림·설정은 그대로입니다. 내보내기로 백업하세요.' },
      { mode: 'dropped', warn: '저장 공간이 부족해 사진을 제외하고 저장했습니다. 말풍선·그림·설정은 그대로입니다. 새로고침 전 반드시 내보내기로 백업하세요.' }
    ];
    for (const t of tiers) {
      try {
        const payload = JSON.stringify(serializeProject(t.mode));
        localStorage.setItem(LS_KEY, payload);
        storageFull = t.mode !== 'full';
        if (t.warn && storageWarned !== t.mode) {
          storageWarned = t.mode;
          alert(t.warn);
        } else if (!t.warn) {
          storageWarned = '';
        }
        const el = document.getElementById('autosave-status');
        if (el) el.textContent = '자동저장됨 ' + new Date().toLocaleTimeString();
        // one-time nudge: data getting big -> suggest export backup
        try {
          if (payload.length > NUDGE_SIZE && !localStorage.getItem(NUDGE_KEY)) {
            localStorage.setItem(NUDGE_KEY, '1');
            alert('작업 데이터가 커졌습니다. 만약을 위해 상단바 내보내기로 백업 파일을 받아 두세요.');
          }
        } catch (e) {}
        return;
      } catch (e) { /* try next smaller tier */ }
    }
    // even work-only data did not fit (extremely rare)
    if (storageWarned !== 'failed') {
      storageWarned = 'failed';
      alert('브라우저 저장 공간이 부족해 자동저장이 안 됩니다. 지금 바로 상단바 내보내기로 백업하세요.');
    }
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
