/**
 * Background Script with Instant Navigation Support
 * Handles pre-emptive cleanup and progressive detection updates
 */

class InstantNavigationBackground {
  constructor() {
    this.detectionStates = new Map(); // tabId -> detection state
    this.navigationStates = new Map(); // tabId -> navigation state
    this.progressiveDetections = new Map(); // tabId -> progressive results
    this.panelConnections = new Set(); // Active panel connections
    
    this.initialize();
  }
  
  initialize() {
    console.log('[BRA Background] Initializing instant navigation support');
    
    // Set up message handlers
    this.setupMessageHandlers();
    
    // Set up tab handlers
    this.setupTabHandlers();
  }
  
  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      const tabId = sender.tab?.id;
      
      switch (message.action) {
        case 'navigationIntent':
          this.handleNavigationIntent(tabId, message);
          sendResponse({ received: true });
          break;
          
        case 'instantCleanup':
          this.handleInstantCleanup(tabId, message);
          sendResponse({ received: true });
          break;
          
        case 'progressiveDetection':
          this.handleProgressiveDetection(tabId, message);
          sendResponse({ received: true });
          break;
          
        case 'detectionUpdate':
          this.handleDetectionUpdate(tabId, message);
          sendResponse({ received: true });
          break;
          
        case 'ping':
          sendResponse({ alive: true, timestamp: Date.now() });
          break;
          
        case 'getDetectionResult':
          this.handleGetDetectionResult(message.tabId || tabId, sendResponse);
          return true; // Async response
          
        case 'panelOpened':
          this.handlePanelOpened(message, sender);
          sendResponse({ received: true });
          break;
          
        default:
          sendResponse({ error: 'Unknown action' });
      }
    });
  }
  
  setupTabHandlers() {
    // Clean up on tab removal
    chrome.tabs.onRemoved.addListener((tabId) => {
      this.cleanupTab(tabId);
    });
    
    // Monitor tab updates
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'loading') {
        // Tab is navigating
        this.handleTabNavigation(tabId, tab.url);
      }
    });
  }
  
  handleNavigationIntent(tabId, message) {
    console.log(`[BRA Background] Navigation intent for tab ${tabId}:`, message.intent);
    
    // Update navigation state
    this.navigationStates.set(tabId, {
      intent: message.intent,
      timestamp: message.timestamp,
      fromUrl: message.currentUrl
    });
    
    // Notify panel immediately
    this.notifyPanel({
      action: 'navigationIntent',
      tabId: tabId,
      intent: message.intent,
      timestamp: message.timestamp
    });
    
    // Pre-emptively clear detection state
    this.clearDetectionState(tabId);
    
    // Update badge to show detecting
    this.updateBadge(tabId, 'detecting');
  }
  
  handleInstantCleanup(tabId, message) {
    console.log(`[BRA Background] Instant cleanup for tab ${tabId}:`, message.reason);
    
    // Clear all states immediately
    this.clearDetectionState(tabId);
    this.progressiveDetections.delete(tabId);
    
    // Notify panel to clear UI instantly
    this.notifyPanel({
      action: 'instantCleanup',
      tabId: tabId,
      reason: message.reason,
      timestamp: message.timestamp
    });
  }
  
  handleProgressiveDetection(tabId, message) {
    console.log(`[BRA Background] Progressive detection for tab ${tabId}:`, message.results.phase);
    
    // Store progressive results
    if (!this.progressiveDetections.has(tabId)) {
      this.progressiveDetections.set(tabId, []);
    }
    
    const progressive = this.progressiveDetections.get(tabId);
    progressive.push(message.results);
    
    // Update detection state with latest results
    this.updateDetectionState(tabId, message.results);
    
    // Notify panel of progressive update
    this.notifyPanel({
      action: 'progressiveUpdate',
      tabId: tabId,
      results: message.results,
      timestamp: message.timestamp
    });
    
    // Update badge based on confidence
    if (message.results.confidence >= 60) {
      this.updateBadge(tabId, 'detected', message.results.confidence);
    }
  }
  
  handleDetectionUpdate(tabId, message) {
    console.log(`[BRA Background] Detection update for tab ${tabId}`);
    
    // Store complete detection
    this.detectionStates.set(tabId, {
      results: message.results,
      trigger: message.trigger,
      url: message.url,
      timestamp: message.timestamp
    });
    
    // Clear navigation state
    this.navigationStates.delete(tabId);
    
    // Notify panel
    this.notifyPanel({
      action: 'detectionComplete',
      tabId: tabId,
      results: message.results,
      trigger: message.trigger,
      timestamp: message.timestamp
    });
  }
  
  handleGetDetectionResult(tabId, sendResponse) {
    const detection = this.detectionStates.get(tabId);
    const progressive = this.progressiveDetections.get(tabId);
    const navigating = this.navigationStates.has(tabId);
    
    if (detection) {
      sendResponse({
        success: true,
        result: detection.results,
        progressive: progressive,
        navigating: navigating,
        timestamp: detection.timestamp
      });
    } else if (progressive && progressive.length > 0) {
      // Return latest progressive result
      const latest = progressive[progressive.length - 1];
      sendResponse({
        success: true,
        result: latest,
        progressive: true,
        navigating: navigating,
        timestamp: latest.timestamp
      });
    } else {
      sendResponse({
        success: false,
        error: 'No detection available',
        navigating: navigating
      });
    }
  }
  
  handlePanelOpened(message, sender) {
    console.log('[BRA Background] Panel opened');
    
    // Track panel connection
    if (sender.tab) {
      this.panelConnections.add(sender.tab.id);
    }
  }
  
  handleTabNavigation(tabId, newUrl) {
    // Only handle if we don't already have a navigation intent
    if (!this.navigationStates.has(tabId)) {
      console.log(`[BRA Background] Tab ${tabId} navigating to ${newUrl}`);
      
      // Simulate navigation intent
      this.handleNavigationIntent(tabId, {
        intent: { type: 'browser-navigation' },
        timestamp: Date.now(),
        currentUrl: newUrl
      });
    }
  }
  
  clearDetectionState(tabId) {
    this.detectionStates.delete(tabId);
    this.updateBadge(tabId, 'none');
  }
  
  updateDetectionState(tabId, results) {
    const current = this.detectionStates.get(tabId);
    
    if (!current || results.confidence > (current.results?.confidence || 0)) {
      this.detectionStates.set(tabId, {
        results: results,
        timestamp: Date.now()
      });
    }
  }
  
  updateBadge(tabId, state, confidence = 0) {
    switch (state) {
      case 'detecting':
        chrome.action.setBadgeText({ tabId, text: '...' });
        chrome.action.setBadgeBackgroundColor({ tabId, color: '#FFC107' });
        break;
        
      case 'detected':
        chrome.action.setBadgeText({ tabId, text: '✓' });
        chrome.action.setBadgeBackgroundColor({ 
          tabId, 
          color: confidence >= 80 ? '#4CAF50' : '#FFC107' 
        });
        break;
        
      case 'none':
      default:
        chrome.action.setBadgeText({ tabId, text: '' });
        break;
    }
  }
  
  notifyPanel(message) {
    // Send to all extensions pages (panel, popup, etc.)
    chrome.runtime.sendMessage(message).catch(() => {
      // Panel might not be open
    });
  }
  
  cleanupTab(tabId) {
    this.detectionStates.delete(tabId);
    this.navigationStates.delete(tabId);
    this.progressiveDetections.delete(tabId);
    this.panelConnections.delete(tabId);
    
    console.log(`[BRA Background] Cleaned up tab ${tabId}`);
  }
}

// Initialize
const instantNavBackground = new InstantNavigationBackground();

// Expose for debugging
self.instantNavBackground = instantNavBackground;

console.log('[BRA Background] Instant navigation background ready');