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
function showError(message, isHtml = false) {
  if (isHtml) {
    errorContainer.innerHTML = message;
  } else {
    errorContainer.textContent = message;
  }
  errorContainer.style.display = 'block';
}

// Format error details into HTML
function formatErrorDetails(errors) {
  if (!errors || errors.length === 0) {
    return null;
  }
  
  // Show only the most recent fatal error by default
  const fatalErrors = errors.filter(err => err.isFatal);
  const recentError = fatalErrors.length > 0 ? 
    fatalErrors[fatalErrors.length - 1] : 
    errors[errors.length - 1];
    
  let message = '<strong>Error:</strong> ' + recentError.message;
  
  // Add troubleshooting tips based on context
  message += '<div class="error-tips">';
  message += '<strong>Troubleshooting tips:</strong><ul>';
  
  if (recentError.context.includes('connect') || recentError.message.includes('connect')) {
    message += '<li>Try refreshing the page</li>';
    message += '<li>Check if the website allows extensions</li>';
  }
  
  if (recentError.context.includes('permission') || recentError.message.includes('permission')) {
    message += '<li>This site may have restricted permissions</li>';
    message += '<li>Try clicking "Allow" if prompted</li>';
  }
  
  if (recentError.context === 'maxRetries') {
    message += '<li>The page may still be loading</li>';
    message += '<li>The form might be in a different frame</li>';
    message += '<li>Try clicking "Check Again" in a moment</li>';
  }
  
  // Default tips
  message += '<li>Try disabling and re-enabling the extension</li>';
  message += '</ul></div>';
  
  if (errors.length > 1) {
    message += `<div class="error-count">${errors.length} issues detected</div>`;
  }
  
  return message;
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
      } else if (response && response.hasErrors && response.errors) {
        // Show formatted error with troubleshooting tips
        const errorHtml = formatErrorDetails(response.errors);
        if (errorHtml) {
          showError(errorHtml, true);
        } else {
          showError('Detection failed. Please try again.');
        }
        
        // Update status to show no detection
        showNoDetection();
      } else {
        // Try asking content script directly
        askContentScript(tabId);
      }
    });
    
    // Also get detailed error information if available
    chrome.runtime.sendMessage({
      action: 'getDetectionErrors',
      tabId: tabId
    }, function(response) {
      if (chrome.runtime.lastError || !response || !response.success) {
        return; // Silently fail
      }
      
      if (response.errors && response.errors.length > 0) {
        const errorHtml = formatErrorDetails(response.errors);
        if (errorHtml) {
          showError(errorHtml, true);
        }
      }
    });
  } catch (error) {
    showError('Error communicating with background: ' + error.message);
  }
}

// Ask content script for results if background doesn't have them
function askContentScript(tabId) {
  try {
    // First, try to get detection status
    chrome.tabs.sendMessage(tabId, {
      action: 'getDetectionStatus'
    }, function(statusResult) {
      if (chrome.runtime.lastError) {
        // Connection error - provide helpful troubleshooting
        showNoDetection();
        
        const errorHtml = `
          <strong>Cannot connect to page:</strong> ${chrome.runtime.lastError.message}
          <div class="error-tips">
            <strong>Troubleshooting tips:</strong>
            <ul>
              <li>The page may be using a restricted Content Security Policy</li>
              <li>Try refreshing the page</li>
              <li>The extension may need additional permissions</li>
              <li>The page might be in a protected state</li>
            </ul>
          </div>
        `;
        
        showError(errorHtml, true);
        return;
      }
      
      // Check if detection is still in progress
      if (statusResult && statusResult.attempts > 0 && !statusResult.hasResult) {
        // Still working - show status
        statusText.textContent = `Checking... (${statusResult.attempts}/${statusResult.maxAttempts})`;
        
        // Wait a bit and check again if still trying
        if (statusResult.attempts < statusResult.maxAttempts) {
          setTimeout(function() {
            getDetectionResult(tabId);
          }, 1000);
        } else {
          // Done trying, but failed
          showNoDetection();
        }
      } else {
        // Has result or hasn't started - get the result
        chrome.tabs.sendMessage(tabId, {
          action: 'getDetectionResult'
        }, function(result) {
          if (chrome.runtime.lastError) {
            showNoDetection();
            return;
          }
          
          if (result && result.isBusinessRegistrationForm !== undefined) {
            updateUI(result);
            hideError();
          } else {
            // No valid result
            showNoDetection();
            
            // If detection hasn't even started, show that
            if (statusResult && statusResult.attempts === 0) {
              showError("Detection hasn't started yet. Click 'Check Again' to begin.");
            }
          }
        });
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