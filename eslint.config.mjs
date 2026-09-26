import path from "node:path";
import { fileURLToPath } from "node:url";

import stylistic from "@stylistic/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { defineConfigWithVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import jsdoc from "eslint-plugin-jsdoc";
import pluginSVGO from "./node_modules/eslint-plugin-svgo/dist/index.mjs";
import vue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const mathPrefix = "eddie_does_the_maths/";
const mathScopedIgnores = [
  `${mathPrefix}public/**`,
  `${mathPrefix}node_modules/**`,
  `${mathPrefix}dist/**`
];

function prefixMathGlobs(globs) {
  return globs.map((glob) => {
    if (glob.startsWith("!")) {
      return `!${mathPrefix}${glob.slice(1)}`;
    }

    return `${mathPrefix}${glob}`;
  });
}

const scopedVueTsConfigs = defineConfigWithVueTs(vue.configs["flat/essential"], vueTsConfigs.base).map((config) => {
  const scopedConfig = { ...config };

  if (Array.isArray(config.files) && config.files.length > 0) {
    scopedConfig.files = prefixMathGlobs(config.files);
  } else {
    scopedConfig.files = [`${mathPrefix}**/*.{js,mjs,cjs,ts,tsx,vue}`];
  }

  if (Array.isArray(config.ignores) && config.ignores.length > 0) {
    scopedConfig.ignores = prefixMathGlobs(config.ignores);
  }

  return scopedConfig;
});

