/**
 * Business Registration Assistant - Panel Script
 * 
 * This script handles the extension's panel UI, displaying detection results
 * and providing user interactions.
 */

// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const noDetectionView = document.getElementById('no-detection-view');
const detectionView = document.getElementById('detection-view');
const detectedState = document.getElementById('detected-state');
const formType = document.getElementById('form-type');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceValue = document.getElementById('confidence-value');
const manualDetectBtn = document.getElementById('manual-detect-btn');
const autoFillBtn = document.getElementById('auto-fill-btn');
const fieldHelpBtn = document.getElementById('field-help-btn');
const requirementsBtn = document.getElementById('requirements-btn');
const createProfileBtn = document.getElementById('create-profile-btn');
const debugPanel = document.getElementById('debug-panel');
const debugInfo = document.getElementById('debug-info');
const debugToggleBtn = document.getElementById('debug-toggle-btn');
const settingsBtn = document.getElementById('settings-btn');
const helpBtn = document.getElementById('help-btn');

// State
let currentTabId = null;
let detectionResult = null;
let isDebugVisible = false;

/**
 * Initialize the panel when it's opened
 */
function initPanel() {
  // Get the current tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;
    
    currentTabId = tabs[0].id;
    
    // Request detection result from background script
    chrome.runtime.sendMessage(
      { action: 'getDetectionResult', tabId: currentTabId },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting detection result:', chrome.runtime.lastError);
          // Try content script as fallback - don't show error yet
          getDetectionFromContentScript();
          return;
        }
        
        if (response && response.result) {
          // We have a detection result from the background script
          updateDetectionUI(response.result);
        } else {
          // No result in background script yet, ask the content script directly
          getDetectionFromContentScript();
        }
      }
    );
    
    // Load settings
    loadSettings();
  });
}

/**
 * Requests detection result directly from the content script
 */
function getDetectionFromContentScript() {
  try {
    chrome.tabs.sendMessage(
      currentTabId,
      { action: 'getFormDetectionResult' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log('Content script not ready or not injected:', chrome.runtime.lastError.message);
          // Show empty state if we can't get data from either source
          updateDetectionUI(null);
          return;
        }
        
        if (response) {
          updateDetectionUI(response);
        } else {
          console.log('No detection result received from content script');
          updateDetectionUI(null);
        }
      }
    );
  } catch (error) {
    console.error('Error sending message to content script:', error);
    updateDetectionUI(null);
  }
}

/**
 * Updates the UI based on the detection result
 * @param {Object|null} result - The detection result or null if not available
 */
function updateDetectionUI(result) {
  detectionResult = result;
  
  if (!result) {
    // No detection result - show the empty state
    statusIndicator.classList.remove('active', 'warning');
    statusText.textContent = 'No detection';
    noDetectionView.classList.remove('hidden');
    detectionView.classList.add('hidden');
    
    updateDebugPanel({ message: 'No detection result available.' });
    return;
  }
  
  // Show detection view
  noDetectionView.classList.add('hidden');
  detectionView.classList.remove('hidden');
  
  // Update status indicator
  if (result.isBusinessRegistrationForm) {
    statusIndicator.classList.add('active');
    statusIndicator.classList.remove('warning');
    statusText.textContent = 'Business form detected';
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.classList.add('warning');
    statusText.textContent = 'Low confidence detection';
  }
  
  // Update detected information
  detectedState.textContent = result.state ? getStateFullName(result.state) : 'Unknown';
  
  // Handle form type (may not be present in the result)
  if (typeof formType !== 'undefined') {
    formType.textContent = formatFormType(result.formType);
  }
  
  // Update confidence meter
  const confidence = result.confidenceScore || 0;
  confidenceBar.style.width = `${confidence}%`;
  confidenceValue.textContent = `${confidence}%`;
  
  // Set button states based on result
  if (autoFillBtn) autoFillBtn.disabled = !result.isBusinessRegistrationForm;
  if (fieldHelpBtn) fieldHelpBtn.disabled = !result.isBusinessRegistrationForm;
  if (requirementsBtn) requirementsBtn.disabled = !result.state;
  
  // Update debug panel
  updateDebugPanel(result.details || {});
}

