/**
 * Panel Script with Instant Navigation Support
 * Provides seamless UI updates during navigation
 */

class InstantNavigationPanel {
  constructor() {
    this.currentTabId = null;
    this.currentDetection = null;
    this.isNavigating = false;
    this.progressiveUpdates = [];
    this.elements = {};
    
    this.initialize();
  }
  
  initialize() {
    console.log('[BRA Panel] Initializing instant navigation panel');
    
    // Cache DOM elements
    this.cacheElements();
    
    // Set up message listeners
    this.setupMessageListeners();
    
    // Set up tab monitoring
    this.setupTabMonitoring();
    
    // Notify background that panel is open
    chrome.runtime.sendMessage({ action: 'panelOpened' });
  }
  
  cacheElements() {
    this.elements = {
      confidenceBar: document.getElementById('confidence-bar-top'),
      confidenceText: document.getElementById('confidence-text'),
      fieldsList: document.getElementById('fields-list'),
      fieldsSection: document.getElementById('fields-section'),
      noDetection: document.getElementById('no-detection'),
      mainContent: document.getElementById('main-content'),
      errorContainer: document.getElementById('error-container')
    };
  }
  
  setupMessageListeners() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'navigationIntent':
          this.handleNavigationIntent(message);
          break;
          
        case 'instantCleanup':
          this.handleInstantCleanup(message);
          break;
          
        case 'progressiveUpdate':
          this.handleProgressiveUpdate(message);
          break;
          
