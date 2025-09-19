(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Performance optimization constants
  const MAX_VISIBLE_MESSAGES = 50; // Maximum messages to render at once
  const MESSAGE_BUFFER_SIZE = 10; // Extra messages to render for smooth scrolling
  const SCROLL_DEBOUNCE_MS = 16; // ~60fps for scroll handling
  const VIRTUAL_SCROLL_THRESHOLD = 100; // Enable virtual scrolling after this many messages
  const MEMORY_CLEANUP_INTERVAL = 30000; // Clean up every 30 seconds

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

  // Connection status management variables
  let connectionState = 'disconnected';
  let connectionStatusElement = null;

  // Enhanced conversation management variables
  let conversationStartTime = null;
  let conversationTimeInterval = null;
  let isThinkingMode = localStorage.getItem('chat_thinking_mode') === '1';
  let currentThinking = null;

  // Performance optimization variables
  let virtualScrollEnabled = false;
  let visibleMessageRange = { start: 0, end: MAX_VISIBLE_MESSAGES };
  let messageElements = new Map(); // Cache for message DOM elements
  let scrollContainer = null;
  let virtualScrollHeight = 0;
  let lastScrollPosition = 0;
  let scrollDebounceTimer = null;
  let memoryCleanupTimer = null;
  let renderQueue = [];
  let isRendering = false;

  // Accessibility management variables
  let lastAnnouncementTime = 0;
  let announcementQueue = [];
  let isProcessingAnnouncements = false;

  // Constants
  const MAX_LOG_ENTRIES = 1000;
  const MAX_LOG_DETAILS_CHARS = 10000;



  // Simple panel nav
  const panels = $$('.panel');
  const links = $$('.nav-link[data-target]');
  let currentPanel = null;

  function showPanel(id, skipAnimation = false) {
    const targetPanel = document.getElementById(id);
    if (!targetPanel || targetPanel === currentPanel) return;

    // Update navigation links
    links.forEach(a => a.classList.toggle('active', a.getAttribute('data-target') === id));

    if (skipAnimation) {
      // Immediate switch without animation
      panels.forEach(p => p.classList.remove('active', 'transitioning-out'));
      targetPanel.classList.add('active');
      currentPanel = targetPanel;
    } else {
      // Smooth transition
      if (currentPanel) {
        currentPanel.classList.add('transitioning-out');
        setTimeout(() => {
          currentPanel.classList.remove('active', 'transitioning-out');
          targetPanel.classList.add('active');
          currentPanel = targetPanel;
        }, 400);
      } else {
        targetPanel.classList.add('active');
        currentPanel = targetPanel;
      }
    }

    localStorage.setItem('ui_active_panel', id);

    // Trigger panel-specific initialization if needed
    if (id === 'chatSection') {
      initializeChatPanel();
    }
  }

  function initializeChatPanel() {
    // Initialize chat-specific features when panel becomes active
    const chatOutput = document.querySelector('#chatOutput');
    if (chatOutput && !chatOutput.classList.contains('initialized')) {
      chatOutput.classList.add('initialized');

      // Initialize connection status indicator
      initializeConnectionStatus();
      updateConnectionStatus('connected', 'Ready');

      // Initialize accessibility features
      enhanceKeyboardNavigation();

      // Make chat output focusable and add keyboard navigation
      chatOutput.setAttribute('tabindex', '0');
      chatOutput.classList.add('enhanced-focus');
      chatOutput.addEventListener('keydown', (e) => {
        // Arrow keys for scrolling
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          chatOutput.scrollTop -= 50;
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          chatOutput.scrollTop += 50;
        } else if (e.key === 'Home') {
          e.preventDefault();
          chatOutput.scrollTop = 0;
          announceToScreenReader('Scrolled to top of conversation', 'polite');
        } else if (e.key === 'End') {
          e.preventDefault();
          chatOutput.scrollTop = chatOutput.scrollHeight;
          announceToScreenReader('Scrolled to bottom of conversation', 'polite');
        }
      });

      // Add enhanced loading state
      chatOutput.classList.add('loading');
      setTimeout(() => {
        chatOutput.classList.remove('loading');
      }, 1500);

      // Initialize auto-resize for chat input
      initializeAutoResize();

      log('Chat', 'Chat panel initialized with enhanced loading states and accessibility features');
    }
  }
  links.forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.getAttribute('data-target');
      if (id) {
        enhancedShowPanel(id);

        // Auto-close mobile nav after selection
        if (window.innerWidth <= 968) {
          setTimeout(() => setNavCollapsed(true), 300);
        }
      }
    });
  });
  // Default active panel
  const savedPanel = localStorage.getItem('ui_active_panel');
  showPanel(savedPanel && document.getElementById(savedPanel) ? savedPanel : 'planningSection', true);

  // Enhanced nav collapse toggle with mobile support
  function setNavCollapsed(collapsed) {
    document.body.classList.toggle('nav-collapsed', collapsed);
    const sidebar = document.querySelector('.sidebar');

    if (toggleNavBtn) {
      toggleNavBtn.setAttribute('aria-pressed', String(collapsed));
      const icon = toggleNavBtn.querySelector('.nav-icon');
      if (icon) {
        icon.textContent = collapsed ? '☰' : '✕';
      }
    }

    // Handle mobile navigation
    if (window.innerWidth <= 968) {
      if (sidebar) {
        sidebar.classList.toggle('mobile-open', !collapsed);
      }

      // Add click outside to close on mobile
      if (!collapsed && sidebar) {
        setTimeout(() => {
          document.addEventListener('click', function closeMobileNav(e) {
            if (!sidebar.contains(e.target) && !toggleNavBtn.contains(e.target)) {
              setNavCollapsed(true);
              document.removeEventListener('click', closeMobileNav);
            }
          });
        }, 100);
      }
    }

    localStorage.setItem('ui_nav_collapsed', collapsed ? '1' : '0');
  }
  if (toggleNavBtn) {
    toggleNavBtn.addEventListener('click', () => {
      const collapsed = document.body.classList.contains('nav-collapsed');
      setNavCollapsed(!collapsed);
    });
    const savedCollapsed = localStorage.getItem('ui_nav_collapsed');
    setNavCollapsed(savedCollapsed === '1');
  }

  // Handle window resize for responsive behavior
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const sidebar = document.querySelector('.sidebar');

      // Reset mobile navigation on desktop
      if (window.innerWidth > 968) {
        if (sidebar) {
          sidebar.classList.remove('mobile-open');
        }
        const savedCollapsed = localStorage.getItem('ui_nav_collapsed');
        setNavCollapsed(savedCollapsed === '1');
      } else {
        // Auto-collapse on mobile
        setNavCollapsed(true);
      }

      // Trigger chat container resize
      const chatOutput = document.querySelector('#chatOutput');
      if (chatOutput && chatOutput.classList.contains('initialized')) {
        chatOutput.dispatchEvent(new Event('resize'));
      }
    }, 250);
  });

  // Initialize responsive behavior
  if (window.innerWidth <= 968) {
    setNavCollapsed(true);
  }

  // Initialize enhanced features after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    initializeEnhancedFeatures();
    
    // Show page loader briefly for smooth initial load
    showPageLoader('Initializing interface...');
    setTimeout(() => {
      hidePageLoader();
    }, 1000);
  });

  // Initialize enhanced features immediately if DOM is already ready
  if (document.readyState === 'loading') {
    // DOM is still loading
  } else {
    // DOM is already loaded
    setTimeout(() => {
      initializeEnhancedFeatures();
    }, 100);
  }

  // Persist API base
  const savedApiBase = localStorage.getItem('mastra_api_base');
  if (savedApiBase) apiBaseInput.value = savedApiBase;
  apiBaseInput.addEventListener('change', () => {
    localStorage.setItem('mastra_api_base', apiBaseInput.value.trim());
  });

  function apiBase() {
    return apiBaseInput.value.replace(/\/?$/, '');
  }

  function ts() {
    const d = new Date();
    return d.toISOString();
  }

  function trimLogsContainer(el) {
    if (!el) return;
    // Use a fallback value if MAX_LOG_ENTRIES is not yet available
    const maxEntries = typeof MAX_LOG_ENTRIES !== 'undefined' ? MAX_LOG_ENTRIES : 1000;
    const excess = el.childElementCount - maxEntries;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        if (el.firstElementChild) {
          el.removeChild(el.firstElementChild);
        }
      }
    }
  }

  function ensureLogContent(container) {
    if (!container) return null;
    let content = container.querySelector('.log-content');
    if (!content) {
      content = document.createElement('div');
      content.className = 'log-content';
      container.appendChild(content);
    }
    return content;
  }

  function getLogLevel(scope, message) {
    const lowerScope = scope.toLowerCase();
    const lowerMessage = message.toLowerCase();

    if (lowerScope.includes('error') || lowerMessage.includes('error') || lowerMessage.includes('failed')) {
      return 'error';
    }
    if (lowerScope.includes('warn') || lowerMessage.includes('warn') || lowerMessage.includes('warning')) {
      return 'warning';
    }
    if (lowerScope.includes('success') || lowerMessage.includes('success') || lowerMessage.includes('completed')) {
      return 'success';
    }
    return 'info';
  }

  function log(scope, message, details) {
    const div = document.createElement('div');
    div.className = 'log-entry';

    const level = getLogLevel(scope, message);
    div.setAttribute('data-level', level);

    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const scopeSpan = document.createElement('span');
    scopeSpan.className = 'scope';
    scopeSpan.textContent = scope.toUpperCase();

    const msgSpan = document.createElement('span');
    msgSpan.className = 'msg';
    msgSpan.textContent = message;

    const head = document.createElement('div');
    head.appendChild(time);
    head.appendChild(scopeSpan);
    head.appendChild(msgSpan);

    div.appendChild(head);

    if (details !== undefined) {
      const det = document.createElement('details');
      const sum = document.createElement('summary');
      sum.textContent = '▶ details';
      sum.style.cursor = 'pointer';
      sum.style.color = 'var(--text-muted)';
      sum.style.fontSize = '11px';
      sum.style.marginTop = 'var(--spacing-xs)';
      det.appendChild(sum);
      const pre = document.createElement('pre');
      pre.style.background = 'var(--bg-surface)';
      pre.style.border = '1px solid var(--border-primary)';
      pre.style.borderRadius = 'var(--radius-sm)';
      pre.style.padding = 'var(--spacing-sm)';
      pre.style.marginTop = 'var(--spacing-xs)';
      pre.style.fontSize = '11px';
      pre.style.maxHeight = '200px';
      pre.style.overflow = 'auto';
      let text;
      try {
        text = (typeof details === 'string') ? details : JSON.stringify(details, null, 2);
      } catch (e) {
        text = String(details);
      }
      const maxChars = typeof MAX_LOG_DETAILS_CHARS !== 'undefined' ? MAX_LOG_DETAILS_CHARS : 10000;
      if (text.length > maxChars) {
        text = text.slice(0, maxChars) + '\n... truncated ...';
      }
      pre.textContent = text;
      det.appendChild(pre);
      div.appendChild(det);
    }

    // Append to main logs panel
    const mainContent = ensureLogContent(logsEl);
    if (mainContent) {
      mainContent.appendChild(div);
      if (autoScroll && autoScroll.checked) {
        mainContent.scrollTop = mainContent.scrollHeight;
      }
      trimLogsContainer(mainContent);
    }

    // Mirror to drawer if present
    if (logsDrawerEl) {
      const clone = div.cloneNode(true);
      const drawerContent = ensureLogContent(logsDrawerEl);
      if (drawerContent) {
        drawerContent.appendChild(clone);
        if (autoScrollDrawer && autoScrollDrawer.checked) {
          drawerContent.scrollTop = drawerContent.scrollHeight;
        }
        trimLogsContainer(drawerContent);
      }
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // Connection status management functions
  function initializeConnectionStatus() {
    // Create connection status indicator if it doesn't exist
    const chatControls = document.querySelector('.chat-controls');
    if (chatControls && !connectionStatusElement) {
      connectionStatusElement = document.createElement('div');
      connectionStatusElement.className = 'connection-status disconnected';
      connectionStatusElement.innerHTML = '<span>Disconnected</span>';

      const chatInfo = chatControls.querySelector('.chat-info');
      if (chatInfo) {
        chatInfo.appendChild(connectionStatusElement);
      }
    }
  }

  function updateConnectionStatus(status, message = '') {
    if (connectionState === status) return; // No change needed

    connectionState = status;

    if (!connectionStatusElement) {
      initializeConnectionStatus();
    }

    if (connectionStatusElement) {
      // Remove all status classes
      connectionStatusElement.classList.remove('connected', 'connecting', 'disconnected');

      // Add new status class
      connectionStatusElement.classList.add(status);

      // Update text content
      const statusText = {
        connected: 'Connected',
        connecting: 'Connecting',
        disconnected: 'Disconnected'
      };

      const displayText = message || statusText[status] || 'Unknown';
      connectionStatusElement.innerHTML = `<span>${displayText}</span>`;

      // Add animation for status changes
      connectionStatusElement.style.animation = 'none';
      setTimeout(() => {
        connectionStatusElement.style.animation = 'progressSlideIn 0.3s var(--ease-out-expo)';
      }, 10);

      // Announce status change to screen readers
      announceToScreenReader(`Connection status: ${displayText}`, 'polite');

      log('Chat', 'Connection status updated', {
        status,
        message: displayText,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Accessibility Functions
  function announceToScreenReader(message, priority = 'polite') {
    if (!message || typeof message !== 'string') return;

    // Prevent spam by limiting announcements
    const now = Date.now();
    if (now - lastAnnouncementTime < 500) {
      announcementQueue.push({ message, priority, timestamp: now });
      if (!isProcessingAnnouncements) {
        processAnnouncementQueue();
      }
      return;
    }

    lastAnnouncementTime = now;

    const announcementElement = priority === 'assertive'
      ? document.getElementById('chatAnnouncements')
      : document.getElementById('chatStatus');

    if (announcementElement) {
      // Clear previous announcement
      announcementElement.textContent = '';

      // Add new announcement after a brief delay to ensure screen readers pick it up
      setTimeout(() => {
        announcementElement.textContent = message;

        // Clear after 5 seconds to prevent accumulation
        setTimeout(() => {
          if (announcementElement.textContent === message) {
            announcementElement.textContent = '';
          }
        }, 5000);
      }, 100);
    }
  }

  function processAnnouncementQueue() {
    if (announcementQueue.length === 0) {
      isProcessingAnnouncements = false;
      return;
    }

    isProcessingAnnouncements = true;
    const { message, priority } = announcementQueue.shift();

    announceToScreenReader(message, priority);

    // Process next announcement after delay
    setTimeout(() => {
      processAnnouncementQueue();
    }, 600);
  }

  function updateChatStreamStatus(status, message = '') {
    const statusElement = document.getElementById('chatStreamStatus');
    if (statusElement) {
      statusElement.textContent = message || status;
    }

    // Update button state
    const chatButton = document.getElementById('chatStream');
    if (chatButton) {
      chatButton.setAttribute('aria-busy', status === 'sending' ? 'true' : 'false');

      if (status === 'sending') {
        chatButton.disabled = true;
        chatButton.classList.add('sending');
      } else {
        chatButton.disabled = false;
        chatButton.classList.remove('sending');
      }
    }
  }

  function updateCharacterCount(count, maxCount = 5000) {
    const charCountElement = document.getElementById('charCount');
    if (charCountElement) {
      charCountElement.textContent = count;
      charCountElement.setAttribute('aria-label', `Character count: ${count}${maxCount ? ` of ${maxCount}` : ''}`);

      // Update styling based on count
      charCountElement.classList.remove('warning', 'error');
      if (maxCount) {
        if (count > maxCount * 0.9) {
          charCountElement.classList.add('error');
        } else if (count > maxCount * 0.8) {
          charCountElement.classList.add('warning');
        }
      }
    }
  }

  function enhanceKeyboardNavigation() {
    // Add keyboard support for navigation links
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      link.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          link.click();
        }
      });

      // Update aria-current for active links
      link.addEventListener('click', () => {
        navLinks.forEach(l => l.removeAttribute('aria-current'));
        link.setAttribute('aria-current', 'page');
      });
    });

    // Add keyboard shortcuts for chat input
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.addEventListener('keydown', (e) => {
        // Ctrl+Enter to send
        if (e.ctrlKey && e.key === 'Enter') {
          e.preventDefault();
          const sendButton = document.getElementById('chatStream');
          if (sendButton && !sendButton.disabled) {
            sendButton.click();
            announceToScreenReader('Message sent', 'polite');
          }
        }

        // Escape to clear
        if (e.key === 'Escape') {
          e.preventDefault();
          chatInput.value = '';
          updateCharacterCount(0);
          announceToScreenReader('Input cleared', 'polite');
        }
      });

      // Character count updates
      chatInput.addEventListener('input', (e) => {
        updateCharacterCount(e.target.value.length);

        // Update floating label state
        const container = document.getElementById('chatInputContainer');
        if (container) {
          if (e.target.value.length > 0) {
            container.classList.add('has-content');
          } else {
            container.classList.remove('has-content');
          }
        }
      });

      // Focus state management
      chatInput.addEventListener('focus', () => {
        const container = document.getElementById('chatInputContainer');
        if (container) {
          container.classList.add('focused');
        }
      });

      chatInput.addEventListener('blur', () => {
        const container = document.getElementById('chatInputContainer');
        if (container) {
          container.classList.remove('focused');
        }
      });
    }

    // Add keyboard support for code block actions
    document.addEventListener('click', (e) => {
      if (e.target.matches('.copy-btn, .expand-btn')) {
        // Announce action to screen readers
        const action = e.target.classList.contains('copy-btn') ? 'copied' : 'expanded';
        setTimeout(() => {
          announceToScreenReader(`Code block ${action}`, 'polite');
        }, 100);
      }
    });
  }

  function enhanceMessageAccessibility(messageElement, role, content) {
    if (!messageElement) return;

    // Add proper ARIA attributes
    messageElement.setAttribute('role', 'article');
    messageElement.setAttribute('aria-label', `${role} message`);

    // Add timestamp for screen readers
    const timestamp = new Date().toLocaleString();
    messageElement.setAttribute('aria-describedby', `timestamp-${Date.now()}`);

    // Create hidden timestamp element
    const timestampElement = document.createElement('span');
    timestampElement.className = 'sr-only';
    timestampElement.id = `timestamp-${Date.now()}`;
    timestampElement.textContent = `Sent at ${timestamp}`;
    messageElement.appendChild(timestampElement);

    // Announce new messages
    if (role === 'assistant') {
      announceToScreenReader('New response received', 'polite');
    }
  }

  // ===== FINAL POLISH AND MICRO-INTERACTIONS =====

  // Loading Skeleton Functions
  function showChatLoadingSkeleton() {
    const chatOutput = document.getElementById('chatOutput');
    if (!chatOutput) return;

    const skeletonHTML = `
      <div class="chat-loading-skeleton" id="chatSkeleton">
        <div class="skeleton-message assistant">
          <div class="skeleton-avatar skeleton"></div>
          <div class="skeleton-content">
            <div class="skeleton-bubble assistant skeleton"></div>
            <div class="skeleton-text skeleton"></div>
            <div class="skeleton-text skeleton"></div>
            <div class="skeleton-code skeleton"></div>
          </div>
        </div>
        <div class="skeleton-message user">
          <div class="skeleton-avatar skeleton"></div>
          <div class="skeleton-content">
            <div class="skeleton-bubble user skeleton"></div>
          </div>
        </div>
        <div class="skeleton-message assistant">
          <div class="skeleton-avatar skeleton"></div>
          <div class="skeleton-content">
            <div class="skeleton-bubble assistant skeleton"></div>
            <div class="skeleton-text skeleton"></div>
          </div>
        </div>
      </div>
    `;

    chatOutput.innerHTML = skeletonHTML;
    
    // Auto-hide skeleton after 2 seconds if no real content appears
    setTimeout(() => {
      hideChatLoadingSkeleton();
    }, 2000);
  }

  function hideChatLoadingSkeleton() {
    const skeleton = document.getElementById('chatSkeleton');
    if (skeleton) {
      skeleton.style.animation = 'fadeOut 0.4s var(--ease-out-expo) forwards';
      setTimeout(() => {
        skeleton.remove();
      }, 400);
    }
  }

  // Enhanced Page Loader
  function showPageLoader(text = 'Loading...') {
    const existingLoader = document.getElementById('pageLoader');
    if (existingLoader) return;

    const loaderHTML = `
      <div class="page-loader" id="pageLoader">
        <div class="loader-content">
          <div class="loader-spinner"></div>
          <div class="loader-text">${text}</div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', loaderHTML);
  }

  function hidePageLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) {
      loader.classList.add('hidden');
      setTimeout(() => {
        loader.remove();
      }, 600);
    }
  }

  // Enhanced Feedback Flash Messages
  function showFeedbackFlash(message, type = 'success', duration = 3000) {
    const existingFlash = document.querySelector('.feedback-flash');
    if (existingFlash) {
      existingFlash.remove();
    }

    const flashHTML = `
      <div class="feedback-flash ${type}" id="feedbackFlash">
        ${escapeHtml(message)}
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', flashHTML);

    const flash = document.getElementById('feedbackFlash');
    
    // Show with animation
    setTimeout(() => {
      flash.classList.add('visible');
    }, 100);

    // Hide after duration
    setTimeout(() => {
      flash.classList.remove('visible');
      setTimeout(() => {
        flash.remove();
      }, 400);
    }, duration);
  }

  // Enhanced Tooltip System
  function createTooltip(element, text, position = 'top') {
    if (!element || !text) return;

    const tooltipId = `tooltip-${Date.now()}`;
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.id = tooltipId;
    tooltip.textContent = text;
    tooltip.setAttribute('role', 'tooltip');

    document.body.appendChild(tooltip);

    function showTooltip() {
      const rect = element.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();

      let top, left;

      switch (position) {
        case 'top':
          top = rect.top - tooltipRect.height - 10;
          left = rect.left + (rect.width - tooltipRect.width) / 2;
          break;
        case 'bottom':
          top = rect.bottom + 10;
          left = rect.left + (rect.width - tooltipRect.width) / 2;
          break;
        case 'left':
          top = rect.top + (rect.height - tooltipRect.height) / 2;
          left = rect.left - tooltipRect.width - 10;
          break;
        case 'right':
          top = rect.top + (rect.height - tooltipRect.height) / 2;
          left = rect.right + 10;
          break;
        default:
          top = rect.top - tooltipRect.height - 10;
          left = rect.left + (rect.width - tooltipRect.width) / 2;
      }

      // Keep tooltip within viewport
      const padding = 10;
      top = Math.max(padding, Math.min(top, window.innerHeight - tooltipRect.height - padding));
      left = Math.max(padding, Math.min(left, window.innerWidth - tooltipRect.width - padding));

      tooltip.style.top = `${top}px`;
      tooltip.style.left = `${left}px`;
      tooltip.classList.add('visible');

      element.setAttribute('aria-describedby', tooltipId);
    }

    function hideTooltip() {
      tooltip.classList.remove('visible');
      element.removeAttribute('aria-describedby');
      setTimeout(() => {
        if (tooltip.parentNode) {
          tooltip.parentNode.removeChild(tooltip);
        }
      }, 300);
    }

    element.addEventListener('mouseenter', showTooltip);
    element.addEventListener('mouseleave', hideTooltip);
    element.addEventListener('focus', showTooltip);
    element.addEventListener('blur', hideTooltip);

    return { show: showTooltip, hide: hideTooltip };
  }

  // Enhanced Scroll Progress Indicator
  function initializeScrollProgress() {
    const indicator = document.createElement('div');
    indicator.className = 'scroll-indicator';
    indicator.innerHTML = '<div class="scroll-progress"></div>';
    document.body.appendChild(indicator);

    const progress = indicator.querySelector('.scroll-progress');

    function updateScrollProgress() {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const scrollPercent = (scrollTop / scrollHeight) * 100;

      progress.style.width = `${Math.min(100, Math.max(0, scrollPercent))}%`;

      if (scrollTop > 100) {
        indicator.classList.add('visible');
      } else {
        indicator.classList.remove('visible');
      }
    }

    let scrollTimeout;
    window.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(updateScrollProgress, 10);
    });

    updateScrollProgress();
  }

  // Enhanced Panel Transitions
  function enhancedShowPanel(id, skipAnimation = false) {
    const targetPanel = document.getElementById(id);
    if (!targetPanel || targetPanel === currentPanel) return;

    // Update navigation links with enhanced feedback
    links.forEach(a => {
      const isActive = a.getAttribute('data-target') === id;
      a.classList.toggle('active', isActive);
      if (isActive) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });

    if (skipAnimation) {
      // Immediate switch without animation
      panels.forEach(p => p.classList.remove('active', 'transitioning-out', 'transitioning-in'));
      targetPanel.classList.add('active');
      currentPanel = targetPanel;
    } else {
      // Enhanced smooth transition
      if (currentPanel) {
        currentPanel.classList.add('transitioning-out');
        setTimeout(() => {
          currentPanel.classList.remove('active', 'transitioning-out');
          targetPanel.classList.add('active', 'transitioning-in');
          
          setTimeout(() => {
            targetPanel.classList.remove('transitioning-in');
          }, 600);
          
          currentPanel = targetPanel;
        }, 400);
      } else {
        targetPanel.classList.add('active', 'transitioning-in');
        setTimeout(() => {
          targetPanel.classList.remove('transitioning-in');
        }, 600);
        currentPanel = targetPanel;
      }
    }

    localStorage.setItem('ui_active_panel', id);

    // Trigger panel-specific initialization with enhanced loading
    if (id === 'chatSection') {
      initializeChatPanel();
      showChatLoadingSkeleton();
    }

    // Announce panel change to screen readers
    announceToScreenReader(`Switched to ${targetPanel.querySelector('h2')?.textContent || id} panel`, 'polite');
  }

  // Enhanced Code Block Interactions
  function copyEnhancedCodeBlock(blockId) {
    const block = document.getElementById(blockId);
    if (!block) return;

    const codeElement = block.querySelector('.code-text code');
    if (!codeElement) return;

    const code = codeElement.textContent;
    
    navigator.clipboard.writeText(code).then(() => {
      const copyBtn = block.querySelector('.copy-btn');
      if (copyBtn) {
        const originalText = copyBtn.querySelector('.action-text').textContent;
        const originalIcon = copyBtn.querySelector('.action-icon').textContent;
        
        copyBtn.querySelector('.action-text').textContent = 'Copied!';
        copyBtn.querySelector('.action-icon').textContent = '✓';
        copyBtn.classList.add('success');
        
        setTimeout(() => {
          copyBtn.querySelector('.action-text').textContent = originalText;
          copyBtn.querySelector('.action-icon').textContent = originalIcon;
          copyBtn.classList.remove('success');
        }, 2000);
      }
      
      showFeedbackFlash('Code copied to clipboard!', 'success', 2000);
      announceToScreenReader('Code copied to clipboard', 'polite');
    }).catch(() => {
      showFeedbackFlash('Failed to copy code', 'error', 3000);
      announceToScreenReader('Failed to copy code', 'assertive');
    });
  }

  function toggleCodeExpansion(blockId) {
    const block = document.getElementById(blockId);
    if (!block) return;

    const content = block.querySelector('.code-content');
    const expandBtn = block.querySelector('.expand-btn');
    
    if (!content || !expandBtn) return;

    const isExpanded = expandBtn.getAttribute('aria-expanded') === 'true';
    
    if (isExpanded) {
      content.style.maxHeight = '200px';
      expandBtn.setAttribute('aria-expanded', 'false');
      expandBtn.querySelector('.action-text').textContent = 'Expand';
      expandBtn.querySelector('.action-icon').textContent = '⛶';
      announceToScreenReader('Code block collapsed', 'polite');
    } else {
      content.style.maxHeight = 'none';
      expandBtn.setAttribute('aria-expanded', 'true');
      expandBtn.querySelector('.action-text').textContent = 'Collapse';
      expandBtn.querySelector('.action-icon').textContent = '⛷';
      announceToScreenReader('Code block expanded', 'polite');
    }
  }

  // Enhanced File Reference Interactions
  function handleFileRefClick(file, type, name, path) {
    // Add visual feedback
    const fileRefs = document.querySelectorAll('.file-ref');
    fileRefs.forEach(ref => {
      if (ref.dataset.filePath === path) {
        ref.classList.add('clicked');
        setTimeout(() => {
          ref.classList.remove('clicked');
        }, 300);
      }
    });

    // Show tooltip with file info
    const clickedRef = event.target.closest('.file-ref');
    if (clickedRef) {
      createTooltip(clickedRef, `${type.toUpperCase()} file: ${name}`, 'bottom');
    }

    showFeedbackFlash(`File reference: ${file}`, 'success', 2000);
    announceToScreenReader(`File reference clicked: ${file}`, 'polite');
    
    log('Chat', 'File reference clicked', { file, type, name, path });
  }

  // Enhanced Auto-resize for Textarea
  function initializeAutoResize() {
    const textarea = document.getElementById('chatInput');
    if (!textarea) return;

    function autoResize() {
      textarea.style.height = 'auto';
      const newHeight = Math.min(Math.max(textarea.scrollHeight, 120), 300);
      textarea.style.height = `${newHeight}px`;
      
      // Add resize class for smooth animation
      textarea.classList.add('auto-resizing');
      setTimeout(() => {
        textarea.classList.remove('auto-resizing');
      }, 200);
    }

    textarea.addEventListener('input', autoResize);
    textarea.addEventListener('paste', () => {
      setTimeout(autoResize, 10);
    });

    // Initial resize
    autoResize();
  }

  // Enhanced Stagger Animation System
  function addStaggerAnimation(container, delay = 100) {
    if (!container) return;

    const children = Array.from(container.children);
    container.classList.add('stagger-animation');
    
    children.forEach((child, index) => {
      child.style.animationDelay = `${index * delay}ms`;
    });
  }

  // Enhanced Particle System (optional, for special effects)
  function createParticleEffect(container, count = 20) {
    if (!container || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const particleContainer = document.createElement('div');
    particleContainer.className = 'particle-container';
    container.appendChild(particleContainer);

    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 8}s`;
      particle.style.animationDuration = `${8 + Math.random() * 4}s`;
      particleContainer.appendChild(particle);
    }

    // Clean up particles after animation
    setTimeout(() => {
      if (particleContainer.parentNode) {
        particleContainer.parentNode.removeChild(particleContainer);
      }
    }, 12000);
  }

  // Initialize Enhanced Features
  function initializeEnhancedFeatures() {
    // Initialize scroll progress
    initializeScrollProgress();
    
    // Initialize auto-resize
    initializeAutoResize();
    
    // Add tooltips to key elements
    const elements = [
      { selector: '#chatStream', text: 'Send message (Ctrl+Enter)', position: 'top' },
      { selector: '#toggleNav', text: 'Toggle navigation', position: 'bottom' },
      { selector: '.nav-link', text: 'Switch panel', position: 'right' }
    ];

    elements.forEach(({ selector, text, position }) => {
      const element = document.querySelector(selector);
      if (element) {
        createTooltip(element, text, position);
      }
    });

    // Add stagger animations to navigation
    const navContainer = document.querySelector('.nav-group');
    if (navContainer) {
      addStaggerAnimation(navContainer, 50);
    }

    // Initialize enhanced panel switching
    links.forEach(a => {
      a.removeEventListener('click', showPanel); // Remove old listener
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const id = a.getAttribute('data-target');
        if (id) {
          enhancedShowPanel(id);

          // Auto-close mobile nav after selection
          if (window.innerWidth <= 968) {
            setTimeout(() => setNavCollapsed(true), 300);
          }
        }
      });
    });

    log('Chat', 'Enhanced features initialized', {
      scrollProgress: true,
      autoResize: true,
      tooltips: true,
      staggerAnimations: true,
      enhancedTransitions: true
    });
  }

  // Enhanced Markdown renderer with developer-focused features
  function renderMarkdown(md) {
    if (md == null) return '';
    let text = String(md);

    // Extract fenced code blocks first to avoid interfering with inline parsing
    const codeBlocks = [];
    text = text.replace(/```([a-z0-9_+-]+)?\n([\s\S]*?)```/gi, (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'text', code: code.trim() });
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
      return renderEnhancedCodeBlock(lang, code);
    });

    // Restore file references with enhanced styling and metadata
    text = text.replace(/@@FILEREF_(\d+)@@/g, (m, n) => {
      const file = fileRefs[Number(n)] || '';
      const fileIcon = getFileIcon(file);
      const fileType = getFileType(file);
      const fileName = getFileName(file);
      const filePath = getFilePath(file);

      return `<span class="file-ref" 
        data-file-type="${fileType}" 
        data-file-name="${escapeHtml(fileName)}" 
        data-file-path="${escapeHtml(filePath)}"
        title="File: ${escapeHtml(file)}" 
        onclick="handleFileRefClick('${escapeHtml(file)}', '${fileType}', '${escapeHtml(fileName)}', '${escapeHtml(filePath)}')"
        onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"
        tabindex="0"
        role="button"
        aria-label="File reference: ${escapeHtml(file)}, ${fileType} file"
        aria-describedby="file-ref-help">
        <span class="file-icon" aria-hidden="true">${fileIcon}</span>
        <code>${escapeHtml(file)}</code>
        <span id="file-ref-help" class="sr-only">Press Enter or Space to interact with this file reference</span>
      </span>`;
    });

    return text;
  }

  // Enhanced code block renderer with advanced features
  function renderEnhancedCodeBlock(language, code) {
    const safe = escapeHtml(code);
    const langIcon = getLanguageIcon(language);
    const langName = getLanguageDisplayName(language);
    const lines = code.split('\n');
    const lineCount = lines.length;
    const isLongCode = lineCount > 20;
    const blockId = `code-block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Generate line numbers
    const lineNumbers = lines.map((_, i) => i + 1).join('\n');

    return `
      <div class="code-block-enhanced" 
           data-language="${language}" 
           id="${blockId}"
           role="region"
           aria-labelledby="${blockId}-header"
           aria-describedby="${blockId}-info">
        <div class="code-header" id="${blockId}-header">
          <div class="code-info" id="${blockId}-info">
            <span class="language-badge">
              <span class="language-icon" aria-hidden="true">${langIcon}</span>
              <span class="language-name">${langName}</span>
            </span>
            <span class="line-count" aria-label="${lineCount} lines of code">${lineCount} line${lineCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="code-actions" role="toolbar" aria-label="Code block actions">
            <button class="code-action-btn copy-btn" 
                    onclick="copyEnhancedCodeBlock('${blockId}')" 
                    title="Copy code to clipboard"
                    aria-label="Copy ${langName} code to clipboard">
              <span class="action-icon" aria-hidden="true">📋</span>
              <span class="action-text">Copy</span>
            </button>
            ${isLongCode ? `
              <button class="code-action-btn expand-btn" 
                      onclick="toggleCodeExpansion('${blockId}')" 
                      title="Expand or collapse code block"
                      aria-label="Expand or collapse code block"
                      aria-expanded="false">
                <span class="action-icon" aria-hidden="true">⛶</span>
                <span class="action-text">Expand</span>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="code-content ${isLongCode ? 'collapsible' : ''}" 
             role="textbox" 
             aria-readonly="true" 
             aria-multiline="true"
             aria-label="${langName} code, ${lineCount} lines">
          <div class="line-numbers" aria-hidden="true">${lineNumbers}</div>
          <pre class="code-text" tabindex="0"><code class="language-${language}">${safe}</code></pre>
        </div>
      </div>
    `;
  }

  function getLanguageIcon(lang) {
    const icons = {
      // JavaScript & TypeScript
      javascript: '🟨', js: '🟨', jsx: '⚛️',
      typescript: '🔷', ts: '🔷', tsx: '⚛️',

      // Python
      python: '🐍', py: '🐍', python3: '🐍',

      // Java & JVM languages
      java: '☕', kotlin: '🟣', scala: '🔴', groovy: '🟢',

      // C/C++
      c: '⚙️', cpp: '⚙️', 'c++': '⚙️', cc: '⚙️', cxx: '⚙️',

      // Other systems languages
      go: '🐹', rust: '🦀', zig: '⚡', carbon: '💎',

      // Web languages
      php: '🐘', ruby: '💎', rb: '💎', perl: '🐪',

      // Web technologies
      html: '🌐', htm: '🌐', css: '🎨', scss: '🎨', sass: '🎨', less: '🎨',

      // Shell & scripting
      bash: '💻', sh: '💻', zsh: '💻', fish: '🐠', powershell: '💙', ps1: '💙',

      // Data & config
      json: '📄', xml: '📄', yaml: '⚙️', yml: '⚙️', toml: '⚙️', ini: '⚙️',

      // Database
      sql: '🗄️', mysql: '🗄️', postgresql: '🐘', sqlite: '📊',

      // Functional languages
      haskell: '🎩', elm: '🌳', clojure: '🟢', lisp: '🟣',

      // Mobile
      swift: '🍎', dart: '🎯', flutter: '💙',

      // Other
      r: '📊', matlab: '📊', lua: '🌙', vim: '💚', dockerfile: '🐳',
      makefile: '🔨', cmake: '🔨', gradle: '🐘',

      // Markup & docs
      markdown: '📝', md: '📝', tex: '📖', latex: '📖',

      // Default
      text: '📝', plain: '📝', txt: '📝'
    };
    return icons[lang.toLowerCase()] || '📄';
  }

  function getLanguageDisplayName(lang) {
    const names = {
      js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX',
      py: 'Python', python3: 'Python 3', rb: 'Ruby',
      cpp: 'C++', 'c++': 'C++', cc: 'C++', cxx: 'C++',
      cs: 'C#', fs: 'F#', vb: 'VB.NET',
      sh: 'Shell', bash: 'Bash', zsh: 'Zsh', fish: 'Fish',
      ps1: 'PowerShell', powershell: 'PowerShell',
      yml: 'YAML', yaml: 'YAML', toml: 'TOML', ini: 'INI',
      sql: 'SQL', mysql: 'MySQL', postgresql: 'PostgreSQL',
      md: 'Markdown', tex: 'LaTeX', latex: 'LaTeX',
      dockerfile: 'Dockerfile', makefile: 'Makefile',
      cmake: 'CMake', gradle: 'Gradle',
      html: 'HTML', htm: 'HTML', css: 'CSS',
      scss: 'SCSS', sass: 'Sass', less: 'Less',
      json: 'JSON', xml: 'XML',
      text: 'Plain Text', plain: 'Plain Text', txt: 'Text'
    };

    const lower = lang.toLowerCase();
    return names[lower] || lang.charAt(0).toUpperCase() + lang.slice(1);
  }

  function getFileIcon(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const icons = {
      // JavaScript & TypeScript
      js: '🟨', jsx: '⚛️', ts: '🔷', tsx: '⚛️',

      // Python
      py: '🐍', pyw: '🐍', pyi: '🐍',

      // Java & JVM
      java: '☕', kt: '🟣', scala: '🔴', groovy: '🟢',

      // C/C++
      c: '⚙️', cpp: '⚙️', cc: '⚙️', cxx: '⚙️', h: '⚙️', hpp: '⚙️',

      // Other systems languages
      go: '🐹', rs: '🦀', zig: '⚡', carbon: '💎',

      // Web languages
      php: '🐘', rb: '💎', perl: '🐪', pl: '🐪',

      // Web technologies
      html: '🌐', htm: '🌐', css: '🎨', scss: '🎨', sass: '🎨', less: '🎨',

      // Shell & scripting
      sh: '💻', bash: '💻', zsh: '💻', fish: '🐠', ps1: '💙', bat: '💻', cmd: '💻',

      // Data & config
      json: '📄', xml: '📄', yaml: '⚙️', yml: '⚙️', toml: '⚙️', ini: '⚙️', cfg: '⚙️',

      // Database
      sql: '🗄️', mysql: '🗄️', pgsql: '🐘', sqlite: '📊',

      // Functional languages
      hs: '🎩', elm: '🌳', clj: '🟢', lisp: '🟣', ml: '🧠',

      // Mobile
      swift: '🍎', dart: '🎯', flutter: '💙',

      // Other
      r: '📊', m: '📊', lua: '🌙', vim: '💚',

      // Docker & Infrastructure
      dockerfile: '🐳', docker: '🐳',
      makefile: '🔨', cmake: '🔨', gradle: '🐘', maven: '🐘',

      // Markup & docs
      md: '📝', markdown: '📝', tex: '📖', latex: '📖', rst: '📖',

      // Archives & binaries
      zip: '📦', tar: '📦', gz: '📦', rar: '📦', '7z': '📦',
      exe: '⚙️', dll: '⚙️', so: '⚙️', dylib: '⚙️',

      // Images
      png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🎨', ico: '🖼️',

      // Logs & text
      log: '📋', txt: '📝', text: '📝', out: '📋',

      // Default
      '': '📄'
    };
    return icons[ext] || '📄';
  }

  function getFileType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const typeMap = {
      js: 'javascript', jsx: 'javascript',
      ts: 'typescript', tsx: 'typescript',
      py: 'python', pyw: 'python', pyi: 'python',
      java: 'java', kt: 'kotlin', scala: 'scala',
      c: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp',
      go: 'go', rs: 'rust', zig: 'zig',
      php: 'php', rb: 'ruby', pl: 'perl',
      html: 'html', htm: 'html',
      css: 'css', scss: 'css', sass: 'css', less: 'css',
      sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell',
      ps1: 'powershell', bat: 'batch', cmd: 'batch',
      json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
      sql: 'sql', mysql: 'sql', pgsql: 'sql',
      md: 'markdown', markdown: 'markdown',
      txt: 'text', log: 'log'
    };
    return typeMap[ext] || 'unknown';
  }

  function getFileName(filePath) {
    return filePath.split(/[/\\]/).pop() || filePath;
  }

  function getFilePath(filePath) {
    const parts = filePath.split(/[/\\]/);
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '';
  }

  function getFileSize(filePath) {
    // This would typically require file system access
    // For now, return a placeholder or estimate based on file type
    const ext = filePath.split('.').pop()?.toLowerCase();
    const estimates = {
      js: '2-50 KB', ts: '2-50 KB', py: '1-20 KB',
      css: '1-100 KB', html: '1-50 KB', json: '1-10 KB',
      md: '1-20 KB', txt: '1-10 KB', log: '1-1 MB'
    };
    return estimates[ext] || 'Unknown';
  }

  // Handle vnext streaming event format
  function handleVNextStreamEvent(data, renderer, onDelta, onError, getCurrentResponse) {
    if (!data || !data.type) return;

    log('Chat', 'Stream event', { type: data.type, runId: data.runId });

    switch (data.type) {
      case 'start':
        log('Chat', 'Stream started', data.payload);

        // Update connection status and progress
        updateConnectionStatus('connected', 'Streaming...');
        hideProgressIndicator();
        showProgressIndicator('Receiving response...');
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

        // Hide progress indicators and update connection status
        hideProgressIndicator();
        updateConnectionStatus('connected', 'Ready');

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

  // Enhanced copy functionality for code blocks
  window.copyEnhancedCodeBlock = function (blockId) {
    const codeBlock = document.getElementById(blockId);
    if (!codeBlock) return;

    const code = codeBlock.querySelector('.code-text code').textContent;
    const copyBtn = codeBlock.querySelector('.copy-btn');
    const icon = copyBtn.querySelector('.action-icon');
    const text = copyBtn.querySelector('.action-text');
    const language = codeBlock.dataset.language || 'code';

    navigator.clipboard.writeText(code).then(() => {
      // Visual feedback animation
      const originalIcon = icon.textContent;
      const originalText = text.textContent;
      const originalLabel = copyBtn.getAttribute('aria-label');

      icon.textContent = '✅';
      text.textContent = 'Copied!';
      copyBtn.classList.add('success');
      copyBtn.setAttribute('aria-label', `${language} code copied to clipboard`);

      // Announce to screen readers
      announceToScreenReader(`${language} code copied to clipboard`, 'polite');

      // Create ripple effect
      const ripple = document.createElement('div');
      ripple.className = 'copy-ripple';
      copyBtn.appendChild(ripple);

      setTimeout(() => {
        icon.textContent = originalIcon;
        text.textContent = originalText;
        copyBtn.classList.remove('success');
        copyBtn.setAttribute('aria-label', originalLabel);
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple);
        }
      }, 2000);

      log('Code', 'Code copied to clipboard', { language: codeBlock.dataset.language, lines: code.split('\n').length });
    }).catch(err => {
      console.error('Failed to copy code:', err);
      const originalIcon = icon.textContent;
      const originalText = text.textContent;

      icon.textContent = '❌';
      text.textContent = 'Failed';
      copyBtn.classList.add('error');

      // Announce error to screen readers
      announceToScreenReader('Failed to copy code to clipboard', 'assertive');

      setTimeout(() => {
        icon.textContent = originalIcon;
        text.textContent = originalText;
        copyBtn.classList.remove('error');
      }, 2000);
    });
  };

  // Toggle code block expansion for long code snippets
  window.toggleCodeExpansion = function (blockId) {
    const codeBlock = document.getElementById(blockId);
    if (!codeBlock) return;

    const content = codeBlock.querySelector('.code-content');
    const expandBtn = codeBlock.querySelector('.expand-btn');
    const icon = expandBtn.querySelector('.action-icon');
    const text = expandBtn.querySelector('.action-text');

    const isExpanded = content.classList.contains('expanded');

    if (isExpanded) {
      content.classList.remove('expanded');
      icon.textContent = '⛶';
      text.textContent = 'Expand';

      log('Code', 'Code block collapsed', { blockId });
    } else {
      content.classList.add('expanded');
      icon.textContent = '⛷';
      text.textContent = 'Collapse';

      log('Code', 'Code block expanded', { blockId });
    }
  };

  // Toggle thinking section expand/collapse
  window.toggleThinkingSection = function (button) {
    const thinkingBlock = button.closest('.enhanced-thinking');
    if (!thinkingBlock) return;

    const content = thinkingBlock.querySelector('.thinking-content');
    const icon = button.querySelector('.toggle-icon');
    const text = button.querySelector('.toggle-text');

    if (!content) return;

    const isExpanded = content.classList.contains('expanded');

    if (isExpanded) {
      // Collapse
      content.classList.remove('expanded');
      content.classList.add('collapsed');
      icon.textContent = '▶';
      text.textContent = 'Expand';

      // Add collapse animation
      content.style.maxHeight = content.scrollHeight + 'px';
      setTimeout(() => {
        content.style.maxHeight = '0px';
      }, 10);

      log('Chat', 'Thinking section collapsed');
    } else {
      // Expand
      content.classList.remove('collapsed');
      content.classList.add('expanded');
      icon.textContent = '▼';
      text.textContent = 'Collapse';

      // Add expand animation
      content.style.maxHeight = '0px';
      setTimeout(() => {
        content.style.maxHeight = content.scrollHeight + 'px';
        setTimeout(() => {
          content.style.maxHeight = 'none';
        }, 300);
      }, 10);

      log('Chat', 'Thinking section expanded');
    }
  };

  // Toggle tool call section expand/collapse
  window.toggleToolCallSection = function (button) {
    const toolBlock = button.closest('.enhanced-tool-call, .enhanced-tool-result');
    if (!toolBlock) return;

    const content = toolBlock.querySelector('.tool-content');
    const icon = button.querySelector('.toggle-icon');
    const text = button.querySelector('.toggle-text');

    if (!content) return;

    const isExpanded = content.classList.contains('expanded');

    if (isExpanded) {
      // Collapse
      content.classList.remove('expanded');
      content.classList.add('collapsed');
      icon.textContent = '▶';
      text.textContent = 'Expand';

      // Add collapse animation
      content.style.maxHeight = content.scrollHeight + 'px';
      setTimeout(() => {
        content.style.maxHeight = '0px';
      }, 10);

      log('Chat', 'Tool call section collapsed', { toolId: toolBlock.dataset.toolId });
    } else {
      // Expand
      content.classList.remove('collapsed');
      content.classList.add('expanded');
      icon.textContent = '▼';
      text.textContent = 'Collapse';

      // Add expand animation
      content.style.maxHeight = '0px';
      setTimeout(() => {
        content.style.maxHeight = content.scrollHeight + 'px';
        setTimeout(() => {
          content.style.maxHeight = 'none';
        }, 300);
      }, 10);

      log('Chat', 'Tool call section expanded', { toolId: toolBlock.dataset.toolId });
    }
  };

  // Toggle code block expansion for long code snippets
  window.toggleCodeExpansion = function (blockId) {
    const codeBlock = document.getElementById(blockId);
    if (!codeBlock) return;

    const content = codeBlock.querySelector('.code-content');
    const expandBtn = codeBlock.querySelector('.expand-btn');
    const icon = expandBtn.querySelector('.action-icon');
    const text = expandBtn.querySelector('.action-text');
    const language = codeBlock.dataset.language || 'code';

    const isExpanded = content.classList.contains('expanded');

    if (isExpanded) {
      content.classList.remove('expanded');
      icon.textContent = '⛶';
      text.textContent = 'Expand';
      codeBlock.classList.remove('expanded');
      expandBtn.setAttribute('aria-expanded', 'false');
      expandBtn.setAttribute('aria-label', `Expand ${language} code block`);

      // Announce to screen readers
      if (typeof announceToScreenReader === 'function') {
        announceToScreenReader(`${language} code block collapsed`, 'polite');
      }

      log('Code', 'Code block collapsed', { blockId, language });
    } else {
      content.classList.add('expanded');
      icon.textContent = '⛷';
      text.textContent = 'Collapse';
      codeBlock.classList.add('expanded');
      expandBtn.setAttribute('aria-expanded', 'true');
      expandBtn.setAttribute('aria-label', `Collapse ${language} code block`);

      // Announce to screen readers
      if (typeof announceToScreenReader === 'function') {
        announceToScreenReader(`${language} code block expanded`, 'polite');
      }

      log('Code', 'Code block expanded', { blockId, language });
    }
  };

  // Enhanced file reference click handler with tooltip system
  window.handleFileRefClick = function (filePath, fileType = '', fileName = '', fileDir = '', event) {
    // Use the event from the click or create a synthetic one
    const clickEvent = event || window.event;

    log('File', 'File reference clicked', {
      path: filePath,
      type: fileType,
      name: fileName,
      directory: fileDir
    });

    // Remove any existing tooltips
    const existingTooltips = document.querySelectorAll('.file-tooltip');
    existingTooltips.forEach(tooltip => tooltip.remove());

    // Create enhanced tooltip with metadata
    const tooltip = document.createElement('div');
    tooltip.className = 'file-tooltip';

    const fileIcon = getFileIcon(filePath);
    const displayName = fileName || getFileName(filePath);
    const displayPath = fileDir || getFilePath(filePath);
    const displayType = fileType || getFileType(filePath);
    const estimatedSize = getFileSize(filePath);

    tooltip.innerHTML = `
      <div class="tooltip-content">
        <div class="tooltip-header">
          <span class="file-icon">${fileIcon}</span>
          <span class="file-name">${escapeHtml(displayName)}</span>
        </div>
        
        <div class="tooltip-metadata">
          <span class="label">Path:</span>
          <span class="value">${escapeHtml(displayPath || '.')}</span>
          
          <span class="label">Type:</span>
          <span class="value">${escapeHtml(displayType)}</span>
          
          <span class="label">Size:</span>
          <span class="value">${estimatedSize}</span>
          
          <span class="label">Full Path:</span>
          <span class="value">${escapeHtml(filePath)}</span>
        </div>
        
        <div class="tooltip-actions">
          <button onclick="copyFilePathToClipboard('${escapeHtml(filePath)}', this)" title="Copy full file path">
            <span class="icon">📋</span>
            Copy Path
          </button>
          <button onclick="copyFileNameToClipboard('${escapeHtml(displayName)}', this)" title="Copy file name only">
            <span class="icon">📄</span>
            Copy Name
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(tooltip);

    // Position tooltip intelligently
    if (clickEvent && clickEvent.target) {
      const rect = clickEvent.target.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let top = rect.bottom + 8;
      let left = rect.left;

      // Adjust horizontal position if tooltip would overflow
      if (left + tooltipRect.width > viewportWidth - 20) {
        left = viewportWidth - tooltipRect.width - 20;
      }
      if (left < 20) {
        left = 20;
      }

      // Adjust vertical position if tooltip would overflow
      if (top + tooltipRect.height > viewportHeight - 20) {
        top = rect.top - tooltipRect.height - 8;
      }
      if (top < 20) {
        top = 20;
      }

      tooltip.style.position = 'fixed';
      tooltip.style.top = top + 'px';
      tooltip.style.left = left + 'px';
      tooltip.style.zIndex = '10000';
    }

    // Add click outside to close
    setTimeout(() => {
      const closeTooltip = (e) => {
        if (!tooltip.contains(e.target)) {
          tooltip.remove();
          document.removeEventListener('click', closeTooltip);
          document.removeEventListener('keydown', handleKeydown);
        }
      };

      const handleKeydown = (e) => {
        if (e.key === 'Escape') {
          tooltip.remove();
          document.removeEventListener('click', closeTooltip);
          document.removeEventListener('keydown', handleKeydown);
        }
      };

      document.addEventListener('click', closeTooltip);
      document.addEventListener('keydown', handleKeydown);
    }, 100);

    // Auto-remove after 10 seconds as fallback
    setTimeout(() => {
      if (tooltip.parentNode) {
        tooltip.remove();
      }
    }, 10000);

    // Prevent event bubbling
    if (clickEvent) {
      clickEvent.stopPropagation();
      clickEvent.preventDefault();
    }
  };

  // Enhanced clipboard functions for file references
  window.copyFilePathToClipboard = function (filePath, button) {
    navigator.clipboard.writeText(filePath).then(() => {
      const originalText = button.innerHTML;
      button.innerHTML = '<span class="icon">✅</span>Copied!';
      button.style.background = 'var(--success)';
      button.style.color = 'white';

      setTimeout(() => {
        button.innerHTML = originalText;
        button.style.background = '';
        button.style.color = '';
      }, 2000);

      log('File', 'File path copied to clipboard', { path: filePath });
    }).catch(err => {
      console.error('Failed to copy file path:', err);
      const originalText = button.innerHTML;
      button.innerHTML = '<span class="icon">❌</span>Failed';
      button.style.background = 'var(--error)';
      button.style.color = 'white';

      setTimeout(() => {
        button.innerHTML = originalText;
        button.style.background = '';
        button.style.color = '';
      }, 2000);
    });
  };

  window.copyFileNameToClipboard = function (fileName, button) {
    navigator.clipboard.writeText(fileName).then(() => {
      const originalText = button.innerHTML;
      button.innerHTML = '<span class="icon">✅</span>Copied!';
      button.style.background = 'var(--success)';
      button.style.color = 'white';

      setTimeout(() => {
        button.innerHTML = originalText;
        button.style.background = '';
        button.style.color = '';
      }, 2000);

      log('File', 'File name copied to clipboard', { name: fileName });
    }).catch(err => {
      console.error('Failed to copy file name:', err);
      const originalText = button.innerHTML;
      button.innerHTML = '<span class="icon">❌</span>Failed';
      button.style.background = 'var(--error)';
      button.style.color = 'white';

      setTimeout(() => {
        button.innerHTML = originalText;
        button.style.background = '';
        button.style.color = '';
      }, 2000);
    });
  };

  // Utility function for copying text
  window.copyToClipboard = function (text) {
    navigator.clipboard.writeText(text).then(() => {
      log('System', 'Text copied to clipboard', { text });
    }).catch(err => {
      console.error('Failed to copy text:', err);
    });
  };

  // Legacy function for backward compatibility
  window.copyCodeBlock = function (button) {
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

  function setStatus(ok, text) {
    apiStatus.textContent = `Status: ${text}`;
    apiStatus.className = 'status ' + (ok ? 'ok' : 'err');
  }

  // Ping API
  $('#pingApi').addEventListener('click', async () => {
    const url = apiBase() + '/';
    log('API', 'PING ' + url);

    // Update connection status to connecting
    if (typeof updateConnectionStatus === 'function') {
      updateConnectionStatus('connecting', 'Testing...');
    }

    try {
      const res = await fetch(url, { method: 'GET' });
      const isOnline = res.ok;
      setStatus(isOnline, isOnline ? 'online' : 'error ' + res.status);

      // Update connection status for chat
      if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus(isOnline ? 'connected' : 'disconnected',
          isOnline ? 'Ready' : `Error ${res.status}`);
      }

      log('API', 'PING response status ' + res.status);
    } catch (e) {
      setStatus(false, 'offline');

      // Update connection status for chat
      if (typeof updateConnectionStatus === 'function') {
        updateConnectionStatus('disconnected', 'Offline');
      }

      log('API', 'PING error', String(e));
    }
  });

  // Logs controls
  function clearAllLogs() {
    const mainContent = logsEl.querySelector('.log-content');
    if (mainContent) mainContent.innerHTML = '';

    if (logsDrawerEl) {
      const drawerContent = logsDrawerEl.querySelector('.log-content');
      if (drawerContent) drawerContent.innerHTML = '';
    }
  }
  $('#clearLogs').addEventListener('click', clearAllLogs);
  const clearDrawerBtn = document.querySelector('#clearLogsDrawer');
  if (clearDrawerBtn) clearDrawerBtn.addEventListener('click', clearAllLogs);

  // Terminal drawer toggle with enhanced functionality
  function setTerminalOpen(open) {
    if (!terminalDrawer || !toggleTerminalBtn) return;
    terminalDrawer.classList.toggle('open', open);
    terminalDrawer.setAttribute('aria-expanded', String(open));
    toggleTerminalBtn.setAttribute('aria-expanded', String(open));
    toggleTerminalBtn.textContent = open ? '▼' : '▲';
    document.body.classList.toggle('terminal-open', open);
    localStorage.setItem('terminal_open', open ? '1' : '0');

    // Auto-scroll to bottom when opening
    if (open && logsDrawerEl) {
      setTimeout(() => {
        const drawerContent = logsDrawerEl.querySelector('.log-content');
        if (drawerContent && autoScrollDrawer && autoScrollDrawer.checked) {
          drawerContent.scrollTop = drawerContent.scrollHeight;
        }
      }, 100);
    }
  }

  if (toggleTerminalBtn) {
    toggleTerminalBtn.addEventListener('click', () => {
      const isOpen = terminalDrawer.classList.contains('open');
      setTerminalOpen(!isOpen);
    });
    const saved = localStorage.getItem('terminal_open');
    setTerminalOpen(saved === '1');
  }

  // Enhanced keyboard shortcuts including file reference support
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + ` to toggle terminal (like VS Code)
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      if (terminalDrawer && toggleTerminalBtn) {
        const isOpen = terminalDrawer.classList.contains('open');
        setTerminalOpen(!isOpen);
      }
    }

    // Escape to close terminal when focused
    if (e.key === 'Escape' && terminalDrawer && terminalDrawer.classList.contains('open')) {
      const activeElement = document.activeElement;
      if (terminalDrawer.contains(activeElement) || activeElement === document.body) {
        setTerminalOpen(false);
      }
    }

    // Ctrl/Cmd + K to clear logs when terminal is focused
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      const activeElement = document.activeElement;
      if (terminalDrawer && terminalDrawer.contains(activeElement)) {
        e.preventDefault();
        clearAllLogs();
        log('System', 'Logs cleared via keyboard shortcut');
      }
    }

    // File reference keyboard interactions
    const activeElement = document.activeElement;
    if (activeElement && activeElement.classList.contains('file-ref')) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activeElement.click();
      }
    }
  });

  // Add keyboard navigation support for file references
  document.addEventListener('click', (e) => {
    // Handle file reference clicks with proper event passing
    if (e.target.closest('.file-ref')) {
      const fileRef = e.target.closest('.file-ref');
      const filePath = fileRef.getAttribute('data-file-path') + '/' + fileRef.getAttribute('data-file-name');
      const fileType = fileRef.getAttribute('data-file-type');
      const fileName = fileRef.getAttribute('data-file-name');
      const fileDir = fileRef.getAttribute('data-file-path');

      // Call the enhanced handler with proper parameters
      handleFileRefClick(filePath.replace(/^\//, ''), fileType, fileName, fileDir, e);
    }
  });

  // Enhanced auto-scroll behavior
  function setupAutoScroll() {
    [logsEl, logsDrawerEl].forEach(container => {
      if (!container) return;

      const content = container.querySelector('.log-content') || container;
      let isUserScrolling = false;
      let scrollTimeout;

      content.addEventListener('scroll', () => {
        isUserScrolling = true;
        clearTimeout(scrollTimeout);

        // Check if user scrolled to bottom
        const isAtBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 10;
        const autoScrollCheckbox = container === logsEl ? autoScroll : autoScrollDrawer;

        if (isAtBottom && autoScrollCheckbox) {
          autoScrollCheckbox.checked = true;
        }

        scrollTimeout = setTimeout(() => {
          isUserScrolling = false;
        }, 1000);
      });
    });
  }

  // Initialize auto-scroll behavior
  setupAutoScroll();

  // Add terminal status and connection indicator
  function updateTerminalStatus() {
    const terminalTitle = document.querySelector('.terminal-title');
    if (terminalTitle) {
      const logCount = document.querySelectorAll('.log-entry').length;
      const originalText = terminalTitle.textContent.split(' - ')[0];
      terminalTitle.textContent = `${originalText} - ${logCount} entries`;
    }
  }

  // Update status periodically
  setInterval(updateTerminalStatus, 2000);

  // Add context menu for log entries
  document.addEventListener('contextmenu', (e) => {
    const logEntry = e.target.closest('.log-entry');
    if (logEntry) {
      e.preventDefault();

      // Create simple context menu
      const menu = document.createElement('div');
      menu.style.cssText = `
        position: fixed;
        top: ${e.clientY}px;
        left: ${e.clientX}px;
        background: var(--bg-surface);
        border: 1px solid var(--border-primary);
        border-radius: var(--radius-md);
        padding: var(--spacing-sm);
        z-index: 10000;
        box-shadow: var(--shadow-lg);
        font-size: 12px;
        min-width: 120px;
      `;

      const copyOption = document.createElement('div');
      copyOption.textContent = 'Copy log entry';
      copyOption.style.cssText = `
        padding: var(--spacing-xs) var(--spacing-sm);
        cursor: pointer;
        border-radius: var(--radius-sm);
        transition: background 0.2s ease;
      `;
      copyOption.addEventListener('mouseenter', () => {
        copyOption.style.background = 'var(--accent-light)';
      });
      copyOption.addEventListener('mouseleave', () => {
        copyOption.style.background = 'transparent';
      });
      copyOption.addEventListener('click', () => {
        const text = logEntry.textContent;
        navigator.clipboard.writeText(text).then(() => {
          log('System', 'Log entry copied to clipboard');
        });
        document.body.removeChild(menu);
      });

      menu.appendChild(copyOption);
      document.body.appendChild(menu);

      // Remove menu on click outside
      setTimeout(() => {
        document.addEventListener('click', function removeMenu() {
          if (document.body.contains(menu)) {
            document.body.removeChild(menu);
          }
          document.removeEventListener('click', removeMenu);
        });
      }, 100);
    }
  });

  // Enhanced file reference interactions
  function initializeFileReferenceInteractions() {
    // Add hover effects and interactions for dynamically created file references
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest('.file-ref')) {
        const fileRef = e.target.closest('.file-ref');

        // Add subtle hover animation
        fileRef.style.transform = 'translateY(-2px) scale(1.05)';

        // Show file type in a small indicator
        const fileType = fileRef.getAttribute('data-file-type');
        if (fileType && !fileRef.querySelector('.file-type-indicator')) {
          const indicator = document.createElement('span');
          indicator.className = 'file-type-indicator';
          indicator.textContent = fileType.toUpperCase();
          indicator.style.cssText = `
            position: absolute;
            top: -8px;
            right: -8px;
            background: var(--accent-primary);
            color: white;
            font-size: 8px;
            padding: 2px 4px;
            border-radius: 3px;
            font-weight: bold;
            z-index: 1;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
          `;
          fileRef.style.position = 'relative';
          fileRef.appendChild(indicator);

          // Animate in
          setTimeout(() => {
            indicator.style.opacity = '1';
          }, 50);
        }
      }
    });

    document.addEventListener('mouseout', (e) => {
      if (e.target.closest('.file-ref')) {
        const fileRef = e.target.closest('.file-ref');

        // Reset hover animation
        fileRef.style.transform = '';

        // Remove file type indicator
        const indicator = fileRef.querySelector('.file-type-indicator');
        if (indicator) {
          indicator.style.opacity = '0';
          setTimeout(() => {
            if (indicator.parentNode) {
              indicator.parentNode.removeChild(indicator);
            }
          }, 200);
        }
      }
    });

    // Add focus management for accessibility
    document.addEventListener('focusin', (e) => {
      if (e.target.classList.contains('file-ref')) {
        e.target.style.outline = '2px solid var(--accent-primary)';
        e.target.style.outlineOffset = '2px';
      }
    });

    document.addEventListener('focusout', (e) => {
      if (e.target.classList.contains('file-ref')) {
        e.target.style.outline = '';
        e.target.style.outlineOffset = '';
      }
    });
  }

  // Initialize file reference interactions on page load
  initializeFileReferenceInteractions();

  // Initialize log containers on page load
  function initializeLogContainers() {
    // Ensure main logs container has proper structure
    ensureLogContent(logsEl);

    // Ensure drawer logs container has proper structure
    if (logsDrawerEl) {
      ensureLogContent(logsDrawerEl);
    }
  }

  // Initialize containers immediately
  initializeLogContainers();

  // Initialize accessibility features
  document.addEventListener('DOMContentLoaded', () => {
    enhanceKeyboardNavigation();

    // Set initial focus to main content for screen readers
    const mainContent = document.getElementById('chatSection');
    if (mainContent) {
      mainContent.setAttribute('tabindex', '-1');
    }

    // Initialize character count
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      updateCharacterCount(chatInput.value.length);
    }

    // Announce app ready state
    setTimeout(() => {
      announceToScreenReader('Code Agent UI loaded and ready', 'polite');
    }, 1000);
  });

  // Performance Optimization Functions

  // Virtual scrolling implementation for long conversations
  function initializeVirtualScrolling(container) {
    if (!container || virtualScrollEnabled) return;

    scrollContainer = container;
    virtualScrollEnabled = messageHistory.length > VIRTUAL_SCROLL_THRESHOLD;

    if (!virtualScrollEnabled) return;

    log('Performance', 'Virtual scrolling enabled', { messageCount: messageHistory.length });

    // Create virtual scroll wrapper
    const virtualWrapper = document.createElement('div');
    virtualWrapper.className = 'virtual-scroll-wrapper';
    virtualWrapper.style.cssText = `
      position: relative;
      height: 100%;
      overflow-y: auto;
      scroll-behavior: smooth;
    `;

    // Create virtual content container
    const virtualContent = document.createElement('div');
    virtualContent.className = 'virtual-scroll-content';
    virtualContent.style.cssText = `
      position: relative;
      min-height: 100%;
    `;

    // Create spacer elements for virtual scrolling
    const topSpacer = document.createElement('div');
    topSpacer.className = 'virtual-scroll-spacer-top';
    topSpacer.style.height = '0px';

    const bottomSpacer = document.createElement('div');
    bottomSpacer.className = 'virtual-scroll-spacer-bottom';
    bottomSpacer.style.height = '0px';

    // Setup virtual scroll structure
    virtualContent.appendChild(topSpacer);
    virtualContent.appendChild(bottomSpacer);
    virtualWrapper.appendChild(virtualContent);

    // Replace container content
    container.innerHTML = '';
    container.appendChild(virtualWrapper);

    // Add scroll event listener with debouncing
    virtualWrapper.addEventListener('scroll', debounceScroll);

    // Initial render
    updateVirtualScroll();

    log('Performance', 'Virtual scrolling initialized');
  }

  // Debounced scroll handler for performance
  function debounceScroll(event) {
    if (scrollDebounceTimer) {
      cancelAnimationFrame(scrollDebounceTimer);
    }

    scrollDebounceTimer = requestAnimationFrame(() => {
      handleVirtualScroll(event);
    });
  }

  // Handle virtual scroll updates
  function handleVirtualScroll(event) {
    if (!virtualScrollEnabled || !scrollContainer) return;

    const scrollTop = event.target.scrollTop;
    const containerHeight = event.target.clientHeight;
    const scrollDirection = scrollTop > lastScrollPosition ? 'down' : 'up';

    lastScrollPosition = scrollTop;

    // Calculate which messages should be visible
    const messageHeight = 120; // Estimated average message height
    const startIndex = Math.max(0, Math.floor(scrollTop / messageHeight) - MESSAGE_BUFFER_SIZE);
    const endIndex = Math.min(
      messageHistory.length,
      Math.ceil((scrollTop + containerHeight) / messageHeight) + MESSAGE_BUFFER_SIZE
    );

    // Update visible range if changed significantly
    if (Math.abs(startIndex - visibleMessageRange.start) > MESSAGE_BUFFER_SIZE / 2 ||
      Math.abs(endIndex - visibleMessageRange.end) > MESSAGE_BUFFER_SIZE / 2) {

      visibleMessageRange = { start: startIndex, end: endIndex };
      updateVirtualScroll();
    }

    // Update scroll momentum for smooth scrolling
    updateScrollMomentum(scrollDirection, Math.abs(scrollTop - lastScrollPosition));
  }

  // Update virtual scroll content
  function updateVirtualScroll() {
    if (!virtualScrollEnabled || !scrollContainer) return;

    const wrapper = scrollContainer.querySelector('.virtual-scroll-wrapper');
    const content = wrapper?.querySelector('.virtual-scroll-content');
    const topSpacer = content?.querySelector('.virtual-scroll-spacer-top');
    const bottomSpacer = content?.querySelector('.virtual-scroll-spacer-bottom');

    if (!content || !topSpacer || !bottomSpacer) return;

    // Calculate spacer heights
    const messageHeight = 120;
    const topSpacerHeight = visibleMessageRange.start * messageHeight;
    const bottomSpacerHeight = (messageHistory.length - visibleMessageRange.end) * messageHeight;

    topSpacer.style.height = `${topSpacerHeight}px`;
    bottomSpacer.style.height = `${bottomSpacerHeight}px`;

    // Remove existing message elements that are out of range
    const existingMessages = content.querySelectorAll('.message:not(.virtual-scroll-spacer-top):not(.virtual-scroll-spacer-bottom)');
    existingMessages.forEach(msg => {
      const index = parseInt(msg.dataset.messageIndex);
      if (index < visibleMessageRange.start || index >= visibleMessageRange.end) {
        msg.remove();
      }
    });

    // Render visible messages
    for (let i = visibleMessageRange.start; i < visibleMessageRange.end; i++) {
      if (i >= messageHistory.length) break;

      const message = messageHistory[i];
      let messageElement = messageElements.get(i);

      if (!messageElement) {
        messageElement = createOptimizedMessageElement(message, i);
        messageElements.set(i, messageElement);
      }

      // Insert message in correct position
      if (!content.contains(messageElement)) {
        const insertBefore = content.querySelector(`[data-message-index="${i + 1}"]`) || bottomSpacer;
        content.insertBefore(messageElement, insertBefore);
      }
    }

    log('Performance', 'Virtual scroll updated', {
      visibleRange: visibleMessageRange,
      totalMessages: messageHistory.length,
      renderedElements: content.querySelectorAll('.message:not(.virtual-scroll-spacer-top):not(.virtual-scroll-spacer-bottom)').length
    });
  }

  // Create optimized message element with minimal DOM operations
  function createOptimizedMessageElement(message, index) {
    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.role}`;
    messageEl.dataset.messageIndex = index;
    messageEl.dataset.timestamp = message.timestamp;

    // Use document fragment for efficient DOM construction
    const fragment = document.createDocumentFragment();

    // Message header
    const header = document.createElement('div');
    header.className = 'message-header';
    header.innerHTML = `
      <span class="message-role">${message.role === 'user' ? 'You' : 'Assistant'}</span>
      <span class="message-time">${formatMessageTime(message.timestamp)}</span>
    `;
    fragment.appendChild(header);

    // Message content
    const content = document.createElement('div');
    content.className = 'message-content';

    // Use efficient markdown rendering for content
    const renderedContent = renderMarkdownOptimized(message.content);
    content.innerHTML = renderedContent;

    fragment.appendChild(content);

    // Add thinking section if present
    if (message.thinking && isThinkingMode) {
      const thinkingEl = createOptimizedThinkingElement(message.thinking);
      fragment.appendChild(thinkingEl);
    }

    messageEl.appendChild(fragment);

    // Add intersection observer for lazy loading of complex content
    observeMessageElement(messageEl, index);

    return messageEl;
  }

  // Optimized markdown rendering with caching
  const markdownCache = new Map();
  function renderMarkdownOptimized(content) {
    const cacheKey = content.substring(0, 100) + content.length; // Simple cache key

    if (markdownCache.has(cacheKey)) {
      return markdownCache.get(cacheKey);
    }

    const rendered = renderMarkdown(content);

    // Cache rendered content (limit cache size)
    if (markdownCache.size > 100) {
      const firstKey = markdownCache.keys().next().value;
      markdownCache.delete(firstKey);
    }

    markdownCache.set(cacheKey, rendered);
    return rendered;
  }

  // Create optimized thinking element
  function createOptimizedThinkingElement(thinking) {
    const thinkingEl = document.createElement('div');
    thinkingEl.className = 'enhanced-thinking collapsed';
    thinkingEl.innerHTML = `
      <div class="thinking-header">
        <button class="thinking-toggle" onclick="toggleThinkingSection(this)" aria-expanded="false">
          <span class="toggle-icon">▶</span>
          <span class="toggle-text">Show reasoning</span>
        </button>
        <div class="thinking-status">Completed</div>
      </div>
      <div class="thinking-content collapsed">
        <div class="thinking-text">${escapeHtml(thinking)}</div>
      </div>
    `;
    return thinkingEl;
  }

  // Intersection observer for lazy loading
  const messageObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const messageEl = entry.target;
        const index = parseInt(messageEl.dataset.messageIndex);

        // Load any heavy content when message becomes visible
        loadMessageHeavyContent(messageEl, index);

        // Stop observing once loaded
        messageObserver.unobserve(messageEl);
      }
    });
  }, {
    rootMargin: '100px 0px', // Load content 100px before it becomes visible
    threshold: 0.1
  });

  function observeMessageElement(element, index) {
    messageObserver.observe(element);
  }

  function loadMessageHeavyContent(messageEl, index) {
    // Load syntax highlighting for code blocks
    const codeBlocks = messageEl.querySelectorAll('code[class*="language-"]');
    codeBlocks.forEach(block => {
      if (window.Prism && !block.classList.contains('highlighted')) {
        window.Prism.highlightElement(block);
        block.classList.add('highlighted');
      }
    });

    // Load any other heavy content as needed
    log('Performance', 'Heavy content loaded for message', { index });
  }

  // Smooth scrolling with momentum and easing
  function updateScrollMomentum(direction, velocity) {
    if (!scrollContainer) return;

    const wrapper = scrollContainer.querySelector('.virtual-scroll-wrapper');
    if (!wrapper) return;

    // Apply momentum-based easing
    const momentum = Math.min(velocity * 0.1, 20);

    if (momentum > 1) {
      wrapper.style.scrollBehavior = 'smooth';

      // Reset scroll behavior after momentum
      setTimeout(() => {
        wrapper.style.scrollBehavior = 'auto';
      }, 300);
    }
  }

  // Smooth scroll to bottom with easing
  function smoothScrollToBottom() {
    if (!scrollContainer) return;

    const wrapper = scrollContainer.querySelector('.virtual-scroll-wrapper');
    if (!wrapper) return;

    // Use custom easing for smooth scroll
    const startTime = performance.now();
    const startScroll = wrapper.scrollTop;
    const targetScroll = wrapper.scrollHeight - wrapper.clientHeight;
    const distance = targetScroll - startScroll;
    const duration = Math.min(800, Math.abs(distance) * 2); // Adaptive duration

    function easeOutExpo(t) {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    }

    function animateScroll(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutExpo(progress);

      wrapper.scrollTop = startScroll + (distance * easedProgress);

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    }

    requestAnimationFrame(animateScroll);
  }

  // Memory management and cleanup
  function initializeMemoryManagement() {
    // Periodic cleanup of unused message elements
    memoryCleanupTimer = setInterval(() => {
      performMemoryCleanup();
    }, MEMORY_CLEANUP_INTERVAL);

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      if (memoryCleanupTimer) {
        clearInterval(memoryCleanupTimer);
      }
      performMemoryCleanup();
    });

    log('Performance', 'Memory management initialized');
  }

  function performMemoryCleanup() {
    if (!virtualScrollEnabled) return;

    let cleanedCount = 0;

    // Remove cached elements that are far from visible range
    messageElements.forEach((element, index) => {
      const distanceFromVisible = Math.min(
        Math.abs(index - visibleMessageRange.start),
        Math.abs(index - visibleMessageRange.end)
      );

      // Remove elements that are more than 2x buffer size away
      if (distanceFromVisible > MESSAGE_BUFFER_SIZE * 2) {
        messageElements.delete(index);
        cleanedCount++;
      }
    });

    // Clear markdown cache if it gets too large
    if (markdownCache.size > 200) {
      const keysToDelete = Array.from(markdownCache.keys()).slice(0, 100);
      keysToDelete.forEach(key => markdownCache.delete(key));
    }

    // Force garbage collection hint (if available)
    if (window.gc && cleanedCount > 10) {
      window.gc();
    }

    if (cleanedCount > 0) {
      log('Performance', 'Memory cleanup completed', {
        cleanedElements: cleanedCount,
        cachedElements: messageElements.size,
        markdownCacheSize: markdownCache.size
      });
    }
  }

  // DOM update optimization
  function optimizeDOMUpdates() {
    // Batch DOM updates using requestAnimationFrame
    let pendingUpdates = [];
    let updateScheduled = false;

    function flushUpdates() {
      if (pendingUpdates.length === 0) return;

      // Group updates by type for better performance
      const updates = pendingUpdates.splice(0);
      updateScheduled = false;

      // Process updates in batches
      updates.forEach(update => {
        try {
          update();
        } catch (error) {
          log('Performance', 'DOM update error', error.message);
        }
      });
    }

    window.scheduleDOMUpdate = function (updateFn) {
      pendingUpdates.push(updateFn);

      if (!updateScheduled) {
        updateScheduled = true;
        requestAnimationFrame(flushUpdates);
      }
    };
  }

  // Format message timestamp efficiently
  function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;

    return date.toLocaleDateString();
  }

  // Initialize performance optimizations
  function initializePerformanceOptimizations() {
    optimizeDOMUpdates();
    initializeMemoryManagement();

    // Monitor performance
    if (window.PerformanceObserver) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach(entry => {
          if (entry.duration > 16) { // Longer than one frame
            log('Performance', 'Long task detected', {
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime
            });
          }
        });
      });

      observer.observe({ entryTypes: ['measure', 'navigation'] });
    }

    log('Performance', 'Performance optimizations initialized');
  }

  // Initialize with a welcome message
  setTimeout(() => {
    log('System', 'Terminal initialized - Press Ctrl+` to toggle, Ctrl+K to clear');
    log('Accessibility', 'Enhanced accessibility features enabled');
    initializePerformanceOptimizations();
  }, 500);

  // Test function for enhanced code block rendering
  window.testEnhancedCodeBlocks = function () {
    const testMarkdown = `
# Enhanced Code Block Test

Here's a JavaScript example:

\`\`\`javascript
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Test with different values
console.log(fibonacci(10)); // 55
console.log(fibonacci(15)); // 610

// More complex example with error handling
function safeFibonacci(n) {
  if (typeof n !== 'number' || n < 0) {
    throw new Error('Input must be a non-negative number');
  }
  
  if (n <= 1) return n;
  
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

try {
  console.log(safeFibonacci(20)); // 6765
} catch (error) {
  console.error('Error:', error.message);
}
\`\`\`

And a Python example:

\`\`\`python
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    
    return quicksort(left) + middle + quicksort(right)

# Example usage
numbers = [3, 6, 8, 10, 1, 2, 1]
sorted_numbers = quicksort(numbers)
print(f"Original: {numbers}")
print(f"Sorted: {sorted_numbers}")
\`\`\`

File references like \`package.json\` and \`src/main.ts\` should be styled nicely.

Short code: \`\`\`bash
echo "Hello World"
\`\`\`
    `;

    const rendered = renderMarkdown(testMarkdown);

    // Create test container
    let testContainer = document.getElementById('codeBlockTest');
    if (!testContainer) {
      testContainer = document.createElement('div');
      testContainer.id = 'codeBlockTest';
      testContainer.style.cssText = `
        position: fixed;
        top: 50px;
        right: 20px;
        width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        background: var(--bg-surface);
        border: 1px solid var(--border-primary);
        border-radius: var(--radius-lg);
        padding: var(--spacing-lg);
        z-index: 9999;
        box-shadow: var(--shadow-glass-lg);
      `;

      const closeBtn = document.createElement('button');
      closeBtn.textContent = '✕ Close Test';
      closeBtn.style.cssText = `
        position: absolute;
        top: 10px;
        right: 10px;
        background: var(--error);
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 12px;
      `;
      closeBtn.onclick = () => testContainer.remove();

      testContainer.appendChild(closeBtn);
      document.body.appendChild(testContainer);
    }

    testContainer.innerHTML = closeBtn.outerHTML + '<div class="block"><div class="md">' + rendered + '</div></div>';

    log('Test', 'Enhanced code block test rendered', { container: 'codeBlockTest' });
  };

  // Agents list
  const agentSelect = $('#agentSelect');
  const agentIdOverride = $('#agentIdOverride');
  $('#refreshAgents').addEventListener('click', loadAgents);

  function normalizeAgents(data) {
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
    } catch { }
    return [];
  }

  async function loadAgents() {
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
    } catch (e) {
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
  // isThinkingMode is declared above with localStorage initialization

  function generateThreadId() {
    return `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function createChatThread(clearHistory = false) {
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
    controls.className = 'chat-controls enhanced';

    // Create enhanced chat info section
    const chatInfo = document.createElement('div');
    chatInfo.className = 'chat-info';
    chatInfo.innerHTML = `
      <div class="thread-info">
        <span class="thread-label">Thread:</span>
        <code id="currentThreadDisplay" class="thread-id">${currentThreadId || 'new'}</code>
        <span class="thread-status ${currentThreadId ? 'active' : 'new'}" title="${currentThreadId ? 'Active conversation' : 'New conversation'}">
          ${currentThreadId ? '●' : '○'}
        </span>
      </div>
      <div class="conversation-meta">
        <span class="message-count" id="messageCountDisplay">
          <span class="count-icon">💬</span>
          <span class="count-text">${messageHistory.length} message${messageHistory.length !== 1 ? 's' : ''}</span>
        </span>
        <span class="conversation-time" id="conversationTime" title="Conversation started">
          <span class="time-icon">⏱️</span>
          <span class="time-text">${getConversationDuration()}</span>
        </span>
      </div>
    `;

    // Create enhanced chat actions section
    const chatActions = document.createElement('div');
    chatActions.className = 'chat-actions enhanced';
    chatActions.innerHTML = `
      <div class="action-group primary-actions">
        <button id="newChat" class="action-btn new-chat" title="Start new conversation (Ctrl+N)">
          <span class="btn-icon">✨</span>
          <span class="btn-text">New Chat</span>
          <span class="btn-shortcut">Ctrl+N</span>
        </button>
        <button id="toggleThinking" class="action-btn thinking-toggle ${isThinkingMode ? 'active' : ''}" 
                title="Toggle thinking mode (Ctrl+T)" data-mode="${isThinkingMode ? 'detailed' : 'simple'}">
          <span class="btn-icon">${isThinkingMode ? '🧠' : '💭'}</span>
          <span class="btn-text">${isThinkingMode ? 'Detailed' : 'Simple'}</span>
          <span class="btn-indicator"></span>
        </button>
      </div>
      <div class="action-group secondary-actions">
        <button id="exportChat" class="action-btn export-btn" title="Export conversation">
          <span class="btn-icon">📤</span>
          <span class="btn-text">Export</span>
          <span class="export-dropdown-icon">▼</span>
        </button>
        <div id="exportDropdown" class="export-dropdown hidden">
          <button class="export-option" data-format="markdown" title="Export as Markdown">
            <span class="option-icon">📝</span>
            <span class="option-text">Markdown</span>
          </button>
          <button class="export-option" data-format="json" title="Export as JSON">
            <span class="option-icon">📄</span>
            <span class="option-text">JSON</span>
          </button>
          <button class="export-option" data-format="txt" title="Export as Plain Text">
            <span class="option-icon">📋</span>
            <span class="option-text">Plain Text</span>
          </button>
        </div>
      </div>
    `;

    controls.appendChild(chatInfo);
    controls.appendChild(chatActions);

    // Add enhanced event listeners
    setupEnhancedChatControls(controls);

    return controls;
  }

  // Helper function to get conversation duration
  function getConversationDuration() {
    if (!conversationStartTime) {
      conversationStartTime = new Date();
      return 'Just started';
    }

    const now = new Date();
    const diff = now - conversationStartTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      return 'Just started';
    }
  }

  // Enhanced chat controls setup
  function setupEnhancedChatControls(controls) {
    // New Chat button with enhanced feedback
    const newChatBtn = controls.querySelector('#newChat');
    if (newChatBtn) {
      newChatBtn.addEventListener('click', handleNewChatClick);
    }

    // Enhanced thinking mode toggle
    const thinkingBtn = controls.querySelector('#toggleThinking');
    if (thinkingBtn) {
      thinkingBtn.addEventListener('click', handleThinkingToggle);
    }

    // Export dropdown functionality
    const exportBtn = controls.querySelector('#exportChat');
    const exportDropdown = controls.querySelector('#exportDropdown');

    if (exportBtn && exportDropdown) {
      exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleExportDropdown();
      });

      // Export option handlers
      const exportOptions = controls.querySelectorAll('.export-option');
      exportOptions.forEach(option => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const format = option.dataset.format;
          handleExportChat(format);
          hideExportDropdown();
        });
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.export-dropdown') && !e.target.closest('#exportChat')) {
        hideExportDropdown();
      }
    });

    // Update conversation time periodically
    if (!conversationTimeInterval) {
      conversationTimeInterval = setInterval(updateConversationTime, 30000); // Update every 30 seconds
    }
  }

  // Enhanced new chat handler with visual feedback
  function handleNewChatClick(e) {
    const btn = e.currentTarget;

    // Add loading state
    btn.classList.add('loading');
    btn.disabled = true;

    // Show confirmation with enhanced styling
    const confirmDialog = createEnhancedConfirmDialog(
      'Start New Conversation',
      'This will clear your current chat history and start fresh. Are you sure?',
      [
        {
          text: 'Cancel', type: 'secondary', action: () => {
            btn.classList.remove('loading');
            btn.disabled = false;
          }
        },
        {
          text: 'Start New Chat', type: 'primary', action: () => {
            performNewChat(btn);
          }
        }
      ]
    );

    document.body.appendChild(confirmDialog);
    setTimeout(() => confirmDialog.classList.add('visible'), 10);
  }

  // Perform new chat with enhanced feedback
  function performNewChat(btn) {
    // Clear message history
    messageHistory = [];
    currentThreadId = null;
    conversationStartTime = new Date();

    // Clear chat thread with animation
    const thread = document.querySelector('.chat-thread');
    if (thread) {
      thread.classList.add('clearing');
      setTimeout(() => {
        thread.innerHTML = '';
        thread.classList.remove('clearing');

        // Add welcome message
        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = 'msg system welcome';
        welcomeMsg.innerHTML = `
          <div class="welcome-content">
            <span class="welcome-icon">✨</span>
            <span class="welcome-text">New conversation started! How can I help you today?</span>
          </div>
        `;
        thread.appendChild(welcomeMsg);
      }, 300);
    }

    // Update controls
    updateChatControls();

    // Show success feedback
    showEnhancedFeedback('success', 'New conversation started!', 'Ready for your questions');

    // Reset button state
    btn.classList.remove('loading');
    btn.disabled = false;

    // Focus input
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      setTimeout(() => chatInput.focus(), 500);
    }

    log('Chat', 'New conversation started', { timestamp: new Date().toISOString() });
  }

  // Enhanced thinking mode toggle
  function handleThinkingToggle(e) {
    const btn = e.currentTarget;

    // Toggle mode
    isThinkingMode = !isThinkingMode;

    // Update button state with animation
    btn.classList.add('toggling');
    btn.dataset.mode = isThinkingMode ? 'detailed' : 'simple';

    setTimeout(() => {
      btn.classList.toggle('active', isThinkingMode);
      btn.querySelector('.btn-icon').textContent = isThinkingMode ? '🧠' : '💭';
      btn.querySelector('.btn-text').textContent = isThinkingMode ? 'Detailed' : 'Simple';
      btn.classList.remove('toggling');
    }, 150);

    // Show feedback
    const mode = isThinkingMode ? 'detailed' : 'simple';
    showEnhancedFeedback('info', `Thinking mode: ${mode}`,
      isThinkingMode ? 'Will show detailed reasoning' : 'Will show simplified responses');

    // Save preference
    localStorage.setItem('chat_thinking_mode', isThinkingMode ? '1' : '0');

    log('Chat', 'Thinking mode toggled', { mode, timestamp: new Date().toISOString() });
  }

  // Export dropdown management
  function toggleExportDropdown() {
    const dropdown = document.querySelector('#exportDropdown');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
      dropdown.classList.toggle('visible');
    }
  }

  function hideExportDropdown() {
    const dropdown = document.querySelector('#exportDropdown');
    if (dropdown) {
      dropdown.classList.add('hidden');
      dropdown.classList.remove('visible');
    }
  }

  // Enhanced export functionality
  function handleExportChat(format) {
    if (messageHistory.length === 0) {
      showEnhancedFeedback('warning', 'No messages to export', 'Start a conversation first');
      return;
    }

    showEnhancedFeedback('info', 'Preparing export...', `Formatting as ${format.toUpperCase()}`);

    try {
      let exportData;
      let filename;
      let mimeType;

      switch (format) {
        case 'markdown':
          exportData = exportAsMarkdown();
          filename = `chat-${currentThreadId || 'new'}-${new Date().toISOString().split('T')[0]}.md`;
          mimeType = 'text/markdown';
          break;
        case 'json':
          exportData = exportAsJSON();
          filename = `chat-${currentThreadId || 'new'}-${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
          break;
        case 'txt':
          exportData = exportAsPlainText();
          filename = `chat-${currentThreadId || 'new'}-${new Date().toISOString().split('T')[0]}.txt`;
          mimeType = 'text/plain';
          break;
        default:
          throw new Error('Unsupported export format');
      }

      // Create and download file
      const blob = new Blob([exportData], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showEnhancedFeedback('success', 'Export completed!', `Downloaded as ${filename}`);
      log('Chat', 'Conversation exported', { format, filename, messageCount: messageHistory.length });

    } catch (error) {
      showEnhancedFeedback('error', 'Export failed', error.message);
      log('Chat', 'Export error', error);
    }
  }

  // Export format functions
  function exportAsMarkdown() {
    const timestamp = new Date().toISOString();
    let markdown = `# Chat Conversation Export\n\n`;
    markdown += `**Thread ID:** ${currentThreadId || 'New conversation'}\n`;
    markdown += `**Exported:** ${timestamp}\n`;
    markdown += `**Messages:** ${messageHistory.length}\n`;
    markdown += `**Duration:** ${getConversationDuration()}\n\n`;
    markdown += `---\n\n`;

    messageHistory.forEach((msg, index) => {
      const role = msg.role === 'user' ? '👤 **User**' : '🤖 **Assistant**';
      markdown += `## ${role}\n\n`;
      markdown += `${msg.content}\n\n`;

      if (msg.thinking && isThinkingMode) {
        markdown += `<details>\n<summary>💭 Thinking Process</summary>\n\n`;
        markdown += `${msg.thinking}\n\n`;
        markdown += `</details>\n\n`;
      }

      if (index < messageHistory.length - 1) {
        markdown += `---\n\n`;
      }
    });

    return markdown;
  }

  function exportAsJSON() {
    return JSON.stringify({
      threadId: currentThreadId,
      exportedAt: new Date().toISOString(),
      messageCount: messageHistory.length,
      conversationDuration: getConversationDuration(),
      thinkingMode: isThinkingMode,
      messages: messageHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
        thinking: msg.thinking,
        timestamp: msg.timestamp || new Date().toISOString()
      }))
    }, null, 2);
  }

  function exportAsPlainText() {
    const timestamp = new Date().toISOString();
    let text = `CHAT CONVERSATION EXPORT\n`;
    text += `========================\n\n`;
    text += `Thread ID: ${currentThreadId || 'New conversation'}\n`;
    text += `Exported: ${timestamp}\n`;
    text += `Messages: ${messageHistory.length}\n`;
    text += `Duration: ${getConversationDuration()}\n\n`;

    messageHistory.forEach((msg, index) => {
      const role = msg.role === 'user' ? 'USER' : 'ASSISTANT';
      text += `[${role}]\n`;
      text += `${msg.content}\n`;

      if (msg.thinking && isThinkingMode) {
        text += `\n[THINKING]\n${msg.thinking}\n`;
      }

      if (index < messageHistory.length - 1) {
        text += `\n${'='.repeat(50)}\n\n`;
      }
    });

    return text;
  }

  // Update chat controls with current state
  function updateChatControls() {
    const threadDisplay = document.getElementById('currentThreadDisplay');
    const messageCountDisplay = document.getElementById('messageCountDisplay');
    const conversationTimeDisplay = document.getElementById('conversationTime');
    const threadStatus = document.querySelector('.thread-status');

    if (threadDisplay) {
      threadDisplay.textContent = currentThreadId || 'new';
    }

    if (messageCountDisplay) {
      const countText = messageCountDisplay.querySelector('.count-text');
      if (countText) {
        countText.textContent = `${messageHistory.length} message${messageHistory.length !== 1 ? 's' : ''}`;
      }
    }

    if (conversationTimeDisplay) {
      const timeText = conversationTimeDisplay.querySelector('.time-text');
      if (timeText) {
        timeText.textContent = getConversationDuration();
      }
    }

    if (threadStatus) {
      threadStatus.className = `thread-status ${currentThreadId ? 'active' : 'new'}`;
      threadStatus.textContent = currentThreadId ? '●' : '○';
      threadStatus.title = currentThreadId ? 'Active conversation' : 'New conversation';
    }
  }

  // Update conversation time periodically
  function updateConversationTime() {
    const conversationTimeDisplay = document.getElementById('conversationTime');
    if (conversationTimeDisplay) {
      const timeText = conversationTimeDisplay.querySelector('.time-text');
      if (timeText) {
        timeText.textContent = getConversationDuration();
      }
    }
  }

  // Enhanced feedback system
  function showEnhancedFeedback(type, title, message) {
    // Remove existing feedback
    const existingFeedback = document.querySelector('.enhanced-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    const feedback = document.createElement('div');
    feedback.className = `enhanced-feedback ${type}`;
    feedback.innerHTML = `
      <div class="feedback-content">
        <div class="feedback-icon">${getFeedbackIcon(type)}</div>
        <div class="feedback-text">
          <div class="feedback-title">${title}</div>
          <div class="feedback-message">${message}</div>
        </div>
        <button class="feedback-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;

    document.body.appendChild(feedback);

    // Animate in
    setTimeout(() => feedback.classList.add('visible'), 10);

    // Auto-remove after delay
    setTimeout(() => {
      if (feedback.parentElement) {
        feedback.classList.remove('visible');
        setTimeout(() => feedback.remove(), 300);
      }
    }, type === 'error' ? 5000 : 3000);
  }

  function getFeedbackIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
  }

  // Enhanced confirmation dialog
  function createEnhancedConfirmDialog(title, message, buttons) {
    const dialog = document.createElement('div');
    dialog.className = 'enhanced-dialog-overlay';

    const dialogContent = document.createElement('div');
    dialogContent.className = 'enhanced-dialog';

    dialogContent.innerHTML = `
      <div class="dialog-header">
        <h3 class="dialog-title">${title}</h3>
      </div>
      <div class="dialog-body">
        <p class="dialog-message">${message}</p>
      </div>
      <div class="dialog-actions">
        ${buttons.map((btn, index) => `
          <button class="dialog-btn ${btn.type}" data-action="${index}">
            ${btn.text}
          </button>
        `).join('')}
      </div>
    `;

    dialog.appendChild(dialogContent);

    // Add event listeners
    const actionButtons = dialogContent.querySelectorAll('.dialog-btn');
    actionButtons.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        dialog.classList.remove('visible');
        setTimeout(() => {
          if (dialog.parentElement) {
            dialog.remove();
          }
        }, 300);

        if (buttons[index] && buttons[index].action) {
          buttons[index].action();
        }
      });
    });

    // Close on overlay click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.classList.remove('visible');
        setTimeout(() => {
          if (dialog.parentElement) {
            dialog.remove();
          }
        }, 300);

        // Call cancel action if available
        const cancelBtn = buttons.find(btn => btn.type === 'secondary');
        if (cancelBtn && cancelBtn.action) {
          cancelBtn.action();
        }
      }
    });

    return dialog;
  }

  function makeMsg(role, text) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    if (text) div.textContent = text;
    return div;
  }

  function makeBlock(cls, title, obj, collapsed = true) {
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

  function ChatRenderer(thread) {
    this.thread = thread;
    this.assistant = null;
    // Maintain separate buffers for thinking (reasoning) and visible answer
    this.thinkingText = '';
    this.answerText = '';
    this.toolBlocks = new Map(); // toolCallId -> {callEl,resultEl}
  }
  ChatRenderer.prototype.addUser = function (text) {
    const m = makeMsg('user', text);
    this.thread.appendChild(m);
    this.thread.scrollTop = this.thread.scrollHeight;
  };
  ChatRenderer.prototype.ensureAssistant = function () {
    if (!this.assistant) {
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
  ChatRenderer.prototype.showLoader = function () {
    const body = this.ensureAssistant();
    let loader = body.querySelector('.chat-loader');
    if (!loader) {
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
  ChatRenderer.prototype.hideLoader = function () {
    const body = this.ensureAssistant();
    const loader = body.querySelector('.chat-loader');
    if (loader) { loader.remove(); }
  };

  ChatRenderer.prototype.ensureThinkingBlock = function () {
    const body = this.ensureAssistant();
    let block = body.querySelector('.block.thinking');
    if (!block) {
      block = this.createEnhancedThinkingBlock();
      body.appendChild(block);
    }
    return block.querySelector('.thinking-content .md');
  };

  // Create enhanced thinking block with better organization
  ChatRenderer.prototype.createEnhancedThinkingBlock = function () {
    const block = document.createElement('div');
    block.className = 'block thinking enhanced-thinking';

    const header = document.createElement('div');
    header.className = 'thinking-header';
    header.innerHTML = `
      <div class="thinking-info">
        <span class="thinking-icon">🧠</span>
        <span class="thinking-title">Assistant Reasoning</span>
        <span class="thinking-status">Processing...</span>
      </div>
      <button class="thinking-toggle" onclick="toggleThinkingSection(this)" aria-label="Toggle thinking section">
        <span class="toggle-icon">▼</span>
        <span class="toggle-text">Collapse</span>
      </button>
    `;

    const content = document.createElement('div');
    content.className = 'thinking-content expanded';

    const mdContainer = document.createElement('div');
    mdContainer.className = 'md';
    content.appendChild(mdContainer);

    const progressBar = document.createElement('div');
    progressBar.className = 'thinking-progress';
    progressBar.innerHTML = '<div class="progress-fill"></div>';

    block.appendChild(header);
    block.appendChild(progressBar);
    block.appendChild(content);

    // Store references for easy access
    block._header = header;
    block._content = content;
    block._progress = progressBar;

    return block;
  };

  ChatRenderer.prototype.appendThinkingText = function (delta) {
    if (!delta) return;
    this.thinkingText += delta;
    const content = this.ensureThinkingBlock();
    content.innerHTML = renderMarkdown(this.thinkingText);

    // Update thinking status and progress
    this.updateThinkingProgress();

    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };

  // Update thinking progress and status
  ChatRenderer.prototype.updateThinkingProgress = function () {
    const body = this.ensureAssistant();
    const thinkingBlock = body.querySelector('.block.thinking');
    if (!thinkingBlock) return;

    const status = thinkingBlock.querySelector('.thinking-status');
    const progressFill = thinkingBlock.querySelector('.progress-fill');

    if (status) {
      const wordCount = this.thinkingText.split(/\s+/).length;
      if (wordCount < 10) {
        status.textContent = 'Starting to think...';
        if (progressFill) progressFill.style.width = '10%';
      } else if (wordCount < 50) {
        status.textContent = 'Analyzing...';
        if (progressFill) progressFill.style.width = '30%';
      } else if (wordCount < 100) {
        status.textContent = 'Reasoning...';
        if (progressFill) progressFill.style.width = '60%';
      } else {
        status.textContent = 'Finalizing thoughts...';
        if (progressFill) progressFill.style.width = '90%';
      }
    }
  };
  ChatRenderer.prototype.appendAnswerText = function (delta) {
    if (!delta) return;
    this.answerText += delta;
    const body = this.ensureAssistant();
    // Live preview in a Response block if present, otherwise keep for finalize
    let resp = body.querySelector('.block.response');
    if (!resp) {
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
  ChatRenderer.prototype.addToolCall = function (call) {
    const body = this.ensureAssistant();
    const id = call.toolCallId || call.id;
    const toolName = call.toolName || call.name || 'Unknown Tool';
    const el = this.createEnhancedToolCallBlock(toolName, id, call.args || call);
    body.appendChild(el);
    this.toolBlocks.set(id, { callEl: el, resultEl: null });
    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };

  // Create enhanced tool call block with syntax highlighting
  ChatRenderer.prototype.createEnhancedToolCallBlock = function (toolName, toolId, args) {
    const block = document.createElement('div');
    block.className = 'block tool-call enhanced-tool-call';
    block.dataset.toolId = toolId;

    const header = document.createElement('div');
    header.className = 'tool-call-header';
    header.innerHTML = `
      <div class="tool-info">
        <span class="tool-icon">🔧</span>
        <span class="tool-name">${escapeHtml(toolName)}</span>
        <span class="tool-id">${escapeHtml(toolId || 'unknown')}</span>
        <span class="tool-status executing">Executing...</span>
      </div>
      <button class="tool-toggle" onclick="toggleToolCallSection(this)" aria-label="Toggle tool call details">
        <span class="toggle-icon">▼</span>
        <span class="toggle-text">Collapse</span>
      </button>
    `;

    const content = document.createElement('div');
    content.className = 'tool-content expanded';

    // Arguments section with syntax highlighting
    const argsSection = document.createElement('div');
    argsSection.className = 'tool-section args-section';
    argsSection.innerHTML = `
      <div class="section-header">
        <span class="section-icon">📝</span>
        <span class="section-title">Arguments</span>
      </div>
      <div class="section-content">
        ${this.renderToolArguments(args)}
      </div>
    `;

    content.appendChild(argsSection);

    const progressBar = document.createElement('div');
    progressBar.className = 'tool-progress';
    progressBar.innerHTML = '<div class="progress-fill executing"></div>';

    block.appendChild(header);
    block.appendChild(progressBar);
    block.appendChild(content);

    // Store references
    block._header = header;
    block._content = content;
    block._progress = progressBar;

    return block;
  };

  // Render tool arguments with proper formatting
  ChatRenderer.prototype.renderToolArguments = function (args) {
    if (!args) return '<em class="no-args">No arguments</em>';

    try {
      const formatted = JSON.stringify(args, null, 2);
      return `<pre class="tool-args-code"><code class="language-json">${escapeHtml(formatted)}</code></pre>`;
    } catch (e) {
      return `<pre class="tool-args-code"><code>${escapeHtml(String(args))}</code></pre>`;
    }
  };
  ChatRenderer.prototype.addToolResult = function (result) {
    const body = this.ensureAssistant();
    const id = result.toolCallId || result.id;
    const block = this.toolBlocks.get(id);

    if (block && block.callEl) {
      // Update existing tool call block with result
      this.updateToolCallWithResult(block.callEl, result.result || result);
    } else {
      // Create standalone result block if no matching call found
      const el = this.createEnhancedToolResultBlock(id, result.result || result);
      body.appendChild(el);
      if (block) block.resultEl = el;
    }

    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };

  // Update tool call block with result
  ChatRenderer.prototype.updateToolCallWithResult = function (toolCallEl, result) {
    const status = toolCallEl.querySelector('.tool-status');
    const progressFill = toolCallEl.querySelector('.progress-fill');
    const content = toolCallEl.querySelector('.tool-content');

    // Update status
    if (status) {
      status.textContent = 'Completed';
      status.className = 'tool-status completed';
    }

    // Update progress
    if (progressFill) {
      progressFill.style.width = '100%';
      progressFill.className = 'progress-fill completed';
    }

    // Add result section
    const resultSection = document.createElement('div');
    resultSection.className = 'tool-section result-section';
    resultSection.innerHTML = `
      <div class="section-header">
        <span class="section-icon">✅</span>
        <span class="section-title">Result</span>
      </div>
      <div class="section-content">
        ${this.renderToolResult(result)}
      </div>
    `;

    if (content) {
      content.appendChild(resultSection);
    }
  };

  // Create enhanced standalone tool result block
  ChatRenderer.prototype.createEnhancedToolResultBlock = function (toolId, result) {
    const block = document.createElement('div');
    block.className = 'block tool-result enhanced-tool-result';
    block.dataset.toolId = toolId;

    const header = document.createElement('div');
    header.className = 'tool-result-header';
    header.innerHTML = `
      <div class="tool-info">
        <span class="tool-icon">📤</span>
        <span class="tool-name">Tool Result</span>
        <span class="tool-id">${escapeHtml(toolId || 'unknown')}</span>
        <span class="tool-status completed">Completed</span>
      </div>
      <button class="tool-toggle" onclick="toggleToolCallSection(this)" aria-label="Toggle tool result details">
        <span class="toggle-icon">▼</span>
        <span class="toggle-text">Collapse</span>
      </button>
    `;

    const content = document.createElement('div');
    content.className = 'tool-content expanded';
    content.innerHTML = `
      <div class="tool-section result-section">
        <div class="section-header">
          <span class="section-icon">📋</span>
          <span class="section-title">Output</span>
        </div>
        <div class="section-content">
          ${this.renderToolResult(result)}
        </div>
      </div>
    `;

    block.appendChild(header);
    block.appendChild(content);

    return block;
  };

  // Render tool result with proper formatting
  ChatRenderer.prototype.renderToolResult = function (result) {
    if (!result) return '<em class="no-result">No result</em>';

    // Handle different result types
    if (typeof result === 'string') {
      // Check if it looks like JSON
      try {
        const parsed = JSON.parse(result);
        const formatted = JSON.stringify(parsed, null, 2);
        return `<pre class="tool-result-code"><code class="language-json">${escapeHtml(formatted)}</code></pre>`;
      } catch (e) {
        // Treat as plain text, but check for code-like content
        if (result.includes('\n') || result.length > 100) {
          return `<pre class="tool-result-code"><code>${escapeHtml(result)}</code></pre>`;
        } else {
          return `<span class="tool-result-text">${escapeHtml(result)}</span>`;
        }
      }
    } else if (typeof result === 'object') {
      try {
        const formatted = JSON.stringify(result, null, 2);
        return `<pre class="tool-result-code"><code class="language-json">${escapeHtml(formatted)}</code></pre>`;
      } catch (e) {
        return `<pre class="tool-result-code"><code>${escapeHtml(String(result))}</code></pre>`;
      }
    } else {
      return `<span class="tool-result-text">${escapeHtml(String(result))}</span>`;
    }
  };

  // Create a visible final response block and finalize thinking sections
  ChatRenderer.prototype.finalize = function () {
    const body = this.ensureAssistant();

    // Ensure Response block exists
    let resp = body.querySelector('.block.response');
    if (!resp) {
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

    // Finalize thinking section
    this.finalizeThinkingSection();

    // Finalize any pending tool calls
    this.finalizeToolCalls();

    this.thread.parentElement.scrollTop = this.thread.parentElement.scrollHeight;
  };

  // Finalize thinking section with completion status
  ChatRenderer.prototype.finalizeThinkingSection = function () {
    const body = this.ensureAssistant();
    const thinkingBlock = body.querySelector('.block.thinking');
    if (!thinkingBlock) return;

    const status = thinkingBlock.querySelector('.thinking-status');
    const progressFill = thinkingBlock.querySelector('.progress-fill');
    const toggleText = thinkingBlock.querySelector('.toggle-text');

    // Update status to completed
    if (status) {
      status.textContent = 'Completed';
      status.className = 'thinking-status completed';
    }

    // Complete progress bar
    if (progressFill) {
      progressFill.style.width = '100%';
      progressFill.classList.add('completed');
    }

    // Auto-collapse thinking section if it's very long
    const thinkingContent = thinkingBlock.querySelector('.thinking-content');
    if (thinkingContent && this.thinkingText && this.thinkingText.length > 500) {
      thinkingContent.classList.remove('expanded');
      thinkingContent.classList.add('collapsed');

      const toggleIcon = thinkingBlock.querySelector('.toggle-icon');
      if (toggleIcon) toggleIcon.textContent = '▶';
      if (toggleText) toggleText.textContent = 'Expand';
    }
  };

  // Finalize any pending tool calls
  ChatRenderer.prototype.finalizeToolCalls = function () {
    const body = this.ensureAssistant();
    const toolCalls = body.querySelectorAll('.enhanced-tool-call');

    toolCalls.forEach(toolCall => {
      const status = toolCall.querySelector('.tool-status');
      const progressFill = toolCall.querySelector('.progress-fill');

      // If still executing, mark as completed
      if (status && status.classList.contains('executing')) {
        status.textContent = 'Completed';
        status.className = 'tool-status completed';
      }

      if (progressFill && progressFill.classList.contains('executing')) {
        progressFill.style.width = '100%';
        progressFill.className = 'progress-fill completed';
      }
    });
  };

  // Streaming parser for response frames
  function parseStreamLines(text, on) {
    const lines = text.split(/\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // prefixed frame: <type>:<json>
      const m = trimmed.match(/^([a-z0-9]):\s*(\{[\s\S]*\})$/i);
      if (m) {
        const t = m[1];
        const jsonPart = m[2];
        try {
          const obj = JSON.parse(jsonPart);
          on({ type: t, data: obj });
          continue;
        } catch { }
      }
      // token stream like: 0:"text"
      const t2 = trimmed.match(/^(\d+):\s*(.+)$/);
      if (t2) {
        let payload = t2[2];
        // If quoted string, strip quotes
        const q = payload.match(/^"([\s\S]*)"$/);
        if (q) { payload = q[1]; }
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
    const sendBtn = $('#chatStream');
    const chatInputContainer = document.getElementById('chatInputContainer');

    if (!message) {
      showInputFeedback('error', 'Please enter a message');
      return;
    }

    // Set sending state
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.classList.add('sending');
      sendBtn.textContent = 'Sending...';
    }

    if (chatInputContainer) {
      chatInputContainer.classList.add('sending');
    }
    const override = agentIdOverride.value.trim();
    const agentId = override || agentSelect.value;
    if (!agentId) return alert('No agent selected');

    // Initialize thread if needed
    if (!currentThreadId) {
      currentThreadId = generateThreadId();
    }

    // Initialize conversation start time if this is the first message
    if (messageHistory.length === 0 && !conversationStartTime) {
      conversationStartTime = new Date();
    }

    // Add user message to history
    const userMessage = { role: 'user', content: message, timestamp: new Date().toISOString() };
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

    // Show enhanced loading states
    renderer.showLoader();
    showProgressIndicator('Sending message...');
    updateConnectionStatus('connecting', 'Sending...');

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
        const errText = await res.text().catch(() => '');
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
        messageHistory.push({
          role: 'assistant',
          content: fullResponse.trim(),
          timestamp: new Date().toISOString(),
          thinking: currentThinking
        });
        updateChatControls();

        // Add follow-up suggestions
        setTimeout(() => {
          addFollowUpQuestions(fullResponse);
        }, 500);

        // Clear input and show success feedback
        clearChatInput();
        showInputFeedback('success', 'Message sent successfully!');
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
              messageHistory.push({
                role: 'assistant',
                content: answer.trim(),
                timestamp: new Date().toISOString(),
                thinking: currentThinking
              });
              updateChatControls();

              setTimeout(() => {
                addFollowUpQuestions(answer);
              }, 500);

              // Clear input and show success feedback
              clearChatInput();
              showInputFeedback('success', 'Message sent successfully!');
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

      // Hide progress indicators and update connection status
      hideProgressIndicator();
      updateConnectionStatus('disconnected', 'Error');

      // Show enhanced error display with retry functionality
      showErrorDisplay(
        `${errorTitle}: ${errorDetails}`,
        () => {
          // Retry callback - trigger the send button click
          const sendBtn = document.querySelector('#chatStream');
          if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
          }
          return Promise.resolve();
        },
        () => {
          // Dismiss callback - just log the dismissal
          log('Chat', 'Error dismissed by user');
        }
      );

      // Show input feedback for error
      showInputFeedback('error', 'Failed to send message. Please try again.');
    } finally {
      try {
        renderer.hideLoader();
        hideProgressIndicator();
      } catch { }

      const btn = document.querySelector('#chatStream');
      const chatInputContainer = document.getElementById('chatInputContainer');

      if (btn) {
        btn.disabled = false;
        btn.classList.remove('sending');
        btn.textContent = 'Send Message';
      }

      if (chatInputContainer) {
        chatInputContainer.classList.remove('sending');
      }

      // Update connection status to connected if no error occurred
      if (connectionState !== 'disconnected') {
        updateConnectionStatus('connected', 'Ready');
      }
    }
  });

  function extractFinalAnswer(data) {
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

  function coercePartToString(p) {
    if (p == null) return '';
    if (typeof p === 'string') return p;
    if (typeof p.text === 'string') return p.text;
    if (typeof p.content === 'string') return p.content;
    return '';
  }

  // Extract deltas from JSON events separating thinking vs answer content
  function extractAssistantDeltas(obj) {
    const out = { thinking: '', answer: '' };
    try {
      if (!obj) return out;
      // Common Mastra/AI SDK shapes
      // 1) { type: 'delta', part: { type: 'reasoning'|'text', text: '...' } }
      if (obj.part && obj.part.type && typeof obj.part.text === 'string') {
        if (String(obj.part.type).toLowerCase().includes('reason')) out.thinking = obj.part.text;
        else out.answer = obj.part.text;
        return out;
      }
      // 2) { type: 'reasoning', delta: '...' } or { type: 'text', delta: '...' }
      if (obj.type && typeof obj.delta === 'string') {
        if (String(obj.type).toLowerCase().includes('reason')) out.thinking = obj.delta;
        else out.answer = obj.delta;
        return out;
      }
      // 3) { reasoning: '...', content: '...' }
      if (typeof obj.reasoning === 'string') out.thinking = obj.reasoning;
      if (typeof obj.content === 'string') out.answer = obj.content;
      if (out.thinking || out.answer) return out;
      // 4) { parts: [{type,text}...] }
      if (Array.isArray(obj.parts)) {
        const think = [];
        const ans = [];
        for (const p of obj.parts) {
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
    } catch { }
    return out;
  }

  const OUTPUT_MAX_CHARS = 250000; // cap to keep UI responsive
  const _appendState = new WeakMap(); // container -> { pending: boolean }
  function appendOutput(container, text) {
    if (!container) return;
    const toAdd = text.endsWith('\n') ? text : text + '\n';
    // Efficient incremental append without reading existing text
    container.insertAdjacentText('beforeend', toAdd);
    // Throttle scroll to next frame
    let state = _appendState.get(container);
    if (!state) { state = { pending: false }; _appendState.set(container, state); }
    if (!state.pending) {
      state.pending = true;
      requestAnimationFrame(() => {
        state.pending = false;
        container.scrollTop = container.scrollHeight;
      });
    }
    // Occasionally cap total text size
    const currentLen = container.textContent.length;
    if (currentLen > OUTPUT_MAX_CHARS) {
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

  function findCommandResults(obj) {
    const results = [];
    try {
      const scan = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) return x.forEach(scan);
        if (x.commandResults && Array.isArray(x.commandResults)) results.push(...x.commandResults);
        Object.values(x).forEach(scan);
      };
      scan(obj);
    } catch { }
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
      const data = await res.json().catch(() => ({}));
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
  async function handleStream(res, onEvent) {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      onEvent({ raw: `HTTP ${res.status}\n${text}` });
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const isSSE = contentType.includes('text/event-stream');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buf += chunk;
      // Log raw chunk
      onEvent({ raw: chunk });

      if (isSSE) {
        const events = parseSSE(buf);
        if (events.consumed > 0) buf = buf.slice(events.consumed);
        for (const e of events.events) {
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
        for (const line of lines) {
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

    if (buf.trim()) {
      try {
        onEvent({ json: JSON.parse(buf.trim()) });
      } catch {
        onEvent({ raw: buf });
      }
    }
  }

  function parseSSE(input) {
    const events = [];
    let pos = 0;
    // Split into complete events ending with double newline
    while (true) {
      const idx = input.indexOf('\n\n', pos);
      if (idx === -1) break;
      const block = input.slice(pos, idx);
      pos = idx + 2;
      const lines = block.split('\n');
      let event = 'message';
      let dataLines = [];
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      events.push({ event, data: dataLines.join('\n') });
    }
    return { events, consumed: pos };
  }

  // Chat control functions (enhanced version is defined above)

  // Enhanced chat controls event listeners are set up in setupEnhancedChatControls function

  // Enhanced exportChatHistory function is defined above with multiple format support

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
  window.sendSuggestion = function (suggestion) {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
      chatInput.value = suggestion;
      chatInput.focus();

      // Update input states
      if (window.autoResizeChatInput) {
        window.autoResizeChatInput();
      }

      // Update character count and floating label
      const event = new Event('input', { bubbles: true });
      chatInput.dispatchEvent(event);

      // Send the message
      document.getElementById('chatStream').click();
    }
  };

  // Add keyboard shortcuts
  // Enhanced keyboard shortcuts and input handling
  document.addEventListener('keydown', (e) => {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatStream');
    const isInputFocused = chatInput && document.activeElement === chatInput;

    // Ctrl/Cmd + Enter to send message
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      if (isInputFocused && sendBtn && chatInput.value.trim() && !sendBtn.disabled) {
        e.preventDefault();
        sendBtn.click();
        showInputFeedback('success', 'Message sent!');
      }
    }

    // Escape to clear input
    if (e.key === 'Escape') {
      if (isInputFocused) {
        e.preventDefault();
        clearChatInput();
        showInputFeedback('info', 'Input cleared');
      }
    }

    // Ctrl/Cmd + N for new chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      // Only trigger if not in an input field or if specifically in chat
      if (!isInputFocused || document.querySelector('.panel.chat-panel.active')) {
        e.preventDefault();
        const newChatBtn = document.getElementById('newChat');
        if (newChatBtn) {
          newChatBtn.click();
        }
      }
    }

    // Ctrl/Cmd + T for thinking mode toggle
    if ((e.ctrlKey || e.metaKey) && e.key === 't') {
      // Only trigger if not in an input field or if specifically in chat
      if (!isInputFocused || document.querySelector('.panel.chat-panel.active')) {
        e.preventDefault();
        const thinkingBtn = document.getElementById('toggleThinking');
        if (thinkingBtn) {
          thinkingBtn.click();
        }
      }
    }

    // Shift + Enter for new line (default behavior, but we track it)
    if (e.shiftKey && e.key === 'Enter') {
      if (isInputFocused) {
        // Allow default behavior for new line
        setTimeout(() => autoResizeChatInput(), 0);
      }
    }
  });

  // Enhanced chat input initialization
  function initializeChatInput() {
    const chatInput = document.getElementById('chatInput');
    const chatInputContainer = document.getElementById('chatInputContainer');
    const charCount = document.getElementById('charCount');

    if (!chatInput || !chatInputContainer) return;

    // Auto-resize functionality with smooth animation
    function autoResizeChatInput() {
      chatInput.classList.add('auto-resizing');
      chatInput.style.height = 'auto';
      const newHeight = Math.min(Math.max(chatInput.scrollHeight, 120), 300);
      chatInput.style.height = newHeight + 'px';

      // Remove animation class after transition
      setTimeout(() => {
        chatInput.classList.remove('auto-resizing');
      }, 200);
    }

    // Input event handler with enhanced features
    chatInput.addEventListener('input', function (e) {
      autoResizeChatInput();
      updateCharacterCount();
      updateFloatingLabel();

      // Debounced auto-save to localStorage
      clearTimeout(chatInput.autoSaveTimeout);
      chatInput.autoSaveTimeout = setTimeout(() => {
        localStorage.setItem('chat_input_draft', this.value);
      }, 1000);
    });

    // Focus and blur handlers for floating label
    chatInput.addEventListener('focus', function () {
      chatInputContainer.classList.add('focused');
      updateFloatingLabel();
    });

    chatInput.addEventListener('blur', function () {
      chatInputContainer.classList.remove('focused');
      updateFloatingLabel();
    });

    // Paste handler for better UX
    chatInput.addEventListener('paste', function (e) {
      setTimeout(() => {
        autoResizeChatInput();
        updateCharacterCount();
        updateFloatingLabel();
      }, 0);
    });

    // Character count update
    function updateCharacterCount() {
      if (!charCount) return;

      const length = chatInput.value.length;
      charCount.textContent = length;

      // Visual feedback for character limits
      charCount.classList.remove('warning', 'error');
      if (length > 8000) {
        charCount.classList.add('error');
      } else if (length > 6000) {
        charCount.classList.add('warning');
      }
    }

    // Floating label state management
    function updateFloatingLabel() {
      const hasContent = chatInput.value.trim().length > 0;
      chatInputContainer.classList.toggle('has-content', hasContent);
    }

    // Restore draft from localStorage
    const savedDraft = localStorage.getItem('chat_input_draft');
    if (savedDraft && savedDraft.trim()) {
      chatInput.value = savedDraft;
      updateCharacterCount();
      updateFloatingLabel();
      autoResizeChatInput();
    }

    // Initial setup
    updateCharacterCount();
    updateFloatingLabel();
    autoResizeChatInput();

    // Expose functions for external use
    window.autoResizeChatInput = autoResizeChatInput;
  }

  // Enhanced input feedback system
  function showInputFeedback(type, message, duration = 2000) {
    const chatInputContainer = document.getElementById('chatInputContainer');
    if (!chatInputContainer) return;

    // Remove existing feedback classes
    chatInputContainer.classList.remove('success', 'error', 'info', 'sending');

    // Add new feedback class
    chatInputContainer.classList.add(type);

    // Create temporary feedback message
    const existingFeedback = chatInputContainer.querySelector('.input-feedback');
    if (existingFeedback) {
      existingFeedback.remove();
    }

    const feedback = document.createElement('div');
    feedback.className = 'input-feedback';
    feedback.textContent = message;
    feedback.style.cssText = `
      position: absolute;
      top: -30px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-surface);
      color: var(--text-primary);
      padding: var(--spacing-xs) var(--spacing-sm);
      border-radius: var(--radius-md);
      font-size: 12px;
      font-weight: 500;
      box-shadow: var(--shadow-md);
      z-index: 1000;
      opacity: 0;
      animation: feedbackSlideIn 0.3s var(--ease-out-expo) forwards;
    `;

    chatInputContainer.appendChild(feedback);

    // Remove feedback after duration
    setTimeout(() => {
      if (feedback.parentNode) {
        feedback.style.animation = 'feedbackSlideOut 0.3s var(--ease-out-expo) forwards';
        setTimeout(() => {
          if (feedback.parentNode) {
            feedback.remove();
          }
        }, 300);
      }
      chatInputContainer.classList.remove(type);
    }, duration);
  }

  // Enhanced clear input function
  function clearChatInput() {
    const chatInput = document.getElementById('chatInput');
    const chatInputContainer = document.getElementById('chatInputContainer');

    if (chatInput) {
      chatInput.value = '';
      chatInput.style.height = '120px';
      localStorage.removeItem('chat_input_draft');

      if (chatInputContainer) {
        chatInputContainer.classList.remove('has-content');
      }

      // Update character count
      const charCount = document.getElementById('charCount');
      if (charCount) {
        charCount.textContent = '0';
        charCount.classList.remove('warning', 'error');
      }

      // Focus back to input
      chatInput.focus();
    }
  }

  // Initialize enhanced chat input
  initializeChatInput();

  // Enhanced chat controls event listeners are initialized in createChatControls function

  // Initial load
  loadAgents();

  // Enhanced touch gesture support for mobile navigation and interactions
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping = false;
  let swipeTarget = null;
  let swipeOffset = 0;
  let swipeThreshold = 80;
  let swipeIndicator = null;
  let swipeProgress = null;

  // Create swipe indicators
  function createSwipeIndicators() {
    if (!swipeIndicator) {
      swipeIndicator = document.createElement('div');
      swipeIndicator.className = 'swipe-indicator';
      document.body.appendChild(swipeIndicator);
    }
    
    if (!swipeProgress) {
      swipeProgress = document.createElement('div');
      swipeProgress.className = 'swipe-progress';
      document.body.appendChild(swipeProgress);
    }
  }

  // Show swipe indicator
  function showSwipeIndicator(direction, progress = 0) {
    if (!swipeIndicator) createSwipeIndicators();
    
    swipeIndicator.className = `swipe-indicator ${direction}`;
    swipeIndicator.textContent = direction === 'left' ? '←' : '→';
    swipeIndicator.classList.add('visible');
    
    if (swipeProgress) {
      swipeProgress.style.width = `${Math.min(progress * 100, 100)}%`;
      swipeProgress.classList.add('visible');
    }
  }

  // Hide swipe indicator
  function hideSwipeIndicator() {
    if (swipeIndicator) {
      swipeIndicator.classList.remove('visible');
    }
    if (swipeProgress) {
      swipeProgress.classList.remove('visible');
    }
  }

  // Enhanced message swipe handling
  function handleMessageSwipe(message, offset) {
    if (!message) return;
    
    message.style.setProperty('--swipe-offset', `${offset}px`);
    message.classList.add('swipe-active');
    
    if (Math.abs(offset) > swipeThreshold) {
      message.classList.add('swipe-threshold');
    } else {
      message.classList.remove('swipe-threshold');
    }
  }

  // Reset message swipe
  function resetMessageSwipe(message) {
    if (!message) return;
    
    message.style.removeProperty('--swipe-offset');
    message.classList.remove('swipe-active', 'swipe-threshold');
  }

  // Handle swipe actions
  function handleSwipeAction(message, direction) {
    if (!message) return;
    
    const messageText = message.querySelector('.msg-content')?.textContent || '';
    
    if (direction === 'right') {
      // Copy message to clipboard
      if (navigator.clipboard && messageText) {
        navigator.clipboard.writeText(messageText).then(() => {
          showToast('Message copied to clipboard', 'success');
        }).catch(() => {
          showToast('Failed to copy message', 'error');
        });
      }
    } else if (direction === 'left') {
      // Quote/reply to message (if implemented)
      const chatInput = document.getElementById('chatInput');
      if (chatInput && messageText) {
        const quotedText = `> ${messageText.split('\n').join('\n> ')}\n\n`;
        chatInput.value = quotedText + chatInput.value;
        chatInput.focus();
        showToast('Message quoted in input', 'success');
      }
    }
  }

  // Show toast notification
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-surface);
      color: var(--text-primary);
      padding: var(--spacing-md) var(--spacing-lg);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-glass-lg);
      z-index: 10000;
      opacity: 0;
      transition: all 0.3s ease;
      backdrop-filter: blur(16px);
      border: 1px solid var(--glass-border);
    `;
    
    if (type === 'success') {
      toast.style.borderColor = 'var(--success)';
      toast.style.color = 'var(--success)';
    } else if (type === 'error') {
      toast.style.borderColor = 'var(--error)';
      toast.style.color = 'var(--error)';
    }
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
    
    // Remove after delay
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  // Enhanced touch event handlers
  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
    swipeTarget = null;
    swipeOffset = 0;
    
    // Check if touch started on a message
    const message = e.target.closest('.msg');
    if (message && window.innerWidth <= 768) {
      swipeTarget = message;
    }
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!touchStartX || !touchStartY) return;

    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    const diffX = touchStartX - touchX;
    const diffY = touchStartY - touchY;

    // Only handle horizontal swipes
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 20) {
      isSwiping = true;
      
      // Handle message swipes
      if (swipeTarget && Math.abs(diffX) > 30) {
        e.preventDefault(); // Prevent scrolling during swipe
        swipeOffset = -diffX;
        handleMessageSwipe(swipeTarget, swipeOffset);
        
        const progress = Math.abs(swipeOffset) / swipeThreshold;
        const direction = swipeOffset > 0 ? 'right' : 'left';
        showSwipeIndicator(direction, progress);
        return;
      }
      
      // Handle navigation swipes
      if (Math.abs(diffX) > 50) {
        const progress = Math.abs(diffX) / 150;
        
        // Swipe right to open sidebar (from left edge)
        if (diffX < -100 && touchStartX < 50 && window.innerWidth <= 968) {
          showSwipeIndicator('right', progress);
          if (Math.abs(diffX) > 150) {
            setNavCollapsed(false);
            hideSwipeIndicator();
          }
        }
        
        // Swipe left to close sidebar
        else if (diffX > 100 && !document.body.classList.contains('nav-collapsed') && window.innerWidth <= 968) {
          showSwipeIndicator('left', progress);
          if (Math.abs(diffX) > 150) {
            setNavCollapsed(true);
            hideSwipeIndicator();
          }
        }
      }
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    // Handle message swipe completion
    if (swipeTarget && Math.abs(swipeOffset) > swipeThreshold) {
      const direction = swipeOffset > 0 ? 'right' : 'left';
      handleSwipeAction(swipeTarget, direction);
    }
    
    // Reset swipe state
    if (swipeTarget) {
      resetMessageSwipe(swipeTarget);
    }
    
    hideSwipeIndicator();
    
    touchStartX = 0;
    touchStartY = 0;
    isSwiping = false;
    swipeTarget = null;
    swipeOffset = 0;
  }, { passive: true });

  // Mobile keyboard handling
  function handleMobileKeyboard() {
    if (window.innerWidth > 768) return;
    
    const chatInput = document.getElementById('chatInput');
    const inputContainer = document.getElementById('chatInputContainer');
    const chatPanel = document.querySelector('.panel.chat-panel');
    
    if (!chatInput || !inputContainer || !chatPanel) return;
    
    let initialViewportHeight = window.innerHeight;
    
    // Handle viewport changes (keyboard show/hide)
    function handleViewportChange() {
      const currentHeight = window.innerHeight;
      const heightDiff = initialViewportHeight - currentHeight;
      
      if (heightDiff > 150) { // Keyboard is likely open
        inputContainer.classList.add('keyboard-active');
        chatPanel.classList.add('keyboard-active');
      } else {
        inputContainer.classList.remove('keyboard-active');
        chatPanel.classList.remove('keyboard-active');
      }
    }
    
    // Listen for viewport changes
    window.addEventListener('resize', handleViewportChange);
    
    // Handle input focus
    chatInput.addEventListener('focus', () => {
      setTimeout(() => {
        chatInput.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
      }, 300);
    });
    
    // Handle input blur
    chatInput.addEventListener('blur', () => {
      setTimeout(() => {
        inputContainer.classList.remove('keyboard-active');
        chatPanel.classList.remove('keyboard-active');
      }, 100);
    });
  }

  // Initialize mobile enhancements
  function initializeMobileEnhancements() {
    createSwipeIndicators();
    handleMobileKeyboard();
    
    // Add mobile-specific event listeners
    if (window.innerWidth <= 768) {
      // Handle sidebar overlay clicks
      document.addEventListener('click', (e) => {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar && sidebar.classList.contains('mobile-open')) {
          const sidebarRect = sidebar.getBoundingClientRect();
          if (e.clientX > sidebarRect.right) {
            setNavCollapsed(true);
          }
        }
      });
      
      // Prevent zoom on double tap for UI elements
      let lastTouchEnd = 0;
      document.addEventListener('touchend', (e) => {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
          const target = e.target;
          if (target.closest('.action-btn, .nav-link, button, .chat-controls')) {
            e.preventDefault();
          }
        }
        lastTouchEnd = now;
      }, false);
    }
  }

  // Initialize mobile enhancements
  initializeMobileEnhancements();

  // Enhanced panel switching with loading states
  function enhancedShowPanel(id, skipAnimation = false) {
    const content = document.querySelector('.content');

    if (!skipAnimation && content) {
      content.classList.add('panel-switching');
      setTimeout(() => {
        content.classList.remove('panel-switching');
      }, 300);
    }

    showPanel(id, skipAnimation);
  }

  // Enhanced panel switching function is now available
  // The existing event listeners will use the enhanced showPanel function

  // Keyboard navigation enhancements
  document.addEventListener('keydown', (e) => {
    // Alt + number keys for quick panel switching
    if (e.altKey && e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      const panelIds = ['planningSection', 'chatSection', 'observabilitySection', 'logSection'];
      const index = parseInt(e.key) - 1;
      if (panelIds[index]) {
        enhancedShowPanel(panelIds[index]);
      }
    }

    // Escape to close mobile navigation
    if (e.key === 'Escape' && window.innerWidth <= 968) {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar && sidebar.classList.contains('mobile-open')) {
        setNavCollapsed(true);
      }
    }
  });

  // Performance optimization for chat container
  function optimizeChatPerformance() {
    const chatOutput = document.querySelector('#chatOutput');
    if (!chatOutput) return;

    // Implement virtual scrolling for large conversations
    const chatThread = chatOutput.querySelector('.chat-thread');
    if (chatThread && chatThread.children.length > 100) {
      // Add performance optimization class
      chatThread.classList.add('performance-mode');

      // Implement message cleanup for memory management
      const messages = Array.from(chatThread.children);
      if (messages.length > 200) {
        // Keep only the last 150 messages
        messages.slice(0, messages.length - 150).forEach(msg => {
          msg.remove();
        });
      }
    }
  }

  // Run performance optimization periodically
  setInterval(optimizeChatPerformance, 30000);

  // Initialize enhanced features
  document.addEventListener('DOMContentLoaded', () => {
    // Add loading state management
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => {
      panel.addEventListener('transitionstart', () => {
        panel.classList.add('transitioning');
      });

      panel.addEventListener('transitionend', () => {
        panel.classList.remove('transitioning');
      });
    });

    // Initialize chat container if it exists
    const chatOutput = document.querySelector('#chatOutput');
    if (chatOutput) {
      chatOutput.addEventListener('resize', () => {
        // Handle chat container resize
        const chatThread = chatOutput.querySelector('.chat-thread-container');
        if (chatThread) {
          chatThread.scrollTop = chatThread.scrollHeight;
        }
      });
    }
  });

  // Enhanced Message Creation Functions for Task 2

  function createEnhancedMessage(role, content, options = {}) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;

    // Add enhanced meta information
    const meta = document.createElement('div');
    meta.className = 'meta';

    // Add timestamp
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    meta.appendChild(timestamp);

    // Add status if provided
    if (options.status) {
      const status = document.createElement('span');
      status.className = `status ${options.status}`;
      status.textContent = options.status;
      meta.appendChild(status);
    }

    div.appendChild(meta);

    // Add message content
    const msgContent = document.createElement('div');
    msgContent.className = 'msg-content';
    msgContent.textContent = content;
    div.appendChild(msgContent);

    // Add message actions
    const actions = document.createElement('div');
    actions.className = 'msg-actions';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'msg-action-btn';
    copyBtn.innerHTML = '📋 Copy';
    copyBtn.onclick = () => copyMessageContent(content);
    actions.appendChild(copyBtn);

    if (role === 'assistant') {
      const regenerateBtn = document.createElement('button');
      regenerateBtn.className = 'msg-action-btn';
      regenerateBtn.innerHTML = '🔄 Regenerate';
      regenerateBtn.onclick = () => regenerateMessage(div);
      actions.appendChild(regenerateBtn);
    }

    div.appendChild(actions);

    // Add enhanced animations with staggered timing
    const messageCount = document.querySelectorAll('.msg').length;
    div.style.animationDelay = `${Math.min(messageCount * 100, 500)}ms`;

    // Add accessibility attributes
    div.setAttribute('role', 'article');
    div.setAttribute('aria-label', `${role} message`);
    div.setAttribute('tabindex', '0');

    return div;
  }

  function copyMessageContent(content) {
    navigator.clipboard.writeText(content).then(() => {
      // Show temporary success feedback
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--success);
        color: white;
        padding: var(--spacing-sm) var(--spacing-md);
        border-radius: var(--radius-md);
        z-index: 10000;
        animation: slideInRight 0.3s ease;
      `;
      notification.textContent = 'Message copied to clipboard';
      document.body.appendChild(notification);

      setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease forwards';
        setTimeout(() => document.body.removeChild(notification), 300);
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy message:', err);
    });
  }

  function regenerateMessage(messageElement) {
    // Add regenerating state
    messageElement.classList.add('loading');

    // Simulate regeneration (this would connect to actual API)
    setTimeout(() => {
      messageElement.classList.remove('loading');
      log('Chat', 'Message regeneration requested');
    }, 1000);
  }

  function addMessageToThread(role, content, options = {}) {
    const thread = createChatThread();
    const message = createEnhancedMessage(role, content, options);

    // Add to message history
    messageHistory.push({
      id: Date.now(),
      role,
      content,
      timestamp: new Date(),
      ...options
    });

    thread.appendChild(message);

    // Auto-scroll to new message
    setTimeout(() => {
      message.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);

    // Update chat controls
    updateChatControls();

    return message;
  }

  // updateChatControls function is defined above with enhanced functionality

  // Enhanced typing indicator with modern glass morphism styling
  function showTypingIndicator() {
    const thread = createChatThread();
    const existingIndicator = thread.querySelector('.typing-indicator');

    if (existingIndicator) {
      return existingIndicator;
    }

    const indicator = document.createElement('div');
    indicator.className = 'msg assistant typing-indicator';
    indicator.innerHTML = `
      <div class="meta">
        <span class="typing-text">Assistant is thinking</span>
      </div>
      <div class="typing-dots">
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
      </div>
    `;

    thread.appendChild(indicator);

    // Auto-scroll to typing indicator with smooth animation
    setTimeout(() => {
      indicator.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 100);

    // Log typing indicator display
    log('Chat', 'Typing indicator shown', { timestamp: new Date().toISOString() });

    return indicator;
  }

  function hideTypingIndicator() {
    const indicators = document.querySelectorAll('.typing-indicator');
    indicators.forEach(indicator => {
      indicator.style.animation = 'messageSlideOut 0.3s ease forwards';
      setTimeout(() => {
        if (indicator.parentNode) {
          indicator.parentNode.removeChild(indicator);
        }
      }, 300);
    });

    if (indicators.length > 0) {
      log('Chat', 'Typing indicator hidden', { count: indicators.length });
    }
  }

  // Enhanced message status updates
  function updateMessageStatus(messageElement, status) {
    const statusElement = messageElement.querySelector('.meta .status');
    if (statusElement) {
      statusElement.className = `status ${status}`;
      statusElement.textContent = status;
    }

    // Add visual feedback for status changes
    messageElement.classList.add('status-updating');
    setTimeout(() => {
      messageElement.classList.remove('status-updating');
    }, 300);
  }

  // Add CSS animations for notifications
  const notificationStyles = document.createElement('style');
  notificationStyles.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
    
    @keyframes messageSlideOut {
      from {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      to {
        opacity: 0;
        transform: translateY(-20px) scale(0.9);
      }
    }
    
    .msg.status-updating {
      animation: statusPulse 0.3s ease;
    }
    
    @keyframes statusPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.02); }
    }
  `;
  document.head.appendChild(notificationStyles);

  // Initialize enhanced chat features
  document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners for chat controls
    document.addEventListener('click', (e) => {
      if (e.target.id === 'clearChat') {
        clearChatHistory();
      } else if (e.target.id === 'toggleThinking') {
        toggleThinkingMode();
      } else if (e.target.id === 'exportChat') {
        exportChatHistory();
      }
    });

    // Initialize performance optimizations for chat
    initializeChatPerformanceOptimizations();
    initializePerformanceUtilities();
  });

  // Initialize chat performance optimizations
  function initializeChatPerformanceOptimizations() {
    const chatOutput = document.querySelector('#chatOutput');
    if (!chatOutput) return;

    // Set up virtual scrolling if needed
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if we need to enable virtual scrolling
          const messageCount = chatOutput.querySelectorAll('.msg, .message').length;

          if (messageCount > VIRTUAL_SCROLL_THRESHOLD && !virtualScrollEnabled) {
            log('Performance', 'Enabling virtual scrolling', { messageCount });
            initializeVirtualScrolling(chatOutput);
          }

          // Update virtual scroll if already enabled
          if (virtualScrollEnabled) {
            // Update message history from DOM
            updateMessageHistoryFromDOM();
            updateVirtualScroll();
          }

          // Optimize DOM if we have many messages
          if (messageCount > MAX_VISIBLE_MESSAGES && !virtualScrollEnabled) {
            optimizeMessageDOM();
          }
        }
      });
    });

    observer.observe(chatOutput, {
      childList: true,
      subtree: true
    });

    // Add scroll optimization
    chatOutput.addEventListener('scroll', debounceScroll);

    log('Performance', 'Chat performance optimizations initialized');
  }

  // Update message history from DOM elements
  function updateMessageHistoryFromDOM() {
    const messages = document.querySelectorAll('.msg, .message');
    const newHistory = [];

    messages.forEach((msgEl, index) => {
      const role = msgEl.classList.contains('user') ? 'user' : 'assistant';
      const content = msgEl.querySelector('.msg-content, .message-content')?.textContent || '';
      const timestamp = msgEl.dataset.timestamp || new Date().toISOString();

      newHistory.push({
        role,
        content,
        timestamp,
        index
      });
    });

    // Only update if we have new messages
    if (newHistory.length > messageHistory.length) {
      messageHistory = newHistory;
      log('Performance', 'Message history updated from DOM', { count: newHistory.length });
    }
  }

  // Optimize message DOM for performance
  function optimizeMessageDOM() {
    const chatOutput = document.querySelector('#chatOutput');
    if (!chatOutput) return;

    const messages = chatOutput.querySelectorAll('.msg, .message');
    const visibleMessages = Array.from(messages).slice(-MAX_VISIBLE_MESSAGES);

    // Hide older messages but keep them in DOM for history
    messages.forEach((msg, index) => {
      if (index < messages.length - MAX_VISIBLE_MESSAGES) {
        msg.style.display = 'none';
        msg.classList.add('hidden-for-performance');
      } else {
        msg.style.display = '';
        msg.classList.remove('hidden-for-performance');
      }
    });

    log('Performance', 'DOM optimized', {
      totalMessages: messages.length,
      visibleMessages: visibleMessages.length,
      hiddenMessages: messages.length - visibleMessages.length
    });
  }

  // Enhanced scroll to bottom with performance optimization
  function scrollToBottomOptimized() {
    const chatOutput = document.querySelector('#chatOutput');
    if (!chatOutput) return;

    if (virtualScrollEnabled) {
      smoothScrollToBottom();
    } else {
      // Use efficient scrolling for regular mode
      window.scheduleDOMUpdate(() => {
        chatOutput.scrollTop = chatOutput.scrollHeight;
      });
    }
  }

  // Pagination implementation for non-virtual scroll mode
  function implementMessagePagination() {
    const chatOutput = document.querySelector('#chatOutput');
    if (!chatOutput || virtualScrollEnabled) return;

    const messages = chatOutput.querySelectorAll('.msg, .message');
    if (messages.length <= MAX_VISIBLE_MESSAGES) return;

    // Create pagination controls
    const paginationContainer = document.createElement('div');
    paginationContainer.className = 'message-pagination';
    paginationContainer.innerHTML = `
      <div class="pagination-info">
        <span>Showing latest ${MAX_VISIBLE_MESSAGES} of ${messages.length} messages</span>
      </div>
      <div class="pagination-controls">
        <button class="pagination-btn" id="loadOlderMessages">
          <span class="btn-icon">⬆️</span>
          <span class="btn-text">Load Older Messages</span>
        </button>
        <button class="pagination-btn" id="showAllMessages">
          <span class="btn-icon">📜</span>
          <span class="btn-text">Show All</span>
        </button>
      </div>
    `;

    // Insert pagination at the top of chat
    const chatThread = chatOutput.querySelector('.chat-thread');
    if (chatThread) {
      chatThread.insertBefore(paginationContainer, chatThread.firstChild);
    }

    // Add event listeners
    document.getElementById('loadOlderMessages')?.addEventListener('click', () => {
      loadOlderMessages(20); // Load 20 more messages
    });

    document.getElementById('showAllMessages')?.addEventListener('click', () => {
      showAllMessages();
    });

    log('Performance', 'Message pagination implemented', {
      totalMessages: messages.length,
      visibleMessages: MAX_VISIBLE_MESSAGES
    });
  }

  function loadOlderMessages(count = 20) {
    const hiddenMessages = document.querySelectorAll('.hidden-for-performance');
    const messagesToShow = Array.from(hiddenMessages).slice(-count);

    messagesToShow.forEach(msg => {
      msg.style.display = '';
      msg.classList.remove('hidden-for-performance');
    });

    // Update pagination info
    const paginationInfo = document.querySelector('.pagination-info span');
    if (paginationInfo) {
      const visibleCount = document.querySelectorAll('.msg:not(.hidden-for-performance), .message:not(.hidden-for-performance)').length;
      const totalCount = document.querySelectorAll('.msg, .message').length;
      paginationInfo.textContent = `Showing ${visibleCount} of ${totalCount} messages`;
    }

    log('Performance', 'Loaded older messages', { count: messagesToShow.length });
  }

  function showAllMessages() {
    const hiddenMessages = document.querySelectorAll('.hidden-for-performance');
    hiddenMessages.forEach(msg => {
      msg.style.display = '';
      msg.classList.remove('hidden-for-performance');
    });

    // Remove pagination controls
    const pagination = document.querySelector('.message-pagination');
    if (pagination) {
      pagination.remove();
    }

    log('Performance', 'All messages shown', { count: hiddenMessages.length });
  }

  function clearChatHistory() {
    const thread = document.querySelector('.chat-thread');
    if (thread) {
      // Clear virtual scroll state
      if (virtualScrollEnabled) {
        messageElements.clear();
        visibleMessageRange = { start: 0, end: MAX_VISIBLE_MESSAGES };
        virtualScrollEnabled = false;
      }

      // Clear message history
      messageHistory = [];

      // Animate messages out with staggered timing
      const messages = thread.querySelectorAll('.msg, .message');
      messages.forEach((msg, index) => {
        setTimeout(() => {
          msg.style.animation = 'messageSlideOut 0.3s ease forwards';
          setTimeout(() => {
            if (msg.parentNode) {
              msg.remove();
            }
          }, 300);
        }, index * 50);
      });

      // Clear thread after all animations
      setTimeout(() => {
        thread.innerHTML = '';

        // Add welcome message
        const welcomeMsg = document.createElement('div');
        welcomeMsg.className = 'msg system welcome';
        welcomeMsg.innerHTML = `
          <div class="welcome-content">
            <span class="welcome-icon">🗑️</span>
            <span class="welcome-text">Chat history cleared</span>
          </div>
        `;
        thread.appendChild(welcomeMsg);

        // Remove welcome message after delay
        setTimeout(() => {
          if (welcomeMsg.parentNode) {
            welcomeMsg.remove();
          }
        }, 3000);
      }, messages.length * 50 + 300);

      log('Performance', 'Chat history cleared', { messageCount: messages.length });
    }
  }

  // Performance monitoring and debugging utilities
  function enablePerformanceDebugMode() {
    const chatOutput = document.querySelector('#chatOutput');
    if (chatOutput) {
      chatOutput.classList.add('performance-debug');
      log('Performance', 'Debug mode enabled');
    }
  }

  function disablePerformanceDebugMode() {
    const chatOutput = document.querySelector('#chatOutput');
    if (chatOutput) {
      chatOutput.classList.remove('performance-debug');
      log('Performance', 'Debug mode disabled');
    }
  }

  // Performance metrics collection
  function collectPerformanceMetrics() {
    const metrics = {
      timestamp: Date.now(),
      messageCount: messageHistory.length,
      virtualScrollEnabled,
      visibleRange: visibleMessageRange,
      cachedElements: messageElements.size,
      markdownCacheSize: markdownCache.size,
      memoryUsage: performance.memory ? {
        used: performance.memory.usedJSHeapSize,
        total: performance.memory.totalJSHeapSize,
        limit: performance.memory.jsHeapSizeLimit
      } : null,
      timing: performance.timing ? {
        domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart
      } : null
    };

    return metrics;
  }

  // Performance warning system
  function checkPerformanceWarnings() {
    const metrics = collectPerformanceMetrics();
    const warnings = [];

    if (metrics.messageCount > VIRTUAL_SCROLL_THRESHOLD && !virtualScrollEnabled) {
      warnings.push({
        type: 'warning',
        message: `Consider enabling virtual scrolling (${metrics.messageCount} messages)`
      });
    }

    if (metrics.cachedElements > 500) {
      warnings.push({
        type: 'warning',
        message: `High memory usage: ${metrics.cachedElements} cached elements`
      });
    }

    if (metrics.memoryUsage && metrics.memoryUsage.used > metrics.memoryUsage.limit * 0.8) {
      warnings.push({
        type: 'error',
        message: 'Memory usage critical: Consider clearing chat history'
      });
    }

    return warnings;
  }

  // Show performance indicator
  function showPerformanceIndicator(message, type = 'info', duration = 3000) {
    let indicator = document.querySelector('.performance-indicator');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'performance-indicator';
      document.body.appendChild(indicator);
    }

    indicator.textContent = message;
    indicator.className = `performance-indicator ${type} visible`;

    setTimeout(() => {
      indicator.classList.remove('visible');
    }, duration);
  }

  // Periodic performance monitoring
  function startPerformanceMonitoring() {
    setInterval(() => {
      const warnings = checkPerformanceWarnings();
      warnings.forEach(warning => {
        showPerformanceIndicator(warning.message, warning.type);
        log('Performance', warning.message, { type: warning.type });
      });
    }, 60000); // Check every minute
  }

  // Initialize performance utilities and monitoring
  function initializePerformanceUtilities() {
    // Export performance utilities for debugging
    window.performanceUtils = {
      enableDebugMode: enablePerformanceDebugMode,
      disableDebugMode: disablePerformanceDebugMode,
      collectMetrics: collectPerformanceMetrics,
      checkWarnings: checkPerformanceWarnings,
      showIndicator: showPerformanceIndicator,

      // Virtual scrolling controls
      enableVirtualScroll: () => {
        const chatOutput = document.querySelector('#chatOutput');
        if (chatOutput) initializeVirtualScrolling(chatOutput);
      },

      disableVirtualScroll: () => {
        virtualScrollEnabled = false;
        messageElements.clear();
        const chatOutput = document.querySelector('#chatOutput');
        if (chatOutput) {
          chatOutput.innerHTML = chatOutput.innerHTML; // Reset DOM
        }
      },

      // Memory management
      forceCleanup: performMemoryCleanup,

      // Pagination controls
      implementPagination: implementMessagePagination,
      loadOlder: loadOlderMessages,
      showAll: showAllMessages
    };

    // Start performance monitoring
    startPerformanceMonitoring();

    // Add performance keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl+Shift+P for performance debug toggle
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        const chatOutput = document.querySelector('#chatOutput');
        if (chatOutput && chatOutput.classList.contains('performance-debug')) {
          disablePerformanceDebugMode();
          showPerformanceIndicator('Performance debug mode disabled', 'info');
        } else {
          enablePerformanceDebugMode();
          showPerformanceIndicator('Performance debug mode enabled', 'info');
        }
      }

      // Ctrl+Shift+M for memory cleanup
      if (e.ctrlKey && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        performMemoryCleanup();
        showPerformanceIndicator('Memory cleanup performed', 'success');
      }

      // Ctrl+Shift+V for virtual scroll toggle
      if (e.ctrlKey && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        const chatOutput = document.querySelector('#chatOutput');
        if (virtualScrollEnabled) {
          window.performanceUtils.disableVirtualScroll();
          showPerformanceIndicator('Virtual scrolling disabled', 'info');
        } else if (chatOutput) {
          initializeVirtualScrolling(chatOutput);
          showPerformanceIndicator('Virtual scrolling enabled', 'success');
        }
      }
    });

    log('Performance', 'Performance optimization task completed', {
      virtualScrollThreshold: VIRTUAL_SCROLL_THRESHOLD,
      maxVisibleMessages: MAX_VISIBLE_MESSAGES,
      bufferSize: MESSAGE_BUFFER_SIZE,
      cleanupInterval: MEMORY_CLEANUP_INTERVAL
    });
  }

