(() => {
  'use strict';

  let currentFloor = 4;
  let selectedRoomId = null;
  let pinned = false;
  let currentRooms = [];
  let currentLandmarks = [];

  const svg = document.getElementById('floorPlan');
  const ns = 'http://www.w3.org/2000/svg';

  // ===== SVG helpers =====
  function createSVG(tag, attrs = {}) {
    const el = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v !== undefined && v !== null) el.setAttribute(k, v);
    });
    return el;
  }

  function clearSVG() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
  }

  // ===== Type → Color mapping =====
  const TYPE_COLORS = {
    '教师办公':'#5c6bc0','教学管理':'#5c6bc0','行政办公':'#5c6bc0',
    '综合管理':'#5c6bc0','党务办公':'#5c6bc0','学生工作':'#5c6bc0',
    '学习科研':'#26a69a','科研实验':'#26a69a','实验教学':'#26a69a',
    '机房':'#26a69a','教学空间':'#ab47bc','公共空间':'#ab47bc',
    '党团活动':'#ab47bc','设备空间':'#9e9e9e','暂不可进入':'#757575',
  };
  const LM_COLORS = {
    elevator:'#ff8f00', stair:'#e53935', restroom:'#78909c', custom:'#8d6e63',
  };

  function getTypeColor(type) { return TYPE_COLORS[type] || '#999'; }

  function getShapeCenter(shape) {
    if (shape.shapeType === 'polygon' && shape.points) {
      const xs = shape.points.map(p => p.x);
      const ys = shape.points.map(p => p.y);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    }
    return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  }

  function getShapeBounds(shape) {
    if (shape.shapeType === 'polygon' && shape.points) {
      const xs = shape.points.map(p => p.x);
      const ys = shape.points.map(p => p.y);
      return {
        x: Math.min(...xs), y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    }
    return { x: shape.x, y: shape.y, w: shape.w, h: shape.h };
  }

  // ===== Render floor =====
  function renderFloor(floorNum) {
    try {
      clearSVG();
    } catch(e) { /* SVG might be in odd state */ }

    selectedRoomId = null;
    pinned = false;

    // Safe DOM access
    const safe = id => document.getElementById(id);
    const hide = id => { const el = safe(id); if (el) el.classList.remove('show'); };
    const setDisplay = (id, v) => { const el = safe(id); if (el) el.style.display = v; };

    const inp = safe('searchInput');
    if (inp) inp.value = '';
    hide('searchResults');
    hide('searchSubmenu');
    setDisplay('placeholder', 'flex');
    setDisplay('roomDetail', 'none');

    const floorData = buildingData.floors.find(f => f.floor === floorNum);
    if (!floorData) return;
    currentRooms = floorData.rooms;
    currentLandmarks = floorData.landmarks;

    try {

    // Set viewBox to image dimensions
    svg.setAttribute('viewBox', '0 0 ' + floorData.imageWidth + ' ' + floorData.imageHeight);

    // ---- Background image ----
    const bgImg = createSVG('image', {
      href: floorData.imagePath,
      width: floorData.imageWidth,
      height: floorData.imageHeight,
    });
    bgImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', floorData.imagePath);
    svg.appendChild(bgImg);

    // ---- Landmarks ----
    floorData.landmarks.forEach(lm => {
      const color = LM_COLORS[lm.type] || '#999';
      const g = createSVG('g', { class: 'landmark' });

      if (lm.shapeType === 'polygon' && lm.points) {
        const pts = lm.points.map(p => p.x + ',' + p.y).join(' ');
        g.appendChild(createSVG('polygon', {
          points: pts, fill: color, 'fill-opacity': 0.8,
          stroke: color, 'stroke-width': 2,
        }));
      } else {
        g.appendChild(createSVG('rect', {
          x: lm.x, y: lm.y, width: lm.w, height: lm.h, rx: 6,
          fill: color, 'fill-opacity': 0.8, stroke: color, 'stroke-width': 2,
        }));
      }

      const c = getShapeCenter(lm);
      const iconEl = createSVG('text', {
        x: c.x, y: c.y + 1, 'text-anchor': 'middle',
        'font-size': Math.min(lm.w, lm.h, 28) || 18, fill: '#fff',
        'pointer-events': 'none',
      });
      iconEl.textContent = lm.icon || '📍';
      g.appendChild(iconEl);

      const nameEl = createSVG('text', {
        x: c.x, y: c.y + Math.min(lm.h, 40) / 2 + 10 || c.y + 16,
        'text-anchor': 'middle', 'font-size': 10, fill: '#fff',
        'font-weight': '600', 'pointer-events': 'none',
      });
      nameEl.textContent = lm.name;
      g.appendChild(nameEl);

      // Tooltip hint for switchable landmarks
      if (lm.type === 'elevator' || lm.type === 'stair') {
        g.style.cursor = 'pointer';
        const tip = createSVG('title');
        tip.textContent = '点击切换楼层';
        g.appendChild(tip);

        g.addEventListener('click', (e) => {
          e.stopPropagation();
          const floors = buildingData.floors.map(f => f.floor);
          const otherFloor = floors.find(f => f !== currentFloor);
          if (otherFloor !== undefined) switchFloor(otherFloor);
        });
      }

      svg.appendChild(g);
    });

    // ---- Rooms ----
    floorData.rooms.forEach(room => {
      const disabled = room.type === '暂不可进入' || room.type === '设备空间';
      const color = getTypeColor(room.type);
      const fillOpacity = disabled ? 0.55 : 0.75;

      const g = createSVG('g', {
        class: 'room-group',
        'data-room': room.id,
        style: disabled ? '' : 'cursor:pointer',
      });

      // Room shape (rect or polygon)
      if (room.shapeType === 'polygon' && room.points) {
        const pts = room.points.map(p => p.x + ',' + p.y).join(' ');
        g.appendChild(createSVG('polygon', {
          points: pts, fill: color, 'fill-opacity': fillOpacity,
          stroke: 'rgba(0,0,0,0.2)', 'stroke-width': 1,
          class: 'room-rect', 'data-id': room.id,
        }));
      } else {
        g.appendChild(createSVG('rect', {
          x: room.x, y: room.y, width: room.w, height: room.h, rx: 5,
          fill: color, 'fill-opacity': fillOpacity,
          stroke: 'rgba(0,0,0,0.2)', 'stroke-width': 1,
          class: 'room-rect', 'data-id': room.id,
        }));
      }

      // Room labels
      const c = getShapeCenter(room);
      const bounds = getShapeBounds(room);
      const sz = Math.min(bounds.w, bounds.h);

      const idEl = createSVG('text', {
        x: c.x, y: c.y - 6,
        'font-size': sz > 50 ? 13 : 10, 'font-weight': '600',
        fill: disabled ? '#666' : '#fff',
        'text-anchor': 'middle', 'pointer-events': 'none', 'user-select': 'none',
      });
      idEl.textContent = room.id;
      g.appendChild(idEl);

      const nameEl = createSVG('text', {
        x: c.x, y: c.y + 12,
        'font-size': sz > 50 ? 10 : 8,
        fill: disabled ? '#666' : 'rgba(255,255,255,0.85)',
        'text-anchor': 'middle', 'pointer-events': 'none', 'user-select': 'none',
      });
      const shortName = room.name.length > 10 ? room.name.slice(0, 8) + '…' : room.name;
      nameEl.textContent = disabled ? '(不可进入)' : shortName;
      g.appendChild(nameEl);

      // Disabled marker
      if (disabled) {
        const xEl = createSVG('text', {
          x: bounds.x + bounds.w - 8, y: bounds.y + 14,
          'font-size': 14, fill: '#ef5350', 'font-weight': '700',
          'text-anchor': 'end', 'pointer-events': 'none',
        });
        xEl.textContent = '✕';
        g.appendChild(xEl);
      }

      // Selection glow
      g.appendChild(createSVG('rect', {
        x: bounds.x - 3, y: bounds.y - 3,
        width: bounds.w + 6, height: bounds.h + 6, rx: 7,
        fill: 'none', stroke: '#ffd600', 'stroke-width': 3.5,
        class: 'selection-glow', style: 'display:none',
      }));

      // Events (skip disabled rooms)
      if (!disabled) {
        g.addEventListener('mouseenter', () => {
          if (pinned) return;
          highlightRoom(room.id, true);
          showRoomPreview(room);
        });
        g.addEventListener('mouseleave', () => {
          if (pinned) return;
          highlightRoom(room.id, false);
        });
        g.addEventListener('click', (e) => {
          e.stopPropagation();
          selectRoomById(room.id);
        });
      }

      svg.appendChild(g);
    });

    // Click empty area to deselect
    svg.addEventListener('click', deselectAll);

    // Floor description
    document.getElementById('floorDesc').textContent =
      (floorData.label || floorNum + 'F') + ' · ' + (floorData.description || '');

    // Active tab
    document.querySelectorAll('.floor-btn').forEach(btn => {
      btn.classList.toggle('active', parseInt(btn.dataset.floor) === floorNum);
    });
    } catch(e) { console.error('渲染楼层失败:', e); }
  }

  // ===== Highlight room on hover =====
  function highlightRoom(id, on) {
    if (selectedRoomId === id) return;
    const groups = svg.querySelectorAll('.room-group');
    for (const g of groups) {
      if (g.dataset.room === id) {
        const rect = g.querySelector('.room-rect');
        if (rect) {
          rect.setAttribute('stroke', on ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.2)');
          rect.setAttribute('stroke-width', on ? '2.5' : '1');
        }
        break;
      }
    }
  }

  // ===== Show room preview =====
  function showRoomPreview(room) {
    const color = getTypeColor(room.type);

    document.getElementById('placeholder').style.display = 'none';
    const detail = document.getElementById('roomDetail');
    detail.style.display = 'block';

    let staffHtml = '';
    if (room.staff && room.staff.length > 0) {
      staffHtml = '<div class="detail-section"><h3>👤 人员</h3><ul class="staff-list">' +
        room.staff.map(s => {
          const initial = s.name.charAt(0);
          return '<li class="staff-item">' +
            '<div class="staff-avatar" style="background:' + color + '">' + initial + '</div>' +
            '<div class="staff-info">' +
            '<div class="staff-name">' + s.name + '</div>' +
            '<div class="staff-title">' + s.title + '</div></div></li>';
        }).join('') + '</ul></div>';
    }

    let imagesHtml = '';
    if (room.images && room.images.length > 0) {
      imagesHtml = '<div class="detail-section"><h3>📸 照片</h3><div class="room-images">' +
        room.images.map((img, i) =>
          '<img src="' + img + '" class="room-image" onclick="window.open(this.src)" loading="lazy">'
        ).join('') + '</div></div>';
    }

    detail.innerHTML =
      '<div class="room-detail">' +
      '<div class="detail-header">' +
      '<div class="door-icon" style="background:' + color + '">🚪</div>' +
      '<div class="title-group">' +
      '<h2>' + room.id + ' ' + room.name + '</h2>' +
      '<span class="type-badge" style="background:' + color + '">' + room.type + '</span>' +
      '</div></div>' +
      '<div class="detail-body">' +
      '<div class="detail-section"><h3>📋 简介</h3><p>' + (room.desc || '暂无简介') + '</p></div>' +
      staffHtml +
      imagesHtml +
      '</div></div>';
  }

  // ===== Select / Deselect =====
  function selectRoomById(id) {
    const room = currentRooms.find(r => r.id === id);
    if (!room) return;

    // If same room clicked while pinned, unpin and deselect
    if (pinned && selectedRoomId === id) {
      pinned = false;
      deselectAll();
      return;
    }

    // Deselect previous
    svg.querySelectorAll('.selection-glow').forEach(g => g.style.display = 'none');
    svg.querySelectorAll('.room-rect').forEach(r => {
      r.setAttribute('stroke', 'rgba(0,0,0,0.2)');
      r.setAttribute('stroke-width', '1');
    });

    selectedRoomId = id;
    pinned = true;
    document.getElementById('pinIndicator').style.display = 'block';

    // Show glow on selected
    const groups = svg.querySelectorAll('.room-group');
    for (const g of groups) {
      if (g.dataset.room === id) {
        const glow = g.querySelector('.selection-glow');
        if (glow) glow.style.display = 'block';
        const rect = g.querySelector('.room-rect');
        if (rect) {
          rect.setAttribute('stroke', '#ffd600');
          rect.setAttribute('stroke-width', '2.5');
        }
        break;
      }
    }

    showRoomPreview(room);
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('placeholder').style.display = 'none';
  }

  function deselectAll() {
    selectedRoomId = null;
    pinned = false;
    svg.querySelectorAll('.selection-glow').forEach(g => g.style.display = 'none');
    svg.querySelectorAll('.room-rect').forEach(r => {
      r.setAttribute('stroke', 'rgba(0,0,0,0.2)');
      r.setAttribute('stroke-width', '1');
    });
    document.getElementById('placeholder').style.display = 'flex';
    document.getElementById('roomDetail').style.display = 'none';
    document.getElementById('pinIndicator').style.display = 'none';
  }

  // ===== Search (across all floors) =====
  function searchRoomsInAllFloors(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results = [];
    buildingData.floors.forEach(floor => {
      floor.rooms.forEach(room => {
        let score = 0;
        if (room.id.toLowerCase().includes(q)) score += 10;
        if (room.name.toLowerCase().includes(q)) score += 8;
        if (room.type.toLowerCase().includes(q)) score += 4;
        if ((room.desc || '').toLowerCase().includes(q)) score += 3;
        if (room.staff) {
          room.staff.forEach(s => {
            if (s.name.toLowerCase().includes(q)) score += 6;
            if (s.title.toLowerCase().includes(q)) score += 2;
          });
        }
        if (score > 0) results.push({ room, score, floor: floor.floor, floorLabel: floor.label });
      });
    });

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  function findRoomData(id, floor) {
    const f = buildingData.floors.find(f => f.floor === floor);
    if (!f) return null;
    return f.rooms.find(r => r.id === id) || null;
  }

  function renderSearchDropdown(results) {
    const container = document.getElementById('searchResults');
    const submenu = document.getElementById('searchSubmenu');
    if (results.length === 0) { container.classList.remove('show'); return; }

    container.innerHTML = results.map(r => {
      const color = getTypeColor(r.room.type);
      return '<div class="search-result-item" data-id="' + r.room.id + '" data-floor="' + r.floor + '">' +
        '<span class="room-tag" style="background:' + color + '">' + r.room.id + '</span>' +
        '<span class="room-name">' + r.room.name + '</span>' +
        '<span class="room-type">' + (r.floorLabel || r.floor + 'F') + ' · ' + r.room.type + '</span></div>';
    }).join('');

    container.classList.add('show');
    submenu.classList.remove('show');

    container.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const floor = parseInt(el.dataset.floor);
        submenu.classList.remove('show');
        if (floor !== currentFloor) switchFloor(floor);
        setTimeout(() => selectRoomById(id), 50);
      });

      el.addEventListener('mouseenter', () => {
        if (window._submenuTimer) clearTimeout(window._submenuTimer);
        const id = el.dataset.id;
        const floor = parseInt(el.dataset.floor);
        const room = findRoomData(id, floor);
        if (!room) return;

        const color = getTypeColor(room.type);

        if (room.staff && room.staff.length > 0) {
          submenu.innerHTML =
            '<div class="submenu-title">👤 ' + room.id + ' 人员</div>' +
            '<ul class="submenu-staff">' +
            room.staff.map(s => {
              const initial = s.name.charAt(0);
              return '<li>' +
                '<span class="staff-avatar-sm" style="background:' + color + '">' + initial + '</span>' +
                '<div><div>' + s.name + '</div><div class="staff-title-sm">' + s.title + '</div></div></li>';
            }).join('') + '</ul>';
        } else {
          submenu.innerHTML = '<div class="submenu-empty">暂无人员信息</div>';
        }

        // Position submenu aligned with this item
        submenu.style.top = (container.offsetTop + el.offsetTop) + 'px';
        submenu.classList.add('show');
      });

      el.addEventListener('mouseleave', () => {
        if (window._submenuTimer) clearTimeout(window._submenuTimer);
        window._submenuTimer = setTimeout(() => {
          if (!submenu.matches(':hover')) {
            submenu.classList.remove('show');
          }
        }, 200);
      });
    });

    // Keep submenu visible when hovering over it
    submenu.addEventListener('mouseenter', () => {
      if (window._submenuTimer) clearTimeout(window._submenuTimer);
    });
    submenu.addEventListener('mouseleave', () => {
      submenu.classList.remove('show');
    });
  }

  // ===== Floor switching (with debounce) =====
  let _switching = false;
  function switchFloor(floorNum) {
    if (floorNum === currentFloor || _switching) return;
    _switching = true;
    currentFloor = floorNum;
    renderFloor(floorNum);
    setTimeout(() => { _switching = false; }, 300);
  }

  // ===== Init =====
  function init() {
    // Start with first available floor
    if (buildingData.floors.some(f => f.floor === 4)) {
      renderFloor(4);
    } else if (buildingData.floors.length > 0) {
      renderFloor(buildingData.floors[0].floor);
    }

    // Floor tabs
    document.querySelectorAll('.floor-btn').forEach(btn => {
      btn.addEventListener('click', () => switchFloor(parseInt(btn.dataset.floor)));
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    let timer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const q = searchInput.value;
        if (q.trim()) {
          renderSearchDropdown(searchRoomsInAllFloors(q));
        } else {
          document.getElementById('searchResults').classList.remove('show');
          document.getElementById('searchSubmenu').classList.remove('show');
        }
      }, 150);
    });

    // Close search on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-wrapper')) {
        document.getElementById('searchResults').classList.remove('show');
        document.getElementById('searchSubmenu').classList.remove('show');
      }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('searchResults').classList.remove('show');
        document.getElementById('searchSubmenu').classList.remove('show');
        document.getElementById('searchInput').blur();
        deselectAll();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
