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
      select: ['select', 'single_select', 'multi_select'],
      checkbox: ['checkbox'],
      radio: ['radio'],
      boolean: ['boolean_field'],
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
        patterns: ["entity.*type", "business.*type", "organization.*type", "structure"],
        attributes: ["entity-type", "business-type"],
        priority: 85
      },
      business_purpose: {
        patterns: ["business.*purpose", "purpose", "nature.*business"],
        attributes: ["purpose"],
        priority: 80
      },
      certifications: {
        patterns: ["certif", "acknowledge", "agree", "confirm", "attest"],
        attributes: ["certification", "agreement"],
        priority: 75
      },
      ownership_type: {
        patterns: ["ownership", "owner.*type", "control"],
        attributes: ["ownership"],
        priority: 75
      },
      business_structure: {
        patterns: ["llc", "corporation", "partnership", "sole.*proprietor"],
        attributes: ["structure"],
        priority: 80
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
      this.sections = [];
      this.fieldSummary = {};
      this.classificationSummary = this._initClassificationSummary();
      
      // Ensure patterns are loaded
      await this._loadFieldPatterns();
      
      // Detect sections first
      this._detectSections();
      
      // Initialize field summary
      Object.keys(this.fieldGroups).forEach(group => {
        this.fieldSummary[group] = 0;
      });
      
      // Track processed radio/checkbox groups
      const processedGroups = new Set();
      
      // Get all form elements - expanded search
      const formElementSelectors = [
        'input',
        'select',
        'textarea',
        'button[type="submit"]',
        '[role="radio"]',
        '[role="checkbox"]',
        '[role="combobox"]',
        '[role="listbox"]',
        '[role="textbox"]',
        '[contenteditable="true"]'
      ];
      
      const inputElements = this.root.querySelectorAll(formElementSelectors.join(', '));
      console.log(`[BRA-FieldDetector] Found ${inputElements.length} potential input elements`);
      
      // Also find fieldsets which often contain radio/checkbox groups
      const fieldsets = this.root.querySelectorAll('fieldset');
      console.log(`[BRA-FieldDetector] Found ${fieldsets.length} fieldsets`);
      
      // Process fieldsets first to catch grouped elements
      fieldsets.forEach((fieldset) => {
        const legend = fieldset.querySelector('legend');
        const groupLabel = legend ? legend.textContent.trim() : null;
        
        // Find all inputs within this fieldset
        const fieldsetInputs = fieldset.querySelectorAll('input[type="radio"], input[type="checkbox"]');
        if (fieldsetInputs.length > 0) {
          // Group by name
          const groups = {};
          fieldsetInputs.forEach(input => {
            const name = input.name || 'unnamed';
            if (!groups[name]) groups[name] = [];
            groups[name].push(input);
          });
          
          // Process each group
          Object.entries(groups).forEach(([name, inputs]) => {
            const groupKey = `${inputs[0].type}-${name}`;
            if (!processedGroups.has(groupKey)) {
              processedGroups.add(groupKey);
              const field = this._extractGroupFieldInfo(inputs[0], groupLabel);
              if (field) {
                field.index = this.fields.length;
                field.classification = this._classifyField(field);
                this.fields.push(field);
                this._updateFieldSummary(field);
              }
            }
          });
        }
      });
      
      // Process each input element
      inputElements.forEach((element, index) => {
        try {
          // Skip if it's a button (unless submit)
          if (element.tagName === 'BUTTON' && element.type !== 'submit') {
            return;
          }
          
          // For radio/checkbox inputs, check if we've already processed this group
          if (element.type === 'radio' || element.type === 'checkbox') {
            // Use a unique key for elements with names, or element ID for single checkboxes
            const groupKey = element.name 
              ? `${element.type}-${element.name}` 
              : `${element.type}-${element.id || element.getAttribute('data-id') || index}`;
            
            if (processedGroups.has(groupKey)) {
              return; // Skip this element as we've already processed its group
            }
            processedGroups.add(groupKey);
          }
          
          // Skip hidden fields and non-visible elements
          if (element.type === 'hidden') {
            return;
          }
          
          // Check if element is visible
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return;
          }
          
          // Skip submit/reset buttons
          if (element.type === 'submit' || element.type === 'reset' || element.type === 'button') {
            return;
          }
          
          const field = this._extractFieldInfo(element);
          if (field && this._isUserFacingField(field)) {
            // Add index for reference
            field.index = this.fields.length;
            
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
              // Check if it's a context invalidation error
              if (!chrome.runtime.lastError.message?.includes('Extension context invalidated') &&
                  !chrome.runtime.lastError.message?.includes('Could not establish connection')) {
                console.error('[BRA-FieldDetector] Fallback message error:', chrome.runtime.lastError);
              }
            } else {
              console.log('[BRA-FieldDetector] Fallback message sent');
            }
          });
        } catch (error) {
          // Silently handle context invalidation errors
          if (!error.message?.includes('Extension context invalidated')) {
            console.error('[BRA-FieldDetector] Fallback message exception:', error);
          }
        }
      }
      
      // Sort fields by their position on the page (absolute positions)
      this.fields.sort((a, b) => {
        // First sort by section order
        if (a.section && b.section && a.section.index !== b.section.index) {
          return a.section.index - b.section.index;
        }
        
        // Within same section or no section, sort by vertical position
        const topDiff = (a.position?.top || 0) - (b.position?.top || 0);
        if (Math.abs(topDiff) > 5) { // Tighter tolerance for more accurate ordering
          return topDiff;
        }
        
        // If on same row, sort by horizontal position (left to right)
        const leftDiff = (a.position?.left || 0) - (b.position?.left || 0);
        if (Math.abs(leftDiff) > 5) {
          return leftDiff;
        }
        
        // Fallback to DOM order
        return (a.position?.domIndex || 0) - (b.position?.domIndex || 0);
      });
      
      console.log('[BRA-FieldDetector] Fields sorted by position');
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
      // For radio/checkbox groups, handle as a group
      if (element.type === 'radio' || element.type === 'checkbox') {
        return this._extractGroupFieldInfo(element);
      }
      
      // Get element position for sorting
      const rect = element.getBoundingClientRect();
      const domPosition = Array.from(this.root.querySelectorAll('*')).indexOf(element);
      
      // Find which section this field belongs to
      const section = this._findFieldSection(element);
      
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
        checked: element.checked || false,
        title: element.title || '',
        // Position information for sorting
        position: {
          top: rect.top + window.scrollY, // Add scrollY for absolute position
          left: rect.left + window.scrollX, // Add scrollX for absolute position
          domIndex: domPosition
        },
        // Section information
        section: section
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
   * @param {HTMLElement} element - The first element in the group
   * @param {string} providedLabel - Optional label provided (e.g., from fieldset legend)
   * @returns {Object} Field information object for the group
   * @private
   */
  _extractGroupFieldInfo(element, providedLabel = null) {
    try {
      const groupName = element.name;
      const groupType = element.type;
      
      // Find all elements in this group
      const groupElements = groupName 
        ? Array.from(this.root.querySelectorAll(`input[type="${groupType}"][name="${groupName}"]`))
        : [element];
      
      console.log(`[BRA-FieldDetector] Processing ${groupType} group "${groupName}" with ${groupElements.length} options`);
      
      // Collect all options
      const options = groupElements.map(el => ({
        value: el.value,
        label: this._findFieldLabel(el)?.text || el.value,
        checked: el.checked,
        element: el
      }));
      
      // Determine the group label - try multiple methods
      let groupLabel = null;
      
      // Method 0: Use provided label if available
      if (providedLabel) {
        groupLabel = { text: providedLabel, element: null };
        console.log(`[BRA-FieldDetector] Using provided label: "${providedLabel}"`);
      }
      
      // Method 1: Check for fieldset legend
      const fieldset = element.closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend) {
          groupLabel = { text: legend.textContent.trim(), element: legend };
        }
      }
      
      // Method 2: Check for a common parent with a label or heading
      if (!groupLabel) {
        // Try multiple parent selector patterns
        const parentSelectors = [
          '.form-group', '.field-group', '.input-group', '[role="group"]',
          '.form-field', '.form-row', '.form-item', '.field',
          'div', 'section', 'article', 'li', 'tr', 'td'
        ];
        
        let commonParent = null;
        for (const selector of parentSelectors) {
          commonParent = element.closest(selector);
          if (commonParent) break;
        }
        
        if (commonParent) {
          // Look for headings
          const headingSelectors = 'h1, h2, h3, h4, h5, h6, .label, .question, .title, .heading, strong, b';
          const heading = commonParent.querySelector(headingSelectors);
          if (heading && heading.textContent.trim() && !heading.querySelector('input')) {
            groupLabel = { text: heading.textContent.trim(), element: heading };
            console.log(`[BRA-FieldDetector] Found heading label: "${groupLabel.text}"`);
          }
          
          if (!groupLabel) {
            // Look for preceding sibling text
            let sibling = element.previousElementSibling;
            while (sibling && !groupLabel) {
              if (!sibling.querySelector('input') && sibling.textContent.trim().length > 3) {
                const text = sibling.textContent.trim();
                if (!text.match(/^\d+$/) && text.length < 200) {
                  groupLabel = { text: text, element: sibling };
                  console.log(`[BRA-FieldDetector] Found sibling label: "${groupLabel.text}"`);
                  break;
                }
              }
              sibling = sibling.previousElementSibling;
            }
          }
          
          if (!groupLabel) {
            // Look for parent's text content (excluding the inputs)
            const parentClone = commonParent.cloneNode(true);
            // Remove all input elements from the clone
            parentClone.querySelectorAll('input, select, textarea').forEach(el => el.remove());
            const parentText = parentClone.textContent.trim();
            if (parentText && parentText.length > 3 && parentText.length < 200) {
              groupLabel = { text: parentText, element: commonParent };
              console.log(`[BRA-FieldDetector] Found parent text label: "${groupLabel.text}"`);
            }
          }
        }
      }
      
      // Method 3: Check aria-label or aria-labelledby
      if (!groupLabel) {
        if (element.getAttribute('aria-label')) {
          groupLabel = { text: element.getAttribute('aria-label'), element: null };
        } else if (element.getAttribute('aria-labelledby')) {
          const labelElement = document.getElementById(element.getAttribute('aria-labelledby'));
          if (labelElement) {
            groupLabel = { text: labelElement.textContent.trim(), element: labelElement };
          }
        }
      }
      
      // Method 4: Use the first option's label if it seems like a question
      if (!groupLabel && options.length > 0) {
        const firstLabel = options[0].label;
        if (firstLabel && firstLabel.match(/\?|:|\b(select|choose|indicate)\b/i)) {
          groupLabel = { text: firstLabel, element: null };
        }
      }
      
      // Get position from first element for sorting
      const rect = groupElements[0].getBoundingClientRect();
      const domPosition = Array.from(this.root.querySelectorAll('*')).indexOf(groupElements[0]);
      
      // Find which section this field belongs to
      const section = this._findFieldSection(groupElements[0]);
      
      // Build the field object
      const field = {
        element: groupElements[0], // Use first element as representative
        elements: groupElements, // Store all elements
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
        // Position information for sorting
        position: {
          top: rect.top + window.scrollY, // Add scrollY for absolute position
          left: rect.left + window.scrollX, // Add scrollX for absolute position
          domIndex: domPosition
        },
        // Section information
        section: section
      };
      
      // For checkboxes with only one option, check if it's a boolean field
      if (groupType === 'checkbox' && groupElements.length === 1) {
        // Check if the label indicates a yes/no question
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
   * Check if a field is user-facing and should be displayed
   * @param {Object} field - The field object
   * @returns {boolean} True if the field should be displayed
   * @private
   */
  _isUserFacingField(field) {
    try {
      const labelText = field.label?.text || '';
      const fieldName = field.name || '';
      const fieldId = field.id || '';
      const placeholder = field.placeholder || '';
      const fieldType = field.type || '';
      
      // Combine all text for comprehensive checking
      const allText = `${labelText} ${fieldName} ${fieldId} ${placeholder}`.toLowerCase();
      
      // Skip password fields - they're typically for login, not registration
      if (fieldType === 'password') {
        console.log(`[BRA-FieldDetector] Skipping password field - likely login form`);
        return false;
      }
      
      // Skip login/signin related fields
      const loginPatterns = /\b(login|signin|sign\s*in|username|user\s*name|remember\s*me|forgot|reset)\b/i;
      if (loginPatterns.test(allText)) {
        // Exception: if it's asking for creating a username/password for the new business account, include it
        const registrationContext = /\b(create|new|register|choose|select)\s*(your|a|an)?\s*(username|password|account)\b/i;
        if (!registrationContext.test(allText)) {
          console.log(`[BRA-FieldDetector] Skipping login-related field: "${labelText}"`);
          return false;
        }
      }
      
      // Skip search boxes
      const searchPatterns = /\b(search|find|looking\s*for|can't\s*find|help\s*me\s*find)\b/i;
      if (searchPatterns.test(allText) || fieldType === 'search') {
        console.log(`[BRA-FieldDetector] Skipping search field: "${labelText}"`);
        return false;
      }
      
      // Filter out internal ID patterns (expanded)
      const internalIdPattern = /^(Dbc-\d+|Ds-\w+|Required|Optional|Field\d+|field_\d+|input_\d+|__.*|_.*|temp.*|hidden.*|test.*|debug.*)$/i;
      
      // Check if the label text looks like an internal ID
      if (internalIdPattern.test(labelText.trim())) {
        // Try to find a better label by looking at parent elements
        const element = field.element || field.elements?.[0];
        if (element) {
          // Look for text in parent containers
          let parent = element.parentElement;
          let attempts = 0;
          while (parent && attempts < 3) {
            // Clone parent and remove input elements to get clean text
            const parentClone = parent.cloneNode(true);
            parentClone.querySelectorAll('input, select, textarea, label').forEach(el => el.remove());
            const parentText = parentClone.textContent.trim();
            
            // Check if parent has meaningful text
            if (parentText && parentText.length > 3 && parentText.length < 200 && !internalIdPattern.test(parentText)) {
              // Also check parent text isn't login/search related
              if (!loginPatterns.test(parentText) && !searchPatterns.test(parentText)) {
                field.label = { text: parentText, element: parent };
                console.log(`[BRA-FieldDetector] Found better label from parent: "${parentText}"`);
                return true;
              }
            }
            
            parent = parent.parentElement;
            attempts++;
          }
        }
        
        // If we still only have an internal ID and no other meaningful text, skip it
        if (!field.placeholder && !field.title && !field.attributes?.['aria-label']) {
          console.log(`[BRA-FieldDetector] Skipping field with internal ID label: "${labelText}"`);
          return false;
        }
      }
      
      // Skip fields with only generic labels and no other identifying information
      const genericLabels = /^(field|input|select|checkbox|radio|option|item|value|data|entry|text|submit|button|click)$/i;
      if (genericLabels.test(labelText.trim()) && !field.placeholder && !field.title) {
        console.log(`[BRA-FieldDetector] Skipping field with generic label: "${labelText}"`);
        return false;
      }
      
      // Skip fields that have only name/id that look like internal identifiers
      if (!labelText && (internalIdPattern.test(fieldName) || internalIdPattern.test(fieldId))) {
        console.log(`[BRA-FieldDetector] Skipping field with internal name/id: name="${fieldName}", id="${fieldId}"`);
        return false;
      }
      
      // For email fields, check context to determine if it's login or registration
      if (fieldType === 'email' || allText.includes('email')) {
        // Check if it's in a login context
        const form = (field.element || field.elements?.[0])?.closest('form');
        if (form) {
          const formText = form.textContent.toLowerCase();
          const hasPassword = form.querySelector('input[type="password"]');
          const hasBusinessFields = /\b(business|company|ein|tax|entity|llc|corp)\b/i.test(formText);
          
          // If form has password field but no business fields, likely a login form
          if (hasPassword && !hasBusinessFields) {
            console.log(`[BRA-FieldDetector] Skipping email field in likely login form`);
            return false;
          }
        }
      }
      
      // Prioritize business registration fields
      const businessPatterns = /\b(business|company|organization|entity|ein|tax|ssn|naics|owner|principal|agent|address|city|state|zip|phone|fax|dba|trade\s*name|formation|registration|license|permit)\b/i;
      
      // If it matches business patterns, likely include it
      if (businessPatterns.test(allText)) {
        console.log(`[BRA-FieldDetector] Including business-related field: "${labelText}"`);
        return true;
      }
      
      // Require at least one meaningful identifier
      const hasMeaningfulLabel = labelText && !internalIdPattern.test(labelText) && !genericLabels.test(labelText);
      const hasMeaningfulPlaceholder = field.placeholder && field.placeholder.length > 2;
      const hasMeaningfulTitle = field.title && field.title.length > 2;
      const hasMeaningfulAriaLabel = field.attributes?.['aria-label'] && field.attributes['aria-label'].length > 2;
      
      if (!hasMeaningfulLabel && !hasMeaningfulPlaceholder && !hasMeaningfulTitle && !hasMeaningfulAriaLabel) {
        console.log(`[BRA-FieldDetector] Skipping field with no meaningful identifiers`);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error in _isUserFacingField:', error);
      return true; // Default to including the field if there's an error
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
        const labelFor = this.root.querySelector(`label[for="${element.id}"]`);
        if (labelFor) {
          labelElement = labelFor;
          labelText = labelFor.textContent.trim();
        }
      }
      
      // Method 3: Check aria-label and aria-labelledby
      if (!labelText) {
        if (element.getAttribute('aria-label')) {
          labelText = element.getAttribute('aria-label');
        } else if (element.getAttribute('aria-labelledby')) {
          const labelledBy = this.root.getElementById(element.getAttribute('aria-labelledby'));
          if (labelledBy) {
            labelElement = labelledBy;
            labelText = labelledBy.textContent.trim();
          }
        }
      }
      
      // Method 4: Check for parent label element
      if (!labelText) {
        const parentLabel = element.closest('label');
        if (parentLabel) {
          // Clone to avoid modifying the DOM
          const labelClone = parentLabel.cloneNode(true);
          // Remove the input element from the clone
          const inputInLabel = labelClone.querySelector('input, select, textarea');
          if (inputInLabel) inputInLabel.remove();
          labelText = labelClone.textContent.trim();
          labelElement = parentLabel;
        }
      }
      
      // Method 5: Check for preceding sibling text or label
      if (!labelText) {
        let sibling = element.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === 'LABEL' || sibling.tagName === 'SPAN' || sibling.tagName === 'DIV') {
            const text = sibling.textContent.trim();
            if (text && text.length > 2 && text.length < 100) {
              labelText = text;
              labelElement = sibling;
              break;
            }
          }
          sibling = sibling.previousElementSibling;
        }
      }
      
      // Method 6: Check for text in parent container
      if (!labelText) {
        const parent = element.parentElement;
        if (parent) {
          // Clone parent to avoid modifying DOM
          const parentClone = parent.cloneNode(true);
          // Remove all form elements
          parentClone.querySelectorAll('input, select, textarea, button').forEach(el => el.remove());
          const parentText = parentClone.textContent.trim();
          if (parentText && parentText.length > 2 && parentText.length < 100) {
            labelText = parentText;
            labelElement = parent;
          }
        }
      }
      
      // Method 7: Check for placeholder as a fallback
      if (!labelText && element.placeholder) {
        labelText = element.placeholder;
      }
      
      // Method 8: Check title attribute
      if (!labelText && element.title) {
        labelText = element.title;
      }
      
      // Method 9: Use name attribute as last resort
      if (!labelText && element.name) {
        // Convert name to readable format (e.g., first_name -> First Name)
        labelText = element.name
          .replace(/_/g, ' ')
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/\b\w/g, l => l.toUpperCase());
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
      
      // Special handling for boolean fields
      if (field.type === 'boolean_field') {
        const labelText = field.label?.text?.toLowerCase() || '';
        if (labelText.match(/certif|acknowledge|agree|confirm|attest/i)) {
          return {
            category: 'certifications',
            confidence: 90,
            type: 'boolean',
            matchedPatterns: ['certification/agreement field']
          };
        }
      }
      
      // Special handling for select fields (radio/checkbox groups)
      if (field.type === 'single_select' || field.type === 'multi_select' || field.type === 'select') {
        const labelText = field.label?.text?.toLowerCase() || '';
        const optionTexts = field.options?.map(o => o.label.toLowerCase()).join(' ') || '';
        
        // Check if it's an entity type selection
        if (labelText.match(/entity.*type|business.*type|organization.*type|structure|form.*business/i) ||
            optionTexts.match(/llc|corporation|partnership|sole|inc\.|corp\.|limited/i)) {
          return {
            category: 'entity_type',
            confidence: 85,
            type: field.type,
            matchedPatterns: ['entity type selection']
          };
        }
        
        // Check if it's a business structure selection
        if (optionTexts.match(/llc|inc|corp|partnership|proprietor/i)) {
          return {
            category: 'business_structure',
            confidence: 80,
            type: field.type,
            matchedPatterns: ['business structure selection']
          };
        }
        
        // Check for state selection
        if (labelText.match(/state|province|jurisdiction/i) || 
            optionTexts.match(/alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|florida|georgia/i)) {
          return {
            category: 'state',
            confidence: 85,
            type: field.type,
            matchedPatterns: ['state selection']
          };
        }
        
        // Check for yes/no questions
        if (optionTexts.match(/^(yes|no|true|false)$/i) && field.options?.length === 2) {
          return {
            category: 'boolean_field',
            confidence: 85,
            type: field.type,
            matchedPatterns: ['yes/no selection']
          };
        }
        
        // Generic business selection
        if (labelText.match(/business|company|organization|registration|permit|license/i)) {
          return {
            category: 'business_selection',
            confidence: 70,
            type: field.type,
            matchedPatterns: ['business-related selection']
          };
        }
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
      
      // If we have a match with sufficient confidence, return it
      if (bestScore >= 20 && bestMatch) {
        return bestMatch;
      }
      
      // Fallback classification for unmatched fields
      // If it's a form field on a business registration page, classify it generically
      const labelText = field.label?.text?.toLowerCase() || '';
      const fieldName = field.name?.toLowerCase() || '';
      const fieldId = field.id?.toLowerCase() || '';
      
      // Check if it has any business-related context
      const businessContext = 
        labelText.match(/business|company|organization|registration|form|application|permit|license|tax|ein|ssn|fein/i) ||
        fieldName.match(/business|company|organization|registration|form|application|permit|license|tax|ein|ssn|fein/i) ||
        fieldId.match(/business|company|organization|registration|form|application|permit|license|tax|ein|ssn|fein/i);
      
      if (businessContext) {
        // Classify based on field type
        let category = 'other';
        if (field.type === 'email') category = 'email';
        else if (field.type === 'tel') category = 'phone';
        else if (field.type === 'date') category = 'date_field';
        else if (field.type === 'number') category = 'number_field';
        else if (field.type === 'single_select' || field.type === 'multi_select') category = 'selection_field';
        else if (field.type === 'boolean_field') category = 'boolean_field';
        else if (field.type === 'textarea') category = 'text_field';
        else category = 'business_field';
        
        return {
          category: category,
          confidence: 50,
          type: field.type,
          matchedPatterns: ['business context field']
        };
      }
      
      // For any other field on a form, give it a generic classification
      if (field.type && field.label?.text) {
        return {
          category: 'form_field',
          confidence: 40,
          type: field.type,
          matchedPatterns: ['generic form field']
        };
      }
      
      return null;
      
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
   * Detect sections in the form
   * @private
   */
  _detectSections() {
    try {
      console.log('[BRA-FieldDetector] Detecting form sections...');
      this.sections = [];
      
      // Get default font size for comparison
      const bodyStyle = window.getComputedStyle(document.body);
      const baseFontSize = parseFloat(bodyStyle.fontSize) || 16;
      
      // Track processed elements to avoid duplicates
      const processedElements = new Set();
      const potentialHeaders = [];
      
      // First, identify the main form area to exclude page headers
      const formContainers = this._identifyFormContainers();
      console.log(`[BRA-FieldDetector] Found ${formContainers.length} form containers`);
      
      // 1. Collect all potential header elements WITHIN form containers
      
      // Fieldsets with legends (highest priority)
      formContainers.forEach(container => {
        const fieldsets = container.querySelectorAll('fieldset');
        fieldsets.forEach(fieldset => {
          const legend = fieldset.querySelector('legend');
          if (legend) {
            const fields = fieldset.querySelectorAll('input, select, textarea');
            if (fields.length > 0) {
              potentialHeaders.push({
                element: legend,
                text: legend.textContent.trim(),
                type: 'legend',
                priority: 1,
                container: fieldset,
                fieldCount: fields.length,
                distanceToFields: 0 // Legend is always close to its fields
              });
            }
          }
        });
      });
      
      // Heading tags (h1-h6) within form areas
      formContainers.forEach(formContainer => {
        const headings = formContainer.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(heading => {
          // Check proximity to form fields
          const nearbyFields = this._findNearbyFields(heading, formContainer);
          if (nearbyFields.container && nearbyFields.fields.length > 0 && !nearbyFields.isFieldLabel) {
            potentialHeaders.push({
              element: heading,
              text: heading.textContent.trim(),
              type: 'heading',
              priority: 2,
              container: nearbyFields.container,
              fieldCount: nearbyFields.fields.length,
              distanceToFields: nearbyFields.distance,
              uniqueFieldGroups: nearbyFields.uniqueFieldGroups
            });
          }
        });
      });
      
      // Look for structural section containers
      formContainers.forEach(formContainer => {
        // Find divs/sections that might be section containers
        const structuralContainers = formContainer.querySelectorAll([
          'div[class*="section"]',
          'div[class*="group"]',
          'div[class*="panel"]',
          'div[class*="card"]',
          'div[class*="block"]',
          'section',
          'article',
          '.row',
          '.form-row',
          '.form-group'
        ].join(', '));
        
        structuralContainers.forEach(container => {
          // Check if this container has multiple fields
          const fields = container.querySelectorAll('input:not([type="hidden"]), select, textarea');
          if (fields.length < 2) return;
          
          // Look for a heading within this container
          const heading = container.querySelector('h1, h2, h3, h4, h5, h6, .title, .heading, [class*="title"], [class*="heading"]');
          
          if (heading && !processedElements.has(container)) {
            const headingText = heading.textContent.trim();
            if (headingText && !this._isDefinitelyFieldLabel(headingText) && !this._looksLikeFieldGroupLabel(headingText)) {
              const rect = heading.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              
              potentialHeaders.push({
                element: heading,
                text: headingText,
                type: 'structural',
                priority: 2.5, // Between heading and styled
                container: container,
                fieldCount: fields.length,
                distanceToFields: 0,
                uniqueFieldGroups: this._countUniqueFieldGroups(Array.from(fields))
              });
              
              processedElements.add(container);
            }
          }
        });
      });
      
      // Elements with header-like styling within form areas
      formContainers.forEach(formContainer => {
        const allTextElements = formContainer.querySelectorAll('div, span, p, b, strong, label');
        allTextElements.forEach(element => {
          // Skip if it's a form element or contains form elements
          if (element.querySelector('input, select, textarea')) {
            return;
          }
          
          // Skip if it's a label for a single field
          if (element.tagName === 'LABEL' && element.getAttribute('for')) {
            return;
          }
          
          const text = element.textContent.trim();
          if (!text || text.length < 3 || text.length > 100) {
            return;
          }
          
          // Skip if it looks like site branding or navigation
          if (this._looksLikeSiteBranding(text, element)) {
            return;
          }
          
          // Check if this element has header-like styling
          const styles = window.getComputedStyle(element);
          const fontSize = parseFloat(styles.fontSize);
          const fontWeight = parseFloat(styles.fontWeight) || 400;
          const marginTop = parseFloat(styles.marginTop) || 0;
          const marginBottom = parseFloat(styles.marginBottom) || 0;
          const paddingTop = parseFloat(styles.paddingTop) || 0;
          const paddingBottom = parseFloat(styles.paddingBottom) || 0;
          const display = styles.display;
          
          // Score based on visual properties
          let headerScore = 0;
          
          // Font size larger than base
          if (fontSize > baseFontSize * 1.1) {
            headerScore += 2;
          }
          
          // Bold or semi-bold
          if (fontWeight > 400) {
            headerScore += 2;
          }
          
          // Has significant spacing
          if ((marginTop + paddingTop) > 10 || (marginBottom + paddingBottom) > 10) {
            headerScore += 1;
          }
          
          // Block-level display (not inline)
          if (display === 'block' || display === 'flex' || display === 'grid') {
            headerScore += 1;
          }
          
          // Has header-like class names
          const className = (element.className || '').toLowerCase();
          if (className.match(/header|heading|title|section|group/) && 
              !className.match(/page-header|site-header|nav|brand/)) {
            headerScore += 2;
          }
          
          // Only consider if it has a good header score
          if (headerScore >= 3) {
            // Check proximity to form fields
            const nearbyFields = this._findNearbyFields(element, formContainer);
            // Must have multiple fields and NOT be a field label
            if (nearbyFields.container && nearbyFields.fields.length >= 2 && 
                !nearbyFields.isFieldLabel && nearbyFields.uniqueFieldGroups >= 2) {
              potentialHeaders.push({
                element: element,
                text: text,
                type: 'styled',
                priority: 3,
                container: nearbyFields.container,
                fieldCount: nearbyFields.fields.length,
                headerScore: headerScore,
                distanceToFields: nearbyFields.distance,
                uniqueFieldGroups: nearbyFields.uniqueFieldGroups
              });
            }
          }
        });
      });
      
      // 2. Sort potential headers by proximity to fields and priority
      potentialHeaders.sort((a, b) => {
        // First by distance to fields (closer is better)
        if (a.distanceToFields !== b.distanceToFields) {
          return a.distanceToFields - b.distanceToFields;
        }
        // Then by priority (lower number = higher priority)
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // Then by field count (more fields is better)
        return b.fieldCount - a.fieldCount;
      });
      
      // 3. Filter and validate potential headers
      potentialHeaders.forEach(header => {
        // Skip if text is too short or looks like a field label
        if (header.text.length < 3 || this._isDefinitelyFieldLabel(header.text)) {
          return;
        }
        
        // Additional check for field labels that might look like headers
        if (this._looksLikeFieldGroupLabel(header.text)) {
          console.log(`[BRA-FieldDetector] Skipping field group label: "${header.text}"`);
          return;
        }
        
        // Skip if has too few unique field groups (likely a field label)
        if (header.uniqueFieldGroups && header.uniqueFieldGroups < 2) {
          console.log(`[BRA-FieldDetector] Skipping header with only ${header.uniqueFieldGroups} field group(s): "${header.text}"`);
          return;
        }
        
        // Skip if too far from fields (likely page header)
        if (header.distanceToFields > 200) { // 200px max distance
          console.log(`[BRA-FieldDetector] Skipping header too far from fields: "${header.text}" (${header.distanceToFields}px)`);
          return;
        }
        
        // Skip if already processed
        if (processedElements.has(header.element) || processedElements.has(header.container)) {
          return;
        }
        
        // Skip if this header is inside another section
        const isNested = this.sections.some(section => 
          section.element.contains(header.element) || 
          (section.container && section.container.contains(header.element))
        );
        if (isNested) {
          return;
        }
        
        // Calculate position
        const rect = header.element.getBoundingClientRect();
        const containerRect = header.container.getBoundingClientRect();
        
        // Add to sections
        this.sections.push({
          name: header.text,
          element: header.element,
          container: header.container,
          type: header.type,
          index: this.sections.length,
          priority: header.priority,
          fieldCount: header.fieldCount,
          distanceToFields: header.distanceToFields,
          position: {
            top: rect.top + window.scrollY,
            bottom: containerRect.bottom + window.scrollY
          }
        });
        
        processedElements.add(header.element);
        processedElements.add(header.container);
      });
      
      // 3. If no sections found, try to infer from form structure
      if (this.sections.length === 0) {
        this._inferSectionsFromStructure();
      }
      
      // 3.5. Look for visual breaks between form fields
      this._detectSectionsByFieldClusters();
      
      // 4. Detect section boundaries using DOM structure
      this._refineSectionBoundaries();
      
      // Sort sections by position
      this.sections.sort((a, b) => a.position.top - b.position.top);
      
      // Re-index after sorting
      this.sections.forEach((section, index) => {
        section.index = index;
      });
      
      // If still no sections but we have fields, create a default section
      if (this.sections.length === 0 && this.root.querySelector('input, select, textarea')) {
        const formTitle = document.title.match(/business|registration|form/i) ? 'Business Registration' : 'Form Fields';
        this.sections.push({
          name: formTitle,
          element: this.root,
          type: 'default',
          index: 0,
          position: {
            top: 0,
            bottom: Number.MAX_SAFE_INTEGER
          }
        });
      }
      
      console.log(`[BRA-FieldDetector] Found ${this.sections.length} sections:`, 
        this.sections.map(s => `${s.name} (${s.type}, top: ${Math.round(s.position.top)}, bottom: ${Math.round(s.position.bottom)})`));
      
    } catch (error) {
      console.error('[BRA-FieldDetector] Error detecting sections:', error);
      this.sections = [];
    }
  }
  
  /**
   * Identify main form containers to exclude page headers
   * @returns {Array<HTMLElement>} Form container elements
   * @private
   */
  _identifyFormContainers() {
    const containers = [];
    
    // 1. Find actual <form> elements
    const forms = this.root.querySelectorAll('form');
    forms.forEach(form => containers.push(form));
    
    // 2. Find containers with high concentration of form fields
    if (containers.length === 0) {
      const allContainers = this.root.querySelectorAll('div, section, article, main');
      allContainers.forEach(container => {
        const fields = container.querySelectorAll('input, select, textarea');
        const totalFields = this.root.querySelectorAll('input, select, textarea').length;
        
        // If this container has more than 50% of all fields, it's likely the main form area
        if (fields.length > 0 && fields.length >= totalFields * 0.5) {
          // Exclude if it looks like page wrapper (too many non-form elements)
          const allElements = container.querySelectorAll('*').length;
          const fieldRatio = fields.length / allElements;
          
          if (fieldRatio > 0.1) { // At least 10% of elements are fields
            containers.push(container);
          }
        }
      });
    }
    
    // 3. If still no containers, use the root
    if (containers.length === 0) {
      containers.push(this.root);
    }
    
    // Remove duplicate/nested containers
    const uniqueContainers = [];
    containers.forEach(container => {
      const isNested = uniqueContainers.some(existing => 
        existing.contains(container) || container.contains(existing)
      );
      if (!isNested) {
        uniqueContainers.push(container);
      }
    });
    
    return uniqueContainers;
  }
  
  /**
   * Find fields near a potential header element
   * @param {HTMLElement} header - The potential header element
   * @param {HTMLElement} searchContainer - Container to search within
   * @returns {Object} Object with container, fields array, and distance
   * @private
   */
  _findNearbyFields(header, searchContainer) {
    const headerRect = header.getBoundingClientRect();
    const headerBottom = headerRect.bottom;
    
    // Look for container with fields after the header
    const container = this._findSectionContainer(header);
    if (!container) {
      return { container: null, fields: [], distance: Infinity, isFieldLabel: false };
    }
    
    // Get fields in the container
    const fields = Array.from(container.querySelectorAll('input, select, textarea'))
      .filter(field => {
        // Exclude hidden fields
        if (field.type === 'hidden') return false;
        
        // Check if field is visible
        const style = window.getComputedStyle(field);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        
        // Make sure field is within the search container
        return searchContainer.contains(field);
      });
    
    // Check if this looks like a field label (not a section header)
    let isFieldLabel = false;
    
    // 1. Check if all fields have the same name (radio/checkbox group)
    const fieldNames = fields.map(f => f.name).filter(name => name);
    const uniqueNames = [...new Set(fieldNames)];
    if (uniqueNames.length === 1 && fields.length > 1) {
      // All fields have the same name - this is likely a field group label
      isFieldLabel = true;
      console.log(`[BRA-FieldDetector] "${header.textContent.trim()}" looks like field label - all fields have same name: ${uniqueNames[0]}`);
    }
    
    // 2. Check if fields are all the same type and closely positioned
    const fieldTypes = [...new Set(fields.map(f => f.type))];
    if (fieldTypes.length === 1 && (fieldTypes[0] === 'radio' || fieldTypes[0] === 'checkbox')) {
      // Check if fields are closely grouped (likely options for one field)
      let maxGap = 0;
      for (let i = 1; i < fields.length; i++) {
        const prevRect = fields[i-1].getBoundingClientRect();
        const currRect = fields[i].getBoundingClientRect();
        const gap = currRect.top - prevRect.bottom;
        maxGap = Math.max(maxGap, gap);
      }
      
      if (maxGap < 50) { // Options are closely spaced
        isFieldLabel = true;
        console.log(`[BRA-FieldDetector] "${header.textContent.trim()}" looks like field label - closely grouped ${fieldTypes[0]} buttons`);
      }
    }
    
    // 3. Check if header is inside a label element or has label-like structure
    if (header.closest('label') || header.querySelector('input, select, textarea')) {
      isFieldLabel = true;
      console.log(`[BRA-FieldDetector] "${header.textContent.trim()}" is inside or contains form elements`);
    }
    
    // 4. Check if there are too few unique fields for a section
    const uniqueFieldGroups = this._countUniqueFieldGroups(fields);
    if (uniqueFieldGroups < 2) {
      isFieldLabel = true;
      console.log(`[BRA-FieldDetector] "${header.textContent.trim()}" has only ${uniqueFieldGroups} unique field group(s)`);
    }
    
    // Calculate distance from header to first field
    let minDistance = Infinity;
    fields.forEach(field => {
      const fieldRect = field.getBoundingClientRect();
      const distance = fieldRect.top - headerBottom;
      if (distance >= 0 && distance < minDistance) {
        minDistance = distance;
      }
    });
    
    return {
      container: container,
      fields: fields,
      distance: minDistance === Infinity ? 0 : minDistance,
      isFieldLabel: isFieldLabel,
      uniqueFieldGroups: uniqueFieldGroups
    };
  }
  
  /**
   * Count unique field groups (fields with different names/purposes)
   * @param {Array<HTMLElement>} fields - Array of field elements
   * @returns {number} Number of unique field groups
   * @private
   */
  _countUniqueFieldGroups(fields) {
    const groups = new Set();
    
    fields.forEach(field => {
      if (field.type === 'radio' || field.type === 'checkbox') {
        // Group by name for radio/checkbox
        if (field.name) {
          groups.add(`${field.type}-${field.name}`);
        } else {
          groups.add(`${field.type}-${field.id || Math.random()}`);
        }
      } else {
        // Each other field type is its own group
        groups.add(`${field.type}-${field.name || field.id || Math.random()}`);
      }
    });
    
    return groups.size;
  }
  
  /**
   * Check if text/element looks like site branding or navigation
   * @param {string} text - Text to check
   * @param {HTMLElement} element - Element to check
   * @returns {boolean} True if it looks like branding/navigation
   * @private
   */
  _looksLikeSiteBranding(text, element) {
    const lowerText = text.toLowerCase();
    
    // Common branding/navigation patterns
    const brandingPatterns = [
      /^(home|about|contact|services|products|login|sign\s*in|register|menu)$/i,
      /^welcome\s+to/i,
      /copyright|©|all\s+rights\s+reserved/i,
      /^\w+\.(com|org|gov|net|edu)$/i, // Domain names
      /^(logo|brand|header|nav|navigation)$/i
    ];
    
    if (brandingPatterns.some(pattern => pattern.test(text))) {
      return true;
    }
    
    // Check element location - likely header if too high on page
    const rect = element.getBoundingClientRect();
    const topPosition = rect.top + window.scrollY;
    if (topPosition < 200) { // Within first 200px of page
      // But allow if it's inside a form
      const closestForm = element.closest('form');
      if (!closestForm) {
        return true;
      }
    }
    
    // Check classes/IDs for navigation indicators
    const classAndId = `${element.className} ${element.id}`.toLowerCase();
    if (classAndId.match(/\b(nav|navigation|menu|header|masthead|brand|logo)\b/)) {
      return true;
    }
    
    // Check if parent is header/nav element
    if (element.closest('header, nav, [role="navigation"], [role="banner"]')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Refine section boundaries by analyzing DOM structure
   * @private
   */
  _refineSectionBoundaries() {
    if (this.sections.length === 0) return;
    
    // Sort sections by position
    this.sections.sort((a, b) => a.position.top - b.position.top);
    
    // Update section boundaries based on next section or container boundaries
    for (let i = 0; i < this.sections.length; i++) {
      const section = this.sections[i];
      const nextSection = this.sections[i + 1];
      
      if (nextSection) {
        // Set bottom boundary to just before next section
        section.position.bottom = nextSection.position.top - 1;
      } else {
        // For last section, find the bottom-most field that would belong to it
        const allFields = this.root.querySelectorAll('input:not([type="hidden"]), select, textarea');
        let maxBottom = section.position.bottom;
        
        allFields.forEach(field => {
          const fieldRect = field.getBoundingClientRect();
          const fieldTop = fieldRect.top + window.scrollY;
          const fieldBottom = fieldRect.bottom + window.scrollY;
          
          // If field is after this section header and visible
          if (fieldTop > section.position.top) {
            const style = window.getComputedStyle(field);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              maxBottom = Math.max(maxBottom, fieldBottom);
            }
          }
        });
        
        section.position.bottom = maxBottom + 50; // Add some padding
      }
    }
    
    // Look for visual separators between sections
    this._detectVisualSeparators();
  }
  
  /**
   * Detect visual separators that might indicate section boundaries
   * @private
   */
  _detectVisualSeparators() {
    const separatorSelectors = [
      'hr', // Horizontal rules
      '.divider',
      '.separator',
      '[class*="divider"]',
      '[class*="separator"]'
    ];
    
    const separators = this.root.querySelectorAll(separatorSelectors.join(', '));
    
    separators.forEach(separator => {
      const rect = separator.getBoundingClientRect();
      const separatorTop = rect.top + window.scrollY;
      
      // Find which sections this separator falls between
      for (let i = 0; i < this.sections.length - 1; i++) {
        const section = this.sections[i];
        const nextSection = this.sections[i + 1];
        
        if (separatorTop > section.position.top && separatorTop < nextSection.position.top) {
          // Adjust section boundaries to respect the separator
          section.position.bottom = Math.min(section.position.bottom, separatorTop - 10);
          console.log(`[BRA-FieldDetector] Found separator between "${section.name}" and "${nextSection.name}"`);
        }
      }
    });
    
    // Also look for large gaps between form elements that might indicate sections
    this._detectLargeGaps();
  }
  
  /**
   * Detect large gaps between form elements that might indicate section breaks
   * @private
   */
  _detectLargeGaps() {
    const allFields = Array.from(this.root.querySelectorAll('input:not([type="hidden"]), select, textarea'))
      .filter(field => {
        const style = window.getComputedStyle(field);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .sort((a, b) => {
        const aTop = a.getBoundingClientRect().top + window.scrollY;
        const bTop = b.getBoundingClientRect().top + window.scrollY;
        return aTop - bTop;
      });
    
    // Look for gaps larger than 100px between consecutive fields
    const GAP_THRESHOLD = 100;
    
    for (let i = 0; i < allFields.length - 1; i++) {
      const currentField = allFields[i];
      const nextField = allFields[i + 1];
      
      const currentBottom = currentField.getBoundingClientRect().bottom + window.scrollY;
      const nextTop = nextField.getBoundingClientRect().top + window.scrollY;
      const gap = nextTop - currentBottom;
      
      if (gap > GAP_THRESHOLD) {
        // Check if there's already a section boundary here
        const gapMiddle = currentBottom + gap / 2;
        
        // See if any section boundary is near this gap
        let foundNearbyBoundary = false;
        for (const section of this.sections) {
          if (Math.abs(section.position.top - gapMiddle) < 50) {
            foundNearbyBoundary = true;
            break;
          }
        }
        
        if (!foundNearbyBoundary) {
          console.log(`[BRA-FieldDetector] Large gap (${Math.round(gap)}px) detected between fields at position ${Math.round(gapMiddle)}`);
          
          // Find which section this gap is in and potentially split it
          for (let j = 0; j < this.sections.length; j++) {
            const section = this.sections[j];
            if (gapMiddle > section.position.top && gapMiddle < section.position.bottom) {
              // Update the current section's bottom
              section.position.bottom = currentBottom + 20;
              console.log(`[BRA-FieldDetector] Adjusted "${section.name}" bottom boundary due to gap`);
              break;
            }
          }
        }
      }
    }
  }
  
  /**
   * Try to infer sections from form structure when no explicit headers found
   * @private
   */
  _inferSectionsFromStructure() {
    console.log('[BRA-FieldDetector] Inferring sections from structure...');
    
    // Look for structural containers with section-like classes
    const sectionSelectors = [
      '[class*="section"]',
      '[class*="group"]',
      '[class*="panel"]',
      '[class*="block"]',
      '[class*="form-section"]',
      '[class*="form-group"]',
      '[class*="field-group"]',
      '[id*="section"]',
      '[id*="panel"]',
      'div[role="group"]',
      '.card',
      '.box'
    ];
    
    const potentialSections = this.root.querySelectorAll(sectionSelectors.join(', '));
    const processedContainers = new Set();
    
    potentialSections.forEach(container => {
      // Skip if already processed or is too small
      if (processedContainers.has(container)) return;
      
      const rect = container.getBoundingClientRect();
      if (rect.height < 50) return; // Too small to be a section
      
      // Check if it contains fields
      const fields = container.querySelectorAll('input:not([type="hidden"]), select, textarea');
      const visibleFields = Array.from(fields).filter(field => {
        const style = window.getComputedStyle(field);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      
      if (visibleFields.length >= 2) {
        // Look for a heading within this container
        const headingSelectors = 'h1, h2, h3, h4, h5, h6, .heading, .title, [class*="heading"], [class*="title"]';
        const heading = container.querySelector(headingSelectors);
        
        let sectionName = null;
        if (heading) {
          sectionName = heading.textContent.trim();
        } else {
          // Try to infer from field content
          sectionName = this._inferSectionNameFromFields(visibleFields);
        }
        
        if (sectionName && !this._looksLikeSiteBranding(heading || container)) {
          processedContainers.add(container);
          
          this.sections.push({
            name: sectionName,
            element: heading || container,
            container: container,
            type: 'structural',
            index: this.sections.length,
            fieldCount: visibleFields.length,
            position: {
              top: rect.top + window.scrollY,
              bottom: rect.bottom + window.scrollY
            }
          });
          
          console.log(`[BRA-FieldDetector] Found structural section: "${sectionName}" with ${visibleFields.length} fields`);
        }
      }
    });
    
    // If still no sections, look for forms themselves as sections
    if (this.sections.length === 0) {
      const forms = this.root.querySelectorAll('form');
      forms.forEach((form, index) => {
        const fields = form.querySelectorAll('input:not([type="hidden"]), select, textarea');
        if (fields.length > 0) {
          const rect = form.getBoundingClientRect();
          this.sections.push({
            name: `Form Section ${index + 1}`,
            element: form,
            container: form,
            type: 'form',
            index: this.sections.length,
            fieldCount: fields.length,
            position: {
              top: rect.top + window.scrollY,
              bottom: rect.bottom + window.scrollY
            }
          });
        }
      });
    }
  }
  
  /**
   * Infer section name from the fields it contains
   * @param {Array} fields - Array of field elements
   * @returns {string|null} Inferred section name
   * @private
   */
  _inferSectionNameFromFields(fields) {
    const fieldInfo = fields.map(f => {
      const label = this._findFieldLabel(f);
      return label?.text || f.name || f.placeholder || '';
    }).filter(t => t).map(t => t.toLowerCase());
    
    // Check for patterns in field names
    if (fieldInfo.some(t => t.match(/business|company|organization|entity|corporation/i))) {
      return 'Business Information';
    } else if (fieldInfo.some(t => t.match(/street|address|city|state|zip|postal/i))) {
      return 'Address Information';
    } else if (fieldInfo.some(t => t.match(/email|phone|fax|contact/i))) {
      return 'Contact Information';
    } else if (fieldInfo.some(t => t.match(/tax|ein|ssn|tin|federal/i))) {
      return 'Tax Information';
    } else if (fieldInfo.some(t => t.match(/owner|member|director|officer|agent/i))) {
      return 'Ownership Information';
    } else if (fieldInfo.some(t => t.match(/payment|card|billing|fee/i))) {
      return 'Payment Information';
    } else if (fieldInfo.some(t => t.match(/signature|sign|certify|acknowledge/i))) {
      return 'Certification';
    }
    
    return null;
  }
  
  /**
   * Detect sections by analyzing field clusters
   * @private
   */
  _detectSectionsByFieldClusters() {
    console.log('[BRA-FieldDetector] Detecting sections by field clusters...');
    
    // Get all visible fields sorted by position
    const allFields = Array.from(this.root.querySelectorAll('input:not([type="hidden"]), select, textarea'))
      .filter(field => {
        const style = window.getComputedStyle(field);
        return style.display !== 'none' && style.visibility !== 'hidden';
      })
      .map(field => {
        const rect = field.getBoundingClientRect();
        const label = this._findFieldLabel(field);
        return {
          element: field,
          top: rect.top + window.scrollY,
          bottom: rect.bottom + window.scrollY,
          label: label?.text || field.name || field.placeholder || ''
        };
      })
      .sort((a, b) => a.top - b.top);
    
    if (allFields.length < 4) return; // Need at least 4 fields to detect clusters
    
    // Detect clusters based on gaps
    const clusters = [];
    let currentCluster = [allFields[0]];
    const GAP_THRESHOLD = 80; // Smaller threshold for section detection
    
    for (let i = 1; i < allFields.length; i++) {
      const prevField = allFields[i - 1];
      const currentField = allFields[i];
      const gap = currentField.top - prevField.bottom;
      
      if (gap > GAP_THRESHOLD) {
        // Large gap detected, start new cluster
        if (currentCluster.length >= 2) {
          clusters.push(currentCluster);
        }
        currentCluster = [currentField];
      } else {
        currentCluster.push(currentField);
      }
    }
    
    // Add last cluster
    if (currentCluster.length >= 2) {
      clusters.push(currentCluster);
    }
    
    console.log(`[BRA-FieldDetector] Found ${clusters.length} field clusters`);
    
    // Create sections for clusters if we found multiple
    if (clusters.length > 1 && this.sections.length <= 1) {
      this.sections = []; // Clear existing sections
      
      clusters.forEach((cluster, index) => {
        const sectionName = this._inferSectionNameFromFields(cluster.map(f => f.element)) || `Section ${index + 1}`;
        const topField = cluster[0];
        const bottomField = cluster[cluster.length - 1];
        
        this.sections.push({
          name: sectionName,
          element: topField.element,
          type: 'cluster',
          index: index,
          fieldCount: cluster.length,
          position: {
            top: topField.top - 30, // Add some padding above
            bottom: bottomField.bottom + 30 // Add some padding below
          }
        });
        
        console.log(`[BRA-FieldDetector] Created cluster section: "${sectionName}" with ${cluster.length} fields`);
      });
    }
  }
  
  /**
   * Check if text is definitely a field label rather than a section header
   * @param {string} text - Text to check
   * @returns {boolean} True if it's definitely a field label
   * @private
   */
  _isDefinitelyFieldLabel(text) {
    // Single words that are common field labels
    const singleFieldWords = [
      'email', 'phone', 'fax', 'name', 'address', 'city', 'state', 'zip',
      'ein', 'ssn', 'dba', 'yes', 'no', 'date', 'amount', 'number'
    ];
    
    const trimmedText = text.trim().toLowerCase();
    
    // Check if it's a single common field word
    if (singleFieldWords.includes(trimmedText)) {
      return true;
    }
    
    // Check if it ends with a colon or asterisk (common for field labels)
    if (trimmedText.endsWith(':') || trimmedText.endsWith('*')) {
      // But allow if it's a longer phrase that might be a section
      if (trimmedText.length < 20) {
        return true;
      }
    }
    
    // Check for very specific field patterns
    const definiteFieldPatterns = [
      /^(enter|type|select|choose)\s+your?\s+/i, // "Enter your...", "Select your..."
      /^\w+\s*\*$/, // Single word with asterisk
      /^(required|optional)$/i,
      /^(yes|no|y\/n)$/i,
      /^\d+\.?\s*$/ // Just numbers
    ];
    
    return definiteFieldPatterns.some(pattern => pattern.test(trimmedText));
  }
  
  /**
   * Check if text looks like a field group label (like "ID Type" with options)
   * @param {string} text - Text to check
   * @returns {boolean} True if it looks like a field group label
   * @private
   */
  _looksLikeFieldGroupLabel(text) {
    const trimmedText = text.trim().toLowerCase();
    
    // Common patterns for field group labels
    const fieldGroupPatterns = [
      // Type selection patterns
      /^(id|identification)\s+type$/i,
      /^(entity|business|organization|company)\s+type$/i,
      /^(account|user|member)\s+type$/i,
      /^type\s+of\s+/i,
      /^select\s+(your\s+)?type$/i,
      
      // Selection/choice patterns
      /^choose\s+(one|an?\s+option)$/i,
      /^select\s+(one|an?\s+option|from)$/i,
      /^pick\s+(one|an?\s+option)$/i,
      
      // Option patterns
      /^(payment|delivery|shipping)\s+(method|option)s?$/i,
      /^(contact|notification)\s+preference$/i,
      
      // Yes/No question patterns
      /\?$/, // Questions often precede radio/checkbox options
      /^(do|does|is|are|have|has|will|would|should|can|could)\s+/i,
      
      // Gender/title selections
      /^(gender|sex|title|prefix|suffix)$/i,
      /^(mr|mrs|ms|dr|prof)\.?$/i
    ];
    
    return fieldGroupPatterns.some(pattern => pattern.test(trimmedText));
  }
  
  /**
   * Find the container element that holds form fields after a heading
   * @param {HTMLElement} heading - The heading element
   * @returns {HTMLElement|null} Container element or null
   * @private
   */
  _findSectionContainer(heading) {
    // Helper function to check if element has fields
    const hasFields = (elem) => elem && elem.querySelector('input, select, textarea');
    
    // Helper function to check if we should stop searching
    const isStopElement = (elem) => {
      if (!elem) return true;
      // Stop at other headers
      if (elem.matches('h1, h2, h3, h4, h5, h6')) return true;
      // Stop at other sections
      if (elem.matches('fieldset, section')) return true;
      // Stop if element has header-like styling
      const styles = window.getComputedStyle(elem);
      const fontSize = parseFloat(styles.fontSize);
      const bodyFontSize = parseFloat(window.getComputedStyle(document.body).fontSize);
      if (fontSize > bodyFontSize * 1.2) return true;
      return false;
    };
    
    // 1. Check immediate next siblings
    let sibling = heading.nextElementSibling;
    let distance = 0;
    while (sibling && distance < 5) { // Limit search distance
      if (hasFields(sibling)) {
        return sibling;
      }
      if (isStopElement(sibling)) {
        break;
      }
      sibling = sibling.nextElementSibling;
      distance++;
    }
    
    // 2. Check parent and its siblings
    let parent = heading.parentElement;
    if (parent) {
      // First check if parent itself contains fields
      if (hasFields(parent)) {
        // Make sure the fields are after the heading
        const headingIndex = Array.from(parent.children).indexOf(heading);
        const fieldsAfter = Array.from(parent.querySelectorAll('input, select, textarea'))
          .some(field => Array.from(parent.children).indexOf(field.closest('*')) > headingIndex);
        if (fieldsAfter) {
          return parent;
        }
      }
      
      // Check parent's next siblings
      sibling = parent.nextElementSibling;
      distance = 0;
      while (sibling && distance < 3) {
        if (hasFields(sibling)) {
          return sibling;
        }
        if (isStopElement(sibling)) {
          break;
        }
        sibling = sibling.nextElementSibling;
        distance++;
      }
    }
    
    // 3. Look for a following container div/section
    const allElements = Array.from(this.root.querySelectorAll('*'));
    const headingIndex = allElements.indexOf(heading);
    
    for (let i = headingIndex + 1; i < Math.min(headingIndex + 20, allElements.length); i++) {
      const elem = allElements[i];
      if (isStopElement(elem)) {
        break;
      }
      if (hasFields(elem) && !elem.contains(heading)) {
        return elem;
      }
    }
    
    return null;
  }
  
  /**
   * Process standalone headings that might indicate sections
   * @private
   * @deprecated Merged into main _detectSections method
   */
  _processStandaloneHeadings() {
    // This method is now integrated into _detectSections
    // Keeping stub for backwards compatibility
  }
  
  /**
   * Find which section a field belongs to
   * @param {HTMLElement} element - The field element
   * @returns {Object|null} Section information or null
   * @private
   */
  _findFieldSection(element) {
    if (!this.sections || this.sections.length === 0) {
      return null;
    }
    
    const rect = element.getBoundingClientRect();
    const fieldTop = rect.top + window.scrollY;
    
    // Sort sections by position if not already sorted
    const sortedSections = [...this.sections].sort((a, b) => a.position.top - b.position.top);
    
    // Find which section this field belongs to by checking boundaries
    for (let i = 0; i < sortedSections.length; i++) {
      const section = sortedSections[i];
      const nextSection = sortedSections[i + 1];
      
      // Define section boundaries
      const sectionStart = section.position.top;
      const sectionEnd = nextSection ? nextSection.position.top : Number.MAX_SAFE_INTEGER;
      
      // Check if field is within this section's boundaries
      if (fieldTop >= sectionStart && fieldTop < sectionEnd) {
        // Additional check: ensure field is actually after the section header
        if (fieldTop > section.position.top) {
          return section;
        }
      }
      
      // Check if element is contained within section's container
      if (section.container && section.container.contains(element)) {
        return section;
      }
    }
    
    // If no section found, return the last section if field is after it
    const lastSection = sortedSections[sortedSections.length - 1];
    if (lastSection && fieldTop > lastSection.position.top) {
      return lastSection;
    }
    
    return null;
  }

  /**
   * Get UI-ready data structure
   * @returns {Object} Structured data for UI display
   */
  getUIData() {
    // If we have detected sections, use them
    if (this.sections && this.sections.length > 0) {
      const sectionedData = {};
      
      // Create a section for fields without sections
      const uncategorizedFields = [];
      
      // Group fields by their sections
      this.fields.forEach(field => {
        if (field.section) {
          const sectionName = field.section.name;
          if (!sectionedData[sectionName]) {
            sectionedData[sectionName] = {
              label: sectionName,
              fields: [],
              priority: field.section.index
            };
          }
          
          sectionedData[sectionName].fields.push({
            element: field.element,
            label: field.label?.text || field.placeholder || field.name,
            type: field.type,
            originalType: field.originalType,
            required: field.required,
            category: field.classification?.category,
            confidence: field.classification?.confidence,
            value: field.value,
            options: field.options,
            index: field.index,
            position: field.position,
            classification: field.classification
          });
        } else {
          uncategorizedFields.push({
            element: field.element,
            label: field.label?.text || field.placeholder || field.name,
            type: field.type,
            originalType: field.originalType,
            required: field.required,
            category: field.classification?.category,
            confidence: field.classification?.confidence,
            value: field.value,
            options: field.options,
            index: field.index,
            position: field.position,
            classification: field.classification
          });
        }
      });
      
      // Add uncategorized fields if any
      if (uncategorizedFields.length > 0) {
        sectionedData['other'] = {
          label: 'Other Fields',
          fields: uncategorizedFields,
          priority: 999
        };
      }
      
      // Sort sections by priority
      const sortedSections = Object.entries(sectionedData)
        .sort((a, b) => a[1].priority - b[1].priority)
        .reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
      
      return {
        categories: sortedSections,
        sections: this.sections,
        summary: this.classificationSummary,
        totalFields: this.fields.length,
        classifiedFields: this.classificationSummary.classified
      };
    }
    
    // Fallback to category-based grouping if no sections detected
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
      if (['business_name', 'entity_type', 'dba', 'business_structure', 'business_purpose'].includes(category)) {
        targetCategory = 'business_info';
      } else if (['email', 'phone', 'fax'].includes(category)) {
        targetCategory = 'contact_info';
      } else if (['address', 'city', 'state', 'zip'].includes(category)) {
        targetCategory = 'address_info';
      } else if (['ein', 'tax_id', 'ssn'].includes(category)) {
        targetCategory = 'tax_info';
      } else if (['certifications', 'ownership_type'].includes(category)) {
        targetCategory = 'other';
      }
      
      categories[targetCategory].fields.push({
        element: field.element,
        label: field.label?.text || field.placeholder || field.name,
        type: field.type,
        originalType: field.originalType,
        required: field.required,
        category: category,
        confidence: field.classification.confidence,
        value: field.value,
        options: field.options,
        index: field.index,
        position: field.position,
        classification: field.classification
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
      sections: [],
      summary: this.classificationSummary,
      totalFields: this.fields.length,
      classifiedFields: this.classificationSummary.classified
    };
  }
}

// Export the module
export default FieldDetector;