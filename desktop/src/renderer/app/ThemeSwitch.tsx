// The theme switch in the sidebar's foot: System (the default, following the desktop), Light or Dark (app/theme.ts).
import { Icon, type IconName } from '../ui/Icon';
import { chooseTheme, THEME_CHOICES, type ThemeChoice, useThemeChoice } from './theme';

const LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const ICON: Record<ThemeChoice, IconName> = { system: 'monitor', light: 'sun', dark: 'moon' };

/** Wide: the three choices as a radio group. Slim: one button that moves to the next choice, named by the current one. */
export function ThemeSwitch({ slim = false }: { slim?: boolean }) {
  const choice = useThemeChoice();
  if (slim) {
    const next = THEME_CHOICES[(THEME_CHOICES.indexOf(choice) + 1) % THEME_CHOICES.length]!;
    const name = `Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}`;
    return (
      <button type="button" className="nav theme-cycle" title={name} aria-label={name} onClick={() => chooseTheme(next)}>
        <Icon name={ICON[choice]} color="var(--navy-text)" />
      </button>
    );
  }
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
