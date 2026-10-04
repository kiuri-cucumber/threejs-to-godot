extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var args := OS.get_cmdline_user_args()
	var output := ""
	var control := ""
	var scenario := ""
	for arg in args:
		if arg.begins_with("--out="):
			output = arg.trim_prefix("--out=")
		if arg.begins_with("--scenario="):
			scenario = arg.trim_prefix("--scenario=")
		if arg.begins_with("--control="):
			control = arg.trim_prefix("--control=")
	if output.is_empty():
		printerr("Usage: godot --headless --path godot --script res://replay.gd -- --out=/absolute/trace.json")
		quit(2)
		return
	var game = load("res://main.tscn").instantiate()
	game.manual_mode = true
	game.no_collision = control == "no-collision"
	game.no_restart = control == "no-restart"
	root.add_child(game)
	await physics_frame
	await physics_frame
	var frames: Array = [game.snapshot()]
	var goal_ui := false
	var entries: Array = game.contract.replay
	if not scenario.is_empty():
		var scenarios: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://edge-replays.json"))
		if not scenarios.has(scenario):
			printerr("Unknown replay scenario: ", scenario)
			quit(2)
			return
		entries = scenarios[scenario]
	for entry in entries:
		for index in range(int(entry.ticks)):
			frames.append(game.step({"move": entry.move, "restart": entry.get("restart", false) and index == 0}))
			if game.phase == "won":
				goal_ui = game.status.text == "Goal reached! Restart to play again."
	var geometry := {"wallSize": [game.get_node("Wall/Shape").shape.size.x, game.get_node("Wall/Shape").shape.size.z], "playerHalfSize": game.get_node("Player/Shape").shape.size.x / 2.0, "cameraFov": game.get_node("Camera3D").fov}
	# Exercise the actual InputMap and Button signal, not only the replay API.
	game.reset()
	game.manual_mode = false
	Input.action_press("move_right")
	game._physics_process(1.0 / 60.0)
	Input.action_release("move_right")
	var moved: bool = game.player.position.x > -3.0
	var stopped_at: Vector3 = game.player.position
	game._physics_process(1.0 / 60.0)
	var released: bool = game.player.position == stopped_at
	for _index in range(3):
		game.get_node("HUD/Panel/Rows/Restart").pressed.emit()
		game._physics_process(1.0 / 60.0)
	Input.action_press("move_right")
	game._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	var blur_released := not Input.is_action_pressed("move_right")
	var restart_ui: bool = game.player.position == Vector3(-3, 0.4, 0) and game.elapsed_ticks == 0 and game.phase == "playing" and game.status.text == "Playing · go around the wall"
	game.manual_mode = true
	var ui_checks := {"namedInputMoves": moved, "releaseStops": released, "buttonRestartsRepeatedly": restart_ui, "goalMessage": goal_ui, "focusLossReleases": blur_released}
	var result := {"schema": 1, "engine": Engine.get_version_info(), "control": control, "geometry": geometry, "frames": frames, "uiChecks": ui_checks}
	var file := FileAccess.open(output, FileAccess.WRITE)
	if file == null:
		printerr("Cannot write trace: ", output)
		quit(2)
		return
	file.store_string(JSON.stringify(result, "  "))
	file.close()
	print("PLAYABLE_TRACE_OK frames=", frames.size())
	quit(0)
