/**
 * Business Registration Assistant - Background Script
 * Implementation that manages detection results and handles panel
 */

// Store detection results and errors by tab ID
const detectionResults = {};
const detectionErrors = {};

// Track active content scripts
const connectedTabs = {};
const tabLastPingTime = {};

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
if (chrome.sidePanel) {
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
      chrome.tabs.sendMessage(tabId, { action: 'ping', timestamp: Date.now() }, function(response) {
        if (chrome.runtime.lastError) {
          console.warn('[BRA] Ping error:', chrome.runtime.lastError.message);
          reject(chrome.runtime.lastError);
        } else if (response && response.alive) {
          connectedTabs[tabId] = true;
          tabLastPingTime[tabId] = Date.now();
          resolve(response);
        } else {
          reject(new Error('Invalid ping response'));
        }
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
    
    console.log('[BRA] Stored detection for tab', tabId);

    // Acknowledge the message
    sendResponse({ 
      success: true, 
      received: true,
      messageId: message.messageId
    });
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
    
    if (requestedTabId && detectionResults[requestedTabId]) {
      sendResponse({ 
        success: true,
        result: detectionResults[requestedTabId],
        connected: isTabConnected(requestedTabId)
      });
    } else {
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
          // Send trigger detection message
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'triggerDetection',
            retry: true
          }).catch(e => console.error('[BRA] Failed to trigger retry:', e.message || 'Unknown error'));
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