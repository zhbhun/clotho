# Spec Delta

## Purpose

Role-to-model mapping lets the user bind the CLI's model role aliases (haiku, sonnet, opus) to configured provider models so custom-model sessions can run subagents that pin a role alias, instead of failing on unresolvable first-party model ids.

## ADDED Requirements

### Requirement: Global role-to-model mappings

The system SHALL let the user configure an optional global mapping for each of the roles `haiku`, `sonnet`, and `opus` to a model of any configured provider (`providerId/modelId`), and SHALL persist these mappings as part of the app preferences. The `fable` role SHALL NOT be mappable.

#### Scenario: Save a role mapping

- **WHEN** the user picks a provider model for the haiku role and the preferences are saved
- **THEN** the mapping is persisted in the app preferences and survives an app restart

- **WHEN** the user clears the haiku role picker and saves
- **THEN** subsequent custom-model sessions run that role on the session model (via the session-model fallback), not on the CLI's built-in first-party id

#### Scenario: Fable role is not offered

- **WHEN** the user opens the role mapping UI
- **THEN** only haiku, sonnet, and opus pickers are shown; no fable mapping is offered

### Requirement: Role pickers live in the default-model card

The role pickers SHALL appear as additional rows inside the existing default-model card on the model settings page, and the card's section title SHALL become the model-mapping title (not remain the default-model title). The section title row SHALL offer a "set all" action that assigns one chosen model to the three roles at once. Each row SHALL list models of all configured providers and SHALL allow clearing a role back to unmapped.

#### Scenario: Open the model settings page

- **WHEN** the user opens the model settings page
- **THEN** the former default-model card is titled for model mapping with a set-all action at the title's right end and a one-line scope description underneath, and shows the default-model row plus haiku, sonnet, and opus rows, each with a model picker; no separate mapping card appears

#### Scenario: Scope description under the title

- **WHEN** the user reads the model-mapping section
- **THEN** the line directly under the title states that role mappings apply only to custom-model sessions and that unmapped roles follow the session model

#### Scenario: Set all roles at once

- **WHEN** the user picks a model from the set-all action
- **THEN** the haiku, sonnet, and opus pickers all switch to that model and the three mappings are persisted together

### Requirement: Mapped roles are injected into custom-model session environments

When a session runs on a custom model (routed through the local model proxy), the session environment SHALL contain `ANTHROPIC_DEFAULT_HAIKU_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, and `ANTHROPIC_DEFAULT_OPUS_MODEL` for every one of the three roles: the value SHALL be the role's mapping when it resolves against the currently configured providers, otherwise the session model. These variables SHALL NOT be set for sessions running native `claude/` models, which bypass the proxy.

#### Scenario: Mapped subagent runs on the mapped model

- **WHEN** a haiku mapping is configured and resolvable, and a custom-model session launches a subagent pinned to `haiku`
- **THEN** the subagent's requests reach the proxy with the mapped `providerId/modelId` and the subagent completes

#### Scenario: Unmapped role falls back to the session model

- **WHEN** no haiku mapping is configured and a custom-model session launches a subagent pinned to `haiku`
- **THEN** the haiku role variable carries the session model, so the subagent runs on the same model as the session instead of failing proxy validation

#### Scenario: Native claude session unaffected

- **WHEN** a session runs on a native `claude/` model with role mappings configured
- **THEN** no `ANTHROPIC_DEFAULT_*_MODEL` variables are injected by clotho

### Requirement: Fable role is permanently shadowed

The system SHALL set `ANTHROPIC_DEFAULT_FABLE_MODEL` to an empty value in custom-model session environments, so a fable mapping equal to the session model (or a user-level CLI setting leaking through the env merge) cannot inject the "Claude Fable 5" identity paragraph into the system prompt.

#### Scenario: Fable shadowed even with no mappings

- **WHEN** a custom-model session starts with no role mappings configured
- **THEN** its environment carries `ANTHROPIC_DEFAULT_FABLE_MODEL` as an empty string

### Requirement: Stale mappings are sanitized

On settings load, any role mapping that does not resolve against the currently configured providers SHALL be dropped rather than injected, so deleting a provider or model cannot leave a dangling role override; the affected role then falls back to the session model like an unmapped role.

#### Scenario: Mapped model removed

- **WHEN** the provider or model referenced by a stored haiku mapping is deleted, and a new custom-model session starts
- **THEN** the session environment carries the session model for the haiku role
