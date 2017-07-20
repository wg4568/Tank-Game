var canvas = new Elemental.Canvas("game", fullscreen=true);
var network = new Elemental.Network(IP);
var game = new Elemental.Game(canvas, network=network);

var players = {};
var bullets = {};
var barriers = [];
var barrier_size = 150;
var is_dead = false;
var death_alpha = 0;
var show_death_text = false;
var self = null;
var background_color = new Elemental.Color("#9e9fff");
var max_correction = 1;

var player_sprite = new Elemental.Sprite.Composite({
	body: new Elemental.Sprite.Ellipse(50, config={
		layer: 1,
		lineWidth: 10,
	}),
	barrel: new Elemental.Sprite.Points([
		new Elemental.Vector(0, 0),
		new Elemental.Vector(0, 50),
		new Elemental.Vector(80, 50),
		new Elemental.Vector(80, 0)
	], config={
		layer: 0,
		lineWidth: 10,
		center: {
			x: 0,
			y: 25
		}
	})
});

var bullet_sprite = new Elemental.Sprite.Ellipse(10, config={
	lineWidth: 10
});

var barrier_sprite = new Elemental.Sprite.Points([
	new Elemental.Vector(0, 0),
	new Elemental.Vector(0, barrier_size),
	new Elemental.Vector(barrier_size, barrier_size),
	new Elemental.Vector(barrier_size, 0),
], config={
	lineWidth: 10,
	fillColor: "#e936ff",
});

function calculate_correction(actual, target) {
	var dist = Math.abs(Elemental.Helpers.DistanceBetween(actual, target));
	if (dist < max_correction) {
		return Elemental.Vector.Subtract(actual, target);
	}

	var correction = Elemental.Vector.Empty;
	if (target.x > actual.x) correction.x += max_correction;
	if (target.x < actual.x) correction.x -= max_correction;
	if (target.y > actual.y) correction.y += max_correction;
	if (target.y < actual.y) correction.y -= max_correction;

	return correction;
}

class Bullet {
	constructor(id, posn, velocity) {
		this.id = id;
		this.posn = posn;
		this.velocity = velocity;
		this.color = "#ff5d5d";
	}

	frame() {
		this.posn = Elemental.Vector.Add(this.posn, this.velocity);
	}

	draw() {
		bullet_sprite.fillColor = this.color;
		canvas.drawSprite(bullet_sprite, this.posn);
	}
}

class Player {
	constructor(id, posn, velocity) {
		this.id = id;
		this.posn = posn;
		this.health = 100;
		this.server_posn = posn;
		this.velocity = velocity;
		this.rotation = 0;
		this.body_color = new Elemental.Color(255, 0, 0);
		this.barrel_color = new Elemental.Color("#4eaaff");
		this.self_barrel_color = new Elemental.Color("#2ed9ff");
	}

	frame() {

		this.posn = Elemental.Vector.Add(this.posn, this.velocity);

		var correction = calculate_correction(this.posn, this.server_posn);
		this.posn = Elemental.Vector.Add(this.posn, correction);

		this.collided = false;
	}

	draw() {
		this.body_color.hue = this.health;
		player_sprite.rotation = this.rotation;
		player_sprite.shapes.body.fillColor = this.body_color;
		if (this.id == self.id) {
			player_sprite.shapes.barrel.fillColor = this.self_barrel_color;
		} else {
			player_sprite.shapes.barrel.fillColor = this.barrel_color;
		}
		canvas.drawSprite(player_sprite, this.posn);
	}

	restart() {}
}

var fade_to_black = new Elemental.Spinoff(60, unique=true);
fade_to_black.onFrame(function() {
	death_alpha += 0.006;
});
fade_to_black.onEnd(function() {
	show_death_text = true;
});

network.event("configure", function(data) {
	self = players[data.id];
	barriers = data.barriers;

	console.log("CONNECTED TO SERVER");
	console.log("ID:", data.id);
});

network.event("player_connect", function(data) {
	var player = new Player(data.id, data.posn, data.velocity);
	player.health = data.health;
	players[player.id] = player;
});

network.event("player_disconnect", function(data) {
	if (data.id in players) {
		delete players[data.id];
	}
});

network.event("player_hit", function(data) {
	players[data.id].health -= data.damage;
})

network.event("player_posn", function(data) {
	players[data.id].server_posn = data.posn;
	players[data.id].velocity = data.velocity;
	players[data.id].rotation = data.angle;
});

network.event("player_died", function(data) {
	if (data.id == self.id) {
		network.socket.close();
		game.runSpinoff(fade_to_black);
		is_dead = true;
	} else {
		if (data.id in players) {
			delete players[data.id];
		}
	}
});

network.event("spawn_bullet", function(data) {
	var bullet = new Bullet(data.id, data.posn, data.velocity);
	bullets[bullet.id] = bullet;
});

network.event("kill_bullet", function(data) {
	if (data.id in bullets) {
		delete bullets[data.id];
	}
});

game.start(function() {
	canvas.drawFill(background_color);

	barriers.forEach(function(barrier) {
		canvas.drawSprite(barrier_sprite, barrier);
	})

	for (var property in bullets) {
		if (bullets.hasOwnProperty(property)) {
			var bullet = bullets[property];
			if (!is_dead) bullet.frame();
			bullet.draw();
		}
	}

	for (var property in players) {
		if (players.hasOwnProperty(property)) {
			var player = players[property];
			if (!is_dead) player.frame();
			player.draw();
		}
	}

	if (is_dead) {
		canvas.setContextProperty("globalAlpha", death_alpha);
		canvas.drawFill("black")
		canvas.setContextProperty("globalAlpha", 1);

		if (show_death_text) {
			canvas.drawText(
				"30px Arial", "You died!",
				Elemental.Vector.Add(canvas.center, new Elemental.Vector(-30, -10)),
				color="white"
			);
			canvas.drawText(
				"30px Arial", "Refresh to play again",
				Elemental.Vector.Add(canvas.center, new Elemental.Vector(-60, 15)),
				color="white"
			);
		}
	}
});
