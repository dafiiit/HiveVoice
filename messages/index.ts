// Messages are split by namespace: messages/<lang>/<namespace>.json.
// "ls" holds Leichte Sprache overrides on top of German.
import de from "./de";
import en from "./en";
import ls from "./ls";

type Tree = { [k: string]: string | string[] | Tree };

function merge(base: Tree, over: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object" ? merge(base[k] as Tree, v as Tree) : v;
  }
  return out;
}

export function loadMessages(lang: "de" | "en", easy: boolean): Tree {
  if (lang === "en") return merge(de as unknown as Tree, en as unknown as Tree);
  return easy ? merge(de as unknown as Tree, ls as unknown as Tree) : (de as unknown as Tree);
}
