// hybridDetection.test.js - Integration tests for the hybrid detection system

describe('Hybrid Detection Integration', () => {
  let KnowledgeLoader;
  let FieldDetector;
  let FormAssistant;

  beforeEach(() => {
    // Mock chrome runtime
    global.chrome = {
      runtime: {
        getURL: jest.fn((path) => `chrome-extension://test/${path}`)
      }
    };

    // Mock fetch
    global.fetch = jest.fn();

    jest.resetModules();
    KnowledgeLoader = require('../extension/modules/knowledgeLoader.js');
    FieldDetector = require('../extension/modules/fieldDetector.js');
    FormAssistant = require('../extension/modules/formAssistant.js');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Multi-state scenarios', () => {
    test('should handle California business registration form', async () => {
      // Mock knowledge data
      const mockCommonPatterns = {
        field_patterns: {
          business_name: {
            keywords: ['business name', 'company name'],
            validation: { required: true }
          },
          ein: {
            keywords: ['ein', 'tax id'],
            patterns: ['\\d{2}-\\d{7}']
          }
        }
      };

      const mockCaliforniaPatterns = {
        state: 'california',
        abbreviation: 'CA',
        field_overrides: {
          business_name: {
            keywords: ['entity name', 'doing business as'],
            validation: { required: true, maxLength: 100 }
          }
        },
        form_patterns: {
          business_registration: {
            urls: ['bizfileonline.sos.ca.gov'],
            identifiers: ['California Business Registration']
          }
        }
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCommonPatterns
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCaliforniaPatterns
        });

      // Create California form
      const form = createCaliforniaForm();
      document.body.appendChild(form);

      // Load knowledge
      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://bizfileonline.sos.ca.gov/forms');
      
      expect(knowledge.state).toBe('california');

      // Detect fields
      const fields = FieldDetector.detectAllFields(form, knowledge.patterns);

      expect(fields).toHaveLength(4);
      
      const businessNameField = fields.find(f => f.type === 'business_name');
      expect(businessNameField).toBeTruthy();
      expect(businessNameField.validation.maxLength).toBe(100);

      document.body.removeChild(form);
    });

    test('should handle Delaware business registration form', async () => {
      const mockCommonPatterns = {
        field_patterns: {
          business_name: {
            keywords: ['business name'],
            validation: { required: true }
          },
          registered_agent: {
            keywords: ['registered agent', 'agent name'],
            validation: { required: true }
          }
        }
      };

      const mockDelawarePatterns = {
        state: 'delaware',
        abbreviation: 'DE',
        field_overrides: {
          business_name: {
            keywords: ['entity name', 'corporation name'],
            validation: { required: true, maxLength: 80 }
          },
          registered_agent: {
            keywords: ['registered agent name', 'delaware agent'],
            validation: { required: true, delawareResident: true }
          }
        }
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockCommonPatterns
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockDelawarePatterns
        });

      // Create Delaware form
      const form = createDelawareForm();
      document.body.appendChild(form);

      // Load knowledge
      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://corp.delaware.gov/howtoform/');
      
      expect(knowledge.state).toBe('delaware');

      // Detect fields
      const fields = FieldDetector.detectAllFields(form, knowledge.patterns);

      const agentField = fields.find(f => f.type === 'registered_agent');
      expect(agentField).toBeTruthy();
      expect(agentField.validation.delawareResident).toBe(true);

      document.body.removeChild(form);
    });
  });

  describe('Unknown state handling', () => {
    test('should use universal patterns for unknown states', async () => {
      const mockCommonPatterns = {
        field_patterns: {
          business_name: {
            keywords: ['business name', 'company name'],
            validation: { required: true }
          },
          address_street: {
            keywords: ['street address', 'address line 1']
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommonPatterns
      });

      // Create generic form
      const form = createGenericForm();
      document.body.appendChild(form);

      // Load knowledge for unknown URL
      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://example.com/forms');
      
      expect(knowledge.state).toBeNull();

      // Detect fields
      const fields = FieldDetector.detectAllFields(form, knowledge.patterns);

      expect(fields.length).toBeGreaterThan(0);
      expect(fields.find(f => f.type === 'business_name')).toBeTruthy();

      document.body.removeChild(form);
    });

    test('should maintain reasonable performance with fallback detection', async () => {
      const mockCommonPatterns = {
        field_patterns: createLargePatternSet(50) // 50 different field types
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommonPatterns
      });

      const form = createLargeForm(30); // 30 fields
      document.body.appendChild(form);

      const startTime = performance.now();
      
      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://unknown-site.com');
      const fields = FieldDetector.detectAllFields(form, knowledge.patterns);
      
      const endTime = performance.now();

      expect(fields).toHaveLength(30);
      expect(endTime - startTime).toBeLessThan(2000); // Should complete in under 2 seconds

      document.body.removeChild(form);
    });
  });

  describe('Edge cases', () => {
    test('should handle forms with dynamic fields', async () => {
      const mockPatterns = {
        field_patterns: {
          business_name: {
            keywords: ['business name']
          },
          owner_name: {
            keywords: ['owner name', 'member name']
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatterns
      });

      const form = document.createElement('form');
      
      // Initial field
      const businessNameInput = document.createElement('input');
      businessNameInput.name = 'businessName';
      businessNameInput.placeholder = 'Business Name';
      form.appendChild(businessNameInput);

      document.body.appendChild(form);

      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://example.com');
      
      // First detection
      let fields = FieldDetector.detectAllFields(form, knowledge.patterns);
      expect(fields).toHaveLength(1);

      // Add dynamic field
      const ownerNameInput = document.createElement('input');
      ownerNameInput.name = 'ownerName';
      ownerNameInput.placeholder = 'Owner Name';
      form.appendChild(ownerNameInput);

      // Re-detect
      fields = FieldDetector.detectAllFields(form, knowledge.patterns);
      expect(fields).toHaveLength(2);

      document.body.removeChild(form);
    });

    test('should handle forms with nested fieldsets', async () => {
      const mockPatterns = {
        field_patterns: {
          business_name: { keywords: ['business name'] },
          address_street: { keywords: ['street address'] },
          address_city: { keywords: ['city'] },
          address_state: { keywords: ['state'] }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatterns
      });

      const form = createNestedForm();
      document.body.appendChild(form);

      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://example.com');
      const fields = FieldDetector.detectAllFields(form, knowledge.patterns);

      expect(fields.length).toBeGreaterThanOrEqual(4);
      expect(fields.filter(f => f.type.includes('address')).length).toBeGreaterThanOrEqual(3);

      document.body.removeChild(form);
    });

    test('should handle state detection conflicts', async () => {
      // Mock a page that mentions multiple states
      const mockDocument = {
        body: {
          textContent: 'California and Delaware Business Registration Services'
        }
      };

      // Should prioritize URL-based detection
      let state = KnowledgeLoader.identifyState('https://sos.ca.gov/business', mockDocument);
      expect(state).toBe('california');

      // Should return null when URL doesn't match any state and content is ambiguous
      state = KnowledgeLoader.identifyState('https://multi-state-forms.com', mockDocument);
      expect(state).toBeNull();
    });

    test('should handle malformed patterns gracefully', async () => {
      const mockPatterns = {
        field_patterns: {
          business_name: {
            keywords: null, // Malformed
            patterns: ['test']
          },
          ein: {
            keywords: ['ein'],
            patterns: ['[invalid regex('] // Invalid regex
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPatterns
      });

      const form = createSimpleForm();
      document.body.appendChild(form);

      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://example.com');
      
      // Should not throw error
      expect(() => {
        const fields = FieldDetector.detectAllFields(form, knowledge.patterns);
        expect(fields).toBeDefined();
      }).not.toThrow();

      document.body.removeChild(form);
    });
  });

  describe('Performance with multiple states', () => {
    test('should cache loaded patterns for repeated use', async () => {
      const mockPatterns = {
        field_patterns: {
          business_name: { keywords: ['business name'] }
        }
      };

      fetch.mockResolvedValue({
        ok: true,
        json: async () => mockPatterns
      });

      // First load
      await KnowledgeLoader.loadAllKnowledge('https://example.com');
      expect(fetch).toHaveBeenCalledTimes(1);

      // Second load should use cache
      await KnowledgeLoader.loadAllKnowledge('https://example.com');
      expect(fetch).toHaveBeenCalledTimes(1); // Still just once
    });

    test('should handle rapid state switching', async () => {
      const mockCommon = { field_patterns: {} };
      const mockCA = { state: 'california', field_overrides: {} };
      const mockDE = { state: 'delaware', field_overrides: {} };

      fetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockCommon })
        .mockResolvedValueOnce({ ok: true, json: async () => mockCA })
        .mockResolvedValueOnce({ ok: true, json: async () => mockCommon })
        .mockResolvedValueOnce({ ok: true, json: async () => mockDE });

      // Simulate rapid navigation between states
      const urls = [
        'https://sos.ca.gov/business',
        'https://corp.delaware.gov/forms',
        'https://sos.ca.gov/another-form',
        'https://corp.delaware.gov/another-form'
      ];

      const loadPromises = urls.map(url => KnowledgeLoader.loadAllKnowledge(url));
      const results = await Promise.all(loadPromises);

      expect(results[0].state).toBe('california');
      expect(results[1].state).toBe('delaware');
      expect(results[2].state).toBe('california');
      expect(results[3].state).toBe('delaware');
    });
  });
});

