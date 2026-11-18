/** Prototype-only theme controller. Do not import into live pages until reviewed. */
export const SU_THEMES=Object.freeze(["classic","modern","amethyst","ruby","crystal","abyssal","original"]);
export const SU_DEFAULT_THEME="classic";
export function isSuTheme(value){return SU_THEMES.includes(value)}
export function setSuTheme(root,theme){if(!root||typeof root.setAttribute!=="function")throw new TypeError("A root element is required");const next=isSuTheme(theme)?theme:SU_DEFAULT_THEME;root.setAttribute("data-su-theme",next);return next}
export function getSuTheme(root){const value=root?.getAttribute?.("data-su-theme");return isSuTheme(value)?value:SU_DEFAULT_THEME}
/** Intentionally no localStorage/sessionStorage/cookies: guest preference is ephemeral. */
