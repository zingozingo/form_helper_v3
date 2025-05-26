/**
 * Business Registration Assistant - Panel Script (No Flicker Version)
 * Main script for the sidebar panel UI with fixed display timing
 */

// Import messaging utilities
let messagingUtils = null;
(async function loadMessagingUtils() {
  try {
    const messagingUtilsURL = chrome.runtime.getURL('modules/messagingUtils.js');
    const module = await import(messagingUtilsURL);
    messagingUtils = module.default || module.messagingUtils || module;
    console.log('[BRA Panel] MessagingUtils loaded');
  } catch (error) {
    console.error('[BRA Panel] Failed to load messaging utils:', error);
    // Create fallback
    messagingUtils = {
      isContextValid: () => {
        try {
          return chrome.runtime && chrome.runtime.id;
        } catch (e) {
          return false;
        }
      },
      sendMessage: async (message) => {
        try {
          return await chrome.runtime.sendMessage(message);
        } catch (error) {
          console.error('[BRA Panel] Message error:', error);
          return null;
        }
      },
      sendMessageToTab: async (tabId, message) => {
        try {
          return await chrome.tabs.sendMessage(tabId, message);
        } catch (error) {
          console.error('[BRA Panel] Tab message error:', error);
          return null;
        }
      }
    };
  }
})();

// Track tabs that have confirmed content script presence
const contentScriptTabs = new Set();

// URL patterns where content scripts are injected (from manifest.json)
const CONTENT_SCRIPT_PATTERNS = [
  /^https?:\/\/[^\/]*\.gov\//,
  /^https?:\/\/[^\/]*\.state\.us\//,
  /^https?:\/\/[^\/]*\.ca\.gov\//,
  /^https?:\/\/[^\/]*\.ny\.gov\//,
  /^https?:\/\/[^\/]*\.tx\.gov\//,
  /^https?:\/\/[^\/]*\.fl\.gov\//,
  /^https?:\/\/[^\/]*\.de\.gov\//,
  /^https?:\/\/mytax\.dc\.gov\//,
  /^https?:\/\/[^\/]*\.mytax\.dc\.gov\//,
  /^https?:\/\/[^\/]*\.business\.ca\.gov\//,
  /^https?:\/\/[^\/]*\.businessexpress\.ny\.gov\//,
  /^https?:\/\/[^\/]*\.efile\.sunbiz\.org\//,
  /^https?:\/\/[^\/]*\.dos\.myflorida\.com\//,
  /^https?:\/\/sos\.state\.us\//,
  /^https?:\/\/[^\/]*\.sos\.state\.us\//,
  /^https?:\/\/[^\/]*\.tax\.gov\//,
  /^https?:\/\/tax\.ny\.gov\//,
  /^https?:\/\/tax\.ca\.gov\//,
  /^https?:\/\/tax\.fl\.gov\//,
  /^https?:\/\/tax\.dc\.gov\//,
  /^https?:\/\/[^\/]*\.revenue\.gov\//,
  /^https?:\/\/revenue\.state\.us\//,
  /^https?:\/\/[^\/]*\.sunbiz\.org\//
];

// Check if a URL matches our content script patterns
function isValidContentScriptUrl(url) {
  if (!url) return false;
  return CONTENT_SCRIPT_PATTERNS.some(pattern => pattern.test(url));
}

// Get DOM elements
const confidenceBarTop = document.getElementById('confidence-bar-top');
const confidenceText = document.getElementById('confidence-text');
const errorContainer = document.getElementById('error-container');
const detectionView = document.getElementById('detection-view');
const fieldsSection = document.getElementById('fields-section');
const fieldsList = document.getElementById('fields-list');
const mainContent = document.getElementById('main-content');
const noDetection = document.getElementById('no-detection');

// Current tab ID tracking
let currentTabId = null;

// NEW: Loading state tracking
let detectionInProgress = false;
let detectionTimeout = null;
let pendingDetectionResult = null;
const DETECTION_COMPLETE_DELAY = 1500; // Wait 1.5 seconds for detection to stabilize

// Show error message with HTML support
function showError(message, isHtml = false) {
  console.log('[BRA Panel] showError called with:', message);
  if (errorContainer) {
    errorContainer.innerHTML = isHtml ? message : message;
    errorContainer.classList.add('show');
    
    // Auto-hide after 10 seconds for non-HTML errors
    if (!isHtml) {
      setTimeout(() => {
        hideError();
      }, 10000);
    }
  }
}

// Hide error message
function hideError() {
  if (errorContainer) {
    errorContainer.classList.remove('show');
    // Clear content after animation
    setTimeout(() => {
      if (!errorContainer.classList.contains('show')) {
        errorContainer.innerHTML = '';
      }
    }, 300);
  }
}

