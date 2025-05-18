/**
 * Business Registration Assistant - Simplified Sidebar Script
 * 
 * This script handles the sidebar UI functionality, displaying detection results
 * and providing user interactions. It follows CSP best practices by avoiding
 * unsafe-inline script practices, properly handling message passing with content.js,
 * and including improved error handling.
 */

// State management
const state = {
  detectionResult: null,
  isDebugVisible: false,
  initialized: false,
  pingReceived: false
};

// DOM element cache
const elements = {};

/**
 * Function to safely log messages to console
 * @param {string} message - The message to log
 * @param {any} data - Additional data to log
 */
function log(message, data) {
  const prefix = '[Sidebar]';
  try {
    if (data !== undefined) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  } catch (error) {
    // Fail silently if console logging is not available
  }
}

/**
 * Initialize the sidebar when the DOM is loaded
 */
document.addEventListener('DOMContentLoaded', initializeSidebar);

/**
 * Initialize the sidebar by caching DOM elements and setting up event listeners
 */
function initializeSidebar() {
  log('Initializing sidebar...');
  
  try {
    // Cache DOM elements
    cacheElements();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up message handling
    setupMessageHandling();
    
    // Get detection result from content script
    requestDetectionResult();
    
    // Mark as initialized
    state.initialized = true;
    
    log('Sidebar initialization complete');
  } catch (error) {
    handleError('Sidebar initialization failed', error);
  }
}

/**
 * Cache all required DOM elements with error handling
 */
