/* SPDX-License-Identifier: GPL-3.0-or-later — compiled into BlastEm (see LICENSE). */

/* ---- wasm-gaming web bridge (appended to blastem.c by scripts/build-blastem.sh) ----
 *
 * Upstream persists cartridge saves only from persist_save(), registered with
 * atexit() — and a web page never exits, so SRAM never left memory. The SDK calls
 * web_persist_save() instead (on a timer, on pause, on page hide, on destroy) and
 * mirrors the save folder to OPFS.
 */
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE void web_persist_save(void)
{
	persist_save();
}

/*
 * Save states, slots 0-9 (upstream's numbered slots). Saving only asks: the core
 * writes <save_dir>/slot_N.state at its next sync point, so the main loop has to run
 * for the file to appear — the SDK resumes it for a few frames when paused. Loading
 * may be deferred the same way (delayed_load_slot) and applies on the next frame.
 */
EMSCRIPTEN_KEEPALIVE int web_save_state(int slot)
{
	if (!current_system || slot < 0 || slot > 9) {
		return 0;
	}
	current_system->save_state = slot + 1;
	return 1;
}

EMSCRIPTEN_KEEPALIVE int web_load_state(int slot)
{
	if (!current_system || !current_system->load_state || slot < 0 || slot > 9) {
		return 0;
	}
	return current_system->load_state(current_system, slot);
}

EMSCRIPTEN_KEEPALIVE void web_soft_reset(void)
{
	if (current_system && current_system->soft_reset) {
		current_system->soft_reset(current_system);
	}
}
#endif
