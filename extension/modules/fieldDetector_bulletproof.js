/**
 * Bulletproof Field Detector Module
 * Detects and analyzes form fields with complete context error handling
 */

// Context manager instance (will be injected or created)
let contextManager = null;

// Try to get context manager from global scope
if (typeof self !== 'undefined' && self.contextManager) {
  contextManager = self.contextManager;
}

// Inline context manager if not available
if (!contextManager) {
  class InlineContextManager {
    constructor() {
      this.isValid = true;
      this.cachedData = new Map();
    }
    
    checkContext() {
      try {
        this.isValid = typeof chrome !== 'undefined' && 
                     chrome?.runtime?.id !== undefined;
        return this.isValid;
      } catch (e) {
        this.isValid = false;
        return false;
      }
    }
    
    async safeCall(fn, fallback = null, options = {}) {
      if (!this.checkContext()) return fallback;
      
      try {
        const result = await fn();
        
        if (options.cache && options.cacheKey) {
          this.cachedData.set(options.cacheKey, {
            value: result,
            timestamp: Date.now()
          });
        }
        
        return result;
      } catch (error) {
        if (error.message?.includes('Extension context invalidated')) {
          this.isValid = false;
        }
        return fallback;
      }
    }
    
    createErrorBoundary(fn, name = 'Unknown') {
      return async (...args) => {
        try {
          return await fn(...args);
        } catch (error) {
          if (error.message?.includes('Extension context invalidated')) {
            console.log(`[BRA ${name}] Handling context error gracefully`);
            this.isValid = false;
            return null;
          }
          throw error;
        }
      };
    }
  }
  
  contextManager = new InlineContextManager();
}

/**
 * Bulletproof Field Detector Class
 */
class BulletproofFieldDetector {
  constructor(rootElement, options = {}) {
    this.root = rootElement || document;
    this.fields = [];
    this.sections = [];
    this.fieldSummary = {};
    this.options = {
      debug: options.debug || false,
      state: options.state || null
    };
    
    this.initialized = false;
    this.knowledgeLoader = null;
    this.fieldPatterns = this._getDefaultPatterns();
    
    // Wrap methods with error boundaries
    this.detectFields = contextManager.createErrorBoundary(
      this.detectFields.bind(this),
      'FieldDetector.detectFields'
    );
    
    this.initialize = contextManager.createErrorBoundary(
      this.initialize.bind(this),
      'FieldDetector.initialize'
    );
  }
  
  /**
   * Initialize the field detector
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      // Try to load knowledge loader
      await this._loadKnowledgeLoader();
      
      // Load field patterns
      await this._loadFieldPatterns();
      
      this.initialized = true;
      console.log('[BRA FieldDetector] Initialized successfully');
    } catch (error) {
      console.warn('[BRA FieldDetector] Initialization error:', error);
      // Continue with default patterns
      this.initialized = true;
    }
  }
  
  /**
   * Load knowledge loader module
   */
  async _loadKnowledgeLoader() {
    // Try to load with context manager
    this.knowledgeLoader = await contextManager.safeCall(
      async () => {
        const moduleUrl = chrome.runtime.getURL('modules/knowledgeLoader.js');
        const module = await import(moduleUrl);
        const loader = module.default || module.knowledgeLoader || module;
        
        // Initialize if needed
        if (loader && typeof loader.initialize === 'function') {
          await loader.initialize();
        }
        
        return loader;
      },
      null,
      { cache: true, cacheKey: 'knowledgeLoader' }
    );
    
    if (!this.knowledgeLoader) {
      console.log('[BRA FieldDetector] Using fallback patterns (no knowledge loader)');
    }
  }
  
  /**
   * Load field patterns
   */
  async _loadFieldPatterns() {
    if (this.knowledgeLoader) {
      const patterns = await contextManager.safeCall(
        async () => {
          const common = await this.knowledgeLoader.loadCommonPatterns();
          const state = this.options.state ? 
            await this.knowledgeLoader.loadStatePatterns(this.options.state) : 
            null;
          
          return this._mergePatterns(common, state);
        },
        null,
        { cache: true, cacheKey: `patterns_${this.options.state || 'default'}` }
      );
      
      if (patterns) {
        this.fieldPatterns = patterns;
        return;
      }
    }
    
    // Use default patterns
    this.fieldPatterns = this._getDefaultPatterns();
  }
  
