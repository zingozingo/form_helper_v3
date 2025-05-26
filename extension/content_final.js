/**
 * Business Registration Assistant - Content Script (Final)
 * All messaging functionality inlined to avoid dynamic imports
 */

(function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptFinal) {
    return;
  }
  window.__braContentScriptFinal = true;
  
  console.log('[BRA] Initializing content script');
  
  // ============= INLINED CONTENT MESSAGING CLASS =============
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
          if (!this.isConnected || !chrome?.runtime?.id) {
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
      if (!chrome?.runtime?.onMessage) {
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
        if (!chrome?.runtime?.id) {
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
  
  // ============= INLINED URL DETECTOR =============
  const URLDetector = {
    analyzeUrl(url) {
      try {
        const urlString = typeof url === 'string' ? url : (url?.href || url?.toString() || '');
        const hostname = new URL(urlString).hostname.toLowerCase();
        
        // Check for government domains
        const isGov = hostname.includes('.gov') || 
                     hostname.includes('.state.') ||
                     hostname.includes('state.') ||
                     hostname.includes('.us');
        
        // Try to detect state
        let state = null;
        const statePatterns = {
          'CA': /california|\.ca\.gov/i,
          'NY': /newyork|\.ny\.gov/i,
          'TX': /texas|\.tx\.gov/i,
          'FL': /florida|\.fl\.gov/i,
          'DC': /dc\.gov|district.*columbia/i,
          'DE': /delaware|\.de\.gov/i
        };
        
        for (const [code, pattern] of Object.entries(statePatterns)) {
          if (pattern.test(urlString)) {
            state = code;
            break;
          }
        }
        
        return {
          isGovernmentSite: isGov,
          score: isGov ? 80 : 20,
          state: state
        };
      } catch (error) {
        console.error('[URLDetector] Error analyzing URL:', error);
        return {
          isGovernmentSite: false,
          score: 0,
          state: null
        };
      }
    }
  };
  
  // ============= INLINED FIELD DETECTOR =============
  class FieldDetector {
    constructor(config = {}) {
      this.root = config.root || document.body || document.documentElement;
      this.urlInfo = config.urlInfo || null;
      this.maxElements = 1000;
      this.timeout = 2000;
    }
    
    async detectFields() {
      const startTime = Date.now();
      const fields = [];
      
      try {
        // Find all form elements
        const selector = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea';
        let elements = Array.from(this.root.querySelectorAll(selector) || []);
        
        // Limit elements to prevent performance issues
        if (elements.length > this.maxElements) {
          console.warn(`[FieldDetector] Limiting scan to ${this.maxElements} elements`);
          elements = elements.slice(0, this.maxElements);
        }
        
        // Process elements
        for (const element of elements) {
          // Check timeout
          if (Date.now() - startTime > this.timeout) {
            console.warn('[FieldDetector] Detection timeout');
            break;
          }
          
          // Skip if not visible
          if (!this.isElementVisible(element)) continue;
          
          // Extract field information
          const field = this.extractFieldInfo(element);
          if (field) {
            fields.push(field);
          }
        }
        
        // Look for radio button groups
        const radioGroups = this.findRadioGroups();
        fields.push(...radioGroups);
        
      } catch (error) {
        console.error('[FieldDetector] Error detecting fields:', error);
      }
      
      return fields;
    }
    
    isElementVisible(element) {
      try {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return rect.width > 0 && 
               rect.height > 0 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' &&
               style.opacity !== '0';
      } catch (e) {
        return false;
      }
    }
    
    extractFieldInfo(element) {
      try {
        const field = {
          element: element,
          type: element.type || element.tagName.toLowerCase(),
          name: element.name || '',
          id: element.id || '',
          label: this.findLabel(element),
          placeholder: element.placeholder || '',
          required: element.required || element.getAttribute('aria-required') === 'true',
          value: element.value || '',
          position: this.getElementPosition(element)
        };
        
        // Classify the field
        field.classification = this.classifyField(field);
        
        return field;
      } catch (error) {
        console.error('[FieldDetector] Error extracting field info:', error);
        return null;
      }
    }
    
    findLabel(element) {
      try {
        // Check for aria-label
        const ariaLabel = element.getAttribute('aria-label');
        if (ariaLabel) return { text: ariaLabel, type: 'aria' };
        
        // Check for associated label
        if (element.id) {
          const label = document.querySelector(`label[for="${element.id}"]`);
          if (label) return { text: label.textContent.trim(), type: 'for' };
        }
        
        // Check for parent label
        const parentLabel = element.closest('label');
        if (parentLabel) {
          return { text: parentLabel.textContent.trim(), type: 'parent' };
        }
        
        // Check for nearby text
        const parent = element.parentElement;
        if (parent) {
          const text = parent.textContent.trim();
          if (text && text.length < 100) {
            return { text: text, type: 'nearby' };
          }
        }
        
        return { text: element.name || element.placeholder || '', type: 'fallback' };
      } catch (e) {
        return { text: '', type: 'error' };
      }
    }
    
    getElementPosition(element) {
      try {
        const rect = element.getBoundingClientRect();
        return {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height
        };
      } catch (e) {
        return { top: 0, left: 0, width: 0, height: 0 };
      }
    }
    
    findRadioGroups() {
      const groups = new Map();
      const radios = Array.from(this.root.querySelectorAll('input[type="radio"]') || []);
      
      // Group by name
      radios.forEach(radio => {
        if (!radio.name || !this.isElementVisible(radio)) return;
        
        if (!groups.has(radio.name)) {
          groups.set(radio.name, {
            type: 'radio_group',
            name: radio.name,
            options: [],
            label: this.findLabel(radio),
            position: this.getElementPosition(radio)
          });
        }
        
        groups.get(radio.name).options.push({
          value: radio.value,
          label: this.findLabel(radio).text,
          checked: radio.checked
        });
      });
      
      return Array.from(groups.values());
    }
    
    classifyField(field) {
      const labelText = (field.label?.text || '').toLowerCase();
      const fieldName = field.name.toLowerCase();
      const fieldId = field.id.toLowerCase();
      const combined = `${labelText} ${fieldName} ${fieldId}`.toLowerCase();
      
      // Business-related classifications
      if (combined.match(/business.*name|company.*name|legal.*name|organization/)) {
        return { category: 'business_name', confidence: 90 };
      }
      if (combined.match(/ein|employer.*id|federal.*tax/)) {
        return { category: 'ein', confidence: 90 };
      }
      if (combined.match(/entity.*type|business.*type|structure|incorporation/)) {
        return { category: 'entity_type', confidence: 85 };
      }
      if (combined.match(/dba|doing.*business|trade.*name/)) {
        return { category: 'dba', confidence: 85 };
      }
      if (combined.match(/email|e-mail/)) {
        return { category: 'email', confidence: 90 };
      }
      if (combined.match(/phone|tel|mobile|contact/)) {
        return { category: 'phone', confidence: 85 };
      }
      if (combined.match(/address|street|location/) && !combined.includes('email')) {
        return { category: 'address', confidence: 80 };
      }
      if (combined.match(/city|town/)) {
        return { category: 'city', confidence: 85 };
      }
      if (combined.match(/state|province/) && !combined.includes('statement')) {
        return { category: 'state', confidence: 85 };
      }
      if (combined.match(/zip|postal/)) {
        return { category: 'zip', confidence: 85 };
      }
      
      // Default
      return { category: 'other', confidence: 50 };
    }
    
    getUIData() {
      // Return a simple structure
      return {
        sections: [{
          label: 'Business Information',
          fields: []
        }],
        categories: {
          business_info: {
            label: 'Business Information',
            fields: []
          }
        }
      };
    }
  }
  
  // ============= MAIN CONTENT SCRIPT LOGIC =============
  
  // Initialize messaging
  const messaging = new ContentMessaging();
  
  // State management
  const state = {
    detection: {
      isRunning: false,
      lastResult: null,
      lastRun: 0,
      attempts: 0,
      maxAttempts: 3
    },
    debounceTimer: null
  };
  
  // Configuration
  const CONFIG = {
    DEBOUNCE_DELAY: 500,
    MIN_TIME_BETWEEN_RUNS: 1000,
    DETECTION_TIMEOUT: 3000
  };
  
  /**
   * Register message handlers
   */
  function registerHandlers() {
    // Ping handler
    messaging.registerHandler('ping', async (message) => {
      return {
        alive: true,
        timestamp: Date.now(),
        detectionStatus: {
          hasResult: !!state.detection.lastResult,
          isRunning: state.detection.isRunning,
          attempts: state.detection.attempts
        }
      };
    });
    
    // Get detection status
    messaging.registerHandler('getDetectionStatus', async (message) => {
      return {
        hasResult: !!state.detection.lastResult,
        result: state.detection.lastResult,
        isRunning: state.detection.isRunning,
        attempts: state.detection.attempts,
        maxAttempts: state.detection.maxAttempts,
        lastRun: state.detection.lastRun
      };
    });
    
    // Get detection result
    messaging.registerHandler('getDetectionResult', async (message) => {
      if (state.detection.lastResult) {
        return state.detection.lastResult;
      }
      
      // If no result and not running, trigger detection
      if (!state.detection.isRunning) {
        scheduleDetection();
      }
      
      return {
        isBusinessRegistrationForm: false,
        confidenceScore: 0,
        message: 'No detection result available yet'
      };
    });
    
    // Trigger detection
    messaging.registerHandler('triggerDetection', async (message) => {
      const wasRunning = state.detection.isRunning;
      scheduleDetection();
      
      return {
        scheduled: true,
        wasRunning,
        hasResult: !!state.detection.lastResult,
        result: state.detection.lastResult
      };
    });
    
    // Auto-fill fields (placeholder)
    messaging.registerHandler('autoFillFields', async (message) => {
      return {
        success: false,
        message: 'Auto-fill not yet implemented'
      };
    });
  }
  
  /**
   * Schedule detection with debouncing
   */
  function scheduleDetection() {
    // Clear any pending detection
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer);
    }
    
    // Check minimum time between runs
    const now = Date.now();
    const timeSinceLastRun = now - state.detection.lastRun;
    if (timeSinceLastRun < CONFIG.MIN_TIME_BETWEEN_RUNS) {
      console.log('[BRA] Too soon since last run, skipping');
      return;
    }
    
    // Schedule detection
    state.debounceTimer = setTimeout(() => {
      runDetection();
    }, CONFIG.DEBOUNCE_DELAY);
  }
  
  /**
   * Run form detection
   */
  async function runDetection() {
    if (state.detection.isRunning) {
      console.log('[BRA] Detection already running');
      return;
    }
    
    console.log('[BRA] Starting detection');
    state.detection.isRunning = true;
    state.detection.lastRun = Date.now();
    state.detection.attempts++;
    
    try {
      const result = {
        timestamp: Date.now(),
        url: window.location.href,
        isBusinessRegistrationForm: false,
        confidenceScore: 0,
        urlDetection: null,
        fieldDetection: null
      };
      
      // URL detection
      result.urlDetection = URLDetector.analyzeUrl(window.location);
      console.log('[BRA] URL detection:', result.urlDetection);
      
      // Field detection
      const detector = new FieldDetector({
        root: document.body,
        urlInfo: result.urlDetection
      });
      
      const fields = await detector.detectFields();
      const uiData = detector.getUIData();
      
      result.fieldDetection = {
        isDetected: fields.length > 0,
        fields: fields,
        uiData: uiData,
        confidence: fields.length > 0 ? 60 : 0,
        state: result.urlDetection.state
      };
      
      console.log('[BRA] Field detection found', fields.length, 'fields');
      
      // Calculate overall confidence
      const urlScore = result.urlDetection?.score || 0;
      const fieldScore = result.fieldDetection?.confidence || 0;
      result.confidenceScore = Math.round((urlScore + fieldScore) / 2);
      result.isBusinessRegistrationForm = result.confidenceScore > 40;
      result.state = result.urlDetection.state;
      
      // Store result
      state.detection.lastResult = result;
      
      // Send result to background
      await messaging.sendMessage({
        action: 'formDetected',
        result: result
      });
      
      console.log('[BRA] Detection complete:', result);
      
    } catch (error) {
      console.error('[BRA] Detection error:', error);
      state.detection.lastResult = {
        isBusinessRegistrationForm: false,
        confidenceScore: 0,
        error: error.message
      };
    } finally {
      state.detection.isRunning = false;
    }
  }
  
  /**
   * Set up mutation observer for dynamic content
   */
  function setupObserver() {
    if (!document.body) return;
    
    let observerTimeout;
    const observer = new MutationObserver(() => {
      clearTimeout(observerTimeout);
      observerTimeout = setTimeout(() => {
        // Only trigger if we haven't detected a form yet
        if (!state.detection.lastResult?.isBusinessRegistrationForm) {
          scheduleDetection();
        }
      }, 1000);
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
  }
  
  /**
   * Set up navigation monitoring
   */
  function setupNavigationMonitoring() {
    // Track current URL
    let currentUrl = window.location.href;
    
    // Check for URL changes
    const checkUrlChange = () => {
      const newUrl = window.location.href;
      if (newUrl !== currentUrl) {
        console.log('[BRA] URL changed:', newUrl);
        currentUrl = newUrl;
        
        // Clear previous detection
        state.detection.lastResult = null;
        state.detection.attempts = 0;
        
        // Notify background
        messaging.sendMessage({
          action: 'navigationDetected',
          oldUrl: currentUrl,
          newUrl: newUrl,
          isHashChange: newUrl.split('#')[0] === currentUrl.split('#')[0]
        });
        
        // Schedule new detection
        scheduleDetection();
      }
    };
    
    // Listen for various navigation events
    window.addEventListener('popstate', checkUrlChange);
    window.addEventListener('hashchange', checkUrlChange);
    
    // Intercept pushState/replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(checkUrlChange, 0);
    };
    
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(checkUrlChange, 0);
    };
  }
  
  /**
   * Initialize content script
   */
  async function initialize() {
    try {
      console.log('[BRA] Initializing content script');
      
      // Check if chrome APIs are available
      if (!chrome?.runtime?.id) {
        console.error('[BRA] Chrome runtime API not available');
        return;
      }
      
      // Register handlers
      registerHandlers();
      
      // Notify background that we're ready
      await messaging.sendMessage({
        action: 'contentScriptReady',
        url: window.location.href
      });
      
      // Set up observers
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          setupObserver();
          setupNavigationMonitoring();
        });
      } else {
        setupObserver();
        setupNavigationMonitoring();
      }
      
      // Run initial detection after a delay
      setTimeout(() => {
        scheduleDetection();
      }, 1000);
      
      console.log('[BRA] Content script initialized successfully');
      
    } catch (error) {
      console.error('[BRA] Initialization error:', error);
    }
  }
  
  // Start initialization
  initialize();
  
})();