/**
 * Field Detector Module
 * 
 * Detects and analyzes form fields on business registration forms.
 * This module helps identify input elements and extract their attributes.
 */

/**
 * Class for detecting and analyzing form fields
 */
class FieldDetector {
  /**
   * Create a new field detector
   * @param {HTMLElement|Document} rootElement - The root element to search within (form or document)
   * @param {Object} options - Configuration options
   * @param {boolean} options.debug - Whether to enable debug mode for extra logging
   */
  constructor(rootElement, options = {}) {
    this.root = rootElement || document;
    this.fields = [];
    this.fieldSummary = {};
    this.options = {
      debug: options.debug || false
    };
    
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
  }

  /**
   * Toggle debug mode
   * @param {boolean} enabled - Whether to enable debug mode
   */
  setDebugMode(enabled) {
    this.options.debug = Boolean(enabled);
    this._log(`Debug mode ${this.options.debug ? 'enabled' : 'disabled'}`);
  }

  /**
   * Log a message with the field detector prefix
   * @param {string} message - The message to log
   * @param {any} data - Optional data to log
   * @param {boolean} debugOnly - Whether to log only in debug mode
   * @private
   */
  _log(message, data, debugOnly = false) {
    if (debugOnly && !this.options.debug) {
      return;
    }
    
    const prefix = '[BRA-FieldDetector]';
    if (data) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  /**
   * Find all input fields within the root element
   * @returns {Array} Array of field objects with their attributes
   */
  detectFields() {
    try {
      this._log('Starting field detection');
      this.fields = [];
      this.fieldSummary = {};
      
      // Initialize field summary
      Object.keys(this.fieldGroups).forEach(group => {
        this.fieldSummary[group] = 0;
      });
      
      // Get all input elements
      const inputElements = this.root.querySelectorAll('input, select, textarea');
      this._log(`Found ${inputElements.length} potential input elements`);
      
      // Process each input element
      inputElements.forEach((element, index) => {
        try {
          const field = this._extractFieldInfo(element);
          if (field) {
            // Add index for reference
            field.index = index;
            
            // Add field to collection
            this.fields.push(field);
            
            // Update field summary
            this._updateFieldSummary(field);
            
            // Log individual field details
            this._logFieldDetails(field);
          }
        } catch (fieldError) {
          console.error('[BRA-FieldDetector] Error processing field:', fieldError);
        }
      });
      
      // Log summary
      this._logFieldSummary();
      
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
  }
  
  /**
   * Log detailed information about a field
   * @param {Object} field - The field object
   * @private
   */
  _logFieldDetails(field) {
    // Create a simplified view of the field for logging
    const fieldSummary = {
      index: field.index,
      type: field.type,
      tag: field.tagName,
      name: field.name || '(no name)',
      id: field.id || '(no id)',
      label: field.label ? field.label.text : '(no label)',
      position: this._getElementPosition(field.element),
      value: field.value || ''
    };
    
    // Color-coded log based on field type
    let logStyle = 'color: #333; background: #f5f5f5;';
    
    // Color-code by field type for visual scanning
    if (this.fieldGroups.text.includes(field.type)) {
      logStyle = 'color: #222; background: #e6f7ff;'; // Light blue for text inputs
    } else if (field.type === 'checkbox' || field.type === 'radio') {
      logStyle = 'color: #222; background: #f0f7e6;'; // Light green for checkboxes/radios
    } else if (field.type === 'select') {
      logStyle = 'color: #222; background: #fff3e6;'; // Light orange for selects
    } else if (this.fieldGroups.button.includes(field.type)) {
      logStyle = 'color: #222; background: #f5e6ff;'; // Light purple for buttons
    }
    
    // Log the field with styling
    console.log(`%c[BRA-Field #${field.index}] ${field.tagName}[type=${field.type}] ${field.name || field.id || ''}`, 
                logStyle, 
                fieldSummary);
    
    // Additional detailed info in debug mode
    if (this.options.debug) {
      console.group('Detailed field information');
      if (field.label) {
        console.log('Label:', field.label.text);
        console.log('Label source:', field.label.element ? 'DOM element' : 'Inferred');
      }
      
      if (field.tagName === 'select' && field.options) {
        console.log('Options:', field.options);
      }
      
      console.log('Attributes:', field.attributes);
      console.log('DOM Element:', field.element);
      console.groupEnd();
    }
  }
  
  /**
   * Get element position information
   * @param {HTMLElement} element - The DOM element
   * @returns {Object} Position information
   * @private
   */
  _getElementPosition(element) {
    try {
      const rect = element.getBoundingClientRect();
      const position = {
        top: Math.round(rect.top + window.scrollY),
        left: Math.round(rect.left + window.scrollX),
        visible: this._isElementVisible(element)
      };
      return position;
    } catch (e) {
      return { top: 0, left: 0, visible: false };
    }
  }
  
  /**
   * Check if an element is visible
   * @param {HTMLElement} element - The DOM element
   * @returns {boolean} Whether the element is visible
   * @private
   */
  _isElementVisible(element) {
    try {
      const style = window.getComputedStyle(element);
      return !(style.display === 'none' || 
              style.visibility === 'hidden' || 
              style.opacity === '0' || 
              element.offsetParent === null);
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Log a summary of detected fields
   * @private
   */
  _logFieldSummary() {
    console.group('[BRA-FieldDetector] Field Detection Summary');
    console.log(`Total fields detected: ${this.fields.length}`);
    
    // Log counts by group
    console.table(this.fieldSummary);
    
    // In debug mode, show more details about input distribution
    if (this.options.debug) {
      const fieldTypes = {};
      this.fields.forEach(field => {
        fieldTypes[field.type] = (fieldTypes[field.type] || 0) + 1;
      });
      console.log('Fields by specific type:');
      console.table(fieldTypes);
      
      // Log form structure information
      this._analyzeFormStructure();
    }
    
    console.groupEnd();
  }
  
  /**
   * Analyze form structure for useful patterns
   * @private
   */
  _analyzeFormStructure() {
    // Count fields that match common business registration patterns
    const businessPatterns = {
      businessName: /business.?name|company.?name|organization.?name|entity.?name/i,
      taxId: /tax.?id|ein|employer.?id|fein/i,
      address: /address|street|city|state|zip|postal/i,
      contact: /phone|email|contact|website/i,
      entityType: /entity.?type|business.?type|organization.?type|formation.?type/i
    };
    
    const matchedBusinessFields = {};
    Object.keys(businessPatterns).forEach(key => {
      matchedBusinessFields[key] = this.fields.filter(field => {
        // Check field name, id, and label for matches
        const fieldText = [
          field.name || '',
          field.id || '',
          field.label ? field.label.text : ''
        ].join(' ').toLowerCase();
        
        return businessPatterns[key].test(fieldText);
      }).length;
    });
    
    console.log('Potential business registration fields:');
    console.table(matchedBusinessFields);
  }

  /**
   * Extract field information from an input element
   * @param {HTMLElement} element - The input element
   * @returns {Object} Field information object
   * @private
   */
  _extractFieldInfo(element) {
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
      size: {
        width: element.offsetWidth,
        height: element.offsetHeight
      },
      maxLength: element.maxLength || null,
      readOnly: element.readOnly || false,
      autocomplete: element.autocomplete || '',
      checked: element.checked || false
    };
    
    // Get all non-standard attributes
    Array.from(element.attributes || []).forEach(attr => {
      if (!['id', 'name', 'type', 'value', 'placeholder', 'required', 'disabled', 'class'].includes(attr.name)) {
        field.attributes[attr.name] = attr.value;
        
        // Capture data attributes specifically
        if (attr.name.startsWith('data-')) {
          if (!field.dataAttributes) field.dataAttributes = {};
          field.dataAttributes[attr.name] = attr.value;
        }
        
        // Capture ARIA attributes
        if (attr.name.startsWith('aria-')) {
          if (!field.ariaAttributes) field.ariaAttributes = {};
          field.ariaAttributes[attr.name] = attr.value;
        }
      }
    });
    
    // Get associated label
    field.label = this._findFieldLabel(element);
    
    // Get field container information
    field.container = this._getContainerInfo(element);
    
    // Handle specific input types
    switch (field.tagName) {
      case 'select':
        field.options = Array.from(element.options || []).map(option => ({
          value: option.value,
          text: option.text,
          selected: option.selected,
          disabled: option.disabled
        }));
        field.multiple = element.multiple || false;
        field.size = element.size || 0;
        break;
      
      case 'textarea':
        field.rows = element.rows;
        field.cols = element.cols;
        field.minLength = element.minLength || null;
        field.maxLength = element.maxLength || null;
        field.wrap = element.wrap || 'soft';
        break;
      
      case 'input':
        // Specialized attributes for specific input types
        switch (field.type) {
          case 'checkbox':
          case 'radio':
            field.checked = element.checked || false;
            break;
          
          case 'number':
          case 'range':
            field.min = element.min !== '' ? parseFloat(element.min) : null;
            field.max = element.max !== '' ? parseFloat(element.max) : null;
            field.step = element.step !== '' ? parseFloat(element.step) : null;
            break;
          
          case 'file':
            field.accept = element.accept || '';
            field.multiple = element.multiple || false;
            break;
        }
        break;
    }
    
    // Try to determine if the field is part of a group (like radio buttons)
    if (field.type === 'radio' && field.name) {
      const allRadiosInGroup = this.root.querySelectorAll(`input[type="radio"][name="${field.name}"]`);
      if (allRadiosInGroup.length > 1) {
        field.isInGroup = true;
        field.groupSize = allRadiosInGroup.length;
      }
    }
    
    // Calculate visibility
    field.isVisible = this._isElementVisible(element);
    
    return field;
  }
  
  /**
   * Get information about an element's container
   * @param {HTMLElement} element - The DOM element
   * @returns {Object} Container information
   * @private
   */
  _getContainerInfo(element) {
    try {
      // Try to find a relevant container
      let container = element.parentElement;
      let containerInfo = null;
      
      if (container) {
        // Look for common container patterns
        const containerClasses = Array.from(container.classList || []);
        const isFieldGroup = containerClasses.some(cls => 
          /form-group|field-group|input-group|form-control|form-field|field-container/i.test(cls)
        );
        
        containerInfo = {
          tagName: container.tagName.toLowerCase(),
          classes: containerClasses,
          isFieldGroup: isFieldGroup
        };
        
        // Check if the container has a field label
        const possibleLabels = container.querySelectorAll('label');
        if (possibleLabels.length > 0) {
          containerInfo.hasLabel = true;
        }
      }
      
      return containerInfo;
    } catch (e) {
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
      let labelMethod = '';
      
      // Method 1: Check for 'labels' collection (most reliable)
      if (element.labels && element.labels.length > 0) {
        labelElement = element.labels[0];
        labelText = labelElement.textContent.trim();
        labelMethod = 'labels-collection';
      } 
      
      // Method 2: Check for label[for="id"] with matching ID
      if (!labelText && element.id) {
        const labelFor = document.querySelector(`label[for="${element.id}"]`);
        if (labelFor) {
          labelElement = labelFor;
          labelText = labelFor.textContent.trim();
          labelMethod = 'for-attribute';
        }
      }
      
      // Method 3: Check for aria-labelledby attribute
      if (!labelText && element.getAttribute('aria-labelledby')) {
        const labelId = element.getAttribute('aria-labelledby');
        const ariaLabel = document.getElementById(labelId);
        if (ariaLabel) {
          labelElement = ariaLabel;
          labelText = ariaLabel.textContent.trim();
          labelMethod = 'aria-labelledby';
        }
      }
      
      // Method 4: Check for aria-label attribute
      if (!labelText && element.getAttribute('aria-label')) {
        labelText = element.getAttribute('aria-label').trim();
        labelMethod = 'aria-label';
      }
      
      // Method 5: Check for placeholder as a fallback
      if (!labelText && element.placeholder) {
        labelText = element.placeholder;
        labelMethod = 'placeholder';
      }
      
      // Method 6: Look for preceding elements that might be labels
      if (!labelText) {
        // Try to find field containers with labels
        let parent = element.parentElement;
        if (parent) {
          // Check if the parent has a heading or label-like element that precedes this field
          const potentialLabels = parent.querySelectorAll('label, h1, h2, h3, h4, h5, h6, legend, span, div, p');
          
          for (const potentialLabel of potentialLabels) {
            // Skip if it's the input element itself
            if (potentialLabel === element) continue;
            
            // Skip if it appears after our input in the DOM
            if (potentialLabel.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING) continue;
            
            // Only consider elements with text
            const labelContent = potentialLabel.textContent.trim();
            if (labelContent) {
              labelElement = potentialLabel;
              labelText = labelContent;
              labelMethod = 'preceding-element';
              break;
            }
          }
          
          // Try direct siblings
          if (!labelText) {
            const siblings = Array.from(parent.childNodes);
            const elementIndex = siblings.indexOf(element);
            
            // Look at previous siblings for potential labels
            if (elementIndex > 0) {
              for (let i = elementIndex - 1; i >= 0; i--) {
                const sibling = siblings[i];
                // Only text nodes and elements
                if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
                  labelText = sibling.textContent.trim();
                  labelMethod = 'sibling-text';
                  break;
                } else if (
                  sibling.nodeType === Node.ELEMENT_NODE && 
                  !['input', 'select', 'textarea', 'button'].includes(sibling.tagName.toLowerCase()) &&
                  sibling.textContent.trim()
                ) {
                  labelElement = sibling;
                  labelText = sibling.textContent.trim();
                  labelMethod = 'sibling-element';
                  break;
                }
              }
            }
          }
          
          // Method 7: If still no label, try the parent's text content (common in divs)
          if (!labelText && ['div', 'span', 'p', 'td'].includes(parent.tagName.toLowerCase())) {
            const directTextNodes = Array.from(parent.childNodes)
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent.trim())
              .filter(Boolean);
            
            if (directTextNodes.length > 0) {
              labelText = directTextNodes.join(' ');
              labelElement = parent;
              labelMethod = 'parent-text';
            }
          }
          
          // Method 8: Look for a table with a header cell
          if (!labelText && parent.tagName.toLowerCase() === 'td') {
            try {
              // Find which column this is
              const row = parent.parentElement;
              if (row && row.tagName.toLowerCase() === 'tr') {
                const cells = Array.from(row.cells);
                const columnIndex = cells.indexOf(parent);
                
                // Look for a header row in the same table
                const table = row.closest('table');
                if (table) {
                  const headerRow = table.querySelector('tr th');
                  if (headerRow && headerRow.cells.length > columnIndex) {
                    labelText = headerRow.cells[columnIndex].textContent.trim();
                    labelElement = headerRow.cells[columnIndex];
                    labelMethod = 'table-header';
                  }
                }
              }
            } catch (tableError) {
              // Ignore table errors
            }
          }
        }
      }
      
      // Method 9: title attribute as last resort
      if (!labelText && element.title) {
        labelText = element.title;
        labelMethod = 'title-attribute';
      }
      
      // If we found a label, prepare the result
      if (labelText) {
        // Clean up the label text (remove excess spaces, newlines, etc.)
        labelText = labelText.replace(/[\s\n\r]+/g, ' ').trim();
        
        // Truncate if too long
        if (labelText.length > 100) {
          labelText = labelText.substring(0, 97) + '...';
        }
        
        return {
          text: labelText,
          element: labelElement,
          method: labelMethod
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
   * Get fields by type
   * @param {string} type - The field type to filter by
   * @returns {Array} Array of filtered field objects
   */
  getFieldsByType(type) {
    return this.fields.filter(field => field.type === type);
  }

  /**
   * Get fields by name pattern
   * @param {string|RegExp} pattern - The pattern to match field names against
   * @returns {Array} Array of matching field objects
   */
  getFieldsByNamePattern(pattern) {
    if (typeof pattern === 'string') {
      return this.fields.filter(field => field.name && field.name.includes(pattern));
    } else if (pattern instanceof RegExp) {
      return this.fields.filter(field => field.name && pattern.test(field.name));
    }
    return [];
  }

  /**
   * Get fields by label pattern
   * @param {string|RegExp} pattern - The pattern to match field labels against
   * @returns {Array} Array of matching field objects
   */
  getFieldsByLabelPattern(pattern) {
    if (typeof pattern === 'string') {
      return this.fields.filter(field => field.label && field.label.text.includes(pattern));
    } else if (pattern instanceof RegExp) {
      return this.fields.filter(field => field.label && pattern.test(field.label.text));
    }
    return [];
  }
  
  /**
   * Get required fields
   * @returns {Array} Array of required field objects
   */
  getRequiredFields() {
    return this.fields.filter(field => field.required);
  }
  
  /**
   * Get visible fields (excluding hidden ones)
   * @returns {Array} Array of visible field objects
   */
  getVisibleFields() {
    return this.fields.filter(field => field.isVisible);
  }
  
  /**
   * Log field validation status
   * Shows which fields may require validation (required fields, specific types)
   */
  logValidationStatus() {
    if (this.fields.length === 0) {
      this._log('No fields detected to validate');
      return;
    }
    
    console.group('[BRA-FieldDetector] Field Validation Status');
    
    // Required fields
    const requiredFields = this.getRequiredFields();
    console.log(`Required fields: ${requiredFields.length}/${this.fields.length}`);
    
    if (requiredFields.length > 0) {
      console.table(requiredFields.map(field => ({
        index: field.index,
        type: field.type,
        name: field.name || field.id || '(unnamed)',
        label: field.label ? field.label.text : '(no label)'
      })));
    }
    
    // Fields with type-specific validation
    const emailFields = this.getFieldsByType('email');
    const numberFields = this.getFieldsByType('number');
    const urlFields = this.getFieldsByType('url');
    const telFields = this.getFieldsByType('tel');
    
    console.log('Fields with type-specific validation:');
    console.log(`- Email fields: ${emailFields.length}`);
    console.log(`- Number fields: ${numberFields.length}`);
    console.log(`- URL fields: ${urlFields.length}`);
    console.log(`- Telephone fields: ${telFields.length}`);
    
    // Fields with pattern validation
    const patternFields = this.fields.filter(field => field.attributes && field.attributes.pattern);
    console.log(`Fields with pattern validation: ${patternFields.length}`);
    
    // Fields with min/max validation
    const minMaxFields = this.fields.filter(field => field.min !== undefined || field.max !== undefined);
    console.log(`Fields with min/max validation: ${minMaxFields.length}`);
    
    console.groupEnd();
  }
  
  /**
   * Highlight fields in the document
   * Adds a colored border around each detected field for visual debugging
   * @param {boolean} remove - Whether to remove existing highlights
   */
  highlightFields(remove = false) {
    // First remove any existing highlights
    const existingHighlights = document.querySelectorAll('.bra-field-highlight');
    existingHighlights.forEach(el => el.remove());
    
    // If we're just removing, stop here
    if (remove) {
      return;
    }
    
    // Add highlights for each field
    this.fields.forEach(field => {
      try {
        // Skip hidden fields
        if (!field.isVisible) return;
        
        // Create highlight element
        const highlightEl = document.createElement('div');
        highlightEl.className = 'bra-field-highlight';
        
        // Position it over the field
        const rect = field.element.getBoundingClientRect();
        highlightEl.style.cssText = `
          position: absolute;
          top: ${window.scrollY + rect.top - 2}px;
          left: ${window.scrollX + rect.left - 2}px;
          width: ${rect.width + 4}px;
          height: ${rect.height + 4}px;
          border: 2px solid rgba(76, 175, 80, 0.6);
          background-color: rgba(76, 175, 80, 0.05);
          z-index: 999999;
          pointer-events: none;
          box-sizing: border-box;
          border-radius: 3px;
        `;
        
        // Change color based on field type
        if (field.type === 'text' || field.type === 'email' || field.type === 'tel') {
          highlightEl.style.borderColor = 'rgba(33, 150, 243, 0.6)'; // Blue for text inputs
          highlightEl.style.backgroundColor = 'rgba(33, 150, 243, 0.05)';
        } else if (field.type === 'checkbox' || field.type === 'radio') {
          highlightEl.style.borderColor = 'rgba(156, 39, 176, 0.6)'; // Purple for checkboxes/radios
          highlightEl.style.backgroundColor = 'rgba(156, 39, 176, 0.05)';
        } else if (field.type === 'select-one' || field.type === 'select-multiple') {
          highlightEl.style.borderColor = 'rgba(255, 152, 0, 0.6)'; // Orange for selects
          highlightEl.style.backgroundColor = 'rgba(255, 152, 0, 0.05)';
        } else if (field.type === 'submit' || field.type === 'button') {
          highlightEl.style.borderColor = 'rgba(244, 67, 54, 0.6)'; // Red for buttons
          highlightEl.style.backgroundColor = 'rgba(244, 67, 54, 0.05)';
        }
        
        // Add label
        const labelEl = document.createElement('div');
        labelEl.style.cssText = `
          position: absolute;
          top: -18px;
          left: 0;
          background-color: rgba(0, 0, 0, 0.7);
          color: white;
          font-size: 10px;
          padding: 2px 4px;
          border-radius: 2px;
          white-space: nowrap;
          font-family: monospace;
        `;
        labelEl.textContent = `${field.index}: ${field.type} ${field.name || field.id || ''}`;
        highlightEl.appendChild(labelEl);
        
        // Add to document
        document.body.appendChild(highlightEl);
      } catch (e) {
        console.error('[BRA-FieldDetector] Error highlighting field:', e);
      }
    });
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
      this.highlightFields(true);
    }, 10000);
  }
}

// Export the module
export { FieldDetector as default };