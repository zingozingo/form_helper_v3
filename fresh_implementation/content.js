/**
 * Business Registration Assistant - Content Script
 * Simple implementation focused on form detection
 */

// Global variables
let detectionResult = null;

// Simple logger for debugging
function log(message, data) {
  const prefix = '[Form Helper]';
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  log('Content script loaded');
  // Wait a bit for the page to fully render
  setTimeout(detectForm, 1000);
});

/**
 * Main form detection function
 */
function detectForm() {
  try {
    log('Starting form detection');
    detectionResult = analyzeCurrentPage();
    
    // Send results to background script
    chrome.runtime.sendMessage({
      action: 'formDetected',
      result: detectionResult
    }, () => {
      if (chrome.runtime.lastError) {
        log('Error sending detection result:', chrome.runtime.lastError);
      }
    });
    
    log('Detection complete:', detectionResult);
  } catch (error) {
    console.error('Error detecting form:', error);
  }
}

/**
 * Analyze the current page for business registration forms
 * @returns {Object} Detection result with confidence score
 */
function analyzeCurrentPage() {
  try {
    // Get current URL
    const currentUrl = window.location.href;
    
    // Analyze different aspects of the page
    const urlScore = analyzeUrl(currentUrl);
    const contentScore = analyzePageContent();
    const formScore = analyzeFormElements();
    
    // Calculate weighted total score
    const totalScore = (urlScore * 0.4) + (contentScore * 0.4) + (formScore * 0.2);
    const normalizedScore = Math.min(Math.round(totalScore), 100);
    
    // Determine if this is a business registration form
    const confidenceThreshold = 60;
    const isBusinessForm = normalizedScore >= confidenceThreshold;
    
    // Try to identify the state
    const state = identifyState();
    
    // Return simplified result
    return {
      isBusinessRegistrationForm: isBusinessForm,
      confidenceScore: normalizedScore,
      state: state,
      url: currentUrl,
      details: {
        urlScore,
        contentScore,
        formScore
      }
    };
  } catch (error) {
    console.error('Error in form analysis:', error);
    return {
      isBusinessRegistrationForm: false,
      confidenceScore: 0,
      error: error.message
    };
  }
}

/**
 * Analyze the URL for patterns suggesting business registration
 */
function analyzeUrl(url) {
  try {
    let score = 0;
    const lowerUrl = url.toLowerCase();
    
    // Check for government domains
    if (lowerUrl.includes('.gov')) {
      score += 25;
    }
    
    // Check for business-related terms in URL
    const terms = [
      'business', 'register', 'registration', 'license',
      'permit', 'corporation', 'llc', 'entity'
    ];
    
    for (const term of terms) {
      if (lowerUrl.includes(term)) {
        score += 5;
        if (score >= 70) break;
      }
    }
    
    return Math.min(score, 100);
  } catch (error) {
    console.error('URL analysis error:', error);
    return 0;
  }
}

/**
 * Analyze page content for business registration keywords
 */
function analyzePageContent() {
  try {
    let score = 0;
    
    // Get the text content of the page
    const pageText = document.body.textContent.toLowerCase();
    
    // Check for business entity terms
    const entityTerms = [
      'llc', 'limited liability company',
      'corporation', 'incorporated',
      'partnership', 'sole proprietorship', 
      'doing business as'
    ];
    
    for (const term of entityTerms) {
      if (pageText.includes(term)) {
        score += 5;
      }
    }
    
    // Check for registration-related terms
    const registrationTerms = [
      'business registration', 'register a business',
      'business license', 'articles of organization',
      'articles of incorporation', 'business formation'
    ];
    
    for (const term of registrationTerms) {
      if (pageText.includes(term)) {
        score += 10;
      }
    }
    
    return Math.min(score, 100);
  } catch (error) {
    console.error('Content analysis error:', error);
    return 0;
  }
}

/**
 * Analyze form elements for registration-specific patterns
 */
function analyzeFormElements() {
  try {
    let score = 0;
    
    // Check if the page has forms
    const forms = document.querySelectorAll('form');
    
    if (forms.length > 0) {
      score += 20;
    } else {
      // Check for groups of input fields that might be forms
      const inputs = document.querySelectorAll('input, select, textarea');
      if (inputs.length >= 3) {
        score += 10;
      }
    }
    
    // Check for business registration field patterns
    const allFields = document.querySelectorAll('input, select, textarea');
    const fieldPatterns = [
      'business', 'company', 'entity', 'name',
      'type', 'owner', 'address', 'register'
    ];
    
    let matchedFields = 0;
    
    allFields.forEach(field => {
      const name = field.name ? field.name.toLowerCase() : '';
      const id = field.id ? field.id.toLowerCase() : '';
      const placeholder = field.placeholder ? field.placeholder.toLowerCase() : '';
      
      for (const pattern of fieldPatterns) {
        if (name.includes(pattern) || id.includes(pattern) || placeholder.includes(pattern)) {
          matchedFields++;
          break;
        }
      }
    });
    
    // Add score based on matched fields
    if (matchedFields >= 3) score += 20;
    if (matchedFields >= 5) score += 20;
    
    return Math.min(score, 100);
  } catch (error) {
    console.error('Form elements analysis error:', error);
    return 0;
  }
}

/**
 * Identify which state the form is for (simplified)
 */
function identifyState() {
  try {
    const url = window.location.href.toLowerCase();
    
    // Simple URL-based state detection
    if (url.includes('.ca.gov') || url.includes('california')) return 'CA';
    if (url.includes('.ny.gov') || url.includes('newyork') || url.includes('new-york')) return 'NY';
    if (url.includes('.tx.gov') || url.includes('texas')) return 'TX';
    if (url.includes('.fl.gov') || url.includes('florida')) return 'FL';
    if (url.includes('.de.gov') || url.includes('delaware')) return 'DE';
    if (url.includes('.dc.gov') || url.includes('district') || url.includes('columbia')) return 'DC';
    
    return null;
  } catch (error) {
    console.error('State identification error:', error);
    return null;
  }
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Content script received message:', message.action);
  
  if (message.action === 'getDetectionResult') {
    // Send current detection result
    sendResponse(detectionResult || { isBusinessRegistrationForm: false });
  } 
  else if (message.action === 'runDetection') {
    // Re-run detection and respond
    detectForm();
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open for async responses
});