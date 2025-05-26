/**
 * Business Registration Assistant - Simple Panel Script
 * With inline connection management (no module dependencies)
 */

// DOM elements
const autoFillButton = document.getElementById('auto-fill-button');
const mainContent = document.getElementById('main-content');
const errorContainer = document.getElementById('error-container');
const fieldsList = document.getElementById('fields-list');
const confidenceMeter = document.getElementById('confidence-meter');
const confidenceBarTop = document.getElementById('confidence-bar-top');
const confidenceText = document.getElementById('confidence-text');

// State
let currentTabId = null;
let lastDetectionResult = null;

// Connection retry configuration
const retryConfig = {
  delays: [500, 1000, 2000, 4000, 8000], // Exponential backoff
  maxAttempts: 5
};

// Track connection attempts per tab
const connectionAttempts = new Map();

// Simple connection management
const connectionManager = {
  // Send message with retry logic
  async sendMessageToTab(tabId, message, attemptNumber = 0) {
    return new Promise((resolve) => {
      // Check if we've exceeded max attempts
      if (attemptNumber >= retryConfig.maxAttempts) {
        console.warn(`[BRA Panel] Max retry attempts reached for tab ${tabId}`);
        resolve(this.getFallbackResponse(message));
        return;
      }
      
      try {
        // Set a timeout for the message
        const timeoutId = setTimeout(() => {
          console.warn(`[BRA Panel] Message timeout for tab ${tabId}, attempt ${attemptNumber + 1}`);
          
          // Retry with exponential backoff
          const delay = retryConfig.delays[Math.min(attemptNumber, retryConfig.delays.length - 1)];
          console.log(`[BRA Panel] Retrying in ${delay}ms...`);
          
          setTimeout(() => {
            this.sendMessageToTab(tabId, message, attemptNumber + 1).then(resolve);
          }, delay);
        }, 5000); // 5 second timeout
        
        // Try to send the message
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError.message;
            console.warn(`[BRA Panel] Message error: ${error}`);
            
            // Special handling for "Receiving end does not exist"
            if (error.includes('Receiving end does not exist')) {
              // Try to inject content script
              this.injectContentScript(tabId).then((injected) => {
                if (injected) {
                  // Wait a bit for script to initialize, then retry
                  setTimeout(() => {
                    this.sendMessageToTab(tabId, message, attemptNumber + 1).then(resolve);
                  }, 1000);
                } else {
                  // Injection failed, use fallback
                  resolve(this.getFallbackResponse(message));
                }
              });
            } else {
              // Other errors - retry with backoff
              const delay = retryConfig.delays[Math.min(attemptNumber, retryConfig.delays.length - 1)];
              setTimeout(() => {
                this.sendMessageToTab(tabId, message, attemptNumber + 1).then(resolve);
              }, delay);
            }
          } else {
            // Success!
            connectionAttempts.set(tabId, 0); // Reset attempts
            resolve(response || {});
          }
        });
      } catch (error) {
        console.error(`[BRA Panel] Send message exception:`, error);
        resolve(this.getFallbackResponse(message));
      }
    });
  },
  
  // Inject content script if needed
  async injectContentScript(tabId) {
    try {
      console.log(`[BRA Panel] Attempting to inject content script into tab ${tabId}`);
      
      // First check if tab exists and has valid URL
      const tab = await this.getTab(tabId);
      if (!tab || !this.isValidUrl(tab.url)) {
        console.warn(`[BRA Panel] Tab ${tabId} not valid for content script`);
        return false;
      }
      
      // Try to inject
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content_visual.js']
      });
      
      console.log(`[BRA Panel] Content script injected successfully`);
      return true;
      
    } catch (error) {
      console.error(`[BRA Panel] Failed to inject content script:`, error);
      return false;
    }
  },
  
  // Get tab info safely
  async getTab(tabId) {
    return new Promise((resolve) => {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(tab);
        }
      });
    });
  },
  
  // Check if URL is valid for our content script
  isValidUrl(url) {
    if (!url) return false;
    
    // Must be http/https
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return false;
    }
    
    // Check for government sites
    return url.includes('.gov') || url.includes('.state.') || url.includes('.us');
  },
  
  // Get fallback response when connection fails
  getFallbackResponse(message) {
    const action = message.action;
    
    switch (action) {
      case 'ping':
        return { alive: false, error: 'Not connected' };
        
      case 'getDetectionStatus':
      case 'getDetectionResult':
        return {
          success: false,
          error: 'Not connected to page',
          isBusinessRegistrationForm: false,
          confidenceScore: 0,
          fieldDetection: {
            isDetected: false,
            fields: [],
            uiData: { sections: [], categories: {} }
          }
        };
        
      case 'triggerDetection':
        return {
          success: false,
          error: 'Not connected to page',
          scheduled: false
        };
        
      default:
        return {
          success: false,
          error: 'Not connected to page'
        };
    }
  }
};

