/* KSMS Comic v2 - filters (ito + pencil unified).
   Ito: grayscale + Sobel binary B/W + hatch/screentone.
   Pencil: color-preserving + graphite outline + paper grain.
   Both read `state` for params; `preset` selects pipeline. */

function drawCoverImage(targetCtx, img, w, h) {
  const imgRatio = img.width / img.height;
  const targetRatio = w / h;
  let sx, sy, sw, sh;
  if (imgRatio > targetRatio) {
    sh = img.height; sw = sh * targetRatio;
    sx = (img.width - sw) / 2; sy = 0;
  } else {
    sw = img.width; sh = sw / targetRatio;
    sx = 0; sy = (img.height - sh) / 2;
  }
  targetCtx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
}

function computeGrays(src, width, height, contrast) {
  const grays = new Uint8ClampedArray(width * height);
  for (let i = 0; i < src.length; i += 4) {
    const g = 0.299 * src[i] + 0.587 * src[i + 1] + 0.114 * src[i + 2];
    grays[i / 4] = Math.min(255, Math.max(0, ((g - 128) * contrast) + 128));
  }
  return grays;
}

function sobelAt(grays, width, x, y) {
  const g = (dx, dy) => grays[(y + dy) * width + (x + dx)];
  const hX = -g(-1,-1) + g(1,-1) + -2*g(-1,0) + 2*g(1,0) + -g(-1,1) + g(1,1);
  const hY = -g(-1,-1) - 2*g(0,-1) - g(1,-1) + g(-1,1) + 2*g(0,1) + g(1,1);
  return Math.sqrt(hX * hX + hY * hY);
}

/* --- Ito (horror pen) shader: binary output --- */
function applyItoShader(imgData, width, height, refCtx) {
  const src = imgData.data;
  const output = refCtx.createImageData(width, height);
  const out = output.data;
  const grays = computeGrays(src, width, height, state.contrast);
  const weight = state.edgeWeight;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const edge = sobelAt(grays, width, x, y);
      const isEdge = edge > (200 / weight);
      const base = grays[idx];
      let v = 255;
      if (isEdge) {
        v = 0;
      } else if (state.styleMode === 'classic') {
        if (base < state.threshold * 0.4) v = 0;
        else if (base < state.threshold * 0.7) { if ((x + y) % 6 === 0 || (x - y) % 6 === 0) v = 0; }
        else if (base < state.threshold) { if ((x + y) % 6 === 0) v = 0; }
        else if (base < state.threshold * 1.3) { if ((x + y) % 10 === 0) v = 0; }
      } else {
        if (base < state.threshold * 0.5) v = 0;
        else if (base < state.threshold * 0.8) { if ((x % 4 === 0 && y % 4 === 0) || (x % 4 === 2 && y % 4 === 2)) v = 0; }
        else if (base < state.threshold * 1.2) { if (x % 5 === 0 && y % 5 === 0) v = 0; }
      }
      const p = idx * 4;
      out[p] = v; out[p + 1] = v; out[p + 2] = v; out[p + 3] = 255;
    }
  }
  // 1px frame cleanup
  for (let i = 0; i < width; i++) {
    const t = i * 4, b = ((height - 1) * width + i) * 4;
    out[t] = out[t+1] = out[t+2] = 0; out[t+3] = 255;
    out[b] = out[b+1] = out[b+2] = 0; out[b+3] = 255;
  }
  for (let i = 0; i < height; i++) {
    const l = (i * width) * 4, r = (i * width + width - 1) * 4;
    out[l] = out[l+1] = out[l+2] = 0; out[l+3] = 255;
    out[r] = out[r+1] = out[r+2] = 0; out[r+3] = 255;
  }
  return output;
}

