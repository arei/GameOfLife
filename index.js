/*
	Conway's Game of Life
	By Glen R. Goodwin (http://arei.net or @areinet)
	Github: http://github.com/arei/GameOfLife

*/
"use strict";

// Some constants

// How far back do we remember prior ticks to compare for redundant executions.
// If null, remember all.
var REMEMBER_HOW_MANY_TICKS_BACK = null;

// how big is a single cell, in pixels
var CELL_WIDTH = 20;
var CELL_HEIGHT = 20;

// How likely is a new cell in our board initialization to be alive?
var SEED_PERCENTAGE = 0.5;

// On a dead board, do we reset and start over?
var AUTO_REPEAT = false;

// How many ticks per second is allowed.  If null, the amount is unlimited
var TICK_THROTTLE = null;

// How are edges of the board handled?
var WRAP_BOARD = false;
var EDGES_ARE_ALIVE = false;

// A function for merging two strings together.  Used for formatting
// Strings for display.
var zip = function(base,value) {
	base = base || "";
	if (!value) return base;
	if (!Object.isString(value)) value = value.toString();

	if (base.length<value.length) return value;

	return base.slice(0,base.length-value.length)+value;
};

// A class to represent our Board state. Really, this just handles
// the rows/cols values
var Board = function(rows,cols) {
	if (!(this instanceof Board)) return new Board(rows,cols);

	// returns the number of rows in our board
	this.getRows = function() {
		return rows;
	};

	// returns the number of columns in our board
	this.getColumns = function() {
		return cols;
	};
};

// A Class to represent our cells structure.
var Cellular = function(board) {
	if (!(this instanceof Cellular)) return new Cellular();

	var me = this;

	// Cells are stored as a single dimension array because numeric
	// array lookup is the faster than object lookup or two dimensional
	// array lookup.
	var cells = [];

	// return an array of all the cells.
	this.getCells = function() {
		return cells;
	};

	// normalize the given row to account for wrapping
	var getCellRow = function(r) {
		var rows = board.getRows();
		if (WRAP_BOARD) {
			if (r<0) return rows-1;
			if (r>=rows) return 0;
		}
		else {
			if (r<0 || r>=rows) return null;
		}
		return r;
	};

	// normalize the given column to account for wrapping
	var getCellColumns = function(c) {
		var cols = board.getColumns();
		if (WRAP_BOARD) {
			if (c<0) return cols-1;
			if (c>=cols) return 0;
		}
		else {
			if (c<0 || c>=cols) return null;
		}
		return c;
	};

	// return a specific cell
	this.getCell = function(r,c) {
		r = getCellRow(r);
		c = getCellColumns(c);

		if (r===null || c===null) {
			return {
				state: EDGES_ARE_ALIVE
			};
		}

		return cells[r*board.getColumns()+c] || null;
	};

	// return a specific cells state, either true for alive or false for dead
	this.getCellState = function(r,c) {
		r = getCellRow(r);
		c = getCellColumns(c);
		if (r===null || c===null) return EDGES_ARE_ALIVE;

		return me.getCell(r,c).state;
	};

	// Sets the state, true for alive, false for dead
	this.setCellState = function(r,c,b) {
		r = getCellRow(r);
		c = getCellColumns(c);
		if (r===null || c===null) return;

		me.getCell(r,c).state = b;
	};

	// Initializes our cell array based on
	var setup = function() {
		// Get our constraints
		var rows = board.getRows();
		var cols = board.getColumns();

		// For each row/col create a new cell.  Each cell has a state as
		// well as its coordinate reference.  Each cell also contains a reference
		// to each of its neighbors.  This is done so that when computing
		// each tick we don't have to relookup each neighbor every time, we
		// just have to iterate they given neighbors.
		$R(0,rows-1).each(function(r){
			$R(0,cols-1).each(function(c){
				cells[r*cols+c] = {
					row: r,
					column: c,
					state: Math.random()<SEED_PERCENTAGE,
					neighbors: []
				};
			});
		});

		// For each cell, add its neighbors.  We do this AFTER initialization of
		// the cells, because otherwise we would have nulls for cells that
		// are initialized later than the original cell.
		$R(0,rows-1).each(function(r){
			$R(0,cols-1).each(function(c){
				cells[r*cols+c].neighbors = [
					me.getCell(r-1,c-1),
					me.getCell(r-1,c),
					me.getCell(r-1,c+1),
					me.getCell(r,c-1),
					me.getCell(r,c+1),
					me.getCell(r+1,c-1),
					me.getCell(r+1,c),
					me.getCell(r+1,c+1)
				].compact();
			});
		});
	};

	// Execute setup.
	setup();
};

