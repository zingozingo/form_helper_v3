/**
 * Business Registration Assistant - Bulletproof Content Script
 * Provides instant detection with complete context error handling
 */

(async function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptBulletproof) {
    return;
  }
  window.__braContentScriptBulletproof = true;
  
  console.log('[BRA] Initializing bulletproof content script');
  
  // ============= CONTEXT MANAGER INTEGRATION =============
  let contextManager;
  
  // Try to load context manager module
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
      const contextManagerUrl = chrome.runtime.getURL('modules/contextManager.js');
      const module = await import(contextManagerUrl);
      contextManager = module.default || self.contextManager;
    }
  } catch (e) {
    console.log('[BRA] Loading inline context manager');
  }
  
  // Inline context manager if module loading fails
  if (!contextManager) {
    class InlineContextManager {
      constructor() {
        this.isValid = true;
        this.fallbackMode = false;
        this.cachedData = new Map();
        this.listeners = new Set();
        this.checkContext();
      }
      
      checkContext() {
        try {
          const checks = [
            typeof chrome !== 'undefined',
            chrome?.runtime !== undefined,
            chrome?.runtime?.id !== undefined,
            chrome?.runtime?.id !== null
          ];
          
          const wasValid = this.isValid;
          this.isValid = checks.every(check => check === true);
          
          if (!wasValid && this.isValid) {
            console.log('[BRA] Context restored');
            this.notifyListeners('restored');
          } else if (wasValid && !this.isValid) {
            console.log('[BRA] Context lost - entering fallback mode');
            this.notifyListeners('lost');
            this.fallbackMode = true;
          }
          
          return this.isValid;
        } catch (e) {
          this.isValid = false;
          this.fallbackMode = true;
          return false;
        }
      }
      
      async safeCall(fn, fallback = null, options = {}) {
        const { silent = true, cache = true, cacheKey = null } = options;
        
        if (cache && cacheKey && this.cachedData.has(cacheKey)) {
          const cached = this.cachedData.get(cacheKey);
          if (Date.now() - cached.timestamp < 300000) {
            return cached.value;
          }
        }
        
        if (!this.checkContext()) {
          return fallback;
        }
        
        try {
          const result = await fn();
          
          if (cache && cacheKey && result !== null) {
            this.cachedData.set(cacheKey, {
              value: result,
              timestamp: Date.now()
            });
          }
          
          return result;
        } catch (error) {
          if (this.isContextError(error)) {
            this.isValid = false;
            this.fallbackMode = true;
            this.notifyListeners('lost');
          }
          return fallback;
        }
      }
      
      isContextError(error) {
        if (!error) return false;
        const msg = error.message || '';
        return msg.includes('Extension context invalidated') ||
               msg.includes('chrome.runtime') ||
               msg.includes('message port closed');
      }
      
      async sendMessage(message, options = {}) {
        return this.safeCall(
          async () => {
            return new Promise((resolve) => {
              const timeout = setTimeout(() => resolve(null), options.timeout || 5000);
              
              chrome.runtime.sendMessage(message, (response) => {
                clearTimeout(timeout);
                resolve(chrome.runtime.lastError ? null : response);
              });
            });
          },
          null,
          { silent: true, cache: false }
        );
      }
      
      addListener(callback) {
        this.listeners.add(callback);
      }
      
      notifyListeners(event) {
        this.listeners.forEach(cb => {
          try { cb(event, this.isValid); } catch (e) {}
        });
      }
      
      isExtensionContext() {
        return this.isValid && !this.fallbackMode;
      }
      
      createErrorBoundary(fn, name = 'Unknown') {
        return async (...args) => {
          try {
            return await fn(...args);
          } catch (error) {
            if (this.isContextError(error)) {
              console.log(`[BRA ${name}] Handling context error gracefully`);
              this.isValid = false;
              this.fallbackMode = true;
              return null;
            }
            throw error;
          }
        };
      }
    }
    
    contextManager = new InlineContextManager();
  }
  
  // Monitor context periodically
  setInterval(() => contextManager.checkContext(), 1000);
  
  // ============= INSTANT CHANGE DETECTOR =============
  class InstantChangeDetector {
    constructor(onChangeCallback) {
      this.onChangeCallback = contextManager.createErrorBoundary(
        onChangeCallback, 
        'ChangeDetector'
      );
      this.lastUrl = window.location.href;
      this.lastDetectionTime = 0;
      this.mutationObserver = null;
      this.isDetecting = false;
      this.pendingDetection = null;
      
      this.config = {
        mutationDebounce: 100,
        minTimeBetweenDetections: 200,
        significantChangeThreshold: 3,
        instantNavigationDelay: 0,
      };
      
      this.mutationTimer = null;
      this.mutationCount = 0;
      
      this.setupUrlMonitoring();
      this.setupMutationObserver();
      this.setupFormMonitoring();
      this.setupNavigationInterception();
    }
    
    triggerChange(reason, isInstant = false) {
      console.log(`[BRA InstantDetector] Change: ${reason} (instant: ${isInstant})`);
      
      const now = Date.now();
      const timeSinceLastDetection = now - this.lastDetectionTime;
      
      if (isInstant) {
        this.executeChange(reason);
        return;
      }
      
      if (timeSinceLastDetection < this.config.minTimeBetweenDetections) {
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
    
    executeChange(reason) {
      if (this.isDetecting) {
        console.log('[BRA InstantDetector] Detection in progress, queueing');
        return;
      }
      
      console.log(`[BRA InstantDetector] Executing: ${reason}`);
      this.lastDetectionTime = Date.now();
      this.mutationCount = 0;
      this.isDetecting = true;
      
      if (this.pendingDetection) {
        clearTimeout(this.pendingDetection);
        this.pendingDetection = null;
      }
      
      if (this.onChangeCallback) {
        Promise.resolve(this.onChangeCallback(reason)).finally(() => {
          this.isDetecting = false;
        });
      } else {
        this.isDetecting = false;
      }
    }
    
    setupUrlMonitoring() {
      window.addEventListener('popstate', () => {
        if (window.location.href !== this.lastUrl) {
          this.handleNavigation('popstate', window.location.href);
        }
      });
      
      const originalPushState = history.pushState;
      history.pushState = function(...args) {
        const result = originalPushState.apply(history, args);
        window.dispatchEvent(new Event('pushstate'));
        return result;
      };
      
      window.addEventListener('pushstate', () => {
        if (window.location.href !== this.lastUrl) {
          this.handleNavigation('pushstate', window.location.href);
        }
      });
      
      const originalReplaceState = history.replaceState;
      history.replaceState = function(...args) {
        const result = originalReplaceState.apply(history, args);
        window.dispatchEvent(new Event('replacestate'));
        return result;
      };
      
      window.addEventListener('replacestate', () => {
        if (window.location.href !== this.lastUrl) {
          this.handleNavigation('replacestate', window.location.href);
        }
      });
      
      window.addEventListener('hashchange', () => {
        this.handleNavigation('hashchange', window.location.href);
      });
    }
    
    handleNavigation(type, newUrl) {
      const oldUrl = this.lastUrl;
      this.lastUrl = newUrl;
      
      console.log(`[BRA InstantDetector] Navigation: ${type}`);
      
      // Notify background about navigation immediately
      contextManager.sendMessage({
        action: 'navigationDetected',
        oldUrl: oldUrl,
        newUrl: newUrl,
        isHashChange: type === 'hashchange',
        timestamp: Date.now()
      });
      
      this.triggerChange(`navigation-${type}`, true);
    }
    
    setupMutationObserver() {
      const config = {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'disabled'],
        characterData: false
      };
      
      this.mutationObserver = new MutationObserver((mutations) => {
        let significantChange = false;
        
        for (const mutation of mutations) {
          if (mutation.type === 'childList') {
            const hasFormElements = Array.from(mutation.addedNodes).some(node => {
              if (node.nodeType !== 1) return false;
              return node.matches?.('form, input, select, textarea, label, fieldset') ||
                     node.querySelector?.('form, input, select, textarea, label, fieldset');
            });
            
            if (hasFormElements) {
              significantChange = true;
              break;
            }
          }
        }
        
        if (significantChange) {
          this.mutationCount++;
          
          if (this.mutationTimer) {
            clearTimeout(this.mutationTimer);
          }
          
          this.mutationTimer = setTimeout(() => {
            if (this.mutationCount >= this.config.significantChangeThreshold) {
              this.triggerChange('significant-mutations');
            }
            this.mutationCount = 0;
          }, this.config.mutationDebounce);
        }
      });
      
      this.mutationObserver.observe(document.body, config);
    }
    
    setupFormMonitoring() {
      let lastFormCount = document.querySelectorAll('form').length;
      let lastInputCount = document.querySelectorAll('input, select, textarea').length;
      
      const checkForChanges = () => {
        const currentFormCount = document.querySelectorAll('form').length;
        const currentInputCount = document.querySelectorAll('input, select, textarea').length;
        
        if (currentFormCount !== lastFormCount || 
            Math.abs(currentInputCount - lastInputCount) > 5) {
          lastFormCount = currentFormCount;
          lastInputCount = currentInputCount;
          this.triggerChange('form-structure-change');
        }
      };
      
      document.addEventListener('change', (e) => {
        if (e.target.matches('select, input[type="radio"], input[type="checkbox"]')) {
          setTimeout(checkForChanges, 50);
        }
      });
      
      const conditionalObserver = new MutationObserver(() => {
        checkForChanges();
      });
      
      const startObserving = () => {
        document.querySelectorAll('form').forEach(form => {
          conditionalObserver.observe(form, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class', 'hidden']
          });
        });
      };
      
      startObserving();
      setInterval(startObserving, 2000);
    }
    
    setupNavigationInterception() {
      document.addEventListener('click', (e) => {
        const link = e.target.closest('a, button');
        if (link) {
          const isNavigation = 
            (link.tagName === 'A' && link.href && !link.href.startsWith('#')) ||
            (link.tagName === 'BUTTON' && (
              link.textContent.match(/next|continue|proceed|submit/i) ||
              link.classList.toString().match(/next|continue|proceed|submit/i)
            ));
          
          if (isNavigation) {
            console.log('[BRA InstantDetector] Potential navigation click detected');
            setTimeout(() => {
              if (window.location.href !== this.lastUrl) {
                this.handleNavigation('click', window.location.href);
              } else {
                const currentInputCount = document.querySelectorAll('input, select, textarea').length;
                if (Math.abs(currentInputCount - this.lastInputCount) > 3) {
                  this.triggerChange('post-click-change');
                }
              }
            }, 100);
          }
        }
      });
    }
    
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
  
  // ============= MESSAGING (Bulletproof) =============
  class BulletproofMessaging {
    constructor() {
      this.messageQueue = [];
      this.isProcessing = false;
    }
    
    async send(message, options = {}) {
      // Always check context first
      if (!contextManager.isExtensionContext()) {
        console.log('[BRA Messaging] Context invalid, queueing message');
        this.messageQueue.push({ message, options });
        return null;
      }
      
      const result = await contextManager.sendMessage(message, options);
      
      // Process queued messages if context restored
      if (result !== null && this.messageQueue.length > 0) {
        this.processQueue();
      }
      
      return result;
    }
    
    async processQueue() {
      if (this.isProcessing || !contextManager.isExtensionContext()) return;
      
      this.isProcessing = true;
      
      while (this.messageQueue.length > 0 && contextManager.isExtensionContext()) {
        const { message, options } = this.messageQueue.shift();
        await contextManager.sendMessage(message, options);
      }
      
      this.isProcessing = false;
    }
    
    sendQuick(message) {
      return this.send(message, { timeout: 3000 });
    }
    
    sendOptional(message) {
      // Fire and forget - don't wait
      this.send(message, { timeout: 1000 });
      return Promise.resolve(null);
    }
  }
  
  const messaging = new BulletproofMessaging();
  
  // ============= MODULE LOADER (Bulletproof) =============
  class BulletproofModuleLoader {
    constructor() {
      this.modules = new Map();
      this.fallbacks = new Map();
    }
    
    async load(moduleName, fallbackFactory) {
      // Register fallback
      if (fallbackFactory) {
        this.fallbacks.set(moduleName, fallbackFactory);
      }
      
      // Return cached module if available
      if (this.modules.has(moduleName)) {
        return this.modules.get(moduleName);
      }
      
      // Try to load module with context manager
      const module = await contextManager.safeCall(
        async () => {
          const moduleUrl = chrome.runtime.getURL(`modules/${moduleName}.js`);
          const imported = await import(moduleUrl);
          return imported.default || imported;
        },
        null,
        { cache: true, cacheKey: `module_${moduleName}` }
      );
      
      if (module) {
        this.modules.set(moduleName, module);
        return module;
      }
      
      // Use fallback if available
      if (this.fallbacks.has(moduleName)) {
        console.log(`[BRA] Using fallback for ${moduleName}`);
        const fallback = this.fallbacks.get(moduleName)();
        this.modules.set(moduleName, fallback);
        return fallback;
      }
      
      return null;
    }
  }
  
  const moduleLoader = new BulletproofModuleLoader();
  
  // ============= FIELD DETECTOR INTEGRATION =============
  let FieldDetector;
  
  // Field detector fallback
  const createFieldDetectorFallback = () => {
    return class FallbackFieldDetector {
      constructor() {
        this.fields = [];
        this.sections = [];
        this.initialized = true;
      }
      
      async detectFields() {
        console.log('[BRA] Using fallback field detector');
        
        const fields = [];
        const inputs = document.querySelectorAll('input, select, textarea');
        
        inputs.forEach((input, index) => {
          if (input.type === 'hidden') return;
          
          const label = this.findLabel(input) || `Field ${index + 1}`;
          fields.push({
            element: input,
            label: label,
            type: input.type || 'text',
            name: input.name || '',
            id: input.id || '',
            required: input.required || false,
            value: input.value || '',
            confidence: 50
          });
        });
        
        this.fields = fields;
        return {
          fields: fields,
          sections: [],
          isBusinessForm: fields.length > 3,
          confidence: fields.length > 3 ? 60 : 30
        };
      }
      
      findLabel(input) {
        // Check for explicit label
        if (input.id) {
          const label = document.querySelector(`label[for="${input.id}"]`);
          if (label) return label.textContent.trim();
        }
        
        // Check parent label
        const parentLabel = input.closest('label');
        if (parentLabel) return parentLabel.textContent.trim();
        
        // Check aria-label
        if (input.getAttribute('aria-label')) {
          return input.getAttribute('aria-label');
        }
        
        // Check placeholder
        if (input.placeholder) {
          return input.placeholder;
        }
        
        return null;
      }
      
      async validate() {
        return true;
      }
      
      getUIData() {
        return {
          categories: {},
          sections: [],
          totalFields: this.fields.length
        };
      }
    };
  };
  
  // ============= MAIN DETECTOR =============
  class BulletproofDetector {
    constructor() {
      this.isInitialized = false;
      this.detectionInProgress = false;
      this.lastDetectionResult = null;
      this.fieldDetector = null;
      
      // Listen for context changes
      contextManager.addListener((event, isValid) => {
        if (event === 'restored') {
          console.log('[BRA Detector] Context restored, reinitializing');
          this.initialize();
        }
      });
    }
    
    async initialize() {
      console.log('[BRA Detector] Initializing...');
      
      try {
        // Load field detector with fallback
        const FieldDetectorClass = await moduleLoader.load(
          'fieldDetector',
          createFieldDetectorFallback
        );
        
        if (FieldDetectorClass) {
          this.fieldDetector = new FieldDetectorClass();
          
          // Wrap field detector methods with error boundaries
          if (this.fieldDetector.detectFields) {
            this.fieldDetector.detectFields = contextManager.createErrorBoundary(
              this.fieldDetector.detectFields.bind(this.fieldDetector),
              'FieldDetector.detectFields'
            );
          }
          
          // Initialize if needed
          if (this.fieldDetector.initialize && !this.fieldDetector.initialized) {
            await contextManager.safeCall(
              () => this.fieldDetector.initialize(),
              null
            );
          }
        }
        
        this.isInitialized = true;
        console.log('[BRA Detector] Initialization complete');
        
        // Notify background we're ready
        await messaging.sendOptional({
          action: 'contentScriptReady',
          url: window.location.href,
          timestamp: Date.now()
        });
        
      } catch (error) {
        console.error('[BRA Detector] Initialization error:', error);
        this.isInitialized = false;
      }
    }
    
    async performDetection(trigger = 'unknown') {
      if (!this.isInitialized) {
        await this.initialize();
      }
      
      if (this.detectionInProgress) {
        console.log('[BRA Detector] Detection already in progress');
        return;
      }
      
      this.detectionInProgress = true;
      console.log(`[BRA Detector] Starting detection (trigger: ${trigger})`);
      
      try {
        let detectionResult = {
          isBusinessRegistrationForm: false,
          confidenceScore: 0,
          fields: [],
          error: null
        };
        
        if (this.fieldDetector) {
          const result = await this.fieldDetector.detectFields();
          
          if (result) {
            detectionResult = {
              isBusinessRegistrationForm: result.isBusinessForm || false,
              confidenceScore: result.confidence || 0,
              state: result.state,
              fields: result.fields || [],
              sections: result.sections || [],
              url: window.location.href,
              timestamp: Date.now()
            };
            
            this.lastDetectionResult = detectionResult;
          }
        }
        
        // Send result to background
        await messaging.send({
          action: 'formDetected',
          result: detectionResult,
          trigger: trigger
        });
        
      } catch (error) {
        console.error('[BRA Detector] Detection error:', error);
        
        // Send error to background only if it's not a context error
        if (!contextManager.isContextError(error)) {
          await messaging.sendOptional({
            action: 'detectionError',
            error: {
              message: error.message,
              context: 'detection',
              trigger: trigger
            }
          });
        }
      } finally {
        this.detectionInProgress = false;
      }
    }
  }
  
  // ============= INITIALIZATION =============
  const detector = new BulletproofDetector();
  
  // Set up change detection
  const changeDetector = new InstantChangeDetector(async (reason) => {
    await detector.performDetection(reason);
  });
  
  // Initialize detector
  detector.initialize().then(() => {
    // Perform initial detection
    detector.performDetection('initial-load');
  });
  
  // Listen for messages
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Wrap in error boundary
    const safeHandler = contextManager.createErrorBoundary(async () => {
      switch (message.action) {
        case 'ping':
          return { alive: true, timestamp: Date.now() };
          
        case 'triggerDetection':
          await detector.performDetection('manual-trigger');
          return { success: true };
          
        case 'getDetectionResult':
          return { 
            success: true, 
            result: detector.lastDetectionResult 
          };
          
        default:
          return { success: false, error: 'Unknown action' };
      }
    }, 'MessageHandler');
    
    safeHandler(message).then(response => {
      sendResponse(response || { success: false });
    });
    
    return true; // Will respond asynchronously
  });
  
  // Context monitoring
  setInterval(() => {
    // Process message queue if context restored
    if (contextManager.isExtensionContext() && messaging.messageQueue.length > 0) {
      messaging.processQueue();
    }
  }, 1000);
  
  console.log('[BRA] Bulletproof content script ready');
  
})();