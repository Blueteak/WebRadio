// Color Cycling in HTML5 Canvas
// BlendShift Technology conceived, designed and coded by Joseph Huckaby
// Copyright (c) 2001-2002, 2010 Joseph Huckaby.
// Released under the LGPL v3.0: http://www.opensource.org/licenses/lgpl-3.0.html

var CanvasCycle = {
	
	ctx: null,
	imageData: null,
	clock: 0,
	inGame: false,
	bmp: null,
	globalTimeStart: (new Date()).getTime(),
	inited: false,
	winSize: null,
	globalBrightness: 1.0,
	lastBrightness: 0,
	sceneIdx: -1,
	highlightColor: -1,
	defaultMaxVolume: 0.5,
	
	settings: {
		showOptions: false,
		targetFPS: 60,
		zoomFull: true,
		blendShiftEnabled: true,
		speedAdjust: 1.0,
		sound: true
	},

	contentSize: {
		width: 640,
		height: 480,
		scale: 1.0
	},

	init: function() {
		// called when DOM is ready
		if (!this.inited) {
			this.inited = true;
			$('container').style.display = 'block';
		
			this.handleResize();
	
		
			this.loadImage();
		}
	},

	loadImage: function() {
		this.stop();
		var scriptName = '/pixelart/seascape.js';//name + '.js'; // Assuming the file name is the same as 'name' but with .js extension
		var scr = document.createElement('SCRIPT');
		scr.type = 'text/javascript';
		scr.src = scriptName;
		document.getElementsByTagName('HEAD')[0].appendChild(scr);
	},

	processImage: function(img) {
		// initialize, receive image data from server
		this.bmp = new Bitmap(img);
		this.bmp.optimize();
	
		// $('d_debug').innerHTML = img.filename;
		
		var canvas = $('mycanvas');
		if (!canvas.getContext) return; // no canvas support
	
		if (!this.ctx) this.ctx = canvas.getContext('2d');
		this.ctx.clearRect(0, 0, this.bmp.width, this.bmp.height);
		this.ctx.fillStyle = "rgb(0,0,0)";
		this.ctx.fillRect (0, 0, this.bmp.width, this.bmp.height);
	
		if (!this.imageData) {
			if (this.ctx.createImageData) {
				this.imageData = this.ctx.createImageData( this.bmp.width, this.bmp.height );
			}
			else if (this.ctx.getImageData) {
				this.imageData = this.ctx.getImageData( 0, 0, this.bmp.width, this.bmp.height );
			}
			else return; // no canvas data support
		}
		
		this.globalBrightness = 1.0;

		this.run();
	},
	
	run: function () {
		// start main loop
		if (!this.inGame) {
			this.inGame = true;
			this.animate();
		}
	},
	
	stop: function() {
		// stop main loop
		this.inGame = false;
	},

	animate: function() {
		// animate one frame. and schedule next
		if (this.inGame) {
			var colors = this.bmp.palette.colors;
	
			if (this.settings.showOptions) {
				for (var idx = 0, len = colors.length; idx < len; idx++) {
					var clr = colors[idx];
					var div = $('pal_'+idx);
					div.style.backgroundColor = 'rgb(' + clr.red + ',' + clr.green + ',' + clr.blue + ')';
				}
			}
	
			this.bmp.palette.cycle( this.bmp.palette.baseColors, GetTickCount(), this.settings.speedAdjust, this.settings.blendShiftEnabled );
			if (this.highlightColor > -1) {
				this.bmp.palette.colors[ this.highlightColor ] = new Color(255, 255, 255);
			}
			if (this.globalBrightness < 1.0) {
				// bmp.palette.fadeToColor( pureBlack, 1.0 - globalBrightness, 1.0 );
				this.bmp.palette.burnOut( 1.0 - this.globalBrightness, 1.0 );
			}
			this.bmp.render( this.imageData, (this.lastBrightness == this.globalBrightness) && (this.highlightColor == this.lastHighlightColor) );
			this.lastBrightness = this.globalBrightness;
			this.lastHighlightColor = this.highlightColor;
	
			this.ctx.putImageData( this.imageData, 0, 0 );

			this.clock++;
			this.scaleAnimate();
			if (this.inGame) {
				// setTimeout( function() { CanvasCycle.animate(); }, 1 );
				requestAnimationFrame( function() { CanvasCycle.animate(); } );
			}
		}
	},

	scaleAnimate: function() {
		var totalNativeWidth = this.contentSize.width;
		var maxScaleX = (this.winSize.width) / totalNativeWidth;
	
		var totalNativeHeight = this.contentSize.height;
		var maxScaleY = (this.winSize.height) / totalNativeHeight;
	
		var maxScale = Math.min( maxScaleX, maxScaleY );
	
		if (this.contentSize.scale != maxScale) {
			this.contentSize.scale = maxScale;//+= ((maxScale - this.contentSize.scale) / 8);
			if (Math.abs(this.contentSize.scale - maxScale) < 0.001) this.contentSize.scale = maxScale; // close enough
		
			var sty = $('mycanvas').style; 
		
			if (ua.webkit) sty.webkitTransform = 'translate3d(0px, 0px, 0px) scale('+this.contentSize.scale+')';
			else if (ua.ff) sty.MozTransform = 'scale('+this.contentSize.scale+')';
			else if (ua.op) sty.OTransform = 'scale('+this.contentSize.scale+')';
			else sty.transform = 'scale('+this.contentSize.scale+')';
			
			sty.marginRight = '' + Math.floor( (this.contentSize.width * this.contentSize.scale) - this.contentSize.width ) + 'px';
			this.repositionContainer();
		}
	},
	
	repositionContainer: function() {
		// reposition container element based on inner window size
		var div = $('container');
		if (div) {
			this.winSize = getInnerWindowSize();
			div.style.left = '' + Math.floor((this.winSize.width / 2) - ((this.contentSize.width * this.contentSize.scale) / 2)) + 'px';
			div.style.top = '0px'//'' + Math.floor((this.winSize.height / 2) - ((this.contentSize.height * this.contentSize.scale) / 2)) + 'px';
			div.style.height = (this.contentSize.height * this.contentSize.scale) + 'px';
			div.style.width = (this.contentSize.width * this.contentSize.scale) + 'px';
			//console.log("Setting Top offset to " + div.style.top + " -> winHeight: " + this.winSize.height + " | contentHeight: " + this.contentSize.height + " cScale: " + this.contentSize.scale);			
		}
	},

	handleResize: function() {
		// called when window resizes
		this.repositionContainer();
		this.scaleAnimate();
	},

};

var CC = CanvasCycle; // shortcut

// http://paulirish.com/2011/requestanimationframe-for-smart-animating/
// http://my.opera.com/emoller/blog/2011/12/20/requestanimationframe-for-smart-er-animating

// requestAnimationFrame polyfill by Erik Möller
// fixes from Paul Irish and Tino Zijdel

(function() {
    var lastTime = 0;
    var vendors = ['ms', 'moz', 'webkit', 'o'];
    for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
        window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
        window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame'] 
                                   || window[vendors[x]+'CancelRequestAnimationFrame'];
    }
 
    if (!window.requestAnimationFrame)
        window.requestAnimationFrame = function(callback, element) {
            var currTime = new Date().getTime();
            var timeToCall = Math.max(0, 16 - (currTime - lastTime));
            var id = window.setTimeout(function() { callback(currTime + timeToCall); }, 
              timeToCall);
            lastTime = currTime + timeToCall;
            return id;
        };
 
    if (!window.cancelAnimationFrame)
        window.cancelAnimationFrame = function(id) {
            clearTimeout(id);
        };
}());