  /**
   * Get default field patterns
   */
  _getDefaultPatterns() {
    return {
      business_name: {
        patterns: ['business.*name', 'company.*name', 'entity.*name', 'dba', 'trade.*name'],
        keywords: ['business', 'company', 'entity', 'corporation', 'llc', 'inc'],
        priority: 10
      },
      email: {
        patterns: ['email', 'e-mail', 'mail'],
        keywords: ['email', 'mail', 'contact'],
        priority: 8
      },
      phone: {
        patterns: ['phone', 'tel', 'mobile', 'cell'],
        keywords: ['phone', 'telephone', 'mobile', 'contact'],
        priority: 7
      },
      address: {
        patterns: ['address', 'street', 'location'],
        keywords: ['address', 'street', 'city', 'state', 'zip'],
        priority: 6
      },
      ein: {
        patterns: ['ein', 'fein', 'federal.*tax.*id', 'employer.*id'],
        keywords: ['ein', 'federal', 'tax', 'employer'],
        priority: 9
      },
      entity_type: {
        patterns: ['entity.*type', 'business.*type', 'organization.*type', 'structure'],
        keywords: ['llc', 'corporation', 'partnership', 'sole'],
        priority: 9
      }
    };
  }
  
  /**
   * Merge common and state patterns
   */
  _mergePatterns(common, state) {
    if (!state) return common || this._getDefaultPatterns();
    if (!common) return state;
    
    const merged = { ...common };
    
    for (const [key, statePattern] of Object.entries(state)) {
      if (merged[key]) {
        merged[key] = {
          ...merged[key],
          ...statePattern,
          patterns: [...new Set([
            ...(merged[key].patterns || []),
            ...(statePattern.patterns || [])
          ])],
          keywords: [...new Set([
            ...(merged[key].keywords || []),
            ...(statePattern.keywords || [])
          ])]
        };
      } else {
        merged[key] = statePattern;
      }
    }
    
    return merged;
  }
  
  /**
   * Detect all form fields
   */
  async detectFields() {
    // Ensure initialized
    if (!this.initialized) {
      await this.initialize();
    }
    
    this.fields = [];
    this.sections = [];
    
    // Find all input elements
    const inputs = this.root.querySelectorAll('input, select, textarea');
    
    // Process each input
    for (const input of inputs) {
      if (this._shouldSkipField(input)) continue;
      
      const field = await this._analyzeField(input);
      if (field) {
        this.fields.push(field);
      }
    }
    
    // Detect sections
    this._detectSections();
    
    // Calculate summary
    this._calculateSummary();
    
    // Analyze if this is a business form
    const analysis = this._analyzeFormType();
    
    return {
      fields: this.fields,
      sections: this.sections,
      summary: this.fieldSummary,
      isBusinessForm: analysis.isBusinessForm,
      confidence: analysis.confidence,
      state: analysis.state
    };
  }
  
  /**
   * Check if field should be skipped
   */
  _shouldSkipField(input) {
    // Skip hidden fields unless they might be important
    if (input.type === 'hidden') {
      const name = (input.name || '').toLowerCase();
      const importantHidden = ['csrf', 'token', 'state', 'step'];
      return !importantHidden.some(term => name.includes(term));
    }
    
    // Skip submit/reset buttons
    if (input.type === 'submit' || input.type === 'reset') {
      return true;
    }
    
    return false;
  }
  
  /**
   * Analyze a single field
   */
  async _analyzeField(input) {
    const field = {
      element: input,
      type: this._getFieldType(input),
      label: this._findFieldLabel(input),
      name: input.name || '',
      id: input.id || '',
      value: input.value || '',
      required: input.required || input.getAttribute('aria-required') === 'true',
      placeholder: input.placeholder || '',
      pattern: input.pattern || '',
      category: null,
      confidence: 0
    };
    
    // Classify the field
    const classification = this._classifyField(field);
    field.category = classification.category;
    field.confidence = classification.confidence;
    
    return field;
  }
  
  /**
   * Get field type
   */
  _getFieldType(input) {
    if (input.tagName.toLowerCase() === 'select') {
      return input.multiple ? 'multi_select' : 'select';
    }
    
    if (input.tagName.toLowerCase() === 'textarea') {
      return 'textarea';
    }
    
    return input.type || 'text';
  }
  
