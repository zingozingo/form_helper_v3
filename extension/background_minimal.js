/**
 * Business Registration Assistant - Minimal Background Script
 * Only provides optional enhancements - not required for core functionality
 */

console.log('[BRA Background] Minimal background script loaded');

// Optional: Update badge when detection occurs
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'updateBadge' && sender.tab) {
    try {
      if (message.isDetected) {
        chrome.action.setBadgeText({ 
          text: '✓', 
          tabId: sender.tab.id 
        });
        chrome.action.setBadgeBackgroundColor({ 
          color: '#4CAF50', 
          tabId: sender.tab.id 
        });
      } else {
        chrome.action.setBadgeText({ 
          text: '', 
          tabId: sender.tab.id 
        });
      }
    } catch (e) {
      // Badge update failed - not critical
    }
  }
  
  return false;
});

// Optional: Clear badge on tab update
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    try {
      chrome.action.setBadgeText({ text: '', tabId });
    } catch (e) {
      // Badge clear failed - not critical
    }
  }
});