import { cookies } from "next/headers";
import { isLang, LANG_COOKIE, translate, type Lang, type MessageKey } from "./dictionaries";

export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "en";
}

/** Server-component translator: `const { t, lang } = await getT();` */
export async function getT() {
  const lang = await getLang();
  return { lang, t: (key: MessageKey, vars?: Record<string, string | number>) => translate(lang, key, vars) };
}
