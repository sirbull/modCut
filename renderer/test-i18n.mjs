import assert from "node:assert/strict";
import test from "node:test";

import { LANGUAGES, localizeMenuTemplate, resolveLanguage, translator } from "./i18n.mjs";
import { NB } from "./i18n-nb.mjs";

test("the language follows the preference, or the first known system language", () => {
  assert.equal(resolveLanguage("nb"), "nb"); assert.equal(resolveLanguage("en", ["nb-NO"]), "en");
  assert.equal(resolveLanguage("system", ["nb-NO", "en-US"]), "nb"); assert.equal(resolveLanguage("system", ["nn"]), "nb");
  assert.equal(resolveLanguage("system", ["no_NO"]), "nb"); assert.equal(resolveLanguage("system", ["de-DE", "en-GB", "nb"]), "en");
  assert.equal(resolveLanguage("system", ["de-DE"]), "en"); assert.equal(resolveLanguage("fr"), "en");
  assert.deepEqual(LANGUAGES.map((l) => l.id), ["system", "en", "nb"]);
});

test("exact text, kept spacing, values in messages, and English for anything unknown", () => {
  const t = translator("nb");
  assert.equal(t("Undo"), "Angre"); assert.equal(t(" Undo "), " Angre "); assert.equal(t("Not in the catalog"), "Not in the catalog");
  assert.equal(t("Save failed: Disk full"), "Lagring mislyktes: Disk full");
  assert.equal(t("Could not import Logo.svg: Not a modCut document."), "Kunne ikke importere Logo.svg: Ikke et modCut-dokument.", "Values are translated when they are interface text");
  assert.equal(t("Artboard 12"), "Tegnebrett 12"); assert.equal(t("Machine added: Epilog Zing"), "Maskin lagt til: Epilog Zing");
  assert.equal(t("Layer {n}", { n: 4 }), "Lag 4", "Values can be given directly");
  assert.equal(translator("en")("Undo"), "Undo"); assert.equal(t(""), ""); assert.equal(t(null), null);
});

test("menus are translated in place, submenus included", () => {
  const template = [{ label: "File", submenu: [{ label: "Export", submenu: [{ label: "Export As…" }] }, { type: "separator" }, { label: "Quit" }] }, { role: "windowMenu", label: "Window" }];
  localizeMenuTemplate(template, translator("nb"));
  assert.deepEqual(template.map((m) => m.label), ["Fil", "Vindu"]);
  assert.equal(template[0].submenu[0].submenu[0].label, "Eksporter som…"); assert.equal(template[0].submenu[2].label, "Avslutt");
});

test("the Norwegian catalog is complete text: no English left as a translation, placeholders kept, no dashes", () => {
  for (const [english, norwegian] of Object.entries(NB)) {
    assert.ok(norwegian && typeof norwegian === "string", english);
    const names = (s) => [...s.matchAll(/\{([a-z]+)\}/gi)].map((m) => m[1]).sort().join();
    assert.equal(names(norwegian), names(english), `Placeholders of ${english}`);
    assert.doesNotMatch(norwegian, / — | – /, `No dash used as punctuation in ${norwegian}`);
  }
  assert.ok(Object.keys(NB).length > 1400);
});
