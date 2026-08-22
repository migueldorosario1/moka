"use client";

import { useState, useEffect } from "react";
import { PRESETS, type AIConfig } from "@igot/ai-providers";
import {
  setConfig, setActiveEntry, removeEntry, updateEntryLabel,
  clearConfig, getTargetLang, setTargetLang,
  getAudioLang, setAudioLang,
  listAllEntriesSync, getConfigById, loadConfigCache, getConfigSync, getEntryForVoice,
  setWhisperKey, getWhisperKeyMasked,
  getTtsVoice, setTtsVoice,
  getTtsMode, setTtsMode,
  setUseForText, setUseForVoice, setUseForVideo,
  TTS_VOICES_OPENAI, TTS_VOICES_GROK,
} from "@/lib/config";
import { testConnection, listModels } from "@/lib/ai-client";
import { copyDiagnostics, hasRecentError } from "@/lib/diagnostics";
import { PIX_KEY, PIX_HOLDER } from "@/lib/donate";
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
  const [videoMsg, setVideoMsg] = useState<string | null>(null);
  const [testingVideo, setTestingVideo] = useState(false);
  // Feedback do botão "copiar diagnóstico" (13/08).
  const [diagMsg, setDiagMsg] = useState<string | null>(null);

  // Rascunho persistente: salva o que o usuário digitou no localStorage pra
  // não perder se fechar o modal sem salvar. Limpo após salvar com sucesso.
  const DRAFT_KEY = "moka.settingsDraft";

/** Frases de teste de voz — SEM gênero (neutro), no idioma do áudio falado.
 *  (Pedido do Miguel: "não use gênero sexual, tem voz feminina"). */
