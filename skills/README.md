# Skills Showcase

This directory contains standalone Hermes skills that can be installed globally.

## prompt-enhancer

A Hermes skill that enhances prompts using Fable-5 agent trace patterns.

### Install

```bash
hermes skills install https://github.com/genspark-ai/solent/raw/main/skills/prompt-enhancer/SKILL.md
```

Or manually:

```bash
# Copy to hermes skills directory
cp -r skills/prompt-enhancer ~/.hermes/skills/
```

### Usage

```bash
hermes shell "python3 ~/.hermes/skills/prompt-enhancer/enhance.py 'Your task here'"
```

## Related Skills

- `agent-trace-analysis` - Detailed Fable-5 trace analysis (installed globally)
- `solent-context-retention` - SOLENT-specific context fixes

## Publishing New Skills

1. Create skill directory with `SKILL.md`
2. Add scripts/ with Python utilities
3. Update this README
4. Commit and push

See the [Hermes Skills Documentation](https://hermes-agent.nousresearch.com/docs) for details.