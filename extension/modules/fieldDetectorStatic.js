/**
 * Field Detector Module - Static Version
 * 
 * Detects and analyzes form fields on business registration forms.
 * Uses static knowledge data to avoid dynamic imports.
 */

// Import static knowledge data
import { staticKnowledge } from './staticKnowledge.js';

/**
 * Class for detecting and analyzing form fields
 */
class FieldDetector {
  /**
   * Create a new field detector
   * @param {Object} config - Configuration object with root and options
   */
  constructor(config = {}) {
    // Performance limits
    this.PERFORMANCE_LIMITS = {
      MAX_DETECTION_TIME: 2000, // 2 seconds max
      MAX_ELEMENTS_TO_SCAN: 500, // Limit elements to scan
      MAX_FIELDS_TO_DETECT: 200, // Max fields to return
      CHUNK_SIZE: 50, // Process in chunks
      YIELD_INTERVAL: 10 // Yield every N operations
    };
    
    // Performance tracking
    this.performanceStats = {
      startTime: 0,
      elementCount: 0,
      fieldCount: 0,
      aborted: false
    };
    
    // Handle both old signature (rootElement, options) and new signature ({root, ...options})
    let root, options;
    
    if (config && typeof config === 'object' && !config.nodeType) {
      // New signature: config object
      root = config.root;
      options = config;
    } else {
      // Old signature: rootElement as first param
      root = config;
      options = arguments[1] || {};
    }
    
    // Validate and set root element
    this.root = this._validateRootElement(root);
    
    // Merge options
    this.options = {
      state: options.state || 'Unknown',
      detectSubfields: options.detectSubfields !== false,
      onDetectionComplete: options.onDetectionComplete || null,
      ...options
    };
    
    console.log('[BRA-FieldDetector] Initialized with root:', this.root.tagName || 'Document');
    
    // Initialize data structures
    this.fields = [];
    this.sections = [];
    this.fieldSummary = {};
    
    // Field groups for categorization
    this.fieldGroups = {
      business: ['business_name', 'dba', 'entity_type', 'business_address', 'formation_date'],
      tax: ['ein', 'ssn', 'state_tax_id', 'reseller_permit'],
      contact: ['email', 'phone', 'fax', 'website'],
      address: ['street_address', 'city', 'state', 'zip', 'country'],
      people: ['first_name', 'last_name', 'full_name', 'title', 'registered_agent'],
      registration: ['username', 'password', 'confirm_password', 'security_question'],
      other: []
    };
    
    // Initialize field summary with all categories
    Object.keys(this.fieldGroups).forEach(group => {
      this.fieldSummary[group] = 0;
    });
    
    // Load field patterns from static knowledge
    this.fieldPatterns = staticKnowledge.getFieldPatterns(this.options.state);
    console.log('[BRA-FieldDetector] Loaded static field patterns:', Object.keys(this.fieldPatterns).length);
  }
  
  /**
   * Validate and return a valid root element
   * @private
   */
  _validateRootElement(root) {
    // Check if root is valid
    if (root && typeof root.querySelectorAll === 'function') {
      return root;
    }
    
    // Try document.body first
    if (document.body && typeof document.body.querySelectorAll === 'function') {
      console.log('[BRA-FieldDetector] Invalid root provided, using document.body');
      return document.body;
    }
    
    // Fall back to documentElement
    if (document.documentElement && typeof document.documentElement.querySelectorAll === 'function') {
      console.log('[BRA-FieldDetector] No body available, using document.documentElement');
      return document.documentElement;
    }
    
    // Last resort: use document
    console.log('[BRA-FieldDetector] Using document as root');
    return document;
  }
  
  /**
   * Safe querySelector wrapper
   * @private
   */
  _safeQuerySelector(selector, root = null) {
    try {
      const searchRoot = root || this.root;
      if (!searchRoot || typeof searchRoot.querySelector !== 'function') {
        return null;
      }
      return searchRoot.querySelector(selector);
    } catch (error) {
      console.error('[BRA-FieldDetector] Error in querySelector:', error);
      return null;
    }
  }
  
  /**
   * Safe querySelectorAll wrapper
   * @private
   */
  _safeQuerySelectorAll(selector, root = null) {
    try {
      const searchRoot = root || this.root;
      if (!searchRoot || typeof searchRoot.querySelectorAll !== 'function') {
        return [];
      }
      return Array.from(searchRoot.querySelectorAll(selector) || []);
    } catch (error) {
      console.error('[BRA-FieldDetector] Error in querySelectorAll:', error);
      return [];
    }
  }
  
