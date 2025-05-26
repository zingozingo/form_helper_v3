/**
 * Business Registration Assistant - Panel Script V2
 * With robust connection management
 */

// Load connection manager
let connectionManager = null;

// Initialize connection manager
async function initializeConnectionManager() {
  try {
    // Try dynamic import first
    if (chrome.runtime.getURL) {
      const module = await import(chrome.runtime.getURL('panel_connection.js'));
      const PanelConnectionManager = module.default || module.PanelConnectionManager;
      connectionManager = new PanelConnectionManager();
    }
  } catch (error) {
    console.warn('[BRA Panel] Failed to load connection manager module:', error);
  }
  
  // Fallback to inline implementation
  if (!connectionManager) {
    connectionManager = {
      async sendMessage(tabId, message) {
        return new Promise((resolve) => {
          try {
            chrome.tabs.sendMessage(tabId, message, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('[BRA Panel] Message error:', chrome.runtime.lastError.message);
                resolve({ success: false, error: chrome.runtime.lastError.message });
              } else {
                resolve(response || {});
              }
            });
          } catch (error) {
            resolve({ success: false, error: error.message });
          }
        });
      },
      
      async establishConnection(tabId) {
        return true; // Assume connected in fallback
      },
      
      on() {}, // No-op
      cleanup() {}, // No-op
      destroy() {} // No-op
    };
  }
  
  return connectionManager;
}

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
let isInitialized = false;

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

// Get detection result with connection handling
async function getDetectionResult(tabId) {
  if (!connectionManager) {
    showError('Connection manager not initialized');
    return;
  }
  
  console.log('[BRA Panel] Getting detection result for tab:', tabId);
  
  try {
    // First check background for cached result
    const bgResponse = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getDetectionResult', tabId: tabId },
        (response) => {
          if (chrome.runtime.lastError) {
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
    const response = await connectionManager.sendMessage(tabId, {
      action: 'getDetectionResult'
    });
    
    if (response && response.isBusinessRegistrationForm !== undefined) {
      updateUI(response);
    } else if (response && response.error) {
      showError(`Detection error: ${response.error}`);
      showNoDetection();
    } else {
      // Trigger new detection
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
  if (!connectionManager) return;
  
  console.log('[BRA Panel] Triggering detection for tab:', tabId);
  
  const response = await connectionManager.sendMessage(tabId, {
    action: 'triggerDetection'
  });
  
  if (response && response.scheduled) {
    // Wait for detection to complete
    setTimeout(() => {
      getDetectionResult(tabId);
    }, 2000);
  } else if (response && response.error) {
    showError(`Cannot trigger detection: ${response.error}`);
  }
}

// Handle tab change
async function handleTabChange(tabId) {
  console.log('[BRA Panel] Tab changed to:', tabId);
  
  currentTabId = tabId;
  
  // Clear previous state
  showNoDetection();
  hideError();
  
  // Clean up previous tab connection
  if (connectionManager && connectionManager.cleanup) {
    connectionManager.cleanup(tabId);
  }
  
  // Check if valid URL
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      showError('Invalid tab');
      return;
    }
    
    // Check URL pattern
    if (!tab.url || (!tab.url.includes('.gov') && !tab.url.includes('.state.'))) {
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

// Listen for messages
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
    console.log('[BRA Panel] Navigation detected, clearing fields');
    showNoDetection();
    setTimeout(() => {
      getDetectionResult(currentTabId);
    }, 1000);
  }
  
  sendResponse({ received: true });
  return true;
});

// Initialize panel
async function initialize() {
  console.log('[BRA Panel] Initializing panel v2');
  
  try {
    // Initialize connection manager
    await initializeConnectionManager();
    
    // Set up connection manager events
    if (connectionManager && connectionManager.on) {
      connectionManager.on('contentScriptReady', (data) => {
        if (data.tabId === currentTabId) {
          console.log('[BRA Panel] Content script ready, getting detection');
          setTimeout(() => {
            getDetectionResult(data.tabId);
          }, 500);
        }
      });
    }
    
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
        handleTabChange(tabId);
      }
    });
    
    // Set up auto-fill button
    if (autoFillButton) {
      autoFillButton.addEventListener('click', async () => {
        if (!currentTabId || !connectionManager) return;
        
        autoFillButton.disabled = true;
        
        const response = await connectionManager.sendMessage(currentTabId, {
          action: 'autoFillFields'
        });
        
        autoFillButton.disabled = false;
        
        if (response && response.error) {
          showError(response.error);
        }
      });
    }
    
    isInitialized = true;
    console.log('[BRA Panel] Panel initialized successfully');
    
  } catch (error) {
    console.error('[BRA Panel] Initialization error:', error);
    showError('Failed to initialize panel');
  }
}

// Clean up on unload
window.addEventListener('unload', () => {
  if (connectionManager && connectionManager.destroy) {
    connectionManager.destroy();
  }
});

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}