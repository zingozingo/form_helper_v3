/**
 * Field Detector Module
 * 
 * Detects and analyzes form fields on business registration forms.
 * Uses hybrid knowledge system with common patterns and state-specific overrides.
 */

// Import knowledge loader (will be loaded dynamically in extension context)
let knowledgeLoader = null;
let initializationPromise = null;
let initializationAttempted = false;

/**
 * Class for detecting and analyzing form fields
 */
class FieldDetector {
  /**
   * Create a new field detector
   * @param {HTMLElement|Document} rootElement - The root element to search within (form or document)
   * @param {Object} options - Configuration options
   * @param {boolean} options.debug - Whether to enable debug mode for extra logging
   * @param {string} options.state - State code for state-specific patterns
   */
  constructor(rootElement, options = {}) {
    this.root = rootElement || document;
    this.fields = [];
    this.fieldSummary = {};
    this.options = {
      debug: options.debug || false,
      state: options.state || null
    };
    
    // Initialize knowledge loader if available
    this._initializeKnowledgeLoader();
    
    // Field type mappings
    this.fieldTypes = {
      text: 'text',
      email: 'email',
      password: 'password',
      checkbox: 'checkbox',
      radio: 'radio',
      select: 'select',
      textarea: 'textarea',
      file: 'file',
      hidden: 'hidden',
      date: 'date',
      number: 'number',
      tel: 'tel',
      url: 'url',
      search: 'search',
      time: 'time',
      range: 'range',
      color: 'color',
      button: 'button',
      submit: 'submit',
      reset: 'reset',
      image: 'image',
      month: 'month',
      week: 'week',
      datetime: 'datetime',
      'datetime-local': 'datetime-local'
    };
    
    // Groups for field summary
    this.fieldGroups = {
      text: ['text', 'email', 'password', 'search', 'tel', 'url'],
      number: ['number', 'range'],
      date: ['date', 'datetime', 'datetime-local', 'month', 'week', 'time'],
      select: ['select'],
      checkbox: ['checkbox'],
      radio: ['radio'],
      file: ['file'],
      textarea: ['textarea'],
      button: ['button', 'submit', 'reset', 'image'],
      hidden: ['hidden'],
      other: []
    };
    
    // Field patterns (will be populated from knowledge loader)
    this.fieldPatterns = {};
    
    // Load field patterns
    this._loadFieldPatterns();
  }
  
  /**
   * Initialize the knowledge loader
   * @private
   */
  async _initializeKnowledgeLoader() {
    // Return existing promise if initialization is in progress
    if (initializationPromise) {
      return initializationPromise;
    }
    
    // Don't retry if already attempted and failed
    if (initializationAttempted && !knowledgeLoader) {
      return null;
    }
    
    initializationPromise = this._doInitialize();
    return initializationPromise;
  }
  
