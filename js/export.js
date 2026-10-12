/* KSMS Comic v2 - A4 export (1414x2000), 2 cols x N rows */
function renderA4Page(actionType = 'download') {
  const prevSel = selectedSticker, prevEdit = isEditingMode;
  if (isEditingMode) finishStickerEditing();
  selectedSticker = null;
  applyAllEffects();

  const grid = getLayoutGrid();
  const W = 1414, H = 2000;
  const ex = document.createElement('canvas');
  ex.width = W; ex.height = H;
  const eCtx = ex.getContext('2d');

  eCtx.fillStyle = '#ffffff'; eCtx.fillRect(0, 0, W, H);
  eCtx.strokeStyle = '#000000'; eCtx.lineWidth = 4;
  eCtx.strokeRect(20, 20, W - 40, H - 40);

  const titleFont = state.filterPreset === 'ito' ? 'Noto Sans KR' : 'Jua';
  const titleText = (document.getElementById('input-manga-title').value.trim() || `${grid.count}컷 만화 만들기`);
  eCtx.fillStyle = '#000'; eCtx.textAlign = 'center'; eCtx.textBaseline = 'top';
  eCtx.font = `bold 78px '${titleFont}'`;
  eCtx.fillText(titleText, W / 2, 95);

  const author = '글/그림: ' + (document.getElementById('input-manga-author').value.trim() || '조기석');
  eCtx.textAlign = 'right'; eCtx.font = `bold 24px '${titleFont}'`;
  eCtx.fillText(author, W - 100, 248);

  // Grid: 2 cols, GAP equal on all sides (see state.js A4/getCutDims).
  // 6cut -> 582x461, 4cut -> 582x717 (taller than 4:3, cover-cropped).
  const { w: cutW, h: cutH } = getCutDims();
  const { marginX, GAP } = A4;
  const startY = A4.GRID_TOP;

  for (let i = 0; i < grid.count; i++) {
    const row = Math.floor(i / 2), col = i % 2;
    const x = marginX + col * (cutW + GAP);
    const y = startY + row * (cutH + GAP);
    eCtx.save();
    eCtx.translate(x, y);
    eCtx.beginPath(); eCtx.rect(0, 0, cutW, cutH); eCtx.clip();
    const cut = cuts[i];
    if (cut.image) {
      const tmp = document.createElement('canvas');
      tmp.width = cutW; tmp.height = cutH;
      const tCtx = tmp.getContext('2d');
      drawCoverImage(tCtx, cut.image, cutW, cutH);
      const imgData = tCtx.getImageData(0, 0, cutW, cutH);
      tCtx.putImageData(applyActiveFilter(imgData, cutW, cutH, eCtx), 0, 0);
      if (state.vignette) applyVignetteToCtx(tCtx, cutW, cutH);
      eCtx.drawImage(tmp, 0, 0);
    } else {
      eCtx.fillStyle = '#ffffff'; eCtx.fillRect(0, 0, cutW, cutH);
    }
    drawStickersToCtx(eCtx, cut.stickers, cutW, cutH, false);
    eCtx.restore();
    drawCutBorder(eCtx, x, y, cutW, cutH, state.borderWidth * (cutW / 640), state.borderStyle, i);
  }

  eCtx.fillStyle = '#000'; eCtx.textAlign = 'right'; eCtx.textBaseline = 'top';
  eCtx.font = `bold 22px '${titleFont}'`;
  eCtx.fillText('KSMS COMICS', W - 100, 1883);

  selectedSticker = prevSel;
  suppressHist = true;
  if (prevSel && prevEdit) enterStickerEditMode(prevSel); else applyAllEffects();
  suppressHist = false;

  if (actionType === 'download') {
    try {
      const a = document.createElement('a');
      a.download = `${titleText.replace(/[^a-zA-Z0-9가-힣]/g, '_')}_${grid.count}컷만화.png`;
      a.href = ex.toDataURL('image/png');
      a.click();
    } catch (err) { console.error(err); }
  } else {
    try {
      const url = ex.toDataURL('image/png');
      const nw = window.open();
      if (nw) {
        nw.document.write(`<html><head><title>${titleText} - KSMS COMICS</title><style>body{margin:0;background:#111827;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:96vh;box-shadow:0 10px 30px rgba(0,0,0,.8);border:1px solid #222}</style></head><body><img src="${url}" alt="KSMS 만화"/></body></html>`);
        nw.document.close();
      } else alert('새 창 팝업이 차단되었습니다.');
    } catch (err) { console.error(err); }
  }
}
