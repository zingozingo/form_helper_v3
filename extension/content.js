/**
 * Business Registration Assistant - Content Script
 * Implementation that detects business registration forms
 */

// Import URL detector module
import URLDetector from './modules/urlDetector.js';

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
    // Use the new URL detector module for URL analysis
    const urlAnalysis = URLDetector.analyzeUrl(currentUrl);
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
    const state = URLDetector.identifyStateFromUrl(currentUrl) || identifyStateFromContent();
    
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
        urlAnalysisReasons: urlAnalysis.reasons
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
    console.error('Form elements analysis error:', error);
    return 0;
  }
}

/**
 * Identify which state the form is for based on page content
 */
function identifyStateFromContent() {
  try {
    // Get page text
    const pageText = document.body.textContent.toLowerCase();
    
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
    console.error('State identification error:', error);
    return null;
  }
}

// Listen for messages from popup or panel
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