        case 'detectionComplete':
          this.handleDetectionComplete(message);
          break;
      }
      
      sendResponse({ received: true });
    });
  }
  
  setupTabMonitoring() {
    // Get current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        this.currentTabId = tabs[0].id;
        this.loadDetection(tabs[0].id);
      }
    });
    
    // Monitor tab changes
    chrome.tabs.onActivated.addListener((activeInfo) => {
      this.currentTabId = activeInfo.tabId;
      this.loadDetection(activeInfo.tabId);
    });
  }
  
  handleNavigationIntent(message) {
    if (message.tabId !== this.currentTabId) return;
    
    console.log('[BRA Panel] Navigation intent received:', message.intent);
    
    // Set navigating state
    this.isNavigating = true;
    
    // Instant UI update - show detecting state
    this.showDetectingState();
    
    // Clear fields instantly
    this.clearFieldsInstantly();
  }
  
  handleInstantCleanup(message) {
    if (message.tabId !== this.currentTabId) return;
    
    console.log('[BRA Panel] Instant cleanup:', message.reason);
    
    // Clear everything immediately
    this.clearAllInstantly();
  }
  
  handleProgressiveUpdate(message) {
    if (message.tabId !== this.currentTabId) return;
    
    console.log('[BRA Panel] Progressive update:', message.results.phase);
    
    // Store progressive update
    this.progressiveUpdates.push(message.results);
    
    // Update UI progressively
    this.updateUIProgressive(message.results);
  }
  
  handleDetectionComplete(message) {
    if (message.tabId !== this.currentTabId) return;
    
    console.log('[BRA Panel] Detection complete');
    
    // Clear navigating state
    this.isNavigating = false;
    
    // Final UI update
    this.updateUIComplete(message.results);
  }
  
  showDetectingState() {
    // Update confidence meter instantly
    if (this.elements.confidenceBar) {
      this.elements.confidenceBar.style.width = '0%';
      this.elements.confidenceBar.className = 'confidence-bar-top';
    }
    
    if (this.elements.confidenceText) {
      this.elements.confidenceText.textContent = 'Detecting new form...';
      this.elements.confidenceText.style.animation = 'pulse 1s infinite';
    }
  }
  
  clearFieldsInstantly() {
    // Fade out fields quickly
    if (this.elements.fieldsList) {
      this.elements.fieldsList.style.opacity = '0.3';
      this.elements.fieldsList.style.transition = 'opacity 0.1s ease-out';
      
      // Clear after fade
      setTimeout(() => {
        this.elements.fieldsList.innerHTML = '<div class="detecting-message">Analyzing new page...</div>';
        this.elements.fieldsList.style.opacity = '1';
      }, 100);
    }
  }
  
  clearAllInstantly() {
    // Hide detection info
    if (this.elements.fieldsSection) {
      this.elements.fieldsSection.style.display = 'none';
    }
    
    // Show no detection
    if (this.elements.noDetection) {
      this.elements.noDetection.style.display = 'block';
    }
    
    // Reset confidence
    if (this.elements.confidenceBar) {
      this.elements.confidenceBar.style.width = '0%';
    }
    
    if (this.elements.confidenceText) {
      this.elements.confidenceText.textContent = 'No form detected';
      this.elements.confidenceText.style.animation = '';
    }
  }
  
  updateUIProgressive(results) {
    const { phase, confidence, fieldCount, fields } = results;
    
    // Update confidence progressively
    if (this.elements.confidenceBar && confidence) {
      this.elements.confidenceBar.style.width = `${confidence}%`;
      this.elements.confidenceBar.style.transition = 'width 0.2s ease-out';
      
      // Update color based on confidence
      if (confidence >= 80) {
        this.elements.confidenceBar.className = 'confidence-bar-top high';
      } else if (confidence >= 60) {
        this.elements.confidenceBar.className = 'confidence-bar-top medium';
      } else {
        this.elements.confidenceBar.className = 'confidence-bar-top low';
      }
    }
    
    // Update text based on phase
    if (this.elements.confidenceText) {
      switch (phase) {
        case 'instant':
          this.elements.confidenceText.textContent = `Found ${fieldCount} fields...`;
          break;
        case 'fast':
          this.elements.confidenceText.textContent = `Analyzing ${fieldCount} fields...`;
          break;
        case 'complete':
          this.elements.confidenceText.textContent = `${confidence}% confidence`;
          this.elements.confidenceText.style.animation = '';
          break;
      }
    }
    
    // Update fields progressively
    if (phase === 'instant' && fields && fields.length > 0) {
      this.showInitialFields(fields);
    } else if (phase === 'fast' && fields) {
      this.updateFields(fields);
    }
  }
  
  showInitialFields(fields) {
    if (!this.elements.fieldsList) return;
    
    // Show detection section
    if (this.elements.noDetection) {
      this.elements.noDetection.style.display = 'none';
    }
    if (this.elements.fieldsSection) {
      this.elements.fieldsSection.style.display = 'block';
    }
    
    // Show initial fields with fade-in
    this.elements.fieldsList.innerHTML = '';
    this.elements.fieldsList.style.opacity = '0';
    
    fields.slice(0, 5).forEach((field, index) => {
      const fieldElement = this.createFieldElement(field);
      fieldElement.style.opacity = '0';
      fieldElement.style.transform = 'translateY(10px)';
      this.elements.fieldsList.appendChild(fieldElement);
      
      // Stagger animations
      setTimeout(() => {
        fieldElement.style.transition = 'all 0.2s ease-out';
        fieldElement.style.opacity = '1';
        fieldElement.style.transform = 'translateY(0)';
      }, index * 50);
    });
    
    this.elements.fieldsList.style.opacity = '1';
  }
  
  updateFields(fields) {
    if (!this.elements.fieldsList) return;
    
    // Clear and update with all fields
    this.elements.fieldsList.innerHTML = '';
    
    // Group fields by category
    const grouped = this.groupFieldsByCategory(fields);
    
    Object.entries(grouped).forEach(([category, categoryFields]) => {
      // Add section header
      const header = document.createElement('div');
      header.className = 'field-section-header';
      header.textContent = this.formatCategoryName(category);
      this.elements.fieldsList.appendChild(header);
      
      // Add fields
      categoryFields.forEach(field => {
        const fieldElement = this.createFieldElement(field);
        this.elements.fieldsList.appendChild(fieldElement);
      });
    });
  }
  
  createFieldElement(field) {
    const div = document.createElement('div');
    div.className = 'field-item';
    
    const label = document.createElement('div');
    label.className = 'field-label';
    label.textContent = field.label || 'Unknown Field';
    
    const type = document.createElement('div');
    type.className = `field-type ${field.category || 'other'}`;
    type.textContent = field.category || field.type || 'field';
    
    div.appendChild(label);
    div.appendChild(type);
    
    return div;
  }
  
  groupFieldsByCategory(fields) {
    const grouped = {};
    
    fields.forEach(field => {
      const category = field.category || 'other';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(field);
    });
    
    return grouped;
  }
  
  formatCategoryName(category) {
    const names = {
      business_name: 'Business Information',
      tax_id: 'Tax Information',
      email: 'Contact Details',
      phone: 'Phone Numbers',
      address: 'Addresses',
      entity_type: 'Entity Type',
      other: 'Other Fields'
    };
    
    return names[category] || category;
  }
  
  updateUIComplete(results) {
    // Final update with complete results
    this.currentDetection = results;
    
    // Clear progressive updates
    this.progressiveUpdates = [];
    
    // Show final state
    if (results.isBusinessForm) {
      this.showBusinessFormDetected(results);
    } else {
      this.showNoBusinessForm();
    }
  }
  
  showBusinessFormDetected(results) {
    console.log('[BRA Panel] Business form detected with confidence:', results.confidence);
    
    // Update all UI elements with final state
    if (this.elements.confidenceText) {
      this.elements.confidenceText.textContent = `${results.confidence}% confidence`;
    }
    
    // Update fields with complete data
    if (results.fields) {
      this.updateFields(results.fields);
    }
  }
  
  showNoBusinessForm() {
    console.log('[BRA Panel] No business form detected');
    
    if (this.elements.confidenceText) {
      this.elements.confidenceText.textContent = 'Not a business form';
    }
  }
  
  async loadDetection(tabId) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'getDetectionResult',
        tabId: tabId
      });
      
      if (response.success) {
        if (response.navigating) {
          this.showDetectingState();
        } else if (response.result) {
          this.updateUIComplete(response.result);
        } else {
          this.clearAllInstantly();
        }
      }
    } catch (error) {
      console.error('[BRA Panel] Error loading detection:', error);
    }
  }
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.6; }
    100% { opacity: 1; }
  }
  
  .detecting-message {
    text-align: center;
    color: #666;
    padding: 20px;
    font-style: italic;
  }
  
  .field-item {
    transition: all 0.2s ease-out;
  }
  
  .confidence-bar-top {
    transition: width 0.3s ease-out, background-color 0.3s ease-out;
  }
`;
document.head.appendChild(style);

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new InstantNavigationPanel();
  });
} else {
  new InstantNavigationPanel();
}