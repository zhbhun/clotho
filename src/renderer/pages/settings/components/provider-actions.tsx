import { ChevronDown, Library, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'

import {
  Menu,
  MenuContent,
  MenuItem,
  MenuList,
  MenuSearch,
  MenuTrigger,
} from '../../../components/menu'
import {
  type ProviderPreset,
  providerPresets,
} from '../../../components/model-configuration/provider-presets'

export function ProviderActions({
  onNew,
  onPreset,
}: {
  onNew: () => void
  onPreset: (preset: ProviderPreset) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={onNew}>
        <Plus data-icon="inline-start" />
        {t('settings.provider.add')}
      </Button>
      <Menu>
        <MenuTrigger render={<Button variant="outline" />}>
          <Library data-icon="inline-start" />
          {t('settings.provider.addFromPreset')}
          <ChevronDown data-icon="inline-end" strokeWidth={1} />
        </MenuTrigger>
        <MenuContent align="start" className="w-60" glass>
          <MenuSearch placeholder={t('settings.provider.searchPresets')} />
          <MenuList className="max-h-80">
            {providerPresets.map((preset) => (
              <MenuItem key={preset.id} onSelect={() => onPreset(preset)}>
                {preset.name}
              </MenuItem>
            ))}
          </MenuList>
        </MenuContent>
      </Menu>
    </div>
  )
}
