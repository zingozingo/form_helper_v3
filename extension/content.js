/**
 * Business Registration Assistant - Content Script
 * Implementation that detects business registration forms
 */

// Configuration
const DEBUG_MODE = true; // Set to true for verbose logging

// Import modules with proper error handling
let URLDetector = null;
let FieldDetector = null;
let messagingUtils = null;

// Promise to track module loading
let modulesLoadedPromise = null;

// Load modules with reliable non-dynamic approach
modulesLoadedPromise = (async function loadModules() {
  try {
    // Load messaging utilities module
    const messagingUtilsURL = chrome.runtime.getURL('modules/messagingUtils.js');
    const messagingModule = await import(messagingUtilsURL);
    messagingUtils = messagingModule.default || messagingModule.messagingUtils || messagingModule;
    console.log('[BRA] MessagingUtils module loaded successfully');
    
    // Load URL detector module
    const urlDetectorURL = chrome.runtime.getURL('modules/urlDetector.js');
    URLDetector = await import(urlDetectorURL);
    console.log('[BRA] URLDetector module loaded successfully');
    
    // Load field detector module
    const fieldDetectorURL = chrome.runtime.getURL('modules/fieldDetector.js');
    FieldDetector = await import(fieldDetectorURL);
    console.log('[BRA] FieldDetector module loaded successfully');
    
    return true;
  } catch (error) {
    console.error('[BRA] Error loading modules:', error);
    console.error('[BRA] Error details:', {
      message: error.message,
      stack: error.stack,
      messagingUtilsURL: chrome.runtime.getURL('modules/messagingUtils.js'),
      urlDetectorURL: chrome.runtime.getURL('modules/urlDetector.js'),
      fieldDetectorURL: chrome.runtime.getURL('modules/fieldDetector.js')
    });
    // Create fallback implementations if modules fail to load
    if (!messagingUtils) {
      console.log('[BRA] Creating fallback messaging utilities');
      messagingUtils = createFallbackMessagingUtils();
    }
    if (!URLDetector) {
      console.log('[BRA] Creating fallback URLDetector');
      URLDetector = createFallbackURLDetector();
    }
    if (!FieldDetector) {
      console.log('[BRA] Creating fallback FieldDetector');
      FieldDetector = createFallbackFieldDetector();
    }
    return false;
  }
})();

// Fallback implementation for messaging utilities
function createFallbackMessagingUtils() {
  return {
    isContextValid() {
      try {
        return chrome.runtime && chrome.runtime.id;
      } catch (e) {
        return false;
      }
    },
    
    async sendMessage(message, callback) {
      try {
        if (!this.isContextValid()) {
          console.warn('[BRA] Extension context invalid, message not sent');
          if (callback) callback(null);
          return null;
        }
        
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[BRA] Message error:', chrome.runtime.lastError.message);
              if (callback) callback(null);
              resolve(null);
            } else {
              if (callback) callback(response);
              resolve(response);
            }
          });
        });
      } catch (error) {
        console.error('[BRA] Failed to send message:', error);
        if (callback) callback(null);
        return null;
      }
    }
  };
}

// Fallback implementation for URL detector
function createFallbackURLDetector() {
  return {
    default: {
      analyzeUrl: function(url) {
        // Simple implementation that checks for government domains and business keywords
        const isGov = url.includes('.gov') || url.includes('.state.');
        const isBusinessRelated = url.includes('business') || 
                                url.includes('register') ||
                                url.includes('filing');
        return {
          score: isGov && isBusinessRelated ? 80 : 30,
          reasons: ['Using fallback detector']
        };
      },
      identifyStateFromUrl: function(url) {
        // Simple implementation to extract state from URL
        const states = {
          'california': 'CA', 'delaware': 'DE', 'nevada': 'NV', 'florida': 'FL',
          'texas': 'TX', 'newyork': 'NY', 'wyoming': 'WY'
        };
        
        for (const [name, code] of Object.entries(states)) {
          if (url.toLowerCase().includes(name)) {
            return code;
          }
        }
        return null;
      }
    }
  };
}

// Fallback implementation for field detector
function createFallbackFieldDetector() {
  return {
    default: class FallbackFieldDetector {
      constructor(root) {
        this.root = root || document;
        this.fields = [];
      }
      
      detectFields() {
        try {
          console.log('[BRA] Using fallback field detector');
          this.fields = [];
          
          // Simple implementation to detect form fields
          const inputs = this.root.querySelectorAll('input, select, textarea');
          inputs.forEach((element, index) => {
            // Extract basic info for each field
            this.fields.push({
              element: element,
              type: element.type || element.tagName.toLowerCase(),
              name: element.name || '',
              id: element.id || '',
              value: element.value || '',
              index: index
            });
          });
          
          return this.fields;
        } catch (error) {
          console.error('[BRA] Error in fallback field detection:', error);
          return [];
        }
      }
      
      getFields() {
        return this.fields;
      }
      
      classifyFields() {
        // Simple implementation that checks for business-related keywords
        const businessKeywords = ['business', 'company', 'name', 'entity', 'type'];
        
        this.fields.forEach(field => {
          const fieldText = (field.name + ' ' + field.id).toLowerCase();
          
          // Check if field contains business keywords
          const matches = businessKeywords.filter(keyword => fieldText.includes(keyword));
          
          if (matches.length > 0) {
            field.classification = {
              category: 'business',
              confidence: Math.min(matches.length * 25, 100)
            };
          }
        });
        
        return {
          totalFields: this.fields.length,
          classifiedFields: this.fields.filter(f => f.classification).length
        };
      }
    }
  };
}

// Global variables
let detectionResult = null;
let detectionAttempts = 0;
const MAX_DETECTION_ATTEMPTS = 5; // Increased from 3 to allow more retries
const RETRY_DELAY = 2000; // ms
const CONNECTION_RETRY_MAX = 3; // Maximum messaging connection retries
const CONNECTION_RETRY_DELAY = 1000; // ms
let pendingMessageCallbacks = {}; // Track pending message callbacks
let connectionEstablished = false; // Track if we've successfully connected to background
let fallbackDetectionMode = false; // Flag to indicate if we're using fallback detection
let connectionAttempts = 0; // Track connection attempts

// Simple logger
function log(message, data) {
  if (!DEBUG_MODE) return; // Skip logging in production
  
  const prefix = '[BRA]';
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

/**
 * Reports an error to the background script
 * @param {Error} errorParam - The error that occurred
 * @param {string} context - Context where the error occurred
 * @param {boolean} isFatal - Whether the error is fatal and should be shown to the user
 */
function reportError(errorParam, context, isFatal = false) {
  console.error('[BRA] Error in ' + context + ':', errorParam);
  
  // Ensure error is an Error object
  let errorObj;
  if (errorParam instanceof Error) {
    errorObj = errorParam;
  } else {
    errorObj = new Error(String(errorParam));
  }
  
  // Create error object once to reuse
  const errorData = {
    action: 'detectionError',
    error: {
      message: errorObj.message || 'Unknown error',
      stack: errorObj.stack || '',
      context: context,
      isFatal: isFatal,
      timestamp: new Date().toISOString(),
      url: window.location.href
    }
  };
  
  // Try to send message with retries
  sendMessageWithRetry(errorData, function(response) {
    // Success callback - connection established
    connectionEstablished = true;
    log('Error reported successfully');
  }, function() {
    // Error callback after retries failed
    console.error('[BRA] Failed to report error after retries');
    
    // Store locally for fallback UI display
    if (!window.BRA_Errors) {
      window.BRA_Errors = [];
    }
    window.BRA_Errors.push(errorData.error);
    
    // Switch to fallback mode if we keep failing to connect
    if (!fallbackDetectionMode && context !== 'messageSend') {
      fallbackDetectionMode = true;
      log('Switching to fallback detection mode');
    }
  });
}

/**
 * Sends a message with retry capability
 * @param {Object} message - The message to send
 * @param {Function} successCallback - Called on success
 * @param {Function} errorCallback - Called after all retries fail
 * @param {number} retryCount - Current retry attempt
 */
async function sendMessageWithRetry(message, successCallback, errorCallback, retryCount = 0) {
  try {
    // Check if messaging utils is available
    const messaging = messagingUtils || window.messagingUtils;
    
    // Check context validity - handle different possible structures
    let contextValid = true;
    if (messaging && typeof messaging.isContextValid === 'function') {
      contextValid = messaging.isContextValid();
    } else {
      // Fallback context check
      try {
        contextValid = !!(chrome.runtime && chrome.runtime.id);
      } catch (e) {
        contextValid = false;
      }
    }
    
    if (!contextValid) {
      // Context is invalid, don't retry
      log('Extension context is invalid, not sending message');
      if (errorCallback) {
        errorCallback(new Error('Extension context invalidated'));
      }
      return;
    }
    
    // Generate unique ID for this message to track it
    const messageId = Date.now() + Math.random().toString(36).substr(2, 5);
    message.messageId = messageId;
    
    // Store the callbacks
    pendingMessageCallbacks[messageId] = {
      success: successCallback,
      error: errorCallback,
      timestamp: Date.now()
    };
    
    // Send the message using safe messaging or fallback
    let response = null;
    if (messaging && typeof messaging.sendMessage === 'function') {
      response = await messaging.sendMessage(message);
    } else {
      // Fallback to direct Chrome API
      response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (resp) => {
          if (chrome.runtime.lastError) {
            console.warn('[BRA] Message error:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(resp);
          }
        });
      });
    }
    
    if (response === null) {
      // Message failed
      const error = chrome.runtime.lastError || new Error('Message send failed');
      
      // Check if it's a context invalidation error
      if (error.message?.includes('Extension context invalidated') || 
          error.message?.includes('Could not establish connection') ||
          error.message?.includes('The message port closed')) {
        // Don't retry on context invalidation
        log('Extension context invalidated, stopping retries');
        
        // Trigger error callback
        if (errorCallback) {
          errorCallback(error);
        }
        
        // Clean up
        delete pendingMessageCallbacks[messageId];
        return;
      }
      
      // If we have retries left and it's not a context error, try again
      if (retryCount < CONNECTION_RETRY_MAX) {
        log('Message send error, retrying (' + (retryCount + 1) + '/' + CONNECTION_RETRY_MAX + ')');
        
        // Retry with exponential backoff
        setTimeout(function() {
          sendMessageWithRetry(message, successCallback, errorCallback, retryCount + 1);
        }, CONNECTION_RETRY_DELAY * Math.pow(2, retryCount));
      } else {
        // We've exhausted retries
        log('Message send failed after ' + CONNECTION_RETRY_MAX + ' retries');
        
        // Trigger error callback
        if (errorCallback) {
          errorCallback(error);
        }
        
        // Clean up
        delete pendingMessageCallbacks[messageId];
      }
      return;
    }
    
    // Success - call the callback
    if (successCallback) {
      successCallback(response);
    }
    
    // Clean up
    delete pendingMessageCallbacks[messageId];
    
    // Mark that we've established connection at least once
    connectionEstablished = true;
    connectionAttempts = 0;
  } catch (e) {
    // Local error in sending
    if (!e.message?.includes('Extension context invalidated')) {
      console.error('[BRA] Error sending message:', e.message);
    }
    
    // Call error callback
    if (errorCallback) {
      errorCallback(e);
    }
  }
}

