// Import websockets
const WebSocket = require("ws");

// Elemental container for everything
var Elemental = {};

// Client class for representing a client connection
Elemental.Client = class {
	constructor(server, socket) {
		this.server = server;
		this.socket = socket;

		this.id = Elemental.Helpers.RandomString();

		this.keyboardState = {pressed: {}, held: {}, released: {}};
		this.mouseState = {pressed: {}, held: {}, released: {}};
		this.mousePos = Elemental.Vector.Empty;

		var parent = this;
		this.socket.on("close", function(){
			parent.server.disconnect(parent);
		});
		this.socket.on("message", function(message) {
			parent.message(message);
		});
	}

	sendJson(obj) {
		if (this.socket.readyState == 1) {
			this.socket.send(JSON.stringify(obj));
		}
	}

	call(name, data) {
		this.sendJson({
			"event": "trigger",
			"trigger": name,
			"data": data
		});
	}

	string() {
		return `Client(${this.id})`;
	}

	keyPressed(keycode) {
		var value = this.keyboardState.pressed[keycode];
		if (value == 1) return true;
		else return false;
	}
	keyHeld(keycode) {
		var value = this.keyboardState.held[keycode];
		if (value == 1) return true;
		else return false;
	}
	keyReleased(keycode) {
		var value = this.keyboardState.released[keycode];
		if (value == 1) return true;
		else return false;
	}

	mousePressed(button) {
		var value = this.mouseState.pressed[button];
		if (value == 1) return true;
		else return false;
	}
	mouseHeld(button) {
		var value = this.mouseState.held[button];
		if (value == 1) return true;
		else return false;
	}
	mouseReleased(button) {
		var value = this.mouseState.released[button];
		if (value == 1) return true;
		else return false;
	}

	message(raw) {
		// todo, add error handling so the server doesn't just crash when someone sends bad data
		var message = JSON.parse(raw);

		if (message.event == "trigger") {
			var trig = message.trigger;
			this.server.callTrigger(trig, message.data);
		}

		if (message.event == "keyPressed") {
			if (!this.keyHeld(message.key)) {
				this.keyboardState.pressed[message.key] = 1;
			}
			this.keyboardState.held[message.key] = 1;
		}
		if (message.event == "keyReleased") {
			this.keyboardState.released[message.key] = 1;
			this.keyboardState.held[message.key] = 0;
		}
		if (message.event == "mousePressed") {
			if (!this.mouseHeld(message.button)) {
				this.mouseState.pressed[message.button] = 1;
			}
			this.mouseState.held[message.button] = 1;
		}
		if (message.event == "mouseReleased") {
			this.mouseState.released[message.button] = 1;
			this.mouseState.held[message.button] = 0;
		}
		if (message.event == "mouseMoved") {
			this.mousePos = new Elemental.Vector(message.position.x, message.position.y);
		}
	}
}

// Server object, for handling connections
Elemental.Server = class {
	constructor(port, tickrate=60) {
		this.port = port;
		this.tickrate = tickrate;
		this.server = new WebSocket.Server({port: port});

		this.events = {};
		this.clients = [];
	}

	// User defined functions
	onConnect(client) {}
	gameLogic(server) {}
	clientLogic(server) {}
	onDisconnect(client) {}

	event(name, func) {
		this.events[name] = func;
	}

	callTrigger(trig, data) {
		if (trig in this.events) {
			this.events[trig](data);
		}
	}

	broadcast(name, data) {
		this.clients.forEach(function(client) {
			client.call(name, data);
		});
	}

	serverTick() {
		this.gameLogic(this);

		var parent = this;
		this.clients.forEach(function(client) {
			parent.clientLogic(client);
			client.keyboardState.pressed = {};
			client.keyboardState.released = {};

			client.mouseState.pressed = {};
			client.mouseState.released = {};
		})
	}

	connect(client) {
		this.clients.push(client);
		this.onConnect(client);
	}

	disconnect(client) {
		this.onDisconnect(client);
		var index = this.clients.indexOf(client);
		if (index != -1) this.clients.splice(index, 1);
	}

	start() {
		var parent = this;
		this.server.on("connection", function(socket) {
			var client = new Elemental.Client(parent, socket);
			parent.connect(client);
		});

		setInterval(function() {
			parent.serverTick();
		}, 1000/this.tickrate);
	}
}

exports.Server = Elemental.Server;

// Helper object filled with helper functions and classes
Elemental.Helpers = {}

Elemental.Helpers.ToRadians = function(degrees) {
	return degrees * Math.PI / 180;
}

Elemental.Helpers.ToDegrees = function(radians) {
	return radians * 180 / Math.PI;
}

Elemental.Helpers.AngleBetween = function(point1, point2) {
	var rads = Math.atan2(point1.x-point2.x, point1.y-point2.y);
	return -Elemental.Helpers.ToDegrees(rads)+90;
}

Elemental.Helpers.DistanceBetween = function(point1, point2) {
	return Math.sqrt(Math.pow(point1.x-point2.x, 2) + Math.pow(point1.y-point2.y, 2));
}

