#!/usr/bin/env python3
"""
Display learned patterns from Fable-5 agent traces

Usage: python3 patterns.py
"""

PATTERNS = {
    'problem_understanding': [
        "Let me understand the problem: ...",
        "I need to figure out how to ...",
        "My goal is to ...",
        "The key challenge is ...",
    ],
    'approach_planning': [
        "My approach will be:",
        "1. First, I'll examine ...",
        "2. Then I'll ...",
        "3. Finally, I'll verify ...",
        "4. If needed, I'll ...",
    ],
    'tool_selection': [
        "Because I need to examine the code structure...",
        "Since the task involves file manipulation...",
        "To check the current state, I'll use read_file...",
        "To find relevant information, I'll use session_search...",
    ],
    'verification': [
        "Let me verify this by running tests...",
        "Just to be sure, I'll check the output...",
        "After making the change, I should confirm it works...",
    ],
    'error_handling': [
        "If my first attempt fails, I'll try an alternative approach...",
        "Let me check if there's an error in the output...",
    ],
    'handoff_trigger': [
        "This task would benefit from subagent support...",
        "For complex multi-step work, I should delegate...",
    ],
}

def main():
    print("=" * 60)
    print("FABLE-5 LEARNED PATTERNS FOR HERMES PROMPT ENHANCEMENT")
    print("=" * 60)
    
    for category, patterns in PATTERNS.items():
        print(f"\n{category.upper().replace('_', ' ')}:")
        print("-" * 40)
        for p in patterns:
            print(f"  • {p}")
    
    print("\n" + "=" * 60)
    print("USAGE")
    print("=" * 60)
    print("""
Enhance a prompt:
  python3 enhance.py "Make a new FPS game"

Use in Hermes shell:
  hermes shell "python3 ~/.hermes/skills/prompt-enhancer/enhance.py 'your task'"
""")

if __name__ == '__main__':
    main()