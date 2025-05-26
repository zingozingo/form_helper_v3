/**
 * Business Registration Assistant - Self-Sufficient Content Script
 * This bundled version includes all functionality and data inline,
 * eliminating dependencies on background scripts and dynamic imports.
 */

console.log('[BRA] Business Registration Assistant - Self-Sufficient Content Script Loading');

// ============================================================================
// BUNDLED KNOWLEDGE BASE
// ============================================================================

const BUNDLED_KNOWLEDGE = {
  // Common field patterns for business registration forms
  fieldPatterns: {
    // Business Information
    business_name: {
      patterns: ['business.*name', 'company.*name', 'entity.*name', 'organization.*name', 'dba', 'trade.*name'],
      confidence: 90,
      validation: { required: true, minLength: 3, maxLength: 250 }
    },
    entity_type: {
      patterns: ['entity.*type', 'business.*type', 'organization.*type', 'structure', 'business.*structure'],
      confidence: 85,
      validation: { required: true }
    },
    ein: {
      patterns: ['ein', 'employer.*identification', 'federal.*tax.*id', 'fein', 'tax.*id.*number'],
      confidence: 95,
      validation: { pattern: '^\\d{2}-?\\d{7}$', format: '00-0000000' }
    },
    
    // Contact Information
    first_name: {
      patterns: ['first.*name', 'fname', 'given.*name'],
      confidence: 90,
      validation: { required: true, minLength: 1, maxLength: 50 }
    },
    last_name: {
      patterns: ['last.*name', 'lname', 'surname', 'family.*name'],
      confidence: 90,
      validation: { required: true, minLength: 1, maxLength: 50 }
    },
    email: {
      patterns: ['email', 'e-mail', 'electronic.*mail'],
      confidence: 95,
      validation: { type: 'email', required: true }
    },
    phone: {
      patterns: ['phone', 'telephone', 'tel', 'mobile', 'cell'],
      confidence: 90,
      validation: { pattern: '^\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}$' }
    },
    
    // Address Fields
    address: {
      patterns: ['street.*address', 'address.*1', 'address(?!.*2)', 'street', 'mailing.*address'],
      confidence: 85,
      validation: { required: true, minLength: 5, maxLength: 100 }
    },
    address2: {
      patterns: ['address.*2', 'suite', 'apt', 'apartment', 'unit'],
      confidence: 80,
      validation: { maxLength: 50 }
    },
    city: {
      patterns: ['city', 'town', 'municipality'],
      confidence: 90,
      validation: { required: true, minLength: 2, maxLength: 50 }
    },
    state: {
      patterns: ['state', 'province'],
      confidence: 90,
      validation: { required: true }
    },
    zip: {
      patterns: ['zip', 'postal.*code', 'zipcode'],
      confidence: 90,
      validation: { pattern: '^\\d{5}(-\\d{4})?$' }
    }
  },
  
  // State-specific overrides
  stateOverrides: {
    CA: {
      business_name: {
        validation: { required: true, minLength: 1, maxLength: 200 }
      }
    },
    DC: {
      ein: {
        patterns: ['fein', 'federal.*employer.*identification', 'ein', 'tax.*id'],
        validation: { pattern: '^\\d{2}-?\\d{7}$', required: true }
      }
    },
    DE: {
      registered_agent: {
        patterns: ['registered.*agent', 'statutory.*agent', 'agent.*service.*process'],
        confidence: 90,
        validation: { required: true }
      }
    }
  },
  
  // Entity types
  entityTypes: {
    llc: ['llc', 'limited liability company', 'l.l.c.'],
    corporation: ['corporation', 'corp', 'incorporated', 'inc'],
    partnership: ['partnership', 'general partnership', 'gp'],
    sole_proprietorship: ['sole proprietorship', 'sole proprietor', 'individual'],
    nonprofit: ['nonprofit', 'non-profit', '501c3', '501(c)(3)']
  },
  
  // Form types
  formTypes: {
    entity_formation: ['articles of organization', 'certificate of formation', 'incorporation'],
    business_license: ['business license', 'business permit', 'operating permit'],
    tax_registration: ['tax registration', 'sales tax permit', 'employer registration'],
    foreign_qualification: ['foreign qualification', 'certificate of authority'],
    annual_report: ['annual report', 'biennial report', 'statement of information']
  }
};