/**
 * Initialize detection with multiple loading strategies
 */
function initializeDetection() {
  console.log('[BRA Content] ========== INITIALIZING DETECTION ==========');
  console.log('[BRA Content] URL:', window.location.href);
  console.log('[BRA Content] Document state:', document.readyState);
  log('Initializing content script with improved loading strategy');
  
  // Wait a bit to ensure the module is loaded
  setTimeout(() => {
    console.log('[BRA Content] Starting initial detection attempt');
    console.log('[BRA Content] Document readyState:', document.readyState);
    console.log('[BRA Content] Body exists:', !!document.body);
    console.log('[BRA Content] Forms on page:', document.querySelectorAll('form').length);
    
    // Strategy 1: Try at document_end (set in manifest)
    tryDetection();
    
    // Strategy 2: Wait for load event
    if (document.readyState === 'complete') {
      console.log('[BRA Content] Document already complete, running detection again');
      tryDetection();
    } else {
      window.addEventListener('load', () => {
        console.log('[BRA Content] Window load event fired');
        log('Window load event fired');
        tryDetection();
      });
    }
    
    // Strategy 3: Delayed execution for slow-loading pages
    setTimeout(() => {
      console.log('[BRA Content] Delayed execution triggered (2.5s)');
      log('Delayed execution triggered');
      tryDetection();
    }, 2500);
    
    // Strategy 4: MutationObserver for dynamically loaded content
    setupMutationObserver();
  }, 100);
}

/**
 * Sets up a MutationObserver to detect dynamic content changes
 */
function setupMutationObserver() {
  try {
    // Observe DOM changes for dynamic content loading
    const observer = new MutationObserver((mutations) => {
      try {
        // Look for significant DOM changes that might indicate form loading
        const significantChanges = mutations.some(mutation => {
          try {
            if (!mutation.addedNodes || mutation.addedNodes.length === 0) return false;
            
            return Array.from(mutation.addedNodes).some(node => {
              try {
                // Skip non-element nodes
                if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
                
                // Direct form element
                if (node.tagName === 'FORM') return true;
                
                // Try to find form elements using querySelector
                try {
                  return node.querySelector('form') !== null || 
                         node.querySelector('input') !== null ||
                         node.querySelector('select') !== null ||
                         node.querySelector('textarea') !== null;
                } catch (selectorError) {
                  // Fallback to getElementsByTagName if querySelector fails
                  return node.getElementsByTagName && (
                    node.getElementsByTagName('form').length > 0 ||
                    node.getElementsByTagName('input').length > 0 ||
                    node.getElementsByTagName('select').length > 0 ||
                    node.getElementsByTagName('textarea').length > 0
                  );
                }
              } catch (nodeError) {
                return false; // Skip problematic nodes
              }
            });
          } catch (mutationError) {
            return false; // Skip problematic mutations
          }
        });
        
        if (significantChanges) {
          log('Significant DOM changes detected, triggering detection');
          tryDetection();
          
          // Check if we should disconnect the observer
          if (detectionResult || detectionAttempts >= MAX_DETECTION_ATTEMPTS) {
            observer.disconnect();
            log('MutationObserver disconnected after successful detection or max attempts');
          }
        }
      } catch (observerError) {
        // Handle errors in the observer callback
        reportError(observerError, 'mutationObserverCallback', false);
      }
    });
    
    // Start observing with a configuration
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    // Ensure observer is eventually disconnected
    setTimeout(() => {
      try {
        observer.disconnect();
        log('MutationObserver disconnected after timeout');
      } catch (disconnectError) {
        reportError(disconnectError, 'mutationObserverDisconnect', false);
      }
    }, 30000); // 30 seconds max
  } catch (setupError) {
    // Handle errors in setting up the observer
    reportError(setupError, 'setupMutationObserver', false);
  }
}

/**
 * Try to detect business forms with retry mechanism
 */
async function tryDetection() {
  console.log('[BRA] tryDetection() called');
  
  // Don't skip if called explicitly (allows re-detection on navigation)
  // Only skip if we have a result AND haven't been asked to re-detect
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
      
      // Create a fallback minimal detection result in case messaging fails
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
      
      // Notify background of failed detection with retry
      if (!fallbackDetectionMode) {
        sendMessageWithRetry({
          action: 'detectionFailed',
          attempts: detectionAttempts,
          url: window.location.href
        }, null, function(e) {
          console.error('[BRA] Failed to report detection failure:', e);
        });
      }
      
      // Add a visual indicator directly on the page that detection failed
      if (fallbackDetectionMode) {
        showFallbackIndicator('Detection failed after multiple attempts');
      }
    }
  }
}

/**
 * Shows a minimal visual indicator in fallback mode when messaging fails
 * @param {string} message - Message to display
 */
