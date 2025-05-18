// Business Registration Assistant - Background Script
// Minimal implementation with simple state management

// Simple variable to store latest detection by tab
let detectionResults = {};

// Listen for messages from content script
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // Save detection result from content script
  if (message.action === 'detectionResult' && sender.tab) {
    const tabId = sender.tab.id;
    detectionResults[tabId] = message.result;
    
    // Update badge if it's a business form
    if (message.result.isBusinessForm) {
      chrome.action.setBadgeText({
        text: '✓',
        tabId: tabId
      });
      
      chrome.action.setBadgeBackgroundColor({
        color: '#4CAF50',
        tabId: tabId
      });
    }
    
    console.log('BRA: Stored detection for tab', tabId, message.result);
  }
  
  // Return detection result to popup
  if (message.action === 'getDetection') {
    const tabId = message.tabId;
    
    if (tabId && detectionResults[tabId]) {
      sendResponse({
        success: true,
        result: detectionResults[tabId]
      });
    } else {
      sendResponse({
        success: false,
        message: 'No detection available'
      });
    }
  }
  
  return true; // Keep message channel open
});

// Clean up when tabs are removed
chrome.tabs.onRemoved.addListener(function(tabId) {
  if (detectionResults[tabId]) {
    delete detectionResults[tabId];
    console.log('BRA: Removed data for closed tab', tabId);
  }
});