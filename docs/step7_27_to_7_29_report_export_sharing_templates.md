# Step 7.27–7.29 Professional Report Pack

## Goal

A professional progress summary should not stay trapped inside the app.

This pack makes it usable outside the app:

- print
- save as PDF
- copy text
- download HTML
- generate teacher/coach versions
- prepare parent meetings
- generate email-ready versions
- support Chinese/English/bilingual templates

## Privacy principle

The parent full report can include more internal planning information.

Teacher/coach/email versions should remove or soften:
- private family logistics
- irrelevant home details
- payment information
- sensitive internal comments

The AI prompt enforces this when generating share versions.

## Data model

`progress_report_shares` stores each generated version so the parent can reuse and revise later.

## Export model

PDF export is handled through browser print:

```text
Print / Save PDF
```

This is more reliable across devices than adding a heavy PDF library at this stage.

## Next recommended step

Step 7.30:
- School calendar / public holiday / term week engine
- or Smart route departure reminder
- or automated test/RLS runner

Recommended next: Smart route departure reminder, because it connects strongly with daily family logistics.