  /**
   * Check performance limits
   * @private
   */
  _checkPerformanceLimits() {
    // Check time limit
    const elapsed = performance.now() - this.performanceStats.startTime;
    if (elapsed > this.PERFORMANCE_LIMITS.MAX_DETECTION_TIME) {
      console.error(`[BRA-FieldDetector] Detection timeout after ${elapsed}ms`);
      this.performanceStats.aborted = true;
      return false;
    }
    
    // Check element count
    if (this.performanceStats.elementCount > this.PERFORMANCE_LIMITS.MAX_ELEMENTS_TO_SCAN) {
      console.error('[BRA-FieldDetector] Max element count exceeded');
      this.performanceStats.aborted = true;
      return false;
    }
    
    // Check field count
    if (this.performanceStats.fieldCount >= this.PERFORMANCE_LIMITS.MAX_FIELDS_TO_DETECT) {
      console.warn('[BRA-FieldDetector] Max field count reached');
      return false;
    }
    
    return true;
  }
  
  /**
   * Yield control to browser
   * @private
   */
  async _yieldToBrowser() {
    if (this.performanceStats.elementCount % this.PERFORMANCE_LIMITS.YIELD_INTERVAL === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
  
  /**
   * Add field with performance tracking
   * @private
   */
  _addField(field) {
    if (this.performanceStats.fieldCount >= this.PERFORMANCE_LIMITS.MAX_FIELDS_TO_DETECT) {
      return false;
    }
    this._addField(field);
    this.performanceStats.fieldCount++;
    return true;
  }
  
  /**
   * Safe getBoundingClientRect wrapper
   * @private
   */
  _safeGetBoundingClientRect(element) {
    try {
      if (!element || typeof element.getBoundingClientRect !== 'function') {
        return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
      }
      return element.getBoundingClientRect();
    } catch (error) {
      console.error('[BRA-FieldDetector] Error getting bounding rect:', error);
      return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
    }
  }
  
  /**
   * Detect all fields in the root element
   * @returns {Promise<Array>} Array of detected fields
   */
  async detectFields() {
    this.performanceStats.startTime = performance.now();
    this.performanceStats.elementCount = 0;
    this.performanceStats.fieldCount = 0;
    this.performanceStats.aborted = false;
    
    console.log('[BRA-FieldDetector] ========== STARTING FIELD DETECTION ==========');
    console.log('[BRA-FieldDetector] State:', this.options.state);
    console.log('[BRA-FieldDetector] Root element:', this.root?.tagName || 'Document');
    
    try {
      // Re-validate root element in case DOM changed
      this.root = this._validateRootElement(this.root);
      
      // Final check
      if (!this.root || typeof this.root.querySelectorAll !== 'function') {
        console.error('[BRA-FieldDetector] No valid root element available');
        return [];
      }
      
      // Detect sections first with error handling
      try {
        this._detectSections();
      } catch (sectionError) {
        console.error('[BRA-FieldDetector] Section detection failed:', sectionError);
        this.sections = [];
      }
      
      // Initialize field summary
      Object.keys(this.fieldGroups).forEach(group => {
        this.fieldSummary[group] = 0;
      });
      
      // Track processed radio/checkbox groups and fieldsets
      const processedGroups = new Set();
      const processedFieldsets = new Set();
      
      // Get all form elements - comprehensive search
      const formElementSelectors = [
        'input:not([type="hidden"])',
        'select',
        'textarea',
        'button[type="submit"]',
        'button[type="button"]:not([aria-hidden="true"])',
        '[role="radio"]',
        '[role="checkbox"]',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="textbox"]',
        '[role="spinbutton"]',
        '[contenteditable="true"]',
        'input[type="file"]',
        'input[type="range"]',
        'input[type="color"]',
        'input[type="date"]',
        'input[type="datetime-local"]',
        'input[type="month"]',
        'input[type="time"]',
        'input[type="week"]'
      ];
      
      // Safe DOM queries with error handling
      let inputElements = this._safeQuerySelectorAll(formElementSelectors.join(', '));
      
      // Apply performance limits
      if (inputElements.length > this.PERFORMANCE_LIMITS.MAX_ELEMENTS_TO_SCAN) {
        console.warn(`[BRA-FieldDetector] Limiting scan from ${inputElements.length} to ${this.PERFORMANCE_LIMITS.MAX_ELEMENTS_TO_SCAN} elements`);
        inputElements = inputElements.slice(0, this.PERFORMANCE_LIMITS.MAX_ELEMENTS_TO_SCAN);
      }
      console.log(`[BRA-FieldDetector] Processing ${inputElements.length} potential input elements`);
      
      const fieldsets = this._safeQuerySelectorAll('fieldset');
      const formGroups = this._safeQuerySelectorAll('.form-group, .field-group, [role="group"], .radio-group, .checkbox-group');
      console.log(`[BRA-FieldDetector] Found ${fieldsets.length} fieldsets and ${formGroups.length} form groups`);
      
      // Process fieldsets first to catch grouped elements
      for (const fieldset of fieldsets) {
        if (!this._checkPerformanceLimits()) break;
        await this._yieldToBrowser();
        
        if (processedFieldsets.has(fieldset)) continue;
        processedFieldsets.add(fieldset);
        this.performanceStats.elementCount++;
        
        const legend = this._safeQuerySelector('legend', fieldset);
        const groupLabel = legend ? legend.textContent.trim() : null;
        
        // Process all types of inputs within fieldset, not just radio/checkbox
        const allInputs = this._safeQuerySelectorAll('input:not([type="hidden"]), select, textarea', fieldset);
        const radioCheckboxInputs = this._safeQuerySelectorAll('input[type="radio"], input[type="checkbox"]', fieldset);
        
        // Group radio/checkbox inputs by name
        const groups = {};
        radioCheckboxInputs.forEach(input => {
          const name = input.name || `unnamed_${input.type}_${Math.random().toString(36).substr(2, 9)}`;
          if (!groups[name]) groups[name] = [];
          groups[name].push(input);
        });
        
        // Process radio/checkbox groups
        Object.entries(groups).forEach(([name, inputs]) => {
          const groupKey = `fieldset-${inputs[0].type}-${name}`;
          if (!processedGroups.has(groupKey)) {
            processedGroups.add(groupKey);
            inputs.forEach(input => processedGroups.add(`element-${input.type}-${input.name || input.id}`));
            
            const field = this._extractGroupFieldInfo(inputs[0], groupLabel);
            if (field) {
              field.index = this.fields.length;
              field.isFieldsetMember = true;
              field.fieldsetLabel = groupLabel;
              field.classification = this._classifyField(field);
              this._addField(field);
              this._updateFieldSummary(field);
            }
          }
        });
        
        // Process other inputs in fieldset individually
        allInputs.forEach(input => {
          if (input.type !== 'radio' && input.type !== 'checkbox') {
            const elementKey = `element-${input.type}-${input.name || input.id || Math.random().toString(36).substr(2, 9)}`;
            if (!processedGroups.has(elementKey)) {
              processedGroups.add(elementKey);
              
              const field = this._extractFieldInfo(input);
              if (field) {
                field.index = this.fields.length;
                field.isFieldsetMember = true;
                field.fieldsetLabel = groupLabel;
                field.classification = this._classifyField(field);
                this._addField(field);
                this._updateFieldSummary(field);
              }
            }
          }
        });
      });
      
      // Process remaining input elements (not already in groups)
      for (let index = 0; index < inputElements.length; index++) {
        if (!this._checkPerformanceLimits()) break;
        await this._yieldToBrowser();
        
        const element = inputElements[index];
        try {
          this.performanceStats.elementCount++;
          // Generate a unique key for this element
          const elementKey = `element-${element.type || element.tagName}-${element.name || element.id || index}`;
          
          // Skip if already processed
          if (processedGroups.has(elementKey)) {
            return;
          }
          
          // Skip certain button types unless they're important
          if (element.tagName === 'BUTTON') {
            // Only include submit buttons and buttons with specific text
            const buttonText = element.textContent.trim().toLowerCase();
            const importantButtons = ['submit', 'save', 'continue', 'next', 'register', 'apply', 'confirm'];
            if (element.type !== 'submit' && !importantButtons.some(text => buttonText.includes(text))) {
              return;
            }
          }
          
          // Skip hidden fields
          if (element.type === 'hidden') {
            return;
          }
          
          // Check if element is visible
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return;
          }
          
          // Skip non-important buttons
          if (element.type === 'reset' || (element.type === 'button' && !element.textContent.trim())) {
            return;
          }
          
          // For radio/checkbox inputs, check if part of a group
          if (element.type === 'radio' || element.type === 'checkbox') {
            // Check if this is part of a group with same name
            if (element.name) {
              const sameNameElements = this._safeQuerySelectorAll(`input[type="${element.type}"][name="${element.name}"]`);
              
              // If multiple elements with same name exist, process as a group
              if (sameNameElements.length > 1) {
                const groupKey = `standalone-${element.type}-${element.name}`;
                if (!processedGroups.has(groupKey)) {
                  processedGroups.add(groupKey);
                  sameNameElements.forEach(el => {
                    processedGroups.add(`element-${el.type}-${el.name || el.id}`);
                  });
                  
                  const field = this._extractGroupFieldInfo(element);
                  if (field && this._isUserFacingField(field)) {
                    field.index = this.fields.length;
                    field.classification = this._classifyField(field);
                    this._addField(field);
                    this._updateFieldSummary(field);
                  }
                }
                return;
              }
            }
            
            // Single checkbox - process individually
            processedGroups.add(elementKey);
          } else {
            // Mark as processed
            processedGroups.add(elementKey);
          }
          
          const field = this._extractFieldInfo(element);
          if (field && this._isUserFacingField(field)) {
            // Add index for reference
            field.index = this.fields.length;
            
            // Classify the field
            field.classification = this._classifyField(field);
            
            // Add field to collection
            this._addField(field);
            
            // Update field summary
            this._updateFieldSummary(field);
          }
        } catch (fieldError) {
          console.error('[BRA-FieldDetector] Error processing field:', fieldError);
        }
      });
      
