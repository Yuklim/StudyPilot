import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
  },
  {
    // Build config and tests run in Node, not in the extension sandbox.
    files: ['vite.config.ts', 'src/**/*.test.ts'],
    languageOptions: { globals: globals.node },
  },
)
