/**
 * Chrome API Wrapper Module
 * Provides bulletproof wrappers for all Chrome API calls
 */

class ChromeApiWrapper {
  constructor() {
    this.contextValid = true;
    this.lastError = null;
    this.errorHandlers = new Set();
  }

  /**
   * Check if Chrome APIs are available
   */
  isAvailable() {
    try {
      return !!(
        typeof chrome !== 'undefined' &&
        chrome.runtime &&
        chrome.runtime.id
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Safe wrapper for any Chrome API call
   */
  async safeCall(apiPath, method, ...args) {
    if (!this.isAvailable()) {
      return { success: false, error: 'Chrome API not available', data: null };
    }

    try {
      // Navigate to the API method
      const pathParts = apiPath.split('.');
      let api = chrome;
      
      for (const part of pathParts) {
        if (!api[part]) {
          throw new Error(`API ${apiPath} not found`);
        }
        api = api[part];
      }

      // Call the method
      const methodFn = api[method];
      if (typeof methodFn !== 'function') {
        throw new Error(`Method ${method} not found on ${apiPath}`);
      }

      // Handle callback-style APIs
      if (this.isCallbackApi(apiPath, method)) {
        return await this.wrapCallback(methodFn.bind(api), ...args);
      }

      // Handle promise-style APIs
      const result = await methodFn.apply(api, args);
      return { success: true, error: null, data: result };

    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Check if API uses callbacks
   */
  isCallbackApi(apiPath, method) {
    const callbackApis = [
      'runtime.sendMessage',
      'tabs.sendMessage',
      'tabs.query',
      'tabs.get',
      'storage.local.get',
      'storage.local.set',
      'storage.sync.get',
      'storage.sync.set'
    ];
    
    return callbackApis.includes(`${apiPath}.${method}`);
  }

  /**
   * Wrap callback-style API
   */
  wrapCallback(fn, ...args) {
    return new Promise((resolve) => {
      try {
        // Add our callback as the last argument
        const callback = (...callbackArgs) => {
          if (chrome.runtime.lastError) {
            resolve(this.handleError(chrome.runtime.lastError));
          } else {
            resolve({ 
              success: true, 
              error: null, 
              data: callbackArgs.length === 1 ? callbackArgs[0] : callbackArgs 
            });
          }
        };

        fn(...args, callback);
      } catch (error) {
        resolve(this.handleError(error));
      }
    });
  }

  /**
   * Handle errors consistently
   */
  handleError(error) {
    const errorMessage = error?.message || error?.toString() || 'Unknown error';
    
    // Check for context errors
    const isContextError = this.isContextError(errorMessage);
    
    if (isContextError) {
      this.contextValid = false;
      // Don't log context errors
      this.notifyErrorHandlers('context', errorMessage);
      return { success: false, error: 'Extension context invalid', data: null };
    }

    // Log other errors
    console.error('[ChromeApiWrapper] API error:', errorMessage);
    this.lastError = errorMessage;
    this.notifyErrorHandlers('api', errorMessage);
    
    return { success: false, error: errorMessage, data: null };
  }

  /**
   * Check if error is context-related
   */
  isContextError(message) {
    const contextErrors = [
      'Extension context invalidated',
      'Cannot access chrome',
      'chrome.runtime is undefined',
      'The message port closed',
      'Receiving end does not exist',
      'Could not establish connection'
    ];
    
    return contextErrors.some(err => message.includes(err));
  }

  /**
   * Add error handler
   */
  onError(handler) {
    this.errorHandlers.add(handler);
  }

  /**
   * Remove error handler
   */
  offError(handler) {
    this.errorHandlers.delete(handler);
  }

  /**
   * Notify error handlers
   */
  notifyErrorHandlers(type, message) {
    this.errorHandlers.forEach(handler => {
      try {
        handler(type, message);
      } catch (e) {
        // Ignore handler errors
      }
    });
  }

  // ===== Specific API Wrappers =====

  /**
   * Send runtime message
   */
  async sendMessage(message, options = {}) {
    const timeout = options.timeout || 5000;
    
    return Promise.race([
      this.safeCall('runtime', 'sendMessage', message),
      new Promise(resolve => 
        setTimeout(() => 
          resolve({ success: false, error: 'Message timeout', data: null }), 
          timeout
        )
      )
    ]);
  }

  /**
   * Send message to tab
   */
  async sendMessageToTab(tabId, message, options = {}) {
    const timeout = options.timeout || 5000;
    
    return Promise.race([
      this.safeCall('tabs', 'sendMessage', tabId, message),
      new Promise(resolve => 
        setTimeout(() => 
          resolve({ success: false, error: 'Message timeout', data: null }), 
          timeout
        )
      )
    ]);
  }

  /**
   * Get current tab
   */
  async getCurrentTab() {
    const result = await this.safeCall('tabs', 'query', { 
      active: true, 
      currentWindow: true 
    });
    
    if (result.success && result.data && result.data[0]) {
      return { success: true, error: null, data: result.data[0] };
    }
    
    return { success: false, error: 'No active tab found', data: null };
  }

  /**
   * Get tab by ID
   */
  async getTab(tabId) {
    return this.safeCall('tabs', 'get', tabId);
  }

  /**
   * Get storage value
   */
  async getStorage(key, storageArea = 'local') {
    const result = await this.safeCall(`storage.${storageArea}`, 'get', key);
    
    if (result.success && result.data) {
      return { 
        success: true, 
        error: null, 
        data: result.data[key] 
      };
    }
    
    return result;
  }

  /**
   * Set storage value
   */
  async setStorage(key, value, storageArea = 'local') {
    const data = {};
    data[key] = value;
    return this.safeCall(`storage.${storageArea}`, 'set', data);
  }

  /**
   * Execute script in tab
   */
  async executeScript(tabId, func, args = []) {
    if (!this.isAvailable()) {
      return { success: false, error: 'Chrome API not available', data: null };
    }

    try {
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: func,
        args: args
      });
      
      return { 
        success: true, 
        error: null, 
        data: result[0]?.result 
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Create notification
   */
  async createNotification(options) {
    if (!this.isAvailable()) {
      return { success: false, error: 'Chrome API not available', data: null };
    }

    try {
      const notificationId = await chrome.notifications.create(options);
      return { 
        success: true, 
        error: null, 
        data: notificationId 
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Batch operations with transaction-like behavior
   */
  async batch(operations) {
    const results = [];
    
    for (const op of operations) {
      const result = await this.safeCall(op.api, op.method, ...op.args);
      results.push(result);
      
      // Stop on critical errors (optional)
      if (!result.success && op.critical) {
        break;
      }
    }
    
    return results;
  }

  /**
   * Wait for Chrome APIs to be ready
   */
  async waitForReady(timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (this.isAvailable()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return false;
  }
}

// Create singleton instance
const chromeApi = new ChromeApiWrapper();

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = chromeApi;
} else {
  self.chromeApi = chromeApi;
}

// Also export the class for custom instances
if (typeof module !== 'undefined' && module.exports) {
  module.exports.ChromeApiWrapper = ChromeApiWrapper;
} else {
  self.ChromeApiWrapper = ChromeApiWrapper;
}