// A class for computing how our cells change over time
var Compute = function(board,cellular) {
	if (!(this instanceof Compute)) return new Compute();

	// An array for holding our state strings.  A state string is a representation
	// of all the changes for a single tick of our game.  We can then use these for
	// comparison to determine if we are caught in some sort of redundant
	// round of execution, and if so call the game dead.
	var states = [];

	var dead = false;
	var ticktime = 0;
	var tickcount = 0;

	// How many ticks have we done for this single game?
	this.getTickCount = function() {
		return tickcount;
	};

	// How long, in ms, have we spent inside the tick function?
	this.getTickTime = function() {
		return ticktime;
	};

	// A tick is a single iteration for the game.
	this.tick = function() {
		if (dead) return;

		tickcount += 1;

		var start = new Date().getTime();

		// We compute the change for each cell in the board.  It's
		// important to not actually make the changes until all
		// computations are complete, otherwise each cell would
		// be influenced by the prior cells change.
		var changes = [];
		cellular.getCells().each(function(cell){
			var weight = 0;
			cell.neighbors.forEach(function(n){
				weight += n.state;
			});

			if (cell.state && (weight<2 || weight>3)) changes.push(cell);
			if (!cell.state && weight===3) changes.push(cell);
		});

		// Once we have all the changes, then we can write those
		// changes out to our cellular structure.  We also can use
		// this iteration of the changes to create our state string
		var state = "";
		changes.each(function(cell){
			cellular.setCellState(cell.row,cell.column,!cell.state);
			state += (state?",":"") + cell.row+"x"+cell.column;
		});

		// now we compare out curent state string to our historical state
		// strings.  If there are any matches, we have reached a redundancy.
		if (states.any(function(s){
			return state===s;
		})) {
			dead = true;
			return;
		}

		// Finally, we add our current state to the historical state.
		// Also, if our state array is getting too long, we drop some of
		// the older states.  By default we only remember 5 states back.
		states.push(state);
		if (REMEMBER_HOW_MANY_TICKS_BACK!==null && states.length>REMEMBER_HOW_MANY_TICKS_BACK) states.shift();

		var now = new Date().getTime();
		ticktime += now-start;
	};

	// Just let us know if we are in a dead state or not.
	this.isDead = function() {
		return dead;
	};
};

