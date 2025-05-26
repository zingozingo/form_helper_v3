/**
 * Background Script Messaging Module
 * Handles robust communication with content scripts and panel
 */

class BackgroundMessaging {
  constructor() {
    this.connections = new Map(); // Track active connections
    this.messageHandlers = new Map(); // Message action handlers
    this.defaultTimeout = 20000; // 20 seconds for background operations
    this.contentScriptStatus = new Map(); // Track content script readiness
    
    this.setupHandlers();
  }

  /**
   * Setup message handlers
   */
  setupHandlers() {
    // Handle incoming messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Keep channel open for async response
      const asyncResponse = this.handleMessage(message, sender);
      
      asyncResponse
        .then(response => sendResponse(response))
        .catch(error => {
          console.error('[BRA Background] Handler error:', error);
          sendResponse({ 
            success: false, 
            error: error.message 
          });
        });
      
      return true; // Will respond asynchronously
    });
    
    // Monitor tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        // Mark content script as potentially not ready
        this.contentScriptStatus.delete(tabId);
      }
    });
    
    // Clean up on tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.contentScriptStatus.delete(tabId);
      this.connections.delete(tabId);
    });
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(message, sender) {
    const { action } = message;
    
    // Update content script status
    if (sender.tab && action === 'contentScriptReady') {
      this.contentScriptStatus.set(sender.tab.id, {
        ready: true,
        url: sender.tab.url,
        timestamp: Date.now()
      });
    }
    
    // Route to specific handler
    const handler = this.messageHandlers.get(action);
    if (handler) {
      return await handler(message, sender);
    }
    
    // Default handlers
    switch (action) {
      case 'ping':
        return { alive: true, timestamp: Date.now() };
        
      case 'getContentScriptStatus':
        return this.getContentScriptStatus(message.tabId);
        
      case 'ensureContentScript':
        return await this.ensureContentScript(message.tabId);
        
      default:
        console.warn('[BRA Background] Unknown action:', action);
        return { success: false, error: 'Unknown action' };
    }
  }

  /**
   * Register a message handler
   */
  registerHandler(action, handler) {
    this.messageHandlers.set(action, handler);
  }

  /**
   * Send message to content script with retry and timeout
   */
  async sendToContentScript(tabId, message, options = {}) {
    const {
      timeout = this.defaultTimeout,
      retries = 3,
      ensureReady = true
    } = options;
    
    // Ensure content script is ready if requested
    if (ensureReady) {
      const isReady = await this.ensureContentScript(tabId);
      if (!isReady) {
        throw new Error('Content script not ready');
      }
    }
    
    // Try sending with retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.sendMessageAttempt(tabId, message, timeout);
      } catch (error) {
        console.warn(`[BRA Background] Attempt ${attempt + 1} failed:`, error.message);
        
        if (attempt < retries) {
          // Exponential backoff
          const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
          await this.sleep(delay);
        }
      }
    }
    
    throw new Error('All retry attempts failed');
  }

  /**
   * Single message send attempt
   */
  async sendMessageAttempt(tabId, message, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Message timeout after ${timeout}ms`));
      }, timeout);
      
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Ensure content script is loaded and ready
   */
  async ensureContentScript(tabId, maxWait = 10000) {
    // Check if already ready
    const status = this.contentScriptStatus.get(tabId);
    if (status && status.ready && (Date.now() - status.timestamp < 60000)) {
      return true;
    }
    
    const startTime = Date.now();
    
    // Try pinging first
    while (Date.now() - startTime < maxWait) {
      try {
        const response = await this.sendMessageAttempt(tabId, { action: 'ping' }, 2000);
        if (response?.alive) {
          this.contentScriptStatus.set(tabId, {
            ready: true,
            timestamp: Date.now()
          });
          return true;
        }
      } catch (error) {
        // Expected to fail if not ready
      }
      
      // Wait before retry
      await this.sleep(500);
    }
    
    // Try injecting content script
    try {
      await this.injectContentScript(tabId);
      await this.sleep(1000); // Give it time to initialize
      
      // Try ping again
      const response = await this.sendMessageAttempt(tabId, { action: 'ping' }, 2000);
      if (response?.alive) {
        this.contentScriptStatus.set(tabId, {
          ready: true,
          timestamp: Date.now()
        });
        return true;
      }
    } catch (error) {
      console.error('[BRA Background] Failed to inject content script:', error);
    }
    
    return false;
  }

  /**
   * Inject content script
   */
  async injectContentScript(tabId) {
    const tab = await chrome.tabs.get(tabId);
    
    // Check if URL is allowed
    if (!this.isAllowedUrl(tab.url)) {
      throw new Error('URL not allowed for content script');
    }
    
    // Inject the script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content_instant.js']
    });
    
    console.log('[BRA Background] Content script injected into tab', tabId);
  }

  /**
   * Check if URL is allowed
   */
  isAllowedUrl(url) {
    if (!url) return false;
    
    // Check against patterns
    const patterns = [
      /^https?:\/\/[^\/]*\.gov\//,
      /^https?:\/\/[^\/]*\.state\.us\//,
      /^https?:\/\/localhost/,
      /^https?:\/\/127\.0\.0\.1/
    ];
    
    return patterns.some(pattern => pattern.test(url));
  }

  /**
   * Get content script status
   */
  getContentScriptStatus(tabId) {
    const status = this.contentScriptStatus.get(tabId);
    return {
      ready: status?.ready || false,
      timestamp: status?.timestamp || null,
      age: status ? Date.now() - status.timestamp : null
    };
  }

  /**
   * Broadcast to all content scripts
   */
  async broadcast(message, options = {}) {
    const tabs = await chrome.tabs.query({});
    const results = [];
    
    for (const tab of tabs) {
      if (this.isAllowedUrl(tab.url)) {
        try {
          const response = await this.sendToContentScript(tab.id, message, {
            ...options,
            ensureReady: false,
            retries: 0
          });
          results.push({ 
            tabId: tab.id, 
            success: true, 
            response 
          });
        } catch (error) {
          results.push({ 
            tabId: tab.id, 
            success: false, 
            error: error.message 
          });
        }
      }
    }
    
    return results;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clean up old statuses
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 300000; // 5 minutes
    
    // Clean old content script statuses
    for (const [tabId, status] of this.contentScriptStatus) {
      if (now - status.timestamp > maxAge) {
        this.contentScriptStatus.delete(tabId);
      }
    }
  }
}

// Create and export instance
const backgroundMessaging = new BackgroundMessaging();

// Periodic cleanup
setInterval(() => backgroundMessaging.cleanup(), 60000);

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = backgroundMessaging;
} else {
  self.backgroundMessaging = backgroundMessaging;
}