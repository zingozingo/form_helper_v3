// knowledgeLoader.test.js - Tests for the knowledge loading system

describe('KnowledgeLoader', () => {
  let KnowledgeLoader;
  let mockChrome;

  beforeEach(() => {
    // Mock chrome.runtime.getURL
    mockChrome = {
      runtime: {
        getURL: jest.fn((path) => `chrome-extension://test/${path}`)
      }
    };
    global.chrome = mockChrome;

    // Mock fetch
    global.fetch = jest.fn();

    // Clear module cache
    jest.resetModules();
    KnowledgeLoader = require('../extension/modules/knowledgeLoader.js');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('loadCommonPatterns', () => {
    test('should load entity types successfully', async () => {
      const mockEntityTypes = {
        business_types: ['LLC', 'Corporation', 'Partnership'],
        field_patterns: {
          business_name: {
            keywords: ['business name', 'company name'],
            patterns: ['name.*business', 'business.*name']
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockEntityTypes
      });

      const patterns = await KnowledgeLoader.loadCommonPatterns();

      expect(fetch).toHaveBeenCalledWith('chrome-extension://test/knowledge/entities/entity_types.json');
      expect(patterns).toEqual(mockEntityTypes);
    });

    test('should handle loading errors gracefully', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const patterns = await KnowledgeLoader.loadCommonPatterns();

      expect(patterns).toEqual({
        business_types: [],
        field_patterns: {}
      });
    });

    test('should handle non-200 responses', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const patterns = await KnowledgeLoader.loadCommonPatterns();

      expect(patterns).toEqual({
        business_types: [],
        field_patterns: {}
      });
    });
  });

  describe('loadStatePatterns', () => {
    test('should load state-specific patterns successfully', async () => {
      const mockStateData = {
        state: 'california',
        abbreviation: 'CA',
        field_overrides: {
          business_name: {
            labels: ['Entity Name', 'DBA Name'],
            validation: {
              maxLength: 100
            }
          }
        },
        form_patterns: {
          business_registration: {
            urls: ['sos.ca.gov/business'],
            identifiers: ['California Business Registration']
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockStateData
      });

      const patterns = await KnowledgeLoader.loadStatePatterns('california');

      expect(fetch).toHaveBeenCalledWith('chrome-extension://test/knowledge/states/california.json');
      expect(patterns).toEqual(mockStateData);
    });

    test('should return null for non-existent states', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const patterns = await KnowledgeLoader.loadStatePatterns('unknown');

      expect(patterns).toBeNull();
    });

    test('should handle network errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const patterns = await KnowledgeLoader.loadStatePatterns('california');

      expect(patterns).toBeNull();
    });
  });

  describe('identifyState', () => {
    test('should identify state from URL - California', () => {
      const state = KnowledgeLoader.identifyState('https://bizfileonline.sos.ca.gov/forms');
      expect(state).toBe('california');
    });

    test('should identify state from URL - Delaware', () => {
      const state = KnowledgeLoader.identifyState('https://corp.delaware.gov/howtoform/');
      expect(state).toBe('delaware');
    });

    test('should identify state from page content', () => {
      const mockDocument = {
        body: {
          textContent: 'Welcome to the California Secretary of State Business Registration Portal'
        }
      };

      const state = KnowledgeLoader.identifyState('https://example.com', mockDocument);
      expect(state).toBe('california');
    });

    test('should return null for unknown states', () => {
      const state = KnowledgeLoader.identifyState('https://example.com');
      expect(state).toBeNull();
    });

    test('should prioritize URL detection over content', () => {
      const mockDocument = {
        body: {
          textContent: 'Delaware Business Registration'
        }
      };

      const state = KnowledgeLoader.identifyState('https://sos.ca.gov/business', mockDocument);
      expect(state).toBe('california');
    });
  });

  describe('mergePatterns', () => {
    test('should merge common and state patterns correctly', () => {
      const commonPatterns = {
        field_patterns: {
          business_name: {
            keywords: ['business name', 'company name'],
            patterns: ['name.*business']
          },
          ein: {
            keywords: ['ein', 'tax id'],
            patterns: ['\\d{2}-\\d{7}']
          }
        }
      };

      const statePatterns = {
        field_overrides: {
          business_name: {
            keywords: ['entity name', 'dba name'],
            validation: {
              maxLength: 100
            }
          }
        }
      };

      const merged = KnowledgeLoader.mergePatterns(commonPatterns, statePatterns);

      expect(merged.field_patterns.business_name.keywords).toContain('entity name');
      expect(merged.field_patterns.business_name.keywords).toContain('business name');
      expect(merged.field_patterns.business_name.validation.maxLength).toBe(100);
      expect(merged.field_patterns.ein).toEqual(commonPatterns.field_patterns.ein);
    });

    test('should handle null state patterns', () => {
      const commonPatterns = {
        field_patterns: {
          business_name: {
            keywords: ['business name']
          }
        }
      };

      const merged = KnowledgeLoader.mergePatterns(commonPatterns, null);
      expect(merged).toEqual(commonPatterns);
    });

    test('should handle empty patterns', () => {
      const merged = KnowledgeLoader.mergePatterns({}, {});
      expect(merged).toEqual({ field_patterns: {} });
    });
  });

  describe('loadAllKnowledge', () => {
    test('should load and merge all patterns successfully', async () => {
      const mockCommonPatterns = {
        field_patterns: {
          business_name: {
            keywords: ['business name']
          }
        }
      };

      const mockStatePatterns = {
        state: 'california',
        field_overrides: {
          business_name: {
            keywords: ['entity name']
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
          json: async () => mockStatePatterns
        });

      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://sos.ca.gov/business');

      expect(knowledge.state).toBe('california');
      expect(knowledge.patterns.field_patterns.business_name.keywords).toContain('business name');
      expect(knowledge.patterns.field_patterns.business_name.keywords).toContain('entity name');
    });

    test('should handle unknown states gracefully', async () => {
      const mockCommonPatterns = {
        field_patterns: {
          business_name: {
            keywords: ['business name']
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockCommonPatterns
      });

      const knowledge = await KnowledgeLoader.loadAllKnowledge('https://example.com');

      expect(knowledge.state).toBeNull();
      expect(knowledge.patterns).toEqual(mockCommonPatterns);
    });
  });
});