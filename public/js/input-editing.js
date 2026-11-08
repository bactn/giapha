// Delay expensive graph updates while typing, without losing the last draft at save.
export class PendingEdits {
  constructor(delay = 300) { this.delay = delay; this.pending = new Map(); }
  queue(key, commit, schedule = true) {
    this.cancel(key);
    const entry = { commit, timer: null };
    if (schedule) entry.timer = setTimeout(() => this.flush(key), this.delay);
    this.pending.set(key, entry);
  }
  flush(key) {
    if (key === undefined) { for (const k of [...this.pending.keys()]) this.flush(k); return; }
    const entry = this.pending.get(key); if (!entry) return;
    clearTimeout(entry.timer); this.pending.delete(key); entry.commit();
  }
  cancel(key) { const e = this.pending.get(key); if (e) clearTimeout(e.timer); this.pending.delete(key); }
  clear() { for (const key of this.pending.keys()) this.cancel(key); }
}

export function inlineRename(input, original, save, restore) {
  let finished = false;
  const finish = cancel => {
    if (finished) return;
    finished = true; input.onblur = null;
    const value = input.value.trim();
    restore();
    if (!cancel && value && value !== original) save(value);
  };
  for (const event of ['click','dblclick','mousedown','touchstart']) input.addEventListener(event, e => e.stopPropagation());
  input.onblur = () => finish(false);
  input.onkeydown = event => {
    event.stopPropagation();
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); finish(event.key === 'Escape'); }
  };
  input.focus({ preventScroll: true }); input.select();
}
