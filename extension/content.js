/**
 * Business Registration Assistant - Content Script
 * Implementation that detects business registration forms
 */

// Import URL detector module
let URLDetector;
(async () => {
  URLDetector = await import(chrome.runtime.getURL('modules/urlDetector.js'));
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
 * Reports an error to the background script
 * @param {Error} error - The error that occurred
 * @param {string} context - Context where the error occurred
 * @param {boolean} isFatal - Whether the error is fatal and should be shown to the user
 */
function reportError(error, context, isFatal = false) {
  console.error('[BRA] Error in ' + context + ':', error);
  
  // Create error object once to reuse
  const errorData = {
    action: 'detectionError',
    error: {
      message: error.message,
      stack: error.stack,
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
    
    // Send the message
    chrome.runtime.sendMessage(message, function(response) {
      // Check for error
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError;
        
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
      
      // Clean up
      delete pendingMessageCallbacks[messageId];
      
      // Mark that we've established connection at least once
      connectionEstablished = true;
      connectionAttempts = 0;
    });
  } catch (e) {
    // Local error in sending
    console.error('[BRA] Error sending message:', e.message);
    
    // Call error callback
    if (errorCallback) {
      errorCallback(e);
    }
    
    // Report error unless this is already a report error call
    if (message.action !== 'detectionError') {
      reportError(e, 'messageSend');
    }
  }
}

/**
 * Initialize detection with multiple loading strategies
 */
function initializeDetection() {
  log('Initializing content script with improved loading strategy');
  
  // Wait a bit to ensure the module is loaded
  setTimeout(() => {
    // Strategy 1: Try at document_end (set in manifest)
    tryDetection();
    
    // Strategy 2: Wait for load event
    if (document.readyState === 'complete') {
      tryDetection();
    } else {
      window.addEventListener('load', () => {
        log('Window load event fired');
        tryDetection();
      });
    }
    
    // Strategy 3: Delayed execution for slow-loading pages
    setTimeout(() => {
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
  // Avoid redundant detections if we already have a result
  if (detectionResult) {
    log('Detection already completed, skipping');
    return;
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
      // Reset detection state
      detectionResult = null;
      detectionAttempts = 0;
      fallbackDetectionMode = false; // Try normal mode again
      
      // Run detection again
      tryDetection();
      sendResponse({ 
        success: true, 
        message: 'Detection triggered',
        fallbackMode: fallbackDetectionMode
      });
    }
    else if (message.action === 'getDetectionStatus') {
      // Return current detection status
      sendResponse({
        hasResult: !!detectionResult,
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