// ============================================================================
// FIELD DETECTOR CLASS (BUNDLED)
// ============================================================================

class BundledFieldDetector {
  constructor(rootElement, options = {}) {
    this.root = rootElement || document;
    this.fields = [];
    this.options = {
      debug: options.debug || false,
      state: options.state || null
    };
    
    // Get patterns with state overrides applied
    this.fieldPatterns = this._getFieldPatterns();
  }
  
  _getFieldPatterns() {
    // Start with base patterns
    let patterns = { ...BUNDLED_KNOWLEDGE.fieldPatterns };
    
    // Apply state overrides if state is specified
    if (this.options.state && BUNDLED_KNOWLEDGE.stateOverrides[this.options.state]) {
      const stateOverrides = BUNDLED_KNOWLEDGE.stateOverrides[this.options.state];
      for (const [category, override] of Object.entries(stateOverrides)) {
        patterns[category] = { ...patterns[category], ...override };
      }
    }
    
    return patterns;
  }
  
  async detectFields() {
    this.fields = [];
    
    // Find all form elements
    const formElements = this._findFormElements();
    
    // Analyze each element
    for (const element of formElements) {
      const field = await this._analyzeField(element);
      if (field) {
        this.fields.push(field);
      }
    }
    
    return this.fields;
  }
  
  _findFormElements() {
    const selectors = [
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',
      'select',
      'textarea',
      'input[type="checkbox"]',
      'input[type="radio"]'
    ];
    
    return Array.from(this.root.querySelectorAll(selectors.join(', ')));
  }
  
  async _analyzeField(element) {
    // Skip if element is not visible
    if (!this._isVisible(element)) return null;
    
    // Get field information
    const field = {
      element: element,
      type: this._getFieldType(element),
      name: element.name || element.id || '',
      id: element.id || '',
      label: await this._findLabel(element),
      placeholder: element.placeholder || '',
      value: element.value || '',
      required: element.required || element.getAttribute('aria-required') === 'true',
      validation: {}
    };
    
    // Classify the field
    field.classification = this._classifyField(field);
    
    // Add validation rules
    if (field.classification) {
      const pattern = this.fieldPatterns[field.classification.category];
      if (pattern && pattern.validation) {
        field.validation = pattern.validation;
      }
    }
    
    return field;
  }
  
  _isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0';
  }
  
  _getFieldType(element) {
    if (element.tagName === 'SELECT') return 'select';
    if (element.tagName === 'TEXTAREA') return 'textarea';
    return element.type || 'text';
  }
  
  async _findLabel(element) {
    // Check for label element
    if (element.id) {
      const label = this.root.querySelector(`label[for="${element.id}"]`);
      if (label) return { text: label.textContent.trim(), element: label };
    }
    
    // Check for parent label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      return { text: parentLabel.textContent.trim(), element: parentLabel };
    }
    
    // Check for aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return { text: ariaLabel.trim(), element: null };
    
    // Check for nearby text
    const nearbyText = this._findNearbyText(element);
    if (nearbyText) return { text: nearbyText, element: null };
    
    return null;
  }
  
  _findNearbyText(element) {
    // Look for text in parent elements
    let parent = element.parentElement;
    let depth = 0;
    
    while (parent && depth < 3) {
      const text = Array.from(parent.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent.trim())
        .filter(text => text.length > 0)
        .join(' ');
      
      if (text) return text;
      
      parent = parent.parentElement;
      depth++;
    }
    
    return null;
  }
  
  _classifyField(field) {
    const searchText = [
      field.name,
      field.id,
      field.label?.text || '',
      field.placeholder
    ].join(' ').toLowerCase();
    
    let bestMatch = null;
    let highestConfidence = 0;
    
    // Check each category
    for (const [category, config] of Object.entries(this.fieldPatterns)) {
      for (const pattern of config.patterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(searchText)) {
          const confidence = config.confidence || 80;
          if (confidence > highestConfidence) {
            highestConfidence = confidence;
            bestMatch = {
              category: category,
              confidence: confidence,
              pattern: pattern
            };
          }
        }
      }
    }
    
    return bestMatch;
  }
  
  getUIData() {
    // Group fields by classification
    const categories = {};
    let totalFields = 0;
    let classifiedFields = 0;
    
    for (const field of this.fields) {
      totalFields++;
      
      if (field.classification) {
        classifiedFields++;
        const category = field.classification.category;
        if (!categories[category]) {
          categories[category] = [];
        }
        categories[category].push({
          label: field.label?.text || field.name || field.id || 'Unnamed field',
          confidence: field.classification.confidence,
          element: field.element
        });
      }
    }
    
    return {
      categories: categories,
      totalFields: totalFields,
      classifiedFields: classifiedFields,
      classificationRate: totalFields > 0 ? (classifiedFields / totalFields * 100).toFixed(1) : 0
    };
  }
}

