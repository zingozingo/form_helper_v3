/**
 * Business Registration Assistant - Content Script
 * Implementation that detects business registration forms
 */

// Initialize diagnostic tracking first to prevent ReferenceError
// This must be defined before any code tries to use it
const diagnostics = {
  startTime: new Date().toISOString(),
  browserInfo: navigator.userAgent,
  detectionAttempts: [],
  connectionAttempts: [],
  errors: [],
  moduleLoading: {
    urlDetector: false,
    fieldDetector: false
  },
  documentStates: []
};

// Import modules
let URLDetector;
let FieldDetector;

// Safe function to track document state
function trackDocumentState() {
  try {
    if (diagnostics && Array.isArray(diagnostics.documentStates)) {
      diagnostics.documentStates.push({
        time: new Date().toISOString(),
        state: document.readyState,
        bodyExists: !!document.body,
        title: document.title || 'No title'
      });
    }
  } catch (e) {
    console.error('[BRA] Error tracking document state:', e);
  }
}

// Add initial diagnostic information about document state
trackDocumentState();

// Track document state changes
document.addEventListener('readystatechange', () => {
  trackDocumentState();
});

// Load modules with retry and error handling
(async () => {
  try {
    // Load URL detector module using regular import
    try {
      URLDetector = await import(chrome.runtime.getURL('modules/urlDetector.js'));
      
      // Safely update diagnostics
      if (diagnostics && diagnostics.moduleLoading) {
        diagnostics.moduleLoading.urlDetector = true;
      }
      
      log('URLDetector module loaded successfully');
    } catch (urlError) {
      console.error('[BRA] Error loading URLDetector module:', urlError);
      
      // Safely push error to diagnostics
      try {
        if (diagnostics && Array.isArray(diagnostics.errors)) {
          diagnostics.errors.push({
            type: 'module_load',
            module: 'urlDetector',
            error: urlError.message,
            time: new Date().toISOString()
          });
        }
      } catch (diagError) {
        console.error('[BRA] Error updating diagnostics:', diagError);
      }
      
      // Since we can't use unsafe-eval, we'll have to report the error and proceed
      reportError(urlError, 'moduleLoad_urlDetector', true);
      
      // Implement a fallback basic URL detector without the full module
      URLDetector = {
        default: class BasicURLDetector {
          constructor() {
            this.isBusinessRegistrationURL = this.isBusinessRegistrationURL.bind(this);
          }
          
          isBusinessRegistrationURL(url) {
            // Very basic check for common business registration keywords in URL
            const lowerUrl = (url || '').toLowerCase();
            const registrationKeywords = [
              'business', 'register', 'entity', 'formation', 'file', 'corp',
              'llc', 'incorporation', 'sos', 'secretary', 'state'
            ];
            
            // Check for government domains and business keywords
            return (
              (lowerUrl.includes('.gov') || lowerUrl.includes('state.') || lowerUrl.includes('sos.')) &&
              registrationKeywords.some(keyword => lowerUrl.includes(keyword))
            );
          }
        }
      };
      
      log('Using BasicURLDetector fallback');
    }
    
    // Load field detector module using regular import
    try {
      FieldDetector = await import(chrome.runtime.getURL('modules/fieldDetector.js'));
      
      // Safely update diagnostics
      if (diagnostics && diagnostics.moduleLoading) {
        diagnostics.moduleLoading.fieldDetector = true;
      }
      
      log('FieldDetector module loaded successfully');
    } catch (fieldError) {
      console.error('[BRA] Error loading FieldDetector module:', fieldError);
      
      // Safely push error to diagnostics
      try {
        if (diagnostics && Array.isArray(diagnostics.errors)) {
          diagnostics.errors.push({
            type: 'module_load',
            module: 'fieldDetector',
            error: fieldError.message,
            time: new Date().toISOString()
          });
        }
      } catch (diagError) {
        console.error('[BRA] Error updating diagnostics:', diagError);
      }
      
      // Since we can't use unsafe-eval, we'll have to report the error and proceed
      reportError(fieldError, 'moduleLoad_fieldDetector', true);
      
      // Implement a basic field detector as fallback
      FieldDetector = {
        default: class BasicFieldDetector {
          constructor(rootElement) {
            this.root = rootElement || document;
            this.fields = [];
          }
          
          detectFields() {
            try {
              // Reset fields
              this.fields = [];
              
              // Get all input elements using a basic selector
              const inputElements = this.root.querySelectorAll('input, select, textarea');
              console.log(`[BRA-BasicFieldDetector] Found ${inputElements.length} potential input elements`);
              
              // Process each input element with basic extraction
              inputElements.forEach((element, index) => {
                try {
                  const field = this._extractBasicFieldInfo(element);
                  if (field) {
                    field.index = index;
                    this.fields.push(field);
                  }
                } catch (error) {
                  console.error('[BRA-BasicFieldDetector] Error processing field:', error);
                }
              });
              
              return this.fields;
            } catch (error) {
              console.error('[BRA-BasicFieldDetector] Error detecting fields:', error);
              return [];
            }
          }
          
          _extractBasicFieldInfo(element) {
            // Extract only essential info
            return {
              element: element,
              tagName: element.tagName.toLowerCase(),
              type: element.type || element.tagName.toLowerCase(),
              id: element.id || '',
              name: element.name || '',
              value: element.value || '',
              placeholder: element.placeholder || '',
              required: element.required || false
            };
          }
          
          getFields() {
            return this.fields;
          }
        }
      };
      
      log('Using BasicFieldDetector fallback');
    }
  } catch (moduleError) {
    // Generic module loading error
    console.error('[BRA] Error in module loading:', moduleError);
    reportError(moduleError, 'moduleLoading', true);
  }
})();

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

// Detection strategies tracking
const detectionStrategies = {
  documentEnd: { attempted: false, success: false },
  windowLoad: { attempted: false, success: false },
  delayedExecution: { attempted: false, success: false },
  mutationObserver: { attempted: false, success: false }
};

