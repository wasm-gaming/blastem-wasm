/**
 * Remapping the Mega Drive pad, in front of BlastEm.
 *
 * BlastEm binds its controls in its own config (`bindings.keys`, `bindings.pads`), compiled
 * into the build, and reads both through Emscripten's SDL2: key events on the page, and
 * `navigator.getGamepads()`. So a player's bindings are applied before SDL sees anything:
 *
 * - **Keys**: a physical key bound to a control is swallowed and replayed as the key BlastEm
 *   binds that control to by default; a default key no control has any more is swallowed.
 * - **Pads**: `navigator.getGamepads()` is wrapped while the game runs, and each pad's buttons
 *   are reordered so that the button a player chose sits where BlastEm's default looks for it.
 *
 * Only player 1's keys are remapped (player 2 has no keys in BlastEm's default config); the
 * button table applies to every pad.
 */

/** A control a player can rebind: its default key (`KeyboardEvent.code` / `.key`) and pad button. */
export interface BlastemControlSpec {
  id: string;
  label: string;
  code: string;
  key: string;
  /** Its button by default (standard mapping), as BlastEm's `pads.default` binds it. */
  button: number;
}

/** BlastEm's default bindings (its `default.cfg`), player 1. */
export const BLASTEM_CONTROLS: readonly BlastemControlSpec[] = Object.freeze([
  { id: 'a', label: 'A', code: 'KeyA', key: 'a', button: 0 },
  { id: 'b', label: 'B', code: 'KeyS', key: 's', button: 1 },
  { id: 'c', label: 'C', code: 'KeyD', key: 'd', button: 5 },
  { id: 'x', label: 'X', code: 'KeyQ', key: 'q', button: 2 },
  { id: 'y', label: 'Y', code: 'KeyW', key: 'w', button: 3 },
  { id: 'z', label: 'Z', code: 'KeyE', key: 'e', button: 4 },
  { id: 'mode', label: 'Mode', code: 'KeyF', key: 'f', button: 8 },
  { id: 'start', label: 'Start', code: 'Enter', key: 'Enter', button: 9 },
  { id: 'up', label: 'Up', code: 'ArrowUp', key: 'ArrowUp', button: 12 },
  { id: 'down', label: 'Down', code: 'ArrowDown', key: 'ArrowDown', button: 13 },
  { id: 'left', label: 'Left', code: 'ArrowLeft', key: 'ArrowLeft', button: 14 },
  { id: 'right', label: 'Right', code: 'ArrowRight', key: 'ArrowRight', button: 15 },
]);

/** The player's bindings, by control id: physical keys and pad buttons. */
export interface BlastemControls {
  keys?: Record<string, string>;
  buttons?: Record<string, number>;
}

export interface BlastemControlTables {
  /** Physical key → the control's default key, for the keys that moved. */
  keys: Map<string, BlastemControlSpec>;
  /** Default keys no control has any more. */
  blocked: Set<string>;
  /** Default button → the button the player chose for that control, where they differ. */
  pad: Map<number, number>;
}

export function controlTables(controls: BlastemControls = {}): BlastemControlTables {
  const keys = new Map<string, BlastemControlSpec>();
  const bound = new Set<string>();
  const pad = new Map<number, number>();
  for (const control of BLASTEM_CONTROLS) {
    const physical = controls.keys?.[control.id] ?? control.code;
    bound.add(physical);
    if (physical !== control.code) keys.set(physical, control);
    const button = controls.buttons?.[control.id] ?? control.button;
    if (button !== control.button) pad.set(control.button, button);
  }
  const blocked = new Set(BLASTEM_CONTROLS.map((control) => control.code).filter((code) => !bound.has(code)));
  return { keys, blocked, pad };
}

type PadLike = {
  readonly id: string;
  readonly index: number;
  readonly connected: boolean;
  readonly mapping: string;
  readonly timestamp: number;
  readonly axes: readonly number[];
  readonly buttons: ReadonlyArray<{ pressed: boolean; touched?: boolean; value: number }>;
};

/** A pad with its buttons reordered by `pad` (default button → chosen button). */
export function remapPad<T extends PadLike>(source: T, table: ReadonlyMap<number, number>): PadLike {
  if (table.size === 0) return source;
  const buttons = [...source.buttons];
  for (const [target, from] of table) {
    const button = source.buttons[from];
    buttons[target] = button ? { pressed: button.pressed, touched: button.touched ?? button.pressed, value: button.value } : { pressed: false, touched: false, value: 0 };
  }
  // A button taken for a control does only that: where it was not itself a control's
  // default slot, what the engine would read there by default is released.
  const targets = new Set(table.keys());
  for (const from of table.values()) {
    if (!targets.has(from)) buttons[from] = { pressed: false, touched: false, value: 0 };
  }
  return {
    id: source.id,
    index: source.index,
    connected: source.connected,
    mapping: source.mapping,
    timestamp: source.timestamp,
    axes: source.axes,
    buttons,
  };
}

/** `KeyboardEvent.keyCode` of the default keys, which SDL's Emscripten port also reads. */
const KEY_CODES: Readonly<Record<string, number>> = {
  Enter: 13,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
};
export const keyCodeOf = (control: BlastemControlSpec): number =>
  KEY_CODES[control.code] ?? control.key.toUpperCase().charCodeAt(0);