const TTS_TEST_PHRASES: Record<string, string> = {
  "pt-BR": "Olá! Esta é uma amostra de voz. O Moka pode ler qualquer texto em voz alta.",
  en: "Hello! This is a voice sample. Moka can read any text aloud.",
  es: "¡Hola! Esta es una muestra de voz. Moka puede leer cualquier texto en voz alta.",
  fr: "Bonjour ! Ceci est un échantillon de voix. Moka peut lire tout texte à voix haute.",
  de: "Hallo! Dies ist eine Sprachprobe. Moka kann jeden Text vorlesen.",
  it: "Ciao! Questo è un campione vocale. Moka può leggere qualsiasi testo ad alta voce.",
  ru: "Здравствуйте! Это образец голоса. Moka может читать любой текст вслух.",
  zh: "你好！这是语音样本。Moka 可以大声朗读任何文本。",
  ja: "こんにちは！これは音声サンプルです。Mokaはどんなテキストでも読み上げできます。",
  ko: "안녕하세요! 이것은 음성 샘플입니다. Moka는 어떤 텍스트든 소리 내어 읽을 수 있습니다.",
  ar: "مرحبًا! هذه عينة صوتية. يمكن لـ Moka قراءة أي نص بصوت عالٍ.",
  hi: "नमस्ते! यह एक आवाज़ नमूना है। Moka किसी भी टेक्स्ट को पढ़ सकता है।",
};
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
  // Feedback do botão "mostrar de novo o aviso de voz" (preferência neural/mecânica).
  const [voicePrefReset, setVoicePrefReset] = useState(false);
  // Voz neural escolhida (OpenAI/Grok) — persiste no localStorage.
  const [ttsVoice, setTtsVoiceState] = useState(getTtsVoice());
  // Estado do botão "▶ Escutar voz" (gera amostra de áudio).
  const [testingVoice, setTestingVoice] = useState(false);
  // Modo de voz: "neural" (OpenAI/Grok) ou "mechanical" (gratuita do dispositivo).
  // Escolha DIRETA nas configurações (sem popup). Pedido do Miguel 10/08.
  const [voiceMode, setVoiceModeState] = useState<"neural" | "mechanical">(() => {
    if (typeof window === "undefined") return "neural";
    return getTtsMode();
  });
  const setVoiceMode = (mode: "neural" | "mechanical") => {
    setVoiceModeState(mode);
    setTtsMode(mode);
  };
  // Formulário de adicionar/editar chave: escondido por trás de um botão
  // (pedido do Miguel: a lista aparece primeiro; o form só abre ao clicar).
  const [showForm, setShowForm] = useState(false);
  // Campos avançados (apelido, modelo, baseUrl): escondidos por padrão pra
  // simplificar (pedido do Miguel: menos campos visíveis).
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);

  // Busca de modelos disponíveis do provedor.
  const [modelsList, setModelsList] = useState<string[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  // Lista de entradas cadastradas (com chave mascarada + modelo).
  const [entries, setEntries] = useState(listAllEntriesSync());
  // Estado de teste por entry: entryId → 'testing' | 'ok' | 'fail'.
  const [entryTest, setEntryTest] = useState<Record<string, "testing" | "ok" | "fail">>({});

  // Sincroniza a lista de entries quando a config inicial muda (ex.: ao abrir
  // a página /configuracoes, o pai recarrega o cache fresco e passa novo
  // `initial`). Sem isto, a lista podia renderizar vazia/desatualizada.
  useEffect(() => {
    setEntries(listAllEntriesSync());
  }, [initial]);

  // Salva o rascunho no localStorage sempre que os campos mudam.
  // Assim, se o usuário fechar o modal sem salvar, não perde o que digitou.
  useEffect(() => {
    getWhisperKeyMasked().then(setWhisperMasked).catch(() => {});
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

  /** TESTAR — só verifica se a chave funciona (não salva no cofre).
   *  Pedido do Miguel: "botão testar separado do salvar". */
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

  /** "Testar todas" — testa cada chave cadastrada e monta um relatório
   * verde ✅ / vermelho ❌. Pedido do Miguel: "testar todas, dá um
   * relatóriozinho de chave verde e vermelho". */
  const [testingAll, setTestingAll] = useState(false);
  const [testAllReport, setTestAllReport] = useState<
    Array<{ name: string; ok: boolean; message: string }>
  >([]);
  const handleTestAll = async () => {
    if (entries.length === 0) return;
    setTestingAll(true);
    setTestAllReport([]);
    const report: Array<{ name: string; ok: boolean; message: string }> = [];
    for (const e of entries) {
      const config = getConfigById(e.id);
      const name = e.label || PRESETS.find((p) => p.id === e.providerId)?.name || e.providerId;
      if (!config) {
        report.push({ name, ok: false, message: "Chave não encontrada no cofre" });
        setTestAllReport([...report]);
        continue;
      }
      const result = await testConnection(config);
      report.push({ name, ok: result.ok, message: result.message });
      setTestAllReport([...report]); // atualiza incremental (a pessoa vê cada uma testar)
    }
    setTestingAll(false);
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
    // FORÇA recarga do cache (descriptografa de novo) antes de reler a lista —
    // sem isto, a nova entry podia não aparecer (bug reportado pelo Miguel).
    await loadConfigCache();
    setEntries(listAllEntriesSync());
    // Limpa o formulário pra próxima entrada.
    setApiKey("");
    setLabel("");
    setEditingId(null);
    setShowForm(false); // fecha o form, volta pra lista (pedido do Miguel)
    // Limpa o rascunho (já salvou, não precisa mais).
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(DRAFT_KEY);
    }
    onSaved();
    setTimeout(() => setSaved(false), 2500);
  };

  /** Abre o formulário LIMPO pra adicionar uma nova chave (pedido do Miguel). */
  const handleAddNew = () => {
    setEditingId(null);
    setApiKey("");
    setLabel("");
    setModel("");
    setBaseUrl("");
    setProviderId(PRESETS[0].id);
    setTest({ status: "idle", message: "" });
    setShowForm(true);
  };

  /** Troca a entry ativa (qual está em uso). */
  const handleActivate = async (id: string) => {
    await setActiveEntry(id);
    await loadConfigCache();
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
    await loadConfigCache();
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
    setShowForm(true); // abre o form preenchido (pedido do Miguel)
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
      {/* ═══ FASE GRATUITA (pivô do Miguel, 2026-08-04): BYOK é O modo — a
          IA roda com a chave do PRÓPRIO usuário (privacidade: a chave fica
          só no dispositivo, criptografada). Nada de planos/pontos/licença —
          a versão paga está preservada no backup pré-pivô (tag
          `pre-pivot-pago-v4.3`) e volta na Fase 2. ═══ */}
      {/* ═══ BYOK: sua chave de IA — PRIMEIRA COISA (a pessoa usa direto).
          Pedido do Miguel 10/08: 'começa com sua chave de IA direto'. ═══ */}
      <details className="v3-advanced" id="advanced-settings" open>
        <summary>
          <strong>{t("set_keys_title")}</strong>
          <span className="v3-advanced-hint">{t("set_keys_hint")}</span>
        </summary>

      {/* ═══ LISTA DE CHAVES NO TOPO — primeira coisa que aparece.
          Cada card com botão testar/usar/editar/remover. ═══ */}
      {entries.length > 0 && (
        <div className="saved-providers">
          <p className="saved-providers-title">{t("set_my_keys", { n: entries.length })}</p>
          <div className="saved-providers-list">
            {entries.map((e) => {
              const name = PRESETS.find((pr) => pr.id === e.providerId)?.name ?? e.providerId;
              const displayName = e.label || name;
              const hasTTS = ["openai", "grok", "groq"].includes(e.providerId);
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
                    {/* 3 checkboxes por função (mix de IAs — pedido do Miguel). */}
                    <div className="use-for-row">
                      {/* ☑️ Texto — qualquer IA pode */}
                      <label className="tts-checkbox-row">
                        <input
                          type="checkbox"
                          checked={!!e.useForText}
                          onChange={() => { setUseForText(e.id); setEntries(listAllEntriesSync()); }}
                        />
                        📖 {"Tradução/Explicação"}
                      </label>
                      {/* ☑️ Vídeo — só OpenAI/Grok/Groq */}
                      {hasTTS && (
                        <label className="tts-checkbox-row">
                          <input
                            type="checkbox"
                            checked={!!e.useForVideo}
                            onChange={() => { setUseForVideo(e.id); setEntries(listAllEntriesSync()); }}
                          />
                          🎬 {"Transcrição"}
                        </label>
                      )}
                      {/* ☑️ Voz neural — só OpenAI/Grok/Groq */}
                      {hasTTS && (
                        <label className="tts-checkbox-row">
                          <input
                            type="checkbox"
                            checked={!!e.useForVoice}
                            onChange={() => { setUseForVoice(e.id); setEntries(listAllEntriesSync()); }}
                          />
                          🎙️ {"Voz neural"}
                        </label>
                      )}
                    </div>
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

      {/* ═══ Botão "+ Adicionar nova chave" — sempre visível (pedido do Miguel).
          Abre o formulário limpo. Se o form já tá aberto, some. ═══ */}
      {!showForm && (
        <div className="key-list-actions">
          <button type="button" className="add-key-btn" onClick={handleAddNew}>
            ➕ {t("cfg_add_key")}
          </button>
          {entries.length > 0 && (
            <button
              type="button"
              className="test-all-btn"
              onClick={handleTestAll}
              disabled={testingAll}
            >
              {testingAll ? "⏳" : "🧪"} {t("cfg_test_all")}
            </button>
          )}
        </div>
      )}

      {/* Relatório "Testar todas" — lista verde ✅ / vermelho ❌. */}
      {(testingAll || testAllReport.length > 0) && (
        <div className="test-all-report">
          <h4>{t("cfg_test_all_report")}</h4>
          {testAllReport.map((r, i) => (
            <div key={i} className={`test-all-row ${r.ok ? "ok" : "fail"}`}>
              <span className="test-all-icon">{r.ok ? "✅" : "❌"}</span>
              <span className="test-all-name">{r.name}</span>
              <span className="test-all-msg">{r.message}</span>
            </div>
          ))}
          {testingAll && <p className="test-all-loading">⏳ {t("set_testing")}…</p>}
        </div>
      )}

      {/* ═══ FORMULÁRIO de adicionar/editar — escondido por trás do botão. ═══ */}
      {showForm && (
        <>

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
              {t("cfg_get_key")} →
            </a>
            {/* Acompanhar uso/gasto da IA (dashboard de usage do provedor) —
                pedido do Miguel: "acompanhe o uso de sua IA por aqui". */}
            {preset?.usageUrl && (
              <>
                {" · "}
                <a href={preset.usageUrl} target="_blank" rel="noreferrer">
                  📊 {t("cfg_track_usage")} →
                </a>
              </>
            )}
          </p>
        )}
      </div>

      {/* Nome/etiqueta opcional — escondido por padrão (simplificação, pedido
          do Miguel: menos campos visíveis). Só aparece em "opções avançadas". */}
      {showAdvancedFields && (
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
      )} {/* fim showAdvancedFields (apelido) */}

      {/* Chave */}
      <div className="field">
        <label htmlFor="apikey">{t("set_api_key")}</label>
        <div className="key-row">
          <input
            id="apikey"
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => {
              const val = e.target.value;
              setApiKey(val);
              setTest({ status: "idle", message: "" });
              setModelsError("");
            }}
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
        {/* Botões SEPARADOS: Testar (só verifica) + Salvar (grava no cofre).
            Pedido do Miguel: "botão testar separado do salvar". */}
        <div className="key-action-row">
          <button
            type="button"
            className="key-test-btn"
            onClick={handleTest}
            disabled={!apiKey.trim() || test.status === "testing"}
          >
            🧪 {test.status === "testing" ? t("set_testing") : t("set_test_connection")}
          </button>
          <button
            type="button"
            className="key-save-btn"
            onClick={(e) => handleSave(e as unknown as React.FormEvent)}
            disabled={!apiKey.trim()}
          >
            💾 {editingId ? t("set_btn_update") : t("set_btn_add")}
          </button>
        </div>
        {test.status !== "idle" && test.status !== "testing" && (
          <p className={`feedback ${test.status === "ok" ? "ok" : "err"}`} style={{ marginTop: 6 }}>
            {test.status === "ok" ? "✓ " : "⚠️ "}
            {test.message}
          </p>
        )}
        <p className="hint privacy">
          {t("set_key_privacy")}
        </p>

        {/* 💡 Dica rápida de modelo — ajuda a pessoa a saber qual usar. */}
        <p className="hint" style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5 }}>
          {preset?.id === "openai" && "💡 OpenAI: gpt-4o-mini (barato) ou gpt-5 (premium). Para voz neural: tts-1."}
          {preset?.id === "deepseek" && "💡 DeepSeek: deepseek-chat (texto). DeepSeek não faz voz neural."}
          {preset?.id === "zai" && "💡 Z.ai: glm-4.6 (padrão) ou glm-4-flash (mais barato). Z.ai não faz voz neural."}
          {preset?.id === "grok" && "💡 Grok: grok-4.20-0309-non-reasoning (texto rápido). Voz neural: qualquer modelo (o TTS é separado)."}
          {preset?.id === "groq" && "💡 Groq: llama-3.3-70b-versatile (texto). Groq também transcreve vídeo (Whisper)."}
          {preset?.id === "mistral" && "💡 Mistral: mistral-large-latest (padrão). Mistral não faz voz neural."}
          {preset?.id === "anthropic" && "💡 Anthropic: claude-haiku-4-5 (rápido) ou claude-opus-4-7 (premium). Não faz voz neural."}
          {preset?.id === "gemini" && "💡 Gemini: gemini-2.5-flash (padrão, barato). Gemini não faz voz neural."}
          {preset?.id === "together" && "💡 Together: Llama-3.3-70B (open source). Together não faz voz neural."}
          {preset?.id === "kimi" && "💡 Kimi: kimi-k3 (pesquisa profunda). Kimi não faz voz neural."}
          {preset?.id === "qwen" && "💡 Qwen: qwen-plus (padrão). Qwen não faz voz neural."}
        </p>
      </div>

      {/* ═══ 3 IDIOMAS SEPARADOS — MOVIDO PRA CÁ (era dentro do details).
          Pedido do Miguel 10/08: "joga todo esse bloco de idioma pra baixo". ═══ */}

      {/* ⚙️ Opções avançadas — esconde apelido/modelo/baseUrl por padrão
          (simplificação, pedido do Miguel: menos campos visíveis). */}

      {/* Modelo — SEMPRE VISÍVEL (pedido do Miguel: "tem que ter campo de
          modelo, escolher qual modelo usar"). Sem modelo, provedores como
          Gemini dão 404 (modelo padrão descontinuado). */}
      {/* Modelo + baseUrl — só em opções avançadas (era "sempre visível"). */}
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
            onChange={(e) => {
              setModel(e.target.value);
              setTest({ status: "idle", message: "" });
            }}
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

        {/* Lista de modelos encontrados (clicável com confirmação OK) */}
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
                    onClick={() => {
                      setModel(m);
                      setTest({ status: "idle", message: "" });
                    }}
                  >
                    {model === m && "✓ "}{m}
                  </button>
                ))}
            </div>
            {model && (
              <div className="model-select-bar">
                <span>Modelo escolhido: <strong>{model}</strong></span>
                <button
                  type="button"
                  className="model-ok-btn"
                  onClick={() => setModelsList(null)}
                >
                  ✓ OK — Usar Este Modelo
                </button>
              </div>
            )}
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

        </> // fecha o <> do {showForm && (
      )}

      </details>

      {/* 🆓 Moka gratuito + 🗝 3 jeitos — MOVIDOS PRA BAIXO (pedido Miguel 10/08:
          'bota lá pra baixo, começa com sua chave de IA direto'). */}
      <div className="v3-simple">
        <h3 className="v3-simple-title">🆓 {t("free_title")}</h3>
        <p className="v3-simple-sub">{t("free_desc")}</p>
        <p className="v3-simple-sub" style={{ marginTop: 6 }}>{t("byok_cost")}</p>
      </div>
      <div className="v3-simple" style={{ background: "var(--surface)" }}>
        <h3 className="v3-simple-title" style={{ fontSize: 17 }}>{t("keys3_title")}</h3>
        <p className="v3-simple-sub">{t("keys3_text")}</p>
        <p className="v3-simple-sub" style={{ marginTop: 6 }}>{t("keys3_voice")}</p>
        <p className="v3-simple-sub" style={{ marginTop: 6 }}>{t("keys3_video")}</p>
        <p className="v3-simple-note" style={{ marginTop: 10 }}>{t("keys3_same")}</p>
      </div>

      {/* ═══ 3 IDIOMAS + VOZ ═══ */}
      <div className="lang-section">
        {/* 1. Idioma da INTERFACE */}
        <div className="field">
          <label htmlFor="ui-lang">🖥️ {t("set_ui_lang")}</label>
          <p className="hint" style={{ marginBottom: "6px" }}>
            {t("set_ui_lang_hint")}
          </p>
          <select id="ui-lang" value={uiLang} onChange={(e) => setUILang(e.target.value)}>
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
        {/* 2. Idioma das TRADUÇÕES */}
        <div className="field">
          <label htmlFor="lang">📝 {t("set_ai_lang")}</label>
          <p className="hint" style={{ marginBottom: "6px" }}>{t("set_ai_lang_hint")}</p>
          <select id="lang" value={targetLang} onChange={(e) => { setLang(e.target.value); setTargetLang(e.target.value); }}>
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
        {/* 3. Idioma do ÁUDIO FALADO */}
        <div className="field">
          <label htmlFor="audio-lang">🔊 {t("set_audio_lang")}</label>
          <p className="hint" style={{ marginBottom: "6px" }}>{t("set_audio_lang_hint")}</p>
          <select id="audio-lang" value={audioLang} onChange={(e) => { setAudioLangState(e.target.value); setAudioLang(e.target.value); }}>
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
        {/* Preferência de voz (dropdown + reset) */}
        <div className="field voice-pref-field">
          <label>🔊 {t("cfg_voice_pref_title")}</label>
          <p className="hint" style={{ marginBottom: "8px" }}>{t("cfg_voice_pref_body")}</p>

          {/* Radio: voz neural vs mecânica — escolha DIRETA (sem popup).
              Persiste em localStorage. Pedido do Miguel 10/08. */}
          <div className="voice-mode-radios">
            <label className="voice-radio">
              <input
                type="radio"
                name="voice-mode"
                checked={voiceMode === "neural"}
                onChange={() => setVoiceMode("neural")}
              />
              🎙️ {"Voz neural (OpenAI/Grok)"}
            </label>
            <label className="voice-radio">
              <input
                type="radio"
                name="voice-mode"
                checked={voiceMode === "mechanical"}
                onChange={() => setVoiceMode("mechanical")}
              />
              🗣️ {"Voz mecânica gratuita"}
            </label>
          </div>

          {/* Dropdown de voz neural — só aparece se escolheu neural. */}
          {voiceMode === "neural" && (
            <>
              <label htmlFor="tts-voice" style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4, marginTop: 10 }}>
                {t("cfg_choose_voice")}:
              </label>
              <select id="tts-voice" value={ttsVoice} onChange={(e) => { setTtsVoice(e.target.value); setTtsVoiceState(e.target.value); }} style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 14 }}>
                <optgroup label="OpenAI">
                  {TTS_VOICES_OPENAI.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
                </optgroup>
                <optgroup label="Grok (xAI)">
                  {TTS_VOICES_GROK.map((v) => (<option key={v.id} value={v.id}>{v.label}</option>))}
                </optgroup>
              </select>
              {/* ▶ Escutar amostra da voz — gera um áudio curto de teste. */}
              <button
                type="button"
                className="key-refresh-btn"
                disabled={testingVoice}
                onClick={async () => {
                  setTestingVoice(true);
                  try {
                    const voiceConfig = getEntryForVoice();
                    if (!voiceConfig) { alert("Cadastre OpenAI, Grok ou Groq e marque ☑️ Voz neural."); return; }
                    const PRESET_BASE: Record<string, string> = { openai: "https://api.openai.com/v1", grok: "https://api.x.ai/v1", groq: "https://api.groq.com/openai/v1" };
                    const ttsBaseUrl = voiceConfig.baseUrl || PRESET_BASE[voiceConfig.providerId] || PRESET_BASE.openai;
                    const res = await fetch("/api/tts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                    // Frase de teste SEM gênero, no idioma do áudio falado.
                    text: TTS_TEST_PHRASES[audioLang] || TTS_TEST_PHRASES["en"] || "Hello, this is a voice test. The Moka reader can read any text aloud.",
                    voice: ttsVoice,
                    model: "tts-1",
                    baseUrl: ttsBaseUrl,
                    apiKey: voiceConfig.apiKey,
                  }),
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    new Audio(url).play();
                  } catch (e) {
                    alert(`❌ ${e instanceof Error ? e.message : String(e)}`);
                  } finally {
                    setTestingVoice(false);
                  }
                }}
              >
                {testingVoice ? "⏳" : "▶"} Escutar voz
              </button>
            </>
          )}
        </div>
        <p className="hint" style={{ marginTop: "4px" }}>{t("set_content_lang")}</p>
      </div>

      {/* 🎬 VÍDEO & TRANSCRIÇÃO REMOVIDO (pedido do Miguel 10/08): agora o
          OpenAI/Grok entram como modelos normais com checkbox "usar pra voz
          neural". Não precisa mais de seção Whisper separada. */}

      {/* CSS migrado para globals.css — cura o FOUC (era <style jsx>) */}

      {/* 📋 Copiar diagnóstico (pedido Miguel, 13/08): sempre visível, pra
          copiar o último erro mesmo depois dele sumir da tela. Monta um
          relatório com contexto (ação, livro, página, provedor, modelo). */}
      <button
        type="button"
        onClick={async () => {
          const ok = await copyDiagnostics();
          setDiagMsg(ok ? "✅ Diagnóstico copiado! Cole e me mande." : "⚠️ Não consegui copiar — me conta o que aconteceu.");
          setTimeout(() => setDiagMsg(null), 4000);
        }}
        className="diag-copy-btn"
        title="Copia um relatório com os detalhes do último erro (sem sua chave) pra você me mandar"
      >
        📋 {hasRecentError() ? "Copiar diagnóstico do último erro" : "Copiar diagnóstico"}
      </button>
      {diagMsg && <p className="diag-copy-msg">{diagMsg}</p>}

      {/* Link pra tutorial completo */}
      <a href="/ajuda" target="_blank" rel="noreferrer" className="help-link-banner">
        {t("set_tutorial_banner")} →
      </a>

      {/* Doação REMOVIDA daqui (duplicava com o SiteFooter da página —
          reporte do Miguel: "apoia o projeto aparece 2 vezes". O rodapé
          global já tem PayPal + PIX. */}

      {/* CSS migrado para globals.css — cura o FOUC (era <style jsx>) */}
    </form>
  );
}
