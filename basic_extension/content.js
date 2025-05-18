/**
 * Business Registration Assistant - Content Script
 * A simple script to detect business registration forms
 */

console.log("[BRA] Content script loaded");

// Global variables
let detectionResult = null;

// Run detection when page is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log("[BRA] DOM loaded, waiting for full page load");
  
  // Wait a moment for dynamic content to load
  setTimeout(() => {
    detectBusinessForm();
  }, 1000);
});

/**
 * Main detection function
 * Analyzes the current page to determine if it's a business registration form
 */
function detectBusinessForm() {
  console.log("[BRA] Starting form detection");
  
  try {
    // Get current URL
    const currentUrl = window.location.href;
    console.log("[BRA] Analyzing URL:", currentUrl);
    
    // Run different types of analysis
    const urlScore = analyzeUrl(currentUrl);
    const contentScore = analyzePageContent();
    const formScore = analyzeFormElements();
    
    // Calculate overall score with weighting
    const totalScore = (urlScore * 0.4) + (contentScore * 0.4) + (formScore * 0.2);
    const normalizedScore = Math.min(Math.round(totalScore), 100);
    
    // Determine if this is a business registration form based on threshold
    const confidenceThreshold = 60;
    const isBusinessForm = normalizedScore >= confidenceThreshold;
    
    // Try to identify the state from URL and content
    const state = identifyState();
    
    // Create detection result object
    detectionResult = {
      isBusinessRegistrationForm: isBusinessForm,
      confidenceScore: normalizedScore,
      state: state,
      url: currentUrl,
      details: {
        urlScore,
        contentScore,
        formScore
      },
      timestamp: new Date().toISOString()
    };
    
    console.log("[BRA] Detection result:", detectionResult);
    
    // Send detection result to the background script
    chrome.runtime.sendMessage({
      action: 'formDetected',
      result: detectionResult
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[BRA] Error sending detection result:", chrome.runtime.lastError);
      } else {
        console.log("[BRA] Background response:", response);
      }
    });
    
  } catch (error) {
    console.error("[BRA] Error in form detection:", error);
    
    // Send error info to background
    chrome.runtime.sendMessage({
      action: 'detectionError',
      error: error.message
    });
  }
}

/**
 * Analyzes the URL for business registration-related patterns
 * @param {string} url - The URL to analyze
 * @returns {number} Score from 0-100
 */
function analyzeUrl(url) {
  try {
    let score = 0;
    const lowerUrl = url.toLowerCase();
    
    // Check for government domains
    if (lowerUrl.includes('.gov')) {
      score += 25;
      console.log("[BRA] URL contains .gov domain: +25 points");
    }
    
    // Check for business-related terms in URL
    const terms = [
      'business', 'register', 'registration', 'license',
      'permit', 'corporation', 'llc', 'entity', 'formation'
    ];
    
    for (const term of terms) {
      if (lowerUrl.includes(term)) {
        score += 5;
        console.log(`[BRA] URL contains '${term}': +5 points`);
      }
    }
    
    // Specific key phrases that strongly indicate registration forms
    const keyPhrases = [
      'business-registration', 'register-business', 'formation-filing'
    ];
    
    for (const phrase of keyPhrases) {
      if (lowerUrl.includes(phrase)) {
        score += 15;
        console.log(`[BRA] URL contains strong indicator '${phrase}': +15 points`);
      }
    }
    
    console.log("[BRA] Final URL score:", Math.min(score, 100));
    return Math.min(score, 100);
  } catch (error) {
    console.error("[BRA] Error analyzing URL:", error);
    return 0;
  }
}

