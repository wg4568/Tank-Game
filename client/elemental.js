var Elemental = {};

// Canvas class, handles lowest level draw operations
Elemental.Canvas = class {
	constructor(id, fullscreen=false) {
		this.canvas = document.getElementById(id);
		this.context = this.canvas.getContext("2d");
		this.fullscreen = fullscreen;

		this.mousePos = Elemental.Vector.Empty;

		this.canvas.addEventListener("contextmenu", event => event.preventDefault());

		if (this.fullscreen) {
			this.fillWindow();
			document.body.style.margin = 0;
			var parent = this;
			window.addEventListener("resize", function(event){
				parent.fillWindow();
			});
		}
	}

	fillWindow() {
		this.width = window.innerWidth;
		this.height = window.innerHeight;
	}

	// Getters and setters
	get width() { return this.canvas.width; }
	set width(val) { this.canvas.width = val; }

	get height() { return this.canvas.height; }
	set height(val) { this.canvas.height = val; }

	get center() { return new Elemental.Vector(this.width/2, this.height/2); }

	setContextProperty(prop, value) {
		if (Elemental.Color.IsColor(value)) { value = value.formatHEX(); }

		this.context[prop] = value;
	}

	// Draw functions
	drawFill(color) {
		this.drawRect(color, Elemental.Vector.Empty, this.width, this.height);
	}

	drawLine(p1, p2, color="black", width=1, caps="round") {
		this.setContextProperty("strokeStyle", color);
		this.setContextProperty("lineWidth", width);
		this.setContextProperty("lineCap", caps);

		this.context.beginPath();
		this.context.moveTo(p1.x, p1.y);
		this.context.lineTo(p2.x, p2.y);
		this.context.stroke();
	}

	drawText(font, text, posn, color="black") {
		this.setContextProperty("fillStyle", color);
		this.setContextProperty("font", font);
		this.context.fillText(text, posn.x, posn.y);
	}

	drawRect(color, posn, w, h) {
		this.setContextProperty("fillStyle", color);
		this.context.fillRect(posn.x, posn.y, w, h);
	}

	drawImage(image, posn, scale=1) {
		this.context.drawImage(image, posn.x, posn.y, image.width*scale, image.height*scale);
	}

	drawSprite(sprite, posn) {
		sprite.drawOnCanvas(this, posn);
	}
}