/**
 * Formats the form type for display
 * @param {string|null} type - The detected form type
 * @returns {string} Formatted form type
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
 * Gets the full state name from a state code
 * @param {string} stateCode - Two-letter state code
 * @returns {string} Full state name
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

/**
 * Updates the debug panel with information
 * @param {Object} debugData - Debug data to display
 */
function updateDebugPanel(debugData) {
  if (!debugData) {
    debugInfo.textContent = 'No debug information available.';
    return;
  }
  
  debugInfo.textContent = JSON.stringify(debugData, null, 2);
}

/**
 * Loads user settings from storage
 */
function loadSettings() {
  chrome.storage.local.get('settings', (result) => {
    const settings = result.settings || {};
    
    // Apply settings to UI
    isDebugVisible = settings.showDebugInfo || false;
    debugPanel.classList.toggle('hidden', !isDebugVisible);
  });
}

/**
 * Triggers a manual detection in the content script
 */
function triggerManualDetection() {
  statusText.textContent = 'Detecting...';
  statusIndicator.classList.remove('active', 'warning');
  
  chrome.tabs.sendMessage(
    currentTabId,
    { action: 'triggerDetection' },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error triggering detection:', chrome.runtime.lastError);
        showError('Failed to communicate with page.');
        return;
      }
      
      // Wait a moment and then get the new detection result
      setTimeout(getDetectionFromContentScript, 500);
    }
  );
}

/**
 * Shows an error message in the UI
 * @param {string} message - Error message to display
 */
function showError(message) {
  statusText.textContent = 'Error';
  statusIndicator.classList.remove('active');
  statusIndicator.classList.add('warning');
  
  // In a full implementation, you would display the error in the UI
  console.error(message);
}

/**
 * Toggles the debug panel visibility
 */
function toggleDebugPanel() {
  isDebugVisible = !isDebugVisible;
  debugPanel.classList.toggle('hidden', !isDebugVisible);
  
  // Save preference
  chrome.storage.local.get('settings', (result) => {
    const settings = result.settings || {};
    settings.showDebugInfo = isDebugVisible;
    chrome.storage.local.set({ settings });
  });
}

/**
 * Initiates the autofill process for form fields
 */
function autofillFormFields() {
  chrome.tabs.sendMessage(
    currentTabId,
    { 
      action: 'autofillFields',
      state: detectionResult?.state,
      formType: detectionResult?.formType
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error auto-filling fields:', chrome.runtime.lastError);
        showError('Failed to auto-fill fields.');
        return;
      }
      
      // Handle response
      console.log('Auto-fill result:', response);
    }
  );
}

/**
 * Shows context-specific field help
 */
function showFieldHelp() {
  chrome.tabs.sendMessage(
    currentTabId,
    { 
      action: 'showFieldHelp',
      state: detectionResult?.state,
      formType: detectionResult?.formType
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error showing field help:', chrome.runtime.lastError);
        showError('Failed to activate field help.');
        return;
      }
      
      // Handle response
      console.log('Field help result:', response);
    }
  );
}

/**
 * Shows state-specific requirements
 */
function showStateRequirements() {
  if (!detectionResult?.state) {
    showError('No state detected.');
    return;
  }
  
  // In a full implementation, this would show a modal or panel with state requirements
  console.log('Show requirements for:', detectionResult.state);
}

/**
 * Opens the business profile creation/editing UI
 */
function openBusinessProfile() {
  // In a full implementation, this would open a profile editor
  console.log('Open business profile editor');
}

/**
 * Opens the settings page
 */
function openSettings() {
  // In a full implementation, this would open a settings dialog
  console.log('Open settings');
}

/**
 * Opens the help page
 */
function openHelp() {
  // In a full implementation, this would open help documentation
  console.log('Open help');
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initPanel);
manualDetectBtn.addEventListener('click', triggerManualDetection);
autoFillBtn.addEventListener('click', autofillFormFields);
fieldHelpBtn.addEventListener('click', showFieldHelp);
requirementsBtn.addEventListener('click', showStateRequirements);
createProfileBtn.addEventListener('click', openBusinessProfile);
debugToggleBtn.addEventListener('click', toggleDebugPanel);
settingsBtn.addEventListener('click', openSettings);
helpBtn.addEventListener('click', openHelp);