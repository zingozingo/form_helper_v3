/**
 * Static Knowledge Data
 * All knowledge data bundled statically to avoid dynamic imports
 */

// Entity types data
const entityTypes = {
  "llc": {
    "name": "Limited Liability Company (LLC)",
    "aliases": ["LLC", "L.L.C.", "Limited Liability Co", "Limited Liability Company"],
    "patterns": ["llc", "l\\.l\\.c\\.", "limited\\s+liability\\s+(company|co)"]
  },
  "corporation": {
    "name": "Corporation",
    "aliases": ["Corp", "Corporation", "Inc", "Incorporated"],
    "patterns": ["corp(oration)?", "inc(orporated)?", "\\bcorp\\b", "\\binc\\b"]
  },
  "partnership": {
    "name": "Partnership",
    "aliases": ["Partnership", "LP", "LLP", "Limited Partnership"],
    "patterns": ["partnership", "\\blp\\b", "\\bllp\\b", "limited\\s+partnership"]
  },
  "sole_proprietorship": {
    "name": "Sole Proprietorship",
    "aliases": ["Sole Proprietor", "Individual", "DBA"],
    "patterns": ["sole\\s+proprietor(ship)?", "individual", "dba", "doing\\s+business\\s+as"]
  },
  "nonprofit": {
    "name": "Nonprofit",
    "aliases": ["Nonprofit", "Non-profit", "501c3", "Not for profit"],
    "patterns": ["non[-\\s]?profit", "501\\s?\\(c\\)\\(3\\)", "not\\s+for\\s+profit"]
  }
};

// Common field patterns
const fieldPatterns = {
  // Business Information
  "business_name": {
    "patterns": [
      "business\\s*name",
      "company\\s*name",
      "entity\\s*name",
      "organization\\s*name",
      "legal\\s*name",
      "trade\\s*name",
      "corporate\\s*name",
      "firm\\s*name"
    ],
    "confidence": 0.95
  },
  "dba": {
    "patterns": [
      "dba",
      "doing\\s*business\\s*as",
      "trade\\s*name",
      "fictitious\\s*name",
      "assumed\\s*name"
    ],
    "confidence": 0.9
  },
  "entity_type": {
    "patterns": [
      "entity\\s*type",
      "business\\s*type",
      "organization\\s*type",
      "corporate\\s*structure",
      "type\\s*of\\s*(entity|business|organization)",
      "legal\\s*structure",
      "business\\s*structure"
    ],
    "confidence": 0.9
  },
  
  // Tax IDs
  "ein": {
    "patterns": [
      "ein",
      "employer\\s*identification\\s*number",
      "federal\\s*tax\\s*id",
      "federal\\s*employer\\s*id",
      "fein",
      "tax\\s*identification\\s*number",
      "federal\\s*id"
    ],
    "confidence": 0.95
  },
  "ssn": {
    "patterns": [
      "ssn",
      "social\\s*security\\s*number",
      "social\\s*security",
      "soc\\s*sec\\s*no"
    ],
    "confidence": 0.95
  },
  
  // Contact Information
  "email": {
    "patterns": [
      "email",
      "e-mail",
      "email\\s*address",
      "electronic\\s*mail"
    ],
    "confidence": 0.9
  },
  "phone": {
    "patterns": [
      "phone",
      "telephone",
      "phone\\s*number",
      "tel",
      "contact\\s*number",
      "business\\s*phone",
      "primary\\s*phone",
      "mobile",
      "cell"
    ],
    "confidence": 0.9
  },
  
  // Address
  "street_address": {
    "patterns": [
      "street\\s*address",
      "address\\s*line\\s*1",
      "street",
      "business\\s*address",
      "mailing\\s*address",
      "physical\\s*address",
      "principal\\s*address"
    ],
    "confidence": 0.85
  },
  "city": {
    "patterns": [
      "city",
      "town",
      "municipality"
    ],
    "confidence": 0.9
  },
  "state": {
    "patterns": [
      "state",
      "province",
      "state\\s*province"
    ],
    "confidence": 0.9
  },
  "zip": {
    "patterns": [
      "zip",
      "zip\\s*code",
      "postal\\s*code",
      "postcode"
    ],
    "confidence": 0.95
  },
  
  // People
  "first_name": {
    "patterns": [
      "first\\s*name",
      "given\\s*name",
      "fname"
    ],
    "confidence": 0.9
  },
  "last_name": {
    "patterns": [
      "last\\s*name",
      "surname",
      "family\\s*name",
      "lname"
    ],
    "confidence": 0.9
  },
  "full_name": {
    "patterns": [
      "full\\s*name",
      "name",
      "your\\s*name",
      "contact\\s*name",
      "owner\\s*name",
      "member\\s*name",
      "authorized\\s*person"
    ],
    "confidence": 0.85
  },
  
  // Dates
  "date": {
    "patterns": [
      "date",
      "effective\\s*date",
      "start\\s*date",
      "formation\\s*date",
      "incorporation\\s*date"
    ],
    "confidence": 0.8
  },
  
  // Registration specific
  "registered_agent": {
    "patterns": [
      "registered\\s*agent",
      "statutory\\s*agent",
      "resident\\s*agent",
      "process\\s*agent",
      "agent\\s*for\\s*service"
    ],
    "confidence": 0.95
  },
  "principal_office": {
    "patterns": [
      "principal\\s*office",
      "principal\\s*place\\s*of\\s*business",
      "headquarters",
      "main\\s*office"
    ],
    "confidence": 0.85
  }
};