// ============================================================================
// URL DETECTOR (BUNDLED)
// ============================================================================

class BundledURLDetector {
  static analyzeUrl(url) {
    const urlLower = url.toLowerCase();
    let score = 0;
    
    // Government domain check
    if (urlLower.includes('.gov')) {
      score += 30;
    }
    
    // Business registration keywords in URL
    const urlKeywords = [
      'business', 'register', 'registration', 'entity', 'formation',
      'incorporate', 'llc', 'corporation', 'license', 'permit',
      'tax', 'ein', 'employer', 'sos', 'secretary-of-state'
    ];
    
    for (const keyword of urlKeywords) {
      if (urlLower.includes(keyword)) {
        score += 15;
      }
    }
    
    // State-specific patterns
    const statePatterns = {
      'california': ['business.ca.gov', 'sos.ca.gov', 'taxes.cdtfa.ca.gov'],
      'delaware': ['corp.delaware.gov', 'revenue.delaware.gov'],
      'dc': ['mytax.dc.gov', 'dc.gov/business'],
      'newyork': ['businessexpress.ny.gov', 'tax.ny.gov'],
      'florida': ['sunbiz.org', 'floridarevenue.com']
    };
    
    for (const [state, patterns] of Object.entries(statePatterns)) {
      for (const pattern of patterns) {
        if (urlLower.includes(pattern)) {
          score += 25;
          break;
        }
      }
    }
    
    return {
      score: Math.min(score, 100),
      analysis: {
        isGovernment: urlLower.includes('.gov'),
        hasBusinessKeywords: score > 30
      }
    };
  }
  
  static identifyStateFromUrl(url) {
    const urlLower = url.toLowerCase();
    
    // Direct state mappings
    const stateMap = {
      'ca.gov': 'CA',
      'california': 'CA',
      'delaware': 'DE',
      'de.gov': 'DE',
      'dc.gov': 'DC',
      'mytax.dc.gov': 'DC',
      'ny.gov': 'NY',
      'newyork': 'NY',
      'fl.gov': 'FL',
      'florida': 'FL',
      'tx.gov': 'TX',
      'texas': 'TX'
    };
    
    for (const [pattern, state] of Object.entries(stateMap)) {
      if (urlLower.includes(pattern)) {
        return state;
      }
    }
    
    // Try to extract state code from URL path
    const statePattern = /\/(al|ak|az|ar|ca|co|ct|de|dc|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\//i;
    const match = url.match(statePattern);
    if (match) {
      return match[1].toUpperCase();
    }
    
    return null;
  }
}

// ============================================================================
// INLINE PANEL UI
// ============================================================================

class InlinePanelUI {
  constructor() {
    this.container = null;
    this.isMinimized = false;
    this.detectionResult = null;
  }
  
  create() {
    // Remove existing panel if any
    this.destroy();
    
    // Create container
    this.container = document.createElement('div');
    this.container.id = 'bra-inline-panel';
    this.container.className = 'bra-panel';
    
    // Add styles
    this.addStyles();
    
    // Create panel HTML
    this.container.innerHTML = `
      <div class="bra-panel-header">
        <div class="bra-panel-title">
          <span class="bra-icon">📋</span>
          Business Registration Assistant
        </div>
        <div class="bra-panel-controls">
          <button class="bra-minimize-btn" title="Minimize">_</button>
          <button class="bra-close-btn" title="Close">×</button>
        </div>
      </div>
      <div class="bra-panel-content">
        <div class="bra-status-section">
          <div class="bra-status-indicator">
            <span class="bra-status-icon">⏳</span>
            <span class="bra-status-text">Analyzing page...</span>
          </div>
        </div>
        <div class="bra-fields-section" style="display: none;">
          <h3>Detected Fields</h3>
          <div class="bra-fields-container"></div>
        </div>
        <div class="bra-actions-section" style="display: none;">
          <button class="bra-autofill-btn">Auto Fill Sample Data</button>
        </div>
      </div>
    `;
    
    // Add to page
    document.body.appendChild(this.container);
    
    // Setup event handlers
    this.setupEventHandlers();
  }
  
