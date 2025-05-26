// Business Registration Assistant - Content Script with Stable Page Detection
// This script detects business registration forms on web pages with robust page readiness detection

console.log('[BRA] Business Registration Assistant - Content Script Loading (Stable Version)');

// Global variables
let detectionResult = null;
let detectionAttempts = 0;
let moduleLoadTimeout = null;
let messagingUtils = null;
let URLDetector = null;
let FieldDetector = null;
let fieldDetectionResults = null;
let pageReadinessState = {
  domStable: false,
  resourcesLoaded: false,
  noActiveTransitions: false,
  detectionTriggered: false,
  stabilityCheckCount: 0
};

// Constants
const MAX_DETECTION_ATTEMPTS = 5;
const RETRY_DELAY = 1000; // Base delay between retry attempts
const MODULE_LOAD_TIMEOUT = 10000; // 10 seconds timeout for module loading
const DEBUG_MODE = false; // Set to true to enable detailed console logging
const CONNECTION_RETRY_MAX = 3; // Max connection verification retries before fallback mode
const DOM_STABILITY_TIMEOUT = 2000; // Time to wait for DOM stability
const MUTATION_QUIET_PERIOD = 500; // Time of no mutations to consider DOM stable

// Messaging state
let connectionEstablished = false;
let connectionAttempts = 0;
let fallbackDetectionMode = false;
let pendingMessageCallbacks = {};
let messageCallbackId = 0;

// Module loading promise
let modulesLoadedPromise = null;

/**
 * Enhanced page readiness detector that ensures DOM is truly stable
 */
class PageReadinessDetector {
  constructor() {
    this.mutationCount = 0;
    this.lastMutationTime = Date.now();
    this.stabilityTimer = null;
    this.resourceCheckTimer = null;
    this.observer = null;
    this.isReady = false;
    this.readyCallbacks = [];
  }

  /**
   * Start monitoring page readiness
   */
  start() {
    console.log('[BRA] PageReadinessDetector starting...');
    
    // Check initial state
    this.checkInitialState();
    
    // Start mutation observer
    this.startMutationObserver();
    
    // Monitor resource loading
    this.monitorResourceLoading();
    
    // Check for CSS transitions/animations
    this.monitorTransitions();
    
    // Set up periodic stability checks
    this.startStabilityChecks();
  }

  /**
   * Check initial document state
   */
  checkInitialState() {
    const readyState = document.readyState;
    console.log('[BRA] Initial document.readyState:', readyState);
    
    if (readyState === 'complete') {
      pageReadinessState.resourcesLoaded = true;
    } else {
      // Wait for load event
      window.addEventListener('load', () => {
        console.log('[BRA] Window load event fired');
        pageReadinessState.resourcesLoaded = true;
        this.checkReadiness();
      });
    }
  }

