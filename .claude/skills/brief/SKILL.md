---
name: brief
description: Answer or describe whatever the user names (a file, class, endpoint, feature, concept, status question or tool) in at most 280 characters. Use when the user runs /brief or asks for a very short answer about something in social-grid.
argument-hint: <what to describe or ask>
---

# Brief: at most 280 characters

The subject is: $ARGUMENTS

If that is empty, ask the user what to describe in one short question and stop.

## Steps

1. **Check before answering.** If it's about this repo or its state (a file, class, endpoint, Make target, test, branch, PR or check result), read the code or run a read-only check first. Never answer from memory. If it doesn't exist, say so.
2. **Answer in 280 characters or fewer**, counting every character including spaces and punctuation, like a tweet. Lead with the direct answer (yes, no, or what it is), then the single most useful detail, such as a `file:line` or the next step.
3. **Count the characters.** If it's over 280, cut detail rather than meaning, then count again.
4. End with the count on its own line, in the form `(N chars)`. The count line itself doesn't count toward the limit.

## Rules

- 280 is a ceiling, not a target.
- Plain prose: no headings, tables, lists or code blocks.
- Define a technical term only if the answer can't be understood without it.
- If something can't be verified, say "unverified" rather than guessing.
