/**
 * Business Registration Assistant - Background Script
 * Implementation that manages detection results and handles panel
 */

// Inline messaging utilities for service worker compatibility
const messagingUtils = {
  isContextValid() {
    try {
      // Check if chrome.runtime.id exists - this will be undefined if context is invalid
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  },
  
  async sendMessage(message) {
    if (!this.isContextValid()) {
      console.warn('[BRA Background] Extension context invalid, message not sent');
      return null;
    }
    
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            // Only log if it's not a common/expected error
            if (!error.message?.includes('Receiving end does not exist') &&
                !error.message?.includes('Extension context invalidated') &&
                !error.message?.includes('The message port closed')) {
              console.warn('[BRA Background] Message error:', error.message);
            }
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        if (!error.message?.includes('Extension context invalidated')) {
          console.error('[BRA Background] Failed to send message:', error);
        }
        resolve(null);
      }
    });
  },
  
  async sendMessageToTab(tabId, message) {
    if (!this.isContextValid() || !tabId) {
      return null;
    }
    
    return new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tabId, message, (response) => {
          if (chrome.runtime.lastError) {
            const error = chrome.runtime.lastError;
            if (!error.message?.includes('Receiving end does not exist') &&
                !error.message?.includes('Extension context invalidated')) {
              console.warn('[BRA Background] Tab message error:', error.message);
            }
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (error) {
        if (!error.message?.includes('Extension context invalidated')) {
          console.error('[BRA Background] Failed to send tab message:', error);
        }
        resolve(null);
      }
    });
  }
};

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

// Store detection results and errors by tab ID
const detectionResults = {};
const detectionErrors = {};

// Track active content scripts
const connectedTabs = {};
const tabLastPingTime = {};

// Safe message sending to runtime (panel/popup)
async function sendRuntimeMessage(message) {
  try {
    // Use messaging utils if available
    if (messagingUtils && messagingUtils.sendMessage) {
      return await messagingUtils.sendMessage(message);
    }
    
    // Fallback to direct send
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          // Only log if it's not "no receiving end" error
          if (!chrome.runtime.lastError.message?.includes('Receiving end does not exist') &&
              !chrome.runtime.lastError.message?.includes('Extension context invalidated')) {
            console.warn('[BRA Background] Runtime message error:', chrome.runtime.lastError.message);
          }
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  } catch (error) {
    if (!error.message?.includes('Extension context invalidated')) {
      console.error('[BRA Background] Failed to send runtime message:', error);
    }
    return null;
  }
}

// Update badge when a form is detected
function updateBadge(tabId, isDetected, confidenceScore = 0, hasError = false) {
  try {
    let badgeText = '';
    let badgeColor = '#CCCCCC';  // Default gray
    
    if (hasError) {
      badgeText = '!';
      badgeColor = '#F44336';  // Red for errors
    } else if (isDetected) {
      badgeText = '✓';
      badgeColor = confidenceScore >= 80 ? '#4CAF50' : // Green for high confidence
                   confidenceScore >= 60 ? '#FFC107' : // Yellow for medium confidence
                   '#CCCCCC';                          // Gray for low confidence
    }
    
    chrome.action.setBadgeText({ text: badgeText, tabId });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
  } catch (error) {
    console.error('[BRA] Badge update error:', error.message || 'Unknown error');
  }
}

// Set up the side panel
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[BRA] Error setting panel behavior:', error.message || 'Unknown error'));
}

// Track error counts to prevent overwhelming the user
const errorCounts = {};
const MAX_ERROR_NOTIFICATIONS = 3;

// Helper to determine if we should show a notification for this error
function shouldNotifyError(tabId, context) {
  if (!errorCounts[tabId]) {
    errorCounts[tabId] = { total: 0, contexts: {} };
  }
  
  // Increment counters
  errorCounts[tabId].total++;
  errorCounts[tabId].contexts[context] = (errorCounts[tabId].contexts[context] || 0) + 1;
  
  // Only notify about the first few errors
  return errorCounts[tabId].total <= MAX_ERROR_NOTIFICATIONS;
}

/**
 * Check if a tab is still connected
 * @param {number} tabId - The tab ID to check
 * @returns {boolean} Whether the tab is connected
 */
