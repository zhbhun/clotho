# Design

## Context

The workbench already applies a macOS home-prefix display formatter. Marketplace source paths are rendered in three places.

## Goals / Non-Goals

**Goals:** Display paths consistently across settings and workbench.

**Non-Goals:** Change underlying paths or introduce new platform-specific behavior.

## Decisions

Promote the existing path display utility to shared renderer utilities and apply it only to the source path, preserving repo and URL display. The prototype demonstrates the abbreviated source line.

## Risks / Trade-offs

- The existing formatter recognizes macOS `/Users/` paths → preserve existing behavior instead of inventing home directory detection.
