/**
 * Panel Connection Manager
 * Handles robust connection between panel and content scripts
 */

class PanelConnectionManager {
  constructor() {
    this.connections = new Map(); // tabId -> connection state
    this.retryTimeouts = new Map(); // tabId -> timeout ID
    this.messageHandlers = new Map();
    this.contentScriptReadyTabs = new Set();
    
    // Connection states
    this.ConnectionState = {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      FAILED: 'failed'
    };
    
    // Retry configuration
    this.retryConfig = {
      maxRetries: 5,
      baseDelay: 500,
      maxDelay: 10000,
      backoffFactor: 2
    };
    
    // Set up global message listener
    this.setupMessageListener();
    
    // Listen for tab/content script events
    this.setupTabListeners();
  }
  
  /**
   * Get connection state for a tab
   */
  getConnectionState(tabId) {
    return this.connections.get(tabId) || {
      state: this.ConnectionState.DISCONNECTED,
      retryCount: 0,
      lastAttempt: 0,
      error: null
    };
  }
  
  /**
   * Set connection state for a tab
   */
  setConnectionState(tabId, state, error = null) {
    const current = this.getConnectionState(tabId);
    this.connections.set(tabId, {
      ...current,
      state: state,
      error: error,
      lastUpdate: Date.now()
    });
    
    console.log(`[PanelConnection] Tab ${tabId} state: ${state}`, error ? `Error: ${error}` : '');
  }
  
  /**
   * Check if content script is ready
   */
  async isContentScriptReady(tabId) {
    try {
      // First check if tab exists and has valid URL
      const tab = await this.getTab(tabId);
      if (!tab) return false;
      
      // Check if URL is valid for content script
      if (!this.isValidUrl(tab.url)) {
        console.log(`[PanelConnection] Tab ${tabId} has invalid URL for content script:`, tab.url);
        return false;
      }
      
      // Try a ping
      const response = await this.sendPing(tabId);
      return response && response.alive === true;
      
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Get tab info safely
   */
  async getTab(tabId) {
    return new Promise((resolve) => {
      try {
        chrome.tabs.get(tabId, (tab) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(tab);
          }
        });
      } catch (error) {
        resolve(null);
      }
    });
  }
  
  /**
   * Check if URL is valid for content script
   */
  isValidUrl(url) {
    if (!url) return false;
    
    // Must be http/https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }
    
    // Check against manifest patterns
    const patterns = [
      /\.gov\//,
      /\.state\.us\//,
      /\.ca\.gov\//,
      /\.ny\.gov\//,
      /\.tx\.gov\//,
      /\.fl\.gov\//,
      /\.de\.gov\//
    ];
    
    return patterns.some(pattern => pattern.test(url));
  }
  
