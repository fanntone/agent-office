'use strict';

// What the detail card says when someone (or the robot) is clicked, as plain data; main.js puts it on the
// page with textContent. Also the one place that decides how a person is named.
(function (root) {
  const STATE = { tool: '用工具', thinking: '思考中', waiting: '等你回覆', sleeping: '睡著了', leaving: '下班囉' };
  const SERVER_STATE = { generating: '寫字中', reading: '讀 prompt', idle: '待命', queued: '排隊中', offline: '沒開機' };

  function nameOf(c) {
    return `${c.kind === 'strata' ? 'Strata' : 'Claude'}${c.project ? ' · ' + c.project : ''}`;
  }

  function ago(ms, now) {
    const s = Math.max(0, Math.round((now - ms) / 1000));
    if (s < 10) return '剛剛';
    if (s < 60) return `${s} 秒前`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} 分鐘前`;
    return `${Math.floor(m / 60)} 小時前`;
  }

  const two = (n) => String(n).padStart(2, '0');
  function clock(ms) {
    const d = new Date(ms);
    return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  }

  function describe(c, now) {
    return {
      title: nameOf(c),
      kind: c.kind,
      lines: [['狀態', STATE[c.state] || c.state], ['正在', c.activity], ['模型', c.model || '—'], ['上次動作', ago(c.lastAt, now)]],
      recent: (c.recent || []).map((r) => ({ time: clock(r.at), text: r.text })),
      empty: '還沒有動作紀錄',
    };
  }

  function describeRobot(r) {
    return {
      title: 'Strata 伺服器',
      kind: 'server',
      lines: [['狀態', SERVER_STATE[r.state] || r.state], ['正在', r.activity], ['GPU 溫度', r.gpuTemp == null ? '—' : `${r.gpuTemp}°C`]],
      recent: [],
      empty: '',
    };
  }

  const api = { nameOf, ago, clock, describe, describeRobot };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Panel = api;
})(typeof window !== 'undefined' ? window : globalThis);
