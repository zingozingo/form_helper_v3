/**
 * Business Registration Assistant - Background Script
 * Implementation that manages detection results and handles panel
 */

// Store detection results and errors by tab ID
const detectionResults = {};
const detectionErrors = {};

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
    console.error('[BRA] Badge update error:', error);
  }
}

// Set up the side panel
if (chrome.sidePanel) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[BRA] Error setting panel behavior:', error));
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

// Message handler for communications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Get the tab ID from the sender
  const tabId = sender.tab?.id;
  
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
  }
  
  // Handle detection errors from content script
  if (message.action === 'detectionError' && tabId) {
    console.error('[BRA] Detection error:', message.error);
    
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
          priority: 1
        });
      } catch (e) {
        console.error('[BRA] Failed to show notification:', e);
      }
    }
  }
  
  // Handle detection failure after max retries
  if (message.action === 'detectionFailed' && tabId) {
    console.warn('[BRA] Detection failed after maximum attempts:', message);
    
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
  }
  
  // Send detection result to popup or panel
  if (message.action === 'getDetectionResult') {
    const requestedTabId = message.tabId || tabId;
    
    if (requestedTabId && detectionResults[requestedTabId]) {
      sendResponse({ 
        success: true,
        result: detectionResults[requestedTabId] 
      });
    } else {
      // If we have errors, include them in the response
      const hasErrors = detectionErrors[requestedTabId] && detectionErrors[requestedTabId].length > 0;
      
      sendResponse({ 
        success: false,
        error: 'No detection result available',
        errors: hasErrors ? detectionErrors[requestedTabId] : undefined,
        hasErrors: hasErrors
      });
    }
  }
  
  // Provide error details if requested
  if (message.action === 'getDetectionErrors') {
    const requestedTabId = message.tabId || tabId;
    
    if (requestedTabId && detectionErrors[requestedTabId]) {
      sendResponse({
        success: true,
        errors: detectionErrors[requestedTabId]
      });
    } else {
      sendResponse({
        success: false,
        errors: []
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
  
  console.log('[BRA] Removed data for closed tab', tabId);
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