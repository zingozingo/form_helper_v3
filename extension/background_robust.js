/**
 * Business Registration Assistant - Background Script with Robust Messaging
 * Implementation that manages detection results with improved message handling
 */

// Import background messaging module inline
const BackgroundMessaging = (() => {
  class BackgroundMessaging {
    constructor() {
      this.connections = new Map();
      this.messageHandlers = new Map();
      this.defaultTimeout = 20000; // 20 seconds for background operations
      this.contentScriptStatus = new Map();
      
      this.setupHandlers();
    }

    setupHandlers() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const asyncResponse = this.handleMessage(message, sender);
        
        asyncResponse
          .then(response => sendResponse(response))
          .catch(error => {
            console.error('[BRA Background] Handler error:', error);
            sendResponse({ 
              success: false, 
              error: error.message 
            });
          });
        
        return true;
      });
      
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete') {
          this.contentScriptStatus.delete(tabId);
        }
      });
      
      chrome.tabs.onRemoved.addListener((tabId) => {
        this.contentScriptStatus.delete(tabId);
        this.connections.delete(tabId);
      });
    }

    async handleMessage(message, sender) {
      const { action } = message;
      
      if (sender.tab && action === 'contentScriptReady') {
        this.contentScriptStatus.set(sender.tab.id, {
          ready: true,
          url: sender.tab.url,
          timestamp: Date.now()
        });
      }
      
      const handler = this.messageHandlers.get(action);
      if (handler) {
        return await handler(message, sender);
      }
      
      switch (action) {
        case 'ping':
          return { alive: true, timestamp: Date.now() };
          
        case 'getContentScriptStatus':
          return this.getContentScriptStatus(message.tabId);
          
        case 'ensureContentScript':
          return await this.ensureContentScript(message.tabId);
          
        default:
          return null; // Let main handler process
      }
    }

    registerHandler(action, handler) {
      this.messageHandlers.set(action, handler);
    }

    async sendToContentScript(tabId, message, options = {}) {
      const {
        timeout = this.defaultTimeout,
        retries = 3,
        ensureReady = true
      } = options;
      
      if (ensureReady) {
        const isReady = await this.ensureContentScript(tabId);
        if (!isReady) {
          throw new Error('Content script not ready');
        }
      }
      
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await this.sendMessageAttempt(tabId, message, timeout);
        } catch (error) {
          console.warn(`[BRA Background] Attempt ${attempt + 1} failed:`, error.message);
          
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
            await this.sleep(delay);
          }
        }
      }
      
      throw new Error('All retry attempts failed');
    }

    async sendMessageAttempt(tabId, message, timeout) {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error(`Message timeout after ${timeout}ms`));
        }, timeout);
        
        chrome.tabs.sendMessage(tabId, message, (response) => {
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });
    }

    async ensureContentScript(tabId, maxWait = 10000) {
      const status = this.contentScriptStatus.get(tabId);
      if (status && status.ready && (Date.now() - status.timestamp < 60000)) {
        return true;
      }
      
      const startTime = Date.now();
      
      while (Date.now() - startTime < maxWait) {
        try {
          const response = await this.sendMessageAttempt(tabId, { action: 'ping' }, 2000);
          if (response?.alive) {
            this.contentScriptStatus.set(tabId, {
              ready: true,
              timestamp: Date.now()
            });
            return true;
          }
        } catch (error) {
          // Expected to fail if not ready
        }
        
        await this.sleep(500);
      }
      
      try {
        await this.injectContentScript(tabId);
        await this.sleep(1000);
        
        const response = await this.sendMessageAttempt(tabId, { action: 'ping' }, 2000);
        if (response?.alive) {
          this.contentScriptStatus.set(tabId, {
            ready: true,
            timestamp: Date.now()
          });
          return true;
        }
      } catch (error) {
        console.error('[BRA Background] Failed to inject content script:', error);
      }
      
      return false;
    }

    async injectContentScript(tabId) {
      const tab = await chrome.tabs.get(tabId);
      
      if (!this.isAllowedUrl(tab.url)) {
        throw new Error('URL not allowed for content script');
      }
      
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content_instant.js']
      });
      
      console.log('[BRA Background] Content script injected into tab', tabId);
    }

    isAllowedUrl(url) {
      if (!url) return false;
      
      return CONTENT_SCRIPT_PATTERNS.some(pattern => pattern.test(url));
    }

    getContentScriptStatus(tabId) {
      const status = this.contentScriptStatus.get(tabId);
      return {
        ready: status?.ready || false,
        timestamp: status?.timestamp || null,
        age: status ? Date.now() - status.timestamp : null
      };
    }

    async broadcast(message, options = {}) {
      const tabs = await chrome.tabs.query({});
      const results = [];
      
      for (const tab of tabs) {
        if (this.isAllowedUrl(tab.url)) {
          try {
            const response = await this.sendToContentScript(tab.id, message, {
              ...options,
              ensureReady: false,
              retries: 0
            });
            results.push({ 
              tabId: tab.id, 
              success: true, 
              response 
            });
          } catch (error) {
            results.push({ 
              tabId: tab.id, 
              success: false, 
              error: error.message 
            });
          }
        }
      }
      
      return results;
    }

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    cleanup() {
      const now = Date.now();
      const maxAge = 300000; // 5 minutes
      
      for (const [tabId, status] of this.contentScriptStatus) {
        if (now - status.timestamp > maxAge) {
          this.contentScriptStatus.delete(tabId);
        }
      }
    }
  }
  
  return new BackgroundMessaging();
})();

