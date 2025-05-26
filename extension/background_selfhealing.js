/**
 * Self-Healing Background Script
 * Manages extension state with automatic recovery
 */

class SelfHealingBackground {
  constructor() {
    this.detectionStates = new Map(); // tabId -> detection state
    this.contentScriptStatus = new Map(); // tabId -> connection status
    this.messageHandlers = new Map();
    this.initTime = Date.now();
    
    this.initialize();
  }
  
  initialize() {
    console.log('[BRA Background] Initializing self-healing background service');
    
    // Set up message handlers
    this.setupMessageHandlers();
    
    // Set up tab lifecycle handlers
    this.setupTabHandlers();
    
    // Set up extension lifecycle handlers
    this.setupLifecycleHandlers();
    
    // Set up periodic health checks
    this.setupHealthChecks();
    
    // Set up side panel
    this.setupSidePanel();
  }
  
  setupMessageHandlers() {
    // Register core handlers
    this.registerHandler('ping', this.handlePing.bind(this));
    this.registerHandler('detectionUpdate', this.handleDetectionUpdate.bind(this));
    this.registerHandler('syncDetection', this.handleSyncDetection.bind(this));
    this.registerHandler('getDetectionResult', this.handleGetDetectionResult.bind(this));
    this.registerHandler('contentScriptReady', this.handleContentScriptReady.bind(this));
    
    // Main message listener
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.routeMessage(message, sender, sendResponse);
      return true; // Keep channel open
    });
  }
  
  registerHandler(action, handler) {
    this.messageHandlers.set(action, handler);
  }
  
  async routeMessage(message, sender, sendResponse) {
    const { action } = message;
    const tabId = sender.tab?.id;
    
    // Update last seen time for the tab
    if (tabId) {
      this.updateContentScriptStatus(tabId, true);
    }
    
    const handler = this.messageHandlers.get(action);
    if (handler) {
      try {
        const result = await handler(message, sender);
        sendResponse(result);
      } catch (error) {
        console.error(`[BRA Background] Handler error for ${action}:`, error);
        sendResponse({ success: false, error: error.message });
      }
    } else {
      console.warn(`[BRA Background] Unknown action: ${action}`);
      sendResponse({ success: false, error: 'Unknown action' });
    }
  }
  
  // Message Handlers
  handlePing(message, sender) {
    return { 
      alive: true, 
      timestamp: Date.now(),
      uptime: Date.now() - this.initTime
    };
  }
  
  handleDetectionUpdate(message, sender) {
    const tabId = sender.tab?.id;
    if (!tabId) return { success: false, error: 'No tab ID' };
    
    // Store detection state
    this.detectionStates.set(tabId, {
      detection: message.detection,
      trigger: message.trigger,
      timestamp: message.timestamp,
      url: sender.tab.url,
      isConnected: message.isConnected !== false
    });
    
    // Update badge
    this.updateBadge(tabId, message.detection);
    
    // Notify panel if open
    this.notifyPanel('detectionUpdated', {
      tabId: tabId,
      detection: message.detection,
      trigger: message.trigger
    });
    
    console.log(`[BRA Background] Detection updated for tab ${tabId} (${message.trigger})`);
    
    return { success: true, received: true };
  }
  
  handleSyncDetection(message, sender) {
    const tabId = sender.tab?.id;
    if (!tabId) return { success: false, error: 'No tab ID' };
    
    console.log(`[BRA Background] Syncing detection for tab ${tabId} after reconnection`);
    
    // Update stored state
    this.detectionStates.set(tabId, {
      detection: message.detection,
      timestamp: Date.now(),
      url: message.url || sender.tab.url,
      isConnected: true,
      syncedAfterReconnect: true
    });
    
    // Update UI
    this.updateBadge(tabId, message.detection);
    
    // Notify panel
    this.notifyPanel('detectionSynced', {
      tabId: tabId,
      detection: message.detection
    });
    
    return { success: true, synced: true };
  }
  
  handleGetDetectionResult(message, sender) {
    const tabId = message.tabId || sender.tab?.id;
    
    if (!tabId) {
      return { success: false, error: 'No tab ID provided' };
    }
    
    const state = this.detectionStates.get(tabId);
    const isConnected = this.isContentScriptConnected(tabId);
    
    if (state) {
      return {
        success: true,
        result: state.detection,
        isConnected: isConnected,
        timestamp: state.timestamp,
        syncedAfterReconnect: state.syncedAfterReconnect
      };
    }
    
    // No stored state - try to request from content script
    if (isConnected) {
      return this.requestDetectionFromContentScript(tabId);
    }
    
    return {
      success: false,
      error: 'No detection available',
      isConnected: false
    };
  }
  
  handleContentScriptReady(message, sender) {
    const tabId = sender.tab?.id;
    if (!tabId) return { success: false };
    
    console.log(`[BRA Background] Content script ready on tab ${tabId}`);
    
    this.updateContentScriptStatus(tabId, true);
    
    // Check if we have a stored detection for this tab
    const state = this.detectionStates.get(tabId);
    if (state && state.url === sender.tab.url) {
      // Same URL, content script can use cached detection
      return { 
        success: true, 
        hasCachedDetection: true,
        cachedTimestamp: state.timestamp
      };
    }
    
    return { success: true, hasCachedDetection: false };
  }
  
  // Tab Management
  setupTabHandlers() {
    // Clean up on tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.detectionStates.delete(tabId);
      this.contentScriptStatus.delete(tabId);
      console.log(`[BRA Background] Cleaned up tab ${tabId}`);
    });
    
    // Monitor tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading' && changeInfo.url) {
        // Clear old detection when navigating to new URL
        const oldState = this.detectionStates.get(tabId);
        if (oldState && oldState.url !== changeInfo.url) {
          this.detectionStates.delete(tabId);
          this.updateBadge(tabId, null);
        }
      }
    });
  }
  
  // Lifecycle Management
  setupLifecycleHandlers() {
    // Handle extension install/update
    chrome.runtime.onInstalled.addListener((details) => {
      console.log('[BRA Background] Extension installed/updated:', details.reason);
      
      if (details.reason === 'install') {
        // Open welcome page or guide
        chrome.tabs.create({
          url: 'https://github.com/anthropics/business-registration-assistant'
        });
      }
    });
    
    // Handle suspension/wake
    chrome.runtime.onSuspend.addListener(() => {
      console.log('[BRA Background] Suspending...');
      // Could persist critical state here if needed
    });
  }
  
  // Health Monitoring
  setupHealthChecks() {
    // Periodic connection checks
    setInterval(() => {
      this.checkContentScriptConnections();
    }, 10000); // Every 10 seconds
    
    // Clean up old states
    setInterval(() => {
      this.cleanupOldStates();
    }, 60000); // Every minute
  }
  
  checkContentScriptConnections() {
    for (const [tabId, status] of this.contentScriptStatus) {
      if (Date.now() - status.lastSeen > 30000) {
        // Haven't heard from content script in 30 seconds
        this.updateContentScriptStatus(tabId, false);
      }
    }
  }
  
  cleanupOldStates() {
    const oneHourAgo = Date.now() - 3600000;
    
    for (const [tabId, state] of this.detectionStates) {
      if (state.timestamp < oneHourAgo) {
        this.detectionStates.delete(tabId);
      }
    }
  }
  
  // Content Script Management
  updateContentScriptStatus(tabId, isConnected) {
    this.contentScriptStatus.set(tabId, {
      isConnected: isConnected,
      lastSeen: Date.now()
    });
  }
  
  isContentScriptConnected(tabId) {
    const status = this.contentScriptStatus.get(tabId);
    if (!status) return false;
    
    // Consider connected if heard from in last 30 seconds
    return status.isConnected && (Date.now() - status.lastSeen < 30000);
  }
  
  async requestDetectionFromContentScript(tabId) {
    try {
      const response = await this.sendMessageToTab(tabId, {
        action: 'getDetection'
      }, 3000);
      
      if (response && response.success) {
        // Cache the detection
        this.detectionStates.set(tabId, {
          detection: response.detection,
          timestamp: Date.now(),
          fromContentScript: true
        });
        
        return {
          success: true,
          result: response.detection,
          isConnected: true
        };
      }
    } catch (error) {
      console.error(`[BRA Background] Failed to get detection from tab ${tabId}:`, error);
    }
    
    return {
      success: false,
      error: 'Could not retrieve detection',
      isConnected: false
    };
  }
  
  async sendMessageToTab(tabId, message, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Message timeout'));
      }, timeout);
      
      chrome.tabs.sendMessage(tabId, message, (response) => {
        clearTimeout(timeoutId);
        
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
  
  // UI Updates
  updateBadge(tabId, detection) {
    if (!detection) {
      chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }
    
    const { analysis } = detection;
    if (!analysis) return;
    
    if (analysis.isBusinessForm) {
      chrome.action.setBadgeText({ tabId, text: '✓' });
      chrome.action.setBadgeBackgroundColor({ 
        tabId, 
        color: analysis.confidence > 80 ? '#4CAF50' : '#FFC107' 
      });
    } else {
      chrome.action.setBadgeText({ tabId, text: '' });
    }
  }
  
  // Panel Communication
  async notifyPanel(action, data) {
    try {
      await chrome.runtime.sendMessage({
        action: action,
        ...data,
        timestamp: Date.now()
      });
    } catch (error) {
      // Panel might not be open, that's okay
    }
  }
  
  // Side Panel Setup
  setupSidePanel() {
    if (chrome.sidePanel) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        .catch(() => {
          // Side panel API might not be available
        });
    }
  }
}

// Initialize the self-healing background service
const background = new SelfHealingBackground();

// Make it available globally for debugging
self.braBackground = background;

console.log('[BRA Background] Self-healing background service started');