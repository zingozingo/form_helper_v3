/**
 * Business Registration Assistant - Content Script
 * Simple implementation that detects business registration forms
 */

// Global variables
let detectionResult = null;

// Simple logger
function log(message, data) {
  const prefix = '[BRA]';
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
  log('Content script loaded');
  // Wait for the page to fully load
  setTimeout(detectBusinessForm, 1000);
});

/**
 * Main detection function
 */
function detectBusinessForm() {
  try {
    log('Starting form detection');
    
    // Get current URL
    const currentUrl = window.location.href;
    
    // Analyze different aspects of the page
    const urlScore = analyzeUrl(currentUrl);
    const contentScore = analyzePageContent();
    const formScore = analyzeFormElements();
    
    // Calculate total score
    const totalScore = (urlScore * 0.4) + (contentScore * 0.4) + (formScore * 0.2);
    const confidenceScore = Math.min(Math.round(totalScore), 100);
    
    // Check if it's a business form
    const isBusinessForm = confidenceScore >= 60;
    
    // Create detection result
    detectionResult = {
      isBusinessRegistrationForm: isBusinessForm,
      confidenceScore: confidenceScore,
      state: identifyState(),
      url: currentUrl,
      details: {
        urlScore,
        contentScore,
        formScore
      }
    };
    
    log('Detection result:', detectionResult);
    
    // Send to background script
    chrome.runtime.sendMessage({
      action: 'formDetected',
      result: detectionResult
    });
    
  } catch (error) {
    console.error('Error detecting form:', error);
  }
}

/**
 * Analyze URL for business registration patterns
 */
function analyzeUrl(url) {
  try {
    let score = 0;
    const lowerUrl = url.toLowerCase();
    
    // Check for government domains
    if (lowerUrl.includes('.gov')) {
      score += 25;
    }
    
    // Check for business-related terms
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
    
    // Get page text
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
    
    // Check for registration terms
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
 * Analyze form elements for registration patterns
 */
function analyzeFormElements() {
  try {
    let score = 0;
    
    // Check for forms
    const forms = document.querySelectorAll('form');
    if (forms.length > 0) {
      score += 20;
    } else {
      // Check for input fields
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
 * Identify which state the form is for
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
    if (url.includes('.dc.gov') || url.includes('district of columbia')) return 'DC';
    
    return null;
  } catch (error) {
    console.error('State identification error:', error);
    return null;
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Message received:', message.action);
  
  if (message.action === 'getDetectionResult') {
    // Return current detection
    sendResponse(detectionResult || { isBusinessRegistrationForm: false });
  }
  else if (message.action === 'triggerDetection') {
    // Run detection again
    detectBusinessForm();
    sendResponse({ success: true });
  }
  
  return true; // Keep message channel open
});