function cacheElements() {
  log('Caching DOM elements...');
  
  try {
    // Helper function to safely get an element
    const getElement = (id) => {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Element not found: ${id}`);
      }
      return element;
    };
    
    // Cache all elements
    elements.errorContainer = getElement('error-container');
    elements.statusIndicator = getElement('status-indicator');
    elements.statusText = getElement('status-text');
    elements.noDetectionView = getElement('no-detection-view');
    elements.detectionView = getElement('detection-view');
    elements.detectedState = getElement('detected-state');
    elements.formType = getElement('form-type');
    elements.confidenceBar = getElement('confidence-bar');
    elements.confidenceValue = getElement('confidence-value');
    elements.manualDetectBtn = getElement('manual-detect-btn');
    elements.autoFillBtn = getElement('auto-fill-btn');
    elements.fieldHelpBtn = getElement('field-help-btn');
    elements.requirementsBtn = getElement('requirements-btn');
    elements.createProfileBtn = getElement('create-profile-btn');
    elements.debugPanel = getElement('debug-panel');
    elements.debugInfo = getElement('debug-info');
    elements.debugToggleBtn = getElement('debug-toggle-btn');
    elements.settingsBtn = getElement('settings-btn');
    elements.helpBtn = getElement('help-btn');
    
    log('All DOM elements cached successfully');
  } catch (error) {
    throw new Error(`DOM element caching failed: ${error.message}`);
  }
}

/**
 * Set up event listeners for all interactive elements
 */
function setupEventListeners() {
  log('Setting up event listeners...');
  
  try {
    // Manual detection button
    elements.manualDetectBtn.addEventListener('click', triggerManualDetection);
    
    // Auto-fill button
    elements.autoFillBtn.addEventListener('click', handleAutoFill);
    
    // Field help button
    elements.fieldHelpBtn.addEventListener('click', handleFieldHelp);
    
    // State requirements button
    elements.requirementsBtn.addEventListener('click', handleRequirements);
    
    // Create profile button
    elements.createProfileBtn.addEventListener('click', handleCreateProfile);
    
    // Debug toggle button
    elements.debugToggleBtn.addEventListener('click', toggleDebugPanel);
    
    // Settings button
    elements.settingsBtn.addEventListener('click', handleSettings);
    
    // Help button
    elements.helpBtn.addEventListener('click', handleHelp);
    
    log('Event listeners set up successfully');
  } catch (error) {
    throw new Error(`Event listener setup failed: ${error.message}`);
  }
}

/**
 * Handle auto-fill button click
 */
function handleAutoFill() {
  sendMessage('autofillFields', {
    state: state.detectionResult?.state,
    formType: state.detectionResult?.formType
  });
}

/**
 * Handle field help button click
 */
function handleFieldHelp() {
  sendMessage('showFieldHelp', {
    state: state.detectionResult?.state,
    formType: state.detectionResult?.formType
  });
}

/**
 * Handle requirements button click
 */
function handleRequirements() {
  if (!state.detectionResult?.state) {
    showError('No state detected.');
    return;
  }
  sendMessage('showStateRequirements', { state: state.detectionResult.state });
}

/**
 * Handle create profile button click
 */
function handleCreateProfile() {
  sendMessage('openBusinessProfile');
}

/**
 * Handle settings button click
 */
function handleSettings() {
  sendMessage('openSettings');
}

/**
 * Handle help button click
 */
function handleHelp() {
  sendMessage('openHelp');
}

/**
 * Set up message handling between sidebar and content script
 */
function setupMessageHandling() {
  log('Setting up message handling...');
  
  try {
    // Listen for messages from the content script
    window.addEventListener('message', handleIncomingMessage);
    
    // Establish connection by sending a ping
    sendPing();
    
    log('Message handling set up successfully');
  } catch (error) {
    throw new Error(`Message handling setup failed: ${error.message}`);
  }
}

/**
 * Send a ping message to verify communication with the content script
 */
function sendPing() {
  log('Sending ping to content script...');
  
  sendMessage('ping', { timestamp: Date.now() });
  
  // Set up a timeout to check if we got a response
  setTimeout(() => {
    // If we're still waiting to initialize, show an error
    if (!state.pingReceived) {
      log('No ping response received, communication may be broken');
      showWarning('Communication with page not established. Some features may not work.');
    }
  }, 3000);
}

/**
 * Handle incoming messages from the content script
 * @param {MessageEvent} event - The message event
 */
function handleIncomingMessage(event) {
  try {
    // Validate the message
    if (!event.data || typeof event.data !== 'object' || !event.data.action) {
      return; // Not a valid message for us
    }
    
    const message = event.data;
    log('Received message', message.action);
    
    // Handle different message types
    switch (message.action) {
      case 'pong':
        log('Received pong response, communication confirmed');
        state.pingReceived = true;
        break;
        
      case 'updateDetectionResult':
        log('Received detection result update');
        if (message.result) {
          updateDetectionUI(message.result);
        }
        break;
        
      case 'error':
        log('Received error message', message.error);
        showError(message.error || 'Unknown error occurred');
        break;
    }
  } catch (error) {
    handleError('Error handling message', error);
  }
}

/**
 * Send a message to the parent content script
 * @param {string} action - The action to perform
 * @param {Object} data - Additional data to send
 * @returns {boolean} - Whether the message was sent successfully
 */
function sendMessage(action, data = {}) {
  try {
    log(`Sending message: ${action}`);
    
    // Verify parent window is accessible
    if (!window.parent) {
      throw new Error('Cannot access parent window');
    }
    
    // Create and send the message
    const message = {
      action,
      ...data,
      timestamp: Date.now()
    };
    
    window.parent.postMessage(message, '*');
    return true;
  } catch (error) {
    handleError(`Failed to send message: ${action}`, error);
    return false;
  }
}

/**
 * Request the current detection result from the content script
 */
function requestDetectionResult() {
  log('Requesting detection result...');
  
  // Update the UI to show we're waiting for detection
  elements.statusText.textContent = 'Detecting...';
  
  // Request the detection result
  sendMessage('getDetectionResult');
  
  // Set a timeout to show an error if we don't get a response
  setTimeout(() => {
    if (!state.detectionResult) {
      showWarning('Detection result not received. Try checking again.');
    }
  }, 5000);
}

/**
 * Trigger a manual detection in the content script
 */
function triggerManualDetection() {
  log('Triggering manual detection...');
  
  // Update UI to show we're detecting
  elements.statusText.textContent = 'Detecting...';
  elements.statusIndicator.classList.remove('active', 'warning');
  
  // Request a new detection
  sendMessage('triggerDetection');
}

/**
 * Toggle the debug panel visibility
 */
function toggleDebugPanel() {
  log('Toggling debug panel...');
  
  state.isDebugVisible = !state.isDebugVisible;
  elements.debugPanel.classList.toggle('hidden', !state.isDebugVisible);
  
  // Save the debug visibility setting
  sendMessage('saveSettings', { 
    settings: { showDebugInfo: state.isDebugVisible } 
  });
}

/**
 * Update the detection UI based on the result
 * @param {Object} result - The detection result
 */
function updateDetectionUI(result) {
  log('Updating detection UI', result);
  
  try {
    // Store the result
    state.detectionResult = result;
    
    // Show the appropriate view
    if (!result || !result.isBusinessRegistrationForm) {
      // No detection or low confidence
      elements.statusIndicator.classList.remove('active');
      elements.statusIndicator.classList.add('warning');
      elements.statusText.textContent = result ? 'Low confidence detection' : 'No detection';
      elements.noDetectionView.classList.remove('hidden');
      elements.detectionView.classList.add('hidden');
    } else {
      // Business form detected
      elements.statusIndicator.classList.add('active');
      elements.statusIndicator.classList.remove('warning');
      elements.statusText.textContent = 'Business form detected';
      elements.noDetectionView.classList.add('hidden');
      elements.detectionView.classList.remove('hidden');
      
      // Update detected information
      elements.detectedState.textContent = result.state ? getStateFullName(result.state) : 'Unknown';
      elements.formType.textContent = formatFormType(result.formType);
      
      // Update confidence meter
      const confidence = result.confidenceScore || 0;
      elements.confidenceBar.style.width = `${confidence}%`;
      elements.confidenceValue.textContent = `${confidence}%`;
      
      // Set button states based on result
      elements.autoFillBtn.disabled = !result.isBusinessRegistrationForm;
      elements.fieldHelpBtn.disabled = !result.isBusinessRegistrationForm;
      elements.requirementsBtn.disabled = !result.state;
    }
    
    // Update debug panel
    updateDebugPanel(result);
    
    log('Detection UI updated successfully');
  } catch (error) {
    handleError('Error updating detection UI', error);
  }
}

/**
 * Update the debug panel with information
 * @param {Object} data - Debug data to display
 */
function updateDebugPanel(data) {
  try {
    if (!data) {
      elements.debugInfo.textContent = 'No debug information available.';
      return;
    }
    
    // Format the debug information
    const formattedData = JSON.stringify(data, null, 2);
    elements.debugInfo.textContent = formattedData;
  } catch (error) {
    handleError('Error updating debug panel', error);
    elements.debugInfo.textContent = 'Error displaying debug data: ' + error.message;
  }
}

/**
 * Show an error message in the UI
 * @param {string} message - The error message
 */
function showError(message) {
  log('Showing error', message);
  
  try {
    elements.errorContainer.textContent = message;
    elements.errorContainer.style.display = 'block';
    elements.errorContainer.classList.add('error');
    elements.errorContainer.classList.remove('warning');
    
    // Also update status if available
    if (elements.statusText) {
      elements.statusText.textContent = 'Error';
      elements.statusIndicator.classList.remove('active');
      elements.statusIndicator.classList.add('warning');
    }
    
    // Hide the error after 5 seconds
    setTimeout(() => {
      if (elements.errorContainer.textContent === message) {
        elements.errorContainer.style.display = 'none';
      }
    }, 5000);
  } catch (error) {
    // Last resort if we can't show the error in the UI
    console.error('Failed to show error message:', message, error);
  }
}

/**
 * Show a warning message in the UI
 * @param {string} message - The warning message
 */
function showWarning(message) {
  log('Showing warning', message);
  
  try {
    elements.errorContainer.textContent = message;
    elements.errorContainer.style.display = 'block';
    elements.errorContainer.classList.add('warning');
    elements.errorContainer.classList.remove('error');
    
    // Hide the warning after 5 seconds
    setTimeout(() => {
      if (elements.errorContainer.textContent === message) {
        elements.errorContainer.style.display = 'none';
      }
    }, 5000);
  } catch (error) {
    console.error('Failed to show warning message:', message, error);
  }
}

/**
 * Handle an error with proper logging and UI feedback
 * @param {string} context - The context where the error occurred
 * @param {Error} error - The error object
 */
function handleError(context, error) {
  // Log the error
  console.error(`${context}:`, error);
  
  // Show the error in the UI
  const message = `${context}: ${error.message}`;
  showError(message);
}

/**
 * Format a form type for display
 * @param {string} type - The form type
 * @returns {string} - The formatted form type
 */
function formatFormType(type) {
  if (!type) return 'Unknown';
  
  const types = {
    'llc': 'Limited Liability Company (LLC)',
    'corporation': 'Corporation',
    'partnership': 'Partnership',
    'sole_proprietorship': 'Sole Proprietorship / DBA'
  };
  
  return types[type] || type;
}

/**
 * Get the full state name from a state code
 * @param {string} stateCode - The state code
 * @returns {string} - The full state name
 */
function getStateFullName(stateCode) {
  const stateMap = {
    'AL': 'Alabama',
    'AK': 'Alaska',
    'AZ': 'Arizona',
    'AR': 'Arkansas',
    'CA': 'California',
    'CO': 'Colorado',
    'CT': 'Connecticut',
    'DE': 'Delaware',
    'FL': 'Florida',
    'GA': 'Georgia',
    'HI': 'Hawaii',
    'ID': 'Idaho',
    'IL': 'Illinois',
    'IN': 'Indiana',
    'IA': 'Iowa',
    'KS': 'Kansas',
    'KY': 'Kentucky',
    'LA': 'Louisiana',
    'ME': 'Maine',
    'MD': 'Maryland',
    'MA': 'Massachusetts',
    'MI': 'Michigan',
    'MN': 'Minnesota',
    'MS': 'Mississippi',
    'MO': 'Missouri',
    'MT': 'Montana',
    'NE': 'Nebraska',
    'NV': 'Nevada',
    'NH': 'New Hampshire',
    'NJ': 'New Jersey',
    'NM': 'New Mexico',
    'NY': 'New York',
    'NC': 'North Carolina',
    'ND': 'North Dakota',
    'OH': 'Ohio',
    'OK': 'Oklahoma',
    'OR': 'Oregon',
    'PA': 'Pennsylvania',
    'RI': 'Rhode Island',
    'SC': 'South Carolina',
    'SD': 'South Dakota',
    'TN': 'Tennessee',
    'TX': 'Texas',
    'UT': 'Utah',
    'VT': 'Vermont',
    'VA': 'Virginia',
    'WA': 'Washington',
    'WV': 'West Virginia',
    'WI': 'Wisconsin',
    'WY': 'Wyoming',
    'DC': 'District of Columbia'
  };
  
  return stateMap[stateCode] || stateCode;
}