/**
 * Field Detector Module
 * 
 * Detects and analyzes form fields on business registration forms.
 * This module helps identify input elements and extract their attributes.
 * Classifies fields based on their purpose in business registration.
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
    
    // Knowledge base for field classification
    this.fieldClassification = {
      // Business identity fields
      businessName: {
        patterns: [
          /\bbusiness\s*name\b/i,
          /\bcompany\s*name\b/i,
          /\bentity\s*name\b/i,
          /\borganization\s*name\b/i,
          /\blegal\s*name\b/i,
          /\btrade\s*name\b/i,
          /\bfirm\s*name\b/i,
          /\bname\s*of\s*(business|company|entity|organization)\b/i
        ],
        namePatterns: [
          /\bname\b/i,
          /\bbusiness[-_]?name\b/i,
          /\bcompany[-_]?name\b/i
        ],
        idPatterns: [
          /\bname\b/i,
          /\bbusinessName\b/i,
          /\bcompanyName\b/i,
          /\bentityName\b/i
        ],
        fieldTypes: ['text'],
        importance: 'high'
      },
      
      // Business identifier fields
      businessId: {
        patterns: [
          /\bbusiness\s*(id|identifier|number)\b/i,
          /\bentity\s*(id|identifier|number|code)\b/i,
          /\bregistration\s*(id|number)\b/i,
          /\bcompany\s*(id|identifier|number)\b/i,
          /\borganization\s*(id|identifier|number)\b/i,
          /\baccount\s*(id|number)\b/i
        ],
        namePatterns: [
          /\bid\b/i,
          /\bnumber\b/i,
          /\bidentifier\b/i,
          /\bregistration[-_]?number\b/i,
          /\bentity[-_]?id\b/i
        ],
        idPatterns: [
          /\bid\b/i,
          /\bentityId\b/i,
          /\bbusinessId\b/i,
          /\bidentifier\b/i,
          /\bnumber\b/i
        ],
        fieldTypes: ['text', 'number'],
        importance: 'medium'
      },
      
      // Entity type selection
      entityType: {
        patterns: [
          /\bentity\s*type\b/i,
          /\bbusiness\s*type\b/i,
          /\borganization\s*type\b/i,
          /\bcompany\s*type\b/i,
          /\btype\s*of\s*(entity|business|organization|company)\b/i,
          /\bstructure\b/i,
          /\bbusiness\s*structure\b/i,
          /\bform\s*of\s*organization\b/i,
          /\b(select|choose)\s*(an|your|the)\s*(entity|business)\s*type\b/i
        ],
        namePatterns: [
          /\btype\b/i,
          /\bentity[-_]?type\b/i,
          /\bbusiness[-_]?type\b/i,
          /\bstructure\b/i
        ],
        idPatterns: [
          /\bentityType\b/i,
          /\bbusinessType\b/i,
          /\btype\b/i,
          /\bstructure\b/i,
          /\borganizationType\b/i
        ],
        fieldTypes: ['select', 'radio'],
        options: [
          /llc|limited\s*liability\s*company/i,
          /corporation|incorporated|inc\.?$/i,
          /partnership/i,
          /sole\s*proprietor/i,
          /nonprofit|non-profit/i
        ],
        importance: 'high'
      }
    };
  }

  /**
   * Find all input fields within the root element
   * @returns {Array} Array of field objects with their attributes
   */
  detectFields() {
    try {
      console.log('[BRA-FieldDetector] Starting field detection');
      this.fields = [];
      this.fieldSummary = {};
      
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
   * Classify detected fields by purpose
   * Adds classification information to each field
   * @returns {Object} Classification summary
   */
  classifyFields() {
    try {
      console.log('[BRA-FieldDetector] Classifying fields by purpose');
      
      // Track classification statistics
      const stats = {
        totalFields: this.fields.length,
        classifiedFields: 0,
        categories: {}
      };
      
      // Classify each field
      this.fields.forEach(field => {
        try {
          const classification = this._classifyField(field);
          
          // Attach classification to field
          field.classification = classification;
          
          // Update statistics
          if (classification && classification.category) {
            stats.classifiedFields++;
            stats.categories[classification.category] = (stats.categories[classification.category] || 0) + 1;
          }
        } catch (error) {
          console.error('[BRA-FieldDetector] Error classifying field:', error);
        }
      });
      
      return stats;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error in field classification:', error);
      return { totalFields: this.fields.length, classifiedFields: 0, categories: {} };
    }
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
      
      // Build a text corpus from field attributes to analyze
      let textToAnalyze = [
        field.name || '',
        field.id || '',
        field.placeholder || '',
      ].join(' ').toLowerCase();
      
      // Add label text if available
      if (field.label && field.label.text) {
        textToAnalyze += ' ' + field.label.text.toLowerCase();
      }
      
      // Track matches for each category
      const matches = {};
      let bestCategory = null;
      let bestConfidence = 0;
      
      // Check each category in the classification knowledge base
      for (const [category, rules] of Object.entries(this.fieldClassification)) {
        let categoryScore = 0;
        let matchDetails = {};
        
        // Check the field type first
        if (rules.fieldTypes && rules.fieldTypes.includes(field.type)) {
          categoryScore += 10;
          matchDetails.typeMatch = true;
        }
        
        // Check label patterns (highest weight)
        if (field.label && field.label.text && rules.patterns) {
          for (const pattern of rules.patterns) {
            if (pattern.test(field.label.text)) {
              categoryScore += 40;
              matchDetails.labelMatch = pattern.toString();
              break;
            }
          }
        }
        
        // Check name attribute patterns
        if (field.name && rules.namePatterns) {
          for (const pattern of rules.namePatterns) {
            if (pattern.test(field.name)) {
              categoryScore += 30;
              matchDetails.nameMatch = pattern.toString();
              break;
            }
          }
        }
        
        // Check id attribute patterns
        if (field.id && rules.idPatterns) {
          for (const pattern of rules.idPatterns) {
            if (pattern.test(field.id)) {
              categoryScore += 20;
              matchDetails.idMatch = pattern.toString();
              break;
            }
          }
        }
        
        // Apply importance weighting
        if (rules.importance === 'high') {
          categoryScore *= 1.2;
        } else if (rules.importance === 'low') {
          categoryScore *= 0.8;
        }
        
        // Record the match
        matches[category] = {
          score: categoryScore,
          details: matchDetails
        };
        
        // Track best match
        if (categoryScore > bestConfidence) {
          bestCategory = category;
          bestConfidence = categoryScore;
        }
      }
      
      // Only return a classification if confidence is above a minimum threshold
      if (bestConfidence >= 20) {
        // Normalize confidence to a 0-100 scale
        // Score of 60 or higher is treated as 100% confidence
        const normalizedConfidence = Math.min(100, Math.round((bestConfidence / 60) * 100));
        
        return {
          category: bestCategory,
          confidence: normalizedConfidence
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
}

// Export the module
export default FieldDetector;