  /**
   * Find field label with multiple strategies
   */
  _findFieldLabel(input) {
    // Strategy 1: Explicit label with 'for' attribute
    if (input.id) {
      const label = this.root.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (label) {
        return this._cleanLabelText(label.textContent);
      }
    }
    
    // Strategy 2: Parent label
    const parentLabel = input.closest('label');
    if (parentLabel) {
      return this._cleanLabelText(parentLabel.textContent);
    }
    
    // Strategy 3: Aria-label
    if (input.getAttribute('aria-label')) {
      return input.getAttribute('aria-label').trim();
    }
    
    // Strategy 4: Aria-labelledby
    const labelledBy = input.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelElement = this.root.getElementById(labelledBy);
      if (labelElement) {
        return this._cleanLabelText(labelElement.textContent);
      }
    }
    
    // Strategy 5: Previous sibling text
    let sibling = input.previousElementSibling;
    while (sibling && sibling.nodeType === Node.ELEMENT_NODE) {
      if (sibling.tagName.toLowerCase() !== 'input' && 
          sibling.tagName.toLowerCase() !== 'br') {
        const text = this._cleanLabelText(sibling.textContent);
        if (text) return text;
      }
      sibling = sibling.previousElementSibling;
    }
    
    // Strategy 6: Parent container text
    const container = input.closest('div, td, li, section');
    if (container) {
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            const text = node.textContent.trim();
            if (text && !node.parentElement.matches('input, select, textarea')) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      
      const textNode = walker.nextNode();
      if (textNode) {
        return this._cleanLabelText(textNode.textContent);
      }
    }
    
    // Strategy 7: Placeholder as last resort
    if (input.placeholder) {
      return input.placeholder.trim();
    }
    
    // Strategy 8: Name attribute
    if (input.name) {
      return input.name
        .replace(/[-_]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .trim();
    }
    
    return 'Unknown Field';
  }
  