// Helper to get state names
function getStateName(stateCode) {
  const states = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
    'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
    'DC': 'District of Columbia', 'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii',
    'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine',
    'MD': 'Maryland', 'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota',
    'MS': 'Mississippi', 'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska',
    'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico',
    'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island',
    'SC': 'South Carolina', 'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas',
    'UT': 'Utah', 'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington',
    'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
  };
  return states[stateCode] || stateCode;
}

// Add context invalidation listener
if (typeof window !== 'undefined') {
  window.addEventListener('extension-context-invalidated', () => {
    console.log('[BRA Panel] Extension context invalidated event received');
    // Clean up UI
    showNoDetection();
    hideError();
  });
}

// Listen for detection updates from background
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Check context validity
  let contextValid = true;
  if (messagingUtils && typeof messagingUtils.isContextValid === 'function') {
    contextValid = messagingUtils.isContextValid();
  } else {
    try {
      contextValid = !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      contextValid = false;
    }
  }
  
  if (!contextValid) {
    console.log('[BRA Panel] Extension context invalid, not processing message');
    return;
  }
  
  // Handle content script handshake
  if (message.action === 'contentScriptReady') {
    console.log('[BRA Panel] Content script ready for tab:', message.tabId || sender?.tab?.id);
    
    const tabId = message.tabId || sender?.tab?.id;
    if (tabId) {
      contentScriptTabs.add(tabId);
      
      // If this is the current tab and we're waiting for content script, get detection
      if (tabId === currentTabId) {
        console.log('[BRA Panel] Content script ready on current tab, getting detection');
        // Add a small delay to let content script fully initialize
        setTimeout(() => {
          getDetectionResult(tabId);
        }, 500);
      }
    }
    
    // Acknowledge the handshake
    if (sendResponse) {
      sendResponse({acknowledged: true});
    }
    return true;
  }
  
  // Handle navigation detection (immediate clear)
  if (message.action === 'navigationDetected') {
    console.log('[BRA Panel] Navigation detected:', message);
    
    // Get the tab ID from message or sender
    const tabId = message.tabId || sender?.tab?.id;
    
    // If this is the current tab, immediately clear fields
    if (tabId === currentTabId) {
      console.log('[BRA Panel] Navigation on current tab - clearing fields immediately');
      
      // NEW: Cancel any pending detection display
      if (detectionTimeout) {
        clearTimeout(detectionTimeout);
        detectionTimeout = null;
      }
      pendingDetectionResult = null;
      detectionInProgress = false;
      
      // Clear all fields and data immediately
      showNoDetection();
      hideError();
      
      // Update status to detecting
      if (confidenceText) {
        confidenceText.textContent = 'Detecting new form...';
      }
      
      // Don't wait for new detection here - content script will notify us
    }
    
    return true;
  }
  
  // Handle URL change notification
  if (message.action === 'urlChanged') {
    console.log('[BRA Panel] URL changed for tab:', message.tabId, 'New URL:', message.newUrl);
    
    // If this is the current tab, refresh detection
    if (message.tabId === currentTabId) {
      console.log('[BRA Panel] URL changed on current tab, refreshing detection');
      
      // NEW: Cancel any pending detection display
      if (detectionTimeout) {
        clearTimeout(detectionTimeout);
        detectionTimeout = null;
      }
      pendingDetectionResult = null;
      detectionInProgress = false;
      
      // Clear any existing data
      showNoDetection();
      hideError();
      
      // Update status to detecting
      if (confidenceText) {
        confidenceText.textContent = 'Detecting...';
      }
      
      // Small delay to let content script initialize
      setTimeout(() => {
        getDetectionResult(message.tabId);
      }, 1000);
    }
    
    if (sendResponse) {
      sendResponse({acknowledged: true});
    }
    return true;
  }
  
  // Handle content change notification
  if (message.action === 'contentChanged') {
    console.log('[BRA Panel] Content changed for tab:', message.tabId || sender?.tab?.id);
    
    const tabId = message.tabId || sender?.tab?.id;
    
    // If this is the current tab, refresh detection
    if (tabId === currentTabId) {
      console.log('[BRA Panel] Content changed on current tab, refreshing detection');
      
      // NEW: Show loading state instead of clearing immediately
      showLoadingState();
      
      // Longer delay for content changes to ensure DOM is stable
      setTimeout(() => {
        getDetectionResult(tabId);
      }, 1500);
    }
    
    if (sendResponse) {
      sendResponse({acknowledged: true});
    }
    return true;
  }
  
  // Handle conditional fields change notification
  if (message.action === 'conditionalFieldsChanged') {
    console.log('[BRA Panel] Conditional fields changed');
    
    const tabId = message.tabId || sender?.tab?.id;
    
    // If this is the current tab, update detection quickly
    if (tabId === currentTabId) {
      console.log('[BRA Panel] Conditional fields changed on current tab, updating...');
      
      // NEW: Show updating state
      if (confidenceText) {
        confidenceText.textContent = 'Updating fields...';
      }
      
      // Get updated detection quickly
      setTimeout(() => {
        getDetectionResult(tabId);
      }, 700);
    }
    
    if (sendResponse) {
      sendResponse({acknowledged: true});
    }
    return true;
  }
  
  if (message.action === 'detectionUpdated') {
    console.log('[BRA Panel] ===== DETECTION UPDATED =====');
    console.log('[BRA Panel] Tab ID:', message.tabId);
    console.log('[BRA Panel] Result:', JSON.stringify(message.result));
    
    // NEW: Store the result but don't display immediately
    if (message.result) {
      console.log('[BRA Panel] Storing detection result for delayed display');
      scheduleDetectionDisplay(message.result);
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
        fields: message.fieldData || [],
        uiData: message.uiData || null,
        classifiedFields: message.fields || 0
      }
    };
    
    // Get fields and UI data if available
    if (message.fieldData && message.fieldData.length > 0) {
      console.log('[BRA Panel] Field data available:', message.fieldData.length, 'fields');
      detectionResult.fields = message.fieldData;
    }
    
    if (message.uiData) {
      console.log('[BRA Panel] UI data available');
      detectionResult.uiData = message.uiData;
    }
    
    console.log('[BRA Panel] Created detection result:', detectionResult);
    
    // NEW: Schedule display instead of immediate update
    scheduleDetectionDisplay(detectionResult);
  }
  
  // Always send a response to avoid errors
  if (sendResponse) {
    sendResponse({received: true});
  }
  
  return true; // Keep message channel open for async response
});