// Show error message
function showError(message, isHtml = false) {
  if (!errorContainer) return;
  
  errorContainer.innerHTML = '';
  
  if (isHtml) {
    errorContainer.innerHTML = message;
  } else {
    errorContainer.textContent = message;
  }
  
  errorContainer.classList.add('show');
}

// Hide error message
function hideError() {
  if (errorContainer) {
    errorContainer.classList.remove('show');
  }
}

// Update confidence meter
function updateConfidenceMeter(result) {
  if (!confidenceBarTop || !confidenceText) return;
  
  if (!result || !result.isBusinessRegistrationForm) {
    confidenceBarTop.style.width = '0%';
    confidenceBarTop.className = 'confidence-bar-top';
    confidenceText.textContent = 'No form detected';
    return;
  }
  
  const confidence = result.confidenceScore || 0;
  const state = result.state || '';
  
  // Update bar
  confidenceBarTop.style.width = Math.min(confidence, 100) + '%';
  
  // Update color
  confidenceBarTop.className = 'confidence-bar-top';
  if (confidence >= 70) {
    confidenceBarTop.classList.add('high');
  } else if (confidence >= 40) {
    confidenceBarTop.classList.add('medium');
  } else {
    confidenceBarTop.classList.add('low');
  }
  
  // Update text
  if (state) {
    confidenceText.textContent = `${state} • ${confidence}%`;
  } else {
    confidenceText.textContent = `${confidence}%`;
  }
}

// Update fields display
function updateFieldsDisplay(result) {
  if (!fieldsList) return;
  
  fieldsList.innerHTML = '';
  
  if (!result || !result.fieldDetection || !result.isBusinessRegistrationForm) {
    fieldsList.innerHTML = '<div class="no-fields-message">No fields detected yet</div>';
    return;
  }
  
  const uiData = result.fieldDetection.uiData;
  if (!uiData) {
    fieldsList.innerHTML = '<div class="no-fields-message">No field data available</div>';
    return;
  }
  
  // Display by sections
  if (uiData.sections && uiData.sections.length > 0) {
    uiData.sections.forEach(section => {
      if (!section.fields || section.fields.length === 0) return;
      
      // Section header
      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'field-section-header';
      sectionHeader.textContent = section.label;
      fieldsList.appendChild(sectionHeader);
      
      // Fields in section
      section.fields.forEach(field => {
        displayField(field);
      });
    });
  }
  // Fallback to categories
  else if (uiData.categories && Object.keys(uiData.categories).length > 0) {
    Object.entries(uiData.categories).forEach(([category, data]) => {
      if (!data.fields || data.fields.length === 0) return;
      
      // Category header
      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'field-section-header';
      categoryHeader.textContent = data.label;
      fieldsList.appendChild(categoryHeader);
      
      // Fields in category
      data.fields.forEach(field => {
        displayField(field);
      });
    });
  }
  // Raw fields
  else if (result.fieldDetection.fields && result.fieldDetection.fields.length > 0) {
    result.fieldDetection.fields.forEach(field => {
      displayField(field);
    });
  } else {
    fieldsList.innerHTML = '<div class="no-fields-message">No field details available</div>';
  }
  
  function displayField(field) {
    const fieldItem = document.createElement('div');
    fieldItem.className = 'field-item';
    
    // Label
    const labelEl = document.createElement('div');
    labelEl.className = 'field-label';
    labelEl.textContent = field.label?.text || field.name || 'Unnamed field';
    
    // Type
    const typeEl = document.createElement('div');
    typeEl.className = 'field-type';
    
    let typeText = field.classification?.category || field.type || 'unknown';
    typeText = typeText.replace(/_/g, ' ');
    
    // Add extra info for groups
    if (field.type === 'radio_group' && field.options) {
      typeText += ` (${field.options.length} options)`;
    } else if (field.type === 'checkbox_group' && field.options) {
      typeText += ` (${field.options.length} items)`;
    }
    
    typeEl.textContent = typeText;
    
    fieldItem.appendChild(labelEl);
    fieldItem.appendChild(typeEl);
    fieldsList.appendChild(fieldItem);
  }
}

// Update UI with detection result
function updateUI(result) {
  console.log('[BRA Panel] Updating UI with result:', result);
  
  lastDetectionResult = result;
  
  updateConfidenceMeter(result);
  updateFieldsDisplay(result);
  
  if (result && result.isBusinessRegistrationForm) {
    hideError();
  }
}

// Show no detection
function showNoDetection() {
  updateConfidenceMeter(null);
  updateFieldsDisplay(null);
}

