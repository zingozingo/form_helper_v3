/**
 * Business Registration Assistant - Robust Content Script
 * Handles extension context invalidation gracefully
 */

(function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptRobust) {
    return;
  }
  window.__braContentScriptRobust = true;
  
  console.log('[BRA] Initializing robust content script');
  
  // ============= CONNECTION STATE MANAGEMENT =============
  const ConnectionState = {
    CONNECTED: 'connected',
    DISCONNECTED: 'disconnected',
    INVALIDATED: 'invalidated',
    RETRYING: 'retrying'
  };
  
  const connectionManager = {
    state: ConnectionState.DISCONNECTED,
    retryCount: 0,
    maxRetries: 3,
    retryDelays: [1000, 2000, 4000], // Exponential backoff
    lastCheckTime: 0,
    checkInterval: 30000, // 30 seconds
    
    isContextValid() {
      try {
        // Multiple checks for context validity
        if (typeof chrome === 'undefined') return false;
        if (!chrome.runtime) return false;
        if (!chrome.runtime.id) return false;
        
        // Try to access the ID - this will throw if context is invalid
        const extensionId = chrome.runtime.id;
        return !!extensionId;
      } catch (e) {
        // Context is invalid
        return false;
      }
    },
    
    async checkConnection() {
      const now = Date.now();
      
      // Don't check too frequently
      if (now - this.lastCheckTime < 5000) {
        return this.state === ConnectionState.CONNECTED;
      }
      
      this.lastCheckTime = now;
      
      if (!this.isContextValid()) {
        this.state = ConnectionState.INVALIDATED;
        console.warn('[BRA] Extension context invalidated');
        return false;
      }
      
      try {
        // Try a simple ping
        const response = await this.sendPing();
        if (response && response.success !== false) {
          if (this.state !== ConnectionState.CONNECTED) {
            console.log('[BRA] Connection restored');
            this.state = ConnectionState.CONNECTED;
            this.retryCount = 0;
          }
          return true;
        }
      } catch (e) {
        // Connection failed
      }
      
      this.state = ConnectionState.DISCONNECTED;
      return false;
    },
    
    async sendPing() {
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({ success: false, error: 'Timeout' });
        }, 2000);
        
        try {
          chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
            clearTimeout(timeout);
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { success: true });
            }
          });
        } catch (e) {
          clearTimeout(timeout);
          resolve({ success: false, error: e.message });
        }
      });
    }
  };
  
  // ============= LOCAL STORAGE FOR OFFLINE OPERATION =============
  const localState = {
    detection: {
      lastResult: null,
      lastRun: 0,
      isRunning: false
    },
    
    saveResult(result) {
      this.detection.lastResult = result;
      this.detection.lastRun = Date.now();
      
      // Try to save to sessionStorage for persistence
      try {
        sessionStorage.setItem('bra_detection_result', JSON.stringify(result));
        sessionStorage.setItem('bra_detection_time', this.detection.lastRun.toString());
      } catch (e) {
        // Ignore storage errors
      }
    },
    
    loadResult() {
      try {
        const stored = sessionStorage.getItem('bra_detection_result');
        const time = sessionStorage.getItem('bra_detection_time');
        
        if (stored && time) {
          const age = Date.now() - parseInt(time);
          // Use cached result if less than 5 minutes old
          if (age < 300000) {
            this.detection.lastResult = JSON.parse(stored);
            this.detection.lastRun = parseInt(time);
            return this.detection.lastResult;
          }
        }
      } catch (e) {
        // Ignore storage errors
      }
      
      return null;
    }
  };
  
  // ============= ROBUST MESSAGING CLASS =============
  class RobustMessaging {
    constructor() {
      this.handlers = new Map();
      this.messageQueue = [];
      this.isProcessingQueue = false;
      
      this.setupListener();
      this.startQueueProcessor();
    }
    
    registerHandler(action, handler) {
      this.handlers.set(action, handler);
    }
    
    async sendMessage(message, options = {}) {
      // Check connection first
      const isConnected = await connectionManager.checkConnection();
      
      if (!isConnected) {
        console.warn('[BRA] Not connected, operating in offline mode');
        
        // Handle certain messages locally
        if (message.action === 'formDetected' && message.result) {
          // Save locally
          localState.saveResult(message.result);
          
          // Queue for later sending
          this.messageQueue.push({ message, options, timestamp: Date.now() });
          
          return { success: true, offline: true };
        }
        
        return { success: false, error: 'Extension context not available', offline: true };
      }
      
      // Try to send with retries
      let lastError = null;
      const maxRetries = options.retries !== undefined ? options.retries : connectionManager.maxRetries;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const response = await this.sendSingleMessage(message, options.timeout || 5000);
          
          if (response && response.success !== false) {
            return response;
          }
          
          lastError = response?.error || 'Unknown error';
          
        } catch (error) {
          lastError = error.message;
        }
        
        // Don't retry for certain errors
        if (lastError && (
          lastError.includes('Extension context invalidated') ||
          lastError.includes('Cannot access a chrome')
        )) {
          connectionManager.state = ConnectionState.INVALIDATED;
          break;
        }
        
        // Wait before retry
        if (attempt < maxRetries) {
          const delay = connectionManager.retryDelays[Math.min(attempt, connectionManager.retryDelays.length - 1)];
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // All retries failed - queue the message
      if (message.action === 'formDetected') {
        this.messageQueue.push({ message, options, timestamp: Date.now() });
      }
      
      return { success: false, error: lastError, offline: true };
    }
    
    sendSingleMessage(message, timeout) {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          resolve({ success: false, error: 'Timeout' });
        }, timeout);
        
        try {
          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeoutId);
            
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { success: true });
            }
          });
        } catch (error) {
          clearTimeout(timeoutId);
          resolve({ success: false, error: error.message });
        }
      });
    }
    
    setupListener() {
      // Only set up if context is valid
      if (!connectionManager.isContextValid()) return;
      
      try {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          // Mark as connected
          if (connectionManager.state !== ConnectionState.CONNECTED) {
            connectionManager.state = ConnectionState.CONNECTED;
            connectionManager.retryCount = 0;
          }
          
          this.handleMessage(message, sender).then(response => {
            sendResponse(response || { received: true });
          }).catch(error => {
            sendResponse({ success: false, error: error.message });
          });
          
          return true;
        });
      } catch (e) {
        console.warn('[BRA] Could not set up message listener:', e);
      }
    }
    
    async handleMessage(message, sender) {
      const handler = this.handlers.get(message.action);
      
      if (handler) {
        try {
          const result = await handler(message, sender);
          return { success: true, ...result };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
      
      return { success: false, error: 'Unknown action: ' + message.action };
    }
    
    async processQueue() {
      if (this.isProcessingQueue || this.messageQueue.length === 0) return;
      
      this.isProcessingQueue = true;
      
      // Check connection
      const isConnected = await connectionManager.checkConnection();
      if (!isConnected) {
        this.isProcessingQueue = false;
        return;
      }
      
      // Process queued messages
      const queue = [...this.messageQueue];
      this.messageQueue = [];
      
      for (const item of queue) {
        // Skip old messages (> 5 minutes)
        if (Date.now() - item.timestamp > 300000) continue;
        
        try {
          const response = await this.sendSingleMessage(item.message, 5000);
          if (!response || response.success === false) {
            // Re-queue if failed
            this.messageQueue.push(item);
          }
        } catch (e) {
          // Re-queue
          this.messageQueue.push(item);
        }
      }
      
      this.isProcessingQueue = false;
    }
    
    startQueueProcessor() {
      // Process queue periodically
      setInterval(() => {
        this.processQueue();
      }, 10000); // Every 10 seconds
    }
  }
  
  // ============= FIELD DETECTOR (SAME AS BEFORE) =============
  class FieldDetector {
    constructor(config = {}) {
      this.root = config.root || document.body;
      this.maxElements = 1000;
      this.detectedFields = [];
      this.sections = [];
      this.categories = {};
    }
    
    async detectFields() {
      console.log('[BRA] Starting field detection');
      this.detectedFields = [];
      this.sections = [];
      this.categories = {};
      
      try {
        // Find all form elements
        const forms = Array.from(this.root.querySelectorAll('form') || []);
        const containers = forms.length > 0 ? forms : [this.root];
        
        for (const container of containers) {
          await this.scanContainer(container);
        }
        
        this.organizeFields();
        console.log(`[BRA] Found ${this.detectedFields.length} fields`);
        
      } catch (error) {
        console.error('[BRA] Field detection error:', error);
      }
      
      return this.detectedFields;
    }
    
    async scanContainer(container) {
      const inputs = container.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
      const selects = container.querySelectorAll('select');
      const textareas = container.querySelectorAll('textarea');
      
      const elements = [...inputs, ...selects, ...textareas];
      
      for (const element of elements) {
        if (!this.isVisible(element)) continue;
        
        const field = {
          type: element.type || element.tagName.toLowerCase(),
          name: element.name || '',
          id: element.id || '',
          label: this.findLabel(element),
          value: element.value || '',
          required: element.required,
          position: this.getPosition(element)
        };
        
        field.classification = this.classify(field);
        this.detectedFields.push(field);
      }
    }
    
    isVisible(element) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && 
             style.display !== 'none' && 
             style.visibility !== 'hidden';
    }
    
    findLabel(element) {
      // Try various methods to find label
      const ariaLabel = element.getAttribute('aria-label');
      if (ariaLabel) return { text: ariaLabel, type: 'aria' };
      
      if (element.id) {
        const label = document.querySelector(`label[for="${element.id}"]`);
        if (label) return { text: label.textContent.trim(), type: 'for' };
      }
      
      const parent = element.closest('label');
      if (parent) return { text: parent.textContent.trim(), type: 'parent' };
      
      return { text: element.placeholder || element.name || 'Unknown', type: 'fallback' };
    }
    
    getPosition(element) {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX
      };
    }
    
    classify(field) {
      const text = `${field.label.text} ${field.name} ${field.id}`.toLowerCase();
      
      if (text.match(/business.*name|company.*name/)) {
        return { category: 'business_name', confidence: 90 };
      }
      if (text.match(/ein|employer.*id/)) {
        return { category: 'ein', confidence: 90 };
      }
      if (text.match(/email/)) {
        return { category: 'email', confidence: 95 };
      }
      if (text.match(/phone|tel/)) {
        return { category: 'phone', confidence: 90 };
      }
      if (text.match(/address|street/)) {
        return { category: 'address', confidence: 85 };
      }
      if (text.match(/city/)) {
        return { category: 'city', confidence: 90 };
      }
      if (text.match(/state|province/)) {
        return { category: 'state', confidence: 85 };
      }
      if (text.match(/zip|postal/)) {
        return { category: 'zip', confidence: 90 };
      }
      
      return { category: 'other', confidence: 50 };
    }
    
    organizeFields() {
      // Sort by position
      this.detectedFields.sort((a, b) => {
        const topDiff = a.position.top - b.position.top;
        if (Math.abs(topDiff) > 20) return topDiff;
        return a.position.left - b.position.left;
      });
      
      // Group by category
      this.detectedFields.forEach(field => {
        const cat = field.classification.category;
        if (!this.categories[cat]) {
          this.categories[cat] = {
            label: cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            fields: []
          };
        }
        this.categories[cat].fields.push(field);
      });
      
      // Create sections
      this.sections = [{
        label: 'Form Fields',
        fields: this.detectedFields
      }];
    }
    
    getUIData() {
      return {
        sections: this.sections,
        categories: this.categories,
        summary: {
          totalFields: this.detectedFields.length,
          confidence: this.detectedFields.length > 0 ? 70 : 0
        }
      };
    }
  }
  
  // ============= URL DETECTOR =============
  const URLDetector = {
    analyzeUrl(url) {
      try {
        const urlString = url?.href || url?.toString() || '';
        const hostname = new URL(urlString).hostname.toLowerCase();
        
        const isGov = hostname.includes('.gov') || 
                     hostname.includes('.state.') ||
                     hostname.includes('.us');
        
        let state = null;
        if (hostname.includes('dc.gov')) state = 'DC';
        else if (hostname.includes('ca.gov')) state = 'CA';
        else if (hostname.includes('ny.gov')) state = 'NY';
        
        return {
          isGovernmentSite: isGov,
          score: isGov ? 80 : 20,
          state: state
        };
      } catch (e) {
        return { isGovernmentSite: false, score: 0, state: null };
      }
    }
  };
  
  // ============= MAIN LOGIC =============
  const messaging = new RobustMessaging();
  const state = {
    detection: {
      isRunning: false,
      lastResult: null,
      debounceTimer: null
    }
  };
  
  // Register handlers
  messaging.registerHandler('ping', async () => ({
    alive: true,
    timestamp: Date.now(),
    detectionStatus: {
      hasResult: !!state.detection.lastResult,
      isRunning: state.detection.isRunning,
      offline: connectionManager.state !== ConnectionState.CONNECTED
    }
  }));
  
  messaging.registerHandler('getDetectionStatus', async () => {
    // Try to load from local storage if no current result
    if (!state.detection.lastResult) {
      state.detection.lastResult = localState.loadResult();
    }
    
    return {
      hasResult: !!state.detection.lastResult,
      result: state.detection.lastResult,
      isRunning: state.detection.isRunning,
      offline: connectionManager.state !== ConnectionState.CONNECTED
    };
  });
  
  messaging.registerHandler('getDetectionResult', async () => {
    if (!state.detection.lastResult) {
      state.detection.lastResult = localState.loadResult();
    }
    
    if (state.detection.lastResult) {
      return state.detection.lastResult;
    }
    
    if (!state.detection.isRunning) {
      scheduleDetection();
    }
    
    return {
      isBusinessRegistrationForm: false,
      confidenceScore: 0,
      message: 'No result available'
    };
  });
  
  messaging.registerHandler('triggerDetection', async () => {
    scheduleDetection();
    return {
      scheduled: true,
      hasResult: !!state.detection.lastResult,
      result: state.detection.lastResult
    };
  });
  
  function scheduleDetection() {
    if (state.detection.debounceTimer) {
      clearTimeout(state.detection.debounceTimer);
    }
    
    state.detection.debounceTimer = setTimeout(() => {
      runDetection();
    }, 500);
  }
  
  async function runDetection() {
    if (state.detection.isRunning) return;
    
    console.log('[BRA] Running detection');
    state.detection.isRunning = true;
    
    try {
      const result = {
        timestamp: Date.now(),
        url: window.location.href,
        isBusinessRegistrationForm: false,
        confidenceScore: 0
      };
      
      // URL detection
      result.urlDetection = URLDetector.analyzeUrl(window.location);
      
      // Field detection
      const detector = new FieldDetector();
      const fields = await detector.detectFields();
      const uiData = detector.getUIData();
      
      result.fieldDetection = {
        isDetected: fields.length > 0,
        fields: fields,
        uiData: uiData,
        confidence: uiData.summary.confidence,
        state: result.urlDetection.state,
        classifiedFields: fields.length
      };
      
      // Calculate overall score
      const urlScore = result.urlDetection?.score || 0;
      const fieldScore = fields.length > 0 ? 70 : 0;
      result.confidenceScore = Math.round((urlScore + fieldScore) / 2);
      result.isBusinessRegistrationForm = result.confidenceScore > 40;
      result.state = result.urlDetection.state;
      
      // Store result
      state.detection.lastResult = result;
      localState.saveResult(result);
      
      // Try to send to background
      const response = await messaging.sendMessage({
        action: 'formDetected',
        result: result
      });
      
      if (response.offline) {
        console.log('[BRA] Operating in offline mode - result saved locally');
      }
      
    } catch (error) {
      console.error('[BRA] Detection error:', error);
    } finally {
      state.detection.isRunning = false;
    }
  }
  
  // Initialize
  async function initialize() {
    console.log('[BRA] Initializing with connection state:', connectionManager.state);
    
    // Load any cached results
    const cached = localState.loadResult();
    if (cached) {
      state.detection.lastResult = cached;
      console.log('[BRA] Loaded cached detection result');
    }
    
    // Try to notify background we're ready
    await messaging.sendMessage({
      action: 'contentScriptReady',
      url: window.location.href
    });
    
    // Run initial detection
    setTimeout(() => {
      scheduleDetection();
    }, 1000);
    
    // Set up periodic connection checks
    setInterval(() => {
      connectionManager.checkConnection();
    }, connectionManager.checkInterval);
    
    // Set up mutation observer
    if (document.body) {
      const observer = new MutationObserver(() => {
        if (!state.detection.lastResult?.isBusinessRegistrationForm) {
          scheduleDetection();
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    console.log('[BRA] Robust content script ready');
  }
  
  // Start
  initialize();
  
})();