Elemental.Helpers.StepBetween = function(point1, point2) {
	var hype = Elemental.Helpers.DistanceBetween(point1, point2);
	var dx = (point1.x-point2.x)/hype;
	var dy = (point1.y-point2.y)/hype;
	return new Elemental.Vector(dx, dy);
}

Elemental.Helpers.RandomInt = function(min, max) {
	return Math.floor(Math.random() * (max - min) + min);
}

Elemental.Helpers.RandomColor = function() {
	var r = Elemental.Helpers.RandomInt(0, 255);
	var g = Elemental.Helpers.RandomInt(0, 255);
	var b = Elemental.Helpers.RandomInt(0, 255);
	return new Elemental.Color(r, g, b);
}

Elemental.Helpers.LoadImage = function(url) {
	var img = new Image();
    img.src = url;
	return img;
}

Elemental.Helpers.Now = function() {
	return new Date().getTime() / 1000;
}

Elemental.Helpers.Constrict = function(val, min, max) {
	if (val < min) { return min; }
	if (val > max) { return max; }
	else { return val; }
}

Elemental.Helpers.PadZeros = function(number, length) {
	var str = '' + number;
	while (str.length < length) {
		str = '0' + str;
	}
	return str;
}

Elemental.Helpers.RandomString = function() {
	var s1 = Math.random().toString(36).substring(2, 15);
	var s2 = Math.random().toString(36).substring(2, 15);
	return s1 + s2
}

exports.Helpers = Elemental.Helpers;

// Vector class and function definitions
Elemental.Vector = class {
	constructor(x, y) {
		this.x = x;
		this.y = y;
	}

	static get Empty() {
		return {x: 0, y: 0};
	}

	static IsVector(vector) {
		return vector.hasOwnProperty("x") && vector.hasOwnProperty("y");
	}

	static Inverse(vector) {
		return Elemental.Vector.Multiply(vector, -1);
	}

	static Add() {
		var total = new Elemental.Vector(0, 0);
		for (var i = 0; i < arguments.length; i++ ) {
			if (Elemental.Vector.IsVector(arguments[i])) {
				total.x += arguments[i].x;
				total.y += arguments[i].y;
			} else {
				total.x += arguments[i];
				total.y += arguments[i];
			}
		}
		return total;
	}

	static Subtract() {
		var total = new Elemental.Vector(arguments[0].x, arguments[0].y);
		for (var i = 1; i < arguments.length; i++ ) {
			if (Elemental.Vector.IsVector(arguments[i])) {
				total.x -= arguments[i].x;
				total.y -= arguments[i].y;
			} else {
				total.x -= arguments[i];
				total.y -= arguments[i];
			}
		}
		return total;
	}

	static Multiply() {
		var total = new Elemental.Vector(1, 1);
		for (var i = 0; i < arguments.length; i++ ) {
			if (Elemental.Vector.IsVector(arguments[i])) {
				total.x *= arguments[i].x;
				total.y *= arguments[i].y;
			} else {
				total.x *= arguments[i];
				total.y *= arguments[i];
			}
		}
		return total;
	}

	static Divide() {
		var total = new Elemental.Vector(arguments[0].x, arguments[0].y);
		for (var i = 1; i < arguments.length; i++ ) {
			if (Elemental.Vector.IsVector(arguments[i])) {
				total.x /= arguments[i].x;
				total.y /= arguments[i].y;
			} else {
				total.x /= arguments[i];
				total.y /= arguments[i];
			}
		}
		return total;
	}
}