// NEW: Function to show loading state
function showLoadingState() {
  detectionInProgress = true;
  
  // Clear any existing timeout
  if (detectionTimeout) {
    clearTimeout(detectionTimeout);
    detectionTimeout = null;
  }
  
  // Clear fields but show loading message
  if (fieldsList) {
    fieldsList.innerHTML = '<div class="no-fields-message">Analyzing form fields...</div>';
  }
  
  // Reset confidence meter
  if (confidenceBarTop) {
    confidenceBarTop.style.width = '0%';
    confidenceBarTop.className = 'confidence-bar-top';
  }
  
  if (confidenceText) {
    confidenceText.textContent = 'Detecting...';
  }
  
  hideError();
}

// NEW: Function to schedule detection display
function scheduleDetectionDisplay(result) {
  console.log('[BRA Panel] Scheduling detection display');
  
  // Store the pending result
  pendingDetectionResult = result;
  
  // Clear any existing timeout
  if (detectionTimeout) {
    clearTimeout(detectionTimeout);
  }
  
  // Set new timeout to display the result
  detectionTimeout = setTimeout(() => {
    console.log('[BRA Panel] Display timeout reached, showing final result');
    
    // Only display if we still have the same pending result
    if (pendingDetectionResult === result) {
      updateUI(result);
      pendingDetectionResult = null;
      detectionInProgress = false;
    }
  }, DETECTION_COMPLETE_DELAY);
}

// Global reference to auto detector
let autoDetector = null;

