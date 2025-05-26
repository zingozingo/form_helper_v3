/**
 * Business Registration Assistant - Content Script v2
 * Robust messaging and error handling
 */

(async function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptV2Initialized) {
    return;
  }
  window.__braContentScriptV2Initialized = true;
  
  console.log('[BRA-V2] Initializing content script v2');
  
  // Import messaging handler
  let ContentMessaging;
  try {
    const module = await import(chrome.runtime.getURL('content_messaging.js'));
    ContentMessaging = module.default || module.ContentMessaging || window.ContentMessaging;
  } catch (error) {
    console.error('[BRA-V2] Failed to load messaging module:', error);
    return;
  }
  
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
    debounceTimer: null,
    modules: {}
  };
  
  // Performance configuration
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
      // TODO: Implement auto-fill
      return {
        success: false,
        message: 'Auto-fill not yet implemented'
      };
    });
  }
  
  /**
   * Load detection modules
   */
  async function loadModules() {
    try {
      // Load URLDetector
      try {
        const urlModule = await import(chrome.runtime.getURL('modules/urlDetector.js'));
        state.modules.URLDetector = urlModule.default || urlModule.URLDetector;
        console.log('[BRA-V2] URLDetector loaded');
      } catch (error) {
        console.warn('[BRA-V2] Failed to load URLDetector:', error);
        // Fallback detector
        state.modules.URLDetector = {
          analyzeUrl: (url) => ({
            isGovernmentSite: url?.href?.includes('.gov') || false,
            score: 50,
            state: null
          })
        };
      }
      
      // Load FieldDetector
      try {
        const fieldModule = await import(chrome.runtime.getURL('modules/fieldDetectorStatic.js'));
        state.modules.FieldDetector = fieldModule.default || fieldModule.FieldDetectorStatic;
        console.log('[BRA-V2] FieldDetector loaded');
      } catch (error) {
        console.warn('[BRA-V2] Failed to load FieldDetector:', error);
        // Basic fallback
        state.modules.FieldDetector = class {
          constructor() {
            this.root = document.body;
          }
          async detectFields() {
            return [];
          }
          getUIData() {
            return { sections: [], categories: {} };
          }
        };
      }
      
      return true;
    } catch (error) {
      console.error('[BRA-V2] Module loading failed:', error);
      return false;
    }
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
      console.log('[BRA-V2] Too soon since last run, skipping');
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
      console.log('[BRA-V2] Detection already running');
      return;
    }
    
    console.log('[BRA-V2] Starting detection');
    state.detection.isRunning = true;
    state.detection.lastRun = Date.now();
    state.detection.attempts++;
    
    // Timeout promise
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          isBusinessRegistrationForm: false,
          confidenceScore: 0,
          error: 'Detection timeout'
        });
      }, CONFIG.DETECTION_TIMEOUT);
    });
    
    // Detection promise
    const detectionPromise = (async () => {
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
        if (state.modules.URLDetector) {
          result.urlDetection = await state.modules.URLDetector.analyzeUrl(window.location);
          console.log('[BRA-V2] URL detection:', result.urlDetection);
        }
        
        // Field detection
        if (state.modules.FieldDetector) {
          const detector = new state.modules.FieldDetector({
            root: document.body,
            urlInfo: result.urlDetection
          });
          
          const fields = await detector.detectFields();
          const uiData = detector.getUIData();
          
          result.fieldDetection = {
            isDetected: fields.length > 0,
            fields: fields,
            uiData: uiData,
            confidence: fields.length > 0 ? 60 : 0
          };
          
          console.log('[BRA-V2] Field detection found', fields.length, 'fields');
        }
        
        // Calculate overall confidence
        const urlScore = result.urlDetection?.score || 0;
        const fieldScore = result.fieldDetection?.confidence || 0;
        result.confidenceScore = Math.round((urlScore + fieldScore) / 2);
        result.isBusinessRegistrationForm = result.confidenceScore > 40;
        
        return result;
        
      } catch (error) {
        console.error('[BRA-V2] Detection error:', error);
        return {
          isBusinessRegistrationForm: false,
          confidenceScore: 0,
          error: error.message
        };
      }
    })();
    
    try {
      // Race between detection and timeout
      const result = await Promise.race([detectionPromise, timeoutPromise]);
      
      // Store result
      state.detection.lastResult = result;
      
      // Send result to background
      await messaging.sendMessage({
        action: 'formDetected',
        result: result
      });
      
      console.log('[BRA-V2] Detection complete:', result);
      
    } catch (error) {
      console.error('[BRA-V2] Detection failed:', error);
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
        console.log('[BRA-V2] URL changed:', newUrl);
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
      // Register handlers
      registerHandlers();
      
      // Load modules
      const modulesLoaded = await loadModules();
      if (!modulesLoaded) {
        console.error('[BRA-V2] Failed to load modules');
        return;
      }
      
      // Notify background that we're ready
      await messaging.sendMessage({
        action: 'contentScriptReady',
        url: window.location.href
      });
      
      // Set up observers
      setupObserver();
      setupNavigationMonitoring();
      
      // Run initial detection after a delay
      setTimeout(() => {
        scheduleDetection();
      }, 1000);
      
      console.log('[BRA-V2] Content script initialized successfully');
      
    } catch (error) {
      console.error('[BRA-V2] Initialization error:', error);
    }
  }
  
  // Start initialization
  initialize();
  
})();