  /**
   * Start mutation observer to track DOM changes
   */
  startMutationObserver() {
    this.observer = new MutationObserver((mutations) => {
      this.mutationCount += mutations.length;
      this.lastMutationTime = Date.now();
      
      // Reset stability timer on mutations
      clearTimeout(this.stabilityTimer);
      pageReadinessState.domStable = false;
      
      // Check for significant mutations
      const hasSignificantMutations = mutations.some(mutation => {
        // Check for form-related changes
        if (mutation.type === 'childList') {
          for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (element.matches && (
                element.matches('form, fieldset, input, select, textarea, button, .form-container, .form-wrapper') ||
                (element.querySelector && element.querySelector('form, input, select, textarea'))
              )) {
                return true;
              }
            }
          }
        }
        return false;
      });
      
      if (hasSignificantMutations) {
        console.log('[BRA] Significant DOM mutations detected, resetting stability timer');
      }
      
      // Set new stability timer
      this.stabilityTimer = setTimeout(() => {
        console.log('[BRA] DOM stable for', MUTATION_QUIET_PERIOD, 'ms');
        pageReadinessState.domStable = true;
        this.checkReadiness();
      }, MUTATION_QUIET_PERIOD);
    });
    
    // Start observing
    this.observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'disabled']
    });
  }

  /**
   * Monitor resource loading (images, scripts, etc.)
   */
  monitorResourceLoading() {
    const checkResources = () => {
      // Check for pending images
      const images = Array.from(document.querySelectorAll('img'));
      const pendingImages = images.filter(img => !img.complete && img.src);
      
      // Check for pending scripts
      const scripts = Array.from(document.querySelectorAll('script[src]'));
      const pendingScripts = scripts.filter(script => {
        return script.async || script.defer;
      });
      
      // Check for loading indicators
      const loadingIndicators = this.findLoadingIndicators();
      
      console.log('[BRA] Resource check:', {
        pendingImages: pendingImages.length,
        pendingScripts: pendingScripts.length,
        loadingIndicators: loadingIndicators.length
      });
      
      if (pendingImages.length === 0 && loadingIndicators.length === 0) {
        pageReadinessState.resourcesLoaded = true;
        this.checkReadiness();
      } else {
        // Check again after a delay
        this.resourceCheckTimer = setTimeout(checkResources, 500);
      }
    };
    
    // Start checking after initial delay
    setTimeout(checkResources, 100);
  }

  /**
   * Find loading indicators on the page
   */
  findLoadingIndicators() {
    const selectors = [
      '.loading', '.loader', '.spinner', '.progress',
      '[role="progressbar"]', '.wait', '.processing',
      '.loading-indicator', '.page-loading', '.content-loading'
    ];
    
    const indicators = [];
    
    for (const selector of selectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && 
              style.visibility !== 'hidden' && 
              style.opacity !== '0') {
            indicators.push(el);
          }
        }
      } catch (e) {
        // Ignore selector errors
      }
    }
    
    // Also check for elements with loading-related class names
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.className && typeof el.className === 'string') {
        const classNames = el.className.toLowerCase();
        if ((classNames.includes('loading') || 
             classNames.includes('spinner') ||
             classNames.includes('progress')) &&
            !indicators.includes(el)) {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && 
              style.visibility !== 'hidden' && 
              style.opacity !== '0') {
            indicators.push(el);
          }
        }
      }
    }
    
    return indicators;
  }

  /**
   * Monitor CSS transitions and animations
   */
  monitorTransitions() {
    let activeTransitions = 0;
    
    // Listen for transition/animation events
    document.addEventListener('transitionstart', () => {
      activeTransitions++;
      pageReadinessState.noActiveTransitions = false;
    });
    
    document.addEventListener('transitionend', () => {
      activeTransitions--;
      if (activeTransitions <= 0) {
        activeTransitions = 0;
        pageReadinessState.noActiveTransitions = true;
        this.checkReadiness();
      }
    });
    
    document.addEventListener('animationstart', () => {
      activeTransitions++;
      pageReadinessState.noActiveTransitions = false;
    });
    
    document.addEventListener('animationend', () => {
      activeTransitions--;
      if (activeTransitions <= 0) {
        activeTransitions = 0;
        pageReadinessState.noActiveTransitions = true;
        this.checkReadiness();
      }
    });
    
    // Initial state
    pageReadinessState.noActiveTransitions = activeTransitions === 0;
  }

  /**
   * Start periodic stability checks
   */
  startStabilityChecks() {
    const performCheck = () => {
      pageReadinessState.stabilityCheckCount++;
      
      // Check various stability indicators
      const formCount = document.querySelectorAll('form').length;
      const inputCount = document.querySelectorAll('input, select, textarea').length;
      const loadingIndicators = this.findLoadingIndicators();
      
      console.log('[BRA] Stability check #' + pageReadinessState.stabilityCheckCount, {
        formCount,
        inputCount,
        loadingIndicators: loadingIndicators.length,
        mutationsSinceLastCheck: this.mutationCount
      });
      
      // Reset mutation count
      this.mutationCount = 0;
      
      // Check if page appears stable
      const timeSinceLastMutation = Date.now() - this.lastMutationTime;
      if (timeSinceLastMutation > MUTATION_QUIET_PERIOD && 
          loadingIndicators.length === 0) {
        pageReadinessState.domStable = true;
        pageReadinessState.noActiveTransitions = true;
        this.checkReadiness();
      }
      
      // Continue checks for first few seconds
      if (pageReadinessState.stabilityCheckCount < 10 && !this.isReady) {
        setTimeout(performCheck, 500);
      }
    };
    
    // Start checking after initial delay
    setTimeout(performCheck, 500);
  }

  /**
   * Check overall readiness and trigger callbacks
   */
  checkReadiness() {
    const wasReady = this.isReady;
    
    // Check all readiness conditions
    this.isReady = pageReadinessState.domStable && 
                   pageReadinessState.resourcesLoaded && 
                   pageReadinessState.noActiveTransitions &&
                   !pageReadinessState.detectionTriggered;
    
    console.log('[BRA] Readiness check:', {
      isReady: this.isReady,
      state: pageReadinessState
    });
    
    if (this.isReady && !wasReady) {
      console.log('[BRA] ✅ Page is now READY for detection');
      pageReadinessState.detectionTriggered = true;
      
      // Trigger all ready callbacks
      this.readyCallbacks.forEach(callback => {
        try {
          callback();
        } catch (e) {
          console.error('[BRA] Error in ready callback:', e);
        }
      });
      
      // Clear callbacks
      this.readyCallbacks = [];
      
      // Stop observer after triggering
      setTimeout(() => {
        if (this.observer) {
          this.observer.disconnect();
          this.observer = null;
        }
      }, 1000);
    }
  }

  /**
   * Register callback for when page is ready
   */
  onReady(callback) {
    if (this.isReady) {
      // Already ready, call immediately
      callback();
    } else {
      this.readyCallbacks.push(callback);
    }
  }

  /**
   * Force readiness check
   */
  forceReady() {
    console.log('[BRA] Forcing page ready state');
    pageReadinessState.domStable = true;
    pageReadinessState.resourcesLoaded = true;
    pageReadinessState.noActiveTransitions = true;
    this.checkReadiness();
  }
}

