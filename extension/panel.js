/**
 * Business Registration Assistant - Panel Script
 * Main script for the sidebar panel UI
 */

// DOM elements - Navigation
const endeavorsButton = document.getElementById('endeavors-button');
const userButton = document.getElementById('user-button');

// DOM elements - Detection
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const noDetectionView = document.getElementById('no-detection');
const detectionView = document.getElementById('detection');
const stateValue = document.getElementById('state-value');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceValue = document.getElementById('confidence-value');
const checkAgainButton = document.getElementById('check-again');
const errorContainer = document.getElementById('error-container');

// Show error message
function showError(message) {
  errorContainer.textContent = message;
  errorContainer.style.display = 'block';
}

// Hide error message
function hideError() {
  errorContainer.style.display = 'none';
}

// Initialize when panel opens
document.addEventListener('DOMContentLoaded', function() {
  console.log('[BRA] Panel opened');
  
  try {
    // Get current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs[0]) {
        // Get detection for current tab
        getDetectionResult(tabs[0].id);
      }
    });
    
    // Set up Check Again button
    checkAgainButton.addEventListener('click', function() {
      statusText.textContent = 'Checking...';
      hideError();
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs[0]) {
          // Ask content script to run detection
          try {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'triggerDetection'
            }, function(response) {
              if (chrome.runtime.lastError) {
                showError('Error connecting to page: ' + chrome.runtime.lastError.message);
                return;
              }
              
              // Wait a moment for detection to finish
              setTimeout(function() {
                getDetectionResult(tabs[0].id);
              }, 500);
            });
          } catch (error) {
            showError('Error triggering detection: ' + error.message);
          }
        }
      });
    });
    
    // Set up navigation buttons
    endeavorsButton.addEventListener('click', function() {
      console.log('[BRA] My Endeavors button clicked');
      // Currently just a placeholder - no functionality yet
    });
    
    userButton.addEventListener('click', function() {
      console.log('[BRA] User button clicked');
      // Currently just a placeholder - no functionality yet
    });
  } catch (error) {
    showError('Initialization error: ' + error.message);
  }
});

// Get detection result from background script
function getDetectionResult(tabId) {
  try {
    chrome.runtime.sendMessage({
      action: 'getDetectionResult',
      tabId: tabId
    }, function(response) {
      if (chrome.runtime.lastError) {
        showError('Error getting detection result: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response && response.success && response.result) {
        // Show detection result
        updateUI(response.result);
        hideError();
      } else {
        // Try asking content script directly
        askContentScript(tabId);
      }
    });
  } catch (error) {
    showError('Error communicating with background: ' + error.message);
  }
}

// Ask content script for results if background doesn't have them
function askContentScript(tabId) {
  try {
    chrome.tabs.sendMessage(tabId, {
      action: 'getDetectionResult'
    }, function(result) {
      if (chrome.runtime.lastError) {
        // Content script not available
        showNoDetection();
        showError('Cannot connect to page: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (result) {
        updateUI(result);
        hideError();
      } else {
        showNoDetection();
      }
    });
  } catch (error) {
    showError('Error communicating with page: ' + error.message);
    showNoDetection();
  }
}

// Update UI with detection result
function updateUI(result) {
  if (!result || !result.isBusinessRegistrationForm) {
    showNoDetection();
    return;
  }
  
  // Show detection view
  noDetectionView.classList.add('hidden');
  detectionView.classList.remove('hidden');
  
  // Update status indicator
  statusIndicator.classList.add('active');
  statusText.textContent = 'Business form detected';
  
  // Update state
  stateValue.textContent = result.state ? getStateName(result.state) : 'Unknown';
  
  // Update confidence
  const confidence = result.confidenceScore;
  confidenceBar.style.width = Math.min(confidence, 100) + '%';
  confidenceValue.textContent = confidence + '%';
}

// Show no detection view
function showNoDetection() {
  statusIndicator.classList.remove('active');
  statusText.textContent = 'No detection';
  
  noDetectionView.classList.remove('hidden');
  detectionView.classList.add('hidden');
}

// Get full state name
function getStateName(code) {
  const states = {
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
  
  return states[code] || code;
}