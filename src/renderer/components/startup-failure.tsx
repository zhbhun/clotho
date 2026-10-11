import { messages } from '../i18n/catalog'
import {
  type LanguagePreference,
  type SupportedLanguage,
  resolveLanguagePreference,
} from '../i18n/languages'
import { loadLanguagePreference } from '../services/app-settings'
import { FailureEmpty } from './failure-empty'

const STARTUP_FAILURE_TITLE = messages(
  'Unable to start Clotho',
  '无法启动 Clotho',
  '無法啟動 Clotho',
  'Clotho を起動できません',
  'Clotho를 시작할 수 없습니다',
  'No se pudo iniciar Clotho',
  'Impossible de démarrer Clotho',
  'Clotho konnte nicht gestartet werden',
  'Não foi possível iniciar o Clotho',
  'Не удалось запустить Clotho',
  'Clotho प्रारंभ नहीं हो सका',
  'Clotho tidak dapat dimulai',
  'Clotho başlatılamadı',
  'Không thể khởi động Clotho',
)

const STARTUP_FAILURE_DESCRIPTION = messages(
  'Clotho could not start. Please reload.',
  '应用暂时无法启动，请重新加载。',
  '應用程式暫時無法啟動，請重新載入。',
  'Clotho を起動できませんでした。再読み込みしてください。',
  'Clotho를 시작하지 못했습니다. 다시 불러오세요.',
  'Clotho no se pudo iniciar. Vuelve a cargarlo.',
  'Clotho n’a pas pu démarrer. Veuillez le recharger.',
  'Clotho konnte nicht gestartet werden. Bitte neu laden.',
  'O Clotho não pôde ser iniciado. Recarregue.',
  'Не удалось запустить Clotho. Перезагрузите его.',
  'Clotho प्रारंभ नहीं हो सका। कृपया पुनः लोड करें।',
  'Clotho tidak dapat dimulai. Silakan muat ulang.',
  'Clotho başlatılamadı. Lütfen yeniden yükleyin.',
  'Không thể khởi động Clotho. Vui lòng tải lại.',
)

const STARTUP_FAILURE_ACTION = messages(
  'Reload',
  '重新加载',
  '重新載入',
  '再読み込み',
  '다시 불러오기',
  'Recargar',
  'Recharger',
  'Neu laden',
  'Recarregar',
  'Перезагрузить',
  'पुनः लोड करें',
  'Muat ulang',
  'Yeniden yükle',
  'Tải lại',
)

// Startup failure can precede i18n initialization, so the language is resolved
// from the raw preference and system languages instead of the i18n instance.
function resolveStartupLanguage(): SupportedLanguage {
  let preference: LanguagePreference = 'system'
  try {
    preference = loadLanguagePreference()
  } catch {
    // App settings are not guaranteed to be initialized at this point.
  }
  const systemLanguages = navigator.languages?.length ? navigator.languages : [navigator.language]
  return resolveLanguagePreference(preference, systemLanguages)
}

export function StartupFailure() {
  const language = resolveStartupLanguage()
  return (
    <FailureEmpty
      actionLabel={STARTUP_FAILURE_ACTION[language]}
      className="h-svh rounded-none bg-background text-foreground"
      description={STARTUP_FAILURE_DESCRIPTION[language]}
      title={STARTUP_FAILURE_TITLE[language]}
      onAction={() => window.location.reload()}
    />
  )
}
