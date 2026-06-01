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

### 2026-06-01 — PDF shows blank/□ for Czech characters

**Symptom.** Generated PDF renders rectangles or blank boxes wherever Czech diacritics appear (ř, ě, ů, č, š, ž, …). All ASCII characters display correctly.

**Cause.** Standard PDF base-14 fonts (Helvetica, Times, Courier — all WinAnsi encoded) do not cover the Latin Extended-A block that Czech diacritics live in. pdfmake falls back to a replacement glyph when a code point is missing from the active font.

**Fix.** Embed a Unicode TTF that covers the full Czech range. We use DejaVu Sans (OFL-licensed, full Czech coverage): `apps/web/src/assets/fonts/DejaVuSans.ttf` and `DejaVuSans-Bold.ttf`. The font is loaded via `fs.readFileSync` at `process.cwd()` and registered with `PdfPrinter`. In the standalone Next.js build, the font files must be listed in `outputFileTracingIncludes` in `next.config.mjs` or they will not be copied and the PDF route will crash with `ENOENT` at runtime. If the standalone build still can't find the files, fall back to embedding the TTF as a base64 string in a `.ts` module so it is bundled directly.

**See also.** ADR-0010 (`docs/decisions/0010-pdfmake-for-pdf-export.md`).
