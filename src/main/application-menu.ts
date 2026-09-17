import type { MenuItemConstructorOptions } from 'electron'

import type { AppLanguage } from '@/shared/rpc'

type ApplicationMenuLabels = {
  about: string
  copy: string
  cut: string
  edit: string
  paste: string
  quit: string
  redo: string
  selectAll: string
  undo: string
}

const MENU_LABELS = {
  de: {
    about: 'Über Clotho',
    copy: 'Kopieren',
    cut: 'Ausschneiden',
    edit: 'Bearbeiten',
    paste: 'Einfügen',
    quit: 'Beenden',
    redo: 'Wiederholen',
    selectAll: 'Alles auswählen',
    undo: 'Rückgängig',
  },
  en: {
    about: 'About Clotho',
    copy: 'Copy',
    cut: 'Cut',
    edit: 'Edit',
    paste: 'Paste',
    quit: 'Quit',
    redo: 'Redo',
    selectAll: 'Select All',
    undo: 'Undo',
  },
  es: {
    about: 'Acerca de Clotho',
    copy: 'Copiar',
    cut: 'Cortar',
    edit: 'Editar',
    paste: 'Pegar',
    quit: 'Salir',
    redo: 'Rehacer',
    selectAll: 'Seleccionar todo',
    undo: 'Deshacer',
  },
  fr: {
    about: 'À propos de Clotho',
    copy: 'Copier',
    cut: 'Couper',
    edit: 'Édition',
    paste: 'Coller',
    quit: 'Quitter',
    redo: 'Rétablir',
    selectAll: 'Tout sélectionner',
    undo: 'Annuler',
  },
  hi: {
    about: 'Clotho के बारे में',
    copy: 'कॉपी करें',
    cut: 'काटें',
    edit: 'संपादित करें',
    paste: 'चिपकाएँ',
    quit: 'बाहर निकलें',
    redo: 'फिर से करें',
    selectAll: 'सभी चुनें',
    undo: 'पूर्ववत करें',
  },
  id: {
    about: 'Tentang Clotho',
    copy: 'Salin',
    cut: 'Potong',
    edit: 'Edit',
    paste: 'Tempel',
    quit: 'Keluar',
    redo: 'Ulangi',
    selectAll: 'Pilih Semua',
    undo: 'Urungkan',
  },
  ja: {
    about: 'Clotho について',
    copy: 'コピー',
    cut: 'カット',
    edit: '編集',
    paste: 'ペースト',
    quit: '終了',
    redo: 'やり直す',
    selectAll: 'すべてを選択',
    undo: '取り消す',
  },
  ko: {
    about: 'Clotho 정보',
    copy: '복사',
    cut: '잘라내기',
    edit: '편집',
    paste: '붙여넣기',
    quit: '종료',
    redo: '다시 실행',
    selectAll: '모두 선택',
    undo: '실행 취소',
  },
  'pt-BR': {
    about: 'Sobre o Clotho',
    copy: 'Copiar',
    cut: 'Recortar',
    edit: 'Editar',
    paste: 'Colar',
    quit: 'Sair',
    redo: 'Refazer',
    selectAll: 'Selecionar Tudo',
    undo: 'Desfazer',
  },
  ru: {
    about: 'О Clotho',
    copy: 'Копировать',
    cut: 'Вырезать',
    edit: 'Правка',
    paste: 'Вставить',
    quit: 'Выйти',
    redo: 'Повторить',
    selectAll: 'Выбрать всё',
    undo: 'Отменить',
  },
  tr: {
    about: 'Clotho Hakkında',
    copy: 'Kopyala',
    cut: 'Kes',
    edit: 'Düzen',
    paste: 'Yapıştır',
    quit: 'Çıkış',
    redo: 'Yinele',
    selectAll: 'Tümünü Seç',
    undo: 'Geri Al',
  },
  vi: {
    about: 'Giới thiệu Clotho',
    copy: 'Sao chép',
    cut: 'Cắt',
    edit: 'Sửa',
    paste: 'Dán',
    quit: 'Thoát',
    redo: 'Làm lại',
    selectAll: 'Chọn tất cả',
    undo: 'Hoàn tác',
  },
  'zh-CN': {
    about: '关于 Clotho',
    copy: '复制',
    cut: '剪切',
    edit: '编辑',
    paste: '粘贴',
    quit: '退出',
    redo: '重做',
    selectAll: '全选',
    undo: '撤销',
  },
  'zh-TW': {
    about: '關於 Clotho',
    copy: '複製',
    cut: '剪下',
    edit: '編輯',
    paste: '貼上',
    quit: '結束',
    redo: '重做',
    selectAll: '全選',
    undo: '復原',
  },
} satisfies Record<AppLanguage, ApplicationMenuLabels>

export function applicationMenuItems(language: AppLanguage): MenuItemConstructorOptions[] {
  const labels = MENU_LABELS[language]

  return [
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
}
