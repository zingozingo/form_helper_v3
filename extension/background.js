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

// Track reconnection attempts
const reconnectionAttempts = {};
const MAX_RECONNECTION_ATTEMPTS = 3;

// Track detailed diagnostic information for troubleshooting
const tabDiagnostics = {};

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
 * Log diagnostic information for troubleshooting
 * @param {number} tabId - The tab ID
 * @param {string} category - The diagnostic category
 * @param {Object} data - The diagnostic data
 */
function logDiagnostic(tabId, category, data) {
  if (!tabDiagnostics[tabId]) {
    tabDiagnostics[tabId] = {
      history: [],
      categories: {}
    };
  }
  
  // Add timestamp
  const entry = {
    timestamp: new Date().toISOString(),
    category,
    data
  };
  
  // Store in history
  tabDiagnostics[tabId].history.push(entry);
  
  // Limit history to last 50 entries
  if (tabDiagnostics[tabId].history.length > 50) {
    tabDiagnostics[tabId].history.shift();
  }
  
  // Store in category-specific data
  if (!tabDiagnostics[tabId].categories[category]) {
    tabDiagnostics[tabId].categories[category] = [];
  }
  
  tabDiagnostics[tabId].categories[category].push(entry);
  
  // Limit category-specific history to last 10 entries
  if (tabDiagnostics[tabId].categories[category].length > 10) {
    tabDiagnostics[tabId].categories[category].shift();
  }
  
  console.log(`[BRA] Diagnostic [${category}]:`, data);
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
 * Try to reconnect to a tab
 * @param {number} tabId - The tab ID to reconnect to
 * @returns {Promise} Resolves if successful, rejects if failed
 */
async function attemptReconnection(tabId) {
  // Initialize reconnection counter if not exists
  if (reconnectionAttempts[tabId] === undefined) {
    reconnectionAttempts[tabId] = 0;
  }
  
  // If we've exceeded max attempts, fail
  if (reconnectionAttempts[tabId] >= MAX_RECONNECTION_ATTEMPTS) {
    logDiagnostic(tabId, 'reconnection', {
      status: 'failed',
      attempts: reconnectionAttempts[tabId],
      reason: 'Maximum attempts exceeded'
    });
    return Promise.reject(new Error('Maximum reconnection attempts exceeded'));
  }
  
  // Increment attempt counter
  reconnectionAttempts[tabId]++;
  
  try {
    // Try to retrieve tab info
    const tab = await chrome.tabs.get(tabId);
    
    // Check if the tab still exists
    if (!tab) {
      logDiagnostic(tabId, 'reconnection', {
        status: 'failed',
        attempts: reconnectionAttempts[tabId],
        reason: 'Tab no longer exists'
      });
      return Promise.reject(new Error('Tab no longer exists'));
    }
    
    // Check if the tab is in a state we can inject scripts into
    if (!tab.url || !tab.url.startsWith('http')) {
      logDiagnostic(tabId, 'reconnection', {
        status: 'failed',
        attempts: reconnectionAttempts[tabId],
        reason: 'Tab URL not supported',
        url: tab.url
      });
      return Promise.reject(new Error('Tab URL not supported for content scripts'));
    }
    
    // Try to ping first
    try {
      const pingResponse = await pingTab(tabId);
      // If ping succeeds, we're already connected
      logDiagnostic(tabId, 'reconnection', {
        status: 'success',
        attempts: reconnectionAttempts[tabId],
        method: 'ping'
      });
      return pingResponse;
    } catch (pingError) {
      // Ping failed, try to inject content script again
      logDiagnostic(tabId, 'reconnection', {
        status: 'ping_failed',
        error: pingError.message,
        attempts: reconnectionAttempts[tabId]
      });
      
      // Try to re-inject content script
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      
      // Wait a moment for script to initialize
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try ping again after injection
      const postInjectPing = await pingTab(tabId);
      
      logDiagnostic(tabId, 'reconnection', {
        status: 'success',
        attempts: reconnectionAttempts[tabId],
        method: 'script_injection'
      });
      
      return postInjectPing;
    }
  } catch (error) {
    logDiagnostic(tabId, 'reconnection', {
      status: 'failed',
      error: error.message,
      attempts: reconnectionAttempts[tabId]
    });
    return Promise.reject(error);
  }
}

/**
 * Send a ping to a tab to check connection
 * @param {number} tabId - The tab ID to ping 
 * @returns {Promise} Resolves if tab responds, rejects otherwise
 */
function pingTab(tabId) {
  return new Promise((resolve, reject) => {
    try {
      chrome.tabs.sendMessage(tabId, { 
        action: 'ping', 
        timestamp: Date.now(),
        diagnosticInfo: {
          hasDetectionResult: !!detectionResults[tabId],
          hasErrors: !!(detectionErrors[tabId] && detectionErrors[tabId].length > 0),
          reconnectionAttempts: reconnectionAttempts[tabId] || 0
        }
      }, function(response) {
        if (chrome.runtime.lastError) {
          console.warn('[BRA] Ping error:', chrome.runtime.lastError.message);
          
          logDiagnostic(tabId, 'ping', {
            status: 'failed',
            error: chrome.runtime.lastError.message
          });
          
          reject(chrome.runtime.lastError);
        } else if (response && response.alive) {
          connectedTabs[tabId] = true;
          tabLastPingTime[tabId] = Date.now();
          
          // If we've previously attempted reconnection, reset the counter
          if (reconnectionAttempts[tabId]) {
            reconnectionAttempts[tabId] = 0;
          }
          
          logDiagnostic(tabId, 'ping', {
            status: 'success',
            response: {
              detectionStatus: response.detectionStatus || 'unknown'
            }
          });
          
          resolve(response);
        } else {
          logDiagnostic(tabId, 'ping', {
            status: 'failed',
            error: 'Invalid response',
            response
          });
          
          reject(new Error('Invalid ping response'));
        }
      });
    } catch (e) {
      logDiagnostic(tabId, 'ping', {
        status: 'failed',
        error: e.message
      });
      
      reject(e);
    }
  });
}

// Ping all tabs periodically to check connection
setInterval(() => {
  chrome.tabs.query({}, function(tabs) {
    if (chrome.runtime.lastError) {
      console.warn('[BRA] Error querying tabs:', chrome.runtime.lastError.message);
      return;
    }
    
    // Check connection for each tab
    tabs.forEach(tab => {
      // Only check tabs that have been connected or have detection results/errors
      if ((connectedTabs[tab.id] || detectionResults[tab.id] || detectionErrors[tab.id]) && 
          tab.id && tab.url && tab.url.startsWith('http')) {
        
        // Log tab status check
        logDiagnostic(tab.id, 'connection_check', {
          url: tab.url,
          title: tab.title,
          status: tab.status,
          isConnected: !!connectedTabs[tab.id],
          hasDetectionResult: !!detectionResults[tab.id]
        });
        
        // Try to ping the tab
        pingTab(tab.id).catch(error => {
          console.warn(`[BRA] Tab ${tab.id} appears disconnected:`, error.message);
          
          // If ping fails, try to reconnect
          if (connectedTabs[tab.id]) {
            logDiagnostic(tab.id, 'connection_lost', {
              previouslyConnected: true,
              error: error.message
            });
            
            // Mark as disconnected
            connectedTabs[tab.id] = false;
            
            // Attempt to reconnect
            attemptReconnection(tab.id).then(() => {
              console.log(`[BRA] Successfully reconnected to tab ${tab.id}`);
              
              // If we have a detection result, try to trigger detection again
              if (detectionResults[tab.id]) {
                chrome.tabs.sendMessage(tab.id, {
                  action: 'triggerDetection',
                  retry: true
                }).catch(e => console.warn('[BRA] Failed to trigger detection after reconnection:', e.message));
              }
            }).catch(reconnectError => {
              console.error(`[BRA] Failed to reconnect to tab ${tab.id}:`, reconnectError.message);
            });
          }
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
    const pingResponse = {
      alive: true,
      timestamp: Date.now(),
      messageId: message.messageId,
      // Add more diagnostic info for better transparency
      serviceWorkerStatus: 'active',
      hasDetectionResult: tabId ? !!detectionResults[tabId] : false,
      hasErrors: tabId ? !!(detectionErrors[tabId] && detectionErrors[tabId].length > 0) : false
    };
    
    // Log ping in diagnostics
    if (tabId) {
      logDiagnostic(tabId, 'ping_received', {
        timestamp: Date.now(),
        messageId: message.messageId,
        preDetection: !!message.preDetection
      });
    }
    
    sendResponse(pingResponse);
    return true;
  }
  
  // Handle reconnection request from content script
  if (message.action === 'reconnect' && tabId) {
    // Reset reconnection state for this tab
    connectedTabs[tabId] = true;
    tabLastPingTime[tabId] = Date.now();
    
    // Log reconnection attempt in diagnostics
    logDiagnostic(tabId, 'reconnection_request', {
      timestamp: Date.now(),
      messageId: message.messageId
    });
    
    // Send positive response to content script
    sendResponse({
      alive: true,
      reconnected: true,
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
  
  // Provide diagnostic information
  if (message.action === 'getDiagnostics') {
    const requestedTabId = message.tabId || tabId;
    
    if (requestedTabId) {
      // Gather comprehensive diagnostic information
      const diagnosticInfo = {
        tabInfo: {
          id: requestedTabId,
          connected: isTabConnected(requestedTabId),
          hasDetectionResult: !!detectionResults[requestedTabId],
          hasErrors: !!(detectionErrors[requestedTabId] && detectionErrors[requestedTabId].length > 0),
          reconnectionAttempts: reconnectionAttempts[requestedTabId] || 0,
          lastPingTime: tabLastPingTime[requestedTabId] ? new Date(tabLastPingTime[requestedTabId]).toISOString() : null
        },
        logs: tabDiagnostics[requestedTabId] || { history: [], categories: {} },
        detectionResult: detectionResults[requestedTabId] || null,
        errors: detectionErrors[requestedTabId] || []
      };
      
      // Add browser info
      chrome.runtime.getBrowserInfo().then(browserInfo => {
        diagnosticInfo.browser = browserInfo;
        
        // Add system info if available
        if (chrome.system && chrome.system.cpu) {
          chrome.system.cpu.getInfo(cpuInfo => {
            diagnosticInfo.system = { cpu: cpuInfo };
            
            sendResponse({
              success: true,
              diagnostics: diagnosticInfo
            });
          });
        } else {
          sendResponse({
            success: true,
            diagnostics: diagnosticInfo
          });
        }
      }).catch(error => {
        diagnosticInfo.browserInfoError = error.message;
        
        sendResponse({
          success: true,
          diagnostics: diagnosticInfo
        });
      });
      
      // Return true to indicate we'll call sendResponse asynchronously
      return true;
    } else {
      sendResponse({
        success: false,
        error: 'No tab ID specified'
      });
    }
  }
  
  // Allow manual reconnection attempts
  if (message.action === 'reconnect') {
    const requestedTabId = message.tabId || tabId;
    
    if (requestedTabId) {
      // Reset reconnection counters for a fresh attempt
      reconnectionAttempts[requestedTabId] = 0;
      
      attemptReconnection(requestedTabId).then(result => {
        sendResponse({
          success: true,
          reconnected: true,
          result
        });
      }).catch(error => {
        sendResponse({
          success: false,
          reconnected: false,
          error: error.message
        });
      });
      
      // Return true to indicate we'll call sendResponse asynchronously
      return true;
    } else {
      sendResponse({
        success: false,
        error: 'No tab ID specified'
      });
    }
  }
  
  return true; // Keep message channel open
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  // Log the tab removal for diagnostics
  logDiagnostic(tabId, 'tab_closed', {
    hadDetectionResult: !!detectionResults[tabId],
    hadErrors: !!(detectionErrors[tabId] && detectionErrors[tabId].length > 0),
    wasConnected: !!connectedTabs[tabId]
  });
  
  // Move diagnostic data to a temporary storage to avoid losing info immediately
  const tabDiagnostic = tabDiagnostics[tabId];
  
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
  
  if (reconnectionAttempts[tabId]) {
    delete reconnectionAttempts[tabId];
  }
  
  // Keep diagnostic data for a delayed cleanup (useful for debugging)
  if (tabDiagnostics[tabId]) {
    // Mark as closed in the diagnostic data
    tabDiagnostics[tabId].tabClosed = true;
    tabDiagnostics[tabId].closedAt = new Date().toISOString();
    
    // Schedule cleanup of diagnostic data after a delay
    setTimeout(() => {
      if (tabDiagnostics[tabId]) {
        delete tabDiagnostics[tabId];
      }
    }, 60000); // Keep diagnostic data for 1 minute after tab close
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