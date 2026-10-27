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
  const SKIN = '#FFE0C2';
  const BLUSH = '#F7B7A3';
  const HAIR = ['#5B3A29', '#2F2A28', '#D9A55B', '#8B5A3C', '#C9746B', '#6B4F7A'];
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

  // ---- the room
  function floor(ctx) {
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        const rug = x >= 12 && y >= 6 && y <= 10;
        const wood = (x + y) % 2 ? '#EAD7BA' : '#E4CEAD';
        poly(ctx, [P(x, y), P(x + 1, y), P(x + 1, y + 1), P(x, y + 1)], rug ? ((x + y) % 2 ? '#D3EBDD' : '#CAE5D4') : wood, 'rgba(150,110,70,.18)', 1);
      }
    }
    poly(ctx, [P(0, 0), P(W, 0), P(W, H), P(0, H)], null, INK, 2);
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

  function walls(ctx, now) {
    poly(ctx, [P(0, 0), P(0, H), P(0, H, WALL), P(0, 0, WALL)], '#F3E1CB');
    poly(ctx, [P(0, 0), P(W, 0), P(W, 0, WALL), P(0, 0, WALL)], '#FBEEDC');
    poly(ctx, [P(0, 0), P(0, H), P(0, H, 8), P(0, 0, 8)], '#D9BFA0', INK, 1);
    poly(ctx, [P(0, 0), P(W, 0), P(W, 0, 8), P(0, 0, 8)], '#E3CBAD', INK, 1);
    ctx.lineJoin = 'round';

    // two windows with sky and a cloud on the back-right wall
    onWall(ctx, 'right', () => {
      for (const [a, b] of [[4.3, 6.7], [7.3, 9.7]]) {
        ctx.lineWidth = 0.05;
        ctx.fillStyle = '#BFE3F5';
        ctx.fillRect(a, 42, b - a, 58);
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.ellipse(a + 0.7, 80, 0.35, 7, 0, 0, Math.PI * 2); ctx.ellipse(a + 1.0, 83, 0.3, 6, 0, 0, Math.PI * 2); ctx.fill();
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
    });

    onWall(ctx, 'left', () => {
      // the door the agents come in through
      ctx.fillStyle = '#B98B5E'; ctx.fillRect(9.55, 0, 0.9, 82);
      ctx.fillStyle = '#A57A4F'; ctx.fillRect(9.62, 6, 0.76, 34); ctx.fillRect(9.62, 44, 0.76, 32);
      ctx.fillStyle = '#F2C14E'; ctx.beginPath(); ctx.ellipse(10.3, 40, 0.06, 3, 0, 0, Math.PI * 2); ctx.fill();
      // a whiteboard with someone's scribbles
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(6.4, 34, 2.4, 52);
      ctx.fillStyle = '#9CA3AF'; ctx.fillRect(6.4, 30, 2.4, 4);
      // a little chart; line width is in wall units, where 0.04 of a cell is about a pixel and a half
      ctx.strokeStyle = '#2A9D8F'; ctx.lineWidth = 0.04;
      ctx.beginPath(); ctx.moveTo(6.7, 70); ctx.lineTo(7.4, 76); ctx.lineTo(8.1, 66); ctx.lineTo(8.5, 72); ctx.stroke();
      ctx.fillStyle = '#E76F51'; ctx.fillRect(6.7, 50, 0.9, 3); ctx.fillRect(6.7, 44, 1.4, 3);
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
  const FURNITURE_DRAW = {
    desk(ctx, f, occupied) {
      const [[c, r]] = f.cells;
      box(ctx, c + 0.06, r + 0.12, 1.88, 0.76, 26, shade('#DDB98F', '#C29466', '#AD8053'));
      box(ctx, c + 0.22, r + 0.2, 0.58, 0.26, 2, shade('#F8FAFC', '#CBD5E1', '#CBD5E1'), 26);   // keyboard
      box(ctx, c + 1.42, r + 0.38, 0.16, 0.16, 8, shade('#64748B', '#475569', '#475569'), 26); // monitor stand
      box(ctx, c + 1.12, r + 0.3, 0.76, 0.1, 30, shade('#475569', '#CBD5E1', '#94A3B8'), 34);  // monitor (its back to us)
      if (occupied) {
        const [x1, y1] = P(c + 1.14, r + 0.3, 66), [x2, y2] = P(c + 1.86, r + 0.3, 66);
        ctx.strokeStyle = 'rgba(125, 211, 252, .9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
      box(ctx, c + 0.3, r + 0.5, 0.18, 0.18, 9, shade('#FFFFFF', '#E5E7EB', '#D1D5DB'), 26);    // a mug
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
    coffee(ctx) {
      box(ctx, 13.05, 0.08, 0.9, 0.8, 34, shade('#E5E7EB', '#CBD5E1', '#94A3B8'));
      box(ctx, 13.2, 0.15, 0.6, 0.45, 30, shade('#E76F51', '#D4583B', '#B9472D'), 34);
      box(ctx, 13.62, 0.62, 0.14, 0.14, 8, shade('#FFFFFF', '#F1F5F9', '#E2E8F0'), 34);
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

  function chair(ctx, seat) {
    box(ctx, seat.x + 0.25, seat.y + 0.3, 0.5, 0.45, 14, shade('#5EEAD4', '#2DD4BF', '#14B8A6'));
    box(ctx, seat.x + 0.25, seat.y + 0.15, 0.5, 0.12, 30, shade('#5EEAD4', '#2DD4BF', '#14B8A6'), 10);
  }

  function beanbag(ctx, p, i) {
    const [x, y] = P(p.x + 0.5, p.y + 0.5);
    ctx.fillStyle = ['#F2B5D4', '#BDE0FE', '#FFD6A5', '#CAFFBF', '#E4C1F9', '#FDFFB6'][i % 6];
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(x, y - 6, 22, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  // ---- people
  function character(ctx, c, now) {
    const [X, Y0] = P(c.x + 0.5, c.y + 0.5);
    const look = KINDS[c.kind] || KINDS.claude;
    const hair = HAIR[hash(c.id) % HAIR.length];
    const t = c.phase;
    const walking = c.pose === 'walk';
    const dozing = c.pose === 'doze';                 // asleep over its desk
    const seated = c.pose === 'sit' || dozing;
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

    // legs, swinging when walking
    if (!seated) {
      const swing = walking ? Math.sin(t * 9) * 3.5 : 0;
      for (const [dx, s] of [[-5, swing], [5, -swing]]) {
        ctx.fillStyle = '#475569';
        rrect(ctx, X + dx - 3, Y - 10 + s * 0.4, 6, 10 - s * 0.3, 3); ctx.fill(); ctx.stroke();
      }
    }
    // body
    ctx.fillStyle = look.main;
    rrect(ctx, X - 11, Y - 28, 22, 20, 8); ctx.fill(); ctx.stroke();
    // arms: typing, a hand on the chin when thinking, a mug while waiting, swinging when walking
    const arm = (ax, ay) => { ctx.fillStyle = SKIN; ctx.beginPath(); ctx.arc(ax, ay, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
    if (dozing) {                                      // arms folded on the desk as a pillow
      arm(X - 8, Y - 13);
      arm(X + 8, Y - 13);
    } else if (seated && c.state === 'tool') {
      arm(X - 7, Y - 12 + (Math.sin(t * 22) > 0 ? -2 : 0));
      arm(X + 7, Y - 12 + (Math.sin(t * 22) > 0 ? 0 : -2));
    } else if (seated && c.state === 'thinking') {
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
    const HX = X, HY = Y - (dozing ? 34 : 42);
    ctx.save();
    if (dozing) { ctx.translate(HX, HY); ctx.rotate(0.35 * side); ctx.translate(-HX, -HY); }
    if (c.kind === 'claude') {                         // the hood behind the head
      ctx.fillStyle = look.main;
      ctx.beginPath(); ctx.arc(HX, HY + 2, 17, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = front ? SKIN : hair;
    ctx.beginPath(); ctx.arc(HX, HY, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (front) {
      // fringe
      ctx.fillStyle = hair;
      ctx.beginPath(); ctx.arc(HX, HY - 2, 14, Math.PI * 1.08, Math.PI * 1.92); ctx.quadraticCurveTo(HX, HY - 6, HX - 13.4, HY - 6); ctx.fill();
      // face
      const ex = side * 2;
      const blink = (t % 4) < 0.13 || asleep;
      ctx.fillStyle = INK;
      for (const dx of [-5, 5]) {
        if (blink) { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(HX + dx + ex, HY + 1, 2.4, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(HX + dx + ex, HY + 1, 2.2, 0, Math.PI * 2); ctx.fill(); }
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
    floor(ctx);
    walls(ctx, now);
    const people = office.characters();
    const occupied = new Set(people.filter((c) => c.pose === 'sit').map((c) => `${c.x},${c.y}`));
    const items = [];
    // depth = x + y of the thing's centre: larger is nearer the viewer
    for (const f of World.FURNITURE) {
      const cx = f.cells.reduce((s, [x]) => s + x, 0) / f.cells.length + 0.5;
      const cy = f.cells.reduce((s, [, y]) => s + y, 0) / f.cells.length + 0.5;
      const busy = f.kind === 'desk' && occupied.has(`${f.cells[0][0]},${f.cells[0][1] - 1}`);
      items.push({ depth: cx + cy, draw: () => FURNITURE_DRAW[f.kind](ctx, f, busy, now, office.robot) });
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

  root.Draw = { draw, hit, SCENE_W, SCENE_H };
})(typeof window !== 'undefined' ? window : globalThis);
