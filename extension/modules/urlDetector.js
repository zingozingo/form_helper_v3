/**
 * URL Detector Module
 * 
 * Analyzes URLs to determine if they're likely business registration pages
 * on government sites. Uses hybrid knowledge system with common patterns 
 * and state-specific patterns.
 */

// Configuration
const DEBUG_MODE = false; // Set to true for verbose logging

// Import knowledge loader (will be loaded dynamically in extension context)
let knowledgeLoader = null;
let initializationPromise = null;
let initializationAttempted = false;

// Default patterns (used when knowledge loader not available)
const DEFAULT_PATTERNS = {
  government: ['\\.gov', '\\.us', 'state\\.', 'sos\\.', 'secretary.*state'],
  business_registration: ['business', 'entity', 'corporation', 'llc', 'register', 'formation', 'incorporate'],
  tax: ['tax', 'revenue', 'irs', 'ein'],
  licensing: ['license', 'permit', 'certification']
};

// Module to analyze URLs
const URLDetector = {
  /**
   * Initialize the URL detector
   */
  async initialize() {
    // Return existing promise if initialization is in progress
    if (initializationPromise) {
      return initializationPromise;
    }
    
    // Don't retry if already attempted and failed
    if (initializationAttempted && !knowledgeLoader) {
      return null;
    }
    
    initializationPromise = this._doInitialize();
    return initializationPromise;
  },
  
  async _doInitialize() {
    initializationAttempted = true;
    
    try {
      // Try different loading methods based on context
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
        try {
          // Method 1: Try dynamic import first (preferred)
          const moduleUrl = chrome.runtime.getURL('modules/knowledgeLoader.js');
          const module = await import(moduleUrl);
          knowledgeLoader = module.default || module.knowledgeLoader || module;
          
          if (DEBUG_MODE) {
            console.log('[BRA-URLDetector] Knowledge loader loaded via dynamic import');
            console.log('[BRA-URLDetector] Module type:', typeof module);
            console.log('[BRA-URLDetector] Module keys:', Object.keys(module || {}));
            console.log('[BRA-URLDetector] KnowledgeLoader type:', typeof knowledgeLoader);
            console.log('[BRA-URLDetector] KnowledgeLoader keys:', Object.keys(knowledgeLoader || {}));
          }
        } catch (importError) {
          console.warn('[BRA-URLDetector] Dynamic import failed, trying fetch method');
          console.warn('Import error:', importError.message);
          
          // Method 2: Fallback to fetch and eval
          const scriptUrl = chrome.runtime.getURL('modules/knowledgeLoader.js');
          const response = await fetch(scriptUrl);
          
          if (!response.ok) {
            throw new Error('Failed to fetch knowledge loader: ' + response.status);
          }
          
          const scriptText = await response.text();
          
          // Create a more robust module loader
          try {
            // Create a module scope
            const moduleScope = {};
            const wrappedCode = [
              '(function(exports) {',
              scriptText,
              '\nif (typeof knowledgeLoader !== "undefined") {',
              '  exports.knowledgeLoader = knowledgeLoader;',
              '}',
              '})(arguments[0]);'
            ].join('\n');
            
            // Execute in isolated scope
            const executeModule = new Function(wrappedCode);
            executeModule(moduleScope);
            
            // Extract the loader
            knowledgeLoader = moduleScope.knowledgeLoader;
            
            if (DEBUG_MODE) {
              console.log('[BRA-URLDetector] Knowledge loader loaded via fetch method');
              console.log('[BRA-URLDetector] KnowledgeLoader type:', typeof knowledgeLoader);
              console.log('[BRA-URLDetector] KnowledgeLoader keys:', Object.keys(knowledgeLoader || {}));
              console.log('[BRA-URLDetector] Is KnowledgeLoader a class?:', knowledgeLoader && knowledgeLoader.constructor && knowledgeLoader.constructor.name);
            }
          } catch (execError) {
            console.error('[BRA-URLDetector] Failed to execute knowledge loader script');
            console.error('Execution error:', execError.message);
            throw execError;
          }
        }
        
        // Initialize the knowledge loader if it exists
        if (knowledgeLoader) {
          // Check if it's an instance with initialize method
          if (typeof knowledgeLoader.initialize === 'function') {
            await knowledgeLoader.initialize();
            console.log('[BRA-URLDetector] Knowledge loader initialized successfully');
          } 
          // Check if it's a class that needs instantiation
          else if (typeof knowledgeLoader === 'function' && knowledgeLoader.prototype && knowledgeLoader.prototype.initialize) {
            console.log('[BRA-URLDetector] Knowledge loader is a class, instantiating...');
            knowledgeLoader = new knowledgeLoader();
            await knowledgeLoader.initialize();
            console.log('[BRA-URLDetector] Knowledge loader instantiated and initialized');
          }
          // Check for alternative method names
          else if (typeof knowledgeLoader.init === 'function') {
            await knowledgeLoader.init();
            console.log('[BRA-URLDetector] Knowledge loader initialized using init() method');
          }
          else {
            console.warn('[BRA-URLDetector] Knowledge loader loaded but no initialize method found');
            console.warn('[BRA-URLDetector] Available methods:', Object.getOwnPropertyNames(knowledgeLoader).filter(prop => typeof knowledgeLoader[prop] === 'function'));
          }
        } else {
          console.error('[BRA-URLDetector] Knowledge loader module not found');
          knowledgeLoader = null;
        }
      }
    } catch (error) {
      // Simple error logging
      console.error('[BRA-URLDetector] Could not initialize knowledge loader');
      console.error('Error:', error.message);
      knowledgeLoader = null;
    } finally {
      initializationPromise = null;
    }
    
    return knowledgeLoader;
  },

  /**
   * Analyzes a URL to determine if it's likely a business registration page
   * @param {string} url - The URL to analyze
   * @returns {object} Analysis results with confidence score
   */
  async analyzeUrl(url) {
    if (!url) return { score: 0, reasons: ['Empty URL'] };
    
    try {
      // Ensure initialization
      if (!knowledgeLoader && typeof chrome !== 'undefined' && !initializationAttempted) {
        await this.initialize();
      }
      
      // Create URL object for easier parsing
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      const path = urlObj.pathname.toLowerCase();
      const fullUrl = url.toLowerCase();
      
      // Initialize score and reasons
      let score = 0;
      const reasons = [];
      const details = {
        isGovernment: false,
        state: null,
        businessTerms: [],
        patterns: []
      };
      
      // Identify state from URL
      details.state = this.identifyStateFromUrl(url);
      
      // Get URL patterns (common or state-specific)
      const patterns = (knowledgeLoader && typeof knowledgeLoader.getUrlPatterns === 'function') ? 
        await knowledgeLoader.getUrlPatterns(details.state) : 
        DEFAULT_PATTERNS;
      
      // Check for government domains
      const govScore = await this.checkGovernmentDomain(domain, patterns);
      if (govScore > 0) {
        score += govScore;
        reasons.push(`Government domain detected (${govScore} points)`);
        details.isGovernment = true;
      }
      
      // Check for business registration patterns
      const businessScore = await this.checkBusinessPatterns(fullUrl, patterns);
      if (businessScore.score > 0) {
        score += businessScore.score;
        reasons.push(`Business registration patterns (${businessScore.score} points)`);
        details.businessTerms = businessScore.matches;
        details.patterns = businessScore.patterns;
      }
      
      // Check for query parameters related to business registration
      const queryParamScore = this.checkQueryParameters(urlObj.search);
      if (queryParamScore > 0) {
        score += queryParamScore;
        reasons.push(`Business-related query parameters (${queryParamScore} points)`);
      }
      
      // State-specific bonus
      if (details.state && details.isGovernment) {
        score += 10;
        reasons.push(`State-specific government site (10 points)`);
      }
      
      // Calculate final confidence (max 100)
      const confidence = Math.min(Math.round(score), 100);
      
      return {
        score: confidence,
        isLikelyRegistrationSite: confidence >= 60,
        reasons: reasons,
        domain: domain,
        state: details.state,
        details: details
      };
    } catch (error) {
      console.error('[BRA-URLDetector] URL analysis error:', error);
      return { 
        score: 0, 
        isLikelyRegistrationSite: false,
        reasons: ['Error analyzing URL: ' + error.message] 
      };
    }
  },
  
  /**
   * Checks if the domain appears to be a government website
   * @param {string} domain - The domain to check
   * @param {object} patterns - URL patterns to use
   * @returns {number} Score based on confidence (0-30)
   */
  async checkGovernmentDomain(domain, patterns) {
    let score = 0;
    
    // Check government patterns
    if (patterns.government) {
      for (const pattern of patterns.government) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(domain)) {
          score = Math.max(score, 30); // Government domains are strong indicators
        }
      }
    }
    
    // Additional checks for government-like patterns
    if (domain.includes('state') && domain.includes('.us')) {
      score = Math.max(score, 25);
    } else if (domain.includes('county') || domain.includes('city') || domain.includes('municipal')) {
      score = Math.max(score, 20);
    }
    
    return score;
  },
  
  /**
   * Checks for business registration patterns in URL
   * @param {string} url - The full URL to check
   * @param {object} patterns - URL patterns to use
   * @returns {object} Score and match details
   */
  async checkBusinessPatterns(url, patterns) {
    let score = 0;
    const matches = [];
    const matchedPatterns = [];
    
    // Check business registration patterns
    if (patterns.business_registration) {
      for (const pattern of patterns.business_registration) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          score += 10;
          matches.push(pattern);
          matchedPatterns.push('business_registration');
          
          // Important terms get extra points
          if (['register', 'business', 'llc', 'corporation', 'incorporate'].includes(pattern)) {
            score += 5;
          }
        }
      }
    }
    
    // Check tax-related patterns
    if (patterns.tax) {
      for (const pattern of patterns.tax) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          score += 8;
          matches.push(pattern);
          matchedPatterns.push('tax');
        }
      }
    }
    
    // Check licensing patterns
    if (patterns.licensing) {
      for (const pattern of patterns.licensing) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(url)) {
          score += 5;
          matches.push(pattern);
          matchedPatterns.push('licensing');
        }
      }
    }
    
    // Bonus for multiple matches
    if (matches.length >= 3) {
      score += 15;
    } else if (matches.length >= 2) {
      score += 8;
    }
    
    return {
      score: Math.min(score, 50), // Cap the score
      matches: [...new Set(matches)], // Remove duplicates
      patterns: [...new Set(matchedPatterns)]
    };
  },
  
  /**
   * Checks URL query parameters for business registration indicators
   * @param {string} queryString - The URL query string
   * @returns {number} Score based on query parameters
   */
  checkQueryParameters(queryString) {
    if (!queryString) return 0;
    
    let score = 0;
    const params = new URLSearchParams(queryString);
    
    // Check for common registration-related parameters
    const businessParams = [
      'register', 'entity', 'business', 'formation', 'filing',
      'llc', 'corporation', 'corp', 'type', 'form'
    ];
    
    for (const [key, value] of params.entries()) {
      // Check parameter keys
      for (const term of businessParams) {
        if (key.toLowerCase().includes(term)) {
          score += 5;
        }
      }
      
      // Check parameter values
      for (const term of businessParams) {
        if (value.toLowerCase().includes(term)) {
          score += 5;
        }
      }
      
      // Specific parameter combinations
      if ((key === 'type' || key === 'entityType') && 
          (value.includes('LLC') || value.includes('Corp'))) {
        score += 10;
      }
    }
    
    return Math.min(score, 20); // Cap the score from this function
  },
  
  /**
   * Attempts to identify the state from a URL
   * @param {string} url - The URL to analyze
   * @returns {string|null} Two-letter state code or null
   */
  identifyStateFromUrl(url) {
    try {
      // Use knowledge loader if available
      if (knowledgeLoader && typeof knowledgeLoader.identifyStateFromUrl === 'function') {
        const state = knowledgeLoader.identifyStateFromUrl(url);
        if (state) return state;
      }
      
      // Fallback to basic pattern matching
      const urlLower = url.toLowerCase();
      
      // Common state patterns
      const statePatterns = {
        'CA': ['ca.gov', 'california', 'sos.ca.gov'],
        'NY': ['ny.gov', 'newyork', 'new-york'],
        'TX': ['tx.gov', 'texas', 'sos.state.tx.us'],
        'FL': ['fl.gov', 'florida', 'sunbiz.org'],
        'DE': ['de.gov', 'delaware', 'corp.delaware.gov'],
        'IL': ['il.gov', 'illinois', 'ilsos.gov'],
        'PA': ['pa.gov', 'pennsylvania'],
        'OH': ['oh.gov', 'ohio'],
        'GA': ['ga.gov', 'georgia'],
        'NC': ['nc.gov', 'north-carolina', 'northcarolina'],
        'MI': ['mi.gov', 'michigan'],
        'NJ': ['nj.gov', 'new-jersey', 'newjersey'],
        'VA': ['va.gov', 'virginia'],
        'WA': ['wa.gov', 'washington'],
        'MA': ['ma.gov', 'massachusetts'],
        'AZ': ['az.gov', 'arizona'],
        'TN': ['tn.gov', 'tennessee'],
        'IN': ['in.gov', 'indiana'],
        'MO': ['mo.gov', 'missouri'],
        'MD': ['md.gov', 'maryland'],
        'WI': ['wi.gov', 'wisconsin'],
        'MN': ['mn.gov', 'minnesota'],
        'CO': ['co.gov', 'colorado'],
        'AL': ['al.gov', 'alabama'],
        'SC': ['sc.gov', 'south-carolina', 'southcarolina'],
        'LA': ['la.gov', 'louisiana'],
        'KY': ['ky.gov', 'kentucky'],
        'OR': ['or.gov', 'oregon'],
        'OK': ['ok.gov', 'oklahoma'],
        'CT': ['ct.gov', 'connecticut'],
        'UT': ['ut.gov', 'utah'],
        'IA': ['ia.gov', 'iowa'],
        'NV': ['nv.gov', 'nevada'],
        'AR': ['ar.gov', 'arkansas'],
        'MS': ['ms.gov', 'mississippi'],
        'KS': ['ks.gov', 'kansas'],
        'NM': ['nm.gov', 'newmexico', 'new-mexico'],
        'NE': ['ne.gov', 'nebraska'],
        'WV': ['wv.gov', 'west-virginia', 'westvirginia'],
        'ID': ['id.gov', 'idaho'],
        'HI': ['hi.gov', 'hawaii'],
        'ME': ['me.gov', 'maine'],
        'NH': ['nh.gov', 'new-hampshire', 'newhampshire'],
        'RI': ['ri.gov', 'rhode-island', 'rhodeisland'],
        'MT': ['mt.gov', 'montana'],
        'SD': ['sd.gov', 'south-dakota', 'southdakota'],
        'ND': ['nd.gov', 'north-dakota', 'northdakota'],
        'AK': ['ak.gov', 'alaska'],
        'VT': ['vt.gov', 'vermont'],
        'WY': ['wy.gov', 'wyoming'],
        'DC': ['dc.gov', 'district-of-columbia', 'districtofcolumbia', 'mytax.dc.gov']
      };
      
      // Check for state patterns
      for (const [stateCode, patterns] of Object.entries(statePatterns)) {
        for (const pattern of patterns) {
          if (urlLower.includes(pattern)) {
            return stateCode;
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('[BRA-URLDetector] State identification error:', error);
      return null;
    }
  }
};

// Export the module
export { URLDetector as default };
export const analyzeUrl = URLDetector.analyzeUrl.bind(URLDetector);
export const identifyStateFromUrl = URLDetector.identifyStateFromUrl.bind(URLDetector);