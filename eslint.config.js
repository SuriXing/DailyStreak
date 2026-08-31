// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

/**
 * 本地规则：UI 层（app/components/hooks/lib）禁止硬编码中文文案，必须走 src/i18n。
 * - 注释不受影响（不在 AST 里）
 * - 词典（src/i18n）与课程内容基底（src/data/courses.ts）在作用域之外
 */
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

const noHardcodedCopy = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow hardcoded Chinese UI copy outside src/i18n' },
    schema: [],
    messages: {
      hardcoded:
        'UI 文案必须走 i18n：在 src/i18n/locales/{zh,en,es}.ts 添加 key 并用 t() 引用（课程内容放 src/data/courses.ts + content 覆盖层）。发现: "{{text}}"',
    },
  },
  create(context) {
    const report = (node, text) =>
      context.report({ node, messageId: 'hardcoded', data: { text: String(text).trim().slice(0, 40) } });
    return {
      Literal(node) {
        if (typeof node.value === 'string' && CJK.test(node.value)) report(node, node.value);
      },
      JSXText(node) {
        const text = String(node.value ?? '').trim();
        if (text && CJK.test(text)) report(node, text);
      },
      TemplateElement(node) {
        const text = node.value.cooked ?? '';
        if (text && CJK.test(text)) report(node, text);
      },
    };
  },
};

const localRules = { rules: { 'no-hardcoded-copy': noHardcodedCopy } };

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  {
    files: ["src/{app,components,hooks,lib}/**/*.{ts,tsx}"],
    plugins: { local: localRules },
    rules: { "local/no-hardcoded-copy": "error" },
  }
]);
