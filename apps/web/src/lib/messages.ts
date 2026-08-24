/**
 * Mensagens do app em múltiplos idiomas.
 *
 * O idioma das mensagens de interface (erros, avisos) acompanha o idioma
 * que o usuário escolheu nas Configurações (targetLang). Assim quem
 * configurou em inglês vê erros em inglês, quem configurou em português
 * vê em português, etc.
 *
 * Pra adicionar um idioma: copie o bloco "pt-BR", troque a chave, traduza.
 * Pra adicionar uma mensagem: adicione a chave em TODOS os idiomas.
 */

export type MessageKey =
  | "errAuth"
  | "errRateLimit"
  | "errServer"
  | "errGeneric"
  | "errNetwork"
  | "errTimeout"
  | "errModelNotFound"
  | "errNoConfig"
  | "errNoText"
  | "errTokenCap"
  | "errCapCut";

type Messages = Record<MessageKey, string>;

const STRINGS: Record<string, Messages> = {
  "pt-BR": {
    errAuth:
      "Chave de API inválida ou sem permissão. Abra as Configurações (⚙️) e verifique sua chave do provedor.",
    errRateLimit:
      "Limite de uso atingido (muitas requisições). Você fez muitas chamadas em pouco tempo, ou esgotou a cota gratuita do seu provedor. Espere alguns minutos e tente de novo, ou troque pra outro provedor nas Configurações (⚙️).",
    errServer:
      "O provedor de IA está com problema no servidor dele. Não é falha do igot — tente de novo em alguns minutos, ou troque de provedor nas Configurações (⚙️).",
    errGeneric: "Erro ao contatar o provedor (código {code}).",
    errNetwork: "Falha de conexão. Verifique sua internet ou tente novamente — o provedor demorou demais para responder.",
    errTimeout: "A requisição demorou demais e foi cancelada. Tente novamente.",
    errNoConfig: "IA não configurada. Abra Configurações (⚙️) e escolha um provedor.",
    errNoText: "Página sem texto para traduzir.",
    errModelNotFound: "Modelo não encontrado. Verifique o nome do modelo nas Configurações (⚙️) — pode estar incorreto ou desatualizado.",
    errTokenCap:
      "Trava de consumo ativada: esta tarefa usaria cerca de {est} tokens, acima do seu limite de {cap} por tarefa. Nada foi enviado à IA. Ajuste a trava nas Configurações (⚙️) se quiser liberar.",
    errCapCut:
      "A tarefa passou da sua trava de {cap} tokens e foi interrompida para economizar seu crédito. O texto gerado até aqui foi preservado. Ajuste a trava nas Configurações (⚙️) se quiser respostas completas.",
  },
  en: {
    errAuth:
      "Invalid API key or insufficient permissions. Open Settings (⚙️) and check your provider key.",
    errRateLimit:
      "Usage limit reached (too many requests). You made too many calls in a short time, or exhausted your provider's free quota. Wait a few minutes and try again, or switch to another provider in Settings (⚙️).",
    errServer:
      "The AI provider is having server issues. This is not an igot problem — try again in a few minutes, or switch providers in Settings (⚙️).",
    errGeneric: "Error contacting the provider (code {code}).",
    errNetwork: "Connection failed. Check your internet or try again — the provider took too long to respond.",
    errTimeout: "The request took too long and was cancelled. Please try again.",
    errNoConfig: "AI not configured. Open Settings (⚙️) and choose a provider.",
    errNoText: "Page has no text to translate.",
    errModelNotFound: "Modelo não encontrado. Verifique o nome do modelo nas Configurações (⚙️) — pode estar incorreto ou desatualizado.",
    errTokenCap:
      "Token cap enabled: this task would use about {est} tokens, above your per-task limit of {cap}. Nothing was sent to the AI. Adjust the cap in Settings (⚙️) to allow it.",
    errCapCut:
      "The task went over your {cap}-token cap and was stopped to save your credit. The text generated so far was kept. Adjust the cap in Settings (⚙️) if you want full answers.",
  },
  es: {
    errAuth:
      "Clave de API inválida o sin permisos. Abre Configuración (⚙️) y verifica tu clave del proveedor.",
    errRateLimit:
      "Límite de uso alcanzado (demasiadas solicitudes). Hiciste muchas llamadas en poco tiempo, o agotaste la cuota gratuita de tu proveedor. Espera unos minutos e inténtalo de nuevo, o cambia a otro proveedor en Configuración (⚙️).",
    errServer:
      "El proveedor de IA tiene problemas en su servidor. No es un error de igot — inténtalo de nuevo en unos minutos, o cambia de proveedor en Configuración (⚙️).",
    errGeneric: "Error al contactar al proveedor (código {code}).",
    errNetwork: "Fallo de conexión. Revisa tu internet o inténtalo de nuevo — el proveedor tardó demasiado en responder.",
    errTimeout: "La solicitud tardó demasiado y se canceló. Inténtalo de nuevo.",
    errNoConfig: "IA no configurada. Abre Configuración (⚙️) y elige un proveedor.",
    errNoText: "La página no tiene texto para traducir.",
    errModelNotFound: "Modelo não encontrado. Verifique o nome do modelo nas Configurações (⚙️) — pode estar incorreto ou desatualizado.",
    errTokenCap:
      "Límite de tokens activado: esta tarea usaría unos {est} tokens, por encima de tu límite de {cap} por tarea. No se envió nada a la IA. Ajusta el límite en Configuración (⚙️) para permitirlo.",
    errCapCut:
      "La tarea superó tu límite de {cap} tokens y se detuvo para ahorrar tu crédito. El texto generado hasta aquí se conservó. Ajusta el límite en Configuración (⚙️) si quieres respuestas completas.",
  },
  fr: {
    errAuth:
      "Clé API invalide ou permissions insuffisantes. Ouvrez les Paramètres (⚙️) et vérifiez votre clé.",
    errRateLimit:
      "Limite d'utilisation atteinte (trop de requêtes). Vous avez fait trop d'appels en peu de temps, ou épuisé le quota gratuit. Attendez quelques minutes et réessayez, ou changez de fournisseur dans les Paramètres (⚙️).",
    errServer:
      "Le fournisseur d'IA a des problèmes de serveur. Ce n'est pas un problème igot — réessayez dans quelques minutes, ou changez de fournisseur dans les Paramètres (⚙️).",
    errGeneric: "Erreur lors du contact du fournisseur (code {code}).",
    errNetwork: "Échec de connexion. Vérifiez votre internet ou réessayez — le fournisseur a mis trop de temps à répondre.",
    errTimeout: "La requête a pris trop de temps et a été annulée. Veuillez réessayer.",
    errNoConfig: "IA non configurée. Ouvrez les Paramètres (⚙️) et choisissez un fournisseur.",
    errNoText: "La page n'a pas de texte à traduire.",
    errModelNotFound: "Modelo não encontrado. Verifique o nome do modelo nas Configurações (⚙️) — pode estar incorreto ou desatualizado.",
    errTokenCap:
      "Limite de tokens activé : cette tâche utiliserait environ {est} tokens, au-dessus de votre limite de {cap} par tâche. Rien n'a été envoyé à l'IA. Réglez la limite dans les Paramètres (⚙️) pour l'autoriser.",
    errCapCut:
      "La tâche a dépassé votre limite de {cap} tokens et a été interrompue pour économiser votre crédit. Le texte généré jusqu'ici est conservé. Réglez la limite dans les Paramètres (⚙️) pour des réponses complètes.",
  },
  zh: {
    errAuth: "API 密钥无效或权限不足。打开设置 (⚙️) 并检查您的密钥。",
    errRateLimit:
      "已达使用限额（请求过多）。您在短时间内调用过多，或已用完免费额度。请稍等几分钟再试，或在设置 (⚙️) 中更换提供商。",
    errServer: "AI 提供商服务器出现问题。这不是 igot 的故障——请几分钟后重试，或在设置 (⚙️) 中更换提供商。",
    errGeneric: "联系提供商时出错（代码 {code}）。",
    errNetwork: "连接失败。请检查网络或重试——提供商响应超时。",
    errTimeout: "请求超时已取消。请重试。",
    errNoConfig: "AI 未配置。打开设置 (⚙️) 并选择一个提供商。",
    errNoText: "页面没有可翻译的文本。",
    errModelNotFound: "Modelo não encontrado. Verifique o nome do modelo nas Configurações (⚙️) — pode estar incorreto ou desatualizado.",
    errTokenCap:
      "已启用 token 上限：此任务约需 {est} 个 token，超过您设定的单任务上限 {cap}。尚未向 AI 发送任何内容。请在设置 (⚙️) 中调整上限以放行。",
    errCapCut:
      "该任务超过了您设定的 {cap} 个 token 上限，为节省额度已停止。已生成的文本已保留。如需完整回答，请在设置 (⚙️) 中调整上限。",
  },
  ru: {
    errAuth:
      "Недействительный ключ API или нет прав. Откройте Настройки (⚙️) и проверьте ключ.",
    errRateLimit:
      "Превышен лимит использования (слишком много запросов). Подождите несколько минут и попробуйте снова, или смените провайдера в Настройках (⚙️).",
    errServer:
      "У провайдера ИА проблемы с сервером. Это не ошибка igot — попробуйте через несколько минут или смените провайдера в Настройках (⚙️).",
    errGeneric: "Ошибка при обращении к провайдеру (код {code}).",
    errNetwork: "Сбой подключения. Проверьте интернет или попробуйте снова — провайдер слишком долго отвечал.",
    errTimeout: "Запрос занял слишком много времени и был отменён. Попробуйте снова.",
    errNoConfig: "ИА не настроена. Откройте Настройки (⚙️) и выберите провайдера.",
    errNoText: "На странице нет текста для перевода.",
    errModelNotFound: "Modelo não encontrado. Verifique o nome do modelo nas Configurações (⚙️) — pode estar incorreto ou desatualizado.",
    errTokenCap:
      "Включён лимит токенов: эта задача потребует около {est} токенов — больше вашего лимита {cap} на задачу. В ИИ ничего не отправлено. Измените лимит в Настройках (⚙️), чтобы разрешить.",
    errCapCut:
      "Задача превысила ваш лимит в {cap} токенов и была остановлена, чтобы сэкономить кредит. Уже созданный текст сохранён. Измените лимит в Настройках (⚙️) для полных ответов.",
  },
  de: {
    errAuth:
      "Ungültiger API-Schlüssel oder fehlende Berechtigung. Öffnen Sie die Einstellungen (⚙️) und überprüfen Sie Ihren Schlüssel.",
    errRateLimit:
      "Nutzungslimit erreicht (zu viele Anfragen). Warten Sie einige Minuten und versuchen Sie es erneut, oder wechseln Sie den Anbieter in den Einstellungen (⚙️).",
    errServer:
      "Der KI-Anbieter hat Serverprobleme. Das ist kein igot-Fehler — versuchen Sie es in wenigen Minuten erneut oder wechseln Sie den Anbieter in den Einstellungen (⚙️).",
    errGeneric: "Fehler beim Kontaktieren des Anbieters (Code {code}).",
    errNetwork: "Verbindung fehlgeschlagen. Prüfen Sie Ihr Internet oder versuchen Sie es erneut — der Anbieter brauchte zu lange.",
    errTimeout: "Die Anfrage dauerte zu lange und wurde abgebrochen. Bitte versuchen Sie es erneut.",
    errNoConfig: "KI nicht konfiguriert. Öffnen Sie die Einstellungen (⚙️) und wählen Sie einen Anbieter.",
    errNoText: "Seite hat keinen Text zum Übersetzen.",
    errModelNotFound: "Modelo não encontrado. Verifique o nome do modelo nas Configurações (⚙️) — pode estar incorreto ou desatualizado.",
    errTokenCap:
      "Token-Limit aktiv: Diese Aufgabe würde etwa {est} Tokens verbrauchen, mehr als Ihr Limit von {cap} pro Aufgabe. Es wurde nichts an die KI gesendet. Passen Sie das Limit in den Einstellungen (⚙️) an.",
    errCapCut:
      "Die Aufgabe hat Ihr Limit von {cap} Tokens überschritten und wurde gestoppt, um Ihr Guthaben zu schonen. Der bisher erzeugte Text wurde behalten. Passen Sie das Limit in den Einstellungen (⚙️) an.",
  },
  ja: {
    errAuth: "APIキーが無効か権限がありません。設定 (⚙️) を開いてキーを確認してください。",
    errRateLimit:
      "使用制限に達しました（リクエストが多すぎます）。数分待って再試行するか、設定 (⚙️) でプロバイダーを変更してください。",
    errServer:
      "AIプロバイダーのサーバーに問題があります。これはigotの障害ではありません — 数分後に再試行するか、設定 (⚙️) でプロバイダーを変更してください。",
    errGeneric: "プロバイダーへの接続エラー（コード {code}）。",
    errNetwork: "接続に失敗しました。インターネットを確認するか再試行してください — プロバイダーの応答がタイムアウトしました。",
    errTimeout: "リクエストがタイムアウトし、キャンセルされました。再試行してください。",
    errNoConfig: "AIが設定されていません。設定 (⚙️) を開いてプロバイダーを選択してください。",
    errNoText: "ページに翻訳するテキストがありません。",
    errModelNotFound: "Modelo não encontrado. Verifique o nome do modelo nas Configurações (⚙️) — pode estar incorreto ou desatualizado.",
    errTokenCap:
      "トークン上限が有効です：このタスクは約 {est} トークンを使用し、タスクあたりの上限 {cap} を超えます。AI には何も送信されませんでした。許可するには設定 (⚙️) で上限を調整してください。",
    errCapCut:
      "タスクが {cap} トークンの上限を超えたため、クレジットを節約するために停止しました。ここまで生成されたテキストは保持されています。完全な回答が必要な場合は設定 (⚙️) で上限を調整してください。",
  },
};

/** Idiomas suportados (chave → nome de exibição). */
export const LANGUAGES: Record<string, string> = {
  "pt-BR": "Português (Brasil)",
  en: "English",
  es: "Español",
  fr: "Français",
  zh: "中文",
  ru: "Русский",
  de: "Deutsch",
  ja: "日本語",
};

/**
 * Devolve as mensagens no idioma do usuário.
 * Cai pra inglês se o idioma não tiver tradução, e pra pt-BR como último
 * recurso (idioma padrão do projeto).
 */
export function getMessages(lang: string): Messages {
  return STRINGS[lang] ?? STRINGS.en ?? STRINGS["pt-BR"];
}

/**
 * Pega uma mensagem no idioma do usuário, substituindo placeholders
 * (ex: {code} → 429).
 */
export function t(lang: string, key: MessageKey, vars?: Record<string, string | number>): string {
  const messages = getMessages(lang);
  let text = messages[key] ?? STRINGS.en[key] ?? STRINGS["pt-BR"][key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
