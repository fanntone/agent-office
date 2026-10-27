'use strict';

// Pure data layer per SPEC.md: no fs, no network.

const TRUNCATE_AT = 40;
const SLEEP_AFTER_MS = 10 * 60000;

function kindOf(model) {
  return typeof model === 'string' && model.toLowerCase().includes('qwen') ? 'strata' : 'claude';
}

function cut(s) {
  return s.length > TRUNCATE_AT ? s.slice(0, TRUNCATE_AT) + '…' : s;
}

function summarize(toolName, input) {
  input = input || {};
  // Fixed precedence: the first field that has a value wins.
  if (input.description) return cut(input.description);
  if (input.file_path) return cut(String(input.file_path).split(/[\\/]/).pop());
  if (input.pattern) return cut(input.pattern);
  if (input.command) return cut(input.command);
  if (input.url) return cut(input.url);
  return '';
}

function describe(entry) {
  const content = entry.message ? entry.message.content : null;
  if (entry.type === 'assistant') {
    const last = Array.isArray(content) ? content[content.length - 1] : null;
    if (last && last.type === 'tool_use') {
      const summary = summarize(last.name, last.input);
      return { state: 'tool', activity: summary ? `${last.name}：${summary}` : last.name };
    }
    if (last && last.type === 'thinking') return { state: 'thinking', activity: '思考中' };
    return { state: 'waiting', activity: '等你回覆' }; // text content
  }
  // user
  if (typeof content === 'string') return { state: 'thinking', activity: '收到新訊息' };
  const last = Array.isArray(content) ? content[content.length - 1] : null;
  if (last && last.type === 'tool_result') return { state: 'thinking', activity: '看工具結果' };
  return { state: 'thinking', activity: '收到新訊息' };
}

function parseSession(lines, now) {
  const entries = [];
  for (const line of lines) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (err) {
      continue; // a tail read starts mid-line: skip the broken first line
    }
    if (!entry || (entry.type !== 'user' && entry.type !== 'assistant')) continue;
    entries.push(entry);
  }
  if (entries.length === 0) return null;

  const last = entries[entries.length - 1];
  // id/model/project come from the last entry that actually carries them,
  // which may be an earlier line than `last`.
  // A subagent's lines carry its parent's sessionId; its own id is the top-level agentId.
  const lastAgent = entries.slice().reverse().find((e) => e.agentId);
  const lastSession = entries.slice().reverse().find((e) => e.sessionId);
  const lastAssistant = entries.slice().reverse().find((e) => e.type === 'assistant' && e.message && e.message.model);
  const withCwd = entries.slice().reverse().find((e) => e.cwd);

  const d = describe(last);
  const lastAt = Date.parse(last.timestamp);
  const asleep = now - lastAt > SLEEP_AFTER_MS;

  // Only assistant tool_use lines and plain-text user messages count as actions.
  const recent = entries
    .filter((e) => e.type === 'assistant' && Array.isArray(e.message && e.message.content) &&
      e.message.content.length > 0 && e.message.content[e.message.content.length - 1].type === 'tool_use')
    .concat(entries.filter((e) => e.type === 'user' && typeof (e.message && e.message.content) === 'string'))
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-10)
    .reverse()
    .map((e) => ({ at: Date.parse(e.timestamp), text: describe(e).activity }));

  return {
    id: lastAgent ? lastAgent.agentId : lastSession ? lastSession.sessionId : null,
    kind: kindOf(lastAssistant && lastAssistant.message.model),
    model: lastAssistant ? lastAssistant.message.model : null,
    project: withCwd ? String(withCwd.cwd).split(/[\\/]/).filter(Boolean).pop() : null,
    lastAt,
    state: asleep ? 'sleeping' : d.state,
    activity: asleep ? '睡著了' : d.activity,
    recent,
  };
}

function serverState(metrics) {
  const gpuTemp = metrics && metrics.hardware ? metrics.hardware.gpu_temp : null;
  if (!metrics) return { state: 'offline', activity: '沒開機', gpuTemp: null };
  const live = metrics.live || {};
  if (live.queued > 0) return { state: 'queued', activity: `排隊 ${live.queued} 個`, gpuTemp };
  if (live.state === 'reading') {
    const activity = live.prompt_total ? `讀 prompt ${Math.round((live.prompt_read / live.prompt_total) * 100)}%` : '讀 prompt';
    return { state: 'reading', activity, gpuTemp };
  }
  if (live.state === 'generating') {
    const activity = typeof live.tok_s === 'number' ? `寫字中 ${live.tok_s.toFixed(1)} tok/s` : '寫字中';
    return { state: 'generating', activity, gpuTemp };
  }
  return { state: 'idle', activity: '待命', gpuTemp };
}

module.exports = { kindOf, summarize, describe, parseSession, serverState };