function toggleThinkingMode() {
  isThinkingMode = !isThinkingMode;
  const btn = document.getElementById('toggleThinking');
  if (btn) {
    btn.classList.toggle('active', isThinkingMode);
    btn.innerHTML = `<span class="icon">🧠</span> ${isThinkingMode ? 'Simple' : 'Detailed'}`;
  }
  log('Chat', `Thinking mode: ${isThinkingMode ? 'detailed' : 'simple'}`);
}

// Enhanced exportChatHistory function with multiple formats is defined above

// Enhanced message sending states with visual feedback
function setMessageSendingState(messageElement, state) {
  if (!messageElement) return;

  // Remove all existing state classes
  messageElement.classList.remove('sending', 'sent', 'error');

  // Add new state class
  if (state && state !== 'normal') {
    messageElement.classList.add(state);
  }

  log('Chat', 'Message state updated', { state, messageId: messageElement.id || 'unknown' });
}



// Enhanced error display with retry mechanisms
function showErrorDisplay(errorMessage, retryCallback = null, dismissCallback = null) {
  const thread = createChatThread();

  // Remove any existing error displays
  const existingErrors = thread.querySelectorAll('.error-display');
  existingErrors.forEach(error => error.remove());

  const errorDisplay = document.createElement('div');
  errorDisplay.className = 'error-display';

  const errorId = `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  errorDisplay.id = errorId;

  errorDisplay.innerHTML = `
      <div class="error-header">
        <span class="error-icon">⚠️</span>
        <span class="error-title">Error</span>
      </div>
      <div class="error-message">${escapeHtml(errorMessage)}</div>
      <div class="error-actions">
        ${retryCallback ? `
          <button class="retry-btn" onclick="handleErrorRetry('${errorId}')">
            <span>🔄</span>
            <span>Retry</span>
          </button>
        ` : ''}
        <button class="dismiss-btn" onclick="handleErrorDismiss('${errorId}')">
          <span>Dismiss</span>
        </button>
      </div>
    `;

  thread.appendChild(errorDisplay);

  // Store callbacks for later use
  if (retryCallback) {
    window[`retryCallback_${errorId}`] = retryCallback;
  }
  if (dismissCallback) {
    window[`dismissCallback_${errorId}`] = dismissCallback;
  }

  // Auto-scroll to error display
  setTimeout(() => {
    errorDisplay.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);

  log('Chat', 'Error display shown', {
    errorId,
    message: errorMessage,
    hasRetry: !!retryCallback
  });

  return errorId;
}

// Global error handling functions
window.handleErrorRetry = function (errorId) {
  const retryBtn = document.querySelector(`#${errorId} .retry-btn`);
  const retryCallback = window[`retryCallback_${errorId}`];

  if (retryBtn && retryCallback) {
    retryBtn.classList.add('retrying');
    retryBtn.disabled = true;

    log('Chat', 'Error retry initiated', { errorId });

    // Execute retry callback
    Promise.resolve(retryCallback()).then(() => {
      // Remove error display on successful retry
      const errorDisplay = document.getElementById(errorId);
      if (errorDisplay) {
        errorDisplay.style.animation = 'errorSlideOut 0.3s ease forwards';
        setTimeout(() => {
          if (errorDisplay.parentNode) {
            errorDisplay.parentNode.removeChild(errorDisplay);
          }
        }, 300);
      }

      // Clean up callbacks
      delete window[`retryCallback_${errorId}`];
      delete window[`dismissCallback_${errorId}`];

      log('Chat', 'Error retry completed', { errorId });
    }).catch((error) => {
      // Re-enable retry button on failure
      retryBtn.classList.remove('retrying');
      retryBtn.disabled = false;

      log('Chat', 'Error retry failed', { errorId, error: String(error) });
    });
  }
};

