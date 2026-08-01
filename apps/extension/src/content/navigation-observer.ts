export class NavigationObserver {
  private cleanup?: () => void;

  start(onNavigate: () => void): void {
    this.stop();
    let lastUrl = location.href;

    const check = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onNavigate();
      }
    };

    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);

    history.pushState = function (...args) {
      pushState(...args);
      check();
    };
    history.replaceState = function (...args) {
      replaceState(...args);
      check();
    };

    window.addEventListener('popstate', check);
    const interval = window.setInterval(check, 1000);

    this.cleanup = () => {
      history.pushState = pushState;
      history.replaceState = replaceState;
      window.removeEventListener('popstate', check);
      window.clearInterval(interval);
    };
  }

  stop(): void {
    this.cleanup?.();
    this.cleanup = undefined;
  }
}
