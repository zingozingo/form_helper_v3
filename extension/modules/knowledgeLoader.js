/**
 * Knowledge Loader Module
 * Manages loading and merging of common and state-specific patterns
 */

class KnowledgeLoader {
  constructor() {
    this.commonPatterns = null;
    this.stateData = new Map();
    this.currentState = null;
  }

  /**
   * Initialize the knowledge loader with common patterns
   */
  async initialize() {
    console.log('[BRA-KnowledgeLoader] Loading common patterns...');
    
    try {
      // Load all core pattern files
      const coreFiles = [
        'knowledge/common/patterns.json',
        'knowledge/common/common-patterns.json',
        'knowledge/common/field-definitions.json',
        'knowledge/common/validation-rules.json'
      ];
      
      const loadPromises = coreFiles.map(async (file) => {
        try {
          const response = await fetch(chrome.runtime.getURL(file));
          if (response.ok) {
            const data = await response.json();
            console.log(`[BRA-KnowledgeLoader] Loaded ${file}:`, Object.keys(data).length, 'keys');
            return { file, data };
          }
        } catch (e) {
          console.warn(`[BRA-KnowledgeLoader] Could not load ${file}:`, e.message);
        }
        return null;
      });
      
      const results = await Promise.all(loadPromises);
      
      // Initialize commonPatterns with all loaded data
      this.commonPatterns = {
        field_patterns: {},
        url_patterns: {},
        field_definitions: {},
        validation_rules: {},
        government_indicators: [],
        business_terminology: [],
        form_patterns: {}
      };
      
      // Merge all loaded patterns
      let totalPatterns = 0;
      results.forEach(result => {
        if (result && result.data) {
          const { file, data } = result;
          
          if (file.includes('patterns.json')) {
            Object.assign(this.commonPatterns, data);
          } else if (file.includes('common-patterns.json')) {
            // Merge specific pattern types
            if (data.government_indicators) {
              this.commonPatterns.government_indicators = data.government_indicators;
            }
            if (data.business_terminology) {
              this.commonPatterns.business_terminology = data.business_terminology;
            }
            if (data.form_patterns) {
              Object.assign(this.commonPatterns.form_patterns, data.form_patterns);
            }
            if (data.field_patterns) {
              Object.assign(this.commonPatterns.field_patterns, data.field_patterns);
            }
          } else if (file.includes('field-definitions.json')) {
            this.commonPatterns.field_definitions = data;
          } else if (file.includes('validation-rules.json')) {
            this.commonPatterns.validation_rules = data;
          }
          
          totalPatterns += Object.keys(data).length;
        }
      });
      
      console.log('[BRA-KnowledgeLoader] Common patterns loaded:', Object.keys(this.commonPatterns));
      console.log('[BRA-KnowledgeLoader] Total patterns loaded:', totalPatterns);
      
    } catch (error) {
      console.error('[BRA-KnowledgeLoader] Failed to load common patterns:', error);
      // Provide minimal fallback patterns
      this.commonPatterns = {
        field_patterns: {
          business_name: {
            patterns: ["business.*name", "company.*name", "entity.*name"],
            priority: 90
          },
          ein: {
            patterns: ["ein", "employer.*identification", "federal.*tax.*id"],
            priority: 95
          }
        },
        url_patterns: {
          government: ["gov", "state.*us"],
          business_registration: ["business", "entity", "corp", "llc", "register"]
        }
      };
    }
  }

