/**
 * Business Registration Assistant - Panel Script
 * Main script for the sidebar panel UI
 */

// DOM elements - Navigation
const endeavorsButton = document.getElementById('endeavors-button');
const userButton = document.getElementById('user-button');
const autoFillButton = document.getElementById('auto-fill-button');

// DOM elements - Detection
// const statusIndicator = document.getElementById('status-indicator'); // Removed with blue status bar
const mainContent = document.getElementById('main-content');
const errorContainer = document.getElementById('error-container');

// DOM elements - Fields Section
const fieldsList = document.getElementById('fields-list');

// DOM elements - Top confidence meter
const confidenceMeter = document.getElementById('confidence-meter');
const confidenceBarTop = document.getElementById('confidence-bar-top');
const confidenceText = document.getElementById('confidence-text');

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

// Listen for detection updates from background
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  console.log('[BRA Panel] ===== MESSAGE RECEIVED =====');
  console.log('[BRA Panel] Full message:', JSON.stringify(message));
  console.log('[BRA Panel] Message type/action:', message.action || message.type || 'unknown');
  
  if (message.action === 'detectionUpdated') {
    console.log('[BRA Panel] ===== DETECTION UPDATED =====');
    console.log('[BRA Panel] Tab ID:', message.tabId);
    console.log('[BRA Panel] Result:', JSON.stringify(message.result));
    
    // Update UI with new detection result
    if (message.result) {
      console.log('[BRA Panel] Calling updateUI with detection result');
      updateUI(message.result);
    } else {
      console.log('[BRA Panel] No result in detectionUpdated message!');
    }
  }
  
  // Handle direct updateDetection messages from fieldDetector
  if (message.type === 'updateDetection') {
    console.log('[BRA Panel] Direct detection update received:', message);
    console.log('[BRA Panel] Creating detection result with confidence:', message.confidence);
    
    // Create a result object that updateUI expects
    const detectionResult = {
      isBusinessRegistrationForm: message.isDetected,
      confidenceScore: message.confidence,
      state: message.state,
      fieldDetection: {
        isDetected: message.isDetected,
        confidence: message.confidence,
        state: message.state,
        classifiedFields: message.fields,
        fields: message.fieldData || [],
        uiData: message.uiData || null
      }
    };
    
    console.log('[BRA Panel] Calling updateUI with result:', detectionResult);
    // Update UI immediately
    updateUI(detectionResult);
  }
  
  // Always send a response to avoid errors
  if (sendResponse) {
    sendResponse({received: true});
  }
  
  return true; // Keep message channel open for async response
});

// Global reference to auto detector
let autoDetector = null;

