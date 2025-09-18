// ESLint configuration for whalewatch dashboard
import { defineConfig } from 'eslint/config';
import type { Linter } from 'eslint';

const tsParser = require('@typescript-eslint/parser');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const js = require('@eslint/js');
const reactHooks = require('eslint-plugin-react-hooks');

const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const config: Linter.Config = defineConfig([
  {
    extends: compat.extends('airbnb', 'plugin:@typescript-eslint/recommended', 'prettier'),

    languageOptions: {
      parser: tsParser,
    },

    plugins: {
      '@typescript-eslint': typescriptEslint,
      'react-hooks': reactHooks,
    },

    rules: {
      // TypeScript rules
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',

      '@typescript-eslint/no-shadow': [
        'error',
        {
          allow: ['err', 'done', 'resolve', 'reject', 'args'],
        },
      ],

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],

      // React Hooks rules - This is the key one for catching missing dependencies!
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // General code style
      'arrow-body-style': 0,
      'arrow-parens': 0,
      'brace-style': ['error', '1tbs'],

      camelcase: [
        'error',
        {
          properties: 'never',
          ignoreDestructuring: true,
          allow: ['^UNSAFE_', 'unstable_cache'],
        },
      ],

      'class-methods-use-this': 0,

      'comma-dangle': [
        'error',
        {
          arrays: 'always-multiline',
          objects: 'always-multiline',
          imports: 'always-multiline',
          exports: 'always-multiline',
          functions: 'ignore',
        },
      ],

      'consistent-return': 0,
      curly: ['error', 'all'],
      'dot-location': 0,
      'eol-last': ['error', 'always'],
      'func-names': 0,
      'function-paren-newline': 0,
      'generator-star-spacing': 0,
      'global-require': 0,
      'implicit-arrow-linebreak': 0,

      // Import rules
      'import/extensions': 'off',
      'import/first': 0,
      'import/imports-first': 0,
      'import/named': 0,
      'import/newline-after-import': 0,
      'import/no-anonymous-default-export': 'off',
      'import/no-cycle': 0,
      'import/no-default-export': 'off',
      'import/no-extraneous-dependencies': 0,
      'import/no-unresolved': 0,
      'import/no-useless-path-segments': 0,
      'import/no-webpack-loader-syntax': 0,
      'import/order': 0,
      'import/prefer-default-export': 0,

      // Accessibility rules
      'jsx-a11y/alt-text': 0,
      'jsx-a11y/anchor-is-valid': 0,
      'jsx-a11y/click-events-have-key-events': 0,
      'jsx-a11y/iframe-has-title': 0,
      'jsx-a11y/label-has-associated-control': 0,
      'jsx-a11y/label-has-for': 0,
      'jsx-a11y/no-autofocus': 0,
      'jsx-a11y/no-noninteractive-tabindex': 0,
      'jsx-a11y/no-static-element-interactions': 0,

      'lines-between-class-members': 0,

      'max-len': [
        'error',
        120,
        2,
        {
          ignoreUrls: true,
          ignoreComments: false,
          ignoreTrailingComments: true,
          ignoreRegExpLiterals: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
          // Ignore JSX elements, JSX attribute lines, long test strings, and TypeScript type annotations
          ignorePattern:
            '^\\s*<.*>\\s*$|^\\s*.*className=|^\\s*.*href=|^\\s*.*[a-zA-Z-]+=|expect\\(.*\\)|it\\(.*\\)|describe\\(.*\\)|\\} as .*|\\) as .*|.*\\{.*:.*\\}|.*\\{.*\\}',
        },
      ],

      'new-cap': 0,
      'newline-per-chained-call': 0,
      'no-await-in-loop': 0,
      'no-bitwise': 0,
      'no-buffer-constructor': 'error',
      'no-case-declarations': 0,

      'no-console': [
        'error',
        {
          allow: ['warn', 'error', 'info'],
        },
      ],

      'no-continue': 0,
      'no-else-return': 0,
      'no-extra-boolean-cast': 0,
      'no-global-assign': 0,
      'no-lonely-if': 0,
      'no-mixed-operators': 0,
      'no-nested-ternary': 0,

      'no-multi-spaces': [
        'error',
        {
          ignoreEOLComments: true,
        },
      ],

      'no-multiple-empty-lines': [
        'error',
        {
          max: 2,
          maxBOF: 0,
          maxEOF: 0,
        },
      ],

      'no-plusplus': 0,
      'no-prototype-builtins': 0,
      'no-restricted-globals': 0,

      'no-restricted-imports': [
        'error',
        {
          patterns: ['@logrocket/*/src/*'],
        },
      ],

      'no-restricted-properties': 0,
      'no-restricted-syntax': 0,
      'no-return-assign': 0,
      'no-return-await': 'error',
      'no-shadow': 'off',
      'no-tabs': 1,
      'no-undef-init': 0,
      'no-underscore-dangle': 0,

      'no-unused-expressions': [
        'error',
        {
          allowShortCircuit: true,
        },
      ],

      'no-useless-return': 1,
      'no-void': 0,
      'one-var': 'off',
      'object-curly-newline': 0,
      'object-property-newline': 0,
      'operator-linebreak': 0,
      'prefer-destructuring': 0,
      'prefer-promise-reject-errors': 0,
      'prefer-spread': 0,
      'prefer-template': 'error',

      // React rules
      'react/button-has-type': 0,
      'react/default-props-match-prop-types': 0,
      'react/destructuring-assignment': 0,
      'react/forbid-prop-types': 0,
      'react/jsx-closing-tag-location': 0,
      'react/jsx-curly-brace-presence': 0,

      'react/jsx-curly-newline': [
        'error',
        {
          multiline: 'consistent',
          singleline: 'consistent',
        },
      ],

      'react/jsx-curly-spacing': [
        'error',
        {
          when: 'never',
          children: true,
        },
      ],

      'react/jsx-filename-extension': [
        1,
        {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      ],

      'react/jsx-first-prop-new-line': ['error', 'multiline'],

      'react/jsx-indent': [
        'error',
        2,
        {
          indentLogicalExpressions: true,
        },
      ],

      'react/jsx-indent-props': ['error', 2],
      'react/jsx-no-bind': 0,
      'react/jsx-no-duplicate-props': 0,
      'react/jsx-no-target-blank': 0,
      'react/jsx-one-expression-per-line': 0,

      'react/jsx-wrap-multilines': [
        'error',
        {
          declaration: 'parens-new-line',
          assignment: 'parens-new-line',
          return: 'parens-new-line',
          arrow: 'parens-new-line',
          condition: 'ignore',
          logical: 'ignore',
          prop: 'ignore',
        },
      ],

      'react/no-access-state-in-setstate': 0,
      'react/no-array-index-key': 0,
      'react/no-danger': 0,
      'react/no-deprecated': 0,
      'react/no-string-refs': 0,
      'react/no-unescaped-entities': 0,
      'react/no-unused-prop-types': 0,
      'react/no-unused-state': 0,
      'react/prefer-es6-class': 0,
      'react/prop-types': 0,
      'react/react-in-jsx-scope': 'off',
      'react/require-default-props': 0,
      'react/self-closing-comp': 0,
      'react/sort-comp': 0,
      'react/void-dom-elements-no-children': 0,

      'require-yield': 0,
      'space-unary-ops': 0,
      'spaced-comment': 1,
      'valid-typeof': 0,
    },

    settings: {
      react: {
        version: 'detect',
      },

      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
        typescript: {},
      },
    },
  },
]);

export default config;
