/**
 * URL Detector Module
 * 
 * Analyzes URLs to determine if they're likely business registration pages
 * on government sites.
 */

// Government domains by country
const GOVERNMENT_DOMAINS = {
  'us': [
    '.gov', 
    '.state.', 
    'county.', 
    'ci.', 
    'co.', 
    'town.', 
    'sos.', 
    'dos.',
    'treasury.gov',
    'irs.gov'
  ],
  'ca': ['.gc.ca', '.canada.ca'],
  'uk': ['.gov.uk'],
  'au': ['.gov.au'],
  'nz': ['.govt.nz'],
  // Add more countries as needed
};

// Business registration-related terms in URLs
const BUSINESS_URL_TERMS = [
  'business', 
  'entity', 
  'register', 
  'registration', 
  'filing', 
  'incorporate', 
  'llc', 
  'corporation',
  'entities', 
  'corp', 
  'license', 
  'certificate', 
  'permit',
  'startup',
  'new-business',
  'fictitious-name',
  'dba',
  'doing-business-as',
  'foreign-entity',
  'annual-report',
  'formation'
];

// Known business registration websites
const KNOWN_REGISTRATION_SITES = [
  // Federal
  'irs.gov/businesses',
  'business.usa.gov',
  'sba.gov',
  'sec.gov/edgar',
  
  // State secretary websites
  'sos.ca.gov/business',
  'sos.delaware.gov',
  'dos.ny.gov/corporations',
  'sos.state.tx.us/corp',
  'bizfile.sos.ga.gov',
  'sunbiz.org', // Florida
  'businessexpress.ny.gov',
  'corporations.pa.gov',
  'business.ohio.gov',
  'business.nj.gov',
  'cis.state.mi.us',
  'ilsos.gov/corporatellc',
  
  // Third-party services
  'bizfileonline.sos',
  'nvsilverflume.gov',
  'egov.azcc.gov',
  'ccfs.sos.wa.gov',
  'businesssearch.sos',
  'bos.fdms.gov',
  'secure.utah.gov/osbr-user',
  'sosapps.sos.ga.gov'
];

// Path patterns that indicate business registration
const REGISTRATION_PATH_PATTERNS = [
  '/business',
  '/register',
  '/filing',
  '/incorporate',
  '/corp',
  '/llc',
  '/entity',
  '/startup',
  '/new-business',
  '/bizfile',
  '/formation'
];

