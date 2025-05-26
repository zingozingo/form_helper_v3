/**
 * Business Registration Assistant - Completely Standalone Content Script
 * Zero extension API dependencies - uses only DOM APIs and embedded data
 */

(function() {
  'use strict';
  
  console.log('[BRA] Business Registration Assistant - Standalone Version Loading');

  // ============================================================================
  // EMBEDDED KNOWLEDGE BASE
  // ============================================================================

  const KNOWLEDGE_BASE = {
    fieldPatterns: {
      // Business Information
      business_name: {
        patterns: ['business.*name', 'company.*name', 'entity.*name', 'organization.*name', 'dba', 'trade.*name', 'doing.*business.*as'],
        confidence: 90,
        validation: { required: true, minLength: 3, maxLength: 250 }
      },
      entity_type: {
        patterns: ['entity.*type', 'business.*type', 'organization.*type', 'structure', 'business.*structure', 'legal.*structure'],
        confidence: 85,
        validation: { required: true }
      },
      ein: {
        patterns: ['ein', 'employer.*identification', 'federal.*tax.*id', 'fein', 'tax.*id.*number', 'federal.*id'],
        confidence: 95,
        validation: { pattern: '^\\d{2}-?\\d{7}$', format: '00-0000000' }
      },
      
      // Contact Information
      first_name: {
        patterns: ['first.*name', 'fname', 'given.*name', 'contact.*first', 'owner.*first.*name'],
        confidence: 90,
        validation: { required: true, minLength: 1, maxLength: 50 }
      },
      last_name: {
        patterns: ['last.*name', 'lname', 'surname', 'family.*name', 'contact.*last', 'owner.*last.*name'],
        confidence: 90,
        validation: { required: true, minLength: 1, maxLength: 50 }
      },
      full_name: {
        patterns: ['full.*name', 'contact.*name', 'owner.*name', 'your.*name', 'applicant.*name'],
        confidence: 85,
        validation: { required: true, minLength: 3, maxLength: 100 }
      },
      email: {
        patterns: ['email', 'e-mail', 'electronic.*mail', 'contact.*email', 'business.*email'],
        confidence: 95,
        validation: { type: 'email', required: true }
      },
      phone: {
        patterns: ['phone', 'telephone', 'tel', 'mobile', 'cell', 'contact.*number', 'business.*phone'],
        confidence: 90,
        validation: { pattern: '^\\(?\\d{3}\\)?[-.\\s]?\\d{3}[-.\\s]?\\d{4}$' }
      },
      
      // Address Fields
      address: {
        patterns: ['street.*address', 'address.*1', 'address(?!.*2)', 'street', 'mailing.*address', 'business.*address', 'physical.*address'],
        confidence: 85,
        validation: { required: true, minLength: 5, maxLength: 100 }
      },
      address2: {
        patterns: ['address.*2', 'suite', 'apt', 'apartment', 'unit', 'building', 'floor'],
        confidence: 80,
        validation: { maxLength: 50 }
      },
      city: {
        patterns: ['city', 'town', 'municipality', 'locality'],
        confidence: 90,
        validation: { required: true, minLength: 2, maxLength: 50 }
      },
      state: {
        patterns: ['state', 'province', 'region'],
        confidence: 90,
        validation: { required: true }
      },
      zip: {
        patterns: ['zip', 'postal.*code', 'zipcode', 'zip.*code'],
        confidence: 90,
        validation: { pattern: '^\\d{5}(-\\d{4})?$' }
      },
      country: {
        patterns: ['country', 'nation'],
        confidence: 85,
        validation: { required: false }
      },
      
      // Additional Business Fields
      naics_code: {
        patterns: ['naics', 'naics.*code', 'industry.*code', 'classification.*code'],
        confidence: 85,
        validation: { pattern: '^\\d{6}$' }
      },
      sic_code: {
        patterns: ['sic', 'sic.*code', 'standard.*industrial'],
        confidence: 85,
        validation: { pattern: '^\\d{4}$' }
      },
      business_purpose: {
        patterns: ['business.*purpose', 'business.*activity', 'nature.*business', 'business.*description'],
        confidence: 80,
        validation: { minLength: 10, maxLength: 500 }
      },
      date_formed: {
        patterns: ['date.*formed', 'formation.*date', 'established.*date', 'incorporation.*date'],
        confidence: 85,
        validation: { type: 'date' }
      },
      fiscal_year_end: {
        patterns: ['fiscal.*year', 'tax.*year.*end', 'accounting.*period'],
        confidence: 80,
        validation: { type: 'date' }
      }
    },
    
    stateOverrides: {
      CA: {
        business_name: { validation: { required: true, minLength: 1, maxLength: 200 } },
        sos_file_number: { patterns: ['sos.*file.*number', 'secretary.*state.*file'], confidence: 90 }
      },
      DC: {
        ein: { patterns: ['fein', 'federal.*employer.*identification', 'ein', 'tax.*id'], validation: { required: true } },
        clean_hands: { patterns: ['clean.*hands', 'certificate.*clean.*hands'], confidence: 85 }
      },
      DE: {
        registered_agent: { patterns: ['registered.*agent', 'statutory.*agent', 'agent.*service.*process'], confidence: 90, validation: { required: true } },
        registered_office: { patterns: ['registered.*office', 'principal.*office'], confidence: 85 }
      },
      NY: {
        dos_id: { patterns: ['dos.*id', 'department.*state.*id'], confidence: 90 },
        county: { patterns: ['county', 'county.*formation'], confidence: 85, validation: { required: true } }
      },
      FL: {
        document_number: { patterns: ['document.*number', 'filing.*number'], confidence: 85 },
        registered_agent_signature: { patterns: ['registered.*agent.*signature', 'agent.*signature'], confidence: 80 }
      }
    },
    
    entityTypes: {
      llc: ['llc', 'limited liability company', 'l.l.c.', 'limited-liability company'],
      corporation: ['corporation', 'corp', 'incorporated', 'inc', 'c-corp', 's-corp'],
      partnership: ['partnership', 'general partnership', 'gp', 'limited partnership', 'lp', 'llp'],
      sole_proprietorship: ['sole proprietorship', 'sole proprietor', 'individual', 'dba'],
      nonprofit: ['nonprofit', 'non-profit', '501c3', '501(c)(3)', 'not-for-profit']
    },
    
    formTypes: {
      entity_formation: ['articles of organization', 'certificate of formation', 'incorporation', 'certificate of incorporation'],
      business_license: ['business license', 'business permit', 'operating permit', 'occupational license'],
      tax_registration: ['tax registration', 'sales tax permit', 'employer registration', 'tax account'],
      foreign_qualification: ['foreign qualification', 'certificate of authority', 'foreign registration'],
      annual_report: ['annual report', 'biennial report', 'statement of information', 'periodic report']
    },
    
    urlPatterns: {
      government: ['.gov', '.state.', '.us'],
      businessKeywords: ['business', 'register', 'registration', 'entity', 'formation', 'incorporate', 'llc', 'corporation', 'license', 'permit', 'tax', 'ein', 'employer', 'sos', 'secretary'],
      stateSpecific: {
        'california': ['business.ca.gov', 'sos.ca.gov', 'taxes.cdtfa.ca.gov'],
        'delaware': ['corp.delaware.gov', 'revenue.delaware.gov'],
        'dc': ['mytax.dc.gov', 'dc.gov/business'],
        'newyork': ['businessexpress.ny.gov', 'tax.ny.gov'],
        'florida': ['sunbiz.org', 'floridarevenue.com'],
        'texas': ['sos.state.tx.us', 'comptroller.texas.gov']
      }
    }
  };

  // ============================================================================
  // STANDALONE FIELD DETECTOR
  // ============================================================================

  class StandaloneFieldDetector {
    constructor(rootElement, options = {}) {
      this.root = rootElement || document;
      this.fields = [];
      this.options = {
        debug: options.debug || false,
        state: options.state || null
      };
      this.fieldPatterns = this._getFieldPatterns();
    }
    
    _getFieldPatterns() {
      let patterns = Object.assign({}, KNOWLEDGE_BASE.fieldPatterns);
      
      if (this.options.state && KNOWLEDGE_BASE.stateOverrides[this.options.state]) {
        const stateOverrides = KNOWLEDGE_BASE.stateOverrides[this.options.state];
        for (const [category, override] of Object.entries(stateOverrides)) {
          patterns[category] = Object.assign({}, patterns[category], override);
        }
      }
      
      return patterns;
    }
    
    detectFields() {
      this.fields = [];
      const formElements = this._findFormElements();
      
      for (const element of formElements) {
        const field = this._analyzeField(element);
        if (field) {
          this.fields.push(field);
        }
      }
      
      return this.fields;
    }
    
    _findFormElements() {
      const selectors = [
        'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"])',
        'select',
        'textarea',
        'input[type="checkbox"]',
        'input[type="radio"]'
      ];
      
      try {
        return Array.from(this.root.querySelectorAll(selectors.join(', ')));
      } catch (e) {
        console.warn('[BRA] Error finding form elements:', e);
        return [];
      }
    }
    
    _analyzeField(element) {
      if (!this._isVisible(element)) return null;
      
      const field = {
        element: element,
        type: this._getFieldType(element),
        name: element.name || element.id || '',
        id: element.id || '',
        label: this._findLabel(element),
        placeholder: element.placeholder || '',
        value: element.value || '',
        required: element.required || element.getAttribute('aria-required') === 'true',
        validation: {}
      };
      
      field.classification = this._classifyField(field);
      
      if (field.classification) {
        const pattern = this.fieldPatterns[field.classification.category];
        if (pattern && pattern.validation) {
          field.validation = pattern.validation;
        }
      }
      
      return field;
    }
    
    _isVisible(element) {
      if (!element || !element.offsetParent) return false;
      
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0' &&
             element.offsetWidth > 0 &&
             element.offsetHeight > 0;
    }
    
    _getFieldType(element) {
      if (element.tagName === 'SELECT') return 'select';
      if (element.tagName === 'TEXTAREA') return 'textarea';
      return element.type || 'text';
    }
    
    _findLabel(element) {
      // Check for label element with for attribute
      if (element.id) {
        const label = this.root.querySelector(`label[for="${CSS.escape(element.id)}"]`);
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
      
      // Check for aria-labelledby
      const ariaLabelledBy = element.getAttribute('aria-labelledby');
      if (ariaLabelledBy) {
        const labelElement = document.getElementById(ariaLabelledBy);
        if (labelElement) return { text: labelElement.textContent.trim(), element: labelElement };
      }
      
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
        // Get direct text nodes only (not from child elements)
        const textNodes = Array.from(parent.childNodes)
          .filter(node => node.nodeType === Node.TEXT_NODE)
          .map(node => node.textContent.trim())
          .filter(text => text.length > 0);
        
        if (textNodes.length > 0) {
          return textNodes.join(' ');
        }
        
        // Also check for labels in siblings
        const prevSibling = element.previousElementSibling;
        if (prevSibling && prevSibling.tagName === 'LABEL') {
          return prevSibling.textContent.trim();
        }
        
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
        field.placeholder,
        field.element.getAttribute('autocomplete') || ''
      ].join(' ').toLowerCase();
      
      let bestMatch = null;
      let highestConfidence = 0;
      
      for (const [category, config] of Object.entries(this.fieldPatterns)) {
        for (const pattern of config.patterns) {
          try {
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
          } catch (e) {
            console.warn('[BRA] Invalid regex pattern:', pattern, e);
          }
        }
      }
      
      return bestMatch;
    }
    
    getUIData() {
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
            element: field.element,
            type: field.type
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
  // STANDALONE URL ANALYZER
  // ============================================================================

  class StandaloneURLAnalyzer {
    static analyzeUrl(url) {
      const urlLower = url.toLowerCase();
      let score = 0;
      const analysis = {
        isGovernment: false,
        hasBusinessKeywords: false,
        matchedKeywords: [],
        stateIdentified: null
      };
      
      // Check for government domains
      for (const pattern of KNOWLEDGE_BASE.urlPatterns.government) {
        if (urlLower.includes(pattern)) {
          score += 30;
          analysis.isGovernment = true;
          break;
        }
      }
      
      // Check for business keywords
      for (const keyword of KNOWLEDGE_BASE.urlPatterns.businessKeywords) {
        if (urlLower.includes(keyword)) {
          score += 15;
          analysis.hasBusinessKeywords = true;
          analysis.matchedKeywords.push(keyword);
        }
      }
      
      // Check state-specific patterns
      for (const [state, patterns] of Object.entries(KNOWLEDGE_BASE.urlPatterns.stateSpecific)) {
        for (const pattern of patterns) {
          if (urlLower.includes(pattern)) {
            score += 25;
            analysis.stateIdentified = state;
            break;
          }
        }
        if (analysis.stateIdentified) break;
      }
      
      return {
        score: Math.min(score, 100),
        analysis: analysis
      };
    }
    
    static identifyStateFromUrl(url) {
      const urlLower = url.toLowerCase();
      
      // State code mappings
      const stateMap = {
        'ca.gov': 'CA', 'california': 'CA',
        'de.gov': 'DE', 'delaware': 'DE',
        'dc.gov': 'DC', 'mytax.dc.gov': 'DC',
        'ny.gov': 'NY', 'newyork': 'NY', 'new-york': 'NY',
        'fl.gov': 'FL', 'florida': 'FL', 'myflorida': 'FL',
        'tx.gov': 'TX', 'texas': 'TX',
        'il.gov': 'IL', 'illinois': 'IL',
        'pa.gov': 'PA', 'pennsylvania': 'PA',
        'oh.gov': 'OH', 'ohio': 'OH',
        'ga.gov': 'GA', 'georgia': 'GA',
        'nc.gov': 'NC', 'northcarolina': 'NC', 'north-carolina': 'NC',
        'mi.gov': 'MI', 'michigan': 'MI',
        'nj.gov': 'NJ', 'newjersey': 'NJ', 'new-jersey': 'NJ',
        'va.gov': 'VA', 'virginia': 'VA',
        'wa.gov': 'WA', 'washington': 'WA',
        'ma.gov': 'MA', 'massachusetts': 'MA',
        'az.gov': 'AZ', 'arizona': 'AZ',
        'tn.gov': 'TN', 'tennessee': 'TN',
        'in.gov': 'IN', 'indiana': 'IN',
        'mo.gov': 'MO', 'missouri': 'MO',
        'md.gov': 'MD', 'maryland': 'MD',
        'wi.gov': 'WI', 'wisconsin': 'WI',
        'co.gov': 'CO', 'colorado': 'CO',
        'mn.gov': 'MN', 'minnesota': 'MN',
        'sc.gov': 'SC', 'southcarolina': 'SC', 'south-carolina': 'SC',
        'al.gov': 'AL', 'alabama': 'AL',
        'la.gov': 'LA', 'louisiana': 'LA',
        'ky.gov': 'KY', 'kentucky': 'KY',
        'or.gov': 'OR', 'oregon': 'OR',
        'ok.gov': 'OK', 'oklahoma': 'OK',
        'ct.gov': 'CT', 'connecticut': 'CT',
        'ut.gov': 'UT', 'utah': 'UT',
        'ia.gov': 'IA', 'iowa': 'IA',
        'nv.gov': 'NV', 'nevada': 'NV',
        'ar.gov': 'AR', 'arkansas': 'AR',
        'ms.gov': 'MS', 'mississippi': 'MS',
        'ks.gov': 'KS', 'kansas': 'KS',
        'nm.gov': 'NM', 'newmexico': 'NM', 'new-mexico': 'NM',
        'ne.gov': 'NE', 'nebraska': 'NE',
        'wv.gov': 'WV', 'westvirginia': 'WV', 'west-virginia': 'WV',
        'id.gov': 'ID', 'idaho': 'ID',
        'hi.gov': 'HI', 'hawaii': 'HI',
        'nh.gov': 'NH', 'newhampshire': 'NH', 'new-hampshire': 'NH',
        'me.gov': 'ME', 'maine': 'ME',
        'ri.gov': 'RI', 'rhodeisland': 'RI', 'rhode-island': 'RI',
        'mt.gov': 'MT', 'montana': 'MT',
        'sd.gov': 'SD', 'southdakota': 'SD', 'south-dakota': 'SD',
        'nd.gov': 'ND', 'northdakota': 'ND', 'north-dakota': 'ND',
        'ak.gov': 'AK', 'alaska': 'AK',
        'vt.gov': 'VT', 'vermont': 'VT',
        'wy.gov': 'WY', 'wyoming': 'WY'
      };
      
      // Check direct mappings
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
  // STANDALONE INLINE UI
  // ============================================================================

  class StandaloneInlineUI {
    constructor() {
      this.container = null;
      this.isMinimized = false;
      this.detectionResult = null;
      this.styleElement = null;
    }
    
    create() {
      this.destroy();
      
      // Create container
      this.container = document.createElement('div');
      this.container.setAttribute('data-bra-panel', 'true');
      
      // Generate unique class names to avoid conflicts
      const prefix = 'bra-' + Date.now() + '-';
      this.classNames = {
        panel: prefix + 'panel',
        minimized: prefix + 'minimized',
        header: prefix + 'header',
        title: prefix + 'title',
        icon: prefix + 'icon',
        controls: prefix + 'controls',
        minimizeBtn: prefix + 'minimize-btn',
        closeBtn: prefix + 'close-btn',
        content: prefix + 'content',
        statusSection: prefix + 'status-section',
        statusIndicator: prefix + 'status-indicator',
        statusIcon: prefix + 'status-icon',
        statusText: prefix + 'status-text',
        fieldsSection: prefix + 'fields-section',
        fieldsContainer: prefix + 'fields-container',
        fieldCategory: prefix + 'field-category',
        fieldCategoryHeader: prefix + 'field-category-header',
        fieldItem: prefix + 'field-item',
        fieldLabel: prefix + 'field-label',
        fieldConfidence: prefix + 'field-confidence',
        actionsSection: prefix + 'actions-section',
        autofillBtn: prefix + 'autofill-btn',
        success: prefix + 'success',
        notDetected: prefix + 'not-detected',
        error: prefix + 'error',
        high: prefix + 'high',
        medium: prefix + 'medium',
        highlighted: prefix + 'highlighted'
      };
      
      this.container.className = this.classNames.panel;
      
      // Add styles
      this.addStyles();
      
      // Create panel HTML
      this.container.innerHTML = `
        <div class="${this.classNames.header}">
          <div class="${this.classNames.title}">
            <span class="${this.classNames.icon}">📋</span>
            Business Registration Assistant
          </div>
          <div class="${this.classNames.controls}">
            <button class="${this.classNames.minimizeBtn}" title="Minimize">_</button>
            <button class="${this.classNames.closeBtn}" title="Close">×</button>
          </div>
        </div>
        <div class="${this.classNames.content}">
          <div class="${this.classNames.statusSection}">
            <div class="${this.classNames.statusIndicator}">
              <span class="${this.classNames.statusIcon}">⏳</span>
              <span class="${this.classNames.statusText}">Analyzing page...</span>
            </div>
          </div>
          <div class="${this.classNames.fieldsSection}" style="display: none;">
            <h3>Detected Fields</h3>
            <div class="${this.classNames.fieldsContainer}"></div>
          </div>
          <div class="${this.classNames.actionsSection}" style="display: none;">
            <button class="${this.classNames.autofillBtn}">Auto Fill Sample Data</button>
          </div>
        </div>
      `;
      
      // Add to page
      document.body.appendChild(this.container);
      
      // Setup event handlers
      this.setupEventHandlers();
    }
    
    addStyles() {
      this.styleElement = document.createElement('style');
      this.styleElement.textContent = `
        .${this.classNames.panel} {
          position: fixed;
          top: 20px;
          right: 20px;
          width: 320px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          color: #333;
          line-height: 1.4;
        }
        
        .${this.classNames.panel}.${this.classNames.minimized} {
          width: auto;
        }
        
        .${this.classNames.panel}.${this.classNames.minimized} .${this.classNames.content} {
          display: none;
        }
        
        .${this.classNames.header} {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #f5f5f5;
          border-bottom: 1px solid #e0e0e0;
          border-radius: 8px 8px 0 0;
          cursor: move;
          user-select: none;
        }
        
        .${this.classNames.title} {
          display: flex;
          align-items: center;
          font-weight: 600;
        }
        
        .${this.classNames.icon} {
          margin-right: 8px;
          font-size: 18px;
        }
        
        .${this.classNames.controls} {
          display: flex;
          gap: 8px;
        }
        
        .${this.classNames.controls} button {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 18px;
          color: #666;
          padding: 4px 8px;
          border-radius: 4px;
          transition: background-color 0.2s;
          line-height: 1;
        }
        
        .${this.classNames.controls} button:hover {
          background-color: rgba(0, 0, 0, 0.1);
        }
        
        .${this.classNames.content} {
          padding: 16px;
          max-height: 500px;
          overflow-y: auto;
        }
        
        .${this.classNames.statusSection} {
          margin-bottom: 16px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
        }
        
        .${this.classNames.statusIndicator} {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .${this.classNames.statusIcon} {
          font-size: 20px;
          line-height: 1;
        }
        
        .${this.classNames.statusText} {
          font-weight: 500;
        }
        
        .${this.classNames.statusIndicator}.${this.classNames.success} .${this.classNames.statusIcon} {
          color: #4caf50;
        }
        
        .${this.classNames.statusIndicator}.${this.classNames.notDetected} .${this.classNames.statusIcon} {
          color: #ff9800;
        }
        
        .${this.classNames.statusIndicator}.${this.classNames.error} .${this.classNames.statusIcon} {
          color: #f44336;
        }
        
        .${this.classNames.fieldsSection} h3 {
          margin: 0 0 12px 0;
          font-size: 16px;
          font-weight: 600;
        }
        
        .${this.classNames.fieldCategory} {
          margin-bottom: 12px;
          background: #f8f9fa;
          border-radius: 6px;
          padding: 8px 12px;
        }
        
        .${this.classNames.fieldCategoryHeader} {
          font-weight: 600;
          margin-bottom: 4px;
          text-transform: capitalize;
        }
        
        .${this.classNames.fieldItem} {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 0;
          font-size: 13px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .${this.classNames.fieldItem}:hover {
          background-color: rgba(33, 150, 243, 0.1);
          margin: 0 -4px;
          padding: 4px;
          border-radius: 4px;
        }
        
        .${this.classNames.fieldLabel} {
          color: #666;
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .${this.classNames.fieldConfidence} {
          font-size: 12px;
          padding: 2px 6px;
          border-radius: 3px;
          background: #e0e0e0;
          color: #666;
          white-space: nowrap;
        }
        
        .${this.classNames.fieldConfidence}.${this.classNames.high} {
          background: #c8e6c9;
          color: #2e7d32;
        }
        
        .${this.classNames.fieldConfidence}.${this.classNames.medium} {
          background: #fff3cd;
          color: #856404;
        }
        
        .${this.classNames.actionsSection} {
          margin-top: 16px;
          padding-top: 16px;
          border-top: 1px solid #e0e0e0;
        }
        
        .${this.classNames.autofillBtn} {
          width: 100%;
          padding: 10px 16px;
          background: #2196f3;
          color: white;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
          font-size: 14px;
          font-family: inherit;
        }
        
        .${this.classNames.autofillBtn}:hover {
          background: #1976d2;
        }
        
        .${this.classNames.autofillBtn}:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
        
        .${this.classNames.highlighted} {
          outline: 3px solid #2196f3 !important;
          outline-offset: 2px !important;
          animation: ${this.classNames.panel}-pulse 2s ease-in-out;
        }
        
        @keyframes ${this.classNames.panel}-pulse {
          0% { outline-color: #2196f3; }
          50% { outline-color: #64b5f6; }
          100% { outline-color: #2196f3; }
        }
      `;
      
      document.head.appendChild(this.styleElement);
    }
    
    setupEventHandlers() {
      // Close button
      const closeBtn = this.container.querySelector(`.${this.classNames.closeBtn}`);
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.destroy());
      }
      
      // Minimize button
      const minimizeBtn = this.container.querySelector(`.${this.classNames.minimizeBtn}`);
      if (minimizeBtn) {
        minimizeBtn.addEventListener('click', () => this.toggleMinimize());
      }
      
      // Auto-fill button
      const autofillBtn = this.container.querySelector(`.${this.classNames.autofillBtn}`);
      if (autofillBtn) {
        autofillBtn.addEventListener('click', () => this.handleAutoFill());
      }
      
      // Make panel draggable
      this.makeDraggable();
    }
    
    makeDraggable() {
      const header = this.container.querySelector(`.${this.classNames.header}`);
      let isDragging = false;
      let currentX;
      let currentY;
      let initialX;
      let initialY;
      
      const startDrag = (e) => {
        if (e.target.tagName === 'BUTTON') return;
        
        isDragging = true;
        initialX = e.clientX - this.container.offsetLeft;
        initialY = e.clientY - this.container.offsetTop;
        
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', stopDrag);
      };
      
      const drag = (e) => {
        if (!isDragging) return;
        
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        
        // Keep panel within viewport
        const maxX = window.innerWidth - this.container.offsetWidth;
        const maxY = window.innerHeight - this.container.offsetHeight;
        
        currentX = Math.max(0, Math.min(currentX, maxX));
        currentY = Math.max(0, Math.min(currentY, maxY));
        
        this.container.style.left = currentX + 'px';
        this.container.style.top = currentY + 'px';
        this.container.style.right = 'auto';
      };
      
      const stopDrag = () => {
        isDragging = false;
        document.removeEventListener('mousemove', drag);
        document.removeEventListener('mouseup', stopDrag);
      };
      
      header.addEventListener('mousedown', startDrag);
    }
    
    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
      this.container.classList.toggle(this.classNames.minimized, this.isMinimized);
    }
    
    updateStatus(result) {
      this.detectionResult = result;
      const statusIndicator = this.container.querySelector(`.${this.classNames.statusIndicator}`);
      const statusIcon = this.container.querySelector(`.${this.classNames.statusIcon}`);
      const statusText = this.container.querySelector(`.${this.classNames.statusText}`);
      const fieldsSection = this.container.querySelector(`.${this.classNames.fieldsSection}`);
      const actionsSection = this.container.querySelector(`.${this.classNames.actionsSection}`);
      
      if (result.isBusinessRegistrationForm) {
        statusIndicator.className = `${this.classNames.statusIndicator} ${this.classNames.success}`;
        statusIcon.textContent = '✅';
        statusText.textContent = `Business form detected (${result.confidenceScore}% confidence)`;
        
        fieldsSection.style.display = 'block';
        actionsSection.style.display = 'block';
        
        if (result.fieldDetectionResults) {
          this.displayFields(result.fieldDetectionResults);
        }
      } else {
        statusIndicator.className = `${this.classNames.statusIndicator} ${this.classNames.notDetected}`;
        statusIcon.textContent = '❌';
        statusText.textContent = 'Not a business registration form';
        
        fieldsSection.style.display = 'none';
        actionsSection.style.display = 'none';
      }
    }
    
    displayFields(fieldResults) {
      const container = this.container.querySelector(`.${this.classNames.fieldsContainer}`);
      container.innerHTML = '';
      
      if (!fieldResults.uiData || !fieldResults.uiData.categories) {
        container.innerHTML = '<p style="color: #666; margin: 0;">No fields detected</p>';
        return;
      }
      
      // Sort categories for consistent display
      const categoryOrder = ['business_name', 'entity_type', 'ein', 'first_name', 'last_name', 'email', 'phone', 'address', 'city', 'state', 'zip'];
      const sortedCategories = Object.entries(fieldResults.uiData.categories).sort((a, b) => {
        const indexA = categoryOrder.indexOf(a[0]);
        const indexB = categoryOrder.indexOf(b[0]);
        if (indexA === -1 && indexB === -1) return a[0].localeCompare(b[0]);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
      
      for (const [category, fields] of sortedCategories) {
        const categoryEl = document.createElement('div');
        categoryEl.className = this.classNames.fieldCategory;
        
        const headerEl = document.createElement('div');
        headerEl.className = this.classNames.fieldCategoryHeader;
        headerEl.textContent = category.replace(/_/g, ' ');
        categoryEl.appendChild(headerEl);
        
        for (const field of fields) {
          const fieldEl = document.createElement('div');
          fieldEl.className = this.classNames.fieldItem;
          
          const labelEl = document.createElement('span');
          labelEl.className = this.classNames.fieldLabel;
          labelEl.textContent = field.label;
          labelEl.title = field.label; // Tooltip for long labels
          
          const confidenceEl = document.createElement('span');
          confidenceEl.className = this.classNames.fieldConfidence;
          confidenceEl.textContent = field.confidence + '%';
          
          if (field.confidence >= 90) {
            confidenceEl.classList.add(this.classNames.high);
          } else if (field.confidence >= 70) {
            confidenceEl.classList.add(this.classNames.medium);
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
      
      // Add summary
      const summaryEl = document.createElement('div');
      summaryEl.style.cssText = 'margin-top: 12px; padding-top: 12px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #666; text-align: center;';
      summaryEl.textContent = `${fieldResults.uiData.classifiedFields} of ${fieldResults.uiData.totalFields} fields classified (${fieldResults.uiData.classificationRate}%)`;
      container.appendChild(summaryEl);
    }
    
    highlightField(element) {
      if (!element) return;
      
      // Remove existing highlights
      document.querySelectorAll(`.${this.classNames.highlighted}`).forEach(el => {
        el.classList.remove(this.classNames.highlighted);
      });
      
      // Add highlight class
      element.classList.add(this.classNames.highlighted);
      
      // Scroll into view
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Remove highlight after 3 seconds
      setTimeout(() => {
        element.classList.remove(this.classNames.highlighted);
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
        full_name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '555-123-4567',
        // Address
        address: '123 Main Street',
        address2: 'Suite 100',
        city: 'Anytown',
        state: this.detectionResult.state || 'CA',
        zip: '12345',
        country: 'United States',
        // Tax IDs
        ein: '12-3456789',
        ssn: '123-45-6789',
        // Additional fields
        naics_code: '541511',
        sic_code: '7371',
        business_purpose: 'General business consulting and professional services',
        date_formed: new Date().toISOString().split('T')[0],
        fiscal_year_end: '12/31'
      };
      
      let filledCount = 0;
      const fields = this.detectionResult.fieldDetectionResults.fields || [];
      
      for (const field of fields) {
        if (field.classification && fillData[field.classification.category]) {
          const value = fillData[field.classification.category];
          if (field.element && !field.element.value && !field.element.disabled && !field.element.readOnly) {
            try {
              field.element.value = value;
              field.element.dispatchEvent(new Event('input', { bubbles: true }));
              field.element.dispatchEvent(new Event('change', { bubbles: true }));
              filledCount++;
              
              // Highlight filled field briefly
              this.highlightField(field.element);
            } catch (e) {
              console.warn('[BRA] Error filling field:', e);
            }
          }
        }
      }
      
      // Update button text temporarily
      const btn = this.container.querySelector(`.${this.classNames.autofillBtn}`);
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
      if (this.styleElement) {
        this.styleElement.remove();
        this.styleElement = null;
      }
    }
  }

  // ============================================================================
  // MAIN DETECTOR - USES ONLY DOM APIs
  // ============================================================================

  class StandaloneBusinessFormDetector {
    constructor() {
      this.detectionResult = null;
      this.panelUI = null;
      this.isDetecting = false;
      this.pageReadyCheckCount = 0;
      this.maxPageReadyChecks = 20;
    }
    
    async detectBusinessForm() {
      if (this.isDetecting) return;
      
      this.isDetecting = true;
      console.log('[BRA] Starting standalone business form detection...');
      
      try {
        const currentUrl = window.location.href;
        
        // Analyze URL
        const urlAnalysis = StandaloneURLAnalyzer.analyzeUrl(currentUrl);
        const urlScore = urlAnalysis.score;
        
        // Identify state
        const state = StandaloneURLAnalyzer.identifyStateFromUrl(currentUrl);
        
        // Analyze page content
        const contentScore = this.analyzePageContent();
        
        // Detect and analyze form fields
        const fieldDetector = new StandaloneFieldDetector(document, { state: state });
        const fields = fieldDetector.detectFields();
        const uiData = fieldDetector.getUIData();
        
        // Calculate form score
        let formScore = 0;
        const forms = document.querySelectorAll('form');
        formScore += Math.min(forms.length * 10, 30);
        formScore += Math.min(uiData.classifiedFields * 5, 50);
        formScore += Math.min(fields.length * 2, 20);
        
        // Calculate final confidence score
        const confidenceScore = Math.round(
          (urlScore * 0.3 + contentScore * 0.3 + formScore * 0.4)
        );
        
        // Business form detection logic
        const isBusinessForm = confidenceScore >= 50 || 
                              (uiData.classifiedFields >= 5 && state) ||
                              (urlAnalysis.analysis.isGovernment && uiData.classifiedFields >= 3);
        
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
        
        // Business registration keywords
        const keywords = [
          'business registration', 'register business', 'form llc', 'incorporate',
          'entity formation', 'business license', 'ein', 'employer identification',
          'articles of organization', 'certificate of formation', 'register your business',
          'start a business', 'business entity', 'tax registration', 'sales tax permit',
          'business permit', 'dba registration', 'assumed name', 'fictitious name',
          'foreign qualification', 'certificate of authority', 'registered agent'
        ];
        
        for (const keyword of keywords) {
          if (pageText.includes(keyword)) {
            score += 10;
          }
        }
        
        // Check headings
        const headings = document.querySelectorAll('h1, h2, h3, h4');
        for (const heading of headings) {
          const text = heading.textContent.toLowerCase();
          if (/business|registration|entity|formation|incorporate|license/.test(text)) {
            score += 15;
          }
        }
        
        // Check for form indicators
        const formIndicators = [
          'required field', 'all fields marked', 'submit application',
          'filing fee', 'processing time', 'next step', 'continue',
          'step 1', 'step 2', 'section 1', 'section 2'
        ];
        
        for (const indicator of formIndicators) {
          if (pageText.includes(indicator)) {
            score += 5;
          }
        }
        
        // Check for business entity types
        for (const [type, terms] of Object.entries(KNOWLEDGE_BASE.entityTypes)) {
          for (const term of terms) {
            if (pageText.includes(term)) {
              score += 8;
              break;
            }
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
        this.panelUI = new StandaloneInlineUI();
      }
      
      this.panelUI.create();
      this.panelUI.updateStatus(this.detectionResult);
    }
    
    waitForPageReady() {
      return new Promise((resolve) => {
        const checkReady = () => {
          this.pageReadyCheckCount++;
          
          // Check if page is ready
          const isReady = document.readyState === 'complete' &&
                         document.body &&
                         (document.querySelectorAll('form').length > 0 ||
                          document.querySelectorAll('input').length > 5 ||
                          this.pageReadyCheckCount >= this.maxPageReadyChecks);
          
          if (isReady) {
            // Additional delay for dynamic content
            setTimeout(resolve, 500);
          } else if (this.pageReadyCheckCount < this.maxPageReadyChecks) {
            setTimeout(checkReady, 250);
          } else {
            // Max checks reached, proceed anyway
            resolve();
          }
        };
        
        if (document.readyState === 'complete') {
          checkReady();
        } else {
          window.addEventListener('load', () => {
            setTimeout(checkReady, 100);
          });
        }
      });
    }
    
    async initialize() {
      console.log('[BRA] Initializing Standalone Business Registration Assistant...');
      
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
          this.pageReadyCheckCount = 0;
          if (this.panelUI) {
            this.panelUI.destroy();
            this.panelUI = null;
          }
          
          // Re-run detection after delay
          setTimeout(() => {
            this.detectBusinessForm();
          }, 1000);
        }
      };
      
      // Listen for various navigation events
      window.addEventListener('popstate', checkUrlChange);
      window.addEventListener('hashchange', checkUrlChange);
      
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
      
      // MutationObserver for major DOM changes
      let mutationTimer;
      const observer = new MutationObserver(() => {
        clearTimeout(mutationTimer);
        mutationTimer = setTimeout(() => {
          checkUrlChange();
          
          // Also check if form count changed significantly
          const formCount = document.querySelectorAll('form').length;
          const inputCount = document.querySelectorAll('input, select, textarea').length;
          
          if (!this.detectionResult && (formCount > 0 || inputCount > 10)) {
            console.log('[BRA] New forms detected, running detection...');
            this.detectBusinessForm();
          }
        }, 1000);
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  // ============================================================================
  // OPTIONAL MESSAGE HANDLING (IF EXTENSION CONTEXT EXISTS)
  // ============================================================================

  // Only set up message listener if chrome.runtime exists
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[BRA] Message received:', message.action);
        
        try {
          if (message.action === 'getDetectionResult') {
            sendResponse(window.BRA_STANDALONE.detector.detectionResult || {
              isBusinessRegistrationForm: false,
              error: 'No detection result available'
            });
          }
          else if (message.action === 'triggerDetection') {
            window.BRA_STANDALONE.detector.detectBusinessForm().then(() => {
              sendResponse({
                success: true,
                result: window.BRA_STANDALONE.detector.detectionResult
              });
            });
            return true; // Keep channel open for async response
          }
          else if (message.action === 'ping') {
            sendResponse({
              alive: true,
              timestamp: Date.now(),
              standalone: true
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
    } catch (e) {
      console.log('[BRA] Chrome runtime not available, running in standalone mode only');
    }
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  console.log('[BRA] Standalone Business Registration Assistant Initializing');
  console.log('[BRA] URL:', window.location.href);
  console.log('[BRA] No extension APIs required!');

  // Create and initialize detector
  const detector = new StandaloneBusinessFormDetector();
  detector.initialize();

  // Expose for debugging (using a namespace to avoid conflicts)
  window.BRA_STANDALONE = {
    detector: detector,
    getResult: () => detector.detectionResult,
    redetect: () => detector.detectBusinessForm(),
    showPanel: () => detector.showInlinePanel(),
    version: '1.0.0-standalone'
  };

  console.log('[BRA] Ready! Debug available at window.BRA_STANDALONE');

})();