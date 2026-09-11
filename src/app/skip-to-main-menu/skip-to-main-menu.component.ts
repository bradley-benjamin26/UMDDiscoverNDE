import { Component } from '@angular/core';

@Component({
  selector: 'custom-skip-to-main-menu',
  standalone: true,
  templateUrl: './skip-to-main-menu.component.html',
  styles: [`
    :host{
      position: fixed;
      top: 0.5rem;
      left: 0.5rem;
      z-index: 2147483647;
      display: block;
    }
    .umd-skip-content{
      color: var(--black);
      background: var(--white);
      border: 2px solid var(--maryland-yellow);
      padding: 0.5rem 1rem;
    }
    .umd-skip-content:not(:focus):not(:active) {
      position: absolute;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      width: 1px;
      height: 1px;
      margin: -1px;
      overflow: hidden;
      padding: 0;
      border: 0;
      white-space: nowrap;
    }
    .umd-skip-content:focus,
    .umd-skip-content:focus-visible {
      position: static;
      clip: auto;
      clip-path: none;
      width: auto;
      height: auto;
      margin: 0;
      overflow: visible;
      padding: 0.5rem 1rem;
      white-space: normal;
      outline: 3px solid var(--maryland-yellow);
      outline-offset: 3px;
    }
  `],
})
export class SkipToMainMenuComponent {
  focusNdeSkipLinks(): void {
  const firstNdeSkipButton =
    document.querySelector<HTMLButtonElement>('button.skip-h2-button');

  firstNdeSkipButton?.focus();
}
  }