/**
 * Analyzes page content for business registration keywords
 * @returns {number} Score from 0-100
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
      'doing business as', 'dba'
    ];
    
    for (const term of entityTerms) {
      if (pageText.includes(term)) {
        score += 5;
        console.log(`[BRA] Content contains entity term '${term}': +5 points`);
      }
    }
    
    // Check for registration-related terms
    const registrationTerms = [
      'business registration', 'register a business',
      'business license', 'articles of organization',
      'articles of incorporation', 'business formation',
      'file online', 'business filing', 'entity registration'
    ];
    
    for (const term of registrationTerms) {
      if (pageText.includes(term)) {
        score += 10;
        console.log(`[BRA] Content contains registration term '${term}': +10 points`);
      }
    }
    
    // Check for header text that indicates a registration form
    const headers = document.querySelectorAll('h1, h2, h3');
    headers.forEach(header => {
      const headerText = header.textContent.toLowerCase();
      if (headerText.includes('register') && 
          (headerText.includes('business') || headerText.includes('entity'))) {
        score += 20;
        console.log(`[BRA] Found registration header '${headerText}': +20 points`);
      }
    });
    
    console.log("[BRA] Final content score:", Math.min(score, 100));
    return Math.min(score, 100);
  } catch (error) {
    console.error("[BRA] Error analyzing page content:", error);
    return 0;
  }
}

/**
 * Analyzes form elements for business registration patterns
 * @returns {number} Score from 0-100
 */
function analyzeFormElements() {
  try {
    let score = 0;
    
    // Check if the page has forms
    const forms = document.querySelectorAll('form');
    
    if (forms.length > 0) {
      score += 20;
      console.log(`[BRA] Found ${forms.length} form elements: +20 points`);
    } else {
      // Check for groups of input fields that might be forms
      const inputs = document.querySelectorAll('input, select, textarea');
      if (inputs.length >= 3) {
        score += 10;
        console.log(`[BRA] Found ${inputs.length} input elements but no form: +10 points`);
      }
    }
    
    // Check for business registration field patterns
    const allFields = document.querySelectorAll('input, select, textarea');
    const fieldPatterns = [
      'business', 'company', 'entity', 'name',
      'type', 'owner', 'address', 'register',
      'filing', 'formation'
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
          console.log(`[BRA] Found form field matching '${pattern}': ${name || id || placeholder || label}`);
          break;
        }
      }
    });
    
    // Add score based on matched fields
    if (matchedFields >= 2) {
      score += 15;
      console.log(`[BRA] Found ${matchedFields} business-related fields: +15 points`);
    }
    if (matchedFields >= 4) {
      score += 15;
      console.log(`[BRA] Found ${matchedFields} business-related fields: +15 additional points`);
    }
    
    // Check for specific high-value fields that are common in registration forms
    const highValueFields = ['entityName', 'businessType', 'registrationNumber', 'fein', 'ein'];
    let highValueMatches = 0;
    
    allFields.forEach(field => {
      const name = field.name ? field.name.toLowerCase() : '';
      const id = field.id ? field.id.toLowerCase() : '';
      
      for (const fieldName of highValueFields) {
        if (name.includes(fieldName) || id.includes(fieldName)) {
          highValueMatches++;
          console.log(`[BRA] Found high-value field '${fieldName}': ${name || id}`);
          break;
        }
      }
    });
    
    if (highValueMatches > 0) {
      score += highValueMatches * 10;
      console.log(`[BRA] Found ${highValueMatches} high-value registration fields: +${highValueMatches * 10} points`);
    }
    
    console.log("[BRA] Final form score:", Math.min(score, 100));
    return Math.min(score, 100);
  } catch (error) {
    console.error("[BRA] Error analyzing form elements:", error);
    return 0;
  }
}

/**
 * Identify which state the form is for based on URL and content
 * @returns {string|null} Two-letter state code or null if not identified
 */
