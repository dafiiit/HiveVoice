export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** A hashtag: lower case, words joined by "-", umlauts and ß kept (#übernachtung). Matches app.tag_slug in the database. */
export function tagSlug(input: string) {
  return input
    .toLowerCase()
    .replace(/[éèáàóòíìúùç]/g, (c) => "eeaaooiiuuc"["éèáàóòíìúùç".indexOf(c)])
    .replace(/[^a-z0-9äöüß]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