// A class for rendering our cells onto our board.
var Renderer = function(board,cellular,compute) {
	if (!(this instanceof Renderer)) return new Renderer();

	var me = this;

	var started = new Date().getTime();
	var completed = null;

	// Get all our our various elements we are going to update.
	var counterfps = $("counter-fps");
	var counterticks = $("counter-ticks");
	var counteravgtick = $("counter-average-tick");
	var counteravgrender = $("counter-average-render");
	var boardelement = $("board");

	// Computer the positional offsets
	var offsetX = boardelement.offsetWidth%CELL_WIDTH/2;
	var offsetY = boardelement.offsetHeight%CELL_HEIGHT/2;

	// Our array for storing the elements we use.
	var elements = [];

	var rendercount = 0;
	var rendertime = 0;

	// How many times have we rendered the board this game?
	this.getRenderCount = function() {
		return rendercount;
	};

	// And how long, in ms, have we spent in the render function?
	this.getRenderTime = function() {
		return rendertime;
	};

	// The render function is responsible for taking the cellular class
	// and translating it to the screen.
	this.render = function() {
		rendercount += 1;

		var start = new Date().getTime();

		// For each cell set its visibility to hidden, if state is false,
		// visible otherwise.
		cellular.getCells().each(function(cell,i){
			elements[i].style.visibility = cell.state?"visible":"hidden";
		});

		// The rest of this is for updating the various stat counters/clocks
		var now = new Date().getTime();
		if (compute.isDead()) completed = now;

		var secs = (((now-started)/1000)|0)+1;
		var fps = Math.min(999.99,Math.max(0,me.getRenderCount()/secs));
		counterfps.update(zip("     ",fps.toFixed(2)));

		var ticks = compute.getTickCount();
		counterticks.update(zip("     ",ticks.toFixed(0)));

		var tickavg = Math.min(9999.99,Math.max(0,ticks===0?0:compute.getTickTime()/ticks));
		counteravgtick.update(zip("   000",tickavg.toFixed(2))+" ms");

		var renderavg = Math.min(9999.99,Math.max(0,me.getRenderCount()===0?0:me.getRenderTime()/me.getRenderCount()));
		counteravgrender.update(zip("   000",renderavg.toFixed(2))+" ms");

		now = new Date().getTime();
		rendertime += now-start;
	};

	// Initialize the elements
	var setup = function() {
		// Clear the board.  This does not discard the elements, just removes
		// them from their parent.
		boardelement.update();

		// Create the elements.  If the elements already exist from a prior
		// run, we reuse them.  Otherwise, we create a new one.  Each element
		// is also positioned based on its row/column location.
		cellular.getCells().each(function(cell,i){
			var element = elements[i];
			if (!element) {
				element = new Element("div",{className:"cell"}).update(cell.row+","+cell.column);

				var x = cell.column*CELL_WIDTH+offsetX;
				var y = cell.row*CELL_HEIGHT+offsetY;
				var w = CELL_WIDTH-1;
				var h = CELL_HEIGHT-1;

				element.setStyle({
					left: x+"px",
					top: y+"px",
					width: w+"px",
					height: h+"px"
				});

				elements[i] = element;
			}
			boardelement.insert(element);
		});
	};

	// Execute setup
	setup();
};

