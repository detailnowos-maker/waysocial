// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*', 'e2e/screenshots/*', 'supabase/*'],
  },
  {
    rules: {
      // padrão do projeto: efeitos com dependências intencionais são comentados caso a caso
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]);
