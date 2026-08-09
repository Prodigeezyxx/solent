# Prompt Enhancer Skill

A Hermes skill that automatically enhances prompts using patterns learned from the Fable-5 agent trace dataset (4,665 real agent interactions).

## Quick Start

```bash
# Show patterns
python3 ~/.hermes/skills/prompt-enhancer/patterns.py

# Enhance a prompt
python3 ~/.hermes/skills/prompt-enhancer/enhance.py "Fix the TSL booth issue"
```

## Usage in Hermes

```bash
# Use the skill inline
hermes shell "python3 ~/.hermes/skills/prompt-enhancer/enhance.py 'Make a new FPS game'"

# View patterns for reference
hermes shell "python3 ~/.hermes/skills/prompt-enhancer/patterns.py"
```

## What It Does

The skill analyzes how successful AI agents (from Fable-5) approach problems and generates enhanced prompts that:

1. **Structure the reasoning**: Problem understanding → Approach → Tool selection → Verification
2. **Include rationale**: Why each tool is being used
3. **Prevent errors**: Verification steps built in
4. **Optimize handoff**: When to delegate to subagents

## Example Output

Input: `Fix the TSL booth issue and update the README`

Output: A structured prompt that tells the AI:
- Understand the problem first
- Plan the approach (examine → implement → verify)
- Use appropriate tools with rationale
- Check work before declaring done

## Files

- `enhance.py` - Main enhancement script
- `patterns.py` - Display learned patterns
- `SKILL.md` - This documentation

## Integration

Load before running complex tasks:
```bash
hermes skills load prompt-enhancer
```

Then use `hermes shell` to run the enhancer inline.