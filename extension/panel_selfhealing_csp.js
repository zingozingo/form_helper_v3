/**
 * Self-Healing Panel Script - CSP Compliant
 * UI that gracefully handles disconnections without inline styles
 */

class SelfHealingPanel {
  constructor() {
    this.currentTabId = null;
    this.lastDetection = null;
    this.isConnected = true;
    this.reconnectTimer = null;
    this.elements = {};
    
    this.initialize();
  }
  
  async initialize() {
    console.log('[BRA Panel] Initializing self-healing panel (CSP compliant)');
    
    // Cache DOM elements
    this.cacheElements();
    
    // Set up connection monitoring
    this.startConnectionMonitoring();
    
    // Set up message listeners
    this.setupMessageListeners();
    
    // Set up UI event handlers
    this.setupUIHandlers();
    
    // Get current tab and load detection
    await this.loadCurrentTab();
  }
  
  cacheElements() {
    this.elements = {
      status: document.getElementById('status'),
      connectionIndicator: document.getElementById('connection-indicator'),
      formName: document.getElementById('form-name'),
      confidenceMeter: document.getElementById('confidence-meter'),
      confidenceText: document.getElementById('confidence-text'),
      stateInfo: document.getElementById('state-info'),
      fieldsList: document.getElementById('fields-list'),
      fieldCount: document.getElementById('field-count'),
      autoFillBtn: document.getElementById('auto-fill-btn'),
      refreshBtn: document.getElementById('refresh-btn'),
      noDetection: document.getElementById('no-detection'),
      detectionInfo: document.getElementById('detection-info'),
      lastUpdate: document.getElementById('last-update')
    };
    
    // Add connection indicator if not present
    if (!this.elements.connectionIndicator) {
      this.createConnectionIndicator();
    }
  }
  
  createConnectionIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'connection-indicator';
    indicator.className = 'connection-indicator connected';
    indicator.title = 'Extension connected';
    
    // Add to status bar or header
    const header = document.querySelector('.panel-header') || document.body;
    header.appendChild(indicator);
    
