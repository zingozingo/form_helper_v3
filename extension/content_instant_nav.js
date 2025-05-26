/**
 * Instant Navigation Detection Content Script
 * Pre-emptive cleanup and progressive enhancement for seamless form transitions
 */

(function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braInstantNavActive) {
    return;
  }
  window.__braInstantNavActive = true;
  
  console.log('[BRA InstantNav] Initializing instant navigation detection');
  
  // ============= NAVIGATION INTENT DETECTOR =============
  class NavigationIntentDetector {
    constructor() {
      this.callbacks = new Set();
      this.navigationPending = false;
      this.lastNavigationTime = 0;
      this.currentUrl = window.location.href;
      
      this.setupIntentDetection();
    }
    
    setupIntentDetection() {
      // 1. Intercept click events on navigation elements
      document.addEventListener('click', (e) => {
        const target = e.target;
        
        // Check if it's a navigation trigger
        if (this.isNavigationTrigger(target)) {
          console.log('[BRA InstantNav] Navigation intent detected via click');
          this.handleNavigationIntent('click', target);
        }
      }, true); // Use capture phase for earliest detection
      
      // 2. Monitor form submissions
      document.addEventListener('submit', (e) => {
        console.log('[BRA InstantNav] Form submission detected');
        this.handleNavigationIntent('submit', e.target);
      }, true);
      
      // 3. Intercept history API calls
      this.interceptHistoryAPI();
      
      // 4. Monitor hash changes
      window.addEventListener('hashchange', () => {
        this.handleNavigationIntent('hashchange');
      });
      
      // 5. Monitor popstate (back/forward)
      window.addEventListener('popstate', () => {
        this.handleNavigationIntent('popstate');
      });
      
      // 6. Monitor keyboard navigation
      document.addEventListener('keydown', (e) => {
        // Check for Enter on navigation elements
        if (e.key === 'Enter' && this.isNavigationTrigger(e.target)) {
          this.handleNavigationIntent('keyboard', e.target);
        }
      }, true);
    }
    
    isNavigationTrigger(element) {
      if (!element) return false;
      
      // Check element and its parents
      let el = element;
      while (el && el !== document.body) {
        // Links
        if (el.tagName === 'A' && el.href) {
          return true;
        }
        
        // Buttons with navigation text
        if (el.tagName === 'BUTTON' || el.type === 'submit') {
          const text = (el.textContent || '').toLowerCase();
          const navWords = ['next', 'continue', 'proceed', 'submit', 'back', 'previous', 'save', 'finish'];
          if (navWords.some(word => text.includes(word))) {
            return true;
          }
        }
        
        // Elements with navigation classes
        const classes = (el.className || '').toLowerCase();
        if (classes.includes('nav') || classes.includes('step') || classes.includes('page')) {
          return true;
        }
        
        // Elements with navigation roles
        const role = el.getAttribute('role');
        if (role === 'navigation' || role === 'button') {
          return true;
        }
        
        el = el.parentElement;
      }
      
      return false;
    }
    
    interceptHistoryAPI() {
      // Store original methods
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      // Override pushState
      history.pushState = (...args) => {
        this.handleNavigationIntent('pushState');
        return originalPushState.apply(history, args);
      };
      
      // Override replaceState
      history.replaceState = (...args) => {
        this.handleNavigationIntent('replaceState');
        return originalReplaceState.apply(history, args);
      };
    }
    
    handleNavigationIntent(type, element) {
      const now = Date.now();
      
      // Debounce rapid navigation intents
      if (now - this.lastNavigationTime < 50) {
        return;
      }
      
      this.lastNavigationTime = now;
      this.navigationPending = true;
      
      // Notify all callbacks immediately
      this.callbacks.forEach(callback => {
        try {
          callback({
            type: type,
            element: element,
            timestamp: now,
            currentUrl: this.currentUrl
          });
        } catch (e) {
          console.error('[BRA InstantNav] Callback error:', e);
        }
      });
      
      // Monitor for actual navigation
      this.monitorNavigation();
    }
    
    monitorNavigation() {
      let checks = 0;
      const maxChecks = 20; // 2 seconds max
      
      const checkInterval = setInterval(() => {
        checks++;
        
        if (window.location.href !== this.currentUrl) {
          // Navigation completed
          clearInterval(checkInterval);
          this.currentUrl = window.location.href;
          this.navigationPending = false;
          
          this.callbacks.forEach(callback => {
            try {
              callback({
                type: 'completed',
                newUrl: this.currentUrl,
                timestamp: Date.now()
              });
            } catch (e) {
              console.error('[BRA InstantNav] Callback error:', e);
            }
          });
        } else if (checks >= maxChecks) {
          // Navigation didn't happen (false positive)
          clearInterval(checkInterval);
          this.navigationPending = false;
        }
      }, 100);
    }
    
    onNavigationIntent(callback) {
      this.callbacks.add(callback);
    }
    
    offNavigationIntent(callback) {
      this.callbacks.delete(callback);
    }
  }
  
  // ============= PROGRESSIVE FIELD DETECTOR =============
  class ProgressiveFieldDetector {
    constructor() {
      this.detectionState = 'idle';
      this.lastDetection = null;
      this.detectionStartTime = 0;
      this.progressiveResults = [];
      this.targetDetectionTime = 100; // Target 100ms
    }
    
    async detectFieldsProgressive(options = {}) {
      const startTime = Date.now();
      this.detectionState = 'detecting';
      this.detectionStartTime = startTime;
      this.progressiveResults = [];
      
      console.log('[BRA InstantNav] Starting progressive field detection');
      
      // Phase 1: Instant detection (0-50ms)
      const instantResults = await this.instantDetection();
      this.reportProgress(instantResults, 'instant');
      
      // Check if we should continue
      if (this.detectionState !== 'detecting') return;
      
      // Phase 2: Fast detection (50-100ms)
      setTimeout(async () => {
        if (this.detectionState !== 'detecting') return;
        
        const fastResults = await this.fastDetection();
        this.reportProgress(fastResults, 'fast');
        
        // Phase 3: Complete detection (100ms+)
        setTimeout(async () => {
          if (this.detectionState !== 'detecting') return;
          
          const completeResults = await this.completeDetection();
          this.reportProgress(completeResults, 'complete');
          
          this.detectionState = 'complete';
        }, 50);
      }, 50);
      
      return instantResults;
    }
    
    async instantDetection() {
      // Ultra-fast detection of visible form elements
      const forms = document.querySelectorAll('form');
      const inputs = document.querySelectorAll('input:not([type="hidden"]), select, textarea');
      
      const fields = [];
      const visibleInputs = Array.from(inputs).filter(input => {
        const rect = input.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      
      // Quick field extraction
      visibleInputs.slice(0, 10).forEach(input => {
        fields.push({
          element: input,
          label: this.quickLabelFind(input),
          type: input.type || 'text',
          name: input.name || '',
          id: input.id || ''
        });
      });
      
      return {
        phase: 'instant',
        formCount: forms.length,
        fieldCount: visibleInputs.length,
        fields: fields,
        confidence: 30,
        timestamp: Date.now()
      };
    }
    
    quickLabelFind(input) {
      // Super fast label detection
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent.trim();
      }
      
      // Check placeholder
      if (input.placeholder) return input.placeholder;
      
      // Check name
      if (input.name) {
        return input.name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
      }
      
      return 'Field';
    }
    
    async fastDetection() {
      // More thorough but still fast detection
      const allInputs = document.querySelectorAll('input, select, textarea');
      const fields = [];
      
      Array.from(allInputs).forEach(input => {
        if (input.type === 'hidden') return;
        
        const field = {
          element: input,
          label: this.findLabel(input),
          type: input.type || 'text',
          name: input.name || '',
          id: input.id || '',
          required: input.required,
          pattern: input.pattern || ''
        };
        
        // Quick classification
        field.category = this.quickClassify(field);
        fields.push(field);
      });
      
      return {
        phase: 'fast',
        fields: fields,
        sections: this.quickSectionDetect(),
        confidence: 60,
        timestamp: Date.now()
      };
    }
    
    findLabel(input) {
      // More thorough label detection
      
      // 1. For attribute
      if (input.id) {
        const label = document.querySelector(`label[for="${input.id}"]`);
        if (label) return label.textContent.trim();
      }
      
      // 2. Parent label
      const parentLabel = input.closest('label');
      if (parentLabel) return parentLabel.textContent.trim();
      
      // 3. Aria label
      if (input.getAttribute('aria-label')) {
        return input.getAttribute('aria-label');
      }
      
      // 4. Previous sibling
      const prev = input.previousElementSibling;
      if (prev && prev.textContent) {
        return prev.textContent.trim();
      }
      
      // 5. Placeholder or name
      return input.placeholder || input.name || 'Unknown';
    }
    
    quickClassify(field) {
      const text = `${field.label} ${field.name} ${field.id}`.toLowerCase();
      
      if (text.includes('business') || text.includes('company')) return 'business_name';
      if (text.includes('ein') || text.includes('tax')) return 'tax_id';
      if (text.includes('email')) return 'email';
      if (text.includes('phone')) return 'phone';
      if (text.includes('address')) return 'address';
      if (text.includes('entity') || text.includes('type')) return 'entity_type';
      
      return 'other';
    }
    
    quickSectionDetect() {
      const sections = [];
      const fieldsets = document.querySelectorAll('fieldset');
      
      fieldsets.forEach(fieldset => {
        const legend = fieldset.querySelector('legend');
        sections.push({
          title: legend ? legend.textContent.trim() : 'Section',
          element: fieldset
        });
      });
      
      return sections;
    }
    
    async completeDetection() {
      // Full detection with all features
      // This would integrate with your existing field detector
      // For now, return enhanced results
      
      return {
        phase: 'complete',
        fields: this.progressiveResults[1]?.fields || [],
        sections: this.progressiveResults[1]?.sections || [],
        confidence: 90,
        isBusinessForm: true,
        state: this.detectState(),
        timestamp: Date.now()
      };
    }
    
    detectState() {
      const url = window.location.href.toLowerCase();
      const text = document.body.textContent.toLowerCase();
      
      if (url.includes('.ca.gov') || text.includes('california')) return 'CA';
      if (url.includes('.ny.gov') || text.includes('new york')) return 'NY';
      if (url.includes('.dc.gov') || text.includes('district of columbia')) return 'DC';
      
      return null;
    }
    
    reportProgress(results, phase) {
      this.progressiveResults.push(results);
      
      // Send progressive update
      this.sendProgressiveUpdate(results);
    }
    
    sendProgressiveUpdate(results) {
      // Send to background
      chrome.runtime.sendMessage({
        action: 'progressiveDetection',
        results: results,
        timestamp: Date.now()
      });
    }
    
    cancelDetection() {
      console.log('[BRA InstantNav] Cancelling detection');
      this.detectionState = 'cancelled';
    }
  }
  
  // ============= INSTANT CLEANUP MANAGER =============
  class InstantCleanupManager {
    constructor() {
      this.cleanupCallbacks = new Set();
    }
    
    registerCleanup(callback) {
      this.cleanupCallbacks.add(callback);
    }
    
    performInstantCleanup(reason) {
      console.log('[BRA InstantNav] Performing instant cleanup:', reason);
      
      // Notify background immediately
      chrome.runtime.sendMessage({
        action: 'instantCleanup',
        reason: reason,
        timestamp: Date.now()
      });
      
      // Execute all cleanup callbacks
      this.cleanupCallbacks.forEach(callback => {
        try {
          callback(reason);
        } catch (e) {
          console.error('[BRA InstantNav] Cleanup callback error:', e);
        }
      });
    }
  }
  
  // ============= MAIN CONTROLLER =============
  class InstantNavigationController {
    constructor() {
      this.intentDetector = new NavigationIntentDetector();
      this.fieldDetector = new ProgressiveFieldDetector();
      this.cleanupManager = new InstantCleanupManager();
      this.isNavigating = false;
      
      this.initialize();
    }
    
    initialize() {
      console.log('[BRA InstantNav] Initializing controller');
      
      // Set up navigation intent handling
      this.intentDetector.onNavigationIntent((intent) => {
        this.handleNavigationIntent(intent);
      });
      
      // Set up cleanup callbacks
      this.cleanupManager.registerCleanup(() => {
        // Cancel any ongoing detection
        this.fieldDetector.cancelDetection();
      });
      
      // Perform initial detection
      setTimeout(() => {
        this.performDetection('initial');
      }, 100);
      
      // Set up message listener
      this.setupMessageListener();
    }
    
    handleNavigationIntent(intent) {
      console.log('[BRA InstantNav] Navigation intent:', intent);
      
      if (intent.type === 'completed') {
        // Navigation completed - perform new detection
        this.isNavigating = false;
        this.performDetection('navigation-complete');
      } else {
        // Navigation starting - instant cleanup
        this.isNavigating = true;
        this.cleanupManager.performInstantCleanup(`navigation-${intent.type}`);
        
        // Send navigation intent to background
        chrome.runtime.sendMessage({
          action: 'navigationIntent',
          intent: intent,
          currentUrl: window.location.href,
          timestamp: Date.now()
        });
      }
    }
    
    async performDetection(trigger) {
      if (this.isNavigating) {
        console.log('[BRA InstantNav] Skipping detection during navigation');
        return;
      }
      
      console.log('[BRA InstantNav] Performing detection:', trigger);
      
      const results = await this.fieldDetector.detectFieldsProgressive({
        trigger: trigger
      });
      
      // Send initial results immediately
      this.sendDetectionUpdate(results, trigger);
    }
    
    sendDetectionUpdate(results, trigger) {
      chrome.runtime.sendMessage({
        action: 'detectionUpdate',
        results: results,
        trigger: trigger,
        url: window.location.href,
        timestamp: Date.now()
      });
    }
    
    setupMessageListener() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.action) {
          case 'ping':
            sendResponse({ alive: true, navigating: this.isNavigating });
            break;
            
          case 'triggerDetection':
            this.performDetection('manual');
            sendResponse({ success: true });
            break;
            
          case 'getStatus':
            sendResponse({
              navigating: this.isNavigating,
              lastDetection: this.fieldDetector.lastDetection,
              detectionState: this.fieldDetector.detectionState
            });
            break;
            
          default:
            sendResponse({ success: false });
        }
        
        return true;
      });
    }
  }
  
  // ============= AJAX INTERCEPTOR =============
  class AjaxInterceptor {
    constructor(onRequest) {
      this.onRequest = onRequest;
      this.interceptXHR();
      this.interceptFetch();
    }
    
    interceptXHR() {
      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(...args) {
        this._interceptedUrl = args[1];
        return originalOpen.apply(this, args);
      };
      
      XMLHttpRequest.prototype.send = function(...args) {
        // Check if it might be navigation-related
        if (this._interceptedUrl && this.onRequest) {
          this.onRequest({
            type: 'xhr',
            url: this._interceptedUrl,
            method: this._method
          });
        }
        
        return originalSend.apply(this, args);
      };
    }
    
    interceptFetch() {
      const originalFetch = window.fetch;
      
      window.fetch = function(...args) {
        // Notify about fetch
        if (this.onRequest) {
          this.onRequest({
            type: 'fetch',
            url: args[0],
            options: args[1]
          });
        }
        
        return originalFetch.apply(this, args);
      };
    }
  }
  
  // ============= INITIALIZATION =============
  const controller = new InstantNavigationController();
  
  // Set up AJAX interception
  const ajaxInterceptor = new AjaxInterceptor((request) => {
    // Check if this might cause navigation
    if (request.url && (request.url.includes('submit') || request.url.includes('next'))) {
      controller.handleNavigationIntent({
        type: 'ajax',
        url: request.url,
        timestamp: Date.now()
      });
    }
  });
  
  // Expose controller for debugging
  window.__braInstantNavController = controller;
  
  console.log('[BRA InstantNav] Ready for instant navigation detection');
  
})();