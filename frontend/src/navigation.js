export const NAVIGATION_EVENT = "uniswap:navigate";

export function navigate(to, { replace = false } = {}) {
  const update = () => {
    window.history[replace ? "replaceState" : "pushState"](null, "", to);
    window.dispatchEvent(new Event(NAVIGATION_EVENT));
  };

  if (typeof document.startViewTransition === "function") {
    const transition = document.startViewTransition(update);
    transition.finished.catch(() => {});
  } else {
    update();
  }
}

export function handleAppLink(to, options) {
  return (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigate(to, options);
  };
}
