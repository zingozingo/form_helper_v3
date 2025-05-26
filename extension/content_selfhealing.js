/**
 * Self-Healing Content Script
 * Autonomous operation with automatic recovery from context invalidation
 */

(function() {
  'use strict';
  
  // Prevent multiple initializations
  if (window.__braSelfHealingActive) {
    console.log('[BRA] Self-healing content script already active');
    return;
  }
  window.__braSelfHealingActive = true;
  
  console.log('[BRA] Initializing self-healing content script');
  
  // ============= AUTONOMOUS FIELD DETECTOR =============
  class AutonomousFieldDetector {
    constructor() {
      this.fields = [];
      this.sections = [];
      this.lastDetectionTime = 0;
      this.detectionCache = null;
      
      // Default patterns for offline operation
      this.patterns = {
        business_name: {
          patterns: ['business.*name', 'company.*name', 'entity.*name', 'dba', 'trade.*name'],
          keywords: ['business', 'company', 'entity', 'corporation', 'llc', 'inc'],
          priority: 10
        },
        email: {
          patterns: ['email', 'e-mail', 'mail.*address'],
          keywords: ['email', 'mail', 'contact'],
          priority: 8
        },
        phone: {
          patterns: ['phone', 'tel', 'mobile', 'cell', 'fax'],
          keywords: ['phone', 'telephone', 'mobile', 'contact', 'fax'],
          priority: 7
        },
        address: {
          patterns: ['address', 'street', 'city', 'state', 'zip', 'postal'],
          keywords: ['address', 'street', 'avenue', 'city', 'state', 'zip'],
          priority: 6
        },
        ein: {
          patterns: ['ein', 'fein', 'federal.*tax', 'employer.*id', 'tax.*id'],
          keywords: ['ein', 'federal', 'tax', 'employer', 'identification'],
          priority: 9
        },
        entity_type: {
          patterns: ['entity.*type', 'business.*type', 'organization.*type', 'structure', 'formation.*type'],
          keywords: ['llc', 'corporation', 'partnership', 'sole', 'proprietor', 'nonprofit'],
          priority: 9
        },
        registered_agent: {
          patterns: ['registered.*agent', 'statutory.*agent', 'resident.*agent'],
          keywords: ['agent', 'registered', 'statutory', 'resident'],
          priority: 7
        }
      };
    }
    
    async detect() {
      console.log('[BRA] Performing autonomous field detection');
      
      this.fields = [];
      this.sections = [];
      
      // Find all form elements
      const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea');
      
      for (const input of inputs) {
        const field = this.analyzeField(input);
        if (field) {
          this.fields.push(field);
        }
      }
      
      // Detect sections
      this.detectSections();
      
      // Analyze form type
      const analysis = this.analyzeFormType();
      
      // Cache the detection result
      this.detectionCache = {
        fields: this.fields,
        sections: this.sections,
        analysis: analysis,
        timestamp: Date.now(),
        url: window.location.href
      };
      
      this.lastDetectionTime = Date.now();
      
      return this.detectionCache;
    }
    
    analyzeField(input) {
      const label = this.findLabel(input);
      const classification = this.classifyField(input, label);
      
      return {
        element: input,
        label: label,
        name: input.name || '',
        id: input.id || '',
        type: input.type || 'text',
        tagName: input.tagName.toLowerCase(),
        required: input.required || input.getAttribute('aria-required') === 'true',
        value: input.value || '',
        placeholder: input.placeholder || '',
        category: classification.category,
        confidence: classification.confidence
      };
    }
    
    findLabel(input) {
      // Try multiple strategies to find the label
      
      // 1. Explicit label
      if (input.id) {
        const label = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (label) return this.cleanText(label.textContent);
      }
      
      // 2. Parent label
      const parentLabel = input.closest('label');
      if (parentLabel) {
        return this.cleanText(parentLabel.textContent);
      }
      
      // 3. Aria attributes
      const ariaLabel = input.getAttribute('aria-label');
      if (ariaLabel) return ariaLabel.trim();
      
      const ariaLabelledBy = input.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const labelElement = document.getElementById(ariaLabelledBy);
        if (labelElement) return this.cleanText(labelElement.textContent);
      }
      
      // 4. Previous sibling
      let prev = input.previousElementSibling;
      if (prev && prev.textContent.trim()) {
        return this.cleanText(prev.textContent);
      }
      
      // 5. Parent container text
      const container = input.closest('div, td, fieldset');
      if (container) {
        const textNodes = [];
        const walker = document.createTreeWalker(
          container,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode: (node) => {
              const text = node.textContent.trim();
              if (text && text.length > 1 && text.length < 100) {
                const parent = node.parentElement;
                if (parent && !parent.matches('input, select, textarea, script, style')) {
                  return NodeFilter.FILTER_ACCEPT;
                }
              }
              return NodeFilter.FILTER_SKIP;
            }
          }
        );
        
        let node;
        while (node = walker.nextNode()) {
          textNodes.push(node.textContent.trim());
        }
        
        if (textNodes.length > 0) {
          return textNodes[0];
        }
      }
      
      // 6. Placeholder
      if (input.placeholder) {
        return input.placeholder;
      }
      
      // 7. Name attribute
      if (input.name) {
        return input.name
          .replace(/[\[\]_-]/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .trim();
      }
      
      return 'Unlabeled Field';
    }
    
    cleanText(text) {
      return text
        .replace(/\s+/g, ' ')
        .replace(/[:\*]/g, '')
        .trim();
    }
    
    classifyField(input, label) {
      const text = [
        label,
        input.name || '',
        input.id || '',
        input.className || '',
        input.placeholder || ''
      ].join(' ').toLowerCase();
      
      let bestMatch = { category: 'other', confidence: 0 };
      
      // Check each pattern
      for (const [category, config] of Object.entries(this.patterns)) {
        let score = 0;
        
        // Pattern matching
        if (config.patterns) {
          for (const pattern of config.patterns) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(text)) {
              score += 40;
              break;
            }
          }
        }
        
        // Keyword matching
        if (config.keywords) {
          for (const keyword of config.keywords) {
            if (text.includes(keyword)) {
              score += 15;
            }
          }
        }
        
        // Type bonus
        if (category === 'email' && input.type === 'email') score += 50;
        if (category === 'phone' && input.type === 'tel') score += 50;
        
        // Priority
        score += config.priority || 0;
        
        if (score > bestMatch.confidence) {
          bestMatch = { category, confidence: Math.min(score, 100) };
        }
      }
      
      return bestMatch;
    }
    
    detectSections() {
      this.sections = [];
      
      // Look for fieldsets and section containers
      const sectionElements = document.querySelectorAll('fieldset, .form-section, .form-group, section[role="group"]');
      
      for (const element of sectionElements) {
        const fieldsInSection = this.fields.filter(f => element.contains(f.element));
        
        if (fieldsInSection.length > 0) {
          const legend = element.querySelector('legend, h2, h3, h4');
          const title = legend ? this.cleanText(legend.textContent) : 'Form Section';
          
          this.sections.push({
            title: title,
            element: element,
            fields: fieldsInSection
          });
        }
      }
      
      // Create default section for ungrouped fields
      const groupedFields = new Set(this.sections.flatMap(s => s.fields));
      const ungroupedFields = this.fields.filter(f => !groupedFields.has(f));
      
      if (ungroupedFields.length > 0) {
        this.sections.push({
          title: 'General Information',
          element: null,
          fields: ungroupedFields
        });
      }
    }
    
    analyzeFormType() {
      const businessFields = this.fields.filter(f => 
        ['business_name', 'ein', 'entity_type', 'registered_agent'].includes(f.category)
      );
      
      const hasBusinessName = this.fields.some(f => f.category === 'business_name' && f.confidence > 60);
      const hasEntityType = this.fields.some(f => f.category === 'entity_type' && f.confidence > 60);
      const businessFieldRatio = businessFields.length / Math.max(this.fields.length, 1);
      
      let confidence = 0;
      if (hasBusinessName) confidence += 40;
      if (hasEntityType) confidence += 30;
      if (businessFields.length >= 3) confidence += 20;
      if (businessFieldRatio > 0.25) confidence += 10;
      
      // Detect state
      const state = this.detectState();
      
      return {
        isBusinessForm: confidence >= 50,
        confidence: Math.min(confidence, 100),
        businessFieldCount: businessFields.length,
        totalFields: this.fields.length,
        state: state
      };
    }
    
    detectState() {
      const url = window.location.href.toLowerCase();
      const pageText = document.body.textContent.toLowerCase();
      
      const stateMatches = {
        'CA': ['.ca.gov', 'california', 'business.ca.gov'],
        'NY': ['.ny.gov', 'new york', 'businessexpress.ny.gov'],
        'TX': ['.tx.gov', 'texas'],
        'FL': ['.fl.gov', 'florida', 'sunbiz.org'],
        'DE': ['.de.gov', 'delaware'],
        'DC': ['.dc.gov', 'district of columbia', 'washington dc', 'mytax.dc.gov']
      };
      
      for (const [state, patterns] of Object.entries(stateMatches)) {
        if (patterns.some(p => url.includes(p) || pageText.includes(p))) {
          return state;
        }
      }
      
      return null;
    }
  }
  
  // ============= SELF-HEALING COMMUNICATION =============
  class SelfHealingMessenger {
    constructor() {
      this.isConnected = false;
      this.messageQueue = [];
      this.connectionCheckInterval = null;
      this.lastPingTime = 0;
      this.reconnectAttempts = 0;
      this.listeners = new Map();
      
      // Start connection monitoring
      this.startConnectionMonitoring();
    }
    
    startConnectionMonitoring() {
      // Initial connection check
      this.checkConnection();
      
      // Regular connection checks
      this.connectionCheckInterval = setInterval(() => {
        this.checkConnection();
      }, 3000); // Check every 3 seconds
    }
    
    async checkConnection() {
      try {
        // Quick validation check
        if (!this.isExtensionContextValid()) {
          if (this.isConnected) {
            console.log('[BRA] Extension context lost, switching to offline mode');
            this.handleDisconnection();
          }
          return;
        }
        
        // Try to ping background
        const response = await this.sendPing();
        
        if (response && !this.isConnected) {
          console.log('[BRA] Connection restored!');
          this.handleReconnection();
        } else if (!response && this.isConnected) {
          console.log('[BRA] Connection lost, switching to offline mode');
          this.handleDisconnection();
        }
        
      } catch (error) {
        if (this.isConnected) {
          this.handleDisconnection();
        }
      }
    }
    
    isExtensionContextValid() {
      try {
        return !!(chrome && chrome.runtime && chrome.runtime.id);
      } catch (e) {
        return false;
      }
    }
    
    async sendPing() {
      if (!this.isExtensionContextValid()) return false;
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(false), 1000);
        
        try {
          chrome.runtime.sendMessage({ action: 'ping', timestamp: Date.now() }, (response) => {
            clearTimeout(timeout);
            resolve(!!(response && response.alive));
          });
        } catch (e) {
          clearTimeout(timeout);
          resolve(false);
        }
      });
    }
    
    handleDisconnection() {
      this.isConnected = false;
      this.reconnectAttempts = 0;
      this.emit('disconnected');
    }
    
    handleReconnection() {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      // Process queued messages
      this.processMessageQueue();
      
      // Notify listeners
      this.emit('reconnected');
      
      // Send current state to background
      this.syncWithBackground();
    }
    
    async send(message, options = {}) {
      if (!this.isConnected) {
        if (options.queueIfOffline !== false) {
          this.messageQueue.push({ message, options, timestamp: Date.now() });
        }
        return null;
      }
      
      try {
        return await this.sendMessage(message, options.timeout || 5000);
      } catch (error) {
        // Queue for retry if connection was lost
        if (options.queueIfOffline !== false) {
          this.messageQueue.push({ message, options, timestamp: Date.now() });
        }
        return null;
      }
    }
    
    async sendMessage(message, timeout = 5000) {
      if (!this.isExtensionContextValid()) return null;
      
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => resolve(null), timeout);
        
        try {
          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeoutId);
            
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response);
            }
          });
        } catch (e) {
          clearTimeout(timeoutId);
          resolve(null);
        }
      });
    }
    
    async processMessageQueue() {
      const queue = [...this.messageQueue];
      this.messageQueue = [];
      
      for (const item of queue) {
        // Skip old messages
        if (Date.now() - item.timestamp > 30000) continue;
        
        await this.send(item.message, item.options);
      }
    }
    
    async syncWithBackground() {
      if (detector.lastDetection) {
        await this.send({
          action: 'syncDetection',
          detection: detector.lastDetection,
          url: window.location.href
        });
      }
    }
    
    on(event, callback) {
      if (!this.listeners.has(event)) {
        this.listeners.set(event, new Set());
      }
      this.listeners.get(event).add(callback);
    }
    
    off(event, callback) {
      if (this.listeners.has(event)) {
        this.listeners.get(event).delete(callback);
      }
    }
    
    emit(event, data) {
      if (this.listeners.has(event)) {
        this.listeners.get(event).forEach(callback => {
          try {
            callback(data);
          } catch (e) {
            console.error('[BRA] Event listener error:', e);
          }
        });
      }
    }
    
    destroy() {
      if (this.connectionCheckInterval) {
        clearInterval(this.connectionCheckInterval);
      }
    }
  }
  
  // ============= CHANGE DETECTION =============
  class ChangeMonitor {
    constructor(callback) {
      this.callback = callback;
      this.lastUrl = window.location.href;
      this.observer = null;
      this.debounceTimer = null;
      this.lastChangeTime = 0;
      
      this.setupMonitoring();
    }
    
    setupMonitoring() {
      // URL change monitoring
      this.monitorUrlChanges();
      
      // DOM mutation monitoring
      this.monitorDomChanges();
      
      // Form interaction monitoring
      this.monitorFormInteractions();
    }
    
    monitorUrlChanges() {
      // Override pushState and replaceState
      const originalPushState = history.pushState;
      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        this.handleUrlChange('pushState');
      };
      
      const originalReplaceState = history.replaceState;
      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        this.handleUrlChange('replaceState');
      };
      
      // Listen for popstate
      window.addEventListener('popstate', () => this.handleUrlChange('popstate'));
      
      // Listen for hashchange
      window.addEventListener('hashchange', () => this.handleUrlChange('hashchange'));
    }
    
    handleUrlChange(type) {
      const newUrl = window.location.href;
      if (newUrl !== this.lastUrl) {
        console.log(`[BRA] URL changed via ${type}: ${newUrl}`);
        this.lastUrl = newUrl;
        this.triggerChange('url-change', 0); // Immediate
      }
    }
    
    monitorDomChanges() {
      this.observer = new MutationObserver((mutations) => {
        let hasSignificantChange = false;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            // Check if form elements were added
            const addedFormElements = Array.from(mutation.addedNodes).some(node => {
              if (node.nodeType !== 1) return false;
              return node.matches?.('form, fieldset, input, select, textarea') ||
                     node.querySelector?.('form, fieldset, input, select, textarea');
            });
            
            if (addedFormElements) {
              hasSignificantChange = true;
              break;
            }
          }
        }
        
        if (hasSignificantChange) {
          this.triggerChange('dom-change', 200); // Small delay
        }
      });
      
      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: false,
        characterData: false
      });
    }
    
    monitorFormInteractions() {
      // Monitor select changes that might reveal new fields
      document.addEventListener('change', (e) => {
        if (e.target.matches('select, input[type="radio"], input[type="checkbox"]')) {
          setTimeout(() => {
            const currentFieldCount = document.querySelectorAll('input, select, textarea').length;
            if (Math.abs(currentFieldCount - (window._lastFieldCount || 0)) > 2) {
              this.triggerChange('conditional-fields', 300);
            }
            window._lastFieldCount = currentFieldCount;
          }, 100);
        }
      });
    }
    
    triggerChange(reason, delay = 100) {
      const now = Date.now();
      
      // Debounce rapid changes
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
      
      this.debounceTimer = setTimeout(() => {
        if (now - this.lastChangeTime > 500 || delay === 0) {
          this.lastChangeTime = now;
          this.callback(reason);
        }
      }, delay);
    }
    
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }
    }
  }
  
  // ============= MAIN SELF-HEALING CONTROLLER =============
  class SelfHealingController {
    constructor() {
      this.fieldDetector = new AutonomousFieldDetector();
      this.messenger = new SelfHealingMessenger();
      this.changeMonitor = null;
      this.lastDetection = null;
      this.isActive = true;
      
      this.initialize();
    }
    
    initialize() {
      console.log('[BRA] Initializing self-healing controller');
      
      // Set up connection event handlers
      this.messenger.on('reconnected', () => {
        console.log('[BRA] Reconnected - syncing state');
        this.performDetection('reconnection');
      });
      
      this.messenger.on('disconnected', () => {
        console.log('[BRA] Disconnected - continuing in offline mode');
      });
      
      // Set up change monitoring
      this.changeMonitor = new ChangeMonitor((reason) => {
        this.performDetection(reason);
      });
      
      // Set up message listener
      this.setupMessageListener();
      
      // Perform initial detection
      setTimeout(() => {
        this.performDetection('initial');
      }, 100);
    }
    
    async performDetection(trigger) {
      if (!this.isActive) return;
      
      console.log(`[BRA] Performing detection (trigger: ${trigger})`);
      
      try {
        // Run autonomous detection
        const detection = await this.fieldDetector.detect();
        this.lastDetection = detection;
        
        // Update UI indicators if possible
        this.updateUIIndicators(detection);
        
        // Try to send to background (will queue if offline)
        await this.messenger.send({
          action: 'detectionUpdate',
          trigger: trigger,
          detection: detection,
          isConnected: this.messenger.isConnected,
          timestamp: Date.now()
        });
        
      } catch (error) {
        console.error('[BRA] Detection error:', error);
      }
    }
    
    updateUIIndicators(detection) {
      // Add visual indicators to detected fields
      detection.fields.forEach(field => {
        if (field.element && field.confidence > 60) {
          field.element.setAttribute('data-bra-detected', field.category);
          field.element.setAttribute('data-bra-confidence', field.confidence);
        }
      });
    }
    
    setupMessageListener() {
      // Only set up listener if we have valid context
      if (!this.messenger.isExtensionContextValid()) return;
      
      try {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          this.handleMessage(message, sendResponse);
          return true; // Keep channel open for async response
        });
      } catch (e) {
        console.log('[BRA] Could not set up message listener - will retry on reconnection');
      }
    }
    
    async handleMessage(message, sendResponse) {
      switch (message.action) {
        case 'ping':
          sendResponse({ alive: true, timestamp: Date.now() });
          break;
          
        case 'getDetection':
          sendResponse({
            success: true,
            detection: this.lastDetection,
            isConnected: this.messenger.isConnected
          });
          break;
          
        case 'triggerDetection':
          await this.performDetection('manual');
          sendResponse({ success: true });
          break;
          
        case 'getStatus':
          sendResponse({
            active: this.isActive,
            connected: this.messenger.isConnected,
            hasDetection: !!this.lastDetection,
            lastDetectionTime: this.lastDetection?.timestamp
          });
          break;
          
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    }
    
    destroy() {
      this.isActive = false;
      this.messenger.destroy();
      this.changeMonitor.destroy();
    }
  }
  
  // ============= INITIALIZATION WITH AUTO-RECOVERY =============
  let detector;
  
  function initializeDetector() {
    try {
      detector = new SelfHealingController();
      window.__braSelfHealingController = detector;
      
      console.log('[BRA] Self-healing content script ready');
      
      // Set up recovery mechanism
      window.addEventListener('unload', () => {
        if (detector) {
          detector.destroy();
        }
      });
      
      // Handle extension context restoration
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && detector) {
          detector.messenger.checkConnection();
        }
      });
      
    } catch (error) {
      console.error('[BRA] Failed to initialize:', error);
      
      // Retry initialization after delay
      setTimeout(initializeDetector, 2000);
    }
  }
  
  // Start initialization
  initializeDetector();
  
})();