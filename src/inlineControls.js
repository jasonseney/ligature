/**
 * # Inline Controls
 *
 * Creates an interface to show inline controls. The actual controls are added externally.
 * The actual functionaly of what each button says it does is defined outside this element.
 */

var _ = require('lodash');
var $ = require('jquery');

var ControlBase = require('./controlBase');

var InlineControls = (function() {

    /**
     * ## Constructor
     * Creates an instance of inline controls.
     *
     * @param {Object}   options
     * @param {Function} options.openTray     Tray open function. [default: jQuery show()]
     * @param {Function} options.closeTray    Tray close function. [default: jQuery hide()]
     * @param {Function} options.onTrayOpened   Tray opened. intentTriggered true when user initiated.
     * @param {Function} options.onTrayClosed   Tray closed. intentTriggered false when user initiated.
     * @param {Function} options.onShow      Controls shown.
     * @param {Function} options.onHide      Controls hidden.
     * @param {Function|Object} options.customOffset   Offset positioning override function or shift object {x: #, y: #}
     *
     * @return An instance of InlineControls.
     */
    var module = function(options) {
        options = options || {};
        this.openTray = options.openTray || this.openTray;
        this.closeTray = options.closeTray || this.closeTray;
        this.onTrayOpened  = options.onTrayOpened || function(intentTriggered){};
        this.onTrayClosed = options.onTrayClosed || function(intentTriggered){};
        this.customOffset = options.customOffset || _.noop;
        this.keyboardEvents = options.keyboardEvents;
        setupUI.call(this);
        ControlBase.call(this, options);
    };

    // Extensions
    _.assign(module.prototype, ControlBase.prototype);

    function setupUI() {

        // Init the controls element
        this.element = $('<div />', {
            'class': 'inline-controls'
        }).css({
            'position':'absolute',
            'top': 0,
            'left': 0
        });

        this.opener = $('<div />', {
            'class': 'opener'
        });

        this.isTrayOpen = false;

        var control = this;
        this.opener.on('mousedown',function(e) {
            e.preventDefault();
            e.stopPropagation();
            toggleTray.call(control, null, true);
            return false;
        });

        this.tray = $('<div />', {
            'class': 'tray'
        });

        this.element.append(this.opener);
        this.element.append(this.tray);

        this.hide();
    }

    /**
     * ### toggleTray
     *
     * Internal function to open/close the tray with controls. Pretty simple stuff, but see the
     * params below there's some tricks.
     *
     * @param {boolean} [showIt] An optional flag to determine if we want to show or hide the tray.
     * If not defined, it will just reverse the current state.
     * @param {boolean} [intentTriggered] An optional flag to know if the user initiated this
     * toggle. If they did, we have some custom classes for css/animation etc.
     */
    function toggleTray(showIt, intentTriggered) {
        if(typeof showIt !== 'boolean') {
            showIt = !this.isTrayOpen;
        }

        if (showIt) {
            this.openTray.call(this, this.tray);
            this.isTrayOpen = true;
            this.onTrayOpened.call(this, intentTriggered);
        } else {
            this.closeTray.call(this, this.tray);
            this.isTrayOpen = false;
            this.onTrayClosed.call(this, intentTriggered);
        }

        $(this.opener).toggleClass('open', this.isTrayOpen);

        if(intentTriggered) {
            $(this.opener).toggleClass('closed', !this.isTrayOpen);
        }
        else {
            $(this.opener).removeClass('closed');
        }
    }

    /**
     * ### calculateOffset
     *
     * Internal, memoized method of determining the position of the inline controls
     *
     * @param {Object|Integer} offset   an object in form {x: #, y: #} or an integer representing x-offset only
     * @param {Object|Function} offsetOverride  an object in form {x: #, y: #} or a function that yields such an object
     *
     * @return an object representing the offset shift, in the form {x: #, y: #} [default: {x:0, y:0}]
     */
    var calculateOffset = _.memoize(function(offset, offsetOverride) {
        var customOffset;

        if (_.isFunction(offsetOverride)) {
            customOffset = offsetOverride.call();
        } else if (_.isObject(offsetOverride)) {
            customOffset = offsetOverride;
        }

        return _.pick(_.defaults(_.isObject(customOffset) ? customOffset : {}, { x: offset.x || offset, y: offset.y || 0 }), ['x', 'y']);
    });

    /**
     * ## addToTray
     *
     * Publically accessable way to add elements to the inline control's "tray".
     *
     * @param {Element} element The element to add. It just appends it. Nothing fancy. _Yet._
     */
    module.prototype.addToTray = function(element, options) {
        var keyboard;
        options = options || {};
        this.tray.append(element);
        keyboard = options.keyboard;
        if (this.keyboardEvents && keyboard) {
            this.keyboardEvents.on(keyboard.shortcut, keyboard.callback, keyboard.context);
        }
    };

    /**
     * ### openTray
     *
     * Default tray open function, jQuery show
     */
    module.prototype.openTray = function($tray) {
        $tray.show();
    };

    /**
     * ### closeTray
     *
     * Default tray close function, jQuery hide
     */
    module.prototype.closeTray = function($tray) {
        $tray.hide();
    };

    /**
     * ## open
     *
     * A standard way to open up the inline toolbar. It will postion it based on a particular
     * element's position. Optionally, we can adjust it horizontally.
     *
     * @param {Element} element The element to position the toolbar within
     * @param {Object} [offset] Optional offset value to shift the toolbar.
     */
    module.prototype.open = function(element, offset) {
        if (!element) {
            return;
        }

        // calculateOffset takes an offset argument AND the customOffset to determine the shift
        // customOffset always takes precedence over the offset argument
        offset = calculateOffset(offset || 0, this.customOffset || 0);
        var pos = $(element).position();
        var marginOffset = parseInt($(element).css('margin-top'), 10) || 0;
        toggleTray.call(this, false);
        this.show(pos.left + offset.x, pos.top + offset.y + marginOffset);
    };

    /**
     * ## close
     *
     * Use this to close and hide the inline control. Don't dare messing with internal elements
     * just use this to close it.
     */
    module.prototype.close = function() {
        toggleTray.call(this, false);
        this.hide();
    };

    /**
     * ## toggleTrayWithIntent
     *
     * Open or close the tray simulating user intent.
     * @param {boolean} showIt A flag to determine if we want to show or hide the tray.
     */
    module.prototype.toggleTrayWithIntent = function(showIt) {
        toggleTray.call(this, showIt, true);
    };

    return module;
})();

module.exports = InlineControls;