// A Class for handling the Game lifecyle, including the interactive features
// of the program.
var Game = function() {
	var paused = false;

	// Get our various elements
	var busy = $("busy");
	var instructions = $("instructions");
	var boardelement = $("board");
	var buttonStart = $("button-start");
	var buttonStop = $("button-stop");
	var buttonReset = $("button-reset");
	var buttonStep = $("button-step");
	var comboCell = $("combobox-cell");
	var comboSeed = $("combobox-seed");
	var comboRepeat = $("combobox-repeat");
	var comboThrottle = $("combobox-throttle");
	var comboEdges = $("combobox-edges");

	var width,height;
	var offsetX,offsetY;
	var rows,cols;
	var board,cellular,compute,renderer;

	// Called to toggle the various buttons enablement based
	// on the current state of the game.
	var updateButtons = function() {
		var dead = compute.isDead();

		comboCell.removeClassName("open");
		comboSeed.removeClassName("open");
		comboRepeat.removeClassName("open");
		comboThrottle.removeClassName("open");
		comboEdges.removeClassName("open");

		if (paused) {
			buttonStart.removeClassName("disabled");
			buttonStop.addClassName("disabled");
			buttonStep.removeClassName("disabled");
			buttonReset.removeClassName("disabled");

			comboCell.removeClassName("disabled");
			comboSeed.removeClassName("disabled");
			comboRepeat.removeClassName("disabled");
			comboThrottle.removeClassName("disabled");
			comboEdges.removeClassName("disabled");
		}
		else if (dead) {
			buttonStart.addClassName("disabled");
			buttonStop.addClassName("disabled");
			buttonStep.addClassName("disabled");
			buttonReset.removeClassName("disabled");

			comboCell.removeClassName("disabled");
			comboSeed.removeClassName("disabled");
			comboRepeat.removeClassName("disabled");
			comboThrottle.removeClassName("disabled");
			comboEdges.removeClassName("disabled");
		}
		else {
			buttonStart.addClassName("disabled");
			buttonStop.removeClassName("disabled");
			buttonStep.addClassName("disabled");
			buttonReset.removeClassName("disabled");

			comboCell.addClassName("disabled");
			comboSeed.addClassName("disabled");
			comboRepeat.addClassName("disabled");
			comboThrottle.addClassName("disabled");
			comboEdges.addClassName("disabled");
		}
	};

	// Shows the busy/initializing element if we are initializing the game
	// board.  Wehn you start getting into small cell sizes this might take
	// a few seconds, so we didn't want to leave the user hanging.
	var setBusy = function(b) {
		busy.style.display = b?"":"none";
	};

	// Reset the game state, intializing the board, cells, elements, etc.
	// This also does the screen recalculation and determines the number of
	// rows/columns we will have based on the size of the screen.
	var reset = function() {
		if (!paused) paused = true;

		width = boardelement.offsetWidth;
		height = boardelement.offsetHeight;

		offsetX = width%CELL_WIDTH/2;
		offsetY = height%CELL_HEIGHT/2;

		rows = (height-offsetY*2)/CELL_HEIGHT;
		cols = (width-offsetX*2)/CELL_WIDTH;

		board = new Board(rows,cols);
		cellular = new Cellular(board);
		compute = new Compute(board,cellular);
		renderer = new Renderer(board,cellular,compute);

		renderer.render();
		updateButtons();

		setBusy.defer(false);
	};

	// Start running a game
	var start = function() {
		if (instructions.style.display!=="none") instructions.style.display = "none";

		paused = false;
		updateButtons();
		loop.defer();
	};

	// Stop running a game.
	var stop = function() {
		paused = true;
		updateButtons();
	};

	// Make a single step of the game look.  A step involves making
	// one tick and one render.
	var step = function() {
		if (instructions.style.display!=="none") instructions.style.display = "none";

		compute.tick();
		renderer.render();
	};

	// Runs the game loop.  The loop is the process by which a single step
	// of the game is taken and then determines if, and how long until, the
	// next step of the game is taken.
	var loop = function() {
		var tickstart = new Date().getTime();

		if (compute.isDead()) {
			if (!paused && AUTO_REPEAT) {
				setBusy(true);
				reset.defer();
				start.defer();
			}
			updateButtons();
		}
		else {
			step();
			var elapsed = new Date().getTime()-tickstart;
			var nexttick = Math.max(0,(TICK_THROTTLE||0)-elapsed);

			if (!paused) {
				if (nexttick) loop.delay(nexttick/1000);
				else loop.defer();
			}
		}
	};

	// This function is fired when a combobox item is clicked.
	var toggleCombobox = function(combobox,event) {
		if (!combobox) return;
		if (!paused && !compute.isDead()) return;

		var target = event.target;
		if (!target.hasClassName("comboitem") && !target.hasClassName("selected")) return;

		if (combobox.hasClassName("open")) {
			combobox.removeClassName("open");
			if (target) {
				var selected = combobox.select(".selected").first();
				if (selected) selected.update(target.innerHTML);

				var value = target.id;

				// The big ugly switch statement that determines the new
				// game parameters based on which combobox item was clicked.
				switch (value) {
					case "cell-100x100":
						CELL_WIDTH = 100;
						CELL_HEIGHT = 100;
						break;
					case "cell-50x50":
						CELL_WIDTH = 50;
						CELL_HEIGHT = 50;
						break;
					case "cell-25x25":
						CELL_WIDTH = 25;
						CELL_HEIGHT = 25;
						break;
					case "cell-20x20":
						CELL_WIDTH = 20;
						CELL_HEIGHT = 20;
						break;
					case "cell-15x15":
						CELL_WIDTH = 15;
						CELL_HEIGHT = 15;
						break;
					case "cell-10x10":
						CELL_WIDTH = 10;
						CELL_HEIGHT = 10;
						break;
					case "cell-5x5":
						CELL_WIDTH = 5;
						CELL_HEIGHT = 5;
						break;
					case "seed-99":
						SEED_PERCENTAGE = 0.99;
						break;
					case "seed-90":
						SEED_PERCENTAGE = 0.90;
						break;
					case "seed-80":
						SEED_PERCENTAGE = 0.80;
						break;
					case "seed-70":
						SEED_PERCENTAGE = 0.70;
						break;
					case "seed-60":
						SEED_PERCENTAGE = 0.60;
						break;
					case "seed-50":
						SEED_PERCENTAGE = 0.50;
						break;
					case "seed-40":
						SEED_PERCENTAGE = 0.40;
						break;
					case "seed-30":
						SEED_PERCENTAGE = 0.30;
						break;
					case "seed-20":
						SEED_PERCENTAGE = 0.20;
						break;
					case "seed-10":
						SEED_PERCENTAGE = 0.10;
						break;
					case "seed-1":
						SEED_PERCENTAGE = 0.01;
						break;
					case "repeat-off":
						AUTO_REPEAT = false;
						break;
					case "repeat-on":
						AUTO_REPEAT = true;
						break;
					case "throttle-off":
						TICK_THROTTLE = 0;
						break;
					case "throttle-quarter":
						TICK_THROTTLE = 4000;
						break;
					case "throttle-half":
						TICK_THROTTLE = 2000;
						break;
					case "throttle-1":
						TICK_THROTTLE = 1000;
						break;
					case "throttle-2":
						TICK_THROTTLE = 500;
						break;
					case "throttle-3":
						TICK_THROTTLE = 333;
						break;
					case "throttle-5":
						TICK_THROTTLE = 200;
						break;
					case "throttle-10":
						TICK_THROTTLE = 100;
						break;
					case "throttle-20":
						TICK_THROTTLE = 50;
						break;
					case "edges-dead":
						EDGES_ARE_ALIVE = false;
						WRAP_BOARD = false;
						break;
					case "edges-alive":
						EDGES_ARE_ALIVE = true;
						WRAP_BOARD = false;
						break;
					case "edges-wrapped":
						EDGES_ARE_ALIVE = false;
						WRAP_BOARD = true;
						break;
				}
			}
		}
		else {
			comboCell.removeClassName("open");
			comboSeed.removeClassName("open");
			comboRepeat.removeClassName("open");
			comboThrottle.removeClassName("open");
			comboEdges.removeClassName("open");
			combobox.addClassName("open");
		}

	};

	// Register our button handlers
	buttonStart.observe("click",start);
	buttonStop.observe("click",stop);
	buttonStep.observe("click",step);
	buttonReset.observe("click",function(){
		if (instructions.style.display!=="none") instructions.style.display = "none";

		setBusy(true);
		reset.delay(0.5);
	});

	// And register our combobox handlers
	comboCell.observe("click",toggleCombobox.bind(this,comboCell));
	comboSeed.observe("click",toggleCombobox.bind(this,comboSeed));
	comboRepeat.observe("click",toggleCombobox.bind(this,comboRepeat));
	comboThrottle.observe("click",toggleCombobox.bind(this,comboThrottle));
	comboEdges.observe("click",toggleCombobox.bind(this,comboEdges));

	// Reset the game.  This is run for the initial load of the app to have
	// a ncie new board read.
	reset.defer();
};

// Once everything is ready, lets start our game.
document.observe("dom:loaded", function() {
	new Game();
});