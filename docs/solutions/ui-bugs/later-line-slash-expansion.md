---
title: Slash expansion missing at the start of later editor lines
component: inline-slash-autocomplete
problem_type: ui_bug
tags: [pi, autocomplete, skills, prompt-templates]
---

# Later-line slash expansion

## Symptom and cause

Typing `/` at the start of line 2 produced no menu; Tab also did nothing.
The provider's start-of-line guard was not the whole issue: Pi 1.3.0 permits
native slash triggering only on line 1, discards `/` from provider trigger
characters, and routes later-line Tab through the file-completion guard.
Native suggestions worked when called directly, hiding the editor-level failure.
The old extension also only inserted names; it never expanded resource content.

## Fix

Keep first-line slash contexts native. A `CustomEditor` subclass triggers inline
requests through one isolated, checked private-method bridge. The provider admits
Tab for inline tokens and supplies only discovered skills/templates, not native
slash suggestions with incompatible value conventions. Acceptance replaces the
token with frontmatter-free content and updates multiline cursor coordinates.
Skill blocks preserve source location/reference directories. Template selection
has no arguments and applies Pi-compatible empty-argument/default substitution.
Existing custom editors are preserved with a warning and Tab fallback.

## Regression protection

Run `npm test`. It drives the real installed Pi editor rather than calling only
the provider. The first assertion fails against the original entry point.
Rerun after Pi upgrades: the private trigger bridge is a compatibility boundary.
Inline expansion happens on completion acceptance, not by executing arbitrary
slash tokens on submission. Extension commands are deliberately excluded.
