---
name: prompt-enhancer
description: "Automatically enhance Hermes prompts using Fable-5 agent trace patterns for better reasoning and tool use"
version: 1.0.0
author: AI Developer
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [prompt-engineering, reasoning, optimization, fable-5, patterns]
    related_skills: [hermes-agent, agent-trace-analysis]
---

# Prompt Enhancer Skill

## Overview

This skill provides utilities to enhance Hermes prompts using analysis of Fable-5 agent traces. It extracts patterns from 4,665 real agent interactions and applies them to improve:

- Task decomposition strategies
- Tool selection rationale  
- Reasoning before action
- Error recovery patterns
- Handoff triggers

## Usage

```bash
# Load the skill
hermes skills load prompt-enhancer

# Enhance a prompt
hermes shell "python3 ~/.hermes/skills/prompt-enhancer/enhance.py 'Make a new FPS game'"

# View patterns
hermes shell "python3 ~/.hermes/skills/prompt-enhancer/patterns.py"
```

## Key Patterns Extracted from Fable-5

### 1. Problem Understanding Template
```
"Let me understand the problem: ...
I need to figure out ...
My goal is to ..."
```

### 2. Approach Planning
```
"My approach will be:
1. First, I'll examine ...
2. Then I'll ...
3. Finally, I'll verify ..."
```

### 3. Tool Selection Rationale
```
"Because I need to examine the code structure...
Since the task involves file manipulation...
To explore the API, I'll use ...
```

### 4. Verification Pattern
```
"Let me verify this by ...
Just to be sure, I'll check ...
After making the change, I should confirm ..."
```

## Files

- `enhance.py` - Takes user input and generates enhanced prompt
- `patterns.py` - Lists learned patterns
- `templates.py` - Contains pattern templates
- `data/` - Downloaded Fable-5 traces

## Integration with Hermes

When this skill is loaded, you can:

1. **Pre-prompt analysis**: Run before generating main prompts
2. **Pattern injection**: Inject patterns into system prompts
3. **Quality scoring**: Score prompts against best practices

## Example

Input prompt: "Fix the bug in the worker"

Enhanced prompt:
```
You are CONDUCTOR, an AI agent following best practices learned from 4,665 agent traces.

PROBLEM UNDERSTANDING:
"Let me understand the problem: I need to fix a bug in the Cloudflare Worker.

APPROACH:
1. First, I'll examine the error logs and identify the bug location
2. I'll read the affected file(s) to understand the current implementation
3. I'll make targeted changes with clear rationale
4. Finally, I'll verify the fix works"

TOOL SELECTION:
"Because I need to examine code, I'll use read_file first...
Since this is a Cloudflare Worker, I should check worker/src/index.ts..."

VERIFICATION:
"Let me verify this by checking the test output..."
```