// Get detection result
async function getDetectionResult(tabId) {
  console.log('[BRA Panel] Getting detection result for tab:', tabId);
  
  try {
    // First try to get from background (cached result)
    const bgResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getDetectionResult', tabId: tabId },
        (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[BRA Panel] Background error:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(response);
          }
        }
      );
    });
    
    if (bgResponse && bgResponse.success && bgResponse.result) {
      console.log('[BRA Panel] Got cached result from background');
      updateUI(bgResponse.result);
      return;
    }
    
    // Try content script
    const response = await connectionManager.sendMessageToTab(tabId, {
      action: 'getDetectionResult'
    });
    
    if (response && response.isBusinessRegistrationForm !== undefined) {
      updateUI(response);
    } else if (response && response.error) {
      if (response.error === 'Not connected to page') {
        showError('Unable to connect to page. Please refresh and try again.');
      } else {
        showError(`Detection error: ${response.error}`);
      }
      showNoDetection();
    } else {
      // No result yet, trigger detection
      console.log('[BRA Panel] No result available, triggering detection');
      await triggerDetection(tabId);
    }
    
  } catch (error) {
    console.error('[BRA Panel] Error getting detection:', error);
    showError('Failed to get detection result');
    showNoDetection();
  }
}

// Trigger detection
async function triggerDetection(tabId) {
  console.log('[BRA Panel] Triggering detection for tab:', tabId);
  
  const response = await connectionManager.sendMessageToTab(tabId, {
    action: 'triggerDetection'
  });
  
  if (response && response.scheduled) {
    console.log('[BRA Panel] Detection scheduled, waiting for result');
    // Wait for detection to complete
    setTimeout(() => {
      getDetectionResult(tabId);
    }, 2000);
  } else if (response && response.error) {
    console.warn('[BRA Panel] Cannot trigger detection:', response.error);
  }
}

// Handle tab change
async function handleTabChange(tabId) {
  console.log('[BRA Panel] Tab changed to:', tabId);
  
  currentTabId = tabId;
  
  // Clear previous state
  showNoDetection();
  hideError();
  connectionAttempts.delete(tabId); // Reset connection attempts
  
  // Check if valid tab
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      showError('Invalid tab');
      return;
    }
    
    // Check URL
    if (!tab.url || !connectionManager.isValidUrl(tab.url)) {
      confidenceText.textContent = 'Not a government site';
      showNoDetection();
      return;
    }
    
    // Set detecting state
    if (confidenceText) {
      confidenceText.textContent = 'Detecting...';
    }
    
    // Get detection result
    getDetectionResult(tabId);
  });
}

// Listen for messages from background/content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BRA Panel] Received message:', message.action || message.type);
  
  // Handle detection updates
  if (message.action === 'detectionUpdated' && message.result) {
    if (message.tabId === currentTabId) {
      updateUI(message.result);
    }
  }
  
  // Handle navigation
  if (message.action === 'navigationDetected' && message.tabId === currentTabId) {
    console.log('[BRA Panel] Navigation detected, refreshing');
    showNoDetection();
    connectionAttempts.delete(currentTabId); // Reset attempts
    setTimeout(() => {
      getDetectionResult(currentTabId);
    }, 1000);
  }
  
  // Handle content script ready
  if (message.action === 'contentScriptReady') {
    const tabId = message.tabId || sender?.tab?.id;
    if (tabId === currentTabId) {
      console.log('[BRA Panel] Content script ready, getting detection');
      connectionAttempts.delete(tabId); // Reset attempts
      setTimeout(() => {
        getDetectionResult(tabId);
      }, 500);
    }
  }
  
  sendResponse({ received: true });
  return true;
});

// Initialize panel
function initialize() {
  console.log('[BRA Panel] Initializing simple panel');
  
  try {
    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        handleTabChange(tabs[0].id);
      }
    });
    
    // Listen for tab changes
    chrome.tabs.onActivated.addListener((activeInfo) => {
      handleTabChange(activeInfo.tabId);
    });
    
    // Listen for tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tabId === currentTabId) {
        console.log('[BRA Panel] Tab updated, refreshing detection');
        connectionAttempts.delete(tabId); // Reset attempts
        handleTabChange(tabId);
      }
    });
    
    // Set up auto-fill button
    if (autoFillButton) {
      autoFillButton.addEventListener('click', async () => {
        if (!currentTabId) return;
        
        autoFillButton.disabled = true;
        
        const response = await connectionManager.sendMessageToTab(currentTabId, {
          action: 'autoFillFields'
        });
        
        autoFillButton.disabled = false;
        
        if (response && response.error) {
          showError(response.error);
        } else if (response && response.message) {
          // Show success message
          showError(response.message, false);
          setTimeout(hideError, 3000);
        }
      });
    }
    
    console.log('[BRA Panel] Panel initialized successfully');
    
  } catch (error) {
    console.error('[BRA Panel] Initialization error:', error);
    showError('Failed to initialize panel');
  }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}