// URL patterns where content scripts are injected
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

// Safe message sending to runtime (panel/popup) with longer timeout
async function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      console.warn('[BRA Background] Runtime message timeout');
      resolve(null);
    }, 10000); // 10 second timeout for runtime messages
    
    chrome.runtime.sendMessage(message, (response) => {
      clearTimeout(timeoutId);
      
      if (chrome.runtime.lastError) {
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
  
  errorCounts[tabId].total++;
  errorCounts[tabId].contexts[context] = (errorCounts[tabId].contexts[context] || 0) + 1;
  
  return errorCounts[tabId].total <= MAX_ERROR_NOTIFICATIONS;
}

// Check if a tab is still connected
function isTabConnected(tabId) {
  return connectedTabs[tabId] && (Date.now() - tabLastPingTime[tabId] < 60000); // 1 minute timeout
}

// Register message handlers with BackgroundMessaging
BackgroundMessaging.registerHandler('formDetected', async (message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return { success: false, error: 'No tab ID' };
  
  console.log('[BRA Background] Received formDetected from tab:', tabId);
  console.log('[BRA Background] Detection result:', message.result);
  
  detectionResults[tabId] = message.result;
  delete detectionErrors[tabId];
  
  updateBadge(
    tabId, 
    message.result.isBusinessRegistrationForm, 
    message.result.confidenceScore,
    false
  );
  
  await sendRuntimeMessage({
    action: 'detectionUpdated',
    tabId: tabId,
    result: message.result
  });
  
  return { 
    success: true, 
    received: true,
    messageId: message.messageId
  };
});

BackgroundMessaging.registerHandler('updateDetection', async (message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return { success: false, error: 'No tab ID' };
  
  console.log('[BRA Background] Received updateDetection from tab:', tabId);
  
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
  
  updateBadge(tabId, message.isDetected, message.confidence, false);
  
  await sendRuntimeMessage({
    action: 'detectionUpdated',
    tabId: tabId,
    result: detectionResults[tabId]
  });
  
  return { success: true, received: true };
});

BackgroundMessaging.registerHandler('fieldDetectionUpdate', async (message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return { success: false, error: 'No tab ID' };
  
  console.log('[BRA Background] Received fieldDetectionUpdate from tab:', tabId);
  
  if (!detectionResults[tabId]) {
    detectionResults[tabId] = {};
  }
  
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
  
  if (message.isDetected) {
    detectionResults[tabId].isBusinessRegistrationForm = true;
    detectionResults[tabId].confidenceScore = message.confidence;
    detectionResults[tabId].state = message.state;
  }
  
  await sendRuntimeMessage({
    action: 'detectionUpdated',
    tabId: tabId,
    result: detectionResults[tabId]
  });
  
  return { success: true };
});

BackgroundMessaging.registerHandler('detectionError', async (message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return { success: false, error: 'No tab ID' };
  
  console.error('[BRA] Detection error:', message.error?.message || 'Unknown error');
  
  if (!detectionErrors[tabId]) {
    detectionErrors[tabId] = [];
  }
  detectionErrors[tabId].push(message.error);
  
  if (message.error.isFatal) {
    updateBadge(tabId, false, 0, true);
  }
  
  if (message.error.isFatal && shouldNotifyError(tabId, message.error.context)) {
    try {
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
  
  return { 
    success: true, 
    received: true,
    messageId: message.messageId
  };
});

// Main message handler for remaining actions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  if (tabId) {
    connectedTabs[tabId] = true;
    tabLastPingTime[tabId] = Date.now();
  }
  
  // Handle navigation detection
  if (message.action === 'navigationDetected') {
    console.log('[BRA Background] Navigation detected for tab:', tabId, message);
    
    if (tabId && detectionResults[tabId]) {
      delete detectionResults[tabId];
    }
    if (tabId && detectionErrors[tabId]) {
      delete detectionErrors[tabId];
    }
    
    updateBadge(tabId, false, 0, false);
    
    sendRuntimeMessage({
      action: 'navigationDetected',
      tabId: tabId,
      oldUrl: message.oldUrl,
      newUrl: message.newUrl,
      isHashChange: message.isHashChange,
      timestamp: message.timestamp
    });
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle URL change
  if (message.action === 'urlChanged') {
    console.log('[BRA Background] URL changed for tab:', tabId, 'New URL:', message.newUrl);
    
    if (tabId && detectionResults[tabId]) {
      delete detectionResults[tabId];
    }
    if (tabId && detectionErrors[tabId]) {
      delete detectionErrors[tabId];
    }
    
    updateBadge(tabId, false, 0, false);
    
    sendRuntimeMessage({
      action: 'urlChanged',
      tabId: tabId,
      newUrl: message.newUrl,
      timestamp: message.timestamp
    });
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle content change
  if (message.action === 'contentChanged') {
    console.log('[BRA Background] Content changed for tab:', tabId);
    
    if (tabId && detectionResults[tabId]) {
      delete detectionResults[tabId];
    }
    if (tabId && detectionErrors[tabId]) {
      delete detectionErrors[tabId];
    }
    
    updateBadge(tabId, false, 0, false);
    
    sendRuntimeMessage({
      action: 'contentChanged',
      tabId: tabId,
      timestamp: message.timestamp
    });
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle conditional fields change
  if (message.action === 'conditionalFieldsChanged') {
    console.log('[BRA Background] Conditional fields changed for tab:', tabId);
    
    sendRuntimeMessage({
      action: 'conditionalFieldsChanged',
      tabId: tabId,
      timestamp: message.timestamp
    });
    
    sendResponse({acknowledged: true});
    return true;
  }
  
  // Handle getDetectionResult with timeout
  if (message.action === 'getDetectionResult') {
    const requestedTabId = message.tabId || tabId;
    console.log('[BRA Background] getDetectionResult request for tab:', requestedTabId);
    
    // Use async handler
    (async () => {
      if (requestedTabId && detectionResults[requestedTabId]) {
        sendResponse({ 
          success: true,
          result: detectionResults[requestedTabId],
          connected: isTabConnected(requestedTabId)
        });
      } else {
        // Try to ensure content script is ready
        const isReady = await BackgroundMessaging.ensureContentScript(requestedTabId);
        
        if (isReady) {
          // Try triggering detection
          try {
            await BackgroundMessaging.sendToContentScript(requestedTabId, {
              action: 'triggerDetection',
              retry: true
            }, { timeout: 15000 });
            
            // Wait a bit for detection to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (detectionResults[requestedTabId]) {
              sendResponse({ 
                success: true,
                result: detectionResults[requestedTabId],
                connected: true
              });
              return;
            }
          } catch (error) {
            console.warn('[BRA Background] Failed to trigger detection:', error);
          }
        }
        
        const hasErrors = detectionErrors[requestedTabId] && detectionErrors[requestedTabId].length > 0;
        sendResponse({ 
          success: false,
          error: 'No detection result available',
          errors: hasErrors ? detectionErrors[requestedTabId] : undefined,
          hasErrors: hasErrors,
          connected: isTabConnected(requestedTabId)
        });
      }
    })();
    
    return true; // Will respond asynchronously
  }
  
  // Handle getDetectionErrors
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
  
  return true;
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (detectionResults[tabId]) {
    delete detectionResults[tabId];
  }
  
  if (detectionErrors[tabId]) {
    delete detectionErrors[tabId];
  }
  
  if (errorCounts[tabId]) {
    delete errorCounts[tabId];
  }
  
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
  const matches = notificationId.match(/error-(\d+)/);
  
  if (matches && matches[1]) {
    const tabId = parseInt(matches[1], 10);
    
    if (buttonIndex === 0) {
      chrome.tabs.query({active: true, currentWindow: true}, async function(tabs) {
        if (tabs && tabs[0] && tabs[0].id) {
          const tab = tabs[0];
          
          if (!tab.url || !tab.url.startsWith('http')) {
            console.error('[BRA] Invalid tab for retry');
            return;
          }
          
          if (!isValidContentScriptUrl(tab.url)) {
            console.log('[BRA] Tab URL does not match content script patterns, skipping retry');
            return;
          }
          
          try {
            await BackgroundMessaging.sendToContentScript(tab.id, {
              action: 'triggerDetection',
              retry: true
            }, { timeout: 15000 });
            
            console.log('[BRA] Retry triggered successfully');
          } catch (error) {
            console.error('[BRA] Failed to trigger retry:', error);
          }
        }
      });
    }
  }
  
  chrome.notifications.clear(notificationId);
});

// Listen for tab updates to refresh detection when URL changes
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && changeInfo.url) {
    console.log('[BRA] Tab updated with new URL, will reset detection');
    
    if (detectionResults[tabId]) {
      delete detectionResults[tabId];
    }
    
    if (detectionErrors[tabId]) {
      delete detectionErrors[tabId];
    }
    
    if (errorCounts[tabId]) {
      delete errorCounts[tabId];
    }
    
    updateBadge(tabId, false, 0, false);
  }
});

// Periodic cleanup
setInterval(() => BackgroundMessaging.cleanup(), 60000);

console.log('[BRA Background] Background script with robust messaging initialized');