// State-specific patterns
const statePatterns = {
  "DC": {
    "agency": "Department of Consumer and Regulatory Affairs (DCRA)",
    "form_patterns": {
      "FR-500": {
        "name": "Business Registration Application",
        "fields": {
          "trade_name": ["trade\\s*name", "doing\\s*business\\s*as"],
          "business_activity": ["business\\s*activity", "nature\\s*of\\s*business"],
          "naics_code": ["naics", "industry\\s*code"]
        }
      }
    }
  },
  "California": {
    "agency": "California Secretary of State",
    "form_patterns": {
      "LLC-1": {
        "name": "Articles of Organization",
        "fields": {
          "llc_name": ["limited\\s*liability\\s*company\\s*name"],
          "agent_name": ["agent\\s*for\\s*service\\s*of\\s*process"]
        }
      }
    }
  },
  "Delaware": {
    "agency": "Delaware Division of Corporations",
    "form_patterns": {
      "LLC_Certificate": {
        "name": "Certificate of Formation",
        "fields": {
          "company_name": ["name\\s*of\\s*limited\\s*liability\\s*company"],
          "registered_office": ["registered\\s*office\\s*in\\s*delaware"]
        }
      }
    }
  }
};

// Export as a single static object
export const staticKnowledge = {
  entityTypes,
  fieldPatterns,
  statePatterns,
  
  // Helper method to get field patterns
  getFieldPatterns(state = null) {
    const patterns = { ...this.fieldPatterns };
    
    // Merge state-specific patterns if provided
    if (state && this.statePatterns[state]) {
      const stateData = this.statePatterns[state];
      if (stateData.form_patterns) {
        Object.values(stateData.form_patterns).forEach(form => {
          if (form.fields) {
            Object.entries(form.fields).forEach(([fieldType, fieldPatterns]) => {
              if (!patterns[fieldType]) {
                patterns[fieldType] = {
                  patterns: fieldPatterns,
                  confidence: 0.85
                };
              } else {
                patterns[fieldType].patterns = patterns[fieldType].patterns.concat(fieldPatterns);
              }
            });
          }
        });
      }
    }
    
    return patterns;
  },
  
  // Helper method to get field confidence
  getFieldConfidence(fieldType, matchDetails = {}) {
    const baseConfidence = this.fieldPatterns[fieldType]?.confidence || 0.7;
    let confidence = baseConfidence;
    
    // Boost confidence for exact matches
    if (matchDetails.exactMatch) {
      confidence = Math.min(confidence + 0.1, 1.0);
    }
    
    // Boost for required fields
    if (matchDetails.required) {
      confidence = Math.min(confidence + 0.05, 1.0);
    }
    
    // Boost for fields with labels
    if (matchDetails.hasLabel) {
      confidence = Math.min(confidence + 0.05, 1.0);
    }
    
    return confidence;
  }
};

// Also export individual components for compatibility
export { entityTypes, fieldPatterns, statePatterns };
export default staticKnowledge;