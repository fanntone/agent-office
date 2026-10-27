'use strict';

// The office floor plan on an isometric grid: where the furniture stands, where people can walk,
// where they sit, wait and nap, and how they find their way (breadth-first search on grid cells).
// Cell (x, y): x runs down-right on screen, y runs down-left; the back walls stand along x = 0 and y = 0.
(function (root) {
  const W = 16;                 // cells along x
  const H = 12;                 // cells along y
  const TILE_W = 64;            // a cell's diamond on screen
  const TILE_H = 32;
  const WALL = 120;             // wall height in pixels

  // screen offset of a point on the floor (z lifts it up)
  function toScreen(x, y, z = 0) {
    return { sx: (x - y) * TILE_W / 2, sy: (x + y) * TILE_H / 2 - z };
  }

  // Desks are two cells wide; the person sits on the row behind (y - 1) facing the viewer,
  // the monitor stands on the right-hand cell so it never hides a face.
  const DESKS = [];
  for (const r of [3, 6, 9]) for (const c of [4, 7, 10]) DESKS.push({ x: c, y: r, seat: { x: c, y: r - 1 } });

  const FURNITURE = [
    ...DESKS.map((d) => ({ kind: 'desk', cells: [[d.x, d.y], [d.x + 1, d.y]] })),
    { kind: 'rack', cells: [[0, 3], [0, 4]] },
    { kind: 'bookshelf', cells: [[2, 0], [3, 0]] },
    { kind: 'coffee', cells: [[13, 0]] },
    { kind: 'cooler', cells: [[15, 0]] },
    { kind: 'table', cells: [[14, 4]] },
    { kind: 'plant', cells: [[0, 0]] },
    { kind: 'plant', cells: [[11, 0]] },
    { kind: 'plant', cells: [[15, 11]] },
    { kind: 'sofa', cells: [[12, 11], [13, 11]] },
  ];

  const DOOR = { x: 0, y: 10 };                       // people come in and leave here
  const ROBOT = { x: 1, y: 4 };                       // the Strata server's robot stands by its rack
  // where someone who waits for an answer hangs around: the coffee machine and the standing table
  const WAIT_SPOTS = [{ x: 13, y: 1 }, { x: 14, y: 1 }, { x: 13, y: 4 }, { x: 15, y: 4 }, { x: 14, y: 3 }, { x: 14, y: 5 },
    { x: 12, y: 2 }, { x: 15, y: 2 }];
  // beanbags in the lounge, for the ones who fell asleep
  const NAP_SPOTS = [{ x: 13, y: 7 }, { x: 15, y: 7 }, { x: 13, y: 9 }, { x: 15, y: 9 }, { x: 14, y: 10 }, { x: 12, y: 8 }];

  const key = (x, y) => `${x},${y}`;
  const BLOCKED = new Set(FURNITURE.flatMap((f) => f.cells.map(([x, y]) => key(x, y))));
  BLOCKED.add(key(ROBOT.x, ROBOT.y));

  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const walkable = (x, y) => inside(x, y) && !BLOCKED.has(key(x, y));

  // shortest path of cells from `from` to `to`, both ends included; null when there is none
  function findPath(from, to) {
    if (!walkable(to.x, to.y)) return null;
    if (from.x === to.x && from.y === to.y) return [{ x: to.x, y: to.y }];
    const prev = new Map([[key(from.x, from.y), null]]);
    const queue = [{ x: from.x, y: from.y }];
    while (queue.length) {
      const c = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = { x: c.x + dx, y: c.y + dy };
        const k = key(n.x, n.y);
        if (!walkable(n.x, n.y) || prev.has(k)) continue;
        prev.set(k, c);
        if (n.x === to.x && n.y === to.y) {
          const path = [n];
          for (let p = c; p; p = prev.get(key(p.x, p.y))) path.unshift(p);
          return path;
        }
        queue.push(n);
      }
    }
    return null;
  }

  const api = { W, H, TILE_W, TILE_H, WALL, toScreen, DESKS, FURNITURE, DOOR, ROBOT, WAIT_SPOTS, NAP_SPOTS,
    walkable, findPath };
  if (typeof module !== 'undefined') module.exports = api;
  else root.World = api;
})(typeof window !== 'undefined' ? window : globalThis);
