/**
 * Business Registration Assistant - Simplified Content Script
 * 
 * A simplified version focusing on reliable functionality for:
 * 1. Form detection
 * 2. Activation button display
 * 3. Sidebar functionality
 * 4. Message passing
 */

// Global state variables
let detectionResult = null;
let sidebarFrame = null;
let sidebarVisible = false;
let activationButtonInjected = false;

// Simple logger for debugging
function log(message, data) {
  const prefix = '[Form Helper]';
  if (data) {
    console.log(prefix, message, data);
  } else {
    console.log(prefix, message);
  }
}

// Initialize the extension when DOM is fully loaded
window.addEventListener('DOMContentLoaded', () => {
  log('Content script loaded');
  
  // Wait a short time for page to fully load
  setTimeout(initializeExtension, 1000);
});

/**
 * Main initialization function
 */
function initializeExtension() {
  try {
    log('Initializing extension');
    detectBusinessForm()
      .then(result => {
        if (result && result.isBusinessRegistrationForm) {
          showActivationButton();
        } else {
          log('Not a business registration form, no UI shown');
        }
      })
      .catch(error => {
        console.error('Error initializing extension:', error);
      });
  } catch (error) {
    console.error('Error in initialization:', error);
  }
}

/**
 * Detect if the current page is a business registration form
 */
function detectBusinessForm() {
  return new Promise((resolve) => {
    try {
      log('Starting form detection');
      const detector = new FormDetector();
      detectionResult = detector.analyzeCurrentPage();
      
      log('Form detection result:', detectionResult);
      
      // Send results to background script
      try {
        chrome.runtime.sendMessage({
          action: 'formDetected',
          result: detectionResult
        }, () => {
          if (chrome.runtime.lastError) {
            log('Error sending detection result (non-critical):', chrome.runtime.lastError);
          }
        });
      } catch (msgError) {
        log('Error sending message to background:', msgError);
      }
      
      resolve(detectionResult);
    } catch (error) {
      console.error('Error detecting form:', error);
      resolve({ isBusinessRegistrationForm: false, error: error.message });
    }
  });
}

/**
 * Shows the activation button to launch the assistant
 */
function showActivationButton() {
  log('Showing activation button');
  
  try {
    // Don't show button if it already exists or sidebar is visible
    if (activationButtonInjected || 
        document.getElementById('form-helper-button') ||
        document.getElementById('form-helper-sidebar')) {
      log('Button already exists or sidebar is visible');
      return;
    }
    
    // Create and add button styles
    const style = document.createElement('style');
    style.id = 'form-helper-button-styles';
    style.textContent = `
      #form-helper-button {
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        background-color: #2e5cb8 !important;
        color: white !important;
        border-radius: 30px !important;
        padding: 10px 20px !important;
        display: flex !important;
        align-items: center !important;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2) !important;
        cursor: pointer !important;
        z-index: 2147483646 !important;
        font-family: sans-serif !important;
        font-size: 14px !important;
        transition: all 0.3s ease !important;
        border: none !important;
      }
      
      #form-helper-button:hover {
        background-color: #1c4ca9 !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
      }
      
      .button-icon {
        font-size: 20px !important;
        margin-right: 8px !important;
      }
    `;
    document.head.appendChild(style);
    
    // Create the button
    const button = document.createElement('div');
    button.id = 'form-helper-button';
    button.title = 'Open Form Helper';
    button.innerHTML = `
      <div class="button-icon">🤖</div>
      <div>AI Form Helper</div>
    `;
    
    // Add click handler
    button.addEventListener('click', (e) => {
      log('Activation button clicked');
      e.preventDefault();
      e.stopPropagation();
      button.remove();
      showSidebar();
    });
    
    // Add to the page
    document.body.appendChild(button);
    activationButtonInjected = true;
    
    log('Activation button added to page');
  } catch (error) {
    console.error('Error showing activation button:', error);
  }
}

/**
 * Shows the sidebar with the assistant
 */
function showSidebar() {
  log('Showing sidebar');
  
  try {
    // Remove activation button if it exists
    const button = document.getElementById('form-helper-button');
    if (button) {
      button.remove();
    }
    
    // Add sidebar styles
    const style = document.createElement('style');
    style.id = 'form-helper-sidebar-styles';
    style.textContent = `
      #form-helper-sidebar {
        position: fixed !important;
        top: 0 !important;
        right: 0 !important;
        width: 350px !important;
        height: 100vh !important;
        background-color: white !important;
        box-shadow: -2px 0 8px rgba(0, 0, 0, 0.2) !important;
        z-index: 2147483647 !important;
        transition: transform 0.3s ease-in-out !important;
        display: flex !important;
        flex-direction: column !important;
        border-left: 1px solid #ddd !important;
      }
      
      .sidebar-header {
        height: 40px !important;
        background-color: #2e5cb8 !important;
        color: white !important;
        display: flex !important;
        justify-content: space-between !important;
        align-items: center !important;
        padding: 0 15px !important;
        font-family: sans-serif !important;
        font-size: 16px !important;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2) !important;
      }
      
      .close-button {
        cursor: pointer !important;
        font-size: 18px !important;
        width: 25px !important;
        height: 25px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        border-radius: 50% !important;
        transition: background-color 0.2s ease !important;
        color: white !important;
      }
      
      .close-button:hover {
        background-color: rgba(255, 255, 255, 0.2) !important;
      }
    `;
    document.head.appendChild(style);
    
    // Create sidebar container
    const sidebar = document.createElement('div');
    sidebar.id = 'form-helper-sidebar';
    
    // Create sidebar header with close button
    const header = document.createElement('div');
    header.className = 'sidebar-header';
    header.innerHTML = `
      <div>AI Form Helper</div>
      <div class="close-button" title="Close sidebar">✕</div>
    `;
    
    // Add close button handler
    header.querySelector('.close-button').addEventListener('click', () => {
      closeSidebar();
    });
    
    // Create iframe for sidebar content
    sidebarFrame = document.createElement('iframe');
    sidebarFrame.style.width = '100%';
    sidebarFrame.style.height = 'calc(100% - 40px)';
    sidebarFrame.style.border = 'none';
    sidebarFrame.style.backgroundColor = 'white';
    
    // Use extension URL for the iframe
    const sidebarUrl = chrome.runtime.getURL('sidebar.html');
    sidebarFrame.src = sidebarUrl;
    
    // Add elements to sidebar
    sidebar.appendChild(header);
    sidebar.appendChild(sidebarFrame);
    
    // Add sidebar to page
    document.body.appendChild(sidebar);
    
    // Mark sidebar as visible
    sidebarVisible = true;
    
    // Set up communication with iframe
    setupSidebarCommunication();
    
    log('Sidebar injected successfully');
  } catch (error) {
    console.error('Error showing sidebar:', error);
  }
}

