/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    panel: '#15213D', action: '#F26B5E', dangerAction: '#ef4444',
    // Legacy aliases (kept for backward compatibility)
    text: '#15213D',
    tint: '#F26B5E',

    // Core surfaces
    background: '#F8F6F1',
    foreground: '#15213D',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#15213D',

    // Primary action color (buttons, links, active states)
    primary: '#F26B5E',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E8EDF4',
    secondaryForeground: '#243556',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EEF0F2',
    mutedForeground: '#68748E',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#FFE5DF',
    accentForeground: '#A73F37',

    // Destructive actions (delete, error states)
    destructive: '#ef4444',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#E1E5EA',
    input: '#D8DEE7',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  dark: {
    panel: '#15213D', action: '#B94337', dangerAction: '#B83243', text: '#EDF1FA', tint: '#FF9385', background: '#101724', foreground: '#EDF1FA',
    card: '#1C2637', cardForeground: '#EDF1FA', primary: '#FF9385', primaryForeground: '#FFFFFF',
    secondary: '#2B374C', secondaryForeground: '#DEE6F5', muted: '#253044', mutedForeground: '#B2BDD0',
    accent: '#4B302F', accentForeground: '#FFC2B8', destructive: '#FF8D94', destructiveForeground: '#FFFFFF',
    border: '#3B485E', input: '#596780',
  },
  radius: 16,
};

export default colors;