  /**
   * Clean label text
   */
  _cleanLabelText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/[:*]/g, '')
      .trim();
  }
  
  /**
   * Classify field based on patterns
   */
  _classifyField(field) {
    const text = [
      field.label,
      field.name,
      field.id,
      field.placeholder
    ].join(' ').toLowerCase();
    
    let bestMatch = { category: 'other', confidence: 0 };
    
    for (const [category, pattern] of Object.entries(this.fieldPatterns)) {
      let score = 0;
      
      // Check patterns
      if (pattern.patterns) {
        for (const p of pattern.patterns) {
          const regex = new RegExp(p, 'i');
          if (regex.test(text)) {
            score += 40;
          }
        }
      }
      
      // Check keywords
      if (pattern.keywords) {
        for (const keyword of pattern.keywords) {
          if (text.includes(keyword)) {
            score += 20;
          }
        }
      }
      
      // Apply priority
      if (pattern.priority) {
        score += pattern.priority;
      }
      
      // Check field type hints
      if (category === 'email' && field.type === 'email') {
        score += 50;
      } else if (category === 'phone' && field.type === 'tel') {
        score += 50;
      }
      
      if (score > bestMatch.confidence) {
        bestMatch = { category, confidence: Math.min(score, 100) };
      }
    }
    
    return bestMatch;
  }
  
  /**
   * Detect form sections
   */
  _detectSections() {
    const sectionElements = this.root.querySelectorAll('fieldset, section, .form-section, .form-group');
    
    this.sections = [];
    
    for (const element of sectionElements) {
      const title = this._findSectionTitle(element);
      const fieldsInSection = this.fields.filter(field => 
        element.contains(field.element)
      );
      
      if (fieldsInSection.length > 0) {
        this.sections.push({
          element: element,
          title: title,
          fields: fieldsInSection,
          fieldCount: fieldsInSection.length
        });
      }
    }
    
    // Create default section for ungrouped fields
    const groupedFields = new Set(
      this.sections.flatMap(s => s.fields.map(f => f.element))
    );
    
    const ungroupedFields = this.fields.filter(f => 
      !groupedFields.has(f.element)
    );
    
    if (ungroupedFields.length > 0) {
      this.sections.push({
        element: null,
        title: 'General Information',
        fields: ungroupedFields,
        fieldCount: ungroupedFields.length
      });
    }
  }
  
  /**
   * Find section title
   */
  _findSectionTitle(element) {
    // Check for legend
    const legend = element.querySelector('legend');
    if (legend) {
      return this._cleanLabelText(legend.textContent);
    }
    
    // Check for heading
    const heading = element.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      return this._cleanLabelText(heading.textContent);
    }
    
    // Check for title attribute
    if (element.getAttribute('title')) {
      return element.getAttribute('title').trim();
    }
    
    return 'Form Section';
  }
  
  /**
   * Calculate field summary
   */
  _calculateSummary() {
    this.fieldSummary = {
      total: this.fields.length,
      byType: {},
      byCategory: {},
      required: 0
    };
    
    for (const field of this.fields) {
      // Count by type
      this.fieldSummary.byType[field.type] = 
        (this.fieldSummary.byType[field.type] || 0) + 1;
      
      // Count by category
      this.fieldSummary.byCategory[field.category] = 
        (this.fieldSummary.byCategory[field.category] || 0) + 1;
      
      // Count required
      if (field.required) {
        this.fieldSummary.required++;
      }
    }
  }
  
  /**
   * Analyze if this is a business registration form
   */
  _analyzeFormType() {
    const businessCategories = [
      'business_name', 'ein', 'entity_type', 'business_address',
      'registered_agent', 'formation_date', 'business_purpose'
    ];
    
    let businessFieldCount = 0;
    let totalConfidence = 0;
    
    for (const field of this.fields) {
      if (businessCategories.includes(field.category)) {
        businessFieldCount++;
        totalConfidence += field.confidence;
      }
    }
    
    // Detect state from various sources
    const state = this._detectState();
    
    // Calculate form confidence
    const hasBusinessName = this.fields.some(f => f.category === 'business_name');
    const hasEntityType = this.fields.some(f => f.category === 'entity_type');
    const fieldRatio = businessFieldCount / Math.max(this.fields.length, 1);
    
    let confidence = 0;
    
    if (hasBusinessName) confidence += 40;
    if (hasEntityType) confidence += 30;
    if (businessFieldCount >= 3) confidence += 20;
    if (fieldRatio > 0.3) confidence += 10;
    
    return {
      isBusinessForm: confidence >= 50,
      confidence: Math.min(confidence, 100),
      state: state,
      businessFieldCount: businessFieldCount,
      fieldRatio: fieldRatio
    };
  }
  
  /**
   * Detect state from form
   */
  _detectState() {
    // Check URL
    const url = window.location.href.toLowerCase();
    const statePatterns = {
      'ca': ['california', '.ca.gov', 'business.ca.gov'],
      'ny': ['new york', 'newyork', '.ny.gov', 'businessexpress.ny.gov'],
      'tx': ['texas', '.tx.gov', 'texas.gov'],
      'fl': ['florida', '.fl.gov', 'sunbiz.org', 'dos.myflorida.com'],
      'de': ['delaware', '.de.gov', 'delaware.gov'],
      'dc': ['district of columbia', 'washington dc', '.dc.gov', 'mytax.dc.gov']
    };
    
    for (const [state, patterns] of Object.entries(statePatterns)) {
      if (patterns.some(p => url.includes(p))) {
        return state.toUpperCase();
      }
    }
    
    // Check form content
    const formText = this.root.textContent.toLowerCase();
    for (const [state, patterns] of Object.entries(statePatterns)) {
      if (patterns.some(p => formText.includes(p))) {
        return state.toUpperCase();
      }
    }
    
    return null;
  }
  
  /**
   * Get UI display data
   */
  getUIData() {
    const categories = {};
    
    // Group fields by category
    for (const field of this.fields) {
      const category = field.category || 'other';
      if (!categories[category]) {
        categories[category] = {
          name: this._formatCategoryName(category),
          fields: []
        };
      }
      
      categories[category].fields.push({
        label: field.label,
        type: field.type,
        required: field.required,
        confidence: field.confidence,
        element: field.element
      });
    }
    
    return {
      categories: categories,
      sections: this.sections.map(s => ({
        title: s.title,
        fieldCount: s.fieldCount
      })),
      summary: this.fieldSummary
    };
  }
  
  /**
   * Format category name for display
   */
  _formatCategoryName(category) {
    const names = {
      business_name: 'Business Name',
      entity_type: 'Entity Type',
      ein: 'EIN/Tax ID',
      business_address: 'Business Address',
      registered_agent: 'Registered Agent',
      email: 'Email',
      phone: 'Phone',
      address: 'Address',
      other: 'Other Fields'
    };
    
    return names[category] || category
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
}

// Export the bulletproof field detector
if (typeof module !== 'undefined' && module.exports) {
  module.exports = BulletproofFieldDetector;
} else {
  self.BulletproofFieldDetector = BulletproofFieldDetector;
}

// Also export as default for ES6 imports
export default BulletproofFieldDetector;