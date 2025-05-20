#!/usr/bin/env python3
"""
Sample script demonstrating the usage of the Business Registration Form Helper.

This script shows how to:
1. Validate form data
2. Format form data
3. Generate output in different formats
"""

import json
import argparse
import sys
from form_helper import FormHelper

def main():
    """Demonstrate the usage of the form_helper module."""
    parser = argparse.ArgumentParser(
        description="Sample script for Business Registration Form Helper"
    )
    parser.add_argument(
        "--input", 
        default="example_data.json",
        help="Path to input JSON file (default: example_data.json)"
    )
    parser.add_argument(
        "--state", 
        default="CA",
        help="Two-letter state code (default: CA)"
    )
    parser.add_argument(
        "--format", 
        choices=["json", "csv", "txt"], 
        default="txt",
        help="Output format (default: txt)"
    )
    
    args = parser.parse_args()
    
    print(f"[INFO] Processing form data for {args.state}...")
    
    try:
        # Load form data
        with open(args.input, 'r') as f:
            form_data = json.load(f)
        
        print(f"[INFO] Loaded form data from {args.input}")
        
        # Create form helper
        helper = FormHelper(args.state)
        
        # 1. Validate the data
        print(f"[INFO] Validating form data...")
        is_valid = helper.validate_form_data(form_data)
        
        if is_valid:
            print("[SUCCESS] Form data is valid.")
        else:
            print("[WARNING] Form data has validation errors:")
            for error in helper.errors:
                print(f"  - {error['field']}: {error['error']}")
        
        # Report warnings even if valid
        if helper.warnings:
            print("[INFO] Validation warnings:")
            for warning in helper.warnings:
                print(f"  - {warning['field']}: {warning['warning']}")
        
        # 2. Format the data
        print(f"[INFO] Formatting form data according to {args.state} requirements...")
        formatted_data = helper.format_data(form_data)
        
        # 3. Generate output
        print(f"[INFO] Generating {args.format.upper()} output...")
        output = helper.generate_output(formatted_data, args.format)
        
        # 4. Print the output
        print("\n" + "=" * 50)
        print("OUTPUT:")
        print("=" * 50)
        print(output)
        print("=" * 50)
        
        # 5. Show fee information if available
        if helper.state_config.get("filingFees") and "entityType" in form_data:
            entity_type = form_data["entityType"]
            if entity_type in helper.state_config["filingFees"]:
                fees = helper.state_config["filingFees"][entity_type]
                print("\nFiling Fees Information:")
                for fee_type, amount in fees.items():
                    print(f"  - {fee_type}: ${amount}")
        
        return 0
    
    except FileNotFoundError:
        print(f"[ERROR] Input file not found: {args.input}")
        return 1
    except json.JSONDecodeError:
        print(f"[ERROR] Invalid JSON in input file: {args.input}")
        return 1
    except Exception as e:
        print(f"[ERROR] {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())