// Helper functions to create test forms
function createCaliforniaForm() {
  const form = document.createElement('form');
  form.id = 'ca-business-registration';

  const title = document.createElement('h1');
  title.textContent = 'California Business Registration';
  form.appendChild(title);

  // Entity name field
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.name = 'entityName';
  nameInput.placeholder = 'Entity Name';
  
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Entity Name (DBA)';
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  // Entity type field
  const typeSelect = document.createElement('select');
  typeSelect.name = 'entityType';
  ['LLC', 'Corporation', 'Partnership'].forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    typeSelect.appendChild(option);
  });
  form.appendChild(typeSelect);

  // EIN field
  const einInput = document.createElement('input');
  einInput.type = 'text';
  einInput.placeholder = 'XX-XXXXXXX';
  form.appendChild(einInput);

  // CA-specific field
  const sosNumberInput = document.createElement('input');
  sosNumberInput.name = 'sosFileNumber';
  sosNumberInput.placeholder = 'SOS File Number';
  form.appendChild(sosNumberInput);

  return form;
}

function createDelawareForm() {
  const form = document.createElement('form');
  form.id = 'de-incorporation';

  // Corporation name
  const nameInput = document.createElement('input');
  nameInput.name = 'corporationName';
  nameInput.placeholder = 'Corporation Name';
  
  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Corporation Name';
  nameLabel.appendChild(nameInput);
  form.appendChild(nameLabel);

  // Registered agent
  const agentInput = document.createElement('input');
  agentInput.name = 'registeredAgent';
  agentInput.placeholder = 'Delaware Registered Agent Name';
  
  const agentLabel = document.createElement('label');
  agentLabel.textContent = 'Registered Agent Name';
  agentLabel.appendChild(agentInput);
  form.appendChild(agentLabel);

  return form;
}

