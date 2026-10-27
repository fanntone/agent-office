'use strict';

// Wires the page: the live stream (or a demo cast with ?demo) feeds the office simulation, and every
// animation frame moves people a little and draws the scene.
(function () {
  const canvas = document.getElementById('office');
  const ctx = canvas.getContext('2d');
  const office = new Sim.Office();
  let scale = 1;

  function fit() {
    const wrap = canvas.parentElement;
    const footer = document.querySelector('footer').offsetHeight;
    const room = Math.max(320, window.innerHeight - wrap.getBoundingClientRect().top - footer - 8);
    // clientWidth counts the padding too; the canvas only gets what is inside it
    const style = getComputedStyle(wrap);
    const width = wrap.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    scale = Math.min(width / Draw.SCENE_W, room / Draw.SCENE_H, 1.6);
    const dpr = window.devicePixelRatio || 1;
    canvas.style.width = `${Math.floor(Draw.SCENE_W * scale)}px`;
    canvas.style.height = `${Math.floor(Draw.SCENE_H * scale)}px`;
    canvas.width = Math.floor(Draw.SCENE_W * scale * dpr);
    canvas.height = Math.floor(Draw.SCENE_H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  window.addEventListener('resize', fit);
  fit();

  function summary(data) {
    const n = (k) => data.agents.filter((a) => a.kind === k).length;
    document.getElementById('count').textContent =
      `Claude ${n('claude')} · Strata ${n('strata')} · 伺服器 ${data.server.activity}`;
  }
  function feed(data) {
    office.update(data);
    summary(data);
    showCard();
  }

  // ---- the card for whoever was clicked (an id, or 'robot'); it follows the live data
  let selected = null;
  const card = document.getElementById('detail');
  function showCard() {
    const target = selected === 'robot' ? office.robot : office.chars.get(selected);
    if (!selected || !target) { selected = null; card.hidden = true; return; }
    const info = selected === 'robot' ? Panel.describeRobot(target) : Panel.describe(target, Date.now());
    card.dataset.kind = info.kind;
    document.getElementById('detail-title').textContent = info.title;
    const dl = document.getElementById('detail-lines');
    dl.replaceChildren(...info.lines.flatMap(([k, v]) => {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = v;
      return [dt, dd];
    }));
    const robot = selected === 'robot';
    document.getElementById('detail-recent-title').hidden = robot;
    const ol = document.getElementById('detail-recent');
    ol.hidden = robot;
    ol.replaceChildren(...(info.recent.length ? info.recent.map((r) => {
      const li = document.createElement('li');
      const time = document.createElement('time'); time.textContent = r.time;
      const text = document.createElement('span'); text.textContent = r.text;
      li.append(time, text);
      return li;
    }) : [Object.assign(document.createElement('li'), { className: 'empty', textContent: info.empty })]));
    card.hidden = false;
  }
  function select(id) { selected = id; showCard(); }

  // a point on the page -> the same point in scene coordinates, where Draw.hit works
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    return Draw.hit(office, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
  }
  canvas.addEventListener('click', (e) => {
    const t = pick(e);
    select(!t ? null : t === office.robot ? 'robot' : t.id);
  });
  canvas.addEventListener('mousemove', (e) => canvas.classList.toggle('pointing', !!pick(e)));
  document.getElementById('detail-close').addEventListener('click', () => select(null));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });

  // ?demo: a made-up cast that changes what it does every few seconds, to see every pose and walk
  function demo() {
    const cast = [
      ['d1', 'claude', 'agent-office'], ['d2', 'strata', 'agent-office'], ['d3', 'claude', '五子棋'],
      ['d4', 'strata', 'strata-local'], ['d5', 'strata', 'blog'], ['d6', 'claude', 'bp-app'],
    ];
    const plays = [
      ['tool', 'Bash：Run tests'], ['thinking', '思考中'], ['waiting', '等你回覆'], ['tool', 'Edit：draw.js'],
      ['sleeping', '睡著了'], ['tool', 'Read：SPEC.md'], ['thinking', '看工具結果'], ['waiting', '等你回覆'],
    ];
    const servers = [['generating', '寫字中 41.3 tok/s'], ['reading', '讀 prompt 64%'], ['idle', '待命'], ['generating', '寫字中 39.8 tok/s']];
    let round = 0;
    const started = Date.now();
    const tick = () => {
      const [state, activity] = servers[round % servers.length];
      feed({ at: Date.now(), server: { state, activity, gpuTemp: 58 + (round % 5) },
        agents: cast.map(([id, kind, project], i) => {
          const [s, a] = plays[(i * 3 + round) % plays.length];
          // a made-up history: the tool steps it took before, a minute or so apart
          const recent = Array.from({ length: 6 }, (_, k) => ({
            at: started - (k + 1) * 47000 - i * 9000, text: plays[(i + k * 3) % plays.length][1],
          })).filter((r) => r.text.includes('：'));
          return { id, kind, project, model: kind === 'claude' ? 'claude-opus-5-5' : 'qwen3.8-flash-next-iq2_xs',
            state: s, activity: a, recent, lastAt: Date.now() - i * 20000 };
        }) });
      round++;
    };
    tick();
    setInterval(tick, 7000);
  }

  const params = new URLSearchParams(location.search);
  if (params.has('demo')) demo();
  else new EventSource('/api/stream').onmessage = (e) => feed(JSON.parse(e.data));
  if (params.has('select')) select(params.get('select'));   // ?select=<id> opens a card (handy for screenshots)

  let last = performance.now();
  function frame(t) {
    office.step(Math.min(0.1, (t - last) / 1000));
    last = t;
    Draw.draw(ctx, office, Date.now(), selected);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const clock = document.getElementById('clock');
  const tickClock = () => { clock.textContent = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }); };
  tickClock();
  setInterval(tickClock, 1000);

  window.Main = { office, canvas, scale: () => scale };
})();