export default [
  ...scopedVueTsConfigs,
  {
    files: [`${mathPrefix}**/*.svg`],
    ignores: [`${mathPrefix}icons/*.svg`],
    plugins: { svgo: pluginSVGO },
    rules: {
      "svgo/svgo": [
        "error",
        {
          floatPrecision: 2,
          multipass: true,
          plugins: ["preset-default"]
        }
      ]
    }
  },
  {
    files: [`${mathPrefix}*.config.mjs`],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module"
    },
    rules: {
      "sort-keys": [
        "error",
        "asc",
        {
          caseSensitive: false,
          minKeys: 2,
          natural: true
        }
      ]
    }
  },
  {
    files: [
      `${mathPrefix}**/*.mjs`,
      `${mathPrefix}**/*.js`,
      `${mathPrefix}**/*.ts`,
      `${mathPrefix}**/*.vue`
    ],
    ignores: [...mathScopedIgnores, `${mathPrefix}tsup.config.ts`],
    languageOptions: {
      ecmaVersion: 2024,
      globals: {
        Buffer: "readonly",
        document: "readonly",
        localStorage: "readonly",
        window: "readonly"
      },
      sourceType: "module"
    },
    plugins: {
      "@stylistic": stylistic,
      jsdoc
    },
    rules: {
      "@stylistic/function-call-argument-newline": ["error", "consistent"],
      "@stylistic/function-call-spacing": ["error", "never"],
      "@stylistic/space-in-parens": ["error", "always"],
      "@typescript-eslint/no-var-requires": 0,
      "array-bracket-spacing": ["error", "always"],
      "brace-style": ["error", "1tbs", { allowSingleLine: false }],
      "comma-dangle": ["error", "never"],
      "computed-property-spacing": ["error", "always"],
      curly: ["error", "all"],
      "dot-location": ["error", "property"],
      "dot-notation": "error",
      eqeqeq: 0,
      "function-paren-newline": ["error", { minItems: 3 }],
      indent: ["error", "tab", { MemberExpression: 1, SwitchCase: 1, VariableDeclarator: "first" }],
      "jsdoc/check-values": [
        "error",
        { allowedLicenses: ["commercial"] }
      ],
      "jsdoc/no-multi-asterisks": 0,
      "jsdoc/no-undefined-types": 0,
      "jsdoc/require-param-description": 0,
      "jsdoc/require-param-type": 0,
      "jsdoc/require-returns-description": 0,
      "jsdoc/tag-lines": ["error", "never", { startLines: 1 }],
      "key-spacing": ["error", { align: "value" }],
      "linebreak-style": 0,
      "newline-per-chained-call": ["error", { ignoreChainWithDepth: 2 }],
      "no-console": "off",
      "no-debugger": "off",
      "no-extra-parens": "error",
      "no-extra-semi": "error",
      "no-lonely-if": "error",
      "no-mixed-spaces-and-tabs": 0,
      "no-multi-spaces": "error",
      "no-multiple-empty-lines": ["error", { max: 2, maxEOF: 0 }],
      "no-new": 0,
      "no-tabs": 0,
      "no-throw-literal": 0,
      "no-trailing-spaces": [2, { skipBlankLines: true }],
      "no-useless-constructor": 0,
      "no-useless-return": 0,
      "no-whitespace-before-property": "error",
      "object-curly-newline": ["error", { minProperties: 3, multiline: true }],
      "object-curly-spacing": ["error", "always"],
      "object-property-newline": ["error", { allowAllPropertiesOnSameLine: true }],
      "operator-linebreak": ["error", "after"],
      "padding-line-between-statements": [
        "error",
        { blankLine: "always", next: "block", prev: "*" },
        { blankLine: "always", next: "*", prev: "block" },
        { blankLine: "always", next: "block-like", prev: "*" },
        { blankLine: "always", next: "*", prev: "block-like" }
      ],
      "quote-props": ["error", "as-needed"],
      quotes: ["error", "double"],
      "require-await": "off",
      semi: ["error", "always"],
      "space-before-function-paren": ["error", "never"],
      "space-in-parens": ["error", "always"],
      "space-infix-ops": ["error", { int32Hint: false }]
    }
  },
  {
    files: [`${mathPrefix}**/*.vue`],
    ignores: mathScopedIgnores,
    languageOptions: {
      ecmaVersion: 2022,
      parser: vueParser,
      parserOptions: {
        ecmaVersion: "latest",
        parser: tsParser,
        sourceType: "module"
      },
      sourceType: "module"
    },
    plugins: { vue },
    rules: {
      "computed-property-spacing": ["error", "always"],
      "vue/array-bracket-spacing": ["error", "always"],
      "vue/attribute-hyphenation": ["error", "always"],
      "vue/attributes-order": ["error", { alphabetical: true }],
      "vue/block-lang": "off",
      "vue/block-spacing": ["error", "always"],
      "vue/html-closing-bracket-newline": [
        "error",
        {
          multiline: "always",
          singleline: "never"
        }
      ],
      "vue/html-indent": ["error", "tab", { baseIndent: 0 }],
      "vue/jsx-uses-vars": 2,
      "vue/max-attributes-per-line": [
        "error",
        {
          multiline: { max: 1 },
          singleline: { max: 3 }
        }
      ],
      "vue/max-len": [
        "error",
        {
          code: 120,
          comments: 150,
          ignoreComments: true,
          ignoreHTMLAttributeValues: false,
          ignoreHTMLTextContents: false,
          ignorePattern: "",
          ignoreRegExpLiterals: true,
          ignoreStrings: false,
          ignoreTemplateLiterals: false,
          ignoreTrailingComments: false,
          ignoreUrls: true,
          tabWidth: 4,
          template: 150
        }
      ],
      "vue/multi-word-component-names": 0,
      "vue/no-irregular-whitespace": 2,
      "vue/no-mutating-props": 0,
      "vue/no-side-effects-in-computed-properties": 0,
      "vue/no-template-key": 0,
      "vue/no-unused-properties": [
        "error",
        {
          deepData: false,
          groups: ["props", "data", "computed", "methods", "setup"],
          ignorePublicMembers: false
        }
      ],
      "vue/no-v-for-template-key": "off",
      "vue/no-v-for-template-key-on-child": "off",
      "vue/no-v-html": "off",
      "vue/no-v-model-argument": "off",
      "vue/no-v-text-v-html-on-component": "off",
      "vue/object-curly-spacing": ["error", "always"],
      "vue/order-in-components": 2,
      "vue/require-explicit-emits": 2,
      "vue/this-in-template": "off",
      "vue/v-bind-style": ["error", "shorthand", { sameNameShorthand: "always" }],
      "vue/v-on-event-hyphenation": ["error", "always", { autofix: true }],
      "vue/valid-v-bind": "off",
      "vue/valid-v-if": "error",
      "vue/valid-v-slot": "off"
    }
  },
  {
    files: [`${mathPrefix}**/*.ts`, `${mathPrefix}*.ts`],
    ignores: mathScopedIgnores,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: path.join(rootDir, "eddie_does_the_maths/tsconfig.json"),
        tsconfigRootDir: rootDir
      }
    },
    rules: {
      "@typescript-eslint/ban-types": 0,
      "@typescript-eslint/no-explicit-any": 0,
      "@typescript-eslint/no-this-alias": 0,
      "@typescript-eslint/no-unsafe-function-type": 0,
      "@typescript-eslint/no-unused-vars": 0,
      "@typescript-eslint/prefer-optional-chain": "error"
    }
  },
  {
    files: [`${mathPrefix}**/*Skeleton.vue`],
    rules: { "vue/no-unused-properties": "off" }
  }
];