// Create global page readiness detector
const pageReadinessDetector = new PageReadinessDetector();

/**
 * Logs messages when debug mode is enabled
 * @param {...any} args - Arguments to log
 */
function log(...args) {
  if (DEBUG_MODE || args[0]?.includes('Error') || args[0]?.includes('error')) {
    console.log('[BRA Content]', ...args);
  }
}

/**
 * Report errors for debugging
 * @param {Error} error - The error object
 * @param {string} context - Where the error occurred
 * @param {boolean} isFatal - Whether this error is fatal
 */
function reportError(error, context, isFatal = false) {
  // Always log errors regardless of debug mode
  console.error('[BRA Content] Error in ' + context + ':', error);
  
  // Store error for debugging
  if (!window.BRA_Errors) {
    window.BRA_Errors = [];
  }
  
  window.BRA_Errors.push({
    message: error.message,
    stack: error.stack,
    context: context,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    isFatal: isFatal
  });
  
  // Keep only last 50 errors
  if (window.BRA_Errors.length > 50) {
    window.BRA_Errors.shift();
  }
  
  // For fatal errors, attempt to notify background script
  if (isFatal && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({
        action: 'contentScriptError',
        error: {
          message: error.message,
          context: context,
          url: window.location.href
        }
      });
    } catch (e) {
      // Can't report to background, already logged to console
    }
  }
}

/**
 * Load required modules dynamically with error handling
 */
async function loadModules() {
  log('Loading detection modules...');
  
  try {
    // Set a timeout for module loading
    const timeoutPromise = new Promise((_, reject) => {
      moduleLoadTimeout = setTimeout(() => {
        reject(new Error('Module loading timed out after ' + MODULE_LOAD_TIMEOUT + 'ms'));
      }, MODULE_LOAD_TIMEOUT);
    });
    
    // Try to load modules - use dynamic imports to handle errors gracefully
    const modulePromises = Promise.all([
      import('./modules/urlDetector.js').catch(err => {
        console.warn('[BRA] Failed to load urlDetector module:', err.message);
        return null;
      }),
      import('./modules/fieldDetector.js').catch(err => {
        console.warn('[BRA] Failed to load fieldDetector module:', err.message);
        return null;
      }),
      import('./modules/messaging_utils.js').catch(err => {
        console.warn('[BRA] Failed to load messaging utils:', err.message);
        return null;
      })
    ]);
    
    // Race between timeout and module loading
    const modules = await Promise.race([modulePromises, timeoutPromise]);
    
    // Clear the timeout
    clearTimeout(moduleLoadTimeout);
    
    // Assign loaded modules to global variables
    if (modules[0]) URLDetector = modules[0];
    if (modules[1]) FieldDetector = modules[1];
    if (modules[2]) {
      messagingUtils = modules[2];
      // Also set on window for other scripts
      window.messagingUtils = modules[2];
    }
    
    log('Modules loaded successfully:', {
      urlDetector: !!URLDetector,
      fieldDetector: !!FieldDetector,
      messagingUtils: !!messagingUtils
    });
    
    // If critical modules failed to load, use fallback implementations
    if (!URLDetector) {
      log('Using fallback URL detector implementation');
      URLDetector = createFallbackUrlDetector();
    }
    
    if (!FieldDetector) {
      log('Using fallback field detector implementation');
      FieldDetector = createFallbackFieldDetector();
    }
    
  } catch (error) {
    reportError(error, 'loadModules');
    
    // Use fallback implementations
    log('Module loading failed, using fallback implementations');
    URLDetector = createFallbackUrlDetector();
    FieldDetector = createFallbackFieldDetector();
  }
}

