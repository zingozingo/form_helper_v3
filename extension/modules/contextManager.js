/**
 * Context Manager Module
 * Provides bulletproof extension context validation and recovery
 */

class ContextManager {
  constructor() {
    this.isValid = true;
    this.lastValidationTime = Date.now();
    this.validationInterval = 1000; // Check every second
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.listeners = new Set();
    this.cachedData = new Map();
    this.fallbackMode = false;
    
    // Start monitoring
    this.startMonitoring();
  }

  /**
   * Check if extension context is valid
   */
  checkContext() {
    try {
      // Multiple validation checks
      const checks = [
        typeof chrome !== 'undefined',
        chrome.runtime !== undefined,
        chrome.runtime.id !== undefined,
        chrome.runtime.id !== null,
        chrome.runtime.id.length > 0
      ];
      
      const wasValid = this.isValid;
      this.isValid = checks.every(check => check === true);
      
      // Context restored
      if (!wasValid && this.isValid) {
        console.log('[BRA ContextManager] Extension context restored');
        this.notifyListeners('restored');
        this.reconnectAttempts = 0;
        this.fallbackMode = false;
      }
      
      // Context lost
      if (wasValid && !this.isValid) {
        console.log('[BRA ContextManager] Extension context lost, entering fallback mode');
        this.notifyListeners('lost');
        this.fallbackMode = true;
      }
      
      this.lastValidationTime = Date.now();
      return this.isValid;
    } catch (e) {
      // Even the check failed - definitely invalid
      this.isValid = false;
      this.fallbackMode = true;
      return false;
    }
  }

  /**
   * Start monitoring context validity
   */
  startMonitoring() {
    // Initial check
    this.checkContext();
    
    // Periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkContext();
    }, this.validationInterval);
    
    // Listen for visibility changes
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
          this.checkContext();
        }
      });
    }
  }

  /**
   * Safe wrapper for chrome runtime calls
   */
  async safeCall(fn, fallbackValue = null, options = {}) {
    const { 
      silent = true, 
      cache = true,
      cacheKey = null,
      cacheDuration = 300000 // 5 minutes
    } = options;
    
    // Check cache first
    if (cache && cacheKey && this.cachedData.has(cacheKey)) {
      const cached = this.cachedData.get(cacheKey);
      if (Date.now() - cached.timestamp < cacheDuration) {
        return cached.value;
      }
    }
    
    // If context is invalid, return fallback immediately
    if (!this.checkContext()) {
      if (!silent) {
        console.warn('[BRA ContextManager] Context invalid, using fallback');
      }
      return fallbackValue;
    }
    
    try {
      const result = await fn();
      
      // Cache successful result
      if (cache && cacheKey && result !== null && result !== undefined) {
        this.cachedData.set(cacheKey, {
          value: result,
          timestamp: Date.now()
        });
      }
      
      return result;
    } catch (error) {
      // Check if it's a context error
      if (this.isContextError(error)) {
        this.isValid = false;
        this.fallbackMode = true;
        this.notifyListeners('lost');
        
        if (!silent) {
          console.warn('[BRA ContextManager] Context error detected, using fallback');
        }
        return fallbackValue;
      }
      
      // Other errors - rethrow unless silent
      if (!silent) {
        throw error;
      }
      return fallbackValue;
    }
  }

  /**
   * Check if error is context-related
   */
  isContextError(error) {
    if (!error) return false;
    
    const contextErrors = [
      'Extension context invalidated',
      'Cannot access chrome.runtime',
      'Cannot read property \'id\' of undefined',
      'Cannot read properties of undefined',
      'chrome.runtime is undefined',
      'Extension context was invalidated',
      'The message port closed',
      'Receiving end does not exist'
    ];
    
    const errorMessage = error.message || error.toString();
    return contextErrors.some(msg => errorMessage.includes(msg));
  }

  /**
   * Safe message sending
   */
  async sendMessage(message, options = {}) {
    return this.safeCall(
      async () => {
        return new Promise((resolve) => {
          const timeout = setTimeout(() => {
            resolve(null);
          }, options.timeout || 5000);
          
          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response);
            }
          });
        });
      },
      null,
      { silent: true, cache: false }
    );
  }

  /**
   * Safe storage access
   */
  async getStorage(key, defaultValue = null) {
    return this.safeCall(
      async () => {
        return new Promise((resolve) => {
          chrome.storage.local.get([key], (result) => {
            if (chrome.runtime.lastError) {
              resolve(defaultValue);
            } else {
              resolve(result[key] || defaultValue);
            }
          });
        });
      },
      defaultValue,
      { 
        silent: true, 
        cache: true, 
        cacheKey: `storage_${key}`,
        cacheDuration: 60000 // 1 minute
      }
    );
  }

  /**
   * Safe storage write
   */
  async setStorage(key, value) {
    return this.safeCall(
      async () => {
        return new Promise((resolve) => {
          const data = {};
          data[key] = value;
          chrome.storage.local.set(data, () => {
            if (chrome.runtime.lastError) {
              resolve(false);
            } else {
              // Update cache
              this.cachedData.set(`storage_${key}`, {
                value: value,
                timestamp: Date.now()
              });
              resolve(true);
            }
          });
        });
      },
      false,
      { silent: true, cache: false }
    );
  }

  /**
   * Register a context change listener
   */
  addListener(callback) {
    this.listeners.add(callback);
  }

  /**
   * Remove a context change listener
   */
  removeListener(callback) {
    this.listeners.delete(callback);
  }

  /**
   * Notify all listeners of context change
   */
  notifyListeners(event) {
    this.listeners.forEach(callback => {
      try {
        callback(event, this.isValid);
      } catch (e) {
        console.error('[BRA ContextManager] Listener error:', e);
      }
    });
  }

  /**
   * Get safe chrome runtime ID
   */
  getRuntimeId() {
    try {
      return chrome?.runtime?.id || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if running in extension context
   */
  isExtensionContext() {
    return this.isValid && !this.fallbackMode;
  }

  /**
   * Create error boundary wrapper
   */
  createErrorBoundary(fn, componentName = 'Unknown') {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        if (this.isContextError(error)) {
          console.log(`[BRA ${componentName}] Gracefully handling context invalidation`);
          this.isValid = false;
          this.fallbackMode = true;
          return null;
        }
        // Re-throw non-context errors
        throw error;
      }
    };
  }

  /**
   * Wait for context to be valid
   */
  async waitForContext(timeout = 5000) {
    if (this.isValid) return true;
    
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.checkContext()) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 100);
    });
  }

  /**
   * Clear cache
   */
  clearCache(pattern = null) {
    if (!pattern) {
      this.cachedData.clear();
    } else {
      for (const [key] of this.cachedData) {
        if (key.includes(pattern)) {
          this.cachedData.delete(key);
        }
      }
    }
  }

  /**
   * Destroy the manager
   */
  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    this.listeners.clear();
    this.cachedData.clear();
  }
}

// Create singleton instance
const contextManager = new ContextManager();

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = contextManager;
} else {
  self.contextManager = contextManager;
}