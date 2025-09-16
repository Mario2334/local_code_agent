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
  const toggleNavBtn = document.querySelector('#toggleNav');
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

    // Hide chat section and its nav link when in code agent workflow (planningSection)
    const chatSection = document.getElementById('chatSection');
    const chatNavLink = document.querySelector('.nav-link[data-target="chatSection"]');
    const inCodeAgentWorkflow = (id === 'planningSection');
    if (chatSection) {
      // Ensure chat panel is fully hidden when in code agent workflow
      chatSection.style.display = inCodeAgentWorkflow ? 'none' : '';
    }
    if (chatNavLink) {
      // Hide the nav link to chat when in code agent workflow
      chatNavLink.style.display = inCodeAgentWorkflow ? 'none' : '';
    }

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

  // Nav collapse toggle
  function setNavCollapsed(collapsed){
    document.body.classList.toggle('nav-collapsed', collapsed);
    if (toggleNavBtn){
      toggleNavBtn.setAttribute('aria-pressed', String(collapsed));
      toggleNavBtn.textContent = collapsed ? 'Show Nav' : 'Hide Nav';
    }
    localStorage.setItem('ui_nav_collapsed', collapsed ? '1' : '0');
  }
  if (toggleNavBtn){
    toggleNavBtn.addEventListener('click', () => {
      const collapsed = document.body.classList.contains('nav-collapsed');
      setNavCollapsed(!collapsed);
    });
    const savedCollapsed = localStorage.getItem('ui_nav_collapsed');
    setNavCollapsed(savedCollapsed === '1');
  }

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

  // Enhanced Markdown renderer with developer-focused features
  function renderMarkdown(md){
    if (md == null) return '';
    let text = String(md);
    
    // Extract fenced code blocks first to avoid interfering with inline parsing
    const codeBlocks = [];
    text = text.replace(/```([a-z0-9_+-]+)?\n([\s\S]*?)```/gi, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'text', code });
      return `@@CODEBLOCK_${idx}@@`;
    });
    
    // Extract file references (e.g., `file.js`, `/path/to/file.py`)
    const fileRefs = [];
    text = text.replace(/`([^`]*\.[a-z0-9]+)`/gi, (match, file) => {
      if (file.includes('/') || file.includes('\\') || /\.(js|ts|py|java|cpp|c|go|rs|php|rb|css|html|json|xml|yml|yaml|md|txt|sh|bat)$/i.test(file)) {
        const idx = fileRefs.length;
        fileRefs.push(file);
        return `@@FILEREF_${idx}@@`;
      }
      return match;
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

    // Restore code blocks with enhanced styling
    text = text.replace(/@@CODEBLOCK_(\d+)@@/g, (m, n) => {
      const { lang, code } = codeBlocks[Number(n)] || { lang: 'text', code: '' };
      const safe = escapeHtml(code);
      const langIcon = getLanguageIcon(lang);
      const langName = lang.charAt(0).toUpperCase() + lang.slice(1);
      return `
        <div class="code-block">
          <div class="code-header">
            <span class="code-lang">
              <span class="code-icon">${langIcon}</span>
              ${langName}
            </span>
            <button class="copy-code" onclick="copyCodeBlock(this)" title="Copy code">
              <span class="copy-icon">📋</span>
            </button>
          </div>
          <pre><code class="lang-${lang}">${safe}</code></pre>
        </div>
      `;
    });
    
    // Restore file references with special styling
    text = text.replace(/@@FILEREF_(\d+)@@/g, (m, n) => {
      const file = fileRefs[Number(n)] || '';
      const fileIcon = getFileIcon(file);
      return `<span class="file-ref" title="File: ${escapeHtml(file)}">
        <span class="file-icon">${fileIcon}</span>
        <code>${escapeHtml(file)}</code>
      </span>`;
    });

    return text;
  }
  
  function getLanguageIcon(lang) {
    const icons = {
      javascript: '🟨', js: '🟨', typescript: '🔷', ts: '🔷',
      python: '🐍', py: '🐍', java: '☕', cpp: '⚙️', c: '⚙️',
      go: '🐹', rust: '🦀', php: '🐘', ruby: '💎', rb: '💎',
      html: '🌐', css: '🎨', json: '📄', xml: '📄',
      bash: '💻', sh: '💻', sql: '🗄️', yaml: '⚙️', yml: '⚙️',
      text: '📝', plain: '📝'
    };
    return icons[lang.toLowerCase()] || '📄';
  }
  
  function getFileIcon(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const icons = {
      js: '🟨', ts: '🔷', py: '🐍', java: '☕', cpp: '⚙️', c: '⚙️',
      go: '🐹', rs: '🦀', php: '🐘', rb: '💎',
      html: '🌐', css: '🎨', json: '📄', xml: '📄',
      sh: '💻', bat: '💻', sql: '🗄️', yml: '⚙️', yaml: '⚙️',
      md: '📝', txt: '📝', log: '📋'
    };
    return icons[ext] || '📄';
  }
  
  // Handle vnext streaming event format
  function handleVNextStreamEvent(data, renderer, onDelta, onError, getCurrentResponse) {
    if (!data || !data.type) return;
    
    log('Chat', 'Stream event', { type: data.type, runId: data.runId });
    
    switch (data.type) {
      case 'start':
        log('Chat', 'Stream started', data.payload);
        break;
        
      case 'step-start':
        log('Chat', 'Step started', data.payload);
        break;
        
      case 'step-delta':
        // Handle step delta (text content streaming)
        if (data.payload && data.payload.delta) {
          if (data.payload.delta.content) {
            renderer.appendAnswerText(data.payload.delta.content);
            onDelta(data.payload.delta.content);
          }
          if (data.payload.delta.reasoning) {
            renderer.appendThinkingText(data.payload.delta.reasoning);
          }
        }
        break;
        
      case 'step-finish':
        log('Chat', 'Step finished', data.payload);
        // Extract final text from step result
        if (data.payload && data.payload.output && data.payload.output.text) {
          const text = data.payload.output.text;
          const currentResponse = getCurrentResponse ? getCurrentResponse() : '';
          if (text && text !== currentResponse) {
            renderer.appendAnswerText(text);
            onDelta(text);
          }
        }
        
        // Handle tool calls if present
        if (data.payload && data.payload.output && data.payload.output.toolCalls) {
          data.payload.output.toolCalls.forEach(toolCall => {
            renderer.addToolCall(toolCall);
          });
        }
        
        // Check for errors
        if (data.payload && data.payload.stepResult && data.payload.stepResult.reason === 'error') {
          let errorMsg = 'The agent encountered an error while processing your request.';
          
          // Try to extract more specific error information
          if (data.payload.output && data.payload.output.steps && data.payload.output.steps[0]) {
            const step = data.payload.output.steps[0];
            if (step.finishReason === 'error') {
              errorMsg = 'The AI model encountered an error during processing. This might be due to:';
              errorMsg += '\n\u2022 Model configuration issues';
              errorMsg += '\n\u2022 Invalid request parameters';
              errorMsg += '\n\u2022 Service unavailability';
              errorMsg += '\n\nPlease try again or contact support if the issue persists.';
            }
          }
          
          onError(errorMsg);
          return;
        }
        break;
        
      case 'finish':
        log('Chat', 'Stream finished', data.payload);
        // Final text extraction
        if (data.payload && data.payload.output && data.payload.output.text) {
          const text = data.payload.output.text;
          if (text) {
            renderer.appendAnswerText(text);
            onDelta(text);
          }
        }
        break;
        
      case 'error':
        log('Chat', 'Stream error', data.payload);
        let errorMsg = 'An error occurred while processing your request.';
        if (data.payload && data.payload.error && data.payload.error.message) {
          errorMsg = data.payload.error.message;
        }
        onError(errorMsg);
        break;
        
      default:
        log('Chat', 'Unknown stream event type', { type: data.type, payload: data.payload });
    }
  }
  
  // Global function for copying code blocks
  window.copyCodeBlock = function(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    navigator.clipboard.writeText(code).then(() => {
      const icon = button.querySelector('.copy-icon');
      const originalIcon = icon.textContent;
      icon.textContent = '✅';
      setTimeout(() => {
        icon.textContent = originalIcon;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy code:', err);
    });
  };

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

  // Enhanced chat with thread management
  let currentThreadId = null;
  let messageHistory = [];
  let isThinkingMode = false;
  
  function generateThreadId() {
    return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  function createChatThread(clearHistory = false){
    chatOutput.classList.add('chat');
    if (clearHistory) {
      chatOutput.innerHTML = '';
      messageHistory = [];
      currentThreadId = generateThreadId();
    }
    
    let thread = chatOutput.querySelector('.chat-thread');
    if (!thread) {
      thread = document.createElement('div');
      thread.className = 'chat-thread';
      chatOutput.appendChild(thread);
    }
    
    // Add chat controls if not present
    if (!chatOutput.querySelector('.chat-controls')) {
      const controls = createChatControls();
      chatOutput.insertBefore(controls, thread);
    }
    
    return thread;
  }
  
  function createChatControls() {
    const controls = document.createElement('div');
    controls.className = 'chat-controls';
    controls.innerHTML = `
      <div class="chat-info">
        <span class="thread-info">Thread: <code id="currentThreadDisplay">${currentThreadId || 'new'}</code></span>
        <span class="message-count">${messageHistory.length} messages</span>
      </div>
      <div class="chat-actions">
        <button id="clearChat" class="secondary small" title="Start new conversation">
          <span class="icon">🆕</span> New Chat
        </button>
        <button id="toggleThinking" class="secondary small ${isThinkingMode ? 'active' : ''}" title="Toggle thinking mode">
          <span class="icon">🧠</span> ${isThinkingMode ? 'Simple' : 'Detailed'}
        </button>
        <button id="exportChat" class="secondary small" title="Export conversation">
          <span class="icon">📄</span> Export
        </button>
      </div>
    `;
    return controls;
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
    // Maintain separate buffers for thinking (reasoning) and visible answer
    this.thinkingText = '';
    this.answerText = '';
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

  // Show a beautiful typing loader while awaiting response
  ChatRenderer.prototype.showLoader = function(){
    const body = this.ensureAssistant();
    let loader = body.querySelector('.chat-loader');
    if (!loader){
      loader = document.createElement('div');
      loader.className = 'chat-loader';
      loader.innerHTML = '<div class="typing" aria-live="polite" aria-label="Assistant is typing">\
        <span></span><span></span><span></span>\
      </div><div class="hint">Thinking…</div>';
      body.appendChild(loader);
    }
    // Ensure visible
    loader.style.display = 'inline-flex';
  };
  ChatRenderer.prototype.hideLoader = function(){
    const body = this.ensureAssistant();
    const loader = body.querySelector('.chat-loader');
    if (loader){ loader.remove(); }
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
    this.thinkingText += delta;
    const content = this.ensureThinkingBlock();
    content.innerHTML = renderMarkdown(this.thinkingText);
    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };
  ChatRenderer.prototype.appendAnswerText = function(delta){
    if (!delta) return;
    this.answerText += delta;
    const body = this.ensureAssistant();
    // Live preview in a Response block if present, otherwise keep for finalize
    let resp = body.querySelector('.block.response');
    if (!resp){
      resp = makeBlock('response', 'Response', undefined, false);
      const content = document.createElement('div');
      content.className = 'md';
      resp._details.appendChild(content);
      body.appendChild(resp);
    }
    const md = resp.querySelector('.md');
    if (md) md.innerHTML = renderMarkdown(this.answerText);
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

    // Ensure Response block exists
    let resp = body.querySelector('.block.response');
    if (!resp){
      resp = makeBlock('response', 'Response', undefined, false);
      const content = document.createElement('div');
      content.className = 'md';
      resp._details.appendChild(content);
      body.appendChild(resp);
    }
    // Render only the answer text in the Response block; fallback to thinking if answer is empty
    const finalHtml = renderMarkdown(this.answerText || (this.thinkingText ? this.thinkingText : ''));
    const md = resp.querySelector('.md');
    if (md) md.innerHTML = finalHtml;

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

    // Initialize thread if needed
    if (!currentThreadId) {
      currentThreadId = generateThreadId();
    }
    
    // Add user message to history
    const userMessage = { role: 'user', content: message };
    messageHistory.push(userMessage);
    
    // Use streaming endpoint for better UX
    const useStreaming = true;
    const url = useStreaming 
      ? `${apiBase()}/agents/${encodeURIComponent(agentId)}/stream/vnext`
      : `${apiBase()}/agents/${encodeURIComponent(agentId)}/generate/vnext`;
    
    const runId = `run_${Date.now()}`;
    const resourceId = `user_${Date.now()}`; // In a real app, this would be the actual user ID
    
    const payload = {
      messages: messageHistory,
      threadId: currentThreadId,
      resourceId: resourceId,
      runId: runId,
      toolChoice: 'auto',
      memory: {
        threadId: currentThreadId,
        resourceId: resourceId
      },
      instructions: isThinkingMode ? 
        'Provide detailed reasoning and show your thought process. Be thorough in explaining technical concepts and code.' :
        'Be concise and direct. Focus on practical solutions and clear explanations.'
    };

    const thread = createChatThread();
    const renderer = new ChatRenderer(thread);
    renderer.addUser(message);
    
    // Update chat controls
    updateChatControls();
    
    // Show loader and disable the send button
    const sendBtn = document.querySelector('#chatStream');
    const prevBtnText = sendBtn ? sendBtn.textContent : null;
    if (sendBtn){ sendBtn.disabled = true; sendBtn.textContent = 'Thinking…'; }
    renderer.showLoader();
    
    // Clear input
    $('#chatInput').value = '';
    
    log('Chat', useStreaming ? 'POST stream' : 'POST generate', { url, payload });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const contentType = res.headers.get('content-type') || '';
      log('Chat', 'Response headers', Object.fromEntries(res.headers.entries()));
      if (!res.ok) {
        const errText = await res.text().catch(()=> '');
        throw new Error(`HTTP ${res.status}: ${errText || res.statusText}`);
      }
      
      let fullResponse = '';
      
      if (useStreaming && (contentType.includes('text/event-stream') || contentType.includes('text/plain'))) {
        // Handle streaming response
        let isError = false;
        let errorMessage = '';
        
        await handleStream(res, (evt) => {
          if (evt.raw) {
            // Parse vnext streaming format: data: {json}
            try {
              const lines = evt.raw.split('\n').filter(line => line.trim());
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.substring(6);
                  if (jsonStr === '[DONE]') {
                    log('Chat', 'Stream completed');
                    continue;
                  }
                  
                  try {
                    const data = JSON.parse(jsonStr);
                    handleVNextStreamEvent(data, renderer, (delta) => {
                      fullResponse += delta;
                    }, (error) => {
                      isError = true;
                      errorMessage = error;
                    }, () => fullResponse);
                  } catch (parseError) {
                    log('Chat', 'Failed to parse streaming JSON', { line, error: parseError.message });
                  }
                }
              }
            } catch (parseError) {
              log('Chat', 'Failed to parse streaming chunk', parseError.message);
            }
          }
          if (evt.json) {
            handleVNextStreamEvent(evt.json, renderer, (delta) => {
              fullResponse += delta;
            }, (error) => {
              isError = true;
              errorMessage = error;
            }, () => fullResponse);
          }
        });
        
        if (isError) {
          throw new Error(errorMessage || 'Streaming request failed');
        }
      } else {
        // Handle non-streaming response
        let data;
        if (contentType.includes('application/json')) {
          data = await res.json();
        } else {
          data = await res.text();
        }
        const answer = extractFinalAnswer(data);
        renderer.appendAnswerText(answer);
        fullResponse = answer;
      }
      
      renderer.finalize();
      
      // Add assistant message to history
      if (fullResponse.trim()) {
        messageHistory.push({ role: 'assistant', content: fullResponse.trim() });
        updateChatControls();
        
        // Add follow-up suggestions
        setTimeout(() => {
          addFollowUpQuestions(fullResponse);
        }, 500);
      }
      
      log('Chat', 'Chat completed for runId ' + runId, { responseLength: fullResponse.length });
    } catch (e) {
      log('Chat', 'Chat error', String(e));
      
      // If streaming failed and we haven't tried non-streaming yet, try fallback
      if (useStreaming && e.message && (e.message.includes('Streaming request failed') || e.message.includes('AI model encountered an error'))) {
        log('Chat', 'Streaming failed, trying non-streaming fallback');
        
        // Update UI to show fallback attempt
        const sendBtn = document.querySelector('#chatStream');
        if (sendBtn) sendBtn.textContent = 'Retrying...';
        
        try {
          // Try with generate endpoint instead
          const fallbackUrl = `${apiBase()}/agents/${encodeURIComponent(agentId)}/generate/vnext`;
          const fallbackRes = await fetch(fallbackUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (fallbackRes.ok) {
            const fallbackData = await fallbackRes.json();
            const answer = extractFinalAnswer(fallbackData);
            renderer.appendAnswerText(answer);
            renderer.finalize();
            
            if (answer.trim()) {
              messageHistory.push({ role: 'assistant', content: answer.trim() });
              updateChatControls();
              
              setTimeout(() => {
                addFollowUpQuestions(answer);
              }, 500);
            }
            
            log('Chat', 'Fallback successful');
            return; // Exit successfully
          }
        } catch (fallbackError) {
          log('Chat', 'Fallback also failed', String(fallbackError));
        }
      }
      
      // Show error to user
      const err = makeMsg('assistant');
      const errorTitle = useStreaming ? 'Streaming Error' : 'Generation Error';
      const errorDetails = e.message || String(e);
      err.appendChild(makeBlock('error', errorTitle, errorDetails, false));
      thread.appendChild(err);
    } finally {
      try { renderer.hideLoader(); } catch {}
      const btn = document.querySelector('#chatStream');
      if (btn){ btn.disabled = false; btn.textContent = (prevBtnText != null ? prevBtnText : 'Send'); }
    }
  });

  function extractFinalAnswer(data){
    try {
      if (data == null) return '';
      if (typeof data === 'string') return data;
      if (typeof data.text === 'string') return data.text;
      if (typeof data.output === 'string') return data.output;
      // Some agent responses may be like { message: { role, content } }
      if (data.message) {
        const m = data.message;
        if (typeof m === 'string') return m;
        if (typeof m.content === 'string') return m.content;
        if (Array.isArray(m.content)) return m.content.map(coercePartToString).join('');
      }
      // Or { messages: [...] }
      if (Array.isArray(data.messages)) {
        const last = [...data.messages].reverse().find(m => m.role === 'assistant') || data.messages[data.messages.length - 1];
        if (last) {
          if (typeof last.content === 'string') return last.content;
          if (Array.isArray(last.content)) return last.content.map(coercePartToString).join('');
        }
      }
      // Or { result: "" }
      if (typeof data.result === 'string') return data.result;
      // Fallback to JSON string
      return JSON.stringify(data);
    } catch {
      try { return String(data); } catch { return ''; }
    }
  }

  function coercePartToString(p){
    if (p == null) return '';
    if (typeof p === 'string') return p;
    if (typeof p.text === 'string') return p.text;
    if (typeof p.content === 'string') return p.content;
    return '';
  }

  // Extract deltas from JSON events separating thinking vs answer content
  function extractAssistantDeltas(obj){
    const out = { thinking: '', answer: '' };
    try {
      if (!obj) return out;
      // Common Mastra/AI SDK shapes
      // 1) { type: 'delta', part: { type: 'reasoning'|'text', text: '...' } }
      if (obj.part && obj.part.type && typeof obj.part.text === 'string'){
        if (String(obj.part.type).toLowerCase().includes('reason')) out.thinking = obj.part.text;
        else out.answer = obj.part.text;
        return out;
      }
      // 2) { type: 'reasoning', delta: '...' } or { type: 'text', delta: '...' }
      if (obj.type && typeof obj.delta === 'string'){
        if (String(obj.type).toLowerCase().includes('reason')) out.thinking = obj.delta;
        else out.answer = obj.delta;
        return out;
      }
      // 3) { reasoning: '...', content: '...' }
      if (typeof obj.reasoning === 'string') out.thinking = obj.reasoning;
      if (typeof obj.content === 'string') out.answer = obj.content;
      if (out.thinking || out.answer) return out;
      // 4) { parts: [{type,text}...] }
      if (Array.isArray(obj.parts)){
        const think = [];
        const ans = [];
        for (const p of obj.parts){
          const t = p && (p.text || p.content);
          if (!t) continue;
          if (p.type && String(p.type).toLowerCase().includes('reason')) think.push(t);
          else ans.push(t);
        }
        out.thinking = think.join('');
        out.answer = ans.join('');
        return out;
      }
      // 5) Fallback generic
      if (typeof obj.message === 'string') out.answer = obj.message;
      if (typeof obj.data === 'string') out.answer = obj.data;
    } catch {}
    return out;
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

  // Chat control functions
  function updateChatControls() {
    const threadDisplay = document.getElementById('currentThreadDisplay');
    const messageCountEl = document.querySelector('.message-count');
    
    if (threadDisplay) {
      threadDisplay.textContent = currentThreadId || 'new';
    }
    if (messageCountEl) {
      messageCountEl.textContent = `${messageHistory.length} messages`;
    }
  }
  
  function addChatControlsEventListeners() {
    // Clear chat
    document.addEventListener('click', (e) => {
      if (e.target.id === 'clearChat' || e.target.closest('#clearChat')) {
        if (confirm('Start a new conversation? This will clear the current chat history.')) {
          createChatThread(true);
          updateChatControls();
        }
      }
    });
    
    // Toggle thinking mode
    document.addEventListener('click', (e) => {
      if (e.target.id === 'toggleThinking' || e.target.closest('#toggleThinking')) {
        isThinkingMode = !isThinkingMode;
        const btn = document.getElementById('toggleThinking');
        if (btn) {
          btn.classList.toggle('active', isThinkingMode);
          btn.querySelector('.icon').nextSibling.textContent = isThinkingMode ? ' Simple' : ' Detailed';
        }
        log('Chat', `Thinking mode ${isThinkingMode ? 'enabled' : 'disabled'}`);
      }
    });
    
    // Export chat
    document.addEventListener('click', (e) => {
      if (e.target.id === 'exportChat' || e.target.closest('#exportChat')) {
        exportChatHistory();
      }
    });
  }
  
  function exportChatHistory() {
    if (messageHistory.length === 0) {
      alert('No messages to export');
      return;
    }
    
    const exportData = {
      threadId: currentThreadId,
      timestamp: new Date().toISOString(),
      messages: messageHistory,
      messageCount: messageHistory.length
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_${currentThreadId}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    log('Chat', 'Chat history exported', { messageCount: messageHistory.length });
  }
  
  // Add follow-up questions functionality
  function addFollowUpQuestions(response) {
    const suggestions = generateFollowUpQuestions(response);
    if (suggestions.length > 0) {
      const thread = document.querySelector('.chat-thread');
      if (thread) {
        const suggestionsContainer = createSuggestionsContainer(suggestions);
        thread.appendChild(suggestionsContainer);
      }
    }
  }
  
  function generateFollowUpQuestions(response) {
    const suggestions = [];
    const text = response.toLowerCase();
    
    // Code-related follow-ups
    if (text.includes('function') || text.includes('method') || text.includes('class')) {
      suggestions.push('Can you show me an example?');
      suggestions.push('How would I test this?');
    }
    
    if (text.includes('error') || text.includes('bug') || text.includes('issue')) {
      suggestions.push('How can I debug this?');
      suggestions.push('What are common causes?');
    }
    
    if (text.includes('performance') || text.includes('optimize') || text.includes('slow')) {
      suggestions.push('How can I improve performance?');
      suggestions.push('What metrics should I track?');
    }
    
    // Always include these generic developer questions
    suggestions.push('Explain this in more detail');
    suggestions.push('Show me the best practices');
    suggestions.push('What are the alternatives?');
    
    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }
  
  function createSuggestionsContainer(suggestions) {
    const container = document.createElement('div');
    container.className = 'follow-up-suggestions';
    container.innerHTML = `
      <div class="suggestions-header">
        <span class="suggestions-icon">💡</span>
        <span class="suggestions-label">Follow up:</span>
      </div>
      <div class="suggestions-list">
        ${suggestions.map(suggestion => 
          `<button class="suggestion-btn" onclick="sendSuggestion('${escapeHtml(suggestion)}')">
            ${escapeHtml(suggestion)}
          </button>`
        ).join('')}
      </div>
    `;
    return container;
  }
  
  // Global function for suggestion buttons
  window.sendSuggestion = function(suggestion) {
    document.getElementById('chatInput').value = suggestion;
    document.getElementById('chatStream').click();
  };
  
  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      const chatInput = document.getElementById('chatInput');
      const sendBtn = document.getElementById('chatStream');
      if (chatInput && sendBtn && chatInput.value.trim() && !sendBtn.disabled) {
        sendBtn.click();
      }
    }
    
    // Escape to clear input
    if (e.key === 'Escape') {
      const chatInput = document.getElementById('chatInput');
      if (chatInput && document.activeElement === chatInput) {
        chatInput.value = '';
      }
    }
  });
  
  // Auto-resize chat input
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 200) + 'px';
    });
  }
  
  // Initialize chat controls event listeners
  addChatControlsEventListeners();
  
  // Initial load
  loadAgents();
})();