function isTabConnected(tabId) {
  return connectedTabs[tabId] && (Date.now() - tabLastPingTime[tabId] < 60000); // 1 minute timeout
}

/**
 * Send a ping to a tab to check connection
 * @param {number} tabId - The tab ID to ping 
 * @returns {Promise} Resolves if tab responds, rejects otherwise
 */
function pingTab(tabId) {
  return new Promise((resolve, reject) => {
    try {
      // First check if tab is valid and has a matching URL
      chrome.tabs.get(tabId, function(tab) {
        if (chrome.runtime.lastError || !tab) {
          reject(new Error('Tab not found'));
          return;
        }
        
        // Check if URL matches content script patterns
        if (!isValidContentScriptUrl(tab.url)) {
          reject(new Error('Tab URL does not match content script patterns'));
          return;
        }
        
        chrome.tabs.sendMessage(tabId, { action: 'ping', timestamp: Date.now() }, function(response) {
          if (chrome.runtime.lastError) {
            // Silently ignore - this is expected when tab doesn't have content script
            reject(chrome.runtime.lastError);
            return;
          }
          
          if (response && response.alive) {
            connectedTabs[tabId] = true;
            tabLastPingTime[tabId] = Date.now();
            resolve(response);
          } else {
            reject(new Error('Invalid ping response'));
          }
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

// Ping all tabs periodically to check connection
setInterval(() => {
  chrome.tabs.query({}, function(tabs) {
    if (chrome.runtime.lastError) {
      return;
    }
    
    // Check connection for each tab
    tabs.forEach(tab => {
      if (connectedTabs[tab.id] && tab.id && tab.url && tab.url.startsWith('http')) {
        pingTab(tab.id).catch(() => {
          // If ping fails, mark tab as disconnected
          connectedTabs[tab.id] = false;
        });
      }
    });
  });
}, 30000); // Check every 30 seconds

// Message handler for communications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Get the tab ID from the sender
  const tabId = sender.tab?.id;
  
  // Record connection for this tab
  if (tabId) {
    connectedTabs[tabId] = true;
    tabLastPingTime[tabId] = Date.now();
  }
  
  // Handle content script handshake
  if (message.action === 'contentScriptReady') {
    console.log('[BRA Background] Content script ready on tab:', tabId, 'URL:', message.url);
    connectedTabs[tabId] = true;
    tabLastPingTime[tabId] = Date.now();
    
    // Forward to panel if it's open
    sendRuntimeMessage({
      action: 'contentScriptReady',
      tabId: tabId,
      url: message.url
    });
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle navigation detection (immediate notification)
  if (message.action === 'navigationDetected') {
    console.log('[BRA Background] Navigation detected for tab:', tabId, message);
    
    // Clear previous detection for this tab immediately
    if (detectionResults[tabId]) {
      delete detectionResults[tabId];
    }
    
    // Clear previous errors
    if (detectionErrors[tabId]) {
      delete detectionErrors[tabId];
    }
    
    // Reset badge
    updateBadge(tabId, false, 0, false);
    
    // Forward to panel immediately
    try {
      chrome.runtime.sendMessage({
        action: 'navigationDetected',
        tabId: tabId,
        oldUrl: message.oldUrl,
        newUrl: message.newUrl,
        isHashChange: message.isHashChange,
        timestamp: message.timestamp
      }, function(response) {
        if (chrome.runtime.lastError) {
          // Panel not open - this is normal
        }
      });
    } catch (e) {
      // Panel might not be open
    }
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle URL change from content script
  if (message.action === 'urlChanged') {
    console.log('[BRA Background] URL changed for tab:', tabId, 'New URL:', message.newUrl);
    
    // Clear previous detection for this tab
    if (detectionResults[tabId]) {
      delete detectionResults[tabId];
    }
    
    // Clear previous errors
    if (detectionErrors[tabId]) {
      delete detectionErrors[tabId];
    }
    
    // Reset badge
    updateBadge(tabId, false, 0, false);
    
    // Forward to panel if it's open
    try {
      chrome.runtime.sendMessage({
        action: 'urlChanged',
        tabId: tabId,
        newUrl: message.newUrl,
        timestamp: message.timestamp
      }, function(response) {
        if (chrome.runtime.lastError) {
          // Panel not open - this is normal
        }
      });
    } catch (e) {
      // Panel might not be open
    }
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle content change from content script
  if (message.action === 'contentChanged') {
    console.log('[BRA Background] Content changed for tab:', tabId);
    
    // Clear previous detection for this tab
    if (detectionResults[tabId]) {
      delete detectionResults[tabId];
    }
    
    // Clear previous errors
    if (detectionErrors[tabId]) {
      delete detectionErrors[tabId];
    }
    
    // Reset badge temporarily
    updateBadge(tabId, false, 0, false);
    
    // Forward to panel if it's open
    try {
      chrome.runtime.sendMessage({
        action: 'contentChanged',
        tabId: tabId,
        timestamp: message.timestamp
      }, function(response) {
        if (chrome.runtime.lastError) {
          // Panel not open - this is normal
        }
      });
    } catch (e) {
      // Panel might not be open
    }
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle conditional fields change from content script
  if (message.action === 'conditionalFieldsChanged') {
    console.log('[BRA Background] Conditional fields changed for tab:', tabId);
    
    // Forward to panel if it's open
    try {
      chrome.runtime.sendMessage({
        action: 'conditionalFieldsChanged',
        tabId: tabId,
        timestamp: message.timestamp
      }, function(response) {
        if (chrome.runtime.lastError) {
          // Panel not open - this is normal
        }
      });
    } catch (e) {
      // Panel might not be open
    }
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle ping from content script
  if (message.action === 'ping') {
    sendResponse({
      alive: true,
      timestamp: Date.now(),
      messageId: message.messageId
    });
    return true;
  }
  
  // Handle detection result from content script
  if (message.action === 'formDetected' && tabId) {
    console.log('[BRA Background] Received formDetected from tab:', tabId);
    console.log('[BRA Background] Detection result:', message.result);
    
    // Store the result
    detectionResults[tabId] = message.result;
    
    // Clear any previous errors for this tab
    delete detectionErrors[tabId];
    
    // Update the badge
    updateBadge(
      tabId, 
      message.result.isBusinessRegistrationForm, 
      message.result.confidenceScore,
      false
    );
    
    console.log('[BRA Background] Stored detection for tab', tabId);
    console.log('[BRA Background] Current stored results:', Object.keys(detectionResults));
    
    // Notify the panel about the detection update
    try {
      chrome.runtime.sendMessage({
        action: 'detectionUpdated',
        tabId: tabId,
        result: message.result
      }, function(response) {
        if (chrome.runtime.lastError) {
          // Silently ignore - panel might not be open
          return;
        }
        console.log('[BRA Background] Successfully notified panel of detection update');
      });
    } catch (error) {
      // Silently ignore - panel might not be open
    }

    // Acknowledge the message
    sendResponse({ 
      success: true, 
      received: true,
      messageId: message.messageId
    });
  }
  
  // Handle updateDetection message type from fieldDetector
  if (message.type === 'updateDetection') {
    console.log('[BRA Background] ===== RECEIVED updateDetection =====');
    console.log('[BRA Background] From tab:', tabId);
    console.log('[BRA Background] Message details:', {
      type: message.type,
      isDetected: message.isDetected,
      state: message.state,
      confidence: message.confidence,
      fields: message.fields
    });
    
    // Store in detection results if we have a tab ID
    if (tabId) {
      if (!detectionResults[tabId]) {
        detectionResults[tabId] = {};
      }
      detectionResults[tabId].isBusinessRegistrationForm = message.isDetected;
      detectionResults[tabId].confidenceScore = message.confidence;
      detectionResults[tabId].state = message.state;
      detectionResults[tabId].fieldDetection = {
        isDetected: message.isDetected,
        confidence: message.confidence,
        state: message.state,
        fields: message.fieldData || [],
        uiData: message.uiData || null,
        classifiedFields: message.fields || 0
      };
      
      console.log('[BRA Background] Stored detection result for tab', tabId);
      
      // Update badge
      updateBadge(tabId, message.isDetected, message.confidence, false);
    }
    
    // Forward to panel with enhanced message
    const panelMessage = {
      action: 'detectionUpdated',
      tabId: tabId,
      result: detectionResults[tabId] || {
        isBusinessRegistrationForm: message.isDetected,
        confidenceScore: message.confidence,
        state: message.state,
        fieldDetection: {
          isDetected: message.isDetected,
          confidence: message.confidence,
          state: message.state
        }
      }
    };
    
    console.log('[BRA Background] Forwarding to panel:', panelMessage);
    
    // Send to panel using safe method
    sendRuntimeMessage(panelMessage);
    
    // Also send as updateDetection format for compatibility
    sendRuntimeMessage({
      type: 'updateDetection',
      isDetected: message.isDetected,
      state: message.state,
      confidence: message.confidence,
      fields: message.fields
    });
    
    sendResponse({ success: true, received: true });
  }
  
  // Handle field detection update from fieldDetector module
  if (message.action === 'fieldDetectionUpdate' && tabId) {
    console.log('[BRA Background] Received fieldDetectionUpdate from tab:', tabId);
    console.log('[BRA Background] Field detection data:', message);
    
    // Update or create detection result with field detection data
    if (!detectionResults[tabId]) {
      detectionResults[tabId] = {};
    }
    
    // Update with field detection data
    detectionResults[tabId].fieldDetection = {
      state: message.state,
      confidence: message.confidence,
      validationScore: message.validationScore,
      avgFieldConfidence: message.avgFieldConfidence,
      isDetected: message.isDetected,
      criticalFieldsFound: message.criticalFieldsFound,
      categoryCount: message.categoryCount,
      totalFields: message.totalFields,
      classifiedFields: message.classifiedFields
    };
    
    // Also set main detection properties if not already set
    if (message.isDetected) {
      detectionResults[tabId].isBusinessRegistrationForm = true;
      detectionResults[tabId].confidenceScore = message.confidence;
      detectionResults[tabId].state = message.state;
    }
    
    console.log('[BRA Background] Updated detection with field data for tab', tabId);
    
    // Notify any open panels - use try-catch since panel might not be open
    try {
      chrome.runtime.sendMessage({
        action: 'detectionUpdated',
        tabId: tabId,
        result: detectionResults[tabId]
      }, function(response) {
        if (chrome.runtime.lastError) {
          // Silently ignore - panel might not be open
          return;
        }
        console.log('[BRA Background] Successfully notified panel of update');
      });
    } catch (error) {
      // Silently ignore - panel might not be open
    }
    
    sendResponse({ success: true });
  }
  
  // Handle detection errors from content script
  if (message.action === 'detectionError' && tabId) {
    console.error('[BRA] Detection error:', message.error && message.error.message ? message.error.message : 'Unknown error');
    
    // Store the error
    if (!detectionErrors[tabId]) {
      detectionErrors[tabId] = [];
    }
    detectionErrors[tabId].push(message.error);
    
    // Update badge to show error
    if (message.error.isFatal) {
      updateBadge(tabId, false, 0, true);
    }
    
    // Only show notifications for fatal errors
    if (message.error.isFatal && shouldNotifyError(tabId, message.error.context)) {
      try {
        // Show error notification
        chrome.notifications.create(`error-${Date.now()}`, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Form Detection Error',
          message: 'There was a problem analyzing this page. Try refreshing or check permissions.',
          priority: 1,
          buttons: [
            { title: 'Try Again' },
            { title: 'Dismiss' }
          ]
        });
      } catch (e) {
        console.error('[BRA] Failed to show notification:', e.message || 'Unknown error');
      }
    }
    
    // Acknowledge the message
    sendResponse({ 
      success: true, 
      received: true,
      messageId: message.messageId
    });
  }
  
  // Handle detection failure after max retries
  if (message.action === 'detectionFailed' && tabId) {
    console.warn('[BRA] Detection failed after maximum attempts for URL:', message.url || 'unknown URL');
    
    // Update badge to show error
    updateBadge(tabId, false, 0, true);
    
    // Store generic error if none exists yet
    if (!detectionErrors[tabId]) {
      detectionErrors[tabId] = [{
        message: 'Detection failed after maximum attempts',
        context: 'maxRetries',
        isFatal: true,
        timestamp: new Date().toISOString(),
        url: message.url
      }];
    }
    
    // Acknowledge the message
    sendResponse({ 
      success: true, 
      received: true,
      messageId: message.messageId
    });
  }
  
  // Send detection result to popup or panel
  if (message.action === 'getDetectionResult') {
    const requestedTabId = message.tabId || tabId;
    console.log('[BRA Background] getDetectionResult request for tab:', requestedTabId);
    console.log('[BRA Background] Available detection results:', Object.keys(detectionResults));
    
    if (requestedTabId && detectionResults[requestedTabId]) {
      console.log('[BRA Background] Sending detection result:', detectionResults[requestedTabId]);
      sendResponse({ 
        success: true,
        result: detectionResults[requestedTabId],
        connected: isTabConnected(requestedTabId)
      });
    } else {
      console.log('[BRA Background] No detection result for tab:', requestedTabId);
      // If we have errors, include them in the response
      const hasErrors = detectionErrors[requestedTabId] && detectionErrors[requestedTabId].length > 0;
      
      sendResponse({ 
        success: false,
        error: 'No detection result available',
        errors: hasErrors ? detectionErrors[requestedTabId] : undefined,
        hasErrors: hasErrors,
        connected: isTabConnected(requestedTabId)
      });
    }
  }
  
  // Provide error details if requested
  if (message.action === 'getDetectionErrors') {
    const requestedTabId = message.tabId || tabId;
    
    if (requestedTabId && detectionErrors[requestedTabId]) {
      sendResponse({
        success: true,
        errors: detectionErrors[requestedTabId],
        connected: isTabConnected(requestedTabId)
      });
    } else {
      sendResponse({
        success: false,
        errors: [],
        connected: isTabConnected(requestedTabId)
      });
    }
  }
  
  return true; // Keep message channel open
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Remove stored data for this tab
  if (detectionResults[tabId]) {
    delete detectionResults[tabId];
  }
  
  if (detectionErrors[tabId]) {
    delete detectionErrors[tabId];
  }
  
  if (errorCounts[tabId]) {
    delete errorCounts[tabId];
  }
  
  // Remove connection tracking data
  if (connectedTabs[tabId]) {
    delete connectedTabs[tabId];
  }
  
  if (tabLastPingTime[tabId]) {
    delete tabLastPingTime[tabId];
  }
  
  console.log('[BRA] Removed data for closed tab', tabId);
});

// Listen for notification clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  // Extract the tab ID from the notification (if it has one)
  const matches = notificationId.match(/error-(\d+)/);
  
  if (matches && matches[1]) {
    const tabId = parseInt(matches[1], 10);
    
    // Button index 0 is "Try Again"
    if (buttonIndex === 0) {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs && tabs[0] && tabs[0].id) {
          // First check if tab is valid
          chrome.tabs.get(tabs[0].id, function(tab) {
            if (chrome.runtime.lastError || !tab || !tab.url || !tab.url.startsWith('http')) {
              console.error('[BRA] Invalid tab for retry');
              return;
            }
            
            // Check if URL matches content script patterns
            if (!isValidContentScriptUrl(tab.url)) {
              console.log('[BRA] Tab URL does not match content script patterns, skipping retry');
              return;
            }
            
            // Send trigger detection message
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'triggerDetection',
              retry: true
            }, function(response) {
              if (chrome.runtime.lastError) {
                // Silently ignore - this is expected when tab doesn't have content script
                return;
              }
              console.log('[BRA] Retry triggered successfully');
            });
          });
        }
      });
    }
  }
  
  // Close the notification
  chrome.notifications.clear(notificationId);
});

// Listen for tab updates to refresh detection when URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act if URL has changed and it's complete
  if (changeInfo.status === 'complete' && changeInfo.url) {
    console.log('[BRA] Tab updated with new URL, will reset detection');
    // Clear previous detection for this tab
    if (detectionResults[tabId]) {
      delete detectionResults[tabId];
    }
    
    // Clear previous errors
    if (detectionErrors[tabId]) {
      delete detectionErrors[tabId];
    }
    
    // Reset error counts
    if (errorCounts[tabId]) {
      delete errorCounts[tabId];
    }
    
    // Reset badge
    updateBadge(tabId, false, 0, false);
  }
});