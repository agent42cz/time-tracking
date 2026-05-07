# Gotchas

Append-only log of 20-minute-surprise bugs, integration quirks, and other unexpected things we want future us (and future LLMs) to find before re-debugging.

## Format

```
### YYYY-MM-DD — Short symptom

**Symptom.** What you observed.

**Cause.** What was actually wrong (root cause, not the proximate fix).

**Fix.** What you changed. Include file paths so the change is recoverable.

**See also.** ADR / commit / task link, if any.
```

## Rules

- Append at the **bottom**. Don't reorder by date — chronological matches commit order.
- One entry per surprise. Don't bundle unrelated symptoms.
- Don't edit existing entries. If you learned more later, append a new entry referencing the original.

---

<!-- Append entries below this line. -->
