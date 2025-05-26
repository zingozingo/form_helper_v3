/**
 * Safe Messaging System
 * Handles closed ports, disconnections, and provides retry logic
 */

class SafeMessaging {
  constructor() {
    this.pendingMessages = new Map();
    this.messageId = 0;
    this.isConnected = true;
    this.retryQueue = [];
    this.maxRetries = 3;
    this.retryDelay = 1000;
    
    // Check connection status
    this.checkConnection();
    
    // Setup connection monitoring
    this.setupConnectionMonitoring();
  }
  
  /**
   * Check if extension context is valid
   */
  checkConnection() {
    try {
      this.isConnected = !!(chrome && chrome.runtime && chrome.runtime.id);
      return this.isConnected;
    } catch (e) {
      this.isConnected = false;
      return false;
    }
  }
  
  /**
   * Setup connection monitoring
   */
  setupConnectionMonitoring() {
    // Monitor for extension context invalidation
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.isConnected = false;
        this.cleanup();
      });
    }
    
    // Periodic connection check
    setInterval(() => {
      const wasConnected = this.isConnected;
      this.checkConnection();
      
      // If reconnected, process retry queue
      if (!wasConnected && this.isConnected) {
        this.processRetryQueue();
      }
    }, 5000);
  }
  
  /**
   * Send message with automatic retry and error handling
   */
  async sendMessage(message, options = {}) {
    const messageId = ++this.messageId;
    const timeout = options.timeout || 10000;
    const retries = options.retries !== undefined ? options.retries : this.maxRetries;
    
    // Check connection first
    if (!this.checkConnection()) {
      console.warn('[SafeMessaging] Not connected, queueing message');
      if (retries > 0) {
        this.retryQueue.push({ message, options, retries });
      }
      return this.getDefaultResponse(message);
    }
    
    return new Promise((resolve) => {
      let attempts = 0;
      let timeoutId;
      
      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        this.pendingMessages.delete(messageId);
      };
      
      const attemptSend = () => {
        attempts++;
        
        try {
          // Set timeout
          timeoutId = setTimeout(() => {
            cleanup();
            console.warn(`[SafeMessaging] Message ${messageId} timed out`);
            
            // Retry or return default
            if (attempts < retries) {
              setTimeout(attemptSend, this.retryDelay * attempts);
            } else {
              resolve(this.getDefaultResponse(message));
            }
          }, timeout);
          
          // Store pending message
          this.pendingMessages.set(messageId, { resolve, cleanup });
          
          // Send message
          chrome.runtime.sendMessage(
            { ...message, _messageId: messageId },
            (response) => {
              cleanup();
              
              // Check for errors
              if (chrome.runtime.lastError) {
                const error = chrome.runtime.lastError;
                console.warn(`[SafeMessaging] Send error:`, error.message);
                
                // Handle specific errors
                if (error.message.includes('message port closed') ||
                    error.message.includes('extension context invalidated')) {
                  this.isConnected = false;
                  
                  // Queue for retry if retries available
                  if (attempts < retries) {
                    this.retryQueue.push({ 
                      message, 
                      options: { ...options, retries: retries - attempts },
                      retries: retries - attempts 
                    });
                  }
                }
                
                // Retry or return default
                if (attempts < retries && this.isConnected) {
                  setTimeout(attemptSend, this.retryDelay * attempts);
                } else {
                  resolve(this.getDefaultResponse(message));
                }
              } else {
                // Success
                resolve(response || {});
              }
            }
          );
        } catch (error) {
          cleanup();
          console.error('[SafeMessaging] Exception:', error);
          
          // Retry or return default
          if (attempts < retries && this.isConnected) {
            setTimeout(attemptSend, this.retryDelay * attempts);
          } else {
            resolve(this.getDefaultResponse(message));
          }
        }
      };
      
      attemptSend();
    });
  }
  
  /**
   * Send message to specific tab
   */
  async sendMessageToTab(tabId, message, options = {}) {
    if (!this.checkConnection()) {
      return this.getDefaultResponse(message);
    }
    
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[SafeMessaging] Tab message error:', chrome.runtime.lastError);
            resolve(this.getDefaultResponse(message));
          } else {
            resolve(response || {});
          }
        });
      } catch (error) {
        console.error('[SafeMessaging] Tab message exception:', error);
        resolve(this.getDefaultResponse(message));
      }
    });
  }
  
  /**
   * Get default response for a message type
   */
  getDefaultResponse(message) {
    const action = message.action || message.type;
    
    switch (action) {
      case 'ping':
        return { status: 'offline' };
        
      case 'detectForms':
      case 'triggerDetection':
        return { 
          success: false, 
          error: 'Background connection lost',
          fallback: true 
        };
        
      case 'getDetectionResult':
        return { 
          success: false, 
          result: null,
          error: 'Background connection lost' 
        };
        
      default:
        return { 
          success: false, 
          error: 'Background connection lost' 
        };
    }
  }
  
  /**
   * Process retry queue
   */
  async processRetryQueue() {
    if (!this.isConnected || this.retryQueue.length === 0) return;
    
    console.log(`[SafeMessaging] Processing ${this.retryQueue.length} queued messages`);
    
    const queue = [...this.retryQueue];
    this.retryQueue = [];
    
    for (const item of queue) {
      if (!this.isConnected) {
        // Re-queue if disconnected again
        this.retryQueue.push(item);
        break;
      }
      
      try {
        await this.sendMessage(item.message, item.options);
      } catch (error) {
        console.error('[SafeMessaging] Retry failed:', error);
      }
      
      // Small delay between retries
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  /**
   * Cleanup pending messages
   */
  cleanup() {
    this.pendingMessages.forEach(({ resolve, cleanup }) => {
      cleanup();
      resolve({ success: false, error: 'Connection closed' });
    });
    this.pendingMessages.clear();
  }
  
  /**
   * Create a one-way notification (no response expected)
   */
  notify(message) {
    if (!this.checkConnection()) return;
    
    try {
      chrome.runtime.sendMessage(message, () => {
        // Ignore response and errors for notifications
        if (chrome.runtime.lastError) {
          // Silent fail for notifications
        }
      });
    } catch (error) {
      // Silent fail for notifications
    }
  }
}

// Export singleton instance
const safeMessaging = new SafeMessaging();

// Also export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = safeMessaging;
}

// Export for ES6 modules
export default safeMessaging;
export { SafeMessaging, safeMessaging };