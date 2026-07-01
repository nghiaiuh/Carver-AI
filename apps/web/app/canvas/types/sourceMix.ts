export type SourceRole = "layout" | "style" | "material" | "object";

export type SourceMix = Record<SourceRole, string> & {
  instruction: string;
};