  addStyles() {
    if (document.getElementById('bra-inline-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'bra-inline-styles';
    style.textContent = `
      .bra-panel {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 320px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        color: #333;
      }
      
      .bra-panel.minimized {
        width: auto;
      }
      
      .bra-panel.minimized .bra-panel-content {
        display: none;
      }
      
      .bra-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #f5f5f5;
        border-bottom: 1px solid #e0e0e0;
        border-radius: 8px 8px 0 0;
        cursor: move;
      }
      
      .bra-panel-title {
        display: flex;
        align-items: center;
        font-weight: 600;
      }
      
      .bra-icon {
        margin-right: 8px;
        font-size: 18px;
      }
      
      .bra-panel-controls {
        display: flex;
        gap: 8px;
      }
      
      .bra-panel-controls button {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        color: #666;
        padding: 4px 8px;
        border-radius: 4px;
        transition: background-color 0.2s;
      }
      
      .bra-panel-controls button:hover {
        background-color: rgba(0, 0, 0, 0.1);
      }
      
      .bra-panel-content {
        padding: 16px;
        max-height: 500px;
        overflow-y: auto;
      }
      
      .bra-status-section {
        margin-bottom: 16px;
        padding: 12px;
        background: #f8f9fa;
        border-radius: 6px;
      }
      
      .bra-status-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .bra-status-icon {
        font-size: 20px;
      }
      
      .bra-status-text {
        font-weight: 500;
      }
      
      .bra-status-indicator.success .bra-status-icon {
        color: #4caf50;
      }
      
      .bra-status-indicator.not-detected .bra-status-icon {
        color: #ff9800;
      }
      
      .bra-status-indicator.error .bra-status-icon {
        color: #f44336;
      }
      
      .bra-fields-section h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        font-weight: 600;
      }
      
      .bra-field-category {
        margin-bottom: 12px;
        background: #f8f9fa;
        border-radius: 6px;
        padding: 8px 12px;
      }
      
      .bra-field-category-header {
        font-weight: 600;
        margin-bottom: 4px;
        text-transform: capitalize;
      }
      
      .bra-field-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 13px;
      }
      
      .bra-field-label {
        color: #666;
        flex: 1;
      }
      
      .bra-field-confidence {
        font-size: 12px;
        padding: 2px 6px;
        border-radius: 3px;
        background: #e0e0e0;
        color: #666;
      }
      
      .bra-field-confidence.high {
        background: #c8e6c9;
        color: #2e7d32;
      }
      
      .bra-field-confidence.medium {
        background: #fff3cd;
        color: #856404;
      }
      
      .bra-actions-section {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #e0e0e0;
      }
      
      .bra-autofill-btn {
        width: 100%;
        padding: 10px 16px;
        background: #2196f3;
        color: white;
        border: none;
        border-radius: 6px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .bra-autofill-btn:hover {
        background: #1976d2;
      }
      
      .bra-autofill-btn:disabled {
        background: #ccc;
        cursor: not-allowed;
      }
    `;
    
    document.head.appendChild(style);
  }
  
  setupEventHandlers() {
    // Close button
    this.container.querySelector('.bra-close-btn').addEventListener('click', () => {
      this.destroy();
    });
    
    // Minimize button
    this.container.querySelector('.bra-minimize-btn').addEventListener('click', () => {
      this.toggleMinimize();
    });
    
    // Auto-fill button
    const autofillBtn = this.container.querySelector('.bra-autofill-btn');
    if (autofillBtn) {
      autofillBtn.addEventListener('click', () => {
        this.handleAutoFill();
      });
    }
    
    // Make panel draggable
    this.makeDraggable();
  }
  
  makeDraggable() {
    const header = this.container.querySelector('.bra-panel-header');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    
    header.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      
      isDragging = true;
      initialX = e.clientX - this.container.offsetLeft;
      initialY = e.clientY - this.container.offsetTop;
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      
      this.container.style.left = currentX + 'px';
      this.container.style.top = currentY + 'px';
      this.container.style.right = 'auto';
    });
    
    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }
  
