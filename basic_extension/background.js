/**
 * Business Registration Assistant - Background Script
 * A simple service worker that manages state and communication
 */

console.log("[BRA] Background service worker initialized");

// Store detection results by tab ID
const detectionResults = {};

/**
 * Updates the extension badge based on detection status
 * @param {number} tabId - The ID of the current tab
 * @param {boolean} isDetected - Whether a form was detected
 * @param {number} confidenceScore - The confidence score (0-100)
 */
function updateBadge(tabId, isDetected, confidenceScore = 0) {
  try {
    // Set badge text based on detection status
    const badgeText = isDetected ? '✓' : '';
    
    // Set badge color based on confidence score
    const badgeColor = confidenceScore >= 80 ? '#4CAF50' : // Green for high confidence
                      confidenceScore >= 60 ? '#FFC107' : // Yellow for medium confidence
                      '#CCCCCC';                          // Gray for low confidence
    
    chrome.action.setBadgeText({ 
      text: badgeText, 
      tabId: tabId 
    });
    
    chrome.action.setBadgeBackgroundColor({ 
      color: badgeColor, 
      tabId: tabId 
    });
    
    console.log(`[BRA] Badge updated for tab ${tabId}: ${isDetected ? 'Detected' : 'None'} (${confidenceScore}%)`);
  } catch (error) {
    console.error('[BRA] Error updating badge:', error);
  }
}

/**
 * Clears detection state for a tab
 * @param {number} tabId - The ID of the tab to clear
 */
function clearTabState(tabId) {
  try {
    // Remove the stored detection result
    delete detectionResults[tabId];
    
    // Reset the badge
    updateBadge(tabId, false, 0);
    
    console.log(`[BRA] Cleared state for tab ${tabId}`);
  } catch (error) {
    console.error('[BRA] Error clearing tab state:', error);
  }
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BRA] Message received:', message.action);
  
  try {
    // Get the tab ID from the sender (for content scripts)
    // or from the message (for popup)
    const tabId = sender.tab?.id || message.tabId;
    
    switch (message.action) {
      // Handle form detection results from content script
      case 'formDetected':
        if (!tabId) {
          sendResponse({ success: false, error: 'No tab ID provided' });
          return true;
        }
        
        // Store the detection result
        detectionResults[tabId] = message.result;
        
        // Update the badge
        const isDetected = message.result.isBusinessRegistrationForm;
        const score = message.result.confidenceScore || 0;
        updateBadge(tabId, isDetected, score);
        
        sendResponse({ success: true });
        break;
        
      // Handle requests for detection results from popup
      case 'getDetectionResult':
        const requestedTabId = message.tabId;
        
        if (!requestedTabId) {
          sendResponse({ success: false, error: 'No tab ID provided in request' });
          return true;
        }
        
        // Return the stored result or null if not found
        const result = detectionResults[requestedTabId] || null;
        console.log(`[BRA] Returning detection result for tab ${requestedTabId}:`, result);
        
        sendResponse({ 
          success: true,
          result: result
        });
        break;
        
      // Handle detection error reports
      case 'detectionError':
        console.error('[BRA] Detection error reported:', message.error);
        sendResponse({ success: true });
        break;
        
      // Unrecognized action
      default:
        console.warn('[BRA] Unknown action received:', message.action);
        sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error('[BRA] Error handling message:', error);
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
      console.log(`[BRA] Tab ${tabId} updated, status: ${changeInfo.status}`);
      
      // Clear any previous detection result
      clearTabState(tabId);
      
      // No need to send a message to trigger detection here
      // The content script will run detection on its own
    }
  } catch (error) {
    console.error('[BRA] Error handling tab update:', error);
  }
});

// Handle tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    console.log(`[BRA] Tab ${tabId} closed`);
    
    // Clean up stored data for this tab
    clearTabState(tabId);
  } catch (error) {
    console.error('[BRA] Error handling tab removal:', error);
  }
});