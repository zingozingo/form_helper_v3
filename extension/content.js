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
const MAX_DETECTION_ATTEMPTS = 3;
const RETRY_DELAY = 2000; // ms

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
  console.error(`[BRA] Error in ${context}:`, error);
  
  try {
    chrome.runtime.sendMessage({
      action: 'detectionError',
      error: {
        message: error.message,
        stack: error.stack,
        context: context,
        isFatal: isFatal,
        timestamp: new Date().toISOString(),
        url: window.location.href
      }
    });
  } catch (e) {
    // If we can't report the error, log it locally
    console.error('[BRA] Failed to report error:', e);
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
  // Observe DOM changes for dynamic content loading
  const observer = new MutationObserver((mutations) => {
    // Look for significant DOM changes that might indicate form loading
    const significantChanges = mutations.some(mutation => 
      mutation.addedNodes.length > 0 && 
      Array.from(mutation.addedNodes).some(node => 
        node.nodeType === Node.ELEMENT_NODE && 
        (node.tagName === 'FORM' || 
         node.querySelector('form, input, select, textarea')))
    );
    
    if (significantChanges) {
      log('Significant DOM changes detected, triggering detection');
      tryDetection();
      
      // After a certain amount of time, disconnect the observer
      if (detectionResult || detectionAttempts >= MAX_DETECTION_ATTEMPTS) {
        observer.disconnect();
        log('MutationObserver disconnected after successful detection or max attempts');
      }
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
    observer.disconnect();
    log('MutationObserver disconnected after timeout');
  }, 30000); // 30 seconds max
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
  log(`Detection attempt ${detectionAttempts}/${MAX_DETECTION_ATTEMPTS}`);
  
  // Attempt detection
  try {
    await detectBusinessForm();
  } catch (error) {
    reportError(error, 'tryDetection', detectionAttempts >= MAX_DETECTION_ATTEMPTS);
    
    // Retry if we haven't exceeded max attempts
    if (detectionAttempts < MAX_DETECTION_ATTEMPTS) {
      log(`Will retry detection in ${RETRY_DELAY}ms`);
      setTimeout(tryDetection, RETRY_DELAY);
    } else {
      log('Maximum detection attempts reached, giving up');
      // Notify background of failed detection
      chrome.runtime.sendMessage({
        action: 'detectionFailed',
        attempts: detectionAttempts,
        url: window.location.href
      }).catch(e => console.error('[BRA] Failed to report detection failure:', e));
    }
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
    
    // Calculate total score
    const totalScore = (urlScore * 0.4) + (contentScore * 0.4) + (formScore * 0.2);
    const confidenceScore = Math.min(Math.round(totalScore), 100);
    
    // Check if it's a business form
    const isBusinessForm = confidenceScore >= 60;
    
    // Get state from URL detector
    const state = URLDetector.default.identifyStateFromUrl(currentUrl) || identifyStateFromContent();
    
    // Create detection result
    detectionResult = {
      isBusinessRegistrationForm: isBusinessForm,
      confidenceScore: confidenceScore,
      state: state,
      url: currentUrl,
      details: {
        urlScore,
        contentScore,
        formScore,
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
    
    // Check for business entity terms
    const entityTerms = [
      'llc', 'limited liability company',
      'corporation', 'incorporated',
      'partnership', 'sole proprietorship', 
      'doing business as', 'dba',
      'entity', 'foreign entity',
      'nonprofit', 'benefit corporation',
      'public benefit corporation', 'pbc',
      'articles of organization', 'articles of incorporation',
      'operating agreement', 'business filing',
      'business entity', 'formation document'
    ];
    
    for (const term of entityTerms) {
      if (pageText.includes(term)) {
        score += 5;
      }
    }
    
    // Check for registration terms
    const registrationTerms = [
      'business registration', 'register a business',
      'business license', 'articles of organization',
      'articles of incorporation', 'business formation',
      'file a', 'certificate of formation',
      'certificate of organization', 'fictitious name',
      'trade name', 'assumed name',
      'register your', 'new business',
      'start a business', 'filing fee'
    ];
    
    for (const term of registrationTerms) {
      if (pageText.includes(term)) {
        score += 10;
      }
    }
    
    // Check for common registration-related heading text
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
      const headingText = heading.textContent.toLowerCase();
      if (headingText.includes('register') && 
          (headingText.includes('business') || headingText.includes('entity'))) {
        score += 15;
      }
      
      if (headingText.includes('form') && 
          (headingText.includes('llc') || headingText.includes('corporation'))) {
        score += 15;
      }
    });
    
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
    
    // Check if document.body exists
    if (!document.body) {
      log('Document body not available yet, returning partial form score');
      return 0;
    }
    
    // Check for forms
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) {
      score += 20;
    } else {
      // Check for input fields - some forms might not use <form> tags
      const inputs = document.querySelectorAll('input, select, textarea');
      if (inputs.length >= 3) {
        score += 10;
      }
    }
    
    // Check for business registration field patterns
    const allFields = document.querySelectorAll('input, select, textarea');
    const fieldPatterns = [
      'business', 'company', 'entity', 'name',
      'type', 'owner', 'address', 'register',
      'entity', 'formation', 'filing', 'incorporate',
      'articles', 'organization', 'certificate',
      'agent', 'registered', 'principal', 'office',
      'domestic', 'foreign', 'signature', 'fee',
      'payment', 'ein', 'tax', 'id', 'federal'
    ];
    
    let matchedFields = 0;
    
    allFields.forEach(field => {
      const name = field.name ? field.name.toLowerCase() : '';
      const id = field.id ? field.id.toLowerCase() : '';
      const placeholder = field.placeholder ? field.placeholder.toLowerCase() : '';
      const label = field.labels && field.labels[0] ? field.labels[0].textContent.toLowerCase() : '';
      
      for (const pattern of fieldPatterns) {
        if (name.includes(pattern) || id.includes(pattern) || 
            placeholder.includes(pattern) || label.includes(pattern)) {
          matchedFields++;
          break;
        }
      }
    });
    
    // Add score based on matched fields
    if (matchedFields >= 3) score += 20;
    if (matchedFields >= 5) score += 20;
    
    // Check for labels related to business registration
    const labels = document.querySelectorAll('label');
    const labelTerms = ['business name', 'entity type', 'registered agent', 'principal address'];
    let labelMatches = 0;
    
    labels.forEach(label => {
      const labelText = label.textContent.toLowerCase();
      for (const term of labelTerms) {
        if (labelText.includes(term)) {
          labelMatches++;
          break;
        }
      }
    });
    
    if (labelMatches >= 2) score += 15;
    
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

// Listen for messages from popup, panel, or background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Message received:', message.action);
  
  try {
    if (message.action === 'getDetectionResult') {
      // Return current detection
      sendResponse(detectionResult || { 
        isBusinessRegistrationForm: false, 
        error: 'No detection result available',
        attempts: detectionAttempts
      });
    }
    else if (message.action === 'triggerDetection') {
      // Reset detection state
      detectionResult = null;
      detectionAttempts = 0;
      
      // Run detection again
      tryDetection();
      sendResponse({ success: true, message: 'Detection triggered' });
    }
    else if (message.action === 'getDetectionStatus') {
      // Return current detection status
      sendResponse({
        hasResult: !!detectionResult,
        attempts: detectionAttempts,
        maxAttempts: MAX_DETECTION_ATTEMPTS,
        documentReady: document.readyState
      });
    }
  } catch (error) {
    reportError(error, 'messageHandler');
    sendResponse({ error: error.message });
  }
  
  return true; // Keep message channel open
});

// Initialize when the content script loads
initializeDetection();