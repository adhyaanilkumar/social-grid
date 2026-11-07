---
name: brief
description: Describe whatever the user names (a file, class, endpoint, feature, concept, test result or tool) in at most 280 words. Use when the user runs /brief or asks for a short description of something in social-grid.
argument-hint: <what to describe>
---

# Describe in at most 280 words

The thing to describe is: $ARGUMENTS

If that is empty, ask the user what to describe in one short question and stop.

## Steps

1. **Find it before describing it.** If it is part of this repo (a file, class, endpoint, Make target, test or spec section), read the actual code or document first. Never describe from memory or from the name alone. If it doesn't exist here, say so in one line.
2. **Write the description**, in this order, leaving out any part that doesn't apply:
   - What it is, in one sentence.
   - How it works: the mechanism, step by step if there are steps.
   - Where it lives: `file_path:line_number` links for the key places.
   - What it does not do, or its known limits, if there are any worth knowing.
3. **Pitch it at a CS graduate** without professional experience: assume data structures, algorithms, OS and database fundamentals, and define production-engineering terms in a few words the first time they appear (for example "a migration (a versioned database schema change)").
4. **Count the words.** The description must be 280 words or fewer, including headings and list items; code identifiers count as one word each. If it is over, cut detail rather than meaning, then count again.
5. End with the count on its own line, in the form `(N words)`.

## Rules

- 280 words is a ceiling, not a target. Shorter is better when the subject is simple.
- Plain prose or a short list. No tables, no code blocks longer than 3 lines.
- Don't pad with an introduction or a summary that repeats the description.
- If something can't be verified from the repo, say "unverified" next to it rather than guessing.
