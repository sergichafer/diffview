import pierreDark from "@pierre/theme/themes/pierre-dark.json";
import pierreLight from "@pierre/theme/themes/pierre-light.json";
import type { ThemeRegistration } from "shiki";
import type { SyntaxRoles, ThemeDefinition } from "../types";
import { rolesToVscodeColors } from "./vscode-colors";

const PIERRE_BASES = {
  "pierre-dark": pierreDark as ThemeRegistration,
  "pierre-light": pierreLight as ThemeRegistration,
} as const;

type TokenColor = NonNullable<ThemeRegistration["tokenColors"]>[number];

/** TextMate scopes per syntax role, layered after the base theme so they win. */
function syntaxTokenColors(syntax: SyntaxRoles): TokenColor[] {
  const rules: Array<{ scopes: string[]; color: string | undefined }> = [
    {
      scopes: ["comment", "punctuation.definition.comment"],
      color: syntax.comment,
    },
    {
      scopes: [
        "keyword",
        "storage.type",
        "storage.modifier",
        "keyword.control",
      ],
      color: syntax.keyword,
    },
    { scopes: ["keyword.operator"], color: syntax.operator },
    {
      scopes: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
      ],
      color: syntax.func,
    },
    {
      scopes: ["string", "string.quoted", "string.template"],
      color: syntax.string,
    },
    {
      scopes: ["entity.name.tag", "punctuation.definition.tag"],
      color: syntax.tag,
    },
    {
      scopes: [
        "entity.name.type",
        "entity.other.inherited-class",
        "support.type",
        "support.class",
        "entity.name.namespace",
      ],
      color: syntax.entity,
    },
    {
      scopes: [
        "constant",
        "constant.numeric",
        "constant.language",
        "support.constant",
        "variable.other.constant",
      ],
      color: syntax.constant,
    },
    {
      scopes: ["markup.heading", "entity.name.section", "markup.bold"],
      color: syntax.markup,
    },
  ];

  return rules
    .filter((rule): rule is { scopes: string[]; color: string } =>
      Boolean(rule.color),
    )
    .map((rule) => ({
      scope: rule.scopes,
      settings: { foreground: rule.color },
    }));
}

export function createShikiTheme(definition: ThemeDefinition): ThemeRegistration {
  const base = PIERRE_BASES[definition.pierreBase];
  const { roles } = definition;

  return {
    ...base,
    name: definition.pierreThemeName,
    type: definition.scheme,
    bg: roles.bg.editor,
    fg: roles.fg.base,
    colors: {
      ...base.colors,
      ...rolesToVscodeColors(roles),
    },
    tokenColors: [
      ...(base.tokenColors ?? []),
      ...(roles.syntax ? syntaxTokenColors(roles.syntax) : []),
    ],
  };
}
