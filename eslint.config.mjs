import stylistic from "@stylistic/eslint-plugin";
import jsdoc from "eslint-plugin-jsdoc";
import vue from "eslint-plugin-vue";

export default [
	// Exclude the legacy project, generated files and local configuration/secrets.
	{ ignores: [ "old/**", "**/node_modules/**", "dist/**", "release/**", "data/**", "config/**", "coverage/**" ] },
	...vue.configs[ "flat/essential" ].map( config => ( { ...config, files: [ "**/*.vue" ] } ) ),
	{
		files:           [ "**/*.{js,mjs,cjs,vue}" ],
		languageOptions: { ecmaVersion: "latest" },
		plugins:         { "@stylistic": stylistic, jsdoc },
		rules:           {
			"@stylistic/function-call-argument-newline": [
				"error",
				"consistent"
			],
			"@stylistic/function-call-spacing": [
				"error",
				"never"
			],
			"@stylistic/space-in-parens": [
				"error",
				"always"
			],
			"@stylistic/array-bracket-spacing": [
				"error",
				"always"
			],
			"@stylistic/brace-style": [
				"error",
				"1tbs",
				{ allowSingleLine: false }
			],
			"@stylistic/comma-dangle": [
				"error",
				"never"
			],
			"@stylistic/computed-property-spacing": [
				"error",
				"always"
			],
			curly: [
				"error",
				"all"
			],
			"@stylistic/dot-location": [
				"error",
				"property"
			],
			"dot-notation":                      "error",
			eqeqeq:                              0,
			"@stylistic/function-paren-newline": [
				"error",
				{ minItems: 3 }
			],
			"@stylistic/indent": [
				"error",
				"tab",
				{
					MemberExpression:   1,
					SwitchCase:         1,
					VariableDeclarator: "first"
				}
			],
			"jsdoc/check-values": [
				"error",
				{
					allowedLicenses: [
						"commercial"
					]
				}
			],
			"jsdoc/no-multi-asterisks":          0,
			"jsdoc/no-undefined-types":          0,
			"jsdoc/require-param-description":   0,
			"jsdoc/require-param-type":          0,
			"jsdoc/require-returns-description": 0,
			"jsdoc/tag-lines":                   [
				"error",
				"never",
				{ startLines: 1 }
			],
			"@stylistic/key-spacing": [
				"error",
				{ align: "value" }
			],
			"@stylistic/linebreak-style":          0,
			"@stylistic/newline-per-chained-call": [
				"error",
				{ ignoreChainWithDepth: 2 }
			],
			"no-console":                          "off",
			"no-debugger":                         "off",
			"@stylistic/no-extra-parens":          "error",
			"@stylistic/no-extra-semi":            "error",
			"no-lonely-if":                        "error",
			"@stylistic/no-mixed-spaces-and-tabs": 0,
			"@stylistic/no-multi-spaces":          "error",
			"@stylistic/no-multiple-empty-lines":  [
				"error",
				{
					max:    2,
					maxEOF: 0
				}
			],
			"no-new":                        0,
			"@stylistic/no-tabs":            0,
			"no-throw-literal":              0,
			"@stylistic/no-trailing-spaces": [
				2,
				{ skipBlankLines: true }
			],
			"no-useless-constructor":                   0,
			"no-useless-return":                        0,
			"@stylistic/no-whitespace-before-property": "error",
			"@stylistic/object-curly-newline":          [
				"error",
				{
					minProperties: 3,
					multiline:     true
				}
			],
			"@stylistic/object-curly-spacing": [
				"error",
				"always"
			],
			"@stylistic/object-property-newline": [
				"error",
				{ allowAllPropertiesOnSameLine: true }
			],
			"@stylistic/operator-linebreak": [
				"error",
				"after"
			],
			"@stylistic/padding-line-between-statements": [
				"error",
				{
					blankLine: "always",
					next:      "block",
					prev:      "*"
				},
				{
					blankLine: "always",
					next:      "*",
					prev:      "block"
				},
				{
					blankLine: "always",
					next:      "block-like",
					prev:      "*"
				},
				{
					blankLine: "always",
					next:      "*",
					prev:      "block-like"
				}
			],
			"@stylistic/quote-props": [
				"error",
				"as-needed"
			],
			"@stylistic/quotes": [
				"error",
				"double"
			],
			"require-await":   "off",
			"@stylistic/semi": [
				"error",
				"always"
			],
			"@stylistic/space-before-function-paren": [
				"error",
				"never"
			],
			"@stylistic/space-infix-ops": [
				"error",
				{ int32Hint: false }
			],
			"@stylistic/keyword-spacing": [
				"error",
				{
					before: true,
					after:  true
				}
			],
			"@stylistic/comma-spacing": [
				"error",
				{
					before: false,
					after:  true
				}
			],
			"@stylistic/space-before-blocks": [
				"error",
				"always"
			],
			"@stylistic/arrow-spacing": [
				"error",
				{
					before: true,
					after:  true
				}
			],
			"@stylistic/eol-last": [
				"error",
				"always"
			]
		}
	},
	{
		files: [ "**/*.vue" ],
		// Line-length limits are not autofixable; retain the existing formatting rules.
		rules: {
			"vue/array-bracket-spacing": [
				"error",
				"always"
			],
			"vue/attribute-hyphenation": [
				"error",
				"always"
			],
			"vue/attributes-order": [
				"error",
				{ alphabetical: true }
			],
			"vue/block-lang":    "off",
			"vue/block-spacing": [
				"error",
				"always"
			],
			"vue/html-closing-bracket-newline": [
				"error",
				{
					multiline:  "always",
					singleline: "never"
				}
			],
			"vue/html-indent": [
				"error",
				"tab",
				{ baseIndent: 0 }
			],
			"vue/jsx-uses-vars":           2,
			"vue/max-attributes-per-line": [
				"error",
				{
					multiline:  { max: 1 },
					singleline: { max: 3 }
				}
			],
			"vue/multi-word-component-names":             0,
			"vue/no-irregular-whitespace":                2,
			"vue/no-mutating-props":                      0,
			"vue/no-side-effects-in-computed-properties": 0,
			"vue/no-template-key":                        0,
			"vue/no-unused-properties":                   [
				"error",
				{
					deepData: false,
					groups:   [
						"props",
						"data",
						"computed",
						"methods",
						"setup"
					],
					ignorePublicMembers: false
				}
			],
			"vue/no-v-for-template-key":          "off",
			"vue/no-v-for-template-key-on-child": "off",
			"vue/no-v-html":                      "off",
			"vue/no-v-model-argument":            "off",
			"vue/no-v-text-v-html-on-component":  "off",
			"vue/object-curly-spacing":           [
				"error",
				"always"
			],
			"vue/order-in-components":    2,
			"vue/require-explicit-emits": 2,
			"vue/this-in-template":       "off",
			"vue/v-bind-style":           [
				"error",
				"shorthand",
				{ sameNameShorthand: "always" }
			],
			"vue/v-on-event-hyphenation": [
				"error",
				"always",
				{ autofix: true }
			],
			"vue/valid-v-bind": "off",
			"vue/valid-v-if":   "error",
			"vue/valid-v-slot": "off"
		}
	}
];
