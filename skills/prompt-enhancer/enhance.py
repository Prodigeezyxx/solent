#!/usr/bin/env python3
"""
Prompt Enhancer - Automatically enhance prompts using Fable-5 patterns

Usage:
    python3 enhance.py "your prompt here"
    python3 enhance.py  # reads from stdin
"""

import sys

# Core patterns extracted from Fable-5 traces
PROBLEM_UNDERSTANDING = "Let me understand the problem: "
APPROACH_PLANNING = "My approach will be:"
FIRST_STEP = "1. First, I'll examine the relevant files/context"
SECOND_STEP = "2. Then I'll implement a solution"
THIRD_STEP = "3. Finally, I'll verify the result works correctly"
TOOL_RATIONALE_1 = "Because I need to examine the code structure before editing"
TOOL_RATIONALE_2 = "To check the current state, I'll use read_file"
TOOL_RATIONALE_3 = "To find relevant information, I'll use session_search"
VERIFY_1 = "Let me verify this by running tests"
VERIFY_2 = "After making the change, I should confirm it meets requirements"
HANDOFF = "This task would benefit from subagent support - break into independent subtasks"

def enhance_prompt(user_prompt):
    """Enhance a user prompt with Fable-5 best practices"""
    
    enhanced = f'''# Enhanced Prompt (based on Fable-5 agent trace patterns)

## ORIGINAL PROMPT
{user_prompt}

## ENHANCED VERSION

You are CONDUCTOR, an AI agent following best practices learned from Fable-5 agent traces (4,665 real interactions).

### STEP 1: Problem Understanding
{PROBLEM_UNDERSTANDING}{user_prompt}

### STEP 2: Approach Planning
{APPROACH_PLANNING}
{FIRST_STEP}
{SECOND_STEP}
{THIRD_STEP}

### STEP 3: Tool Selection Logic
{TOOL_RATIONALE_1}
{TOOL_RATIONALE_2}
{TOOL_RATIONALE_3}

### STEP 4: Verification Pattern
{VERIFY_1}
{VERIFY_2}

### STEP 5: When to Hand Off
{HANDOFF}

---
**Apply these patterns consistently throughout your response.**
'''
    return enhanced

def main():
    if len(sys.argv) > 1:
        user_prompt = ' '.join(sys.argv[1:])
    else:
        user_prompt = sys.stdin.read().strip()
    
    if not user_prompt:
        print("Usage: python3 enhance.py '<prompt>'")
        print("   or: echo '<prompt>' | python3 enhance.py")
        sys.exit(1)
    
    enhanced = enhance_prompt(user_prompt)
    print(enhanced)

if __name__ == '__main__':
    main()