/**
 * Create fallback URL detector if module fails to load
 */
function createFallbackUrlDetector() {
  return {
    default: {
      analyzeUrl: function(url) {
        // Basic URL analysis fallback
        const urlLower = url.toLowerCase();
        let score = 0;
        
        // Check for business registration keywords
        const keywords = ['business', 'register', 'entity', 'llc', 'corporation', 'formation', 'incorporate'];
        keywords.forEach(keyword => {
          if (urlLower.includes(keyword)) score += 20;
        });
        
        // Check for government domains
        if (urlLower.includes('.gov')) score += 30;
        
        return { score: Math.min(score, 100) };
      },
      identifyStateFromUrl: function(url) {
        // Try to extract state from URL
        const statePattern = /\/(al|ak|az|ar|ca|co|ct|de|dc|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\//i;
        const match = url.match(statePattern);
        return match ? match[1].toUpperCase() : null;
      }
    }
  };
}

/**
 * Create fallback field detector if module fails to load
 */
function createFallbackFieldDetector() {
  return {
    default: class FallbackFieldDetector {
      constructor(document) {
        this.document = document;
      }
      
      async detectFields() {
        // Basic field detection
        const fields = [];
        const inputs = this.document.querySelectorAll('input, select, textarea');
        
        inputs.forEach(input => {
          fields.push({
            element: input,
            type: input.type || 'text',
            name: input.name || input.id,
            label: this.findLabel(input)
          });
        });
        
        return fields;
      }
      
      findLabel(input) {
        // Try to find associated label
        if (input.id) {
          const label = this.document.querySelector(`label[for="${input.id}"]`);
          if (label) return { text: label.textContent.trim() };
        }
        
        // Check for wrapping label
        const parent = input.closest('label');
        if (parent) return { text: parent.textContent.trim() };
        
        return null;
      }
    }
  };
}

// Create module loading promise
modulesLoadedPromise = loadModules();

/**
 * Send message with retry logic
 * @param {Object} message - Message to send
 * @param {Function} successCallback - Callback on success
 * @param {Function} errorCallback - Callback on error
 */
function sendMessageWithRetry(message, successCallback, errorCallback) {
  const callbackId = messageCallbackId++;
  let retryCount = 0;
  const maxRetries = 3;
  
  function attemptSend() {
    try {
      // First try using messaging utils if available
      if (messagingUtils && messagingUtils.sendMessage) {
        messagingUtils.sendMessage(message, function(response) {
          delete pendingMessageCallbacks[callbackId];
          if (successCallback) successCallback(response);
        }, function(error) {
          handleSendError(error);
        });
      } else {
        // Fallback to direct chrome.runtime.sendMessage
        chrome.runtime.sendMessage(message, function(response) {
          if (chrome.runtime.lastError) {
            handleSendError(chrome.runtime.lastError);
          } else {
            delete pendingMessageCallbacks[callbackId];
            if (successCallback) successCallback(response);
          }
        });
      }
    } catch (e) {
      handleSendError(e);
    }
  }
  
  function handleSendError(error) {
    retryCount++;
    
    if (retryCount < maxRetries) {
      // Exponential backoff
      const delay = Math.pow(2, retryCount) * 100;
      console.log(`[BRA] Message send failed, retrying in ${delay}ms...`);
      setTimeout(attemptSend, delay);
    } else {
      // Max retries reached
      delete pendingMessageCallbacks[callbackId];
      connectionAttempts++;
      
      // Check if we should switch to fallback mode
      if (connectionAttempts >= CONNECTION_RETRY_MAX && !fallbackDetectionMode) {
        console.log('[BRA] Switching to fallback mode after failed message attempts');
        fallbackDetectionMode = true;
      }
      
      console.error('[BRA] Error sending message:', error.message);
      
      // Call error callback
      if (errorCallback) {
        errorCallback(error);
      }
    }
  }
  
  // Store callback reference
  pendingMessageCallbacks[callbackId] = {
    success: successCallback,
    error: errorCallback,
    timestamp: Date.now()
  };
  
  // Start sending
  attemptSend();
}

/**
 * Initialize detection only when page is truly ready
 */
function initializeDetection() {
  console.log('[BRA Content] ========== INITIALIZING STABLE DETECTION ==========');
  console.log('[BRA Content] URL:', window.location.href);
  console.log('[BRA Content] Document state:', document.readyState);
  log('Initializing content script with stable page detection');
  
  // Start page readiness detection
  pageReadinessDetector.start();
  
  // Register detection to run when page is ready
  pageReadinessDetector.onReady(() => {
    console.log('[BRA Content] Page is ready, starting detection');
    tryDetection();
  });
  
  // Also set up a maximum wait time
  setTimeout(() => {
    if (!pageReadinessState.detectionTriggered) {
      console.log('[BRA Content] Maximum wait time reached, forcing detection');
      pageReadinessDetector.forceReady();
    }
  }, DOM_STABILITY_TIMEOUT);
}

/**
 * Try to detect business forms with retry mechanism
 */
async function tryDetection() {
  console.log('[BRA] tryDetection() called with stable page');
  
  // Prevent multiple simultaneous detections
  if (detectionResult && !window.BRA_FORCE_REDETECTION) {
    log('Detection already completed and no force flag, skipping');
    return;
  }
  
  // Clear force flag
  window.BRA_FORCE_REDETECTION = false;
  
  // Wait for modules to load
  if (modulesLoadedPromise) {
    console.log('[BRA] Waiting for modules to load...');
    await modulesLoadedPromise;
    console.log('[BRA] Modules loaded, proceeding with detection');
  }
  
  // Increment attempt counter
  detectionAttempts++;
  log('Detection attempt ' + detectionAttempts + '/' + MAX_DETECTION_ATTEMPTS);
  
  // Attempt detection
  try {
    await detectBusinessForm();
    
    // Only report success if we're not in fallback mode
    if (!fallbackDetectionMode && detectionResult) {
      // Send result to background script with retry
      sendMessageWithRetry({
        action: 'formDetected',
        result: detectionResult
      }, function(response) {
        log('Detection result reported successfully');
      }, function() {
        log('Failed to report detection result, but detection succeeded locally');
      });
    }
  } catch (error) {
    // Determine if this is a fatal error
    const isFatal = detectionAttempts >= MAX_DETECTION_ATTEMPTS;
    
    // Report the error with proper context
    reportError(error, 'tryDetection', isFatal);
    
    // Retry if we haven't exceeded max attempts
    if (detectionAttempts < MAX_DETECTION_ATTEMPTS) {
      // Increase delay for each retry with exponential backoff
      const currentDelay = RETRY_DELAY * Math.pow(1.5, detectionAttempts - 1);
      log('Will retry detection in ' + currentDelay + 'ms');
      setTimeout(tryDetection, currentDelay);
    } else {
      log('Maximum detection attempts reached, giving up');
      
      // Create a fallback minimal detection result
      if (!detectionResult) {
        detectionResult = { 
          isBusinessRegistrationForm: false,
          confidenceScore: 0,
          fallbackMode: true,
          error: 'Detection failed after ' + MAX_DETECTION_ATTEMPTS + ' attempts',
          url: window.location.href,
          timestamp: new Date().toISOString()
        };
      }
      
      // Notify background of failed detection
      if (!fallbackDetectionMode) {
        sendMessageWithRetry({
          action: 'detectionFailed',
          attempts: detectionAttempts,
          url: window.location.href
        }, null, function(e) {
          console.error('[BRA] Failed to report detection failure:', e);
        });
      }
    }
  }
}

/**
 * Main detection function
 */
async function detectBusinessForm() {
  console.log('[BRA Content] ========== detectBusinessForm() STARTED ==========');
  console.log('[BRA Content] URL:', window.location.href);
  console.log('[BRA Content] URLDetector available:', !!URLDetector);
  console.log('[BRA Content] FieldDetector available:', !!FieldDetector);
  log('Starting form detection on stable page');
  
  try {
    // Get current URL
    const currentUrl = window.location.href;
    
    // Make sure URLDetector is loaded
    if (!URLDetector) {
      console.log('[BRA Content] URLDetector not loaded yet');
      throw new Error('URLDetector module not available');
    }
    
    // Analyze URL
    const urlAnalysis = await URLDetector.default.analyzeUrl(currentUrl);
    const urlScore = urlAnalysis.score;
    
    // Analyze page content
    const contentScore = analyzePageContent();
    
    // Analyze form elements
    const formAnalysis = await analyzeFormElements();
    const formScore = formAnalysis.score;
    fieldDetectionResults = formAnalysis.fieldDetectionResults;
    const classificationStats = formAnalysis.classificationStats;
    
    // Calculate confidence score
    let confidenceScore = Math.round((urlScore * 0.3 + contentScore * 0.3 + formScore * 0.4));
    
    // Determine if this is a business registration form
    const isBusinessForm = confidenceScore >= 50 || 
                          (fieldDetectionResults && classificationStats && classificationStats.classified >= 5);
    
    // Get state if available
    const state = URLDetector.default.identifyStateFromUrl(currentUrl);
    
    console.log('[BRA Content] Detection complete:', {
      isBusinessForm,
      confidenceScore,
      state,
      urlScore,
      contentScore,
      formScore
    });
    
    // Store detection result
    detectionResult = {
      isBusinessRegistrationForm: isBusinessForm,
      confidenceScore: confidenceScore,
      state: state,
      url: currentUrl,
      timestamp: new Date().toISOString(),
      fieldDetectionResults: fieldDetectionResults,
      scores: {
        url: urlScore,
        content: contentScore,
        form: formScore
      }
    };
    
    // Send updateDetection message if we have field detection results
    if (fieldDetectionResults && isBusinessForm) {
      sendMessageWithRetry({
        action: 'updateDetection',
        fields: fieldDetectionResults.fields || [],
        uiData: fieldDetectionResults.uiData || {},
        confidence: confidenceScore,
        readinessScore: 100, // Page is stable
        validationScore: fieldDetectionResults.validationScore || 0,
        state: state
      }, function(response) {
        console.log('[BRA Content] Field detection update sent successfully');
      }, function(error) {
        console.error('[BRA Content] Failed to send field detection update:', error);
      });
    }
    
    return detectionResult;
    
  } catch (error) {
    reportError(error, 'detectBusinessForm');
    throw error;
  }
}

/**
 * Analyze page content for business registration indicators
 */
function analyzePageContent() {
  try {
    let score = 0;
    const pageText = document.body?.textContent?.toLowerCase() || '';
    
    // Check for business registration keywords
    const keywords = [
      'business registration', 'register business', 'form llc', 'incorporate',
      'entity formation', 'business license', 'ein', 'employer identification',
      'articles of organization', 'certificate of formation'
    ];
    
    keywords.forEach(keyword => {
      if (pageText.includes(keyword)) {
        score += 10;
      }
    });
    
    // Check headings
    const headings = document.querySelectorAll('h1, h2, h3');
    headings.forEach(heading => {
      const text = heading.textContent.toLowerCase();
      if (text.includes('register') || text.includes('business') || text.includes('formation')) {
        score += 15;
      }
    });
    
    return Math.min(score, 100);
  } catch (error) {
    reportError(error, 'analyzePageContent');
    return 0;
  }
}

/**
 * Analyze form elements for registration patterns
 */
async function analyzeFormElements() {
  try {
    let score = 0;
    let fieldDetectionResults = null;
    let classificationStats = null;
    
    // Check for forms
    const forms = document.querySelectorAll('form');
    score += forms.length * 10;
    
    // Check for business-related input fields
    const inputs = document.querySelectorAll('input, select, textarea');
    const businessFieldPatterns = [
      'business.*name', 'entity.*name', 'company.*name',
      'ein', 'tax.*id', 'ssn', 'social.*security',
      'address', 'city', 'state', 'zip'
    ];
    
    let businessFieldCount = 0;
    inputs.forEach(input => {
      const identifier = (input.name + ' ' + input.id + ' ' + (input.placeholder || '')).toLowerCase();
      businessFieldPatterns.forEach(pattern => {
        if (new RegExp(pattern).test(identifier)) {
          businessFieldCount++;
        }
      });
    });
    
    score += Math.min(businessFieldCount * 5, 50);
    
    // Use FieldDetector if available
    if (FieldDetector && FieldDetector.default) {
      try {
        const detector = new FieldDetector.default(document);
        const fields = await detector.detectFields();
        
        if (fields && fields.length > 0) {
          fieldDetectionResults = {
            fields: fields,
            uiData: {
              totalFields: fields.length,
              classifiedFields: fields.filter(f => f.classification).length
            }
          };
          
          classificationStats = {
            total: fields.length,
            classified: fieldDetectionResults.uiData.classifiedFields
          };
          
          // Boost score based on field detection
          score += Math.min(classificationStats.classified * 10, 50);
        }
      } catch (e) {
        console.warn('[BRA] Field detection error:', e);
      }
    }
    
    return {
      score: Math.min(score, 100),
      fieldDetectionResults,
      classificationStats
    };
    
  } catch (error) {
    reportError(error, 'analyzeFormElements');
    return { score: 0 };
  }
}

// Listen for messages from popup, panel, or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BRA Content] Message received:', message.action);
  
  try {
    if (message.action === 'getDetectionResult') {
      sendResponse(detectionResult || { 
        isBusinessRegistrationForm: false, 
        error: 'No detection result available yet',
        pageReadinessState: pageReadinessState
      });
    }
    else if (message.action === 'triggerDetection') {
      // Reset and trigger new detection
      detectionResult = null;
      detectionAttempts = 0;
      pageReadinessState.detectionTriggered = false;
      
      // Force page ready and trigger detection
      pageReadinessDetector.forceReady();
      
      sendResponse({ 
        success: true, 
        message: 'Detection triggered with page readiness check'
      });
    }
    else if (message.action === 'getDetectionStatus') {
      sendResponse({
        hasResult: !!detectionResult,
        result: detectionResult,
        pageReadinessState: pageReadinessState,
        attempts: detectionAttempts,
        maxAttempts: MAX_DETECTION_ATTEMPTS
      });
    }
    else if (message.action === 'ping') {
      sendResponse({
        alive: true,
        timestamp: Date.now(),
        pageReadinessState: pageReadinessState
      });
    }
  } catch (error) {
    reportError(error, 'messageHandler');
    sendResponse({ 
      error: error.message,
      timestamp: Date.now()
    });
  }
  
  return true; // Keep message channel open
});

