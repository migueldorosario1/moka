"use client";

/**
 * CloudSettings — o "espaçozinho" da memória na nuvem (ordem do Miguel,
 * 31/08: a pessoa cola o token do Cloudflare R2 ou do Backblaze B2 e a
 * memória dela pode ser salva e usada mais tarde, em outro aparelho).
 *
 * BYO-bucket, igual ao BYOK das chaves de IA: as credenciais ficam SÓ no
 * aparelho (cofre AES-GCM do lib/cloud) e nada passa por servidor nosso.
 */

import { useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";
import {
  loadCloudConfig,
  saveCloudConfig,
  clearCloudConfig,
  type CloudConfig,
  type CloudProvider,
} from "@/lib/cloud";
import { testCloud } from "@/lib/cloud-s3";

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; objects: number }
  | { status: "fail"; kind: "credencial" | "bucket" | "rede" };

const PROVIDERS: Array<{
  key: CloudProvider;
  labelKey: "cloud_provider_r2" | "cloud_provider_b2" | "cloud_provider_s3";
}> = [
  { key: "r2", labelKey: "cloud_provider_r2" },
  { key: "b2", labelKey: "cloud_provider_b2" },
  { key: "s3", labelKey: "cloud_provider_s3" },
];

export function CloudSettings() {
  const { t } = useI18n();
  const [cfg, setCfg] = useState<CloudConfig>({
    provider: "r2",
    host: "",
    accessKeyId: "",
    secretAccessKey: "",
    bucket: "",
  });
  const [hasSaved, setHasSaved] = useState(false);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    void loadCloudConfig().then((c) => {
      if (c) {
        setCfg(c);
        setHasSaved(true);
      }
    });
  }, []);

  const ready = cfg.host.trim() && cfg.accessKeyId.trim() && cfg.secretAccessKey.trim() && cfg.bucket.trim();

  const handleTest = async () => {
    setTest({ status: "running" });
    const result = await testCloud(cfg);
    if (result.ok) setTest({ status: "ok", objects: result.objects });
    else setTest({ status: "fail", kind: result.kind });
  };

  const handleSave = async () => {
    await saveCloudConfig(cfg);
    setHasSaved(true);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2500);
  };

  const handleForget = async () => {
    await clearCloudConfig();
    setHasSaved(false);
    setTest({ status: "idle" });
    setCfg({ provider: "r2", host: "", accessKeyId: "", secretAccessKey: "", bucket: "" });
  };

  const hostKey: "cloud_host_r2" | "cloud_host_b2" | "cloud_host_s3" =
    cfg.provider === "r2" ? "cloud_host_r2" : cfg.provider === "b2" ? "cloud_host_b2" : "cloud_host_s3";
  // Placeholder = DICA, nunca um valor que pareça real (o fake de 32 hex
  // confundiu o Miguel: "porque está colado o nome do meu id?").
  const hostPh =
    cfg.provider === "r2"
      ? "copie o Account ID do painel R2 (32 caracteres)"
      : cfg.provider === "b2"
        ? "ex.: us-west-004"
        : "ex.: s3.exemplo.com";

  return (
    <div className="cloud-settings">
      <p className="cloud-intro">{t("cloud_intro")}</p>

      <div className="field">
        <label>{t("cloud_provider")}</label>
        <div className="cloud-providers">
          {PROVIDERS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`cloud-provider-btn ${cfg.provider === p.key ? "active" : ""}`}
              onClick={() => setCfg((c) => ({ ...c, provider: p.key }))}
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{t(hostKey)}</label>
        <input
          type="text"
          name="moka-cloud-host-off"
          value={cfg.host}
          onChange={(e) => setCfg((c) => ({ ...c, host: e.target.value }))}
          placeholder={hostPh}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="field">
        <label>{t("cloud_key_id")}</label>
        <input
          type="text"
          value={cfg.accessKeyId}
          onChange={(e) => setCfg((c) => ({ ...c, accessKeyId: e.target.value }))}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="field">
        <label>{t("cloud_secret")}</label>
        <input
          type="password"
          value={cfg.secretAccessKey}
          onChange={(e) => setCfg((c) => ({ ...c, secretAccessKey: e.target.value }))}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="field">
        <label>{t("cloud_bucket")}</label>
        <input
          type="text"
          value={cfg.bucket}
          onChange={(e) => setCfg((c) => ({ ...c, bucket: e.target.value }))}
          placeholder="ex.: meu-bucket"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="cloud-actions">
        <button type="button" className="cloud-btn" disabled={!ready || test.status === "running"} onClick={handleTest}>
          🔌 {test.status === "running" ? t("cloud_testing") : t("cloud_test")}
        </button>
        <button type="button" className="cloud-btn primary" disabled={!ready} onClick={handleSave}>
          💾 {t("cloud_save")}
        </button>
        {hasSaved && (
          <button type="button" className="cloud-btn" onClick={handleForget}>
            🗑️ {t("cloud_forget")}
          </button>
        )}
      </div>

      {test.status === "ok" && (
        <p className="cloud-msg ok">✅ {t("cloud_test_ok", { n: test.objects })}</p>
      )}
      {test.status === "fail" && (
        <p className="cloud-msg err">
          {test.kind === "credencial" ? `❌ ${t("cloud_test_403")}` : null}
          {test.kind === "bucket" ? `❌ ${t("cloud_test_404")}` : null}
          {test.kind === "rede" ? `❌ ${t("cloud_test_net")}` : null}
        </p>
      )}
      {savedFlash && <p className="cloud-msg ok">☁️ {t("cloud_saved")}</p>}

      <p className="cloud-note">🔐 {t("cloud_hint")}</p>
      <p className="cloud-note">⚠️ {t("cloud_cors_note")}</p>
    </div>
  );
}
