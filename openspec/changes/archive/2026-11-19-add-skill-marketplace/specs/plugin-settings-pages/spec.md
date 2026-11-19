# Spec Delta

## MODIFIED Requirements

### Requirement: Marketplace settings category and tabs

The settings sidebar SHALL show Marketplace immediately above Plugins. Marketplace SHALL show centered capsule-style Plugins, Skills and Marketplaces tabs at the top without a separate page title. Plugins SHALL be selected when entering Marketplace from the sidebar or Plugins action, and the selected sidebar category SHALL remain Marketplace while any of these tabs is open.

#### Scenario: Enter Marketplace from the sidebar

- **WHEN** the user selects Marketplace in the sidebar
- **THEN** Marketplace is selected in the sidebar, Plugins is selected in the centered tabs, and the plugin catalog is shown

#### Scenario: Switch to marketplace sources

- **WHEN** the user selects the Marketplaces tab
- **THEN** the registered marketplace list is shown and Marketplace remains selected in the sidebar

#### Scenario: Browse individual skills

- **WHEN** the user selects the Skills tab
- **THEN** the skill catalog is shown and Marketplace remains selected in the sidebar
