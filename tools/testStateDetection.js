#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class StateDetectionTester {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            warnings: 0,
            suggestions: []
        };
    }

    log(message, type = 'info') {
        const prefix = {
            error: '❌',
            warning: '⚠️',
            success: '✅',
            info: 'ℹ️',
            test: '🧪'
        }[type] || '';
        console.log(`${prefix} ${message}`);
    }

    async testState(statePath, testUrls = null) {
        try {
            // Load state configuration
            if (!fs.existsSync(statePath)) {
                this.log(`State file not found: ${statePath}`, 'error');
                return false;
            }

            const stateData = JSON.parse(fs.readFileSync(statePath, 'utf8'));
            const stateName = stateData.name || path.basename(statePath, '.json');
            
            console.log('\n' + '='.repeat(60));
            console.log(`Testing ${stateName} Detection`);
            console.log('='.repeat(60));

            // Test URL pattern matching
            this.testUrlPatterns(stateData, testUrls);
            
            // Test field detection
            this.testFieldDetection(stateData);
            
            // Test entity type detection
            this.testEntityTypeDetection(stateData);
            
            // Calculate confidence scores
            this.calculateConfidenceScores(stateData);
            
            // Generate coverage report
            this.generateCoverageReport(stateData);
            
            // Report results and suggestions
            this.reportResults(stateName);
            
        } catch (error) {
            this.log(`Failed to test state: ${error.message}`, 'error');
            return false;
        }
    }

    testUrlPatterns(stateData, testUrls) {
        console.log('\n📍 Testing URL Pattern Detection:');
        
        const defaultTestUrls = [];
        
        // Generate test URLs from configuration
        if (stateData.entityTypes) {
            Object.entries(stateData.entityTypes).forEach(([type, config]) => {
                if (config.urls) {
                    defaultTestUrls.push(...config.urls);
                }
            });
        }
        
        // Add provided test URLs
        const urlsToTest = testUrls || defaultTestUrls;
        
        if (urlsToTest.length === 0) {
            this.log('No URLs to test', 'warning');
            this.results.warnings++;
            return;
        }

        // Test each URL against patterns
        urlsToTest.forEach(url => {
            const matches = this.matchUrlPatterns(url, stateData.urls);
            if (matches.length > 0) {
                this.log(`URL matched: ${url} → [${matches.join(', ')}]`, 'success');
                this.results.passed++;
            } else {
                this.log(`URL not matched: ${url}`, 'error');
                this.results.failed++;
                this.results.suggestions.push(`Add pattern for URL: ${url}`);
            }
        });
    }

    matchUrlPatterns(url, patterns) {
        const matches = [];
        
        if (!patterns) return matches;
        
        Object.entries(patterns).forEach(([category, categoryPatterns]) => {
            if (Array.isArray(categoryPatterns)) {
                categoryPatterns.forEach(pattern => {
                    try {
                        const regex = new RegExp(pattern, 'i');
                        if (regex.test(url)) {
                            matches.push(category);
                        }
                    } catch (e) {
                        this.log(`Invalid regex pattern: ${pattern}`, 'error');
                    }
                });
            }
        });
        
        return matches;
    }

    testFieldDetection(stateData) {
        console.log('\n🔍 Testing Field Detection Configuration:');
        
        const criticalFields = [
            'entityName',
            'agentName',
            'agentAddress',
            'principalAddress'
        ];
        
        // Test common field mappings
        if (stateData.commonFieldMappings) {
            criticalFields.forEach(field => {
                if (stateData.commonFieldMappings[field]) {
                    this.log(`Common field mapping found: ${field}`, 'success');
                    this.results.passed++;
                } else {
                    this.log(`Missing common field mapping: ${field}`, 'warning');
                    this.results.warnings++;
                }
            });
        } else {
            this.log('No common field mappings defined', 'error');
            this.results.failed++;
            this.results.suggestions.push('Add commonFieldMappings section');
        }

        // Test entity-specific fields
        if (stateData.entityTypes) {
            Object.entries(stateData.entityTypes).forEach(([type, config]) => {
                if (config.fieldMappings) {
                    const fieldCount = Object.keys(config.fieldMappings).length;
                    if (fieldCount > 0) {
                        this.log(`${type} has ${fieldCount} field mappings`, 'success');
                        this.results.passed++;
                    } else {
                        this.log(`${type} has no field mappings`, 'warning');
                        this.results.warnings++;
                    }
                } else {
                    this.log(`${type} missing fieldMappings`, 'error');
                    this.results.failed++;
                }
            });
        }
    }

    testEntityTypeDetection(stateData) {
        console.log('\n🏢 Testing Entity Type Detection:');
        
        const standardTypes = ['LLC', 'Corporation', 'NonProfit'];
        
        if (!stateData.entityTypes) {
            this.log('No entity types defined', 'error');
            this.results.failed++;
            return;
        }

        standardTypes.forEach(type => {
            if (stateData.entityTypes[type]) {
                const config = stateData.entityTypes[type];
                
                // Check required fields
                if (config.name && config.urls && config.fieldMappings) {
                    this.log(`${type} configuration complete`, 'success');
                    this.results.passed++;
                } else {
                    const missing = [];
                    if (!config.name) missing.push('name');
                    if (!config.urls) missing.push('urls');
                    if (!config.fieldMappings) missing.push('fieldMappings');
                    
                    this.log(`${type} missing: ${missing.join(', ')}`, 'warning');
                    this.results.warnings++;
                }
            } else {
                this.log(`${type} not configured`, 'warning');
                this.results.warnings++;
                this.results.suggestions.push(`Consider adding ${type} configuration`);
            }
        });
    }

    calculateConfidenceScores(stateData) {
        console.log('\n📊 Confidence Score Analysis:');
        
        let totalScore = 0;
        let maxScore = 0;
        
        // URL pattern score
        if (stateData.urls) {
            const urlCategories = Object.keys(stateData.urls).length;
            totalScore += Math.min(urlCategories * 10, 30);
            maxScore += 30;
        }
        maxScore += 30;
        
        // Field mapping score
        if (stateData.commonFieldMappings) {
            const fieldCount = Object.keys(stateData.commonFieldMappings).length;
            totalScore += Math.min(fieldCount * 5, 30);
        }
        maxScore += 30;
        
        // Entity type score
        if (stateData.entityTypes) {
            const typeCount = Object.keys(stateData.entityTypes).length;
            totalScore += typeCount * 10;
            maxScore += 30;
        }
        maxScore += 30;
        
        // Validation rules score
        if (stateData.validationRules) {
            const ruleCount = Object.keys(stateData.validationRules).length;
            totalScore += Math.min(ruleCount * 2, 10);
        }
        maxScore += 10;
        
        const confidence = Math.round((totalScore / maxScore) * 100);
        
        this.log(`Overall confidence score: ${confidence}%`, 
            confidence >= 80 ? 'success' : confidence >= 60 ? 'warning' : 'error');
        
        if (confidence < 80) {
            this.results.suggestions.push('Improve configuration to increase confidence score above 80%');
        }
        
        return confidence;
    }

    generateCoverageReport(stateData) {
        console.log('\n📋 Coverage Report:');
        
        const coverage = {
            urls: { found: 0, expected: 3 },
            commonFields: { found: 0, expected: 4 },
            entityTypes: { found: 0, expected: 3 },
            validationRules: { found: 0, expected: 3 }
        };
        
        // Count URLs
        if (stateData.urls) {
            coverage.urls.found = Object.keys(stateData.urls).length;
        }
        
        // Count common fields
        if (stateData.commonFieldMappings) {
            coverage.commonFields.found = Object.keys(stateData.commonFieldMappings).length;
        }
        
        // Count entity types
        if (stateData.entityTypes) {
            coverage.entityTypes.found = Object.keys(stateData.entityTypes).length;
        }
        
        // Count validation rules
        if (stateData.validationRules) {
            coverage.validationRules.found = Object.keys(stateData.validationRules).length;
        }
        
        // Report coverage
        Object.entries(coverage).forEach(([category, stats]) => {
            const percentage = Math.round((stats.found / stats.expected) * 100);
            const status = percentage >= 100 ? 'success' : percentage >= 75 ? 'warning' : 'error';
            this.log(`${category}: ${stats.found}/${stats.expected} (${percentage}%)`, status);
            
            if (percentage < 100) {
                this.results.suggestions.push(`Improve ${category} coverage`);
            }
        });
    }

    reportResults(stateName) {
        console.log('\n' + '='.repeat(60));
        console.log('Test Results Summary');
        console.log('='.repeat(60));
        
        this.log(`Passed: ${this.results.passed}`, 'success');
        this.log(`Failed: ${this.results.failed}`, 'error');
        this.log(`Warnings: ${this.results.warnings}`, 'warning');
        
        if (this.results.suggestions.length > 0) {
            console.log('\n💡 Suggestions for Improvement:');
            this.results.suggestions.forEach((suggestion, index) => {
                console.log(`   ${index + 1}. ${suggestion}`);
            });
        }
        
        const overallStatus = this.results.failed === 0 ? 'PASSED' : 'FAILED';
        console.log(`\n🎯 Overall Status: ${overallStatus}`);
        
        return this.results.failed === 0;
    }

    // Test with sample HTML
    async testWithSampleForm(stateData, htmlContent) {
        console.log('\n🧪 Testing with Sample Form:');
        
        // Create a simple DOM parser simulation
        const fields = this.extractFieldsFromHtml(htmlContent);
        const detectedFields = [];
        
        // Test field detection
        if (stateData.commonFieldMappings) {
            Object.entries(stateData.commonFieldMappings).forEach(([fieldName, mapping]) => {
                const selector = typeof mapping === 'string' ? mapping : mapping.selector;
                if (selector && this.selectorMatchesFields(selector, fields)) {
                    detectedFields.push(fieldName);
                    this.log(`Detected field: ${fieldName}`, 'success');
                } else {
                    this.log(`Could not detect field: ${fieldName}`, 'warning');
                }
            });
        }
        
        const detectionRate = Math.round((detectedFields.length / Object.keys(stateData.commonFieldMappings || {}).length) * 100);
        this.log(`Field detection rate: ${detectionRate}%`, detectionRate >= 75 ? 'success' : 'warning');
        
        return detectedFields;
    }

    extractFieldsFromHtml(html) {
        // Simple field extraction (in real implementation, use a proper DOM parser)
        const fields = [];
        const inputRegex = /<input[^>]*name=["']([^"']+)["'][^>]*>/gi;
        const selectRegex = /<select[^>]*name=["']([^"']+)["'][^>]*>/gi;
        
        let match;
        while ((match = inputRegex.exec(html)) !== null) {
            fields.push({ type: 'input', name: match[1] });
        }
        while ((match = selectRegex.exec(html)) !== null) {
            fields.push({ type: 'select', name: match[1] });
        }
        
        return fields;
    }

    selectorMatchesFields(selector, fields) {
        // Simple selector matching simulation
        const patterns = selector.match(/name\*?=["']([^"']+)["']/g) || [];
        
        return patterns.some(pattern => {
            const fieldPattern = pattern.match(/name\*?=["']([^"']+)["']/)[1];
            return fields.some(field => 
                field.name.toLowerCase().includes(fieldPattern.toLowerCase().replace('*', ''))
            );
        });
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node testStateDetection.js <state-file-path> [test-urls...]');
        console.log('Example: node testStateDetection.js ../knowledge/states/california.json');
        console.log('         node testStateDetection.js ../knowledge/states/california.json "https://bizfile.sos.ca.gov/forms/llc"');
        process.exit(1);
    }
    
    const tester = new StateDetectionTester();
    const statePath = args[0];
    const testUrls = args.slice(1);
    
    tester.testState(statePath, testUrls.length > 0 ? testUrls : null);
}

module.exports = StateDetectionTester;