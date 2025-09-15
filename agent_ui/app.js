(function(){
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const logsEl = $('#logs');
  const planningOutput = $('#planningOutput');
  const chatOutput = $('#chatOutput');
  const tracesOutput = $('#tracesOutput');
  const apiBaseInput = $('#apiBase');
  const apiStatus = $('#apiStatus');
  const autoScroll = $('#autoScroll');
  // Drawer elements
  const logsDrawerEl = document.querySelector('#logsDrawer');
  const autoScrollDrawer = document.querySelector('#autoScrollDrawer');
  const terminalDrawer = document.querySelector('#terminalDrawer');
  const toggleTerminalBtn = document.querySelector('#toggleTerminal');

  // Simple panel nav
  const panels = $$('.panel');
  const links = $$('.nav-link[data-target]');
  function showPanel(id){
    panels.forEach(p => p.classList.toggle('active', p.id === id));
    links.forEach(a => a.classList.toggle('active', a.getAttribute('data-target') === id));
    localStorage.setItem('ui_active_panel', id);
  }
  links.forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('data-target');
      if (id) showPanel(id);
    });
  });
  // Default active panel
  const savedPanel = localStorage.getItem('ui_active_panel');
  showPanel(savedPanel && document.getElementById(savedPanel) ? savedPanel : 'planningSection');

  // Persist API base
  const savedApiBase = localStorage.getItem('mastra_api_base');
  if (savedApiBase) apiBaseInput.value = savedApiBase;
  apiBaseInput.addEventListener('change', () => {
    localStorage.setItem('mastra_api_base', apiBaseInput.value.trim());
  });

  function apiBase(){
    return apiBaseInput.value.replace(/\/?$/,'');
  }

  function ts(){
    const d = new Date();
    return d.toISOString();
  }

  const MAX_LOG_ENTRIES = 1000;
  const MAX_LOG_DETAILS_CHARS = 10000;

  function trimLogsContainer(el){
    if (!el) return;
    const excess = el.childElementCount - MAX_LOG_ENTRIES;
    if (excess > 0){
      for (let i = 0; i < excess; i++){
        el.removeChild(el.firstElementChild);
      }
    }
  }

  function log(scope, message, details){
    const div = document.createElement('div');
    div.className = 'log-entry';
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = ts();
    const head = document.createElement('div');
    head.innerHTML = `<span class="scope">[${scope}]</span> <span class="msg">${escapeHtml(message)}</span>`;
    div.appendChild(time);
    div.appendChild(head);
    if (details !== undefined) {
      const det = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = 'details';
      det.appendChild(sum);
      const pre = document.createElement('pre');
      let text;
      try {
        text = (typeof details === 'string') ? details : JSON.stringify(details, null, 2);
      } catch (e) {
        text = String(details);
      }
      if (text.length > MAX_LOG_DETAILS_CHARS){
        text = text.slice(0, MAX_LOG_DETAILS_CHARS) + '\n... truncated ...';
      }
      pre.textContent = text;
      det.appendChild(pre);
      div.appendChild(det);
    }
    // Append to main logs panel
    logsEl.appendChild(div);
    if (autoScroll && autoScroll.checked) logsEl.scrollTop = logsEl.scrollHeight;
    trimLogsContainer(logsEl);
    // Mirror to drawer if present
    if (logsDrawerEl) {
      const clone = div.cloneNode(true);
      logsDrawerEl.appendChild(clone);
      if (autoScrollDrawer && autoScrollDrawer.checked) logsDrawerEl.scrollTop = logsDrawerEl.scrollHeight;
      trimLogsContainer(logsDrawerEl);
    }
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  }

  // Minimal, safe Markdown renderer focusing on code snippets and basics
  function renderMarkdown(md){
    if (md == null) return '';
    let text = String(md);
    // Extract fenced code blocks first to avoid interfering with inline parsing
    const codeBlocks = [];
    text = text.replace(/```([a-z0-9_+-]+)?\n([\s\S]*?)```/gi, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || '', code });
      return `@@CODEBLOCK_${idx}@@`;
    });

    // Escape the rest
    text = escapeHtml(text);

    // Inline code `code`
    text = text.replace(/`([^`]+)`/g, (m, c) => `<code>${c}</code>`);

    // Headings #, ##, ### at line starts
    text = text.replace(/^(#{1,6})\s+(.+)$/gm, (m, hashes, title) => {
      const level = Math.min(hashes.length, 6);
      return `<h${level}>${title}</h${level}>`;
    });

    // Unordered lists (- or *)
    // Convert consecutive lines starting with - or * into a <ul>
    text = text.replace(/(?:^|\n)((?:[\-*]\s+.+(?:\n|$))+)/g, (m, block) => {
      const items = block.trim().split(/\n/).map(line => line.replace(/^[\-*]\s+/, '').trim()).filter(Boolean);
      if (!items.length) return m;
      return `\n<ul>` + items.map(it => `<li>${it}</li>`).join('') + `</ul>`;
    });

    // Paragraphs: convert double newlines to paragraphs, single newline to <br>
    text = text
      .split(/\n\n+/)
      .map(p => p.replace(/\n/g, '<br/>'))
      .map(p => {
        // Avoid wrapping if it already starts with a block element
        if (/^\s*<(h\d|ul|ol|pre|blockquote)/i.test(p)) return p;
        return `<p>${p}</p>`;
      })
      .join('\n');

    // Restore code blocks as <pre><code>
    text = text.replace(/@@CODEBLOCK_(\d+)@@/g, (m, n) => {
      const { lang, code } = codeBlocks[Number(n)] || { lang: '', code: '' };
      const safe = escapeHtml(code);
      const cls = lang ? ` class="lang-${lang}"` : '';
      return `<pre><code${cls}>${safe}</code></pre>`;
    });

    return text;
  }

  function setStatus(ok, text){
    apiStatus.textContent = `Status: ${text}`;
    apiStatus.className = 'status ' + (ok ? 'ok' : 'err');
  }

  // Ping API
  $('#pingApi').addEventListener('click', async () => {
    const url = apiBase() + '/';
    log('API', 'PING ' + url);
    try {
      const res = await fetch(url, { method: 'GET' });
      setStatus(res.ok, res.ok ? 'online' : 'error ' + res.status);
      log('API', 'PING response status ' + res.status);
    } catch (e) {
      setStatus(false, 'offline');
      log('API', 'PING error', String(e));
    }
  });

  // Logs controls
  function clearAllLogs(){
    logsEl.innerHTML = '';
    if (logsDrawerEl) logsDrawerEl.innerHTML = '';
  }
  $('#clearLogs').addEventListener('click', clearAllLogs);
  const clearDrawerBtn = document.querySelector('#clearLogsDrawer');
  if (clearDrawerBtn) clearDrawerBtn.addEventListener('click', clearAllLogs);

  // Terminal drawer toggle
  function setTerminalOpen(open){
    if (!terminalDrawer || !toggleTerminalBtn) return;
    terminalDrawer.classList.toggle('open', open);
    terminalDrawer.setAttribute('aria-expanded', String(open));
    toggleTerminalBtn.setAttribute('aria-expanded', String(open));
    toggleTerminalBtn.textContent = open ? '▼' : '▲';
    document.body.classList.toggle('terminal-open', open);
    localStorage.setItem('terminal_open', open ? '1' : '0');
  }
  if (toggleTerminalBtn) {
    toggleTerminalBtn.addEventListener('click', () => {
      const isOpen = terminalDrawer.classList.contains('open');
      setTerminalOpen(!isOpen);
    });
    const saved = localStorage.getItem('terminal_open');
    setTerminalOpen(saved === '1');
  }

  // Agents list
  const agentSelect = $('#agentSelect');
  const agentIdOverride = $('#agentIdOverride');
  $('#refreshAgents').addEventListener('click', loadAgents);

  function normalizeAgents(data){
    try {
      if (!data) return [];
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.agents)) return data.agents;
      if (Array.isArray(data.data)) return data.data;
      if (data.items && Array.isArray(data.items)) return data.items;
      if (typeof data === 'object') {
        // object map: { id: {name, ...}, ... }
        return Object.entries(data).map(([id, a]) => ({ id, ...(a || {}) }));
      }
    } catch {}
    return [];
  }

  async function loadAgents(){
    const url = apiBase() + '/agents';
    log('Agents', 'GET ' + url);
    try {
      const res = await fetch(url);
      const raw = await res.json().catch(() => ([]));
      const list = normalizeAgents(raw);
      agentSelect.innerHTML = '';
      list.forEach(a => {
        const opt = document.createElement('option');
        const id = a.id || a.agentId || a.slug || a.key || a.name || '';
        const name = a.name || a.title || id;
        opt.value = String(id);
        opt.textContent = `${name} (${id})`;
        agentSelect.appendChild(opt);
      });
      // Auto select Chat Code Agent
      let selected = false;
      [...agentSelect.options].forEach((opt, idx) => {
        if ((opt.textContent || '').toLowerCase().includes('chat code agent')) { agentSelect.selectedIndex = idx; selected = true; }
      });
      if (!selected && agentSelect.options.length > 0) agentSelect.selectedIndex = 0;
      log('Agents', 'Loaded agents', { raw, normalized: list });
    } catch (e){
      log('Agents', 'Failed to load agents', String(e));
      agentSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Failed to load agents';
      agentSelect.appendChild(opt);
    }
  }

  // Chat streaming with chatbot UI
  function createChatThread(){
    chatOutput.classList.add('chat');
    chatOutput.innerHTML = '';
    const thread = document.createElement('div');
    thread.className = 'chat-thread';
    chatOutput.appendChild(thread);
    return thread;
  }

  function makeMsg(role, text){
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    if (text) div.textContent = text;
    return div;
  }

  function makeBlock(cls, title, obj, collapsed = true){
    const div = document.createElement('div');
    div.className = `block ${cls} collapsible`;

    const details = document.createElement('details');
    if (!collapsed) details.setAttribute('open', '');

    const summary = document.createElement('summary');
    const h = document.createElement('h4');
    h.textContent = title;
    summary.appendChild(h);
    details.appendChild(summary);

    if (obj !== undefined) {
      const pre = document.createElement('pre');
      pre.textContent = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
      details.appendChild(pre);
    }

    // expose handles for extensibility
    div._details = details;
    div._summary = summary;

    div.appendChild(details);
    return div;
  }

  function ChatRenderer(thread){
    this.thread = thread;
    this.assistant = null;
    this.assistantText = '';
    this.toolBlocks = new Map(); // toolCallId -> {callEl,resultEl}
  }
  ChatRenderer.prototype.addUser = function(text){
    const m = makeMsg('user', text);
    this.thread.appendChild(m);
    this.thread.scrollTop = this.thread.scrollHeight;
  };
  ChatRenderer.prototype.ensureAssistant = function(){
    if (!this.assistant){
      this.assistant = makeMsg('assistant');
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = 'assistant';
      this.assistant.appendChild(meta);
      const body = document.createElement('div');
      body.className = 'body';
      // Thinking block will be created on demand
      this.assistant.appendChild(body);
      this.thread.appendChild(this.assistant);
    }
    return this.assistant.querySelector('.body');
  };

  ChatRenderer.prototype.ensureThinkingBlock = function(){
    const body = this.ensureAssistant();
    let block = body.querySelector('.block.thinking');
    if (!block){
      block = makeBlock('thinking', 'Thinking', undefined, true);
      // content container for markdown
      const content = document.createElement('div');
      content.className = 'md';
      // By default collapsed; we won't open it automatically
      block._details.appendChild(content);
      body.appendChild(block);
    }
    return block.querySelector('.md');
  };

  ChatRenderer.prototype.appendThinkingText = function(delta){
    if (!delta) return;
    this.assistantText += delta;
    const content = this.ensureThinkingBlock();
    content.innerHTML = renderMarkdown(this.assistantText);
    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };
  ChatRenderer.prototype.addToolCall = function(call){
    const body = this.ensureAssistant();
    const id = call.toolCallId || call.id;
    const title = `Tool Call: ${call.toolName || call.name || ''} (${id || 'unknown'})`;
    const el = makeBlock('tool-call', title, call.args || call);
    body.appendChild(el);
    this.toolBlocks.set(id, { callEl: el, resultEl: null });
    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };
  ChatRenderer.prototype.addToolResult = function(result){
    const body = this.ensureAssistant();
    const id = result.toolCallId || result.id;
    const title = `Tool Result (${id || 'unknown'})`;
    const el = makeBlock('tool-result', title, result.result || result);
    const block = this.toolBlocks.get(id);
    if (block){
      block.resultEl = el;
      block.callEl.after(el);
    } else {
      body.appendChild(el);
    }
    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };

  // Create a visible final response block and avoid duplicating answer in Thinking
  ChatRenderer.prototype.finalize = function(){
    const body = this.ensureAssistant();
    // Create Response block (expanded by default)
    const resp = makeBlock('response', 'Response', undefined, false);
    const content = document.createElement('div');
    content.className = 'md';
    content.innerHTML = renderMarkdown(this.assistantText || '');
    resp._details.appendChild(content);
    body.appendChild(resp);

    // Replace thinking content with a small note to avoid duplication
    const thinkMd = body.querySelector('.block.thinking .md');
    if (thinkMd) {
      thinkMd.innerHTML = '<em>Reasoning hidden after final answer.</em>';
    }

    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };

  // Streaming parser for response frames
  function parseStreamLines(text, on){
    const lines = text.split(/\n/);
    for (const line of lines){
      const trimmed = line.trim();
      if (!trimmed) continue;
      // prefixed frame: <type>:<json>
      const m = trimmed.match(/^([a-z0-9]):\s*(\{[\s\S]*\})$/i);
      if (m){
        const t = m[1];
        const jsonPart = m[2];
        try {
          const obj = JSON.parse(jsonPart);
          on({ type: t, data: obj });
          continue;
        } catch {}
      }
      // token stream like: 0:"text"
      const t2 = trimmed.match(/^(\d+):\s*(.+)$/);
      if (t2){
        let payload = t2[2];
        // If quoted string, strip quotes
        const q = payload.match(/^"([\s\S]*)"$/);
        if (q){ payload = q[1]; }
        payload = payload.replace(/\\n/g, '\n');
        on({ type: 'token', data: payload });
        continue;
      }
      // If it looks like the start of a framed message (e.g., 'a:{' or '9:{')
      // but isn't a complete JSON yet, skip it to avoid leaking partial lines into chat.
      if (/^[a-z0-9]:/i.test(trimmed)) {
        continue;
      }
      // Plain assistant delta
      on({ type: 'text', data: trimmed });
    }
  }

  $('#chatStream').addEventListener('click', async () => {
    const message = $('#chatInput').value.trim();
    if (!message) return alert('Enter a message');
    const override = agentIdOverride.value.trim();
    const agentId = override || agentSelect.value;
    if (!agentId) return alert('No agent selected');

    const url = `${apiBase()}/agents/${encodeURIComponent(agentId)}/stream`;
    const runId = `run_${Date.now()}`;
    const payload = {
      messages: [{ role: 'user', content: message }],
      runId,
      format: 'mastra',
      savePerStep: true,
      toolChoice: 'auto'
    };

    const thread = createChatThread();
    const renderer = new ChatRenderer(thread);
    renderer.addUser(message);
    log('Chat', 'POST stream', { url, payload });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      log('Chat', 'Response headers', Object.fromEntries(res.headers.entries()));
      let allowPlainText = false;
      await handleStream(res, (evt) => {
        // JSON payloads (SSE/NDJSON)
        if (evt.json){
          const t = extractAssistantText(evt.json);
          if (t) renderer.appendThinkingText(t);
          // Receiving JSON assistant deltas indicates the stream has truly started
          allowPlainText = true;
          return;
        }
        // Raw text chunks: parse our frame protocol
        if (evt.raw){
          parseStreamLines(evt.raw, (frame) => {
            switch(frame.type){
              case 'f': /* meta frame start */ allowPlainText = true; break;
              case '9': allowPlainText = true; renderer.addToolCall(frame.data); break;
              case 'a': allowPlainText = true; renderer.addToolResult(frame.data); break;
              case 'e': /* end */ break;
              case 'token': allowPlainText = true; renderer.appendThinkingText(frame.data); break;
              case 'text': if (allowPlainText) renderer.appendThinkingText(frame.data); break;
              default: if (allowPlainText) renderer.appendThinkingText(String(frame.data || '')); break;
            }
          });
        }
      });
      // After stream has fully finished, render final response and collapse thinking content duplication
      renderer.finalize();
      log('Chat', 'Stream completed for runId ' + runId);
    } catch (e) {
      log('Chat', 'Stream error', String(e));
      const err = makeMsg('assistant');
      err.appendChild(makeBlock('error', 'Error', String(e), false));
      thread.appendChild(err);
    }
  });

  function extractAssistantText(obj){
    try {
      if (!obj) return '';
      if (obj.delta && typeof obj.delta === 'string') return obj.delta;
      if (obj.content && typeof obj.content === 'string') return obj.content;
      if (Array.isArray(obj.parts)) return obj.parts.map(p => p.text || p.content || '').filter(Boolean).join('');
      if (obj.message && typeof obj.message === 'string') return obj.message;
      if (obj.data && typeof obj.data === 'string') return obj.data;
    } catch {}
    return '';
  }

  const OUTPUT_MAX_CHARS = 250000; // cap to keep UI responsive
  const _appendState = new WeakMap(); // container -> { pending: boolean }
  function appendOutput(container, text){
    if (!container) return;
    const toAdd = text.endsWith('\n') ? text : text + '\n';
    // Efficient incremental append without reading existing text
    container.insertAdjacentText('beforeend', toAdd);
    // Throttle scroll to next frame
    let state = _appendState.get(container);
    if (!state){ state = { pending: false }; _appendState.set(container, state); }
    if (!state.pending){
      state.pending = true;
      requestAnimationFrame(() => {
        state.pending = false;
        container.scrollTop = container.scrollHeight;
      });
    }
    // Occasionally cap total text size
    const currentLen = container.textContent.length;
    if (currentLen > OUTPUT_MAX_CHARS){
      // Keep last OUTPUT_MAX_CHARS characters
      const trimmed = container.textContent.slice(-OUTPUT_MAX_CHARS);
      container.textContent = '... trimmed ...\n' + trimmed;
      container.scrollTop = container.scrollHeight;
    }
  }

  // Planning stream
  $('#runPlanningStream').addEventListener('click', async () => {
    const task = $('#planningTask').value.trim();
    const detail = $('#planningDetail').value;
    if (!task) return alert('Enter a planning task');

    const url = `${apiBase()}/workflows/planning/stream`;
    const payload = { inputData: { userTask: task, detail } };

    planningOutput.textContent = '';
    appendOutput(planningOutput, `POST ${url}\n` + JSON.stringify(payload, null, 2));
    log('Planning', 'POST stream', { url, payload });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      log('Planning', 'Response headers', Object.fromEntries(res.headers.entries()));
      await handleStream(res, (evt) => {
        if (evt.raw) appendOutput(planningOutput, evt.raw);
        if (evt.json) {
          appendOutput(planningOutput, JSON.stringify(evt.json, null, 2));
          const cr = findCommandResults(evt.json);
          if (cr && cr.length) {
            appendOutput(planningOutput, 'Command Results:');
            cr.forEach(r => {
              appendOutput(planningOutput, `> $ ${r.command}`);
              appendOutput(planningOutput, `code: ${r.code}`);
              if (r.stdout) appendOutput(planningOutput, r.stdout);
              if (r.stderr) appendOutput(planningOutput, r.stderr);
              if (r.error) appendOutput(planningOutput, 'error: ' + r.error);
            });
          }
          const runId = evt.json.runId || (evt.json.context && evt.json.context.runId);
          if (runId) $('#planningRunId').value = runId;
        }
      });
      log('Planning', 'Stream completed');
    } catch (e) {
      log('Planning', 'Stream error', String(e));
      appendOutput(planningOutput, 'Error: ' + String(e));
    }
  });

  function findCommandResults(obj){
    const results = [];
    try {
      const scan = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) return x.forEach(scan);
        if (x.commandResults && Array.isArray(x.commandResults)) results.push(...x.commandResults);
        Object.values(x).forEach(scan);
      };
      scan(obj);
    } catch {}
    return results;
  }

  // Planning async fallback
  $('#runPlanningAsync').addEventListener('click', async () => {
    const task = $('#planningTask').value.trim();
    const detail = $('#planningDetail').value;
    if (!task) return alert('Enter a planning task');

    const url = `${apiBase()}/workflows/planning/start-async`;
    const payload = { inputData: { userTask: task, detail } };

    planningOutput.textContent = '';
    appendOutput(planningOutput, `POST ${url}\n` + JSON.stringify(payload, null, 2));
    log('Planning', 'POST start-async', { url, payload });

    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await res.json().catch(()=>({}));
      appendOutput(planningOutput, JSON.stringify(data, null, 2));
      log('Planning', 'start-async response', data);
      if (data.runId) $('#planningRunId').value = data.runId;
    } catch (e) {
      log('Planning', 'start-async error', String(e));
      appendOutput(planningOutput, 'Error: ' + String(e));
    }
  });

  // Fetch planning run
  $('#fetchPlanningRun').addEventListener('click', async () => {
    const runId = $('#planningRunId').value.trim();
    if (!runId) return alert('Enter runId');
    const url = `${apiBase()}/workflows/planning/runs/${encodeURIComponent(runId)}`;
    log('Planning', 'GET run ' + url);
    try {
      const res = await fetch(url);
      const data = await res.json();
      appendOutput(planningOutput, JSON.stringify(data, null, 2));
      log('Planning', 'Run', data);
    } catch (e) {
      log('Planning', 'Fetch run error', String(e));
      appendOutput(planningOutput, 'Error: ' + String(e));
    }
  });

  // Fetch execution result
  $('#fetchPlanningExec').addEventListener('click', async () => {
    const runId = $('#planningRunId').value.trim();
    if (!runId) return alert('Enter runId');
    const url = `${apiBase()}/workflows/planning/runs/${encodeURIComponent(runId)}/execution-result`;
    log('Planning', 'GET exec ' + url);
    try {
      const res = await fetch(url);
      const data = await res.json();
      appendOutput(planningOutput, JSON.stringify(data, null, 2));
      const cr = findCommandResults(data);
      if (cr && cr.length) {
        appendOutput(planningOutput, 'Command Results:');
        cr.forEach(r => {
          appendOutput(planningOutput, `> $ ${r.command}`);
          appendOutput(planningOutput, `code: ${r.code}`);
          if (r.stdout) appendOutput(planningOutput, r.stdout);
          if (r.stderr) appendOutput(planningOutput, r.stderr);
          if (r.error) appendOutput(planningOutput, 'error: ' + r.error);
        });
      }
      log('Planning', 'Exec Result', data);
    } catch (e) {
      log('Planning', 'Fetch exec error', String(e));
      appendOutput(planningOutput, 'Error: ' + String(e));
    }
  });

  // Observability traces
  $('#fetchTraces').addEventListener('click', async () => {
    const url = `${apiBase()}/observability/traces?perPage=10`;
    log('Traces', 'GET ' + url);
    tracesOutput.textContent = '';
    try {
      const res = await fetch(url);
      const data = await res.json();
      appendOutput(tracesOutput, JSON.stringify(data, null, 2));
    } catch (e) {
      appendOutput(tracesOutput, 'Error: ' + String(e));
      log('Traces', 'Error', String(e));
    }
  });

  // Stream handler: supports SSE and chunked JSON/NDJSON
  async function handleStream(res, onEvent){
    if (!res.ok) {
      const text = await res.text().catch(()=> '');
      onEvent({ raw: `HTTP ${res.status}\n${text}` });
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true){
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buf += chunk;
      // Log raw chunk
      onEvent({ raw: chunk });

      if (isSSE){
        const events = parseSSE(buf);
        if (events.consumed > 0) buf = buf.slice(events.consumed);
        for (const e of events.events){
          // e is like {event, data}
          try {
            const json = JSON.parse(e.data);
            onEvent({ json });
          } catch {
            onEvent({ raw: e.data });
          }
        }
      } else {
        // Try NDJSON / JSON-per-line
        const lines = buf.split(/\n/);
        // Keep last partial line in buffer
        buf = lines.pop() || '';
        for (const line of lines){
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            onEvent({ json });
          } catch {
            onEvent({ raw: trimmed });
          }
        }
      }
    }

    if (buf.trim()){
      try {
        onEvent({ json: JSON.parse(buf.trim()) });
      } catch {
        onEvent({ raw: buf });
      }
    }
  }

  function parseSSE(input){
    const events = [];
    let pos = 0;
    // Split into complete events ending with double newline
    while (true){
      const idx = input.indexOf('\n\n', pos);
      if (idx === -1) break;
      const block = input.slice(pos, idx);
      pos = idx + 2;
      const lines = block.split('\n');
      let event = 'message';
      let dataLines = [];
      for (const line of lines){
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      events.push({ event, data: dataLines.join('\n') });
    }
    return { events, consumed: pos };
  }

  // Initial load
  loadAgents();
})();