// Simple logger
function log(message, data) {
  const prefix = '[BRA]';
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

/**
 * Log diagnostic information for troubleshooting
 * @param {string} category - The diagnostic category
 * @param {Object} data - Diagnostic data
 */
function logDiagnostic(category, data) {
  try {
    // Safety check - ensure diagnostics object exists
    if (!diagnostics) {
      console.error('[BRA] Diagnostics object not initialized');
      return;
    }
    
    // Add timestamp
    const entry = {
      timestamp: new Date().toISOString(),
      category,
      data
    };
    
    // Safely store in appropriate category
    if (category === 'detection') {
      if (Array.isArray(diagnostics.detectionAttempts)) {
        diagnostics.detectionAttempts.push(entry);
      } else {
        diagnostics.detectionAttempts = [entry];
      }
    } else if (category === 'connection') {
      if (Array.isArray(diagnostics.connectionAttempts)) {
        diagnostics.connectionAttempts.push(entry);
      } else {
        diagnostics.connectionAttempts = [entry];
      }
    } else if (category === 'error') {
      if (Array.isArray(diagnostics.errors)) {
        diagnostics.errors.push(entry);
      } else {
        diagnostics.errors = [entry];
      }
    } else {
      // Generic diagnostics
      if (!diagnostics[category]) {
        diagnostics[category] = [];
      }
      
      if (Array.isArray(diagnostics[category])) {
        diagnostics[category].push(entry);
      } else {
        diagnostics[category] = [entry];
      }
    }
    
    // Log to console in debug mode
    if (window.BRA_DEBUG) {
      console.log(`[BRA-Diagnostic] [${category}]:`, data);
    }
  } catch (e) {
    // Last resort - if even diagnostic logging fails, at least log to console
    console.error('[BRA] Error in diagnostic logging:', e);
  }
}

/**
 * Reports an error to the background script
 * @param {Error} error - The error that occurred
 * @param {string} context - Context where the error occurred
 * @param {boolean} isFatal - Whether the error is fatal and should be shown to the user
 */
function reportError(error, context, isFatal = false) {
  try {
    console.error('[BRA] Error in ' + context + ':', error);
    
    // Safely log to diagnostics first
    try {
      if (diagnostics && Array.isArray(diagnostics.errors)) {
        diagnostics.errors.push({
          message: error?.message || 'Unknown error',
          stack: error?.stack,
          context: context,
          isFatal: isFatal,
          timestamp: new Date().toISOString()
        });
      }
    } catch (diagError) {
      console.error('[BRA] Failed to log error to diagnostics:', diagError);
    }
    
    // Create error object once to reuse
    const errorData = {
      action: 'detectionError',
      error: {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        context: context,
        isFatal: isFatal,
        timestamp: new Date().toISOString(),
        url: window.location.href
      }
    };
    
    // Store locally for fallback UI display first (in case sending fails)
    if (typeof window !== 'undefined') {
      if (!window.BRA_Errors) {
        window.BRA_Errors = [];
      }
      window.BRA_Errors.push(errorData.error);
    }
    
    // Check if we can send messages
    if (typeof sendMessageWithRetry !== 'function') {
      console.error('[BRA] Cannot report error: sendMessageWithRetry not defined');
      return;
    }
    
    // Try to send message with retries
    sendMessageWithRetry(errorData, function(response) {
      // Success callback - connection established
      connectionEstablished = true;
      log('Error reported successfully');
    }, function() {
      // Error callback after retries failed
      console.error('[BRA] Failed to report error after retries');
      
      // Switch to fallback mode if we keep failing to connect
      if (!fallbackDetectionMode && context !== 'messageSend') {
        fallbackDetectionMode = true;
        log('Switching to fallback detection mode');
      }
    });
  } catch (reportingError) {
    // Last resort - log to console if error reporting itself fails
    console.error('[BRA] Fatal error in error reporting:', reportingError);
    console.error('[BRA] Original error (', context, '):', error);
  }
}

/**
 * Sends a message with retry capability
 * @param {Object} message - The message to send
 * @param {Function} successCallback - Called on success
 * @param {Function} errorCallback - Called after all retries fail
 * @param {number} retryCount - Current retry attempt
 */
function sendMessageWithRetry(message, successCallback, errorCallback, retryCount = 0) {
  try {
    // Generate unique ID for this message to track it
    const messageId = Date.now() + Math.random().toString(36).substr(2, 5);
    message.messageId = messageId;
    
    // Store the callbacks
    pendingMessageCallbacks[messageId] = {
      success: successCallback,
      error: errorCallback,
      timestamp: Date.now()
    };
    
    // Check if runtime is available
    if (!chrome || !chrome.runtime) {
      throw new Error('Chrome runtime not available');
    }
    
    // Check if we can send messages
    if (typeof chrome.runtime.sendMessage !== 'function') {
      throw new Error('Chrome runtime sendMessage not available');
    }
    
    // Track connection attempts
    connectionAttempts++;
    logDiagnostic('connection', {
      attempt: connectionAttempts,
      messageId: messageId,
      action: message.action,
      timestamp: Date.now()
    });
    
    // Send the message with improved error handling
    try {
      chrome.runtime.sendMessage(message, function(response) {
        // Check for error
        if (chrome.runtime.lastError) {
          const error = chrome.runtime.lastError;
          
          // Log detailed error info
          logDiagnostic('error', {
            phase: 'messageSend',
            error: error.message,
            messageId: messageId,
            action: message.action,
            retryCount: retryCount
          });
          
          // If we have retries left, try again
          if (retryCount < CONNECTION_RETRY_MAX) {
            log('Message send error, retrying (' + (retryCount + 1) + '/' + CONNECTION_RETRY_MAX + '): ' + error.message);
            
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
            
            // Report connection error unless this is already a report error call
            if (message.action !== 'detectionError') {
              const connectionError = new Error('Failed to establish connection: ' + error.message);
              reportError(connectionError, 'messageSend', true);
            }
          }
          return;
        }
        
        // Success - call the callback
        if (successCallback) {
          successCallback(response);
        }
        
        // Record successful communication
        logDiagnostic('connection', {
          status: 'success',
          messageId: messageId,
          action: message.action,
          responseReceived: !!response,
          timestamp: Date.now()
        });
        
        // Clean up
        delete pendingMessageCallbacks[messageId];
        
        // Mark that we've established connection at least once
        connectionEstablished = true;
        connectionAttempts = 0;
      });
    } catch (runtimeError) {
      // Handle errors from sendMessage itself
      console.error('[BRA] Runtime error sending message:', runtimeError.message);
      logDiagnostic('error', {
        phase: 'runtimeSendMessage',
        error: runtimeError.message,
        stack: runtimeError.stack,
        messageId: messageId
      });
      
      // Try to recover from runtime errors by falling back
      if (errorCallback) {
        errorCallback(runtimeError);
      }
      
      // Clean up
      delete pendingMessageCallbacks[messageId];
      
      // Attempt to reconnect to background service worker
      if (!message.action.includes('reconnect') && retryCount < 1) {
        log('Attempting to reconnect to service worker after runtime error');
        setTimeout(() => {
          sendMessageWithRetry({
            action: 'reconnect',
            timestamp: Date.now()
          }, () => {
            // Try the original message again after reconnect
            setTimeout(() => {
              sendMessageWithRetry(message, successCallback, errorCallback, 0);
            }, 100);
          }, null);
        }, 500);
      }
    }
  } catch (e) {
    // Local error in sending
    console.error('[BRA] Error sending message:', e.message);
    
    // More detailed error logging
    logDiagnostic('error', {
      phase: 'messageSendSetup',
      error: e.message,
      stack: e.stack,
      messageId: messageId || 'unknown',
      action: message.action
    });
    
    // Call error callback
    if (errorCallback) {
      errorCallback(e);
    }
    
    // Report error unless this is already a report error call
    if (!message.action || message.action !== 'detectionError') {
      reportError(e, 'messageSend');
    }
  }
}

/**
 * Initialize detection with multiple loading strategies
 */
function initializeDetection() {
  log('Initializing content script with improved loading strategy');
  
  logDiagnostic('initialization', {
    documentState: document.readyState,
    bodyExists: !!document.body,
    url: window.location.href,
    title: document.title || 'No title',
    moduleStatus: {
      urlDetector: !!URLDetector,
      fieldDetector: !!FieldDetector
    }
  });
  
  // Wait a bit to ensure the module is loaded
  setTimeout(() => {
    try {
      // Strategy 1: Try at document_end (set in manifest)
      detectionStrategies.documentEnd.attempted = true;
      logDiagnostic('strategy', {
        name: 'documentEnd',
        attempted: true,
        documentState: document.readyState
      });
      
      tryDetection('documentEnd');
      
      // Strategy 2: Wait for load event
      if (document.readyState === 'complete') {
        detectionStrategies.windowLoad.attempted = true;
        logDiagnostic('strategy', {
          name: 'windowLoad',
          attempted: true,
          documentState: document.readyState,
          immediateExecution: true
        });
        
        tryDetection('windowLoad');
      } else {
        window.addEventListener('load', () => {
          log('Window load event fired');
          detectionStrategies.windowLoad.attempted = true;
          logDiagnostic('strategy', {
            name: 'windowLoad',
            attempted: true,
            documentState: document.readyState,
            immediateExecution: false
          });
          
          tryDetection('windowLoad');
        });
      }
      
      // Strategy 3: Delayed execution for slow-loading pages
      setTimeout(() => {
        log('Delayed execution triggered');
        detectionStrategies.delayedExecution.attempted = true;
        logDiagnostic('strategy', {
          name: 'delayedExecution',
          attempted: true,
          documentState: document.readyState,
          existingResult: !!detectionResult
        });
        
        // Only try if we don't already have a result
        if (!detectionResult) {
          tryDetection('delayedExecution');
        }
      }, 2500);
      
      // Strategy 4: MutationObserver for dynamically loaded content
      setupMutationObserver();
    } catch (initError) {
      console.error('[BRA] Error during initialization:', initError);
      logDiagnostic('error', {
        phase: 'initialization',
        error: initError.message,
        stack: initError.stack
      });
      
      // Report the error but continue with fallback mechanisms
      reportError(initError, 'initialization', false);
      
      // Try basic detection anyway
      tryDetection('fallback');
    }
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
          
          // Wait until field detection is complete before disconnecting
          if (detectionResult && detectionResult.forms && detectionResult.forms.length > 0) {
            observer.disconnect();
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
 * @param {string} strategy - The detection strategy being used
 */
async function tryDetection(strategy = 'unknown') {
  // Avoid redundant detections if we already have a result
  if (detectionResult) {
    log(`Detection already completed, skipping (strategy: ${strategy})`);
    logDiagnostic('detection', {
      strategy,
      action: 'skipped',
      reason: 'already_completed',
      attempts: detectionAttempts
    });
    return;
  }
  
  // Increment attempt counter
  detectionAttempts++;
  log('Detection attempt ' + detectionAttempts + '/' + MAX_DETECTION_ATTEMPTS + ` (strategy: ${strategy})`);
  
  // Log detailed diagnostic information
  logDiagnostic('detection', {
    strategy,
    attempt: detectionAttempts,
    maxAttempts: MAX_DETECTION_ATTEMPTS,
    documentState: document.readyState,
    bodyExists: !!document.body,
    moduleStatus: {
      urlDetector: !!URLDetector,
      fieldDetector: !!FieldDetector
    },
    fallbackMode: fallbackDetectionMode,
    timestamp: new Date().toISOString()
  });
  
  // Perform some basic sanity checks first
  if (!document.body) {
    logDiagnostic('detection', {
      strategy,
      error: 'document_body_missing',
      documentState: document.readyState
    });
    
    // Don't count as an attempt if document.body is missing
    detectionAttempts--;
    
    // If we're at a late document state with no body, that's unusual
    if (document.readyState === 'complete') {
      reportError(
        new Error('Document body missing in complete state'),
        'bodyMissing',
        false
      );
      
      // Wait and retry
      setTimeout(() => tryDetection(strategy + '_bodyRetry'), 1000);
    } else {
      // Wait for document to be more ready
      log('Document body not available yet, will retry when document is more complete');
      
      // Set a fallback timeout
      setTimeout(() => {
        if (!detectionResult && document.body) {
          tryDetection(strategy + '_bodyDelayed');
        }
      }, 2000);
    }
    return;
  }
  
  // Check if required modules are available
  if (!URLDetector) {
    logDiagnostic('detection', {
      strategy,
      error: 'url_detector_missing',
      moduleLoadingState: diagnostics.moduleLoading
    });
    
    reportError(
      new Error('URLDetector module not available'),
      'modulesMissing',
      false
    );
    
    // Wait a bit for modules to load
    setTimeout(() => tryDetection(strategy + '_moduleRetry'), 500);
    return;
  }
  
  // Attempt detection
  try {
    // Send a pre-detection ping to ensure connection
    try {
      await sendPreDetectionPing();
    } catch (pingError) {
      // Log but continue - we'll still try to detect
      logDiagnostic('detection', {
        strategy,
        pingError: pingError.message,
        continuing: true
      });
    }
    
    // Record start time for performance monitoring
    const startTime = performance.now();
    
    // Perform the actual detection
    await detectBusinessForm();
    
    // Record end time and duration
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Update strategy success
    if (strategy in detectionStrategies) {
      detectionStrategies[strategy].success = !!detectionResult;
    }
    
    // Log successful detection
    logDiagnostic('detection_complete', {
      strategy,
      success: !!detectionResult,
      duration: duration,
      isBusinessForm: detectionResult ? detectionResult.isBusinessRegistrationForm : false,
      confidenceScore: detectionResult ? detectionResult.confidenceScore : 0,
      fieldCount: detectionResult && detectionResult.fieldAnalysis ? detectionResult.fieldAnalysis.totalFields : 0
    });
    
    // Only report success if we're not in fallback mode
    if (!fallbackDetectionMode && detectionResult) {
      // Add diagnostic information to detection result
      detectionResult.diagnostics = {
        detectionStrategy: strategy,
        detectionAttempt: detectionAttempts,
        detectionDuration: duration,
        documentState: document.readyState,
        documentStateHistory: diagnostics.documentStates,
        strategyAttempts: { ...detectionStrategies }
      };
      
      // Send result to background script with retry
      sendMessageWithRetry({
        action: 'formDetected',
        result: detectionResult
      }, function(response) {
        log('Detection result reported successfully');
        
        // Log success with diagnostic info
        logDiagnostic('reporting', {
          action: 'form_detected',
          success: true,
          response: response
        });
      }, function(error) {
        log('Failed to report detection result, but detection succeeded locally');
        
        // Log failure with diagnostic info
        logDiagnostic('reporting', {
          action: 'form_detected',
          success: false,
          error: error ? error.message : 'Unknown error'
        });
      });
    }
  } catch (error) {
    // Determine if this is a fatal error
    const isFatal = detectionAttempts >= MAX_DETECTION_ATTEMPTS;
    
    // Log detailed error diagnostics
    logDiagnostic('detection_error', {
      strategy,
      attempt: detectionAttempts,
      error: error.message,
      stack: error.stack,
      isFatal: isFatal,
      documentState: document.readyState,
      bodyExists: !!document.body,
      moduleStatus: {
        urlDetector: !!URLDetector,
        fieldDetector: !!FieldDetector
      }
    });
    
    // Report the error with proper context
    reportError(error, `tryDetection_${strategy}`, isFatal);
    
    // Retry if we haven't exceeded max attempts
    if (detectionAttempts < MAX_DETECTION_ATTEMPTS) {
      // Increase delay for each retry with exponential backoff
      const currentDelay = RETRY_DELAY * Math.pow(1.5, detectionAttempts - 1);
      log('Will retry detection in ' + currentDelay + 'ms');
      
      logDiagnostic('retry_scheduled', {
        strategy,
        nextAttempt: detectionAttempts + 1,
        delay: currentDelay,
        nextStrategy: strategy + '_retry'
      });
      
      setTimeout(() => tryDetection(strategy + '_retry'), currentDelay);
    } else {
      log('Maximum detection attempts reached, giving up');
      
      // Log the final failure
      logDiagnostic('detection_giving_up', {
        attempts: detectionAttempts,
        lastError: error.message,
        strategies: detectionStrategies
      });
      
      // Create a fallback minimal detection result in case messaging fails
      if (!detectionResult) {
        detectionResult = { 
          isBusinessRegistrationForm: false,
          confidenceScore: 0,
          fallbackMode: true,
          error: 'Detection failed after ' + MAX_DETECTION_ATTEMPTS + ' attempts',
          url: window.location.href,
          timestamp: new Date().toISOString(),
          diagnostics: {
            errors: diagnostics.errors,
            documentStateHistory: diagnostics.documentStates,
            strategyAttempts: { ...detectionStrategies }
          }
        };
      }
      
      // Notify background of failed detection with retry
      if (!fallbackDetectionMode) {
        sendMessageWithRetry({
          action: 'detectionFailed',
          attempts: detectionAttempts,
          url: window.location.href,
          diagnostics: {
            errors: diagnostics.errors,
            documentStateHistory: diagnostics.documentStates,
            strategyAttempts: { ...detectionStrategies }
          }
        }, response => {
          logDiagnostic('reporting', {
            action: 'detection_failed',
            success: true,
            response: response
          });
        }, error => {
          console.error('[BRA] Failed to report detection failure:', error);
          logDiagnostic('reporting', {
            action: 'detection_failed',
            success: false,
            error: error ? error.message : 'Unknown error'
          });
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
 * Send a pre-detection ping to ensure connection to background
 * @returns {Promise} Resolves when ping succeeds
 */
async function sendPreDetectionPing() {
  return new Promise((resolve, reject) => {
    // Skip if connection already established
    if (connectionEstablished) {
      resolve();
      return;
    }
    
    sendMessageWithRetry({
      action: 'ping',
      timestamp: Date.now(),
      preDetection: true
    }, response => {
      connectionEstablished = true;
      resolve(response);
    }, error => {
      // Don't reject - we'll still try to detect
      resolve(null);
    });
  });
}

/**
 * Shows a minimal visual indicator in fallback mode when messaging fails
 * @param {string} message - Message to display
 * @param {Object} options - Optional configuration
 * @param {boolean} options.showTroubleshooting - Whether to show troubleshooting steps
 * @param {number} options.duration - How long to show the indicator in ms
 * @param {string} options.errorType - Type of error for specific troubleshooting
 */
function showFallbackIndicator(message, options = {}) {
  try {
    // Record that we're showing a fallback indicator
    logDiagnostic('fallback_indicator', {
      message,
      options,
      documentState: document.readyState,
      connectionStatus: {
        established: connectionEstablished,
        attempts: connectionAttempts
      }
    });
    
    // Default options
    const config = {
      showTroubleshooting: true,
      duration: 30000, // Longer duration by default
      errorType: 'unknown',
      ...options
    };
    
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
      padding: 15px;
      border-radius: 6px;
      font-family: Arial, sans-serif;
      font-size: 13px;
      box-shadow: 0 3px 10px rgba(0,0,0,0.4);
      z-index: 9999999;
      max-width: 350px;
      line-height: 1.4;
    `;
    
    // Generate troubleshooting tips based on error type
    let troubleshootingHtml = '';
    if (config.showTroubleshooting) {
      const generalTips = `
        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.3);">
          <div style="font-weight: bold; margin-bottom: 5px;">Troubleshooting:</div>
          <ul style="margin: 5px 0 5px 15px; padding: 0;">
            <li>Try refreshing the page</li>
            <li>Check extension permissions</li>
            <li>Disable other conflicting extensions</li>
            <li>Check for Content Security Policy restrictions</li>
          </ul>
        </div>
      `;
      
      // Specific tips based on error type
      let specificTips = '';
      if (config.errorType === 'connection') {
        specificTips = `
          <div style="margin-top: 5px;">
            <div style="font-weight: bold;">Connection Issues:</div>
            <ul style="margin: 5px 0 5px 15px; padding: 0;">
              <li>Check if extension is enabled</li>
              <li>Try restarting your browser</li>
              <li>Re-install the extension</li>
            </ul>
          </div>
        `;
      } else if (config.errorType === 'module_loading') {
        specificTips = `
          <div style="margin-top: 5px;">
            <div style="font-weight: bold;">Module Loading Issues:</div>
            <ul style="margin: 5px 0 5px 15px; padding: 0;">
              <li>Check website's Content Security Policy</li>
              <li>Try reloading without cache (Ctrl+Shift+R)</li>
              <li>Check for script blockers</li>
            </ul>
          </div>
        `;
      }
      
      troubleshootingHtml = generalTips + specificTips;
    }
    
    // Add "Show Details" button
    const diagnosticDetails = JSON.stringify({
      timestamp: new Date().toISOString(),
      documentState: document.readyState,
      moduleStatus: {
        urlDetector: !!URLDetector,
        fieldDetector: !!FieldDetector
      },
      connectionStatus: {
        established: connectionEstablished,
        attempts: connectionAttempts
      },
      detectionAttempts,
      strategies: detectionStrategies,
      errors: diagnostics.errors.slice(-3) // Last 3 errors
    }, null, 2);
    
    // Add icon and content
    indicator.innerHTML = `
      <div>
        <div style="display: flex; align-items: flex-start; margin-bottom: 10px;">
          <div style="margin-right: 12px; font-size: 20px;">⚠️</div>
          <div style="flex: 1;">
            <div style="font-weight: bold; margin-bottom: 5px; font-size: 14px;">Business Registration Assistant</div>
            <div>${message}</div>
          </div>
        </div>
        ${troubleshootingHtml}
        <div style="margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
          <button id="bra-fallback-retry" style="
            background-color: white;
            color: #f44336;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
          ">Try Again</button>
          <button id="bra-fallback-details" style="
            background: none;
            border: 1px solid rgba(255,255,255,0.5);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            margin-left: 10px;
          ">Details</button>
          <div style="font-size: 11px; margin-left: 10px; cursor: pointer;" id="bra-fallback-dismiss">Dismiss</div>
        </div>
      </div>
    `;
    
    // Add to document
    document.body.appendChild(indicator);
    
    // Set up event listeners
    document.getElementById('bra-fallback-retry').addEventListener('click', function() {
      // Remove the indicator
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
      
      // Retry detection with a fresh attempt
      detectionAttempts = 0;
      fallbackDetectionMode = false;
      tryDetection('manual_retry');
    });
    
    document.getElementById('bra-fallback-details').addEventListener('click', function() {
      // Create a modal with diagnostic information
      const modalOverlay = document.createElement('div');
      modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 9999999;
      `;
      
      const modal = document.createElement('div');
      modal.style.cssText = `
        background-color: white;
        border-radius: 8px;
        width: 80%;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        padding: 20px;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.5);
        position: relative;
      `;
      
      modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <h2 style="margin: 0; font-size: 18px; color: #333;">Diagnostic Information</h2>
          <button id="bra-modal-close" style="
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #999;
          ">×</button>
        </div>
        <pre style="
          background-color: #f5f5f5;
          padding: 15px;
          border-radius: 4px;
          overflow-x: auto;
          white-space: pre-wrap;
          font-family: monospace;
          font-size: 12px;
          color: #333;
        ">${diagnosticDetails}</pre>
        <div style="margin-top: 15px; text-align: right;">
          <button id="bra-modal-copy" style="
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
          ">Copy to Clipboard</button>
        </div>
      `;
      
      modalOverlay.appendChild(modal);
      document.body.appendChild(modalOverlay);
      
      // Set up modal event listeners
      document.getElementById('bra-modal-close').addEventListener('click', function() {
        document.body.removeChild(modalOverlay);
      });
      
      document.getElementById('bra-modal-copy').addEventListener('click', function() {
        // Copy diagnostic details to clipboard
        try {
          navigator.clipboard.writeText(diagnosticDetails)
            .then(() => {
              this.textContent = 'Copied!';
              setTimeout(() => {
                this.textContent = 'Copy to Clipboard';
              }, 2000);
            })
            .catch(() => {
              // Fallback for browsers that don't support clipboard API
              const textarea = document.createElement('textarea');
              textarea.value = diagnosticDetails;
              textarea.style.position = 'fixed';
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
              
              this.textContent = 'Copied!';
              setTimeout(() => {
                this.textContent = 'Copy to Clipboard';
              }, 2000);
            });
        } catch (e) {
          this.textContent = 'Copy Failed';
          setTimeout(() => {
            this.textContent = 'Copy to Clipboard';
          }, 2000);
        }
      });
      
      // Close when clicking outside
      modalOverlay.addEventListener('click', function(e) {
        if (e.target === modalOverlay) {
          document.body.removeChild(modalOverlay);
        }
      });
    });
    
    document.getElementById('bra-fallback-dismiss').addEventListener('click', function() {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });
    
    // Auto-remove after specified duration
    setTimeout(function() {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    }, config.duration);
  } catch (e) {
    console.error('[BRA] Failed to show fallback indicator:', e.message);
    logDiagnostic('error', {
      component: 'fallback_indicator',
      error: e.message,
      stack: e.stack
    });
  }
}

/**
 * Main detection function
 */
async function detectBusinessForm() {
  log('Starting form detection');
  
  try {
    // Get current URL
    const currentUrl = window.location.href;
    
    // Make sure URLDetector is loaded
    if (!URLDetector) {
      log('Waiting for URLDetector module to load...');
      // Wait a bit and try again
      setTimeout(tryDetection, 500);
      return;
    }
    
    // Analyze different aspects of the page
    // Use the URL detector module for URL analysis
    const urlAnalysis = URLDetector.default.analyzeUrl(currentUrl);
    const urlScore = urlAnalysis.score;
    
    // Continue with other analyses
    const contentScore = analyzePageContent();
    const formScore = analyzeFormElements();
    
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
    
    // Calculate total score with weights
    const totalScore = (urlScore * 0.35) + (contentScore * 0.35) + 
                       (adjustedFormScore * 0.25) + (adaptiveScore * 0.05);
    const confidenceScore = Math.min(Math.round(totalScore), 100);
    
    // Check if it's a business form - either meets score threshold or has strong prior confirmation
    const isBusinessForm = confidenceScore >= 60 || adaptiveConfidence;
    
    // Get state from URL detector
    const state = URLDetector.default.identifyStateFromUrl(currentUrl) || identifyStateFromContent();
    
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
    
    // Create detection result with enhanced information
    detectionResult = {
      isBusinessRegistrationForm: isBusinessForm,
      confidenceScore: confidenceScore,
      state: state,
      url: currentUrl,
      urlPattern: urlPattern,
      urlRoot: urlRoot,
      formType: formType,
      specificFormDetails: specificFormDetails,
      formStructure: formStructure,
      adaptiveConfidence: adaptiveConfidence,
      forms: [], // Will be populated by field detection
      fieldAnalysis: {
        fieldDetectionComplete: false,
        totalFields: 0,
        classifiedFields: 0,
        classificationRate: 0,
        businessFields: {}
      },
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
        documentReady: document.readyState
      }
    };
    
    log('Detection result:', detectionResult);
    
    // If this is a business form, perform field detection
    if (isBusinessForm && FieldDetector) {
      try {
        // Find all forms in the page
        const formElements = document.querySelectorAll('form');
        
        if (formElements.length > 0) {
          log(`Detected ${formElements.length} form elements, analyzing fields`);
          
          // Analyze each form separately
          formElements.forEach((formElement, index) => {
            try {
              // Create detector with debug mode off by default
              const detector = new FieldDetector.default(formElement, { debug: false });
              
              // Log form details
              log(`Analyzing form ${index + 1}:`, {
                id: formElement.id || '(no id)',
                classes: Array.from(formElement.classList || []),
                action: formElement.action || '(no action)',
                method: formElement.method || 'get',
                size: {
                  width: formElement.offsetWidth,
                  height: formElement.offsetHeight
                }
              });
              
              // Detect fields
              const fields = detector.detectFields();
              log(`Form ${index + 1}: Detected ${fields.length} fields`);
              
              // Classify fields based on business registration patterns
              const classificationResults = detector.classifyFields();
              log(`Form ${index + 1}: Classified ${classificationResults.classifiedFields} of ${fields.length} fields`);
              
              // Get a summary of classified fields with relationship information
              const classSummary = detector.getClassificationSummary();
              
              // Log any field relationships found
              const fieldsWithRelationships = fields.filter(f => 
                f.classification && 
                f.classification.relationships && 
                f.classification.relationships.length > 0
              );
              
              if (fieldsWithRelationships.length > 0) {
                log(`Form ${index + 1}: Found ${fieldsWithRelationships.length} fields with relationships`);
              }
              
              // Add form to detection result for further analysis
              if (!detectionResult.forms) {
                detectionResult.forms = [];
              }
              
              detectionResult.forms.push({
                index: index,
                id: formElement.id || null,
                action: formElement.action || null,
                method: formElement.method || 'get',
                fieldCount: fields.length,
                fieldClassification: {
                  classifiedCount: classSummary.classifiedFields,
                  classificationRate: classSummary.classificationRate,
                  categories: classSummary.categories,
                  relationships: classSummary.relationships || {}
                },
                // Include export data for more detailed analysis if needed
                detectionData: detector.exportDetectionData()
              });
            } catch (formFieldError) {
              reportError(formFieldError, `fieldDetection_form_${index}`, false);
            }
          });
        } else {
          // No explicit form elements, try to detect fields in the document body
          log('No explicit form elements found, scanning entire document for fields');
          
          try {
            // Create detector with debug mode off by default
            const detector = new FieldDetector.default(document.body, { debug: false });
            
            // Detect fields
            const fields = detector.detectFields();
            log(`Detected ${fields.length} fields in document body`);
            
            // Classify fields based on business registration patterns
            const classificationResults = detector.classifyFields();
            log(`Classified ${classificationResults.classifiedFields} of ${fields.length} fields in document body`);
            
            // Get a summary of classified fields
            const classSummary = detector.getClassificationSummary();
            
            // Log any field relationships found
            const fieldsWithRelationships = fields.filter(f => 
              f.classification && 
              f.classification.relationships && 
              f.classification.relationships.length > 0
            );
            
            if (fieldsWithRelationships.length > 0) {
              log(`Document body: Found ${fieldsWithRelationships.length} fields with relationships`);
            }
            
            // Add form to detection result for further analysis
            if (!detectionResult.forms) {
              detectionResult.forms = [];
            }
            
            // Create a virtual form entry for the implicit form
            detectionResult.forms.push({
              index: 0,
              id: null,
              action: window.location.href,
              method: 'virtual',
              fieldCount: fields.length,
              isImplicit: true,
              fieldClassification: {
                classifiedCount: classSummary.classifiedFields,
                classificationRate: classSummary.classificationRate,
                categories: classSummary.categories,
                relationships: classSummary.relationships || {}
              },
              // Include export data for more detailed analysis if needed
              detectionData: detector.exportDetectionData()
            });
            
            // Enable debug mode if a significant number of fields were found
            if (fields.length > 5) {
              log('Significant number of fields found, enabling detailed debug logging...');
              detector.setDebugMode(true);
              detector.detectFields(); // Run detection again with debug mode
            }
          } catch (bodyFieldError) {
            reportError(bodyFieldError, 'bodyFieldDetection', false);
          }
        }
      } catch (fieldDetectionError) {
        reportError(fieldDetectionError, 'fieldDetection', false);
      }
      
      // Update the overall field analysis summary
      if (detectionResult.forms && detectionResult.forms.length > 0) {
        try {
          // Calculate total fields
          let totalFields = 0;
          let totalClassifiedFields = 0;
          const businessFields = {};
          
          // Process each form's classification data
          detectionResult.forms.forEach(form => {
            if (!form.fieldClassification) return;
            
            totalFields += form.fieldCount;
            totalClassifiedFields += form.fieldClassification.classifiedCount;
            
            // Merge categories from each form
            if (form.fieldClassification.categories) {
              Object.entries(form.fieldClassification.categories).forEach(([category, data]) => {
                if (!businessFields[category]) {
                  businessFields[category] = { count: 0, highConfidence: 0 };
                }
                businessFields[category].count += data.count;
                businessFields[category].highConfidence += data.highConfidence;
              });
            }
          });
          
          // Update the field analysis in the detection result
          detectionResult.fieldAnalysis = {
            fieldDetectionComplete: true,
            totalFields,
            classifiedFields: totalClassifiedFields,
            classificationRate: totalFields > 0 ? Math.round((totalClassifiedFields / totalFields) * 100) : 0,
            businessFields,
            // Add relationship information to field analysis
            relationships: {}
          };
          
          // Aggregate relationship data from all forms
          detectionResult.forms.forEach(form => {
            if (form.fieldClassification && form.fieldClassification.relationships) {
              const relationships = form.fieldClassification.relationships;
              
              // Merge relationships into the overall analysis
              Object.entries(relationships).forEach(([relType, relData]) => {
                if (!detectionResult.fieldAnalysis.relationships[relType]) {
                  detectionResult.fieldAnalysis.relationships[relType] = {
                    count: 0,
                    categories: {}
                  };
                }
                
                // Increment count
                detectionResult.fieldAnalysis.relationships[relType].count += relData.count;
                
                // Merge categories
                Object.entries(relData.categories).forEach(([category, count]) => {
                  if (!detectionResult.fieldAnalysis.relationships[relType].categories[category]) {
                    detectionResult.fieldAnalysis.relationships[relType].categories[category] = 0;
                  }
                  detectionResult.fieldAnalysis.relationships[relType].categories[category] += count;
                });
              });
            }
          });
          
          // If we have significant field matches, increase confidence score
          if (totalClassifiedFields > 5) {
            const additionalConfidence = Math.min(10, totalClassifiedFields);
            detectionResult.confidenceScore = Math.min(100, detectionResult.confidenceScore + additionalConfidence);
            log(`Increased confidence score by ${additionalConfidence} based on field classification`);
          }
          
          // Further increase confidence if we detected field relationships
          const hasRelationships = Object.keys(detectionResult.fieldAnalysis.relationships).length > 0;
          if (hasRelationships) {
            const relationshipCount = Object.values(detectionResult.fieldAnalysis.relationships)
              .reduce((sum, rel) => sum + rel.count, 0);
            
            const relationshipConfidence = Math.min(5, Math.floor(relationshipCount / 2));
            if (relationshipConfidence > 0) {
              detectionResult.confidenceScore = Math.min(100, detectionResult.confidenceScore + relationshipConfidence);
              log(`Increased confidence score by ${relationshipConfidence} based on field relationships`);
            }
          }
          
          log('Final field analysis:', detectionResult.fieldAnalysis);
        } catch (analysisError) {
          reportError(analysisError, 'fieldAnalysisSummary', false);
        }
      }
    }
    
    // Send to background script with error handling
    chrome.runtime.sendMessage({
      action: 'formDetected',
      result: detectionResult
    }).catch(error => {
      reportError(error, 'sendingDetectionResult', true);
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
      'submit online', 'file online', 'electronic filing', 'e-file'
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
        { pattern: /business.{0,10}tax/i, points: 10 }
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
function analyzeFormElements() {
  try {
    let score = 0;
    let diagnosticInfo = {}; // Store detailed analysis for debugging
    
    // Check if document.body exists
    if (!document.body) {
      log('Document body not available yet, returning partial form score');
      return 0;
    }
    
    // Look for forms and interactive elements
    const forms = document.querySelectorAll('form');
    const formCount = forms.length;
    
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
    
    // Field patterns organized by category for better matching
    const fieldPatterns = {
      // Business identity fields
      businessIdentity: [
        'business', 'company', 'entity', 'organization', 'business-name',
        'company-name', 'entity-name', 'organization-name', 'legal-name',
        'commercial-name', 'trade-name', 'dba', 'doing-business-as',
        'fictitious-name', 'assumed-name'
      ],
      
      // Entity type and structure fields
      entityType: [
        'entity-type', 'business-type', 'organization-type', 'company-type',
        'structure', 'business-structure', 'entity-structure',
        'llc', 'corporation', 'partnership', 'sole-proprietorship',
        'nonprofit', 'professional', 'domestic', 'foreign',
        'profit', 'benefit', 'public-benefit', 'purpose'
      ],
      
      // Contact and address fields in business context
      contactAddress: [
        'principal', 'address', 'business-address', 'mailing-address',
        'registered-office', 'principal-office', 'principal-place',
        'physical-address', 'headquarters', 'place-of-business',
        'county', 'state', 'jurisdiction', 'zip', 'postal',
        'phone', 'email', 'contact', 'business-phone', 'business-email'
      ],
      
      // Agent and representative fields
      agentRepresentative: [
        'agent', 'registered-agent', 'resident-agent', 'statutory-agent',
        'organizer', 'incorporator', 'member', 'manager', 'director',
        'officer', 'authorized-person', 'authorized-representative',
        'owner', 'president', 'secretary', 'treasurer', 'partner',
        'service-of-process', 'executor'
      ],
      
      // Filing and registration fields
      filingRegistration: [
        'filing', 'form', 'register', 'registration', 'application',
        'file', 'submit', 'filing-type', 'filing-number', 'entity-number',
        'business-id', 'entity-id', 'business-number', 'confirmation',
        'file-number', 'document-number', 'control-number', 'document-type',
        'application-type', 'application-number'
      ],
      
      // Formation document fields
      formationDocuments: [
        'articles', 'articles-of-organization', 'articles-of-incorporation',
        'certificate', 'certificate-of-formation', 'operating-agreement',
        'bylaws', 'statement', 'statement-of-information', 'annual-report',
        'formation', 'organization', 'incorporation', 'date-of-formation'
      ],
      
      // Tax and financial fields
      taxFinancial: [
        'ein', 'tax-id', 'tax-identification', 'employer-identification',
        'federal-id', 'federal-tax-id', 'fein', 'ssn', 'social-security',
        'tax', 'taxes', 'fiscal', 'fiscal-year', 'naics', 'sic-code',
        'business-activity', 'business-purpose', 'sales-tax', 'withholding',
        'revenue', 'accounting', 'fiscal-year-end'
      ],
      
      // Payment and fee fields
      paymentFees: [
        'fee', 'payment', 'amount', 'cost', 'price', 'total',
        'credit-card', 'card', 'transaction', 'pay', 'checkout',
        'billing', 'invoice', 'receipt', 'confirmation', 'expedite',
        'service-fee', 'filing-fee', 'processing-fee', 'expedite-fee'
      ],
      
      // Authorization and acknowledgment fields
      authorizationAcknowledgment: [
        'signature', 'sign', 'consent', 'acknowledge', 'declaration',
        'certify', 'attest', 'affirm', 'authorization', 'verify',
        'confirm', 'agreement', 'terms', 'conditions', 'perjury',
        'electronic-signature', 'date-signed', 'executed', 'date-executed'
      ]
    };
    
    // Flatten patterns for matching with tracking of categories
    const flattenedPatterns = {};
    for (const category in fieldPatterns) {
      for (const pattern of fieldPatterns[category]) {
        flattenedPatterns[pattern] = category;
      }
    }
    
    // Check for business registration field patterns
    const allFields = Array.from(document.querySelectorAll('input, select, textarea, [contenteditable="true"]'));
    
    // Track matches by category
    const categoryMatches = {};
    for (const category in fieldPatterns) {
      categoryMatches[category] = 0;
    }
    
    // Record fields with business-related attributes
    const matchedFieldDetails = [];
    
    // Process each field
    allFields.forEach(field => {
      // Get all possible field identifiers
      const name = field.name ? field.name.toLowerCase() : '';
      const id = field.id ? field.id.toLowerCase() : '';
      const className = field.className ? field.className.toLowerCase() : '';
      const placeholder = field.placeholder ? field.placeholder.toLowerCase() : '';
      const ariaLabel = field.getAttribute('aria-label') ? field.getAttribute('aria-label').toLowerCase() : '';
      
      // Get associated label
      let labelText = '';
      if (field.labels && field.labels.length > 0) {
        labelText = field.labels[0].textContent.toLowerCase();
      } else if (field.id) {
        const associatedLabel = document.querySelector(`label[for="${field.id}"]`);
        if (associatedLabel) {
          labelText = associatedLabel.textContent.toLowerCase();
        }
      }
      
      // Look for fields near the element that might be labels
      if (!labelText) {
        // Check sibling or parent elements for text that might be labels
        const parent = field.parentElement;
        if (parent) {
          const siblingLabels = parent.querySelectorAll('label, div, span, p');
          for (const sibling of siblingLabels) {
            if (sibling !== field && sibling.textContent.trim()) {
              labelText = sibling.textContent.toLowerCase();
              break;
            }
          }
        }
      }
      
      // Check for matches in all possible field identifiers
      for (const pattern in flattenedPatterns) {
        const category = flattenedPatterns[pattern];
        
        // Use regex for better boundary matching
        const regex = new RegExp(`\\b${pattern.replace(/-/g, '[\\s-]')}\\b`, 'i');
        
        // Check all field identifiers for matches
        if (regex.test(name) || regex.test(id) || regex.test(placeholder) || 
            regex.test(labelText) || regex.test(ariaLabel) || regex.test(className)) {
          
          // Record the match
          categoryMatches[category]++;
          
          // Store details for diagnostic purposes
          matchedFieldDetails.push({
            pattern: pattern,
            category: category,
            fieldType: field.tagName.toLowerCase() + (field.type ? `[${field.type}]` : ''),
            matchedOn: [
              name && regex.test(name) ? 'name' : null,
              id && regex.test(id) ? 'id' : null,
              placeholder && regex.test(placeholder) ? 'placeholder' : null,
              labelText && regex.test(labelText) ? 'label' : null,
              ariaLabel && regex.test(ariaLabel) ? 'aria-label' : null,
              className && regex.test(className) ? 'class' : null
            ].filter(Boolean).join(',')
          });
          
          break; // Count each field only once
        }
      }
    });
    
    // Store matching info
    diagnosticInfo.matchedCategories = categoryMatches;
    diagnosticInfo.matchedFieldCount = Object.values(categoryMatches).reduce((sum, count) => sum + count, 0);
    diagnosticInfo.matchedFields = matchedFieldDetails;
    
    // Score based on field categories detected
    const categoryCount = Object.keys(categoryMatches).filter(
      cat => categoryMatches[cat] > 0
    ).length;
    
    // The more diverse categories of business fields, the stronger the signal
    if (categoryCount >= 5) score += 30; // Very strong signal
    else if (categoryCount >= 3) score += 20; // Strong signal
    else if (categoryCount >= 2) score += 10; // Moderate signal
    
    // Additional points for key categories that strongly indicate business registration
    if (categoryMatches.entityType > 0) score += 15;
    if (categoryMatches.filingRegistration > 0) score += 15;
    if (categoryMatches.formationDocuments > 0) score += 15;
    if (categoryMatches.taxFinancial > 0) score += 10;
    
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
    
    return Math.min(score, 100);
  } catch (error) {
    reportError(error, 'analyzeFormElements');
    return 0; // Return 0 score if analysis fails
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

// Listen for messages from popup, panel, or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Message received:', message.action);
  
  try {
    // Record this message in diagnostics
    logDiagnostic('message_received', {
      action: message.action,
      messageId: message.messageId,
      timestamp: new Date().toISOString(),
      sender: sender.id ? { id: sender.id } : 'unknown'
    });
    
    // Mark that we have a connection
    connectionEstablished = true;
    connectionAttempts = 0;
    
    if (message.action === 'getDetectionResult') {
      // Return current detection
      const response = detectionResult || { 
        isBusinessRegistrationForm: false, 
        error: 'No detection result available',
        attempts: detectionAttempts,
        fallbackMode: fallbackDetectionMode
      };
      
      // Log response
      logDiagnostic('message_response', {
        action: message.action,
        responseType: detectionResult ? 'result' : 'no_result',
        timestamp: new Date().toISOString()
      });
      
      sendResponse(response);
    }
    else if (message.action === 'triggerDetection') {
      // Log this action
      logDiagnostic('manual_detection', {
        previousState: {
          hadResult: !!detectionResult,
          attempts: detectionAttempts,
          fallbackMode: fallbackDetectionMode
        }
      });
      
      // Reset detection state
      detectionResult = null;
      detectionAttempts = 0;
      fallbackDetectionMode = false; // Try normal mode again
      
      // Run detection again
      tryDetection('manual');
      
      // Send response
      sendResponse({ 
        success: true, 
        message: 'Detection triggered',
        fallbackMode: fallbackDetectionMode
      });
    }
    else if (message.action === 'getDetectionStatus') {
      // Prepare detailed status response
      const statusResponse = {
        hasResult: !!detectionResult,
        attempts: detectionAttempts,
        maxAttempts: MAX_DETECTION_ATTEMPTS,
        documentReady: document.readyState,
        documentStates: diagnostics.documentStates.slice(-3), // Last 3 states
        connectionEstablished: connectionEstablished,
        fallbackMode: fallbackDetectionMode,
        errors: window.BRA_Errors || [],
        moduleStatus: {
          urlDetector: !!URLDetector,
          fieldDetector: !!FieldDetector
        },
        strategies: { ...detectionStrategies }
      };
      
      // Log status check
      logDiagnostic('status_request', {
        hasResult: statusResponse.hasResult,
        documentReady: statusResponse.documentReady
      });
      
      // Return current detection status
      sendResponse(statusResponse);
    }
    else if (message.action === 'ping') {
      // Check if this ping has diagnostic info
      if (message.diagnosticInfo) {
        // Store this info about the connection state from the background's perspective
        diagnostics.backgroundPerspective = message.diagnosticInfo;
        
        logDiagnostic('ping_with_diagnostics', {
          backgroundData: message.diagnosticInfo,
          timestamp: new Date().toISOString()
        });
      }
      
      // Respond to ping with current status
      sendResponse({
        alive: true,
        timestamp: Date.now(),
        messageId: message.messageId,
        preDetection: message.preDetection,
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
        logDiagnostic('user_feedback', {
          feedback: message.feedback
        });
        
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
    else if (message.action === 'getDiagnostics') {
      // Return full diagnostic information
      sendResponse({
        success: true,
        diagnostics: diagnostics,
        detectionStrategies: detectionStrategies,
        detectionResult: detectionResult ? {
          isBusinessRegistrationForm: detectionResult.isBusinessRegistrationForm,
          confidenceScore: detectionResult.confidenceScore,
          state: detectionResult.state,
          formType: detectionResult.formType,
          timestamp: detectionResult.timestamp,
          fieldSummary: detectionResult.fieldAnalysis
        } : null,
        status: {
          documentReady: document.readyState,
          bodyExists: !!document.body,
          connectionEstablished: connectionEstablished,
          fallbackMode: fallbackDetectionMode,
          attempts: detectionAttempts
        },
        modules: {
          urlDetector: !!URLDetector,
          fieldDetector: !!FieldDetector
        }
      });
    }
    else if (message.action === 'enableDebugMode') {
      // Enable debug mode
      window.BRA_DEBUG = true;
      
      logDiagnostic('debug_mode', {
        enabled: true,
        timestamp: new Date().toISOString()
      });
      
      // If field detector exists, enable its debug mode too
      if (FieldDetector) {
        // Force redetection with debug mode if we have a form and a result
        if (detectionResult && document.forms.length > 0) {
          try {
            const detector = new FieldDetector.default(document.forms[0], { debug: true });
            detector.detectFields();
            detector.classifyFields();
            detector.highlightFields(false, {
              showLabels: true,
              showRelationships: true,
              duration: 20000
            });
          } catch (debugError) {
            console.error('[BRA] Error in debug mode field detection:', debugError);
          }
        }
      }
      
      sendResponse({
        success: true,
        message: 'Debug mode enabled',
        diagnosticsAvailable: true
      });
    }
    else if (message.action === 'debugFieldDetection') {
      // Run field detection with debug mode enabled
      try {
        log('Running field detection in debug mode');
        
        const formElements = document.querySelectorAll('form');
        
        if (formElements.length > 0) {
          // Analyze specified form or first form
          const formIndex = message.formIndex || 0;
          const formElement = formElements[Math.min(formIndex, formElements.length - 1)];
          
          const detector = new FieldDetector.default(formElement, { debug: true });
          const fields = detector.detectFields();
          
          // Call additional detailed logging methods
          detector.logValidationStatus();
          
          // Classify fields and get detailed analysis
          const classificationResults = detector.classifyFields();
          
          // Visual debugging - highlight fields on the page
          const shouldHighlight = message.highlight !== false; // Default to true
          if (shouldHighlight) {
            // Use enhanced highlighting options
            detector.highlightFields(false, {
              showLabels: true,
              showRelationships: true,
              duration: 20000 // Longer duration for debug mode
            });
          }
          
          sendResponse({
            success: true,
            message: `Debug field detection completed for form ${formIndex}`,
            fieldCount: fields.length,
            classifiedCount: classificationResults.classifiedFields,
            classificationRate: Math.round((classificationResults.classifiedFields / fields.length) * 100),
            formInfo: {
              id: formElement.id || null,
              action: formElement.action || null,
              method: formElement.method || 'get'
            },
            classification: detector.getClassificationSummary(),
            detectionData: detector.exportDetectionData()
          });
        } else {
          // No forms, analyze body
          const detector = new FieldDetector.default(document.body, { debug: true });
          const fields = detector.detectFields();
          
          // Call additional detailed logging methods
          detector.logValidationStatus();
          
          // Classify fields and get detailed analysis
          const classificationResults = detector.classifyFields();
          
          // Visual debugging - highlight fields on the page
          const shouldHighlight = message.highlight !== false; // Default to true
          if (shouldHighlight) {
            // Use enhanced highlighting options
            detector.highlightFields(false, {
              showLabels: true,
              showRelationships: true,
              duration: 20000 // Longer duration for debug mode
            });
          }
          
          sendResponse({
            success: true,
            message: 'Debug field detection completed for document body',
            fieldCount: fields.length,
            classifiedCount: classificationResults.classifiedFields,
            classificationRate: Math.round((classificationResults.classifiedFields / fields.length) * 100),
            classification: detector.getClassificationSummary(),
            detectionData: detector.exportDetectionData()
          });
        }
      } catch (error) {
        reportError(error, 'debugFieldDetection', false);
        sendResponse({
          success: false,
          error: error.message
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
initializeDetection();