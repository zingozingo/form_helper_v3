/**
 * Business Registration Assistant - Visual Section Detection
 * Scans DOM in document order to find true visual sections
 */

(function() {
  'use strict';
  
  // Skip if already initialized
  if (window.__braContentScriptVisual) {
    return;
  }
  window.__braContentScriptVisual = true;
  
  console.log('[BRA] Initializing visual section detection content script');
  
  // ============= VISUAL SECTION DETECTOR =============
  class VisualSectionDetector {
    constructor(config = {}) {
      this.root = config.root || document.body;
      this.detectedFields = [];
      this.sections = [];
      this.currentSection = null;
      this.processedElements = new Set();
      this.radioGroups = new Map();
      this.sectionHeaders = [];
    }
    
    async detectFields() {
      console.log('[BRA] Starting visual section detection');
      this.detectedFields = [];
      this.sections = [];
      this.currentSection = null;
      this.processedElements.clear();
      this.radioGroups.clear();
      this.sectionHeaders = [];
      
      try {
        // First pass: identify all potential section headers
        this.identifySectionHeaders();
        console.log(`[BRA] Identified ${this.sectionHeaders.length} potential section headers`);
        
        // Second pass: traverse DOM in order and assign fields to sections
        await this.traverseDOM(this.root);
        
        // Add any remaining fields to the current section
        this.finalizeCurrentSection();
        
        console.log(`[BRA] Detection complete. Found ${this.detectedFields.length} fields in ${this.sections.length} sections`);
        
      } catch (error) {
        console.error('[BRA] Field detection error:', error);
      }
      
      return this.detectedFields;
    }
    
    identifySectionHeaders() {
      // Get all elements in document order
      const walker = document.createTreeWalker(
        this.root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            // Skip invisible elements
            if (!this.isVisible(node)) return NodeFilter.FILTER_REJECT;
            
            // Check if this could be a section header
            if (this.isPotentialSectionHeader(node)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      
      let node;
      while (node = walker.nextNode()) {
        // Verify this header has form fields after it
        if (this.hasFormFieldsAfter(node)) {
          const headerInfo = {
            element: node,
            text: this.cleanText(node.textContent),
            level: this.getHeaderLevel(node),
            position: this.getElementPosition(node),
            visualProminence: this.getVisualProminence(node)
          };
          
          this.sectionHeaders.push(headerInfo);
          console.log(`[BRA] Found section header: "${headerInfo.text}" (level: ${headerInfo.level}, prominence: ${headerInfo.visualProminence.score})`);
        }
      }
      
      // Sort by document position (should already be in order, but ensure)
      this.sectionHeaders.sort((a, b) => {
        const pos = a.element.compareDocumentPosition(b.element);
        return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
      });
    }
    
    isPotentialSectionHeader(element) {
      const tagName = element.tagName;
      
      // 1. Semantic heading elements
      if (tagName.match(/^H[1-6]$/)) {
        return true;
      }
      
      // 2. Legend elements (for fieldsets)
      if (tagName === 'LEGEND') {
        return true;
      }
      
      // 3. Elements with heading role
      if (element.getAttribute('role') === 'heading') {
        return true;
      }
      
      // 4. Common section header classes
      const classList = element.className.toLowerCase();
      if (classList.match(/section[-_]?(title|header|heading)|form[-_]?(section|header)|panel[-_]?(title|header)/)) {
        return true;
      }
      
      // 5. Check visual prominence
      const prominence = this.getVisualProminence(element);
      if (prominence.score >= 70) {
        // This element is visually prominent enough to be a section header
        return true;
      }
      
      return false;
    }
    
    getVisualProminence(element) {
      const style = window.getComputedStyle(element);
      const prominence = {
        fontSize: 0,
        fontWeight: 0,
        marginTop: 0,
        marginBottom: 0,
        textTransform: 0,
        display: 0,
        score: 0
      };
      
      // Font size relative to normal text (16px baseline)
      const fontSize = parseFloat(style.fontSize);
      if (fontSize >= 20) prominence.fontSize = 30;
      else if (fontSize >= 18) prominence.fontSize = 20;
      else if (fontSize >= 16) prominence.fontSize = 10;
      
      // Font weight
      const fontWeight = style.fontWeight;
      if (fontWeight === 'bold' || fontWeight >= 600) prominence.fontWeight = 20;
      else if (fontWeight >= 500) prominence.fontWeight = 10;
      
      // Margins (spacing from other content)
      const marginTop = parseFloat(style.marginTop);
      const marginBottom = parseFloat(style.marginBottom);
      if (marginTop >= 20) prominence.marginTop = 10;
      if (marginBottom >= 15) prominence.marginBottom = 10;
      
      // Text transform
      if (style.textTransform === 'uppercase') prominence.textTransform = 10;
      
      // Display type
      if (style.display === 'block' || style.display === 'flex') prominence.display = 10;
      
      // Calculate total score
      prominence.score = Object.values(prominence).reduce((sum, val) => 
        typeof val === 'number' ? sum + val : sum, 0
      );
      
      return prominence;
    }
    
    getHeaderLevel(element) {
      const tagName = element.tagName;
      
      // Semantic headings
      if (tagName.match(/^H(\d)$/)) {
        return parseInt(tagName.charAt(1));
      }
      
      // Legend gets level 3
      if (tagName === 'LEGEND') {
        return 3;
      }
      
      // Elements with heading role
      const ariaLevel = element.getAttribute('aria-level');
      if (ariaLevel) {
        return parseInt(ariaLevel);
      }
      
      // Based on visual prominence
      const prominence = this.getVisualProminence(element);
      if (prominence.score >= 80) return 2;
      if (prominence.score >= 60) return 3;
      return 4;
    }
    
    hasFormFieldsAfter(element) {
      // Look for form fields within reasonable distance after this element
      const maxDistance = 300; // pixels
      const elementBottom = this.getElementPosition(element).bottom;
      
      // Create a walker to traverse elements after this one
      const walker = document.createTreeWalker(
        this.root,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            // Skip if before our element
            const pos = element.compareDocumentPosition(node);
            if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) {
              return NodeFilter.FILTER_REJECT;
            }
            
            // Check if it's a form field
            if (this.isFormField(node)) {
              const nodePos = this.getElementPosition(node);
              // Within reasonable distance?
              if (nodePos.top - elementBottom < maxDistance) {
                return NodeFilter.FILTER_ACCEPT;
              }
            }
            
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      
      // Need at least 2 form fields to consider this a section header
      let fieldCount = 0;
      let node;
      while (node = walker.nextNode()) {
        fieldCount++;
        if (fieldCount >= 2) return true;
      }
      
      return false;
    }
    
    isFormField(element) {
      const tagName = element.tagName;
      const type = element.type;
      
      // Standard form elements
      if (tagName === 'INPUT' && type !== 'hidden' && type !== 'submit' && type !== 'button' && type !== 'reset') {
        return true;
      }
      
      if (tagName === 'SELECT' || tagName === 'TEXTAREA') {
        return true;
      }
      
      return false;
    }
    
    async traverseDOM(container) {
      // Walk through all elements in document order
      const walker = document.createTreeWalker(
        container,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            // Accept section headers and form fields
            if (this.isSectionHeader(node) || this.isFormField(node)) {
              return NodeFilter.FILTER_ACCEPT;
            }
            return NodeFilter.FILTER_SKIP;
          }
        }
      );
      
      let node;
      while (node = walker.nextNode()) {
        // Check if this is a section header
        if (this.isSectionHeader(node)) {
          // Save current section if it has fields
          this.finalizeCurrentSection();
          
          // Start new section
          const headerInfo = this.sectionHeaders.find(h => h.element === node);
          if (headerInfo) {
            this.currentSection = {
              label: headerInfo.text,
              level: headerInfo.level,
              fields: []
            };
            console.log(`[BRA] Started section: "${this.currentSection.label}"`);
          }
        }
        // Otherwise it's a form field
        else if (this.isFormField(node) && !this.processedElements.has(node)) {
          // Make sure we have a section
          if (!this.currentSection) {
            this.currentSection = {
              label: 'Form Fields',
              level: 4,
              fields: []
            };
          }
          
          // Process the field based on type
          if (node.type === 'radio') {
            await this.processRadioButton(node);
          } else if (node.type === 'checkbox') {
            await this.processCheckbox(node);
          } else {
            await this.processStandardField(node);
          }
        }
      }
    }
    
    isSectionHeader(element) {
      return this.sectionHeaders.some(h => h.element === element);
    }
    
    finalizeCurrentSection() {
      if (this.currentSection && this.currentSection.fields.length > 0) {
        this.sections.push(this.currentSection);
        console.log(`[BRA] Finalized section "${this.currentSection.label}" with ${this.currentSection.fields.length} fields`);
      }
      this.currentSection = null;
    }
    
    async processRadioButton(radio) {
      if (this.processedElements.has(radio)) return;
      
      const groupName = radio.name;
      if (!groupName) {
        // No name, treat as standalone
        await this.processStandardField(radio);
        return;
      }
      
      // Check if we've already processed this group
      if (this.radioGroups.has(groupName)) {
        this.processedElements.add(radio);
        return;
      }
      
      // Find all radios in this group
      const groupRadios = Array.from(
        this.root.querySelectorAll(`input[type="radio"][name="${CSS.escape(groupName)}"]`)
      ).filter(r => this.isVisible(r));
      
      // Mark all as processed
      groupRadios.forEach(r => this.processedElements.add(r));
      
      // Find the group label
      const groupLabel = this.findRadioGroupLabel(groupRadios);
      
      // Create the field group
      const fieldGroup = {
        type: 'radio_group',
        name: groupName,
        label: groupLabel,
        required: groupRadios.some(r => r.required),
        options: groupRadios.map(r => ({
          value: r.value,
          label: this.findFieldLabel(r).text || r.value,
          checked: r.checked
        })),
        position: this.getElementPosition(groupRadios[0]),
        classification: this.classifyField({
          type: 'radio_group',
          label: groupLabel,
          name: groupName
        })
      };
      
      this.radioGroups.set(groupName, fieldGroup);
      this.currentSection.fields.push(fieldGroup);
      this.detectedFields.push(fieldGroup);
      
      console.log(`[BRA] Added radio group: "${groupLabel.text}" with ${groupRadios.length} options`);
    }
    
    async processCheckbox(checkbox) {
      if (this.processedElements.has(checkbox)) return;
      
      // Check if this is part of a checkbox group
      const checkboxName = checkbox.name;
      const isGroup = checkboxName && (
        checkboxName.endsWith('[]') || 
        this.hasRelatedCheckboxes(checkbox)
      );
      
      if (isGroup) {
        await this.processCheckboxGroup(checkbox);
      } else {
        // Single checkbox (like "I agree")
        await this.processStandardField(checkbox);
      }
    }
    
    hasRelatedCheckboxes(checkbox) {
      // Check if there are other checkboxes nearby with similar names
      const container = checkbox.closest('.form-group, .field-group, fieldset, div');
      if (!container) return false;
      
      const checkboxes = container.querySelectorAll('input[type="checkbox"]');
      return checkboxes.length > 1;
    }
    
    async processCheckboxGroup(checkbox) {
      // Similar to radio groups but for checkboxes
      const groupName = checkbox.name.replace('[]', '');
      
      // Find all related checkboxes
      let groupCheckboxes;
      if (checkbox.name.endsWith('[]')) {
        groupCheckboxes = Array.from(
          this.root.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(checkbox.name)}"]`)
        );
      } else {
        // Find by proximity
        const container = checkbox.closest('.form-group, .field-group, fieldset, div');
        groupCheckboxes = Array.from(
          container.querySelectorAll('input[type="checkbox"]')
        );
      }
      
      groupCheckboxes = groupCheckboxes.filter(c => 
        this.isVisible(c) && !this.processedElements.has(c)
      );
      
      if (groupCheckboxes.length <= 1) {
        // Not really a group
        await this.processStandardField(checkbox);
        return;
      }
      
      // Mark all as processed
      groupCheckboxes.forEach(c => this.processedElements.add(c));
      
      // Find group label
      const groupLabel = this.findCheckboxGroupLabel(groupCheckboxes);
      
      // Create field group
      const fieldGroup = {
        type: 'checkbox_group',
        name: groupName,
        label: groupLabel,
        required: false,
        options: groupCheckboxes.map(c => ({
          value: c.value,
          label: this.findFieldLabel(c).text || c.value,
          checked: c.checked
        })),
        position: this.getElementPosition(groupCheckboxes[0]),
        classification: this.classifyField({
          type: 'checkbox_group',
          label: groupLabel,
          name: groupName
        })
      };
      
      this.currentSection.fields.push(fieldGroup);
      this.detectedFields.push(fieldGroup);
      
      console.log(`[BRA] Added checkbox group: "${groupLabel.text}" with ${groupCheckboxes.length} options`);
    }
    
    async processStandardField(field) {
      if (this.processedElements.has(field)) return;
      if (field.type === 'hidden') return;
      
      this.processedElements.add(field);
      
      const fieldInfo = {
        type: field.type || field.tagName.toLowerCase(),
        name: field.name || '',
        id: field.id || '',
        label: this.findFieldLabel(field),
        placeholder: field.placeholder || '',
        required: field.required || field.getAttribute('aria-required') === 'true',
        value: field.value || '',
        position: this.getElementPosition(field),
        classification: null
      };
      
      // Handle select options
      if (field.tagName === 'SELECT') {
        fieldInfo.options = Array.from(field.options).map(opt => ({
          value: opt.value,
          label: opt.text,
          selected: opt.selected
        }));
      }
      
      // Classify the field
      fieldInfo.classification = this.classifyField(fieldInfo);
      
      this.currentSection.fields.push(fieldInfo);
      this.detectedFields.push(fieldInfo);
      
      console.log(`[BRA] Added field: "${fieldInfo.label.text}" (${fieldInfo.classification.category})`);
    }
    
    findRadioGroupLabel(radios) {
      // 1. Check for fieldset legend
      const fieldset = radios[0].closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend && this.isVisible(legend)) {
          return { text: this.cleanText(legend.textContent), type: 'legend' };
        }
      }
      
      // 2. Look for aria-labelledby or aria-describedby
      const labelledBy = radios[0].getAttribute('aria-labelledby');
      if (labelledBy) {
        const labelElement = document.getElementById(labelledBy);
        if (labelElement) {
          return { text: this.cleanText(labelElement.textContent), type: 'aria' };
        }
      }
      
      // 3. Find common container and look for preceding text
      const container = this.findCommonContainer(radios);
      if (container) {
        const precedingText = this.findPrecedingText(radios[0], container);
        if (precedingText) {
          return { text: precedingText, type: 'preceding' };
        }
      }
      
      // 4. Use name as fallback
      return { 
        text: radios[0].name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
        type: 'name' 
      };
    }
    
    findCheckboxGroupLabel(checkboxes) {
      // Similar to radio group label detection
      const fieldset = checkboxes[0].closest('fieldset');
      if (fieldset) {
        const legend = fieldset.querySelector('legend');
        if (legend && this.isVisible(legend)) {
          return { text: this.cleanText(legend.textContent), type: 'legend' };
        }
      }
      
      const container = this.findCommonContainer(checkboxes);
      if (container) {
        const precedingText = this.findPrecedingText(checkboxes[0], container);
        if (precedingText) {
          return { text: precedingText, type: 'preceding' };
        }
      }
      
      return { text: 'Options', type: 'default' };
    }
    
    findFieldLabel(field) {
      // 1. aria-label
      const ariaLabel = field.getAttribute('aria-label');
      if (ariaLabel) return { text: this.cleanText(ariaLabel), type: 'aria' };
      
      // 2. Label element with for attribute
      if (field.id) {
        const label = document.querySelector(`label[for="${CSS.escape(field.id)}"]`);
        if (label && this.isVisible(label)) {
          return { text: this.cleanText(label.textContent), type: 'for' };
        }
      }
      
      // 3. Parent label
      const parentLabel = field.closest('label');
      if (parentLabel) {
        const clone = parentLabel.cloneNode(true);
        const inputs = clone.querySelectorAll('input, select, textarea');
        inputs.forEach(el => el.remove());
        const text = this.cleanText(clone.textContent);
        if (text) return { text, type: 'parent' };
      }
      
      // 4. Look for preceding text in immediate container
      const container = field.parentElement;
      if (container) {
        const precedingText = this.findPrecedingText(field, container);
        if (precedingText) {
          return { text: precedingText, type: 'preceding' };
        }
      }
      
      // 5. Placeholder
      if (field.placeholder) {
        return { text: field.placeholder, type: 'placeholder' };
      }
      
      // 6. Name attribute
      if (field.name) {
        return { 
          text: field.name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), 
          type: 'name' 
        };
      }
      
      return { text: 'Unlabeled field', type: 'none' };
    }
    
    findPrecedingText(element, container) {
      // Walk backwards through siblings to find text
      let current = element.previousSibling;
      let textFound = '';
      
      while (current && container.contains(current)) {
        if (current.nodeType === Node.TEXT_NODE) {
          const text = this.cleanText(current.textContent);
          if (text) {
            textFound = text + (textFound ? ' ' + textFound : '');
          }
        } else if (current.nodeType === Node.ELEMENT_NODE) {
          // Check if this element contains only text (no form fields)
          if (!current.querySelector('input, select, textarea')) {
            const text = this.cleanText(current.textContent);
            if (text && text.length < 100) {
              return text;
            }
          }
          // Stop if we hit another form field
          if (this.isFormField(current)) {
            break;
          }
        }
        current = current.previousSibling;
      }
      
      if (textFound && textFound.length < 100) {
        return textFound;
      }
      
      return null;
    }
    
    findCommonContainer(elements) {
      if (elements.length === 0) return null;
      
      let parent = elements[0].parentElement;
      while (parent && parent !== this.root) {
        if (elements.every(el => parent.contains(el))) {
          return parent;
        }
        parent = parent.parentElement;
      }
      
      return null;
    }
    
    classifyField(fieldInfo) {
      const labelText = (fieldInfo.label?.text || '').toLowerCase();
      const fieldName = (fieldInfo.name || '').toLowerCase();
      const fieldType = (fieldInfo.type || '').toLowerCase();
      const combined = `${labelText} ${fieldName}`.toLowerCase();
      
      // Entity type/Organization type
      if (combined.match(/organization\s*type|entity\s*type|business\s*type|legal\s*structure|business\s*structure|incorporation\s*type|company\s*type/)) {
        return { category: 'entity_type', confidence: 95 };
      }
      
      // Business name
      if (combined.match(/organization\s*name|business\s*name|company\s*name|legal\s*name|entity\s*name|corporate\s*name|firm\s*name/)) {
        return { category: 'business_name', confidence: 95 };
      }
      
      // DBA
      if (combined.match(/dba|doing\s*business|trade\s*name|fictitious\s*name|assumed\s*name/)) {
        return { category: 'dba', confidence: 90 };
      }
      
      // EIN
      if (combined.match(/ein|employer\s*identification|federal\s*tax\s*id|fein|federal\s*id/)) {
        return { category: 'ein', confidence: 95 };
      }
      
      // State tax ID
      if (combined.match(/state\s*tax\s*id|state\s*id\s*number|state\s*registration|state\s*tax\s*number/)) {
        return { category: 'state_tax_id', confidence: 90 };
      }
      
      // SSN
      if (combined.match(/ssn|social\s*security\s*number|social\s*security/)) {
        return { category: 'ssn', confidence: 95 };
      }
      
      // Email
      if (fieldType === 'email' || combined.match(/email|e-mail|electronic\s*mail/)) {
        return { category: 'email', confidence: 95 };
      }
      
      // Phone
      if (fieldType === 'tel' || combined.match(/phone|telephone|mobile|cell|contact\s*number/)) {
        return { category: 'phone', confidence: 90 };
      }
      
      // Fax
      if (combined.match(/fax|facsimile/)) {
        return { category: 'fax', confidence: 90 };
      }
      
      // Address
      if (combined.match(/street|address\s*line\s*1|address\s*1|mailing\s*address|physical\s*address|business\s*address|principal\s*address/)) {
        return { category: 'address', confidence: 90 };
      }
      
      if (combined.match(/address\s*(line\s*)?2|suite|apt|unit\s*number/)) {
        return { category: 'address2', confidence: 85 };
      }
      
      // City
      if (combined.match(/city|town|municipality|locale/)) {
        return { category: 'city', confidence: 90 };
      }
      
      // State
      if (combined.match(/\bstate\b|province/) && !combined.includes('statement') && !combined.includes('state tax')) {
        return { category: 'state', confidence: 85 };
      }
      
      // ZIP
      if (combined.match(/zip|postal\s*code|post\s*code/)) {
        return { category: 'zip', confidence: 90 };
      }
      
      // County
      if (combined.match(/county/)) {
        return { category: 'county', confidence: 85 };
      }
      
      // Owner/Contact info
      if (combined.match(/owner|principal|proprietor|officer|director|member|contact\s*person/)) {
        return { category: 'owner_info', confidence: 85 };
      }
      
      if (combined.match(/first\s*name/)) {
        return { category: 'first_name', confidence: 90 };
      }
      
      if (combined.match(/last\s*name|surname/)) {
        return { category: 'last_name', confidence: 90 };
      }
      
      if (combined.match(/middle\s*(name|initial)/)) {
        return { category: 'middle_name', confidence: 85 };
      }
      
      // Business details
      if (combined.match(/naics|industry\s*code|business\s*code|sic\s*code/)) {
        return { category: 'naics_code', confidence: 85 };
      }
      
      if (combined.match(/business\s*purpose|business\s*description|nature\s*of\s*business|business\s*activity/)) {
        return { category: 'business_purpose', confidence: 85 };
      }
      
      if (combined.match(/employees|employee\s*count|number\s*of\s*employees|staff\s*size/)) {
        return { category: 'employee_count', confidence: 85 };
      }
      
      // Date fields
      if (fieldType === 'date' || combined.match(/date|when|established|commenced/)) {
        return { category: 'date', confidence: 80 };
      }
      
      // Selection fields - check content
      if ((fieldType === 'select-one' || fieldType === 'radio_group') && fieldInfo.options) {
        const optionText = fieldInfo.options.map(o => o.label || o.value).join(' ').toLowerCase();
        
        if (optionText.match(/llc|corporation|partnership|sole\s*proprietor|inc|limited/)) {
          return { category: 'entity_type', confidence: 90 };
        }
        
        if (optionText.match(/alabama|alaska|arizona|california|delaware|florida|georgia/)) {
          return { category: 'state', confidence: 85 };
        }
        
        if (optionText.match(/yes|no/) && fieldInfo.options.length === 2) {
          return { category: 'boolean', confidence: 85 };
        }
      }
      
      // Generic categories
      if (fieldType === 'select-one' || fieldType === 'radio_group') {
        return { category: 'selection', confidence: 70 };
      }
      
      if (fieldType === 'checkbox' && !combined.match(/agree|terms|conditions/)) {
        return { category: 'boolean', confidence: 75 };
      }
      
      if (fieldType === 'checkbox' && combined.match(/agree|accept|terms|conditions|consent|acknowledge/)) {
        return { category: 'agreement', confidence: 85 };
      }
      
      if (fieldType === 'textarea') {
        return { category: 'text_area', confidence: 60 };
      }
      
      if (fieldType === 'number') {
        return { category: 'number', confidence: 60 };
      }
      
      if (fieldType === 'text' || fieldType === 'input') {
        return { category: 'text', confidence: 50 };
      }
      
      return { category: 'other', confidence: 40 };
    }
    
    isVisible(element) {
      if (!element) return false;
      
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      
      return rect.width > 0 && 
             rect.height > 0 && 
             style.display !== 'none' && 
             style.visibility !== 'hidden' &&
             style.opacity !== '0';
    }
    
    getElementPosition(element) {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top + window.scrollY,
        left: rect.left + window.scrollX,
        bottom: rect.bottom + window.scrollY,
        right: rect.right + window.scrollX,
        width: rect.width,
        height: rect.height
      };
    }
    
    cleanText(text) {
      return text
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[*:]+$/, '')
        .trim();
    }
    
    getUIData() {
      // Organize data for display
      const categories = {};
      
      this.detectedFields.forEach(field => {
        const cat = field.classification.category;
        if (!categories[cat]) {
          categories[cat] = {
            label: this.getCategoryLabel(cat),
            fields: []
          };
        }
        categories[cat].fields.push(field);
      });
      
      return {
        sections: this.sections,
        categories: categories,
        summary: {
          totalFields: this.detectedFields.length,
          sectionCount: this.sections.length,
          categoryCount: Object.keys(categories).length,
          confidence: this.calculateConfidence()
        }
      };
    }
    
    getCategoryLabel(category) {
      const labels = {
        'business_name': 'Business Name',
        'entity_type': 'Entity Type',
        'dba': 'DBA/Trade Name',
        'ein': 'EIN/Federal Tax ID',
        'state_tax_id': 'State Tax ID',
        'ssn': 'SSN',
        'email': 'Email',
        'phone': 'Phone',
        'fax': 'Fax',
        'address': 'Street Address',
        'address2': 'Address Line 2',
        'city': 'City',
        'state': 'State',
        'zip': 'ZIP Code',
        'county': 'County',
        'owner_info': 'Owner Information',
        'first_name': 'First Name',
        'last_name': 'Last Name',
        'middle_name': 'Middle Name',
        'naics_code': 'Industry Code',
        'business_purpose': 'Business Purpose',
        'employee_count': 'Number of Employees',
        'date': 'Date',
        'selection': 'Selection',
        'boolean': 'Yes/No',
        'agreement': 'Terms & Agreements',
        'text_area': 'Text Area',
        'number': 'Number',
        'text': 'Text Field',
        'other': 'Other'
      };
      
      return labels[category] || category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
    
    calculateConfidence() {
      if (this.detectedFields.length === 0) return 0;
      
      // Key business fields
      const businessFields = ['business_name', 'entity_type', 'ein', 'dba', 'naics_code'];
      const businessFieldCount = this.detectedFields.filter(f => 
        businessFields.includes(f.classification.category)
      ).length;
      
      // Average field confidence
      const avgConfidence = this.detectedFields.reduce((sum, field) => 
        sum + field.classification.confidence, 0
      ) / this.detectedFields.length;
      
      // Boost for having sections
      const sectionBoost = this.sections.length > 1 ? 5 : 0;
      
      // Boost for business fields
      const businessBoost = businessFieldCount > 0 ? 10 : 0;
      
      return Math.min(Math.round(avgConfidence + sectionBoost + businessBoost), 95);
    }
  }
  
  // ============= SIMPLIFIED MESSAGING =============
  class Messaging {
    constructor() {
      this.handlers = new Map();
      this.setupListener();
    }
    
    registerHandler(action, handler) {
      this.handlers.set(action, handler);
    }
    
    async sendMessage(message) {
      return new Promise((resolve) => {
        try {
          if (!chrome?.runtime?.sendMessage) {
            resolve({ success: false, error: 'No messaging available' });
            return;
          }
          
          chrome.runtime.sendMessage(message, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('[BRA] Message error:', chrome.runtime.lastError.message);
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve(response || {});
            }
          });
        } catch (error) {
          resolve({ success: false, error: error.message });
        }
      });
    }
    
    setupListener() {
      if (!chrome?.runtime?.onMessage) return;
      
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message).then(response => {
          sendResponse(response || { received: true });
        });
        return true;
      });
    }
    
    async handleMessage(message) {
      const handler = this.handlers.get(message.action);
      if (handler) {
        try {
          return await handler(message);
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
      return { success: false, error: 'Unknown action' };
    }
  }
  
  // ============= URL DETECTOR =============
  const URLDetector = {
    analyzeUrl(url) {
      try {
        const urlString = url?.href || url?.toString() || '';
        const hostname = new URL(urlString).hostname.toLowerCase();
        
        const isGov = hostname.includes('.gov') || 
                     hostname.includes('.state.') ||
                     hostname.includes('.us');
        
        let state = null;
        if (hostname.includes('dc.gov')) state = 'DC';
        else if (hostname.includes('ca.gov')) state = 'CA';
        else if (hostname.includes('ny.gov')) state = 'NY';
        else if (hostname.includes('fl.gov')) state = 'FL';
        else if (hostname.includes('tx.gov')) state = 'TX';
        else if (hostname.includes('de.gov')) state = 'DE';
        
        return {
          isGovernmentSite: isGov,
          score: isGov ? 80 : 20,
          state: state
        };
      } catch (e) {
        return { isGovernmentSite: false, score: 0, state: null };
      }
    }
  };
  
  // ============= MAIN LOGIC =============
  const messaging = new Messaging();
  const state = {
    detection: {
      isRunning: false,
      lastResult: null,
      debounceTimer: null
    }
  };
  
  // Register handlers
  messaging.registerHandler('ping', async () => ({
    alive: true,
    timestamp: Date.now(),
    detectionStatus: {
      hasResult: !!state.detection.lastResult,
      isRunning: state.detection.isRunning
    }
  }));
  
  messaging.registerHandler('getDetectionStatus', async () => ({
    hasResult: !!state.detection.lastResult,
    result: state.detection.lastResult,
    isRunning: state.detection.isRunning
  }));
  
  messaging.registerHandler('getDetectionResult', async () => {
    if (state.detection.lastResult) {
      return state.detection.lastResult;
    }
    
    if (!state.detection.isRunning) {
      scheduleDetection();
    }
    
    return {
      isBusinessRegistrationForm: false,
      confidenceScore: 0,
      message: 'No result available'
    };
  });
  
  messaging.registerHandler('triggerDetection', async () => {
    scheduleDetection();
    return {
      scheduled: true,
      hasResult: !!state.detection.lastResult,
      result: state.detection.lastResult
    };
  });
  
  function scheduleDetection() {
    if (state.detection.debounceTimer) {
      clearTimeout(state.detection.debounceTimer);
    }
    
    state.detection.debounceTimer = setTimeout(() => {
      runDetection();
    }, 500);
  }
  
  async function runDetection() {
    if (state.detection.isRunning) return;
    
    console.log('[BRA] Running visual section detection');
    state.detection.isRunning = true;
    
    try {
      const result = {
        timestamp: Date.now(),
        url: window.location.href,
        isBusinessRegistrationForm: false,
        confidenceScore: 0
      };
      
      // URL detection
      result.urlDetection = URLDetector.analyzeUrl(window.location);
      
      // Field detection with visual sections
      const detector = new VisualSectionDetector();
      const fields = await detector.detectFields();
      const uiData = detector.getUIData();
      
      result.fieldDetection = {
        isDetected: fields.length > 0,
        fields: fields,
        uiData: uiData,
        confidence: uiData.summary.confidence,
        state: result.urlDetection.state,
        classifiedFields: fields.length
      };
      
      // Calculate overall score
      const urlScore = result.urlDetection?.score || 0;
      const fieldConfidence = uiData.summary.confidence || 0;
      
      // Weight field detection more heavily
      result.confidenceScore = Math.round((urlScore * 0.3) + (fieldConfidence * 0.7));
      result.isBusinessRegistrationForm = result.confidenceScore > 40 && fields.length > 0;
      result.state = result.urlDetection.state;
      
      // Store result
      state.detection.lastResult = result;
      
      // Send to background
      await messaging.sendMessage({
        action: 'formDetected',
        result: result
      });
      
      console.log('[BRA] Visual detection complete:', {
        fields: fields.length,
        sections: uiData.sections.length,
        confidence: result.confidenceScore
      });
      
    } catch (error) {
      console.error('[BRA] Detection error:', error);
    } finally {
      state.detection.isRunning = false;
    }
  }
  
  // Initialize
  async function initialize() {
    console.log('[BRA] Initializing visual section detection');
    
    await messaging.sendMessage({
      action: 'contentScriptReady',
      url: window.location.href
    });
    
    // Initial detection
    setTimeout(() => {
      scheduleDetection();
    }, 1000);
    
    // Set up mutation observer
    if (document.body) {
      const observer = new MutationObserver(() => {
        if (!state.detection.lastResult?.isBusinessRegistrationForm) {
          scheduleDetection();
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
    
    console.log('[BRA] Visual section detection ready');
  }
  
  initialize();
  
})();