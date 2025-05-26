/**
 * Messaging utilities for safe communication between extension components
 * Handles context invalidation and provides reconnection logic
 */

class MessagingUtils {
  constructor() {
    this.contextValid = true;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
    this.messageQueue = [];
    this.isReconnecting = false;
  }

  /**
   * Check if the extension context is still valid
   * @returns {boolean} True if context is valid
   */
  isContextValid() {
    try {
      // Try to access chrome.runtime.id - will throw if context is invalid
      return chrome.runtime && chrome.runtime.id && this.contextValid;
    } catch (e) {
      this.contextValid = false;
      return false;
    }
  }

  /**
   * Send a message safely with error handling and retry logic
   * @param {Object} message - Message to send
   * @param {Function} callback - Optional callback
   * @returns {Promise} Promise that resolves with the response
   */
  async sendMessage(message, callback) {
    if (!this.isContextValid()) {
      console.warn('[MessagingUtils] Extension context invalid, message not sent:', message.action || message.type);
      if (callback) callback(null);
      return null;
    }

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            
            // Check if it's a context invalidation error
            if (error.message && (
              error.message.includes('Extension context invalidated') ||
              error.message.includes('Could not establish connection') ||
              error.message.includes('The message port closed')
            )) {
              this.handleContextInvalidation();
              if (callback) callback(null);
              resolve(null);
              return;
            }
            
            // Log other errors but don't spam
            if (!error.message?.includes('Receiving end does not exist')) {
              console.warn('[MessagingUtils] Message error:', error.message);
            }
            
            if (callback) callback(null);
            resolve(null);
          } else {
            if (callback) callback(response);
            resolve(response);
          }
        });
      } catch (error) {
        // Handle synchronous errors
        if (error.message?.includes('Extension context invalidated')) {
          this.handleContextInvalidation();
        } else {
          console.error('[MessagingUtils] Failed to send message:', error);
        }
        if (callback) callback(null);
        resolve(null);
      }
    });
  }

  /**
   * Send a message to a specific tab
   * @param {number} tabId - Tab ID
   * @param {Object} message - Message to send
   * @param {Function} callback - Optional callback
   * @returns {Promise} Promise that resolves with the response
   */
  async sendMessageToTab(tabId, message, callback) {
    if (!this.isContextValid() || !tabId) {
      if (callback) callback(null);
      return null;
    }

    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            
            if (error.message?.includes('Extension context invalidated')) {
              this.handleContextInvalidation();
            } else if (!error.message?.includes('Receiving end does not exist')) {
              console.warn('[MessagingUtils] Tab message error:', error.message);
            }
            
            if (callback) callback(null);
            resolve(null);
          } else {
            if (callback) callback(response);
            resolve(response);
          }
        });
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          this.handleContextInvalidation();
        }
        if (callback) callback(null);
        resolve(null);
      }
    });
  }

  /**
   * Handle context invalidation
   */
  handleContextInvalidation() {
    this.contextValid = false;
    console.log('[MessagingUtils] Extension context invalidated - cleaning up');
    
    // Clear any pending operations
    this.messageQueue = [];
    
    // Notify listeners if needed
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('extension-context-invalidated'));
    }
  }

  /**
   * Queue a message for sending when context is restored
   * @param {Object} message - Message to queue
   */
  queueMessage(message) {
    if (this.messageQueue.length < 50) { // Prevent memory leaks
      this.messageQueue.push(message);
    }
  }

  /**
   * Attempt to reconnect and flush queued messages
   */
  async attemptReconnect() {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts++;

    console.log(`[MessagingUtils] Attempting reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    // Wait before attempting
    await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));

    if (this.isContextValid()) {
      console.log('[MessagingUtils] Context restored, flushing message queue');
      this.contextValid = true;
      this.reconnectAttempts = 0;
      
      // Flush queued messages
      const messages = [...this.messageQueue];
      this.messageQueue = [];
      
      for (const msg of messages) {
        await this.sendMessage(msg);
      }
    } else {
      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
    }

    this.isReconnecting = false;
  }

  /**
   * Create a safe message listener
   * @param {Function} handler - Message handler function
   * @returns {Function} Wrapped handler
   */
  createMessageListener(handler) {
    return (message, sender, sendResponse) => {
      try {
        // Check context validity
        if (!this.isContextValid()) {
          return false;
        }

        // Call the original handler
        const result = handler(message, sender, sendResponse);
        
        // If handler returns true, it will send response asynchronously
        return result;
      } catch (error) {
        console.error('[MessagingUtils] Error in message handler:', error);
        return false;
      }
    };
  }
}

// Create singleton instance
const messagingUtils = new MessagingUtils();

// Add listener for context invalidation
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(() => {
    messagingUtils.handleContextInvalidation();
  });
}

// Export for use in other modules
export default messagingUtils;
export { messagingUtils };