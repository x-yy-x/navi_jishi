(() => {
  'use strict';

  // ===== State =====
  const S = {
    floor: 4,
    tool: 'rect',
    data: {
      4: { rooms: [], landmarks: [] },
      5: { rooms: [], landmarks: [] },
    },
    selId: null,     // 'room-401' or 'lm-elev-0'
    selType: null,   // 'room' | 'lm'
    nextRoomId: 1,   // counter for room-1, room-2... until user sets real ID

    img: { 4: null, 5: null },

    // Drawing
    drawing: false,
    dStartX: 0, dStartY: 0,
    dCurX: 0, dCurY: 0,

    // Polygon
    polyPts: [],

    // Move
    moving: false,
    mOffX: 0, mOffY: 0,
    mOrigShape: null,

    // Resize
    resizing: false,
    rHandle: null,
    rOrig: null,
  };

  const IMG_PATHS = {
    4: '4_plat.png',
    5: '5_plat.png',
  };

  const TYPE_COLORS = {
    '教师办公':'#5c6bc0','教学管理':'#5c6bc0','行政办公':'#5c6bc0',
    '综合管理':'#5c6bc0','党务办公':'#5c6bc0','学生工作':'#5c6bc0',
    '学习科研':'#26a69a','科研实验':'#26a69a','实验教学':'#26a69a',
    '机房':'#26a69a','教学空间':'#ab47bc','公共空间':'#ab47bc',
    '党团活动':'#ab47bc','设备空间':'#9e9e9e','暂不可进入':'#757575',
  };
  const LM_COLORS = { elevator:'#ff8f00', stair:'#e53935', restroom:'#78909c', custom:'#8d6e63' };
  const LM_ICONS  = { elevator:'🛗', stair:'⬆', restroom:'🚻', custom:'📌' };
  const LM_NAMES  = { elevator:'电梯', stair:'楼梯', restroom:'卫生间', custom:'自定义' };

  const canvas = document.getElementById('annoCanvas');
  const ctx = canvas.getContext('2d');

  // ===== Image Loading =====
  function loadImages() {
    [4, 5].forEach(f => {
      const img = new Image();
      img.onload = () => {
        S.img[f] = img;
        S.data[f].imageWidth = img.width;
        S.data[f].imageHeight = img.height;
        if (f === S.floor) render();
      };
      img.src = IMG_PATHS[f];
    });
  }

  // ===== Render =====
  function render() {
    const img = S.img[S.floor];
    if (!img) return;

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // Rooms
    const rooms = S.data[S.floor].rooms;
    rooms.forEach((r, i) => {
      const color = TYPE_COLORS[r.type] || '#999';
      drawRoom(r, color, i);
    });

    // Landmarks
    S.data[S.floor].landmarks.forEach((lm, i) => {
      drawLandmark(lm, i);
    });

    // Selection
    if (S.selId) {
      const sel = findSel();
      if (sel) drawSelection(sel);
    }

    // Rubber band (rect drawing)
    if (S.drawing && S.polyPts.length === 0) {
      const x = Math.min(S.dStartX, S.dCurX);
      const y = Math.min(S.dStartY, S.dCurY);
      const w = Math.abs(S.dCurX - S.dStartX);
      const h = Math.abs(S.dCurY - S.dStartY);
      ctx.strokeStyle = '#ffd600';
      ctx.lineWidth = 2;
      ctx.setLineDash([4,4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,214,0,0.08)';
      ctx.fillRect(x, y, w, h);
    }

    // Polygon preview
    if (S.polyPts.length > 0) {
      ctx.strokeStyle = '#ffd600';
      ctx.lineWidth = 2;
      ctx.setLineDash([4,4]);
      ctx.beginPath();
      S.polyPts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      if (S.drawing) ctx.lineTo(S.dCurX, S.dCurY);
      ctx.stroke();
      ctx.setLineDash([]);
      S.polyPts.forEach(p => {
        ctx.fillStyle = '#ffd600';
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
      });
    }

    updateStatus();
  }

  function drawRoom(r, color, idx) {
    const s = r.shape;
    if (s.type === 'rect') {
      ctx.fillStyle = color + '88';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(s.x, s.y, s.w, s.h);
      // Label
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      ctx.fillText(r.id || `?${idx}`, s.x + 5, s.y + 5);
      ctx.shadowBlur = 0;
      if (r.name && s.h > 35) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(r.name.length > 8 ? r.name.slice(0,7)+'…' : r.name, s.x + 5, s.y + 22);
      }
      // Room number in top-right corner
      if (r.type === '设备空间' || r.type === '暂不可进入') {
        ctx.fillStyle = '#ef5350';
        ctx.font = 'bold 16px sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText('✕', s.x + s.w - 16, s.y + 4);
      }
    } else if (s.type === 'polygon') {
      ctx.beginPath();
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle = color + '88'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      const cx = s.points.reduce((a,p) => a+p.x,0)/s.points.length;
      const cy = s.points.reduce((a,p) => a+p.y,0)/s.points.length;
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      ctx.fillText(r.id || `?${idx}`, cx, cy);
      ctx.shadowBlur = 0;
    }
  }

  function drawLandmark(lm, idx) {
    const color = LM_COLORS[lm.type] || '#999';
    const s = lm.shape;
    let cx, cy;

    if (s.type === 'polygon') {
      ctx.beginPath();
      s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x,p.y) : ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.fillStyle = color + 'cc'; ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      cx = s.points.reduce((a,p) => a+p.x,0)/s.points.length;
      cy = s.points.reduce((a,p) => a+p.y,0)/s.points.length;
    } else {
      ctx.fillStyle = color + 'cc';
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(s.x,s.y,s.w,s.h,6) : ctx.rect(s.x,s.y,s.w,s.h);
      ctx.fill();
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
      cx = s.x + s.w/2;
      cy = s.y + s.h/2;
    }

    ctx.font = '18px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LM_ICONS[lm.type]||'📍', cx, cy-3);

    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(lm.name || LM_NAMES[lm.type], cx, cy+15);
  }

  function getBounds(shape) {
    if (shape.type === 'rect') return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
    const xs = shape.points.map(p => p.x);
    const ys = shape.points.map(p => p.y);
    return {
      x: Math.min(...xs), y: Math.min(...ys),
      w: Math.max(...xs) - Math.min(...xs),
      h: Math.max(...ys) - Math.min(...ys),
    };
  }

  function drawSelection(sel) {
    const s = getBounds(sel.shape);
    ctx.strokeStyle = '#ffd600';
    ctx.lineWidth = 3; ctx.setLineDash([5,4]);
    ctx.strokeRect(s.x-2, s.y-2, s.w+4, s.h+4);
    ctx.setLineDash([]);
    // Handles (skip for polygon shapes)
    if (sel.shape.type === 'polygon') return;
    const hs = 8, hh = hs/2;
    const pts = [
      [s.x, s.y], [s.x+s.w/2, s.y], [s.x+s.w, s.y],
      [s.x, s.y+s.h/2], [s.x+s.w, s.y+s.h/2],
      [s.x, s.y+s.h], [s.x+s.w/2, s.y+s.h], [s.x+s.w, s.y+s.h]
    ];
    pts.forEach(([px, py]) => {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#ffd600'; ctx.lineWidth = 2;
      ctx.fillRect(px-hh, py-hh, hs, hs);
      ctx.strokeRect(px-hh, py-hh, hs, hs);
    });
  }

  // ===== Find selected =====
  function findSel() {
    if (!S.selId) return null;
    if (S.selType === 'room') {
      const idx = parseInt(S.selId.split('-')[1]);
      return S.data[S.floor].rooms[idx] || null;
    }
    if (S.selType === 'lm') {
      const idx = parseInt(S.selId.split('-')[1]);
      return S.data[S.floor].landmarks[idx] || null;
    }
    return null;
  }

  function pointInPolygon(px, py, points) {
    let inside = false;
    for (let i = 0, j = points.length-1; i < points.length; j = i++) {
      const xi = points[i].x, yi = points[i].y;
      const xj = points[j].x, yj = points[j].y;
      if ((yi > py) !== (yj > py) && px < (xj-xi)*(py-yi)/(yj-yi)+xi) inside = !inside;
    }
    return inside;
  }

  function hitTest(x, y) {
    // Check landmarks first (smaller, so prioritize)
    const lms = S.data[S.floor].landmarks;
    for (let i = lms.length-1; i >= 0; i--) {
      const s = lms[i].shape;
      if (s.type === 'polygon') {
        if (pointInPolygon(x, y, s.points)) return { type: 'lm', idx: i };
      } else {
        const pad = 6;
        if (x >= s.x-pad && x <= s.x+s.w+pad && y >= s.y-pad && y <= s.y+s.h+pad)
          return { type: 'lm', idx: i };
      }
    }
    // Then rooms
    const rooms = S.data[S.floor].rooms;
    for (let i = rooms.length-1; i >= 0; i--) {
      const s = rooms[i].shape;
      if (s.type === 'polygon') {
        if (pointInPolygon(x, y, s.points)) return { type: 'room', idx: i };
      } else {
        if (x >= s.x && x <= s.x+s.w && y >= s.y && y <= s.y+s.h)
          return { type: 'room', idx: i };
      }
    }
    return null;
  }

  function hitHandle(x, y) {
    const sel = findSel();
    if (!sel || sel.shape.type === 'polygon') return null;
    const s = getBounds(sel.shape);
    const hh = 8;
    const handles = [
      { id:'nw', x:s.x, y:s.y }, { id:'n', x:s.x+s.w/2, y:s.y }, { id:'ne', x:s.x+s.w, y:s.y },
      { id:'w', x:s.x, y:s.y+s.h/2 }, { id:'e', x:s.x+s.w, y:s.y+s.h/2 },
      { id:'sw', x:s.x, y:s.y+s.h }, { id:'s', x:s.x+s.w/2, y:s.y+s.h }, { id:'se', x:s.x+s.w, y:s.y+s.h },
    ];
    for (const h of handles) {
      if (x >= h.x-hh && x <= h.x+hh && y >= h.y-hh && y <= h.y+hh) return h.id;
    }
    return null;
  }

  // ===== Canvas coords =====
  function canvasCoords(e) {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width / r.width;
    const scaleY = canvas.height / r.height;
    return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
  }

  // ===== Mouse handlers =====
  canvas.addEventListener('mousedown', e => {
    const p = canvasCoords(e);
    if (S.tool === 'rect') {
      S.drawing = true;
      S.dStartX = p.x; S.dStartY = p.y;
      S.dCurX = p.x; S.dCurY = p.y;
    } else if (S.tool === 'polygon') {
      // Add point
      S.polyPts.push({ x: p.x, y: p.y });
      S.dCurX = p.x; S.dCurY = p.y;
      S.drawing = true;
      render();
    } else if (S.tool === 'select') {
      // Check resize handle
      if (S.selId) {
        const h = hitHandle(p.x, p.y);
        if (h) {
          S.resizing = true; S.rHandle = h;
          const sel = findSel();
          S.rOrig = JSON.parse(JSON.stringify(sel.shape));
          return;
        }
      }
      // Check hit
      const hit = hitTest(p.x, p.y);
      if (hit) {
        S.selId = `${hit.type}-${hit.idx}`;
        S.selType = hit.type;
        S.moving = true;
        const sel = findSel();
        const selBounds = getBounds(sel.shape);
        S.mOffX = p.x - selBounds.x;
        S.mOffY = p.y - selBounds.y;
        S.mOrigShape = JSON.parse(JSON.stringify(sel.shape));
        render();
        updatePanel();
      } else {
        S.selId = null; S.selType = null;
        render();
        hidePanel();
      }
    } else if (['elevator','stair','restroom','custom'].includes(S.tool)) {
      // Drawing mode (supports both rect drag and polygon click)
      S.selId = null; S.selType = null;
      hidePanel();
      S.drawing = true;
      S.dStartX = p.x; S.dStartY = p.y;
      S.dCurX = p.x; S.dCurY = p.y;
    } else if (S.tool === 'delete') {
      const hit = hitTest(p.x, p.y);
      if (hit) {
        if (hit.type === 'room') S.data[S.floor].rooms.splice(hit.idx, 1);
        else S.data[S.floor].landmarks.splice(hit.idx, 1);
        S.selId = null; S.selType = null;
        render(); hidePanel();
      }
    }
  });

  canvas.addEventListener('mousemove', e => {
    const p = canvasCoords(e);
    if (S.drawing) {
      S.dCurX = p.x; S.dCurY = p.y;
      render();
    } else if (S.moving && S.selId) {
      const sel = findSel();
      if (!sel) return;
      const dx = p.x - S.mOffX;
      const dy = p.y - S.mOffY;
      if (sel.shape.type === 'polygon') {
        const orig = S.mOrigShape;
        sel.shape.points.forEach((pt, i) => {
          pt.x = orig.points[i].x + dx;
          pt.y = orig.points[i].y + dy;
        });
      } else {
        sel.shape.x = dx;
        sel.shape.y = dy;
      }
      render();
      updatePanel();
    } else if (S.resizing && S.selId) {
      const sel = findSel();
      if (!sel) return;
      const o = S.rOrig;
      let {x,y,w,h} = o;
      switch (S.rHandle) {
        case 'nw': x = p.x; y = p.y; w = o.x+o.w-p.x; h = o.y+o.h-p.y; break;
        case 'ne': y = p.y; w = p.x-o.x; h = o.y+o.h-p.y; break;
        case 'sw': x = p.x; w = o.x+o.w-p.x; h = p.y-o.y; break;
        case 'se': w = p.x-o.x; h = p.y-o.y; break;
        case 'n': y = p.y; h = o.y+o.h-p.y; break;
        case 's': h = p.y-o.y; break;
        case 'w': x = p.x; w = o.x+o.w-p.x; break;
        case 'e': w = p.x-o.x; break;
      }
      if (w > 10 && h > 10) {
        sel.shape.x = x; sel.shape.y = y; sel.shape.w = w; sel.shape.h = h;
        render(); updatePanel();
      }
    }
    // Update status coordinates
    document.getElementById('statusPos').textContent = `坐标: ${Math.round(p.x)}, ${Math.round(p.y)}`;
  });

  canvas.addEventListener('mouseup', e => {
    if (S.drawing && S.tool === 'rect') {
      S.drawing = false;
      const x = Math.min(S.dStartX, S.dCurX);
      const y = Math.min(S.dStartY, S.dCurY);
      const w = Math.abs(S.dCurX - S.dStartX);
      const h = Math.abs(S.dCurY - S.dStartY);
      if (w > 15 && h > 15) {
        const room = {
          id: `R${S.data[S.floor].rooms.length+1}`,
          name: '',
          type: '教师办公',
          shape: { type:'rect', x:Math.round(x), y:Math.round(y), w:Math.round(w), h:Math.round(h) }
        };
        S.data[S.floor].rooms.push(room);
        const idx = S.data[S.floor].rooms.length - 1;
        S.selId = `room-${idx}`; S.selType = 'room';
        render(); updatePanel();
      } else { render(); }
    } else if (S.drawing && ['elevator','stair','restroom','custom'].includes(S.tool)) {
      S.drawing = false;
      const dx = Math.abs(S.dCurX - S.dStartX);
      const dy = Math.abs(S.dCurY - S.dStartY);
      if (dx > 10 || dy > 10) {
        // Drag → create rect landmark
        const x = Math.min(S.dStartX, S.dCurX);
        const y = Math.min(S.dStartY, S.dCurY);
        const w = Math.abs(S.dCurX - S.dStartX);
        const h = Math.abs(S.dCurY - S.dStartY);
        if (w > 15 && h > 15) {
          const lm = {
            name: LM_NAMES[S.tool],
            type: S.tool,
            shape: { type:'rect', x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
          };
          S.data[S.floor].landmarks.push(lm);
          S.selId = `lm-${S.data[S.floor].landmarks.length-1}`;
          S.selType = 'lm';
          render(); updatePanel();
        } else { render(); }
      } else {
        // Click → add polygon point
        S.polyPts.push({ x: Math.round(p.x), y: Math.round(p.y) });
        S.drawing = true;
        render();
      }
    } else if (S.tool === 'polygon') {
      S.drawing = false; // point already added on mousedown
    }
    S.moving = false; S.resizing = false;
  });

  // Double-click to finish polygon
  canvas.addEventListener('dblclick', e => {
    if (S.polyPts.length < 3) return;
    const pts = S.polyPts.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    S.polyPts = []; S.drawing = false;

    if (['elevator','stair','restroom','custom'].includes(S.tool)) {
      const lm = {
        name: LM_NAMES[S.tool],
        type: S.tool,
        shape: { type:'polygon', points: pts }
      };
      S.data[S.floor].landmarks.push(lm);
      S.selId = `lm-${S.data[S.floor].landmarks.length-1}`;
      S.selType = 'lm';
    } else {
      const room = {
        id: `R${S.data[S.floor].rooms.length+1}`,
        name: '',
        type: '教师办公',
        shape: { type:'polygon', points: pts }
      };
      S.data[S.floor].rooms.push(room);
      const idx = S.data[S.floor].rooms.length - 1;
      S.selId = `room-${idx}`; S.selType = 'room';
    }
    render(); updatePanel();
  });

  // ===== Panel =====
  function updatePanel() {
    const sel = findSel();
    if (!sel) { hidePanel(); return; }

    if (S.selType === 'room') {
      showRoomPanel(sel);
    } else if (S.selType === 'lm') {
      showLmPanel(sel);
    }
  }

  function showRoomPanel(room) {
    document.getElementById('panelPlaceholder').style.display = 'none';
    document.getElementById('panelForm').style.display = 'block';
    document.getElementById('lmForm').style.display = 'none';
    document.getElementById('panelTitle').textContent = `🚪 房间属性 · ${room.id}`;
    document.getElementById('propId').value = room.id || '';
    document.getElementById('propName').value = room.name || '';
    document.getElementById('propType').value = room.type || '教师办公';
    if (room.shape.type === 'rect') {
      document.getElementById('propX').value = Math.round(room.shape.x);
      document.getElementById('propY').value = Math.round(room.shape.y);
      document.getElementById('propW').value = Math.round(room.shape.w);
      document.getElementById('propH').value = Math.round(room.shape.h);
    } else {
      document.getElementById('propX').value = '';
      document.getElementById('propY').value = '';
      document.getElementById('propW').value = '';
      document.getElementById('propH').value = '';
    }
  }

  function showLmPanel(lm) {
    document.getElementById('panelPlaceholder').style.display = 'none';
    document.getElementById('panelForm').style.display = 'none';
    document.getElementById('lmForm').style.display = 'block';
    document.getElementById('lmName').value = lm.name || '';
    document.getElementById('lmTypeSelect').value = lm.type || 'elevator';
    // Show coords for rect, hide for polygon
    const coordGroup = document.getElementById('lmCoordGroup');
    if (lm.shape.type === 'rect') {
      coordGroup.style.display = 'block';
      document.getElementById('lmX').value = Math.round(lm.shape.x);
      document.getElementById('lmY').value = Math.round(lm.shape.y);
      document.getElementById('lmW').value = Math.round(lm.shape.w);
      document.getElementById('lmH').value = Math.round(lm.shape.h);
    } else {
      coordGroup.style.display = 'none';
    }
  }

  function hidePanel() {
    document.getElementById('panelPlaceholder').style.display = 'flex';
    document.getElementById('panelForm').style.display = 'none';
    document.getElementById('lmForm').style.display = 'none';
  }

  // ===== Save Properties =====
  document.getElementById('savePropsBtn').addEventListener('click', () => {
    if (S.selType !== 'room') return;
    const idx = parseInt(S.selId.split('-')[1]);
    const room = S.data[S.floor].rooms[idx];
    if (!room) return;

    room.id = document.getElementById('propId').value.trim() || room.id;
    room.name = document.getElementById('propName').value.trim();
    room.type = document.getElementById('propType').value;

    if (room.shape.type === 'rect') {
      const x = parseInt(document.getElementById('propX').value);
      const y = parseInt(document.getElementById('propY').value);
      const w = parseInt(document.getElementById('propW').value);
      const h = parseInt(document.getElementById('propH').value);
      if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
        room.shape.x = x; room.shape.y = y; room.shape.w = w; room.shape.h = h;
      }
    }

    // Update title
    document.getElementById('panelTitle').textContent = `🚪 房间属性 · ${room.id}`;
    render();
  });

  document.getElementById('saveLmBtn').addEventListener('click', () => {
    if (S.selType !== 'lm') return;
    const idx = parseInt(S.selId.split('-')[1]);
    const lm = S.data[S.floor].landmarks[idx];
    if (!lm) return;

    lm.name = document.getElementById('lmName').value.trim() || LM_NAMES[lm.type];
    lm.type = document.getElementById('lmTypeSelect').value;

    if (lm.shape.type === 'rect') {
      const x = parseInt(document.getElementById('lmX').value);
      const y = parseInt(document.getElementById('lmY').value);
      const w = parseInt(document.getElementById('lmW').value);
      const h = parseInt(document.getElementById('lmH').value);
      if (!isNaN(x) && !isNaN(y) && !isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
        lm.shape.x = x; lm.shape.y = y; lm.shape.w = w; lm.shape.h = h;
      }
    }
    render();
  });

  document.getElementById('deletePropBtn').addEventListener('click', () => {
    if (!S.selId) return;
    if (S.selType === 'room') {
      const idx = parseInt(S.selId.split('-')[1]);
      S.data[S.floor].rooms.splice(idx, 1);
    } else if (S.selType === 'lm') {
      const idx = parseInt(S.selId.split('-')[1]);
      S.data[S.floor].landmarks.splice(idx, 1);
    }
    S.selId = null; S.selType = null;
    render(); hidePanel();
  });

  document.getElementById('deleteLmBtn').addEventListener('click', () => {
    if (!S.selId || S.selType !== 'lm') return;
    const idx = parseInt(S.selId.split('-')[1]);
    S.data[S.floor].landmarks.splice(idx, 1);
    S.selId = null; S.selType = null;
    render(); hidePanel();
  });

  // ===== Tool switching =====
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.tool = btn.dataset.tool;
      S.polyPts = []; S.drawing = false;
      document.getElementById('statusTool').textContent = `工具: ${btn.textContent.trim()}`;
      if (!['select','delete'].includes(S.tool)) {
        canvas.style.cursor = S.tool === 'rect' ? 'crosshair' : 'crosshair';
      } else {
        canvas.style.cursor = S.tool === 'select' ? 'default' : 'pointer';
      }
    });
  });

  // ===== Floor switching =====
  document.querySelectorAll('.anno-header-right .floor-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.anno-header-right .floor-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      S.floor = parseInt(btn.dataset.floor);
      S.selId = null; S.selType = null; S.polyPts = [];
      hidePanel();
      // Auto-size canvas wrapper to fit image
      fitCanvas();
      render();
    });
  });

  function fitCanvas() {
    const img = S.img[S.floor];
    if (!img) return;
    const wrapper = document.getElementById('canvasWrapper');
    // The canvas is already sized to image dimensions in render()
    // Adjust CSS to fit wrapper
    canvas.style.width = Math.min(img.width, wrapper.clientWidth - 20) + 'px';
    canvas.style.height = 'auto';
  }

  // ===== Status bar =====
  function updateStatus() {
    const rCount = S.data[S.floor].rooms.length;
    const lCount = S.data[S.floor].landmarks.length;
    document.getElementById('statusCount').textContent = `房间: ${rCount} | 设施: ${lCount}`;
  }

  // ===== Export =====
  document.getElementById('exportBtn').addEventListener('click', () => {
    const output = {
      name: '济事楼',
      subtitle: '同济大学软件学院',
      generated: new Date().toISOString().split('T')[0],
      floors: [4, 5].map(f => {
        const img = S.img[f];
        return {
          floor: f,
          label: f + 'F',
          imageWidth: img ? img.width : 0,
          imageHeight: img ? img.height : 0,
          imagePath: IMG_PATHS[f],
          rooms: S.data[f].rooms.map(r => {
            const bounds = getBounds(r.shape);
            return {
              id: r.id, name: r.name, type: r.type,
              x: Math.round(bounds.x), y: Math.round(bounds.y),
              w: Math.round(bounds.w), h: Math.round(bounds.h),
              shapeType: r.shape.type,
              points: r.shape.points ? r.shape.points.map(p => ({ x:Math.round(p.x), y:Math.round(p.y) })) : undefined,
            };
          }),
          landmarks: S.data[f].landmarks.map(lm => {
            const bounds = getBounds(lm.shape);
            return {
              name: lm.name, type: lm.type,
              x: Math.round(bounds.x), y: Math.round(bounds.y),
              w: Math.round(bounds.w), h: Math.round(bounds.h),
              shapeType: lm.shape.type,
              points: lm.shape.points ? lm.shape.points.map(p => ({ x:Math.round(p.x), y:Math.round(p.y) })) : undefined,
            };
          }),
        };
      }),
    };

    const blob = new Blob([JSON.stringify(output, null, 2)], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `jishi_building_annotation.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Show confirmation
    showToast(`✅ 已导出 ${output.floors[0].rooms.length + output.floors[1].rooms.length} 个房间`);
  });

  // ===== Toast =====
  function showToast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position:'fixed', bottom:'40px', left:'50%', transform:'translateX(-50%)',
      background:'#e94560', color:'#fff', padding:'10px 24px', borderRadius:'8px',
      fontSize:'14px', fontWeight:'600', zIndex:2000,
      boxShadow:'0 4px 16px rgba(0,0,0,0.3)', transition:'opacity 0.3s',
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
  }

  // ===== Help =====
  document.getElementById('helpBtn').addEventListener('click', () => {
    document.getElementById('helpModal').style.display = 'flex';
  });
  window.closeHelp = () => {
    document.getElementById('helpModal').style.display = 'none';
  };
  document.getElementById('helpModal').addEventListener('click', e => {
    if (e.target === e.currentTarget) document.getElementById('helpModal').style.display = 'none';
  });

  // ===== Init =====
  loadImages();
  // Also load immediately if cached
  setTimeout(() => fitCanvas(), 300);
  window.addEventListener('resize', () => fitCanvas());

  // Initial status
  document.getElementById('statusTool').textContent = '工具: 矩形';
})();
