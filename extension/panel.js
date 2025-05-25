/**
 * Business Registration Assistant - Panel Script
 * Main script for the sidebar panel UI
 */

// DOM elements - Navigation
const endeavorsButton = document.getElementById('endeavors-button');
const userButton = document.getElementById('user-button');
const autoFillButton = document.getElementById('auto-fill-button');

// DOM elements - Detection
const statusIndicator = document.getElementById('status-indicator');
const noDetectionView = document.getElementById('no-detection');
const detectionView = document.getElementById('detection');
const stateValue = document.getElementById('state-value');
const confidenceBar = document.getElementById('confidence-bar');
const confidenceValue = document.getElementById('confidence-value');
const errorContainer = document.getElementById('error-container');

// Show error message
function showError(message, isHtml = false) {
  if (!errorContainer) {
    console.error('Error container not found:', message);
    return;
  }
  
  // Clear previous content
  errorContainer.innerHTML = '';
  
  if (isHtml && typeof message === 'string') {
    // Parse HTML safely without inline styles
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = message;
    
    // Remove any inline styles to comply with CSP
    const allElements = tempDiv.getElementsByTagName('*');
    for (let elem of allElements) {
      elem.removeAttribute('style');
    }
    
    // Append cleaned content
    while (tempDiv.firstChild) {
      errorContainer.appendChild(tempDiv.firstChild);
    }
  } else {
    errorContainer.textContent = message || 'An error occurred';
  }
  
  // Use class to show instead of inline style
  errorContainer.classList.add('show');
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
    
  let message = '<strong>Error:</strong> ' + (recentError.message || 'Unknown error');
  
  // Add troubleshooting tips based on context
  message += '<div class="error-tips">';
  message += '<strong>Troubleshooting tips:</strong><ul>';
  
  if (recentError.context && (recentError.context.includes('connect') || recentError.message.includes('connect'))) {
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
  if (errorContainer) {
    errorContainer.classList.remove('show');
  }
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
    
    // Setup automatic detection cycle
    function setupAutomaticDetection() {
      // Track if detection is in progress
      let detectionInProgress = false;
      
      // Function to check for forms
      function checkForForms() {
        if (detectionInProgress) {
          return; // Prevent overlapping detection attempts
        }
        
        // Get current tab
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (!tabs || !tabs[0]) {
            return; // No active tab
          }
          
          const tabId = tabs[0].id;
          
          // Set status as checking - visual indicator
          statusIndicator.classList.add('active');
          
          // Mark detection as in progress
          detectionInProgress = true;
          
          // Trigger detection in content script with retry logic
          sendMessageWithRetry(tabId, {
            action: 'triggerDetection'
          }, function(response) {
            // Success callback
            // Wait a moment for detection to finish
            setTimeout(function() {
              getDetectionResult(tabId);
              detectionInProgress = false;
            }, 500);
          }, function(error) {
            // Error callback after all retries
            if (error.message.includes('receiving end does not exist')) {
              showError('The page is not ready yet. Please wait a moment and try again.');
            } else {
              showError('Error connecting to page: ' + error.message);
            }
            detectionInProgress = false;
          });
        });
      }
      
      // Immediately check when panel loads
      checkForForms();
      
      // Set up periodic automatic detection
      const detectionInterval = setInterval(checkForForms, 3000);
      
      // Clean up interval when panel is closed
      window.addEventListener('unload', function() {
        clearInterval(detectionInterval);
      });
      
      return {
        checkNow: checkForForms,
        stopChecking: function() {
          clearInterval(detectionInterval);
        }
      };
    }
    
    // Initialize automatic detection
    const autoDetector = setupAutomaticDetection();
    
    // Set up navigation buttons
    if (endeavorsButton) {
      endeavorsButton.addEventListener('click', function() {
        console.log('[BRA] My Endeavors button clicked');
        // Currently just a placeholder - no functionality yet
      });
    }
    
    if (userButton) {
      userButton.addEventListener('click', function() {
        console.log('[BRA] User button clicked');
        // Currently just a placeholder - no functionality yet
      });
    }
    
    // Set up Auto Fill button functionality
    if (autoFillButton) {
      autoFillButton.addEventListener('click', function() {
        console.log('[BRA] Auto Fill button clicked');
      
      // Show visual feedback that button was clicked
      autoFillButton.disabled = true;
      
      // Get the current tab
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs[0]) {
          // Send message to content script to perform auto-fill
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'autoFillFields'
          }, function(response) {
            // Reset button state
            autoFillButton.disabled = false;
            
            // Handle response
            if (chrome.runtime.lastError) {
              showError('Could not connect to page: ' + chrome.runtime.lastError.message);
              return;
            }
            
            if (response && response.success) {
              // Show success message in chat
              const chatMessages = document.getElementById('chat-messages');
              const message = document.createElement('div');
              message.className = 'message system';
              message.textContent = response.message || 'Auto-filled form fields successfully!';
              chatMessages.appendChild(message);
              chatMessages.scrollTop = chatMessages.scrollHeight;
            } else if (response && response.error) {
              showError(response.error);
            }
          });
        }
      });
    });
    }
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