    this.elements.connectionIndicator = indicator;
  }
  
  // Connection Management
  startConnectionMonitoring() {
    // Check connection immediately
    this.checkConnection();
    
    // Regular connection checks
    setInterval(() => {
      this.checkConnection();
    }, 3000);
  }
  
  async checkConnection() {
    try {
      const response = await this.sendMessage({ action: 'ping' }, 1000);
      
      if (response && response.alive) {
        if (!this.isConnected) {
          console.log('[BRA Panel] Connection restored');
          this.handleReconnection();
        }
      } else {
        if (this.isConnected) {
          console.log('[BRA Panel] Connection lost');
          this.handleDisconnection();
        }
      }
    } catch (error) {
      if (this.isConnected) {
        this.handleDisconnection();
      }
    }
  }
  
  handleDisconnection() {
    this.isConnected = false;
    this.updateConnectionStatus(false);
    
    // Show offline message
    this.showStatus('Extension disconnected - operating in offline mode', 'warning');
  }
  
  handleReconnection() {
    this.isConnected = true;
    this.updateConnectionStatus(true);
    
    // Refresh detection
    if (this.currentTabId) {
      this.loadDetection(this.currentTabId);
    }
    
    this.showStatus('Connection restored', 'success');
  }
  
  updateConnectionStatus(connected) {
    if (this.elements.connectionIndicator) {
      this.elements.connectionIndicator.className = `connection-indicator ${connected ? 'connected' : 'disconnected'}`;
      this.elements.connectionIndicator.title = connected ? 'Extension connected' : 'Extension disconnected';
    }
    
    // Update UI elements
    if (this.elements.autoFillBtn) {
      this.elements.autoFillBtn.disabled = !connected;
    }
  }
  
  // Message Handling
  async sendMessage(message, timeout = 5000) {
    if (!chrome.runtime?.id) {
      return null;
    }
    
    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(null), timeout);
      
      try {
        chrome.runtime.sendMessage(message, (response) => {
          clearTimeout(timeoutId);
          
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
      } catch (e) {
        clearTimeout(timeoutId);
        resolve(null);
      }
    });
  }
  
  setupMessageListeners() {
    // Only set up if we have valid context
    if (!chrome.runtime?.id) return;
    
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleIncomingMessage(message);
    });
  }
  
  handleIncomingMessage(message) {
    switch (message.action) {
      case 'detectionUpdated':
        if (message.tabId === this.currentTabId) {
          this.updateDetection(message.detection);
        }
        break;
        
      case 'detectionSynced':
        if (message.tabId === this.currentTabId) {
          this.updateDetection(message.detection);
          this.showStatus('Detection synced after reconnection', 'info');
        }
        break;
    }
  }
  
  // Tab and Detection Management
  async loadCurrentTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (tabs && tabs[0]) {
        this.currentTabId = tabs[0].id;
        await this.loadDetection(this.currentTabId);
      }
    } catch (error) {
      console.error('[BRA Panel] Failed to get current tab:', error);
      this.showError('Failed to load current tab');
    }
  }
  
  async loadDetection(tabId) {
    try {
      const response = await this.sendMessage({
        action: 'getDetectionResult',
        tabId: tabId
      });
      
      if (response && response.success && response.result) {
        this.lastDetection = response.result;
        this.updateDetection(response.result);
        
        if (!response.isConnected) {
          this.showStatus('Showing cached detection (content script offline)', 'info');
        }
      } else {
        this.showNoDetection();
        
        if (response && !response.isConnected) {
          this.showStatus('Content script not connected - try refreshing the page', 'warning');
        }
      }
    } catch (error) {
      console.error('[BRA Panel] Failed to load detection:', error);
      this.showError('Failed to load form detection');
    }
  }
  
  // UI Updates - CSP Compliant
  updateDetection(detection) {
    if (!detection) {
      this.showNoDetection();
      return;
    }
    
    this.lastDetection = detection;
    
    // Show detection info using classes
    this.elements.noDetection.classList.add('hidden');
    this.elements.detectionInfo.classList.remove('hidden');
    
    // Update form analysis
    const { analysis, fields, sections } = detection;
    
    if (analysis) {
      this.elements.formName.textContent = analysis.isBusinessForm ? 
        'Business Registration Form Detected' : 
        'Form Detected (Not Business Registration)';
      
      // Update confidence bar using classes
      this.updateConfidenceBar(analysis.confidence);
      this.elements.confidenceText.textContent = `${analysis.confidence}% confidence`;
      
      if (analysis.state) {
        this.elements.stateInfo.textContent = `State: ${analysis.state}`;
        this.elements.stateInfo.classList.remove('hidden');
      } else {
        this.elements.stateInfo.classList.add('hidden');
      }
    }
    
    // Update fields list
    this.updateFieldsList(fields || []);
    
    // Update field count
    this.elements.fieldCount.textContent = `${fields?.length || 0} fields detected`;
    
    // Update last update time
    if (detection.timestamp) {
      const time = new Date(detection.timestamp).toLocaleTimeString();
      this.elements.lastUpdate.textContent = `Last updated: ${time}`;
    }
  }
  
  updateConfidenceBar(confidence) {
    // Remove all confidence classes
    for (let i = 0; i <= 100; i += 10) {
      this.elements.confidenceMeter.classList.remove(`confidence-${i}`);
    }
    
    // Add the appropriate confidence class
    const roundedConfidence = Math.round(confidence / 10) * 10;
    this.elements.confidenceMeter.classList.add(`confidence-${roundedConfidence}`);
  }
  
  updateFieldsList(fields) {
    this.elements.fieldsList.innerHTML = '';
    
    // Group fields by category
    const categories = {};
    
    fields.forEach(field => {
      const category = field.category || 'other';
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(field);
    });
    
    // Display fields by category
    Object.entries(categories).forEach(([category, categoryFields]) => {
      if (categoryFields.length === 0) return;
      
      const section = document.createElement('div');
      section.className = 'field-section';
      
      const header = document.createElement('h3');
      header.className = 'field-section-header';
      header.textContent = this.formatCategoryName(category);
      section.appendChild(header);
      
      categoryFields.forEach(field => {
        const fieldElement = this.createFieldElement(field);
        section.appendChild(fieldElement);
      });
      
      this.elements.fieldsList.appendChild(section);
    });
  }
  
  createFieldElement(field) {
    const div = document.createElement('div');
    div.className = 'field-item';
    
    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = field.label || 'Unknown Field';
    
    const confidence = document.createElement('span');
    confidence.className = 'field-confidence';
    confidence.textContent = `${field.confidence}%`;
    label.appendChild(confidence);
    
    div.appendChild(label);
    
    if (field.value) {
      const value = document.createElement('div');
      value.className = 'field-value';
      value.textContent = field.value;
      div.appendChild(value);
    }
    
    // Add click handler to highlight field
    div.addEventListener('click', () => {
      this.highlightField(field);
    });
    
    return div;
  }
  
  formatCategoryName(category) {
    const names = {
      business_name: 'Business Information',
      entity_type: 'Entity Type',
      ein: 'Tax Information',
      email: 'Contact Information',
      phone: 'Phone Numbers',
      address: 'Addresses',
      registered_agent: 'Registered Agent',
      other: 'Other Fields'
    };
    
    return names[category] || category;
  }
  
  showNoDetection() {
    this.elements.detectionInfo.classList.add('hidden');
    this.elements.noDetection.classList.remove('hidden');
  }
  
  showStatus(message, type = 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status status-${type}`;
    this.elements.status.classList.remove('hidden');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.elements.status.classList.add('hidden');
    }, 5000);
  }
  
  showError(message) {
    this.showStatus(message, 'error');
  }
  
  // UI Event Handlers
  setupUIHandlers() {
    // Refresh button
    if (this.elements.refreshBtn) {
      this.elements.refreshBtn.addEventListener('click', () => {
        this.refreshDetection();
      });
    }
    
    // Auto-fill button
    if (this.elements.autoFillBtn) {
      this.elements.autoFillBtn.addEventListener('click', () => {
        this.autoFillFields();
      });
    }
  }
  
  async refreshDetection() {
    if (!this.currentTabId) return;
    
    this.showStatus('Refreshing detection...', 'info');
    
    try {
      // Send message to content script to trigger detection
      const response = await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'triggerDetection'
      });
      
      if (response && response.success) {
        // Wait a bit for detection to complete
        setTimeout(() => {
          this.loadDetection(this.currentTabId);
        }, 1000);
      } else {
        this.showError('Failed to trigger detection');
      }
    } catch (error) {
      console.error('[BRA Panel] Failed to refresh:', error);
      this.showError('Content script not responding - try refreshing the page');
    }
  }
  
  async autoFillFields() {
    if (!this.isConnected) {
      this.showError('Cannot auto-fill while disconnected');
      return;
    }
    
    this.showStatus('Auto-fill feature coming soon!', 'info');
  }
  
  async highlightField(field) {
    if (!this.currentTabId) return;
    
    try {
      await chrome.tabs.sendMessage(this.currentTabId, {
        action: 'highlightField',
        fieldId: field.id || field.name
      });
    } catch (error) {
      // Field highlighting is optional
    }
  }
}

// Initialize panel when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new SelfHealingPanel();
  });
} else {
  new SelfHealingPanel();
}