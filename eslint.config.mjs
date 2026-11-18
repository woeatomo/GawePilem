import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/node_modules/**', '**/.next/**', '**/dist/**', '**/next-env.d.ts', 'supabase/**'] },
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