// Connection retry logic with exponential backoff
function sendMessageWithRetry(tabId, message, onSuccess, onError, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [100, 500, 1500]; // Exponential backoff
  
  chrome.tabs.sendMessage(tabId, message, function(response) {
    if (chrome.runtime.lastError) {
      const error = chrome.runtime.lastError;
      
      // Check if we should retry
      if (retryCount < MAX_RETRIES && error.message.includes('receiving end does not exist')) {
        // Retry after delay
        setTimeout(function() {
          sendMessageWithRetry(tabId, message, onSuccess, onError, retryCount + 1);
        }, RETRY_DELAYS[retryCount]);
      } else {
        // All retries exhausted or non-recoverable error
        if (onError) onError(error);
      }
    } else {
      // Success
      if (onSuccess) onSuccess(response);
    }
  });
}
let currentTabId = null;
let autoRetryTimer = null;

// Ask content script for results if background doesn't have them
function askContentScript(tabId) {
  try {
    currentTabId = tabId;
    // First, try to get detection status
    sendMessageWithRetry(tabId, {
      action: 'getDetectionStatus',
      timestamp: Date.now()
    }, function(statusResult) {
      // Success callback - connection established
      hideError();
      
      // Check if status includes fallback mode
      if (statusResult && statusResult.fallbackMode) {
        // Show warning about fallback mode
        showError(`
          <strong>Operating in fallback mode:</strong> Connection to browser extension is limited.
          <div class="error-tips">
            <ul>
              <li>Some features may be unavailable</li>
              <li>Try refreshing the page to restore full functionality</li>
            </ul>
          </div>
        `, true);
      }
      
      // Check if detection is still in progress
      if (statusResult && statusResult.attempts > 0 && !statusResult.hasResult) {
        // Still working - keep the status indicator active
        statusIndicator.classList.add('active');
        
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
        sendMessageWithRetry(tabId, {
          action: 'getDetectionResult'
        }, function(result) {
          // Success - process result
          if (result && result.isBusinessRegistrationForm !== undefined) {
            updateUI(result);
            // Only hide error if not in fallback mode
            if (!result.fallbackMode) {
              hideError();
            }
          } else {
            // No valid result
            showNoDetection();
            
            // If detection hasn't even started, show that
            if (statusResult && statusResult.attempts === 0) {
              showError("Detection hasn't started yet. Click 'Check Again' to begin.");
            }
          }
        }, function(error) {
          // Error getting result
          showError('Error getting detection result: ' + error.message);
          showNoDetection();
        });
      }
    }, function(error) {
      // Error callback - connection failed
      showNoDetection();
      
      // Create error message
      const errorHtml = `
        <strong>Cannot connect to page:</strong> ${error.message}
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
    });
  } catch (error) {
    showError('Error communicating with page: ' + error.message);
    showNoDetection();
  }
}

// Set up a periodic connection check with enhanced monitoring
function setupConnectionMonitoring() {
  // Track connection status
  let isConnected = false;
  let lastActiveTimestamp = Date.now();
  
  // Check connection and auto-trigger detection if needed
  setInterval(() => {
    if (currentTabId) {
      // Quietly ping the content script
      chrome.tabs.sendMessage(currentTabId, { 
        action: 'ping',
        timestamp: Date.now()
      }, function(response) {
        // Handle error first
        if (chrome.runtime.lastError) {
          // Connection lost
          if (isConnected) {
            console.log('[BRA] Connection lost, waiting for reconnection');
            isConnected = false;
          }
          return;
        }
        
        // Successful ping, content script is alive
        if (response && response.alive) {
          // Update last active timestamp
          lastActiveTimestamp = Date.now();
          
          // Update UI if reconnected
          const reconnectStatus = document.getElementById('reconnect-status');
          if (reconnectStatus) {
            reconnectStatus.textContent = 'Connected';
          }
          
          // If we just reconnected, refresh the panel
          if (!isConnected) {
            connectionRetryCount = 0;
            isConnected = true;
            getDetectionResult(currentTabId);
            
            // Also check if content script has new detection results
            if (response.detectionStatus && response.detectionStatus.hasResult) {
              // Trigger an immediate refresh of the data
              setTimeout(() => getDetectionResult(currentTabId), 100);
            }
          }
          
          // Check if detection has changed in content script since we last checked
          if (response.detectionStatus && response.detectionStatus.hasResult) {
            // Get the detection result if it's been more than 5 seconds since last check
            const timeSinceLastCheck = Date.now() - lastActiveTimestamp;
            if (timeSinceLastCheck > 5000) {
              getDetectionResult(currentTabId);
            }
          }
        }
      });
    }
  }, 3000); // Check every 3 seconds
  
  // Enable detection for dynamic forms that might load after initial page load
  setTimeout(() => {
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, {
        action: 'detectDynamicForms'
      }, function(response) {
        // Silently handle errors - this is just an enhancement
        if (chrome.runtime.lastError || !response || !response.success) {
          return;
        }
        console.log('[BRA] Dynamic form detection enabled');
      });
    }
  }, 2000);
}

// Initialize enhanced connection monitoring
setupConnectionMonitoring();

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