// Initialize when panel opens
document.addEventListener('DOMContentLoaded', function() {
  console.log('[BRA Panel] ============ PANEL OPENED ============');
  console.log('[BRA Panel] Timestamp:', new Date().toISOString());
  
  try {
    // Check if we have valid DOM elements
    if (!confidenceBarTop || !confidenceText) {
      console.error('[BRA Panel] Critical DOM elements missing!');
      console.error('[BRA Panel] confidenceBarTop:', confidenceBarTop);
      console.error('[BRA Panel] confidenceText:', confidenceText);
      showError('Panel initialization error: Missing UI elements');
      return;
    }
    
    // Refresh detection when tab changes or page loads
    function refreshDetectionForTab(tabId) {
      console.log('[BRA Panel] ========================================');
      console.log('[BRA Panel] refreshDetectionForTab called for tab:', tabId);
      console.log('[BRA Panel] Current tab ID was:', currentTabId);
      
      // Update current tab ID
      currentTabId = tabId;
      
      // NEW: Cancel any pending detection
      if (detectionTimeout) {
        clearTimeout(detectionTimeout);
        detectionTimeout = null;
      }
      pendingDetectionResult = null;
      
      // Clear content script tracking if switching tabs
      if (currentTabId !== tabId) {
        contentScriptTabs.delete(currentTabId);
      }
      
      // Clear fields display IMMEDIATELY to prevent stale data
      updateFieldsDisplay(null);
      // Extra safety - force clear the fields list
      if (fieldsList) {
        fieldsList.innerHTML = '<div class="no-fields-message">No fields detected yet</div>';
      }
      
      // Get tab info to check URL
      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError) {
          console.error('[BRA Panel] Error getting tab info:', JSON.stringify(chrome.runtime.lastError));
          showNoDetection();
          return;
        }
        
        // Check if URL matches our content script patterns
        if (!isValidContentScriptUrl(tab.url)) {
          console.log('[BRA Panel] Tab URL not supported:', tab.url);
          // Show appropriate message for non-government sites
          if (confidenceText) {
            confidenceText.textContent = 'Not a government site';
          }
          // Clear all data
          showNoDetection();
          hideError();
          currentTabId = null; // Reset tab ID since we can't work with this tab
          return;
        }
        
        // Set detecting state for valid URLs
        if (confidenceText) {
          confidenceText.textContent = 'Detecting...';
        }
        
        // Get detection for the tab
        getDetectionResult(tabId);
      });
    }
    
    // Get current tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      console.log('[BRA Panel] Initial tabs query result:', tabs);
      if (tabs && tabs[0]) {
        console.log('[BRA Panel] Initial tab ID:', tabs[0].id, 'URL:', tabs[0].url);
        refreshDetectionForTab(tabs[0].id);
      } else {
        console.log('[BRA Panel] No tabs found on initial load');
        // Clear "Detecting..." if no tabs
        if (confidenceText) {
          confidenceText.textContent = 'No form detected';
        }
      }
    });
    
    // Listen for tab activation changes
    chrome.tabs.onActivated.addListener(function(activeInfo) {
      console.log('[BRA Panel] Tab activated:', activeInfo.tabId);
      // Clear content script tracking for previous tab if it's not a government site
      if (currentTabId && currentTabId !== activeInfo.tabId) {
        contentScriptTabs.delete(currentTabId);
      }
      refreshDetectionForTab(activeInfo.tabId);
    });
    
    // Listen for tab URL changes (navigation)
    chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
      // Only respond to complete navigation and if it's the current tab
      if (changeInfo.status === 'complete' && tabId === currentTabId) {
        console.log('[BRA Panel] Tab updated (navigation complete):', tabId, tab.url);
        // Clear content script tracking as page has navigated
        contentScriptTabs.delete(tabId);
        refreshDetectionForTab(tabId);
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
          
          const tab = tabs[0];
          const tabId = tab.id;
          
          // Check if URL is valid for content script
          if (!isValidContentScriptUrl(tab.url)) {
            console.log('[BRA Panel] Skipping detection check for non-government URL:', tab.url);
            detectionInProgress = false;
            return;
          }
          
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
              // NEW: Schedule display instead of immediate update
              scheduleDetectionDisplay(response.result);
              // Clear any errors if form was detected
              if (response.result.isBusinessRegistrationForm) {
                hideError();
              }
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
      
      // Set up periodic automatic detection - check every 2-3 seconds as requested
      detectionInterval = setInterval(checkForForms, 2500); // 2.5 seconds
      
      // Clean up on unload
      window.addEventListener('unload', function() {
        if (detectionInterval) {
          clearInterval(detectionInterval);
        }
      });
      
      // Store reference to interval for debugging
      autoDetector = {
        interval: detectionInterval,
        stop: function() {
          if (detectionInterval) {
            clearInterval(detectionInterval);
            console.log('[BRA Panel] Automatic detection stopped');
          }
        }
      };
    }
    
    // Enable automatic detection
    setupAutomaticDetection();
    
    // Setup chat form handling
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatMessages = document.getElementById('chat-messages');
    const chatSubmit = document.getElementById('chat-submit');
    
    if (chatForm && chatInput && chatMessages) {
      chatForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const message = chatInput.value.trim();
        if (!message) return;
        
        // Add user message
        const userMessage = document.createElement('div');
        userMessage.className = 'message user';
        userMessage.textContent = message;
        chatMessages.appendChild(userMessage);
        
        // Clear input
        chatInput.value = '';
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Simulate assistant response
        setTimeout(() => {
          const assistantMessage = document.createElement('div');
          assistantMessage.className = 'message system';
          assistantMessage.textContent = 'I\'m currently in development. Soon I\'ll be able to help you fill out business registration forms!';
          chatMessages.appendChild(assistantMessage);
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 500);
      });
    }
    
    // Setup auto-fill button
    const autoFillButton = document.getElementById('auto-fill-button');
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
    
    // NEW: Show loading state
    if (!detectionInProgress) {
      showLoadingState();
    }
    
    chrome.runtime.sendMessage({
      action: 'getDetectionResult',
      tabId: tabId
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.error('[BRA Panel] Error getting detection result:', JSON.stringify(chrome.runtime.lastError, null, 2));
        showError('Error getting detection result: ' + chrome.runtime.lastError.message);
        return;
      }
      
      console.log('[BRA Panel] Got response:', response);
      
      if (response && response.success && response.result) {
        console.log('[BRA Panel] Detection result:', response.result);
        // NEW: Schedule display instead of immediate update
        scheduleDetectionDisplay(response.result);
        // Clear errors if we have a valid business form
        if (response.result.isBusinessRegistrationForm) {
          hideError();
        }
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
          if (!pendingDetectionResult) {
            getDetectionResult(tabId);
          }
        }, 2000);
      } else {
        console.log('[BRA Panel] No result from background, asking content script');
        // Try asking content script directly
        askContentScript(tabId);
        
        // Only trigger a fresh detection if we don't already have a result
        if (!pendingDetectionResult) {
          console.log('[BRA Panel] Triggering fresh detection');
          chrome.tabs.sendMessage(tabId, {
            action: 'triggerDetection'
          }, function(response) {
            if (chrome.runtime.lastError) {
              console.error('[BRA Panel] Error triggering detection:', JSON.stringify(chrome.runtime.lastError, null, 2));
              
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
              scheduleDetectionDisplay(response.result);
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
async function sendMessageWithRetry(tabId, message, onSuccess, onError, retryCount = 0) {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [500, 1000, 2000]; // Exponential backoff
  
  try {
    chrome.tabs.sendMessage(tabId, message, function(response) {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError;
        console.log('[BRA Panel] Message error (attempt ' + (retryCount + 1) + '):', error.message);
        
        // Check if it's a recoverable error
        if (error.message.includes('receiving end does not exist') && retryCount < MAX_RETRIES) {
          // Wait and retry
          setTimeout(function() {
            sendMessageWithRetry(tabId, message, onSuccess, onError, retryCount + 1);
          }, RETRY_DELAYS[retryCount]);
        } else {
          // Non-recoverable error or max retries reached
          if (onError) {
            onError(error);
          }
        }
      } else {
        // Success
        if (onSuccess) {
          onSuccess(response);
        }
      }
    });
  } catch (error) {
    console.error('[BRA Panel] sendMessageWithRetry error:', error);
    if (onError) {
      onError(error);
    }
  }
}

// Format error details with troubleshooting tips
function formatErrorDetails(errors) {
  if (!errors || errors.length === 0) return null;
  
  // Get the most recent or most important error
  const mainError = errors.find(e => e.isFatal) || errors[errors.length - 1];
  
  let html = '<strong>Detection Error</strong>';
  
  // Add specific troubleshooting based on error context
  if (mainError.context === 'moduleLoad') {
    html += '<div class="error-tips">Module loading issue detected. Try:<ul>';
    html += '<li>Refreshing the page (Ctrl+R or Cmd+R)</li>';
    html += '<li>Reloading the extension</li>';
    html += '</ul></div>';
  } else if (mainError.context === 'contentScript') {
    html += '<div class="error-tips">Content script issue. Try:<ul>';
    html += '<li>Waiting a moment for the page to fully load</li>';
    html += '<li>Refreshing the page</li>';
    html += '</ul></div>';
  } else if (mainError.context === 'maxRetries') {
    html += '<div class="error-tips">Detection timed out. The page might be:<ul>';
    html += '<li>Still loading - wait a moment</li>';
    html += '<li>Behind a login wall</li>';
    html += '<li>Not a supported government site</li>';
    html += '</ul></div>';
  }
  
  // Add error count if multiple
  if (errors.length > 1) {
    html += `<div class="error-count">${errors.length} errors encountered</div>`;
  }
  
  return html;
}

// Ask content script directly for detection result
function askContentScript(tabId) {
  console.log('[BRA Panel] Asking content script directly for tab:', tabId);
  
  // Check context validity first
  let contextValid = true;
  if (messagingUtils && typeof messagingUtils.isContextValid === 'function') {
    contextValid = messagingUtils.isContextValid();
  } else {
    try {
      contextValid = !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      contextValid = false;
    }
  }
  
  if (!contextValid) {
    console.log('[BRA Panel] Extension context invalid, not asking content script');
    showNoDetection();
    return;
  }
  
  // First check if we should even try to contact the content script
  chrome.tabs.get(tabId, async function(tab) {
    if (chrome.runtime.lastError) {
      if (!chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
        console.error('[BRA Panel] Error getting tab for content script check:', JSON.stringify(chrome.runtime.lastError));
      }
      showNoDetection();
      return;
    }
    
    // Check if URL is valid for content script
    if (!isValidContentScriptUrl(tab.url)) {
      console.log('[BRA Panel] Not asking content script - URL not supported:', tab.url);
      showNoDetection();
      return;
    }
    
    // Use messaging utils if available
    let response = null;
    if (messagingUtils && messagingUtils.sendMessageToTab) {
      response = await messagingUtils.sendMessageToTab(tabId, {
        action: 'getDetectionStatus',
        timestamp: Date.now()
      });
    } else {
      // Direct send
      chrome.tabs.sendMessage(tabId, {
        action: 'getDetectionStatus',
        timestamp: Date.now()
      }, function(result) {
        response = result;
      });
    }
    
    console.log('[BRA Panel] Content script response:', response);
    if (response && response.hasResult && response.result) {
      // Use the result directly from content script
      scheduleDetectionDisplay(response.result);
    } else {
      // No result - clear stale data
      showNoDetection();
    }
  });
  
  // First, try to get detection status
  sendMessageWithRetry(tabId, {
    action: 'getDetectionStatus',
    timestamp: Date.now()
  }, function(statusResult) {
    // Success callback - connection established
    hideError();
    console.log('[BRA Panel] Content script status response:', statusResult);
    
    if (statusResult && statusResult.hasResult && statusResult.result) {
      // Use the result directly
      console.log('[BRA Panel] Content script has result, using it');
      scheduleDetectionDisplay(statusResult.result);
    } else if (statusResult && statusResult.detecting) {
      // Detection in progress - wait and try again
      console.log('[BRA Panel] Content script is still detecting');
      setTimeout(function() {
        getDetectionResult(tabId);
      }, 2000);
    } else {
      // No result yet - trigger detection
      console.log('[BRA Panel] Content script has no result, triggering detection');
      chrome.tabs.sendMessage(tabId, {
        action: 'triggerDetection'
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.error('[BRA Panel] Error triggering detection:', chrome.runtime.lastError.message);
        } else {
          console.log('[BRA Panel] Detection triggered, waiting for result');
          // Wait and check again
          setTimeout(function() {
            getDetectionResult(tabId);
          }, 3000);
        }
      });
    }
  }, function(error) {
    // Error callback - couldn't connect to content script
    console.log('[BRA Panel] Could not connect to content script:', error.message);
    
    // Check if the tab is still valid
    chrome.tabs.get(tabId, function(tab) {
      if (chrome.runtime.lastError || !tab) {
        console.log('[BRA Panel] Tab no longer valid');
        showNoDetection();
      } else {
        // Tab is valid but content script not responding
        // This is expected for new tabs - just show no detection
        console.log('[BRA Panel] Tab valid but content script not ready');
        showNoDetection();
      }
    });
  });
}

// Setup connection monitoring for better reliability
function setupConnectionMonitoring() {
  // Track connection status
  let isConnected = false;
  let lastActiveTimestamp = Date.now();
  
  // Check connection and auto-trigger detection if needed
  setInterval(() => {
    if (currentTabId) {
      // First check if we should even try to ping
      chrome.tabs.get(currentTabId, function(tab) {
        if (chrome.runtime.lastError || !tab) {
          return;
        }
        
        // Skip non-government sites
        if (!isValidContentScriptUrl(tab.url)) {
          if (isConnected) {
            console.log('[BRA] Tab moved to non-government site');
            isConnected = false;
          }
          return;
        }
        
        // Quietly ping the content script
        chrome.tabs.sendMessage(currentTabId, { 
          action: 'ping',
          timestamp: Date.now()
        }, function(response) {
          // Handle error first
          if (chrome.runtime.lastError) {
            // Connection lost - but don't log for expected cases
            if (isConnected) {
              console.log('[BRA] Connection lost, waiting for reconnection');
              isConnected = false;
            }
            return;
          }
          
          // Handle response
          if (response && response.alive) {
            if (!isConnected) {
              // Connection established/restored
              console.log('[BRA] Connection established with content script');
              isConnected = true;
              
              // If we don't have a detection result, get one
              if (!pendingDetectionResult) {
                console.log('[BRA] No detection result, requesting...');
                getDetectionResult(currentTabId);
              }
            }
            
            // Update last active timestamp
            lastActiveTimestamp = Date.now();
            
            // Check for stale detection
            if (response.detectionStatus && response.detectionStatus.lastUpdate) {
              const timeSinceUpdate = Date.now() - response.detectionStatus.lastUpdate;
              if (timeSinceUpdate > 30000) { // 30 seconds
                console.log('[BRA] Detection data is stale, refreshing...');
                chrome.tabs.sendMessage(currentTabId, { action: 'triggerDetection' });
              }
            }
            
            // Only check for updates if we don't already have a detected form
            if (response.detectionStatus && response.detectionStatus.hasResult && 
                !pendingDetectionResult) {
              // Get the detection result if it's been more than 5 seconds since last check
              const timeSinceLastCheck = Date.now() - lastActiveTimestamp;
              if (timeSinceLastCheck > 5000) {
                getDetectionResult(currentTabId);
              }
            }
          }
        });
      }); // End of chrome.tabs.get
    }
  }, 2000); // Check every 2 seconds for better responsiveness
  
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
  
  // Clear detection in progress flag
  detectionInProgress = false;
  
  lastUpdateTime = Date.now();
  lastUpdateResult = result;
  
  // Only update the top confidence meter - no duplicate displays
  updateConfidenceMeter(result);
  
  // ALWAYS update fields display - this ensures stale data is cleared
  // when moving between pages or when no form is detected
  updateFieldsDisplay(result);
  
  // Extra safety: if no business form detected, ensure fields are cleared
  if (!result || !result.isBusinessRegistrationForm) {
    console.log('[BRA Panel] No business form - ensuring fields are cleared');
    if (fieldsList) {
      fieldsList.innerHTML = '<div class="no-fields-message">No fields detected yet</div>';
    }
  }
  
  // Clear any errors if we have a valid business form detected
  if (result && result.isBusinessRegistrationForm) {
    hideError();
  }
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
  console.log('[BRA Panel] showNoDetection called - clearing all detection data');
  // Status indicator removed - only update confidence meter
  updateConfidenceMeter(null);
  // Clear fields display
  updateFieldsDisplay(null);
  // Extra safety - force clear fields
  if (fieldsList) {
    fieldsList.innerHTML = '<div class="no-fields-message">No fields detected yet</div>';
  }
}

// Update fields display
function updateFieldsDisplay(result) {
  console.log('[BRA Panel] updateFieldsDisplay called');
  
  if (!fieldsList) {
    console.error('[BRA Panel] Fields list element not found!');
    return;
  }
  
  // Clear fields list if no result or no business form
  if (!result || !result.isBusinessRegistrationForm) {
    console.log('[BRA Panel] No business form result - clearing fields');
    fieldsList.innerHTML = '<div class="no-fields-message">No fields detected yet</div>';
    return;
  }
  
  console.log('[BRA Panel] Looking for field data in result:', result);
  
  // Extract fields from the result - multiple possible locations
  let fieldsToDisplay = [];
  
  // Check different possible field locations
  if (result.fields && Array.isArray(result.fields)) {
    console.log('[BRA Panel] Found fields at result.fields:', result.fields.length);
    fieldsToDisplay = result.fields;
  } else if (result.fieldDetection && result.fieldDetection.fields && Array.isArray(result.fieldDetection.fields)) {
    console.log('[BRA Panel] Found fields at result.fieldDetection.fields:', result.fieldDetection.fields.length);
    fieldsToDisplay = result.fieldDetection.fields;
  } else if (result.uiData && result.uiData.categories) {
    console.log('[BRA Panel] Found UI data categories');
    // Extract fields from UI data categories
    Object.values(result.uiData.categories).forEach(category => {
      if (category.fields && Array.isArray(category.fields)) {
        fieldsToDisplay = fieldsToDisplay.concat(category.fields);
      }
    });
  }
  
  console.log('[BRA Panel] Total fields to display:', fieldsToDisplay.length);
  
  if (fieldsToDisplay.length === 0) {
    console.log('[BRA Panel] No fields found in result object');
    fieldsList.innerHTML = '<div class="no-fields-message">Form detected but no fields available</div>';
    return;
  }
  
  // Clear current fields
  fieldsList.innerHTML = '';
  
  // If we have UI data with sections, use that structure
  if (result.uiData && result.uiData.sections && result.uiData.sections.length > 0) {
    console.log('[BRA Panel] Using sectioned display from UI data');
    displayFieldsWithSections(fieldsToDisplay, result.uiData.sections);
  } else {
    console.log('[BRA Panel] Using flat field display');
    displayFieldsFlat(fieldsToDisplay);
  }
}

// Display fields with sections
function displayFieldsWithSections(fields, sections) {
  console.log('[BRA Panel] Displaying', fields.length, 'fields in', sections.length, 'sections');
  
  // Group fields by section
  sections.forEach((section, sectionIndex) => {
    // Add section header
    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'field-section-header';
    sectionHeader.textContent = section.title || `Section ${sectionIndex + 1}`;
    fieldsList.appendChild(sectionHeader);
    
    // Find fields in this section (based on section boundaries or field association)
    const sectionFields = fields.filter(field => {
      // If field has explicit section info, use that
      if (field.section === section.title) return true;
      
      // Otherwise, could implement position-based grouping
      return false; // For now, we'll display all fields after sections
    });
    
    if (sectionFields.length === 0 && sectionIndex === 0) {
      // If no explicit section mapping, show all fields in first section
      displayFieldsFlat(fields);
    } else {
      displayFieldsFlat(sectionFields);
    }
  });
}

// Display fields in a flat list
function displayFieldsFlat(fields) {
  console.log('[BRA Panel] Displaying', fields.length, 'fields in flat list');
  
  // First, separate fields by classification if available
  const classifiedFields = fields.filter(field => field.classification && field.classification.category);
  const unclassifiedFields = fields.filter(field => !field.classification || !field.classification.category);
  
  console.log('[BRA Panel] Classified fields:', classifiedFields.length, 'Unclassified:', unclassifiedFields.length);
  
  // If we have sections info in the fields themselves, group by that
  const sections = {};
  let hasExplicitSections = false;
  
  fields.forEach(field => {
    const sectionName = field.section || 'Other Fields';
    if (field.section) hasExplicitSections = true;
    
    if (!sections[sectionName]) {
      sections[sectionName] = [];
    }
    sections[sectionName].push(field);
  });
  
  // Display fields grouped by section or classification
  if (hasExplicitSections) {
    // Use explicit sections
    Object.entries(sections).forEach(([sectionName, sectionFields]) => {
      if (sectionFields.length > 0 && sectionName !== 'Other Fields') {
        // Add section header
        const sectionHeader = document.createElement('div');
        sectionHeader.className = 'field-section-header';
        sectionHeader.textContent = sectionName;
        fieldsList.appendChild(sectionHeader);
        
        // Sort fields by position if available
        sectionFields.sort((a, b) => {
          // First by row (top position)
          if (a.position && b.position) {
            const topDiff = (a.position.top || 0) - (b.position.top || 0);
            if (Math.abs(topDiff) > 5) {
              return topDiff;
            }
            return (a.position.left || 0) - (b.position.left || 0);
          }
          return (a.index || 0) - (b.index || 0);
        });
        
        // Display fields in this section
        sectionFields.forEach(field => {
          displayField(field);
        });
      }
    });
  } else {
    // No sections, display all fields in order
    classifiedFields.forEach(field => {
      displayField(field);
    });
  }
  
  function displayField(field) {
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
    const fieldType = field.classification?.category || 'unknown';
    const confidence = field.classification?.confidence || 0;
    
    // Create label element
    const labelEl = document.createElement('div');
    labelEl.className = 'field-label';
    labelEl.textContent = label;
    labelEl.title = `${label} (${confidence}% confidence)`; // Tooltip with confidence
    
    // Create type element with formatted text
    const typeEl = document.createElement('div');
    typeEl.className = `field-type ${fieldType.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    // Format the field type display
    let typeText = fieldType.replace(/_/g, ' ');
    
    // Add additional info for select/radio/checkbox fields
    if (field.type === 'single_select' || field.type === 'multi_select' || field.type === 'boolean_field') {
      if (field.options && field.options.length > 0) {
        typeText += ` (${field.options.length} options)`;
      } else if (field.originalType) {
        typeText += ` (${field.originalType})`;
      }
    }
    
    typeEl.textContent = typeText;
    
    fieldItem.appendChild(labelEl);
    fieldItem.appendChild(typeEl);
    fieldsList.appendChild(fieldItem);
  }
  
  console.log(`[BRA Panel] Displayed ${classifiedFields.length} classified fields`);
}

// Expose functions globally for debugging
window.updateUI = updateUI;
window.updateConfidenceMeter = updateConfidenceMeter;
window.updateFieldsDisplay = updateFieldsDisplay;
window.showNoDetection = showNoDetection;

// Debug function to manually update with test data
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
    fields: [
      {
        label: 'Business Name',
        name: 'business_name',
        type: 'text',
        required: true,
        classification: {
          category: 'business_name',
          confidence: 95
        }
      },
      {
        label: 'Entity Type',
        name: 'entity_type',
        type: 'single_select',
        options: ['LLC', 'Corporation', 'Partnership'],
        classification: {
          category: 'entity_type',
          confidence: 90
        }
      },
      {
        label: 'Email Address',
        name: 'email',
        type: 'email',
        classification: {
          category: 'email',
          confidence: 85
        }
      }
    ]
  };
  
  updateUI(sampleResult);
};