window.handleErrorDismiss = function (errorId) {
  const errorDisplay = document.getElementById(errorId);
  const dismissCallback = window[`dismissCallback_${errorId}`];

  if (errorDisplay) {
    errorDisplay.style.animation = 'errorSlideOut 0.3s ease forwards';
    setTimeout(() => {
      if (errorDisplay.parentNode) {
        errorDisplay.parentNode.removeChild(errorDisplay);
      }
    }, 300);

    // Execute dismiss callback if provided
    if (dismissCallback) {
      dismissCallback();
    }

    // Clean up callbacks
    delete window[`retryCallback_${errorId}`];
    delete window[`dismissCallback_${errorId}`];

    log('Chat', 'Error display dismissed', { errorId });
  }
};

// Progress feedback for loading operations
function showProgressIndicator(message = 'Processing...') {
  const thread = createChatThread();

  // Remove existing progress indicators
  const existingProgress = thread.querySelectorAll('.progress-indicator');
  existingProgress.forEach(progress => progress.remove());

  const progressIndicator = document.createElement('div');
  progressIndicator.className = 'progress-indicator';
  progressIndicator.innerHTML = `
      <div class="progress-icon"></div>
      <span class="progress-text">${escapeHtml(message)}</span>
    `;

  thread.appendChild(progressIndicator);

  // Auto-scroll to progress indicator
  setTimeout(() => {
    progressIndicator.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, 100);

  log('Chat', 'Progress indicator shown', { message });

  return progressIndicator;
}

function hideProgressIndicator() {
  const progressIndicators = document.querySelectorAll('.progress-indicator');
  progressIndicators.forEach(indicator => {
    indicator.style.animation = 'progressSlideOut 0.3s ease forwards';
    setTimeout(() => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 300);
  });

  if (progressIndicators.length > 0) {
    log('Chat', 'Progress indicators hidden', { count: progressIndicators.length });
  }
}

// Global functions for external use
window.addChatMessage = addMessageToThread;
window.showChatTyping = showTypingIndicator;
window.hideChatTyping = hideTypingIndicator;
window.updateChatMessageStatus = updateMessageStatus;
window.setMessageSendingState = setMessageSendingState;
window.updateConnectionStatus = updateConnectionStatus;
window.showErrorDisplay = showErrorDisplay;
window.showProgressIndicator = showProgressIndicator;
window.hideProgressIndicator = hideProgressIndicator;

}) ();