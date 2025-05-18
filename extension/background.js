/**
 * Business Registration Assistant - Simplified Background Script
 * 
 * Focused on reliable state management and communication between components.
 */

// Store detection results by tab ID
const detectionResults = {};

// Handle errors consistently
function handleError(context, error) {
  console.error(`[Business Registration Assistant] Error in ${context}:`, error);
}

// Update extension badge based on detection status
function updateBadge(tabId, isDetected, confidenceScore = 0) {
  try {
    const badgeText = isDetected ? '✓' : '';
    const badgeColor = confidenceScore >= 80 ? '#4CAF50' : // Green for high confidence
                       confidenceScore >= 60 ? '#FFC107' : // Yellow for medium confidence
                       '#CCCCCC';                          // Gray for low confidence
    
    chrome.action.setBadgeText({ text: badgeText, tabId });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
  } catch (error) {
    handleError('updateBadge', error);
  }
}

// Clear detection state for a tab
function clearTabState(tabId) {
  try {
    delete detectionResults[tabId];
    updateBadge(tabId, false);
  } catch (error) {
    handleError('clearTabState', error);
  }
}

// Message handler with robust error handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    const tabId = sender.tab?.id;
    
    switch (message.action) {
      case 'formDetected':
        if (!tabId) {
          sendResponse({ success: false, error: 'No tab ID provided' });
          return true;
        }
        
        // Store detection result
        detectionResults[tabId] = message.result;
        
        // Update badge
        updateBadge(tabId, true, message.result.confidenceScore);
        
        sendResponse({ success: true });
        break;
        
      case 'getDetectionResult':
        const requestedTabId = message.tabId || tabId;
        
        if (!requestedTabId) {
          sendResponse({ success: false, error: 'No tab ID available' });
          return true;
        }
        
        sendResponse({ 
          success: true,
          result: detectionResults[requestedTabId] || null 
        });
        break;
        
      default:
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    handleError('messageHandler', error);
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
      
      // Trigger detection in content script
      chrome.tabs.sendMessage(
        tabId, 
        { action: 'triggerDetection' },
        (response) => {
          // Ignore expected errors when content script isn't ready
          if (chrome.runtime.lastError) return;
        }
      );
    }
  } catch (error) {
    handleError('tabUpdated', error);
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    clearTabState(tabId);
  } catch (error) {
    handleError('tabRemoved', error);
  }
});