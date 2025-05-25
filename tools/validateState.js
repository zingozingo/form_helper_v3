#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

class StateValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    log(message, type = 'info') {
        const prefix = {
            error: '❌',
            warning: '⚠️',
            success: '✅',
            info: 'ℹ️'
        }[type] || '';
        console.log(`${prefix} ${message}`);
    }

    validateStateFile(statePath) {
        this.errors = [];
        this.warnings = [];
        
        try {
            // Check if file exists
            if (!fs.existsSync(statePath)) {
                this.errors.push(`State file not found: ${statePath}`);
                return false;
            }

            // Load and parse JSON
            const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            const stateName = path.basename(statePath, '.json');
            
            this.log(`Validating ${stateName} configuration...`);

            // Validate required fields
            this.validateRequiredFields(stateData);
            
            // Validate structure
            this.validateStructure(stateData);
            
            // Validate URLs
            this.validateUrls(stateData);
            
            // Validate field mappings
            this.validateFieldMappings(stateData);
            
            // Validate entity types
            this.validateEntityTypes(stateData);
            
            // Report results
            return this.reportResults(stateName);
            
        } catch (error) {
            this.errors.push(`Failed to parse JSON: ${error.message}`);
            return false;
        }
    }

    validateRequiredFields(data) {
        const requiredFields = ['name', 'abbreviation', 'sosUrl', 'entityTypes', 'urls'];
        
        requiredFields.forEach(field => {
            if (!data[field]) {
                this.errors.push(`Missing required field: ${field}`);
            }
        });

        // Check entity types structure
        if (data.entityTypes) {
            const requiredEntityFields = ['LLC', 'Corporation', 'NonProfit'];
            requiredEntityFields.forEach(type => {
                if (!data.entityTypes[type]) {
                    this.warnings.push(`Missing entity type configuration: ${type}`);
                }
            });
        }
    }

    validateStructure(data) {
        // Validate entity type structure
        if (data.entityTypes) {
            Object.entries(data.entityTypes).forEach(([type, config]) => {
                if (!config.name) {
                    this.errors.push(`Entity type ${type} missing 'name' field`);
                }
                if (!config.description) {
                    this.warnings.push(`Entity type ${type} missing 'description' field`);
                }
                if (!config.urls || !Array.isArray(config.urls)) {
                    this.errors.push(`Entity type ${type} missing or invalid 'urls' array`);
                }
                if (!config.fieldMappings) {
                    this.errors.push(`Entity type ${type} missing 'fieldMappings'`);
                }
            });
        }

        // Validate common field mappings
        if (data.commonFieldMappings) {
            const expectedFields = ['entityName', 'agentName', 'agentAddress', 'principalAddress'];
            expectedFields.forEach(field => {
                if (!data.commonFieldMappings[field]) {
                    this.warnings.push(`Common field mapping missing: ${field}`);
                }
            });
        }
    }

    validateUrls(data) {
        const urlPattern = /^https?:\/\/.+/;
        
        // Validate main SOS URL
        if (data.sosUrl && !urlPattern.test(data.sosUrl)) {
            this.errors.push(`Invalid SOS URL format: ${data.sosUrl}`);
        }

        // Validate entity type URLs
        if (data.entityTypes) {
            Object.entries(data.entityTypes).forEach(([type, config]) => {
                if (config.urls && Array.isArray(config.urls)) {
                    config.urls.forEach((url, index) => {
                        if (!urlPattern.test(url)) {
                            this.errors.push(`Invalid URL in ${type}[${index}]: ${url}`);
                        }
                    });
                }
            });
        }

        // Validate URL patterns
        if (data.urls) {
            Object.entries(data.urls).forEach(([key, patterns]) => {
                if (Array.isArray(patterns)) {
                    patterns.forEach((pattern, index) => {
                        try {
                            new RegExp(pattern);
                        } catch (e) {
                            this.errors.push(`Invalid regex pattern in urls.${key}[${index}]: ${pattern}`);
                        }
                    });
                }
            });
        }
    }

    validateFieldMappings(data) {
        const validFieldTypes = ['text', 'select', 'radio', 'checkbox', 'textarea'];
        
        // Check common field mappings
        if (data.commonFieldMappings) {
            this.validateMappingStructure(data.commonFieldMappings, 'commonFieldMappings');
        }

        // Check entity-specific field mappings
        if (data.entityTypes) {
            Object.entries(data.entityTypes).forEach(([type, config]) => {
                if (config.fieldMappings) {
                    this.validateMappingStructure(config.fieldMappings, `${type}.fieldMappings`);
                }
            });
        }
    }

    validateMappingStructure(mappings, path) {
        Object.entries(mappings).forEach(([field, config]) => {
            if (typeof config === 'string') {
                // Simple mapping - just a selector
                if (!config.trim()) {
                    this.errors.push(`Empty selector in ${path}.${field}`);
                }
            } else if (typeof config === 'object') {
                // Complex mapping
                if (!config.selector && !config.id && !config.name) {
                    this.errors.push(`No selector/id/name in ${path}.${field}`);
                }
                
                if (config.type && !['text', 'select', 'radio', 'checkbox', 'textarea'].includes(config.type)) {
                    this.warnings.push(`Unknown field type in ${path}.${field}: ${config.type}`);
                }
                
                if (config.validation && typeof config.validation !== 'object') {
                    this.errors.push(`Invalid validation object in ${path}.${field}`);
                }
            } else {
                this.errors.push(`Invalid mapping type in ${path}.${field}: ${typeof config}`);
            }
        });
    }

    validateEntityTypes(data) {
        // Load entity types schema
        const entityTypesPath = path.join(__dirname, '..', 'knowledge', 'entities', 'entity_types.json');
        
        if (fs.existsSync(entityTypesPath)) {
            try {
                const entityTypes = JSON.parse(fs.readFileSync(entityTypesPath, 'utf8'));
                const validTypes = Object.keys(entityTypes);
                
                if (data.entityTypes) {
                    Object.keys(data.entityTypes).forEach(type => {
                        if (!validTypes.includes(type)) {
                            this.warnings.push(`Unknown entity type: ${type}. Valid types: ${validTypes.join(', ')}`);
                        }
                    });
                }
            } catch (e) {
                this.warnings.push(`Could not validate entity types: ${e.message}`);
            }
        }
    }

    reportResults(stateName) {
        console.log('\n' + '='.repeat(50));
        console.log(`Validation Results for ${stateName}`);
        console.log('='.repeat(50));
        
        if (this.errors.length === 0 && this.warnings.length === 0) {
            this.log('All validations passed!', 'success');
            return true;
        }
        
        if (this.errors.length > 0) {
            console.log(`\n${this.errors.length} Error(s):`);
            this.errors.forEach(error => this.log(error, 'error'));
        }
        
        if (this.warnings.length > 0) {
            console.log(`\n${this.warnings.length} Warning(s):`);
            this.warnings.forEach(warning => this.log(warning, 'warning'));
        }
        
        console.log('\n' + '='.repeat(50));
        return this.errors.length === 0;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node validateState.js <state-file-path> [--all]');
        console.log('       node validateState.js --all  (validate all states)');
        process.exit(1);
    }
    
    const validator = new StateValidator();
    
    if (args[0] === '--all' || args.includes('--all')) {
        // Validate all state files
        const statesDir = path.join(__dirname, '..', 'knowledge', 'states');
        const stateFiles = fs.readdirSync(statesDir).filter(f => f.endsWith('.json'));
        
        let allValid = true;
        stateFiles.forEach(file => {
            const filePath = path.join(statesDir, file);
            if (!validator.validateStateFile(filePath)) {
                allValid = false;
            }
            console.log('');
        });
        
        process.exit(allValid ? 0 : 1);
    } else {
        // Validate specific file
        const valid = validator.validateStateFile(args[0]);
        process.exit(valid ? 0 : 1);
    }
}

module.exports = StateValidator;