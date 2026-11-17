/* SPDX-License-Identifier: GPL-3.0-or-later — compiled into BlastEm (see LICENSE). */

/* ---- wasm-gaming web bridge (appended to render_sdl.c by scripts/build-blastem.sh) ----
 *
 * Applies the video settings web_set_config() wrote, with the game running. Upstream
 * reads the overscan only in render_init(); this reads it again (same code), then
 * render_config_updated() rebuilds the GL program (shader, scanlines, scaling).
 */
#ifdef __EMSCRIPTEN__
EMSCRIPTEN_KEEPALIVE void web_apply_video(void)
{
	tern_node *video = tern_find_node(config, "video");
	if (video) {
		for (int i = 0; i < NUM_VID_STD; i++)
		{
			tern_node *std_settings = tern_find_node(video, vid_std_names[i]);
			if (!std_settings) {
				continue;
			}
			char *val = tern_find_path_default(std_settings, "overscan\0top\0", (tern_val){.ptrval = NULL}, TVAL_PTR).ptrval;
			if (val) {
				overscan_top[i] = atoi(val);
			}
			val = tern_find_path_default(std_settings, "overscan\0bottom\0", (tern_val){.ptrval = NULL}, TVAL_PTR).ptrval;
			if (val) {
				overscan_bot[i] = atoi(val);
			}
			val = tern_find_path_default(std_settings, "overscan\0left\0", (tern_val){.ptrval = NULL}, TVAL_PTR).ptrval;
			if (val) {
				overscan_left[i] = atoi(val);
			}
			val = tern_find_path_default(std_settings, "overscan\0right\0", (tern_val){.ptrval = NULL}, TVAL_PTR).ptrval;
			if (val) {
				overscan_right[i] = atoi(val);
			}
		}
	}
	render_config_updated();
}
#endif
