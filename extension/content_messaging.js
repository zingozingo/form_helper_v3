/**
 * Content Script Messaging Handler
 * Robust messaging with proper error handling and response management
 */

class ContentMessaging {
  constructor() {
    this.messageHandlers = new Map();
    this.pendingResponses = new Map();
    this.messageId = 0;
    this.isConnected = true;
    this.connectionCheckInterval = null;
    
    // Set up message listener with error handling
    this.setupMessageListener();
    
    // Monitor connection health
    this.startConnectionMonitoring();
  }
  
  /**
   * Register a message handler
   */
  registerHandler(action, handler) {
    this.messageHandlers.set(action, handler);
  }
  
  /**
   * Send message to background with retry and error handling
   */
  async sendMessage(message, options = {}) {
    const messageId = ++this.messageId;
    const timeout = options.timeout || 5000;
    const maxRetries = options.retries !== undefined ? options.retries : 2;
    
    // Add message ID for tracking
    message.messageId = messageId;
    message.timestamp = Date.now();
    
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check if we can send messages
        if (!this.isConnected || !chrome.runtime?.id) {
          throw new Error('Extension context not available');
        }
        
        // Create promise that will resolve with response or timeout
        const responsePromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            this.pendingResponses.delete(messageId);
            reject(new Error('Message timeout'));
          }, timeout);
          
          // Store resolver for this message
          this.pendingResponses.set(messageId, {
            resolve: (response) => {
              clearTimeout(timeoutId);
              this.pendingResponses.delete(messageId);
              resolve(response);
            },
            reject: (error) => {
              clearTimeout(timeoutId);
              this.pendingResponses.delete(messageId);
              reject(error);
            },
            timeoutId
          });
          
          // Send the message
          try {
            chrome.runtime.sendMessage(message, (response) => {
              const resolver = this.pendingResponses.get(messageId);
              
              if (chrome.runtime.lastError) {
                const error = chrome.runtime.lastError;
                console.warn('[ContentMessaging] Send error:', error.message);
                
                if (resolver) {
                  resolver.reject(error);
                } else {
                  // Response came after timeout
                  reject(error);
                }
              } else if (resolver) {
                resolver.resolve(response || {});
              } else {
                // Response came after timeout
                resolve(response || {});
              }
            });
          } catch (error) {
            const resolver = this.pendingResponses.get(messageId);
            if (resolver) {
              resolver.reject(error);
            } else {
              reject(error);
            }
          }
        });
        
        // Wait for response
        const response = await responsePromise;
        return response;
        
      } catch (error) {
        lastError = error;
        console.warn(`[ContentMessaging] Attempt ${attempt + 1} failed:`, error.message);
        
        // Don't retry for certain errors
        if (error.message?.includes('Extension context') || 
            error.message?.includes('Cannot access a chrome')) {
          break;
        }
        
        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        }
      }
    }
    
    // All attempts failed - return error response
    console.error('[ContentMessaging] All attempts failed:', lastError);
    return {
      success: false,
      error: lastError?.message || 'Unknown error',
      messageId
    };
  }
  
  /**
   * Set up message listener with proper response handling
   */
  setupMessageListener() {
    if (!chrome.runtime?.onMessage) {
      console.warn('[ContentMessaging] No message API available');
      return;
    }
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Handle message asynchronously
      this.handleMessage(message, sender).then(response => {
        // Make sure we send a response
        if (sendResponse) {
          sendResponse(response || { received: true });
        }
      }).catch(error => {
        console.error('[ContentMessaging] Handler error:', error);
        if (sendResponse) {
          sendResponse({ 
            success: false, 
            error: error.message,
            received: true 
          });
        }
      });
      
      // Return true to indicate async response
      return true;
    });
  }
  
  /**
   * Handle incoming message
   */
  async handleMessage(message, sender) {
    // Update connection status
    this.isConnected = true;
    
    // Handle internal messages
    if (message.messageId && this.pendingResponses.has(message.messageId)) {
      const resolver = this.pendingResponses.get(message.messageId);
      resolver.resolve(message);
      return { acknowledged: true };
    }
    
    // Get handler for this action
    const handler = this.messageHandlers.get(message.action);
    
    if (handler) {
      try {
        const result = await handler(message, sender);
        return {
          success: true,
          ...result,
          messageId: message.messageId
        };
      } catch (error) {
        console.error('[ContentMessaging] Handler error:', error);
        return {
          success: false,
          error: error.message,
          messageId: message.messageId
        };
      }
    }
    
    // No handler found
    return {
      success: false,
      error: 'Unknown action: ' + message.action,
      messageId: message.messageId
    };
  }
  
  /**
   * Start monitoring connection health
   */
  startConnectionMonitoring() {
    // Initial check
    this.checkConnection();
    
    // Periodic checks
    this.connectionCheckInterval = setInterval(() => {
      this.checkConnection();
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Check if connection to background is healthy
   */
  async checkConnection() {
    try {
      if (!chrome.runtime?.id) {
        this.isConnected = false;
        return false;
      }
      
      // Try a ping
      const response = await this.sendMessage({ 
        action: 'ping',
        source: 'content'
      }, { 
        timeout: 2000,
        retries: 0 
      });
      
      this.isConnected = response && response.success !== false;
      return this.isConnected;
      
    } catch (error) {
      this.isConnected = false;
      return false;
    }
  }
  
  /**
   * Clean up
   */
  destroy() {
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval);
    }
    
    // Clear pending responses
    this.pendingResponses.forEach(resolver => {
      resolver.reject(new Error('Messaging destroyed'));
    });
    this.pendingResponses.clear();
    
    this.messageHandlers.clear();
  }
}

// Export for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentMessaging;
} else {
  window.ContentMessaging = ContentMessaging;
}