// Module to analyze URLs
const URLDetector = {
  /**
   * Analyzes a URL to determine if it's likely a business registration page
   * @param {string} url - The URL to analyze
   * @returns {object} Analysis results with confidence score
   */
  analyzeUrl: function(url) {
    if (!url) return { score: 0, reasons: ['Empty URL'] };
    
    try {
      // Create URL object for easier parsing
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      const path = urlObj.pathname.toLowerCase();
      
      // Initialize score and reasons
      let score = 0;
      const reasons = [];
      
      // Check for government domains
      const govScore = this.checkGovernmentDomain(domain);
      if (govScore > 0) {
        score += govScore;
        reasons.push(`Government domain detected (${govScore} points)`);
      }
      
      // Check for business terms in domain
      const domainTermScore = this.checkBusinessTermsInString(domain);
      if (domainTermScore > 0) {
        score += domainTermScore;
        reasons.push(`Business terms in domain (${domainTermScore} points)`);
      }
      
      // Check for business terms in path
      const pathTermScore = this.checkBusinessTermsInString(path);
      if (pathTermScore > 0) {
        score += pathTermScore;
        reasons.push(`Business terms in path (${pathTermScore} points)`);
      }
      
      // Check for registration-specific path patterns
      const pathPatternScore = this.checkPathPatterns(path);
      if (pathPatternScore > 0) {
        score += pathPatternScore;
        reasons.push(`Registration path patterns detected (${pathPatternScore} points)`);
      }
      
      // Check if it's a known registration site
      const knownSiteScore = this.checkKnownSite(domain + path);
      if (knownSiteScore > 0) {
        score += knownSiteScore;
        reasons.push(`Known registration site (${knownSiteScore} points)`);
      }
      
      // Check for query parameters related to business registration
      const queryParamScore = this.checkQueryParameters(urlObj.search);
      if (queryParamScore > 0) {
        score += queryParamScore;
        reasons.push(`Business-related query parameters (${queryParamScore} points)`);
      }
      
      // Calculate final confidence (max 100)
      const confidence = Math.min(Math.round(score), 100);
      
      return {
        score: confidence,
        isLikelyRegistrationSite: confidence >= 60,
        reasons: reasons,
        domain: domain,
        pathAnalysis: {
          path: path,
          containsBusinessTerms: pathTermScore > 0,
          isRegistrationPattern: pathPatternScore > 0
        }
      };
    } catch (error) {
      console.error('URL analysis error:', error);
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
   * @returns {number} Score based on confidence (0-30)
   */
  checkGovernmentDomain: function(domain) {
    let score = 0;
    
    // Check all country patterns
    for (const country in GOVERNMENT_DOMAINS) {
      for (const pattern of GOVERNMENT_DOMAINS[country]) {
        if (domain.includes(pattern)) {
          // Government domains are strong indicators
          score += 30;
          return score; // Return immediately to avoid double counting
        }
      }
    }
    
    // Check for specific government-like patterns
    if (domain.includes('state') && domain.includes('.us')) {
      score += 25;
    } else if (domain.includes('county') || domain.includes('city') || domain.includes('municipal')) {
      score += 20;
    }
    
    return score;
  },
  
  /**
   * Checks for business registration terms in a string
   * @param {string} str - The string to check
   * @returns {number} Score based on number of matches
   */
  checkBusinessTermsInString: function(str) {
    let score = 0;
    let matchCount = 0;
    
    for (const term of BUSINESS_URL_TERMS) {
      // Look for the term surrounded by non-alphanumeric characters or at string boundaries
      const regex = new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, 'i');
      if (regex.test(str)) {
        matchCount++;
        
        // Adding points for finding business terms
        score += 5;
        
        // Important terms get extra points
        if (['register', 'business', 'llc', 'corporation', 'incorporate'].includes(term)) {
          score += 5;
        }
      }
    }
    
    // Bonus for multiple matches (indicates stronger relevance)
    if (matchCount >= 3) {
      score += 10;
    } else if (matchCount >= 2) {
      score += 5;
    }
    
    return score;
  },
  
  /**
   * Checks if the path matches common registration patterns
   * @param {string} path - The URL path
   * @returns {number} Score based on confidence
   */
  checkPathPatterns: function(path) {
    let score = 0;
    
    for (const pattern of REGISTRATION_PATH_PATTERNS) {
      if (path.includes(pattern)) {
        score += 10;
        
        // Look for more specific patterns
        if ((pattern.includes('register') || pattern.includes('filing')) && 
            (path.includes('business') || path.includes('entity'))) {
          score += 10; // More specific combinations get higher scores
        }
      }
    }
    
    // Check for file extensions that indicate forms
    if (path.endsWith('.pdf') || path.endsWith('.form') || path.endsWith('.application')) {
      score += 10;
    }
    
    return Math.min(score, 25); // Cap the score from this function
  },
  
  /**
   * Checks if URL is from a known registration site
   * @param {string} urlString - Domain + path
   * @returns {number} Score (0 or 40)
   */
  checkKnownSite: function(urlString) {
    for (const site of KNOWN_REGISTRATION_SITES) {
      if (urlString.includes(site)) {
        return 40; // Strong indicator
      }
    }
    return 0;
  },
  
  /**
   * Checks URL query parameters for business registration indicators
   * @param {string} queryString - The URL query string
   * @returns {number} Score based on query parameters
   */
  checkQueryParameters: function(queryString) {
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
  identifyStateFromUrl: function(url) {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.toLowerCase();
      const path = urlObj.pathname.toLowerCase();
      const fullUrl = (domain + path).toLowerCase();
      
      // State patterns in domain names
      const statePatterns = {
        'ca': ['ca.gov', 'california'],
        'ny': ['ny.gov', 'newyork', 'new-york'],
        'tx': ['tx.gov', 'texas'],
        'fl': ['fl.gov', 'florida', 'sunbiz.org'],
        'de': ['de.gov', 'delaware'],
        'il': ['il.gov', 'illinois', 'ilsos.gov'],
        'pa': ['pa.gov', 'pennsylvania'],
        'oh': ['oh.gov', 'ohio'],
        'ga': ['ga.gov', 'georgia'],
        'nc': ['nc.gov', 'north-carolina', 'northcarolina'],
        'mi': ['mi.gov', 'michigan'],
        'nj': ['nj.gov', 'new-jersey', 'newjersey'],
        'va': ['va.gov', 'virginia'],
        'wa': ['wa.gov', 'washington'],
        'ma': ['ma.gov', 'massachusetts'],
        'az': ['az.gov', 'arizona'],
        'tn': ['tn.gov', 'tennessee'],
        'in': ['in.gov', 'indiana'],
        'mo': ['mo.gov', 'missouri'],
        'md': ['md.gov', 'maryland'],
        'wi': ['wi.gov', 'wisconsin'],
        'mn': ['mn.gov', 'minnesota'],
        'co': ['co.gov', 'colorado'],
        'al': ['al.gov', 'alabama'],
        'sc': ['sc.gov', 'south-carolina', 'southcarolina'],
        'la': ['la.gov', 'louisiana'],
        'ky': ['ky.gov', 'kentucky'],
        'or': ['or.gov', 'oregon'],
        'ok': ['ok.gov', 'oklahoma'],
        'ct': ['ct.gov', 'connecticut'],
        'ut': ['ut.gov', 'utah'],
        'ia': ['ia.gov', 'iowa'],
        'nv': ['nv.gov', 'nevada'],
        'ar': ['ar.gov', 'arkansas'],
        'ms': ['ms.gov', 'mississippi'],
        'ks': ['ks.gov', 'kansas'],
        'nm': ['nm.gov', 'newmexico', 'new-mexico'],
        'ne': ['ne.gov', 'nebraska'],
        'wv': ['wv.gov', 'west-virginia', 'westvirginia'],
        'id': ['id.gov', 'idaho'],
        'hi': ['hi.gov', 'hawaii'],
        'me': ['me.gov', 'maine'],
        'nh': ['nh.gov', 'new-hampshire', 'newhampshire'],
        'ri': ['ri.gov', 'rhode-island', 'rhodeisland'],
        'mt': ['mt.gov', 'montana'],
        'de': ['de.gov', 'delaware'],
        'sd': ['sd.gov', 'south-dakota', 'southdakota'],
        'nd': ['nd.gov', 'north-dakota', 'northdakota'],
        'ak': ['ak.gov', 'alaska'],
        'vt': ['vt.gov', 'vermont'],
        'wy': ['wy.gov', 'wyoming'],
        'dc': ['dc.gov', 'district-of-columbia', 'districtofcolumbia']
      };
      
      // Check for state patterns
      for (const [stateCode, patterns] of Object.entries(statePatterns)) {
        for (const pattern of patterns) {
          if (fullUrl.includes(pattern)) {
            return stateCode.toUpperCase();
          }
        }
      }
      
      // Check for state name in path
      const pathSegments = path.split('/').filter(segment => segment.length > 0);
      for (const segment of pathSegments) {
        for (const [stateCode, patterns] of Object.entries(statePatterns)) {
          if (patterns.includes(segment)) {
            return stateCode.toUpperCase();
          }
        }
      }
      
      return null;
    } catch (error) {
      console.error('State identification error:', error);
      return null;
    }
  }
};

// Export the module
export default URLDetector;