  /**
   * Send ping to content script
   */
  async sendPing(tabId) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(null);
      }, 1000);
      
      try {
        chrome.tabs.sendMessage(tabId, 
          { action: 'ping', timestamp: Date.now() }, 
          (response) => {
            clearTimeout(timeout);
            
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response || null);
            }
          }
        );
      } catch (error) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }
  
  /**
   * Inject content script if needed
   */
  async injectContentScript(tabId) {
    try {
      const tab = await this.getTab(tabId);
      if (!tab || !this.isValidUrl(tab.url)) {
        return false;
      }
      
      console.log(`[PanelConnection] Injecting content script into tab ${tabId}`);
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content_visual.js']
      });
      
      // Wait a bit for script to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return true;
      
    } catch (error) {
      console.error(`[PanelConnection] Failed to inject content script:`, error);
      return false;
    }
  }
  
  /**
   * Establish connection with retry logic
   */
  async establishConnection(tabId, options = {}) {
    const state = this.getConnectionState(tabId);
    
    // Already connected or connecting
    if (state.state === this.ConnectionState.CONNECTED || 
        state.state === this.ConnectionState.CONNECTING) {
      return state.state === this.ConnectionState.CONNECTED;
    }
    
    // Clear any existing retry timeout
    if (this.retryTimeouts.has(tabId)) {
      clearTimeout(this.retryTimeouts.get(tabId));
      this.retryTimeouts.delete(tabId);
    }
    
    // Set connecting state
    this.setConnectionState(tabId, this.ConnectionState.CONNECTING);
    
    // Attempt connection
    const success = await this.attemptConnection(tabId);
    
    if (success) {
      this.setConnectionState(tabId, this.ConnectionState.CONNECTED);
      this.connections.get(tabId).retryCount = 0;
      return true;
    }
    
    // Connection failed
    const retryCount = state.retryCount || 0;
    
    if (retryCount < this.retryConfig.maxRetries) {
      // Schedule retry
      const delay = Math.min(
        this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, retryCount),
        this.retryConfig.maxDelay
      );
      
      console.log(`[PanelConnection] Scheduling retry ${retryCount + 1} for tab ${tabId} in ${delay}ms`);
      
      this.connections.get(tabId).retryCount = retryCount + 1;
      
      const timeoutId = setTimeout(() => {
        this.retryTimeouts.delete(tabId);
        this.establishConnection(tabId, options);
      }, delay);
      
      this.retryTimeouts.set(tabId, timeoutId);
      
    } else {
      // Max retries reached
      this.setConnectionState(tabId, this.ConnectionState.FAILED, 'Max retries reached');
    }
    
    return false;
  }
  
  /**
   * Attempt single connection
   */
  async attemptConnection(tabId) {
    try {
      // First check if content script is ready
      let isReady = await this.isContentScriptReady(tabId);
      
      if (!isReady) {
        // Try injecting content script
        const injected = await this.injectContentScript(tabId);
        if (injected) {
          // Check again
          isReady = await this.isContentScriptReady(tabId);
        }
      }
      
      return isReady;
      
    } catch (error) {
      console.error(`[PanelConnection] Connection attempt failed:`, error);
      return false;
    }
  }
  
  /**
   * Send message with connection handling
   */
  async sendMessage(tabId, message, options = {}) {
    // Ensure connection first
    const connected = await this.establishConnection(tabId);
    
    if (!connected) {
      console.warn(`[PanelConnection] Not connected to tab ${tabId}`);
      
      // Return fallback response
      return this.getFallbackResponse(message);
    }
    
    // Send message with timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn(`[PanelConnection] Message timeout for tab ${tabId}`);
        resolve(this.getFallbackResponse(message));
      }, options.timeout || 5000);
      
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timeout);
          
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError.message;
            console.warn(`[PanelConnection] Message error:`, error);
            
            // Mark as disconnected
            this.setConnectionState(tabId, this.ConnectionState.DISCONNECTED, error);
            
            // Try to reconnect for next time
            this.establishConnection(tabId);
            
            resolve(this.getFallbackResponse(message));
          } else {
            // Success - ensure marked as connected
            this.setConnectionState(tabId, this.ConnectionState.CONNECTED);
            resolve(response || {});
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        console.error(`[PanelConnection] Send message error:`, error);
        resolve(this.getFallbackResponse(message));
      }
    });
  }
  
  /**
   * Get fallback response for failed messages
   */
  getFallbackResponse(message) {
    const action = message.action;
    
    switch (action) {
      case 'ping':
        return { alive: false, error: 'Not connected' };
        
      case 'getDetectionStatus':
      case 'getDetectionResult':
        return {
          success: false,
          error: 'Not connected',
          isBusinessRegistrationForm: false,
          confidenceScore: 0,
          fieldDetection: {
            isDetected: false,
            fields: [],
            uiData: { sections: [], categories: {} }
          }
        };
        
      case 'triggerDetection':
        return {
          success: false,
          error: 'Not connected',
          scheduled: false
        };
        
      default:
        return {
          success: false,
          error: 'Not connected'
        };
    }
  }
  
  /**
   * Set up message listener
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Handle content script ready
      if (message.action === 'contentScriptReady' && sender.tab) {
        const tabId = sender.tab.id;
        console.log(`[PanelConnection] Content script ready for tab ${tabId}`);
        
        this.contentScriptReadyTabs.add(tabId);
        this.setConnectionState(tabId, this.ConnectionState.CONNECTED);
        
        // Notify any handlers
        this.notifyHandlers('contentScriptReady', { tabId, url: message.url });
      }
      
      // Let other handlers process
      return false;
    });
  }
  
  /**
   * Set up tab event listeners
   */
  setupTabListeners() {
    // Tab removed
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cleanup(tabId);
    });
    
    // Tab updated (navigation)
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading') {
        // Mark as disconnected during navigation
        this.setConnectionState(tabId, this.ConnectionState.DISCONNECTED);
        this.contentScriptReadyTabs.delete(tabId);
      } else if (changeInfo.status === 'complete') {
        // Try to reconnect
        if (this.isValidUrl(tab.url)) {
          this.establishConnection(tabId);
        }
      }
    });
  }
  
  /**
   * Register handler for events
   */
  on(event, handler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event).push(handler);
  }
  
  /**
   * Notify handlers of event
   */
  notifyHandlers(event, data) {
    const handlers = this.messageHandlers.get(event) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`[PanelConnection] Handler error:`, error);
      }
    });
  }
  
  /**
   * Clean up for a tab
   */
  cleanup(tabId) {
    console.log(`[PanelConnection] Cleaning up tab ${tabId}`);
    
    // Clear connection state
    this.connections.delete(tabId);
    this.contentScriptReadyTabs.delete(tabId);
    
    // Clear retry timeout
    if (this.retryTimeouts.has(tabId)) {
      clearTimeout(this.retryTimeouts.get(tabId));
      this.retryTimeouts.delete(tabId);
    }
  }
  
  /**
   * Clean up all connections
   */
  destroy() {
    // Clear all timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts.clear();
    
    // Clear all states
    this.connections.clear();
    this.contentScriptReadyTabs.clear();
    this.messageHandlers.clear();
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PanelConnectionManager;
} else {
  window.PanelConnectionManager = PanelConnectionManager;
}