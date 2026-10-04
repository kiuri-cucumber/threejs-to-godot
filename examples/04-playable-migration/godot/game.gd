extends Node3D
## A hand-ported controller, not a JS converter. Geometry and UI remain editable.
@export var manual_mode := false
@export var no_collision := false
@export var no_restart := false
var contract: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://contract.json"))
var tick := 0
var elapsed_ticks := 0
var phase := "playing"
var contact := false
var restart_pending := false
@onready var player: CharacterBody3D = $Player
@onready var status: Label = $HUD/Panel/Rows/Status

func _ready() -> void:
	# Create named actions at runtime; no physical key codes hidden in movement logic.
	var bindings := {"move_left": [KEY_A, KEY_LEFT], "move_right": [KEY_D, KEY_RIGHT], "move_up": [KEY_W, KEY_UP], "move_down": [KEY_S, KEY_DOWN], "restart": [KEY_R]}
	for action in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for key in bindings[action]:
			var event := InputEventKey.new()
			event.physical_keycode = key
			if not InputMap.action_has_event(action, event):
				InputMap.action_add_event(action, event)
	$HUD/Panel/Rows/Restart.pressed.connect(func(): restart_pending = true)
	$Camera3D.look_at(Vector3.ZERO)
	reset()

func reset() -> void:
	player.position = Vector3(contract.spawn[0], 0.4, contract.spawn[1])
	player.velocity = Vector3.ZERO
	phase = "playing"
	elapsed_ticks = 0
	contact = false
	restart_pending = false
	update_ui()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT:
		for action in ["move_left", "move_right", "move_up", "move_down", "restart"]:
			if InputMap.has_action(action):
				Input.action_release(action)
		restart_pending = false

func _physics_process(_delta: float) -> void:
	if manual_mode:
		return
	var movement := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	step({"move": [movement.x, movement.y], "restart": restart_pending or Input.is_action_just_pressed("restart")})
	restart_pending = false

func step(action: Dictionary) -> Dictionary:
	tick += 1
	if action.get("restart", false) and not no_restart:
		reset()
		return snapshot(["restart"])
	if phase == "won":
		return snapshot()
	elapsed_ticks += 1
	var events: Array = []
	var movement := Vector2(action.move[0], action.move[1]).limit_length(1.0)
	var displacement: Vector2 = movement * float(contract.speed) / float(contract.tickHz)
	var touching := false
	# The source clips X then Z; use native collision queries in the same order.
	# Explicit 1 mm query recovery margin; compare observed positions with the
	# declared 0.2 mm tolerance rather than assuming bit-identical physics.
	player.collision_mask = 0 if no_collision else 1
	for delta in [Vector3(displacement.x, 0, 0), Vector3(0, 0, displacement.y)]:
		if delta.length_squared() > 0:
			var collision := player.move_and_collide(delta, false, 0.001)
			if collision != null:
				touching = true
	if touching and not contact:
		events.append("wall-contact")
	contact = touching
	if abs(player.position.x - float(contract.goal.center[0])) <= float(contract.goal.halfSize) + 0.00001 and abs(player.position.z - float(contract.goal.center[1])) <= float(contract.goal.halfSize) + 0.00001:
		phase = "won"
		events.append("goal")
	update_ui()
	return snapshot(events)

func snapshot(events: Array = []) -> Dictionary:
	return {"tick": tick, "position": [player.position.x, player.position.z], "phase": phase, "elapsedTicks": elapsed_ticks, "contact": contact, "events": events}

func update_ui() -> void:
	status.text = "Goal reached! Restart to play again." if phase == "won" else "Playing · go around the wall"