  toggleMinimize() {
    this.isMinimized = !this.isMinimized;
    this.container.classList.toggle('minimized', this.isMinimized);
  }
  
  updateStatus(result) {
    this.detectionResult = result;
    const statusIndicator = this.container.querySelector('.bra-status-indicator');
    const statusIcon = this.container.querySelector('.bra-status-icon');
    const statusText = this.container.querySelector('.bra-status-text');
    
    if (result.isBusinessRegistrationForm) {
      statusIndicator.className = 'bra-status-indicator success';
      statusIcon.textContent = '✅';
      statusText.textContent = `Business form detected (${result.confidenceScore}% confidence)`;
      
      // Show fields section
      this.container.querySelector('.bra-fields-section').style.display = 'block';
      this.container.querySelector('.bra-actions-section').style.display = 'block';
      
      // Update fields display
      if (result.fieldDetectionResults) {
        this.displayFields(result.fieldDetectionResults);
      }
    } else {
      statusIndicator.className = 'bra-status-indicator not-detected';
      statusIcon.textContent = '❌';
      statusText.textContent = 'Not a business registration form';
      
      // Hide fields section
      this.container.querySelector('.bra-fields-section').style.display = 'none';
      this.container.querySelector('.bra-actions-section').style.display = 'none';
    }
  }
  
  displayFields(fieldResults) {
    const container = this.container.querySelector('.bra-fields-container');
    container.innerHTML = '';
    
    if (!fieldResults.uiData || !fieldResults.uiData.categories) {
      container.innerHTML = '<p>No fields detected</p>';
      return;
    }
    
    // Display fields by category
    for (const [category, fields] of Object.entries(fieldResults.uiData.categories)) {
      const categoryEl = document.createElement('div');
      categoryEl.className = 'bra-field-category';
      
      const headerEl = document.createElement('div');
      headerEl.className = 'bra-field-category-header';
      headerEl.textContent = category.replace(/_/g, ' ');
      categoryEl.appendChild(headerEl);
      
      for (const field of fields) {
        const fieldEl = document.createElement('div');
        fieldEl.className = 'bra-field-item';
        
        const labelEl = document.createElement('span');
        labelEl.className = 'bra-field-label';
        labelEl.textContent = field.label;
        
        const confidenceEl = document.createElement('span');
        confidenceEl.className = 'bra-field-confidence';
        confidenceEl.textContent = field.confidence + '%';
        
        if (field.confidence >= 90) {
          confidenceEl.classList.add('high');
        } else if (field.confidence >= 70) {
          confidenceEl.classList.add('medium');
        }
        
        fieldEl.appendChild(labelEl);
        fieldEl.appendChild(confidenceEl);
        categoryEl.appendChild(fieldEl);
        
        // Add click handler to highlight field
        fieldEl.addEventListener('click', () => {
          this.highlightField(field.element);
        });
      }
      
      container.appendChild(categoryEl);
    }
  }
  
