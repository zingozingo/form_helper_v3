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
      
      // Tax identifier fields
      taxId: {
        patterns: [
          /\btax\s*(id|identification|number)\b/i,
          /\bein\b/i,
          /\bemployer\s*(id|identification)\s*number\b/i,
          /\bfederal\s*tax\s*id\b/i,
          /\bfein\b/i,
          /\btaxpayer\s*(id|identification)\b/i,
          /\btax\s*registration\s*number\b/i,
          /\bsales\s*tax\s*(id|number)\b/i,
          /\btax\s*id\s*number\b/i
        ],
        namePatterns: [
          /\btax[-_]?id\b/i,
          /\bein\b/i,
          /\bfein\b/i,
          /\btaxpayer[-_]?id\b/i,
          /\bemployer[-_]?id\b/i
        ],
        idPatterns: [
          /\btaxId\b/i,
          /\bein\b/i,
          /\bfein\b/i,
          /\btaxNumber\b/i,
          /\bemployerId\b/i
        ],
        fieldTypes: ['text', 'number'],
        importance: 'high'
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
      },
      
      // Business addresses
      businessAddress: {
        patterns: [
          /\bbusiness\s*address\b/i,
          /\bcompany\s*address\b/i,
          /\bentity\s*address\b/i,
          /\borganization\s*address\b/i,
          /\bprincipal\s*(place\s*of\s*business|address|office)\b/i,
          /\bphysical\s*address\b/i,
          /\bmailing\s*address\b/i,
          /\bregistered\s*(office|address)\b/i,
          /\bprimary\s*address\b/i
        ],
        namePatterns: [
          /\baddress\b/i,
          /\bstreet\b/i,
          /\bbusiness[-_]?address\b/i,
          /\bphysical[-_]?address\b/i
        ],
        idPatterns: [
          /\baddress\b/i,
          /\bbusinessAddress\b/i,
          /\bstreet\b/i,
          /\bphysicalAddress\b/i
        ],
        subfields: {
          street: [/\bstreet\b/i, /\baddress[-_]?line[-_]?1\b/i, /\baddress1\b/i],
          street2: [/\bstreet\s*2\b/i, /\baddress[-_]?line[-_]?2\b/i, /\baddress2\b/i, /\bapt|suite|unit\b/i],
          city: [/\bcity\b/i, /\btown\b/i, /\bmunicipality\b/i],
          state: [/\bstate\b/i, /\bprovince\b/i, /\bregion\b/i],
          zip: [/\bzip\b/i, /\bpostal[-_]?code\b/i, /\bzip[-_]?code\b/i],
          country: [/\bcountry\b/i, /\bnation\b/i]
        },
        fieldTypes: ['text'],
        importance: 'high'
      },
      
      // Contact information
      contactInfo: {
        patterns: [
          /\bcontact\s*information\b/i,
          /\bcontact\s*details\b/i,
          /\bbusiness\s*contact\b/i,
          /\bcompany\s*contact\b/i
        ],
        subfields: {
          phone: {
            patterns: [
              /\bphone\b/i,
              /\bbusiness\s*phone\b/i,
              /\bcompany\s*phone\b/i,
              /\bphone\s*number\b/i,
              /\btelephone\b/i,
              /\bcell\b/i,
              /\bmobile\b/i
            ],
            namePatterns: [/\bphone\b/i, /\btelephone\b/i, /\bmobile\b/i],
            idPatterns: [/\bphone\b/i, /\btelephone\b/i, /\bphoneNumber\b/i],
            fieldTypes: ['tel', 'text']
          },
          email: {
            patterns: [
              /\bemail\b/i,
              /\bbusiness\s*email\b/i,
              /\bcompany\s*email\b/i,
              /\bemail\s*address\b/i,
              /\be-mail\b/i
            ],
            namePatterns: [/\bemail\b/i, /\be[-_]?mail\b/i],
            idPatterns: [/\bemail\b/i, /\bemailAddress\b/i],
            fieldTypes: ['email', 'text']
          },
          website: {
            patterns: [
              /\bwebsite\b/i,
              /\bweb\s*site\b/i,
              /\bweb\s*address\b/i,
              /\burl\b/i,
              /\bbusiness\s*website\b/i,
              /\bcompany\s*website\b/i
            ],
            namePatterns: [/\bwebsite\b/i, /\burl\b/i, /\bweb[-_]?site\b/i],
            idPatterns: [/\bwebsite\b/i, /\burl\b/i, /\bwebAddress\b/i],
            fieldTypes: ['url', 'text']
          }
        },
        importance: 'medium'
      },
      
      // Owner/agent information
      personInfo: {
        patterns: [
          /\bowner\b/i,
          /\bagent\b/i,
          /\bregistered\s*agent\b/i,
          /\bstatutory\s*agent\b/i,
          /\borganizer\b/i,
          /\bincorporator\b/i,
          /\bmember\b/i,
          /\bmanager\b/i,
          /\bdirector\b/i,
          /\bofficer\b/i,
          /\bpresident\b/i,
          /\bsecretary\b/i,
          /\btreasurer\b/i,
          /\bauthorized\s*person\b/i,
          /\bauthorized\s*representative\b/i
        ],
        subfields: {
          firstName: {
            patterns: [
              /\bfirst\s*name\b/i,
              /\bgiven\s*name\b/i,
              /\bforename\b/i
            ],
            namePatterns: [/\bfirst[-_]?name\b/i, /\bfname\b/i, /\bfirstName\b/i],
            idPatterns: [/\bfirstName\b/i, /\bfname\b/i, /\bgiven[-_]?name\b/i],
            fieldTypes: ['text']
          },
          lastName: {
            patterns: [
              /\blast\s*name\b/i,
              /\bsurname\b/i,
              /\bfamily\s*name\b/i
            ],
            namePatterns: [/\blast[-_]?name\b/i, /\blname\b/i, /\blastName\b/i],
            idPatterns: [/\blastName\b/i, /\blname\b/i, /\bsurname\b/i],
            fieldTypes: ['text']
          },
          fullName: {
            patterns: [
              /\bfull\s*name\b/i,
              /\bcomplete\s*name\b/i,
              /\blegal\s*name\b/i,
              /\bname\b/i
            ],
            namePatterns: [/\bname\b/i, /\bfull[-_]?name\b/i],
            idPatterns: [/\bfullName\b/i, /\bname\b/i, /\bpersonName\b/i],
            fieldTypes: ['text']
          },
          title: {
            patterns: [
              /\btitle\b/i,
              /\bposition\b/i,
              /\bjob\s*title\b/i,
              /\brole\b/i
            ],
            namePatterns: [/\btitle\b/i, /\bposition\b/i, /\brole\b/i],
            idPatterns: [/\btitle\b/i, /\bposition\b/i, /\bjobTitle\b/i],
            fieldTypes: ['text', 'select']
          }
        },
        importance: 'high'
      },
      
      // Date fields
      dateFields: {
        patterns: [
          /\bdate\b/i,
          /\beffective\s*date\b/i,
          /\bstart\s*date\b/i,
          /\bformation\s*date\b/i,
          /\bfiling\s*date\b/i,
          /\bincorporation\s*date\b/i,
          /\borganization\s*date\b/i,
          /\bbeginning\s*date\b/i,
          /\bend\s*date\b/i
        ],
        namePatterns: [/\bdate\b/i, /\beffective[-_]?date\b/i, /\bstart[-_]?date\b/i],
        idPatterns: [/\bdate\b/i, /\beffectiveDate\b/i, /\bstartDate\b/i, /\bformationDate\b/i],
        fieldTypes: ['date', 'text'],
        importance: 'medium'
      },
      
      // Payment information
      paymentInfo: {
        patterns: [
          /\bpayment\b/i,
          /\bcredit\s*card\b/i,
          /\bcard\s*number\b/i,
          /\bcvv\b/i,
          /\bcvc\b/i,
          /\bexpiration\b/i,
          /\bexp\s*date\b/i,
          /\bchecking\s*account\b/i,
          /\bbank\s*account\b/i,
          /\brouting\s*number\b/i,
          /\baccount\s*number\b/i,
          /\bpayment\s*method\b/i,
          /\bfee\b/i,
          /\btotal\b/i,
          /\bamount\b/i,
          /\bprice\b/i,
          /\bcost\b/i
        ],
        subfields: {
          cardNumber: [/\bcard[-_]?number\b/i, /\bcredit[-_]?card\b/i, /\bcc[-_]?number\b/i, /\bcardNumber\b/i],
          cardName: [/\bname[-_]?on[-_]?card\b/i, /\bcardholder\b/i, /\bcard[-_]?name\b/i],
          expiration: [/\bexp\b/i, /\bexpir/i, /\bexpiration\b/i, /\bexp[-_]?date\b/i],
          cvv: [/\bcvv\b/i, /\bcvc\b/i, /\bsecurity[-_]?code\b/i, /\bcard[-_]?code\b/i],
          amount: [/\bamount\b/i, /\btotal\b/i, /\bfee\b/i, /\bprice\b/i, /\bcost\b/i]
        },
        fieldTypes: ['text', 'number', 'select'],
        importance: 'medium'
      },
      
      // Filing details
      filingDetails: {
        patterns: [
          /\bfiling\b/i,
          /\bfiling\s*type\b/i,
          /\bfiling\s*number\b/i,
          /\bdocument\s*type\b/i,
          /\bdocument\s*number\b/i,
          /\bapplication\s*type\b/i,
          /\bapplication\s*number\b/i,
          /\bservice\s*type\b/i,
          /\bexpedited\s*service\b/i,
          /\bpriority\s*processing\b/i
        ],
        namePatterns: [
          /\bfiling[-_]?type\b/i,
          /\bdocument[-_]?type\b/i,
          /\bfiling[-_]?number\b/i,
          /\bservice[-_]?type\b/i
        ],
        idPatterns: [
          /\bfilingType\b/i,
          /\bdocumentType\b/i,
          /\bapplicationType\b/i,
          /\bserviceType\b/i
        ],
        fieldTypes: ['select', 'radio', 'text'],
        importance: 'medium'
      },
      
      // Submission/authorization
      authorization: {
        patterns: [
          /\bsignature\b/i,
          /\belectronic\s*signature\b/i,
          /\bauthorized\s*signature\b/i,
          /\bsign\b/i,
          /\bagree\b/i,
          /\bconsent\b/i,
          /\bcertif(y|ication)\b/i,
          /\battest\b/i,
          /\bdeclare\b/i,
          /\baffirm\b/i,
          /\bverif(y|ication)\b/i,
          /\bconfirm\b/i,
          /\backnowledge\b/i,
          /\bunder\s*penalty\s*of\s*perjury\b/i,
          /\bterms\s*(and|&)\s*conditions\b/i,
          /\bagree\s*to\s*terms\b/i
        ],
        namePatterns: [
          /\bsignature\b/i,
          /\bagree\b/i,
          /\bconsent\b/i,
          /\bterms\b/i
        ],
        idPatterns: [
          /\bsignature\b/i,
          /\bagree\b/i,
          /\bconsent\b/i,
          /\bterms\b/i,
          /\backnowledge\b/i
        ],
        fieldTypes: ['checkbox', 'text'],
        importance: 'high'
      }
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
    try {
      // Safety checks before accessing properties
      if (!field) {
        console.error('[BRA-FieldDetector] Cannot log details for invalid field');
        return;
      }
      
      // Safely get position
      let position = { top: 0, left: 0, visible: false };
      if (field.element) {
        try {
          position = this._getElementPosition(field.element);
        } catch (posError) {
          console.error('[BRA-FieldDetector] Error getting position:', posError);
        }
      }
      
      // Create a simplified view of the field for logging
      const fieldSummary = {
        index: field.index || 0,
        type: field.type || 'unknown',
        tag: field.tagName || 'unknown',
        name: field.name || '(no name)',
        id: field.id || '(no id)',
        label: (field.label && field.label.text) ? field.label.text : '(no label)',
        position: position,
        value: field.value || ''
      };
      
      // Color-coded log based on field type
      let logStyle = 'color: #333; background: #f5f5f5;';
      
      // Color-code by field type for visual scanning - with safety checks
      if (field.type && this.fieldGroups.text && this.fieldGroups.text.includes(field.type)) {
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
    } catch (error) {
      console.error('[BRA-FieldDetector] Error logging field details:', error);
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
      // Safety check - make sure element exists and is a DOM element
      if (!element || !element.getBoundingClientRect) {
        return { top: 0, left: 0, visible: false, error: 'Invalid element' };
      }
      
      // Try to get position
      const rect = element.getBoundingClientRect();
      
      // Check if we have valid values
      if (isNaN(rect.top) || isNaN(rect.left)) {
        return { top: 0, left: 0, visible: false, error: 'Invalid rectangle values' };
      }
      
      // Get scroll position safely
      const scrollX = window.scrollX !== undefined ? window.scrollX : window.pageXOffset || 0;
      const scrollY = window.scrollY !== undefined ? window.scrollY : window.pageYOffset || 0;
      
      const position = {
        top: Math.round(rect.top + scrollY),
        left: Math.round(rect.left + scrollX),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        visible: this._isElementVisible(element)
      };
      
      return position;
    } catch (e) {
      console.error('[BRA-FieldDetector] Error getting element position:', e);
      return { 
        top: 0, 
        left: 0, 
        width: 0,
        height: 0,
        visible: false, 
        error: e.message || 'Unknown error'
      };
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
                  const headerRows = table.querySelectorAll('tr');
                  const headerRow = Array.from(headerRows).find(r => r.querySelector('th'));
                  if (headerRow && headerRow.cells && headerRow.cells.length > columnIndex) {
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
   * @param {Object} options - Highlighting options
   * @param {boolean} options.showLabels - Whether to show labels (default: true)
   * @param {boolean} options.showRelationships - Whether to show relationships (default: true)
   * @param {number} options.duration - How long to show highlights in ms (default: 10000)
   */
  highlightFields(remove = false, options = {}) {
    // Default options
    const highlightOptions = {
      showLabels: options.showLabels !== false,
      showRelationships: options.showRelationships !== false,
      duration: options.duration || 10000
    };
    
    // First remove any existing highlights
    const existingHighlights = document.querySelectorAll('.bra-field-highlight, .bra-field-relationship');
    existingHighlights.forEach(el => el.remove());
    
    // If we're just removing, stop here
    if (remove) {
      return;
    }
    
    // Keep track of highlighted fields for relationship lines
    const highlightedFields = [];
    
    // Add highlights for each field
    this.fields.forEach(field => {
      try {
        // Skip hidden fields
        if (!field.isVisible) return;
        
        // Create highlight element
        const highlightEl = document.createElement('div');
        highlightEl.className = 'bra-field-highlight';
        highlightEl.dataset.fieldIndex = field.index;
        
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
        
        // If field has a classification, use that for color
        if (field.classification && field.classification.confidence > 70) {
          // High confidence classifications get distinctive colors
          const categoryColors = {
            businessName: 'rgba(0, 200, 83, 0.8)',
            taxId: 'rgba(255, 87, 34, 0.8)',
            entityType: 'rgba(41, 121, 255, 0.8)',
            businessAddress: 'rgba(171, 71, 188, 0.8)',
            personInfo: 'rgba(255, 193, 7, 0.8)',
            contactInfo: 'rgba(3, 169, 244, 0.8)',
            businessId: 'rgba(121, 85, 72, 0.8)',
            dateFields: 'rgba(0, 137, 123, 0.8)',
            paymentInfo: 'rgba(216, 27, 96, 0.8)',
            filingDetails: 'rgba(93, 64, 55, 0.8)',
            authorization: 'rgba(236, 64, 122, 0.8)'
          };
          
          const categoryColor = categoryColors[field.classification.category];
          if (categoryColor) {
            highlightEl.style.borderColor = categoryColor;
            highlightEl.style.backgroundColor = categoryColor.replace('0.8', '0.1');
            highlightEl.dataset.category = field.classification.category;
          }
        }
        
        // Store position for relationship lines
        highlightedFields.push({
          element: highlightEl,
          field: field,
          rect: rect,
          center: {
            x: rect.left + (rect.width / 2),
            y: rect.top + (rect.height / 2)
          }
        });
        
        // Add label
        if (highlightOptions.showLabels) {
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
          
          // Include classification in label if available
          let labelText = `${field.index}: ${field.type} ${field.name || field.id || ''}`;
          if (field.classification && field.classification.confidence > 50) {
            labelText += ` (${field.classification.category}: ${field.classification.confidence}%)`;
            
            // Show relationships
            if (field.classification.relationships && 
                field.classification.relationships.length > 0 && 
                highlightOptions.showLabels) {
              labelText += ` [${field.classification.relationships.join(', ')}]`;
            }
          }
          
          labelEl.textContent = labelText;
          highlightEl.appendChild(labelEl);
        }
        
        // Add to document
        document.body.appendChild(highlightEl);
      } catch (e) {
        console.error('[BRA-FieldDetector] Error highlighting field:', e);
      }
    });
    
    // Draw relationship lines between fields
    if (highlightOptions.showRelationships) {
      this._drawRelationshipLines(highlightedFields);
    }
    
    // Auto-remove after specified duration
    setTimeout(() => {
      this.highlightFields(true);
    }, highlightOptions.duration);
  }
  
  /**
   * Draw lines connecting related fields
   * @param {Array} highlightedFields - Array of highlighted field information
   * @private
   */
  _drawRelationshipLines(highlightedFields) {
    if (!highlightedFields || highlightedFields.length < 2) return;
    
    try {
      // Group fields by relationship type and category
      const relationshipGroups = {};
      
      highlightedFields.forEach(highlighted => {
        const field = highlighted.field;
        
        if (field.classification && 
            field.classification.relationships && 
            field.classification.relationships.length > 0) {
          
          field.classification.relationships.forEach(rel => {
            // Create a key combining relationship type and category
            const key = `${rel}_${field.classification.category}`;
            
            if (!relationshipGroups[key]) {
              relationshipGroups[key] = [];
            }
            
            relationshipGroups[key].push(highlighted);
          });
        }
      });
      
      // Draw lines for each relationship group
      Object.entries(relationshipGroups).forEach(([groupKey, fields]) => {
        if (fields.length < 2) return;
        
        // Draw lines connecting all fields in this group
        for (let i = 0; i < fields.length - 1; i++) {
          try {
            this._drawLineBetweenFields(fields[i], fields[i + 1], groupKey);
          } catch (e) {
            console.error('[BRA-FieldDetector] Error drawing relationship line:', e);
          }
        }
      });
    } catch (e) {
      console.error('[BRA-FieldDetector] Error drawing relationship lines:', e);
    }
  }
  
  /**
   * Draw a line between two fields
   * @param {Object} field1 - First field information
   * @param {Object} field2 - Second field information
   * @param {string} relationshipKey - The relationship key for styling
   * @private
   */
  _drawLineBetweenFields(field1, field2, relationshipKey) {
    // Create a line element
    const lineEl = document.createElement('div');
    lineEl.className = 'bra-field-relationship';
    
    // Determine line color based on relationship type
    let lineColor = 'rgba(0, 0, 0, 0.3)';
    
    if (relationshipKey.includes('address_group')) {
      lineColor = 'rgba(171, 71, 188, 0.5)';
    } else if (relationshipKey.includes('name_group')) {
      lineColor = 'rgba(255, 193, 7, 0.5)';
    } else if (relationshipKey.includes('payment_group')) {
      lineColor = 'rgba(216, 27, 96, 0.5)';
    }
    
    // Calculate line position and angle
    const x1 = field1.center.x + window.scrollX;
    const y1 = field1.center.y + window.scrollY;
    const x2 = field2.center.x + window.scrollX;
    const y2 = field2.center.y + window.scrollY;
    
    const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
    const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    
    // Set line style
    lineEl.style.cssText = `
      position: absolute;
      top: ${y1}px;
      left: ${x1}px;
      width: ${length}px;
      height: 2px;
      background-color: ${lineColor};
      transform: rotate(${angle}deg);
      transform-origin: 0 0;
      z-index: 999998;
      pointer-events: none;
    `;
    
    // Add to document
    document.body.appendChild(lineEl);
  }
  
  /**
   * Classify detected fields by purpose
   * Adds classification information to each field
   * @returns {Object} Classification summary
   */
  classifyFields() {
    if (this.fields.length === 0) {
      this._log('No fields to classify');
      return { totalFields: 0, classifiedFields: 0 };
    }
    
    this._log('Classifying fields by purpose...');
    
    // Track classification statistics
    const stats = {
      totalFields: this.fields.length,
      classifiedFields: 0,
      highConfidenceFields: 0,
      categories: {}
    };
    
    // Classify each field
    this.fields.forEach(field => {
      const classification = this._classifyField(field);
      
      // Attach classification to field
      field.classification = classification;
      
      // Update statistics
      if (classification && classification.category) {
        stats.classifiedFields++;
        stats.categories[classification.category] = (stats.categories[classification.category] || 0) + 1;
        
        if (classification.confidence >= 70) {
          stats.highConfidenceFields++;
        }
      }
    });
    
    // Analyze field relationships to improve classification confidence
    this._detectFieldRelationships();
    
    // After detecting relationships, update high confidence count
    stats.highConfidenceFields = this.fields.filter(field => 
      field.classification && field.classification.confidence >= 70
    ).length;
    
    // Log classification results
    this._logClassificationResults();
    
    return stats;
  }
  
  /**
   * Detect field relationships and update classification confidence
   * Looks for related fields that form logical groups (address components, name parts, etc.)
   * @private
   */
  _detectFieldRelationships() {
    if (this.fields.length === 0) return;
    
    try {
      this._log('Detecting field relationships', null, true);
      
      // 1. Address field relationships
      this._detectAddressFieldRelationships();
      
      // 2. Name field relationships (first name, last name, etc.)
      this._detectNameFieldRelationships();
      
      // 3. Payment field relationships
      this._detectPaymentFieldRelationships();
      
      // 4. Proximity-based field groups
      this._detectProximityRelationships();
    } catch (error) {
      console.error('[BRA-FieldDetector] Error detecting field relationships:', error);
    }
  }
  
  /**
   * Detect address field relationships
   * @private
   */
  _detectAddressFieldRelationships() {
    // Get all fields that might be address-related
    const addressFields = this.fields.filter(field => 
      field.classification && 
      field.classification.category === 'businessAddress'
    );
    
    if (addressFields.length < 2) return;
    
    // Look for standard address fields by name pattern
    const streetPattern = /\b(street|address|addr|line1|address1)\b/i;
    const cityPattern = /\b(city|town|municipality)\b/i;
    const statePattern = /\b(state|province|region)\b/i;
    const zipPattern = /\b(zip|postal|postcode|zip\s*code)\b/i;
    
    // Identify specific address fields
    const streetFields = addressFields.filter(f => this._fieldMatchesPattern(f, streetPattern));
    const cityFields = addressFields.filter(f => this._fieldMatchesPattern(f, cityPattern));
    const stateFields = addressFields.filter(f => this._fieldMatchesPattern(f, statePattern));
    const zipFields = addressFields.filter(f => this._fieldMatchesPattern(f, zipPattern));
    
    // Check if we found a complete address set
    const hasFullAddressSet = streetFields.length > 0 && 
                              cityFields.length > 0 && 
                              stateFields.length > 0 && 
                              zipFields.length > 0;
    
    // If we have a full address set, boost confidence of all address fields
    if (hasFullAddressSet) {
      this._log('Detected complete address field set', null, true);
      
      // Apply a confidence boost to all related fields
      const allRelatedFields = [...streetFields, ...cityFields, ...stateFields, ...zipFields];
      
      allRelatedFields.forEach(field => {
        if (field.classification) {
          // Boost confidence based on completeness
          const boost = Math.min(15, (allRelatedFields.length * 3));
          field.classification.confidence = Math.min(100, field.classification.confidence + boost);
          field.classification.relationships = field.classification.relationships || [];
          field.classification.relationships.push('address_group');
        }
      });
    }
  }
  
  /**
   * Detect name field relationships (first name, last name, etc.)
   * @private
   */
  _detectNameFieldRelationships() {
    // Get all fields that might be person-related
    const personFields = this.fields.filter(field => 
      field.classification && 
      field.classification.category === 'personInfo'
    );
    
    if (personFields.length < 2) return;
    
    // Look for name patterns
    const firstNamePattern = /\b(first|given|fore)[\s_-]?name\b/i;
    const lastNamePattern = /\b(last|sur|family)[\s_-]?name\b/i;
    
    // Identify specific name fields
    const firstNameFields = personFields.filter(f => this._fieldMatchesPattern(f, firstNamePattern));
    const lastNameFields = personFields.filter(f => this._fieldMatchesPattern(f, lastNamePattern));
    
    // Check if we found a name set
    const hasNameSet = firstNameFields.length > 0 && lastNameFields.length > 0;
    
    // If we have a name set, boost confidence
    if (hasNameSet) {
      this._log('Detected name field set', null, true);
      
      // Apply a confidence boost to all related fields
      const allRelatedFields = [...firstNameFields, ...lastNameFields];
      
      allRelatedFields.forEach(field => {
        if (field.classification) {
          // Boost confidence for name fields
          field.classification.confidence = Math.min(100, field.classification.confidence + 10);
          field.classification.relationships = field.classification.relationships || [];
          field.classification.relationships.push('name_group');
        }
      });
    }
  }
  
  /**
   * Detect payment field relationships
   * @private
   */
  _detectPaymentFieldRelationships() {
    // Get all fields that might be payment-related
    const paymentFields = this.fields.filter(field => 
      field.classification && 
      field.classification.category === 'paymentInfo'
    );
    
    if (paymentFields.length < 2) return;
    
    // Look for payment patterns
    const cardNumberPattern = /\b(card[\s_-]?number|cc[\s_-]?num|credit[\s_-]?card)\b/i;
    const expirationPattern = /\b(expir|exp[\s_-]date|exp)\b/i;
    const cvvPattern = /\b(cvv|cvc|security[\s_-]?code|card[\s_-]?code)\b/i;
    
    // Identify specific payment fields
    const cardNumberFields = paymentFields.filter(f => this._fieldMatchesPattern(f, cardNumberPattern));
    const expirationFields = paymentFields.filter(f => this._fieldMatchesPattern(f, expirationPattern));
    const cvvFields = paymentFields.filter(f => this._fieldMatchesPattern(f, cvvPattern));
    
    // Check if we found a payment set
    const hasPaymentSet = cardNumberFields.length > 0 && 
                         (expirationFields.length > 0 || cvvFields.length > 0);
    
    // If we have a payment set, boost confidence
    if (hasPaymentSet) {
      this._log('Detected payment field set', null, true);
      
      // Apply a confidence boost to all related fields
      const allRelatedFields = [
        ...cardNumberFields, 
        ...expirationFields,
        ...cvvFields
      ];
      
      allRelatedFields.forEach(field => {
        if (field.classification) {
          // Boost confidence for payment fields
          field.classification.confidence = Math.min(100, field.classification.confidence + 10);
          field.classification.relationships = field.classification.relationships || [];
          field.classification.relationships.push('payment_group');
        }
      });
    }
  }
  
  /**
   * Detect proximity-based relationships between fields
   * @private
   */
  _detectProximityRelationships() {
    // Skip if we don't have position information for fields
    const fieldsWithPosition = this.fields.filter(f => 
      f && f.element && 
      typeof f.element.getBoundingClientRect === 'function' && 
      f.classification
    );
    
    if (fieldsWithPosition.length < 2) return;
    
    // Group fields by parent container
    const containerGroups = {};
    
    fieldsWithPosition.forEach(field => {
      if (!field.element || !field.element.parentElement) return;
      
      const parentId = field.element.parentElement.tagName + 
                      (field.element.parentElement.className || '') +
                      (field.element.parentElement.id || '');
      
      if (!containerGroups[parentId]) {
        containerGroups[parentId] = [];
      }
      
      containerGroups[parentId].push(field);
    });
    
    // For each container with multiple fields of the same category, boost confidence
    Object.values(containerGroups).forEach(fieldsInContainer => {
      if (fieldsInContainer.length < 2) return;
      
      // Group by category
      const categoryGroups = {};
      fieldsInContainer.forEach(f => {
        if (!f.classification || !f.classification.category) return;
        
        const category = f.classification.category;
        if (!categoryGroups[category]) {
          categoryGroups[category] = [];
        }
        categoryGroups[category].push(f);
      });
      
      // For categories with multiple fields in the same container
      Object.entries(categoryGroups).forEach(([category, fields]) => {
        if (fields.length >= 2) {
          this._log(`Detected ${fields.length} related ${category} fields in the same container`, null, true);
          
          // Boost confidence for fields in the same category and container
          fields.forEach(field => {
            if (field.classification) {
              field.classification.confidence = Math.min(100, field.classification.confidence + 5);
              field.classification.relationships = field.classification.relationships || [];
              field.classification.relationships.push('proximity_group');
            }
          });
        }
      });
    });
  }
  
  /**
   * Check if a field matches a given pattern in its attributes
   * @param {Object} field - The field to check
   * @param {RegExp} pattern - The pattern to match against
   * @returns {boolean} Whether the field matches the pattern
   * @private
   */
  _fieldMatchesPattern(field, pattern) {
    // Check name, id, and label for the pattern
    return (field.name && pattern.test(field.name)) || 
           (field.id && pattern.test(field.id)) || 
           (field.placeholder && pattern.test(field.placeholder)) ||
           (field.label && field.label.text && pattern.test(field.label.text));
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
      if (
        this.fieldGroups.button.includes(field.type) || 
        field.type === 'hidden' ||
        !field.isVisible
      ) {
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
      
      // For selects, check option values
      if (field.tagName === 'select' && field.options) {
        const optionText = field.options.map(opt => opt.text).join(' ').toLowerCase();
        textToAnalyze += ' ' + optionText;
      }
      
      // Check for option values in radio and checkbox groups
      if ((field.type === 'radio' || field.type === 'checkbox') && field.value) {
        textToAnalyze += ' ' + field.value.toLowerCase();
      }
      
      // Clean up the text
      textToAnalyze = textToAnalyze.replace(/[_-]/g, ' ');
      
      // Track matches for each category
      const matches = {};
      let bestCategory = null;
      let bestConfidence = 0;
      let bestMatch = null;
      
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
        
        // Check placeholder text
        if (field.placeholder && rules.patterns) {
          for (const pattern of rules.patterns) {
            if (pattern.test(field.placeholder)) {
              categoryScore += 25;
              matchDetails.placeholderMatch = pattern.toString();
              break;
            }
          }
        }
        
        // For select fields, check option values against patterns
        if (field.tagName === 'select' && field.options && rules.options) {
          const optionText = field.options.map(opt => opt.text).join(' ');
          let optionMatches = 0;
          
          for (const pattern of rules.options) {
            if (pattern.test(optionText)) {
              optionMatches++;
            }
          }
          
          if (optionMatches > 0) {
            // Calculate score based on percentage of matching options
            const optionMatchPercent = (optionMatches / rules.options.length) * 100;
            const optionScore = Math.min(30, optionMatchPercent);
            categoryScore += optionScore;
            matchDetails.optionMatches = optionMatches;
          }
        }
        
        // Check for subfields in address, contact, or person info fields
        if (rules.subfields) {
          // Handle nested subfields (like contact info with phone, email, etc.)
          if (typeof rules.subfields === 'object' && !Array.isArray(rules.subfields)) {
            for (const [subfieldKey, subfieldRules] of Object.entries(rules.subfields)) {
              // Handle both array of patterns and object with patterns
              const patterns = Array.isArray(subfieldRules) ? subfieldRules : 
                               (subfieldRules.patterns || []);
              
              for (const pattern of patterns) {
                if (pattern.test(textToAnalyze)) {
                  categoryScore += 15;
                  matchDetails.subfieldMatch = `${subfieldKey}: ${pattern.toString()}`;
                  break;
                }
              }
            }
          } 
          // Handle array of pattern arrays (like address subfields)
          else {
            for (const [subfieldKey, patterns] of Object.entries(rules.subfields)) {
              for (const pattern of patterns) {
                if (pattern.test(textToAnalyze)) {
                  categoryScore += 15;
                  matchDetails.subfieldMatch = `${subfieldKey}: ${pattern.toString()}`;
                  break;
                }
              }
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
          bestMatch = matchDetails;
        }
      }
      
      // Only return a classification if confidence is above a minimum threshold
      if (bestConfidence >= 20) {
        // Normalize confidence to a 0-100 scale
        // Score of 60 or higher is treated as 100% confidence
        const normalizedConfidence = Math.min(100, Math.round((bestConfidence / 60) * 100));
        
        return {
          category: bestCategory,
          confidence: normalizedConfidence,
          matches: bestMatch,
          allMatches: matches
        };
      }
      
      return null;
    } catch (error) {
      console.error('[BRA-FieldDetector] Error classifying field:', error);
      return null;
    }
  }
  
  /**
   * Log classification results to the console
   * @private
   */
  _logClassificationResults() {
    const classified = this.fields.filter(f => f.classification);
    const highConfidence = classified.filter(f => f.classification.confidence >= 70);
    
    console.group('[BRA-FieldDetector] Field Classification Results');
    console.log(`Classified ${classified.length} of ${this.fields.length} fields (${Math.round((classified.length/this.fields.length) * 100)}%)`);
    console.log(`High confidence classifications: ${highConfidence.length} (${Math.round((highConfidence.length/this.fields.length) * 100)}%)`);
    
    // Group fields by category
    const categoryCounts = {};
    classified.forEach(field => {
      const category = field.classification.category;
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
    
    // Log category distribution
    console.log('Fields by category:');
    console.table(Object.entries(categoryCounts)
      .map(([category, count]) => ({
        category,
        count,
        percentage: Math.round((count / classified.length) * 100) + '%'
      }))
      .sort((a, b) => b.count - a.count)
    );
    
    // Log high confidence fields
    if (highConfidence.length > 0) {
      console.log('High confidence field classifications:');
      console.table(highConfidence.map(field => ({
        name: field.name || field.id || '(unnamed)',
        type: field.type,
        category: field.classification.category,
        confidence: field.classification.confidence + '%',
        label: field.label ? field.label.text : '(no label)',
        relationships: field.classification.relationships ? field.classification.relationships.join(', ') : ''
      })));
    }
    
    // Log low confidence fields that might need manual review
    const lowConfidence = classified.filter(f => f.classification.confidence < 50);
    if (lowConfidence.length > 0 && this.options.debug) {
      console.log('Low confidence classifications (might need review):');
      console.table(lowConfidence.map(field => ({
        name: field.name || field.id || '(unnamed)',
        type: field.type,
        category: field.classification.category,
        confidence: field.classification.confidence + '%',
        label: field.label ? field.label.text : '(no label)'
      })));
    }
    
    // Log field relationships if any exist
    const fieldsWithRelationships = classified.filter(f => 
      f.classification.relationships && f.classification.relationships.length > 0
    );
    
    if (fieldsWithRelationships.length > 0 && this.options.debug) {
      console.log('Fields with relationships detected:');
      const relationshipGroups = {};
      
      fieldsWithRelationships.forEach(field => {
        field.classification.relationships.forEach(rel => {
          if (!relationshipGroups[rel]) relationshipGroups[rel] = [];
          relationshipGroups[rel].push({
            name: field.name || field.id || '(unnamed)',
            category: field.classification.category,
            confidence: field.classification.confidence
          });
        });
      });
      
      console.log('Relationship groups:');
      console.table(Object.entries(relationshipGroups).map(([groupName, fields]) => ({
        group: groupName,
        count: fields.length,
        fields: fields.map(f => f.name).join(', ')
      })));
    }
    
    console.groupEnd();
  }
  
  /**
   * Get all fields within a specific classification category
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
   * Get fields by classification confidence level
   * @param {number} minConfidence - Minimum confidence threshold (0-100)
   * @param {number} maxConfidence - Maximum confidence threshold (0-100)
   * @returns {Array} Fields that meet the confidence criteria
   */
  getFieldsByConfidence(minConfidence = 70, maxConfidence = 100) {
    return this.fields.filter(field => 
      field.classification && 
      field.classification.confidence >= minConfidence &&
      field.classification.confidence <= maxConfidence
    );
  }
  
  /**
   * Find the most likely field for a specific category
   * @param {string} category - The classification category to find
   * @returns {Object|null} The highest confidence field or null if none found
   */
  findBestFieldForCategory(category) {
    const categoryFields = this.getFieldsByCategory(category);
    
    if (categoryFields.length === 0) {
      return null;
    }
    
    // Sort by confidence (highest first)
    categoryFields.sort((a, b) => 
      b.classification.confidence - a.classification.confidence
    );
    
    return categoryFields[0];
  }
  
  /**
   * Get a summary of field classifications
   * @returns {Object} Classification summary
   */
  getClassificationSummary() {
    const classified = this.fields.filter(f => f.classification);
    const summary = {
      totalFields: this.fields.length,
      classifiedFields: classified.length,
      classificationRate: Math.round((classified.length / this.fields.length) * 100),
      categories: {}
    };
    
    // Count fields by category
    classified.forEach(field => {
      const category = field.classification.category;
      if (!summary.categories[category]) {
        summary.categories[category] = {
          count: 0,
          highConfidence: 0
        };
      }
      
      summary.categories[category].count++;
      
      if (field.classification.confidence >= 70) {
        summary.categories[category].highConfidence++;
      }
    });
    
    // Add relationship information
    const relationships = {};
    classified.filter(f => f.classification.relationships && f.classification.relationships.length > 0)
      .forEach(field => {
        field.classification.relationships.forEach(rel => {
          if (!relationships[rel]) {
            relationships[rel] = {
              count: 0,
              categories: {}
            };
          }
          relationships[rel].count++;
          
          // Track which categories have this relationship
          const category = field.classification.category;
          if (!relationships[rel].categories[category]) {
            relationships[rel].categories[category] = 0;
          }
          relationships[rel].categories[category]++;
        });
      });
    
    // Add to summary if any relationships exist
    if (Object.keys(relationships).length > 0) {
      summary.relationships = relationships;
    }
    
    return summary;
  }
  
  /**
   * Export detection data in a format useful for external analysis
   * @returns {Object} Export data including classification results
   */
  exportDetectionData() {
    // Create a simplified version of the detection data for export
    const exportData = {
      summary: this.getClassificationSummary(),
      fields: this.fields.map(field => ({
        index: field.index,
        type: field.type,
        tagName: field.tagName,
        name: field.name || null,
        id: field.id || null,
        placeholder: field.placeholder || null,
        label: field.label ? field.label.text : null,
        required: field.required,
        visible: field.isVisible,
        position: field.element ? this._getElementPosition(field.element) : null,
        classification: field.classification ? {
          category: field.classification.category,
          confidence: field.classification.confidence,
          relationships: field.classification.relationships || []
        } : null
      }))
    };
    
    return exportData;
  }
}

// Export the module
export { FieldDetector as default };