/**
 * Closes the sidebar and shows the activation button
 */
function closeSidebar() {
  log('Closing sidebar');
  
  try {
    const sidebar = document.getElementById('form-helper-sidebar');
    if (sidebar) {
      sidebar.remove();
      sidebarVisible = false;
      
      // Show the activation button again
      setTimeout(showActivationButton, 100);
    }
  } catch (error) {
    console.error('Error closing sidebar:', error);
    // Try to recover by showing the button anyway
    showActivationButton();
  }
}

/**
 * Sets up communication with the sidebar iframe
 */
function setupSidebarCommunication() {
  log('Setting up sidebar communication');
  
  try {
    // Listen for messages from the iframe
    window.addEventListener('message', handleSidebarMessage);
  } catch (error) {
    console.error('Error setting up message listener:', error);
  }
}

/**
 * Handle messages from sidebar iframe
 */
function handleSidebarMessage(event) {
  try {
    // Ignore messages without proper structure
    if (!event.data || typeof event.data !== 'object' || !event.data.action) {
      return;
    }
    
    const message = event.data;
    log('Received message from sidebar:', message.action);
    
    // Handle different message types
    switch (message.action) {
      case 'getDetectionResult':
        // Send the current detection result to the iframe
        if (sidebarFrame && sidebarFrame.contentWindow) {
          sidebarFrame.contentWindow.postMessage({
            action: 'updateDetectionResult',
            result: detectionResult
          }, '*');
        }
        break;
        
      case 'triggerDetection':
        // Re-run detection
        const detector = new FormDetector();
        detectionResult = detector.analyzeCurrentPage();
        
        // Send updated result to iframe
        if (sidebarFrame && sidebarFrame.contentWindow) {
          sidebarFrame.contentWindow.postMessage({
            action: 'updateDetectionResult',
            result: detectionResult
          }, '*');
        }
        break;
    }
  } catch (error) {
    console.error('Error handling message from sidebar:', error);
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log('Content script received message:', message.action);
  
  try {
    if (message.action === 'getFormDetectionResult') {
      // Send current detection result
      sendResponse(detectionResult || { isBusinessRegistrationForm: false });
    } 
    else if (message.action === 'triggerDetection') {
      // Run detection and respond
      const detector = new FormDetector();
      detectionResult = detector.analyzeCurrentPage();
      sendResponse({ success: true, result: detectionResult });
    } 
    else if (message.action === 'showActivationButton') {
      // Show button if this is a business form
      if (detectionResult && detectionResult.isBusinessRegistrationForm) {
        showActivationButton();
        sendResponse({ success: true });
      } else {
        sendResponse({ success: false, reason: 'Not a business form' });
      }
    }
  } catch (error) {
    console.error('Error handling message:', error);
    sendResponse({ success: false, error: error.message });
  }
  
  return true; // Keep message channel open for async responses
});

/**
 * FormDetector class - Simplified version
 */
class FormDetector {
  constructor() {
    // Default confidence threshold
    this.confidenceThreshold = 60;
  }
  
  /**
   * Analyze the current page for business registration forms
   * @returns {Object} Detection result with confidence score
   */
  analyzeCurrentPage() {
    try {
      // Get current URL
      const currentUrl = window.location.href;
      
      // Analyze different aspects of the page
      const urlScore = this.analyzeUrl(currentUrl);
      const contentScore = this.analyzePageContent();
      const formScore = this.analyzeFormElements();
      
      // Calculate weighted total score
      const totalScore = (urlScore * 0.4) + (contentScore * 0.4) + (formScore * 0.2);
      const normalizedScore = Math.min(Math.round(totalScore), 100);
      
      // Determine if this is a business registration form
      const isBusinessForm = normalizedScore >= this.confidenceThreshold;
      
      // Try to identify the state
      const state = this.identifyState();
      
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
  analyzeUrl(url) {
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
  analyzePageContent() {
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
  analyzeFormElements() {
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
  identifyState() {
    try {
      const url = window.location.href.toLowerCase();
      
      // Simple URL-based state detection
      if (url.includes('.ca.gov') || url.includes('california')) return 'CA';
      if (url.includes('.ny.gov') || url.includes('newyork') || url.includes('new-york')) return 'NY';
      if (url.includes('.tx.gov') || url.includes('texas')) return 'TX';
      if (url.includes('.fl.gov') || url.includes('florida')) return 'FL';
      if (url.includes('.de.gov') || url.includes('delaware')) return 'DE';
      
      return null;
    } catch (error) {
      console.error('State identification error:', error);
      return null;
    }
  }
}