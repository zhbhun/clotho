import css from '@eslint/css'
import js from '@eslint/js'
import configPrettier from 'eslint-config-prettier'
import pluginReact from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import { tailwind4 } from 'tailwind-csstree'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores(['build', 'dist', 'node_modules', '.hutch', '.vite', 'out']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      pluginReact.configs.flat.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      react: {
        version: '19',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-namespace': 'off',
      'react/jsx-no-target-blank': 'off',
      'react/react-in-jsx-scope': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.css'],
    plugins: { css },
    language: 'css/css',
    languageOptions: {
      customSyntax: tailwind4,
      tolerant: true,
    },
    extends: ['css/recommended'],
    rules: {
      'css/no-invalid-at-rules': 'off',
      'css/no-invalid-properties': 'off',
      'css/use-baseline': 'off',
    },
  },
  configPrettier,
])
