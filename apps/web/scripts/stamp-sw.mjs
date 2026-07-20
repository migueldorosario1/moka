#!/usr/bin/env node
/**
 * Gera public/sw.js a partir de public/sw.template.js, carimbando uma
 * versão ÚNICA a cada build (timestamp). Assim TODO deploy força o
 * navegador a trocar o cache — o app velho nunca mais fica preso no
 * aparelho (caso "não subiu" de 2026-07-20).
 *
 * Roda automaticamente via prebuild/predev (ver package.json).
 * O sw.js gerado NÃO é versionado no git (só o template é).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const templatePath = join(here, "..", "public", "sw.template.js");
const outPath = join(here, "..", "public", "sw.js");

const version = `moka-${Date.now()}`;
const template = readFileSync(templatePath, "utf8");
if (!template.includes("__MOKA_SW_VERSION__")) {
  throw new Error("sw.template.js sem o placeholder __MOKA_SW_VERSION__");
}
writeFileSync(outPath, template.replaceAll("__MOKA_SW_VERSION__", version));
console.log(`[stamp-sw] public/sw.js gerado com VERSION = ${version}`);