function showFallbackIndicator(message) {
  try {
    // Only add once
    if (document.getElementById('bra-fallback-indicator')) {
      return;
    }
    
    // Create a floating indicator
    const indicator = document.createElement('div');
    indicator.id = 'bra-fallback-indicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background-color: #f44336;
      color: white;
      padding: 10px 15px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 12px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      z-index: 9999999;
      max-width: 300px;
    `;
    
    // Add icon
    indicator.innerHTML = `
      <div style="display: flex; align-items: center;">
        <div style="margin-right: 10px;">⚠️</div>
        <div>
          <div style="font-weight: bold; margin-bottom: 3px;">Business Registration Assistant</div>
          <div>${message}</div>
          <div style="margin-top: 5px; font-size: 10px;">Click to dismiss</div>
        </div>
      </div>
    `;
    
    // Add click to dismiss
    indicator.addEventListener('click', function() {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });
    
    // Add to document
    document.body.appendChild(indicator);
    
    // Auto-remove after 10 seconds
    setTimeout(function() {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, 10000);
  } catch (e) {
    console.error('[BRA] Failed to show fallback indicator:', e.message);
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
  log('Starting form detection');
  
  try {
    // Get current URL
    const currentUrl = window.location.href;
    
    // Make sure URLDetector is loaded
    if (!URLDetector) {
      console.log('[BRA Content] URLDetector not loaded yet, retrying in 500ms');
      log('Waiting for URLDetector module to load...');
      // Wait a bit and try again
      setTimeout(tryDetection, 500);
      return;
    }
    
    // Analyze different aspects of the page
    // Use the URL detector module for URL analysis
    if (!URLDetector.default || !URLDetector.default.analyzeUrl) {
      throw new Error('URLDetector.default.analyzeUrl is not available');
    }
    const urlAnalysis = await URLDetector.default.analyzeUrl(currentUrl);
    const urlScore = urlAnalysis.score;
    
    // Continue with other analyses
    const contentScore = analyzePageContent();
    const formAnalysis = await analyzeFormElements();
    const formScore = formAnalysis.score;
    const fieldDetectionResults = formAnalysis.fieldDetectionResults;
    const classificationStats = formAnalysis.classificationStats;
    
    // Add dynamic loading adjustment - check if page is still loading resources
    let dynamicLoadingScore = 0;
    
    // Check for loading indicators or spinners with more reliable selectors
    let loadingIndicators = [];
    try {
      // First try with explicit class names (more reliable)
      const explicitLoadingElements = document.querySelectorAll(
        '.loading, .spinner, .loader, .progress, [role="progressbar"], .wait, .processing'
      );
      
      // Then look for elements with common loading-related classes
      // Safe approach that avoids wildcards
      const allElements = document.querySelectorAll('*');
      const wildcardMatches = Array.from(allElements).filter(el => {
        if (!el.className || typeof el.className !== 'string') return false;
        
        const classNames = el.className.toLowerCase();
        return classNames.includes('loading') || 
               classNames.includes('spinner') ||
               classNames.includes('progress') || 
               classNames.includes('wait') || 
               classNames.includes('processing');
      });
      
      // Combine both sets of elements
      loadingIndicators = [...Array.from(explicitLoadingElements), ...wildcardMatches];
    } catch (error) {
      reportError(error, 'loadingIndicatorDetection', false);
      // Fallback to simpler selector
      loadingIndicators = document.querySelectorAll('.loading, .spinner, .loader, .progress');
    }
    
    // If loading indicators are visible, add to dynamic loading score
    if (loadingIndicators.length > 0) {
      const visibleLoadingIndicators = Array.from(loadingIndicators).filter(el => {
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
      });
      
      if (visibleLoadingIndicators.length > 0) {
        dynamicLoadingScore = 10;
        log('Detected visible loading indicators, adding dynamic loading score');
      }
    }
    
    // Check for new script loading or AJAX activity
    const newScriptLoading = document.querySelectorAll('script[async], script[defer]').length > 0;
    if (newScriptLoading) {
      dynamicLoadingScore += 5;
      log('Detected async/defer scripts, adding to dynamic loading score');
    }
    
    // Adjust form score if we suspect dynamic loading is still in progress
    const adjustedFormScore = formScore + dynamicLoadingScore;
    
    // Calculate user feedback data - track prior detections for learning
    const priorDetections = window.localStorage.getItem('BRA_PriorDetections');
    let adaptiveScore = 0;
    let adaptiveConfidence = false;
    
    // Helper function to extract URL pattern for similarity matching
    function extractUrlPattern(url) {
      try {
        const urlObj = new URL(url);
        // Extract domain and first path segment
        return urlObj.hostname + urlObj.pathname.split('/').slice(0, 2).join('/');
      } catch (e) {
        return url.split('/').slice(0, 3).join('/');
      }
    }
    
    if (priorDetections) {
      try {
        const detections = JSON.parse(priorDetections);
        const urlPattern = extractUrlPattern(currentUrl);
        
        // Check if we have prior detections for this URL pattern
        const matchingDetections = detections.filter(d => 
          d.urlPattern === urlPattern || currentUrl.includes(d.urlRoot)
        );
        
        if (matchingDetections.length > 0) {
          // Calculate average success rate for this URL pattern
          const successRate = matchingDetections.reduce(
            (sum, d) => sum + (d.userConfirmed ? 1 : 0), 0
          ) / matchingDetections.length;
          
          // Add adaptive score based on past success rate
          adaptiveScore = Math.round(successRate * 15); // Up to 15 points from learning
          
          // Strong prior confirmation can override threshold
          if (successRate > 0.8 && matchingDetections.length >= 3) {
            adaptiveConfidence = true;
          }
          
          log('Applied adaptive scoring based on user feedback:', adaptiveScore);
        }
      } catch (e) {
        // Ignore errors in adaptive learning
        log('Error in adaptive scoring:', e.message);
      }
    }
    
    // Enhanced confidence scoring with breakdown
    const confidenceDetails = {
      domain: 0,
      urlPattern: 0,
      formFields: 0,
      stateIdentification: 0,
      fieldClassification: 0,
      businessTerminology: 0,
      adaptive: adaptiveScore
    };
    
    // Domain scoring (15-20 points)
    if (urlAnalysis.details && urlAnalysis.details.isGovernment) {
      confidenceDetails.domain = 15;
      if (currentUrl.includes('.gov')) {
        confidenceDetails.domain += 5; // Strong .gov domain
      }
    }
    
    // URL pattern matching (10-15 points)
    if (urlAnalysis.details && urlAnalysis.details.businessTerms && urlAnalysis.details.businessTerms.length > 0) {
      confidenceDetails.urlPattern = Math.min(10 + urlAnalysis.details.businessTerms.length * 2, 15);
    }
    
    // Form field scoring (15-20 points)
    if (adjustedFormScore > 0) {
      // Scale form score to our range
      confidenceDetails.formFields = Math.min(Math.round(adjustedFormScore * 0.2), 20);
    }
    
    // State identification (10-15 points)
    let state = null;
    if (URLDetector.default && URLDetector.default.identifyStateFromUrl) {
      state = URLDetector.default.identifyStateFromUrl(currentUrl);
    }
    if (!state) {
      state = identifyStateFromContent();
    }
    if (state) {
      confidenceDetails.stateIdentification = 10;
      if (urlAnalysis.state === state) {
        confidenceDetails.stateIdentification += 5; // URL and content agree on state
      }
      
      // DC-specific bonus
      if (state === 'DC') {
        console.log('[BRA Content] ========== DC-SPECIFIC DETECTION ==========');
        console.log('[BRA Content] Current URL:', currentUrl);
        
        // Check for DC-specific indicators
        const dcIndicators = [
          currentUrl.includes('mytax.dc.gov'),
          currentUrl.includes('mybusiness.dc.gov'),
          currentUrl.includes('dlcp.dc.gov'),
          currentUrl.includes('dcra.dc.gov'),
          document.body.textContent.includes('District of Columbia'),
          document.body.textContent.includes('DCRA'),
          document.body.textContent.includes('Clean Hands'),
          document.body.textContent.includes('DC Government'),
          document.body.textContent.includes('FR-500')
        ];
        
        console.log('[BRA Content] DC Indicators checked:');
        dcIndicators.forEach((indicator, index) => {
          console.log(`[BRA Content]   ${index}: ${indicator}`);
        });
        
        const dcMatches = dcIndicators.filter(Boolean).length;
        console.log('[BRA Content] DC matches found:', dcMatches);
        
        if (dcMatches >= 2) {
          confidenceDetails.stateIdentification = 15; // Max points for strong DC match
          log('[BRA] Strong DC indicators found:', dcMatches);
          
          // Additional bonus for DC business registration specific URLs
          if (currentUrl.includes('mytax.dc.gov') || currentUrl.includes('mybusiness.dc.gov') || currentUrl.includes('dlcp.dc.gov')) {
            confidenceDetails.domain += 5; // Extra domain bonus for known DC business sites
            confidenceDetails.businessTerminology += 5; // Implicit business context
            console.log('[BRA Content] DC business registration site detected, adding bonus points');
            console.log('[BRA Content] Domain bonus: +5, Business terminology bonus: +5');
          }
        }
        console.log('[BRA Content] ============================================');
      }
    }
    
    // Field classification scoring (10-20 points)
    // This will be updated after field detection
    confidenceDetails.fieldClassification = 0;
    
    // Business terminology (10-15 points)
    const businessTermCount = (document.body.textContent.match(/business|entity|corporation|llc|formation|registration|ein|tax.*id/gi) || []).length;
    if (businessTermCount > 0) {
      confidenceDetails.businessTerminology = Math.min(10 + Math.floor(businessTermCount / 5), 15);
    }
    
    // Calculate total with new scoring
    const totalScore = Object.values(confidenceDetails).reduce((sum, score) => sum + score, 0);
    let confidenceScore = Math.min(totalScore, 100);
    
    // Log confidence breakdown
    const breakdown = Object.entries(confidenceDetails)
      .filter(([_, score]) => score > 0)
      .map(([category, score]) => `${category}(${score})`)
      .join(' + ');
    
    log(`Confidence: ${breakdown} = ${confidenceScore}%`);
    
    // Business form detection based on current confidence
    // This will be refined after field detection if available
    let isBusinessForm = confidenceScore >= 40 || adaptiveConfidence;
    
    console.log('[BRA Content] ========== INITIAL DETECTION DECISION ==========');
    console.log('[BRA Content] Confidence Score:', confidenceScore);
    console.log('[BRA Content] Threshold:', 40);
    console.log('[BRA Content] Adaptive Confidence:', adaptiveConfidence);
    console.log('[BRA Content] Is Business Form:', isBusinessForm);
    console.log('[BRA Content] URL:', currentUrl);
    console.log('[BRA Content] ================================================');
    
    // State already detected above, no need to redeclare
    
    // Identify form type more specifically
    let formType = 'general'; // Default
    let specificFormDetails = {};
    
    // Try to determine more specific form type based on content and URL
    if (isBusinessForm) {
      // Analyze for formation vs. compliance forms
      const formationTerms = ['formation', 'organize', 'start', 'create', 'new', 'articles of'];
      const complianceTerms = ['annual', 'biennial', 'report', 'renewal', 'compliance', 'update'];
      const taxRegistrationTerms = ['tax', 'ein', 'employer id', 'sales tax', 'revenue'];
      const foreignQualificationTerms = ['foreign', 'qualification', 'out-of-state', 'another state'];
      
      const pageText = document.body.textContent.toLowerCase();
      
      // Check for formation/creation forms
      const isFormation = formationTerms.some(term => 
        pageText.includes(term) || currentUrl.includes(term)
      );
      
      // Check for compliance/reporting forms
      const isCompliance = complianceTerms.some(term => 
        pageText.includes(term) || currentUrl.includes(term)
      );
      
      // Check for tax registration forms
      const isTaxRegistration = taxRegistrationTerms.some(term => 
        pageText.includes(term) || currentUrl.includes(term)
      );
      
      // Check for foreign qualification forms
      const isForeignQualification = foreignQualificationTerms.some(term => 
        pageText.includes(term) || currentUrl.includes(term)
      );
      
      // Determine most likely specific form type
      if (isTaxRegistration) {
        formType = 'tax_registration';
        
        // Look for specific tax type
        if (pageText.includes('sales tax')) {
          specificFormDetails.taxType = 'sales_tax';
        } else if (pageText.includes('income tax')) {
          specificFormDetails.taxType = 'income_tax';
        } else if (pageText.includes('withholding')) {
          specificFormDetails.taxType = 'withholding_tax';
        } else if (pageText.includes('ein') || pageText.includes('employer identification')) {
          specificFormDetails.taxType = 'ein_application';
        }
      } else if (isForeignQualification) {
        formType = 'foreign_qualification';
      } else if (isCompliance) {
        formType = 'compliance_filing';
        
        // Look for specific compliance filing type
        if (pageText.includes('annual report')) {
          specificFormDetails.complianceType = 'annual_report';
        } else if (pageText.includes('statement of information')) {
          specificFormDetails.complianceType = 'statement_of_information';
        }
      } else if (isFormation) {
        formType = 'entity_formation';
        
        // Determine entity type being formed
        const entityTypeTerms = [
          {term: 'llc', type: 'llc'},
          {term: 'limited liability company', type: 'llc'},
          {term: 'corporation', type: 'corporation'},
          {term: 'incorporated', type: 'corporation'},
          {term: 'partnership', type: 'partnership'},
          {term: 'limited partnership', type: 'limited_partnership'},
          {term: 'nonprofit', type: 'nonprofit'},
          {term: 'sole proprietor', type: 'sole_proprietorship'}
        ];
        
        for (const {term, type} of entityTypeTerms) {
          if (pageText.includes(term)) {
            specificFormDetails.entityType = type;
            break;
          }
        }
      }
    }
    
    // Check for form steps or multi-page flow  
    const isMultiStep = document.querySelectorAll('.step, .wizard-step, .form-step, [role="progressbar"]').length > 0;
    const hasProgress = document.querySelectorAll('.progress, .progress-bar, [role="progressbar"]').length > 0;
    
    // Fixed selector to find next buttons with standard DOM methods
    let nextButtons = false;
    try {
      // First get standard button elements that might be next/continue buttons
      const buttonElements = document.querySelectorAll('button, input[type="button"], a.button, .btn, .btn-next, .next-button');
      
      // Then filter by examining their text content
      nextButtons = Array.from(buttonElements).some(button => {
        const buttonText = (button.textContent || button.value || '').toLowerCase();
        return buttonText.includes('next') || buttonText.includes('continue') || 
               buttonText.includes('proceed') || buttonText.includes('forward');
      });
    } catch (error) {
      reportError(error, 'nextButtonDetection', false);
      // Fallback to a simpler detection mechanism
      nextButtons = document.querySelectorAll('.btn-next, .next-button').length > 0;
    }
    
    const formStructure = {
      isMultiStep: isMultiStep || nextButtons,
      hasProgress: hasProgress,
      estimatedSteps: isMultiStep ? document.querySelectorAll('.step, .wizard-step, .form-step').length : 1
    };
    
    // Store URL pattern for learning
    const urlPattern = extractUrlPattern(currentUrl);
    const urlRoot = new URL(currentUrl).origin;
    
    // Update field classification score based on detected fields
    if (fieldDetectionResults && classificationStats) {
      const classifiedRatio = classificationStats.classified / Math.max(classificationStats.total, 1);
      const avgConfidence = classificationStats.avgConfidence || 0;
      
      // Base score on classification rate (0-10 points)
      confidenceDetails.fieldClassification = Math.round(classifiedRatio * 10);
      
      // Bonus for high confidence classifications (0-10 points)
      if (avgConfidence >= 80) {
        confidenceDetails.fieldClassification += 10;
      } else if (avgConfidence >= 70) {
        confidenceDetails.fieldClassification += 5;
      }
      
      // Additional bonus for business-specific fields detected
      const businessCategories = ['business_name', 'entity_type', 'ein', 'tax_id', 'business_address', 'dba'];
      const detectedBusinessCategories = Object.keys(classificationStats.byCategory || {})
        .filter(cat => businessCategories.includes(cat));
      
      if (detectedBusinessCategories.length >= 3) {
        confidenceDetails.fieldClassification += 5; // Strong business form indicator
      } else if (detectedBusinessCategories.length >= 2) {
        confidenceDetails.fieldClassification += 3;
      }
      
      // Cap at 25 points (increased to reflect importance of field detection)
      confidenceDetails.fieldClassification = Math.min(confidenceDetails.fieldClassification, 25);
      
      // Recalculate total score with field classification
      const updatedTotalScore = Object.values(confidenceDetails).reduce((sum, score) => sum + score, 0);
      confidenceScore = Math.min(updatedTotalScore, 100);
      
      // Log updated confidence
      log(`Field classification added ${confidenceDetails.fieldClassification} points`);
      log(`Updated confidence: ${confidenceScore}%`);
      
      // Business form detection logic with multiple criteria
      // Lower threshold if we have strong field detection results
      const hasStrongFieldDetection = classifiedRatio >= 0.5 && avgConfidence >= 70;
      const hasBusinessFields = detectedBusinessCategories.length >= 2;
      const hasGoodUrlScore = urlScore >= 60;
      const hasFormElements = formScore >= 30;
      
      // Business form detection rules:
      // 1. High confidence score (>= 50%)
      // 2. OR strong field detection with business fields
      // 3. OR good URL score with form elements and some business fields
      // 4. OR adaptive confidence from user feedback
      // 5. OR already detected as business form (don't downgrade)
      // 6. OR detected state with classified fields (strong signal)
      // 7. OR DC mytax.dc.gov with form elements (special case for FR-500)
      const isDCTaxSite = currentUrl.includes('mytax.dc.gov') && state === 'DC';
      
      isBusinessForm = isBusinessForm || (
        confidenceScore >= 50 || 
        (hasStrongFieldDetection && hasBusinessFields) ||
        (hasGoodUrlScore && hasFormElements && detectedBusinessCategories.length >= 1) ||
        (state && classificationStats.classified >= 5) || // State + 5+ classified fields
        (isDCTaxSite && hasFormElements) || // Special DC tax site detection
        adaptiveConfidence
      );
      
      // Log the detailed decision
      console.log('[BRA Content] Business form detection decision:', {
        confidenceScore: confidenceScore,
        threshold: 50,
        hasStrongFieldDetection: hasStrongFieldDetection,
        hasBusinessFields: hasBusinessFields,
        businessFieldsCount: detectedBusinessCategories.length,
        businessFieldsDetected: detectedBusinessCategories,
        hasGoodUrlScore: hasGoodUrlScore,
        hasFormElements: hasFormElements,
        adaptiveConfidence: adaptiveConfidence,
        isBusinessForm: isBusinessForm
      });
    } else {
      // No field detection results - use basic threshold
      isBusinessForm = confidenceScore >= 40 || adaptiveConfidence;
      
      console.log('[BRA Content] Business form detection decision (no field data):', {
        confidenceScore: confidenceScore,
        threshold: 40,
        adaptiveConfidence: adaptiveConfidence,
        isBusinessForm: isBusinessForm
      });
    }
    
    // Log comprehensive field detection summary if available
    if (fieldDetectionResults && fieldDetectionResults.uiData && DEBUG_MODE) {
      console.log('%c[BRA] UI-Ready Field Data Structure:', 'color: green; font-weight: bold');
      console.log('Categories:', fieldDetectionResults.uiData.categories);
      console.log('Total fields:', fieldDetectionResults.uiData.totalFields);
      console.log('Classified fields:', fieldDetectionResults.uiData.classifiedFields);
      
      // Log sample auto-fill mapping
      if (fieldDetectionResults.fields.length > 0) {
        console.log('%c[BRA] Sample Auto-Fill Mapping:', 'color: purple; font-weight: bold');
        const sampleMapping = {};
        fieldDetectionResults.fields.slice(0, 5).forEach(field => {
          if (field.classification) {
            sampleMapping[field.classification.category] = {
              element: field.element,
              label: field.label?.text || field.name,
              confidence: field.classification.confidence
            };
          }
        });
        console.table(sampleMapping);
      }
    }
    
    // Store detection result globally
    console.log('[BRA Content] ========== FINAL DETECTION RESULT ==========');
    console.log('[BRA Content] Is Business Form:', isBusinessForm);
    console.log('[BRA Content] Final Confidence Score:', confidenceScore);
    console.log('[BRA Content] State:', state);
    console.log('[BRA Content] Form Type:', formType);
    console.log('[BRA Content] Field Detection Available:', !!fieldDetectionResults);
    console.log('[BRA Content] Fields Detected:', fieldDetectionResults?.fields?.length || 0);
    console.log('[BRA Content] =============================================');
    
    // Create detection result with enhanced information
    detectionResult = {
      isBusinessRegistrationForm: isBusinessForm,
      confidenceScore: confidenceScore,
      confidenceBreakdown: confidenceDetails,
      state: state,
      url: currentUrl,
      urlPattern: urlPattern,
      urlRoot: urlRoot,
      formType: formType,
      specificFormDetails: specificFormDetails,
      formStructure: formStructure,
      adaptiveConfidence: adaptiveConfidence,
      fieldDetection: fieldDetectionResults,
      fieldClassifications: classificationStats,
      details: {
        urlScore,
        contentScore,
        formScore,
        adjustedFormScore,
        dynamicLoadingScore,
        adaptiveScore,
        urlAnalysisReasons: urlAnalysis.reasons,
        detectionAttempts: detectionAttempts,
        timestamp: new Date().toISOString(),
        documentReady: document.readyState,
        hybridPatterns: true
      }
    };
    
    log('Detection result:', detectionResult);
    
    // Log the detection result before sending
    console.log('[BRA Content] Sending detection result to background:', {
      isBusinessForm: detectionResult.isBusinessRegistrationForm,
      confidence: detectionResult.confidenceScore,
      state: detectionResult.state
    });
    
    // Send to background script with error handling
    chrome.runtime.sendMessage({
      action: 'formDetected',
      result: detectionResult
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[BRA Content] Failed to send to background:', chrome.runtime.lastError);
        reportError(new Error(chrome.runtime.lastError.message), 'sendingDetectionResult', true);
      } else {
        console.log('[BRA Content] Successfully sent to background, response:', response);
      }
    });
    
    // Also send updateDetection message with the actual calculated confidence score and field data
    console.log('[BRA Content] Sending updateDetection with actual confidence score:', confidenceScore);
    chrome.runtime.sendMessage({
      type: 'updateDetection',
      isDetected: isBusinessForm,
      state: state || 'DC',
      confidence: confidenceScore,  // Use the actual calculated confidence score
      readinessScore: fieldDetectionResults?.readinessScore,
      validationScore: fieldDetectionResults?.validationScore,
      fields: classificationStats?.classified || 0,
      fieldData: fieldDetectionResults?.fields || [],  // Include actual field data
      uiData: fieldDetectionResults?.uiData || null    // Include UI-ready data
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[BRA Content] Error sending updateDetection with actual confidence:', chrome.runtime.lastError);
      } else {
        console.log('[BRA Content] updateDetection sent with actual confidence score');
      }
    });
  } catch (error) {
    reportError(error, 'detectBusinessForm', detectionAttempts >= MAX_DETECTION_ATTEMPTS);
    throw error; // Re-throw to trigger retry mechanism
  }
}

/**
 * Analyze page content for business registration keywords
 */
function analyzePageContent() {
  try {
    let score = 0;
    
    // Check if document.body exists
    if (!document.body) {
      log('Document body not available yet, returning partial content score');
      return 0;
    }
    
    // Get page text
    const pageText = document.body.textContent.toLowerCase();
    
    // Entity type terms - organized by category for better maintainability
    const entityTypes = {
      llc: [
        'llc', 'limited liability company', 'limited liability corporation',
        'l.l.c.', 'professional llc', 'pllc', 'series llc', 
        'member-managed llc', 'manager-managed llc'
      ],
      corporations: [
        'corporation', 'incorporated', 'inc', 'inc.', 'corp', 'corp.',
        'c-corporation', 'c corp', 'c-corp', 's-corporation', 's corp', 's-corp',
        'close corporation', 'professional corporation', 'pc', 'p.c.',
        'benefit corporation', 'b-corp', 'public benefit corporation', 'pbc',
        'statutory close corporation'
      ],
      partnerships: [
        'partnership', 'general partnership', 'limited partnership', 'lp', 'l.p.',
        'limited liability partnership', 'llp', 'l.l.p.', 
        'limited liability limited partnership', 'lllp', 'l.l.l.p.',
        'family limited partnership', 'flp'
      ],
      nonprofits: [
        'nonprofit', 'non-profit', 'not for profit', 'not-for-profit', '501c3',
        'nonprofit corporation', 'charitable organization', 'foundation',
        'public charity', 'private foundation'
      ],
      otherEntities: [
        'sole proprietorship', 'sole proprietor', 'doing business as', 'dba', 'd/b/a',
        'fictitious name', 'trade name', 'assumed name', 
        'cooperative', 'co-op', 'professional association', 'pa',
        'joint venture', 'business trust', 'statutory trust'
      ]
    };
    
    // Flatten entity types into a single array
    const entityTerms = [].concat(...Object.values(entityTypes).map(terms => terms));
    
    // Check for entity type terms - more points for exact matches
    entityTerms.forEach(term => {
      // More points for whole word matches
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(pageText)) {
        score += 5;
        // Extra points for key entity types in title or heading elements
        const inTitle = document.title.toLowerCase().match(regex);
        const inHeadings = Array.from(document.querySelectorAll('h1, h2, h3'))
          .some(h => h.textContent.toLowerCase().match(regex));
        
        if (inTitle) score += 2;
        if (inHeadings) score += 3;
      } else if (pageText.includes(term)) {
        // Partial match
        score += 2;
      }
    });
    
    // Registration and formation terms
    const registrationTerms = [
      // Basic registration terms
      'business registration', 'register a business', 'register your business',
      'business license', 'business permit', 'business filing',
      'new business', 'start a business', 'starting a business',
      // DC-specific forms
      'fr-500', 'fr500', 'combined business tax registration',
      'business tax registration', 'register business', 'business entity',
      
      // Formation documents
      'articles of organization', 'articles of incorporation', 'articles of formation',
      'certificate of formation', 'certificate of organization', 'certificate of incorporation',
      'operating agreement', 'bylaws', 'corporate bylaws',
      'formation document', 'company formation', 'entity formation',
      'business formation', 'incorporate', 'incorporation',
      
      // Administrative filings
      'annual report', 'biennial report', 'statement of information',
      'foreign qualification', 'certificate of authority', 'certificate of good standing',
      'statement of foreign qualification', 'foreign entity registration',
      'registered agent', 'statutory agent', 'agent for service of process',
      
      // Business identifiers
      'ein', 'employer identification number', 'federal tax id', 'tax id number',
      'business tax id', 'fein', 'federal employer identification number',
      'sales tax permit', 'sales tax certificate', 'reseller permit',
      'business tax registration', 'withholding tax registration',
      
      // Process terms
      'file a', 'submit a', 'apply for', 'application for', 
      'form a', 'create a', 'establish a', 'organize a',
      'registration form', 'filing fee', 'filing period', 'filing requirements',
      'submit online', 'file online', 'electronic filing', 'e-file',
      
      // Special event and vendor registration terms
      'special event registration', 'event permit', 'vendor registration',
      'temporary business', 'special event license', 'vendor permit',
      'festival vendor', 'market vendor', 'fair vendor', 'event vendor',
      'temporary permit', 'one-time permit', 'short-term permit',
      'booth registration', 'vendor application', 'exhibitor registration',
      'special event application', 'temporary vendor', 'mobile vendor'
    ];
    
    // Check for registration terms - with proximity bonus
    registrationTerms.forEach(term => {
      if (pageText.includes(term)) {
        score += 7;
        
        // Check for registration term + entity type nearby (proximity check)
        for (const entityType in entityTypes) {
          for (const entityTerm of entityTypes[entityType]) {
            // Phrases like "register an LLC" or "form a corporation" get extra points
            const phrase1 = term + ' ' + entityTerm;
            const phrase2 = term + ' a ' + entityTerm;
            const phrase3 = term + ' an ' + entityTerm;
            
            if (pageText.includes(phrase1) || 
                pageText.includes(phrase2) || 
                pageText.includes(phrase3)) {
              score += 15; // Strong signal when both terms appear together
              break;
            }
          }
        }
      }
    });
    
    // Check for government terms indicating official registration
    const governmentTerms = [
      'secretary of state', 'department of state', 'division of corporations',
      'business registrations division', 'corporations division',
      'department of revenue', 'revenue department', 'tax department',
      'state filing', 'official business registry', 'business entities database',
      'business records service'
    ];
    
    governmentTerms.forEach(term => {
      if (pageText.includes(term)) {
        score += 10; // Government terms are strong indicators
      }
    });
    
    // Check for common registration-related heading text
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
      const headingText = heading.textContent.toLowerCase();
      
      // Registration-related headings
      const registrationHeadingPatterns = [
        // Registration + entity patterns
        { pattern: /register.{0,10}(business|entity|llc|corporation|company)/i, points: 15 },
        { pattern: /form.{0,5}(an?|your).{0,5}(llc|corporation|business|company)/i, points: 15 },
        { pattern: /start.{0,5}(an?|your).{0,5}(business|company|llc|corporation)/i, points: 15 },
        { pattern: /creat.{0,5}(an?|your).{0,5}(business|company|llc|corporation)/i, points: 15 },
        
        // Form and filing patterns
        { pattern: /(business|entity).{0,10}registration/i, points: 15 },
        { pattern: /(online|electronic).{0,5}filing/i, points: 10 },
        { pattern: /articles of (organization|incorporation)/i, points: 15 },
        { pattern: /certificate of (formation|organization)/i, points: 15 },
        
        // Business license patterns
        { pattern: /business.{0,5}licens/i, points: 10 },
        { pattern: /file.{0,10}licens/i, points: 10 },
        
        // Tax registration patterns
        { pattern: /tax.{0,10}registration/i, points: 10 },
        { pattern: /employer.{0,10}identification/i, points: 10 },
        { pattern: /business.{0,10}tax/i, points: 10 },
        
        // DC-specific form patterns
        { pattern: /fr.?500/i, points: 20 },
        { pattern: /combined.{0,10}business.{0,10}tax/i, points: 15 }
      ];
      
      // Check heading text against patterns
      for (const { pattern, points } of registrationHeadingPatterns) {
        if (pattern.test(headingText)) {
          score += points;
          break; // Don't double count matches from the same heading
        }
      }
    });
    
    // Title analysis
    const titleText = document.title.toLowerCase();
    const titlePatterns = [
      { pattern: /(register|form|create|start).{0,10}(business|llc|corporation)/i, points: 20 },
      { pattern: /(business|entity|llc).{0,10}registration/i, points: 20 },
      { pattern: /(file|submit).{0,10}(application|registration)/i, points: 15 },
      { pattern: /(articles|certificate).{0,10}(organization|incorporation|formation)/i, points: 15 }
    ];
    
    for (const { pattern, points } of titlePatterns) {
      if (pattern.test(titleText)) {
        score += points;
      }
    }
    
    // Meta tag analysis for "business registration" keywords
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      const metaText = metaDescription.getAttribute('content').toLowerCase();
      if (/business|registration|entity|incorporation|llc|corporation/.test(metaText)) {
        score += 10;
      }
    }
    
    // Return final capped score
    return Math.min(score, 100);
  } catch (error) {
    reportError(error, 'analyzePageContent');
    return 0; // Return 0 score if analysis fails
  }
}

/**
 * Analyze form elements for registration patterns
 */
async function analyzeFormElements() {
  try {
    let score = 0;
    let diagnosticInfo = {}; // Store detailed analysis for debugging
    
    // Check if document.body exists
    if (!document.body) {
      log('Document body not available yet, returning partial form score');
      return 0;
    }
    
    // Use FieldDetector module to analyze form fields if available
    let fieldDetectionResults = null;
    let classificationStats = null;
    
    console.log('[BRA Content] ========== FIELD DETECTION ANALYSIS ==========');
    console.log('[BRA Content] FieldDetector module available:', !!FieldDetector);
    console.log('[BRA Content] FieldDetector.default available:', !!(FieldDetector && FieldDetector.default));
    
    if (FieldDetector && FieldDetector.default) {
      try {
        log('Using FieldDetector module to analyze form fields');
        
        // Get state from URL if available
        const currentUrl = window.location.href;
        const state = URLDetector?.default?.identifyStateFromUrl(currentUrl) || null;
        console.log('[BRA Content] State from URL:', state);
        
        // Create a field detector instance with state context
        const detector = new FieldDetector.default(document, { 
          state: state,
          debug: DEBUG_MODE, // Enable debug mode if DEBUG_MODE is true
          // Add message handler to pass messages through content script
          onDetectionComplete: function(detectionData) {
            console.log('[BRA Content] Field detection complete, sending updateDetection message:', detectionData);
            
            // Update fieldDetectionResults with detector data
            if (fieldDetectionResults) {
              fieldDetectionResults.readinessScore = detectionData.readinessScore;
              fieldDetectionResults.validationScore = detectionData.validationScore;
            }
            
            // Use the actual confidence score from the main detection result if available
            const actualConfidence = detectionResult && detectionResult.confidenceScore ? 
              detectionResult.confidenceScore : 
              (detectionData.confidence || detectionData.readinessScore || 60);
            
            // Don't send updateDetection from here - wait for the main detection to complete
            // This callback runs too early, before isBusinessForm is calculated
            console.log('[BRA Content] Field detection complete, will send update after main detection');
          }
        });
        
        // Detect all form fields with comprehensive logging
        console.log('%c[BRA] Starting comprehensive field detection...', 'color: blue; font-weight: bold');
        const fields = await detector.detectFields();
        log(`FieldDetector found ${fields.length} form fields`);
        
        // Get UI-ready data structure
        const uiData = detector.getUIData();
        
        // Use the detailed classification summary from detector
        classificationStats = uiData.summary;
        
        log('Field classification results:', classificationStats);
        
        // Store the field detection results for later use
        fieldDetectionResults = {
          isDetected: true,
          confidence: classificationStats.avgConfidence,
          readinessScore: null,  // Will be set by detector callback
          validationScore: null,  // Will be set by detector callback
          fields: fields,
          stats: classificationStats,
          uiData: uiData
        };
        
        // Store diagnostic info
        diagnosticInfo.fieldDetector = {
          fieldsDetected: fields.length,
          classifiedFields: classificationStats.classified,
          categories: classificationStats.byCategory,
          avgConfidence: classificationStats.avgConfidence
        };
        
        // Add score based on field detection
        if (fields.length > 0) {
          // Base points for finding fields
          score += Math.min(fields.length * 2, 20);
          
          // More points if we could classify fields
          if (classificationStats.classified > 0) {
            // Additional points based on percentage of fields classified
            const classificationRate = classificationStats.classified / fields.length;
            score += Math.round(classificationRate * 20);
            
            // Additional points for business-related field categories
            const businessCategories = ['business_name', 'entity_type', 'ein', 'tax_id', 'business_address'];
            let businessCategoryCount = 0;
            
            for (const category in classificationStats.byCategory) {
              if (businessCategories.includes(category)) {
                businessCategoryCount++;
                // Bonus points for critical business categories
                score += 10;
              }
            }
            
            // Very strong signal if multiple business categories are present
            if (businessCategoryCount >= 3) {
              score += 20;
            }
            
            // Bonus for high average confidence
            if (classificationStats.avgConfidence >= 80) {
              score += 10;
            }
          }
        }
      } catch (detectorError) {
        log('Error using FieldDetector:', detectorError.message);
        reportError(detectorError, 'fieldDetector', false);
        // Continue with fallback form analysis
      }
    }
    
    // Traditional form analysis as backup or supplement
    // Look for forms and interactive elements
    const forms = document.querySelectorAll('form');
    const formCount = forms.length;
    
    console.log('[BRA Content] ========== FORM ELEMENT ANALYSIS ==========');
    console.log('[BRA Content] Forms found:', formCount);
    console.log('[BRA Content] All inputs/selects/textareas:', document.querySelectorAll('input, select, textarea').length);
    console.log('[BRA Content] Text inputs:', document.querySelectorAll('input[type="text"]').length);
    console.log('[BRA Content] Select elements:', document.querySelectorAll('select').length);
    console.log('[BRA Content] Submit buttons:', document.querySelectorAll('button[type="submit"], input[type="submit"]').length);
    console.log('[BRA Content] Iframes on page:', document.querySelectorAll('iframe').length);
    console.log('[BRA Content] Is this page in an iframe?:', window !== window.top);
    
    // Store diagnostic information
    diagnosticInfo.formCount = formCount;
    
    // Multi-step form detection - look for indicators of a step-based form
    const stepIndicators = document.querySelectorAll('.step, .wizard-step, .form-step, [role="progressbar"]');
    const hasStepIndicators = stepIndicators.length > 0;
    
    // Check for multi-page forms with next/previous buttons
    let nextButtons = [];
    let prevButtons = [];
    
    try {
      // Get potential button elements and filter by text content
      nextButtons = Array.from(document.querySelectorAll('button, input[type="button"], a.button, .btn, [class*="next"], [class*="continue"]'))
        .filter(el => {
          try {
            const text = (el.textContent || el.value || '').toLowerCase();
            return text.includes('next') || text.includes('continue') || 
                  text.includes('proceed') || text.includes('forward');
          } catch (error) {
            return false; // Skip this element if there's an error
          }
        });
      
      prevButtons = Array.from(document.querySelectorAll('button, input[type="button"], a.button, .btn, [class*="prev"], [class*="back"]'))
        .filter(el => {
          try {
            const text = (el.textContent || el.value || '').toLowerCase();
            return text.includes('previous') || text.includes('back') || 
                  text.includes('return') || text.includes('prior');
          } catch (error) {
            return false; // Skip this element if there's an error
          }
        });
    } catch (error) {
      reportError(error, 'navigationButtonDetection', false);
      // Fallback to class-based detection
      nextButtons = Array.from(document.querySelectorAll('.btn-next, .next-button, .continue, [class*="next"]'));
      prevButtons = Array.from(document.querySelectorAll('.btn-prev, .prev-button, .back, [class*="prev"], [class*="back"]'));
    }
    
    const hasNextPrevButtons = nextButtons.length > 0 && prevButtons.length > 0;
    
    // Store form structure info
    diagnosticInfo.hasStepIndicators = hasStepIndicators;
    diagnosticInfo.hasNextPrevButtons = hasNextPrevButtons;
    
    // Score for form presence and structure
    if (formCount > 0) {
      score += 15; // Base points for having a form
      
      // Bonus points for complex form structures (likely registration forms)
      if (hasStepIndicators) score += 10;
      if (hasNextPrevButtons) score += 10;
      
      // Multiple forms might indicate a complex registration process
      if (formCount > 1) score += 5;
    } else {
      // Even without a <form> tag, look for sufficient input fields
      const allInputs = document.querySelectorAll('input, select, textarea');
      const inputCount = allInputs.length;
      
      // Business registration usually requires multiple fields
      if (inputCount >= 5) score += 15;
      else if (inputCount >= 3) score += 10;
      
      // Store diagnostic info
      diagnosticInfo.inputCount = inputCount;
    }
    
    // Form submission context analysis - look at buttons and their text
    const submitButtons = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type]), .btn-primary, .submit-button'));
    const submitButtonText = submitButtons.map(button => button.textContent.toLowerCase() || button.value?.toLowerCase() || '').join(' ');
    
    // Strong business registration indicators in submit buttons
    const registrationSubmitTerms = [
      'register', 'file', 'submit', 'form', 'create', 'incorporate',
      'establish', 'start business', 'complete registration', 'continue registration',
      'file now', 'file articles', 'save filing', 'submit application'
    ];
    
    for (const term of registrationSubmitTerms) {
      if (submitButtonText.includes(term)) {
        score += 10;
        break; // Only count this category once
      }
    }
    
    // Check for payment-related form elements (common in registration)
    const paymentFields = document.querySelectorAll(
      'input[name*="card"], input[name*="credit"], input[name*="payment"], ' +
      'input[name*="ccnumber"], input[name*="cc-number"], input[name*="cvc"], ' +
      'input[name*="cvv"], input[name*="expir"], input[name*="fee"]'
    );
    
    if (paymentFields.length >= 3) {
      score += 10; // Strong indicator of a paid registration process
    }
    
    // Check for file uploads (common for supporting documents)
    const fileUploads = document.querySelectorAll('input[type="file"]');
    if (fileUploads.length > 0) {
      score += 5;
      
      // File upload with specific label text is even stronger signal
      const fileLabels = Array.from(fileUploads).map(file => {
        if (file.labels && file.labels[0]) return file.labels[0].textContent.toLowerCase();
        if (file.id) {
          const label = document.querySelector(`label[for="${file.id}"]`);
          return label ? label.textContent.toLowerCase() : '';
        }
        return '';
      }).join(' ');
      
      const documentTerms = [
        'articles', 'certificate', 'operating agreement', 'bylaws',
        'proof', 'identification', 'documentation', 'verification',
        'business document', 'supporting document'
      ];
      
      for (const term of documentTerms) {
        if (fileLabels.includes(term)) {
          score += 10;
          break;
        }
      }
    }
    
    // Check if captchas or security features are present (common in government forms)
    let captchaElements = [];
    try {
      // Use standard selectors for known captcha elements
      const explicitCaptchaElements = document.querySelectorAll(
        '.captcha, .g-recaptcha, iframe[src*="recaptcha"]'
      );
      
      // For wildcard searches, use a safer approach
      const allElements = document.querySelectorAll('*');
      const wildcardMatches = Array.from(allElements).filter(el => {
        try {
          // Check className
          if (el.className && typeof el.className === 'string' && 
              el.className.toLowerCase().includes('captcha')) {
            return true;
          }
          
          // Check id
          if (el.id && typeof el.id === 'string' && 
              el.id.toLowerCase().includes('captcha')) {
            return true;
          }
          
          return false;
        } catch (error) {
          return false; // Skip elements that throw errors
        }
      });
      
      // Combine both sets while removing duplicates
      captchaElements = [...Array.from(explicitCaptchaElements), ...wildcardMatches];
    } catch (error) {
      reportError(error, 'captchaDetection', false);
      // Fallback to simple detection
      try {
        captchaElements = document.querySelectorAll('.captcha, .g-recaptcha');
      } catch (simpleError) {
        captchaElements = [];
      }
    }
    
    if (captchaElements.length > 0) {
      score += 5; // Modest boost - captchas are common in government forms
    }
    
    // Log diagnostic information for debugging
    log('Form analysis diagnostic info:', diagnosticInfo);
    
    // Return both score and field detection results
    return {
      score: Math.min(score, 100),
      fieldDetectionResults: fieldDetectionResults,
      classificationStats: classificationStats
    };
  } catch (error) {
    reportError(error, 'analyzeFormElements');
    return {
      score: 0,
      fieldDetectionResults: null,
      classificationStats: null
    };
  }
}

/**
 * Identify which state the form is for based on page content
 */
function identifyStateFromContent() {
  try {
    // Get page text
    const pageText = document.body ? document.body.textContent.toLowerCase() : '';
    if (!pageText) return null;
    
    // Map of state names and their codes
    const states = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
      'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
      'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
      'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
      'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
      'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
      'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
      'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
      'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
      'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
      'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
    };
    
    // Look for state name mentions in headings first (more likely to be relevant)
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const heading of headings) {
      const headingText = heading.textContent.toLowerCase();
      for (const [stateName, stateCode] of Object.entries(states)) {
        if (headingText.includes(stateName) || 
            (stateCode.length === 2 && headingText.includes(` ${stateCode.toLowerCase()} `))) {
          return stateCode;
        }
      }
    }
    
    // Check for state mentions in the context of business registration
    const businessPhrases = ['business registration', 'register a business', 'secretary of state', 'department of state'];
    
    for (const [stateName, stateCode] of Object.entries(states)) {
      // Look for state name in combination with business registration phrases
      for (const phrase of businessPhrases) {
        if (pageText.includes(`${stateName} ${phrase}`) || 
            pageText.includes(`${phrase} ${stateName}`)) {
          return stateCode;
        }
      }
      
      // Look for phrases like "State of California"
      if (pageText.includes(`state of ${stateName}`)) {
        return stateCode;
      }
    }
    
    return null;
  } catch (error) {
    reportError(error, 'identifyStateFromContent');
    return null;
  }
}

// Verify connection status periodically
function checkConnectionStatus() {
  if (!connectionEstablished && !fallbackDetectionMode) {
    connectionAttempts++;
    log('Checking connection status (attempt ' + connectionAttempts + ')');
    
    // Send a ping message to check connection
    sendMessageWithRetry({
      action: 'ping',
      timestamp: Date.now()
    }, function(response) {
      log('Connection verified');
      connectionEstablished = true;
      connectionAttempts = 0;
    }, function() {
      log('Connection verification failed');
      
      // Switch to fallback mode after multiple failed attempts
      if (connectionAttempts >= CONNECTION_RETRY_MAX) {
        log('Switching to fallback mode after ' + CONNECTION_RETRY_MAX + ' failed connection attempts');
        fallbackDetectionMode = true;
        showFallbackIndicator('Connection to extension lost. Reload the page to reconnect.');
      }
    });
  }
}

// Run connection check periodically
setInterval(checkConnectionStatus, 30000);

/**
 * Update stored detection history with user feedback
 * @param {Object} feedbackData - User feedback data
 */
function updateDetectionHistory(feedbackData) {
  try {
    // Get existing detection history
    const existingData = window.localStorage.getItem('BRA_PriorDetections') || '[]';
    const detections = JSON.parse(existingData);
    
    // Create new detection record with user feedback
    if (detectionResult) {
      const newDetection = {
        urlPattern: detectionResult.urlPattern,
        urlRoot: detectionResult.urlRoot,
        state: detectionResult.state,
        formType: detectionResult.formType,
        confidenceScore: detectionResult.confidenceScore,
        userConfirmed: feedbackData.isCorrect,
        userFeedback: feedbackData.feedback || '',
        timestamp: new Date().toISOString()
      };
      
      // Add to detection history
      detections.push(newDetection);
      
      // Keep only the last 100 detections
      if (detections.length > 100) {
        detections.shift();
      }
      
      // Save updated detection history
      window.localStorage.setItem('BRA_PriorDetections', JSON.stringify(detections));
      log('Updated detection history with user feedback');
    }
  } catch (error) {
    console.error('[BRA] Error updating detection history:', error.message);
  }
}

// Add context invalidation listener
if (typeof window !== 'undefined') {
  window.addEventListener('extension-context-invalidated', () => {
    console.log('[BRA] Extension context invalidated event received');
    // Clean up any active operations
    detectionResult = null;
    pendingMessageCallbacks = {};
  });
}

// Listen for messages from popup, panel, or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Check if context is still valid before processing
  const messaging = messagingUtils || window.messagingUtils;
  let contextValid = true;
  
  if (messaging && typeof messaging.isContextValid === 'function') {
    contextValid = messaging.isContextValid();
  } else {
    try {
      contextValid = !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      contextValid = false;
    }
  }
  
  if (!contextValid) {
    console.log('[BRA] Ignoring message - extension context invalid');
    return false;
  }
  
  console.log('[BRA Content] Message received:', message.action, 'Detection result exists:', !!detectionResult);
  log('Message received:', message.action);
  
  // Special handling for navigation detection request
  if (message.action === 'checkNavigation') {
    // Force check current URL against stored result
    const currentUrl = location.href;
    if (detectionResult && detectionResult.url !== currentUrl) {
      console.log('[BRA] URL mismatch detected - triggering new detection');
      handleUrlChange();
    }
    sendResponse({ 
      currentUrl: currentUrl,
      resultUrl: detectionResult?.url,
      needsUpdate: !detectionResult || detectionResult.url !== currentUrl
    });
    return true;
  }
  
  try {
    // Mark that we have a connection
    connectionEstablished = true;
    connectionAttempts = 0;
    
    if (message.action === 'getDetectionResult') {
      // Return current detection
      sendResponse(detectionResult || { 
        isBusinessRegistrationForm: false, 
        error: 'No detection result available',
        attempts: detectionAttempts,
        fallbackMode: fallbackDetectionMode
      });
    }
    else if (message.action === 'triggerDetection') {
      // Don't trigger if we already have a valid detection result
      if (detectionResult && detectionResult.isBusinessRegistrationForm !== undefined) {
        console.log('[BRA Content] Detection already completed, returning existing result');
        sendResponse({ 
          success: true, 
          message: 'Detection already completed',
          hasResult: true,
          result: detectionResult
        });
        return;
      }
      
      // Only reset if we don't have a result yet
      detectionAttempts = 0;
      fallbackDetectionMode = false; // Reset fallback mode to try normal detection
      connectionEstablished = false; // Reset connection state
      connectionAttempts = 0; // Reset connection attempts
      
      // Run detection
      tryDetection();
      sendResponse({ 
        success: true, 
        message: 'Detection triggered',
        fallbackMode: fallbackDetectionMode
      });
    }
    else if (message.action === 'getDetectionStatus') {
      console.log('[BRA Content] getDetectionStatus - returning result:', {
        hasResult: !!detectionResult,
        isBusinessForm: detectionResult?.isBusinessRegistrationForm,
        confidence: detectionResult?.confidenceScore,
        state: detectionResult?.state
      });
      
      // Return current detection status with result
      sendResponse({
        hasResult: !!detectionResult,
        result: detectionResult, // Include the actual result
        attempts: detectionAttempts,
        maxAttempts: MAX_DETECTION_ATTEMPTS,
        documentReady: document.readyState,
        connectionEstablished: connectionEstablished,
        fallbackMode: fallbackDetectionMode,
        errors: window.BRA_Errors || []
      });
    }
    else if (message.action === 'ping') {
      // Respond to ping with current status
      sendResponse({
        alive: true,
        timestamp: Date.now(),
        detectionStatus: {
          hasResult: !!detectionResult,
          attempts: detectionAttempts,
          fallbackMode: fallbackDetectionMode
        }
      });
    }
    else if (message.action === 'userFeedback') {
      // Process and store user feedback for adaptive learning
      if (message.feedback) {
        updateDetectionHistory(message.feedback);
        sendResponse({
          success: true,
          message: 'Feedback recorded successfully'
        });
      } else {
        sendResponse({
          success: false,
          error: 'Invalid feedback data'
        });
      }
    }
    else if (message.action === 'detectDynamicForms') {
      try {
        // Special detection for dynamic forms that might load after initial detection
        
        // Setup a more intensive MutationObserver specifically for form detection
        const dynamicFormObserver = new MutationObserver((mutations) => {
          try {
            const significantChanges = mutations.some(mutation => {
              try {
                if (!mutation.addedNodes || mutation.addedNodes.length === 0) return false;
                
                return Array.from(mutation.addedNodes).some(node => {
                  try {
                    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
                    
                    // Check if this is a form element directly
                    if (node.tagName === 'FORM') return true;
                    
                    // Otherwise check for form-related elements inside
                    // using a try-catch to handle potential errors
                    try {
                      return node.querySelector('form') !== null || 
                             node.querySelector('input[type="text"]') !== null ||
                             node.querySelector('input[type="submit"]') !== null ||
                             node.querySelector('button[type="submit"]') !== null ||
                             node.querySelector('select') !== null ||
                             node.querySelector('.form') !== null ||
                             node.querySelector('.input') !== null;
                    } catch (nodeQueryError) {
                      // If querySelector fails, try a more basic approach
                      return node.getElementsByTagName && (
                        node.getElementsByTagName('form').length > 0 ||
                        node.getElementsByTagName('input').length > 0 ||
                        node.getElementsByTagName('select').length > 0 ||
                        node.getElementsByTagName('button').length > 0
                      );
                    }
                  } catch (nodeError) {
                    return false; // Skip nodes that throw errors
                  }
                });
              } catch (mutationError) {
                return false; // Skip mutations that throw errors
              }
            });
            
            if (significantChanges) {
              log('Dynamic form elements detected, triggering new detection');
              
              // Only trigger a new detection if we don't already have a result
              // or if the current result is negative
              if (!detectionResult || !detectionResult.isBusinessRegistrationForm) {
                tryDetection();
              }
            }
          } catch (observerCallbackError) {
            reportError(observerCallbackError, 'dynamicFormObserverCallback', false);
          }
        });
        
        // Start observing with a configuration for forms
        try {
          dynamicFormObserver.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['style', 'class']
          });
          
          // Ensure observer is eventually disconnected
          setTimeout(() => {
            try {
              dynamicFormObserver.disconnect();
              log('Dynamic form observer disconnected after timeout');
            } catch (disconnectError) {
              reportError(disconnectError, 'dynamicFormObserverDisconnect', false);
            }
          }, 60000); // 1 minute max
          
          sendResponse({
            success: true,
            message: 'Dynamic form detection enabled'
          });
        } catch (observeError) {
          reportError(observeError, 'dynamicFormObserverObserve', false);
          sendResponse({
            success: false,
            error: 'Failed to start dynamic form detection: ' + observeError.message
          });
        }
      } catch (setupError) {
        reportError(setupError, 'dynamicFormObserverSetup', false);
        sendResponse({
          success: false,
          error: 'Failed to set up dynamic form detection: ' + setupError.message
        });
      }
    }
    else if (message.action === 'autoFillFields') {
      // Auto-fill form fields with provided data or sample data
      try {
        let filledCount = 0;
        
        // Use provided data or fall back to sample data
        const fillData = message.data || {
          // Business information
          business_name: 'Sample Business LLC',
          dba: 'Sample Trade Name',
          entity_type: 'Limited Liability Company',
          // Contact information
          first_name: 'John',
          last_name: 'Doe',
          email: 'john.doe@example.com',
          phone: '555-123-4567',
          // Address
          address: '123 Main Street',
          city: 'Washington',
          state: 'DC',
          zip: '20001',
          // Tax IDs
          ein: '12-3456789',
          ssn: '123-45-6789'
        };
        
        console.log('[BRA] Attempting to auto-fill with data:', fillData);
        
        // If we have field detection results, use them for precise filling
        if (fieldDetectionResults && fieldDetectionResults.fields) {
          console.log('[BRA] Using field detection results for auto-fill');
          
          fieldDetectionResults.fields.forEach(field => {
            if (field.classification && fillData[field.classification.category]) {
              const value = fillData[field.classification.category];
              if (field.element && !field.element.value && !field.element.disabled) {
                field.element.value = value;
                field.element.dispatchEvent(new Event('input', { bubbles: true }));
                field.element.dispatchEvent(new Event('change', { bubbles: true }));
                filledCount++;
                console.log(`[BRA] Filled ${field.classification.category}: ${value}`);
              }
            }
          });
        } else {
          // Fallback to pattern matching
          console.log('[BRA] Using pattern matching for auto-fill');
          
          const sampleData = {
            // Business information
            'business.*name|company.*name|entity.*name': fillData.business_name || 'Sample Business LLC',
            'dba|trade.*name|doing.*business': fillData.dba || 'Sample Trade Name',
            // Contact information
            'first.*name': fillData.first_name || 'John',
            'last.*name': fillData.last_name || 'Doe',
            'email|e-mail': fillData.email || 'john.doe@example.com',
            'phone|telephone': fillData.phone || '555-123-4567',
            // Address
            'street|address.*1|address(?!.*2)': fillData.address || '123 Main Street',
            'city': fillData.city || 'Washington',
            'state': fillData.state || 'DC',
            'zip|postal': fillData.zip || '20001',
            // Tax IDs
            'ein|employer.*id|federal.*tax': fillData.ein || '12-3456789',
            'ssn|social.*security': fillData.ssn || '123-45-6789'
          };
        
        // Find all input fields
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], input:not([type]), textarea');
        
        inputs.forEach(input => {
          if (input.value || input.disabled || input.readOnly) return;
          
          const fieldIdentifier = [
            input.name,
            input.id,
            input.placeholder,
            input.getAttribute('aria-label'),
            input.labels?.[0]?.textContent
          ].filter(Boolean).join(' ').toLowerCase();
          
          // Try to match against sample data patterns
          for (const [pattern, value] of Object.entries(sampleData)) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(fieldIdentifier)) {
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              filledCount++;
              break;
            }
          }
        });
        
        // Handle select elements for state
        const stateSelects = document.querySelectorAll('select');
        stateSelects.forEach(select => {
          const fieldIdentifier = [select.name, select.id].filter(Boolean).join(' ').toLowerCase();
          if (fieldIdentifier.includes('state')) {
            const dcOption = Array.from(select.options).find(opt => 
              opt.value === 'DC' || opt.textContent.includes('District of Columbia')
            );
            if (dcOption) {
              select.value = dcOption.value;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              filledCount++;
            }
          }
        });
        } // Close the else block
        
        sendResponse({
          success: true,
          message: `Auto-filled ${filledCount} fields`,
          filledCount: filledCount
        });
      } catch (error) {
        reportError(error, 'autoFillFields');
        sendResponse({
          success: false,
          error: 'Failed to auto-fill fields: ' + error.message
        });
      }
    }
  } catch (error) {
    reportError(error, 'messageHandler');
    
    // Always respond, even on error, to prevent hanging the sender
    sendResponse({ 
      error: error.message,
      fallbackMode: fallbackDetectionMode,
      errorTimestamp: Date.now()
    });
  }
  
  return true; // Keep message channel open
});

// Initialize when the content script loads
console.log('[BRA] ===== CONTENT SCRIPT STARTING =====');
console.log('[BRA] URL:', window.location.href);
console.log('[BRA] Document ready state:', document.readyState);
console.log('[BRA] Time:', new Date().toISOString());

initializeDetection();

// Log initialization complete (always show this)
console.log('[BRA] Business Registration Assistant initialized on:', window.location.href);
console.log('[BRA] ===== CONTENT SCRIPT INITIALIZED =====');

// Immediate detection test
setTimeout(() => {
  console.log('[BRA] ===== IMMEDIATE DETECTION TEST =====');
  console.log('[BRA] Forms found:', document.querySelectorAll('form').length);
  console.log('[BRA] Inputs found:', document.querySelectorAll('input').length);
  console.log('[BRA] Radio buttons found:', document.querySelectorAll('input[type="radio"]').length);
  console.log('[BRA] Select elements found:', document.querySelectorAll('select').length);
  console.log('[BRA] Page title:', document.title);
  console.log('[BRA] Page contains "FR-500":', document.body?.textContent?.includes('FR-500'));
  console.log('[BRA] Page contains "Business Registration":', document.body?.textContent?.includes('Business Registration'));
  console.log('[BRA] =====================================');
}, 1000);

// Listen for URL changes (including hash changes)
let lastUrl = location.href;
let lastPageTitle = document.title;
let lastFormCount = document.querySelectorAll('form').length;
let lastInputCount = document.querySelectorAll('input, select, textarea').length;

// Function to handle URL changes
function handleUrlChange() {
  const currentUrl = location.href;
  if (currentUrl !== lastUrl) {
    const oldUrl = lastUrl;
    lastUrl = currentUrl;
    console.log('[BRA] URL changed from:', oldUrl, 'to:', currentUrl);
    
    // Check if it's just a hash change
    const isHashChange = oldUrl.split('#')[0] === currentUrl.split('#')[0];
    console.log('[BRA] Is hash change:', isHashChange);
    
    // Reset detection state
    detectionResult = null;
    detectionAttempts = 0;
    fallbackDetectionMode = false;
    window.BRA_FORCE_REDETECTION = true;
    
    // Clear any existing errors
    if (window.BRA_Errors) {
      window.BRA_Errors = [];
    }
    
    // Immediately notify panel to clear fields using safe messaging
    const messaging = messagingUtils || window.messagingUtils;
    
    // Check if context is valid
    let contextValid = true;
    if (messaging && typeof messaging.isContextValid === 'function') {
      contextValid = messaging.isContextValid();
    } else {
      try {
        contextValid = !!(chrome.runtime && chrome.runtime.id);
      } catch (e) {
        contextValid = false;
      }
    }
    
    if (contextValid) {
      // Send navigation message
      if (messaging && typeof messaging.sendMessage === 'function') {
        messaging.sendMessage({
          action: 'navigationDetected',
          oldUrl: oldUrl,
          newUrl: currentUrl,
          isHashChange: isHashChange,
          timestamp: Date.now()
        });
        
        // Notify background of URL change
        messaging.sendMessage({
          action: 'urlChanged',
          newUrl: currentUrl,
          timestamp: Date.now()
        });
      } else {
        // Fallback to direct Chrome API
        try {
          chrome.runtime.sendMessage({
            action: 'navigationDetected',
            oldUrl: oldUrl,
            newUrl: currentUrl,
            isHashChange: isHashChange,
            timestamp: Date.now()
          });
          
          chrome.runtime.sendMessage({
            action: 'urlChanged',
            newUrl: currentUrl,
            timestamp: Date.now()
          });
        } catch (error) {
          console.warn('[BRA] Failed to send navigation message:', error);
        }
      }
    }
    
    // For hash changes or form navigation, wait longer for content to load
    const detectionDelay = isHashChange ? 1500 : 500;
    
    // Trigger new detection after a delay
    setTimeout(() => {
      console.log('[BRA] Starting detection for new URL after', detectionDelay, 'ms delay');
      tryDetection();
    }, detectionDelay);
  }
}

// Debounced content change handler
let contentChangeTimer = null;
let lastContentHash = '';

function getContentHash() {
  // Create a simple hash of form-related content
  const forms = document.querySelectorAll('form');
  const inputs = document.querySelectorAll('input, select, textarea');
  return `${forms.length}-${inputs.length}-${document.body?.innerHTML?.length || 0}`;
}

function handleContentChange() {
  const currentHash = getContentHash();
  if (currentHash !== lastContentHash) {
    lastContentHash = currentHash;
    console.log('[BRA] Significant content change detected');
    
    // Reset detection state
    detectionResult = null;
    detectionAttempts = 0;
    window.BRA_FORCE_REDETECTION = true;
    
    // Notify panel of content change
    chrome.runtime.sendMessage({
      action: 'contentChanged',
      timestamp: Date.now()
    }, function(response) {
      if (chrome.runtime.lastError) {
        // Ignore - panel might not be open
      }
    });
    
    // Trigger new detection
    tryDetection();
  }
}

// Listen for hash changes
window.addEventListener('hashchange', handleUrlChange);

// Listen for history changes (back/forward navigation)
window.addEventListener('popstate', handleUrlChange);

// Override pushState and replaceState to catch programmatic navigation
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

// Enhanced MutationObserver for both URL and content changes
const pageObserver = new MutationObserver((mutations) => {
  // Check for URL change first
  if (location.href !== lastUrl) {
    handleUrlChange();
    return;
  }
  
  // Check for significant content changes (debounced)
  clearTimeout(contentChangeTimer);
  contentChangeTimer = setTimeout(() => {
    // Check multiple indicators of significant form changes
    let hasSignificantChanges = false;
    
    // 1. Check if form-related elements were added or removed
    for (const mutation of mutations) {
      // Check added nodes
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const elem = node;
          if (elem.matches && (
            elem.matches('form, input, select, textarea, fieldset, label, button[type="submit"]') ||
            elem.querySelector && elem.querySelector('form, input, select, textarea, fieldset, label, button[type="submit"]')
          )) {
            hasSignificantChanges = true;
            break;
          }
        }
      }
      
      // Check removed nodes (form might have been replaced)
      for (const node of mutation.removedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const elem = node;
          if (elem.matches && elem.matches('form, fieldset')) {
            hasSignificantChanges = true;
            break;
          }
        }
      }
      
      if (hasSignificantChanges) break;
    }
    
    // 2. Check if the page title changed (often indicates navigation)
    if (document.title !== lastPageTitle) {
      console.log('[BRA] Page title changed from:', lastPageTitle, 'to:', document.title);
      lastPageTitle = document.title;
      hasSignificantChanges = true;
    }
    
    // 3. Check if main content containers changed significantly
    const currentFormCount = document.querySelectorAll('form').length;
    const currentInputCount = document.querySelectorAll('input, select, textarea').length;
    
    if (Math.abs(currentFormCount - lastFormCount) > 0 || Math.abs(currentInputCount - lastInputCount) > 5) {
      console.log('[BRA] Significant form element count change detected');
      lastFormCount = currentFormCount;
      lastInputCount = currentInputCount;
      hasSignificantChanges = true;
    }
    
    if (hasSignificantChanges) {
      handleContentChange();
    }
  }, 800); // Slightly faster response time for better UX
});

// Start observing the document for changes
if (document.body) {
  pageObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false, // Don't watch attribute changes to reduce noise
    characterData: false
  });
  
  // Set initial content hash
  lastContentHash = getContentHash();
}

// Monitor checkbox changes for conditional field detection
let checkboxChangeTimer = null;
function setupCheckboxMonitoring() {
  // Use event delegation to catch all checkbox changes
  document.addEventListener('change', function(event) {
    const target = event.target;
    
    // Check if it's a checkbox or radio button
    if (target && (target.type === 'checkbox' || target.type === 'radio')) {
      console.log('[BRA] Form control changed:', target.type, target.name || target.id);
      
      // Clear any pending timer
      clearTimeout(checkboxChangeTimer);
      
      // Wait a bit for any conditional fields to appear/disappear
      checkboxChangeTimer = setTimeout(() => {
        console.log('[BRA] Checking for conditional field changes after checkbox/radio change');
        
        // Check if form structure has changed
        const currentFormCount = document.querySelectorAll('form').length;
        const currentInputCount = document.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
        const visibleInputCount = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea'))
          .filter(el => {
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }).length;
        
        console.log(`[BRA] Current visible inputs: ${visibleInputCount}, Last count: ${lastInputCount}`);
        
        // If field count changed significantly, re-detect
        if (Math.abs(visibleInputCount - lastInputCount) > 0) {
          console.log('[BRA] Field count changed after checkbox/radio change, re-detecting...');
          lastInputCount = visibleInputCount;
          
          // Reset detection and trigger new one
          detectionResult = null;
          window.BRA_FORCE_REDETECTION = true;
          
          // Notify panel of potential field change
          chrome.runtime.sendMessage({
            action: 'conditionalFieldsChanged',
            timestamp: Date.now()
          }, function(response) {
            if (chrome.runtime.lastError) {
              // Ignore - panel might not be open
            }
          });
          
          tryDetection();
        }
      }, 500); // Wait 500ms for animations/transitions
    }
  }, true); // Use capture phase to catch events before they might be stopped
}

// Set up checkbox monitoring when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupCheckboxMonitoring);
} else {
  setupCheckboxMonitoring();
}

// Announce content script presence to background/panel
try {
  chrome.runtime.sendMessage({
    action: 'contentScriptReady',
    url: window.location.href,
    timestamp: Date.now()
  }, function(response) {
    if (chrome.runtime.lastError) {
      console.log('[BRA] Could not announce presence:', chrome.runtime.lastError.message);
    } else {
      console.log('[BRA] Content script presence announced');
    }
  });
} catch (error) {
  console.log('[BRA] Error announcing presence:', error);
}

// Health check system
function performHealthCheck() {
  const health = {
    timestamp: new Date().toISOString(),
    url: window.location.href,
    modules: {
      urlDetector: !!URLDetector,
      fieldDetector: !!FieldDetector
    },
    detection: {
      attempts: detectionAttempts,
      hasResult: !!detectionResult,
      fallbackMode: fallbackDetectionMode,
      connectionEstablished: connectionEstablished
    },
    errors: window.BRA_Errors ? window.BRA_Errors.length : 0,
    documentState: document.readyState
  };
  
  console.log('[BRA Health Check]', health);
  return health;
}

// Debug helper - expose to window for console debugging
window.BRA_DEBUG = {
  getDetectionResult: () => detectionResult,
  getHealth: () => performHealthCheck(),
  triggerDetection: () => {
    console.log('[BRA DEBUG] Manual detection triggered');
    detectionResult = null;
    detectionAttempts = 0;
    window.BRA_FORCE_REDETECTION = true;
    return tryDetection();
  },
  forceDetection: async () => {
    console.log('[BRA DEBUG] Force detection triggered');
    detectionResult = null;
    detectionAttempts = 0;
    window.BRA_FORCE_REDETECTION = true;
    await detectBusinessForm();
    return detectionResult;
  },
  getState: () => ({
    detectionResult,
    detectionAttempts,
    connectionEstablished,
    fallbackDetectionMode,
    errors: window.BRA_Errors,
    modules: {
      URLDetector: !!URLDetector,
      FieldDetector: !!FieldDetector
    }
  }),
  testFieldDetection: async () => {
    console.log('[BRA DEBUG] Testing field detection');
    const detector = new (FieldDetector.default || FieldDetector.FieldDetector)(document);
    const fields = await detector.detectFields();
    console.log('[BRA DEBUG] Fields detected:', fields.length);
    console.log('[BRA DEBUG] Fields:', fields);
    return fields;
  }
};

console.log('[BRA Content] Debug helper available: window.BRA_DEBUG');

// Expose health check for debugging
window.BRA_HealthCheck = performHealthCheck;