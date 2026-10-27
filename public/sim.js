'use strict';

// Who goes where in the office. update() takes the /api/agents answer and gives everyone a goal from what
// they are doing; step() walks them there a little each frame. Pure state: drawing is draw.js's job.
//   working (tool / thinking) -> their own desk, seated
//   waiting for an answer     -> the coffee corner, and every few seconds a stroll to another free spot
//   asleep                    -> a beanbag
//   gone from the data        -> walk out of the door, then disappear
(function (root) {
  const World = typeof module !== 'undefined' ? require('./world.js') : root.World;

  const SPEED = 2.4;                        // cells per second
  const STROLL_EVERY = [6, 12];             // seconds between strolls of someone waiting

  // Seats stay put: returning ids keep theirs, newcomers take the lowest free one, leavers free theirs.
  function assignSeats(seats, ids) {
    const next = {};
    const taken = new Set();
    for (const id of ids) if (id in seats) { next[id] = seats[id]; taken.add(seats[id]); }
    for (const id of ids) {
      if (id in next) continue;
      let n = 0;
      while (taken.has(n)) n++;
      next[id] = n;
      taken.add(n);
    }
    return next;
  }

  const same = (a, b) => a && b && a.x === b.x && a.y === b.y;
  const spotKey = (p) => `${p.x},${p.y}`;

  class Office {
    constructor({ rng = Math.random } = {}) {
      this.rng = rng;
      this.time = 0;
      this.seats = {};
      this.chars = new Map();
      this.taken = new Map();                // spot key -> id holding it
      this.robot = { state: 'offline', activity: '沒開機', gpuTemp: null };
    }

    update(data) {
      const ids = data.agents.map((a) => a.id);
      this.seats = assignSeats(this.seats, ids);
      for (const a of data.agents) {
        let c = this.chars.get(a.id);
        if (!c) {
          c = { id: a.id, x: World.DOOR.x, y: World.DOOR.y, path: [], goal: null, pose: 'stand', left: false, back: false,
            phase: this.rng() * 10, spot: null, nextStroll: 0, leaving: false };
          this.chars.set(a.id, c);
        }
        Object.assign(c, { kind: a.kind, project: a.project, model: a.model, state: a.state, activity: a.activity,
          recent: a.recent || [], lastAt: a.lastAt, leaving: false });
        this.plan(c);
        // the first look at the office finds everyone already where they belong: no parade from the door
        if (!this.opened && c.goal) {
          Object.assign(c, { x: c.goal.x, y: c.goal.y, path: [], pose: c.goal.pose });
          if (c.pose !== 'stand') c.left = true;
        }
      }
      this.opened = true;
      for (const c of this.chars.values()) {
        if (ids.includes(c.id) || c.leaving) continue;
        c.leaving = true;
        c.state = 'leaving';
        c.activity = '下班囉';
        this.release(c);
        this.goTo(c, World.DOOR, 'stand');
      }
      this.robot = { state: data.server.state, activity: data.server.activity, gpuTemp: data.server.gpuTemp };
    }

    plan(c) {
      const working = c.state === 'tool' || c.state === 'thinking';
      const nap = c.state === 'sleeping';
      const desk = World.DESKS[this.seats[c.id]];
      // at work, or dozed off over it: at its own desk. More people than desks: the rest stand around
      // with the ones waiting, or nap on a beanbag
      if ((working || nap) && desk) { this.release(c); this.goTo(c, desk.seat, nap ? 'doze' : 'sit'); return; }
      const spot = this.claim(c, nap ? World.NAP_SPOTS : World.WAIT_SPOTS);
      if (spot) this.goTo(c, spot, nap ? 'nap' : 'stand');
    }

    // a free spot from the list for c (keeping the one it holds if it is in the list); null when all are taken
    claim(c, list, avoid) {
      if (c.spot && !avoid && list.some((p) => same(p, c.spot))) return c.spot;
      const free = list.filter((p) => !this.taken.has(spotKey(p)) && !same(p, avoid));
      if (!free.length) return null;
      this.release(c);
      const p = free[Math.floor(this.rng() * free.length)];
      this.taken.set(spotKey(p), c.id);
      c.spot = p;
      c.nextStroll = this.time + STROLL_EVERY[0] + this.rng() * (STROLL_EVERY[1] - STROLL_EVERY[0]);
      return p;
    }

    release(c) {
      if (c.spot && this.taken.get(spotKey(c.spot)) === c.id) this.taken.delete(spotKey(c.spot));
      c.spot = null;
    }

    goTo(c, goal, pose) {
      if (same(c.goal, goal) && c.goal.pose === pose) return;
      const here = { x: Math.round(c.x), y: Math.round(c.y) };
      const path = World.findPath(here, goal);
      if (!path) return;                                   // nowhere to go from here: stay put
      c.goal = { x: goal.x, y: goal.y, pose };
      c.path = path.slice(1);
      c.pose = c.path.length ? 'walk' : pose;
    }

    step(dt) {
      this.time += dt;
      for (const c of [...this.chars.values()]) {
        c.phase += dt;
        if (c.path.length) {
          this.walk(c, dt);
          continue;
        }
        if (c.leaving) { this.chars.delete(c.id); continue; }
        c.pose = c.goal ? c.goal.pose : 'stand';
        if (c.pose !== 'stand') { c.left = true; c.back = false; }   // seated or napping: facing the viewer
        // someone waiting does not stand still for long
        if (c.state === 'waiting' && c.pose === 'stand' && this.time >= c.nextStroll) {
          const from = c.spot;
          const next = this.claim(c, World.WAIT_SPOTS, from);
          if (next) this.goTo(c, next, 'stand');
          else c.nextStroll = this.time + STROLL_EVERY[0];
        }
      }
    }

    walk(c, dt) {
      let budget = SPEED * dt;
      while (budget > 0 && c.path.length) {
        const t = c.path[0];
        const dx = t.x - c.x, dy = t.y - c.y;
        const dist = Math.hypot(dx, dy);
        // screen direction of the step: x - y is left/right, x + y is towards / away from the viewer
        if (dx - dy !== 0) c.left = dx - dy < 0;
        if (dx + dy !== 0) c.back = dx + dy < 0;
        if (dist <= budget) {
          c.x = t.x; c.y = t.y;
          c.path.shift();
          budget -= dist;
        } else {
          c.x += (dx / dist) * budget;
          c.y += (dy / dist) * budget;
          budget = 0;
        }
      }
      c.pose = c.path.length ? 'walk' : c.pose;
    }

    characters() {
      return [...this.chars.values()];
    }
  }

  const api = { Office, assignSeats, SPEED };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Sim = api;
})(typeof window !== 'undefined' ? window : globalThis);