  /**
   * Load state-specific data
   * @param {string} stateCode - Two-letter state code (e.g., 'CA', 'DE')
   */
  async loadStateData(stateCode) {
    if (!stateCode || this.stateData.has(stateCode)) {
      return this.stateData.get(stateCode);
    }

    console.log(`[BRA-KnowledgeLoader] Loading ${stateCode} overrides...`);
    
    try {
      const stateLower = stateCode.toLowerCase();
      let stateData = {};
      
      // Try loading from single file first (e.g., california.json, delaware.json)
      try {
        const response = await fetch(chrome.runtime.getURL(`knowledge/states/${stateLower}.json`));
        if (response.ok) {
          stateData = await response.json();
          console.log(`[BRA-KnowledgeLoader] Loaded ${stateCode} patterns from single file:`, Object.keys(stateData).length, 'keys');
        }
      } catch (e) {
        // Single file not found, try directory structure
        console.log(`[BRA-KnowledgeLoader] No single file for ${stateCode}, checking directory structure`);
      }
      
      // For states with directory structure (e.g., dc/), load individual files
      if (Object.keys(stateData).length === 0) {
        try {
          let loadedFiles = 0;
          
          // Load forms.json
          const formsResponse = await fetch(chrome.runtime.getURL(`knowledge/states/${stateLower}/forms.json`));
          if (formsResponse.ok) {
            const forms = await formsResponse.json();
            stateData = { ...stateData, ...forms };
            loadedFiles++;
            console.log(`[BRA-KnowledgeLoader] Loaded ${stateCode}/forms.json`);
          }
          
          // Load agencies.json
          const agenciesResponse = await fetch(chrome.runtime.getURL(`knowledge/states/${stateLower}/agencies.json`));
          if (agenciesResponse.ok) {
            const agencies = await agenciesResponse.json();
            stateData.agencies = agencies.agencies || agencies;
            loadedFiles++;
            console.log(`[BRA-KnowledgeLoader] Loaded ${stateCode}/agencies.json`);
          }
          
          // Load overrides.json
          const overridesResponse = await fetch(chrome.runtime.getURL(`knowledge/states/${stateLower}/overrides.json`));
          if (overridesResponse.ok) {
            const overrides = await overridesResponse.json();
            stateData.field_mappings = overrides.field_mappings || {};
            stateData.url_patterns = overrides.url_patterns || {};
            loadedFiles++;
            console.log(`[BRA-KnowledgeLoader] Loaded ${stateCode}/overrides.json`);
          }
          
          if (loadedFiles > 0) {
            console.log(`[BRA-KnowledgeLoader] Loaded ${loadedFiles} files for ${stateCode}`);
          }
        } catch (e) {
          console.warn(`[BRA-KnowledgeLoader] Could not load state data from directory for ${stateCode}:`, e.message);
        }
      }
      
      if (Object.keys(stateData).length > 0) {
        this.stateData.set(stateCode, stateData);
        this.currentState = stateCode;
        console.log(`State data loaded for ${stateCode}`);
        return stateData;
      } else {
        console.warn(`No state-specific data found for ${stateCode}, using common patterns`);
        return null;
      }
    } catch (error) {
      console.warn(`Error loading state data for ${stateCode}:`, error);
      return null;
    }
  }

  /**
   * Get merged field patterns for the current context
   * @param {string} stateCode - Optional state code
   * @returns {Object} Merged field patterns with proper precedence
   */
  async getFieldPatterns(stateCode = null) {
    if (!this.commonPatterns) {
      await this.initialize();
    }

    // Start with common patterns
    let patterns = { ...this.commonPatterns.field_patterns };
    console.log('[BRA-KnowledgeLoader] Starting with common field patterns:', Object.keys(patterns).length, 'patterns');

    // Load and merge state-specific patterns if available
    if (stateCode) {
      console.log(`[BRA-KnowledgeLoader] Loading ${stateCode}-specific field patterns...`);
      const stateData = await this.loadStateData(stateCode);
      if (stateData && stateData.field_mappings) {
        // State-specific patterns override common ones
        const originalCount = Object.keys(patterns).length;
        patterns = this.mergePatterns(patterns, stateData.field_mappings);
        const newCount = Object.keys(patterns).length;
        console.log(`[BRA-KnowledgeLoader] After ${stateCode} merge: ${newCount} total patterns (${newCount - originalCount} new)`);
      } else {
        console.log(`[BRA-KnowledgeLoader] No field mappings found for ${stateCode}`);
      }
    }

    return patterns;
  }

  /**
   * Get URL patterns for state detection
   * @param {string} stateCode - Optional state code for state-specific patterns
   * @returns {Object} URL patterns
   */
  async getUrlPatterns(stateCode = null) {
    if (!this.commonPatterns) {
      await this.initialize();
    }

    let patterns = { ...this.commonPatterns.url_patterns };

    if (stateCode) {
      const stateData = await this.loadStateData(stateCode);
      if (stateData && stateData.url_patterns) {
        patterns = { ...patterns, ...stateData.url_patterns };
      }
    }

    return patterns;
  }

  /**
   * Get entity types for a specific state
   * @param {string} stateCode - State code
   * @returns {Array} Available entity types
   */
  async getEntityTypes(stateCode) {
    if (!stateCode) {
      // Return common entity types
      try {
        const response = await fetch(chrome.runtime.getURL('knowledge/entities/entity_types.json'));
        const data = await response.json();
        return data.common_types || [];
      } catch (error) {
        console.error('Failed to load entity types:', error);
        return ['LLC', 'Corporation', 'Partnership', 'Sole Proprietorship'];
      }
    }

    const stateData = await this.loadStateData(stateCode);
    if (stateData && stateData.entity_types) {
      return stateData.entity_types;
    }

    // Fallback to common types
    return this.getEntityTypes(null);
  }

