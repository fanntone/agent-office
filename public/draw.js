'use strict';

// Draws the office on a canvas: floor, walls, furniture and the people in it, back to front so nearer
// things cover farther ones, then the speech bubbles and name tags on top. Everything is drawn by code.
(function (root) {
  const World = root.World;
  const { W, H, WALL } = World;

  const MARGIN = 40;
  // the floor diamond spans x - y from -H to W and x + y from 0 to W + H
  const SCENE_W = (W + H) * World.TILE_W / 2 + 2 * MARGIN;
  const SCENE_H = (W + H) * World.TILE_H / 2 + WALL + 2 * MARGIN;
  const OX = H * World.TILE_W / 2 + MARGIN;
  const OY = WALL + MARGIN;

  const INK = '#4A3B35';
  const SKINS = ['#FFE0C2', '#F5CBA7', '#E0AC80', '#B97F57', '#8D5A3B'];
  const BLUSH = 'rgba(236, 120, 105, .45)';         // see-through, so it reads on every skin
  const HAIR = ['#5B3A29', '#2F2A28', '#D9A55B', '#8B5A3C', '#C9746B', '#6B4F7A'];
  const HAIR_STYLES = ['fringe', 'side', 'long', 'bun'];
  const KINDS = {
    claude: { main: '#D97757', dark: '#B85C3E' },
    strata: { main: '#14B8A6', dark: '#0F766E' },
  };
  const ICON = { tool: '🔧', thinking: '💭', waiting: '❗', sleeping: '💤', leaving: '👋' };
  const ROBOT_ICON = { generating: '✍️', reading: '📖', idle: '☕', queued: '⏳', offline: '💤' };

  const P = (x, y, z = 0) => { const s = World.toScreen(x, y, z); return [OX + s.sx, OY + s.sy]; };

  function poly(ctx, pts, fill, stroke = INK, width = 1.5) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
  }

  // a box standing on the floor (or at height z0): its top and the two faces turned to the viewer
  function box(ctx, x, y, w, d, h, c, z0 = 0) {
    const z1 = z0 + h;
    poly(ctx, [P(x, y + d, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x, y + d, z1)], c.left);
    poly(ctx, [P(x + w, y, z0), P(x + w, y + d, z0), P(x + w, y + d, z1), P(x + w, y, z1)], c.right);
    poly(ctx, [P(x, y, z1), P(x + w, y, z1), P(x + w, y + d, z1), P(x, y + d, z1)], c.top);
  }
  const shade = (top, left, right) => ({ top, left, right });

  function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function hash(s) {
    let h = 0;
    for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h;
  }

  // a person's looks from their id: hash() alone leaves its low bits tied to the id's last characters,
  // so the bits are stirred first (murmur3's finaliser) and each feature takes its own slice of them
  function lookOf(id) {
    let m = hash(id);
    m = Math.imul(m ^ (m >>> 16), 0x85ebca6b) >>> 0;
    m = Math.imul(m ^ (m >>> 13), 0xc2b2ae35) >>> 0;
    m = (m ^ (m >>> 16)) >>> 0;
    return {
      skin: SKINS[m % SKINS.length],
      hair: HAIR[(m >>> 4) % HAIR.length],
      hairStyle: HAIR_STYLES[(m >>> 8) % HAIR_STYLES.length],
      glasses: (m >>> 12) % 4 === 0,
    };
  }

  // ---- the room
  const WOOD = ['#E8D2B0', '#E2C9A4', '#EBD8BA'];
  const SLAB = 12;                                     // the floor's thickness at its front edges
  const THICK = 0.15;                                  // the walls' thickness, in cells

  // the sky outside for an hour of the day
  function skyAt(hour) {
    if (hour === 6) return 'dawn';
    if (hour >= 7 && hour < 17) return 'day';
    if (hour >= 17 && hour < 19) return 'dusk';
    return 'night';
  }

  function floor(ctx) {
    // the floor's front edges, so the room sits like a model on the page
    poly(ctx, [P(0, H), P(W, H), P(W, H, -SLAB), P(0, H, -SLAB)], '#B98B5E');
    poly(ctx, [P(W, 0), P(W, H), P(W, H, -SLAB), P(W, 0, -SLAB)], '#A57A4F');
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        if (x >= 12 && y <= 5) {                       // the coffee corner is tiled
          poly(ctx, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], (x + y) % 2 ? '#F4EFE6' : '#E6DED0', 'rgba(120,100,80,.25)', 1);
          continue;
        }
        // wooden planks along x, three to a cell, the seams staggered from row to row
        for (let k = 0; k < 3; k++) {
          const y0 = y + k / 3, y1 = y + (k + 1) / 3;
          const tone = WOOD[hash(`${(x + k * 2 + y * 3) >> 1},${y},${k}`) % WOOD.length];
          poly(ctx, [P(x, y0), P(x + 1, y0), P(x + 1, y1), P(x, y1)], tone, null);
        }
        ctx.strokeStyle = 'rgba(150,110,70,.22)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 1; k < 3; k++) { ctx.moveTo(...P(x, y + k / 3)); ctx.lineTo(...P(x + 1, y + k / 3)); }
        const seam = (x + y) % 3;                      // one plank in three ends at this cell's edge
        ctx.moveTo(...P(x, y + seam / 3)); ctx.lineTo(...P(x, y + (seam + 1) / 3));
        ctx.stroke();
      }
    }
    // the lounge rug: a border round a soft middle
    poly(ctx, [P(12.2, 6.2), P(15.8, 6.2), P(15.8, 10.8), P(12.2, 10.8)], '#9CCFB4', INK, 1.5);
    poly(ctx, [P(12.45, 6.45), P(15.55, 6.45), P(15.55, 10.55), P(12.45, 10.55)], '#CDE8D8', 'rgba(255,255,255,.7)', 1.5);
    poly(ctx, [P(0, 0), P(W, 0), P(W, H), P(0, H)], null, INK, 2);
  }

  // the view out of a window from u = a to b on the back wall: sky for the hour, a skyline, clouds or stars
  function windowView(ctx, a, b, sky, now) {
    const SKY = { dawn: '#F9D9B9', day: '#BFE3F5', dusk: '#F4A97A', night: '#26324F' };
    const CITY = { dawn: '#C9A99A', day: '#9FC3D9', dusk: '#B5706A', night: '#1B2338' };
    ctx.fillStyle = SKY[sky]; ctx.fillRect(a, 42, b - a, 58);
    if (sky === 'night') {
      ctx.fillStyle = '#FFFFFF';
      for (let i = 0; i < 6; i++) ctx.fillRect(a + 0.15 + ((i * 0.37) % (b - a - 0.3)), 78 + ((i * 13) % 18), 0.03, 1.5);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      const drift = ((now / 60000) % 1) * (b - a - 1.2);           // a cloud that crosses in a minute
      ctx.beginPath(); ctx.ellipse(a + 0.6 + drift, 84, 0.35, 6, 0, 0, Math.PI * 2); ctx.ellipse(a + 0.9 + drift, 87, 0.3, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
    // buildings along the bottom; their windows light up after dark
    for (let i = 0, u = a; u < b - 0.05; i++) {
      const w = Math.min(0.28 + (hash(`${a}:${i}`) % 3) * 0.08, b - u);
      const h = 10 + hash(`${a}:${i}:h`) % 22;
      ctx.fillStyle = CITY[sky]; ctx.fillRect(u, 42, w, h);
      if (sky === 'night' || sky === 'dusk') {
        ctx.fillStyle = '#F6D57A';
        for (let v = 46; v < 42 + h - 3; v += 6) if (hash(`${a}:${i}:${v}`) % 3) ctx.fillRect(u + w * 0.3, v, w * 0.25, 2.5);
      }
      u += w + 0.03;
    }
  }

  // draws on a wall as if it were flat paper: u along the wall in cells, v up in pixels
  function onWall(ctx, wall, fn) {
    const [ox, oy] = P(0, 0);
    const [ux, uy] = wall === 'left' ? P(0, 1) : P(1, 0);
    ctx.save();
    ctx.transform(ux - ox, uy - oy, 0, -1, ox, oy);
    fn();
    ctx.restore();
  }

  function walls(ctx, now, counts) {
    // the walls' tops and open ends show their thickness
    poly(ctx, [P(0, 0, WALL), P(0, H, WALL), P(-THICK, H, WALL), P(-THICK, -THICK, WALL)], '#E8D2B8');
    poly(ctx, [P(0, 0, WALL), P(W, 0, WALL), P(W, -THICK, WALL), P(-THICK, -THICK, WALL)], '#EEDCC4');
    poly(ctx, [P(0, H), P(-THICK, H), P(-THICK, H, WALL), P(0, H, WALL)], '#D9BFA0');
    poly(ctx, [P(W, 0), P(W, -THICK), P(W, -THICK, WALL), P(W, 0, WALL)], '#CDB194');
    poly(ctx, [P(0, 0), P(0, H), P(0, H, WALL), P(0, 0, WALL)], '#F3E1CB');
    poly(ctx, [P(0, 0), P(W, 0), P(W, 0, WALL), P(0, 0, WALL)], '#FBEEDC');
    // wainscot panels up to a rail, over the skirting
    poly(ctx, [P(0, 0), P(0, H), P(0, H, 40), P(0, 0, 40)], '#E6CDAE', null);
    poly(ctx, [P(0, 0), P(W, 0), P(W, 0, 40), P(0, 0, 40)], '#EED8BC', null);
    ctx.strokeStyle = 'rgba(150,110,70,.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let u = 1; u < H; u++) { ctx.moveTo(...P(0, u, 10)); ctx.lineTo(...P(0, u, 38)); }
    for (let u = 1; u < W; u++) { ctx.moveTo(...P(u, 0, 10)); ctx.lineTo(...P(u, 0, 38)); }
    ctx.stroke();
    poly(ctx, [P(0, 0, 38), P(0, H, 38), P(0, H, 42), P(0, 0, 42)], '#C9A27A', INK, 1);
    poly(ctx, [P(0, 0, 38), P(W, 0, 38), P(W, 0, 42), P(0, 0, 42)], '#D4AE86', INK, 1);
    poly(ctx, [P(0, 0), P(0, H), P(0, H, 8), P(0, 0, 8)], '#D9BFA0', INK, 1);
    poly(ctx, [P(0, 0), P(W, 0), P(W, 0, 8), P(0, 0, 8)], '#E3CBAD', INK, 1);
    ctx.lineJoin = 'round';
    const sky = skyAt(new Date(now).getHours());

    // two windows onto the city on the back-right wall
    onWall(ctx, 'right', () => {
      for (const [a, b] of [[4.3, 6.7], [7.3, 9.7]]) {
        ctx.lineWidth = 0.05;
        windowView(ctx, a, b, sky, now);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(a - 0.08, 38, b - a + 0.16, 4);
        ctx.fillRect(a - 0.08, 100, b - a + 0.16, 4);
        ctx.fillRect(a - 0.08, 38, 0.08, 66);
        ctx.fillRect(b, 38, 0.08, 66);
        ctx.fillRect((a + b) / 2 - 0.04, 42, 0.08, 58);
      }
      // a small framed picture
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(10.25, 58, 0.55, 30);
      ctx.fillStyle = '#F4A261'; ctx.fillRect(10.32, 62, 0.41, 22);
      ctx.fillStyle = '#2A9D8F'; ctx.beginPath(); ctx.moveTo(10.32, 62); ctx.lineTo(10.52, 76); ctx.lineTo(10.73, 62); ctx.fill();
      // a chalkboard menu over the coffee machine
      ctx.fillStyle = '#B98B5E'; ctx.fillRect(12.75, 62, 1.5, 40);
      ctx.fillStyle = '#2F4F46'; ctx.fillRect(12.82, 65, 1.36, 34);
      ctx.fillStyle = 'rgba(255,255,255,.75)';          // chalk lines (a stroke here would be a hairline: v is in pixels)
      for (const [v, len] of [[92, 0.9], [85, 0.7], [79, 1.0], [73, 0.6]]) ctx.fillRect(12.98, v, len, 1.5);
      ctx.fillStyle = '#F6BD60'; ctx.beginPath(); ctx.ellipse(13.95, 75, 0.1, 4, 0, 0, Math.PI * 2); ctx.fill();
    });

    onWall(ctx, 'left', () => {
      // the door the agents come in through
      ctx.fillStyle = '#B98B5E'; ctx.fillRect(9.55, 0, 0.9, 82);
      ctx.fillStyle = '#A57A4F'; ctx.fillRect(9.62, 6, 0.76, 34); ctx.fillRect(9.62, 44, 0.76, 32);
      ctx.fillStyle = '#F2C14E'; ctx.beginPath(); ctx.ellipse(10.3, 40, 0.06, 3, 0, 0, Math.PI * 2); ctx.fill();
      // the whiteboard keeps score: a bar each for working, waiting for you and asleep, one step per person.
      // Along this wall u grows towards the viewer, i.e. to the left on screen, so the bars start at the high end.
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(6.4, 34, 2.4, 52);
      ctx.fillStyle = '#9CA3AF'; ctx.fillRect(6.4, 30, 2.4, 4);
      [[counts.working, '#2A9D8F', 72], [counts.waiting, '#E76F51', 59], [counts.sleeping, '#60A5FA', 46]].forEach(([n, col, v]) => {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.ellipse(8.58, v + 2.5, 0.07, 3, 0, 0, Math.PI * 2); ctx.fill();
        const len = n ? Math.min(1.85, n * 0.3) : 0.15;
        if (!n) ctx.fillStyle = '#E5E7EB';
        ctx.fillRect(8.4 - len, n ? v : v + 2, len, n ? 5 : 1.5);
      });
      // a corkboard of sticky notes by the whiteboard
      ctx.fillStyle = '#B98B5E'; ctx.fillRect(5.15, 46, 1.0, 36);
      ctx.fillStyle = '#D9A86C'; ctx.fillRect(5.2, 49, 0.9, 30);
      for (const [u, v, col] of [[5.28, 66, '#FDE68A'], [5.62, 69, '#BFDBFE'], [5.4, 54, '#FBCFE8'], [5.75, 57, '#BBF7D0']]) {
        ctx.fillStyle = col; ctx.fillRect(u, v, 0.26, 9);
      }
      // a framed poster past the door
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(11.0, 50, 0.8, 40);
      ctx.fillStyle = '#E9C46A'; ctx.fillRect(11.07, 54, 0.66, 32);
      ctx.fillStyle = '#E76F51'; ctx.beginPath(); ctx.ellipse(11.4, 74, 0.18, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#264653'; ctx.fillRect(11.07, 54, 0.66, 8);
      // the wall clock shows the real time
      const cx = 1.9, cy = 86;
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(cx, cy, 0.5, 16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = INK; ctx.lineWidth = 0.05; ctx.stroke();
      const d = new Date(now);
      const hand = (frac, len, width) => {
        const a = frac * Math.PI * 2;
        ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(a) * len * 0.031, cy + Math.cos(a) * len); ctx.stroke();
      };
      hand((d.getHours() % 12 + d.getMinutes() / 60) / 12, 8, 0.06);
      hand(d.getMinutes() / 60, 12, 0.04);
    });
  }

  // ---- furniture
  const GLOW = { tool: 'rgba(125, 211, 252, .9)', thinking: 'rgba(252, 211, 77, .9)' };

  // the little things on a desk top (z = 26), each standing at (x, y): front-left and front-right
  const TOP = 26;
  const DESK_ITEM = {
    mug(ctx, x, y) { box(ctx, x, y, 0.18, 0.18, 9, shade('#6B4226', '#F1F5F9', '#D1D5DB'), TOP); },
    plant(ctx, x, y) {
      box(ctx, x, y, 0.2, 0.2, 7, shade('#C2410C', '#E07A4F', '#C2643D'), TOP);
      const [px, py] = P(x + 0.1, y + 0.1, TOP + 10);
      ctx.fillStyle = '#6BAA75'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      for (const [dx, dy] of [[-3, 0], [3, 0], [0, -4]]) { ctx.beginPath(); ctx.arc(px + dx, py + dy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    },
    books(ctx, x, y) {
      ['#E76F51', '#2A9D8F', '#E9C46A'].forEach((col, k) => box(ctx, x - k * 0.02, y + k * 0.02, 0.32, 0.22, 3, shade(col, col, col), TOP + k * 3));
    },
    pens(ctx, x, y) {
      ctx.lineWidth = 2; ctx.lineCap = 'round';
      [['#E76F51', -2], ['#2563EB', 1], ['#16A34A', 3]].forEach(([col, dx]) => {
        const [px, py] = P(x + 0.07, y + 0.07, TOP + 8);
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(px + dx, py); ctx.lineTo(px + dx * 1.6, py - 8); ctx.stroke();
      });
      box(ctx, x, y, 0.14, 0.14, 9, shade('#334155', '#475569', '#334155'), TOP);
    },
    duck(ctx, x, y) {
      const [px, py] = P(x + 0.1, y + 0.1, TOP);
      ctx.fillStyle = '#FACC15'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(px, py - 4, 6, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(px - 3, py - 10, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#F97316'; ctx.fillRect(px - 8, py - 10, 3, 2);
    },
    donut(ctx, x, y) {
      const [px, py] = P(x + 0.1, y + 0.1, TOP);
      ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.ellipse(px, py - 1, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#F9A8D4'; ctx.beginPath(); ctx.ellipse(px, py - 3, 5.5, 3, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#DDB98F'; ctx.beginPath(); ctx.ellipse(px, py - 3, 1.8, 1, 0, 0, Math.PI * 2); ctx.fill();
    },
    cactus(ctx, x, y) {
      box(ctx, x, y, 0.16, 0.16, 6, shade('#E9C46A', '#D9A84E', '#C2923E'), TOP);
      const [px, py] = P(x + 0.08, y + 0.08, TOP + 6);
      ctx.fillStyle = '#4D9A5B'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      rrect(ctx, px - 3, py - 13, 6, 13, 3); ctx.fill(); ctx.stroke();
      rrect(ctx, px + 2, py - 9, 4, 5, 2); ctx.fill(); ctx.stroke();
    },
    notes(ctx, x, y) {
      box(ctx, x, y, 0.2, 0.2, 3, shade('#FDE68A', '#FCD34D', '#F59E0B'), TOP);
      box(ctx, x + 0.25, y - 0.02, 0.2, 0.2, 2, shade('#BFDBFE', '#93C5FD', '#60A5FA'), TOP);
    },
  };
  const LEFT_ITEMS = ['mug', 'plant', 'books', 'pens'];
  const RIGHT_ITEMS = ['duck', 'donut', 'cactus', 'notes'];

  // what stands on desk number i: the left thing cycles desk by desk, the right one every second desk,
  // so no two desks of the nine but the first and the last are alike
  function deskItems(i) {
    return [LEFT_ITEMS[i % LEFT_ITEMS.length], RIGHT_ITEMS[Math.floor(i / 2) % RIGHT_ITEMS.length]];
  }

  // the whiteboard's numbers: who is working, who waits for you, who sleeps
  function tally(people) {
    const n = { working: 0, waiting: 0, sleeping: 0 };
    for (const c of people) {
      if (c.state === 'tool' || c.state === 'thinking') n.working++;
      else if (c.state === 'waiting') n.waiting++;
      else if (c.state === 'sleeping') n.sleeping++;
    }
    return n;
  }

  // ---- working at a desk
  const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'WebFetch', 'WebSearch', 'NotebookRead', 'LS']);
  const SEAT_FORWARD = 0.25;                           // a seated person pulls up to the desk, this far into the cell

  // what someone seated does with their hands: 'type', 'read' (tools that look things up), 'think', or null
  function workPose(c) {
    if (c.pose !== 'sit') return null;
    if (c.state === 'thinking') return 'think';
    if (c.state !== 'tool') return null;
    return READ_TOOLS.has(String(c.activity || '').split('：')[0]) ? 'read' : 'type';
  }

  // a sleeve from the shoulder to a hand
  function reach(ctx, look, skin, sx, sy, hx, hy) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = look.main; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.fillStyle = skin; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(hx, hy, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // where a seated person's shoulders are on screen (see character(): seated, the body is 12 px up)
  function shoulders(c) {
    const [X, Y0] = P(c.x + 0.5, c.y + 0.5 + SEAT_FORWARD);
    return [[X - 8, Y0 - 12 - 20], [X + 8, Y0 - 12 - 20]];
  }

  // both hands on the laptop's keys, taking turns to tap
  function typingArms(ctx, c, lx, ly) {
    const look = KINDS[c.kind] || KINDS.claude;
    const { skin } = lookOf(c.id);
    shoulders(c).forEach(([sx, sy], k) => {
      const lift = Math.sin(c.phase * 20 + k * Math.PI) > 0 ? 3 : 0;
      const [hx, hy] = P(lx + 0.2 + k * 0.24, ly + 0.2, TOP + 9 + lift);   // just showing over the lid
      reach(ctx, look, skin, sx, sy, hx, hy);
    });
  }

  // little lines of code float up off the screen while someone types, drifting off to the right,
  // clear of the typist's face
  function codeBits(ctx, c, lx, ly, now) {
    const colors = ['#7DD3FC', '#FCD34D', '#86EFAC'];
    const offset = (hash(c.id) % 10) / 10;
    for (let i = 0; i < 3; i++) {
      const p = (now / 1400 + i / 3 + offset) % 1;
      const [bx, by] = P(lx + 0.64, ly + 0.47, TOP + 14 + p * 16);
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = colors[i];
      rrect(ctx, bx + 2 + p * 14, by, 7 + (i % 2) * 5, 3, 1.5); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // a sheet held up over the laptop to read, turning now and then
  function readingSheet(ctx, c, lx, ly, now) {
    const look = KINDS[c.kind] || KINDS.claude;
    const { skin } = lookOf(c.id);
    const [px, py] = P(lx + 0.3, ly + 0.15, TOP + 20);   // at chest height, under the face
    const sway = Math.sin(c.phase * 1.4) * 0.06;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(-0.1 + sway);
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    rrect(ctx, -10, -13, 20, 24, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#94A3B8';
    for (let k = 0; k < 5; k++) ctx.fillRect(-6, -8 + k * 4, k % 2 ? 9 : 12, 1.5);
    ctx.restore();
    const [[lsx, lsy], [rsx, rsy]] = shoulders(c);
    reach(ctx, look, skin, lsx, lsy, px - 10, py + 9);
    reach(ctx, look, skin, rsx, rsy, px + 10, py + 7);
  }

  const FURNITURE_DRAW = {
    // `worker` is whoever sits at this desk (working or dozing), or null. The laptop stands right in front of
    // them, its screen turned to them and its low lid to us, so it never hides their face; their arms are
    // drawn here, between the laptop's base and its lid, because the desk would cover them otherwise.
    desk(ctx, f, worker, now) {
      const [[c, r]] = f.cells;
      const i = World.DESKS.findIndex((d) => d.x === c && d.y === r);
      box(ctx, c + 0.06, r + 0.12, 1.88, 0.76, 26, shade('#DDB98F', '#C29466', '#AD8053'));
      // a drawer on the front, with a knob
      poly(ctx, [P(c + 1.3, r + 0.88, 6), P(c + 1.86, r + 0.88, 6), P(c + 1.86, r + 0.88, 20), P(c + 1.3, r + 0.88, 20)], '#B98A5C', INK, 1);
      const [kx, ky] = P(c + 1.58, r + 0.88, 13);
      ctx.fillStyle = '#F2C14E'; ctx.beginPath(); ctx.arc(kx, ky, 1.6, 0, Math.PI * 2); ctx.fill();
      const pose = worker ? workPose(worker) : null;
      const lit = worker && worker.pose === 'sit' ? GLOW[worker.state] : null;
      // the laptop's back-left corner on the desk top. The person is drawn facing straight down the screen,
      // which on this grid is +x and +y alike, so the laptop sits diagonally in front of the seat, not at +y only.
      const lx = c + 0.88, ly = r + 0.24;
      box(ctx, lx, ly, 0.64, 0.42, 2, shade('#E2E8F0', '#94A3B8', '#64748B'), TOP);
      if (pose === 'type') typingArms(ctx, worker, lx, ly);
      // the lid, leaning back from the base's front edge, a logo on its back
      poly(ctx, [P(lx, ly + 0.42, TOP + 2), P(lx + 0.64, ly + 0.42, TOP + 2), P(lx + 0.64, ly + 0.47, TOP + 13), P(lx, ly + 0.47, TOP + 13)], '#A3B1C2', INK, 1.5);
      const [gx, gy] = P(lx + 0.32, ly + 0.45, TOP + 7);
      ctx.fillStyle = lit || '#CBD5E1'; ctx.beginPath(); ctx.arc(gx, gy, 2.6, 0, Math.PI * 2); ctx.fill();
      if (lit) {                                       // the screen's light spills over the lid
        const [x1, y1] = P(lx + 0.03, ly + 0.47, TOP + 14), [x2, y2] = P(lx + 0.61, ly + 0.47, TOP + 14);
        ctx.strokeStyle = lit; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      if (pose === 'type') codeBits(ctx, worker, lx, ly, now);
      if (pose === 'read') readingSheet(ctx, worker, lx, ly, now);
      const [left, right] = deskItems(i);
      DESK_ITEM[left](ctx, c + 0.25, r + 0.45);
      DESK_ITEM[right](ctx, c + 1.62, r + 0.55);
    },
    rack(ctx, f, _, now, robot) {
      box(ctx, 0.08, 3.08, 0.84, 1.84, 96, shade('#475569', '#334155', '#1E293B'));
      const colors = { generating: '#22C55E', reading: '#38BDF8', queued: '#F59E0B', idle: '#2DD4BF', offline: '#475569' };
      const on = colors[robot.state] || colors.idle;
      const speed = robot.state === 'generating' ? 8 : robot.state === 'reading' ? 5 : 1.5;
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          const lit = robot.state !== 'offline' && Math.sin(now / 1000 * speed + i * 1.7 + j * 2.3) > -0.2;
          const [x, y] = P(0.92, 3.3 + j * 0.55, 86 - i * 13);
          ctx.fillStyle = lit ? on : '#1E293B';
          ctx.fillRect(x - 2, y - 1.5, 4, 3);
        }
      }
    },
    bookshelf(ctx, f) {
      box(ctx, 2.05, 0.05, 1.9, 0.5, 84, shade('#B98B5E', '#A57A4F', '#8F6843'));
      const colors = ['#E76F51', '#2A9D8F', '#E9C46A', '#264653', '#F4A261', '#8AB17D'];
      for (let shelf = 0; shelf < 3; shelf++) {
        for (let i = 0; i < 7; i++) {
          const x = 2.15 + i * 0.25;
          const h = 16 + ((i * 7 + shelf * 3) % 6);
          box(ctx, x, 0.5, 0.18, 0.04, h, shade(colors[(i + shelf) % 6], colors[(i + shelf) % 6], colors[(i + shelf) % 6]), 6 + shelf * 26);
        }
      }
    },
    coffee(ctx, f, _, now, robot, counts) {
      box(ctx, 13.05, 0.08, 0.9, 0.8, 34, shade('#E5E7EB', '#CBD5E1', '#94A3B8'));
      box(ctx, 13.2, 0.15, 0.6, 0.45, 30, shade('#E76F51', '#D4583B', '#B9472D'), 34);
      box(ctx, 13.62, 0.62, 0.14, 0.14, 8, shade('#FFFFFF', '#F1F5F9', '#E2E8F0'), 34);
      if (counts.waiting) {                            // someone is waiting for you: a fresh cup steams
        const [sx, sy] = P(13.69, 0.69, 44);
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5;
        for (let k = 0; k < 2; k++) {
          const p = ((now / 1600) + k * 0.5) % 1;
          ctx.globalAlpha = 1 - p;
          ctx.beginPath(); ctx.moveTo(sx - 2 + k * 4, sy - p * 14);
          ctx.quadraticCurveTo(sx + 2 + k * 4, sy - 5 - p * 14, sx - 2 + k * 4, sy - 10 - p * 14); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    },
    cooler(ctx) {
      box(ctx, 15.15, 0.15, 0.7, 0.7, 50, shade('#F8FAFC', '#E2E8F0', '#CBD5E1'));
      const [x, y] = P(15.5, 0.5, 66);
      ctx.fillStyle = 'rgba(125, 211, 252, .85)';
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      rrect(ctx, x - 13, y - 22, 26, 30, 9); ctx.fill(); ctx.stroke();
    },
    table(ctx) {
      box(ctx, 14.42, 4.42, 0.16, 0.16, 34, shade('#94A3B8', '#64748B', '#475569'));
      const [x, y] = P(14.5, 4.5, 36);
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(x, y, 26, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    },
    plant(ctx, f) {
      const [[c, r]] = f.cells;
      box(ctx, c + 0.3, r + 0.3, 0.4, 0.4, 18, shade('#E9C46A', '#D9A84E', '#C2923E'));
      const [x, y] = P(c + 0.5, r + 0.5, 30);
      for (const [dx, dy, rr] of [[0, -14, 13], [-10, -4, 11], [10, -4, 11], [0, 2, 10]]) {
        ctx.fillStyle = '#6BAA75'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x + dx, y + dy, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    },
    sofa(ctx) {
      box(ctx, 12.08, 11.1, 1.84, 0.8, 16, shade('#F4A261', '#E08E4C', '#C97A3B'));
      box(ctx, 12.08, 11.62, 1.84, 0.28, 18, shade('#F4A261', '#E08E4C', '#C97A3B'), 16);
      box(ctx, 12.08, 11.1, 0.22, 0.8, 12, shade('#F4A261', '#E08E4C', '#C97A3B'), 16);
      box(ctx, 13.7, 11.1, 0.22, 0.8, 12, shade('#F4A261', '#E08E4C', '#C97A3B'), 16);
    },
  };

  // an office chair drawn facing the viewer, the way the people are: a backrest centred behind where the body
  // goes, a seat under it, one post on a round base. Pulled up to the desk like whoever sits on it.
  function chair(ctx, seat) {
    const [X, Y0] = P(seat.x + 0.5, seat.y + 0.5 + SEAT_FORWARD);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.fillStyle = '#64748B';
    rrect(ctx, X - 2, Y0 - 16, 4, 13, 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(X, Y0 - 3, 11, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5B6B82';                         // blue-grey: neither Claude's orange nor Strata's teal
    rrect(ctx, X - 14, Y0 - 54, 28, 36, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8A9AB0';
    ctx.beginPath(); ctx.ellipse(X, Y0 - 18, 14, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  function beanbag(ctx, p, i) {
    const [x, y] = P(p.x + 0.5, p.y + 0.5);
    ctx.fillStyle = ['#F2B5D4', '#BDE0FE', '#FFD6A5', '#CAFFBF', '#E4C1F9', '#FDFFB6'][i % 6];
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y - 6, 22, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // ---- people
  function character(ctx, c, now) {
    const walking = c.pose === 'walk';
    const dozing = c.pose === 'doze';                 // asleep over its desk
    const seated = c.pose === 'sit' || dozing;
    const [X, Y0] = P(c.x + 0.5, c.y + 0.5 + (seated ? SEAT_FORWARD : 0));
    const look = KINDS[c.kind] || KINDS.claude;
    const { skin, hair, hairStyle, glasses } = lookOf(c.id);
    const work = workPose(c);
    const t = c.phase;
    const napping = c.pose === 'nap';
    const asleep = napping || dozing;
    const bob = walking ? Math.abs(Math.sin(t * 9)) * 2.5 : asleep ? Math.sin(t * 1.5) * 1 : 0;
    const Y = Y0 - bob - (seated ? 12 : napping ? 6 : 0);
    const front = !c.back;
    const side = c.left ? -1 : 1;

    // shadow
    ctx.fillStyle = 'rgba(74, 59, 53, .18)';
    ctx.beginPath(); ctx.ellipse(X, Y0, 15, 7, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    if (napping) { ctx.translate(X, Y); ctx.rotate(-0.25 * side); ctx.translate(-X, -Y); }
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    // legs: seated, the thighs rest on the seat (the desk hides the rest, but not everywhere); swinging when walking
    if (seated) {
      ctx.fillStyle = '#475569';
      for (const dx of [-5, 5]) { rrect(ctx, X + dx - 3.5, Y - 11, 7, 9, 3); ctx.fill(); ctx.stroke(); }
    } else {
      const swing = walking ? Math.sin(t * 9) * 3.5 : 0;
      for (const [dx, s] of [[-5, swing], [5, -swing]]) {
        ctx.fillStyle = '#475569';
        rrect(ctx, X + dx - 3, Y - 10 + s * 0.4, 6, 10 - s * 0.3, 3); ctx.fill(); ctx.stroke();
      }
    }
    // body
    ctx.fillStyle = look.main;
    rrect(ctx, X - 11, Y - 28, 22, 20, 8); ctx.fill(); ctx.stroke();
    // arms: a hand on the chin when thinking, a mug while waiting, swinging when walking.
    // Typing and reading arms reach over the desk, so the desk draws those (see typingArms, readingSheet).
    const arm = (ax, ay) => { ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(ax, ay, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
    if (dozing) {                                      // arms folded on the desk as a pillow
      arm(X - 8, Y - 13);
      arm(X + 8, Y - 13);
    } else if (work === 'type' || work === 'read') {
      // drawn by the desk
    } else if (work === 'think') {
      arm(X - 9, Y - 13);
      arm(X + 5 * side, Y - 32);
    } else if (c.state === 'waiting' && !walking && front) {
      arm(X - 12, Y - 15);
      ctx.fillStyle = '#FFFFFF'; rrect(ctx, X + 8, Y - 22, 8, 9, 2); ctx.fill(); ctx.stroke();
      arm(X + 10, Y - 15);
    } else {
      const s = walking ? Math.sin(t * 9) * 3 : 0;
      arm(X - 13, Y - 15 + s);
      arm(X + 13, Y - 15 - s);
    }

    // head: dozing, it hangs low and tilts towards the desk
    // typing, the head nods along a little
    const HX = X, HY = Y - (dozing ? 34 : 42) + (work === 'type' && Math.sin(t * 10) > 0.5 ? 1 : 0);
    ctx.save();
    if (dozing) { ctx.translate(HX, HY); ctx.rotate(0.35 * side); ctx.translate(-HX, -HY); }
    if (c.kind === 'claude') {                         // the hood behind the head
      ctx.fillStyle = look.main;
      ctx.beginPath(); ctx.arc(HX, HY + 2, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // hair that shows behind the head: long hair down to the shoulders, or a bun on top
    ctx.fillStyle = hair;
    if (hairStyle === 'long') { rrect(ctx, HX - 15, HY - 10, 30, 26, 12); ctx.fill(); ctx.stroke(); }
    if (hairStyle === 'bun') { ctx.beginPath(); ctx.arc(HX, HY - 15, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = front ? skin : hair;
    ctx.beginPath(); ctx.arc(HX, HY, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (front) {
      // fringe: straight across, or swept to one side
      ctx.fillStyle = hair;
      ctx.beginPath(); ctx.arc(HX, HY - 2, 14, Math.PI * 1.08, Math.PI * 1.92);
      if (hairStyle === 'side') ctx.quadraticCurveTo(HX - 2, HY - 3, HX - 13.6, HY + 1);
      else ctx.quadraticCurveTo(HX, HY - 6, HX - 13.4, HY - 6);
      ctx.fill();
      // face
      const ex = side * 2;
      const blink = (t % 4) < 0.13 || asleep;
      ctx.fillStyle = INK;
      for (const dx of [-5, 5]) {
        if (blink) { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(HX + dx + ex, HY + 1, 2.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(HX + dx + ex, HY + 1, 2.2, 0, Math.PI * 2); ctx.fill(); }
      }
      if (glasses) {
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        for (const dx of [-5, 5]) { ctx.moveTo(HX + dx + ex + 3.8, HY + 1); ctx.arc(HX + dx + ex, HY + 1, 3.8, 0, Math.PI * 2); }
        ctx.moveTo(HX + ex - 1.2, HY + 1); ctx.lineTo(HX + ex + 1.2, HY + 1);
        ctx.stroke();
      }
      ctx.fillStyle = BLUSH;
      for (const dx of [-9, 9]) { ctx.beginPath(); ctx.arc(HX + dx + ex, HY + 6, 2.6, 0, Math.PI * 2); ctx.fill(); }
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (c.state === 'waiting') ctx.arc(HX + ex, HY + 6, 2.2, 0, Math.PI * 2);   // a little "oh"
      else ctx.arc(HX + ex, HY + 5, 3, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ctx.lineWidth = 2;
    if (c.kind === 'claude') {                         // the star clip
      const sx = HX + 9 * side, sy = HY - 12;
      ctx.fillStyle = '#F6BD60';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const r = i % 2 ? 2.2 : 6;
        ctx.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    } else {                                           // the three-layer hat
      const stripes = ['#0F766E', '#14B8A6', '#5EEAD4'];
      stripes.forEach((col, i) => {
        ctx.fillStyle = col;
        rrect(ctx, HX - 13 + i * 2, HY - 15 - i * 6, 26 - i * 4, 7, 3.5); ctx.fill(); ctx.stroke();
      });
    }
    ctx.restore();                                     // the head's tilt
    ctx.restore();

    if (asleep) {                                      // Zzz floating up
      ctx.fillStyle = '#6B7280';
      ctx.font = 'bold 11px "Segoe UI", sans-serif';
      for (let i = 0; i < 3; i++) {
        const k = ((now / 1000 + i * 0.7) % 2.1) / 2.1;
        ctx.globalAlpha = 1 - k;
        ctx.fillText('z', X + 14 + k * 10 + i * 3, Y - 50 - k * 18 - i * 4);
      }
      ctx.globalAlpha = 1;
    }
    if (seated && c.state === 'thinking') {            // thought dots
      ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = INK; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        if (Math.floor(now / 400) % 4 < i) continue;
        ctx.beginPath(); ctx.arc(X + 16 + i * 6, Y - 58 - i * 6, 2 + i, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }
    c.screen = { x: X, y: Y - 60, footY: Y0 };
  }

  function robot(ctx, r, now) {
    const [X, Y0] = P(World.ROBOT.x + 0.5, World.ROBOT.y + 0.5);
    const busy = r.state === 'generating' || r.state === 'reading';
    const Y = Y0 - (r.state === 'generating' ? Math.abs(Math.sin(now / 120)) * 2 : 0);
    ctx.fillStyle = 'rgba(74, 59, 53, .18)';
    ctx.beginPath(); ctx.ellipse(X, Y0, 17, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // wheels and body
    ctx.fillStyle = '#64748B';
    rrect(ctx, X - 14, Y - 8, 28, 8, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#94A3B8';
    rrect(ctx, X - 16, Y - 34, 32, 28, 9); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#CBD5E1';
    rrect(ctx, X - 8, Y - 26, 16, 10, 3); ctx.fill(); ctx.stroke();
    // head with a screen face
    ctx.fillStyle = '#94A3B8';
    rrect(ctx, X - 18, Y - 62, 36, 28, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = r.state === 'offline' ? '#334155' : '#1E293B';
    rrect(ctx, X - 13, Y - 57, 26, 18, 6); ctx.fill();
    if (r.state !== 'offline') {
      ctx.fillStyle = '#2DD4BF'; ctx.strokeStyle = '#2DD4BF';
      if (r.state === 'generating') {                  // happy ^ ^ eyes
        ctx.lineWidth = 2;
        for (const dx of [-5, 5]) { ctx.beginPath(); ctx.moveTo(X + dx - 3, Y - 46); ctx.lineTo(X + dx, Y - 50); ctx.lineTo(X + dx + 3, Y - 46); ctx.stroke(); }
      } else {
        const scan = r.state === 'reading' ? Math.sin(now / 300) * 3 : 0;
        const blink = (now / 1000) % 3.5 < 0.15;
        for (const dx of [-5, 5]) {
          ctx.beginPath();
          if (blink) ctx.fillRect(X + dx + scan - 3, Y - 48, 6, 1.5);
          else ctx.arc(X + dx + scan, Y - 48, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // antenna, its ball shows the state
    ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X, Y - 62); ctx.lineTo(X, Y - 72); ctx.stroke();
    const ball = { generating: '#22C55E', reading: '#38BDF8', queued: '#F59E0B', idle: '#2DD4BF', offline: '#94A3B8' }[r.state] || '#2DD4BF';
    const pulse = busy || r.state === 'queued' ? (Math.sin(now / 150) > 0 ? 1 : 0.4) : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = ball;
    ctx.beginPath(); ctx.arc(X, Y - 75, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    // its bubble sits on top of the rack, up on the wall, clear of the desks' bubbles
    const [, rackTop] = P(0.5, 4, 100);
    r.screen = { x: X, y: Math.min(Y - 82, rackTop), footY: Y0 };
  }

  // ---- labels on top of everything
  function cut(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }

  // a speech bubble over a head: who it is (small, in their colour) and what they are doing.
  // The name lives in the bubble, not at the feet, where the next desk's bubble would cover it.
  function bubble(ctx, x, y, name, color, text, selected) {
    const NAME_FONT = 'bold 10px "Segoe UI", "Microsoft JhengHei", sans-serif';
    const TEXT_FONT = '12px "Segoe UI", "Microsoft JhengHei", sans-serif';
    ctx.font = NAME_FONT;
    const nw = ctx.measureText(name).width;
    ctx.font = TEXT_FONT;
    const w = Math.min(190, Math.max(nw, ctx.measureText(text).width) + 18);
    const h = 36;
    const bx = Math.max(4, Math.min(SCENE_W - w - 4, x - w / 2));
    const by = y - h - 6;
    // the one whose card is open gets a gold outline: a seated person's floor ring is behind the desk
    ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = selected ? '#E9A23B' : INK; ctx.lineWidth = selected ? 3 : 1.5;
    rrect(ctx, bx, by, w, h, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5, by + h - 0.5); ctx.lineTo(x, by + h + 6); ctx.lineTo(x + 5, by + h - 0.5); ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5, by + h); ctx.lineTo(x, by + h + 6); ctx.lineTo(x + 5, by + h); ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.font = NAME_FONT; ctx.fillStyle = color;
    ctx.fillText(name, bx + 9, by + 11, w - 18);
    ctx.font = TEXT_FONT; ctx.fillStyle = INK;
    ctx.fillText(text, bx + 9, by + 25, w - 18);
  }

  // a soft ring on the floor under whoever's card is open
  function ring(ctx, X, Y, now) {
    const pulse = 1 + Math.sin(now / 250) * 0.08;
    ctx.strokeStyle = '#F6BD60'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(X, Y, 22 * pulse, 11 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
  }

  // ---- the whole scene, back to front; `selected` is the id whose card is open, or 'robot'
  function draw(ctx, office, now, selected) {
    ctx.clearRect(0, 0, SCENE_W, SCENE_H);
    const people = office.characters();
    const counts = tally(people);
    floor(ctx);
    walls(ctx, now, counts);
    // who sits at which seat: the desk in front of it draws their laptop and hands
    const seated = new Map(people.filter((c) => c.pose === 'sit' || c.pose === 'doze').map((c) => [`${c.x},${c.y}`, c]));
    const items = [];
    // depth = x + y of the thing's centre: larger is nearer the viewer
    for (const f of World.FURNITURE) {
      const cx = f.cells.reduce((s, [x]) => s + x, 0) / f.cells.length + 0.5;
      const cy = f.cells.reduce((s, [, y]) => s + y, 0) / f.cells.length + 0.5;
      const worker = f.kind === 'desk' ? seated.get(`${f.cells[0][0]},${f.cells[0][1] - 1}`) || null : null;
      items.push({ depth: cx + cy, draw: () => FURNITURE_DRAW[f.kind](ctx, f, worker, now, office.robot, counts) });
    }
    for (const d of World.DESKS) items.push({ depth: d.seat.x + d.seat.y + 0.8, draw: () => chair(ctx, d.seat) });
    World.NAP_SPOTS.forEach((p, i) => items.push({ depth: p.x + p.y + 0.8, draw: () => beanbag(ctx, p, i) }));
    for (const c of people) {
      items.push({ depth: c.x + c.y + 1, draw: () => {
        if (c.id === selected) ring(ctx, ...P(c.x + 0.5, c.y + 0.5), now);
        character(ctx, c, now);
      } });
    }
    items.push({ depth: World.ROBOT.x + World.ROBOT.y + 1, draw: () => {
      if (selected === 'robot') ring(ctx, ...P(World.ROBOT.x + 0.5, World.ROBOT.y + 0.5), now);
      robot(ctx, office.robot, now);
    } });
    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // bubbles last, farther ones first, so a nearer bubble overlaps a farther one and not the other way
    for (const c of [...people].sort((a, b) => a.x + a.y - (b.x + b.y))) {
      if (!c.screen) continue;
      bubble(ctx, c.screen.x, c.screen.y, cut(root.Panel.nameOf(c), 20), (KINDS[c.kind] || KINDS.claude).dark,
        `${ICON[c.state] || ''} ${cut(c.activity || '', 16)}`.trim(), c.id === selected);
    }
    const r = office.robot;
    bubble(ctx, r.screen.x, r.screen.y, 'Strata 伺服器', '#475569',
      `${ROBOT_ICON[r.state] || ''} ${r.activity}${r.gpuTemp != null ? ` · ${r.gpuTemp}°C` : ''}`, selected === 'robot');
  }

  // who is under a point of the scene (for clicks): the nearest person whose body covers it, or the robot
  function hit(office, x, y) {
    let best = null;
    for (const c of [...office.characters(), office.robot]) {
      if (!c.screen) continue;
      if (Math.abs(x - c.screen.x) < 20 && y > c.screen.y && y < c.screen.footY + 4) {
        if (!best || c.screen.footY > best.screen.footY) best = c;
      }
    }
    return best;
  }

  root.Draw = { draw, hit, skyAt, tally, deskItems, lookOf, workPose, SCENE_W, SCENE_H };
})(typeof window !== 'undefined' ? window : globalThis);
