"use client";

import { useState, useEffect } from "react";
import { PRESETS, type AIConfig } from "@igot/ai-providers";
import {
  setConfig, setActiveEntry, removeEntry, updateEntryLabel,
  clearConfig, getTargetLang, setTargetLang,
  getAudioLang, setAudioLang,
  listAllEntriesSync, getConfigById,
  setWhisperKey, getWhisperKeyMasked,
  getIngestServer, setIngestServer,
} from "@/lib/config";
import { testConnection, listModels } from "@/lib/ai-client";
import { useI18n } from "./I18nProvider";

interface SettingsFormProps {
  /** Config inicial (se houver). */
  initial: AIConfig | null;
  /** Chamado ao salvar/limpar (pra página recarregar estado). */
  onSaved: () => void;
}

interface TestState {
  status: "idle" | "testing" | "ok" | "fail";
  message: string;
}

/**
 * Formulário de configuração de IA.
 * O usuário escolhe o provedor, cola a chave (opcionalmente sobrescreve
 * modelo/baseUrl), testa a conexão e salva. Tudo no navegador.
 */
export function SettingsForm({
 initial, onSaved }: SettingsFormProps) {
  const { t, lang: uiLang, setLang: setUILang } = useI18n();

  // ── Seção de vídeo (fusão V 2.0): chave Whisper + servidor próprio ──
  const [whisperDraft, setWhisperDraft] = useState("");
  const [whisperMasked, setWhisperMasked] = useState<string | null>(null);
  const [ingestDraft, setIngestDraft] = useState("");
  const [videoMsg, setVideoMsg] = useState<string | null>(null);
  const [testingVideo, setTestingVideo] = useState(false);

  // Rascunho persistente: salva o que o usuário digitou no localStorage pra
  // não perder se fechar o modal sem salvar. Limpo após salvar com sucesso.
  const DRAFT_KEY = "moka.settingsDraft";
  const loadDraft = (): Partial<{
    providerId: string; apiKey: string; model: string; baseUrl: string; label: string;
  }> => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };
  const draft = loadDraft();

  const [providerId, setProviderId] = useState(draft.providerId ?? initial?.providerId ?? "zai");
  const [apiKey, setApiKey] = useState(draft.apiKey ?? initial?.apiKey ?? "");
  const [model, setModel] = useState(draft.model ?? initial?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(draft.baseUrl ?? initial?.baseUrl ?? "");
  const [label, setLabel] = useState(draft.label ?? "");
  // ID da entry que tá sendo editada (null = criando nova).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetLang, setLang] = useState(getTargetLang());
  const [audioLang, setAudioLangState] = useState(getAudioLang());
  const [showKey, setShowKey] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [test, setTest] = useState<TestState>({
    status: "idle",
    message: "",
  });
  const [saved, setSaved] = useState(false);
  // Busca de modelos disponíveis do provedor.
  const [modelsList, setModelsList] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  // Lista de entradas cadastradas (com chave mascarada + modelo).
  const [entries, setEntries] = useState(listAllEntriesSync());
  // Estado de teste por entry: entryId → 'testing' | 'ok' | 'fail'.
  const [entryTest, setEntryTest] = useState<Record<string, "testing" | "ok" | "fail">>({});

  // Salva o rascunho no localStorage sempre que os campos mudam.
  // Assim, se o usuário fechar o modal sem salvar, não perde o que digitou.
  useEffect(() => {
    getWhisperKeyMasked().then(setWhisperMasked).catch(() => {});
    setIngestDraft(getIngestServer());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const draft = { providerId, apiKey, model, baseUrl, label };
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [providerId, apiKey, model, baseUrl, label, DRAFT_KEY]);

  const preset = PRESETS.find((p) => p.id === providerId);

  /** Busca os modelos disponíveis no provedor (requer chave). */
  const handleListModels = async () => {
    if (!apiKey.trim()) {
      setModelsError("Cole a chave primeiro.");
      return;
    }
    setModelsLoading(true);
    setModelsError("");
    setModelsList(null);
    const config: AIConfig = {
      providerId,
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim() || undefined,
    };
    const result = await listModels(config);
    setModelsLoading(false);
    if (result.ok && result.models) {
      setModelsList(result.models);
    } else {
      setModelsError(result.error ?? "Não foi possível buscar os modelos.");
    }
  };

  const handleTest = async () => {
    if (!apiKey.trim()) {
      setTest({ status: "fail", message: t("set_cole_key") });
      return;
    }
    setTest({ status: "testing", message: t("set_testing") });
    try {
      const config: AIConfig = {
        providerId,
        apiKey: apiKey.trim(),
        model: model.trim() || undefined,
        baseUrl: baseUrl.trim() || undefined,
      };
      const result = await testConnection(config);
      setTest(
        result.ok
          ? { status: "ok", message: result.message }
          : { status: "fail", message: result.message },
      );
    } catch (err) {
      setTest({
        status: "fail",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  /** Testa uma entry JÁ CADASTRADA (da lista) — sem precisar digitar a chave. */
  const handleTestEntry = async (entryId: string) => {
    const config = getConfigById(entryId);
    if (!config) return;
    setEntryTest((prev) => ({ ...prev, [entryId]: "testing" }));
    const result = await testConnection(config);
    setEntryTest((prev) => ({
      ...prev,
      [entryId]: result.ok ? "ok" : "fail",
    }));
    // Limpa o status depois de 4s.
    setTimeout(() => {
      setEntryTest((prev) => {
        const copy = { ...prev };
        delete copy[entryId];
        return copy;
      });
    }, 4000);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    const config: AIConfig = {
      providerId,
      apiKey: apiKey.trim(),
      model: model.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
    };
    // AWAIT: setConfig é assíncrona (criptografa a chave antes de salvar).
    // Passa editingId se tá editando uma entry existente.
    await setConfig(config, { entryId: editingId ?? undefined, label: label.trim() || undefined });
    setTargetLang(targetLang);
    setAudioLang(audioLang);
    setSaved(true);
    setEntries(listAllEntriesSync()); // atualiza a lista
    // Limpa o formulário pra próxima entrada.
    setApiKey("");
    setLabel("");
    setEditingId(null);
    // Limpa o rascunho (já salvou, não precisa mais).
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    onSaved();
    setTimeout(() => setSaved(false), 2500);
  };

  /** Troca a entry ativa (qual está em uso). */
  const handleActivate = async (id: string) => {
    await setActiveEntry(id);
    setEntries(listAllEntriesSync());
    onSaved();
  };

  /** Remove uma entry do cofre. */
  const handleRemoveEntry = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    const name = PRESETS.find((p) => p.id === entry?.providerId)?.name ?? entry?.providerId ?? id;
    if (!confirm(t("set_remove_confirm", { title: `${entry?.label || name}${entry?.model ? ` (${entry.model})` : ''}` }))) return;
    await removeEntry(id);
    if (editingId === id) {
      setApiKey("");
      setModel("");
      setBaseUrl("");
      setLabel("");
      setEditingId(null);
    }
    setEntries(listAllEntriesSync());
    onSaved();
  };

  /** Carrega uma entry pra edição. */
  const handleEdit = (id: string) => {
    // Carrega a entrada completa (chave real já descriptografada do cofre local)
    // para permitir trocar o MODELO sem re-digitar a chave — o campo continua
    // mascarado (type=password) e a chave nunca sai do dispositivo.
    const entry = entries.find((e) => e.id === id);
    if (!entry) return;
    const cfg = getConfigById(id);
    setEditingId(id);
    setProviderId(entry.providerId);
    setApiKey(cfg?.apiKey ?? "");
    setModel(entry.model ?? "");
    setLabel(entry.label ?? "");
    setBaseUrl(cfg?.baseUrl ?? "");
    setAdvancedOpen(true);
  };

  const handleClear = () => {
    if (!confirm(t("set_clear_confirm"))) return;
    clearConfig();
    setApiKey("");
    setModel("");
    setBaseUrl("");
    setLabel("");
    setEditingId(null);
    setEntries([]);
    setTest({ status: "idle", message: "" });
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    onSaved();
  };

  return (
    <form className="settings-form" onSubmit={handleSave}>
      {/* ═══ V3 (mirror): MODO SIMPLES — pra quem NÃO sabe o que é API ═══
          O default é o Premium (IA incluída, sem chave). BYOK vira opção
          avançada lá embaixo. (Pedido do Miguel, 23/07 — espelho V3.) */}
      <div className="v3-simple">
        <h3 className="v3-simple-title">✨ Compre pontos e use — sem configurar nada</h3>
        <p className="v3-simple-sub">
          Com os pacotes de pontos, a inteligência artificial já vem
          incluída: é só comprar e usar, sem chave e sem configuração.
          Sem mensalidade — seus pontos não expiram.
        </p>
        <div className="v3-plans">
          <div className="v3-plan v3-plan-livre">
            <b>🆓 Livre</b>
            <span className="v3-plan-price">R$ 0</span>
            <span className="v3-plan-desc">
              Use com a SUA chave de IA — grátis pra sempre
            </span>
          </div>
          <a
            className="v3-plan v3-plan-featured"
            href="https://43.156.151.165.sslip.io/experimente"
            target="_blank"
            rel="noreferrer"
          >
            <span className="v3-plan-badge">comece aqui</span>
            <b>🎣 Teste</b>
            <span className="v3-plan-price">R$ 5</span>
            <span className="v3-plan-desc">200 pontos pra experimentar tudo</span>
          </a>
          <div className="v3-plan v3-plan-byok">
            <b>☕ Cappuccino</b>
            <span className="v3-plan-price">R$ 25</span>
            <span className="v3-plan-desc">
              1.000 pontos — ~25 livros ou ~33 vídeos
            </span>
            <span className="v3-plan-soon">em breve</span>
          </div>
          <div className="v3-plan">
            <b>🤎 Latte</b>
            <span className="v3-plan-price">R$ 45</span>
            <span className="v3-plan-desc">
              2.000 pontos — ~50 livros ou ~66 vídeos
            </span>
            <span className="v3-plan-soon">em breve</span>
          </div>
          <div className="v3-plan">
            <b>⚫ Espresso</b>
            <span className="v3-plan-price">R$ 70</span>
            <span className="v3-plan-desc">
              3.500 pontos — ~87 livros ou ~116 vídeos
            </span>
            <span className="v3-plan-soon">em breve</span>
          </div>
        </div>
        <p className="v3-simple-note" style={{ marginTop: 10 }}>
          Pacotes únicos — seus pontos não expiram. Vale para livros E vídeos.
        </p>
        <p className="v3-simple-note">
          Já comprou ou tem cupom? <a href="https://43.156.151.165.sslip.io/painel" target="_blank" rel="noreferrer">Entre no seu painel de pontos →</a>
        </p>
      </div>

      {/* ═══ V3: daqui pra baixo é AVANÇADO (BYOK — usar a própria chave) ═══ */}
      <details className="v3-advanced">
        <summary>
          🔧 <strong>Configurações avançadas</strong> — usar minha própria chave de IA
          <span className="v3-advanced-hint">
            Só mexa aqui se você sabe o que é uma API key. Sua chave fica salva
            no seu navegador — nunca vai pro nosso servidor.
          </span>
        </summary>

      {/* Minhas chaves cadastradas — cada uma com provedor + MODELO visível */}
      {entries.length > 0 && (
        <div className="saved-providers">
          <p className="saved-providers-title">{t("set_my_keys", { n: entries.length })}</p>
          <div className="saved-providers-list">
            {entries.map((e) => {
              const name = PRESETS.find((pr) => pr.id === e.providerId)?.name ?? e.providerId;
              const displayName = e.label || name;
              return (
                <div
                  key={e.id}
                  className={`saved-provider-card ${e.active ? "active" : ""}`}
                >
                  <div className="saved-provider-info">
                    <span className="saved-provider-name">
                      {e.active && <span className="active-dot">●</span>} {displayName}
                    </span>
                    <span className="saved-provider-key">{e.maskedKey}</span>
                    {/* Modelo SEMPRE visível — é o que diferencia múltiplas entries */}
                    <span className="saved-provider-model">
                      🧩 {e.model || PRESETS.find((pr) => pr.id === e.providerId)?.defaultModel || t("set_default_model")}
                    </span>
                  </div>
                  <div className="saved-provider-actions">
                    {!e.active && (
                      <button
                        type="button"
                        className="mini-btn use-btn"
                        onClick={() => handleActivate(e.id)}
                        title={t("use")}
                      >
                        {t("use")}
                      </button>
                    )}
                    <button
                      type="button"
                      className={`mini-btn test-btn ${entryTest[e.id] ? `test-${entryTest[e.id]}` : ""}`}
                      onClick={() => handleTestEntry(e.id)}
                      title={t("set_test_connection")}
                      disabled={entryTest[e.id] === "testing"}
                    >
                      {entryTest[e.id] === "testing" ? "⏳" : entryTest[e.id] === "ok" ? "✅" : entryTest[e.id] === "fail" ? "❌" : "🔌"}
                    </button>
                    <button
                      type="button"
                      className="mini-btn edit-btn"
                      onClick={() => handleEdit(e.id)}
                      title={t("edit")}
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="mini-btn remove-btn"
                      onClick={() => handleRemoveEntry(e.id)}
                      title={t("remove")}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Separador visual */}
      <div className="section-divider">
        <span>{editingId ? t("set_edit_key") : t("set_add_key")}</span>
      </div>

      {/* Provedor */}
      <div className="field">
        <label htmlFor="provider">{t("set_provider")}</label>
        <select
          id="provider"
          value={providerId}
          onChange={(e) => {
            const newPid = e.target.value;
            setProviderId(newPid);
            setApiKey("");
            setTest({ status: "idle", message: "" });
            setModelsList(null);
            setModelsError("");
            setModelSearch("");
            setModel(""); // limpa modelo ao trocar provedor
          }}
        >
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {preset?.description && (
          <p className="hint">{preset.description}</p>
        )}
        {preset?.keyUrl && (
          <p className="hint">
            {t("set_no_key_link")}{" "}
            <a href={preset.keyUrl} target="_blank" rel="noreferrer">
              Obter uma →
            </a>
          </p>
        )}
      </div>

      {/* Nome/etiqueta opcional (pra distinguir múltiplas do mesmo provedor) */}
      <div className="field">
        <label htmlFor="label">
          {t("set_label")} <span className="muted">{t("set_label_hint")}</span>
        </label>
        <input
          id="label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={`Ex: ${preset?.name} ${model || preset?.defaultModel || ""}`}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {/* Chave */}
      <div className="field">
        <label htmlFor="apikey">{t("set_api_key")}</label>
        <div className="key-row">
          <input
            id="apikey"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={editingId ? t("set_api_key_update") : t("set_api_key_placeholder")}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="ghost"
            onClick={() => setShowKey((s) => !s)}
            aria-label={showKey ? t("set_hide_key") : t("set_show_key")}
          >
            {showKey ? "🙈" : "👁"}
          </button>
        </div>
        <p className="hint privacy">
          {t("set_key_privacy")}
        </p>
      </div>

      {/* ═══ 3 IDIOMAS SEPARADOS ═══ */}
      <div className="lang-section">
        {/* 1. Idioma da INTERFACE */}
        <div className="field">
          <label htmlFor="ui-lang">🖥️ {t("set_ui_lang")}</label>
          <p className="hint" style={{ marginBottom: "6px" }}>
            {t("set_ui_lang_hint")}
          </p>
          <select
            id="ui-lang"
            value={uiLang}
            onChange={(e) => setUILang(e.target.value)}
          >
            <option value="pt-BR">🇧🇷 Português</option>
            <option value="en">🇺🇸 English</option>
            <option value="es">🇪🇸 Español</option>
            <option value="fr">🇫🇷 Français</option>
            <option value="de">🇩🇪 Deutsch</option>
            <option value="it">🇮🇹 Italiano</option>
            <option value="ru">🇷🇺 Русский</option>
            <option value="zh">🇨🇳 中文</option>
            <option value="ja">🇯🇵 日本語</option>
            <option value="ko">🇰🇷 한국어</option>
            <option value="ar">🇸🇦 العربية</option>
            <option value="hi">🇮🇳 हिन्दी</option>
          </select>
        </div>

        {/* 2. Idioma das TRADUÇÕES e EXPLICAÇÕES (texto escrito) */}
        <div className="field">
          <label htmlFor="lang">📝 {t("set_ai_lang")}</label>
          <p className="hint" style={{ marginBottom: "6px" }}>
            {t("set_ai_lang_hint")}
          </p>
          <select
            id="lang"
            value={targetLang}
            onChange={(e) => {
              setLang(e.target.value);
              // BUG-20260724-LANG-REVERT: persistir NA HORA (antes só salvava
              // no handleSave, que exige chave — fechar revertia a escolha).
              setTargetLang(e.target.value);
            }}
          >
            <optgroup label="Mais comuns">
              <option value="pt-BR">🇧🇷 Português (Brasil)</option>
              <option value="en">🇺🇸 English</option>
              <option value="es">🇪🇸 Español</option>
              <option value="fr">🇫🇷 Français</option>
            </optgroup>
            <optgroup label="Asiáticos">
              <option value="zh">🇨🇳 中文 (Chinês)</option>
              <option value="ja">🇯🇵 日本語 (Japonês)</option>
              <option value="ko">🇰🇷 한국어 (Coreano)</option>
              <option value="hi">🇮🇳 हिन्दी (Hindi)</option>
              <option value="ar">🇸🇦 العربية (Árabe)</option>
            </optgroup>
            <optgroup label="Europeus">
              <option value="de">🇩🇪 Deutsch (Alemão)</option>
              <option value="it">🇮🇹 Italiano</option>
              <option value="nl">🇳🇱 Nederlands (Holandês)</option>
              <option value="ru">🇷🇺 Русский (Russo)</option>
              <option value="pl">🇵🇱 Polski (Polonês)</option>
              <option value="tr">🇹🇷 Türkçe (Turco)</option>
              <option value="uk">🇺🇦 Українська (Ucraniano)</option>
            </optgroup>
            <optgroup label="Outros">
              <option value="he">🇮🇱 עברית (Hebraico)</option>
              <option value="id">🇮🇩 Bahasa Indonesia</option>
              <option value="vi">🇻🇳 Tiếng Việt (Vietnamita)</option>
              <option value="th">🇹🇭 ไทย (Tailandês)</option>
            </optgroup>
          </select>
        </div>

        {/* 3. Idioma do ÁUDIO FALADO (leitura em voz alta) */}
        <div className="field">
          <label htmlFor="audio-lang">🔊 {t("set_audio_lang")}</label>
          <p className="hint" style={{ marginBottom: "6px" }}>
            {t("set_audio_lang_hint")}
          </p>
          <select
            id="audio-lang"
            value={audioLang}
            onChange={(e) => {
              setAudioLangState(e.target.value);
              setAudioLang(e.target.value);
            }}
          >
            {/* "Original" em primeiro, separado, destacado */}
            <option value="original">📖 {t("set_audio_original")}</option>
            <optgroup label={t("set_audio_specific")}>
              <option value="pt-BR">🇧🇷 Português</option>
              <option value="en">🇺🇸 English</option>
              <option value="es">🇪🇸 Español</option>
              <option value="fr">🇫🇷 Français</option>
              <option value="de">🇩🇪 Deutsch</option>
              <option value="it">🇮🇹 Italiano</option>
              <option value="ru">🇷🇺 Русский</option>
              <option value="zh">🇨🇳 中文</option>
              <option value="ja">🇯🇵 日本語</option>
              <option value="ko">🇰🇷 한국어</option>
              <option value="ar">🇸🇦 العربية</option>
              <option value="hi">🇮🇳 हिन्दी</option>
            </optgroup>
          </select>
        </div>
        {/* 4. Idioma do CONTEÚDO — automático (detectado ao abrir, V2.4+).
            Os 4 papéis: interface / traduções / áudio / conteúdo (auto). */}
        <p className="hint" style={{ marginTop: "4px" }}>
          {t("set_content_lang")}
        </p>
      </div>

      {/* Modelo — SEMPRE VISÍVEL (é o que diferencia múltiplas entries) */}
      <div className="field">
        <label htmlFor="model">
          {t("set_model")}
          <span className="muted"> {t("set_model_default", { model: preset?.defaultModel ?? "" })}</span>
        </label>
        <div className="model-row">
          <input
            id="model"
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={preset?.defaultModel}
            spellCheck={false}
          />
          <button
            type="button"
            className="ghost"
            onClick={handleListModels}
            disabled={modelsLoading}
            title={t("set_search_models")}
          >
            {modelsLoading ? "⏳" : "🔍"}
          </button>
        </div>

        {/* Lista de modelos encontrados (clicável) */}
        {modelsLoading && (
          <p className="hint">{t("set_searching_models")}</p>
        )}
        {modelsError && (
          <p className="hint" style={{ color: "#a04020" }}>⚠️ {modelsError}</p>
        )}
        {modelsList && modelsList.length > 0 && (
          <div className="models-list">
            <div className="models-list-header">
              <input
                type="text"
                className="model-search"
                placeholder={t("filter") + "…"}
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
              />
              <button
                type="button"
                className="models-close-btn"
                onClick={() => setModelsList(null)}
                title="Fechar lista"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>
            <div className="models-scroll">
              {modelsList
                .filter((m) =>
                  m.toLowerCase().includes(modelSearch.toLowerCase()),
                )
                .map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`model-item ${model === m ? "selected" : ""}`}
                    onClick={() => setModel(m)}
                  >
                    {model === m && "✓ "}{m}
                  </button>
                ))}
            </div>
          </div>
        )}
        {modelsList && modelsList.length === 0 && (
          <p className="hint">{t("set_no_models")}</p>
        )}
      </div>

      {/* Avançado: só baseUrl */}
      <button
        type="button"
        className="advanced-toggle"
        onClick={() => setAdvancedOpen((o) => !o)}
        aria-expanded={advancedOpen}
      >
        {advancedOpen ? "▾" : "▸"} {t("set_advanced")}
      </button>
      {advancedOpen && (
        <div className="advanced">
          <div className="field">
            <label htmlFor="baseurl">
              {t("set_base_url")}{" "}
              <span className="muted">
                {t("set_base_url_default", { url: preset?.baseUrl ?? "" })}
              </span>
            </label>
            <input
              id="baseurl"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={preset?.baseUrl}
              spellCheck={false}
            />
            <p className="hint">
              {t("set_base_url_hint")}
            </p>
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="actions">
        <button type="submit" className="primary" disabled={!apiKey.trim()}>
          {editingId ? t("set_btn_update") : t("set_btn_add")}
        </button>
        <button type="button" onClick={handleTest} disabled={!apiKey.trim() || test.status === "testing"}>
          {test.status === "testing" ? t("set_testing") : t("set_test_connection")}
        </button>
        {entries.length > 0 && (
          <button type="button" className="danger" onClick={handleClear}>
            {t("set_clear_all")}
          </button>
        )}
      </div>

      {saved && <p className="feedback ok">{t("set_saved")}</p>}

      {test.status !== "idle" && test.status !== "testing" && (
        <p className={`feedback ${test.status === "ok" ? "ok" : "err"}`}>
          {test.status === "ok" ? "✓ " : "⚠️ "}
          {test.message}
        </p>
      )}

      </details>

      <style jsx>{`
        .v3-simple {
          background: #f7e7d7;
          border: 1px solid #191919;
          border-radius: 0;
          padding: 22px 20px;
          margin-bottom: 18px;
        }
        .v3-simple-title {
          margin: 0 0 8px;
          font-family: var(--font-brand);
          font-weight: 600;
          font-size: 21px;
          color: #191919;
        }
        .v3-simple-sub {
          margin: 0 0 16px;
          color: var(--text);
          font-size: 14.5px;
          line-height: 1.55;
        }
        .v3-plans {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .v3-plan {
          position: relative;
          flex: 1;
          min-width: 150px;
          display: flex;
          flex-direction: column;
          gap: 5px;
          background: #fff;
          border: 1px solid #d9c8b8;
          border-radius: 0;
          padding: 16px 14px;
          text-decoration: none;
          color: #191919;
        }
        .v3-plan b { font-family: var(--font-brand); font-size: 17px; font-weight: 600; }
        .v3-plan-price { font-family: var(--font-brand); color: #191919; font-weight: 600; font-size: 16px; }
        .v3-plan-desc { color: var(--text-muted); font-size: 12.5px; line-height: 1.4; }
        .v3-plan-featured {
          border-color: #191919;
          background: #fff1e5;
        }
        .v3-plan-byok {
          background: #eaf3f4;
          border-top: 3px solid #0f7680;
        }
        .v3-plan-livre {
          background: #eef7ee;
          border-top: 3px solid #2c7a2c;
        }
        .v3-plan-featured:hover { background: #f5e0cb; }
        .v3-plan-badge {
          position: absolute;
          top: -10px;
          left: 12px;
          background: #0f7680;
          color: #fff;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 10px;
        }
        .v3-plan-soon {
          align-self: flex-start;
          margin-top: 2px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-size: 10px;
          font-weight: 700;
          color: var(--text-muted);
          border: 1px solid var(--border);
          padding: 3px 10px;
        }
        .v3-simple-note {
          margin: 14px 0 0;
          font-size: 13px;
          color: var(--text-muted);
        }
        .v3-simple-note a { color: var(--accent-dark); font-weight: 700; }
        .v3-advanced {
          border: 1px solid var(--border);
          border-radius: 0;
          padding: 0 16px 16px;
          margin-bottom: 14px;
          background: var(--surface);
        }
        .v3-advanced summary {
          cursor: pointer;
          padding: 14px 0;
          font-size: 14.5px;
          color: var(--text);
          list-style: none;
        }
        .v3-advanced summary::-webkit-details-marker { display: none; }
        .v3-advanced summary::before { content: "▸ "; color: var(--accent); }
        .v3-advanced[open] summary::before { content: "▾ "; }
        .v3-advanced-hint {
          display: block;
          margin-top: 4px;
          font-size: 12.5px;
          font-weight: 400;
          color: var(--text-muted);
          line-height: 1.45;
        }
      `}</style>

      {/* Link pra tutorial completo */}
      <a href="/ajuda" target="_blank" rel="noreferrer" className="help-link-banner">
        ❓ Tutorial completo — o que cada ícone faz, como usar o Moka →
      </a>

      {/* Ajuda: o que é API, ranking de preços, link do provedor */}
      <details className="help-section">
        <summary>{t("help_title")}</summary>
        <div className="help-content">
          <p>
            {t("help_what_is_key")}
          </p>
          <p>
            <strong>{t("help_how_to_get")}</strong>
          </p>
          <ul>
            <li>{t("help_step1")}</li>
            <li>{t("help_step2")}</li>
            <li>{t("help_step3")}</li>
            <li>{t("help_step4")}</li>
          </ul>
          <p>
            <strong>{t("help_pricing")}</strong>{" "}
            <a href="https://openrouter.ai/pricing" target="_blank" rel="noreferrer">
              Ver ranking de preços (OpenRouter) →
            </a>
          </p>
        </div>
      </details>

      {/* Quem somos */}
      <div className="about-section">
        <details className="settings-section">
          <summary>🎬 Moka Video — transcrição e servidor</summary>
          <div className="about-content">
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              <strong>🎙 Chave OpenAI (Whisper)</strong> — opcional. Só é usada
              pra transcrever vídeos <em>sem legendas</em> (o Moka ouve o áudio).
              {whisperMasked ? ` Salva: ${whisperMasked}.` : ""}
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="password"
                value={whisperDraft}
                onChange={(e) => setWhisperDraft(e.target.value)}
                placeholder={whisperMasked ?? "sk-…"}
                autoComplete="off"
                style={{ flex: 1, minWidth: 180, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontSize: 14 }}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={async () => {
                  await setWhisperKey(whisperDraft.trim());
                  setWhisperDraft("");
                  setWhisperMasked(await getWhisperKeyMasked());
                  setVideoMsg(whisperDraft.trim() ? "✅ Chave Whisper salva." : "🗑 Chave Whisper removida.");
                }}
              >
                💾 Salvar
              </button>
              <button
                type="button"
                className="btn-ghost"
                disabled={testingVideo}
                onClick={async () => {
                  setTestingVideo(true);
                  setVideoMsg(null);
                  try {
                    const key = whisperDraft.trim() || (await (await import("@/lib/config")).getWhisperKey()) || "";
                    if (!key) throw new Error("Cole a chave pra testar.");
                    const res = await fetch("/api/proxy", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        url: "https://api.openai.com/v1/models",
                        method: "GET",
                        headers: { Authorization: `Bearer ${key}` },
                        body: "",
                      }),
                    });
                    const env = await res.json();
                    if ((env.status ?? 200) >= 400) throw new Error(`OpenAI respondeu ${env.status}.`);
                    setVideoMsg("✅ Chave OpenAI válida — Whisper pronto.");
                  } catch (err) {
                    setVideoMsg(`❌ ${err instanceof Error ? err.message : String(err)}`);
                  } finally {
                    setTestingVideo(false);
                  }
                }}
              >
                {testingVideo ? "Testando…" : "🔌 Testar"}
              </button>
            </div>

            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: 16 }}>
              <strong>🖥️ Servidor próprio</strong> — avançado, pode deixar vazio.
              Se você tiver o Moka Video rodando num servidor seu, cole o
              endereço pra ler vídeos por ele (Whisper, X/Twitter, Instagram).
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                type="url"
                value={ingestDraft}
                onChange={(e) => setIngestDraft(e.target.value)}
                placeholder="https://video.seuservidor.com"
                autoComplete="off"
                style={{ flex: 1, minWidth: 180, padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text)", fontSize: 14 }}
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={testingVideo}
                onClick={async () => {
                  const clean = ingestDraft.trim();
                  if (!clean) {
                    setIngestServer("");
                    setVideoMsg("🗑 Servidor removido — detecção automática do motor local.");
                    return;
                  }
                  setTestingVideo(true);
                  setVideoMsg("🔍 Testando o endereço…");
                  try {
                    const ctrl = new AbortController();
                    const timer = setTimeout(() => ctrl.abort(), 5000);
                    const res = await fetch(`${clean.replace(/\/$/, "")}/api/ingest`, { signal: ctrl.signal });
                    clearTimeout(timer);
                    const data = await res.json();
                    if (data?.ok && data?.server === "moka-video") {
                      setIngestServer(clean);
                      setVideoMsg(data.full ? "✅ Servidor válido e completo! Salvo." : "✅ Servidor válido (limitado). Salvo.");
                    } else {
                      setVideoMsg("❌ Respondeu, mas não é um motor Moka Video. Não salvei.");
                    }
                  } catch {
                    setVideoMsg("❌ Não consegui falar com esse endereço. Não salvei.");
                  } finally {
                    setTestingVideo(false);
                  }
                }}
              >
                {testingVideo ? "Testando…" : "💾 Salvar (com teste)"}
              </button>
            </div>
            {videoMsg && (
              <p style={{ marginTop: 10, fontSize: 13, padding: "8px 12px", background: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 8 }}>
                {videoMsg}
              </p>
            )}
          </div>
        </details>

        <details>
          <summary>{t("about_title")}</summary>
          <div className="about-content">
            <p>
              <strong>Moka</strong> — "Leia qualquer coisa. Entenda tudo."
            </p>
            <p>
              Um aplicativo dois em um (📖 livros + 🎬 vídeos) com IA que
              traduz, explica, transcreve e resume qualquer conteúdo, em
              qualquer idioma. Desenvolvido por:
            </p>
            <p>
              <strong>Miguel Gomes Barbosa do Rosário</strong><br />
              Cafezinho Media Group<br />
              Produtora de conteúdo e aplicativos<br />
              Niterói, RJ — Brasil<br />
              migueldorosario@ocafezinho.com
            </p>
            <p style={{ marginTop: "12px" }}>
              <a href="/sobre" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Saiba mais →
              </a>
              <span style={{ margin: "0 8px", color: "var(--text-muted)" }}>·</span>
              <a href="/privacidade" target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Privacidade →
              </a>
            </p>
          </div>
        </details>
      </div>

      {/* Premium */}
      <a href="/premium" className="premium-banner">
        ⭐ Moka Premium — IA inclusa, voz neural, biblioteca na nuvem. Saiba mais →
      </a>

      {/* Doação */}
      <div className="donate-section">
        <p className="donate-title">{t("donate_title")}</p>
        <div className="donate-options">
          <a
            href="https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=migueldorosario%40gmail.com&item_name=Moka+Reader&currency_code=BRL"
            target="_blank"
            rel="noreferrer"
            className="donate-btn paypal"
          >
            {t("donate_paypal")}
          </a>
          <button
            type="button"
            className="donate-btn pix"
            onClick={() => {
              navigator.clipboard?.writeText("migueldorosario2@gmail.com").then(() => {
                alert("PIX copiado!\n\nChave: migueldorosario2@gmail.com\nNome: Miguel Gomes Barbosa do Rosário\nBanco: Nubank");
              }).catch(() => {
                alert("PIX: migueldorosario2@gmail.com\nNome: Miguel Gomes Barbosa do Rosário\nBanco: Nubank");
              });
            }}
          >
            {t("donate_pix")}
          </button>
        </div>
      </div>

      <style jsx>{`
        .settings-form {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .field label {
          font-size: 14px;
          font-weight: 600;
        }
        .field input,
        .field select {
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--bg);
          color: var(--text);
          font-size: 14px;
          font-family: inherit;
        }
        .field input:focus,
        .field select:focus {
          outline: none;
          border-color: var(--accent);
        }
        .key-row {
          display: flex;
          gap: 8px;
        }
        .key-row input {
          flex: 1;
          font-family: ui-monospace, "SF Mono", Consolas, monospace;
        }
        .ghost {
          border: 1px solid var(--border);
          background: var(--surface);
          border-radius: 8px;
          padding: 0 14px;
          font-size: 16px;
        }
        .hint {
          margin: 0;
          font-size: 12.5px;
          color: var(--text-muted);
          line-height: 1.5;
        }
        .hint.privacy {
          background: var(--surface-alt);
          padding: 8px 10px;
          border-radius: 6px;
        }
        .hint a {
          color: var(--accent);
        }
        .advanced-toggle {
          align-self: flex-start;
          background: transparent;
          border: none;
          color: var(--text-muted);
          font-size: 13px;
          padding: 0;
        }
        .advanced {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          background: var(--surface-alt);
          border-radius: 8px;
        }
        .muted {
          font-weight: 400;
          color: var(--text-muted);
          font-size: 12px;
        }
        .model-row {
          display: flex;
          gap: 8px;
        }
        .model-row input {
          flex: 1;
          font-family: ui-monospace, "SF Mono", Consolas, monospace;
        }
        .models-list {
          margin-top: 8px;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        .models-list-header {
          display: flex;
          align-items: stretch;
          border-bottom: 1px solid var(--border);
        }
        .model-search {
          flex: 1;
          padding: 8px 10px;
          border: none;
          background: var(--surface);
          color: var(--text);
          font-size: 13px;
        }
        .model-search:focus {
          outline: none;
          background: var(--bg);
        }
        .models-close-btn {
          border: none;
          border-left: 1px solid var(--border);
          background: var(--surface);
          color: var(--text-muted);
          padding: 0 12px;
          font-size: 14px;
          cursor: pointer;
        }
        .models-close-btn:hover {
          background: #faf0e8;
          color: #a04020;
        }
        /* Botão de teste (🔌) — feedback visual por estado. */
        .test-btn.test-ok {
          background: #f0f2e4;
          border-color: #6b8e3d;
        }
        .test-btn.test-fail {
          background: #faf0e8;
          border-color: #a04020;
        }
        .test-btn:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .models-scroll {
          max-height: 200px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }
        .model-item {
          text-align: left;
          border: none;
          background: transparent;
          color: var(--text);
          padding: 8px 12px;
          font-size: 13px;
          font-family: ui-monospace, "SF Mono", Consolas, monospace;
          cursor: pointer;
          border-bottom: 1px solid var(--border);
        }
        .model-item:last-child {
          border-bottom: none;
        }
        .model-item:hover {
          background: var(--accent-soft);
          color: var(--accent);
        }
        .model-item.selected {
          background: #f0f2e4;
          color: #6b8e3d;
          font-weight: 600;
        }
        .actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .actions button {
          padding: 10px 18px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          font-size: 14px;
        }
        .actions button.primary {
          background: var(--accent);
          color: white;
          border-color: var(--accent);
          font-weight: 600;
        }
        .actions button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .actions button.danger {
          color: var(--accent);
        }
        .feedback {
          margin: 0;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 13px;
        }
        .feedback.ok {
          background: #f0f2e4;
          color: #6b8e3d;
          border: 1px solid #c8d4a8;
        }
        .feedback.err {
          background: #faf0e8;
          color: #a04020;
          border: 1px solid #e0c0a8;
        }

        /* Badge "chave atual" ao lado do label */
        .existing-key-badge {
          font-weight: 400;
          font-size: 11px;
          color: var(--text-muted);
          margin-left: 8px;
          font-family: ui-monospace, "SF Mono", Consolas, monospace;
          background: var(--surface-alt);
          padding: 2px 6px;
          border-radius: 4px;
        }

        /* Lista de provedores cadastrados */
        .saved-providers {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .saved-providers-title {
          margin: 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
        }
        .saved-providers-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .saved-provider-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 12px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
        }
        .saved-provider-card.active {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .saved-provider-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          flex: 1;
        }
        .saved-provider-name {
          font-weight: 600;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .active-dot {
          color: var(--accent);
          font-size: 10px;
        }
        .saved-provider-key {
          font-size: 12px;
          color: var(--text-muted);
          font-family: ui-monospace, "SF Mono", Consolas, monospace;
        }
        .saved-provider-model {
          font-size: 11px;
          color: var(--text-muted);
          font-style: italic;
        }
        .saved-provider-actions {
          display: flex;
          gap: 4px;
          flex-shrink: 0;
        }
        .mini-btn {
          border: 1px solid var(--border);
          background: var(--surface);
          color: var(--text);
          border-radius: 6px;
          font-size: 12px;
          padding: 4px 8px;
          cursor: pointer;
          transition: var(--transition);
        }
        .mini-btn:hover {
          border-color: var(--accent);
        }
        .use-btn {
          background: var(--accent);
          color: white;
          border-color: var(--accent);
          font-weight: 600;
        }
        .use-btn:hover {
          opacity: 0.85;
        }
        .remove-btn:hover {
          border-color: #a04020;
          color: #a04020;
        }

        /* Separador de seção */
        /* Seção de 3 idiomas */
        .lang-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 16px;
          background: var(--surface-alt);
          border-radius: 10px;
          border: 1px solid var(--border);
        }
        .section-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 4px 0;
          color: var(--text-muted);
          font-size: 12px;
          font-weight: 600;
        }
        .section-divider::before,
        .section-divider::after {
          content: "";
          flex: 1;
          height: 1px;
          background: var(--border);
        }

        /* Seção de ajuda */
        /* Banner de link pro tutorial */
        .help-link-banner {
          display: block;
          padding: 12px 16px;
          background: var(--accent-soft);
          border: 1px solid var(--accent);
          border-radius: 10px;
          color: var(--accent) !important;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: all 150ms ease;
        }
        .help-link-banner:hover {
          background: var(--accent);
          color: white !important;
        }
        .help-section {
          border: 1px solid var(--border);
          border-radius: 8px;
          background: var(--surface-alt);
          padding: 0;
        }
        .help-section summary {
          padding: 12px 14px;
          cursor: pointer;
          font-size: var(--text-sm);
          font-weight: 600;
          color: var(--text-muted);
          list-style: none;
        }
        .help-section summary::-webkit-details-marker {
          display: none;
        }
        .help-section summary::before {
          content: "▸ ";
        }
        .help-section[open] summary::before {
          content: "▾ ";
        }
        .help-content {
          padding: 0 14px 14px;
          font-size: var(--text-sm);
          line-height: 1.6;
          color: var(--text-muted);
        }
        .help-content p {
          margin: 0 0 8px;
        }
        .help-content ul {
          margin: 0 0 8px;
          padding-left: 20px;
        }
        .help-content a {
          color: var(--accent);
        }

        /* Quem somos */
        .about-section {
          border-top: 1px solid var(--border);
          padding-top: 12px;
        }
        .about-section summary {
          cursor: pointer;
          font-size: var(--text-xs);
          color: var(--text-muted);
          list-style: none;
        }
        .about-section summary::-webkit-details-marker {
          display: none;
        }
        .about-content {
          padding-top: 10px;
          font-size: var(--text-xs);
          line-height: 1.7;
          color: var(--text-muted);
        }
        .about-content p {
          margin: 0 0 8px;
        }

        /* Doação */
        /* Banner Premium */
        .premium-banner {
          display: block;
          text-align: center;
          padding: 14px 18px;
          background: linear-gradient(135deg, var(--accent), var(--gold, #c89968));
          color: white !important;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          transition: all 150ms ease;
        }
        .premium-banner:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 16px rgba(176, 106, 59, 0.3);
        }
        .donate-section {
          text-align: center;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        .donate-title {
          font-size: var(--text-sm);
          color: var(--text-muted);
          margin: 0 0 10px;
        }
        .donate-options {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .donate-btn {
          display: inline-block;
          padding: 8px 18px;
          text-decoration: none;
          border-radius: 20px;
          font-size: var(--text-sm);
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
          font-family: inherit;
        }
        .donate-btn.paypal {
          background: #0070ba;
          color: white;
          border: 1px solid #0070ba;
        }
        .donate-btn.paypal:hover {
          background: #005ea6;
        }
        .donate-btn.pix {
          background: #32bcad;
          color: white;
          border: 1px solid #32bcad;
        }
        .donate-btn.pix:hover {
          background: #25a89a;
        }
      `}</style>
    </form>
  );
}