  /**
   * Identify state from URL
   * @param {string} url - URL to analyze
   * @returns {string|null} State code or null
   */
  identifyStateFromUrl(url) {
    if (!url) return null;

    // Common state URL patterns
    const statePatterns = [
      // State codes in domain
      /\.([a-z]{2})\.us/i,
      /\.([a-z]{2})\.gov/i,
      // State names in domain
      /\.(alabama|alaska|arizona|arkansas|california|colorado|connecticut|delaware|districtofcolumbia|florida|georgia|hawaii|idaho|illinois|indiana|iowa|kansas|kentucky|louisiana|maine|maryland|massachusetts|michigan|minnesota|mississippi|missouri|montana|nebraska|nevada|newhampshire|newjersey|newmexico|newyork|northcarolina|northdakota|ohio|oklahoma|oregon|pennsylvania|rhodeisland|southcarolina|southdakota|tennessee|texas|utah|vermont|virginia|washington|westvirginia|wisconsin|wyoming)\./i,
      // State codes in path - more specific to avoid localhost matches
      /\.gov\/([a-z]{2})\//i,
      /\/states\/([a-z]{2})\//i,
      // Secretary of State patterns
      /sos\.([a-z]{2})\./i,
      // DC specific patterns
      /dc\.gov/i,
      /mytax\.dc\.gov/i
    ];

    const stateNameToCode = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
      'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
      'districtofcolumbia': 'DC', 'district-of-columbia': 'DC', 'washington-dc': 'DC',
      'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
      'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
      'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
      'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
      'newhampshire': 'NH', 'newjersey': 'NJ', 'newmexico': 'NM', 'newyork': 'NY',
      'northcarolina': 'NC', 'northdakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
      'oregon': 'OR', 'pennsylvania': 'PA', 'rhodeisland': 'RI', 'southcarolina': 'SC',
      'southdakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
      'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'westvirginia': 'WV',
      'wisconsin': 'WI', 'wyoming': 'WY'
    };

    // Check DC specific patterns first
    if (/dc\.gov|mytax\.dc\.gov/i.test(url)) {
      return 'DC';
    }
    
    // List of valid state codes for validation
    const validStateCodes = new Set(Object.values(stateNameToCode));
    validStateCodes.add('DC'); // Add DC which is not in stateNameToCode
    
    for (const pattern of statePatterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        const captured = match[1].toLowerCase();
        // Check if it's a state name
        if (stateNameToCode[captured]) {
          return stateNameToCode[captured];
        }
        // Check if it's already a valid state code
        if (captured.length === 2 && validStateCodes.has(captured.toUpperCase())) {
          return captured.toUpperCase();
        }
      }
    }

    return null;
  }

  /**
   * Merge patterns with proper override precedence
   * @param {Object} basePatterns - Base patterns (common)
   * @param {Object} overridePatterns - Override patterns (state-specific)
   * @returns {Object} Merged patterns
   */
  mergePatterns(basePatterns, overridePatterns) {
    const merged = { ...basePatterns };
    let mergedCount = 0;
    let newCount = 0;

    for (const [fieldType, config] of Object.entries(overridePatterns)) {
      if (merged[fieldType]) {
        // Merge configurations, state-specific takes precedence
        merged[fieldType] = {
          ...merged[fieldType],
          ...config,
          patterns: [
            ...(config.patterns || []),
            ...(merged[fieldType].patterns || [])
          ].filter((v, i, a) => a.indexOf(v) === i) // Remove duplicates
        };
        mergedCount++;
      } else {
        // Add new field type
        merged[fieldType] = config;
        newCount++;
      }
    }

    console.log(`[BRA-KnowledgeLoader] Merged ${mergedCount} patterns, added ${newCount} new patterns`);
    return merged;
  }

  /**
   * Get confidence score for a field match
   * @param {string} fieldType - Type of field
   * @param {Object} matchContext - Context of the match (label, attributes, etc.)
   * @returns {number} Confidence score (0-100)
   */
  getFieldConfidence(fieldType, matchContext) {
    const baseConfidence = matchContext.baseConfidence || 50;
    let confidence = baseConfidence;

    // Boost confidence for exact matches
    if (matchContext.exactMatch) {
      confidence += 30;
    }

    // Boost for matching multiple patterns
    if (matchContext.patternMatches > 1) {
      confidence += Math.min(matchContext.patternMatches * 5, 20);
    }

    // Boost for matching field attributes (name, id, placeholder)
    if (matchContext.attributeMatch) {
      confidence += 15;
    }

    // State-specific match bonus
    if (matchContext.stateSpecific && this.currentState) {
      confidence += 10;
    }

    return Math.min(confidence, 100);
  }
}

// Create singleton instance
const knowledgeLoader = new KnowledgeLoader();

// Export for ES6 modules (used by dynamic import)
export default knowledgeLoader;
export { knowledgeLoader };

// Export for CommonJS (if needed)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = knowledgeLoader;
}

// Make it available globally for Function constructor loading
if (typeof globalThis !== 'undefined') {
  globalThis.knowledgeLoader = knowledgeLoader;
} else if (typeof window !== 'undefined') {
  window.knowledgeLoader = knowledgeLoader;
}