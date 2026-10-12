import * as cheerio from "cheerio";

const BLOCK_TAGS = "p, div, li, tr, table, ul, ol, section, h1, h2, h3, h4, h5, h6";

export function htmlToText(html: string): string {
  const $ = cheerio.load(html);

  $("script, style, img, iframe, video, svg").remove();
  $("br").replaceWith("\n");
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    $(el).prepend("## ");
  });
  $("li").each((_, el) => {
    $(el).prepend("- ");
  });
  $("td, th").each((_, el) => {
    $(el).append(" | ");
  });
  $(BLOCK_TAGS).each((_, el) => {
    $(el).append("\n");
  });

  return $.root()
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
