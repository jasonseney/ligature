/**
 * # Control Base
 *
 * An extension for providing control positioning and basic UI functions.
 */

var console = require('./debugConsole');

var ControlBase = (function() {

    /**
     * ## Constructor
     * Checks for an element when instantiating, and sets shown state.
     *
     * @param {Object}   options
     * @param {Function} options.onShow Controls shown.
     * @param {Function} options.onHide Controls hidden.
     *
     * @return An instance of ControlBase.
     */
    var module = function(options) {
        if(!this.element) {
            console.error('ControlBase requires an element');
            return null;
        }

        options = options || {};
        this.onShow = options.onShow || function(controls) {
            controls.element.show();
        };
        this.onHide = options.onHide || function(controls) {
            controls.element.hide();
        };

        this.isShown = false;

        // Start hidden
        this.element.hide();
    };

    /**
     * ### position
     *
     * Sets the position of this element.
     *
     * @param {Number} x The x position
     * @param {Number} y The y position
     */
    function position(x,y) {
        if (typeof x === 'number' && typeof y === 'number') {
            this.element.css({
                'left': x + 'px',
                'top': y + 'px'
            });
        }
    }

    /**
     * ### correctPosition
     *
     * Adjusts the control's position so it is always on the screen.
     */
    function correctPosition() {
        var xInViewport = this.element.get(0).getBoundingClientRect().left;
        if (xInViewport < 0) {
            this.element.css('left', '+=' + (-1 * xInViewport) + 'px');
        }
        var yInViewport = this.element.get(0).getBoundingClientRect().top;
        if (yInViewport < 0) {
            this.element.css('top', '+=' + (-1 * yInViewport) + 'px');
        }
    }

    /**
     * ## hide
     *
     * Hides this control from view.
     */
    module.prototype.hide = function() {
        if (!this.isShown) return;
        this.isShown = false;
        this.onHide(this);
    };

    /**
     * ## showOverTarget
     *
     * Will show the element and position centered above the target coordinates.
     * Must include both x and y params to position.
     *
     * @param {Number} [x] The x position to center on
     * @param {Number} [y] The y position to position on top of
     */
    module.prototype.showOverTarget = function(x, y) {
        var targetLeft = x - (this.element.width() / 2);
        var targetTop = y - this.element.height() - 10;

        this.show(targetLeft, targetTop);
        correctPosition.call(this);
    };
    /**
     * ## show
     *
     * Shows the element at a particular position. This uses our position
     * function which uses to the coordinates of the upper left of this control.
     *
     * It is also important to use this to know what state the control is in (shown or hidden).
     *
     * @param {Number} [x] The x coordinate
     * @param {Number} [y] The y coordinate
     */
    module.prototype.show = function(x, y) {
        position.call(this, x, y);
        if (this.isShown) return;
        this.isShown = true;
        this.onShow(this);
    };

    /**
     * ## size
     *
     * Size this control using numbers. If you want to size only one dimension,
     * pass false as the other parameter.
     *
     * @param {Number} [width] The x coordinate
     * @param {Number} [height] The y coordinate
     */
    module.prototype.size = function(width, height) {
        if (width && typeof width === 'number') {
            this.element.width(width);
        }
        if (height && typeof height === 'number') {
            this.element.width(height);
        }
    };

    return module;

})();

module.exports = ControlBase;