// Initialize when panel opens
document.addEventListener('DOMContentLoaded', function() {
  console.log('[BRA Panel] ============ PANEL OPENED ============');
  console.log('[BRA Panel] Timestamp:', new Date().toISOString());
  
  try {
    // Clear initial "Detecting..." after a timeout if nothing happens
    setTimeout(function() {
      if (confidenceText && confidenceText.textContent === 'Detecting...') {
        console.log('[BRA Panel] Clearing stuck "Detecting..." text');
        confidenceText.textContent = 'No form detected';
      }
    }, 3000); // 3 second timeout
    
    // Get current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      console.log('[BRA Panel] Initial tabs query result:', tabs);
      if (tabs && tabs[0]) {
        console.log('[BRA Panel] Initial tab ID:', tabs[0].id, 'URL:', tabs[0].url);
        currentTabId = tabs[0].id; // Store current tab ID
        console.log('[BRA Panel] Calling getDetectionResult for tab:', tabs[0].id);
        // Get detection for current tab
        getDetectionResult(tabs[0].id);
      } else {
        console.log('[BRA Panel] No tabs found on initial load');
        // Clear "Detecting..." if no tabs
        if (confidenceText) {
          confidenceText.textContent = 'No form detected';
        }
      }
    });
    
    // Setup automatic detection cycle
    function setupAutomaticDetection() {
      // Track if detection is in progress
      let detectionInProgress = false;
      let detectionInterval = null;
      
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
          
          // Mark detection as in progress
          detectionInProgress = true;
          
          // Trigger detection in content script with retry logic
          sendMessageWithRetry(tabId, {
            action: 'triggerDetection'
          }, function(response) {
            // Success callback
            // Check if detection already completed
            if (response && response.hasResult && response.result) {
              console.log('[BRA Panel] Detection result available');
              updateUI(response.result);
              detectionInProgress = false;
              return;
            }
            
            // Wait for detection to finish
            setTimeout(function() {
              getDetectionResult(tabId);
              detectionInProgress = false;
            }, 2000);
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
      
      // Don't immediately check - let the initial getDetectionResult complete first
      // checkForForms();
      
      // Set up periodic automatic detection - start after initial delay
      detectionInterval = setInterval(checkForForms, 5000);
      
      // Clean up interval when panel is closed
      window.addEventListener('unload', function() {
        if (detectionInterval) {
          clearInterval(detectionInterval);
        }
      });
      
      return {
        checkNow: checkForForms,
        stopChecking: function() {
          if (detectionInterval) {
            clearInterval(detectionInterval);
            detectionInterval = null;
          }
        }
      };
    }
    
    // Initialize automatic detection
    autoDetector = setupAutomaticDetection();
    
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
    console.log('[BRA Panel] Getting detection result for tab:', tabId);
    chrome.runtime.sendMessage({
      action: 'getDetectionResult',
      tabId: tabId
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[BRA Panel] Error getting detection result:', chrome.runtime.lastError);
        showError('Error getting detection result: ' + chrome.runtime.lastError.message);
        return;
      }
      
      console.log('[BRA Panel] Got response:', response);
      
      if (response && response.success && response.result) {
        console.log('[BRA Panel] Detection result:', response.result);
        // Show detection result
        updateUI(response.result);
        hideError();
      } else if (response && response.hasErrors && response.errors) {
        console.log('[BRA Panel] Has errors:', response.errors);
        // Show formatted error with troubleshooting tips
        const errorHtml = formatErrorDetails(response.errors);
        if (errorHtml) {
          showError(errorHtml, true);
        } else {
          showError('Detection failed. Please try again.');
        }
        
        // Update status to show no detection
        showNoDetection();
      } else if (response && response.success === false) {
        console.log('[BRA Panel] No detection result available yet');
        // Clear "Detecting..." text if no result
        if (confidenceText && confidenceText.textContent === 'Detecting...') {
          confidenceText.textContent = 'No form detected';
        }
        // Try asking content script directly
        askContentScript(tabId);
        
        // Also set up a delayed retry to catch any late-arriving results
        setTimeout(function() {
          console.log('[BRA Panel] Delayed retry for detection result');
          if (!lastUpdateResult || !lastUpdateResult.isBusinessRegistrationForm) {
            getDetectionResult(tabId);
          }
        }, 2000);
      } else {
        console.log('[BRA Panel] No result from background, asking content script');
        // Try asking content script directly
        askContentScript(tabId);
        
        // Only trigger a fresh detection if we don't already have a result
        if (!lastUpdateResult || !lastUpdateResult.isBusinessRegistrationForm) {
          console.log('[BRA Panel] Triggering fresh detection');
          chrome.tabs.sendMessage(tabId, {
            action: 'triggerDetection'
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.error('[BRA Panel] Error triggering detection:', chrome.runtime.lastError);
              
              // If content script not ready, wait and retry
              if (chrome.runtime.lastError.message.includes('receiving end does not exist')) {
                console.log('[BRA Panel] Content script not ready, retrying in 2s');
                setTimeout(function() {
                  getDetectionResult(tabId);
                }, 2000);
              }
            } else if (response && response.hasResult && response.result) {
              // Detection already completed, use existing result
              console.log('[BRA Panel] Detection already completed, using existing result');
              updateUI(response.result);
            } else {
              console.log('[BRA Panel] Detection triggered, response:', response);
              // Wait for detection to complete and try again
              setTimeout(function() {
                console.log('[BRA Panel] Retrying getDetectionResult after trigger');
                getDetectionResult(tabId);
              }, 3000);
            }
          });
        }
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
    console.log('[BRA Panel] Asking content script directly for tab:', tabId);
    
    // Ask content script directly for its current detection result
    chrome.tabs.sendMessage(tabId, {
      action: 'getDetectionStatus'
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[BRA Panel] Error asking content script:', chrome.runtime.lastError);
        return;
      }
      
      console.log('[BRA Panel] Content script response:', response);
      if (response && response.hasResult && response.result) {
        // Use the result directly from content script
        updateUI(response.result);
      }
    });
    
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
        // Status indicator removed - detection progress shown in confidence meter
        
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
            
            // Only get detection result if we don't already have one
            if (!lastUpdateResult || !lastUpdateResult.isBusinessRegistrationForm) {
              getDetectionResult(currentTabId);
            }
            
            // Also check if content script has new detection results
            if (response.detectionStatus && response.detectionStatus.hasResult && 
                (!lastUpdateResult || !lastUpdateResult.isBusinessRegistrationForm)) {
              // Trigger an immediate refresh of the data
              setTimeout(() => getDetectionResult(currentTabId), 100);
            }
          }
          
          // Only check for updates if we don't already have a detected form
          if (response.detectionStatus && response.detectionStatus.hasResult && 
              (!lastUpdateResult || !lastUpdateResult.isBusinessRegistrationForm)) {
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

// Track last update to prevent flickering
let lastUpdateTime = 0;
let lastUpdateResult = null;

// Store current detection result for debugging
let currentDetectionResult = null;

// Update UI with detection result
function updateUI(result) {
  console.log('[BRA Panel] updateUI called with:', result);
  
  // Store the current detection result for debugging
  currentDetectionResult = result;
  
  // Throttle updates to prevent flickering (min 500ms between updates)
  const now = Date.now();
  if (lastUpdateResult && (now - lastUpdateTime) < 500) {
    // If we have a recent update and the new one has lower confidence, skip it
    if (result.confidenceScore < lastUpdateResult.confidenceScore) {
      console.log('[BRA Panel] Skipping update with lower confidence to prevent flickering');
      return;
    }
  }
  
  lastUpdateTime = now;
  lastUpdateResult = result;
  
  // Only update the top confidence meter - no duplicate displays
  updateConfidenceMeter(result);
  
  // Update fields display
  updateFieldsDisplay(result);
  
  // Status indicator removed - confidence meter shows detection status
}

// Track last confidence values to prevent unnecessary updates
let lastConfidenceValue = null;
let lastStateValue = null;

// Update the confidence meter at the top of the panel
function updateConfidenceMeter(result) {
  console.log('[BRA Panel] updateConfidenceMeter called with:', result);
  
  if (!confidenceBarTop || !confidenceText) {
    console.error('[BRA Panel] Confidence meter elements not found!');
    return;
  }
  
  if (!result || !result.isBusinessRegistrationForm) {
    // Only update if it's actually changed
    if (lastConfidenceValue !== null || lastStateValue !== null) {
      console.log('[BRA Panel] No business form detected, showing "No form detected"');
      // Show as not detected
      confidenceBarTop.style.width = '0%';
      confidenceBarTop.className = 'confidence-bar-top';
      confidenceText.textContent = 'No form detected';
      lastConfidenceValue = null;
      lastStateValue = null;
    }
    return;
  }
  
  // Use main confidence score, not field detection readiness score
  let confidence = result.confidenceScore || 0;
  const state = result.state || '';
  
  // Check if values have actually changed
  if (confidence === lastConfidenceValue && state === lastStateValue) {
    console.log('[BRA Panel] Confidence values unchanged, skipping update');
    return;
  }
  
  // Log what confidence we're using
  console.log('[BRA Panel] Updating confidence from', lastConfidenceValue, 'to', confidence);
  
  lastConfidenceValue = confidence;
  lastStateValue = state;
  
  const stateName = state ? getStateName(state) : '';
  
  // Update bar width with transition
  confidenceBarTop.style.transition = 'width 0.3s ease-out';
  confidenceBarTop.style.width = Math.min(confidence, 100) + '%';
  
  // Update bar color based on confidence level
  confidenceBarTop.className = 'confidence-bar-top';
  if (confidence >= 70) {
    confidenceBarTop.classList.add('high');
  } else if (confidence >= 40) {
    confidenceBarTop.classList.add('medium');
  } else {
    confidenceBarTop.classList.add('low');
  }
  
  // Update text with bullet separator
  if (state) {
    confidenceText.textContent = `${state} • ${confidence}%`;
    console.log('[BRA Panel] Set confidence text to:', `${state} • ${confidence}%`);
  } else {
    confidenceText.textContent = `${confidence}%`;
    console.log('[BRA Panel] Set confidence text to:', `${confidence}%`);
  }
  
  console.log('[BRA Panel] Confidence meter updated successfully');
}

// Show no detection view
function showNoDetection() {
  // Status indicator removed - only update confidence meter
  updateConfidenceMeter(null);
  // Clear fields display
  updateFieldsDisplay(null);
}

// Update the fields display with detected fields
function updateFieldsDisplay(result) {
  console.log('[BRA Panel] updateFieldsDisplay called with:', result);
  
  if (!fieldsList) {
    console.error('[BRA Panel] Fields list element not found!');
    return;
  }
  
  // Clear existing content
  fieldsList.innerHTML = '';
  
  // Check if we have field detection results
  if (!result || !result.fieldDetection || !result.isBusinessRegistrationForm) {
    fieldsList.innerHTML = '<div class="no-fields-message">No fields detected yet</div>';
    return;
  }
  
  // Important business field categories to display
  const importantCategories = [
    'business_name', 'entity_type', 'ein', 'tax_id', 'ssn',
    'business_address', 'address', 'city', 'state', 'zip',
    'email', 'phone', 'fax', 'dba', 'trade_name',
    'owner_name', 'registered_agent', 'naics_code',
    'other' // Include unclassified fields too
  ];
  
  // Extract all fields first, then handle classification
  let allFields = [];
  
  // Try to get fields from uiData categories (preferred source)
  if (result.fieldDetection && result.fieldDetection.uiData && result.fieldDetection.uiData.categories) {
    console.log('[BRA Panel] Found uiData categories:', result.fieldDetection.uiData.categories);
    const categories = result.fieldDetection.uiData.categories;
    
    // Extract ALL fields from each category
    Object.keys(categories).forEach(categoryName => {
      const category = categories[categoryName];
      if (category.fields && Array.isArray(category.fields)) {
        console.log(`[BRA Panel] Category "${categoryName}" has ${category.fields.length} fields`);
        // Add fields while preserving their properties
        category.fields.forEach(field => {
          // Ensure field has all necessary properties
          const fieldWithCategory = {
            ...field,
            categoryName: categoryName
          };
          allFields.push(fieldWithCategory);
        });
      }
    });
  }
  // Fallback: Try to get from fields array
  else if (result.fieldDetection && result.fieldDetection.fields && Array.isArray(result.fieldDetection.fields)) {
    console.log('[BRA Panel] Found fields array:', result.fieldDetection.fields);
    allFields = result.fieldDetection.fields;
  }
  
  console.log(`[BRA Panel] Total fields found: ${allFields.length}`);
  
  // Process fields - show classified ones and attempt to classify unclassified ones
  let fieldsToDisplay = [];
  
  allFields.forEach(field => {
    console.log('[BRA Panel] Processing field:', field);
    
    // Get field label for classification - try all possible sources
    let fieldLabel = '';
    if (field.label && typeof field.label === 'object') {
      if (field.label.text) {
        fieldLabel = field.label.text.toLowerCase();
      } else if (field.label.value) {
        fieldLabel = field.label.value.toLowerCase();
      } else {
        // Try to extract from object
        fieldLabel = JSON.stringify(field.label).toLowerCase();
      }
    } else if (typeof field.label === 'string') {
      fieldLabel = field.label.toLowerCase();
    } else if (field.name) {
      fieldLabel = field.name.toLowerCase();
    } else if (field.placeholder) {
      fieldLabel = field.placeholder.toLowerCase();
    } else if (field.id) {
      fieldLabel = field.id.toLowerCase();
    } else if (field.type) {
      fieldLabel = field.type.toLowerCase();
    }
    
    console.log(`[BRA Panel] Field label extracted: "${fieldLabel}"`);
    
    // Also check attributes if available
    if (!fieldLabel && field.attributes) {
      if (field.attributes.placeholder) fieldLabel = field.attributes.placeholder.toLowerCase();
      else if (field.attributes.name) fieldLabel = field.attributes.name.toLowerCase();
      else if (field.attributes.id) fieldLabel = field.attributes.id.toLowerCase();
    }
    
    // Check if field has classification
    let classification = field.classification;
    
    // If no classification or classification is 'other', try to classify based on label
    if (!classification || !classification.category || classification.category === 'other') {
      console.log(`[BRA Panel] Attempting to classify field with label: "${fieldLabel}"`);
      
      // Pattern matching for common business fields - more flexible
      if (fieldLabel.match(/business.*name|legal.*name|company.*name|organization.*name/i)) {
        classification = { category: 'business_name', confidence: 85 };
      } else if (fieldLabel.match(/entity|organization.*type|business.*type|structure|incorporation/i)) {
        classification = { category: 'entity_type', confidence: 85 };
      } else if (fieldLabel.match(/ein|employer.*id|federal.*id|tax.*number/i)) {
        classification = { category: 'ein', confidence: 85 };
      } else if (fieldLabel.match(/tax.*id|state.*id|id.*type/i)) {
        classification = { category: 'tax_id', confidence: 85 };
      } else if (fieldLabel.match(/dba|doing.*business|trade.*name|fictitious/i)) {
        classification = { category: 'dba', confidence: 85 };
      } else if (fieldLabel.match(/address|street|location/i) && !fieldLabel.includes('email')) {
        classification = { category: 'address', confidence: 85 };
      } else if (fieldLabel.match(/city|town|municipality/i)) {
        classification = { category: 'city', confidence: 85 };
      } else if (fieldLabel.match(/state|province|region/i) && !fieldLabel.includes('statement')) {
        classification = { category: 'state', confidence: 85 };
      } else if (fieldLabel.match(/zip|postal|post.*code/i)) {
        classification = { category: 'zip', confidence: 85 };
      } else if (fieldLabel.match(/email|e-mail|electronic.*mail/i)) {
        classification = { category: 'email', confidence: 85 };
      } else if (fieldLabel.match(/phone|telephone|tel|mobile|contact.*number/i)) {
        classification = { category: 'phone', confidence: 85 };
      } else if (fieldLabel.match(/owner|principal|proprietor|member.*name/i)) {
        classification = { category: 'owner_name', confidence: 85 };
      } else if (fieldLabel.match(/agent|registered.*agent|statutory/i)) {
        classification = { category: 'registered_agent', confidence: 85 };
      } else if (fieldLabel.match(/naics|industry.*code|business.*code/i)) {
        classification = { category: 'naics_code', confidence: 85 };
      } else if (fieldLabel.match(/ssn|social.*security/i)) {
        classification = { category: 'ssn', confidence: 85 };
      } else if (fieldLabel.match(/fax|facsimile/i)) {
        classification = { category: 'fax', confidence: 85 };
      }
      
      // If still no match but it's a text field with business-related keywords, classify as other
      if (!classification && fieldLabel.match(/business|company|organization|corporate|llc|inc|ltd/i)) {
        classification = { category: 'other', confidence: 70 };
      }
      
      // Update field classification if we found a match
      if (classification) {
        field.classification = classification;
        console.log(`[BRA Panel] Classified as: ${classification.category}`);
      }
    }
    
    // Add field if it has a valid classification in important categories
    if (classification && classification.category && importantCategories.includes(classification.category)) {
      fieldsToDisplay.push(field);
    }
  });
  
  console.log(`[BRA Panel] Fields to display: ${fieldsToDisplay.length}`);
  
  // If still no fields but we have unclassified fields, show some of them
  if (fieldsToDisplay.length === 0 && allFields.length > 0) {
    console.log('[BRA Panel] No classified fields, showing first 5 unclassified fields');
    fieldsToDisplay = allFields.slice(0, 5).map(field => {
      if (!field.classification) {
        field.classification = { category: 'other', confidence: 50 };
      }
      return field;
    });
  }
  
  let classifiedFields = fieldsToDisplay;
  
  console.log('[BRA Panel] Classified fields to display:', classifiedFields);
  
  if (classifiedFields.length === 0) {
    // Check if we have field count but no details
    const fieldCount = result.fieldDetection.classifiedFields || 0;
    if (fieldCount > 0) {
      fieldsList.innerHTML = `<div class="no-fields-message">Found ${fieldCount} fields - waiting for classification details...</div>`;
    } else {
      fieldsList.innerHTML = '<div class="no-fields-message">No business fields detected yet</div>';
    }
    return;
  }
  
  // Sort fields by their DOM position (top to bottom order on the form)
  classifiedFields.sort((a, b) => {
    // Try to get position from various sources
    let posA = Number.MAX_SAFE_INTEGER;
    let posB = Number.MAX_SAFE_INTEGER;
    
    // Check for explicit position/index
    if (a.position !== undefined) posA = a.position;
    else if (a.index !== undefined) posA = a.index;
    else if (a.order !== undefined) posA = a.order;
    else if (a.domIndex !== undefined) posA = a.domIndex;
    
    if (b.position !== undefined) posB = b.position;
    else if (b.index !== undefined) posB = b.index;
    else if (b.order !== undefined) posB = b.order;
    else if (b.domIndex !== undefined) posB = b.domIndex;
    
    // If we have element references, try to compare their positions
    if (a.element && b.element && a.element.compareDocumentPosition) {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1; // a comes before b
      } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1; // b comes before a
      }
    }
    
    // Fall back to position numbers if available
    if (posA !== Number.MAX_SAFE_INTEGER || posB !== Number.MAX_SAFE_INTEGER) {
      return posA - posB;
    }
    
    // If no position info, maintain original order
    return 0;
  });
  
  console.log('[BRA Panel] Fields sorted by DOM position');
  
  // Create field items
  classifiedFields.forEach(field => {
    const fieldItem = document.createElement('div');
    fieldItem.className = 'field-item';
    
    // Get field label - use same logic as classification
    let label = '';
    if (field.label && typeof field.label === 'object') {
      if (field.label.text) {
        label = field.label.text;
      } else if (field.label.value) {
        label = field.label.value;
      } else {
        // Try to extract meaningful text from object
        const labelStr = JSON.stringify(field.label);
        // Remove JSON syntax and extract text
        label = labelStr.replace(/[{}"]/g, '').split(':').pop() || 'Field';
      }
    } else if (typeof field.label === 'string') {
      label = field.label;
    } else if (field.name) {
      label = field.name;
    } else if (field.placeholder) {
      label = field.placeholder;
    } else if (field.id) {
      // Convert ID to readable format (e.g., business_name -> Business Name)
      label = field.id.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    } else if (field.fieldName) {
      label = field.fieldName;
    } else {
      label = 'Unnamed field';
    }
    
    // Clean up the label
    label = String(label).trim();
    if (label.length > 40) {
      label = label.substring(0, 37) + '...';
    }
    
    // Get field type/classification
    const fieldType = field.classification.category || 'unknown';
    const confidence = field.classification.confidence || 0;
    
    // Create label element
    const labelEl = document.createElement('div');
    labelEl.className = 'field-label';
    labelEl.textContent = label;
    labelEl.title = `${label} (${confidence}% confidence)`; // Tooltip with confidence
    
    // Create type element with formatted text
    const typeEl = document.createElement('div');
    typeEl.className = `field-type ${fieldType.replace(/[^a-zA-Z0-9]/g, '_')}`;
    typeEl.textContent = fieldType.replace(/_/g, ' ');
    
    fieldItem.appendChild(labelEl);
    fieldItem.appendChild(typeEl);
    fieldsList.appendChild(fieldItem);
  });
  
  console.log(`[BRA Panel] Displayed ${classifiedFields.length} classified fields`);
}

// Expose functions globally for debugging
window.updateUI = updateUI;
window.updateConfidenceMeter = updateConfidenceMeter;

// Debug helper for testing
window.testDetection = function(confidence = 60, state = 'DC') {
  console.log('Testing detection update with:', { confidence, state });
  const testResult = {
    isBusinessRegistrationForm: true,
    confidenceScore: confidence,
    state: state,
    fieldDetection: {
      isDetected: true,
      confidence: confidence,
      state: state
    }
  };
  updateUI(testResult);
};

// Debug DOM elements
window.checkElements = function() {
  console.log('Checking DOM elements:');
  console.log('- confidenceBarTop:', confidenceBarTop);
  console.log('- confidenceText:', confidenceText);
  // console.log('- statusIndicator:', statusIndicator); // Removed
  console.log('- mainContent:', mainContent);
  
  if (confidenceBarTop) {
    console.log('  - confidenceBarTop.style.width:', confidenceBarTop.style.width);
    console.log('  - confidenceBarTop.className:', confidenceBarTop.className);
  }
  if (confidenceText) {
    console.log('  - confidenceText.textContent:', confidenceText.textContent);
  }
};

// Debug helper to manually trigger detection flow
window.debugDetection = function() {
  console.log('[BRA Panel] ===== DEBUG DETECTION FLOW =====');
  
  if (!currentTabId) {
    console.error('No current tab ID!');
    return;
  }
  
  console.log('1. Requesting detection result from background...');
  chrome.runtime.sendMessage({
    action: 'getDetectionResult',
    tabId: currentTabId
  }, function(response) {
    console.log('2. Background response:', response);
    
    if (!response || !response.result) {
      console.log('3. No result from background, asking content script...');
      chrome.tabs.sendMessage(currentTabId, {
        action: 'getDetectionStatus'
      }, function(statusResponse) {
        console.log('4. Content script status:', statusResponse);
        
        if (statusResponse && statusResponse.hasResult) {
          console.log('5. Content script has result, requesting it...');
          chrome.tabs.sendMessage(currentTabId, {
            action: 'getDetectionResult'
          }, function(resultResponse) {
            console.log('6. Content script result:', resultResponse);
            if (resultResponse) {
              updateUI(resultResponse);
            }
          });
        }
      });
    } else {
      console.log('3. Got result from background, updating UI...');
      updateUI(response.result);
    }
  });
};

// Helper to get current detection from background
window.getCurrentDetection = function() {
  if (!currentTabId) {
    console.error('No current tab ID');
    return;
  }
  
  chrome.runtime.sendMessage({
    action: 'getDetectionResult',
    tabId: currentTabId
  }, function(response) {
    console.log('Background detection result:', response);
    if (response && response.result) {
      console.log('Updating UI with result...');
      updateUI(response.result);
    } else {
      console.log('No detection result available');
    }
  });
};

// Helper to test fields display with sample data
window.testFields = function() {
  const sampleResult = {
    isBusinessRegistrationForm: true,
    confidenceScore: 79,
    state: 'DC',
    fieldDetection: {
      isDetected: true,
      confidence: 79,
      state: 'DC',
      classifiedFields: 6,
      uiData: {
        categories: {
          business_info: {
            label: 'Business Information',
            fields: [
              { 
                label: { text: 'Legal Business Name' }, 
                name: 'business_name',
                classification: { category: 'business_name', confidence: 95 }
              },
              { 
                label: { text: 'Entity Type' }, 
                name: 'entity_type',
                classification: { category: 'entity_type', confidence: 90 }
              },
              { 
                label: { text: 'Doing Business As (DBA)' }, 
                name: 'trade_name',
                classification: { category: 'dba', confidence: 85 }
              }
            ]
          },
          tax_info: {
            label: 'Tax Information',
            fields: [
              { 
                label: { text: 'Federal EIN' }, 
                name: 'ein',
                classification: { category: 'ein', confidence: 92 }
              }
            ]
          },
          contact_info: {
            label: 'Contact Information',
            fields: [
              { 
                label: { text: 'Business Email' }, 
                name: 'email',
                classification: { category: 'email', confidence: 88 }
              },
              { 
                label: { text: 'Business Phone' }, 
                name: 'phone',
                classification: { category: 'phone', confidence: 87 }
              }
            ]
          }
        }
      }
    }
  };
  updateUI(sampleResult);
};

console.log('Debug helpers available:');
console.log('- updateUI(result) - Update UI with detection result');
console.log('- updateConfidenceMeter(result) - Update just the confidence meter');
console.log('- updateFieldsDisplay(result) - Update just the fields display');
console.log('- testDetection(confidence, state) - Test with sample data');
console.log('- testFields() - Test fields display with sample data');
console.log('- checkElements() - Check DOM element states');
console.log('- debugDetection() - Debug the detection message flow');
console.log('- getCurrentDetection() - Get and display current detection from background');
console.log('- currentDetectionResult - View the last detection result');
console.log('- Example: testDetection(79, "DC")');

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