// Game class, handles timing, user input, etc
Elemental.Game = class {
	constructor(canvas, network=null) {
		this.canvas = canvas
		this.network = network;

		this.keyboardState = {pressed: {}, held: {}, released: {}};
		this.mouseState = {pressed: {}, held: {}, released: {}};

		this.spinoffs = [];

		this.mousePos = Elemental.Vector.Empty;
	}

	serverCallCustom(name, data) {
		var is_allowed = [
			"constructor", "addLogic", "serverCallCustom",
			"keyPressed", "keyHeld", "keyReleased",
			"mousePressed", "mouseHeld", "mouseReleased",
			"keyPressedEvent", "keyReleasedEvent",
			"mousePressedEvent", "mouseReleasedEvent",
			"start"
		].indexOf(name) == -1;
		if (is_allowed) this[name](data);
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

	keyPressedEvent(keycode) {
		if (!this.keyHeld(keycode)) {
			this.keyboardState.pressed[keycode] = 1;
		}
		this.keyboardState.held[keycode] = 1;

		if (this.network) this.network.keyPressedEvent(keycode);
	}
	keyReleasedEvent(keycode) {
		this.keyboardState.released[keycode] = 1;
		this.keyboardState.held[keycode] = 0;

		if (this.network) this.network.keyReleasedEvent(keycode);
	}

	mousePressedEvent(button) {
		if (!this.mouseHeld(button)) {
			this.mouseState.pressed[button] = 1;
		}
		this.mouseState.held[button] = 1;

		if (this.network) this.network.mousePressedEvent(button);
	}
	mouseReleasedEvent(button) {
		this.mouseState.released[button] = 1;
		this.mouseState.held[button] = 0;

		if (this.network) this.network.mouseReleasedEvent(button);
	}

	mouseMoveEvent(event) {
		this.mousePos = new Elemental.Vector(event.offsetX, event.offsetY);

		if (this.network) this.network.mouseMoveEvent(this.mousePos);
	}

	runSpinoff(so) {
		so.parent = this;
		so.start();
	}

	start(func) {
		var parent = this;

		this.canvas.canvas.addEventListener("mousemove", function(event) {
			parent.mouseMoveEvent(event);
		});

		document.addEventListener("keydown", function(event){
			parent.keyPressedEvent(event.keyCode);
		});
		document.addEventListener("keyup", function(event){
			parent.keyReleasedEvent(event.keyCode);
		});

		document.addEventListener("mousedown", function(event){
			parent.mousePressedEvent(event.button);
		});
		document.addEventListener("mouseup", function(event){
			parent.mouseReleasedEvent(event.button);
		});

		Elemental.Timer.Start(function(time){

			func(parent, time);

			parent.spinoffs.forEach(function(so){
				so.doFrame();
			});

			parent.keyboardState.pressed = {};
			parent.keyboardState.released = {};

			parent.mouseState.pressed = {};
			parent.mouseState.released = {};

		});
	}

	stop() {
		Elemental.Timer.Stop();
	}
}

// Network class, connects to a websocket server, and forwards inputs
Elemental.Network = class {
	constructor(address) {
		this.address = address;
		this.socket = new WebSocket(address);

		this.events = {};

		var parent = this;
		this.socket.onclose = function() {
			parent.onClose();
		}
		this.socket.onmessage = function(event) {
			parent.onMessage(event);
		}
	}

	onClose() {}

	onMessage(msgEvent) {
		var message = JSON.parse(msgEvent.data);
		if (message["event"] == "trigger") {
			var trig = message["trigger"];
			this.events[trig](message["data"]);
		}
	}

	event(name, func) {
		this.events[name] = func;
	}

	call(name, data) {
		this.sendJson({
			"event": "trigger",
			"trigger": name,
			"data": data
		});
	}

	sendJson(data) {
		if (this.socket.readyState == 1) {
			this.socket.send(JSON.stringify(data));
		}
	}

	keyPressedEvent(keycode) {
		this.sendJson({
			"event": "keyPressed",
			"key": keycode
		});
	}
	keyReleasedEvent(keycode) {
		this.sendJson({
			"event": "keyReleased",
			"key": keycode
		});
	}
	mousePressedEvent(button) {
		this.sendJson({
			"event": "mousePressed",
			"button": button
		});
	}
	mouseReleasedEvent(button) {
		this.sendJson({
			"event": "mouseReleased",
			"button": button
		});
	}
	mouseMoveEvent(posn) {
		this.sendJson({
			"event": "mouseMoved",
			"position": {
				"x": posn.x,
				"y": posn.y
			}
		});
	}
}

// Sprite class, and all extension classes
Elemental.Sprite = class {
	constructor() {
		this.layer = 0;
		this.scale = 1;
		this.center = Elemental.Vector.Empty;
		this.rotation = 0;
		this.alpha = 1;
	}

	drawOnCanvas(canvas, posn) {
		canvas.context.translate(posn.x, posn.y);
		canvas.context.rotate(Elemental.Helpers.ToRadians(this.rotation));
		canvas.context.translate(-this.center.x, -this.center.y);
		canvas.setContextProperty("globalAlpha", this.alpha);

		this.draw(canvas);

		canvas.setContextProperty("globalAlpha", 1);
		canvas.context.translate(this.center.x, this.center.y);
		canvas.context.rotate(-Elemental.Helpers.ToRadians(this.rotation));
		canvas.context.translate(-posn.x, -posn.y);
	}

	draw(canvas) {
		// pass
	}

	inherit(data) {
		for (var property in data) {
			if (data.hasOwnProperty(property)) {
				this[property] = data[property]
			}
		}
	}
}

Elemental.Sprite.Points = class extends Elemental.Sprite {
	constructor(points, config={}) {
		super();

		this.points = points;

		this.lineWidth = 1;
		this.lineColor = "black";
		this.lineCaps = "round";
		this.lineCorners = "round";
		this.lineMiterLimit = null;
		this.lineDashWidth = null;
		this.lineDashSpacing = null;

		this.fillColor = "white";
		this.closePath = true;
		this.strokeFirst = false;

		this.inherit(config);
	}

	draw(canvas) {
		canvas.setContextProperty("strokeStyle", this.lineColor);
		canvas.setContextProperty("lineWidth", this.lineWidth);
		canvas.setContextProperty("lineCap", this.lineCaps);
		canvas.setContextProperty("lineJoin", this.lineCorners);
		canvas.setContextProperty("miterLimit", this.lineMiterLimit);
		canvas.setContextProperty("lineDashOffset", this.lineDashOffset);
		canvas.setContextProperty("fillStyle", this.fillColor);
		canvas.context.setLineDash([this.lineDashWidth, this.lineDashSpacing]);

		canvas.context.beginPath();

		canvas.context.moveTo(
			this.points[0].x*this.scale,
			this.points[0].y*this.scale
		);
		for (var i=1; i<this.points.length; i++) {
			canvas.context.lineTo(
				this.points[i].x*this.scale,
				this.points[i].y*this.scale
			);
		}

		if (this.closePath) {
			canvas.context.closePath();
		}

		if (this.strokeFirst) {
			if (this.lineWidth > 0) { canvas.context.stroke(); }
			canvas.context.fill();
		} else {
			canvas.context.fill();
			if (this.lineWidth > 0) { canvas.context.stroke(); }
		}
	}
}

Elemental.Sprite.Polygon = class extends Elemental.Sprite {
	constructor(sides, size, config={}) {
		super();

		this.size = size;
		this.sides = sides;

		this.lineWidth = 1;
		this.lineColor = "black";
		this.lineCaps = "round";
		this.lineCorners = "round";
		this.lineMiterLimit = null;
		this.lineDashWidth = null;
		this.lineDashSpacing = null;

		this.fillColor = "white";
		this.strokeFirst = false;

		this.inherit(config);
	}

	draw(canvas) {
		canvas.setContextProperty("strokeStyle", this.lineColor);
		canvas.setContextProperty("lineWidth", this.lineWidth);
		canvas.setContextProperty("lineCap", this.lineCaps);
		canvas.setContextProperty("lineJoin", this.lineCorners);
		canvas.setContextProperty("miterLimit", this.lineMiterLimit);
		canvas.setContextProperty("lineDashOffset", this.lineDashOffset);
		canvas.setContextProperty("fillStyle", this.fillColor);
		canvas.context.setLineDash([this.lineDashWidth, this.lineDashSpacing]);

		canvas.context.beginPath();
		canvas.context.moveTo(this.size*this.scale, 0);

		for (var angle = 360/this.sides; angle < 360; angle += 360/this.sides) {
				canvas.context.lineTo(
					(Math.cos(Elemental.Helpers.ToRadians(angle))*this.size)*this.scale,
					(Math.sin(Elemental.Helpers.ToRadians(angle))*this.size)*this.scale
				);
		}

		canvas.context.closePath();

		if (this.strokeFirst) {
			if (this.lineWidth > 0) { canvas.context.stroke(); }
			canvas.context.fill();
		} else {
			canvas.context.fill();
			if (this.lineWidth > 0) { canvas.context.stroke(); }
		}
	}
}

Elemental.Sprite.Ellipse = class extends Elemental.Sprite {
	constructor(size, config={}) {
		super();

		this.radius = size;
		this.start = 0;
		this.end = 360;
		this.midpoint = Elemental.Vector.Empty;
		this.lineWidth = 1;
		this.lineColor = "black";
		this.lineCaps = "round";
		this.lineCorners = "round";
		this.lineMiterLimit = null;
		this.lineDashWidth = null;
		this.lineDashSpacing = null;

		this.fillColor = "white";
		this.closePath = true;
		this.strokeFirst = false;

		this.inherit(config);
	}

	draw(canvas) {
		canvas.setContextProperty("strokeStyle", this.lineColor);
		canvas.setContextProperty("lineWidth", this.lineWidth);
		canvas.setContextProperty("lineCap", this.lineCaps);
		canvas.setContextProperty("lineJoin", this.lineCorners);
		canvas.setContextProperty("miterLimit", this.lineMiterLimit);
		canvas.setContextProperty("lineDashOffset", this.lineDashOffset);
		canvas.setContextProperty("fillStyle", this.fillColor);
		canvas.context.setLineDash([this.lineDashWidth, this.lineDashSpacing]);

		canvas.context.beginPath();

		canvas.context.arc(
			this.midpoint.x*this.scale,
			this.midpoint.y*this.scale,
			this.radius*this.scale,
			Elemental.Helpers.ToRadians(this.start),
			Elemental.Helpers.ToRadians(this.end)
		);

		if (this.closePath) {
			canvas.context.closePath();
		}

		if (this.strokeFirst) {
			if (this.lineWidth > 0) { canvas.context.stroke(); }
			canvas.context.fill();
		} else {
			canvas.context.fill();
			if (this.lineWidth > 0) { canvas.context.stroke(); }
		}
	}
}

Elemental.Sprite.Image = class extends Elemental.Sprite {
	constructor(image, config={}) {
		super();

		this.image = Elemental.Helpers.LoadImage(image);

		this.inherit(config);
	}

	get width() { return this.image.width*this.scale; }
	get height() { return this.image.height*this.scale; }
	get size() { return new Elemental.Vector(this.height, this.width); }

	draw(canvas) {
		canvas.drawImage(this.image, Elemental.Vector.Empty, this.scale);
	}
}

Elemental.Sprite.Composite = class extends Elemental.Sprite {
	constructor(shapes, config={}) {
		super();

		this.shapes = shapes;

		this.inherit(config);
	}

	draw(canvas) {
		var scale = this.scale;
		var shapes = [];

		for (var index in this.shapes) {
		   if (this.shapes.hasOwnProperty(index)) {
			   var shape = this.shapes[index];
			   shapes.push(shape);
		   }
		}

		shapes.sort(function(a, b){
			if (a.layer > b.layer) return 1;
			if (a.layer < b.layer) return -1;
			return 0;
		});

		shapes.forEach(function(shape) {
		   shape.scale *= scale;
		   shape.drawOnCanvas(canvas, Elemental.Vector.Empty);
		   shape.scale /= scale;
	   });
	}
}

Elemental.Sprite.Animation = class extends Elemental.Sprite {
	constructor(frames, speed, config={}) {
		super();

		this.frames = frames;
		this.speed = speed;
		this.currentframe = 0;
		this.framecount = 0;
	}

	draw(canvas) {
		this.framecount++;

		if (this.framecount >= this.speed) {
			this.framecount = 0;
			this.currentframe = (this.currentframe + 1) % this.frames.length;
		}

		this.frames[this.currentframe].drawOnCanvas(canvas, Elemental.Vector.Empty);
	}
}

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

// Timer class, for keeping a constant framerate
Elemental.Timer = new function() {
	this.lastTime = 0;
	this.gameTick = null;
	this.prevElapsed = 0;
	this.prevElapsed2 = 0;

	this.Start = function(gameTick) {
		var prevTick = this.gameTick;
		this.gameTick = gameTick;
		if (this.lastTime == 0)
		{
			// Once started, the loop never stops.
			// But this function is called to change tick functions.
			// Avoid requesting multiple frames per frame.
			var bindThis = this;
			requestAnimationFrame(function() { bindThis.tick(); } );
			this.lastTime = 0;
		}
	}

	this.Stop = function() {
		this.Start(null);
	}

	this.tick = function () {
		if (this.gameTick != null)
		{
			var bindThis = this;
			requestAnimationFrame(function() { bindThis.tick(); } );
		}
		else
		{
			this.lastTime = 0;
			return;
		}
		var timeNow = Date.now();
		var elapsed = timeNow - this.lastTime;
		if (elapsed > 0)
		{
			if (this.lastTime != 0)
			{
				if (elapsed > 1000) // Cap max elapsed time to 1 second to avoid death spiral
				elapsed = 1000;
				// Hackish fps smoothing
				var smoothElapsed = (elapsed + this.prevElapsed + this.prevElapsed2)/3;
				this.gameTick(0.001*smoothElapsed);
				this.prevElapsed2 = this.prevElapsed;
				this.prevElapsed = elapsed;
			}
			this.lastTime = timeNow;
		}
	}
}

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

// Spinoff class to represent subprocesses
Elemental.Spinoff = class {
	constructor(duration, unique=false) {
		this.duration = duration;
		this.unique = unique;
		this.frame = 0;
		this.returning = false;
		this.parent = null;

		this.running = false;

		this.funcStart = function(){}
		this.funcFrame = function(){}
		this.funcEnd = function(){}
		this.funcReturn = null;
	}

	onStart(func) { this.funcStart = func; }
	onFrame(func) { this.funcFrame = func; }
	onEnd(func) { this.funcEnd = func; }
	onReturn(func) { this.funcReturn = func; }

	end() {
		this.funcEnd();
		this.returning = false;
		this.running = false;
		this.frame = 0;
		var ind = this.parent.spinoffs.indexOf(this);
		if (ind != -1) {
			this.parent.spinoffs.splice(ind, 1);
		}
	}

	start() {
		if (this.unique) {
			if (!this.running) {
				this.parent.spinoffs.push(this);
			}
		} else {
			this.parent.spinoffs.push(this);
		}
		this.running = true;
	}

	doFrame() {
		if (this.frame == 0) { this.funcStart(); }

		if (this.returning) { this.funcReturn((this.duration*2)-this.frame-1); }
		else { this.funcFrame(this.frame); }

		this.frame++;

		if (this.funcReturn != null) {
			if (this.frame >= this.duration) {
				this.returning = true;
			}
			if (this.frame >= this.duration * 2) {
				this.end();
			}
		} else {
			if (this.frame >= this.duration) {
				this.end();
			}
		}
	}
}

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