  highlightField(element) {
    if (!element) return;
    
    // Remove existing highlights
    document.querySelectorAll('.bra-highlighted').forEach(el => {
      el.classList.remove('bra-highlighted');
    });
    
    // Add highlight class
    element.classList.add('bra-highlighted');
    
    // Scroll into view
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Add highlight styles if not already added
    if (!document.getElementById('bra-highlight-styles')) {
      const style = document.createElement('style');
      style.id = 'bra-highlight-styles';
      style.textContent = `
        .bra-highlighted {
          outline: 3px solid #2196f3 !important;
          outline-offset: 2px !important;
          animation: bra-pulse 2s ease-in-out;
        }
        
        @keyframes bra-pulse {
          0% { outline-color: #2196f3; }
          50% { outline-color: #64b5f6; }
          100% { outline-color: #2196f3; }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Remove highlight after 3 seconds
    setTimeout(() => {
      element.classList.remove('bra-highlighted');
    }, 3000);
  }
  
  handleAutoFill() {
    if (!this.detectionResult || !this.detectionResult.fieldDetectionResults) {
      return;
    }
    
    const fillData = {
      // Business information
      business_name: 'Sample Business LLC',
      dba: 'Sample Trade Name',
      entity_type: 'Limited Liability Company',
      // Contact information
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@example.com',
      phone: '555-123-4567',
      // Address
      address: '123 Main Street',
      address2: 'Suite 100',
      city: 'Anytown',
      state: this.detectionResult.state || 'CA',
      zip: '12345',
      // Tax IDs
      ein: '12-3456789',
      ssn: '123-45-6789'
    };
    
    let filledCount = 0;
    const fields = this.detectionResult.fieldDetectionResults.fields || [];
    
    for (const field of fields) {
      if (field.classification && fillData[field.classification.category]) {
        const value = fillData[field.classification.category];
        if (field.element && !field.element.value && !field.element.disabled) {
          field.element.value = value;
          field.element.dispatchEvent(new Event('input', { bubbles: true }));
          field.element.dispatchEvent(new Event('change', { bubbles: true }));
          filledCount++;
          
          // Highlight filled field briefly
          this.highlightField(field.element);
        }
      }
    }
    
    // Update button text temporarily
    const btn = this.container.querySelector('.bra-autofill-btn');
    const originalText = btn.textContent;
    btn.textContent = `Filled ${filledCount} fields!`;
    btn.disabled = true;
    
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  }
  
  destroy() {
    if (this.container) {
      this.container.remove();
      this.container = null;
    }
  }
}

// ============================================================================
// MAIN DETECTION LOGIC
// ============================================================================

class BusinessFormDetector {
  constructor() {
    this.detectionResult = null;
    this.panelUI = null;
    this.isDetecting = false;
  }
  
  async detectBusinessForm() {
    if (this.isDetecting) return;
    
    this.isDetecting = true;
    console.log('[BRA] Starting business form detection...');
    
    try {
      // Get current URL
      const currentUrl = window.location.href;
      
      // Analyze URL
      const urlAnalysis = BundledURLDetector.analyzeUrl(currentUrl);
      const urlScore = urlAnalysis.score;
      
      // Identify state
      const state = BundledURLDetector.identifyStateFromUrl(currentUrl);
      
      // Analyze page content
      const contentScore = this.analyzePageContent();
      
      // Detect and analyze form fields
      const fieldDetector = new BundledFieldDetector(document, { state: state });
      const fields = await fieldDetector.detectFields();
      const uiData = fieldDetector.getUIData();
      
      // Calculate form score
      let formScore = 0;
      const forms = document.querySelectorAll('form');
      formScore += forms.length * 10;
      formScore += Math.min(uiData.classifiedFields * 5, 50);
      
      // Calculate final confidence score
      const confidenceScore = Math.round(
        (urlScore * 0.3 + contentScore * 0.3 + formScore * 0.4)
      );
      
      // Determine if this is a business form
      const isBusinessForm = confidenceScore >= 50 || 
                            (uiData.classifiedFields >= 5 && state);
      
      // Create detection result
      this.detectionResult = {
        isBusinessRegistrationForm: isBusinessForm,
        confidenceScore: confidenceScore,
        state: state,
        url: currentUrl,
        timestamp: new Date().toISOString(),
        fieldDetectionResults: {
          fields: fields,
          uiData: uiData
        },
        scores: {
          url: urlScore,
          content: contentScore,
          form: formScore
        }
      };
      
      console.log('[BRA] Detection complete:', {
        isBusinessForm,
        confidenceScore,
        state,
        fieldsDetected: fields.length,
        classifiedFields: uiData.classifiedFields
      });
      
      // Show inline panel if business form detected
      if (isBusinessForm) {
        this.showInlinePanel();
      }
      
    } catch (error) {
      console.error('[BRA] Detection error:', error);
      this.detectionResult = {
        isBusinessRegistrationForm: false,
        confidenceScore: 0,
        error: error.message
      };
    } finally {
      this.isDetecting = false;
    }
  }
  
  analyzePageContent() {
    try {
      let score = 0;
      const pageText = document.body?.textContent?.toLowerCase() || '';
      
      // Check for business registration keywords
      const keywords = [
        'business registration', 'register business', 'form llc', 'incorporate',
        'entity formation', 'business license', 'ein', 'employer identification',
        'articles of organization', 'certificate of formation', 'register your business',
        'start a business', 'business entity', 'tax registration', 'sales tax permit'
      ];
      
      for (const keyword of keywords) {
        if (pageText.includes(keyword)) {
          score += 10;
        }
      }
      
      // Check headings for business terms
      const headings = document.querySelectorAll('h1, h2, h3');
      for (const heading of headings) {
        const text = heading.textContent.toLowerCase();
        if (/business|registration|entity|formation|incorporate/.test(text)) {
          score += 15;
        }
      }
      
      // Check for form-specific indicators
      const formIndicators = [
        'required field', 'all fields marked', 'submit application',
        'filing fee', 'processing time', 'next step', 'continue'
      ];
      
      for (const indicator of formIndicators) {
        if (pageText.includes(indicator)) {
          score += 5;
        }
      }
      
      return Math.min(score, 100);
    } catch (error) {
      console.error('[BRA] Content analysis error:', error);
      return 0;
    }
  }
  
  showInlinePanel() {
    if (!this.panelUI) {
      this.panelUI = new InlinePanelUI();
    }
    
    this.panelUI.create();
    this.panelUI.updateStatus(this.detectionResult);
  }
  
  async waitForPageReady() {
    return new Promise((resolve) => {
      // Check if page is already loaded
      if (document.readyState === 'complete') {
        // Wait a bit for dynamic content
        setTimeout(resolve, 500);
        return;
      }
      
      // Wait for page load
      window.addEventListener('load', () => {
        // Additional delay for dynamic content
        setTimeout(resolve, 500);
      });
    });
  }
  
  async initialize() {
    console.log('[BRA] Initializing Business Registration Assistant...');
    
    // Wait for page to be ready
    await this.waitForPageReady();
    
    // Run detection
    await this.detectBusinessForm();
    
    // Set up URL change detection
    this.setupUrlChangeDetection();
  }
  
  setupUrlChangeDetection() {
    let lastUrl = location.href;
    
    const checkUrlChange = () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        console.log('[BRA] URL changed, re-running detection...');
        
        // Clear previous results
        this.detectionResult = null;
        if (this.panelUI) {
          this.panelUI.destroy();
          this.panelUI = null;
        }
        
        // Re-run detection
        this.detectBusinessForm();
      }
    };
    
    // Listen for various navigation events
    window.addEventListener('popstate', checkUrlChange);
    
    // Override pushState and replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    
    history.pushState = function() {
      originalPushState.apply(history, arguments);
      setTimeout(checkUrlChange, 0);
    };
    
    history.replaceState = function() {
      originalReplaceState.apply(history, arguments);
      setTimeout(checkUrlChange, 0);
    };
    
    // Also use MutationObserver for SPA navigation
    const observer = new MutationObserver(() => {
      checkUrlChange();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
}

// ============================================================================
// MESSAGE HANDLING (OPTIONAL - FOR POPUP/BACKGROUND COMMUNICATION)
// ============================================================================

// Listen for messages but don't depend on them
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[BRA] Message received:', message.action);
  
  try {
    if (message.action === 'getDetectionResult') {
      sendResponse(detector.detectionResult || {
        isBusinessRegistrationForm: false,
        error: 'No detection result available'
      });
    }
    else if (message.action === 'triggerDetection') {
      detector.detectBusinessForm().then(() => {
        sendResponse({
          success: true,
          result: detector.detectionResult
        });
      });
      return true; // Keep channel open for async response
    }
    else if (message.action === 'ping') {
      sendResponse({
        alive: true,
        timestamp: Date.now()
      });
    }
  } catch (error) {
    console.error('[BRA] Message handler error:', error);
    sendResponse({
      error: error.message
    });
  }
  
  return false;
});

// ============================================================================
// INITIALIZATION
// ============================================================================

console.log('[BRA] Business Registration Assistant - Self-Sufficient Version');
console.log('[BRA] URL:', window.location.href);
console.log('[BRA] No external dependencies required!');

// Create and initialize detector
const detector = new BusinessFormDetector();
detector.initialize();

// Expose for debugging
window.BRA_DEBUG = {
  detector: detector,
  getResult: () => detector.detectionResult,
  redetect: () => detector.detectBusinessForm(),
  showPanel: () => detector.showInlinePanel()
};

console.log('[BRA] Ready! Debug available at window.BRA_DEBUG');