import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/.open-next/**', '**/.wrangler/**', '**/dist/**', '**/next-env.d.ts', 'supabase/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      // Generator di dalam method butuh alias `this`.
      '@typescript-eslint/no-this-alias': 'off',
    },
  },
  {
    // Skrip E2E Playwright (CommonJS, Node).
    files: ['e2e/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { require: 'readonly', module: 'writable', process: 'readonly', __dirname: 'readonly', console: 'readonly', Buffer: 'readonly', setTimeout: 'readonly' },
    },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    settings: { next: { rootDir: 'apps/web' } },
  },
  {
    // Hanya ai-gateway yang boleh bicara langsung dengan provider AI.
    files: ['apps/**/*.{ts,tsx}', 'packages/!(ai-gateway)/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['openai', '@anthropic-ai/*', 'elevenlabs*', '@fal-ai/*', 'replicate'] },
      ],
    },
  },
);
