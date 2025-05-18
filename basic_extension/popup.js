/**
 * Business Registration Assistant - Popup Script
 * Handles the extension popup UI and interaction with background/content scripts
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
const requirementsBtn = document.getElementById('requirements-btn');
const debugToggle = document.getElementById('debug-toggle');
const debugPanel = document.getElementById('debug-panel');
const debugContent = document.getElementById('debug-content');

// State variables
let currentTabId = null;
let detectionResult = null;
let isDebugVisible = false;

/**
 * Initialize the popup when it's opened
 */
document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup opened, initializing');
  
  // Get the current tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      showError('Unable to get current tab');
      return;
    }
    
    // Store the current tab ID
    currentTabId = tabs[0].id;
    console.log('Current tab ID:', currentTabId);
    
    // Request detection result from background script
    requestDetectionResult();
  });
  
  // Set up event listeners
  checkAgainBtn.addEventListener('click', runManualDetection);
  fieldHelpBtn.addEventListener('click', showFieldHelp);
  requirementsBtn.addEventListener('click', showRequirements);
  debugToggle.addEventListener('click', toggleDebugPanel);
});

/**
 * Request detection result from the background script
 */
function requestDetectionResult() {
  statusText.textContent = 'Checking...';
  
  chrome.runtime.sendMessage(
    { action: 'getDetectionResult', tabId: currentTabId },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error getting detection result:', chrome.runtime.lastError);
        requestDetectionFromContent();
        return;
      }
      
      console.log('Response from background:', response);
      
      if (response && response.success && response.result) {
        // Got a result from the background script
        updateUI(response.result);
      } else {
        // No result in background script, try the content script
        requestDetectionFromContent();
      }
    }
  );
}

/**
 * Request detection result directly from the content script
 */
function requestDetectionFromContent() {
  console.log('Requesting detection result from content script');
  
  chrome.tabs.sendMessage(
    currentTabId,
    { action: 'getDetectionResult' },
    (result) => {
      if (chrome.runtime.lastError) {
        console.log('Error or content script not available:', chrome.runtime.lastError);
        updateUI(null);
        return;
      }
      
      console.log('Result from content script:', result);
      updateUI(result);
    }
  );
}

/**
 * Run manual detection by sending a message to the content script
 */
function runManualDetection() {
  console.log('Running manual detection');
  statusText.textContent = 'Detecting...';
  
  chrome.tabs.sendMessage(
    currentTabId,
    { action: 'runDetection' },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error triggering detection:', chrome.runtime.lastError);
        showError('Failed to communicate with page');
        return;
      }
      
      console.log('Detection triggered, response:', response);
      
      // Wait a moment for detection to complete
      setTimeout(requestDetectionResult, 500);
    }
  );
}

/**
 * Update the UI based on detection result
 */
function updateUI(result) {
  detectionResult = result;
  console.log('Updating UI with result:', result);
  
  // Update debug information
  updateDebugPanel(result);
  
  // No detection result
  if (!result) {
    statusIndicator.classList.remove('active', 'warning');
    statusText.textContent = 'No detection';
    noDetectionView.classList.add('active');
    detectionView.classList.remove('active');
    return;
  }
  
  // Determine if it's a valid business form
  const isBusinessForm = result.isBusinessRegistrationForm;
  
  // Update indicator and status text
  if (isBusinessForm) {
    statusIndicator.classList.add('active');
    statusIndicator.classList.remove('warning');
    statusText.textContent = 'Business form detected';
    noDetectionView.classList.remove('active');
    detectionView.classList.add('active');
  } else {
    statusIndicator.classList.remove('active');
    statusIndicator.classList.add('warning');
    statusText.textContent = 'Not a business form';
    noDetectionView.classList.add('active');
    detectionView.classList.remove('active');
  }
  
  // Update detected state
  detectedState.textContent = result.state ? getStateFullName(result.state) : 'Unknown';
  
  // Update confidence score
  const confidence = result.confidenceScore || 0;
  confidenceBar.style.width = `${confidence}%`;
  confidenceValue.textContent = `${confidence}%`;
  
  // Update button states
  fieldHelpBtn.disabled = !isBusinessForm;
  requirementsBtn.disabled = !result.state;
}

/**
 * Show field help for the current form
 */
function showFieldHelp() {
  if (!detectionResult || !detectionResult.isBusinessRegistrationForm) {
    return;
  }
  
  // For simplicity, just show an alert in this basic version
  alert(`Field help for ${getStateFullName(detectionResult.state)} business registration form.\n\nThis would normally show detailed help for each field on the form.`);
  
  // In a more advanced version, you would send a message to the content script
  // to highlight fields and show tooltips
}

/**
 * Show state-specific requirements
 */
function showRequirements() {
  if (!detectionResult || !detectionResult.state) {
    return;
  }
  
  const state = detectionResult.state;
  const stateName = getStateFullName(state);
  
  // Show a simple alert with state information
  alert(`Requirements for registering a business in ${stateName}.\n\nIn a full implementation, this would show detailed information about ${stateName}'s specific business registration requirements.`);
}

/**
 * Toggle debug panel visibility
 */
function toggleDebugPanel() {
  isDebugVisible = !isDebugVisible;
  debugPanel.classList.toggle('visible', isDebugVisible);
  debugToggle.textContent = isDebugVisible ? 'Hide Debug Information' : 'Show Debug Information';
}

/**
 * Update debug panel with detection information
 */
function updateDebugPanel(data) {
  if (!data) {
    debugContent.textContent = 'No detection data available';
    return;
  }
  
  try {
    // Format the data as pretty JSON
    const debugText = JSON.stringify(data, null, 2);
    debugContent.textContent = debugText;
  } catch (error) {
    debugContent.textContent = 'Error formatting debug data: ' + error.message;
  }
}

/**
 * Show an error message in the popup
 */
function showError(message) {
  statusText.textContent = 'Error';
  statusIndicator.classList.remove('active');
  statusIndicator.classList.add('warning');
  
  console.error('Error:', message);
  
  // Show the no detection view with error
  noDetectionView.classList.add('active');
  detectionView.classList.remove('active');
  
  // Update debug panel
  updateDebugPanel({ error: message });
}

/**
 * Get full state name from state code
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
    'DC': 'District of Columbia',
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
    'WY': 'Wyoming'
  };
  
  return stateMap[stateCode] || stateCode;
}