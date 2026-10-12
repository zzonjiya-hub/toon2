/* KSMS Comic v2 - global work undo/redo.
   Covers: images, stickers (add/move/edit/delete/order), drawings.
   Filter sliders are continuous inputs and are NOT historied.
   Snapshots share imageSrc strings by reference (cheap); cap 30. */

const workHist = { undo: [], redo: [], cap: 30 };
let pendingHist = null;
let suppressHist = false; // true during programmatic sync/restore: record nothing

function snapshotState() {
  const scrub = (s) => {
    const c = { ...s };
    delete c._rx; delete c._ry;
    return c;
  };
  return {
    state: { ...state },
    title: document.getElementById('input-manga-title').value,
    author: document.getElementById('input-manga-author').value,
    cuts: cuts.map(c => ({
      imageSrc: c.imageSrc,
      stickers: JSON.parse(JSON.stringify((c.stickers || []).map(scrub))),
      drawings: JSON.parse(JSON.stringify(c.drawings || []))
    }))
  };
}

/* Discrete action: snapshot BEFORE mutation */
function pushHistory() {
  if (suppressHist) return;
  workHist.undo.push(snapshotState());
  while (workHist.undo.length > workHist.cap) workHist.undo.shift();
  workHist.redo = [];
  updateHistoryButtons();
}

/* Continuous action (drag / ink stroke): begin at start, commit at end */
function beginHist() { if (!suppressHist) pendingHist = snapshotState(); }
function commitHist() {
  if (!pendingHist) return;
  workHist.undo.push(pendingHist);
  while (workHist.undo.length > workHist.cap) workHist.undo.shift();
  workHist.redo = [];
  pendingHist = null;
  updateHistoryButtons();
}
function cancelHist() { pendingHist = null; }

function clearHistory() {
  workHist.undo = [];
  workHist.redo = [];
  pendingHist = null;
  updateHistoryButtons();
}

async function undoWork() {
  if (!workHist.undo.length) return;
  workHist.redo.push(snapshotState());
  const s = workHist.undo.pop();
  await applyProjectData(s);
  scheduleAutosave();
  updateHistoryButtons();
}

async function redoWork() {
  if (!workHist.redo.length) return;
  workHist.undo.push(snapshotState());
  const s = workHist.redo.pop();
  await applyProjectData(s);
  scheduleAutosave();
  updateHistoryButtons();
}

function updateHistoryButtons() {
  const u = document.getElementById('hist-undo');
  const r = document.getElementById('hist-redo');
  if (u) u.classList.toggle('opacity-40', workHist.undo.length === 0);
  if (r) r.classList.toggle('opacity-40', workHist.redo.length === 0);
}
