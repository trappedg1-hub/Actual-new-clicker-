export class LiveRegion {
  private readonly element: HTMLElement | null;

  constructor() {
    this.element = document.getElementById("live-status");
  }

  announce(message: string): void {
    if (this.element) this.element.textContent = message;
  }
}
