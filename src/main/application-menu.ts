import type { MenuItemConstructorOptions } from 'electron'

import type { AppLanguage } from '@/shared/rpc'

type ApplicationMenuLabels = {
  about: string
  copy: string
  cut: string
  edit: string
  help: string
  paste: string
  quit: string
  redo: string
  selectAll: string
  toggleDevTools: string
  undo: string
}

const MENU_LABELS = {
  de: {
    about: 'Über Clotho',
    copy: 'Kopieren',
    cut: 'Ausschneiden',
    edit: 'Bearbeiten',
    help: 'Hilfe',
    paste: 'Einfügen',
    quit: 'Beenden',
    redo: 'Wiederholen',
    selectAll: 'Alles auswählen',
    toggleDevTools: 'Entwicklertools umschalten',
    undo: 'Rückgängig',
  },
  en: {
    about: 'About Clotho',
    copy: 'Copy',
    cut: 'Cut',
    edit: 'Edit',
    help: 'Help',
    paste: 'Paste',
    quit: 'Quit',
    redo: 'Redo',
    selectAll: 'Select All',
    toggleDevTools: 'Toggle Developer Tools',
    undo: 'Undo',
  },
  es: {
    about: 'Acerca de Clotho',
    copy: 'Copiar',
    cut: 'Cortar',
    edit: 'Editar',
    help: 'Ayuda',
    paste: 'Pegar',
    quit: 'Salir',
    redo: 'Rehacer',
    selectAll: 'Seleccionar todo',
    toggleDevTools: 'Alternar herramientas de desarrollo',
    undo: 'Deshacer',
  },
  fr: {
    about: 'À propos de Clotho',
    copy: 'Copier',
    cut: 'Couper',
    edit: 'Édition',
    help: 'Aide',
    paste: 'Coller',
    quit: 'Quitter',
    redo: 'Rétablir',
    selectAll: 'Tout sélectionner',
    toggleDevTools: 'Outils de développement',
    undo: 'Annuler',
  },
  hi: {
    about: 'Clotho के बारे में',
    copy: 'कॉपी करें',
    cut: 'काटें',
    edit: 'संपादित करें',
    help: 'सहायता',
    paste: 'पेस्ट करें',
    quit: 'बाहर निकलें',
    redo: 'फिर से करें',
    selectAll: 'सभी चुनें',
    toggleDevTools: 'डेवलपर टूल टॉगल करें',
    undo: 'पूर्ववत करें',
  },
  id: {
    about: 'Tentang Clotho',
    copy: 'Salin',
    cut: 'Potong',
    edit: 'Edit',
    help: 'Bantuan',
    paste: 'Tempel',
    quit: 'Keluar',
    redo: 'Ulangi',
    selectAll: 'Pilih Semua',
    toggleDevTools: 'Alat Pengembang',
    undo: 'Urungkan',
  },
  ja: {
    about: 'Clotho について',
    copy: 'コピー',
    cut: 'カット',
    edit: '編集',
    help: 'ヘルプ',
    paste: 'ペースト',
    quit: '終了',
    redo: 'やり直す',
    selectAll: 'すべてを選択',
    toggleDevTools: '開発者ツールの切り替え',
    undo: '取り消す',
  },
  ko: {
    about: 'Clotho 정보',
    copy: '복사',
    cut: '잘라내기',
    edit: '편집',
    help: '도움말',
    paste: '붙여넣기',
    quit: '종료',
    redo: '다시 실행',
    selectAll: '모두 선택',
    toggleDevTools: '개발자 도구 전환',
    undo: '실행 취소',
  },
  'pt-BR': {
    about: 'Sobre o Clotho',
    copy: 'Copiar',
    cut: 'Recortar',
    edit: 'Editar',
    help: 'Ajuda',
    paste: 'Colar',
    quit: 'Sair',
    redo: 'Refazer',
    selectAll: 'Selecionar Tudo',
    toggleDevTools: 'Ferramentas do desenvolvedor',
    undo: 'Desfazer',
  },
  ru: {
    about: 'О Clotho',
    copy: 'Копировать',
    cut: 'Вырезать',
    edit: 'Правка',
    help: 'Справка',
    paste: 'Вставить',
    quit: 'Выйти',
    redo: 'Повторить',
    selectAll: 'Выбрать всё',
    toggleDevTools: 'Инструменты разработчика',
    undo: 'Отменить',
  },
  tr: {
    about: 'Clotho Hakkında',
    copy: 'Kopyala',
    cut: 'Kes',
    edit: 'Düzen',
    help: 'Yardım',
    paste: 'Yapıştır',
    quit: 'Çıkış',
    redo: 'Yinele',
    selectAll: 'Tümünü Seç',
    toggleDevTools: 'Geliştirici Araçları',
    undo: 'Geri Al',
  },
  vi: {
    about: 'Giới thiệu Clotho',
    copy: 'Sao chép',
    cut: 'Cắt',
    edit: 'Sửa',
    help: 'Trợ giúp',
    paste: 'Dán',
    quit: 'Thoát',
    redo: 'Làm lại',
    selectAll: 'Chọn tất cả',
    toggleDevTools: 'Công cụ dành cho nhà phát triển',
    undo: 'Hoàn tác',
  },
  'zh-CN': {
    about: '关于 Clotho',
    copy: '复制',
    cut: '剪切',
    edit: '编辑',
    help: '帮助',
    paste: '粘贴',
    quit: '退出',
    redo: '重做',
    selectAll: '全选',
    toggleDevTools: '切换开发者工具',
    undo: '撤销',
  },
  'zh-TW': {
    about: '關於 Clotho',
    copy: '複製',
    cut: '剪下',
    edit: '編輯',
    help: '說明',
    paste: '貼上',
    quit: '結束',
    redo: '重做',
    selectAll: '全選',
    toggleDevTools: '切換開發人員工具',
    undo: '復原',
  },
} satisfies Record<AppLanguage, ApplicationMenuLabels>

export function applicationMenuItems(
  language: AppLanguage,
  isDev: boolean,
): MenuItemConstructorOptions[] {
  const labels = MENU_LABELS[language]

  const items: MenuItemConstructorOptions[] = [
    {
      // macOS renders the app menu under the application name regardless of
      // this label; Electron still requires one for template validation.
      label: 'Clotho',
      submenu: [
        { label: labels.about, role: 'about' },
        { type: 'separator' },
        { label: labels.quit, role: 'quit' },
      ],
    },
    {
      label: labels.edit,
      submenu: [
        { label: labels.undo, role: 'undo' },
        { label: labels.redo, role: 'redo' },
        { type: 'separator' },
        { label: labels.cut, role: 'cut' },
        { label: labels.copy, role: 'copy' },
        { label: labels.paste, role: 'paste' },
        { label: labels.selectAll, role: 'selectAll' },
      ],
    },
  ]

  if (isDev) {
    // The toggleDevTools role targets the focused window and carries the
    // platform-default accelerator (Cmd+Option+I / Ctrl+Shift+I / F12).
    items.push({
      label: labels.help,
      role: 'help',
      submenu: [{ label: labels.toggleDevTools, role: 'toggleDevTools' }],
    })
  }

  return items
}
