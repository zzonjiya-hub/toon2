/* KSMS Comic v2 - stickers: text + speech bubbles
   Improvements vs v1: shapes(ellipse/rect/shout/cloud), fill/textColor,
   tailLength, auto word-wrap + auto-expand, ellipse hit-test, z-order. */

function defaultTextFont() {
  return state.filterPreset === 'ito' ? 'East Sea Dokdo' : 'Jua';
}

function addCustomTextSticker() {
  const input = document.getElementById('custom-sticker-text');
  const val = input.value;
  if (val.trim().length === 0) return;
  const st = {
    id: makeStickerId(), type: 'text', text: val,
    relX: 0.5, relY: 0.3, relSize: 100 / canvas.width,
    rotation: (Math.random() - 0.5) * 0.15,
    fontFamily: defaultTextFont()
  };
  pushHistory();
  cuts[activeIndex].stickers.push(st);
  selectedSticker = st;
  input.value = '';
  checkTextArea();
  applyAllEffects();
  scheduleAutosave();
  switchTab('sticker');
}

function addSpeechBubbleSticker() {
  const input = document.getElementById('custom-sticker-text');
  const val = input.value;
  const st = {
    id: makeStickerId(), type: 'speech-bubble', text: val,
    relX: 0.5, relY: 0.65, relSize: 95 / canvas.width,
    rotation: 0, tailAngle: 225, tailType: 'sharp',
    shape: 'ellipse', fill: '#ffffff', textColor: '#000000',
    tailLength: 1.55
  };
  pushHistory();
  cuts[activeIndex].stickers.push(st);
  selectedSticker = st;
  input.value = '';
  checkTextArea();
  applyAllEffects();
  scheduleAutosave();
  switchTab('sticker');
}

/* Wrap Korean text: split on \n, then hard-wrap by measured width */
function wrapBubbleLines(tCtx, text, maxW) {
  const out = [];
  const rawLines = String(text || '').split('\n');
  rawLines.forEach(raw => {
    if (tCtx.measureText(raw).width <= maxW || raw.length === 0) { out.push(raw); return; }
    let cur = '';
    for (const ch of raw) {
      const trial = cur + ch;
      if (tCtx.measureText(trial).width > maxW && cur.length > 0) { out.push(cur); cur = ch; }
      else cur = trial;
    }
    out.push(cur);
  });
  return out.length ? out : [''];
}

function bubbleTextMetrics(tCtx, st, absSize) {
  const fontPx = Math.max(9, Math.round(absSize * 0.18));
  tCtx.font = `bold ${fontPx}px 'Noto Sans KR'`;
  const maxW = Math.max(40, absSize * 1.6);
  const lines = wrapBubbleLines(tCtx, st.text, maxW);
  let widest = 0;
  lines.forEach(l => { widest = Math.max(widest, tCtx.measureText(l).width); });
  const lineH = fontPx * 1.3;
  return { fontPx, lines, lineH, textW: widest, textH: lines.length * lineH, maxW };
}

function bubbleRadii(tCtx, st, absSize) {
  // auto-expand: never smaller than slider size, grows with text
  const m = bubbleTextMetrics(tCtx, st, absSize);
  const rx = Math.max(absSize, m.textW / 2 + 22);
  const ry = Math.max(absSize * 0.7, m.textH / 2 + 20);
  return { rx, ry, m };
}

function drawBubbleShapePath(tCtx, shape, rx, ry) {
  // ellipse only (rect/shout/cloud removed: broken or indistinguishable)
  tCtx.beginPath();
  tCtx.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI);
}

function drawBubbleTail(tCtx, st, rx, ry, w) {
  const ang = (st.tailAngle !== undefined ? st.tailAngle : 225) * Math.PI / 180;
  const len = st.tailLength || 1.55;
  const fill = st.fill || '#ffffff';
  if (st.shape === 'rect' && (st.tailType || 'sharp') === 'sharp') {
    // rect narration: small triangle tail, same style
  }
  if ((st.tailType || 'sharp') === 'sharp') {
    const off = 0.22;
    const ax = rx * Math.cos(ang - off), ay = ry * Math.sin(ang - off);
    const bx = rx * Math.cos(ang + off), by = ry * Math.sin(ang + off);
    const tx = rx * len * Math.cos(ang), ty = ry * len * Math.sin(ang);
    tCtx.beginPath(); tCtx.moveTo(ax, ay); tCtx.lineTo(tx, ty); tCtx.lineTo(bx, by);
    tCtx.closePath(); tCtx.fillStyle = fill; tCtx.fill();
    tCtx.beginPath(); tCtx.moveTo(ax, ay); tCtx.lineTo(tx, ty); tCtx.lineTo(bx, by);
    tCtx.strokeStyle = '#000000'; tCtx.stroke();
  } else if (st.tailType === 'dots') {
    // fixed 3 small dots; length slider controls spacing (never overlaps)
    tCtx.fillStyle = fill; tCtx.strokeStyle = '#000000';
    tCtx.lineWidth = Math.max(1.5, w * 0.004);
    const len = st.tailLength || 1.55;
    const gap = 0.25 + (len - 1.1) * 0.318; // 0.25 (len 1.1) .. 0.60 (len 2.2)
    const radii = [rx * 0.12, rx * 0.095, rx * 0.07];
    for (let d = 0; d < 3; d++) {
      const dist = 1.15 + d * gap;
      tCtx.beginPath();
      tCtx.arc(rx * dist * Math.cos(ang), ry * dist * Math.sin(ang), radii[d], 0, 2 * Math.PI);
      tCtx.fill(); tCtx.stroke();
    }
  }
  // tailType 'none': no tail
}