/* --- Pencil shader: color or warm-mono --- */
function applyPencilShader(imgData, width, height, refCtx) {
  const src = imgData.data;
  const output = refCtx.createImageData(width, height);
  const out = output.data;
  const grays = computeGrays(src, width, height, state.contrast);
  const weight = state.edgeWeight;
  const isMono = state.filterPreset === 'pencil-mono';

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const p = idx * 4;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        out[p] = 35; out[p+1] = 35; out[p+2] = 40; out[p+3] = 255;
        continue;
      }
      const edge = sobelAt(grays, width, x, y);
      const outline = Math.min(0.85, edge / (140 / weight));
      let r = src[p], g = src[p+1], b = src[p+2];
      if (isMono) {
        const gv = grays[idx];
        r = Math.min(255, gv * 1.02); g = Math.min(255, gv * 0.98); b = Math.min(255, gv * 0.93);
      } else {
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if ((mx - mn) / 255 > 0.05) {
          const mid = (r + g + b) / 3, f = 1.35;
          r = Math.min(255, Math.max(0, mid + (r - mid) * f));
          g = Math.min(255, Math.max(0, mid + (g - mid) * f));
          b = Math.min(255, Math.max(0, mid + (b - mid) * f));
        }
      }
      const base = grays[idx];
      let tex = 1.0;
      if (state.styleMode === 'classic') {
        const stroke = Math.sin((x + y * 1.2) * 1.5) * 0.08 + Math.cos((x - y * 0.8) * 1.8) * 0.06;
        const grain = (Math.sin(x * 17.3 + y * 11.2) % 1) * 0.07;
        let hatch = 0;
        if (base < state.threshold * 0.5) { if ((x + y) % 4 === 0) hatch -= 0.18; if ((x - y) % 4 === 0) hatch -= 0.12; }
        else if (base < state.threshold * 0.9) { if ((x + y) % 4 === 0) hatch -= 0.14; }
        else if (base < state.threshold * 1.3) { if ((x + y) % 7 === 0) hatch -= 0.08; }
        tex = 1.0 + stroke + grain + hatch;
      } else {
        let dots = 0;
        const grain = (Math.cos(x * 9.5 + y * 14.1) % 1) * 0.04;
        if (base < state.threshold * 0.6) { if ((x % 3 === 0 && y % 3 === 0) || (x % 3 === 1 && y % 3 === 1)) dots -= 0.20; }
        else if (base < state.threshold * 1.1) { if (x % 4 === 0 && y % 4 === 0) dots -= 0.12; }
        else if (x % 6 === 0 && y % 6 === 0) dots -= 0.06;
        tex = 1.0 + dots + grain;
      }
      r = Math.min(255, Math.max(0, r * tex));
      g = Math.min(255, Math.max(0, g * tex));
      b = Math.min(255, Math.max(0, b * tex));
      r = r * (1 - outline) + 45 * outline;
      g = g * (1 - outline) + 45 * outline;
      b = b * (1 - outline) + 50 * outline;
      out[p] = r; out[p+1] = g; out[p+2] = b; out[p+3] = 255;
    }
  }
  return output;
}

function applyActiveFilter(imgData, w, h, refCtx) {
  if (state.filterPreset === 'ito') return applyItoShader(imgData, w, h, refCtx);
  return applyPencilShader(imgData, w, h, refCtx);
}

function vignetteStrength() {
  return state.filterPreset === 'ito'
    ? { mid: 0.5, end: 0.95 }
    : { mid: 0.25, end: 0.65 };
}

function applyVignetteToCtx(tCtx, w, h) {
  const s = vignetteStrength();
  const grad = tCtx.createRadialGradient(w/2, h/2, w/3, w/2, h/2, Math.max(w, h) * 0.7);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.7, `rgba(0,0,0,${s.mid})`);
  grad.addColorStop(1, `rgba(0,0,0,${s.end})`);
  tCtx.fillStyle = grad;
  tCtx.fillRect(0, 0, w, h);
}

/* Deterministic rough border (no flicker): wobble from sin(), seeded by cut index */
function drawCutBorder(tCtx, x, y, w, h, bw, bStyle, seed) {
  if (bw <= 0) return;
  tCtx.save();
  tCtx.strokeStyle = '#000000';
  if (bStyle === 'solid') {
    tCtx.lineWidth = bw; tCtx.strokeRect(x, y, w, h);
  } else if (bStyle === 'dashed') {
    tCtx.lineWidth = bw; tCtx.setLineDash([bw * 3, bw * 2]); tCtx.strokeRect(x, y, w, h);
  } else if (bStyle === 'double') {
    const ow = bw * 0.4, iw = bw * 0.2, gap = bw * 0.3;
    tCtx.lineWidth = ow; tCtx.strokeRect(x, y, w, h);
    tCtx.lineWidth = iw;
    tCtx.strokeRect(x + ow/2 + gap, y + ow/2 + gap, w - ow - gap*2, h - ow - gap*2);
  } else if (bStyle === 'rough') {
    tCtx.lineWidth = Math.max(1.2, bw * 0.45);
    const sd = (seed || 0) * 13.7;
    for (let p = 0; p < 3; p++) {
      const j = (t, k) => Math.sin(t * 12.9898 + k * 78.233 + sd + p * 40.7) * bw * 0.12;
      tCtx.beginPath();
      tCtx.moveTo(x - 4 + j(1,p), y + j(2,p)); tCtx.lineTo(x + w + 4 + j(3,p), y + j(4,p));
      tCtx.moveTo(x + w + j(5,p), y - 4 + j(6,p)); tCtx.lineTo(x + w + j(7,p), y + h + 4 + j(8,p));
      tCtx.moveTo(x - 4 + j(9,p), y + h + j(10,p)); tCtx.lineTo(x + w + 4 + j(11,p), y + h + j(12,p));
      tCtx.moveTo(x + j(13,p), y - 4 + j(14,p)); tCtx.lineTo(x + j(15,p), y + h + 4 + j(16,p));
      tCtx.stroke();
    }
  }
  tCtx.restore();
}