      // Calculate performance metrics
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      console.log(`[BRA-FieldDetector] Detection completed in ${totalTime.toFixed(2)}ms`);
      console.log(`[BRA-FieldDetector] Total fields detected: ${this.fields.length}`);
      
      // Sort fields by their position on the page
      this.fields.sort((a, b) => {
        // First sort by section order
        if (a.section && b.section && a.section.index !== b.section.index) {
          return a.section.index - b.section.index;
        }
        
        // Within same section or no section, sort by vertical position
        const topDiff = (a.position?.top || 0) - (b.position?.top || 0);
        if (Math.abs(topDiff) > 5) {
          return topDiff;
        }
        
        // If on same row, sort by horizontal position
        return (a.position?.left || 0) - (b.position?.left || 0);
      });
      
      // Call the callback if provided
      if (this.options.onDetectionComplete && typeof this.options.onDetectionComplete === 'function') {
        const detectionData = {
          state: this.options.state || 'Unknown',
          confidence: this._calculateOverallConfidence(),
          isDetected: this.fields.length > 0,
          totalFields: this.fields.length,
          fields: this.fields.length
        };
        
        this.options.onDetectionComplete(detectionData);
      }
      
      return this.fields;
    } catch (error) {
      console.error('[BRA-FieldDetector] Field detection error:', error);
      // Return empty array instead of throwing to prevent crashes
      return [];
    }
  }
  
  /**
   * Classify a field based on its properties
   * @private
   */
  _classifyField(field) {
    const patterns = this.fieldPatterns;
    let bestMatch = null;
    let bestScore = 0;
    
    // Combine all field text for matching
    const fieldText = [
      field.name,
      field.id,
      field.placeholder,
      field.label?.text,
      field.title,
      field.attributes?.['aria-label']
    ].filter(t => t).join(' ').toLowerCase();
    
    // Check each field type pattern
    Object.entries(patterns).forEach(([fieldType, config]) => {
      const patterns = config.patterns || [];
      let score = 0;
      
      patterns.forEach(pattern => {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(fieldText)) {
          score = config.confidence || 0.8;
          
          // Boost score for exact matches
          if (fieldText === pattern.toLowerCase()) {
            score = Math.min(score + 0.1, 1.0);
          }
        }
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = fieldType;
      }
    });
    
    if (bestMatch) {
      return {
        category: this._mapFieldTypeToCategory(bestMatch),
        fieldType: bestMatch,
        confidence: bestScore
      };
    }
    
    // Return default classification instead of null
    return {
      category: 'unknown',
      fieldType: 'unknown',
      confidence: 0
    };
  }
  
  /**
   * Map field type to category
   * @private
   */
  _mapFieldTypeToCategory(fieldType) {
    for (const [category, types] of Object.entries(this.fieldGroups)) {
      if (types.includes(fieldType)) {
        return category;
      }
    }
    return 'other';
  }
  
  /**
   * Extract field information from an input element
   * @private
   */
  _extractFieldInfo(element) {
    try {
      // For radio/checkbox groups, handle as a group
      if (element.type === 'radio' || element.type === 'checkbox') {
        return this._extractGroupFieldInfo(element);
      }
      
      // Get element position
      const rect = this._safeGetBoundingClientRect(element);
      const domPosition = this._safeQuerySelectorAll('*').indexOf(element);
      
      // Determine field type
      let fieldType = element.type || element.tagName.toLowerCase();
      
      // Special handling for different element types
      if (element.tagName === 'BUTTON') {
        fieldType = 'button';
      } else if (element.tagName === 'SELECT') {
        fieldType = element.multiple ? 'select-multiple' : 'select';
      } else if (element.tagName === 'TEXTAREA') {
        fieldType = 'textarea';
      } else if (element.getAttribute('contenteditable') === 'true') {
        fieldType = 'contenteditable';
      }
      
      // Basic field properties
      const field = {
        element: element,
        tagName: element.tagName.toLowerCase(),
        type: fieldType,
        id: element.id || '',
        name: element.name || '',
        value: element.value || element.textContent?.trim() || '',
        placeholder: element.placeholder || element.getAttribute('aria-placeholder') || '',
        required: element.required || element.getAttribute('aria-required') === 'true' || false,
        disabled: element.disabled || element.getAttribute('aria-disabled') === 'true' || false,
        classes: Array.from(element.classList || []),
        attributes: {},
        readOnly: element.readOnly || false,
        title: element.title || '',
        // Position information
        position: {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          domIndex: domPosition
        },
        // Section information
        section: this._findFieldSection(element)
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
   * Extract field information for radio/checkbox groups
   * @private
   */
  _extractGroupFieldInfo(element, providedLabel = null) {
    try {
      const groupName = element.name;
      const groupType = element.type;
      
      // Find all elements in this group
      let groupElements = [];
      
      if (groupName) {
        groupElements = this._safeQuerySelectorAll(`input[type="${groupType}"][name="${groupName}"]`);
      } else {
        // Check if elements are grouped by container
        const container = element.closest('fieldset, .form-group, .field-group, [role="group"]');
        if (container) {
          groupElements = Array.from(container.querySelectorAll(`input[type="${groupType}"]`));
          groupElements = groupElements.filter(el => !el.name || el.name === groupName);
        }
        
        if (groupElements.length === 0) {
          groupElements = [element];
        }
      }
      
      // Collect all options
      const options = groupElements.map(el => ({
        value: el.value,
        label: this._findFieldLabel(el)?.text || el.value,
        checked: el.checked,
        element: el
      }));
      
      // Determine the group label
      let groupLabel = null;
      
      if (providedLabel) {
        groupLabel = { text: providedLabel, element: null };
      }
      
      // Check for fieldset legend
      if (!groupLabel) {
        const fieldset = element.closest('fieldset');
        if (fieldset) {
          const legend = this._safeQuerySelector('legend', fieldset);
          if (legend) {
            groupLabel = { text: legend.textContent.trim(), element: legend };
          }
        }
      }
      
      // Check for parent container label
      if (!groupLabel) {
        const container = element.closest('.form-group, .field-group, [role="group"]');
        if (container) {
          const heading = this._safeQuerySelector('h1, h2, h3, h4, h5, h6, .label, .title', container);
          if (heading && !this._safeQuerySelector('input, select, textarea', heading)) {
            groupLabel = { text: heading.textContent.trim(), element: heading };
          }
        }
      }
      
      // Get position from first element
      const rect = this._safeGetBoundingClientRect(groupElements[0]);
      const domPosition = this._safeQuerySelectorAll('*').indexOf(groupElements[0]);
      
      // Build the field object
      const field = {
        element: groupElements[0],
        elements: groupElements,
        tagName: 'input',
        type: groupType === 'radio' ? 'single_select' : 'multi_select',
        originalType: groupType,
        id: groupElements[0].id || '',
        name: groupName || '',
        value: groupType === 'radio' 
          ? groupElements.find(el => el.checked)?.value || ''
          : groupElements.filter(el => el.checked).map(el => el.value),
        options: options,
        required: groupElements.some(el => el.required),
        disabled: groupElements.every(el => el.disabled),
        classes: Array.from(groupElements[0].classList || []),
        attributes: {},
        label: groupLabel,
        groupSize: groupElements.length,
        title: groupElements[0].title || '',
        position: {
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          domIndex: domPosition
        },
        section: this._findFieldSection(groupElements[0])
      };
      
      // For single checkboxes, check if it's a boolean field
      if (groupType === 'checkbox' && groupElements.length === 1) {
        const labelText = (groupLabel?.text || '').toLowerCase();
        if (labelText.match(/\?|agree|consent|confirm|certify|acknowledge/i)) {
          field.type = 'boolean_field';
        }
      }
      
      return field;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error extracting group field info:', error);
      return null;
    }
  }
  
  /**
   * Find the label for a field
   * @private
   */
  _findFieldLabel(element) {
    try {
      let labelText = '';
      let labelElement = null;
      
      // Special handling for buttons
      if (element.tagName === 'BUTTON' || element.type === 'submit' || element.type === 'button') {
        labelText = element.textContent.trim() || element.value || element.getAttribute('aria-label') || '';
        if (labelText) {
          return { text: labelText, element: element };
        }
      }
      
      // Check for labels collection
      if (element.labels && element.labels.length > 0) {
        labelElement = element.labels[0];
        labelText = labelElement.textContent.trim();
      }
      
      // Check for label[for="id"]
      if (!labelText && element.id) {
        const labelFor = this._safeQuerySelector(`label[for="${element.id}"]`);
        if (labelFor) {
          labelElement = labelFor;
          labelText = labelFor.textContent.trim();
        }
      }
      
      // Check aria-label
      if (!labelText && element.getAttribute('aria-label')) {
        labelText = element.getAttribute('aria-label');
      }
      
      // Check for parent label
      if (!labelText) {
        const parentLabel = element.closest('label');
        if (parentLabel) {
          const labelClone = parentLabel.cloneNode(true);
          const inputInLabel = this._safeQuerySelector('input, select, textarea', labelClone);
          if (inputInLabel) inputInLabel.remove();
          labelText = labelClone.textContent.trim();
          labelElement = parentLabel;
        }
      }
      
      return labelText ? { text: labelText, element: labelElement } : null;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error finding field label:', error);
      return null;
    }
  }
  
  /**
   * Check if a field is user-facing
   * @private
   */
  _isUserFacingField(field) {
    // Skip internal/system fields
    const internalPatterns = [
      /^__/,
      /^_/,
      /csrf/i,
      /token/i,
      /timestamp/i,
      /nonce/i,
      /captcha/i,
      /^id$/i,
      /^key$/i,
      /^hash$/i
    ];
    
    const fieldIdentifier = (field.name + field.id).toLowerCase();
    
    return !internalPatterns.some(pattern => pattern.test(fieldIdentifier));
  }
  
  /**
   * Update field summary
   * @private
   */
  _updateFieldSummary(field) {
    if (!field || !this.fieldSummary) return;
    
    if (field.classification && field.classification.category) {
      const category = field.classification.category;
      if (this.fieldSummary.hasOwnProperty(category)) {
        this.fieldSummary[category] = (this.fieldSummary[category] || 0) + 1;
      } else {
        this.fieldSummary.other = (this.fieldSummary.other || 0) + 1;
      }
    } else {
      this.fieldSummary.other = (this.fieldSummary.other || 0) + 1;
    }
  }
  
  /**
   * Detect sections in the form
   * @private
   */
  _detectSections() {
    this.sections = [];
    
    try {
      // Helper function to check if element is visually prominent
      const isVisuallyProminent = (element) => {
        try {
          if (!element) {
            return false;
          }
          if (typeof window === 'undefined' || typeof window.getComputedStyle !== 'function') {
            return false;
          }
          const style = window.getComputedStyle(element);
          const fontSize = parseFloat(style.fontSize) || 0;
          const fontWeight = style.fontWeight || 'normal';
          const isLarge = fontSize >= 18; // At least 18px
          const isBold = fontWeight === 'bold' || parseInt(fontWeight) >= 600;
          return isLarge || isBold;
        } catch (error) {
          return false;
        }
      };
    
    // Helper function to count form fields after an element
    const countFollowingFields = (element, maxDistance = 500) => {
      let count = 0;
      let currentEl = element;
      let distance = 0;
      
      while (currentEl && distance < maxDistance) {
        currentEl = currentEl.nextElementSibling;
        if (!currentEl) {
          // Check parent's next sibling
          const parent = element.parentElement;
          if (parent) {
            currentEl = parent.nextElementSibling;
          }
        }
        
        if (currentEl) {
          const fields = currentEl.querySelectorAll('input, select, textarea');
          count += fields.length;
          
          // Also count the element itself if it's a field
          if (currentEl.matches('input, select, textarea')) {
            count++;
          }
          
          const rect = this._safeGetBoundingClientRect(currentEl);
          distance += rect.height;
        }
      }
      
      return count;
    };
    
    // First pass: Find all potential section headers
    const potentialHeaders = [];
    
    // Look for headings (h1-h6) with error handling
    const headings = this._safeQuerySelectorAll('h1, h2, h3, h4, h5, h6');
    
    headings.forEach(heading => {
      try {
      // Skip if inside a label or directly adjacent to a single input
      if (heading.closest('label')) {
        return;
      }
      
      // Skip if this heading contains inputs (it's a field label)
      if (this._safeQuerySelector('input, select, textarea', heading)) {
        return;
      }
      
      // Check if heading has label-like attributes
      const headingId = heading.id;
      if (headingId) {
        // Check if any input references this heading via aria-labelledby
        const referencingInputs = this._safeQuerySelectorAll(`[aria-labelledby="${headingId}"], [aria-describedby="${headingId}"]`);
        if (referencingInputs.length === 1) {
          return; // This is a label for a single input
        }
      }
      
      // Check if heading is immediately followed by or contains a label element
      const nextEl = heading.nextElementSibling;
      if (nextEl && nextEl.tagName === 'LABEL') {
        return;
      }
      
      // Check if there's an input immediately adjacent (within 50px)
      const headingRect = this._safeGetBoundingClientRect(heading);
      const nearbyInputs = this._safeQuerySelectorAll('input, select, textarea').filter(input => {
        const inputRect = this._safeGetBoundingClientRect(input);
        const verticalDistance = Math.abs(inputRect.top - headingRect.bottom);
        const horizontalDistance = Math.abs(inputRect.left - headingRect.left);
        return verticalDistance < 50 && horizontalDistance < 200;
      });
      
      // If there's only one nearby input, this is likely a field label
      if (nearbyInputs.length === 1) {
        return;
      }
      
      // Count how many fields follow this heading
      const followingFields = countFollowingFields(heading);
      
      // Only consider it a section if it has multiple fields following
      if (followingFields >= 2 || heading.tagName === 'H1' || heading.tagName === 'H2') {
        potentialHeaders.push({
          element: heading,
          text: heading.textContent.trim(),
          tagName: heading.tagName,
          fieldCount: followingFields,
          rect: headingRect
        });
      }
      } catch (error) {
        console.error('[BRA-FieldDetector] Error processing heading:', error);
      }
    });
    
    // Look for other prominent text elements that might be section headers
    const allTextElements = this._safeQuerySelectorAll('div, span, p, strong, b');
    allTextElements.forEach(element => {
      // Skip if already processed as heading
      if (element.matches('h1, h2, h3, h4, h5, h6')) {
        return;
      }
      
      // Skip if inside label or form field
      if (element.closest('label, input, select, textarea')) {
        return;
      }
      
      // Skip if not visually prominent
      if (!isVisuallyProminent(element)) {
        return;
      }
      
      // Skip if text is too long (likely paragraph content)
      const text = element.textContent.trim();
      if (text.length > 50 || text.split(' ').length > 8) {
        return;
      }
      
      // Check if it looks like a section header
      const isSectionLike = text.match(/information|details|section|part|step|data|contact|address|business|personal|additional|registration|entity|organization/i);
      
      // Also check for short, prominent text that might be section headers
      const isShortHeader = text.length < 30 && isVisuallyProminent(element);
      
      if (isSectionLike || isShortHeader) {
        const followingFields = countFollowingFields(element);
        if (followingFields >= 2) {
          potentialHeaders.push({
            element: element,
            text: text,
            tagName: element.tagName,
            fieldCount: followingFields,
            rect: this._safeGetBoundingClientRect(element)
          });
        }
      }
    });
    
    // Look for fieldsets with legends
    const fieldsets = this._safeQuerySelectorAll('fieldset');
    fieldsets.forEach(fieldset => {
      const legend = this._safeQuerySelector('legend', fieldset);
      if (legend) {
        const fields = this._safeQuerySelectorAll('input, select, textarea', fieldset);
        if (fields.length > 0) {
          potentialHeaders.push({
            element: fieldset,
            text: legend.textContent.trim(),
            tagName: 'FIELDSET',
            fieldCount: fields.length,
            rect: this._safeGetBoundingClientRect(fieldset)
          });
        }
      }
    });
    
    // Sort potential headers by position
    potentialHeaders.sort((a, b) => a.rect.top - b.rect.top);
    
    // Convert to sections, avoiding duplicates
    const processedTexts = new Set();
    potentialHeaders.forEach((header, index) => {
      const normalizedText = header.text.toLowerCase().trim();
      
      // Skip if we've already processed very similar text
      let isDuplicate = false;
      for (const processed of processedTexts) {
        if (processed === normalizedText || 
            processed.includes(normalizedText) || 
            normalizedText.includes(processed)) {
          isDuplicate = true;
          break;
        }
      }
      
      if (!isDuplicate) {
        processedTexts.add(normalizedText);
        this.sections.push({
          name: header.text,
          element: header.element,
          type: header.tagName.toLowerCase(),
          index: index,
          position: {
            top: header.rect.top + window.scrollY,
            bottom: header.rect.bottom + window.scrollY
          },
          fieldCount: header.fieldCount
        });
      }
    });
    
    // If no sections found, create a default one
    if (this.sections.length === 0) {
      this.sections.push({
        name: 'Business Information',
        element: this.root,
        type: 'default',
        index: 0,
        position: {
          top: 0,
          bottom: 0
        }
      });
    }
    
    // Log detected sections for debugging
    console.log('[BRA-FieldDetector] Detected sections:', this.sections.map(s => ({
      name: s.name,
      type: s.type,
      fieldCount: s.fieldCount
    })));
    
    } catch (error) {
      console.error('[BRA-FieldDetector] Error in section detection:', error);
      // Ensure we have at least a default section
      if (this.sections.length === 0) {
        this.sections.push({
          name: 'Business Information',
          element: this.root,
          type: 'default',
          index: 0,
          position: { top: 0, bottom: 0 }
        });
      }
    }
  }
  
  /**
   * Find which section a field belongs to
   * @private
   */
  _findFieldSection(element) {
    if (!this.sections || this.sections.length === 0) {
      return null;
    }
    
    // If we only have one section, all fields belong to it
    if (this.sections.length === 1) {
      return this.sections[0];
    }
    
    const rect = this._safeGetBoundingClientRect(element);
    const fieldTop = rect.top + window.scrollY;
    const fieldLeft = rect.left + window.scrollX;
    
    // First check if field is inside a section container
    for (const section of this.sections) {
      if (section.element && section.element.contains(element)) {
        return section;
      }
    }
    
    // Find the nearest section header above this field
    let bestSection = null;
    let minDistance = Infinity;
    
    for (let i = this.sections.length - 1; i >= 0; i--) {
      const section = this.sections[i];
      
      // Section must be above the field
      if (section.position.top <= fieldTop) {
        const distance = fieldTop - section.position.top;
        
        // Check if there's another section between this one and the field
        let hasIntervening = false;
        for (let j = i + 1; j < this.sections.length; j++) {
          if (this.sections[j].position.top < fieldTop) {
            hasIntervening = true;
            break;
          }
        }
        
        if (!hasIntervening && distance < minDistance) {
          minDistance = distance;
          bestSection = section;
        }
      }
    }
    
    // If no section found above, use the first section
    return bestSection || this.sections[0];
  }
  
  /**
   * Calculate overall confidence
   * @private
   */
  _calculateOverallConfidence() {
    if (!this.fields || this.fields.length === 0) return 0;
    
    const classifiedFields = this.fields.filter(f => f && f.classification);
    if (classifiedFields.length === 0) return 0;
    
    const totalConfidence = classifiedFields.reduce((sum, field) => {
      return sum + (field.classification?.confidence || 0);
    }, 0);
    
    return totalConfidence / classifiedFields.length;
  }
  
  /**
   * Get UI-ready data structure
   */
  getUIData() {
    const sectionedData = {};
    
    // Group fields by section
    this.fields.forEach(field => {
      const sectionName = field.section?.name || 'Business Information';
      if (!sectionedData[sectionName]) {
        sectionedData[sectionName] = {
          label: sectionName,
          fields: [],
          priority: field.section?.index || 999
        };
      }
      sectionedData[sectionName].fields.push(field);
    });
    
    // Convert to array and sort by priority
    const sections = Object.values(sectionedData).sort((a, b) => a.priority - b.priority);
    
    // Calculate classification statistics
    const classifiedFields = this.fields.filter(f => f.classification);
    const totalFields = this.fields.length;
    const avgConfidence = this._calculateOverallConfidence();
    
    // Build category breakdown
    const byCategory = {};
    const byFieldType = {};
    
    classifiedFields.forEach(field => {
      // Add null safety for classification
      const category = (field.classification && field.classification.category) ? field.classification.category : 'unknown';
      const fieldType = (field.classification && field.classification.fieldType) ? field.classification.fieldType : 'unknown';
      
      byCategory[category] = (byCategory[category] || 0) + 1;
      byFieldType[fieldType] = (byFieldType[fieldType] || 0) + 1;
    });
    
    // Create summary object that matches expected structure
    const summary = {
      total: totalFields || 0,
      classified: classifiedFields.length || 0,
      avgConfidence: isNaN(avgConfidence) ? 0 : avgConfidence * 100, // Convert to percentage, handle NaN
      byCategory: byCategory || {},
      byFieldType: byFieldType || {}
    };
    
    // Create categories object from sections for backward compatibility
    const categories = {};
    sections.forEach((section, index) => {
      categories[`section_${index}`] = {
        label: section.label,
        fields: section.fields,
        priority: section.priority
      };
    });
    
    return {
      sections: sections,
      categories: categories, // Add categories for panel compatibility
      totalFields: totalFields,
      classifiedFields: classifiedFields.length,
      fieldSummary: this.fieldSummary,
      confidence: avgConfidence,
      summary: summary // Add the summary property that content.js expects
    };
  }
  
  /**
   * Get all detected fields
   */
  getFields() {
    return this.fields;
  }
}

// Export the class
export default FieldDetector;
export { FieldDetector };