function drawStickersToCtx(tCtx, list, w, h, isFocus) {
  list.forEach((st) => {
    tCtx.save();
    const absX = st.relX * w, absY = st.relY * h;
    const absSize = st.relSize * w;
    tCtx.translate(absX, absY);
    tCtx.rotate(st.rotation || 0);

    if (st.type === 'text') {
      const fs = Math.max(10, Math.round(absSize * 0.48));
      const ff = st.fontFamily || defaultTextFont();
      tCtx.font = `bold ${fs}px '${ff}'`;
      tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
      tCtx.lineJoin = 'round';
      tCtx.strokeStyle = '#000000';
      tCtx.lineWidth = Math.max(3, fs * 0.13);
      tCtx.strokeText(st.text, 0, 0);
      tCtx.fillStyle = '#ffffff';
      tCtx.fillText(st.text, 0, 0);
    } else if (st.type === 'speech-bubble') {
      const { rx, ry, m } = bubbleRadii(tCtx, st, absSize);
      tCtx.fillStyle = st.fill || '#ffffff';
      tCtx.strokeStyle = '#000000';
      tCtx.lineWidth = Math.max(2, w * 0.006);
      drawBubbleShapePath(tCtx, st.shape || 'ellipse', rx, ry);
      tCtx.fill(); tCtx.stroke();
      drawBubbleTail(tCtx, st, rx, ry, w);
      // text
      tCtx.font = `bold ${m.fontPx}px 'Noto Sans KR'`;
      tCtx.fillStyle = st.textColor || '#000000';
      tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
      const startY = -((m.lines.length - 1) * m.lineH) / 2;
      m.lines.forEach((line, i) => tCtx.fillText(line, 0, startY + i * m.lineH));
      // store measured radii for hit-test reuse (approx, unrotated)
      st._rx = rx / w; st._ry = ry / h;
    }

    if (st === selectedSticker && isFocus) {
      tCtx.save();
      tCtx.strokeStyle = isEditingMode ? 'rgba(34,197,94,0.9)' : 'rgba(245,158,11,0.95)';
      tCtx.lineWidth = 2.5;
      tCtx.setLineDash([6, 4]);
      if (st.type === 'speech-bubble') {
        const rx = (st._rx ? st._rx * w : absSize) + 10;
        const ry = (st._ry ? st._ry * h : absSize * 0.7) + 10;
        tCtx.beginPath(); tCtx.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI); tCtx.stroke();
      } else {
        tCtx.strokeRect(-absSize - 10, -25, absSize * 2 + 20, 50);
      }
      tCtx.restore();
    }
    tCtx.restore();
  });
}

/* Ellipse-aware hit test (un-rotate point first) */
function stickerHitTest(st, relX, relY) {
  const dx = relX - st.relX, dy = relY - st.relY;
  const rot = -(st.rotation || 0);
  const lx = dx * Math.cos(rot) - dy * Math.sin(rot);
  const ly = dx * Math.sin(rot) + dy * Math.cos(rot);
  if (st.type === 'speech-bubble') {
    const rx = (st._rx !== undefined ? st._rx : st.relSize);
    const ry = (st._ry !== undefined ? st._ry : st.relSize * 0.7);
    const pad = 0.03;
    return (lx * lx) / ((rx + pad) * (rx + pad)) + (ly * ly) / ((ry + pad) * (ry + pad)) < 1;
  }
  const lim = st.relSize * 1.3 + 0.02;
  return Math.sqrt(lx * lx + ly * ly) < lim;
}

function findStickerAt(relX, relY) {
  const list = cuts[activeIndex].stickers;
  for (let i = list.length - 1; i >= 0; i--) {
    if (stickerHitTest(list[i], relX, relY)) return list[i];
  }
  return null;
}

function moveStickerZ(dir) {
  const list = cuts[activeIndex].stickers;
  const i = list.indexOf(selectedSticker);
  if (i < 0) return;
  if (dir === 'front' && i < list.length - 1) {
    pushHistory();
    list.splice(i, 1); list.push(selectedSticker);
  } else if (dir === 'back' && i > 0) {
    pushHistory();
    list.splice(i, 1); list.unshift(selectedSticker);
  } else {
    return;
  }
  applyAllEffects(); scheduleAutosave();
}