function identifyState() {
  try {
    const url = window.location.href.toLowerCase();
    const pageText = document.body.textContent.toLowerCase();
    
    // Map of state codes to patterns to check in URL and content
    const statePatterns = {
      'AL': ['alabama', '.al.gov', 'al.us'],
      'AK': ['alaska', '.ak.gov', 'ak.us'],
      'AZ': ['arizona', '.az.gov', 'az.us'],
      'AR': ['arkansas', '.ar.gov', 'ar.us'],
      'CA': ['california', '.ca.gov', 'ca.us'],
      'CO': ['colorado', '.co.gov', 'co.us'],
      'CT': ['connecticut', '.ct.gov', 'ct.us'],
      'DE': ['delaware', '.de.gov', 'de.us'],
      'DC': ['district of columbia', 'washington dc', '.dc.gov', 'dc.us'],
      'FL': ['florida', '.fl.gov', 'fl.us'],
      'GA': ['georgia', '.ga.gov', 'ga.us'],
      'HI': ['hawaii', '.hi.gov', 'hi.us'],
      'ID': ['idaho', '.id.gov', 'id.us'],
      'IL': ['illinois', '.il.gov', 'il.us'],
      'IN': ['indiana', '.in.gov', 'in.us'],
      'IA': ['iowa', '.ia.gov', 'ia.us'],
      'KS': ['kansas', '.ks.gov', 'ks.us'],
      'KY': ['kentucky', '.ky.gov', 'ky.us'],
      'LA': ['louisiana', '.la.gov', 'la.us'],
      'ME': ['maine', '.me.gov', 'me.us'],
      'MD': ['maryland', '.md.gov', 'md.us'],
      'MA': ['massachusetts', '.ma.gov', 'ma.us'],
      'MI': ['michigan', '.mi.gov', 'mi.us'],
      'MN': ['minnesota', '.mn.gov', 'mn.us'],
      'MS': ['mississippi', '.ms.gov', 'ms.us'],
      'MO': ['missouri', '.mo.gov', 'mo.us'],
      'MT': ['montana', '.mt.gov', 'mt.us'],
      'NE': ['nebraska', '.ne.gov', 'ne.us'],
      'NV': ['nevada', '.nv.gov', 'nv.us'],
      'NH': ['new hampshire', '.nh.gov', 'nh.us'],
      'NJ': ['new jersey', '.nj.gov', 'nj.us'],
      'NM': ['new mexico', '.nm.gov', 'nm.us'],
      'NY': ['new york', '.ny.gov', 'ny.us'],
      'NC': ['north carolina', '.nc.gov', 'nc.us'],
      'ND': ['north dakota', '.nd.gov', 'nd.us'],
      'OH': ['ohio', '.oh.gov', 'oh.us'],
      'OK': ['oklahoma', '.ok.gov', 'ok.us'],
      'OR': ['oregon', '.or.gov', 'or.us'],
      'PA': ['pennsylvania', '.pa.gov', 'pa.us'],
      'RI': ['rhode island', '.ri.gov', 'ri.us'],
      'SC': ['south carolina', '.sc.gov', 'sc.us'],
      'SD': ['south dakota', '.sd.gov', 'sd.us'],
      'TN': ['tennessee', '.tn.gov', 'tn.us'],
      'TX': ['texas', '.tx.gov', 'tx.us'],
      'UT': ['utah', '.ut.gov', 'ut.us'],
      'VT': ['vermont', '.vt.gov', 'vt.us'],
      'VA': ['virginia', '.va.gov', 'va.us'],
      'WA': ['washington state', '.wa.gov', 'wa.us'],
      'WV': ['west virginia', '.wv.gov', 'wv.us'],
      'WI': ['wisconsin', '.wi.gov', 'wi.us'],
      'WY': ['wyoming', '.wy.gov', 'wy.us']
    };
    
    // Check each state's patterns against URL and page content
    for (const [stateCode, patterns] of Object.entries(statePatterns)) {
      for (const pattern of patterns) {
        if (url.includes(pattern) || pageText.includes(pattern)) {
          console.log(`[BRA] State identified as ${stateCode} from pattern: ${pattern}`);
          return stateCode;
        }
      }
    }
    
    // Check for specific state mentions in headings (higher confidence)
    const headers = document.querySelectorAll('h1, h2, h3, h4');
    for (const header of headers) {
      const headerText = header.textContent.toLowerCase();
      for (const [stateCode, patterns] of Object.entries(statePatterns)) {
        for (const pattern of patterns) {
          if (headerText.includes(pattern)) {
            console.log(`[BRA] State identified as ${stateCode} from header: ${headerText}`);
            return stateCode;
          }
        }
      }
    }
    
    console.log("[BRA] No state identified");
    return null;
  } catch (error) {
    console.error("[BRA] Error identifying state:", error);
    return null;
  }
}

// Listen for messages from the background script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("[BRA] Message received:", message);
  
  if (message.action === 'getDetectionResult') {
    console.log("[BRA] Sending detection result:", detectionResult);
    sendResponse(detectionResult);
  }
  else if (message.action === 'runDetection') {
    console.log("[BRA] Running detection on request");
    detectBusinessForm();
    sendResponse({ status: 'Detection started' });
  }
  
  // Return true to indicate we'll send a response asynchronously
  return true;
});