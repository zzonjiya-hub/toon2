/* KSMS Comic v2 - global state */
const MAX_CUTS = 6;

const cuts = Array.from({ length: MAX_CUTS }, (_, i) => ({
  index: i,
  image: null,      // HTMLImageElement (runtime only)
  imageSrc: null,   // dataURL (persisted)
  stickers: [],
  drawings: [],     // layer-2 ink strokes (persisted)
  redo: []          // layer-2 redo stack (runtime only)
}));

let activeIndex = 0;
let selectedSticker = null;
let isEditingMode = false;
let isDragging = false;
let startDragX = 0;
let startDragY = 0;
let scaleX = 1;
let scaleY = 1;

/* Unified filter preset: 'ito' | 'pencil-color' | 'pencil-mono' */
const state = {
  filterPreset: 'pencil-color',
  edgeWeight: 2.0,
  contrast: 1.2,
  threshold: 120,
  vignette: true,
  styleMode: 'classic',   // 'classic' | 'screentone'
  borderWidth: 4,
  borderStyle: 'solid',    // 'solid' | 'dashed' | 'double' | 'rough'
  layoutMode: '6cut'       // '4cut' (2x2) | '6cut' (2x3)
};

function getVisibleCount() {
  return state.layoutMode === '4cut' ? 4 : 6;
}

function getLayoutGrid() {
  return state.layoutMode === '4cut'
    ? { cols: 2, rows: 2, count: 4 }
    : { cols: 2, rows: 3, count: 6 };
}

/* A4 export geometry (single source of truth).
   6cut -> 582x461, 4cut -> 582x717. Workspace canvases use the same ratio. */
const A4 = { W: 1414, H: 2000, marginX: 100, GAP: 50, GRID_TOP: 347, GRID_BOTTOM: 1830 };

function getCutDims() {
  const g = getLayoutGrid();
  const cutW = (A4.W - 2 * A4.marginX - A4.GAP) / 2;
  const cutH = Math.round((A4.GRID_BOTTOM - A4.GRID_TOP - (g.rows - 1) * A4.GAP) / g.rows);
  return { w: cutW, h: cutH };
}

function makeStickerId() {
  return 'st_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e6).toString(36);
}
