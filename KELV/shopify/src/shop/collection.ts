import { KelvElement } from '@/lib/element';
import { observeReveals, resetReveals } from '@/ui/reveal';

/** The products page: the category tabs filter the groups (which play their entrance again); the goals are toggles only. */
export class Collection extends KelvElement {
  protected mount() {
    const tabs = [...this.querySelectorAll<HTMLButtonElement>('[data-tab]')];
    const groups = this.ref('groups')!;
    let stopReveals = () => {};
    this.cleanup(() => stopReveals());

    for (const tab of tabs) {
      this.listen(tab, 'click', () => {
        if (tab.classList.contains('is-active')) return;
        for (const other of tabs) {
          other.classList.toggle('is-active', other === tab);
          other.setAttribute('aria-pressed', String(other === tab));
        }
        const id = tab.dataset.tab;
        for (const group of groups.querySelectorAll<HTMLElement>('[data-group]')) {
          group.hidden = id !== 'all' && group.dataset.group !== id;
        }
        stopReveals();
        resetReveals(groups);
        stopReveals = observeReveals(groups);
      });
    }

    for (const goal of this.querySelectorAll<HTMLButtonElement>('[data-goal]')) {
      this.listen(goal, 'click', () => {
        const on = goal.classList.toggle('is-on');
        goal.setAttribute('aria-pressed', String(on));
      });
    }
  }
}
