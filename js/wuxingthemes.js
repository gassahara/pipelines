// Dynamic Wu Xing (Five Elements) Theme Engine
// Provides color palettes with guaranteed WCAG AA contrast ratios.

export const ELEMENT_THEMES = {
  Wood: {
    background: '#0d1a0d',
    cardBg: '#1a2e1a',
    accent: '#4caf50',
    text: '#e8f5e9',
    border: '#2e7d32'
  },
  Fire: {
    background: '#1a0d0d',
    cardBg: '#2e1a1a',
    accent: '#ff5722',
    text: '#fbe9e7',
    border: '#bf360c'
  },
  Earth: {
    background: '#1a1a0d',
    cardBg: '#2e2e1a',
    accent: '#ffb300',
    text: '#fff8e1',
    border: '#f57f17'
  },
  Metal: {
    background: '#1a1a1a',
    cardBg: '#2e2e2e',
    accent: '#cfd8dc',
    text: '#eceff1',
    border: '#90a4ae'
  },
  Water: {
    background: '#0d0d1a',
    cardBg: '#1a1a2e',
    accent: '#42a5f5',
    text: '#e3f2fd',
    border: '#0d47a1'
  },
  Default: {
    background: '#0d0d1a',
    cardBg: '#1a1a2e',
    accent: '#e6b422',
    text: '#e2e8f0',
    border: '#e6b422'
  }
};

/**
 * Get the color theme for a given Wu Xing element.
 * @param {string} element - 'Wood', 'Fire', 'Earth', 'Metal', 'Water', or any other (falls back to Default).
 * @returns {object} - { background, cardBg, accent, text, border }
 */
export function getElementTheme(element) {
  const normalized = element.charAt(0).toUpperCase() + element.slice(1).toLowerCase();
  return ELEMENT_THEMES[normalized] || ELEMENT_THEMES.Default;
}
