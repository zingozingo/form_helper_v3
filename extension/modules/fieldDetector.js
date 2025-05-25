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
      const startTime = performance.now();
      console.log('%c[BRA-FieldDetector] Starting field detection', 'color: blue; font-weight: bold');
      console.log('==================== FIELD DETECTION START ====================');
      
      this.fields = [];
      this.fieldSummary = {};
      this.classificationSummary = this._initClassificationSummary();
      
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
            const classificationStart = performance.now();
            field.classification = this._classifyField(field);
            field.classificationTime = performance.now() - classificationStart;
            
            // Add field to collection
            this.fields.push(field);
            
            // Update field summary
            this._updateFieldSummary(field);
            
            // Update classification summary
            this._updateClassificationSummary(field);
            
            // Log detailed info for first 5 fields
            if (index < 5) {
              this._logFieldDetails(field, index);
            }
          }
        } catch (fieldError) {
          console.error('[BRA-FieldDetector] Error processing field:', fieldError);
        }
      });
      
      // Calculate performance metrics
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Generate comprehensive summary
      const summary = this._generateComprehensiveSummary(totalTime);
      
      // Log the summary
      this._logComprehensiveSummary(summary);
      
      // Perform validation checks
      const validation = this._performValidationChecks();
      this._logValidationResults(validation);
      
      // Determine readiness
      const readiness = this._checkReadiness(summary, validation);
      this._logReadinessCheck(readiness);
      
      // Call the callback if provided (for content script context)
      if (this.options.onDetectionComplete && typeof this.options.onDetectionComplete === 'function') {
        console.log('[BRA-FieldDetector] Calling onDetectionComplete callback');
        
        const detectionData = {
          state: this.options.state || 'Unknown',
          confidence: readiness.score, // Use readiness score as overall confidence
          readinessScore: readiness.score,
          validationScore: validation.score,
          avgFieldConfidence: summary.summary.avgConfidence,
          isDetected: readiness.score > 0,
          criticalFieldsFound: readiness.criticalFieldsFound,
          categoryCount: readiness.categoryCount,
          totalFields: this.fields.length,
          classifiedFields: summary.summary.classified,
          fields: summary.summary.classified
        };
        
        // Call the callback with detection data
        this.options.onDetectionComplete(detectionData);
      }
      
      // Also try direct messaging if available (fallback)
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        console.log('[BRA-FieldDetector] Attempting direct message send (fallback)');
        
        const panelUpdate = {
          type: 'updateDetection',
          isDetected: true,
          state: this.options.state || 'DC',
          confidence: readiness.score || validation.score,
          fields: summary.summary.classified
        };
        
        try {
          chrome.runtime.sendMessage(panelUpdate, function(response) {
            if (chrome.runtime.lastError) {
              console.error('[BRA-FieldDetector] Fallback message error (expected in module context):', chrome.runtime.lastError);
            } else {
              console.log('[BRA-FieldDetector] Fallback message sent');
            }
          });
        } catch (error) {
          console.error('[BRA-FieldDetector] Fallback message exception (expected in module context):', error);
        }
      }
      
      console.log('==================== FIELD DETECTION END ====================');
      
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
  
  /**
   * Initialize classification summary structure
   * @private
   */
  _initClassificationSummary() {
    return {
      total: 0,
      classified: 0,
      unclassified: 0,
      avgConfidence: 0,
      byCategory: {},
      byType: {},
      lowConfidence: [],
      unclassified: [],
      duplicates: {},
      suspicious: [],
      criticalFields: {
        business_name: null,
        ein: null,
        entity_type: null
      }
    };
  }
  
  /**
   * Update classification summary with field data
   * @private
   */
  _updateClassificationSummary(field) {
    this.classificationSummary.total++;
    
    // Track by type
    if (!this.classificationSummary.byType[field.type]) {
      this.classificationSummary.byType[field.type] = [];
    }
    this.classificationSummary.byType[field.type].push(field);
    
    if (field.classification) {
      this.classificationSummary.classified++;
      
      // Track by category
      const category = field.classification.category;
      if (!this.classificationSummary.byCategory[category]) {
        this.classificationSummary.byCategory[category] = [];
      }
      this.classificationSummary.byCategory[category].push(field);
      
      // Track low confidence
      if (field.classification.confidence < 70) {
        this.classificationSummary.lowConfidence.push(field);
      }
      
      // Track critical fields
      if (category === 'business_name' || category === 'ein' || category === 'entity_type') {
        this.classificationSummary.criticalFields[category] = field;
      }
      
      // Check for duplicates
      if (this.classificationSummary.byCategory[category].length > 1) {
        if (!this.classificationSummary.duplicates[category]) {
          this.classificationSummary.duplicates[category] = [];
        }
        this.classificationSummary.duplicates[category] = this.classificationSummary.byCategory[category];
      }
    } else {
      this.classificationSummary.unclassified.push(field);
    }
    
    // Check for suspicious fields
    if (field.type === 'password' || 
        (field.name && field.name.toLowerCase().includes('password')) ||
        (field.id && field.id.toLowerCase().includes('password'))) {
      this.classificationSummary.suspicious.push({
        field: field,
        reason: 'Password field on business form'
      });
    }
  }
  
  /**
   * Log detailed field information
   * @private
   */
  _logFieldDetails(field, index) {
    console.group(`%c[Field ${index + 1}] Detailed Analysis`, 'color: purple; font-weight: bold');
    
    console.log('Basic Info:', {
      type: field.type,
      name: field.name,
      id: field.id,
      required: field.required
    });
    
    console.log('Label:', {
      original: field.label?.text || 'No label',
      cleaned: field.label?.text?.toLowerCase().trim() || 'N/A'
    });
    
    console.log('HTML Attributes:', {
      placeholder: field.placeholder || 'None',
      autocomplete: field.autocomplete || 'None',
      additionalAttrs: field.attributes
    });
    
    if (field.classification) {
      console.log('%cClassification Result:', 'color: green', {
        category: field.classification.category,
        confidence: `${field.classification.confidence}%`,
        details: field.classification.details
      });
      console.log('Classification Time:', `${field.classificationTime.toFixed(2)}ms`);
    } else {
      console.log('%cClassification Result: UNCLASSIFIED', 'color: red');
      console.log('Reason: No patterns matched with sufficient confidence');
    }
    
    console.groupEnd();
  }
  
  /**
   * Generate comprehensive summary
   * @private
   */
  _generateComprehensiveSummary(totalTime) {
    // Calculate average confidence
    let totalConfidence = 0;
    let classifiedCount = 0;
    
    this.fields.forEach(field => {
      if (field.classification) {
        totalConfidence += field.classification.confidence;
        classifiedCount++;
      }
    });
    
    this.classificationSummary.avgConfidence = classifiedCount > 0 ? 
      Math.round(totalConfidence / classifiedCount) : 0;
    
    return {
      summary: {
        total: this.classificationSummary.total,
        classified: this.classificationSummary.classified,
        unclassified: this.classificationSummary.unclassified.length,
        avgConfidence: this.classificationSummary.avgConfidence,
        classificationRate: Math.round((this.classificationSummary.classified / this.classificationSummary.total) * 100)
      },
      byCategory: this.classificationSummary.byCategory,
      byType: this.classificationSummary.byType,
      lowConfidence: this.classificationSummary.lowConfidence,
      unclassified: this.classificationSummary.unclassified,
      performance: {
        totalTime: `${totalTime.toFixed(2)}ms`,
        avgTimePerField: `${(totalTime / this.classificationSummary.total).toFixed(2)}ms`
      },
      issues: {
        duplicates: this.classificationSummary.duplicates,
        suspicious: this.classificationSummary.suspicious
      }
    };
  }
  
  /**
   * Log comprehensive summary
   * @private
   */
  _logComprehensiveSummary(summary) {
    console.group('%c[CLASSIFICATION SUMMARY]', 'color: blue; font-weight: bold; font-size: 14px');
    
    // Overall stats
    console.log('%cOverall Statistics:', 'font-weight: bold');
    console.table(summary.summary);
    
    // Category breakdown
    console.log('%cFields by Category:', 'font-weight: bold');
    const categoryTable = {};
    Object.entries(summary.byCategory).forEach(([category, fields]) => {
      categoryTable[category] = {
        count: fields.length,
        avgConfidence: Math.round(
          fields.reduce((sum, f) => sum + f.classification.confidence, 0) / fields.length
        ),
        fields: fields.map(f => f.label?.text || f.name || f.id).join(', ')
      };
    });
    console.table(categoryTable);
    
    // Type breakdown
    console.log('%cFields by Type:', 'font-weight: bold');
    const typeTable = {};
    Object.entries(summary.byType).forEach(([type, fields]) => {
      typeTable[type] = {
        count: fields.length,
        classified: fields.filter(f => f.classification).length,
        unclassified: fields.filter(f => !f.classification).length
      };
    });
    console.table(typeTable);
    
    // Low confidence fields
    if (summary.lowConfidence.length > 0) {
      console.log('%cLow Confidence Fields (< 70%):', 'color: orange; font-weight: bold');
      summary.lowConfidence.forEach(field => {
        console.log(`- ${field.label?.text || field.name}: ${field.classification.category} (${field.classification.confidence}%)`);
      });
    }
    
    // Unclassified fields
    if (summary.unclassified.length > 0) {
      console.log('%cUnclassified Fields:', 'color: red; font-weight: bold');
      summary.unclassified.forEach(field => {
        console.log(`- ${field.label?.text || field.name || field.id} (${field.type})`);
      });
    }
    
    // Performance metrics
    console.log('%cPerformance Metrics:', 'font-weight: bold');
    console.table(summary.performance);
    
    // Issues
    if (Object.keys(summary.issues.duplicates).length > 0) {
      console.log('%cDuplicate Classifications:', 'color: orange; font-weight: bold');
      console.log(summary.issues.duplicates);
    }
    
    if (summary.issues.suspicious.length > 0) {
      console.log('%cSuspicious Fields:', 'color: red; font-weight: bold');
      console.table(summary.issues.suspicious);
    }
    
    console.groupEnd();
  }
  
  /**
   * Perform validation checks
   * @private
   */
  _performValidationChecks() {
    const checks = [
      {
        name: 'Business/Legal Name field classified as business_name',
        test: () => {
          const field = this.fields.find(f => 
            f.label?.text?.toLowerCase().includes('business') && 
            f.label?.text?.toLowerCase().includes('name')
          );
          return field && field.classification?.category === 'business_name';
        }
      },
      {
        name: 'Organization Type dropdown classified as entity_type',
        test: () => {
          const field = this.fields.find(f => 
            (f.label?.text?.toLowerCase().includes('organization type') ||
             f.label?.text?.toLowerCase().includes('entity type')) &&
            f.type === 'select'
          );
          return !field || field.classification?.category === 'entity_type';
        }
      },
      {
        name: 'FEIN/EIN field classified as ein or tax_id',
        test: () => {
          const field = this.fields.find(f => 
            f.label?.text?.toLowerCase().match(/fein|ein|employer.*identification/)
          );
          return !field || ['ein', 'tax_id'].includes(field.classification?.category);
        }
      },
      {
        name: 'DC-specific fields recognized (if DC form)',
        test: () => {
          if (this.options.state !== 'DC') return true;
          const dcField = this.fields.find(f => 
            f.label?.text?.toLowerCase().includes('clean hands') ||
            f.label?.text?.toLowerCase().includes('dcra')
          );
          return !dcField || dcField.classification !== null;
        }
      },
      {
        name: 'Address fields properly identified',
        test: () => {
          const addressFields = this.fields.filter(f => 
            f.label?.text?.toLowerCase().match(/street|address|city|state|zip/)
          );
          const classifiedAddress = addressFields.filter(f => 
            f.classification?.category?.includes('address') ||
            f.classification?.category === 'city' ||
            f.classification?.category === 'state' ||
            f.classification?.category === 'zip'
          );
          return addressFields.length === 0 || classifiedAddress.length > 0;
        }
      },
      {
        name: 'Required fields marked appropriately',
        test: () => {
          const requiredFields = this.fields.filter(f => f.required);
          const classifiedRequired = requiredFields.filter(f => f.classification);
          return requiredFields.length === 0 || 
                 (classifiedRequired.length / requiredFields.length) >= 0.8;
        }
      }
    ];
    
    const results = checks.map(check => ({
      ...check,
      passed: check.test()
    }));
    
    return {
      checks: results,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
      score: Math.round((results.filter(r => r.passed).length / results.length) * 100)
    };
  }
  
  /**
   * Log validation results
   * @private
   */
  _logValidationResults(validation) {
    console.group('%c[VALIDATION CHECKS]', 'color: purple; font-weight: bold; font-size: 14px');
    
    validation.checks.forEach(check => {
      const icon = check.passed ? '✅' : '❌';
      const color = check.passed ? 'green' : 'red';
      console.log(`%c${icon} ${check.name}`, `color: ${color}`);
    });
    
    console.log('\n%cValidation Score:', 'font-weight: bold', `${validation.score}%`);
    console.log(`Passed: ${validation.passed}, Failed: ${validation.failed}`);
    
    console.groupEnd();
  }
  
  /**
   * Check readiness for UI display
   * @private
   */
  _checkReadiness(summary, validation) {
    const criticalFieldsFound = Object.values(this.classificationSummary.criticalFields)
      .filter(f => f !== null).length;
    
    const categoryCount = Object.keys(summary.byCategory).length;
    
    const checks = {
      classificationRate: summary.summary.classificationRate >= 60,
      criticalFields: criticalFieldsFound >= 2,
      categoryDiversity: categoryCount >= 3,
      avgConfidence: summary.summary.avgConfidence >= 70,
      validationScore: validation.score >= 70
    };
    
    const isReady = Object.values(checks).every(check => check);
    
    return {
      isReady,
      checks,
      score: Math.round(
        (Object.values(checks).filter(c => c).length / Object.keys(checks).length) * 100
      ),
      criticalFieldsFound,
      categoryCount
    };
  }
  
  /**
   * Log readiness check results
   * @private
   */
  _logReadinessCheck(readiness) {
    console.group('%c[READINESS CHECK]', 'font-weight: bold; font-size: 16px');
    
    const status = readiness.isReady ? 
      '%c✅ READY FOR UI' : 
      '%c⚠️ NEEDS IMPROVEMENT';
    const color = readiness.isReady ? 'color: green' : 'color: orange';
    
    console.log(status, `${color}; font-weight: bold; font-size: 14px`);
    console.log(`\nReadiness Score: ${readiness.score}%`);
    
    console.log('\nChecklist:');
    Object.entries(readiness.checks).forEach(([check, passed]) => {
      const icon = passed ? '✅' : '❌';
      const checkName = check.replace(/([A-Z])/g, ' $1').toLowerCase();
      console.log(`${icon} ${checkName}`);
    });
    
    console.log(`\nCritical fields found: ${readiness.criticalFieldsFound}/3`);
    console.log(`Categories identified: ${readiness.categoryCount}`);
    
    if (!readiness.isReady) {
      console.log('\n%cRecommendations:', 'font-weight: bold');
      if (!readiness.checks.classificationRate) {
        console.log('- Improve field pattern matching');
      }
      if (!readiness.checks.criticalFields) {
        console.log('- Ensure business name, EIN, and entity type fields are identified');
      }
      if (!readiness.checks.avgConfidence) {
        console.log('- Review low confidence classifications');
      }
    }
    
    console.groupEnd();
  }
  
  /**
   * Get UI-ready data structure
   * @returns {Object} Structured data for UI display
   */
  getUIData() {
    const categories = {
      business_info: {
        label: 'Business Information',
        fields: [],
        priority: 1
      },
      contact_info: {
        label: 'Contact Information',
        fields: [],
        priority: 2
      },
      address_info: {
        label: 'Address Information',
        fields: [],
        priority: 3
      },
      tax_info: {
        label: 'Tax Information',
        fields: [],
        priority: 4
      },
      other: {
        label: 'Additional Information',
        fields: [],
        priority: 5
      }
    };
    
    // Organize fields by category
    this.fields.forEach(field => {
      if (!field.classification) return;
      
      const category = field.classification.category;
      let targetCategory = 'other';
      
      // Map field categories to UI categories
      if (['business_name', 'entity_type', 'dba'].includes(category)) {
        targetCategory = 'business_info';
      } else if (['email', 'phone', 'fax'].includes(category)) {
        targetCategory = 'contact_info';
      } else if (['address', 'city', 'state', 'zip'].includes(category)) {
        targetCategory = 'address_info';
      } else if (['ein', 'tax_id', 'ssn'].includes(category)) {
        targetCategory = 'tax_info';
      }
      
      categories[targetCategory].fields.push({
        element: field.element,
        label: field.label?.text || field.placeholder || field.name,
        type: field.type,
        required: field.required,
        category: category,
        confidence: field.classification.confidence,
        value: field.value
      });
    });
    
    // Sort categories by priority and remove empty ones
    const sortedCategories = Object.entries(categories)
      .filter(([_, cat]) => cat.fields.length > 0)
      .sort((a, b) => a[1].priority - b[1].priority)
      .reduce((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    
    return {
      categories: sortedCategories,
      summary: this.classificationSummary,
      totalFields: this.fields.length,
      classifiedFields: this.classificationSummary.classified
    };
  }
}

// Export the module
export default FieldDetector;