  async _doInitialize() {
    initializationAttempted = true;
    
    try {
      // Try different loading methods based on context
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        try {
          // Method 1: Try dynamic import first (preferred)
          const moduleUrl = chrome.runtime.getURL('modules/knowledgeLoader.js');
          const module = await import(moduleUrl);
          knowledgeLoader = module.default || module.knowledgeLoader || module;
          
          console.log('[BRA-FieldDetector] Knowledge loader loaded via dynamic import');
          console.log('[BRA-FieldDetector] Module type:', typeof module);
          console.log('[BRA-FieldDetector] Module keys:', Object.keys(module || {}));
          console.log('[BRA-FieldDetector] KnowledgeLoader type:', typeof knowledgeLoader);
          console.log('[BRA-FieldDetector] KnowledgeLoader keys:', Object.keys(knowledgeLoader || {}));
        } catch (importError) {
          console.warn('[BRA-FieldDetector] Dynamic import failed, trying fetch method');
          console.warn('Import error:', importError.message);
          
          // Method 2: Fallback to fetch and eval
          const scriptUrl = chrome.runtime.getURL('modules/knowledgeLoader.js');
          const response = await fetch(scriptUrl);
          
          if (!response.ok) {
            throw new Error('Failed to fetch knowledge loader: ' + response.status);
          }
          
          const scriptText = await response.text();
          
          // Create a more robust module loader
          try {
            // Create a module scope
            const moduleScope = {};
            const wrappedCode = [
              '(function(exports) {',
              scriptText,
              '\nif (typeof knowledgeLoader !== "undefined") {',
              '  exports.knowledgeLoader = knowledgeLoader;',
              '}',
              '})(arguments[0]);'
            ].join('\n');
            
            // Execute in isolated scope
            const executeModule = new Function(wrappedCode);
            executeModule(moduleScope);
            
            // Extract the loader
            knowledgeLoader = moduleScope.knowledgeLoader;
            
            console.log('[BRA-FieldDetector] Knowledge loader loaded via fetch method');
            console.log('[BRA-FieldDetector] KnowledgeLoader type:', typeof knowledgeLoader);
            console.log('[BRA-FieldDetector] KnowledgeLoader keys:', Object.keys(knowledgeLoader || {}));
            console.log('[BRA-FieldDetector] Is KnowledgeLoader a class?:', knowledgeLoader && knowledgeLoader.constructor && knowledgeLoader.constructor.name);
          } catch (execError) {
            console.error('[BRA-FieldDetector] Failed to execute knowledge loader script');
            console.error('Execution error:', execError.message);
            throw execError;
          }
        }
        
        // Initialize the knowledge loader if it exists
        if (knowledgeLoader) {
          // Check if it's an instance with initialize method
          if (typeof knowledgeLoader.initialize === 'function') {
            await knowledgeLoader.initialize();
            console.log('[BRA-FieldDetector] Knowledge loader initialized successfully');
          } 
          // Check if it's a class that needs instantiation
          else if (typeof knowledgeLoader === 'function' && knowledgeLoader.prototype && knowledgeLoader.prototype.initialize) {
            console.log('[BRA-FieldDetector] Knowledge loader is a class, instantiating...');
            knowledgeLoader = new knowledgeLoader();
            await knowledgeLoader.initialize();
            console.log('[BRA-FieldDetector] Knowledge loader instantiated and initialized');
          }
          // Check for alternative method names
          else if (typeof knowledgeLoader.init === 'function') {
            await knowledgeLoader.init();
            console.log('[BRA-FieldDetector] Knowledge loader initialized using init() method');
          }
          else {
            console.warn('[BRA-FieldDetector] Knowledge loader loaded but no initialize method found');
            console.warn('[BRA-FieldDetector] Available methods:', Object.getOwnPropertyNames(knowledgeLoader).filter(prop => typeof knowledgeLoader[prop] === 'function'));
          }
        } else {
          console.error('[BRA-FieldDetector] Knowledge loader module not found');
          knowledgeLoader = null;
        }
      }
    } catch (error) {
      // Simple error logging
      console.error('[BRA-FieldDetector] Could not initialize knowledge loader');
      console.error('Error:', error.message);
      knowledgeLoader = null;
    } finally {
      initializationPromise = null;
    }
    
