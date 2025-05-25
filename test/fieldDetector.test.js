// fieldDetector.test.js - Tests for the field detection system

describe('FieldDetector', () => {
  let FieldDetector;
  let mockKnowledgePatterns;

  beforeEach(() => {
    jest.resetModules();
    FieldDetector = require('../extension/modules/fieldDetector.js');

    // Mock knowledge patterns
    mockKnowledgePatterns = {
      field_patterns: {
        business_name: {
          keywords: ['business name', 'company name', 'entity name'],
          patterns: ['name.*business', 'business.*name'],
          validation: {
            required: true,
            maxLength: 200
          }
        },
        ein: {
          keywords: ['ein', 'tax id', 'federal tax id'],
          patterns: ['\\d{2}-\\d{7}'],
          validation: {
            pattern: '^\\d{2}-\\d{7}$'
          }
        },
        business_type: {
          keywords: ['entity type', 'business type', 'organization type'],
          values: ['LLC', 'Corporation', 'Partnership', 'Sole Proprietor']
        },
        address_street: {
          keywords: ['street address', 'address line 1', 'street'],
          patterns: ['street.*address', 'address.*1']
        }
      }
    };
  });

  describe('classifyField', () => {
    test('should classify business name field with high confidence', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'businessName';
      input.placeholder = 'Enter your business name';
      
      const label = document.createElement('label');
      label.textContent = 'Business Name';
      label.appendChild(input);

      const result = FieldDetector.classifyField(input, mockKnowledgePatterns);

      expect(result.type).toBe('business_name');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
      expect(result.validation).toEqual({
        required: true,
        maxLength: 200
      });
    });

    test('should classify EIN field based on pattern', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'taxId';
      input.placeholder = 'XX-XXXXXXX';

      const result = FieldDetector.classifyField(input, mockKnowledgePatterns);

      expect(result.type).toBe('ein');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    test('should classify business type select field', () => {
      const select = document.createElement('select');
      select.name = 'entityType';
      
      ['LLC', 'Corporation', 'Partnership'].forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });

      const result = FieldDetector.classifyField(select, mockKnowledgePatterns);

      expect(result.type).toBe('business_type');
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    test('should return unknown for unrecognized fields', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'randomField';

      const result = FieldDetector.classifyField(input, mockKnowledgePatterns);

      expect(result.type).toBe('unknown');
      expect(result.confidence).toBeLessThan(0.5);
    });

    test('should handle state-specific overrides', () => {
      const statePatterns = {
        ...mockKnowledgePatterns,
        field_patterns: {
          ...mockKnowledgePatterns.field_patterns,
          business_name: {
            ...mockKnowledgePatterns.field_patterns.business_name,
            keywords: ['entity name', 'dba name', 'doing business as'],
            validation: {
              required: true,
              maxLength: 100
            }
          }
        }
      };

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'DBA Name';

      const result = FieldDetector.classifyField(input, statePatterns);

      expect(result.type).toBe('business_name');
      expect(result.validation.maxLength).toBe(100);
    });

    test('should handle fields with multiple matching patterns', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'street_address_line_1';
      input.placeholder = 'Street Address';

      const result = FieldDetector.classifyField(input, mockKnowledgePatterns);

      expect(result.type).toBe('address_street');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('getFieldContext', () => {
    test('should extract context from surrounding elements', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'companyName';
      input.placeholder = 'Enter name';
      
      const label = document.createElement('label');
      label.textContent = 'Business Name';
      label.appendChild(input);

      const div = document.createElement('div');
      div.className = 'business-info-section';
      div.appendChild(label);

      document.body.appendChild(div);

      const context = FieldDetector.getFieldContext(input);

      expect(context.label).toBe('Business Name');
      expect(context.name).toBe('companyName');
      expect(context.placeholder).toBe('Enter name');
      expect(context.nearbyText).toContain('Business Name');

      document.body.removeChild(div);
    });

    test('should handle missing labels', () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'ein';

      const context = FieldDetector.getFieldContext(input);

      expect(context.label).toBe('');
      expect(context.id).toBe('ein');
    });
  });

  describe('calculateConfidence', () => {
    test('should calculate high confidence for exact matches', () => {
      const context = {
        label: 'Business Name',
        name: 'businessName',
        placeholder: 'Enter your business name'
      };

      const pattern = mockKnowledgePatterns.field_patterns.business_name;

      const confidence = FieldDetector.calculateConfidence(context, pattern);

      expect(confidence).toBeGreaterThanOrEqual(0.9);
    });

    test('should calculate lower confidence for partial matches', () => {
      const context = {
        label: 'Name',
        name: 'name',
        placeholder: ''
      };

      const pattern = mockKnowledgePatterns.field_patterns.business_name;

      const confidence = FieldDetector.calculateConfidence(context, pattern);

      expect(confidence).toBeLessThan(0.7);
      expect(confidence).toBeGreaterThan(0.3);
    });

    test('should handle regex pattern matching', () => {
      const context = {
        label: 'Tax ID',
        placeholder: '12-3456789'
      };

      const pattern = mockKnowledgePatterns.field_patterns.ein;

      const confidence = FieldDetector.calculateConfidence(context, pattern);

      expect(confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('detectAllFields', () => {
    test('should detect all fields in a form', () => {
      const form = document.createElement('form');
      
      // Business name field
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.name = 'businessName';
      
      const nameLabel = document.createElement('label');
      nameLabel.textContent = 'Business Name';
      nameLabel.appendChild(nameInput);
      
      // EIN field
      const einInput = document.createElement('input');
      einInput.type = 'text';
      einInput.placeholder = 'XX-XXXXXXX';
      
      const einLabel = document.createElement('label');
      einLabel.textContent = 'Federal Tax ID';
      einLabel.appendChild(einInput);
      
      // Business type field
      const typeSelect = document.createElement('select');
      typeSelect.name = 'entityType';
      
      form.appendChild(nameLabel);
      form.appendChild(einLabel);
      form.appendChild(typeSelect);
      
      document.body.appendChild(form);

      const fields = FieldDetector.detectAllFields(form, mockKnowledgePatterns);

      expect(fields).toHaveLength(3);
      expect(fields.find(f => f.type === 'business_name')).toBeTruthy();
      expect(fields.find(f => f.type === 'ein')).toBeTruthy();
      expect(fields.find(f => f.type === 'business_type')).toBeTruthy();

      document.body.removeChild(form);
    });

    test('should handle forms with no recognizable fields', () => {
      const form = document.createElement('form');
      
      const input = document.createElement('input');
      input.type = 'text';
      input.name = 'unrecognized';
      
      form.appendChild(input);

      const fields = FieldDetector.detectAllFields(form, mockKnowledgePatterns);

      expect(fields).toHaveLength(1);
      expect(fields[0].type).toBe('unknown');
      expect(fields[0].confidence).toBeLessThan(0.5);
    });

    test('should filter out hidden and disabled fields', () => {
      const form = document.createElement('form');
      
      // Visible field
      const visibleInput = document.createElement('input');
      visibleInput.type = 'text';
      visibleInput.name = 'businessName';
      
      // Hidden field
      const hiddenInput = document.createElement('input');
      hiddenInput.type = 'hidden';
      hiddenInput.name = 'ein';
      
      // Disabled field
      const disabledInput = document.createElement('input');
      disabledInput.type = 'text';
      disabledInput.name = 'address';
      disabledInput.disabled = true;
      
      form.appendChild(visibleInput);
      form.appendChild(hiddenInput);
      form.appendChild(disabledInput);

      const fields = FieldDetector.detectAllFields(form, mockKnowledgePatterns, {
        includeHidden: false,
        includeDisabled: false
      });

      expect(fields).toHaveLength(1);
      expect(fields[0].element).toBe(visibleInput);
    });
  });

  describe('performance', () => {
    test('should handle large forms efficiently', () => {
      const form = document.createElement('form');
      
      // Create 100 fields
      for (let i = 0; i < 100; i++) {
        const input = document.createElement('input');
        input.type = 'text';
        input.name = `field${i}`;
        form.appendChild(input);
      }

      const startTime = performance.now();
      const fields = FieldDetector.detectAllFields(form, mockKnowledgePatterns);
      const endTime = performance.now();

      expect(fields).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });
  });
});