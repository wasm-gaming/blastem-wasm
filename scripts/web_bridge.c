
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

EMSCRIPTEN_KEEPALIVE void web_soft_reset(void)
{
	if (current_system && current_system->soft_reset) {
		current_system->soft_reset(current_system);
	}
}
#endif
