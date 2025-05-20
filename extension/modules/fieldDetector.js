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
   */
  constructor(rootElement) {
    this.root = rootElement || document;
    this.fields = [];
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
  }

  /**
   * Log a message with the field detector prefix
   * @param {string} message - The message to log
   * @param {any} data - Optional data to log
   * @private
   */
  _log(message, data) {
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
      
      // Get all input elements
      const inputElements = this.root.querySelectorAll('input, select, textarea');
      
      // Process each input element
      inputElements.forEach(element => {
        try {
          const field = this._extractFieldInfo(element);
          if (field) {
            this.fields.push(field);
          }
        } catch (fieldError) {
          console.error('[BRA-FieldDetector] Error processing field:', fieldError);
        }
      });
      
      this._log(`Detected ${this.fields.length} fields`, this.fields);
      return this.fields;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error detecting fields:', error);
      return [];
    }
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
      attributes: {}
    };
    
    // Get all non-standard attributes
    Array.from(element.attributes).forEach(attr => {
      if (!['id', 'name', 'type', 'value', 'placeholder', 'required', 'disabled', 'class'].includes(attr.name)) {
        field.attributes[attr.name] = attr.value;
      }
    });
    
    // Get associated label
    field.label = this._findFieldLabel(element);
    
    // Handle specific input types
    switch (field.tagName) {
      case 'select':
        field.options = Array.from(element.options).map(option => ({
          value: option.value,
          text: option.text,
          selected: option.selected
        }));
        break;
      case 'textarea':
        field.rows = element.rows;
        field.cols = element.cols;
        break;
    }
    
    return field;
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
      
      // First try the label element that this input is contained within
      if (element.labels && element.labels.length > 0) {
        labelElement = element.labels[0];
        labelText = labelElement.textContent.trim();
      } 
      // Then try finding a label that references this input's ID
      else if (element.id) {
        const labelFor = document.querySelector(`label[for="${element.id}"]`);
        if (labelFor) {
          labelElement = labelFor;
          labelText = labelFor.textContent.trim();
        }
      }
      
      // If still no label found, try nearby text that might be a label
      if (!labelText) {
        // Check for preceding sibling that might be a label
        const parent = element.parentElement;
        if (parent) {
          // Check direct siblings
          const siblings = Array.from(parent.childNodes);
          const elementIndex = siblings.indexOf(element);
          
          // Look at previous siblings for potential labels
          if (elementIndex > 0) {
            for (let i = elementIndex - 1; i >= 0; i--) {
              const sibling = siblings[i];
              // Only text nodes and elements
              if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent.trim()) {
                labelText = sibling.textContent.trim();
                break;
              } else if (
                sibling.nodeType === Node.ELEMENT_NODE && 
                !['input', 'select', 'textarea', 'button'].includes(sibling.tagName.toLowerCase()) &&
                sibling.textContent.trim()
              ) {
                labelElement = sibling;
                labelText = sibling.textContent.trim();
                break;
              }
            }
          }
          
          // If no label found yet, try looking at the parent element
          if (!labelText && ['div', 'span', 'p'].includes(parent.tagName.toLowerCase())) {
            const parentText = parent.childNodes && Array.from(parent.childNodes)
              .filter(node => node.nodeType === Node.TEXT_NODE)
              .map(node => node.textContent.trim())
              .filter(Boolean)
              .join(' ');
              
            if (parentText) {
              labelText = parentText;
              labelElement = parent;
            }
          }
        }
      }
      
      return labelText ? {
        text: labelText,
        element: labelElement
      } : null;
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
      return this.fields.filter(field => field.name.includes(pattern));
    } else if (pattern instanceof RegExp) {
      return this.fields.filter(field => pattern.test(field.name));
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
}

// Export the module
export { FieldDetector as default };