/**
 * Business Registration Assistant - Popup Script
 * Simple implementation to display detection results
 */

// Safe messaging wrapper
const safeRuntimeSendMessage = async (message) => {
  try {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Silently handle context invalidation
          if (!chrome.runtime.lastError.message?.includes('Extension context invalidated') &&
              !chrome.runtime.lastError.message?.includes('Could not establish connection')) {
            console.warn('[BRA Popup] Message error:', chrome.runtime.lastError.message);
          }
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[BRA Popup] Failed to send message:', error);
    }
    return null;
  }
};

// DOM elements
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const noDetectionView = document.getElementById('no-detection');
const detectionView = document.getElementById('detection');
const stateValue = document.getElementById('state-value');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceValue = document.getElementById('confidence-value');
const checkAgainButton = document.getElementById('check-again');

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', function() {
  console.log('[BRA] Popup opened');
  
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
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs && tabs[0]) {
        // Ask content script to run detection
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'triggerDetection'
        }, function() {
          // Wait a moment for detection to finish
          setTimeout(function() {
            getDetectionResult(tabs[0].id);
          }, 500);
        });
      }
    });
  });
});

// Get detection result from background script
async function getDetectionResult(tabId) {
  const response = await safeRuntimeSendMessage({
    action: 'getDetectionResult',
    tabId: tabId
  });
  
  if (response && response.success && response.result) {
    // Show detection result
    updateUI(response.result);
  } else {
    // Try asking content script directly
    askContentScript(tabId);
  }
}

// Safe tab message wrapper
const safeTabSendMessage = async (tabId, message) => {
  try {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          // Silently handle expected errors
          if (!chrome.runtime.lastError.message?.includes('Extension context invalidated') &&
              !chrome.runtime.lastError.message?.includes('Receiving end does not exist')) {
            console.warn('[BRA Popup] Tab message error:', chrome.runtime.lastError.message);
          }
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[BRA Popup] Failed to send tab message:', error);
    }
    return null;
  }
};

// Ask content script for results if background doesn't have them
async function askContentScript(tabId) {
  const response = await safeTabSendMessage(tabId, {
    action: 'getDetectionResult'
  });
  
  if (response) {
    updateUI(response);
  } else {
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