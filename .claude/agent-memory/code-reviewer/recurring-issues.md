# Recurring issues

Patterns confirmed in code reviews. One entry per mistake; add occurrences instead of duplicating. At 3 occurrences set the status to `escalate` and name the guard that would stop it for good; once the guard exists, set it to `guarded`.

## Entry format

```
### R<n>: <the pattern in one line>
- Status: open | escalate | guarded (<what the guard is>)
- Count: <n>
- Why it matters: <the failure it causes>
- How to spot it: <what to grep for or look at>
- Usual fix: <the change that resolves it>
- Occurrences:
  - YYYY-MM-DD, path/file.ts:line, <one-line note>
```

## Patterns

None recorded yet.

## Not a problem here

Findings the developer confirmed are intended. Do not raise these again.

None recorded yet.
