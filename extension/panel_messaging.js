/**
 * Panel Messaging Wrapper
 * Provides safe messaging for the panel with automatic retry and fallback
 */

class PanelMessaging {
  constructor() {
    this.safeMessaging = null;
    this.fallbackData = {
      lastDetectionResult: null,
      lastError: null
    };
    this.init();
  }
  
  async init() {
    try {
      // Try to load safe messaging module
      const module = await import(chrome.runtime.getURL('messaging_safe.js'));
      this.safeMessaging = module.default || module.safeMessaging;
      console.log('[PanelMessaging] Safe messaging loaded');
    } catch (error) {
      console.warn('[PanelMessaging] Using fallback messaging');
    }
  }
  
  /**
   * Send message to background with fallback
   */
  async sendToBackground(message) {
    // Use safe messaging if available
    if (this.safeMessaging) {
      return await this.safeMessaging.sendMessage(message);
    }
    
    // Fallback implementation
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[PanelMessaging] Background error:', chrome.runtime.lastError);
            resolve(this.getFallbackResponse(message));
          } else {
            resolve(response || {});
          }
        });
      } catch (error) {
        console.error('[PanelMessaging] Send error:', error);
        resolve(this.getFallbackResponse(message));
      }
    });
  }
  
  /**
   * Send message to content script with fallback
   */
  async sendToTab(tabId, message) {
    // Check if tab exists first
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        return this.getFallbackResponse(message);
      }
    } catch (error) {
      return this.getFallbackResponse(message);
    }
    
    // Use safe messaging if available
    if (this.safeMessaging) {
      return await this.safeMessaging.sendMessageToTab(tabId, message);
    }
    
    // Fallback implementation with retry
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        const response = await new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(tabId, message, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });
        
        return response || {};
      } catch (error) {
        console.warn(`[PanelMessaging] Tab message attempt ${attempts} failed:`, error.message);
        
        // If it's a connection error and we have more attempts, retry
        if (attempts < maxAttempts && 
            (error.message.includes('Could not establish connection') ||
             error.message.includes('message port closed'))) {
          await new Promise(resolve => setTimeout(resolve, 500 * attempts));
          continue;
        }
        
        // Otherwise return fallback
        return this.getFallbackResponse(message);
      }
    }
    
    return this.getFallbackResponse(message);
  }
  
  /**
   * Get fallback response based on message type
   */
  getFallbackResponse(message) {
    const action = message.action || message.type;
    
    switch (action) {
      case 'getDetectionResult':
        return {
          success: false,
          result: this.fallbackData.lastDetectionResult,
          error: 'Communication error - using cached data'
        };
        
      case 'triggerDetection':
      case 'detectForms':
        return {
          success: false,
          error: 'Cannot communicate with page - please refresh',
          needsRefresh: true
        };
        
      case 'ping':
        return {
          status: 'error',
          error: 'Connection lost'
        };
        
      default:
        return {
          success: false,
          error: 'Communication error'
        };
    }
  }
  
  /**
   * Store detection result for fallback
   */
  cacheDetectionResult(result) {
    if (result && result.isBusinessRegistrationForm) {
      this.fallbackData.lastDetectionResult = result;
    }
  }
  
  /**
   * Check if messaging is available
   */
  isAvailable() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }
}

// Create singleton instance
const panelMessaging = new PanelMessaging();

// Export for use in panel.js
window.panelMessaging = panelMessaging;