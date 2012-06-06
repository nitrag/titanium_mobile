define(["Ti/_/browser", "Ti/_/declare", "Ti/_/UI/Widget", "Ti/_/lang", "Ti/_/dom", "Ti/_/style", "Ti/UI", "Ti/_/event"],
	function(browser, declare, Widget, lang, dom, style, UI, event) {

	var setStyle = style.set,
		is = require.is,
		isDef = lang.isDef,
		unitize = dom.unitize,
		on = require.on,
		transitionEvents = {
			webkit: "webkitTransitionEnd",
			trident: "msTransitionEnd",
			gecko: "transitionend",
			presto: "oTransitionEnd"
		},
		transitionEnd = transitionEvents[browser.runtime] || "transitionEnd",

		// This specifies the minimum distance that a finger must travel before it is considered a swipe
		distanceThreshold = 50,

		// The maximum angle, in radians, from the axis a swipe is allowed to travel before it is no longer considered a swipe
		angleThreshold = Math.PI/6, // 30 degrees

		// This sets the minimum velocity that determines whether a swipe was a flick or a drag
		velocityThreshold = 0.5,

		// This determines the minimum distance scale (i.e. width divided by this value) before a flick requests a page turn
		minimumFlickDistanceScaleFactor = 15,

		// This determines the minimum distance scale (i.e. width divided by this value) before a drag requests a page turn
		minimumDragDistanceScaleFactor = 2;

		// This is the velocity used to animate to the end when there is no available velocity
		defaultVelocity = 0.2;

	return declare("Ti.UI.ScrollableView", Widget, {

		constructor: function(args){

			// Create the content container
			this._add(this._contentContainer = UI.createView({
				left: 0,
				top: 0,
				width: UI.SIZE,
				height: "100%",
				layout: "constrainingHorizontal"
			}));
			this.domNode.style.overflow = "visible";

			// Create the paging control container
			this._add(this._pagingControlContainer = UI.createView({
				width: "100%",
				height: 20,
				bottom: 0,
				backgroundColor: "black",
				opacity: 0,
				touchEnabled: false
			}));

			this._pagingControlContainer._add(this._pagingControlContentContainer = UI.createView({
				width: UI.SIZE,
				height: "100%",
				top: 0,
				touchEnabled: false,
				layout: "constrainingHorizontal"
			}));

			this.views = [];

			// State variables
			this._viewToRemoveAfterScroll = -1;

			// Listen for postlayouts and update the translation
			on(this, "postlayout", lang.hitch(this, this._updateTranslation));

			var self = this,
				base,
				velocity = 0,
				previousTime,
				previousDistance;
			on(this, "dragstart", function(e) {
				base = -self.views[self.currentPage]._measuredLeft;
			});

			on(this, "drag", function(e) {
				var currentTime = (new Date).getTime(),
					currentDistance = e.distanceX;
				previousTime && (velocity = (previousDistance - currentDistance) / (previousTime - currentTime));
				previousTime = currentTime;
				previousDistance = currentDistance;
				console.log(velocity);
				setStyle(this._contentContainer.domNode, "transform",
					"translate(" + (base + previousDistance) + "px, 0) translateZ(0)");
			});

			on(this, "dragend", function(e) {
				var scaleFactor = velocity > velocityThreshold ? 
						minimumFlickDistanceScaleFactor :
						minimumDragDistanceScaleFactor;
				/*if (distance > width / scaleFactor && self.currentPage > 0) {
					destinationIndex = self.currentPage - 1;
					animationLeft = 0;
				} else if (distance < -width / scaleFactor && self.currentPage < self.views.length - 1) {
					destinationIndex = self.currentPage + 1;
					if (viewsToScroll.length === 3) {
						animationLeft = -2 * width;
					} else {
						animationLeft = -width;
					}
				}*/
			});

			on(this, "dragcancel", function(e) {
				
			});
		},

		addView: function(view){
			if (view) {
				this.views.push(view);
				this._contentContainer._add(view);
				this.views.length == 1 && (this.properties.__values__.currentPage = 0);
			}
		},

		removeView: function(view) {

			// Get and validate the location of the view
			var viewIndex = is(view,"Number") ? view : this.views.indexOf(view);
			if (viewIndex < 0 || viewIndex >= this.views.length) {
				return;
			}

			// Update the view if this view was currently visible
			if (viewIndex == this.currentPage && this.views.length !== 1) {
				this._viewToRemoveAfterScroll = viewIndex;
				this.scrollToView(viewIndex == this.views.length - 1 ? --viewIndex : ++viewIndex);
			} else {
				this._removeViewFromList(viewIndex);
			}
		},

		_removeViewFromList: function(viewIndex) {

			var contentContainer = this._contentContainer,
				self = this;

			// Update the current view if necessary once everything has been re-laid out.
			if (viewIndex < this.currentPage) {
				self.properties.__values__.currentPage--;
				on.once(contentContainer, "postlayout", lang.hitch(this, this._updateTranslation));
			}

			// Remove the view and update the paging control
			contentContainer._remove(self.views.splice(viewIndex,1)[0]);
			self._updatePagingControl(self.currentPage);
		},

		_updateTranslation: function() {
			setStyle(this._contentContainer.domNode, "transform",
				"translate(" + (-this.views[this.currentPage]._measuredLeft) + "px, 0) translateZ(0)");
		},

		scrollToView: function(view) {
			var viewIndex = is(view,"Number") ? view : this.views.indexOf(view),
				self = this;
			
			// Sanity check
			if (viewIndex < 0 || viewIndex >= this.views.length || viewIndex == this.currentPage) {
				return;
			}

			function scroll(){

				// Calculate the views to be scrolled
				var contentContainer = self._contentContainer,
					destinationPosition = self.views[viewIndex]._measuredLeft,

					// Calculate a weighted duration so that larger views take longer to scroll.
					duration = 300 + 0.2 * (Math.abs(viewIndex - self.currentPage) * contentContainer._measuredWidth);

				console.log(duration);
				self._updatePagingControl(viewIndex);
				setStyle(contentContainer.domNode, "transition", "all " + duration + "ms ease-in-out");
				setTimeout(function(){
					setStyle(contentContainer.domNode, "transform", "translate(" + (-destinationPosition) + "px, 0) translateZ(0)");
				},1);
				on(contentContainer.domNode, transitionEnd, function(){
					self.properties.__values__.currentPage = viewIndex;
					setStyle(contentContainer.domNode, "transition", "");
					setTimeout(function(){
						if (self._viewToRemoveAfterScroll !== -1) {
							self._removeViewFromList(self._viewToRemoveAfterScroll);
							self._viewToRemoveAfterScroll = -1;
						}
						self.fireEvent("scroll",{
							currentPage: viewIndex,
							view: self.views[viewIndex]
						});
					}, 1);
				});
			}

			// If the scrollableView hasn't been laid out yet, we must wait until it is
			if (self._contentContainer.domNode.offsetWidth) {
				scroll();
			} else {
				on.once("postlayout", scroll);
			}
		},

		_showPagingControl: function() {
			if (!this.showPagingControl) {
				this._pagingControlContainer.opacity = 0;
				return;
			}
			if (this._isPagingControlActive) {
				return;
			}
			this._isPagingControlActive = true;
			this._pagingControlContainer.animate({
				duration: 250,
				opacity: 0.75
			});
			this.pagingControlTimeout > 0 && setTimeout(lang.hitch(this,function() {
				this._pagingControlContainer.animate({
					duration: 750,
					opacity: 0
				});
				this._isPagingControlActive = false;
			}),this.pagingControlTimeout);
		},

		_updatePagingControl: function(newIndex, hidePagingControl) {
			if (this.showPagingControl) {
				this._pagingControlContentContainer._removeAllChildren();
				var diameter = this.pagingControlHeight / 2;
				for (var i = 0; i < this.views.length; i++) {
					var indicator = UI.createView({
						width: diameter,
						height: diameter,
						left: 5,
						right: 5,
						backgroundColor: i === newIndex ? "white" : "grey",
						borderRadius: unitize(diameter / 2)
					});
					this._pagingControlContentContainer._add(indicator);
				}
				!hidePagingControl && this._showPagingControl();
			}
		},

		_defaultWidth: UI.FILL,

		_defaultHeight: UI.FILL,

		properties: {
			currentPage: {
				set: function(value, oldValue) {
					if (value >= 0 && value < this.views.length) {
						this.scrollToView(value);
						return value;
					}
					return oldValue;
				}
			},
			pagingControlColor: {
				set: function(value) {
					this._pagingControlContainer.backgroundColor = value;
					return value;
				},
				value: "black"
			},
			pagingControlHeight: {
				set: function(value) {
					this._pagingControlContainer.height = value;
					return value;
				},
				value: 20
			},
			pagingControlTimeout: {
				set: function(value) {
					this.pagingControlTimeout == 0 && this._updatePagingControl();
					return value;
				},
				value: 1250
			},
			showPagingControl: {
				set: function(value) {
					this.pagingControlTimeout == 0 && this._updatePagingControl();
					return value;
				},
				value: false
			},
			views: {
				set: function(value) {

					// Value must be an array
					if (!is(value,"Array")) {
						return;
					}

					// Add the views to the content container
					var i = 0,
						len = value.length,
						contentContainer = this._contentContainer,
						view;
					contentContainer._removeAllChildren();
					for(; i < len; i++) {
						(view = value[i]).width = "100%";
						view.height = "100%";
						contentContainer._add(view);
					}

					return value;
				},
				post: function() {
					this._updatePagingControl(this.currentPage,true);
				}
			}
		}

	});

});