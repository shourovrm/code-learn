// The theme switch in Settings: System (the default, following the desktop), Light or Dark (app/theme.ts).
import { Icon, type IconName } from '../ui/Icon';
import { chooseTheme, THEME_CHOICES, type ThemeChoice, useThemeChoice } from './theme';

const LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const ICON: Record<ThemeChoice, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

/** The three choices as a radio group. */
export function ThemeSwitch() {
  const choice = useThemeChoice();
  return (
    <div className="theme-switch" role="radiogroup" aria-label="Theme">
      {THEME_CHOICES.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={choice === option}
          onClick={() => chooseTheme(option)}
        >
          <Icon name={ICON[option]} size={14} color="currentColor" />
          {LABEL[option]}
        </button>
      ))}
    </div>
  );
}
