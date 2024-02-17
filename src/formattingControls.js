/**
 * # Formatting Controls
 *
 * Creates an interface with buttons for formatting in an editor.
 * The actual functionaly of what each button says it does is defined outside this element.
 */

var _ = require('lodash');
var $ = require('jquery');
var Velocity = require('velocity-animate');
var animate = Velocity.animate;

var ControlBase = require('./controlBase');

var FormattingControls = (function() {

    // The default template for a control button (can be overriden in options)
    var defaultTemplate = '<div class="<%= className %>" title="<%= title %>" data-name="<%= name %>" data-el="<%= el %>" data-command="<%= command %>" data-type="<%= type %>">&nbsp;</div>';

    var activeStates = {};

    /**
     * ## Constructor
     * Creates an instance of formatting controls.
     *
     * All the formatting options are passed in through [options.controls]
     * The visible buttons are specificed (in order) through [options.controlsOrder]
     * You can have formatting options that are keyboard-shortcut-only by omitting their name from controlsOrder
     *
     * @param {Function} onApply The function that is called when a button is "applied".
     * @param {Function} onInverse The function that is called when a button is "inversed".
     * @param {Object} options Various callbacks and options passed to `ControlBase`.
     * @param {Function} [options.onAction] A callback for whenever any action is taken.
     * @param {Function} [options.onShow] A callback to run when the controls are shown.
     * @param {Function} [options.onHide] A callback to run when the controls are hidden.
     * @return An instance of FormattingControls.
     */
    var module = function(onApply, onInverse, options) {
        options = options || {};
        this.applyCommand = onApply;
        this.inverseCommand = onInverse;
        this.template = _.template(options.template || defaultTemplate);
        this.controls = options.controls || {};
        this.controlsOrder = options.controlsOrder || _.keys(this.controls);
        this.onAction = options.onAction || _.noop;
        this.keyboardEvents = options.keyboardEvents;
        setupUI.call(this);
        if (this.keyboardEvents) {
            setupKeyCombos.call(this);
        }
        ControlBase.call(this, options);
    };

    // Extensions
    _.assign(module.prototype, ControlBase.prototype);

    /**
     * ### setupUI
     *
     * Adds the buttons and hooks up click events.
     */
    function setupUI() {

        var controlsScope = this;

        // Build the markup
        var html = _.reduce(this.controlsOrder, function (memo, control) {
            if (_.has(this.controls, control)) {
                memo.push(this.template(_.extend({ name: control }, this.controls[control])));
            }
            return memo;
        }, [], this);

        // Init the controls element
        this.element = $('<div />', {
            'class': 'bubbles'
        }).css({
            'position':'absolute',
            'top': 0,
            'left': 0
        })
        .html(html);

        this.buttons = $(this.element).find('[data-command]');

        this.hide();

        // Handle clicks on buttons, call the command handler that we're initialized to
        this.buttons.on('mousedown',function(e) {
            e.preventDefault();
        });
        this.buttons.on('mouseup',function(e) {
            e.preventDefault();
            processButtonCommand.call(controlsScope, this);
        });
    }

    /**
     * ### setupKeyCombos
     *
     * For each button, set up keyboard combo listeners for that button's keycommand
     */
     function setupKeyCombos() {
        _.each(this.controls, function (c, n) {
            if (_.has(c, 'keyboard')) {
                this.keyboardEvents.on(c.keyboard, _.partial(processCommand.bind(this), n));
            }
            if (_.has(c, 'keyboardInverse')) {
                this.keyboardEvents.on(c.keyboardInverse, _.partial(processInverse.bind(this), n));
            }
        }, this);
    }

    /**
     * ### processInverse
     *
     * Given a control name, if control is active, execute the inverse.
     *
     * @param {String} name The control name to execute inverse for.
     */
    function processInverse(name) {
        if (_.has(this.controls, name) && activeStates[name]) {
            processCommand.call(this, name);
        }
    }

    /**
     * ### processCommand
     *
     * Given a control name, will execute the corresponding control's commmand.
     *
     * @param {String} name The control name to execute command for.
     */
    function processCommand(name) {
        var isActive, control, command, el;
        if (! _.has(this.controls, name)) {
            return;
        }
        isActive = activeStates[name];
        control = this.controls[name];
        command = control.command;
        el = control.el;
        if(isActive && this.inverseCommand && typeof this.inverseCommand === 'function') {
            this.inverseCommand(command, el, this);
        }
        else if(this.applyCommand && typeof this.applyCommand === 'function') {
            this.applyCommand(command, el, this);
        }
        this.onAction(this);
    }

    /**
     * ### processButtonCommand
     *
     * Given a button, will execute the corresponding control's commmand.
     *
     * @param {Element} button The button to execute command for.
     */
    function processButtonCommand(button) {
        processCommand.call(this, $(button).attr('data-name'));
    }

    /**
     * ### setButtonActiveStates
     *
     * Applies an active state to buttons based on the internal active states
     *
     * @param {Object} An object where the key is the name of the control and the value is a boolean that indicates active/non-active
     */
    function setButtonActiveStates() {
        this.buttons.removeClass('active');
        this.buttons.filter(function() {
            return activeStates[$(this).attr('data-name')];
        }).addClass('active');
    }

    /*
     * ### inElementSet
     *
     * Checks if a given element name is in a set of elements.
     *
     * @param {Array} elements The elements to check against.
     * @param {string} elementName The name of the element to check.
     */
    function inElementSet(elements, elementName) {
        var isContained = false;
        $.each(elements, function(index, element) {
            if (element === elementName || (typeof element.nodeName !== 'undefined' && element.nodeName === elementName)) {
                isContained = true;
                return false;
            }
        });

        return isContained;
    }

    /**
     * ## setActives
     *
     * Stores internal active state that match the criteria:
     * - Element name that is a block
     * - OR In this query state
     *
     * @param {String[]} elementNames A set of element names (upper case) that are active.
     */
    module.prototype.setActives = function(elementNames) {
        activeStates = _.reduce(this.controls, function (memo, controlConfig, controlName) {
            var formattingCommand = controlConfig.command;
            var elementName = (controlConfig.el || '').toUpperCase();
            var inElement = inElementSet(elementNames, elementName);
            var inQueryState = false;

            // IE throws an "unpositioned markup pointer" exception when clicking from outside the editor
            try {
                inQueryState = document.queryCommandEnabled(formattingCommand) && document.queryCommandState(formattingCommand);
            } catch (e) {
                inQueryState = false;
            }

            memo[controlName] = inQueryState || inElement;
            return memo;
        }, {}, this);

        setButtonActiveStates.call(this);
    };

    /**
     * ## open
     *
     * Opens the formatting controls centered over at a specific location.
     *
     * @param {Number} [x] The x position to center on
     * @param {Number} [y] The y position to position on top of
     */
    module.prototype.open = function(x, y) {
        // Reset all the silliness from closing with a shim
        if (!this.isShown) {
            var bubbles = $(this.element).children('[data-command]');
            var shim = $(this.element).find('.shim');
            $(this.element).css({width: 'auto'});
            shim.remove();
            bubbles.removeAttr('style');
        }

        this.showOverTarget(x, y);
    };

    /**
     * ## closeWithShim
     *
     * @param {Element} buttonToShim The button that will pretend to expand.
     * @param {Number} width The width to expand the button to.
     * @param {Number} animationTime Time in milliseconds for the full animation to run.
     * @param {Function} onComplete Callback for when the animation is completed
     */
    module.prototype.closeWithShim = function(buttonToShim, width, animationTime, onComplete) {
        var $el = $(this.element);
        var $button = $(buttonToShim);
        var shim = $('<div class="shim">&nbsp;</div>').get(0);

        // Only chrome and ff have native support for promises, so handle the case where
        // velocity animate doesn't have access to promises with a hard-coded delay
        // TODO: consider including when js for IE
        var hasAnimatePromise = _.has(animate, 'Promise');
        animationTime = hasAnimatePromise ? animationTime : 200;

        // Expand holder to our final width
        var originalWidth = $el.width();
        $el.css('width', originalWidth + width);

        // Calculate offset to move the entire control for centering
        var leftOffset = $button.position().left;
        var offset = (originalWidth / 2) - (leftOffset + width / 2);

        // Swap in shim
        $button.before(shim).hide();

        // Pre-calc these values to use for onComplete later
        var shimLeft = $(shim).offset().left + offset;
        var shimTop = $(shim).offset().top;

        /**
         * ### Animate!
         * Fade out the bubbles, slide the controls to the left while the shim
         * opens to maintain centering on the shim
         */
        this.isAnimating = true;

        _.forEach(this.buttons, function(button, i) {
            animate(button, 'stop');
            animate(button, {
                opacity: 0
            }, {
                duration: 0.5 * animationTime
            });
        });

        animate($el, {
            left: '+=' + offset
        }, {
            easing: 'ease',
            duration: animationTime
        });

        var animation = animate(shim, {
            width: width
        }, {
            easing: 'ease',
            duration: animationTime
        });

        var hideShim = _.bind(function() {
            if (_.isFunction(onComplete)) {
                onComplete.call(this, shimLeft, shimTop);
            }
            this.isAnimating = false;
            this.hide(); // This hides the shim
        }, this);

        if (hasAnimatePromise) {
            animation.then(hideShim);
        } else {
            _.delay(hideShim, animationTime);
        }
    };

    /**
     * ## getActiveStates
     *
     * Getter for the object where all the active states are maintained
     *
     * @return {Object} An object containing all the formatting active states
     */

    module.prototype.getActiveStates = function() {
        return activeStates;
    };

    return module;

})();

module.exports = FormattingControls;
