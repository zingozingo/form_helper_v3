/**
 * Business Registration Assistant - Popup Script
 * Simple implementation for displaying detection results
 */

// DOM Elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const noDetectionView = document.getElementById('no-detection-view');
const detectionView = document.getElementById('detection-view');
const detectedState = document.getElementById('detected-state');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceValue = document.getElementById('confidence-value');
const checkAgainBtn = document.getElementById('check-again-btn');
const fieldHelpBtn = document.getElementById('field-help-btn');
const debugPanel = document.getElementById('debug-panel');
const debugInfo = document.getElementById('debug-info');
const debugToggleBtn = document.getElementById('debug-toggle-btn');

// State
let currentTabId = null;
let detectionResult = null;
let isDebugVisible = false;

/**
 * Initialize the popup when opened
 */
function initPopup() {
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
  });
}

/**
 * Requests detection result directly from the content script
 */
function getDetectionFromContentScript() {
  try {
    chrome.tabs.sendMessage(
      currentTabId,
      { action: 'getDetectionResult' },
      (response) => {
        if (chrome.runtime.lastError) {
          console.log('Content script not ready:', chrome.runtime.lastError.message);
          updateDetectionUI(null);
          return;
        }
        
        updateDetectionUI(response);
      }
    );
  } catch (error) {
    console.error('Error sending message to content script:', error);
    updateDetectionUI(null);
  }
}

/**
 * Updates the UI based on the detection result
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
  
  // Determine if it's a valid business form
  const isBusinessForm = result.isBusinessRegistrationForm;
  
  // Update status indicator
  if (isBusinessForm) {
    statusIndicator.classList.add('active');
    statusIndicator.classList.remove('warning');
    statusText.textContent = 'Business form detected';
    noDetectionView.classList.add('hidden');
    detectionView.classList.remove('hidden');
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.classList.add('warning');
    statusText.textContent = 'Not a business form';
    noDetectionView.classList.remove('hidden');
    detectionView.classList.add('hidden');
  }
  
  // Update detected information if we have a business form
  if (isBusinessForm) {
    detectedState.textContent = result.state ? getStateFullName(result.state) : 'Unknown';
    
    // Update confidence meter
    const confidence = result.confidenceScore || 0;
    confidenceBar.style.width = `${confidence}%`;
    confidenceValue.textContent = `${confidence}%`;
    
    // Enable/disable buttons based on result
    fieldHelpBtn.disabled = !result.isBusinessRegistrationForm;
  }
  
  // Update debug panel
  updateDebugPanel(result);
}

/**
 * Gets the full state name from a state code
 */
function getStateFullName(stateCode) {
  const stateMap = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
    'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
    'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
    'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
    'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
    'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
    'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
    'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
    'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'District of Columbia'
  };
  
  return stateMap[stateCode] || stateCode;
}

/**
 * Updates the debug panel with information
 */
function updateDebugPanel(debugData) {
  if (!debugData) {
    debugInfo.textContent = 'No debug information available.';
    return;
  }
  
  debugInfo.textContent = JSON.stringify(debugData, null, 2);
}

/**
 * Toggles the debug panel visibility
 */
function toggleDebugPanel() {
  isDebugVisible = !isDebugVisible;
  debugPanel.classList.toggle('hidden', !isDebugVisible);
  debugToggleBtn.textContent = isDebugVisible ? 'Hide Debug Info' : 'Show Debug Info';
}

/**
 * Triggers manual form detection
 */
function checkAgain() {
  statusText.textContent = 'Detecting...';
  statusIndicator.classList.remove('active', 'warning');
  
  chrome.tabs.sendMessage(
    currentTabId,
    { action: 'runDetection' },
    () => {
      if (chrome.runtime.lastError) {
        console.error('Error triggering detection:', chrome.runtime.lastError);
        return;
      }
      
      // Wait a moment and then get the updated result
      setTimeout(getDetectionFromContentScript, 500);
    }
  );
}

/**
 * Shows field help for the detected form
 */
function showFieldHelp() {
  // Basic implementation - highlight form fields on the page
  chrome.tabs.sendMessage(
    currentTabId,
    { action: 'showFieldHelp' },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error showing field help:', chrome.runtime.lastError);
      }
    }
  );
  
  // Close the popup after triggering field help
  window.close();
}

// Event Listeners
document.addEventListener('DOMContentLoaded', initPopup);
checkAgainBtn.addEventListener('click', checkAgain);
fieldHelpBtn.addEventListener('click', showFieldHelp);
debugToggleBtn.addEventListener('click', toggleDebugPanel);