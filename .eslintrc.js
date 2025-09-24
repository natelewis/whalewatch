module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: ['eslint:recommended'],
  rules: {
    // TypeScript rules
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'off', // Disable for interface parameters
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-shadow': [
      'error',
      {
        allow: ['err', 'done', 'resolve', 'reject', 'args'],
      },
    ],

    // React rules
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/jsx-props-no-spreading': 'off',
    'react/react-in-jsx-scope': 'off',

    // General rules
    'no-console': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    'no-unused-expressions': [
      'error',
      {
        allowShortCircuit: true,
      },
    ],
    'prefer-template': 'error',
    'no-return-await': 'error',
    'no-useless-return': 'warn',
    'no-tabs': 'warn',
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
        ignorePattern:
          '^\\s*<.*>\\s*$|^\\s*.*className=|^\\s*.*href=|^\\s*.*[a-zA-Z-]+=|expect\\(.*\\)|it\\(.*\\)|describe\\(.*\\)|\\} as .*|\\) as .*|.*\\{.*:.*\\}|.*\\{.*\\}',
      },
    ],
    camelcase: [
      'warn',
      {
        properties: 'never',
        ignoreDestructuring: true,
        allow: [
          '^UNSAFE_',
          'unstable_cache',
          'start_time',
          'end_time',
          'order_by',
          'order_direction',
          'time_in_force',
          'limit_price',
          'underlying_ticker',
          'data_points',
          'start_date',
          'end_date',
        ],
      },
    ],
    curly: ['error', 'all'],
    'eol-last': ['error', 'always'],
    'brace-style': ['error', '1tbs'],
    'spaced-comment': 'warn',
    'no-unused-vars': 'off', // Use @typescript-eslint/no-unused-vars instead
  },
  env: {
    browser: true,
    node: true,
    es6: true,
    jest: true,
  },
  settings: {
    react: {
      version: 'detect',
    },
  },
  ignorePatterns: ['dist/', 'node_modules/', '*.js', 'coverage/'],
};
