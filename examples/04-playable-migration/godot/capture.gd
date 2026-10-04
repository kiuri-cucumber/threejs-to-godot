extends SceneTree
## Capture frozen post-tick states. Rendering frames never advance gameplay.
func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var output := ""
	var control := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			output = arg.trim_prefix("--out=")
		if arg.begins_with("--control="):
			control = arg.trim_prefix("--control=")
	if output.is_empty():
		printerr("--out is required")
		quit(2)
		return
	DirAccess.make_dir_recursive_absolute(output)
	root.size = Vector2i(960, 540)
	root.content_scale_size = Vector2i.ZERO
	var game = load("res://main.tscn").instantiate()
	game.manual_mode = true
	root.add_child(game)
	if control == "fov-plus-5":
		game.get_node("Camera3D").fov += 5.0
	await physics_frame
	await physics_frame
	game.get_node("HUD").hide()
	var ticks: Array = [{"move": [0, 0], "restart": false}]
	for entry in game.contract.replay:
		for index in range(int(entry.ticks)):
			ticks.append({"move": entry.move, "restart": entry.get("restart", false) and index == 0})
	var shots: Array = []
	for shot in game.contract.snapshots:
		while game.tick < int(shot.tick):
			game.step(ticks[game.tick + 1])
		await process_frame
		await process_frame
		await RenderingServer.frame_post_draw
		var result := root.get_texture().get_image().save_png(output.path_join(shot.id + ".png"))
		if result != OK:
			printerr("Capture failed: ", result)
			quit(1)
			return
		shots.append({"id": shot.id, "tick": game.tick, "position": [game.player.position.x, game.player.position.z], "phase": game.phase})
		if shot.id == "goal":
			game.get_node("HUD").show()
			await process_frame
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(output.path_join("goal-ui.png"))
			game.get_node("HUD").hide()
	var camera: Camera3D = game.get_node("Camera3D")
	var rotation_q := camera.global_basis.get_rotation_quaternion()
	var camera_metadata := {"position": [camera.global_position.x, camera.global_position.y, camera.global_position.z], "quaternion": [rotation_q.x, rotation_q.y, rotation_q.z, rotation_q.w], "fov": camera.fov, "near": camera.near, "far": camera.far}
	var file := FileAccess.open(output.path_join("capture.json"), FileAccess.WRITE)
	file.store_string(JSON.stringify({"schema": 1, "contract": game.contract, "camera": camera_metadata, "size": [960, 540], "snapshots": shots, "engine": Engine.get_version_info(), "renderer": RenderingServer.get_current_rendering_method(), "adapter": RenderingServer.get_video_adapter_name(), "control": control}, "  "))
	file.close()
	print("PLAYABLE_CAPTURE_OK")
	quit(0)
