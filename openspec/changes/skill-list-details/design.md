## Context

The approved prototype uses the Marketplace letter avatar and existing settings breadcrumbs.

## Goals / Non-Goals

Provide a read-only document view for installed user skills. Installation and authoring are outside this change.

## Decisions

Read SKILL.md on demand through a typed RPC, using the installation entry as the identifier for linked skills. Parse YAML metadata once per read and use the shared Markdown renderer for the body. Retain existing uninstall semantics.

## Risks / Trade-offs

A skill may disappear between listing and opening. Display a load error with the breadcrumb available.
