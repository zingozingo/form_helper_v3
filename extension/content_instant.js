/**
 * Business Registration Assistant - Instant Detection Content Script
 * Provides seamless, instant detection across multi-step forms
 */

(function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptInstant) {
    return;
  }
  window.__braContentScriptInstant = true;
  
  console.log('[BRA] Initializing instant detection content script');
  
  // ============= INSTANT CHANGE DETECTOR =============
  class InstantChangeDetector {
    constructor(onChangeCallback) {
      this.onChangeCallback = onChangeCallback;
      this.lastUrl = window.location.href;
      this.lastDetectionTime = 0;
      this.mutationObserver = null;
      this.isDetecting = false;
      this.pendingDetection = null;
      
      // Configuration for instant detection
      this.config = {
        mutationDebounce: 100, // Very short debounce for mutations
        minTimeBetweenDetections: 200, // Minimum time between detections
        significantChangeThreshold: 3, // Lower threshold for faster detection
        instantNavigationDelay: 0, // No delay for navigation changes
      };
      
      // Mutation tracking
      this.mutationTimer = null;
      this.mutationCount = 0;
      
      // Start monitoring
      this.setupUrlMonitoring();
      this.setupMutationObserver();
      this.setupFormMonitoring();
      this.setupNavigationInterception();
    }
    
    // Execute change immediately or queue if too soon
    triggerChange(reason, isInstant = false) {
      console.log(`[BRA InstantDetector] Change detected: ${reason} (instant: ${isInstant})`);
      
      const now = Date.now();
      const timeSinceLastDetection = now - this.lastDetectionTime;
      
      // For instant changes (navigation), execute immediately
      if (isInstant) {
        this.executeChange(reason);
        return;
      }
      
      // For other changes, use minimal debouncing
      if (timeSinceLastDetection < this.config.minTimeBetweenDetections) {
        // Schedule for minimal delay
        if (this.pendingDetection) {
          clearTimeout(this.pendingDetection);
        }
        this.pendingDetection = setTimeout(() => {
          this.executeChange(reason);
        }, this.config.minTimeBetweenDetections - timeSinceLastDetection);
      } else {
        this.executeChange(reason);
      }
    }
    
    // Execute the change callback
    executeChange(reason) {
      if (this.isDetecting) {
        console.log('[BRA InstantDetector] Detection already in progress, queueing');
        return;
      }
      
      console.log(`[BRA InstantDetector] Executing change callback for: ${reason}`);
      this.lastDetectionTime = Date.now();
      this.mutationCount = 0;
      this.isDetecting = true;
      
      // Clear any pending detection
      if (this.pendingDetection) {
        clearTimeout(this.pendingDetection);
        this.pendingDetection = null;
      }
      
      if (this.onChangeCallback) {
        // Execute callback and track completion
        Promise.resolve(this.onChangeCallback(reason)).finally(() => {
          this.isDetecting = false;
        });
      } else {
        this.isDetecting = false;
      }
    }
    
    // Monitor URL changes with instant detection
    setupUrlMonitoring() {
      // Store original methods
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      // Override pushState for instant detection
      history.pushState = (...args) => {
        const oldUrl = window.location.href;
        originalPushState.apply(history, args);
        if (window.location.href !== oldUrl) {
          this.handleUrlChange('pushState', oldUrl, window.location.href);
        }
      };
      
      // Override replaceState for instant detection
      history.replaceState = (...args) => {
        const oldUrl = window.location.href;
        originalReplaceState.apply(history, args);
        if (window.location.href !== oldUrl) {
          this.handleUrlChange('replaceState', oldUrl, window.location.href);
        }
      };
      
      // Listen for popstate (back/forward)
      window.addEventListener('popstate', () => {
        if (window.location.href !== this.lastUrl) {
          this.handleUrlChange('popstate', this.lastUrl, window.location.href);
        }
      });
      
      // Listen for hashchange
      window.addEventListener('hashchange', (e) => {
        this.handleUrlChange('hashchange', e.oldURL, e.newURL);
      });
    }
    
    // Handle URL changes instantly
    handleUrlChange(source, oldUrl, newUrl) {
      console.log(`[BRA InstantDetector] URL changed via ${source}: ${oldUrl} → ${newUrl}`);
      this.lastUrl = newUrl;
      
      // Notify panel immediately about navigation (quick message)
      messaging.sendQuick({
        action: 'navigationDetected',
        source: source,
        oldUrl: oldUrl,
        newUrl: newUrl,
        timestamp: Date.now()
      });
      
      // Trigger instant detection
      this.triggerChange(`URL change (${source})`, true);
    }
    
    // Setup mutation observer for DOM changes
    setupMutationObserver() {
      this.mutationObserver = new MutationObserver((mutations) => {
        // Quick filter for significant mutations
        const significantMutations = mutations.filter(mutation => {
          // Skip our own changes
          if (mutation.target.dataset?.braProcessed) return false;
          
          // Skip pure style changes
          if (mutation.type === 'attributes' && mutation.attributeName === 'style') return false;
          
          // Check for form-related changes
          if (mutation.type === 'childList') {
            const hasFormElements = [...mutation.addedNodes].some(node => 
              node.nodeType === Node.ELEMENT_NODE && 
              (node.matches?.('form, input, select, textarea, fieldset, label') ||
               node.querySelector?.('form, input, select, textarea, fieldset, label'))
            );
            if (hasFormElements) return true;
          }
          
          // Check for attribute changes on form elements
          if (mutation.type === 'attributes' && mutation.target.matches?.('input, select, textarea, form')) {
            return true;
          }
          
          return false;
        });
        
        if (significantMutations.length > 0) {
          this.handleMutations(significantMutations);
        }
      });
      
      // Start observing with optimized config
      if (document.body) {
        this.mutationObserver.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'hidden', 'disabled', 'value', 'checked'],
          characterData: false
        });
      }
    }
    
    // Handle DOM mutations with smart debouncing
    handleMutations(mutations) {
      this.mutationCount += mutations.length;
      
      // Clear existing timer
      if (this.mutationTimer) {
        clearTimeout(this.mutationTimer);
      }
      
      // If we have enough mutations, trigger immediately
      if (this.mutationCount >= this.config.significantChangeThreshold) {
        console.log(`[BRA InstantDetector] Significant DOM changes (${this.mutationCount} mutations)`);
        this.mutationCount = 0;
        this.triggerChange('DOM mutations', false);
      } else {
        // Otherwise, wait for more changes or timeout
        this.mutationTimer = setTimeout(() => {
          if (this.mutationCount > 0) {
            console.log(`[BRA InstantDetector] DOM changes settled (${this.mutationCount} mutations)`);
            this.mutationCount = 0;
            this.triggerChange('DOM mutations', false);
          }
        }, this.config.mutationDebounce);
      }
    }
    
    // Intercept form navigation
    setupFormMonitoring() {
      // Monitor form submissions
      document.addEventListener('submit', (e) => {
        if (e.target.matches('form')) {
          console.log('[BRA InstantDetector] Form submission detected');
          // Form submission might cause navigation
          this.triggerChange('form-submit', true);
        }
      }, true);
      
      // Monitor clicks on common navigation elements
      document.addEventListener('click', (e) => {
        const target = e.target.closest('button, a, [role="button"], input[type="submit"], input[type="button"]');
        if (target) {
          const text = target.textContent?.toLowerCase() || '';
          const value = target.value?.toLowerCase() || '';
          
          // Check for navigation keywords
          if (text.match(/next|previous|prev|continue|proceed|back|step|submit/) ||
              value.match(/next|previous|prev|continue|proceed|back|step|submit/)) {
            console.log('[BRA InstantDetector] Navigation button clicked:', text || value);
            // Prepare for instant detection
            this.prepareForNavigation();
          }
        }
      }, true);
    }
    
    // Setup navigation interception for multi-step forms
    setupNavigationInterception() {
      // Intercept AJAX requests
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(...args) {
        this._url = args[1];
        this._method = args[0];
        return originalOpen.apply(this, args);
      };
      
      XMLHttpRequest.prototype.send = function(...args) {
        this.addEventListener('loadend', () => {
          // Check if this might be form navigation
          if (this._method !== 'GET' || this.responseType === '' || this.responseType === 'text') {
            const contentType = this.getResponseHeader('content-type') || '';
            if (contentType.includes('html') || this.responseText?.includes('<form')) {
              console.log('[BRA InstantDetector] AJAX form content loaded');
              // Trigger detection quickly
              setTimeout(() => {
                detector.triggerChange('AJAX navigation', false);
              }, 50);
            }
          }
        });
        return originalSend.apply(this, args);
      };
      
      // Intercept fetch for modern forms
      const originalFetch = window.fetch;
      window.fetch = function(...args) {
        return originalFetch.apply(this, args).then(response => {
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('html')) {
            console.log('[BRA InstantDetector] Fetch form content loaded');
            // Clone response to check content
            response.clone().text().then(text => {
              if (text.includes('<form') || text.includes('<input')) {
                setTimeout(() => {
                  detector.triggerChange('Fetch navigation', false);
                }, 50);
              }
            }).catch(() => {});
          }
          return response;
        });
      };
    }
    
    // Prepare for expected navigation
    prepareForNavigation() {
      // Notify panel to prepare for transition (optional message)
      messaging.sendOptional({
        action: 'preparingForNavigation',
        timestamp: Date.now()
      });
    }
    
    // Cleanup
    destroy() {
      if (this.mutationObserver) {
        this.mutationObserver.disconnect();
      }
      if (this.mutationTimer) {
        clearTimeout(this.mutationTimer);
      }
      if (this.pendingDetection) {
        clearTimeout(this.pendingDetection);
      }
    }
  }
  
  // ============= FIELD DETECTOR (Simplified) =============
  class QuickFieldDetector {
    constructor() {
      this.fields = [];
      this.sections = [];
    }
    
    async detectFields() {
      console.log('[BRA QuickDetector] Starting quick field detection');
      const startTime = performance.now();
      
      this.fields = [];
      this.sections = [];
      
      try {
        // Quick form detection
        const forms = document.querySelectorAll('form');
        const containers = forms.length > 0 ? Array.from(forms) : [document.body];
        
        // Detect sections first for better organization
        this.detectSections();
        
        // Scan all containers in parallel
        const scanPromises = containers.map(container => this.scanContainer(container));
        await Promise.all(scanPromises);
        
        const endTime = performance.now();
        console.log(`[BRA QuickDetector] Detection complete in ${Math.round(endTime - startTime)}ms, found ${this.fields.length} fields`);
        
        return this.fields;
      } catch (error) {
        console.error('[BRA QuickDetector] Error:', error);
        return [];
      }
    }
    
    async scanContainer(container) {
      // Get all form fields at once
      const allFields = container.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
      
      // Process fields in batches for performance
      const visibleFields = Array.from(allFields).filter(field => {
        const style = window.getComputedStyle(field);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      
      // Group radio/checkbox fields
      const processedNames = new Set();
      
      visibleFields.forEach(field => {
        // Skip if already processed (for grouped fields)
        if (field.type === 'radio' || field.type === 'checkbox') {
          if (field.name && processedNames.has(field.name)) {
            return;
          }
          if (field.name) {
            processedNames.add(field.name);
          }
        }
        
        // Mark as processed
        field.dataset.braProcessed = 'true';
        
        // Extract field info quickly
        const fieldInfo = this.extractFieldInfo(field);
        if (fieldInfo) {
          this.fields.push(fieldInfo);
        }
      });
    }
    
    extractFieldInfo(element) {
      const rect = element.getBoundingClientRect();
      
      return {
        element: element,
        type: element.type || element.tagName.toLowerCase(),
        name: element.name,
        id: element.id,
        label: this.findLabel(element),
        required: element.hasAttribute('required'),
        value: element.value,
        position: {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX
        },
        section: this.findSection(element)
      };
    }
    
    findLabel(field) {
      // Quick label detection
      if (field.labels && field.labels.length > 0) {
        return field.labels[0].textContent.trim();
      }
      
      if (field.id) {
        const label = document.querySelector(`label[for="${field.id}"]`);
        if (label) return label.textContent.trim();
      }
      
      const ariaLabel = field.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();
      
      if (field.placeholder) return field.placeholder.trim();
      
      // Check parent label
      const parentLabel = field.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        const input = clone.querySelector('input, select, textarea');
        if (input) input.remove();
        return clone.textContent.trim();
      }
      
      return field.name || 'Unknown';
    }
    
    detectSections() {
      // Quick section detection
      const sectionSelectors = [
        'fieldset legend',
        'h1, h2, h3, h4, h5, h6',
        '[class*="section"] [class*="title"]',
        '[class*="section"] [class*="heading"]'
      ];
      
      sectionSelectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(element => {
          const text = element.textContent.trim();
          if (text && text.length > 2 && text.length < 100) {
            const rect = element.getBoundingClientRect();
            this.sections.push({
              name: text,
              element: element,
              position: {
                top: rect.top + window.scrollY,
                bottom: rect.bottom + window.scrollY
              }
            });
          }
        });
      });
      
      // Sort sections by position
      this.sections.sort((a, b) => a.position.top - b.position.top);
    }
    
    findSection(element) {
      const elementTop = element.getBoundingClientRect().top + window.scrollY;
      
      // Find the section this element belongs to
      for (let i = this.sections.length - 1; i >= 0; i--) {
        if (elementTop >= this.sections[i].position.top) {
          return this.sections[i];
        }
      }
      
      return null;
    }
    
    getUIData() {
      const sectionedData = {};
      const uncategorized = [];
      
      this.fields.forEach(field => {
        const sectionName = field.section?.name || 'Other Fields';
        if (!sectionedData[sectionName]) {
          sectionedData[sectionName] = {
            label: sectionName,
            fields: []
          };
        }
        sectionedData[sectionName].fields.push(field);
      });
      
      return {
        categories: sectionedData,
        sections: this.sections,
        totalFields: this.fields.length
      };
    }
  }
  
  // ============= CONTEXT VALIDATION =============
  class ExtensionContext {
    constructor() {
      this.isValid = true;
      this.lastCheck = Date.now();
      this.checkInterval = 5000;
      this.startMonitoring();
    }
    
    validate() {
      try {
        const hasRuntime = typeof chrome !== 'undefined' && chrome.runtime;
        const hasId = hasRuntime && chrome.runtime.id;
        const canMessage = hasRuntime && typeof chrome.runtime.sendMessage === 'function';
        
        this.isValid = hasRuntime && hasId && canMessage;
        this.lastCheck = Date.now();
        
        if (!this.isValid) {
          console.warn('[BRA] Extension context invalid');
        }
        
        return this.isValid;
      } catch (error) {
        console.error('[BRA] Context validation error:', error);
        this.isValid = false;
        return false;
      }
    }
    
    startMonitoring() {
      // Initial check
      this.validate();
      
      // Periodic validation
      setInterval(() => this.validate(), this.checkInterval);
      
      // Check on visibility change
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.validate();
      });
      
      // Check on focus
      window.addEventListener('focus', () => this.validate());
    }
    
    async execute(callback, fallback = null) {
      if (!this.validate()) {
        console.warn('[BRA] Context invalid, using fallback');
        return fallback;
      }
      
      try {
        return await callback();
      } catch (error) {
        if (error.message?.includes('Extension context invalidated') || 
            error.message?.includes('message port closed')) {
          console.warn('[BRA] Context invalidated during execution');
          this.isValid = false;
          return fallback;
        }
        throw error;
      }
    }
  }
  
  const context = new ExtensionContext();
  
  // ============= MESSAGING (Robust) =============
  class ContentMessaging {
    constructor() {
      this.pendingMessages = new Map();
      this.messageTimeout = 15000; // 15 seconds for complex operations
      this.quickTimeout = 5000; // 5 seconds for simple operations
      this.retryCount = 3;
      this.retryDelays = [1000, 2000, 4000];
    }
    
    async send(message, options = {}) {
      const {
        timeout = this.messageTimeout,
        retries = this.retryCount,
        quick = false
      } = options;
      
      // Use quick timeout for simple messages
      const actualTimeout = quick ? this.quickTimeout : timeout;
      
      // Try with retries
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = await this.sendAttempt(message, actualTimeout);
          if (result !== null) return result;
        } catch (error) {
          console.warn(`[BRA] Message attempt ${attempt + 1} failed:`, error.message);
          
          // Check if error is recoverable
          if (error.message?.includes('Extension context invalidated')) {
            context.isValid = false;
            return null;
          }
          
          // Wait before retry
          if (attempt < retries) {
            const delay = this.retryDelays[Math.min(attempt, this.retryDelays.length - 1)];
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }
      
      console.warn('[BRA] All message attempts failed');
      return null;
    }
    
    async sendAttempt(message, timeout) {
      return context.execute(async () => {
        return new Promise((resolve, reject) => {
          const messageId = this.generateId();
          
          // Set up timeout
          const timeoutId = setTimeout(() => {
            this.pendingMessages.delete(messageId);
            reject(new Error(`Message timeout after ${timeout}ms`));
          }, timeout);
          
          // Track message
          this.pendingMessages.set(messageId, { 
            message, 
            timeoutId,
            timestamp: Date.now()
          });
          
          try {
            chrome.runtime.sendMessage(message, (response) => {
              clearTimeout(timeoutId);
              this.pendingMessages.delete(messageId);
              
              if (chrome.runtime.lastError) {
                const error = chrome.runtime.lastError.message;
                
                // Log only significant errors
                if (!error.includes('Receiving end does not exist') &&
                    !error.includes('message port closed')) {
                  console.warn('[BRA] Message error:', error);
                }
                
                reject(new Error(error));
              } else {
                resolve(response || { success: true });
              }
            });
          } catch (error) {
            clearTimeout(timeoutId);
            this.pendingMessages.delete(messageId);
            reject(error);
          }
        });
      }, null);
    }
    
    // Send high-priority message with shorter timeout
    async sendQuick(message) {
      return this.send(message, { quick: true, retries: 1 });
    }
    
    // Send low-priority message that can fail
    async sendOptional(message) {
      return this.send(message, { retries: 0, timeout: 3000 });
    }
    
    generateId() {
      return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    
    // Clean up old pending messages
    cleanup() {
      const now = Date.now();
      for (const [id, data] of this.pendingMessages) {
        if (now - data.timestamp > 30000) { // 30 seconds old
          clearTimeout(data.timeoutId);
          this.pendingMessages.delete(id);
        }
      }
    }
  }
  
  const messaging = new ContentMessaging();
  
  // Periodic cleanup
  setInterval(() => messaging.cleanup(), 30000);
  
  // ============= MAIN DETECTION LOGIC =============
  let detector = null;
  let currentDetection = null;
  let isDetecting = false;
  
  async function runDetection(reason) {
    if (isDetecting) {
      console.log('[BRA] Detection already in progress');
      return;
    }
    
    console.log(`[BRA] Running instant detection: ${reason}`);
    isDetecting = true;
    
    try {
      // Notify panel we're starting (optional quick message)
      messaging.sendOptional({
        action: 'detectionStarted',
        reason: reason,
        url: window.location.href
      });
      
      // Run quick detection
      const fieldDetector = new QuickFieldDetector();
      const fields = await fieldDetector.detectFields();
      const uiData = fieldDetector.getUIData();
      
      // Build result
      const result = {
        timestamp: Date.now(),
        url: window.location.href,
        isBusinessRegistrationForm: fields.length > 3,
        confidenceScore: fields.length > 3 ? 70 : 20,
        fieldDetection: {
          isDetected: fields.length > 0,
          fields: fields,
          uiData: uiData,
          classifiedFields: fields.length
        }
      };
      
      currentDetection = result;
      
      // Send to panel with normal timeout (important message)
      await messaging.send({
        action: 'detectionComplete',
        result: result
      });
      
      console.log('[BRA] Detection sent to panel');
      
    } catch (error) {
      console.error('[BRA] Detection error:', error);
    } finally {
      isDetecting = false;
    }
  }
  
  // Message handlers with context validation
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Validate context first
    if (!context.validate()) {
      console.warn('[BRA] Message received but context invalid');
      sendResponse({ error: 'Context invalid', contextValid: false });
      return true;
    }
    
    const handlers = {
      ping: () => ({ 
        alive: true, 
        timestamp: Date.now(),
        contextValid: true 
      }),
      
      getDetectionStatus: () => ({
        hasResult: !!currentDetection,
        result: currentDetection,
        isRunning: isDetecting,
        contextValid: true
      }),
      
      getDetectionResult: () => {
        if (currentDetection) {
          return currentDetection;
        } else {
          runDetection('manual request');
          return {
            isBusinessRegistrationForm: false,
            confidenceScore: 0,
            message: 'Detection in progress'
          };
        }
      },
      
      triggerDetection: () => {
        runDetection('manual trigger');
        return { scheduled: true, contextValid: true };
      }
    };
    
    const handler = handlers[message.action];
    if (handler) {
      try {
        const result = handler();
        sendResponse(result);
      } catch (error) {
        console.error('[BRA] Handler error:', error);
        sendResponse({ error: error.message, contextValid: context.isValid });
      }
    } else {
      sendResponse({ error: 'Unknown action', contextValid: context.isValid });
    }
    
    return true;
  });
  
  // Initialize instant detector
  const changeDetector = new InstantChangeDetector((reason) => {
    runDetection(reason);
  });
  
  // Initial detection after minimal delay
  setTimeout(() => {
    context.execute(() => {
      runDetection('initial page load');
    });
  }, 100);
  
  // Notify that we're ready (important but can retry)
  context.execute(() => {
    messaging.send({
      action: 'contentScriptReady',
      url: window.location.href,
      contextValid: true
    }, { retries: 2 });
  });
  
  console.log('[BRA] Instant detection content script ready');
  
  // Cleanup on unload
  window.addEventListener('unload', () => {
    if (changeDetector) {
      changeDetector.destroy();
    }
  });
  
  // Handle extension suspension/reload
  window.addEventListener('beforeunload', () => {
    context.isValid = false;
  });
  
  // Export debug utilities
  window.__braDebug = {
    context: context,
    runDetection: () => runDetection('debug'),
    currentDetection: () => currentDetection,
    validateContext: () => context.validate()
  };
  
})();