    return knowledgeLoader;
  }
  
  /**
   * Load field patterns from knowledge loader
   * @private
   */
  async _loadFieldPatterns() {
    try {
      if (knowledgeLoader && typeof knowledgeLoader.getFieldPatterns === 'function') {
        this.fieldPatterns = await knowledgeLoader.getFieldPatterns(this.options.state);
        console.log('[BRA-FieldDetector] Loaded field patterns', this.options.state ? `for state ${this.options.state}` : '(common)');
      } else {
        // Fallback patterns if knowledge loader not available
        this._loadFallbackPatterns();
      }
    } catch (error) {
      console.error('[BRA-FieldDetector] Error loading field patterns:', error);
      this._loadFallbackPatterns();
    }
  }
  
  /**
   * Load fallback patterns when knowledge loader is unavailable
   * @private
   */
  _loadFallbackPatterns() {
    this.fieldPatterns = {
      business_name: {
        patterns: ["business.*name", "company.*name", "entity.*name"],
        attributes: ["business", "company", "entity"],
        priority: 90
      },
      ein: {
        patterns: ["ein", "employer.*identification", "federal.*tax.*id"],
        attributes: ["ein", "fein"],
        priority: 95
      },
      email: {
        patterns: ["email", "e-mail"],
        attributes: ["email"],
        priority: 85
      },
      phone: {
        patterns: ["phone", "telephone"],
        attributes: ["phone", "tel"],
        priority: 85
      },
      entity_type: {
        patterns: ["entity.*type", "business.*type"],
        attributes: ["entity-type", "business-type"],
        priority: 85
      }
    };
  }

  /**
   * Find all input fields within the root element
   * @returns {Array} Array of field objects with their attributes
   */
  async detectFields() {
    try {
      console.log('[BRA-FieldDetector] Starting field detection');
      this.fields = [];
      this.fieldSummary = {};
      
      // Ensure patterns are loaded
      await this._loadFieldPatterns();
      
      // Initialize field summary
      Object.keys(this.fieldGroups).forEach(group => {
        this.fieldSummary[group] = 0;
      });
      
      // Get all input elements
      const inputElements = this.root.querySelectorAll('input, select, textarea');
      console.log(`[BRA-FieldDetector] Found ${inputElements.length} potential input elements`);
      
      // Process each input element
      inputElements.forEach((element, index) => {
        try {
          const field = this._extractFieldInfo(element);
          if (field) {
            // Add index for reference
            field.index = index;
            
            // Classify the field
            field.classification = this._classifyField(field);
            
            // Add field to collection
            this.fields.push(field);
            
            // Update field summary
            this._updateFieldSummary(field);
          }
        } catch (fieldError) {
          console.error('[BRA-FieldDetector] Error processing field:', fieldError);
        }
      });
      
      return this.fields;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error detecting fields:', error);
      return [];
    }
  }
  
  /**
   * Update the field summary count based on field type
   * @param {Object} field - The field object
   * @private
   */
  _updateFieldSummary(field) {
    try {
      // Find which group this field belongs to
      let groupFound = false;
      
      for (const [group, types] of Object.entries(this.fieldGroups)) {
        if (types.includes(field.type)) {
          this.fieldSummary[group]++;
          groupFound = true;
          break;
        }
      }
      
      // If no group matched, count as "other"
      if (!groupFound) {
        this.fieldSummary.other++;
      }
    } catch (error) {
      console.error('[BRA-FieldDetector] Error updating field summary:', error);
    }
  }

  /**
   * Extract field information from an input element
   * @param {HTMLElement} element - The input element
   * @returns {Object} Field information object
   * @private
   */
  _extractFieldInfo(element) {
    try {
      // Basic field properties
      const field = {
        element: element,
        tagName: element.tagName.toLowerCase(),
        type: element.type || element.tagName.toLowerCase(),
        id: element.id || '',
        name: element.name || '',
        value: element.value || '',
        placeholder: element.placeholder || '',
        required: element.required || false,
        disabled: element.disabled || false,
        classes: Array.from(element.classList || []),
        attributes: {},
        readOnly: element.readOnly || false,
        autocomplete: element.autocomplete || '',
        checked: element.checked || false
      };
      
      // Get all non-standard attributes
      Array.from(element.attributes || []).forEach(attr => {
        if (!['id', 'name', 'type', 'value', 'placeholder', 'required', 'disabled', 'class'].includes(attr.name)) {
          field.attributes[attr.name] = attr.value;
        }
      });
      
      // Get associated label
      field.label = this._findFieldLabel(element);
      
      return field;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error extracting field info:', error);
      return null;
    }
  }

  /**
   * Find a label associated with a field
   * @param {HTMLElement} element - The input element
   * @returns {Object} Label information or null if not found
   * @private
   */
  _findFieldLabel(element) {
    try {
      let labelText = '';
      let labelElement = null;
      
      // Method 1: Check for 'labels' collection (most reliable)
      if (element.labels && element.labels.length > 0) {
        labelElement = element.labels[0];
        labelText = labelElement.textContent.trim();
      } 
      
      // Method 2: Check for label[for="id"] with matching ID
      if (!labelText && element.id) {
        const labelFor = document.querySelector(`label[for="${element.id}"]`);
        if (labelFor) {
          labelElement = labelFor;
          labelText = labelFor.textContent.trim();
        }
      }
      
      // Method 3: Check for placeholder as a fallback
      if (!labelText && element.placeholder) {
        labelText = element.placeholder;
      }
      
      // If we found a label, return it
      if (labelText) {
        return {
          text: labelText,
          element: labelElement
        };
      }
      
      return null;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error finding label:', error);
      return null;
    }
  }

  /**
   * Get all detected fields
   * @returns {Array} Array of field objects
   */
  getFields() {
    return this.fields;
  }

  /**
   * Classify a single field by its purpose
   * @param {Object} field - The field to classify
   * @returns {Object|null} Classification information or null if unclassified
   * @private
   */
  _classifyField(field) {
    try {
      // Skip buttons and hidden fields
      if (!field || 
          this.fieldGroups.button.includes(field.type) || 
          field.type === 'hidden') {
        return null;
      }
      
      // Build match context for scoring
      const matchContext = {
        label: field.label?.text?.toLowerCase() || '',
        name: field.name?.toLowerCase() || '',
        id: field.id?.toLowerCase() || '',
        placeholder: field.placeholder?.toLowerCase() || '',
        type: field.type
      };
      
      let bestMatch = null;
      let bestScore = 0;
      
      // Check each field pattern
      for (const [fieldType, config] of Object.entries(this.fieldPatterns)) {
        let score = 0;
        let matchDetails = {
          patternMatches: 0,
          exactMatch: false,
          attributeMatch: false,
          stateSpecific: this.options.state && config.stateSpecific
        };
        
        // Check patterns against label (highest weight)
        if (matchContext.label && config.patterns) {
          for (const pattern of config.patterns) {
            const regex = new RegExp(pattern, 'i');
            if (regex.test(matchContext.label)) {
              score += 40;
              matchDetails.patternMatches++;
              if (matchContext.label === pattern.toLowerCase()) {
                matchDetails.exactMatch = true;
              }
            }
          }
        }
        
        // Check attribute patterns
        if (config.attributes) {
          for (const attr of config.attributes) {
            const attrRegex = new RegExp(`\\b${attr}\\b`, 'i');
            if (attrRegex.test(matchContext.name) || 
                attrRegex.test(matchContext.id) || 
                attrRegex.test(matchContext.placeholder)) {
              score += 20;
              matchDetails.attributeMatch = true;
              matchDetails.patternMatches++;
            }
          }
        }
        
        // Type matching bonus
        if (config.validation === 'select' && field.type === 'select') {
          score += 10;
        } else if (config.validation === field.type) {
          score += 5;
        }
        
        // Apply priority weighting
        if (config.priority) {
          score *= (config.priority / 100);
        }
        
        // Calculate confidence
        if (score > bestScore) {
          matchDetails.baseConfidence = Math.min(score, 100);
          const confidence = (knowledgeLoader && typeof knowledgeLoader.getFieldConfidence === 'function') ? 
            knowledgeLoader.getFieldConfidence(fieldType, matchDetails) : 
            matchDetails.baseConfidence;
          
          bestMatch = {
            category: fieldType,
            confidence: confidence,
            details: matchDetails
          };
          bestScore = score;
        }
      }
      
      // Return best match if confidence is sufficient
      return bestScore >= 20 ? bestMatch : null;
      
    } catch (error) {
      console.error('[BRA-FieldDetector] Error classifying field:', error);
      return null;
    }
  }

  /**
   * Get fields by classification category
   * @param {string} category - The category to filter by
   * @param {number} minConfidence - Minimum confidence threshold (0-100)
   * @returns {Array} Filtered fields
   */
  getFieldsByCategory(category, minConfidence = 0) {
    return this.fields.filter(field => 
      field.classification && 
      field.classification.category === category &&
      field.classification.confidence >= minConfidence
    );
  }
  
  /**
   * Update state context for field detection
   * @param {string} stateCode - Two-letter state code
   */
  async updateState(stateCode) {
    this.options.state = stateCode;
    await this._loadFieldPatterns();
  }
}

// Export the module
export default FieldDetector;