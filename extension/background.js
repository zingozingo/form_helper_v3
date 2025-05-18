/**
 * Business Registration Assistant - Background Script
 * Implementation that manages detection results and handles panel
 */

// Store detection results by tab ID
const detectionResults = {};

// Update badge when a form is detected
function updateBadge(tabId, isDetected, confidenceScore = 0) {
  try {
    const badgeText = isDetected ? '✓' : '';
    const badgeColor = confidenceScore >= 80 ? '#4CAF50' : // Green for high confidence
                     confidenceScore >= 60 ? '#FFC107' : // Yellow for medium confidence
                     '#CCCCCC';                          // Gray for low confidence
    
    chrome.action.setBadgeText({ text: badgeText, tabId });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId });
  } catch (error) {
    console.error('[BRA] Badge update error:', error);
  }
}

// Set up the side panel
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('[BRA] Error setting panel behavior:', error));

// Message handler for communications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Get the tab ID from the sender
  const tabId = sender.tab?.id;
  
  // Handle detection result from content script
  if (message.action === 'formDetected' && tabId) {
    // Store the result
    detectionResults[tabId] = message.result;
    
    // Update the badge
    updateBadge(
      tabId, 
      message.result.isBusinessRegistrationForm, 
      message.result.confidenceScore
    );
    
    console.log('[BRA] Stored detection for tab', tabId);
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
      sendResponse({ 
        success: false,
        error: 'No detection result available' 
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
    console.log('[BRA] Removed data for closed tab', tabId);
  }
});