function createGenericForm() {
  const form = document.createElement('form');

  const businessInput = document.createElement('input');
  businessInput.type = 'text';
  businessInput.placeholder = 'Business Name';
  form.appendChild(businessInput);

  const addressInput = document.createElement('input');
  addressInput.type = 'text';
  addressInput.placeholder = 'Street Address';
  form.appendChild(addressInput);

  return form;
}

function createLargeForm(fieldCount) {
  const form = document.createElement('form');
  
  for (let i = 0; i < fieldCount; i++) {
    const input = document.createElement('input');
    input.type = 'text';
    input.name = `field_${i}`;
    input.placeholder = `Field ${i}`;
    form.appendChild(input);
  }
  
  return form;
}

function createLargePatternSet(patternCount) {
  const patterns = {};
  
  for (let i = 0; i < patternCount; i++) {
    patterns[`field_type_${i}`] = {
      keywords: [`keyword_${i}`, `pattern_${i}`],
      patterns: [`regex_${i}`]
    };
  }
  
  return patterns;
}

function createNestedForm() {
  const form = document.createElement('form');

  // Business info fieldset
  const businessFieldset = document.createElement('fieldset');
  const businessLegend = document.createElement('legend');
  businessLegend.textContent = 'Business Information';
  businessFieldset.appendChild(businessLegend);

  const businessInput = document.createElement('input');
  businessInput.placeholder = 'Business Name';
  businessFieldset.appendChild(businessInput);

  form.appendChild(businessFieldset);

  // Address fieldset
  const addressFieldset = document.createElement('fieldset');
  const addressLegend = document.createElement('legend');
  addressLegend.textContent = 'Business Address';
  addressFieldset.appendChild(addressLegend);

  const streetInput = document.createElement('input');
  streetInput.placeholder = 'Street Address';
  addressFieldset.appendChild(streetInput);

  const cityInput = document.createElement('input');
  cityInput.placeholder = 'City';
  addressFieldset.appendChild(cityInput);

  const stateSelect = document.createElement('select');
  stateSelect.name = 'state';
  const stateOption = document.createElement('option');
  stateOption.textContent = 'Select State';
  stateSelect.appendChild(stateOption);
  addressFieldset.appendChild(stateSelect);

  form.appendChild(addressFieldset);

  return form;
}

function createSimpleForm() {
  const form = document.createElement('form');
  
  const input = document.createElement('input');
  input.type = 'text';
  input.name = 'businessName';
  form.appendChild(input);
  
  return form;
}