// Initialize detection with page readiness check
console.log('[BRA] ===== CONTENT SCRIPT STARTING (STABLE VERSION) =====');
console.log('[BRA] URL:', window.location.href);
console.log('[BRA] Document ready state:', document.readyState);
console.log('[BRA] Time:', new Date().toISOString());

// Wait for DOM to be ready before starting
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDetection);
} else {
  // DOM already loaded, but still use readiness detector
  initializeDetection();
}

// Log initialization
console.log('[BRA] Business Registration Assistant (Stable) initialized on:', window.location.href);
console.log('[BRA] ===== CONTENT SCRIPT INITIALIZED =====');

// Handle URL changes
let lastUrl = location.href;

function handleUrlChange() {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    lastUrl = currentUrl;
    console.log('[BRA] URL changed to:', currentUrl);
    
    // Reset detection state
    detectionResult = null;
    detectionAttempts = 0;
    pageReadinessState = {
      domStable: false,
      resourcesLoaded: false,
      noActiveTransitions: false,
      detectionTriggered: false,
      stabilityCheckCount: 0
    };
    
    // Reinitialize detection for new page
    initializeDetection();
  }
}

// Listen for URL changes
window.addEventListener('hashchange', handleUrlChange);
window.addEventListener('popstate', handleUrlChange);

// Override pushState and replaceState
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function() {
  originalPushState.apply(history, arguments);
  setTimeout(handleUrlChange, 0);
};

history.replaceState = function() {
  originalReplaceState.apply(history, arguments);
  setTimeout(handleUrlChange, 0);
};

// Debug helper
window.BRA_DEBUG = {
  getDetectionResult: () => detectionResult,
  getPageReadinessState: () => pageReadinessState,
  forceDetection: () => {
    console.log('[BRA DEBUG] Force detection triggered');
    pageReadinessDetector.forceReady();
    return detectionResult;
  },
  getState: () => ({
    detectionResult,
    detectionAttempts,
    pageReadinessState,
    modules: {
      URLDetector: !!URLDetector,
      FieldDetector: !!FieldDetector
    }
  })
};

console.log('[BRA Content] Debug helper available: window.BRA_DEBUG');