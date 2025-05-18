/**
 * Business Registration Assistant - Background Script
 * Simple service worker that maintains detection state
 */

// Store detection results by tab ID
const detectionResults = {};

// Handle errors consistently
function logError(context, error) {
  console.error(`[Business Registration Assistant] Error in ${context}:`, error);
}

// Update the extension badge based on detection
function updateBadge(tabId, isDetected, confidenceScore = 0) {
  try {
    const badgeText = isDetected ? '✓' : '';
    const badgeColor = confidenceScore >= 80 ? '#4CAF50' : // Green for high confidence
                      confidenceScore >= 60 ? '#FFC107' : // Yellow for medium confidence
                      '#CCCCCC';                          // Gray for low confidence
    
    chrome.action.setBadgeText({ text: badgeText, tabId });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
  } catch (error) {
    logError('updateBadge', error);
  }
}

// Clear detection state for a tab
function clearTabState(tabId) {
  try {
    delete detectionResults[tabId];
    updateBadge(tabId, false);
  } catch (error) {
    logError('clearTabState', error);
  }
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    const tabId = sender.tab?.id;
    
    if (message.action === 'formDetected') {
      if (!tabId) {
        sendResponse({ success: false, error: 'No tab ID provided' });
        return true;
      }
      
      // Store detection result
      detectionResults[tabId] = message.result;
      
      // Update badge
      updateBadge(
        tabId, 
        message.result.isBusinessRegistrationForm, 
        message.result.confidenceScore
      );
      
      sendResponse({ success: true });
    }
    else if (message.action === 'getDetectionResult') {
      const requestedTabId = message.tabId || tabId;
      
      if (!requestedTabId) {
        sendResponse({ success: false, error: 'No tab ID available' });
        return true;
      }
      
      sendResponse({ 
        success: true,
        result: detectionResults[requestedTabId] || null 
      });
    }
  } catch (error) {
    logError('messageHandler', error);
    sendResponse({ success: false, error: error.message });
  }
  
  // Keep message channel open for async responses
  return true;
});

// Handle tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    // Only process if the page has completed loading
    if (changeInfo.status === 'complete') {
      // Reset detection state
      clearTabState(tabId);
    }
  } catch (error) {
    logError('tabUpdated', error);
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    clearTabState(tabId);
  } catch (error) {
    logError('tabRemoved', error);
  }
});