exports.Vector = Elemental.Vector;
// Color class to represent color
Elemental.Color = class {
	constructor() {
		this._red = 0;
		this._green = 0;
		this._blue = 0;

		if (arguments.length == 1) {
			var color = Elemental.Color.ParseHEX(arguments[0]);
			this.red = color[0];
			this.green = color[1];
			this.blue = color[2];
		} else {
			this.red = arguments[0];
			this.green = arguments[1];
			this.blue = arguments[2];
		}
	}

	get red() { return this._red; }
	get green() { return this._green; }
	get blue() { return this._blue; }

	get hue() { return this.hsv[0]; }
	get saturation() { return this.hsv[1]; }
	get value() { return this.hsv[2]; }

	get hsv() { return Elemental.Color.RGBtoHSV(this.rgb); }
	get rgb() { return [this.red, this.green, this.blue]; }

	set red(val) { this._red = Math.floor(Elemental.Helpers.Constrict(val, 0, 255)); }
	set green(val) { this._green = Math.floor(Elemental.Helpers.Constrict(val, 0, 255)); }
	set blue(val) { this._blue = Math.floor(Elemental.Helpers.Constrict(val, 0, 255)); }

	set hue(val) { this.hsv = [Elemental.Helpers.Constrict(val, 0, 255), this.hsv[1], this.hsv[2]]; }
	set saturation(val) { this.hsv = [this.hsv[0], Elemental.Helpers.Constrict(val, 0, 255), this.hsv[2]]; }
	set value(val) { this.hsv = [this.hsv[0], this.hsv[1], Elemental.Helpers.Constrict(val, 0, 255)]; }

	set hsv(val) { this.rgb = Elemental.Color.HSVtoRGB(val); }
	set rgb(val) { this.red = val[0]; this.green = val[1]; this.blue = val[2]; }

	formatRGB() {
		return `rgb(${this.red}, ${this.green}, ${this.blue})`
	}

	formatHEX() {
		var red = Elemental.Helpers.PadZeros(this.red.toString(16), 2);
		var green = Elemental.Helpers.PadZeros(this.green.toString(16), 2);
		var blue = Elemental.Helpers.PadZeros(this.blue.toString(16), 2);

		return `#${red}${green}${blue}`;
	}

	static RGBtoHSV(color) {
		var r = color[0];
		var g = color[1];
		var b = color[2];
	    var max = Math.max(r, g, b), min = Math.min(r, g, b),
	        d = max - min,
	        h,
	        s = (max === 0 ? 0 : d / max),
	        v = max / 255;

	    switch (max) {
	        case min: h = 0; break;
	        case r: h = (g - b) + d * (g < b ? 6: 0); h /= 6 * d; break;
	        case g: h = (b - r) + d * 2; h /= 6 * d; break;
	        case b: h = (r - g) + d * 4; h /= 6 * d; break;
	    }

	    return [h*255, s*255, v*255];
	}

	static HSVtoRGB(color) {
		var h = color[0] / 255;
		var s = color[1] / 255;
		var v = color[2] / 255;
	    var r, g, b, i, f, p, q, t;
	    i = Math.floor(h * 6);
	    f = h * 6 - i;
	    p = v * (1 - s);
	    q = v * (1 - f * s);
	    t = v * (1 - (1 - f) * s);
	    switch (i % 6) {
	        case 0: r = v, g = t, b = p; break;
	        case 1: r = q, g = v, b = p; break;
	        case 2: r = p, g = v, b = t; break;
	        case 3: r = p, g = q, b = v; break;
	        case 4: r = t, g = p, b = v; break;
	        case 5: r = v, g = p, b = q; break;
	    }
	    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
	}

	static ParseRGB(string) {
		var array = string.substring(4, string.length-1).replace(/ /g, '').split(',');
		array = array.map(function(x) { return parseInt(x) });
		var red = array[0];
		var green = array[1];
		var blue = array[2];
		return [red, green, blue];
	}

	static ParseHEX(hex) {
		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		var red = parseInt(result[1], 16);
		var green = parseInt(result[2], 16);
		var blue = parseInt(result[3], 16);
		return [red, green, blue];
	}

	static IsColor(color) {
		return color instanceof Elemental.Color;
	}
}

exports.Color = Elemental.Color;
// Mouse and keycode definitions
Elemental.Keycodes = {
	BACKSPACE: 8,
	TAB: 9,
	ENTER: 13,
	SHIFT: 16,
	CTRL: 17,
	ALT: 18,
	BREAK: 19,
	CAPSLOCK: 20,
	ESCAPE: 27,
	SPACE: 32,
	PGUP: 33,
	PGDOWN: 34,
	END: 35,
	HOME: 36,
	LEFT: 37,
	UP: 38,
	RIGHT: 39,
	DOWN: 40,
	INSERT: 45,
	DELETE: 46,
	N0: 48,
	N1: 49,
	N2: 50,
	N3: 51,
	N4: 52,
	N5: 53,
	N6: 54,
	N7: 55,
	N8: 56,
	N9: 57,
	A: 65,
	B: 66,
	C: 67,
	D: 68,
	E: 69,
	F: 70,
	G: 71,
	H: 72,
	I: 73,
	J: 74,
	K: 75,
	L: 76,
	M: 77,
	N: 78,
	O: 79,
	P: 80,
	Q: 81,
	R: 82,
	S: 83,
	T: 84,
	U: 85,
	V: 86,
	W: 87,
	X: 88,
	Y: 89,
	Z: 90,
	LWIN: 91,
	RWIN: 92,
	SELECT: 93,
	NUM0: 96,
	NUM1: 97,
	NUM2: 98,
	NUM3: 99,
	NUM4: 100,
	NUM5: 101,
	NUM6: 102,
	NUM7: 103,
	NUM8: 104,
	NUM9: 105,
	MULTIPLY: 106,
	ADD: 107,
	SUBTRACT: 109,
	PERIOD: 110,
	DIVIDE: 111,
	F1: 112,
	F2: 113,
	F3: 114,
	F4: 115,
	F5: 116,
	F6: 117,
	F7: 118,
	F8: 119,
	F9: 120,
	F10: 121,
	F11: 122,
	F12: 123,
	NUMLOCK: 144,
	SCROLLLOCK: 145,
	SEMICOLON: 186,
	EQUAL: 187,
	COMMA: 188,
	DASH: 189,
	PERIOD: 190,
	FSLASH: 191,
	GRAVE: 192,
	OBRACKET: 219,
	BSLASH: 220,
	CBRACKET: 221,
	QUOTE: 222
}

Elemental.Mousecodes = {
	LEFT: 0,
	MIDDLE: 1,
	RIGHT: 2
}

exports.Keycodes = Elemental.Keycodes;
exports.Mousecodes = Elemental.Mousecodes;
