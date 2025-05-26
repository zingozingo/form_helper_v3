/**
 * Robust Messaging Module for Chrome Extension
 * Handles timeouts, retries, and fallback mechanisms
 */

class RobustMessaging {
  constructor() {
    this.defaultTimeout = 10000; // 10 seconds default
    this.retryDelays = [1000, 2000, 4000]; // Exponential backoff
    this.messageQueue = new Map(); // Track pending messages
    this.responseCache = new Map(); // Cache recent responses
    this.cacheTimeout = 30000; // Cache for 30 seconds
  }

  /**
   * Check if extension context is valid
   */
  isContextValid() {
    try {
      return !!(chrome?.runtime?.id);
    } catch (e) {
      return false;
    }
  }

  /**
   * Send message with timeout, retry, and caching
   */
  async sendMessage(message, options = {}) {
    const {
      timeout = this.defaultTimeout,
      retries = 3,
      cache = true,
      priority = 'normal'
    } = options;

    // Generate cache key
    const cacheKey = this.getCacheKey(message);
    
    // Check cache first
    if (cache && this.responseCache.has(cacheKey)) {
      const cached = this.responseCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log('[BRA Messaging] Using cached response');
        return cached.response;
      }
      this.responseCache.delete(cacheKey);
    }

    // Try sending with retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await this.sendMessageAttempt(message, timeout);
        
        // Cache successful responses
        if (response && cache) {
          this.responseCache.set(cacheKey, {
            response,
            timestamp: Date.now()
          });
        }
        
        return response;
      } catch (error) {
        console.warn(`[BRA Messaging] Attempt ${attempt + 1} failed:`, error.message);
        
        // Don't retry for certain errors
        if (this.isUnrecoverableError(error)) {
          throw error;
        }
        
        // Wait before retry
        if (attempt < retries) {
          const delay = this.retryDelays[Math.min(attempt, this.retryDelays.length - 1)];
          console.log(`[BRA Messaging] Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }
    
    // All retries failed
    console.error('[BRA Messaging] All retry attempts failed');
    return null;
  }

  /**
   * Single message send attempt
   */
  async sendMessageAttempt(message, timeout) {
    if (!this.isContextValid()) {
      throw new Error('Extension context invalid');
    }

    return new Promise((resolve, reject) => {
      const messageId = this.generateId();
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.messageQueue.delete(messageId);
        reject(new Error(`Message timeout after ${timeout}ms`));
      }, timeout);
      
      // Track message
      this.messageQueue.set(messageId, { message, timeoutId });
      
      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeoutId);
          this.messageQueue.delete(messageId);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response || { success: true });
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        this.messageQueue.delete(messageId);
        reject(error);
      }
    });
  }

  /**
   * Send message to specific tab
   */
  async sendMessageToTab(tabId, message, options = {}) {
    const {
      timeout = this.defaultTimeout,
      retries = 3,
      ensureContentScript = true
    } = options;

    if (!tabId) {
      console.error('[BRA Messaging] Invalid tab ID');
      return null;
    }

    // Ensure content script is loaded if requested
    if (ensureContentScript) {
      const isReady = await this.ensureContentScriptReady(tabId);
      if (!isReady) {
        console.warn('[BRA Messaging] Content script not ready');
        return null;
      }
    }

    // Try sending with retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await this.sendTabMessageAttempt(tabId, message, timeout);
      } catch (error) {
        console.warn(`[BRA Messaging] Tab message attempt ${attempt + 1} failed:`, error.message);
        
        if (this.isUnrecoverableError(error)) {
          throw error;
        }
        
        if (attempt < retries) {
          const delay = this.retryDelays[Math.min(attempt, this.retryDelays.length - 1)];
          await this.sleep(delay);
        }
      }
    }
    
    return null;
  }

  /**
   * Single tab message send attempt
   */
  async sendTabMessageAttempt(tabId, message, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tab message timeout after ${timeout}ms`));
      }, timeout);
      
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Ensure content script is loaded and ready
   */
  async ensureContentScriptReady(tabId, maxWait = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        // Send ping to check if content script is ready
        const response = await this.sendTabMessageAttempt(tabId, { action: 'ping' }, 1000);
        if (response?.alive) {
          return true;
        }
      } catch (error) {
        // Expected to fail if not ready
      }
      
      // Wait before next attempt
      await this.sleep(500);
    }
    
    // Try injecting content script as fallback
    try {
      await this.injectContentScript(tabId);
      await this.sleep(1000); // Give it time to initialize
      
      // Check again
      const response = await this.sendTabMessageAttempt(tabId, { action: 'ping' }, 1000);
      return response?.alive === true;
    } catch (error) {
      console.error('[BRA Messaging] Failed to inject content script:', error);
      return false;
    }
  }

  /**
   * Inject content script into tab
   */
  async injectContentScript(tabId) {
    try {
      // Get tab info first
      const tab = await chrome.tabs.get(tabId);
      
      // Check if URL is allowed
      if (!this.isAllowedUrl(tab.url)) {
        throw new Error('URL not allowed for content script');
      }
      
      // Inject content script
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content_instant.js']
      });
      
      console.log('[BRA Messaging] Content script injected successfully');
    } catch (error) {
      console.error('[BRA Messaging] Failed to inject content script:', error);
      throw error;
    }
  }

  /**
   * Broadcast message to all content scripts
   */
  async broadcastMessage(message, options = {}) {
    const tabs = await chrome.tabs.query({});
    const results = [];
    
    for (const tab of tabs) {
      if (this.isAllowedUrl(tab.url)) {
        try {
          const response = await this.sendMessageToTab(tab.id, message, {
            ...options,
            ensureContentScript: false,
            retries: 0
          });
          results.push({ tabId: tab.id, response });
        } catch (error) {
          // Ignore individual tab failures
        }
      }
    }
    
    return results;
  }

  /**
   * Check if error is unrecoverable
   */
  isUnrecoverableError(error) {
    const unrecoverablePatterns = [
      'Extension context invalidated',
      'Cannot access contents of url',
      'chrome:// URLs',
      'edge:// URLs'
    ];
    
    return unrecoverablePatterns.some(pattern => 
      error.message?.includes(pattern)
    );
  }

  /**
   * Check if URL is allowed for content scripts
   */
  isAllowedUrl(url) {
    if (!url) return false;
    
    // Check against manifest patterns
    const patterns = [
      /^https?:\/\/[^\/]*\.gov\//,
      /^https?:\/\/[^\/]*\.state\.us\//
    ];
    
    return patterns.some(pattern => pattern.test(url));
  }

  /**
   * Generate cache key for message
   */
  getCacheKey(message) {
    return JSON.stringify({
      action: message.action,
      data: message.data
    });
  }

  /**
   * Generate unique message ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Clear message queue and cache
   */
  cleanup() {
    // Clear timeouts
    for (const [id, data] of this.messageQueue) {
      clearTimeout(data.timeoutId);
    }
    this.messageQueue.clear();
    
    // Clear old cache entries
    const now = Date.now();
    for (const [key, data] of this.responseCache) {
      if (now - data.timestamp > this.cacheTimeout) {
        this.responseCache.delete(key);
      }
    }
  }
}

// Export singleton instance
const robustMessaging = new RobustMessaging();

// Auto-cleanup every minute
setInterval(() => robustMessaging.cleanup(), 60000);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = robustMessaging;
} else {
  window.robustMessaging = robustMessaging;
}