const Elemental = require("./elemental_server.js");

var server = new Elemental.Server(5500, tickrate=60);
var move_speed = 5;
var shoot_speed = 0.3;
var player_radius = 50;
var bullet_bounds = 3000;
var bullet_speed = 13;
var barrier_size = 150;
var barrier_amount = 20;

var bullets = [];
var barriers = [];

for (var i = 0; i < barrier_amount; i++) {
	var posn = new Elemental.Vector(
		Elemental.Helpers.RandomInt(1, 20)*barrier_size,
		Elemental.Helpers.RandomInt(1, 6)*barrier_size
	);
	barriers.push(posn);
}

class Bullet {
	constructor(posn, velocity) {
		this.id = Elemental.Helpers.RandomString();
		this.posn = posn;
		this.velocity = velocity;
	}

	frame() {
		this.posn = Elemental.Vector.Add(this.posn, this.velocity);

		var parent = this;
		server.clients.forEach(function(client) {
			var dist = Elemental.Helpers.DistanceBetween(client.posn, parent.posn);
			if (dist < player_radius) {
				server.broadcast("kill_bullet", {id: parent.id});
				var index = bullets.indexOf(parent);
				if (index != -1) bullets.splice(index, 1);

				server.broadcast("player_hit", {
					id: client.id,
					damage: 10
				});
				client.health -= 10;
			}
		});

		barriers.forEach(function(barrier) {
			var xmin = barrier.x - 5;
			var xmax = barrier.x + barrier_size + 5;
			var ymin = barrier.y - 5;
			var ymax = barrier.y + barrier_size + 5;

			if (parent.posn.x > xmin && parent.posn.x < xmax) {
				if (parent.posn.y > ymin && parent.posn.y < ymax) {
					server.broadcast("kill_bullet", {id: parent.id});
					var index = bullets.indexOf(parent);
					if (index != -1) bullets.splice(index, 1);
				}
			}
		});

		if (this.posn.x < -bullet_bounds || this.posn.x > bullet_bounds
			|| this.posn.y < -bullet_bounds || this.posn.y > bullet_bounds) {
			server.broadcast("kill_bullet", {id: parent.id});
			var index = bullets.indexOf(parent);
			if (index != -1) bullets.splice(index, 1);
		}
	}
}

server.onConnect = function(client) {
	client.posn = Elemental.Vector.Empty;
	client.velocity = Elemental.Vector.Empty;
	client.last_shot = Elemental.Helpers.Now();
	client.health = 100;
	client.angle = 0;

	server.broadcast("player_connect", {
		id: client.id,
		posn: client.posn,
		velocity: client.velocity,
		health: client.health
	});

	server.clients.forEach(function(prev_client) {
		if (prev_client.id != client.id) {
			client.call("player_connect", {
				id: prev_client.id,
				posn: prev_client.posn,
				velocity: prev_client.velocity,
				health: prev_client.health
			});
		}
	});

	client.call("configure", {
		id: client.id,
		barriers: barriers
	});

	console.log("CONNECT", client.string());
}

server.onDisconnect = function(client) {
	server.broadcast("player_disconnect", {id: client.id});

	console.log("DISCONNECT", client.string());
}

server.gameLogic = function() {
	bullets.forEach(function(bullet) {
		bullet.frame();
	});
}

server.clientLogic = function(client) {
	var movement = Elemental.Vector.Empty;
	if (client.keyHeld(Elemental.Keycodes.W)) movement.y -= move_speed;
	if (client.keyHeld(Elemental.Keycodes.S)) movement.y += move_speed;
	if (client.keyHeld(Elemental.Keycodes.A)) movement.x -= move_speed;
	if (client.keyHeld(Elemental.Keycodes.D)) movement.x += move_speed;

	if (client.mouseHeld(Elemental.Mousecodes.LEFT) || client.keyHeld(Elemental.Keycodes.SPACE)) {
		if (Elemental.Helpers.Now() - client.last_shot > shoot_speed) {
			var step = Elemental.Helpers.StepBetween(client.posn, client.mousePos);
			var b_movement = Elemental.Vector.Multiply(step, bullet_speed, -1);
			var start = Elemental.Vector.Add(client.posn, Elemental.Vector.Multiply(step, -player_radius));

			var bullet = new Bullet(start, b_movement);
			bullets.push(bullet);

			server.broadcast("spawn_bullet", {
				id: bullet.id,
				posn: bullet.posn,
				velocity: bullet.velocity
			});
			client.last_shot = Elemental.Helpers.Now();
		}
	}

	client.angle = Elemental.Helpers.AngleBetween(client.mousePos, client.posn);

	var allowMove = true;
	var collidedWith = [];
	barriers.forEach(function(barrier) {
		x = function() {
			var distX = Math.abs(client.posn.x - barrier.x - barrier_size / 2);
		    var distY = Math.abs(client.posn.y - barrier.y - barrier_size / 2);

		    if (distX > (barrier_size / 2 + player_radius)) {
		        return false;
		    }
		    if (distY > (barrier_size / 2 + player_radius)) {
		        return false;
		    }

		    if (distX <= (barrier_size / 2)) {
		        return true;
		    }
		    if (distY <= (barrier_size / 2)) {
		        return true;
		    }

		    var dx = distX - barrier_size / 2;
		    var dy = distY - barrier_size / 2;
		    return (dx * dx + dy * dy <= (player_radius * player_radius));
		}
		if (x()) {
			allowMove = false;
			collidedWith.push(barrier);
		}
	})

	if (allowMove == false) {
		collidedWith.forEach(function(col) {
			if (client.posn.x < col.x) {
				if (movement.x > 0) {
					movement.x = 0;
				}
			}

			if (client.posn.x > col.x + barrier_size) {
				if (movement.x < 0) {
					movement.x = 0;
				}
			}

			if (client.posn.y < col.y) {
				if (movement.y > 0) {
					movement.y = 0;
				}
			}

			if (client.posn.y > col.y + barrier_size) {
				if (movement.y < 0) {
					movement.y = 0;
				}
			}
		})
	}

	client.posn = Elemental.Vector.Add(client.posn, movement);
	client.velocity = movement;

	server.broadcast("player_posn", {
		id: client.id,
		posn: client.posn,
		velocity: client.velocity,
		angle: client.angle
	});

	if (client.health < 0) {
		console.log("DIED", client.string());
		server.broadcast("player_died", {
			id: client.id
		});
	}
}

server.start();
