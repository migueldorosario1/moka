/**
 * gdrive-picker — integração Drive pela VIA OFICIAL do Google (Miguel,
 * 24/08: "primeiro temos que oferecer a integração, e depois, só depois
 * de confirmada, oferecer ao internauta").
 *
 * Google Picker + escopo `drive.file` (o LEVE): o app só enxerga o
 * arquivo que o usuário ESCOLHER na janelinha do próprio Google — não
 * lista nem acessa o resto do Drive. Não depende do login Supabase: o
 * token vem do Google Identity Services direto no navegador.
 *
 * Requisitos (beta privado, flag NEXT_PUBLIC_GDRIVE + Client ID em
 * NEXT_PUBLIC_GOOGLE_CLIENT_ID — origem autorizada no console Google).
 * Para o público futuro: publicar o app + verificação (grátis p/ este
 * escopo) — ver regra de lançamento no fórum do espelho, Adendo 12.
 */

/** Arquivo escolhido no Picker. */
export interface PickedFile {
  id: string;
  name: string;
  token: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyObj = Record<string, any>;

let gsiLoaded = false;
let pickerLoaded = false;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`falha ao carregar ${src}`));
    document.head.appendChild(s);
  });
}

/** Há Client ID configurado? (sem ele, usa-se o fluxo legado da sessão). */
export function hasPickerConfig(): boolean {
  return !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
}

/** Pede token Google com escopo drive.file (consentimento do usuário). */
async function requestDriveToken(clientId: string): Promise<string> {
  if (!gsiLoaded) {
    await loadScript("https://accounts.google.com/gsi/client");
    gsiLoaded = true;
  }
  const google = (window as AnyObj).google;
  return new Promise<string>((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (resp: AnyObj) => {
        if (resp?.access_token) resolve(resp.access_token as string);
        else reject(new Error(String(resp?.error ?? "sem token")));
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

/** Abre o SELETOR do Google (janelinha oficial) e devolve o livro escolhido. */
export async function pickFromDrive(): Promise<PickedFile> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID as string;
  const token = await requestDriveToken(clientId);

  if (!pickerLoaded) {
    await loadScript("https://apis.google.com/js/api.js");
    await new Promise<void>((resolve) =>
      (window as AnyObj).gapi.load("picker", { callback: () => resolve() }),
    );
    pickerLoaded = true;
  }
  const g = (window as AnyObj).google;

  return new Promise<PickedFile>((resolve, reject) => {
    const view = new g.picker.DocsView(g.picker.ViewId.DOCS)
      .setMimeTypes("application/pdf,application/epub+zip")
      .setIncludeFolders(true);
    const picker = new g.picker.PickerBuilder()
      .setAppId(clientId.split(".")[0])
      .setOAuthToken(token)
      .addView(view)
      .enableFeature(g.picker.Feature.NAV_HIDDEN)
      .setCallback((data: AnyObj) => {
        const action = data[g.picker.Response.ACTION];
        if (action === g.picker.Action.PICKED) {
          const doc = data[g.picker.Response.DOCUMENTS][0];
          resolve({
            id: doc[g.picker.Document.ID] as string,
            name: doc[g.picker.Document.NAME] as string,
            token,
          });
        } else if (action === g.picker.Action.CANCEL) {
          reject(new Error("CANCEL"));
        }
      })
      .build();
    picker.setVisible(true);
  });
}

/** Baixa o livro escolhido — bytes no navegador, nada no disco. */
export async function fetchPickedFile(p: PickedFile): Promise<ArrayBuffer> {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${p.id}?alt=media`,
    { headers: { Authorization: `Bearer ${p.token}` } },
  );
  if (res.status === 401 || res.status === 403) {
    const body = await res.text();
    throw new Error(`NEED_SCOPE: ${body.slice(0, 120)}`);
  }
  if (!res.ok) throw new Error(`Drive ${res.status}`);
  return res.arrayBuffer();
}
